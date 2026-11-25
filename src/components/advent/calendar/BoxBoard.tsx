import type { CSSProperties } from 'react'
import { Gift, Snowflake } from 'lucide-react'
import { useStore } from '../../../store/transactions'
import { Keepsake } from '../Keepsake'
import { keepsakeOf } from '../keepsakes'
import { useAdventT } from '../text'
import { weekGrid, type BoardProps } from './types'

/**
 * Вариант «Шкатулка»: бархатная коробка с золотой лентой и бантом, 31 ящичек
 * по дням недели. Крышечка с тиснёным числом откидывается вверх — внутри на
 * папиросной бумаге лежит игрушка дня. В пустых клетках последней недели —
 * отсек главного подарка, в первой — золотые медальоны.
 */
const WEEK = {
  ru: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
  en: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
}

export function BoxBoard({ year, phase, states, selected, opening, doorRef, onDoor, label }: BoardProps) {
  const lang = useStore((s) => s.lang)
  const t = useAdventT()
  const grid = weekGrid(year)
  const firstCol = grid[0].col
  const last = grid[30]
  const tail = 6 - last.col
  const finalReady = phase === 'finale'

  return (
    <div className="adv-board adv-box-board" data-advent-board="box">
      <span className="bx-frame" aria-hidden>
        {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
          <svg key={c} className={`bx-corner bx-${c}`} viewBox="0 0 24 24">
            <path d="M2 22 V 8 C 2 4.6, 4.6 2, 8 2 H 22" stroke="#e8c36a" strokeWidth="1.4" fill="none" />
            <path d="M6 22 V 10 C 6 7.8, 7.8 6, 10 6 H 22" stroke="#e8c36a" strokeOpacity=".55" strokeWidth=".9" fill="none" />
            <circle cx="6.4" cy="6.4" r="1.6" fill="#e8c36a" />
          </svg>
        ))}
      </span>
      <span className="bx-ribbon" aria-hidden />
      <svg className="bx-bow" viewBox="0 0 80 44" aria-hidden>
        <defs>
          <linearGradient id="bxBow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff0b8" />
            <stop offset=".5" stopColor="#e2ac3e" />
            <stop offset="1" stopColor="#a8761a" />
          </linearGradient>
        </defs>
        <path d="M40 20 L 30 42 L 36 40 L 39 44 Z M40 20 L 50 42 L 44 40 L 41 44 Z" fill="#c9922c" />
        <path d="M40 20 C 26 2, 6 4, 9 16 C 11 25, 28 25, 40 20 Z M40 20 C 54 2, 74 4, 71 16 C 69 25, 52 25, 40 20 Z" fill="url(#bxBow)" />
        <path d="M40 20 C 30 10, 17 9, 15 15 M40 20 C 50 10, 63 9, 65 15" stroke="#fff6d6" strokeOpacity=".7" strokeWidth="1.2" fill="none" />
        <ellipse cx="40" cy="20" rx="6.4" ry="5.6" fill="#d39a2c" />
        <ellipse cx="38.6" cy="18.4" rx="2.4" ry="1.6" fill="#fff6d6" opacity=".7" />
      </svg>

      <div className="bx-week" aria-hidden>
        {WEEK[lang === 'en' ? 'en' : 'ru'].map((d, i) => (
          <span key={d} className={i >= 5 ? 'is-we' : ''}>
            {d}
          </span>
        ))}
      </div>

      <div className="bx-grid">
        {Array.from({ length: firstCol }, (_, c) => (
          <span key={`m${c}`} className="bx-medal" style={{ gridColumn: c + 1, gridRow: 1 }} aria-hidden>
            <Snowflake size={16} strokeWidth={1.8} />
          </span>
        ))}
        {states.map((state, i) => {
          const day = i + 1
          const g = grid[i]
          const ks = keepsakeOf(day)
          const paper = (g.col + g.row) % 4
          const cls = [
            'adv-door',
            'bx-cell',
            `is-${state}`,
            selected === day ? 'is-sel' : '',
            opening === day ? 'is-opening' : '',
          ].join(' ')
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
              style={{ gridColumn: g.col + 1, gridRow: g.row + 1 } as CSSProperties}
            >
              <span className="bx-well">
                <span className="bx-tissue" />
                {state === 'open' && ks && <Keepsake shape={ks.shape} size={40} className="bx-ks" />}
              </span>
              <span className={`bx-lid paper-${paper}`}>
                <span className="bx-num">{day}</span>
                {state === 'missed' && <Snowflake className="bx-frost" size={10} strokeWidth={2.8} />}
              </span>
              {state === 'today' && <span className="bx-tag">{t('door.today')}</span>}
            </button>
          )
        })}
        {tail >= 2 && (
          <span
            className={`bx-final ${finalReady ? 'is-ready' : ''}`}
            style={{ gridColumn: `${last.col + 2} / span ${tail}`, gridRow: last.row + 1 }}
            aria-hidden
          >
            <Gift size={18} strokeWidth={2} />
            <span>{t('coll.final')}</span>
          </span>
        )}
      </div>
    </div>
  )
}
