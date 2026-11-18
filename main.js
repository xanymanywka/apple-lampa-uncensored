const { app, BrowserWindow, Menu, shell, session, dialog, net, systemPreferences, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const players = require('./lib/players')
const updater = require('./lib/updater')

// Те же ключи Chromium, что были в NW.js-сборке byLampa:
// приложение грузит скрипты с http:// внутрь file://-страницы и стучится
// в локальную сеть (TorrServe и прочие локальные плееры).
app.commandLine.appendSwitch('disable-web-security')
app.commandLine.appendSwitch('disable-site-isolation-trials')
app.commandLine.appendSwitch(
  'disable-features',
  'BlockInsecurePrivateNetworkRequests,AsyncDns,UseDnsHttpsSvcbAlpn'
)
app.commandLine.appendSwitch('enable-webgl')
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

// ignore-gpu-blocklist приехал из того же манифеста, но на маке он опасен.
// Чёрный список Chromium — это перечень связок «железо + драйвер», на которых
// видеопуть ломается; на Windows с живыми драйверами ключ безобиден, а на
// iMac 2014 мы им принудительно включаем ровно то, что Google выключил для
// этой машины. Отсюда «запустилось, но ничего не играет». Поэтому форсируем
// его только там, где macOS ещё поддерживается самой Apple (12 и новее).
const MACOS_MAJOR = (() => {
  if (process.platform !== 'darwin') return 0
  // os.release() даёт версию ядра Darwin: 20.x = Big Sur (11), 21.x = Monterey (12)
  const darwin = Number(require('node:os').release().split('.')[0])
  return Number.isFinite(darwin) ? darwin - 9 : 0
})()

if (MACOS_MAJOR >= 12) {
  app.commandLine.appendSwitch('ignore-gpu-blocklist')
  app.commandLine.appendSwitch('ignore-gpu-blacklist')
}

// Рычаг на случай, если видео всё равно не идёт: полностью программное
// декодирование. Медленнее, но работает там, где VideoToolbox на старой
// связке отдаёт чёрный кадр. Ключи читаются до app.whenReady(), поэтому
// переключатель из меню применяется со следующего запуска.
const PREFS_FILE = path.join(app.getPath('userData'), 'prefs.json')

function readPrefs () {
  try { return JSON.parse(fs.readFileSync(PREFS_FILE, 'utf8')) } catch { return {} }
}

function writePrefs (patch) {
  const next = { ...readPrefs(), ...patch }
  try { fs.writeFileSync(PREFS_FILE, JSON.stringify(next, null, 2)) } catch {}
  return next
}

const PREFS = readPrefs()

if (PREFS.softwareVideo) {
  app.commandLine.appendSwitch('disable-accelerated-video-decode')
  app.commandLine.appendSwitch('disable-gpu-compositing')
}

// package.json упакован в asar, поэтому номер сборки всегда соответствует бандлу
const BUILD_NUMBER = String(require('./lib/buildinfo').build)

// Сервер Lampa не отдаёт ни ETag, ни Cache-Control, поэтому Chromium качает
// app.min.js (2 МБ) и app.css (400 КБ) при каждом запуске заново. Держим свою
// копию: отдаём её мгновенно, а свежую тянем фоном — к следующему запуску.
const CACHE_DIR = path.join(app.getPath('userData'), 'remote-cache')
const CACHE_HOST = 'my.bylampa.online'

function cachePathFor (url) {
  return path.join(CACHE_DIR, url.pathname.replace(/[^a-z0-9.]+/gi, '_'))
}

function typeFor (pathname) {
  if (pathname.endsWith('.css')) return 'text/css; charset=utf-8'
  if (pathname.endsWith('.js')) return 'application/javascript; charset=utf-8'
  return 'application/octet-stream'
}

function refreshInBackground (request, file) {
  net.fetch(request.url, { bypassCustomProtocolHandlers: true })
    .then((res) => (res.ok ? res.arrayBuffer() : null))
    .then((buf) => {
      if (!buf || buf.byteLength < 1024) return
      fs.mkdirSync(CACHE_DIR, { recursive: true })
      fs.promises.writeFile(file, Buffer.from(buf)).catch(() => {})
    })
    .catch(() => {})
}

function installRemoteCache (ses) {
  fs.mkdirSync(CACHE_DIR, { recursive: true })

  ses.protocol.handle('http', async (request) => {
    let url
    try { url = new URL(request.url) } catch { return net.fetch(request, { bypassCustomProtocolHandlers: true }) }

    // SegoeUI.ttf у Lampa битый — Chromium отвечает на него «OTS parsing error:
    // invalid sfntVersion» при каждом запуске. Шрифт всё равно не применяется,
    // а интерфейс мы рисуем SF Pro, поэтому не качаем его вовсе.
    if (url.hostname === CACHE_HOST && /SegoeUI.*\.ttf$/i.test(url.pathname)) {
      if (process.env.LAMPA_VERBOSE) console.log('[кеш] пропущен битый шрифт', url.pathname)
      // Именно 404 с пустым телом. Было 204 — и конструктор Response его не
      // принимал («Invalid response status code 204»): по стандарту у 204 тела
      // быть не может даже пустого. Из-за этого обработчик падал на каждом
      // запуске, а в логе лежал TypeError.
      return new Response(null, { status: 404 })
    }

    const cacheable = url.hostname === CACHE_HOST && /\.(js|css)$/i.test(url.pathname)
    if (!cacheable) return net.fetch(request, { bypassCustomProtocolHandlers: true })

    const file = cachePathFor(url)
    const type = typeFor(url.pathname)

    if (fs.existsSync(file)) {
      if (process.env.LAMPA_VERBOSE) console.log('[кеш] с диска', url.pathname)
      refreshInBackground(request, file)
      // читаем асинхронно: app.min.js весит 2 МБ, и синхронное чтение
      // задерживало главный процесс ровно на то время, что экономил кеш
      return new Response(await fs.promises.readFile(file),
        { headers: { 'content-type': type } })
    }
    if (process.env.LAMPA_VERBOSE) console.log('[кеш] качаем', url.pathname)

    try {
      const res = await net.fetch(request.url, { bypassCustomProtocolHandlers: true })
      if (!res.ok) return res
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.byteLength > 1024) {
        fs.promises.writeFile(file, buf).catch(() => {})
        if (process.env.LAMPA_VERBOSE)
          console.log('[кеш] сохранён', url.pathname, buf.byteLength, 'байт')
      }
      return new Response(buf, { headers: { 'content-type': type } })
    } catch (e) {
      return new Response('', { status: 504 })
    }
  })
}

