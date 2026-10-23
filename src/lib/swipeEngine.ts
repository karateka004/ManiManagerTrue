import { tg } from './telegram'
import type { SwipeDir, SwipeHost, SwipeTarget } from './useSwipeNav'

/**
 * Листание экранов свайпом, как карусель: соседний экран уже отрисован (App
 * держит его скрытым рядом) и едет вместе с текущим ровно за пальцем. Отпустил
 * дальше трети ширины или бросил — экраны доезжают со скоростью броска, и
 * вкладка переключается без своей анимации появления: новый экран уже на месте.
 *
 * Почему touch-события, а не pointer (так было в 2.4). У pointer-событий нельзя
 * отменить прокрутку, и на iPhone жест вбок с лёгким уклоном уходил системе:
 * страница прокручивалась, Telegram сворачивал мини-апп карточкой, а сдвиг
 * экрана оставался, потому что pointerup/pointercancel не доходили. Здесь
 * touchmove не пассивный: как только понятно, что жест вбок, прокрутка
 * отменяется и жест целиком наш.
 *
 * Сдвиг снимается всегда: по touchend и touchcancel, при новом касании, при
 * сворачивании и скрытии вкладки, при смене размера окна. Если элемент под
 * пальцем пропал из DOM посреди жеста (перерисовка), события ловятся на нём
 * самом — до корня они уже не всплывают.
 *
 * Жест не перехватывается:
 *   - в шторках (`aria-modal`), в полях ввода, у края экрана (16 px — там
 *     системный «назад» Android);
 *   - на лентах с прокруткой вбок (определяется по факту прокрутки) и на
 *     элементах с `data-swipe-ignore` (карусель целей, голограмма на карте).
 */

/** Сколько пройти пальцем, прежде чем решать, вбок жест или вниз. */
const SLOP = 10
/** Полоса у края экрана, где жест не начинаем. */
const EDGE = 16
/** Вбок — если сдвиг по горизонтали больше вертикального хотя бы в столько раз (~40°). */
const AXIS = 1.2
/** Быстрый старт и мягкая посадка — как отпущенный экран в нативных приложениях. */
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'
/** Скорость броска, px/мс. */
const FLICK = 0.3

interface Drag {
  id: number
  x0: number
  y0: number
  /** Жест признан горизонтальным и стал нашим. */
  locked: boolean
  dx: number
  samples: { t: number; x: number }[]
  width: number
  /** Верх контейнера вкладок в координатах документа. */
  top: number
  heights: Map<HTMLElement, number>
  /** Элемент под пальцем — на случай, если он пропадёт из DOM посреди жеста. */
  target: Element | null
}

/**
 * Подключить жест к контейнеру вкладок. `host` читается на каждом шаге — App
 * отдаёт свежие данные (открытая вкладка, панели, прокрутка). Возвращает «отключить».
 */
