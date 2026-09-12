import { useMemo } from 'react'
import { m } from 'framer-motion'
import { useStore, selectByCategoryAccount, selectAccountTotals, selectAnalyticsCurrency } from '../store/transactions'
import { formatMoney } from '../lib/format'
import { useT, useCatName, categoriesWord } from '../lib/i18n'
import type { CategoryKind } from '../store/categories'
import { CategoryIcon } from './icons/CategoryIcon'

interface Props {
  kind: CategoryKind
}

/**
 * Кольцо категорий + легенда-чипы (стиль «icons»).
 *
 * Кольцо — ЧИСТОЕ (track + сегменты + сумма в центре), БЕЗ иконок на ободке.
 * Иконок вокруг кольца больше нет НАМЕРЕННО: на узких экранах (320px) 11 иконок
 * вокруг либо налезали на ободок, либо вылезали за край — неразрешимый конфликт.
 * Категории показываем легендой-чипами ПОД кольцом (тинт-иконка её цвета +
 * название + сумма + %); цвет чипа = цвет дольки кольца. Вся раскладка категорий —
 * обычный поток (grid), поэтому наезжать на кольцо и вылезать за экран нечему.
 */
export function DonutChartWithIcons({ kind }: Props) {
  const categories = useStore((s) => selectByCategoryAccount(s, kind))
  const totals = useStore(selectAccountTotals)
  const currency = useStore(selectAnalyticsCurrency)
  const t = useT()
  const catName = useCatName()
  const lang = useStore((s) => s.lang)

  const total = kind === 'income' ? totals.income : totals.expense

  const SIZE = 220
  const STROKE = 30
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

  if (categories.length === 0) {
    return (
      <div className="flex flex-col items-center pt-4">
        <div className="relative flex h-[220px] w-[220px] items-center justify-center rounded-full bg-surface-sunken/60 dark:bg-surface-sunken">
          <span className="text-sm text-ink-subtle">{t('chart.no_data')}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center pt-2">
      {/* Кольцо — целиком внутри своего бокса, без overflow-visible */}
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} className="-rotate-90 text-surface-sunken">
          {/* Track — фон кольца */}
          <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="currentColor" strokeWidth={STROKE} />
          {/* Сегменты (отрисовка анимируется — декоративно) */}
          {segments.map((s, i) => (
            <m.circle
              key={s.categoryId}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke={s.color}
              strokeWidth={STROKE}
              strokeLinecap="butt"
              initial={{ strokeDasharray: `0 ${CIRC}`, strokeDashoffset: 0 }}
              animate={{ strokeDasharray: `${s.length} ${s.dashGap}`, strokeDashoffset: -s.offset }}
              transition={{ duration: 0.7, delay: 0.05 + i * 0.04, ease: [0.16, 1, 0.3, 1] }}
            />
          ))}
        </svg>

        {/* Сумма в центре */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-ink-subtle">
            {kind === 'income' ? t('common.income') : t('common.expense')}
          </span>
          <span className="mt-1 text-xl font-bold tracking-tight tabular text-ink">{formatMoney(total, currency)}</span>
          <span className="mt-0.5 text-[10px] text-ink-muted">
            {categories.length} {categoriesWord(lang, categories.length)}
          </span>
        </div>
      </div>

      {/* Легенда-чипы — это и есть «легенда» (связь с кольцом по цвету тинта) */}
      <div className="mt-6 grid w-full grid-cols-2 gap-2 px-4">
        {categories.map((c) => (
          <div key={c.categoryId} className="flex items-center gap-2.5 rounded-2xl bg-surface-sunken/40 px-2.5 py-2">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
              style={{ background: c.color + '22', color: c.color }}
            >
              <CategoryIcon id={c.icon} size={17} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-ink">{catName(c.categoryId, c.name)}</span>
              <span className="block truncate text-[11px] tabular text-ink-subtle">
                {formatMoney(c.amount, c.currency)}
              </span>
            </span>
            <span className="shrink-0 tabular text-xs font-bold text-ink-muted">
              {c.pct >= 1 ? `${c.pct.toFixed(0)}%` : '<1%'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
