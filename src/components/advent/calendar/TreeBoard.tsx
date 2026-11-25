import type { CSSProperties, ReactNode } from 'react'
import { Snowflake } from 'lucide-react'
import { Keepsake } from '../Keepsake'
import { keepsakeOf } from '../keepsakes'
import type { BoardProps } from './types'

/**
 * Вариант «Ёлка»: окошки — шары на ёлке. Ряды снизу вверх: 1–7, 8–13, 14–18,
 * 19–22, 23–25, 26–27; 28–30 — подарки под ёлкой, 31 — звезда на макушке.
 * Ёлка зажигается снизу вверх: открытый шар становится игрушкой своего дня
 * (keepsakes.ts) — к Новому году ёлка наряжена тем, что ты собрал.
 *
 * Координаты — в единицах холста 320×352; шары и подарки — кнопки поверх SVG
 * (проценты от ширины/высоты), огоньки гирлянды — элементы, а не SVG: их
 * мерцание (прозрачность группы) идёт на композиторе.
 */
const W = 320
const H = 352

type Spot = { day: number; x: number; y: number; kind: 'ball' | 'gift' | 'star' }

const ROWS: { y: number; n: number; step: number }[] = [
  { y: 262, n: 7, step: 42 },
  { y: 224, n: 6, step: 42 },
  { y: 186, n: 5, step: 41 },
  { y: 148, n: 4, step: 40 },
  { y: 110, n: 3, step: 40 },
  { y: 74, n: 2, step: 40 },
]

const SPOTS: Spot[] = (() => {
  const out: Spot[] = []
  let day = 1
  for (const r of ROWS) {
    for (let k = 0; k < r.n; k++) out.push({ day: day++, x: 160 + (k - (r.n - 1) / 2) * r.step, y: r.y, kind: 'ball' })
  }
  for (const x of [112, 160, 208]) out.push({ day: day++, x, y: 318, kind: 'gift' })
  out.push({ day: 31, x: 160, y: 30, kind: 'star' })
  return out
})()

// Ярусы ёлки сверху вниз: верхушка, низ яруса, полуширина низа.
const TIERS: [number, number, number][] = [
  [34, 92, 48],
  [60, 128, 64],
  [90, 166, 84],
  [124, 204, 106],
  [160, 242, 126],
  [196, 282, 148],
]

function tierPath(apex: number, bottom: number, hw: number): string {
  const mid = (apex + bottom) / 2 + 6
  let d = `M160 ${apex} Q ${(160 + hw * 0.5).toFixed(1)} ${mid.toFixed(1)} ${160 + hw} ${bottom}`
  const n = Math.max(3, Math.round((2 * hw) / 24))
  const step = (2 * hw) / n
  for (let i = 0; i < n; i++) {
    const x1 = 160 + hw - step * (i + 1)
    const cx = x1 + step / 2
    d += ` Q ${cx.toFixed(1)} ${bottom + 8} ${x1.toFixed(1)} ${bottom}`
  }
  d += ` Q ${(160 - hw * 0.5).toFixed(1)} ${mid.toFixed(1)} 160 ${apex} Z`
  return d
}

// Снег на кончиках лап: каждая вторая «волна» низа яруса.
const SNOW: { x: number; y: number; r: number }[] = (() => {
  const out: { x: number; y: number; r: number }[] = []
  TIERS.forEach(([, bottom, hw], ti) => {
    const n = Math.max(3, Math.round((2 * hw) / 24))
    const step = (2 * hw) / n
    for (let i = 0; i < n; i++) {
      if ((i + ti) % 2) continue
      const cx = 160 + hw - step * (i + 0.5)
      out.push({ x: cx, y: bottom + 2.4, r: 4.6 + ((i * 7 + ti * 3) % 3) })
    }
  })
  return out
})()

// Нити гирлянды поперёк ёлки: начало, конец, провисание.
const STRANDS: { x0: number; x1: number; y: number; sag: number; n: number }[] = [
  { x0: 122, x1: 198, y: 92, sag: 12, n: 6 },
  { x0: 82, x1: 238, y: 166, sag: 18, n: 10 },
  { x0: 36, x1: 284, y: 242, sag: 22, n: 14 },
]

