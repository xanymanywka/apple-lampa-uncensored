// Вписывает готовый рисунок в сетку Apple: канва 1024, значок 824 по центру.
// Сам рисунок не меняется — только масштаб на канве, чтобы в доке иконка
// стояла вровень с системными, а не торчала крупнее соседних.
const { app, BrowserWindow, nativeImage } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const CANVAS = 1024
const TILE = 824

app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  const src = path.join(__dirname, '..', process.env.ICON_SRC || 'icon-source.png')
  const out = path.join(__dirname, '..', 'icon-master.png')
  const dataUrl = nativeImage.createFromPath(src).toDataURL()

  const html = `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;width:${CANVAS}px;height:${CANVAS}px;background:transparent;overflow:hidden}
    img{position:absolute;left:${(CANVAS - TILE) / 2}px;top:${(CANVAS - TILE) / 2}px;
        width:${TILE}px;height:${TILE}px;image-rendering:auto}
  </style><img src="${dataUrl}">`

  const win = new BrowserWindow({
    width: CANVAS, height: CANVAS, show: false, frame: false,
    transparent: true, backgroundColor: '#00000000', useContentSize: true
  })
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  await new Promise(r => setTimeout(r, 800))
  fs.writeFileSync(out, (await win.capturePage()).toPNG())
  console.log('inset icon written:', out)
  app.exit(0)
})