const STATE_FILE = path.join(app.getPath('userData'), 'window-state.json')
const DEFAULT_STATE = { width: 1280, height: 800 }

function readState () {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
    if (Number.isFinite(s.width) && Number.isFinite(s.height)) return s
  } catch {}
  return { ...DEFAULT_STATE }
}

function writeState (win) {
  if (!win || win.isDestroyed()) return
  try {
    const b = win.isNormal() ? win.getBounds() : (win.normalBounds || win.getBounds())
    fs.writeFileSync(
      STATE_FILE,
      JSON.stringify({ ...b, fullscreen: win.isFullScreen(), maximized: win.isMaximized() })
    )
  } catch {}
}

let mainWindow = null

function createWindow () {
  const state = readState()

  mainWindow = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 1024,
    minHeight: 640,
    title: 'Lampa Uncensored',
    backgroundColor: '#1d1f20',
    show: false,
    fullscreenable: true,
    // системный стиль заголовка: рамку рисует macOS, мы её не подделываем —
    // ровно то, чего требует HIG («avoid creating custom window UI»)
    titleBarStyle: 'hiddenInset',
    // шапка Lampa — .head, 58px: ставим светофор внутрь неё, как в нативном тулбаре
    trafficLightPosition: { x: 18, y: 21 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // Lampa — обычная веб-страница, Node ей не нужен; выключено ради скорости и безопасности
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      // аналог --disable-web-security: страница из file:// тянет скрипты с http://
      webSecurity: false,
      allowRunningInsecureContent: true,
      // чтобы видео не затыкалось, когда окно не в фокусе
      backgroundThrottling: false,
      spellcheck: false
    }
  })

  // User-Agent НЕ трогаем. Lampa определяет платформу именно по нему:
  //   else if (agent.indexOf("electron") > -1) Storage.set('platform', 'electron')
  // Подменяя его на чистый Chrome, мы своими руками скрывали, что это Electron
  // на маке: Platform.desktop() становился false, Lampa считала себя телевизором
  // и включала пульт вместо мыши. С родным агентом она сама ставит
  // navigation_type = 'mouse' и keyboard_type = 'integrate'.

  // Lampa рассчитана на пульт: мышь и трекпад она не слушает.
  // Слой нативного ввода вставляем на каждый dom-ready, чтобы он пережил
  // перезагрузку страницы и переход между экранами.
  const shimInput = fs.readFileSync(path.join(__dirname, 'shim', 'mac-input.js'), 'utf8')
  const shimStyle = fs.readFileSync(path.join(__dirname, 'shim', 'mac-style.js'), 'utf8')
  const shimPlayer = fs.readFileSync(path.join(__dirname, 'shim', 'mac-player.js'), 'utf8')

  // акцентный цвет берём системный — приложение должно слушаться настроек macOS
  let accent = '#0a84ff'
  try {
    const c = systemPreferences.getAccentColor()
    if (c && c.length >= 6) accent = '#' + c.slice(0, 6)
  } catch (e) {}

  // Lampa держит свою шапку .head фиксированной полосой 58px — ровно высота
  // маковского тулбара. Поэтому не отодвигаем контент вниз, а сдвигаем
  // содержимое самой шапки вправо, освобождая место под кнопки окна.
  const prelude = `window.__macAccent=${JSON.stringify(accent)};` +
                  'window.__macTopInset=0;window.__macLeftInset=84;'

  if (process.env.LAMPA_VERBOSE) {
    mainWindow.webContents.on('console-message', (e) => {
      console.log('[page]', e.message)
    })
  }

  mainWindow.webContents.on('dom-ready', () => {
    mainWindow.webContents.executeJavaScript(prelude, true)
      .then(() => mainWindow.webContents.executeJavaScript(shimStyle, true))
      .then(() => mainWindow.webContents.executeJavaScript(shimInput, true))
      .then(() => mainWindow.webContents.executeJavaScript(
        `window.__macPlayerPref=${JSON.stringify(PREFS_NOW().player || null)};` + shimPlayer, true))
      .then(() => {
        // патч-канал: мелкие исправления интерфейса без переустановки приложения
        const cached = updater.cachedPatch()
        if (cached) return mainWindow.webContents.executeJavaScript(cached.code, true)
      })
      .catch(() => {})
  })

  mainWindow.loadFile(path.join(__dirname, 'app', 'index.html'))

  // у страницы свой <title>, он перебивает имя приложения в окне и в Mission Control
  mainWindow.on('page-title-updated', (e) => e.preventDefault())

  mainWindow.once('ready-to-show', () => {
    if (state.fullscreen) mainWindow.setFullScreen(true)
    else if (state.maximized) mainWindow.maximize()
    mainWindow.show()
  })

  // внешние ссылки — в системный браузер, а не новым окном поверх приложения
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    routeExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault()
      routeExternal(url)
    }
  })

  for (const ev of ['resize', 'move', 'close']) {
    mainWindow.on(ev, () => writeState(mainWindow))
  }

  mainWindow.on('closed', () => { mainWindow = null })
}

