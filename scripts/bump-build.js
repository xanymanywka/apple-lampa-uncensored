// Инкремент номера сборки перед каждой упаковкой.
//
// В macOS две разные версии: CFBundleShortVersionString — та, что показывают
// людям (1.1.0), и CFBundleVersion — номер сборки, который обязан расти
// с каждой выкладкой. Без второго все dmg называются одинаково и понять,
// какой из них свежее, нельзя.
const fs = require('node:fs')
const path = require('node:path')

const file = path.join(__dirname, '..', 'package.json')
const pkg = JSON.parse(fs.readFileSync(file, 'utf8'))

pkg.build = pkg.build || {}
const next = String(Number(pkg.build.buildVersion || 0) + 1)
pkg.build.buildVersion = next

fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n')
// В упакованный package.json electron-builder ключ "build" не кладёт, поэтому
// приложение читает номер сборки из отдельного файла.
fs.writeFileSync(path.join(__dirname, '..', 'build-info.json'),
  JSON.stringify({ version: pkg.version, build: Number(next) }, null, 2) + '\n')
console.log(`сборка ${pkg.version} (build ${next})`)
