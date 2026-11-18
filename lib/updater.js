// Обновление «по воздуху» для приложения, подписанного ad-hoc.
//
// Почему не electron-updater. На macOS он ставит обновления через Squirrel.Mac,
// а тот сверяет подпись нового бандла с подписью старого. У ad-hoc подписи нет
// сертификата — «личность» приложения это хеш конкретной сборки, поэтому каждое
// следующее обновление Squirrel отвергает: «code failed to satisfy specified code
// requirement(s)». Без платного Developer ID он на нашей сборке не работает вовсе.
//
// Что делаем вместо этого, и почему человеку не нужно ничего «танцевать»:
//   1. раз в несколько часов смотрим latest.json у последнего релиза на GitHub;
//   2. новую сборку качаем сами (ZIP), поэтому macOS не вешает на неё карантин —
//      а именно карантин вызывает «приложение повреждено» и ручной xattr;
//   3. проверяем контрольную сумму и подпись, распаковываем рядом;
//   4. отдельным короткоживущим скриптом ждём выхода приложения, подменяем бандл,
//      снимаем атрибуты и запускаем новую версию. Человек видит одно окно:
//      «Обновление готово — перезапустить?».
//
// Отдельный маленький канал — «патч»: JS-файл в несколько килобайт, который
// подмешивается в страницу. Им чинятся мелочи в интерфейсе за минуты и без
// скачивания 200 МБ. Он исполняется в странице, а не в главном процессе.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { execFile, spawn } = require('node:child_process')
const { app, net, dialog, BrowserWindow } = require('electron')

const REPO = 'xanymanywka/apple-lampa-uncensored'
const FEED = process.env.LAMPA_UPDATE_FEED ||
  `https://github.com/${REPO}/releases/latest/download/latest.json`

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000

const state = { phase: 'idle', progress: 0, version: null, notes: [], error: null }
let listeners = []
let feedInfo = null
let readyApp = null          // путь к распакованному новому .app
let timer = null
let installing = false
let announcedVersion = null  // про какую версию уже спрашивали, чтобы не повторяться

function setState (patch) {
  Object.assign(state, patch)
  for (const fn of listeners) { try { fn({ ...state }) } catch {} }
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('update:state', { ...state })
  }
}

function onState (fn) { listeners.push(fn) }
function getState () { return { ...state } }

function updatesDir () {
  const d = path.join(app.getPath('userData'), 'updates')
  fs.mkdirSync(d, { recursive: true })
  return d
}

function currentBuild () {
  return require('./buildinfo').build
}

// Путь к .app, в котором мы сейчас запущены: …/X.app/Contents/MacOS/X → …/X.app
function currentBundle () {
  return path.resolve(app.getPath('exe'), '..', '..', '..')
}

// Приложение запущено из образа или из «Загрузок» под карантином (App Translocation):
// заменять его на месте нельзя — путь временный и только для чтения.
function runsFromTransientPlace () {
  const p = currentBundle()
  return p.includes('/AppTranslocation/') || p.startsWith('/Volumes/')
}

async function fetchJson (url) {
  const res = await net.fetch(url, { headers: { 'cache-control': 'no-cache' } })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  return res.json()
}

function sha512OfFile (file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha512')
    fs.createReadStream(file).on('data', (c) => h.update(c)).on('end', () => resolve(h.digest('base64'))).on('error', reject)
  })
}

async function download (url, dest, expectedSize) {
  const res = await net.fetch(url)
  if (!res.ok || !res.body) throw new Error('загрузка: HTTP ' + res.status)
  const total = Number(res.headers.get('content-length')) || expectedSize || 0
  const out = fs.createWriteStream(dest)
  let got = 0
  let lastTick = 0
  try {
    const reader = res.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      got += value.byteLength
      if (!out.write(Buffer.from(value))) await new Promise((r) => out.once('drain', r))
      const now = Date.now()
      if (total && now - lastTick > 400) {
        lastTick = now
        setState({ phase: 'downloading', progress: Math.min(0.99, got / total) })
      }
    }
  } finally {
    await new Promise((r) => out.end(r))
  }
  if (total && got !== total && !expectedSize) throw new Error('загрузка оборвалась')
  return got
}