export function attachSwipe(root: HTMLElement, host: () => SwipeHost): () => void {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')

  let drag: Drag | null = null
  let frame = 0
  // Всё, чему ставили стили, — чтобы снять их одним движением.
  let styled: HTMLElement[] = []
  let shown: HTMLElement | null = null
  let settling: { timer: number; finish: () => void } | null = null

  const put = (el: HTMLElement, x: number, y: number, transition: string, opacity?: number) => {
    if (!styled.includes(el)) {
      styled.push(el)
      el.style.willChange = 'transform'
    }
    el.style.transition = transition
    el.style.transform = `translate3d(${x}px,${y}px,0)`
    if (opacity !== undefined) el.style.opacity = String(opacity)
  }

  const reset = () => {
    cancelAnimationFrame(frame)
    frame = 0
    for (const el of styled) {
      el.style.transition = ''
      el.style.transform = ''
      el.style.opacity = ''
      el.style.visibility = ''
      el.style.contentVisibility = ''
      el.style.willChange = ''
    }
    styled = []
    shown = null
    host().progress(0, false)
  }

  /**
   * Сосед стоит так, как встанет после переключения: со своей запомненной
   * прокруткой (её браузер урежет по высоте экрана — режем так же).
   */
  const neighborY = (d: Drag, panel: HTMLElement, scroll: number) => {
    let h = d.heights.get(panel)
    if (h === undefined) {
      h = panel.offsetHeight
      d.heights.set(panel, h)
    }
    const max = Math.max(0, d.top + h - window.innerHeight)
    return Math.round(d.top - Math.min(Math.max(0, scroll), max))
  }

  const placeNeighbor = (d: Drag, target: SwipeTarget | null, dir: SwipeDir, x: number, transition: string) => {
    const panel = target?.kind === 'panel' ? target.panel : null
    if (shown && shown !== panel) {
      // Палец повернул в другую сторону — прежнего соседа прячем.
      shown.style.visibility = ''
      shown.style.contentVisibility = ''
      shown.style.transform = ''
      shown.style.transition = ''
      shown = null
    }
    if (!panel || target?.kind !== 'panel') return
    shown = panel
    // Скрытую панель прячет content-visibility (на старых iOS — visibility):
    // открываем оба, высоту ниже читаем уже у показанной.
    panel.style.visibility = 'visible'
    panel.style.contentVisibility = 'visible'
    put(panel, x + (dir === 'next' ? d.width : -d.width), neighborY(d, panel, target.scroll), transition)
  }

  /** Где сейчас текущий экран: за пальцем, с сопротивлением («назад») или резинкой (край). */
  const place = (d: Drag) => {
    const dir: SwipeDir = d.dx < 0 ? 'next' : 'prev'
    const target = d.dx === 0 ? null : host().target(dir)
    const w = d.width
    const x =
      target?.kind === 'panel'
        ? Math.max(-w, Math.min(w, d.dx))
        : target?.kind === 'back'
          ? d.dx * 0.5
          : rubber(d.dx, w)
    return { dir, target, x }
  }

  const paint = () => {
    frame = 0
    const d = drag
    const cur = host().current()
    if (!d?.locked || !cur) return
    const { dir, target, x } = place(d)
    put(cur, x, 0, 'none', target?.kind === 'back' ? 1 - 0.4 * Math.min(1, x / d.width) : undefined)
    placeNeighbor(d, target, dir, x, 'none')
    host().progress(target?.kind === 'panel' ? -x / d.width : 0, true)
  }

  const release = (d: Drag, mayCommit: boolean) => {
    cancelAnimationFrame(frame)
    frame = 0
    const cur = host().current()
    if (!cur) {
      reset()
      return
    }
    const { dir, target, x } = place(d)
    const w = d.width
    const v = velocity(d)
    const far = Math.abs(d.dx) > w * 0.3
    const flick = Math.abs(v) > FLICK && Math.sign(v) === Math.sign(d.dx) && Math.abs(d.dx) > 20
    // Бросил обратно — передумал, даже если протянул далеко.
    const thrownBack = Math.abs(v) > FLICK && Math.sign(v) !== Math.sign(d.dx)
    const go = mayCommit && target !== null && !thrownBack && (far || flick)
    const back = target?.kind === 'back'

    // Последнее положение под пальцем — от него и поедет доводка.
    put(cur, x, 0, 'none', back ? 1 - 0.4 * Math.min(1, x / w) : undefined)
    placeNeighbor(d, target, dir, x, 'none')
    void getComputedStyle(cur).transform

    const endX = !go ? 0 : back ? w * 0.5 : dir === 'next' ? -w : w
    const dist = Math.abs(endX - x)
    let ms = reduced?.matches || dist < 1 ? 0 : Math.round(Math.min(320, Math.max(180, 150 + dist * 0.45)))
    // После броска экран доезжает не медленнее пальца — иначе кажется, что он тормозит.
    if (go && ms && Math.abs(v) > FLICK) ms = Math.round(Math.max(150, Math.min(ms, (3 * dist) / Math.abs(v))))
    const transition = ms ? `transform ${ms}ms ${EASE}, opacity ${ms}ms ${EASE}` : 'none'
    put(cur, endX, 0, transition, back ? (go ? 0 : 1) : undefined)
    placeNeighbor(d, target, dir, endX, transition)
    // Капсула нижней панели доезжает своей пружиной.
    host().progress(go && target?.kind === 'panel' ? (dir === 'next' ? 1 : -1) : 0, false)

    const s = {
      timer: 0,
      finish: () => {
        if (settling !== s) return
        clearTimeout(s.timer)
        settling = null
        if (go) host().commit(dir)
        reset()
      },
    }
    settling = s
    // Таймер, а не transitionend: тот не приходит, если переход прервался
    // или вкладка ушла в фон, — а доводку нужно закончить в любом случае.
    if (ms) s.timer = window.setTimeout(s.finish, ms + 30)
    else s.finish()
  }

  const forget = (d: Drag) => {
    const t = d.target
    if (!t) return
    t.removeEventListener('touchmove', onDetachedMove as EventListener)
    t.removeEventListener('touchend', onDetachedEnd as EventListener)
    t.removeEventListener('touchcancel', onDetachedEnd as EventListener)
  }

  const onStart = (e: TouchEvent) => {
    // Новое касание поверх доводки — доводим мгновенно и слушаем новое.
    settling?.finish()
    if (drag) {
      const d = drag
      drag = null
      forget(d)
      // Второй палец посреди листания (щипок, случайность) — экран на место.
      if (d.locked && hasTouch(e.touches, d.id)) {
        release(d, false)
        return
      }
      // Прошлый жест так и не получил touchend — снимаем всё, что от него осталось.
      reset()
    }
    if (e.touches.length !== 1) return
    const t = e.touches[0]
    const target = e.target as Element | null
    if (!target || !root.contains(target)) return
    if (t.clientX < EDGE || t.clientX > window.innerWidth - EDGE) return
    if (document.querySelector('[aria-modal="true"]')) return
    const active = document.activeElement
    if (
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement ||
      (active instanceof HTMLElement && active.isContentEditable)
    )
      return
    if (insideHorizontalGesture(target, root)) return
    drag = {
      id: t.identifier,
      x0: t.clientX,
      y0: t.clientY,
      locked: false,
      dx: 0,
      samples: [],
      width: 0,
      top: 0,
      heights: new Map(),
      target,
    }
    target.addEventListener('touchmove', onDetachedMove as EventListener, { passive: false })
    target.addEventListener('touchend', onDetachedEnd as EventListener)
    target.addEventListener('touchcancel', onDetachedEnd as EventListener)
  }

  const onMove = (e: TouchEvent) => {
    const d = drag
    if (!d) return
    const t = findTouch(e.touches, d.id)
    if (!t) return
    if (!d.locked) {
      const mx = t.clientX - d.x0
      const my = t.clientY - d.y0
      if (Math.abs(mx) < SLOP && Math.abs(my) < SLOP) return
      // Вниз-вверх, или браузер уже прокручивает (событие нельзя отменить) — жест не наш.
      if (!e.cancelable || Math.abs(mx) < Math.abs(my) * AXIS) {
        drag = null
        forget(d)
        return
      }
      d.locked = true
      // Отсчёт — от точки, где жест признан: без скачка на величину порога.
      d.x0 = t.clientX
      d.width = root.clientWidth || window.innerWidth
      d.top = root.getBoundingClientRect().top + window.scrollY
      host().begin()
    }
    e.preventDefault()
    d.dx = t.clientX - d.x0
    const now = performance.now()
    d.samples.push({ t: now, x: t.clientX })
    while (d.samples.length > 2 && now - d.samples[0].t > 100) d.samples.shift()
    if (!frame) frame = requestAnimationFrame(paint)
  }

  const onEnd = (e: TouchEvent) => {
    const d = drag
    if (!d || !hasTouch(e.changedTouches, d.id)) return
    drag = null
    forget(d)
    if (!d.locked) return
    // Без «клика» по кнопке, на которой начался жест.
    if (e.type === 'touchend' && e.cancelable) e.preventDefault()
    release(d, e.type === 'touchend')
  }

  // Элемент под пальцем удалён из DOM — события до корня уже не дойдут.
  const onDetachedMove = (e: TouchEvent) => {
    if (!(e.currentTarget as Node).isConnected) onMove(e)
  }
  const onDetachedEnd = (e: TouchEvent) => {
    if (!(e.currentTarget as Node).isConnected) onEnd(e)
  }

  /** Свернули, ушли из вкладки, повернули экран — всё на свои места немедленно. */
  const abort = () => {
    settling?.finish()
    if (!drag) return
    const d = drag
    drag = null
    forget(d)
    reset()
  }
  const onVisibility = () => {
    if (document.hidden) abort()
  }

  document.addEventListener('touchstart', onStart, { passive: true, capture: true })
  root.addEventListener('touchmove', onMove, { passive: false })
  root.addEventListener('touchend', onEnd)
  root.addEventListener('touchcancel', onEnd)
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('blur', abort)
  window.addEventListener('resize', abort)
  try {
    tg.webApp?.onEvent('deactivated', abort)
  } catch {
    /* старый клиент без события */
  }
  return () => {
    document.removeEventListener('touchstart', onStart, { capture: true })
    root.removeEventListener('touchmove', onMove)
    root.removeEventListener('touchend', onEnd)
    root.removeEventListener('touchcancel', onEnd)
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('blur', abort)
    window.removeEventListener('resize', abort)
    try {
      tg.webApp?.offEvent('deactivated', abort)
    } catch {
      /* старый клиент */
    }
    if (settling) {
      clearTimeout(settling.timer)
      settling = null
    }
    if (drag) forget(drag)
    drag = null
    reset()
  }
}

