import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { useStore, selectByCategory, selectTotals } from '../store/transactions'
import { formatMoney } from '../lib/format'
import type { CategoryKind } from '../store/categories'

interface Props {
  kind: CategoryKind
}

export function DonutChart({ kind }: Props) {
  const categories = useStore((s) => selectByCategory(s, kind))
  const totals = useStore(selectTotals)
  const currency = useStore((s) => s.currency)

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
            <motion.circle
              key={s.categoryId}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke={s.color}
              strokeWidth={STROKE}
              strokeLinecap="butt"
              initial={{ strokeDasharray: `0 ${CIRC}`, strokeDashoffset: 0 }}
              animate={{
                strokeDasharray: `${s.length} ${s.dashGap}`,
                strokeDashoffset: -s.offset,
              }}
              transition={{ duration: 0.7, delay: 0.05 + i * 0.04, ease: [0.16, 1, 0.3, 1] }}
            />
          ))}
        </svg>

        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-xs font-semibold uppercase tracking-widest text-ink-subtle">
            {kind === 'income' ? 'Доходы' : 'Расходы'}
          </span>
          <span className="mt-1 text-display-md tabular text-ink">{formatMoney(total, currency)}</span>
          <span className="mt-1 text-xs text-ink-muted">{categories.length} категорий</span>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-6 grid w-full grid-cols-2 gap-2 px-4">
        {categories.slice(0, 8).map((c) => (
          <div key={c.categoryId} className="flex items-center gap-2 text-sm">
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: c.color }} />
            <span className="truncate text-ink">{c.name}</span>
            <span className="ml-auto tabular text-ink-muted">{c.pct.toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
