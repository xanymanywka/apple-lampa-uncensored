// Плавная прокрутка трекпадом и колесом — родным методом Lampa.
//
// Что Lampa умеет САМА, когда platform = 'electron' и navigation_type = 'mouse'
// (а это она включает по своему же user-agent, если его не подменять):
//
//   elem.addEventListener('mouseenter', elem.trigger_mouseenter)  // наведение → фокус
//   elem.addEventListener('mouseleave', elem.trigger_mouseleave)
//   elem.addEventListener('click', ... elem.trigger_click ...)    // клик → активация
//
// Поэтому наведение, клики, курсор и «назад» здесь НЕ трогаем. Раньше трогали —
// и выходила двойная активация: срабатывал и её trigger_click, и наш
// Controller.enter(). Отсюда и были «кнопки не попадают по кликам».
//
// Чинить нужно ровно одно — её собственный обработчик колеса:
//
//   if (Date.now() - scroll_time > 200 && inner) {
//     Controller.enabled().controller[step > 0 ? 'right' : 'left']()
//   }
//
// Он пропускает один шаг в 200 мс и двигает не пиксели, а фокус: прокрутка
// получается рваной по построению. Глушим его (он висит и на 'wheel', и на
// 'mousewheel') и двигаем прокрутку её же документированным методом:
//
//   /** Сдвинуть скролл на указанное количество пикселей без анимации */
//   this.shift = function (shift) {
//     body.toggleClass('notransition', true)
//     scroll_position = maxOffset(scroll_position - shift)   // своё состояние, свои границы
//     translateScroll()
//   }
//
// Он меняет собственное состояние Lampa, поэтому после прокрутки стрелки и
// пульт продолжают работать из той же точки, а границы списка считает она сама.
(function () {
  if (window.__macScroll) return
  window.__macScroll = true

  var TUNE = { speed: 1 }   // множитель к дельте, 1 = один к одному
  try {
    var saved = JSON.parse(localStorage.getItem('mac.tune') || '{}')
    if (typeof saved.speed === 'number') TUNE.speed = saved.speed
  } catch (e) {}

  window.__macTune = function (patch) {
    if (patch && typeof patch.speed === 'number') TUNE.speed = patch.speed
    try { localStorage.setItem('mac.tune', JSON.stringify(TUNE)) } catch (e) {}
    console.log('[mac] параметры прокрутки', TUNE)
    return TUNE
  }

  // Экземпляр Scroll Lampa вешает на сам элемент: html.Scroll = _self.
  // Ряд лежит внутри списка, поэтому идём вверх и берём первый, чья
  // ориентация совпадает с осью жеста: вертикальный жест — вертикальный
  // список, даже если курсор стоит на горизонтальном ряду.
  function instanceFor (node, horizontal) {
    var p = node
    while (p && p.classList) {
      if (p.classList.contains('scroll') && p.Scroll &&
          typeof p.Scroll.shift === 'function') {
        var pr = {}
        try { pr = p.Scroll.params ? p.Scroll.params() : {} } catch (e) {}
        if (Boolean(pr.horizontal) === horizontal) return p.Scroll
      }
      p = p.parentElement
    }
    return null
  }

  function onWheel (e) {
    var horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY)
    var inst = instanceFor(e.target, horizontal) ||
               instanceFor(document.elementFromPoint(e.clientX, e.clientY), horizontal)
    if (!inst) return

    var delta = horizontal ? e.deltaX : e.deltaY
    if (!delta) return
    // знак проверен замером: shift(+40) сдвигает содержимое вверх,
    // то есть прокручивает вниз — ровно как колесо с deltaY > 0
    inst.shift(delta * TUNE.speed)

    e.preventDefault()
    e.stopPropagation()
  }

  // Chromium шлёт и 'wheel', и устаревший 'mousewheel', а Lampa слушает оба.
  // Прокручиваем только по 'wheel', иначе один жест отработает дважды;
  // 'mousewheel' глушим — но ТОЛЬКО там, где прокрутку взяли на себя.
  // Безусловная блокировка отнимала бы колесо у всего остального, например
  // у плеера, где никакого .scroll нет.
  function suppress (e) {
    var horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY)
    var inst = instanceFor(e.target, horizontal) ||
               instanceFor(document.elementFromPoint(e.clientX, e.clientY), horizontal)
    if (!inst) return
    e.preventDefault()
    e.stopPropagation()
  }

  window.addEventListener('wheel', onWheel, { passive: false, capture: true })
  window.addEventListener('mousewheel', suppress, { passive: false, capture: true })

  console.log('[mac] плавная прокрутка через Scroll.shift готова', TUNE)
})()
