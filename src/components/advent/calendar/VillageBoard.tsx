import type { CSSProperties, ReactNode } from 'react'
import { Snowflake } from 'lucide-react'
import { useStore } from '../../../store/transactions'
import { useTabActive } from '../../../lib/tabActive'
import { Keepsake } from '../Keepsake'
import { keepsakeOf } from '../keepsakes'
import { weekGrid, type BoardProps } from './types'

/**
 * Вариант «Зимний городок»: ночной дом под снегом, окошки — его окна, по
 * дням недели, как в настоящем календаре (пн — слева). Ставни распахиваются,
 * окно загорается тёплым светом, в нём висит игрушка дня. Дверь в пустых
 * клетках последней недели, в первой — окно с котом. Над крышей — луна,
 * дым из трубы и сани, раз за показ пролетающие по небу.
 *
 * Холст 320×356, окна — кнопки поверх SVG в процентах; дым и сани — элементы
 * с transform/opacity (композитор), не SVG.
 */
const W = 320
const H = 356
const CW = 36
const GAP = 5
const X0 = (W - (7 * CW + 6 * GAP)) / 2
const Y0 = 124

const cell = (col: number, row: number) => ({ x: X0 + col * (CW + GAP), y: Y0 + row * (CW + GAP) })

const WEEK = {
  ru: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
  en: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
}

const SHUTTER = ['#1f5a3e', '#7a2430', '#244a7a']

