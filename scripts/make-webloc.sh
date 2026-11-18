#!/bin/bash
# Файл-ссылка на сообщество для образа: клик открывает канал в Telegram.
# Иконку и скрытое расширение macOS хранит в расширенных атрибутах файла, а git их
# не переносит — поэтому файл собирается заново при каждой упаковке.
set -e
cd "$(dirname "$0")/../build"
F="Сообщество в Telegram.webloc"
cat > "$F" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>URL</key><string>https://t.me/lampa_plugins_uncensored</string></dict></plist>
PLIST
swift - "$F" telegram.icns <<'SWIFT'
import AppKit
let f = CommandLine.arguments[1]
let img = NSImage(contentsOfFile: CommandLine.arguments[2])!
_ = NSWorkspace.shared.setIcon(img, forFile: f, options: [])
var u = URL(fileURLWithPath: f); var v = URLResourceValues(); v.hasHiddenExtension = true; try u.setResourceValues(v)
SWIFT
