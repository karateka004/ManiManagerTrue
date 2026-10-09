/**
 * Эффекты-украшения поверх интерфейса: всплеск частиц, «+30 XP» над кнопкой,
 * монетки, летящие к счётчику.
 *
 * Императивно и без React-состояния: эффект живёт меньше секунды, и гонять
 * ради него перерисовку дерева незачем. Узлы кладутся в один фиксированный
 * слой поверх всего (pointer-events: none — тапы проходят насквозь), а
 * анимации — CSS keyframes из styles/motion.css. Удаление — по таймеру, а не
 * по animationend: если анимация не отыграет (свёрнутый webview), узел всё
 * равно уберётся и не останется висеть точкой поверх экрана.
 *
 * При «меньше движения» в системе частицы не рисуются вовсе; надпись «+N»
 * остаётся (это информация), но без полёта — просто появляется и тает.
 */

import { isLowEnd } from './perf'

type Point = { x: number; y: number }

let layer: HTMLDivElement | null = null

function getLayer(): HTMLDivElement {
  if (layer && layer.isConnected) return layer
  layer = document.createElement('div')
  layer.className = 'fx-layer'
  layer.setAttribute('aria-hidden', 'true')
  document.body.appendChild(layer)
  return layer
}

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  } catch {
    return false
  }
}

