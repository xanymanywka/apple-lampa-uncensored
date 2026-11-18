// Номер сборки. Источник — build-info.json, который пишет scripts/bump-build.js.
// Из package.json читать нельзя: в упакованном приложении ключа "build" там нет.
try { module.exports = require('../build-info.json') } catch { module.exports = { version: '0', build: 0 } }
