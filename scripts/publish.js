// Выкладка обновлений. Два режима:
//
//   node scripts/publish.js release ["заметка 1" "заметка 2" …]
//     после `npm run dist`: создаёт релиз vВЕРСИЯ-bСБОРКА на GitHub, кладёт туда
//     DMG (для новых людей), ZIP (для автообновления) и latest.json (то, что
//     читают установленные приложения).
//
//   node scripts/publish.js patch "что исправлено"
//     выкладывает patch/patch.js без новой сборки: перезаписывает latest.json
//     последнего релиза. Приложения подхватят патч при следующем запуске.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')

const root = path.join(__dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const REPO = `${pkg.build.publish[0].owner}/${pkg.build.publish[0].repo}`
const version = pkg.version
const build = Number(pkg.build.buildVersion)
const tag = `v${version}-b${build}`
const [mode, ...notes] = process.argv.slice(2)

const gh = (...a) => execFileSync('gh', a, { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' })
const sha = (file, alg, enc) => crypto.createHash(alg).update(fs.readFileSync(file)).digest(enc)

function patchInfo (tagForUrl) {
  const file = path.join(root, 'patch', 'patch.js')
  const body = fs.readFileSync(file)
  if (!body.toString().replace(/\/\/.*$/gm, '').replace(/\(function\s*\(\)\s*\{\}\)\(\)/, '').trim()) return null
  return {
    version: crypto.createHash('sha256').update(body).digest('hex').slice(0, 12),
    url: `https://github.com/${REPO}/releases/download/${tagForUrl}/patch.js`,
    sha256: crypto.createHash('sha256').update(body).digest('hex'),
    minBuild: build
  }
}

if (mode === 'release') {
  const base = `Lampa-Uncensored-${version}-b${build}-universal`
  const zip = path.join(root, 'dist', base + '.zip')
  const dmg = path.join(root, 'dist', base + '.dmg')
  for (const f of [zip, dmg]) if (!fs.existsSync(f)) throw new Error('нет файла ' + f + ' — сначала npm run dist')

  const feed = {
    version, build, notes,
    zip: {
      url: `https://github.com/${REPO}/releases/download/${tag}/${path.basename(zip)}`,
      sha512: sha(zip, 'sha512', 'base64'),
      size: fs.statSync(zip).size
    }
  }
  const p = patchInfo(tag)
  if (p) feed.patch = p
  const feedFile = path.join(root, 'dist', 'latest.json')
  fs.writeFileSync(feedFile, JSON.stringify(feed, null, 2))

  const assets = [dmg, zip, feedFile]
  if (p) assets.push(path.join(root, 'patch', 'patch.js'))
  gh('release', 'create', tag, ...assets, '--repo', REPO, '--title', `Lampa Uncensored ${version} (сборка ${build})`,
    '--notes', notes.length ? notes.map((n) => '- ' + n).join('\n') : 'Обновление приложения')
  console.log('выложено:', tag)
} else if (mode === 'patch') {
  const latestTag = JSON.parse(gh('release', 'view', '--repo', REPO, '--json', 'tagName')).tagName
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'lampa-patch-'))
  gh('release', 'download', latestTag, '--repo', REPO, '--pattern', 'latest.json', '--dir', dir)
  const feed = JSON.parse(fs.readFileSync(path.join(dir, 'latest.json'), 'utf8'))
  const p = patchInfo(latestTag)
  if (!p) throw new Error('patch/patch.js пустой')
  // патч действует на ту сборку, под которую выложен релиз, и новее
  p.minBuild = feed.build
  feed.patch = p
  fs.writeFileSync(path.join(dir, 'latest.json'), JSON.stringify(feed, null, 2))
  gh('release', 'upload', latestTag, path.join(dir, 'latest.json'), path.join(root, 'patch', 'patch.js'), '--clobber', '--repo', REPO)
  console.log('патч выложен в', latestTag, '·', notes.join(' '))
} else {
  console.log('использование: publish.js release [заметки…] | publish.js patch "заметка"')
  process.exit(1)
}