function run (cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 8 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${path.basename(cmd)}: ${String(stderr || err.message).trim()}`))
      else resolve(String(stdout))
    })
  })
}

async function readBundleId (appPath) {
  const out = await run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', path.join(appPath, 'Contents', 'Info.plist')])
  return out.trim()
}

async function stage (zipFile, version) {
  const dir = path.join(updatesDir(), 'stage-' + version)
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  // ditto, а не unzip: сохраняет символьные ссылки и права внутри бандла
  await run('/usr/bin/ditto', ['-x', '-k', zipFile, dir])
  const appName = fs.readdirSync(dir).find((n) => n.endsWith('.app'))
  if (!appName) throw new Error('в архиве нет .app')
  const appPath = path.join(dir, appName)

  // чужую или битую сборку не ставим: тот же идентификатор и целая подпись
  const [mine, theirs] = await Promise.all([readBundleId(currentBundle()), readBundleId(appPath)])
  if (mine !== theirs) throw new Error('идентификатор приложения не совпал')
  await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', appPath])
  await run('/usr/bin/xattr', ['-cr', appPath])
  return appPath
}

// Проверка. manual = человек нажал в меню: тогда отвечаем и «обновлений нет».
async function check ({ manual = false } = {}) {
  if (installing || state.phase === 'downloading' || state.phase === 'checking') return getState()
  if (readyApp) return getState()
  setState({ phase: 'checking', error: null })

  try {
    const info = await fetchJson(FEED)
    feedInfo = info
    const newer = Number(info.build) > currentBuild()
    if (!newer) {
      setState({ phase: 'idle', version: null })
      if (manual) {
        dialog.showMessageBox({
          message: 'Установлена последняя версия',
          detail: `Lampa Uncensored ${app.getVersion()} (сборка ${currentBuild()})`,
          buttons: ['ОК']
        })
      }
      return getState()
    }

    setState({ phase: 'downloading', progress: 0, version: info.version, notes: info.notes || [] })

    const zip = path.join(updatesDir(), `update-${info.build}.zip`)
    const z = info.zip || {}
    if (!z.url) throw new Error('в latest.json нет ссылки на архив')

    let ok = false
    if (fs.existsSync(zip) && z.sha512) ok = (await sha512OfFile(zip)) === z.sha512
    if (!ok) {
      await download(z.url, zip, z.size)
      if (z.sha512 && (await sha512OfFile(zip)) !== z.sha512) {
        fs.rmSync(zip, { force: true })
        throw new Error('контрольная сумма не сошлась')
      }
    }

    readyApp = await stage(zip, info.version)
    fs.rmSync(zip, { force: true })
    setState({ phase: 'ready', progress: 1 })
    announce()
  } catch (e) {
    setState({ phase: 'error', error: String(e && e.message ? e.message : e) })
    if (manual) {
      dialog.showMessageBox({
        type: 'warning',
        message: 'Не удалось обновиться',
        detail: state.error + '\n\nСвежую версию всегда можно скачать вручную: github.com/' + REPO + '/releases',
        buttons: ['ОК']
      })
    }
  }
  return getState()
}

async function announce () {
  if (announcedVersion === state.version) return
  announcedVersion = state.version
  const notes = (state.notes || []).slice(0, 6).map((n) => '• ' + n).join('\n')
  const { response } = await dialog.showMessageBox({
    type: 'info',
    message: `Обновление ${state.version} готово`,
    detail: (notes ? notes + '\n\n' : '') + 'Приложение перезапустится само и откроется уже обновлённым.',
    buttons: ['Перезапустить сейчас', 'Позже'],
    defaultId: 0,
    cancelId: 1
  })
  if (response === 0) installNow()
  // «Позже» — обновление встанет само при следующем выходе из приложения
}

function scriptBody () {
  return `#!/bin/bash
# Подмена бандла после выхода приложения. Лог: ~/Library/Application Support/Lampa Uncensored/updates/install.log
PID="$1"; NEW="$2"; TARGET="$3"; LOG="$4"
exec >>"$LOG" 2>&1
echo "--- $(date) update $NEW -> $TARGET"
for i in $(seq 1 80); do kill -0 "$PID" 2>/dev/null || break; sleep 0.25; done
BACKUP="\${TARGET}.previous"
rm -rf "$BACKUP"
if mv "$TARGET" "$BACKUP"; then
  if /usr/bin/ditto "$NEW" "$TARGET"; then
    /usr/bin/xattr -cr "$TARGET"
    rm -rf "$BACKUP" "$(dirname "$NEW")"
    echo "ok"
  else
    echo "copy failed, rolling back"
    rm -rf "$TARGET"; mv "$BACKUP" "$TARGET"
  fi
else
  echo "cannot move old bundle"
fi
/usr/bin/open "$TARGET"
`
}

function launchInstaller () {
  const dir = updatesDir()
  const script = path.join(dir, 'install.sh')
  const log = path.join(dir, 'install.log')
  fs.writeFileSync(script, scriptBody(), { mode: 0o755 })

  const target = currentBundle()
  const args = [script, String(process.pid), readyApp, target, log]

  let writable = true
  try { fs.accessSync(path.dirname(target), fs.constants.W_OK) } catch { writable = false }

  if (writable) {
    const child = spawn('/bin/bash', args, { detached: true, stdio: 'ignore' })
    child.unref()
  } else {
    // /Applications принадлежит администратору, а человек — обычный пользователь:
    // один раз просим пароль системным окном, как любой установщик
    const q = (s) => `'${String(s).replace(/'/g, "'\\''")}'`
    const cmd = '/bin/bash ' + args.map(q).join(' ') + ' >/dev/null 2>&1 &'
    const osa = `do shell script ${JSON.stringify(cmd)} with administrator privileges`
    const child = spawn('/usr/bin/osascript', ['-e', osa], { detached: true, stdio: 'ignore' })
    child.unref()
  }
}

