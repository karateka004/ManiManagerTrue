import { useId, type ReactNode } from 'react'
import type { KeepsakeShape } from './keepsakes'

/**
 * Ёлочная игрушка окошка — свой рисунок у каждого дня (keepsakes.ts). Холст
 * 48×56: сверху петелька и колпачок, ниже фигура. Объём — радиальные градиенты
 * и блик, как у стекла; id градиентов уникальны (useId), игрушек на экране
 * бывает до 31.
 */
export function Keepsake({ shape, size = 48, className }: { shape: KeepsakeShape; size?: number; className?: string }) {
  const u = 'k' + useId().replace(/[^a-zA-Z0-9]/g, '')
  return (
    <svg viewBox="0 0 48 56" width={size} height={(size * 56) / 48} className={className} aria-hidden>
      {SHAPES[shape](u)}
    </svg>
  )
}

type C3 = [string, string, string]

function RG({ id, c, cx = '34%', cy = '30%', r = '78%' }: { id: string; c: C3; cx?: string; cy?: string; r?: string }) {
  return (
    <radialGradient id={id} cx={cx} cy={cy} r={r}>
      <stop offset="0" stopColor={c[0]} />
      <stop offset="0.55" stopColor={c[1]} />
      <stop offset="1" stopColor={c[2]} />
    </radialGradient>
  )
}

/** Линейный градиент; по умолчанию сверху вниз, `h` — слева направо. */
function LG({ id, c, h }: { id: string; c: string[]; h?: boolean }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2={h ? '1' : '0'} y2={h ? '0' : '1'}>
      {c.map((col, i) => (
        <stop key={i} offset={c.length === 1 ? 0 : i / (c.length - 1)} stopColor={col} />
      ))}
    </linearGradient>
  )
}

const GOLD: C3 = ['#fff1b8', '#e1b03c', '#8f6410']
const ROPE = '#d9b45a'

/** Петелька и золотой колпачок над шаром. */
function Cap({ u, y = 6 }: { u: string; y?: number }) {
  return (
    <>
      <defs>
        <LG id={`${u}cap`} c={['#a27512', '#ffe9a3', '#d6a531', '#8f6410']} h />
      </defs>
      <circle cx="24" cy={y - 2.4} r="2.2" fill="none" stroke={ROPE} strokeWidth="1.2" />
      <rect x="20.6" y={y} width="6.8" height="4.6" rx="1.2" fill={`url(#${u}cap)`} />
      <path d={`M21.4 ${y + 1.6} H 26.6 M21.4 ${y + 3} H 26.6`} stroke="#8f6410" strokeOpacity=".45" strokeWidth=".5" />
    </>
  )
}

/** Только петелька и нитка до точки крепления. */
function Loop({ x = 24, to = 12 }: { x?: number; to?: number }) {
  return (
    <>
      <circle cx={x} cy="3.4" r="2" fill="none" stroke={ROPE} strokeWidth="1.1" />
      <path d={`M${x} 5.4 V ${to}`} stroke={ROPE} strokeWidth="0.9" />
    </>
  )
}

function Shine({ cx, cy, rx, ry, rot = -28, o = 0.5 }: { cx: number; cy: number; rx: number; ry: number; rot?: number; o?: number }) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#fff" opacity={o} transform={`rotate(${rot} ${cx} ${cy})`} />
}

/** Пятиконечная звезда: внешний радиус R, внутренний r. */
function starPath(cx: number, cy: number, R: number, r: number): string {
  const p: string[] = []
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2
    const rad = i % 2 === 0 ? R : r
    p.push(`${(cx + Math.cos(a) * rad).toFixed(2)} ${(cy + Math.sin(a) * rad).toFixed(2)}`)
  }
  return `M${p.join(' L ')} Z`
}

/** Грани звезды: от центра к лучам (свет) — как у советской рубиновой. */
function starRidges(cx: number, cy: number, R: number): string {
  let d = ''
  for (let i = 0; i < 5; i++) {
    const a = ((Math.PI * 2) / 5) * i - Math.PI / 2
    d += `M${cx} ${cy} L ${(cx + Math.cos(a) * R).toFixed(2)} ${(cy + Math.sin(a) * R).toFixed(2)} `
  }
  return d
}

/** Снежинка из шести лучей с веточками. */
function flakePath(cx: number, cy: number, R: number): string {
  let d = ''
  for (let k = 0; k < 6; k++) {
    const a = (Math.PI / 3) * k - Math.PI / 2
    const ex = cx + Math.cos(a) * R
    const ey = cy + Math.sin(a) * R
    d += `M${cx} ${cy} L ${ex.toFixed(2)} ${ey.toFixed(2)} `
    for (const t of [0.48, 0.74]) {
      const bx = cx + Math.cos(a) * R * t
      const by = cy + Math.sin(a) * R * t
      const len = R * (t === 0.48 ? 0.3 : 0.22)
      for (const s of [-1, 1]) {
        const b = a + s * 0.75
        d += `M${bx.toFixed(2)} ${by.toFixed(2)} L ${(bx + Math.cos(b) * len).toFixed(2)} ${(by + Math.sin(b) * len).toFixed(2)} `
      }
    }
  }
  return d
}

function MiniFlake({ x, y, s = 1, color = '#fff', o = 0.95 }: { x: number; y: number; s?: number; color?: string; o?: number }) {
  return (
    <path
      d={`M${x} ${y - 3.4 * s} V ${y + 3.4 * s} M${x - 2.95 * s} ${y - 1.7 * s} L ${x + 2.95 * s} ${y + 1.7 * s} M${x - 2.95 * s} ${y + 1.7 * s} L ${x + 2.95 * s} ${y - 1.7 * s}`}
      stroke={color}
      strokeOpacity={o}
      strokeWidth={0.9 * s + 0.2}
      strokeLinecap="round"
    />
  )
}

// Чешуйки шишки: ряды сверху вниз.
const CONE_SCALES = (() => {
  const rows: [number, number][] = [
    [18, 2],
    [23.5, 3],
    [29, 4],
    [34.5, 4],
    [40, 3],
    [45.5, 3],
    [50, 2],
  ]
  const out: ReactNode[] = []
  rows.forEach(([y, n], ri) => {
    const step = 6.2
    const x0 = 24 - ((n - 1) * step) / 2 + (ri % 2 ? 0 : 0.6)
    for (let i = 0; i < n; i++) {
      const x = x0 + i * step
      out.push(
        <g key={`${ri}-${i}`}>
          <path d={`M${x - 3.3} ${y} q3.3 4.8 6.6 0`} fill="#e9b36a" fillOpacity=".35" stroke="#4a2a0b" strokeWidth="1.2" />
          <path d={`M${x - 1.8} ${y + 0.9} q1.8 2.4 3.6 0`} stroke="#ffe0a8" strokeOpacity=".55" strokeWidth=".7" fill="none" />
        </g>,
      )
    }
  })
  return out
})()

// Ямочки мандариновой кожуры.
const DIMPLES = [
  [16, 31], [19, 37], [22, 27], [27, 33], [31, 28], [33, 38], [25, 42], [18, 43], [29, 45], [21, 33], [35, 33], [14, 37], [26, 23], [30, 41],
].map(([x, y], i) => <circle key={i} cx={x} cy={y} r=".6" fill="#c45f00" opacity=".45" />)

