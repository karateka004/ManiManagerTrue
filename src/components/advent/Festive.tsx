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
