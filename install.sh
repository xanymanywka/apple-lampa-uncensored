#!/bin/bash
# Lampa Uncensored для macOS — установка одной командой:
#   curl -fsSL https://raw.githubusercontent.com/xanymanywka/apple-lampa-uncensored/main/install.sh | bash
#
# Скачивает последнюю версию, проверяет контрольную сумму, ставит в «Программы»
# и открывает. Файл скачан через curl, а не браузером — macOS не вешает на него
# карантин, поэтому никаких предупреждений Gatekeeper и ручного xattr.
set -euo pipefail

REPO="xanymanywka/apple-lampa-uncensored"
FEED="${LAMPA_UPDATE_FEED:-https://github.com/$REPO/releases/latest/download/latest.json}"
APP="Lampa Uncensored.app"

say()  { printf '\033[1;32m▸\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(uname -s)" = "Darwin" ] || fail "Только для macOS."
major=$(sw_vers -productVersion | cut -d. -f1)
[ "$major" -ge 11 ] || fail "Нужна macOS 11 или новее."

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

say "Ищу последнюю версию…"
curl -fsSL "$FEED" -o "$TMP/latest.json" || fail "Не удалось получить $FEED"
field() { plutil -extract "$1" raw -o - "$TMP/latest.json" 2>/dev/null; }
VERSION="$(field version)"; URL="$(field zip.url)"; SHA="$(field zip.sha512)"
[ -n "$URL" ] || fail "В latest.json нет ссылки на архив."

say "Скачиваю версию $VERSION…"
curl -fL --progress-bar "$URL" -o "$TMP/app.zip" || fail "Загрузка не удалась."

if [ -n "$SHA" ]; then
  got="$(openssl dgst -sha512 -binary "$TMP/app.zip" | base64 | tr -d '\n')"
  [ "$got" = "$SHA" ] || fail "Контрольная сумма не сошлась — файл повреждён, повторите."
fi

say "Распаковываю…"
/usr/bin/ditto -x -k "$TMP/app.zip" "$TMP/out"
[ -d "$TMP/out/$APP" ] || fail "В архиве нет $APP."
/usr/bin/codesign --verify --deep --strict "$TMP/out/$APP" || fail "Подпись приложения не сошлась."

# если приложение открыто — просим закрыться
if pgrep -x "Lampa Uncensored" >/dev/null 2>&1; then
  say "Закрываю запущенную копию…"
  osascript -e 'tell application "Lampa Uncensored" to quit' >/dev/null 2>&1 || true
  sleep 2
fi

DEST="${LAMPA_INSTALL_DIR:-/Applications}"
if [ ! -w "$DEST" ]; then DEST="$HOME/Applications"; mkdir -p "$DEST"; fi

say "Ставлю в $DEST…"
rm -rf "$DEST/$APP"
/usr/bin/ditto "$TMP/out/$APP" "$DEST/$APP"
/usr/bin/xattr -cr "$DEST/$APP"

say "Готово! Открываю."
[ -n "${LAMPA_NO_OPEN:-}" ] || open "$DEST/$APP"
echo
echo "  Сообщество: https://t.me/lampa_plugins_uncensored"
