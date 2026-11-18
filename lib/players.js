// Внешние плееры на macOS: что установлено у пользователя и как отдать им поток.
//
// Зачем это вообще нужно. Встроенный плеер Lampa играет через Chromium, а тот не
// знает AC3/E-AC3/DTS — типичную звуковую дорожку торрент-раздач. Отсюда «картинка
// есть, звука нет». Внешний плеер (VLC, IINA, mpv, Infuse) играет всё.
//
// Родной выбор плеера у Lampa на macOS узкий: IINA, Infuse, mpv, nPlayer, SenPlayer,
// TracyPlayer — и нет VLC. Поэтому делаем так: когда выбран любой внешний плеер,
// Lampa получает «iina» (она сама строит ссылку iina://weblink?url=…), а здесь,
// в главном процессе, ссылка перехватывается и уходит в плеер, который выбрал человек.
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { execFile, spawn } = require('node:child_process')
const { shell } = require('electron')

// Список плееров не зашит в код: сканируем приложения на этом маке и берём те,
// что сами объявили в Info.plist, что открывают видео (CFBundleDocumentTypes).
// Поэтому в списке окажется всё, что реально установлено: VLC, IINA, mpv, Infuse,
// Movist, QuickTime, Elmedia — и то, о чём мы не слышали.
const VIDEO_EXT = new Set(['mkv', 'mp4', 'm4v', 'avi', 'mov', 'webm', 'ts', 'wmv', 'flv', 'mpg', 'mpeg'])
const VIDEO_UTI = /^(public\.(movie|video|mpeg-4|avi|mpeg)|org\.matroska\.|com\.apple\.quicktime-movie|public\.audiovisual-content)/i

// Браузеры и редакторы объявляют видео «на всякий случай», но плеерами не являются
const NOT_PLAYERS = /^(com\.apple\.Safari|com\.google\.Chrome|org\.mozilla\.|com\.brave\.|com\.microsoft\.edgemac|company\.thebrowser\.|com\.operasoftware\.|com\.apple\.iMovieApp|com\.apple\.FinalCut|com\.apple\.Photos|com\.apple\.dt\.|com\.apple\.Music|com\.apple\.TV$|com\.apple\.Preview|com\.apple\.finder|online\.bylampa\.|com\.apple\.Automator|com\.apple\.ScriptEditor|com\.apple\.shortcuts|com\.apple\.Messages|com\.apple\.mail|com.apple.QuickLook|com\.felttip\.)/i

const SEARCH_DIRS = [
  '/Applications', '/Applications/Utilities', '/Applications/Setapp',
  path.join(os.homedir(), 'Applications'), '/System/Applications'
]

function exists (p) { try { return fs.statSync(p).isDirectory() } catch { return false } }

function readPlist (appPath) {
  return new Promise((resolve) => {
    execFile('/usr/bin/plutil', ['-convert', 'json', '-o', '-', path.join(appPath, 'Contents', 'Info.plist')],
      { timeout: 4000, maxBuffer: 4 * 1024 * 1024 },
      (err, out) => { try { resolve(err ? null : JSON.parse(out)) } catch { resolve(null) } })
  })
}

function declaresVideo (info) {
  // Настоящий плеер заявляет сразу несколько видеоформатов; почтовик или читалка —
  // один-два «на всякий случай». Порог — три разных формата с ролью Viewer/Editor.
  const seen = new Set()
  for (const t of info.CFBundleDocumentTypes || []) {
    if (t.CFBundleTypeRole === 'None' || t.LSHandlerRank === 'None') continue
    for (const e of t.CFBundleTypeExtensions || []) if (VIDEO_EXT.has(String(e).toLowerCase())) seen.add(String(e).toLowerCase())
    for (const u of t.LSItemContentTypes || []) if (VIDEO_UTI.test(String(u))) seen.add(String(u).toLowerCase())
  }
  return seen.size >= 3
}

function listApps () {
  const apps = []
  for (const dir of SEARCH_DIRS) {
    let names = []
    try { names = fs.readdirSync(dir) } catch { continue }
    for (const n of names) {
      if (n.endsWith('.app')) apps.push(path.join(dir, n))
    }
  }
  return apps
}

let cache = { at: 0, list: null }

// Список установленных плееров. custom — приложения, добавленные вручную.
async function detect (custom = [], { fresh = false } = {}) {
  if (!fresh && cache.list && Date.now() - cache.at < 60000) return merge(cache.list, custom)

  const apps = listApps()
  const found = []
  // пачками, чтобы не запускать две сотни plutil одновременно
  for (let i = 0; i < apps.length; i += 24) {
    const part = await Promise.all(apps.slice(i, i + 24).map(async (p) => {
      const info = await readPlist(p)
      if (!info || !info.CFBundleIdentifier) return null
      if (NOT_PLAYERS.test(info.CFBundleIdentifier)) return null
      if (!declaresVideo(info)) return null
      return {
        id: info.CFBundleIdentifier,
        name: info.CFBundleDisplayName || info.CFBundleName || appNameFromPath(p),
        path: p
      }
    }))
    found.push(...part.filter(Boolean))
  }
  found.sort((a, b) => a.name.localeCompare(b.name))
  cache = { at: Date.now(), list: found }
  return merge(found, custom)
}

function merge (list, custom) {
  const out = list.slice()
  for (const c of custom || []) {
    if (c && c.path && exists(c.path) && !out.some((x) => x.path === c.path)) {
      out.push({ id: 'custom:' + c.path, name: c.name, path: c.path, custom: true })
    }
  }
  return out
}

function appNameFromPath (p) { return path.basename(p).replace(/\.app$/i, '') }

// Отдать поток выбранному плееру. Общий путь — `open -a`: macOS сама передаёт URL
// приложению. Исключения — только способ запуска, а не список: у IINA и mpv поток
// надёжнее открывается их собственным способом, у остальных работает общий.
async function play (streamUrl, player) {
  if (player.id === 'com.colliderli.iina') {
    await shell.openExternal('iina://weblink?url=' + encodeURIComponent(streamUrl))
    return true
  }
  if (player.id === 'io.mpv') {
    const exe = path.join(player.path, 'Contents', 'MacOS', 'mpv')
    if (fs.existsSync(exe)) {
      const child = spawn(exe, [streamUrl], { detached: true, stdio: 'ignore' })
      child.on('error', () => {})
      child.unref()
      return true
    }
  }
  return new Promise((resolve) => {
    execFile('/usr/bin/open', ['-a', player.path, streamUrl], { timeout: 8000 }, (err) => resolve(!err))
  })
}

// Что именно Lampa пытается открыть, какую бы схему она ни выбрала для плеера:
// достаём из ссылки адрес самого потока.
function extractStream (rawUrl) {
  let u
  try { u = new URL(rawUrl) } catch { return null }
  const proto = u.protocol
  if (proto === 'iina:' || proto === 'infuse:' || proto === 'senplayer:' || proto === 'tracy:' ||
      proto === 'open-vidhub:' || proto === 'svplayer:') {
    return u.searchParams.get('url')
  }
  if (proto === 'mpv:') return rawUrl.replace(/^mpv:\/\//i, '')
  if (/^nplayer-/i.test(proto)) return rawUrl.replace(/^nplayer-/i, '')
  return null
}

module.exports = { detect, play, extractStream, appNameFromPath, exists }