const pct = (x: number, y: number): CSSProperties => ({ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` })

export function VillageBoard({ year, states, selected, opening, doorRef, onDoor, label }: BoardProps) {
  const lang = useStore((s) => s.lang)
  const active = useTabActive()
  const grid = weekGrid(year)
  const lastRow = grid[30].row
  const firstCol = grid[0].col
  const tail = 6 - grid[30].col // пустые клетки после 31-го
  const door = tail >= 2 ? cell(grid[30].col + 1, lastRow) : null
  const doorW = tail >= 2 ? tail * (CW + GAP) - GAP : 0
  const rowsTotal = lastRow + 1
  const wallBottom = Y0 + rowsTotal * (CW + GAP) + 4

  return (
    <div className="adv-board adv-village-board" data-advent-board="village" style={{ aspectRatio: `${W} / ${H}` }}>
      <svg className="vb-art" viewBox={`0 0 ${W} ${H}`} aria-hidden>
        <defs>
          <radialGradient id="vbMoon" cx="40%" cy="38%" r="70%">
            <stop offset="0" stopColor="#fffbea" />
            <stop offset="1" stopColor="#f3e2a6" />
          </radialGradient>
          <radialGradient id="vbMoonGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#fff2c0" stopOpacity=".42" />
            <stop offset="1" stopColor="#fff2c0" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="vbWall" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#323c63" />
            <stop offset="1" stopColor="#1f2644" />
          </linearGradient>
          <linearGradient id="vbRoof" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#c9dcef" />
          </linearGradient>
          <linearGradient id="vbGround" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f4f9ff" />
            <stop offset="1" stopColor="#c3d6ea" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="vbLamp" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#ffd98a" stopOpacity=".7" />
            <stop offset="1" stopColor="#ffd98a" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Небо: звёзды и луна. */}
        {[
          [18, 18, 1.2],
          [48, 40, 0.9],
          [76, 14, 1.4],
          [104, 52, 0.8],
          [214, 18, 1],
          [246, 54, 0.8],
          [306, 66, 1.1],
          [26, 74, 0.8],
          [130, 22, 0.9],
        ].map(([x, y, r]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="#fff8de" opacity=".85" />
        ))}
        <circle cx="282" cy="30" r="34" fill="url(#vbMoonGlow)" />
        <circle cx="282" cy="30" r="14" fill="url(#vbMoon)" />
        <circle cx="277" cy="26" r="2.6" fill="#e7d28f" opacity=".6" />
        <circle cx="287" cy="35" r="1.8" fill="#e7d28f" opacity=".55" />

        {/* Ёлочки по бокам. */}
        <Fir x={6} y={wallBottom - 70} s={0.9} />
        <Fir x={292} y={wallBottom - 64} s={0.8} />

        {/* Стены и окна-ниши. */}
        <rect x="9" y="96" width="302" height={wallBottom - 96} fill="url(#vbWall)" />
        <path d={`M9 ${wallBottom - 6} H 311`} stroke="#141a30" strokeWidth="3" />
        {Array.from({ length: rowsTotal - 1 }, (_, r) => (
          <path key={r} d={`M9 ${Y0 + (r + 1) * (CW + GAP) - GAP / 2} H 311`} stroke="#283153" strokeWidth="1" />
        ))}
        {WEEK[lang === 'en' ? 'en' : 'ru'].map((d, i) => (
          <text
            key={d}
            x={X0 + i * (CW + GAP) + CW / 2}
            y={Y0 - 7}
            textAnchor="middle"
            fontSize="7.5"
            fontWeight="800"
            fill={i >= 5 ? '#ffb3a0' : '#c3cfee'}
            opacity=".8"
            fontFamily="system-ui, sans-serif"
          >
            {d}
          </text>
        ))}

        {/* Пустые клетки первой недели — окна с котом и свечой. */}
        {Array.from({ length: firstCol }, (_, c) => {
          const p = cell(c, 0)
          return <CatWindow key={c} x={p.x} y={p.y} cat={c === firstCol - 1} />
        })}

        {/* Дверь — в пустых клетках последней недели. */}
        {door && <Door x={door.x} y={door.y} w={doorW} />}

        {/* Труба (за крышей), крыша под снегом, сосульки. */}
        <rect x="222" y="40" width="22" height="44" fill="#7a3b31" />
        <path d="M222 50 H 244 M222 60 H 244 M222 70 H 244 M233 40 V 50 M228 50 V 60 M239 60 V 70" stroke="#5c2a23" strokeWidth="1" />
        <rect x="219" y="36" width="28" height="7" rx="3.5" fill="#f4f9ff" />
        <path d="M0 100 L 160 26 L 320 100 Z" fill="#4a2a33" />
        <path d="M-2 98 L 160 24 L 322 98 L 314 103 C 300 99, 290 105, 276 101 C 262 97, 250 105, 236 101 C 222 97, 210 104, 196 100 C 182 97, 170 104, 156 100 C 142 97, 130 104, 116 100 C 102 97, 90 104, 76 100 C 62 97, 50 104, 36 100 C 22 97, 12 104, 4 102 Z" fill="url(#vbRoof)" />
        <path d="M30 88 L 160 30 L 290 88" stroke="#fff" strokeOpacity=".7" strokeWidth="1.2" fill="none" />
        {Array.from({ length: 19 }, (_, i) => {
          const x = 10 + i * 16.6 + (i % 3) * 1.5
          const len = 5 + ((i * 7) % 5) * 1.6
          return <path key={i} d={`M${x - 2.2} 101.5 L ${x} ${101.5 + len} L ${x + 2.2} 101.5 Z`} fill="#dff1fb" opacity=".92" />
        })}
        {/* Круглое окно в мансарде. */}
        <circle cx="160" cy="70" r="10.5" fill="#3a2a2a" />
        <circle cx="160" cy="70" r="8.4" fill="#ffcf5a" />
        <circle cx="160" cy="70" r="8.4" fill="url(#vbLamp)" />
        <path d="M160 61.6 V 78.4 M151.6 70 H 168.4" stroke="#5a3a1a" strokeWidth="1.4" />

        {/* Снег перед домом, тропинка к двери, снеговичок. */}
        <path d={`M0 ${H} L0 ${wallBottom + 2} C 60 ${wallBottom - 4}, 120 ${wallBottom + 4}, 170 ${wallBottom} C 220 ${wallBottom - 4}, 270 ${wallBottom + 6}, 320 ${wallBottom} L 320 ${H} Z`} fill="url(#vbGround)" />
        {door && (
          <path
            d={`M${door.x + doorW / 2 - 9} ${wallBottom + 2} C ${door.x + doorW / 2 - 14} ${H - 8}, ${door.x + doorW / 2 + 10} ${H - 6}, ${door.x + doorW / 2 + 22} ${H}`}
            stroke="#b8cde2"
            strokeWidth="9"
            fill="none"
            opacity=".55"
            strokeLinecap="round"
          />
        )}
        <MiniSnowman x={28} y={wallBottom - 14} />
      </svg>

      {/* Дым из трубы и сани по небу — только на открытой вкладке: сани
          пролетают при каждом показе, дым на скрытой не нужен. */}
      {active && (
        <>
          <span className="vb-smoke" style={pct(233, 34)} aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <span className="vb-sleigh" aria-hidden>
            <Sleigh />
          </span>
        </>
      )}

      {states.map((state, i) => {
        const day = i + 1
        const p = cell(grid[i].col, grid[i].row)
        const ks = keepsakeOf(day)
        const cls = [
          'adv-door',
          'vb-win',
          `is-${state}`,
          selected === day ? 'is-sel' : '',
          opening === day ? 'is-opening' : '',
        ].join(' ')
        const paint = SHUTTER[(grid[i].col + grid[i].row) % SHUTTER.length]
        let inside: ReactNode = null
        if (state === 'open' && ks) inside = <Keepsake shape={ks.shape} size={40} className="vb-ks" />
        return (
          <button
            key={day}
            ref={doorRef(day)}
            type="button"
            data-day={day}
            data-state={state}
            onClick={() => onDoor(day)}
            aria-label={label(day, state)}
            className={cls}
            style={{ ...pct(p.x + CW / 2, p.y + CW / 2), '--paint': paint } as CSSProperties}
          >
            <span className="vb-in">
              <span className="vb-curtain" />
              {inside}
            </span>
            <span className="vb-sh vb-sh-l" />
            <span className="vb-sh vb-sh-r" />
            <span className="vb-num">{day}</span>
            {state === 'missed' && <Snowflake className="vb-frost" size={11} strokeWidth={2.8} />}
            <span className="vb-sill" />
            {state === 'today' && <span className="vb-wreath" aria-hidden />}
          </button>
        )
      })}
    </div>
  )
}

/** Ёлочка у стены: три яруса с белыми краями. */
function Fir({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x="-3" y="62" width="6" height="10" fill="#4a2c18" />
      <path d="M0 0 L 18 30 L -18 30 Z M0 16 L 24 48 L -24 48 Z M0 32 L 28 66 L -28 66 Z" fill="#17583a" />
      <path d="M-18 30 C -10 27, 10 27, 18 30 M-24 48 C -12 45, 12 45, 24 48 M-28 66 C -14 63, 14 63, 28 66" stroke="#f4f9ff" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    </g>
  )
}

/** Окно в пустой клетке первой недели: свеча или спящий кот на подоконнике. */
function CatWindow({ x, y, cat }: { x: number; y: number; cat: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="0" y="0" width={CW} height={CW} rx="3" fill="#2a1c18" />
      <rect x="3" y="3" width={CW - 6} height={CW - 6} rx="2" fill="#ffc861" />
      <rect x="3" y="3" width={CW - 6} height={CW - 6} rx="2" fill="url(#vbLamp)" />
      <path d={`M${CW / 2} 3 V ${CW - 3} M3 ${CW / 2 - 2} H ${CW - 3}`} stroke="#6b4423" strokeWidth="1.6" />
      {cat ? (
        <g transform="translate(9 19)">
          <path d="M0 13 C 0 5, 6 1, 12 2 C 18 3, 21 8, 20 13 Z" fill="#2b2f3a" />
          <circle cx="4" cy="6" r="4" fill="#2b2f3a" />
          <path d="M1.2 3.4 L 1.6 -.6 L 3.8 2.4 Z M5.2 2.4 L 7.2 -.6 L 7.6 3.4 Z" fill="#2b2f3a" />
          <path d="M20 12 C 25 11, 25 6, 22 5" stroke="#2b2f3a" strokeWidth="2" fill="none" strokeLinecap="round" />
        </g>
      ) : (
        <g transform="translate(15 15)">
          <rect x="0" y="6" width="6" height="12" rx="1" fill="#fffaf0" />
          <path d="M3 0 C 5 3, 5 5, 3 6.4 C 1 5, 1 3, 3 0 Z" fill="#ff8a1f" />
        </g>
      )}
      <rect x="-2" y={CW - 3} width={CW + 4} height="5" rx="2.5" fill="#f4f9ff" />
    </g>
  )
}

/** Дверь с венком и фонарём; к 1 января за ней — главный подарок. */
function Door({ x, y, w }: { x: number; y: number; w: number }) {
  const dw = Math.min(w - 16, 44)
  const dx = x + (w - dw) / 2 + 8
  return (
    <g>
      <rect x={x} y={y - 2} width={w} height={CW + 8} fill="#1f2644" />
      {/* Фонарь на стене. */}
      <circle cx={x + 12} cy={y + 10} r="13" fill="url(#vbLamp)" />
      <rect x={x + 8} y={y + 5} width="8" height="11" rx="1.5" fill="#ffd257" stroke="#3a2a1a" strokeWidth="1.2" />
      <path d={`M${x + 8} ${y + 4} H ${x + 16} L ${x + 12} ${y + 1} Z`} fill="#3a2a1a" />
      {/* Дверь. */}
      <rect x={dx} y={y} width={dw} height={CW + 6} rx="2" fill="#6b2b23" />
      <path d={`M${dx + dw / 2} ${y} V ${y + CW + 6}`} stroke="#4e1d17" strokeWidth="1.4" />
      <rect x={dx + 4} y={y + 5} width={dw / 2 - 7} height="12" rx="1.5" fill="#5a221b" />
      <rect x={dx + dw / 2 + 3} y={y + 5} width={dw / 2 - 7} height="12" rx="1.5" fill="#5a221b" />
      <circle cx={dx + dw / 2 - 3.5} cy={y + 24} r="1.4" fill="#f2c037" />
      <circle cx={dx + dw / 2 + 3.5} cy={y + 24} r="1.4" fill="#f2c037" />
      {/* Венок. */}
      <circle cx={dx + dw / 2} cy={y + 12} r="7.6" fill="none" stroke="#1f7a45" strokeWidth="4" />
      <circle cx={dx + dw / 2 - 4} cy={y + 7} r="1.3" fill="#e2414f" />
      <circle cx={dx + dw / 2 + 5} cy={y + 13} r="1.3" fill="#e2414f" />
      <circle cx={dx + dw / 2 - 3} cy={y + 18} r="1.3" fill="#e2414f" />
      <path d={`M${dx + dw / 2 - 3} ${y + 19} l3 -2.4 l3 2.4 l-3 -1 Z`} fill="#d7263d" />
      <rect x={dx - 3} y={y + CW + 5} width={dw + 6} height="4" rx="2" fill="#f4f9ff" />
    </g>
  )
}

function MiniSnowman({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="0" cy="22" rx="12" ry="3" fill="#9cb8d6" opacity=".45" />
      <circle cx="0" cy="14" r="8.5" fill="#fdfeff" />
      <circle cx="0" cy="1" r="6" fill="#fdfeff" />
      <path d="M-5.6 -3 C -5.4 -9, 5.4 -9, 5.6 -3 Z" fill="#244a7a" />
      <circle cx="-2" cy="0" r=".8" fill="#1f2329" />
      <circle cx="2" cy="0" r=".8" fill="#1f2329" />
      <path d="M0 1.6 L 5 2.8 L 0 3.4 Z" fill="#f07c1d" />
      <path d="M-5.4 5.6 C -2 7.6, 2 7.6, 5.4 5.6 L 5 8 C 2 9.6, -2 9.6, -5 8 Z" fill="#d7263d" />
    </g>
  )
}

/** Сани с оленем — силуэт по небу. */
function Sleigh() {
  return (
    <svg viewBox="0 0 120 34" width="100%" height="100%">
      <g fill="#fff4cf" opacity=".9">
        <path d="M62 22 C 70 22, 74 14, 86 14 L 96 14 C 96 20, 92 26, 82 26 L 60 26 Z" />
        <path d="M58 28 C 70 30, 92 30, 102 26" stroke="#fff4cf" strokeWidth="1.6" fill="none" />
        <circle cx="88" cy="9" r="4" />
        <path d="M84 12 L 92 12 L 93 16 L 83 16 Z" />
        <path d="M14 18 C 18 13, 28 12, 34 15 L 40 10 L 42 12 L 37 17 C 37 21, 32 23, 26 22 L 22 28 L 20 28 L 21 22 L 17 22 L 15 28 L 13 28 L 14 21 Z" />
        <path d="M38 10 L 36 4 M38 10 L 42 5 M37 7 L 34 6" stroke="#fff4cf" strokeWidth="1.2" />
        <path d="M37 17 C 46 18, 54 20, 62 22" stroke="#fff4cf" strokeWidth="1" fill="none" />
      </g>
    </svg>
  )
}
