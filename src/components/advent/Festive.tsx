import type { CSSProperties } from 'react'

/** Огоньки гирлянды: четыре цвета, перемигиваются по очереди (styles/advent.css). */
const COLORS = ['#FF5A5F', '#FFD166', '#3DDC97', '#4CC9F0']
const SEGMENTS = 4
const PER_SEGMENT = 4
/** Провисание провода между креплениями, px (в координатах высоты 28). */
const SAG = 9

/**
 * Гирлянда вдоль верхнего края карты: провод провисает между четырьмя
 * креплениями, на нём шестнадцать огоньков. Провод — SVG, растянутый по
 * ширине; огоньки — элементы постоянного размера в тех же точках (y провода
 * при параметре t: 2 + 4·SAG·t·(1−t), как у квадратичной кривой).
 *
 * Мигают четыре группы (по одному цвету), а не каждый огонёк: конец каждого
 * круга анимации будит главный поток, и шестнадцать огоньков со своими кругами
 * будили его ~6 раз в секунду (круг группы — 10,4 с, styles/advent.css).
 */
export function Garland({ className }: { className?: string }) {
  let wire = ''
  const bulbs: { x: number; y: number; c: string; g: number }[] = []
  for (let seg = 0; seg < SEGMENTS; seg++) {
    const x0 = (seg / SEGMENTS) * 100
    const x1 = ((seg + 1) / SEGMENTS) * 100
    wire += `M${x0} 2 Q${(x0 + x1) / 2} ${2 + 2 * SAG} ${x1} 2 `
    for (let k = 0; k < PER_SEGMENT; k++) {
      const t = (k + 0.5) / PER_SEGMENT
      const i = seg * PER_SEGMENT + k
      bulbs.push({ x: x0 + (x1 - x0) * t, y: 2 + 4 * SAG * t * (1 - t), c: COLORS[i % COLORS.length], g: i % 4 })
    }
  }
  return (
    <div className={`garland ${className ?? ''}`} aria-hidden>
      <svg viewBox="0 0 100 28" preserveAspectRatio="none">
        <path d={wire} fill="none" stroke="#2f4d3c" strokeWidth="1.3" vectorEffect="non-scaling-stroke" />
      </svg>
      {[0, 1, 2, 3].map((g) => (
        <span key={g} className={`bulbs b${g}`}>
          {bulbs
            .filter((b) => b.g === g)
            .map((b, i) => (
              <span
                key={i}
                className="bulb"
                style={{ left: `${b.x}%`, top: `${b.y + 1.5}px`, '--c': b.c } as CSSProperties}
              />
            ))}
        </span>
      ))}
    </div>
  )
}

/** Небо над «Прогрессом»: тёплое свечение и два слоя снега (ближний и дальний). */
export function FestiveSky() {
  return (
    <div className="festive-sky" aria-hidden>
      <i className="festive-snow far" />
      <i className="festive-snow" />
    </div>
  )
}

/** Снег внутри карточки (герой адвента, карточка на хабе). */
export function CardSnow() {
  return <i className="festive-snow" aria-hidden />
}

/**
 * Снегирь на краю карты уровня — сидит у крючка гирлянды и раз в ~11 с
 * подпрыгивает и вертит головой (одна анимация transform, styles/advent.css).
 */
export function Bullfinch({ className }: { className?: string }) {
  return (
    <span className={`bullfinch ${className ?? ''}`} aria-hidden>
      <svg viewBox="0 0 32 26" width="100%" height="100%">
        <path d="M21 13.6 L 31.4 10.4 L 31 16.2 Z" fill="#23262d" />
        <ellipse cx="15.4" cy="14.6" rx="10.2" ry="7.8" fill="#7d8798" />
        <ellipse cx="12.6" cy="17" rx="8.4" ry="5.8" fill="#e8573c" />
        <ellipse cx="20.4" cy="19" rx="3.4" ry="2" fill="#eef1f5" />
        <path d="M14 10.6 C 20 8.4, 25.6 11, 24.6 15.6 C 20.4 16.6, 16.4 14.6, 14 10.6 Z" fill="#23262d" />
        <path d="M16.2 12.6 C 19.2 12, 22 13, 23.2 14.6" stroke="#f3f5f8" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <circle cx="8" cy="9.6" r="5.8" fill="#e8573c" />
        <path d="M2.3 9.4 C 2.4 3.8, 12.4 2.6, 13.8 8.2 C 10.6 6.8, 6 7.2, 2.3 9.4 Z" fill="#1c1e23" />
        <circle cx="6.6" cy="9.4" r="1" fill="#101114" />
        <circle cx="6.3" cy="9.1" r=".34" fill="#fff" />
        <path d="M2.9 10 L 0.5 11.2 L 3.1 12.2 Z" fill="#2b2e35" />
        <path d="M12.8 21.6 L 12 24.6 M16.4 21.8 L 16.4 24.6" stroke="#4a4d55" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
    </span>
  )
}