const CLOCK_TICKS = Array.from({ length: 12 }, (_, i) => {
  const a = (Math.PI / 6) * i - Math.PI / 2
  const major = i % 3 === 0
  const r1 = major ? 10.6 : 11.4
  const r2 = 12.6
  return (
    <path
      key={i}
      d={`M${(24 + Math.cos(a) * r1).toFixed(2)} ${(33 + Math.sin(a) * r1).toFixed(2)} L ${(24 + Math.cos(a) * r2).toFixed(2)} ${(33 + Math.sin(a) * r2).toFixed(2)}`}
      stroke="#5a4214"
      strokeWidth={major ? 1.5 : 0.9}
      strokeLinecap="round"
    />
  )
})

const TOPPER_RAYS = Array.from({ length: 10 }, (_, i) => {
  const a = (Math.PI / 5) * i - Math.PI / 2 + Math.PI / 10
  return (
    <path
      key={i}
      d={`M${(24 + Math.cos(a) * 11).toFixed(2)} ${(28 + Math.sin(a) * 11).toFixed(2)} L ${(24 + Math.cos(a) * 21).toFixed(2)} ${(28 + Math.sin(a) * 21).toFixed(2)}`}
      stroke="#ffe7a0"
      strokeOpacity=".55"
      strokeWidth="1.1"
      strokeLinecap="round"
    />
  )
})

