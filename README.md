<div align="center">

<img src="build/dmg-icon.png" width="128" alt="Lampa Uncensored">

# Apple Lampa Uncensored

**A native macOS build of Lampa Uncensored — installs in one command, updates itself.**

[![Release](https://img.shields.io/github/v/release/xanymanywka/apple-lampa-uncensored?style=flat-square&color=C8FF00&labelColor=080808)](../../releases/latest)
[![Downloads](https://img.shields.io/github/downloads/xanymanywka/apple-lampa-uncensored/total?style=flat-square&color=C8FF00&labelColor=080808)](../../releases)
![macOS 11+](https://img.shields.io/badge/macOS-11%2B-C8FF00?style=flat-square&labelColor=080808)
![Apple Silicon + Intel](https://img.shields.io/badge/Apple%20Silicon%20%2B%20Intel-universal-C8FF00?style=flat-square&labelColor=080808)
[![Telegram](https://img.shields.io/badge/Telegram-@lampa__plugins__uncensored-26A5E4?style=flat-square&labelColor=080808&logo=telegram&logoColor=white)](https://t.me/lampa_plugins_uncensored)

**[English](#english)** · **[Українська](#українська)** · **[Русский](#русский)**

</div>

---

<a id="english"></a>

# 🇬🇧 English

## Install

### ⚡ Option 1 — one command (recommended)

Open **Terminal** (⌘ Space → “Terminal”), paste, press Return:

```bash
curl -fsSL https://raw.githubusercontent.com/xanymanywka/apple-lampa-uncensored/main/install.sh | bash
```

It downloads the latest version, verifies it, puts it in **Applications** and opens it.
No macOS warnings, nothing else to click.

### 💿 Option 2 — DMG

1. Download `Lampa-Uncensored-…-universal.dmg` from **[Releases](../../releases/latest)**.
2. Open it and drag the icon to **Applications**.
3. First launch only: **right-click the app → Open → Open**.

> macOS says *“app is damaged”*? The app isn't signed with a paid Apple certificate, so the browser's download flag gets in the way. Run once:
> ```bash
> xattr -dr com.apple.quarantine "/Applications/Lampa Uncensored.app"
> ```

## Updates

Automatic. The app checks for a new version in the background, downloads it and asks to restart.
Nothing to reinstall, nothing to unblock again. Manually: menu **Lampa Uncensored → Check for Updates…**

## Choosing a player

The built-in player can't decode **AC3 / DTS** audio — a very common track in torrent releases — so you get picture without sound.
Pick any external player instead: **Settings → Player → “Player on this Mac”** (or **⇧⌘P**).
The app scans what is installed on your Mac and offers every app that opens video (VLC, IINA, mpv, Infuse, QuickTime…). Nothing is hard-coded.

## FAQ

| Problem | What to do |
|---|---|
| Picture, no sound | Choose VLC / IINA as shown above |
| Black screen on an old Mac | Menu **Lampa Uncensored → Software video decoding** |
| Catalog is there, nothing plays | In Lampa: **Settings → Plugins → Online**, and sign in via QR (`@bylampa_sync_bot`) |
| Uninstall | Drag the app to Trash. Data: `~/Library/Application Support/Lampa Uncensored` |

Requirements: macOS 11 Big Sur or newer, Apple Silicon or Intel.

## Community

💬 **[t.me/lampa_plugins_uncensored](https://t.me/lampa_plugins_uncensored)** — questions, plugins, news.
Build by **[@xanymanywka](https://github.com/xanymanywka)**. Building from source: [docs/DEV.md](docs/DEV.md), releasing: [docs/RELEASING.md](docs/RELEASING.md).

<sub>Unofficial build of Lampa (byLampa). Not affiliated with any streaming service; logos in the installer are trademarks of their owners.</sub>

---

<a id="українська"></a>

# 🇺🇦 Українська

## Встановлення

### ⚡ Варіант 1 — одна команда (рекомендовано)

Відкрийте **Термінал** (⌘ Пробіл → «Термінал»), вставте і натисніть Return:

```bash
curl -fsSL https://raw.githubusercontent.com/xanymanywka/apple-lampa-uncensored/main/install.sh | bash
```

Скрипт завантажить останню версію, перевірить її, покладе в **Програми** і відкриє.
Жодних попереджень macOS, більше нічого натискати не треба.

### 💿 Варіант 2 — DMG

1. Завантажте `Lampa-Uncensored-…-universal.dmg` зі сторінки **[Releases](../../releases/latest)**.
2. Відкрийте образ і перетягніть значок у **Програми**.
3. Лише перший запуск: **правий клік на застосунку → Відкрити → Відкрити**.

> macOS пише *«програма пошкоджена»*? Застосунок не підписаний платним сертифікатом Apple, тож заважає позначка завантаження з браузера. Виконайте один раз:
> ```bash
> xattr -dr com.apple.quarantine "/Applications/Lampa Uncensored.app"
> ```

## Оновлення

Автоматичні. Застосунок у фоні перевіряє нову версію, завантажує її та пропонує перезапуститися.
Перевстановлювати і знову розблоковувати нічого не потрібно. Вручну: меню **Lampa Uncensored → Перевірити оновлення…**

## Вибір плеєра

Вбудований плеєр не вміє декодувати звук **AC3 / DTS** — дуже поширену доріжку в торрент-роздачах, тому виходить картинка без звуку.
Оберіть зовнішній плеєр: **Налаштування → Плеєр → «Плеєр на цьому Маку»** (або **⇧⌘P**).
Застосунок сам знаходить встановлені програми, що відкривають відео (VLC, IINA, mpv, Infuse, QuickTime…), і пропонує обрати. Нічого не зашито в код.

## Часті питання

| Проблема | Що робити |
|---|---|
| Є картинка, немає звуку | Оберіть VLC / IINA, як вище |
| Чорний екран на старому Маку | Меню **Lampa Uncensored → Програмне декодування відео** |
| Каталог є, але нічого не грає | У Lampa: **Налаштування → Плагіни → Онлайн** і вхід через QR (`@bylampa_sync_bot`) |
| Видалення | Перетягніть застосунок у Смітник. Дані: `~/Library/Application Support/Lampa Uncensored` |

Вимоги: macOS 11 Big Sur або новіша, Apple Silicon чи Intel.

## Спільнота

💬 **[t.me/lampa_plugins_uncensored](https://t.me/lampa_plugins_uncensored)** — питання, плагіни, новини.
Збірка від **[@xanymanywka](https://github.com/xanymanywka)**. Збирання з джерел: [docs/DEV.md](docs/DEV.md), випуск релізів: [docs/RELEASING.md](docs/RELEASING.md).

<sub>Неофіційна збірка Lampa (byLampa). Не пов'язана з жодним стрімінговим сервісом; логотипи в інсталяторі належать їхнім власникам.</sub>

---

<a id="русский"></a>

# 🇷🇺 Русский

## Установка

### ⚡ Вариант 1 — одна команда (рекомендуется)

Откройте **Терминал** (⌘ Пробел → «Терминал»), вставьте и нажмите Return:

```bash
curl -fsSL https://raw.githubusercontent.com/xanymanywka/apple-lampa-uncensored/main/install.sh | bash
```

Скрипт скачает последнюю версию, проверит её, положит в **Программы** и откроет.
Никаких предупреждений macOS, больше ничего нажимать не нужно.

### 💿 Вариант 2 — DMG

1. Скачайте `Lampa-Uncensored-…-universal.dmg` со страницы **[Releases](../../releases/latest)**.
2. Откройте образ и перетащите значок в **Программы**.
3. Только первый запуск: **правый клик по приложению → Открыть → Открыть**.

> macOS пишет *«приложение повреждено»*? Приложение не подписано платным сертификатом Apple, и мешает пометка о загрузке из браузера. Выполните один раз:
> ```bash
> xattr -dr com.apple.quarantine "/Applications/Lampa Uncensored.app"
> ```

## Обновления

Автоматические. Приложение в фоне проверяет новую версию, скачивает её и предлагает перезапуститься.
Переустанавливать и разблокировать заново ничего не нужно. Вручную: меню **Lampa Uncensored → Проверить обновления…**

## Выбор плеера

Встроенный плеер не умеет декодировать звук **AC3 / DTS** — очень частую дорожку в торрент-раздачах, поэтому получается картинка без звука.
Выберите внешний плеер: **Настройки → Плеер → «Плеер на этом Маке»** (или **⇧⌘P**).
Приложение само находит установленные программы, открывающие видео (VLC, IINA, mpv, Infuse, QuickTime…), и предлагает выбрать. Ничего не зашито в код.

## Частые вопросы

| Проблема | Что делать |
|---|---|
| Есть картинка, нет звука | Выберите VLC / IINA, как выше |
| Чёрный экран на старом Маке | Меню **Lampa Uncensored → Программное декодирование видео** |
| Каталог есть, но ничего не играет | В Lampa: **Настройки → Плагины → Онлайн** и вход через QR (`@bylampa_sync_bot`) |
| Удаление | Перетащите приложение в Корзину. Данные: `~/Library/Application Support/Lampa Uncensored` |

Требования: macOS 11 Big Sur или новее, Apple Silicon или Intel.

## Сообщество

💬 **[t.me/lampa_plugins_uncensored](https://t.me/lampa_plugins_uncensored)** — вопросы, плагины, новости.
Сборка от **[@xanymanywka](https://github.com/xanymanywka)**. Сборка из исходников: [docs/DEV.md](docs/DEV.md), выпуск релизов: [docs/RELEASING.md](docs/RELEASING.md).

<sub>Неофициальная сборка Lampa (byLampa). Не связана ни с одним стриминговым сервисом; логотипы в установщике принадлежат их владельцам.</sub>