/** Резинка у края, как в iOS: чем дальше тянешь, тем меньше экран поддаётся. */
function rubber(d: number, w: number): number {
  return Math.sign(d) * (1 - 1 / ((Math.abs(d) * 0.55) / w + 1)) * w
}

/** Скорость пальца в последние 100 мс, px/мс; остановился перед отпусканием — ноль. */
function velocity(d: Drag): number {
  const s = d.samples
  if (s.length < 2) return 0
  const last = s[s.length - 1]
  if (performance.now() - last.t > 90) return 0
  const dt = last.t - s[0].t
  return dt > 0 ? (last.x - s[0].x) / dt : 0
}

function findTouch(list: TouchList, id: number): Touch | null {
  for (let i = 0; i < list.length; i++) if (list[i].identifier === id) return list[i]
  return null
}

function hasTouch(list: TouchList, id: number): boolean {
  return findTouch(list, id) !== null
}

/** Жест начат на том, что само листается вбок или помечено `data-swipe-ignore`. */
function insideHorizontalGesture(target: Element, root: Element): boolean {
  for (let n: Element | null = target; n && n !== root; n = n.parentElement) {
    if (n.hasAttribute('data-swipe-ignore')) return true
    if (n.scrollWidth > n.clientWidth + 1) {
      const ox = getComputedStyle(n).overflowX
      if (ox === 'auto' || ox === 'scroll') return true
    }
  }
  return false
}