// Lampa слушает клавиатуру сама — пункты меню просто посылают ей клавишу.
function sendKeyToApp (keyCode) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.sendInputEvent({ type: 'keyDown', keyCode })
  mainWindow.webContents.sendInputEvent({ type: 'keyUp', keyCode })
}

async function clearCacheAndReload () {
  if (!mainWindow) return
  await session.defaultSession.clearCache()
  await mainWindow.webContents.executeJavaScript(
    'try{localStorage.removeItem("app.js")}catch(e){}', true
  ).catch(() => {})
  mainWindow.webContents.reloadIgnoringCache()
}

// Ключи командной строки Chromium читаются один раз при старте, поэтому
// переключатель только записывает выбор и предлагает перезапуск.
function toggleSoftwareVideo (on) {
  writePrefs({ softwareVideo: !!on })

  dialog.showMessageBox({
    type: 'question',
    message: on
      ? 'Программное декодирование включено'
      : 'Программное декодирование выключено',
    detail: on
      ? 'Видео будет декодироваться процессором. Медленнее, но помогает на старых маках, где картинка чёрная или ничего не запускается. Нужен перезапуск.'
      : 'Видео снова будет декодироваться видеокартой. Нужен перезапуск.',
    buttons: ['Перезапустить', 'Позже'],
    defaultId: 0,
    cancelId: 1
  }).then(({ response }) => {
    if (response === 0) { app.relaunch(); app.exit(0) }
  })
}

