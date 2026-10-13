import { useEffect, useRef, type RefObject } from 'react'

/**
 * Свайп вправо-влево по экрану — соседняя вкладка, как листать экраны.
 *
 * Пальцем, а не мышью: на компьютере перетаскивание выделяет текст, а не листает.
 * Страница идёт за пальцем с сопротивлением (видно, что жест понят), и, если
 * протянул достаточно далеко или быстро, — переключение; нет — пружинит назад.
 *
 * Не перехватываем то, что уже листается вбок само или занято своим жестом:
 *   - ленты с прокруткой вбок (вкладки Аналитики, виды Магазина) — по факту
 *     прокрутки, без пометок;
 *   - элементы с `data-swipe-ignore` (карусель целей в шапке Главной,
 *     голограмма на карте баланса);
 *   - открытые шторки: они лежат внутри страниц без портала, и их нажатия
 *     всплывают сюда же — поэтому при любом `aria-modal` жест молчит;
 *   - поле ввода в фокусе (под пальцем клавиатура и выделение текста);
 *   - край экрана: там системный жест «назад» Android и iOS.
 *
 * Вертикальная прокрутка остаётся браузеру: у контейнера `touch-action: pan-y`,
 * и как только браузер начал прокручивать сам, он присылает pointercancel.
 */
export function useSwipeNav(ref: RefObject<HTMLElement>, onSwipe: (dir: 'next' | 'prev') => boolean) {
  const handler = useRef(onSwipe)
  handler.current = onSwipe

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

    let start: { x: number; y: number; t: number; id: number } | null = null
    let axis: 'x' | 'y' | null = null
    let dx = 0

    const paint = (shift: number, animate: boolean) => {
      el.style.transition = animate ? 'transform 220ms var(--ease-out), opacity 220ms var(--ease-out)' : 'none'
      el.style.transform = shift ? `translate3d(${shift}px,0,0)` : ''
      el.style.opacity = shift ? String(1 - Math.min(0.3, Math.abs(shift) / (el.clientWidth || 360))) : ''
    }
    const release = () => {
      start = null
      axis = null
      if (dx !== 0) paint(0, !reduced)
      dx = 0
    }

    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || !e.isPrimary) return
      const w = window.innerWidth
      if (e.clientX < 16 || e.clientX > w - 16) return
      if (document.querySelector('[aria-modal="true"]')) return
      const active = document.activeElement
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return
      if (insideHorizontalGesture(e.target as Element | null, el)) return
      start = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId }
      axis = null
      dx = 0
    }

    const onMove = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return
      const mx = e.clientX - start.x
      const my = e.clientY - start.y
      if (!axis) {
        if (Math.abs(mx) < 10 && Math.abs(my) < 10) return
        // Явно вбок — наш жест; иначе это прокрутка, и мы в ней не участвуем.
        axis = Math.abs(mx) > Math.abs(my) * 1.4 ? 'x' : 'y'
        if (axis === 'y') {
          start = null
          return
        }
      }
      dx = mx
      if (!reduced) paint(dx * 0.35, false)
    }

    const onUp = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return
      const s = start
      const travelled = dx
      const speed = Math.abs(travelled) / Math.max(1, performance.now() - s.t)
      const width = el.clientWidth || window.innerWidth
      const far = Math.abs(travelled) > width * 0.25
      const flick = Math.abs(travelled) > 48 && speed > 0.45
      const switched = axis === 'x' && (far || flick) ? handler.current(travelled < 0 ? 'next' : 'prev') : false
      if (switched) {
        // Новая вкладка въезжает своей анимацией — сдвиг старой просто снимаем.
        start = null
        axis = null
        dx = 0
        paint(0, false)
      } else release()
    }

    el.addEventListener('pointerdown', onDown, { passive: true })
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerup', onUp, { passive: true })
    window.addEventListener('pointercancel', release, { passive: true })
    return () => {
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', release)
      paint(0, false)
    }
  }, [ref])
}

/** Жест начат на том, что само листается вбок или помечено `data-swipe-ignore`. */
function insideHorizontalGesture(target: Element | null, root: Element): boolean {
  for (let n: Element | null = target; n && n !== root; n = n.parentElement) {
    if (n.hasAttribute('data-swipe-ignore')) return true
    if (n.scrollWidth > n.clientWidth + 1) {
      const ox = getComputedStyle(n).overflowX
      if (ox === 'auto' || ox === 'scroll') return true
    }
  }
  return false
}
