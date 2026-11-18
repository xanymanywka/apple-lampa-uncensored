// electron-builder с identity:null не подписывает бандл вовсе, а без подписи
// приложение не запускается на Apple Silicon. Подписываем ad-hoc сразу после
// слияния universal-бандла — до того, как из него соберут DMG и ZIP.
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { signAsync } = require('@electron/osx-sign')

// Настоящий порог macOS — не LSMinimumSystemVersion в Info.plist, а minos
// в LC_BUILD_VERSION самого фреймворка Electron. Один раз мы на это напоролись:
// в plist стояло 11.0, Electron был 45-й, и на iMac 2014 с macOS 11 приложение
// отказывалось запускаться. Таблица: Electron ≤37 → macOS 11, 38–43 → 12,
// 44+ → 13. Поэтому порог проверяется у собранного бандла, а не декларируется.
const MIN_MACOS = '11.0'

function assertDeploymentTarget (appPath) {
  const framework = path.join(appPath, 'Contents', 'Frameworks',
    'Electron Framework.framework', 'Electron Framework')
  const out = execFileSync('otool', ['-l', framework], { encoding: 'utf8' })
  const found = [...out.matchAll(/^\s*minos\s+(\S+)/gm)].map(m => m[1])

  if (!found.length) {
    throw new Error('не удалось прочитать minos у ' + framework)
  }
  const wrong = found.filter(v => v !== MIN_MACOS)
  if (wrong.length) {
    throw new Error(
      'порог macOS во фреймворке — ' + found.join(', ') + ', а обещаем ' + MIN_MACOS +
      '.\nСкорее всего поднялся Electron. Верните ветку 37.x либо осознанно' +
      ' поменяйте MIN_MACOS здесь и minimumSystemVersion в package.json.'
    )
  }
  console.log('  • порог macOS проверен  minos=' + found.join(', ') +
              '  slices=' + found.length)
}

exports.default = async function afterPack (context) {
  if (context.electronPlatformName !== 'darwin') return
  if (path.basename(context.appOutDir) !== 'mac-universal') return

  const root = path.join(__dirname, '..')
  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  )

  await signAsync({
    app: appPath,
    identity: '-',
    identityValidation: false,
    platform: 'darwin',
    type: 'development',
    optionsForFile: () => ({
      entitlements: path.join(root, 'entitlements.mac.plist'),
      hardenedRuntime: false
    })
  })

  assertDeploymentTarget(appPath)

  console.log('  • ad-hoc signed  file=' + appPath)
}