/** Центр элемента в координатах экрана; null — элемента нет или он не на экране. */
export function centerOf(el: Element | null | undefined): Point | null {
  if (!el || !el.isConnected) return null
  const r = el.getBoundingClientRect()
  if (r.width === 0 && r.height === 0) return null
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

function toPoint(at: Point | Element | null | undefined): Point | null {
  if (!at) return null
  if (typeof Element !== 'undefined' && at instanceof Element) return centerOf(at)
  return at as Point
}

const px = (v: number) => `${Math.round(v * 10) / 10}px`

/** Цвета акцента + золото монет: всплеск в цветах приложения, а не радугой. */
export const BRAND_FX = ['rgb(var(--brand-300))', 'rgb(var(--brand-500))', '#FFD45C', '#FFFFFF']

export interface BurstOptions {
  colors?: string[]
  count?: number
  /** Радиус разлёта, px. */
  spread?: number
  /** Конфетти: прямоугольники и падение вниз, а не ровный круг. */
  confetti?: boolean
  /** Форма частиц: точки (по умолчанию), звёзды, монетки. */
  shape?: 'dot' | 'star' | 'coin'
}

/** Всплеск частиц из точки (или из центра элемента). */
export function burst(at: Point | Element | null | undefined, opts: BurstOptions = {}) {
  if (prefersReducedMotion() || isLowEnd()) return
  const p = toPoint(at)
  if (!p) return
  const count = opts.count ?? 14
  const spread = opts.spread ?? 64
  const colors = opts.colors ?? BRAND_FX

  const box = document.createElement('div')
  box.style.position = 'absolute'
  box.style.left = '0'
  box.style.top = '0'
  box.style.transform = `translate3d(${px(p.x)}, ${px(p.y)}, 0)`

  let longest = 0
  for (let i = 0; i < count; i++) {
    const s = document.createElement('span')
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.7
    const dist = spread * (0.5 + Math.random() * 0.7)
    // Конфетти разлетается вверх и оседает: смещение по y сдвигаем вниз.
    const fall = opts.confetti ? spread * (0.5 + Math.random() * 0.8) : 0
    const dur = (opts.confetti ? 1000 : 720) + Math.random() * 360
    longest = Math.max(longest, dur)
    s.className =
      opts.shape === 'star'
        ? 'fx-p fx-star'
        : opts.shape === 'coin'
          ? 'fx-p fx-coin-p'
          : opts.confetti && i % 3 !== 0
            ? 'fx-p fx-rect'
            : 'fx-p'
    s.style.setProperty('--x0', '0px')
    s.style.setProperty('--y0', '0px')
    s.style.setProperty('--dx', px(Math.cos(angle) * dist))
    s.style.setProperty('--dy', px(Math.sin(angle) * dist * (opts.confetti ? 1.1 : 1) + fall - (opts.confetti ? spread * 0.35 : 0)))
    s.style.setProperty('--rot', `${Math.round((Math.random() - 0.5) * 540)}deg`)
    s.style.setProperty('--s', String(0.6 + Math.random() * 0.6))
    const size = opts.shape === 'star' ? 9 + Math.round(Math.random() * 7) : opts.shape === 'coin' ? 9 + Math.round(Math.random() * 4) : opts.confetti ? 5 + Math.round(Math.random() * 4) : 4 + Math.round(Math.random() * 5)
    s.style.setProperty('--sz', `${size}px`)
    s.style.setProperty('--dur', `${Math.round(dur)}ms`)
    s.style.background = colors[i % colors.length]
    if (opts.confetti && i % 3 !== 0) s.style.height = `${3 + Math.round(Math.random() * 3)}px`
    box.appendChild(s)
  }
  getLayer().appendChild(box)
  setTimeout(() => box.remove(), longest + 150)
}

/** Надпись «+30 XP» над точкой: всплывает и тает. */
export function floatText(at: Point | Element | null | undefined, text: string, opts: { color?: string; background?: string } = {}) {
  const p = toPoint(at)
  if (!p) return
  const s = document.createElement('span')
  s.className = 'fx-float'
  s.textContent = text
  s.style.setProperty('--x0', px(p.x))
  s.style.setProperty('--y0', px(p.y))
  if (opts.color) s.style.color = opts.color
  if (opts.background) s.style.background = opts.background
  getLayer().appendChild(s)
  setTimeout(() => s.remove(), 1450)
}

/**
 * Монетки летят дугой от кнопки к счётчику монет. Цель — элемент с атрибутом
 * `data-coin-target` (строка «Магазин» на «Прогрессе», счётчик в Магазине).
 * Нет цели на экране — просто всплеск у кнопки. `onArrive` зовётся, когда
 * долетела первая монетка: счётчик в этот момент «подпрыгивает».
 */
export function flyCoins(from: Point | Element | null | undefined, n = 6, onArrive?: () => void) {
  const a = toPoint(from)
  const target = document.querySelector('[data-coin-target]')
  const b = centerOf(target)
  if (!a) return
  if (!b || prefersReducedMotion() || isLowEnd()) {
    burst(a, { colors: ['#FFD45C', '#F5B524', '#FFFFFF'], count: 12 })
    onArrive?.()
    return
  }
  const L = getLayer()
  // Не больше пяти: десяток монет — уже не награда, а рябь на экране.
  const count = Math.max(3, Math.min(5, n))
  const dur = 760
  for (let i = 0; i < count; i++) {
    const c = document.createElement('span')
    c.className = 'fx-coin'
    const jitter = () => (Math.random() - 0.5) * 26
    const x0 = a.x + jitter()
    const y0 = a.y + jitter() * 0.6
    // Вершина дуги — над серединой пути: монетки «подбрасываются», а не ползут.
    const xm = (x0 + b.x) / 2 + jitter() * 1.4
    const ym = Math.min(y0, b.y) - 70 - Math.random() * 40
    c.style.setProperty('--x0', px(x0))
    c.style.setProperty('--y0', px(y0))
    c.style.setProperty('--xm', px(xm))
    c.style.setProperty('--ym', px(ym))
    c.style.setProperty('--x1', px(b.x))
    c.style.setProperty('--y1', px(b.y))
    c.style.setProperty('--dur', `${dur}ms`)
    c.style.setProperty('--delay', `${i * 55}ms`)
    L.appendChild(c)
    setTimeout(() => c.remove(), dur + i * 55 + 120)
  }
  if (onArrive) setTimeout(onArrive, dur - 80)
  if (target instanceof HTMLElement) {
    setTimeout(() => {
      target.classList.remove('pop')
      void target.offsetWidth // перезапуск анимации
      target.classList.add('pop')
    }, dur - 60)
  }
}

/**
 * Перезапустить CSS-анимацию на элементе: снять класс, дать браузеру это
 * заметить и вернуть. Для откликов, которые повторяются на одном и том же
 * элементе (тряска суммы, «толчок» при вводе).
 */
export function replay(el: Element | null | undefined, cls: string) {
  if (!el) return
  el.classList.remove(cls)
  void (el as HTMLElement).offsetWidth
  el.classList.add(cls)
}

/** Цвета редкости для празднований (совпадают с RARITY в lib/rewards). */
export const RARITY_FX: Record<string, string[]> = {
  common: ['#94A3B8', '#CBD5E1', '#FFFFFF'],
  rare: ['#3B82F6', '#93C5FD', '#FFFFFF'],
  epic: ['#A855F7', '#D8B4FE', '#FFFFFF'],
  legendary: ['#F59E0B', '#FCD34D', '#FFFFFF', '#FB7185'],
}