const BULB_COLORS = ['#FF5A5F', '#FFD166', '#3DDC97', '#4CC9F0']

const BULBS: { x: number; y: number; c: string; g: number }[] = (() => {
  const out: { x: number; y: number; c: string; g: number }[] = []
  let i = 0
  for (const s of STRANDS) {
    for (let k = 0; k < s.n; k++) {
      const t = (k + 0.5) / s.n
      const x = s.x0 + (s.x1 - s.x0) * t
      const y = s.y + 4 * s.sag * t * (1 - t)
      out.push({ x, y, c: BULB_COLORS[i % 4], g: i % 4 })
      i++
    }
  }
  return out
})()

const strandPath = (s: (typeof STRANDS)[number]) =>
  `M${s.x0} ${s.y} Q ${(s.x0 + s.x1) / 2} ${s.y + 2 * s.sag} ${s.x1} ${s.y}`

const pos = (x: number, y: number): CSSProperties => ({ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` })

export function TreeBoard({ states, selected, opening, doorRef, onDoor, label }: BoardProps) {
  return (
    <div className="adv-board adv-tree-board" data-advent-board="tree">
      <svg className="tb-art" viewBox={`0 0 ${W} ${H}`} aria-hidden>
        <defs>
          <radialGradient id="tbGlow" cx="50%" cy="54%" r="58%">
            <stop offset="0" stopColor="#ffc46e" stopOpacity=".26" />
            <stop offset="1" stopColor="#ffc46e" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="tbTier" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#35a063" />
            <stop offset=".55" stopColor="#1b6c3f" />
            <stop offset="1" stopColor="#0d4527" />
          </linearGradient>
          <linearGradient id="tbShade" x1="0" y1="0" x2="1" y2="0">
            <stop offset=".5" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity=".28" />
          </linearGradient>
          <linearGradient id="tbGround" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset=".55" stopColor="#cfe2f0" />
            <stop offset="1" stopColor="#cfe2f0" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="tbBokeh" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#ffd98a" stopOpacity=".55" />
            <stop offset="1" stopColor="#ffd98a" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="tbTrunk" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#5a3417" />
            <stop offset=".5" stopColor="#8a5528" />
            <stop offset="1" stopColor="#4a2a12" />
          </linearGradient>
        </defs>
        <circle cx="160" cy="190" r="190" fill="url(#tbGlow)" />
        {[
          [30, 210, 26],
          [292, 178, 22],
          [262, 96, 14],
          [44, 76, 16],
          [300, 262, 18],
        ].map(([x, y, r]) => (
          <circle key={`b${x}`} cx={x} cy={y} r={r} fill="url(#tbBokeh)" />
        ))}
        {/* Искорки в «небе» по углам. */}
        {[
          [26, 40, 1.4],
          [54, 18, 1],
          [292, 30, 1.6],
          [270, 62, 1],
          [20, 120, 1],
          [304, 132, 1.2],
        ].map(([x, y, r]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="#fff6d8" opacity=".8" />
        ))}
        <rect x="150" y="272" width="20" height="34" rx="2" fill="url(#tbTrunk)" />
        {[...TIERS].reverse().map(([apex, bottom, hw]) => (
          <g key={apex}>
            <path d={tierPath(apex, bottom, hw)} fill="url(#tbTier)" />
            <path d={tierPath(apex, bottom, hw)} fill="url(#tbShade)" />
            <path
              d={`M160 ${apex} Q ${160 - hw * 0.5} ${(apex + bottom) / 2 + 6} ${160 - hw} ${bottom}`}
              stroke="#8fe0ae"
              strokeOpacity=".35"
              strokeWidth="1.4"
              fill="none"
            />
          </g>
        ))}
        {SNOW.map((s, i) => (
          <g key={i}>
            <ellipse cx={s.x} cy={s.y + 1.2} rx={s.r + 0.6} ry={s.r * 0.55} fill="#9cc2dc" opacity=".5" />
            <ellipse cx={s.x} cy={s.y} rx={s.r} ry={s.r * 0.55} fill="#fdfeff" />
          </g>
        ))}
        {STRANDS.map((s) => (
          <path key={s.y} d={strandPath(s)} stroke="#173d28" strokeWidth="1.3" fill="none" />
        ))}
        {/* Сугроб под ёлкой — холмиком, без края по ширине карточки. */}
        <path
          d={`M2 ${H} C 8 326, 46 306, 100 302 C 130 300, 146 304, 160 303 C 176 302, 192 299, 222 302 C 276 306, 312 326, 318 ${H} Z`}
          fill="url(#tbGround)"
        />
        <path d="M40 314 C 70 304, 110 300, 150 303" stroke="#fff" strokeWidth="1.4" fill="none" opacity=".85" strokeLinecap="round" />
        <Snowman />
        <Cat />
      </svg>

      {/* Огоньки гирлянды: четыре группы перемигиваются (styles/advent.css). */}
      <div className="tb-bulbs" aria-hidden>
        {[0, 1, 2, 3].map((g) => (
          <span key={g} className={`bulbs b${g}`}>
            {BULBS.filter((b) => b.g === g).map((b, i) => (
              <span key={i} className="bulb" style={{ ...pos(b.x, b.y), '--c': b.c } as CSSProperties} />
            ))}
          </span>
        ))}
      </div>

      {SPOTS.map((sp) => {
        const state = states[sp.day - 1]
        const ks = keepsakeOf(sp.day)
        const cls = [
          'adv-door',
          `tb-${sp.kind}`,
          `is-${state}`,
          selected === sp.day ? 'is-sel' : '',
          opening === sp.day ? 'is-opening' : '',
        ].join(' ')
        let inner: ReactNode
        if (state === 'open' && ks) {
          inner = (
            <span className="tb-ks">
              <Keepsake shape={ks.shape} size={48} className="h-full w-full" />
            </span>
          )
        } else if (sp.kind === 'gift') {
          inner = <Present day={sp.day} state={state} />
        } else if (sp.kind === 'star') {
          inner = <StarLocked state={state} />
        } else {
          inner = (
            <span className={`tb-orb tint-${sp.day % 4}`}>
              <span className="tb-num">{sp.day}</span>
              {state === 'missed' && <Snowflake className="tb-frost" size={10} strokeWidth={2.8} />}
            </span>
          )
        }
        return (
          <button
            key={sp.day}
            ref={doorRef(sp.day)}
            type="button"
            data-day={sp.day}
            data-state={state}
            onClick={() => onDoor(sp.day)}
            aria-label={label(sp.day, state)}
            className={cls}
            style={pos(sp.x, sp.y)}
          >
            {state === 'today' && <span className="adv-halo" aria-hidden />}
            {inner}
          </button>
        )
      })}
    </div>
  )
}

const GIFT_COLORS: Record<number, [string, string, string]> = {
  28: ['#e2414f', '#a51a30', '#ffd166'],
  29: ['#3f8fd9', '#1f5c9e', '#ffffff'],
  30: ['#2fa56a', '#1b6c41', '#ffd166'],
}

/** Подарок под ёлкой (окошки 28–30): коробка, лента, бант и бирка с числом. */
function Present({ day, state }: { day: number; state: string }) {
  const [a, b, ribbon] = GIFT_COLORS[day] ?? GIFT_COLORS[28]
  const id = `tbg${day}`
  return (
    <svg className="tb-present" viewBox="0 0 48 44" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset="1" stopColor={b} />
        </linearGradient>
      </defs>
      <rect x="6" y="16" width="36" height="26" rx="3" fill={`url(#${id})`} />
      <rect x="3.5" y="10.5" width="41" height="9" rx="2.4" fill={a} />
      <rect x="21" y="10.5" width="6" height="31.5" fill={ribbon} opacity=".92" />
      <path d="M24 10.5 C 17 2, 9.5 5.5, 13 10 C 15.4 12.6, 20.6 11.8, 24 10.5 Z M24 10.5 C 31 2, 38.5 5.5, 35 10 C 32.6 12.6, 27.4 11.8, 24 10.5 Z" fill={ribbon} />
      <circle cx="24" cy="10.4" r="2.6" fill={ribbon} />
      <rect x="9" y="26" width="12" height="9" rx="2" fill="#fff7e6" transform="rotate(-8 15 30)" />
      <text x="15" y="33.3" textAnchor="middle" fontSize="7.4" fontWeight="800" fill="#7a2a12" transform="rotate(-8 15 30)" fontFamily="system-ui, sans-serif">
        {day}
      </text>
      {state === 'missed' && <rect x="3.5" y="10.5" width="41" height="31.5" rx="3" fill="#dff1fb" opacity=".55" />}
    </svg>
  )
}

/** Звезда на макушке до 31 декабря — тёмная с золотой каймой. */
function StarLocked({ state }: { state: string }) {
  const today = state === 'today'
  return (
    <svg className="tb-starsvg" viewBox="0 0 56 56" aria-hidden>
      <path
        d="M28 4 L 34.2 20.4 L 51.6 21 L 37.8 31.8 L 42.6 48.6 L 28 38.8 L 13.4 48.6 L 18.2 31.8 L 4.4 21 L 21.8 20.4 Z"
        fill={today ? '#ffd34d' : '#204a35'}
        stroke="#f0c75a"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <text x="28" y="33.6" textAnchor="middle" fontSize="12" fontWeight="800" fill={today ? '#5a3a00' : '#f3d27a'} fontFamily="system-ui, sans-serif">
        31
      </text>
    </svg>
  )
}

/** Маленький снеговик слева под ёлкой — просто для уюта. */
function Snowman() {
  return (
    <g transform="translate(22 288)">
      <ellipse cx="12" cy="40" rx="15" ry="4" fill="#9cc2dc" opacity=".45" />
      <circle cx="12" cy="30" r="10" fill="#fdfeff" />
      <circle cx="12" cy="14" r="7" fill="#fdfeff" />
      <path d="M5.2 8.4 C 5.8 1.6, 18.2 1.6, 18.8 8.4 Z" fill="#d7263d" />
      <rect x="4.6" y="7.2" width="14.8" height="2.6" rx="1.3" fill="#fff" />
      <circle cx="12" cy="1.6" r="2" fill="#fff" />
      <circle cx="9.6" cy="13" r=".9" fill="#1f2329" />
      <circle cx="14.4" cy="13" r=".9" fill="#1f2329" />
      <path d="M12 14.6 L 18 16 L 12 16.8 Z" fill="#f07c1d" />
      <path d="M5.4 19.6 C 9 21.8, 15 21.8, 18.6 19.6 L 18.2 22.4 C 15 24.2, 9 24.2, 5.8 22.4 Z" fill="#2f9e55" />
      <path d="M2.4 26 L -6 20 M21.6 26 L 29 19.4" stroke="#6b4423" strokeWidth="1.4" strokeLinecap="round" />
    </g>
  )
}

/** Котик спит у подарков, свернувшись клубком. */
function Cat() {
  return (
    <g transform="translate(250 312)">
      <ellipse cx="22" cy="23" rx="22" ry="3.6" fill="#9cc2dc" opacity=".45" />
      <path d="M4 20 C 2 10, 14 4, 24 6 C 34 8, 40 14, 38 20 C 36 24, 8 25, 4 20 Z" fill="#5f6b7a" />
      <path d="M38 19 C 44 16, 46 22, 40 23 C 32 25, 14 25, 8 22" stroke="#5f6b7a" strokeWidth="4" fill="none" strokeLinecap="round" />
      <circle cx="9" cy="13.5" r="6.4" fill="#6c7888" />
      <path d="M4.4 9.4 L 5 3.6 L 9 8 Z M10.4 7.4 L 13.6 2.8 L 14.6 8.6 Z" fill="#6c7888" />
      <path d="M5.4 7.6 L 5.8 5.2 L 7.4 7 Z" fill="#f4a8b4" />
      <path d="M6.4 14 q1.4 1 2.8 0 M10.4 14 q1.4 1 2.8 0" stroke="#2a2f36" strokeWidth=".9" fill="none" strokeLinecap="round" />
      <path d="M18 10 C 22 9, 28 10, 31 13" stroke="#7d899a" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity=".8" />
    </g>
  )
}
