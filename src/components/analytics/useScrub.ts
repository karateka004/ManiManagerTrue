import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { hapticSelect } from '../../lib/telegram'

/** Что показать в точке графика. */
export interface ScrubPoint {
  /** Положение линии по горизонтали, 0…1. */
  x: number
  /** Положение точки по вертикали от верха, 0…1; null — без точки. */
  y: number | null
  title: string
  lines: { text: string; tone?: 'good' | 'bad' | 'muted' }[]
  /** Цвет точки (currentColor). */
  color?: string
}

const TONE: Record<string, string> = {
  good: 'text-income-deep dark:text-income-light',
  bad: 'text-expense-deep dark:text-expense-soft',
  muted: 'text-ink-subtle',
}

/**
 * Палец по графику — как в статистике Telegram: пунктирная линия, точка на
 * кривой и пузырь со значениями. Пишем прямо в DOM (transform и текст): ведение
 * пальцем не должно перерисовывать React-дерево графика на каждом движении.
 *
 * Вертикаль — прокрутке страницы (touch-action: pan-y у области графика):
 * повёл вниз — браузер забирает жест и присылает pointercancel, пузырь гаснет.
 * Горизонталь — графику; поэтому область помечена data-swipe-ignore, иначе
 * жест листал бы вкладки.
 *
 * `columns` — столбики (точка в середине колонки), иначе — точки кривой.
 */
export function useScrub(count: number, point: (i: number) => ScrubPoint | null, columns = false) {
  const boxRef = useRef<HTMLDivElement>(null)
  const guideRef = useRef<HTMLDivElement>(null)
  const dotRef = useRef<HTMLSpanElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const last = useRef(-1)
  const width = useRef(0)
  const hideAt = useRef(0)
  const pointRef = useRef(point)
  pointRef.current = point

  useEffect(() => () => clearTimeout(hideAt.current), [])

  const hide = () => {
    last.current = -1
    boxRef.current?.removeAttribute('data-on')
  }

  const show = (i: number) => {
    if (i === last.current) return
    const p = pointRef.current(i)
    const box = boxRef.current
    const guide = guideRef.current
    const tip = tipRef.current
    if (!p || !box || !guide || !tip) return
    if (last.current >= 0) hapticSelect()
    last.current = i
    const x = p.x * width.current
    guide.style.transform = `translate3d(${x.toFixed(1)}px, 0, 0)`
    const dot = dotRef.current
    if (dot) {
      dot.style.display = p.y === null ? 'none' : ''
      if (p.y !== null) dot.style.top = `calc(${(p.y * 100).toFixed(2)}% - 5px)`
      dot.style.color = p.color ?? 'currentColor'
    }
    // Текст пузыря: заголовок и строки, без innerHTML.
    tip.replaceChildren()
    const head = document.createElement('div')
    head.className = 'font-bold'
    head.textContent = p.title
    tip.append(head)
    for (const line of p.lines) {
      const row = document.createElement('div')
      row.className = 'tabular font-semibold ' + (line.tone ? TONE[line.tone] : '')
      row.textContent = line.text
      tip.append(row)
    }
    // Пузырь не вылезает за края карточки.
    const w = tip.offsetWidth
    const left = Math.min(Math.max(x, w / 2 + 4), width.current - w / 2 - 4)
    tip.style.left = `${left.toFixed(1)}px`
    box.setAttribute('data-on', '')
  }

  const indexAt = (e: ReactPointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    width.current = r.width
    const k = Math.min(1, Math.max(0, (e.clientX - r.left) / Math.max(1, r.width)))
    return columns ? Math.min(count - 1, Math.floor(k * count)) : Math.round(k * (count - 1))
  }

  const handlers = {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (count < 1) return
      clearTimeout(hideAt.current)
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        /* старый движок без захвата — ведём как есть */
      }
      last.current = -1
      show(indexAt(e))
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      if (last.current < 0 || count < 1) return
      show(indexAt(e))
    },
    onPointerUp: () => {
      clearTimeout(hideAt.current)
      hideAt.current = window.setTimeout(hide, 1800)
    },
    onPointerCancel: hide,
  }

  return { boxRef, guideRef, dotRef, tipRef, handlers }
}
