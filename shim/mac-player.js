// Выбор плеера: сканируем установленные приложения (main → macBridge.players())
// и даём выбрать из них. Живёт в настройках Lampa: Настройки → Плеер,
// и в меню приложения: Lampa Uncensored → «Плеер для видео…» (⇧⌘P).
//
// Как это связано с ядром Lampa. Когда выбран внешний плеер, Lampa получает
// значение «iina» (у неё на маке это единственный путь собрать внешнюю ссылку),
// а главный процесс перехватывает iina://… и отдаёт поток тому, что выбрал человек.
(function () {
  if (window.__macPlayer) return
  window.__macPlayer = true
  var B = window.macBridge
  if (!B) return

  var KEYS = ['player', 'player_iptv', 'player_torrent']
  var chosenName = 'Встроенный'

  function L () { return window.Lampa }

  function applyToLampa (external) {
    try {
      KEYS.forEach(function (k) { L().Storage.set(k, external ? 'iina' : 'inner') })
    } catch (e) {}
  }

  function label (state) {
    if (!state.chosen || state.chosen === 'inner') return 'Встроенный плеер Lampa'
    var p = state.players.find(function (x) { return x.id === state.chosen })
    return p ? p.name : 'Встроенный плеер Lampa'
  }

  function refreshRow () {
    B.players().then(function (st) {
      chosenName = label(st)
      var el = document.querySelector('[data-name="mac_player_choose"] .settings-param__value')
      if (el) el.textContent = chosenName
    })
  }

  function openPicker () {
    B.players().then(function (st) {
      var Lampa = L()
      var enabled = Lampa.Controller.enabled().name
      var items = [{
        title: 'Встроенный плеер Lampa',
        subtitle: 'Без звука на некоторых раздачах (AC3/DTS)',
        id: 'inner',
        selected: !st.chosen || st.chosen === 'inner'
      }]
      st.players.forEach(function (p) {
        items.push({ title: p.name, subtitle: p.path.replace(/^\/Users\/[^/]+/, '~'), id: p.id, selected: st.chosen === p.id })
      })
      items.push({ title: 'Другое приложение…', subtitle: 'Выбрать плеер вручную', id: '__other' })

      Lampa.Select.show({
        title: 'Плеер для видео',
        items: items,
        onSelect: function (item) {
          Lampa.Controller.toggle(enabled)
          if (item.id === '__other') {
            B.pickCustomPlayer().then(function (r) {
              if (r) { applyToLampa(true); refreshRow(); Lampa.Noty.show('Плеер: ' + r.name) }
            })
            return
          }
          B.choosePlayer(item.id).then(function () {
            applyToLampa(item.id !== 'inner')
            refreshRow()
            Lampa.Noty.show('Плеер: ' + item.title)
          })
        },
        onBack: function () { Lampa.Controller.toggle(enabled) }
      })
    })
  }
  window.__macOpenPlayerPicker = openPicker

  function install () {
    var Lampa = L()
    if (!Lampa || !Lampa.SettingsApi || !Lampa.Select || !Lampa.Storage) return false

    Lampa.SettingsApi.addParam({
      component: 'player',
      param: { name: 'mac_player_choose', type: 'button', default: '' },
      field: {
        name: 'Плеер на этом Маке',
        description: 'Встроенный или любой установленный: VLC, IINA, mpv, Infuse…'
      },
      onChange: openPicker,
      onRender: function (item) {
        if (!item.find('.settings-param__value').length) item.find('.settings-param__name').after('<div class="settings-param__value"></div>')
        item.find('.settings-param__value').text(chosenName)
        // onRender вызывается до вставки в список, поэтому переставляем после
        setTimeout(function () {
          var host = item.parent()
          if (!host.length) return
          // наш пункт — первым; три родных выбора (фильмы, IPTV, торренты) он
          // заменяет: один выбор на всё приложение
          item.insertBefore(host.children().first())
          host.find('[data-name="player"],[data-name="player_iptv"],[data-name="player_torrent"]')
            .removeClass('selector').addClass('hide')
        }, 30)
        refreshRow()
      }
    })

    // если человек уже выбирал — возвращаем это в ядро (синхронизация аккаунта могла перетереть)
    if (window.__macPlayerPref) applyToLampa(window.__macPlayerPref !== 'inner')
    return true
  }

  var tries = 0
  var t = setInterval(function () {
    if (install() || ++tries > 120) clearInterval(t)
  }, 500)

  // Нет звука во встроенном плеере: Chromium не декодирует AC3/DTS. Это узнаётся
  // точно — декодированных аудиобайтов ноль при идущем видео. Подсказываем выход.
  var hinted = false
  setInterval(function () {
    if (hinted) return
    var v = document.querySelector('video')
    if (!v || v.paused || v.currentTime < 4) return
    if (v.webkitVideoDecodedByteCount > 0 && v.webkitAudioDecodedByteCount === 0 && !v.muted) {
      hinted = true
      try {
        L().Noty.show('Нет звука? Это кодек, встроенный плеер его не знает. Откройте в VLC или IINA: Настройки → Плеер.')
      } catch (e) {}
    }
  }, 2000)
})()
