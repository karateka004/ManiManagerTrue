import { useMemo } from 'react'
import { useStore, selectByCategoryAccount, selectAccountTotals, selectAnalyticsCurrency } from '../store/transactions'
import { AnimatedMoney } from './ui/Odometer'
import { useT, useCatName, categoriesWord } from '../lib/i18n'
import type { CategoryKind } from '../store/categories'

interface Props {
  kind: CategoryKind
}

export function DonutChart({ kind }: Props) {
  const categories = useStore((s) => selectByCategoryAccount(s, kind))
  const totals = useStore(selectAccountTotals)
  const currency = useStore(selectAnalyticsCurrency)
  const t = useT()
  const catName = useCatName()
  const lang = useStore((s) => s.lang)

  const total = kind === 'income' ? totals.income : totals.expense
  const SIZE = 240
  const STROKE = 32
  const RADIUS = (SIZE - STROKE) / 2
  const CIRC = 2 * Math.PI * RADIUS

  const segments = useMemo(() => {
    let offset = 0
    return categories.map((c) => {
      const length = (c.pct / 100) * CIRC
      const seg = { ...c, length, offset, dashGap: CIRC - length }
      offset += length
      return seg
    })
  }, [categories, CIRC])

  return (
    <div className="flex flex-col items-center pt-4">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} className="-rotate-90 text-surface-sunken">
          {/* Track */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE}
          />
          {/* Segments */}
          {segments.map((s, i) => (
            <circle
              key={s.categoryId}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke={s.color}
              strokeWidth={STROKE}
              strokeLinecap="butt"
              // Итоговая дуга — атрибутами (сразу на месте), рост — CSS (.donut-seg).
              // Раньше framer начинал с пустой дуги: при остановленном rAF кольцо
              // оставалось пустым.
              strokeDasharray={`${s.length} ${s.dashGap}`}
              strokeDashoffset={-s.offset}
              className="donut-seg"
              style={{ '--circ': CIRC, '--d': 40 + Math.min(i, 8) * 40 } as React.CSSProperties}
            />
          ))}
        </svg>

        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="caption text-ink-subtle">
            {kind === 'income' ? t('common.income') : t('common.expense')}
          </span>
          <span className="mt-1 text-display-md text-ink"><AnimatedMoney value={total} currency={currency} /></span>
          <span className="mt-1 text-xs text-ink-muted">{categories.length} {categoriesWord(lang, categories.length)}</span>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-6 grid w-full grid-cols-2 gap-2 px-4">
        {categories.slice(0, 8).map((c) => (
          <div key={c.categoryId} className="flex items-center gap-2 text-sm">
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: c.color }} />
            <span className="truncate text-ink">{catName(c.categoryId, c.name)}</span>
            <span className="ml-auto tabular text-ink-muted">{c.pct.toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
