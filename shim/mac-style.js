// Приведение внешнего вида Lampa к macOS.
//
// Главная причина, по которой приложение выглядит инородно: Lampa набрана
// Segoe UI — системным шрифтом Windows (font-family: "SegoeUI" в её css).
// На маке это читается как чужое приложение ещё до того, как замечаешь
// что-то ещё. Здесь типографика переводится на SF Pro, а подсветка фокуса,
// скругления и отступы — на системные величины macOS.
//
// Ядро не трогаем: это только слой стилей поверх, Lampa остаётся собой.
(function () {
  if (window.__macStyle) return
  window.__macStyle = true

  var ACCENT = window.__macAccent || '#0a84ff'   // подменяется из main.js системным
  var INSET = window.__macTopInset || 0          // сдвиг контента вниз (обычно 0)
  var LEFT = window.__macLeftInset || 0          // место под кнопки окна в шапке

  var SF = '-apple-system, "SF Pro Text", "SF Pro Display", BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif'

  var css = [
    // ── типографика ───────────────────────────────────────────────────────
    // перебиваем Segoe UI везде, включая правила, пришедшие с сервера
    '*,*::before,*::after{font-family:' + SF + ' !important}',
    'html{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;' +
      'text-rendering:optimizeLegibility}',
    // SF Pro плотнее Segoe: чуть больше межбуквенного, иначе выглядит сжато
    'body{letter-spacing:.01em}',
    // крупные заголовки в macOS идут плотнее, а не шире
    'h1,h2,.head__title,.activity__title,.card__title{letter-spacing:-.015em;font-weight:600}',

    // ── фокус: системный акцентный цвет вместо плоской заливки ────────────
    '.selector{border-radius:12px;transition:background-color .18s ease,' +
      'box-shadow .18s ease,transform .18s cubic-bezier(.2,.8,.2,1)}',
    // У Lampa своя подсветка карточки — белое кольцо 0.4em на .card__img.
    // Если добавить к ней ещё и заливку, индикаторов фокуса получается два,
    // чего в macOS не бывает. Поэтому её кольцо переводим на системный акцент,
    // а заливку оставляем тому, у кого своего кольца нет: пунктам меню и кнопкам.
    '.card.focus .card__img,.card--small.focus .card__img,' +
      '.card--category.focus .card__img,.card-parser.focus{' +
      'box-shadow:0 0 0 3px ' + ACCENT + ', 0 10px 28px rgba(0,0,0,.45) !important;' +
      'border-color:' + ACCENT + ' !important}',
    '.selector.focus:not(.card):not(.card-parser),' +
      '.selector:focus:not(.card):not(.card-parser){' +
      'background-color:color-mix(in srgb,' + ACCENT + ' 20%,transparent) !important;' +
      'box-shadow:0 0 0 2px ' + ACCENT + ' !important;' +
      'outline:none !important}',

    // ── карточки: скругления и глубина как в системных приложениях ────────
    '.card,.card__view,.card__img{border-radius:12px}',
    // scale на .card__view приподнимал карточку, но заодно открывал её
    // собственный светлый фон за постером — вокруг кольца появлялся ореол.
    // Кольца акцента дляуказания фокуса достаточно.

    // ── шапка как нативный тулбар ─────────────────────────────────────────
    // Lampa держит .head фиксированной полосой 58px — это ровно высота
    // маковского тулбара, поэтому кнопки окна живут внутри неё, а не над ней.
    // Сдвигаем содержимое шапки вправо, чтобы «назад» не оказалось под ними.
    // !important обязателен: у Lampa своё правило на .head .head__body,
    // оно специфичнее нашего и иначе перебивает отступ
    LEFT ? '.head__body{padding-left:' + LEFT + 'px !important}' : '',
    INSET ? '.head,.wrap__left,.menu{padding-top:' + INSET + 'px}' : '',
    // шапка тянет окно, как любой тулбар; сами кнопки остаются кликабельными
    // css шапки приходит с сервера, поэтому перебиваем явно
    '.head{-webkit-app-region:drag;' +
      'background:rgba(0,0,0,.28) !important;' +
      'backdrop-filter:saturate(180%) blur(20px) !important;' +
      '-webkit-backdrop-filter:saturate(180%) blur(20px) !important}',
    // Перечислять кнопки поимённо нельзя: регион перетаскивания съедает клики
    // по всему, что в него попало, а у Lampa в шапке есть и .head-backward__button,
    // и .head__logo-icon, и .head__menu-icon. Поэтому тянется только пустое место:
    // сам .head, а любой его потомок — кликабелен.
    '.head *{-webkit-app-region:no-drag}',

    // ── поведение как у приложения, а не веб-страницы ─────────────────────
    '*{-webkit-user-select:none;user-select:none;-webkit-user-drag:none}',
    'input,textarea{-webkit-user-select:text;user-select:text}',
    '::-webkit-scrollbar{width:0;height:0}',

    // поля ввода в системном виде
    'input,textarea,select{border-radius:8px;font-family:' + SF + ' !important}'
  ].filter(Boolean).join('\n')

  var el = document.createElement('style')
  el.id = 'mac-style'
  el.textContent = css
  document.head.appendChild(el)

  // Lampa догружает свой css с сервера уже после нас — держим стиль последним,
  // иначе её правила перекроют шрифт.
  new MutationObserver(function () {
    if (document.head.lastElementChild !== el) document.head.appendChild(el)
  }).observe(document.head, { childList: true })

  console.log('[mac] слой стиля готов, акцент', ACCENT, 'левый отступ шапки', LEFT)
})()