function buildMenu () {
  const template = [
    {
      label: 'Lampa Uncensored',
      submenu: [
        { role: 'about', label: 'О программе Lampa Uncensored' },
        { type: 'separator' },
        { label: 'Проверить обновления…', click: () => checkForUpdates(true) },
        { label: 'Плеер для видео…', accelerator: 'CmdOrCtrl+Shift+P', click: () => openPlayerPicker() },
        { label: 'Очистить кэш и перезагрузить', click: clearCacheAndReload },
        {
          label: 'Программное декодирование видео',
          type: 'checkbox',
          checked: !!PREFS.softwareVideo,
          click: (item) => toggleSoftwareVideo(item.checked)
        },
        { type: 'separator' },
        { role: 'hide', label: 'Скрыть Lampa Uncensored' },
        { role: 'hideOthers', label: 'Скрыть остальные' },
        { role: 'unhide', label: 'Показать все' },
        { type: 'separator' },
        { role: 'quit', label: 'Завершить Lampa Uncensored' }
      ]
    },
    {
      label: 'Правка',
      submenu: [
        { role: 'undo', label: 'Отменить' },
        { role: 'redo', label: 'Повторить' },
        { type: 'separator' },
        { role: 'cut', label: 'Вырезать' },
        { role: 'copy', label: 'Копировать' },
        { role: 'paste', label: 'Вставить' },
        { role: 'selectAll', label: 'Выбрать все' }
      ]
    },
    {
      label: 'Вид',
      submenu: [
        {
          label: 'Назад',
          accelerator: 'CmdOrCtrl+Left',
          click: () => sendKeyToApp('Escape')
        },
        { type: 'separator' },
        { role: 'reload', label: 'Перезагрузить' },
        { role: 'forceReload', label: 'Перезагрузить без кэша' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Обычный размер' },
        { role: 'zoomIn', label: 'Увеличить' },
        { role: 'zoomOut', label: 'Уменьшить' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Во весь экран' },
        { role: 'toggleDevTools', label: 'Инструменты разработчика' }
      ]
    },
    {
      label: 'Справка',
      role: 'help',
      submenu: [
        { label: 'Сообщество в Telegram · @lampa_plugins_uncensored',
          click: () => shell.openExternal('https://t.me/lampa_plugins_uncensored') },
        { label: 'Исходный код и релизы',
          click: () => shell.openExternal('https://github.com/xanymanywka/apple-lampa-uncensored') }
      ]
    },
    {
      label: 'Окно',
      submenu: [
        { role: 'minimize', label: 'Свернуть' },
        { role: 'zoom', label: 'Увеличить окно' },
        { type: 'separator' },
        { role: 'front', label: 'Все наверх' }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// --- внешние плееры -----------------------------------------------------
const PREFS_NOW = () => readPrefs()

// Любая ссылка, которую страница пытается открыть не у себя: либо поток для
// внешнего плеера (iina://…, mpv://…), либо обычная веб-ссылка.
function routeExternal (url) {
  const stream = players.extractStream(url)
  if (stream) {
    launchStream(stream, url)
    return
  }
  if (/^https?:\/\//i.test(url)) shell.openExternal(url)
}

async function resolveChosen () {
  const pref = PREFS_NOW()
  const chosen = pref.player
  if (!chosen || chosen === 'inner') return null
  const list = await players.detect(pref.customPlayers || [])
  return list.find((p) => p.id === chosen) || null
}

async function launchStream (stream, originalUrl) {
  const chosen = await resolveChosen()
  if (chosen) {
    const ok = await players.play(stream, chosen)
    if (ok) return
  }
  // человек ничего не выбирал в нашем меню (или плеер пропал) — отдаём ссылку
  // как есть: так работает родной выбор Lampa (IINA, Infuse…)
  shell.openExternal(originalUrl).catch(() => {
    dialog.showMessageBox({
      type: 'warning',
      message: 'Не нашлось приложения, которое откроет видео',
      detail: 'Выберите установленный плеер: Настройки → Плеер → «Плеер на этом Маке».',
      buttons: ['ОК']
    })
  })
}

function setupIpc () {
  ipcMain.handle('players:list', async () => {
    const pref = PREFS_NOW()
    const list = await players.detect(pref.customPlayers || [])
    const out = []
    for (const p of list) {
      out.push({ id: p.id, name: p.name, path: p.path, custom: !!p.custom })
    }
    return { chosen: pref.player || null, players: out }
  })

  ipcMain.handle('players:choose', (_e, id) => {
    writePrefs({ player: id || null })
    return { ok: true, chosen: id || null }
  })

  ipcMain.handle('players:pick-custom', async () => {
    const r = await dialog.showOpenDialog(mainWindow, {
      title: 'Выберите плеер',
      message: 'Выберите приложение, которым открывать видео',
      defaultPath: '/Applications',
      properties: ['openFile'],
      filters: [{ name: 'Приложения', extensions: ['app'] }]
    })
    if (r.canceled || !r.filePaths[0]) return null
    const p = r.filePaths[0]
    const entry = { name: players.appNameFromPath(p), path: p }
    const custom = (PREFS_NOW().customPlayers || []).filter((c) => c.path !== p)
    custom.push(entry)
    writePrefs({ customPlayers: custom, player: 'custom:' + p })
    return { id: 'custom:' + p, name: entry.name }
  })

  // «Нет звука»: встроенный плеер не знает дорожку. Предлагаем открыть этот же
  // поток во внешнем плеере одной кнопкой.
  ipcMain.handle('players:rescue', async (_e, src) => {
    if (!/^https?:\/\//i.test(String(src || ''))) return null
    const pref = PREFS_NOW()
    const list = await players.detect(pref.customPlayers || [])
    // QuickTime mkv и AC3 тоже не играет — как спасение его не предлагаем
    const usable = list.filter((p) => p.id !== 'com.apple.QuickTimePlayerX')
    const pick = usable.find((p) => p.id === pref.player) || usable[0]
    if (!pick) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        message: 'У этого видео нет звука во встроенном плеере',
        detail: 'Звуковая дорожка (AC3/DTS) не поддерживается. Установите VLC (videolan.org) или IINA (iina.io) — приложение найдёт их само.',
        buttons: ['ОК']
      })
      return null
    }
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      message: 'У этого видео нет звука во встроенном плеере',
      detail: 'Дорожка в формате, который встроенный плеер не умеет (AC3/DTS). Во внешнем плеере звук будет.',
      buttons: [`Открыть в ${pick.name}`, 'Выбрать другой плеер…', 'Закрыть'],
      defaultId: 0,
      cancelId: 2
    })
    if (response === 0) { await players.play(src, pick); return { opened: pick.name } }
    if (response === 1) openPlayerPicker()
    return null
  })

  ipcMain.handle('app:info', () => ({
    version: app.getVersion(), build: BUILD_NUMBER, chromium: process.versions.chrome
  }))
  ipcMain.handle('update:check', () => updater.check({ manual: true }))
  ipcMain.handle('update:install', () => updater.installNow())
}

// Приложение, запущенное из образа или из «Загрузок», обновить на месте нельзя.
// Предлагаем переехать в «Программы» — одной кнопкой, без перетаскивания.
function offerMoveToApplications () {
  if (!app.isPackaged || process.platform !== 'darwin') return
  try {
    if (app.isInApplicationsFolder()) return
    if (PREFS_NOW().declinedMove) return
  } catch { return }

  const response = dialog.showMessageBoxSync({
    type: 'question',
    message: 'Перенести Lampa Uncensored в «Программы»?',
    detail: 'Так приложение будет открываться из Launchpad и сможет само обновляться. Образ с установщиком после этого можно закрыть и выбросить.',
    buttons: ['Перенести', 'Не сейчас'],
    defaultId: 0,
    cancelId: 1
  })
  if (response === 0) {
    try { app.moveToApplicationsFolder() } catch (e) {
      dialog.showMessageBoxSync({
        type: 'warning',
        message: 'Не удалось перенести автоматически',
        detail: 'Перетащите приложение в папку «Программы» вручную.',
        buttons: ['ОК']
      })
    }
  } else {
    writePrefs({ declinedMove: true })
  }
}

function openPlayerPicker () {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.executeJavaScript(
    'window.__macOpenPlayerPicker && window.__macOpenPlayerPicker()', true).catch(() => {})
}

function checkForUpdates (interactive = false) {
  if (!app.isPackaged) {
    if (interactive) {
      dialog.showMessageBox({
        message: 'Обновления проверяются только в собранном приложении.',
        buttons: ['ОК']
      })
    }
    return
  }
  updater.check({ manual: interactive })
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    app.setAboutPanelOptions({
      applicationName: 'Lampa Uncensored',
      applicationVersion: app.getVersion(),
      version: `сборка ${BUILD_NUMBER} · Chromium ${process.versions.chrome}`,
      copyright: 'Каталог фильмов и сериалов',
      credits: 'Сборка для macOS by xanymanywka\nСообщество: t.me/lampa_plugins_uncensored',
      website: 'https://t.me/lampa_plugins_uncensored'
    })

    // пустой catch здесь однажды уже скрыл, что кеш вообще не встаёт
    try {
      installRemoteCache(session.defaultSession)
      if (process.env.LAMPA_VERBOSE) console.log('[кеш] перехват http поставлен,', CACHE_DIR)
    } catch (e) {
      console.error('[кеш] не поставился:', e && e.message)
    }

    setupIpc()
    buildMenu()
    offerMoveToApplications()
    createWindow()
    if (app.isPackaged) {
      updater.start()
      app.on('browser-window-focus', () => updater.checkIfStale())
      updater.refreshPatch().then((fresh) => {
        if (fresh && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.executeJavaScript(fresh.code, true).catch(() => {})
        }
      })
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}
