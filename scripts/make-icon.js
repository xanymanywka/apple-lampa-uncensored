// Собирает macOS-иконку из векторного знака Lampa.
//
// macOS не маскирует .icns — форму приходится задавать самим, по сетке Apple:
// канва 1024, сам значок 824x824 по центру (поля по 100), углы — суперэллипс,
// а не обычный border-radius: у системных иконок углы «непрерывные».
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const CANVAS = 1024
const TILE = 824
const OFFSET = (CANVAS - TILE) / 2

// Суперэллипс |x|^n + |y|^n = 1 при n=5 — форма, близкая к Apple squircle.
function squirclePath (size, offset, n = 5) {
  const r = size / 2
  const cx = offset + r
  const cy = offset + r
  const pts = []
  const STEPS = 720
  for (let i = 0; i <= STEPS; i++) {
    const t = (i / STEPS) * 2 * Math.PI
    const ct = Math.cos(t)
    const st = Math.sin(t)
    const x = Math.sign(ct) * Math.pow(Math.abs(ct), 2 / n) * r
    const y = Math.sign(st) * Math.pow(Math.abs(st), 2 / n) * r
    pts.push(`${(cx + x).toFixed(2)},${(cy + y).toFixed(2)}`)
  }
  return 'M' + pts.join(' L') + ' Z'
}

// Знак Lampa из app/img/logo-icon.svg, viewBox 110x104
const MARK = `
<path d="M81.6744 103.11C98.5682 93.7234 110 75.6967 110 55C110 24.6243 85.3757 0 55 0C24.6243 0 0 24.6243 0 55C0 75.6967 11.4318 93.7234 28.3255 103.11C14.8869 94.3724 6 79.224 6 62C6 34.938 27.938 13 55 13C82.062 13 104 34.938 104 62C104 79.224 95.1131 94.3725 81.6744 103.11Z"/>
<path d="M92.9546 80.0076C95.5485 74.5501 97 68.4446 97 62C97 38.804 78.196 20 55 20C31.804 20 13 38.804 13 62C13 68.4446 14.4515 74.5501 17.0454 80.0076C16.3618 77.1161 16 74.1003 16 71C16 49.4609 33.4609 32 55 32C76.5391 32 94 49.4609 94 71C94 74.1003 93.6382 77.1161 92.9546 80.0076Z"/>
<path d="M55 89C69.3594 89 81 77.3594 81 63C81 57.9297 79.5486 53.1983 77.0387 49.1987C82.579 54.7989 86 62.5 86 71C86 88.1208 72.1208 102 55 102C37.8792 102 24 88.1208 24 71C24 62.5 27.421 54.7989 32.9613 49.1987C30.4514 53.1983 29 57.9297 29 63C29 77.3594 40.6406 89 55 89Z"/>`

const MARK_W = 470
const MARK_H = MARK_W * (104 / 110)
const MARK_X = (CANVAS - MARK_W) / 2
const MARK_Y = (CANVAS - MARK_H) / 2 - 6

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0%"   stop-color="#FFC266"/>
      <stop offset="42%"  stop-color="#F08A1E"/>
      <stop offset="100%" stop-color="#B4380A"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.12" r="0.75">
      <stop offset="0%"   stop-color="#FFFFFF" stop-opacity="0.45"/>
      <stop offset="60%"  stop-color="#FFFFFF" stop-opacity="0.05"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#000000" flood-opacity="0.32"/>
    </filter>
    <clipPath id="tile"><path d="${squirclePath(TILE, OFFSET)}"/></clipPath>
  </defs>

  <g filter="url(#shadow)">
    <path d="${squirclePath(TILE, OFFSET)}" fill="url(#bg)"/>
  </g>
  <g clip-path="url(#tile)">
    <rect x="0" y="0" width="${CANVAS}" height="${CANVAS}" fill="url(#glow)"/>
  </g>
  <path d="${squirclePath(TILE, OFFSET)}" fill="none"
        stroke="#FFFFFF" stroke-opacity="0.28" stroke-width="2.5"/>

  <g transform="translate(${MARK_X} ${MARK_Y}) scale(${MARK_W / 110})" fill="#FFFFFF">
    ${MARK}
  </g>
</svg>`

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:transparent;width:${CANVAS}px;height:${CANVAS}px;overflow:hidden}
svg{display:block}
</style></head><body>${svg}</body></html>`

app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  const out = process.env.ICON_OUT || path.join(__dirname, '..', 'icon-master.png')
  const win = new BrowserWindow({
    width: CANVAS, height: CANVAS, show: false, frame: false,
    transparent: true, backgroundColor: '#00000000',
    useContentSize: true, webPreferences: { offscreen: false }
  })
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  await new Promise(r => setTimeout(r, 1200))
  const img = await win.capturePage()
  fs.writeFileSync(out, img.toPNG())
  console.log('icon master written:', out, img.getSize())
  app.exit(0)
})