const SHAPES: Record<KeepsakeShape, (u: string) => ReactNode> = {
  cone: (u) => (
    <>
      <defs>
        <RG id={`${u}b`} c={['#f9dfa8', '#c98a3a', '#5e3510']} />
      </defs>
      <Cap u={u} />
      <path d="M24 10.6 C 33 12.6, 36 23.5, 35.2 34 C 34.3 44.5, 29 52.4, 24 54 C 19 52.4, 13.7 44.5, 12.8 34 C 12 23.5, 15 12.6, 24 10.6 Z" fill={`url(#${u}b)`} />
      {CONE_SCALES}
      <Shine cx={18} cy={24} rx={2.4} ry={6} rot={12} o={0.28} />
    </>
  ),

  icicle: (u) => (
    <>
      <defs>
        <LG id={`${u}b`} c={['#9fd6f3', '#f4fcff', '#bfe6fa', '#4fa3d6']} h />
      </defs>
      <Cap u={u} />
      <path d="M24 10.4 C 31.2 11.4, 31.6 17, 29.7 23 C 27.6 33, 25.8 43, 24 54.4 C 22.2 43, 20.4 33, 18.3 23 C 16.4 17, 16.8 11.4, 24 10.4 Z" fill={`url(#${u}b)`} stroke="#4a95c4" strokeOpacity=".7" strokeWidth=".6" />
      <path d="M19.4 16.4 C 23 18.6, 26.6 18.6, 29.6 16.8 M19.9 23.4 C 23 25.6, 26 25.6, 28.6 23.8 M21 30.6 C 23 32.2, 25.2 32.2, 27.2 30.8 M22.2 37.8 C 23.4 38.8, 24.7 38.8, 25.8 38 M23 44.6 C 23.6 45.2, 24.4 45.2, 25 44.7" stroke="#fff" strokeOpacity=".8" strokeWidth=".9" fill="none" />
      <path d="M20.3 14 C 19.6 20, 21 30, 23.2 46" stroke="#fff" strokeOpacity=".75" strokeWidth="1.2" fill="none" strokeLinecap="round" />
    </>
  ),

  bullfinch: (u) => (
    <>
      <defs>
        <RG id={`${u}r`} c={['#ffbe96', '#f2592a', '#a3270e']} />
        <RG id={`${u}g`} c={['#d6dbe2', '#8d97a3', '#4a535f']} />
      </defs>
      <path d="M5 47.5 C 16 45.4, 30 46.4, 44 44" stroke="#6b4423" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      <path d="M11 46.8 l-3 3.2 M17 46.2 l-1.8 3.8 M34 45.2 l2.6 3.6 M40 44.6 l3.2 2.8 M25 45.8 l.4 4" stroke="#3f8a4c" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M33 31.5 L 45.5 28.5 L 44.8 34.6 L 33.4 36.4 Z" fill="#1f2329" />
      <ellipse cx="26.5" cy="31" rx="12" ry="9.6" fill={`url(#${u}g)`} />
      <path d="M22.5 29.6 C 27.5 27.4, 33.5 29.4, 36 33.6 C 30.6 35, 25.4 33.8, 22.5 29.6 Z" fill="#2a2f36" />
      <path d="M24 31 C 28 30, 31.6 31, 34 32.9" stroke="#f3f5f7" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      <ellipse cx="20" cy="36.4" rx="9.6" ry="8.4" fill={`url(#${u}r)`} />
      <circle cx="16" cy="25" r="7" fill="#1b1e23" />
      <Shine cx={13.4} cy={22.4} rx={1.6} ry={2.6} rot={-30} o={0.22} />
      <circle cx="14" cy="24.2" r="1.3" fill="#fff" />
      <path d="M9.4 25.4 L 5.8 27.3 L 9.8 28.6 Z" fill="#2b2b2b" />
      <path d="M19.5 44.2 l-1 2.6 M24 44.4 l.6 2.4" stroke="#3a2a20" strokeWidth="1.2" strokeLinecap="round" />
      <Shine cx={16.5} cy={33} rx={2.6} ry={1.6} rot={-30} o={0.35} />
    </>
  ),

  tangerine: (u) => (
    <>
      <defs>
        <RG id={`${u}b`} c={['#ffd99a', '#ff9417', '#b84f00']} />
      </defs>
      <Loop to={16} />
      <circle cx="24" cy="33.5" r="16" fill={`url(#${u}b)`} />
      {DIMPLES}
      <rect x="22.7" y="15.4" width="2.6" height="3" rx="1" fill="#5b7d2f" />
      <path d="M24.6 17.6 C 26 12.4, 31.4 10.4, 36.4 12.4 C 34 16.8, 29 18.6, 24.6 17.6 Z" fill="#3f9a50" />
      <path d="M25.4 17 C 28.8 15.2, 31.8 14, 34.8 13" stroke="#2a6e37" strokeWidth=".8" fill="none" />
      <Shine cx={17.6} cy={26.6} rx={4.6} ry={2.8} o={0.45} />
    </>
  ),

  mitten: (u) => (
    <>
      <defs>
        <RG id={`${u}b`} c={['#ff9090', '#e2262f', '#8c0d15']} />
      </defs>
      <circle cx="24" cy="4" r="2" fill="none" stroke={ROPE} strokeWidth="1.1" />
      <path d="M20.6 12.4 C 20.6 7.4, 27.4 7.4, 27.4 12.4" stroke={ROPE} strokeWidth="1" fill="none" />
      <path d="M33 27 C 39.6 27.6, 41 33.6, 37.8 37.6 C 36.2 39.6, 34 39.4, 33 38.2 Z" fill={`url(#${u}b)`} />
      <path d="M15 18 L 33 18 L 33 40 C 33 49.4, 27.4 53.6, 23 53.6 C 18 53.6, 15 49.6, 15 43.4 Z" fill={`url(#${u}b)`} />
      <path d="M16 28.6 l3 -3 l3 3 l3 -3 l3 3 l3 -3 l1.4 1.4" stroke="#fff" strokeWidth="1.4" fill="none" strokeLinejoin="round" />
      <path d="M16 33 l3 3 l3 -3 l3 3 l3 -3 l3 3 l1.4 -1.4" stroke="#fff" strokeOpacity=".55" strokeWidth="1" fill="none" strokeLinejoin="round" />
      <MiniFlake x={21.5} y={43} s={0.8} />
      <MiniFlake x={28} y={46.6} s={0.55} />
      <circle cx="26.6" cy="40.4" r=".9" fill="#fff" />
      <rect x="13.6" y="11" width="20.8" height="8.4" rx="3.4" fill="#fbfbf5" />
      <path d="M17 12.4 V 18 M20 12.4 V 18 M23 12.4 V 18 M26 12.4 V 18 M29 12.4 V 18 M32 12.4 V 18" stroke="#dcdcd0" strokeWidth=".8" />
      <Shine cx={18.6} cy={24} rx={1.8} ry={4.4} rot={8} o={0.3} />
    </>
  ),

  bell: (u) => (
    <>
      <defs>
        <LG id={`${u}b`} c={['#a87a10', '#ffeaa6', '#e2b23a', '#93660a']} h />
      </defs>
      <circle cx="24" cy="3.6" r="2.1" fill="none" stroke={ROPE} strokeWidth="1.2" />
      <path d="M24 5.7 V 11" stroke={ROPE} strokeWidth="1" />
      <path d="M24 14 C 16.5 14, 14.6 22, 14.6 31 C 14.6 37.6, 12 41, 9.4 43.6 L 38.6 43.6 C 36 41, 33.4 37.6, 33.4 31 C 33.4 22, 31.5 14, 24 14 Z" fill={`url(#${u}b)`} />
      <path d="M18.2 21.4 C 17.2 27, 17 33, 15.8 38.4" stroke="#fff8dc" strokeOpacity=".75" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <rect x="8.4" y="42.6" width="31.2" height="4.4" rx="2.2" fill="#c08d1d" />
      <path d="M10 43.4 H 38" stroke="#ffe9a3" strokeOpacity=".6" strokeWidth=".7" />
      <circle cx="24" cy="50.2" r="3.3" fill="#a87512" />
      <Shine cx={22.8} cy={49.2} rx={1} ry={0.7} o={0.6} />
      <path d="M23 13.5 l-3.4 6.4 M25 13.5 l3.4 6.4" stroke="#c81f33" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M24 12 C 19 5.6, 13.8 7.8, 15.8 12.6 C 17.8 15, 21.8 13.6, 24 12 Z M24 12 C 29 5.6, 34.2 7.8, 32.2 12.6 C 30.2 15, 26.2 13.6, 24 12 Z" fill="#dd2a40" />
      <circle cx="24" cy="12" r="2.3" fill="#b0182c" />
    </>
  ),

  piggy: (u) => (
    <>
      <defs>
        <RG id={`${u}b`} c={['#ffe4ee', '#ff9dbf', '#d1537d']} />
        <RG id={`${u}c`} c={GOLD} />
      </defs>
      <Loop to={20} />
      <circle cx="24" cy="16.6" r="4.6" fill={`url(#${u}c)`} stroke="#a06d06" strokeWidth=".5" />
      <path d="M22.8 15.4 h2.4" stroke="#a06d06" strokeWidth=".8" />
      <path d="M12.4 25.2 L 14.2 18.6 L 18.8 23.6 Z" fill="#ee7aa2" />
      <ellipse cx="23" cy="35.4" rx="16" ry="13.4" fill={`url(#${u}b)`} />
      <path d="M27.4 22.6 L 31.8 17.6 L 33.8 24.2 Z" fill="#ee7aa2" />
      <rect x="19.8" y="21.8" width="8.4" height="1.9" rx=".95" fill="#7a2948" />
      <ellipse cx="38.8" cy="36.4" rx="4.6" ry="4.3" fill="#ff86ad" stroke="#cf4f79" strokeWidth=".7" />
      <ellipse cx="37.4" cy="36.4" rx=".85" ry="1.3" fill="#7a2948" />
      <ellipse cx="40.2" cy="36.4" rx=".85" ry="1.3" fill="#7a2948" />
      <circle cx="31.4" cy="30.2" r="1.5" fill="#3a1a26" />
      <circle cx="31.9" cy="29.7" r=".5" fill="#fff" />
      <circle cx="33.2" cy="34.6" r="1.6" fill="#ff6f9a" opacity=".45" />
      <path d="M14 46.6 v3.6 M20 47.8 v3.6 M27 47.8 v3.6 M33 46.6 v3.6" stroke="#e46f98" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M7.6 33.6 c-3 -1 -3 3 0 2.2 c2 -.6 1.2 -3.2 -1 -2.6" stroke="#e46f98" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      <Shine cx={16.4} cy={29} rx={4.6} ry={2.6} o={0.5} />
    </>
  ),

  ball: (u) => (
    <>
      <defs>
        <RG id={`${u}b`} c={['#ff9e9e', '#d81f2e', '#760912']} />
        <LG id={`${u}g`} c={['#9a6b06', '#ffe9a3', '#e1b03c', '#8f6410']} h />
      </defs>
      <Cap u={u} />
      <circle cx="24" cy="33" r="16.6" fill={`url(#${u}b)`} />
      <path d="M7.6 30.8 C 14 35.4, 34 35.4, 40.4 30.8 L 40.4 35.4 C 34 40, 14 40, 7.6 35.4 Z" fill={`url(#${u}g)`} />
      <path d="M9.6 33.2 C 15 36.8, 33 36.8, 38.4 33.2" stroke="#fff6d0" strokeOpacity=".7" strokeWidth=".6" strokeDasharray="1 1.6" fill="none" />
      <MiniFlake x={17.6} y={24.2} s={1.05} />
      <MiniFlake x={30.4} y={22.6} s={0.62} />
      <MiniFlake x={24} y={44.4} s={0.95} />
      <MiniFlake x={33.6} y={42.4} s={0.6} />
      <circle cx="13.8" cy="41" r=".8" fill="#fff" opacity=".85" />
      <circle cx="35.6" cy="27.6" r=".7" fill="#fff" opacity=".85" />
      <Shine cx={16.6} cy={22.8} rx={4.6} ry={2.6} o={0.45} />
    </>
  ),

  owl: (u) => (
    <>
      <defs>
        <RG id={`${u}b`} c={['#ffe4a6', '#d49638', '#764710']} />
      </defs>
      <Cap u={u} />
      <path d="M13.2 17.4 L 15.6 11.6 L 19.2 16 Z M34.8 17.4 L 32.4 11.6 L 28.8 16 Z" fill="#764710" />
      <path d="M24 12.2 C 34 12.2, 38 22, 38 33.2 C 38 45.2, 32 53.4, 24 53.4 C 16 53.4, 10 45.2, 10 33.2 C 10 22, 14 12.2, 24 12.2 Z" fill={`url(#${u}b)`} />
      <path d="M10.6 30 C 7.4 36, 8.4 44.2, 13 48.4 C 13 41.4, 12.4 35.2, 10.6 30 Z M37.4 30 C 40.6 36, 39.6 44.2, 35 48.4 C 35 41.4, 35.6 35.2, 37.4 30 Z" fill="#8c5617" opacity=".9" />
      <ellipse cx="24" cy="40.6" rx="9" ry="10" fill="#fbe8c2" opacity=".92" />
      <path d="M19.5 37.6 l2 2 l2 -2 l2 2 l2 -2 M19.5 42.6 l2 2 l2 -2 l2 2 l2 -2 M21.5 47.4 l2 2 l2 -2" stroke="#b57b2c" strokeWidth=".9" fill="none" />
      <circle cx="18.2" cy="26.2" r="5.7" fill="#fff" stroke="#c6923c" strokeWidth=".7" />
      <circle cx="29.8" cy="26.2" r="5.7" fill="#fff" stroke="#c6923c" strokeWidth=".7" />
      <circle cx="18.8" cy="26.8" r="2.8" fill="#2a190a" />
      <circle cx="29.2" cy="26.8" r="2.8" fill="#2a190a" />
      <circle cx="19.7" cy="25.8" r=".95" fill="#fff" />
      <circle cx="30.1" cy="25.8" r=".95" fill="#fff" />
      <path d="M22.2 30.8 L 25.8 30.8 L 24 34.4 Z" fill="#f08a24" />
      <Shine cx={15} cy={20} rx={2.6} ry={1.6} o={0.4} />
    </>
  ),

  house: (u) => (
    <>
      <defs>
        <LG id={`${u}w`} c={['#f7e2b5', '#d8af72']} />
        <RG id={`${u}l`} c={['#fff7cc', '#ffcf4a', '#f2930f']} cx="50%" cy="50%" r="70%" />
      </defs>
      <Loop to={14} />
      <rect x="29.6" y="15.6" width="4.6" height="10" fill="#8a3a2c" />
      <rect x="29.1" y="14.4" width="5.6" height="2.4" rx="1.2" fill="#fff" />
      <rect x="13" y="28" width="22" height="23.6" rx="1.4" fill={`url(#${u}w)`} />
      <path d="M9 30.6 L 24 14 L 39 30.6 Z" fill="#b8402c" />
      <path d="M8.4 30.8 L 24 13.4 L 39.6 30.8 L 36.6 30.8 L 24 16.8 L 11.4 30.8 Z" fill="#fff" />
      {[12, 16.6, 21.2, 26, 30.8, 35.6].map((x) => (
        <circle key={x} cx={x} cy="31" r="1.15" fill="#fff" />
      ))}
      <rect x="16" y="34.4" width="8.6" height="8.6" rx="1" fill={`url(#${u}l)`} />
      <path d="M20.3 34.4 V 43 M16 38.7 H 24.6" stroke="#8a5a2b" strokeWidth="1" />
      <rect x="27" y="39" width="5.6" height="12.6" rx="1" fill="#7a4a1f" />
      <circle cx="31" cy="45.6" r=".7" fill="#f2c037" />
      <path d="M15.4 43.4 h9.8" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),

  star: (u) => (
    <>
      <defs>
        <RG id={`${u}b`} c={['#ffa4a4', '#e0202b', '#870a12']} />
      </defs>
      <circle cx="24" cy="11.2" r="1.9" fill="none" stroke={ROPE} strokeWidth="1.1" />
      <path d={starPath(24, 32, 17.5, 7.2)} fill={`url(#${u}b)`} stroke="#f2c55a" strokeWidth="1.3" strokeLinejoin="round" />
      <path d={starRidges(24, 32, 15.6)} stroke="#fff" strokeOpacity=".3" strokeWidth=".9" />
      <Shine cx={20.6} cy={25.4} rx={2.4} ry={1.4} o={0.45} />
    </>
  ),

  gingerbread: (u) => (
    <>
      <defs>
        <RG id={`${u}b`} c={['#e9a565', '#bd6b2a', '#7a3b10']} />
      </defs>
      <Loop to={12.6} />
      <path
        d="M24 12.4 A6.6 6.6 0 0 1 28.7 23.6 L 36 26.4 A3 3 0 0 1 34.4 32 L 30 30.6 L 30.6 40 L 33.1 49 A3 3 0 0 1 27.4 50.6 L 24 42.6 L 20.6 50.6 A3 3 0 0 1 14.9 49 L 17.4 40 L 18 30.6 L 13.6 32 A3 3 0 0 1 12 26.4 L 19.3 23.6 A6.6 6.6 0 0 1 24 12.4 Z"
        fill={`url(#${u}b)`}
      />
      <circle cx="21.8" cy="18.2" r=".95" fill="#fff" />
      <circle cx="26.2" cy="18.2" r=".95" fill="#fff" />
      <path d="M21.2 20.8 C 22.6 22.6, 25.4 22.6, 26.8 20.8" stroke="#fff" strokeWidth="1" fill="none" strokeLinecap="round" />
      <circle cx="24" cy="29.4" r="1.1" fill="#ff5a6e" />
      <circle cx="24" cy="33.6" r="1.1" fill="#5ad19a" />
      <circle cx="24" cy="37.8" r="1.1" fill="#ffd166" />
      <path d="M14.4 28.4 l1.4 -1.4 l1.4 1.4 l1.4 -1.4 M30.4 27.2 l1.4 1.4 l1.4 -1.4 l1.4 1.4 M18.2 45 l1.4 1.2 l1.4 -1.2 M27 45 l1.4 1.2 l1.4 -1.2" stroke="#fff" strokeWidth=".9" fill="none" strokeLinejoin="round" />
      <Shine cx={21.2} cy={15.6} rx={2} ry={1.2} o={0.3} />
    </>
  ),

  stocking: (u) => (
    <>
      <defs>
        <RG id={`${u}b`} c={['#ff8e8e', '#dc2430', '#850b13']} />
      </defs>
      <circle cx="18" cy="3.6" r="2" fill="none" stroke={ROPE} strokeWidth="1.1" />
      <path d="M18 5.6 V 11.4" stroke={ROPE} strokeWidth=".9" />
      <path d="M16.6 17 L 31.4 17 L 31.4 33.6 C 31.4 37.6, 34 39.4, 37.4 41.6 C 41.6 44.6, 39.6 52.4, 33.2 51.4 C 28 50.6, 23 47.4, 19 43 C 17 41, 16.6 38.2, 16.6 35 Z" fill={`url(#${u}b)`} />
      <path d="M31.4 33.6 C 31.4 37.6, 34 39.4, 37.4 41.6 C 41.6 44.6, 39.6 52.4, 33.2 51.4 C 33.8 47.6, 33 43.4, 31.4 41 Z" fill="#2f9e55" opacity=".95" />
      <path d="M16.6 38 C 18 42, 20.2 44.6, 23 46.8 C 22.6 43.6, 21 40.6, 16.6 38 Z" fill="#2f9e55" opacity=".9" />
      <MiniFlake x={23.6} y={28.6} s={0.95} />
      <circle cx="27.6" cy="36.6" r=".9" fill="#fff" />
      <circle cx="20.4" cy="35.4" r=".7" fill="#fff" opacity=".8" />
      <rect x="15" y="10.6" width="18" height="8.2" rx="3.4" fill="#fbfbf5" />
      <path d="M17 12 C 18 13.6, 19.4 13.6, 20.6 12 M22.6 16.8 C 23.6 15.4, 25 15.4, 26 16.8 M28 12.2 C 29 13.8, 30.4 13.8, 31.2 12.4" stroke="#e1e1d6" strokeWidth=".8" fill="none" />
      <Shine cx={20} cy={22.6} rx={1.6} ry={4} rot={6} o={0.3} />
    </>
  ),

  clock: (u) => (
    <>
      <defs>
        <RG id={`${u}f`} c={['#ffffff', '#fff7e2', '#ecd6a2']} />
        <LG id={`${u}r`} c={['#9a6b06', '#ffe9a3', '#d6a531', '#8f6410']} h />
      </defs>
      <Cap u={u} y={7.4} />
      <circle cx="24" cy="33" r="16.2" fill={`url(#${u}r)`} />
      <circle cx="24" cy="33" r="13.6" fill={`url(#${u}f)`} />
      {CLOCK_TICKS}
      <path d="M24 33 L 23.4 24.6" stroke="#2b2116" strokeWidth="2" strokeLinecap="round" />
      <path d="M24 33 L 15 27.8" stroke="#2b2116" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="24" cy="33" r="1.5" fill="#c4202f" />
      <Shine cx={18} cy={26.4} rx={4.6} ry={2.2} o={0.5} />
    </>
  ),

  coin: (u) => (
    <>
      <defs>
        <RG id={`${u}b`} c={['#fff6c8', '#f0be36', '#9c6a05']} />
      </defs>
      <path d="M24 17 C 20.6 12, 16.6 10.2, 15.4 12.8 C 14.4 15, 19.4 16.6, 24 17 Z M24 17 C 27.4 12, 31.4 10.2, 32.6 12.8 C 33.6 15, 28.6 16.6, 24 17 Z" fill="#dd2a40" />
      <circle cx="24" cy="4" r="2" fill="none" stroke={ROPE} strokeWidth="1.1" />
      <path d="M24 6 V 16.4" stroke={ROPE} strokeWidth=".9" />
      <circle cx="24" cy="34" r="16" fill={`url(#${u}b)`} />
      <circle cx="24" cy="34" r="14.6" fill="none" stroke="#a87512" strokeWidth="1.1" strokeDasharray="1.1 1.5" />
      <circle cx="24" cy="34" r="11.4" fill="none" stroke="#c99a1e" strokeWidth="1.3" />
      <path d="M24 25.4 L 28.8 32 L 26.4 32 L 30.2 37.6 L 25.8 37.6 L 25.8 41 L 22.2 41 L 22.2 37.6 L 17.8 37.6 L 21.6 32 L 19.2 32 Z" fill="#b5820c" />
      <path d="M24 26.6 L 27.6 31.6" stroke="#fff3c2" strokeOpacity=".7" strokeWidth=".8" />
      <Shine cx={17.6} cy={27} rx={4.4} ry={2.4} o={0.45} />
    </>
  ),

  deer: (u) => (
    <>
      <defs>
        <RG id={`${u}b`} c={['#e9b882', '#b5733a', '#6a3a14']} />
      </defs>
      <circle cx="24" cy="4" r="2" fill="none" stroke={ROPE} strokeWidth="1.1" />
      <path d="M24 6 V 17" stroke={ROPE} strokeWidth=".9" />
      <path
        d="M19.4 19.4 C 15.4 15.4, 14.4 10.6, 15.2 7.4 M15.8 12.4 C 12.8 11.4, 11.2 9.4, 10.6 7.2 M17.2 15.8 C 14.6 15.8, 12.2 15, 10.9 13.2 M28.6 19.4 C 32.6 15.4, 33.6 10.6, 32.8 7.4 M32.2 12.4 C 35.2 11.4, 36.8 9.4, 37.4 7.2 M30.8 15.8 C 33.4 15.8, 35.8 15, 37.1 13.2"
        stroke="#8a5a2b"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <path d="M14.2 24.4 C 8 22.2, 5.8 26.6, 9 28.6 C 11 29.8, 14 28.4, 16 26.8 Z M33.8 24.4 C 40 22.2, 42.2 26.6, 39 28.6 C 37 29.8, 34 28.4, 32 26.8 Z" fill="#a86a33" />
      <path d="M24 17.2 C 31 17.2, 33.6 23.2, 33.1 30.2 C 32.6 38.4, 29.6 46.2, 24 50.4 C 18.4 46.2, 15.4 38.4, 14.9 30.2 C 14.4 23.2, 17 17.2, 24 17.2 Z" fill={`url(#${u}b)`} />
      <ellipse cx="24" cy="43.4" rx="6.4" ry="5.8" fill="#f2d6b1" />
      <ellipse cx="24" cy="44.6" rx="3.6" ry="2.8" fill="#d42230" />
      <Shine cx={22.8} cy={43.6} rx={1.1} ry={0.6} o={0.65} />
      <circle cx="20" cy="30.4" r="1.75" fill="#24150a" />
      <circle cx="28" cy="30.4" r="1.75" fill="#24150a" />
      <circle cx="20.6" cy="29.8" r=".55" fill="#fff" />
      <circle cx="28.6" cy="29.8" r=".55" fill="#fff" />
      <Shine cx={19.6} cy={22.8} rx={2.6} ry={1.4} o={0.35} />
    </>
  ),

  mushroom: (u) => (
    <>
      <defs>
        <RG id={`${u}b`} c={['#ff9696', '#e0202c', '#82070e']} />
      </defs>
      <Loop to={14.6} />
      <path d="M19 32 C 19 40, 18 46, 16.5 50.6 C 21 52.2, 27 52.2, 31.5 50.6 C 30 46, 29 40, 29 32 Z" fill="#f7efe0" stroke="#e0d0b2" strokeWidth=".6" />
      <path d="M18.6 35 C 21 37.6, 27 37.6, 29.4 35 C 29.6 37.4, 27.8 39.2, 24 39.2 C 20.2 39.2, 18.4 37.4, 18.6 35 Z" fill="#fffaf0" />
      <path d="M8.4 33 C 8.4 21, 16 14.2, 24 14.2 C 32 14.2, 39.6 21, 39.6 33 C 34 35.8, 14 35.8, 8.4 33 Z" fill={`url(#${u}b)`} />
      {[
        [16, 24, 2.3],
        [24, 19.6, 1.9],
        [31, 24, 2.5],
        [20, 30, 1.6],
        [28.6, 30.2, 1.5],
        [35.2, 29.6, 1.3],
        [12.6, 30, 1.2],
      ].map(([x, y, r]) => (
        <ellipse key={`${x}-${y}`} cx={x} cy={y} rx={r} ry={r * 0.86} fill="#fff" />
      ))}
      <path d="M12.6 52.4 l2 -4 l1.6 4 M32 52.4 l2 -4.6 l1.6 4.6" stroke="#3f9a50" strokeWidth="1.3" fill="none" strokeLinejoin="round" />
      <Shine cx={15.6} cy={19.6} rx={3.2} ry={1.6} o={0.35} />
    </>
  ),

  lantern: (u) => (
    <>
      <defs>
        <RG id={`${u}l`} c={['#fffbe0', '#ffd257', '#ef8510']} cx="50%" cy="58%" r="68%" />
      </defs>
      <circle cx="24" cy="31" r="17" fill="#ffcf5a" opacity=".16" />
      <circle cx="24" cy="4.4" r="2.6" fill="none" stroke="#c9a03c" strokeWidth="1.4" />
      <path d="M15.2 14.8 L 24 8.2 L 32.8 14.8 Z" fill="#b8860b" />
      <rect x="14" y="14.4" width="20" height="3.2" rx="1" fill="#d6a531" />
      <rect x="16" y="17.6" width="16" height="24" rx="2.6" fill={`url(#${u}l)`} />
      <path d="M21.3 17.6 V 41.6 M26.7 17.6 V 41.6" stroke="#b8860b" strokeWidth="1.1" />
      <rect x="22.6" y="34.4" width="2.8" height="5.2" fill="#fff8ec" />
      <path d="M24 25 C 26.6 28.6, 26.9 32.2, 24 34.6 C 21.1 32.2, 21.4 28.6, 24 25 Z" fill="#ff7a1a" />
      <path d="M24 28.4 C 25.2 30.2, 25.2 31.9, 24 33.3 C 22.8 31.9, 22.8 30.2, 24 28.4 Z" fill="#fff3b0" />
      <rect x="14" y="41.4" width="20" height="3.2" rx="1" fill="#d6a531" />
      <path d="M18 44.6 L 30 44.6 L 27 48.4 L 21 48.4 Z" fill="#b8860b" />
      <Shine cx={18.6} cy={22.6} rx={1.2} ry={3.6} rot={0} o={0.45} />
    </>
  ),

  squirrel: (u) => (
    <>
      <defs>
        <RG id={`${u}b`} c={['#ffc890', '#e07a2a', '#87400e']} />
      </defs>
      <circle cx="28" cy="4" r="2" fill="none" stroke={ROPE} strokeWidth="1.1" />
      <path d="M28 6 V 17.6" stroke={ROPE} strokeWidth=".9" />
      <path d="M29.6 50.6 C 42.4 48.4, 44.6 34, 38.6 24 C 34.6 17.4, 26.4 15.4, 24.4 20.4 C 30.4 20.4, 34.4 25.2, 33.4 31.2 C 32.4 37.2, 28 40.4, 29.6 50.6 Z" fill={`url(#${u}b)`} />
      <path d="M34.4 25.4 C 37 29, 37.4 34.6, 35.4 39.6" stroke="#ffd7a8" strokeOpacity=".55" strokeWidth="1" fill="none" strokeLinecap="round" />
      <ellipse cx="22" cy="40.4" rx="8.6" ry="10.2" fill="#d8742a" />
      <ellipse cx="19.8" cy="42.4" rx="4.6" ry="6.6" fill="#fbe2c4" />
      <path d="M20.2 21.8 L 22.8 14.4 L 24.4 22.2 Z" fill="#c9661f" />
      <path d="M22.8 14.4 l-.8 -2.2 M22.8 14.4 l.9 -2.1" stroke="#c9661f" strokeWidth=".9" strokeLinecap="round" />
      <circle cx="19.2" cy="27.2" r="6.6" fill="#e07f2f" />
      <circle cx="17.2" cy="26.4" r="1.45" fill="#2b170a" />
      <circle cx="16.8" cy="25.9" r=".45" fill="#fff" />
      <circle cx="12.8" cy="28.6" r="1" fill="#3a1d0a" />
      <ellipse cx="14.6" cy="37.4" rx="3.4" ry="3.9" fill="#a8672a" />
      <path d="M11.4 35.4 C 12 33, 17.2 33, 17.8 35.4 Z" fill="#6e3e16" />
      <ellipse cx="17.6" cy="38.6" rx="1.6" ry="1.2" fill="#d8742a" />
      <Shine cx={17} cy={23.4} rx={2.2} ry={1.2} o={0.35} />
    </>
  ),

  snowman: (u) => (
    <>
      <defs>
        <RG id={`${u}b`} c={['#ffffff', '#eef4fb', '#b3c8df']} />
      </defs>
      <circle cx="24" cy="4" r="2" fill="none" stroke={ROPE} strokeWidth="1.1" />
      <path d="M24 6 V 10.4" stroke={ROPE} strokeWidth=".9" />
      <circle cx="24" cy="42" r="11" fill={`url(#${u}b)`} />
      <circle cx="24" cy="26.6" r="8.2" fill={`url(#${u}b)`} />
      <path d="M16.6 31.6 C 21 34.6, 27 34.6, 31.4 31.6 L 31 35.2 C 27 37.6, 21 37.6, 17 35.2 Z" fill="#d7263d" />
      <path d="M26.8 35.2 L 29.8 44.2 L 26.4 43.6 L 24.4 35.8 Z" fill="#b81d31" />
      <path d="M17 21.2 C 17 14, 31 14, 31 21.2 Z" fill="#d7263d" />
      <rect x="16" y="19.6" width="16" height="3.2" rx="1.6" fill="#fff" />
      <circle cx="24" cy="12.8" r="2.7" fill="#fff" />
      <circle cx="21.2" cy="25.8" r="1.1" fill="#1f2329" />
      <circle cx="26.8" cy="25.8" r="1.1" fill="#1f2329" />
      <path d="M24 27.6 L 31.2 29.2 L 24 30 Z" fill="#f07c1d" />
      <circle cx="24" cy="40.4" r="1.2" fill="#1f2329" />
      <circle cx="24" cy="45.4" r="1.2" fill="#1f2329" />
      <Shine cx={19} cy={37.4} rx={3} ry={1.6} o={0.6} />
    </>
  ),

  wallet: (u) => (
    <>
      <defs>
        <RG id={`${u}b`} c={['#93f2c1', '#23b06b', '#0b663b']} />
        <RG id={`${u}c`} c={GOLD} />
      </defs>
      <circle cx="14" cy="4" r="2" fill="none" stroke={ROPE} strokeWidth="1.1" />
      <path d="M14 6 V 21.4" stroke={ROPE} strokeWidth=".9" />
      <circle cx="30.6" cy="19.6" r="6" fill={`url(#${u}c)`} stroke="#a06d06" strokeWidth=".5" />
      <path d="M28.6 18 h4" stroke="#a06d06" strokeWidth=".9" />
      <rect x="9" y="21.2" width="30" height="26.4" rx="7" fill={`url(#${u}b)`} />
      <path d="M39 26 L 28.4 26 C 25.2 26, 25.2 36.4, 28.4 36.4 L 39 36.4 Z" fill="#159353" />
      <circle cx="30.8" cy="31.2" r="2.5" fill="#f2c037" stroke="#a06d06" strokeWidth=".7" />
      <circle cx="16.4" cy="31" r="1.8" fill="#0b2e1d" />
      <circle cx="22.4" cy="31" r="1.8" fill="#0b2e1d" />
      <circle cx="17" cy="30.4" r=".6" fill="#fff" />
      <circle cx="23" cy="30.4" r=".6" fill="#fff" />
      <path d="M16.4 36.4 C 18 38.6, 20.8 38.6, 22.4 36.4" stroke="#0b2e1d" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      <circle cx="13.8" cy="35.4" r="1.6" fill="#ff8aa8" opacity=".55" />
      <circle cx="25" cy="35.4" r="1.6" fill="#ff8aa8" opacity=".55" />
      <Shine cx={14} cy={25.4} rx={3.4} ry={1.6} rot={-12} o={0.45} />
    </>
  ),

  candy: () => (
    <>
      <circle cx="21.8" cy="4" r="2" fill="none" stroke={ROPE} strokeWidth="1.1" />
      <path d="M21.8 6 V 12.4" stroke={ROPE} strokeWidth=".9" />
      <path d="M28.6 51.4 L 28.6 22 C 28.6 12.4, 15.8 12.4, 15.8 21.6" stroke="#fdfdfb" strokeWidth="7.2" strokeLinecap="round" fill="none" />
      <path d="M28.6 51.4 L 28.6 22 C 28.6 12.4, 15.8 12.4, 15.8 21.6" stroke="#e0202c" strokeWidth="7.2" strokeDasharray="3 3.4" fill="none" />
      <path d="M26.6 49.4 L 26.6 22.6 C 26.6 15.6, 18.6 15.2, 17.6 19.6" stroke="#fff" strokeOpacity=".6" strokeWidth="1.1" fill="none" strokeLinecap="round" />
      <path d="M28.6 25 C 24 21, 21 24, 23.6 27 C 25 28.6, 27 27, 28.6 25 Z M28.6 25 C 33.2 21, 36.2 24, 33.6 27 C 32.2 28.6, 30.2 27, 28.6 25 Z" fill="#2f9e55" />
      <circle cx="28.6" cy="25.2" r="1.8" fill="#23803f" />
    </>
  ),

  gift: (u) => (
    <>
      <defs>
        <LG id={`${u}b`} c={['#5fd0f6', '#1d6fa9']} />
      </defs>
      <circle cx="24" cy="4" r="2" fill="none" stroke={ROPE} strokeWidth="1.1" />
      <path d="M24 6 V 15" stroke={ROPE} strokeWidth=".9" />
      <rect x="12" y="26" width="24" height="24.4" rx="2" fill={`url(#${u}b)`} />
      {[
        [15.6, 31],
        [31.6, 33],
        [16.6, 45],
        [31, 46.4],
        [18.4, 38.6],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="1" fill="#fff" opacity=".85" />
      ))}
      <rect x="10.4" y="21" width="27.2" height="7.2" rx="1.6" fill="#2a8ac8" />
      <rect x="21.8" y="21" width="4.4" height="29.4" fill="#f2c037" />
      <path d="M21.8 21 h4.4" stroke="#fff3c2" strokeWidth=".8" />
      <path d="M24 21 C 18 12.6, 12.4 15.6, 15.4 19.8 C 17.4 22.4, 21.4 22, 24 21 Z M24 21 C 30 12.6, 35.6 15.6, 32.6 19.8 C 30.6 22.4, 26.6 22, 24 21 Z" fill="#f2c037" stroke="#c29112" strokeWidth=".6" />
      <circle cx="24" cy="20.6" r="2.3" fill="#d6a01b" />
      <Shine cx={15.6} cy={23.4} rx={2.4} ry={0.9} rot={0} o={0.45} />
    </>
  ),

  snowflake: () => (
    <>
      <circle cx="24" cy="12.6" r="1.9" fill="none" stroke={ROPE} strokeWidth="1.1" />
      <circle cx="24" cy="33" r="15" fill="#bfe9ff" opacity=".14" />
      <path d={flakePath(24, 33, 15.4)} stroke="#7cc4ec" strokeWidth="3.2" strokeLinecap="round" fill="none" opacity=".55" />
      <path d={flakePath(24, 33, 15.4)} stroke="#f3fbff" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      <path d="M24 29.4 L 27.1 31.2 L 27.1 34.8 L 24 36.6 L 20.9 34.8 L 20.9 31.2 Z" fill="#e8f7ff" stroke="#7cc4ec" strokeWidth=".7" />
      {[
        [15, 24],
        [33.6, 41],
        [33, 24.6],
        [14.6, 41.4],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r=".75" fill="#fff" />
      ))}
    </>
  ),

  chest: (u) => (
    <>
      <defs>
        <LG id={`${u}w`} c={['#b06e30', '#5c3112']} />
        <LG id={`${u}l`} c={['#a35b25', '#6b3716']} />
      </defs>
      <Loop to={20.6} />
      <path d="M10 31.6 C 10 21.4, 38 21.4, 38 31.6 Z" fill={`url(#${u}l)`} />
      <rect x="10" y="31" width="28" height="19.4" rx="2" fill={`url(#${u}w)`} />
      <path d="M10 31.2 H 38" stroke="#3d1f08" strokeWidth=".9" />
      <rect x="13.6" y="22.6" width="3.4" height="27.8" fill="#d6a531" />
      <rect x="31" y="22.6" width="3.4" height="27.8" fill="#d6a531" />
      <circle cx="18.6" cy="31" r="3" fill="#f2c037" stroke="#a06d06" strokeWidth=".5" />
      <circle cx="29.6" cy="30.6" r="3" fill="#f2c037" stroke="#a06d06" strokeWidth=".5" />
      <rect x="21.4" y="28.8" width="5.2" height="6.6" rx="1.2" fill="#f2c037" stroke="#a06d06" strokeWidth=".6" />
      <circle cx="24" cy="31.4" r=".95" fill="#5c3112" />
      <rect x="23.6" y="31.6" width=".8" height="2.2" fill="#5c3112" />
      <path d="M12 27 C 16 23.6, 32 23.6, 36 27" stroke="#ffd7a8" strokeOpacity=".35" strokeWidth="1" fill="none" />
    </>
  ),

  goldbar: (u) => (
    <>
      <defs>
        <LG id={`${u}t`} c={['#fff6c4', '#ebbd3f']} />
        <LG id={`${u}f`} c={['#f7cb4e', '#a87608']} />
      </defs>
      <circle cx="24" cy="4" r="2" fill="none" stroke={ROPE} strokeWidth="1.1" />
      <path d="M24 6 L 16 24.4 M24 6 L 32 24.4" stroke={ROPE} strokeWidth=".9" />
      <path d="M14.6 24 L 33.4 24 L 37.6 31.2 L 10.4 31.2 Z" fill={`url(#${u}t)`} />
      <path d="M10.4 31.2 L 37.6 31.2 L 39.6 43.4 L 8.4 43.4 Z" fill={`url(#${u}f)`} />
      <text x="24" y="40" textAnchor="middle" fontSize="6.2" fontWeight="800" fill="#93660a" fontFamily="system-ui, sans-serif">
        999
      </text>
      <path d="M13 26 L 18 26 L 13.4 41.6 L 10.6 41.6 Z" fill="#fff" opacity=".32" />
    </>
  ),

  cocoa: (u) => (
    <>
      <defs>
        <LG id={`${u}m`} c={['#ee3c50', '#a8162a']} />
      </defs>
      <circle cx="24" cy="4" r="2" fill="none" stroke={ROPE} strokeWidth="1.1" />
      <path d="M24 6 V 9.6" stroke={ROPE} strokeWidth=".9" />
      <path d="M19 19 C 17 16, 21 14, 19 10.6 M25.6 19 C 23.6 16, 27.6 14, 25.6 10.6" stroke="#fff" strokeOpacity=".7" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      <path d="M33.2 29 C 40 28.6, 40 40.4, 32.2 40.4" stroke="#b81d31" strokeWidth="3.4" fill="none" strokeLinecap="round" />
      <path d="M12.6 24 L 33.4 24 L 32 47.4 C 31.8 49.8, 30 51.4, 27.6 51.4 L 18.4 51.4 C 16 51.4, 14.2 49.8, 14 47.4 Z" fill={`url(#${u}m)`} />
      <ellipse cx="23" cy="24.2" rx="10.4" ry="2.2" fill="#6b3418" />
      <rect x="15" y="21.2" width="5" height="4" rx="1.2" fill="#fff" />
      <rect x="20.6" y="20.2" width="5" height="4" rx="1.2" fill="#ffd8e6" />
      <rect x="26" y="21.4" width="5" height="4" rx="1.2" fill="#fff" />
      <path d="M23 35.6 c-1.6 -2.2 -5 -.6 -3 2.2 l3 3 l3 -3 c2 -2.8 -1.4 -4.4 -3 -2.2 Z" fill="#fff" opacity=".92" />
      <path d="M16 28 C 16 34, 16.4 42, 17 47" stroke="#fff" strokeOpacity=".4" strokeWidth="1.3" fill="none" strokeLinecap="round" />
    </>
  ),

  rocket: (u) => (
    <>
      <defs>
        <LG id={`${u}s`} c={['#8a96a6', '#ffffff', '#cfd7e1', '#8592a3']} h />
      </defs>
      <circle cx="24" cy="4" r="2" fill="none" stroke={ROPE} strokeWidth="1.1" />
      <path d="M24 6 V 10.2" stroke={ROPE} strokeWidth=".9" />
      <path d="M20 41 C 20.5 47, 22.5 51, 24 54.4 C 25.5 51, 27.5 47, 28 41 Z" fill="#ff8a1f" />
      <path d="M22 41 C 22.4 45, 23.2 48, 24 50.4 C 24.8 48, 25.6 45, 26 41 Z" fill="#ffe27a" />
      <path d="M18 31 L 11 44.4 L 18.6 40.6 Z" fill="#d7263d" />
      <path d="M30 31 L 37 44.4 L 29.4 40.6 Z" fill="#d7263d" />
      <path d="M24 10.2 C 31 16.6, 32 28, 29.8 41 L 18.2 41 C 16 28, 17 16.6, 24 10.2 Z" fill={`url(#${u}s)`} />
      <path d="M24 10.2 C 27.4 13.4, 29.2 16.6, 30.2 20 L 17.8 20 C 18.8 16.6, 20.6 13.4, 24 10.2 Z" fill="#d7263d" />
      <circle cx="24" cy="28.4" r="4.3" fill="#d6a531" />
      <circle cx="24" cy="28.4" r="3.1" fill="#45b6e6" />
      <Shine cx={22.8} cy={27.2} rx={1.2} ry={0.7} o={0.7} />
      <rect x="18.4" y="37" width="11.2" height="2" fill="#d7263d" />
    </>
  ),

  moon: (u) => (
    <>
      <defs>
        <RG id={`${u}b`} c={['#fff6c8', '#f3c641', '#a77408']} />
        <mask id={`${u}m`}>
          <rect width="48" height="56" fill="#fff" />
          <circle cx="30.4" cy="27.6" r="13.2" fill="#000" />
        </mask>
      </defs>
      <circle cx="31.4" cy="4" r="2" fill="none" stroke={ROPE} strokeWidth="1.1" />
      <path d="M31.4 6 L 30 15.4" stroke={ROPE} strokeWidth=".9" />
      <circle cx="22" cy="33" r="16" fill={`url(#${u}b)`} mask={`url(#${u}m)`} />
      <path d="M11.6 32.6 C 12.8 34.2, 14.8 34.2, 16 32.6" stroke="#7a5306" strokeWidth="1.1" fill="none" strokeLinecap="round" />
      <circle cx="15.4" cy="38" r="1.6" fill="#ff8a7a" opacity=".5" />
      <path d="M33.6 45.4 V 50" stroke={ROPE} strokeWidth=".8" />
      <path d={starPath(33.6, 52.2, 2.6, 1.1)} fill="#ffd34d" />
      <Shine cx={12.6} cy={27} rx={1.4} ry={3.6} rot={18} o={0.45} />
    </>
  ),

  tree: () => (
    <>
      <circle cx="24" cy="3.4" r="2" fill="none" stroke={ROPE} strokeWidth="1.1" />
      <path d="M24 5.4 V 7.8" stroke={ROPE} strokeWidth=".9" />
      <rect x="21.2" y="42.6" width="5.6" height="7" rx="1" fill="#7a4a1f" />
      <path d="M24 24 L 38.6 43.2 L 9.4 43.2 Z" fill="#1d7a3e" />
      <path d="M24 18 L 35 32.8 L 13 32.8 Z" fill="#23904a" />
      <path d="M24 12.6 L 31.6 23.8 L 16.4 23.8 Z" fill="#2ea657" />
      <path d="M9.6 43 C 14 41.4, 18 43.6, 22 42 C 26 40.6, 30 43.4, 38.4 43 M13.2 32.6 C 17 31.2, 20.2 33.2, 24 31.8 C 27.6 30.6, 31 33, 34.8 32.6 M16.6 23.6 C 19.6 22.6, 22 24.2, 24 23.2 C 26.6 22.2, 29 24, 31.4 23.6" stroke="#fff" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      {(
        [
          [20.4, 21.4, '#ff5a5f'],
          [27.8, 20.4, '#ffd166'],
          [17.8, 30.6, '#4cc9f0'],
          [29, 30.2, '#ff5a5f'],
          [23.6, 27.4, '#ffd166'],
          [14.6, 40.6, '#ffd166'],
          [21, 38.4, '#ff5a5f'],
          [28.4, 39.4, '#4cc9f0'],
          [33.6, 40.8, '#ff5a5f'],
        ] as const
      ).map(([x, y, c]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" fill={c} />
      ))}
      <path d={starPath(24, 10.6, 4.4, 1.9)} fill="#ffd34d" stroke="#c98a0c" strokeWidth=".5" />
    </>
  ),

  topper: (u) => (
    <>
      <defs>
        <RG id={`${u}b`} c={['#fffbe0', '#ffd34d', '#c4860a']} />
      </defs>
      {TOPPER_RAYS}
      <path d="M20.4 43.6 L 27.6 43.6 L 26 54.4 L 22 54.4 Z" fill="#d6a531" />
      <path d="M21.6 46.4 H 26.4 M21.9 49.4 H 26.1" stroke="#8f6410" strokeOpacity=".5" strokeWidth=".6" />
      <path d={starPath(24, 28, 18, 7.6)} fill={`url(#${u}b)`} stroke="#b8860b" strokeWidth=".8" strokeLinejoin="round" />
      <path d={starPath(24, 28, 9.4, 4)} fill="#fff6c9" opacity=".55" />
      <circle cx="24" cy="28" r="2.9" fill="#e3202b" />
      <Shine cx={23} cy={27} rx={1} ry={0.6} o={0.8} />
    </>
  ),
}