function installNow () {
  if (!readyApp || installing) return
  if (runsFromTransientPlace()) {
    dialog.showMessageBox({
      type: 'warning',
      message: 'Сначала перенесите приложение в «Программы»',
      detail: 'Сейчас оно запущено из образа или из «Загрузок», обновить его на месте нельзя. Перетащите Lampa Uncensored в папку «Программы» и откройте оттуда.',
      buttons: ['ОК']
    })
    return
  }
  installing = true
  setState({ phase: 'installing' })
  launchInstaller()
  app.quit()
}

// «Позже»: если обновление скачано и человек просто выходит — ставим на выходе.
function installOnQuit () {
  if (!readyApp || installing || runsFromTransientPlace()) return
  installing = true
  launchInstaller()
}

// --- патч-канал ---------------------------------------------------------
const PATCH_FILE = () => path.join(app.getPath('userData'), 'patch.js')
const PATCH_META = () => path.join(app.getPath('userData'), 'patch.json')

function cachedPatch () {
  try {
    const meta = JSON.parse(fs.readFileSync(PATCH_META(), 'utf8'))
    // патч привязан к сборке: после обновления приложения старый не применяем
    if (meta.minBuild && currentBuild() < meta.minBuild) return null
    if (meta.maxBuild && currentBuild() > meta.maxBuild) return null
    return { meta, code: fs.readFileSync(PATCH_FILE(), 'utf8') }
  } catch { return null }
}

async function refreshPatch () {
  try {
    const info = feedInfo || await fetchJson(FEED)
    const p = info.patch
    if (!p || !p.url) { fs.rmSync(PATCH_FILE(), { force: true }); fs.rmSync(PATCH_META(), { force: true }); return null }
    const have = cachedPatch()
    if (have && have.meta.version === p.version) return null
    const res = await net.fetch(p.url, { headers: { 'cache-control': 'no-cache' } })
    if (!res.ok) return null
    const code = await res.text()
    if (p.sha256 && crypto.createHash('sha256').update(code).digest('hex') !== p.sha256) return null
    fs.writeFileSync(PATCH_FILE(), code)
    fs.writeFileSync(PATCH_META(), JSON.stringify({ version: p.version, minBuild: p.minBuild, maxBuild: p.maxBuild }))
    return { meta: { version: p.version }, code }
  } catch { return null }
}

function start () {
  if (timer) return
  setTimeout(() => check(), 8000)
  timer = setInterval(() => check(), CHECK_EVERY_MS)
}

app.on('before-quit', () => installOnQuit())

module.exports = { start, check, installNow, onState, getState, cachedPatch, refreshPatch, currentBuild, runsFromTransientPlace, REPO }
