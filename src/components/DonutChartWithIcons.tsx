import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { useStore, selectByCategory, selectTotals } from '../store/transactions'
import { formatMoney } from '../lib/format'
import type { CategoryKind } from '../store/categories'
import { CategoryIcon } from './icons/CategoryIcon'

interface Props {
  kind: CategoryKind
}

/**
 * Диаграмма в стиле Monefy: круг с сегментами, вокруг — иконки категорий
 * с процентами под ними. Каждую иконку соединяет с центром сегмента
 * тонкая кривая её цвета (curved leader line).
 *
 * Иконки разносятся по углу = середине сегмента, на радиусе ICON_R.
 * Если процентов очень мало (<3%) — иконка всё равно отображается.
 */
export function DonutChartWithIcons({ kind }: Props) {
  const categories = useStore((s) => selectByCategory(s, kind))
  const totals = useStore(selectTotals)
  const currency = useStore((s) => s.currency)

  const total = kind === 'income' ? totals.income : totals.expense

  // Geometry
  const SIZE = 300
  const STROKE = 28
  const CHART_R = 96             // радиус центра кольца
  const RING_OUTER = CHART_R + STROKE / 2
  const LEADER_END = CHART_R + STROKE / 2 + 6
  const ICON_R = CHART_R + 56    // радиус, где живут иконки
  const ICON_SIZE = 34

  const cx = SIZE / 2
  const cy = SIZE / 2

  const segments = useMemo(() => {
    const CIRC = 2 * Math.PI * CHART_R
    let offset = 0
    return categories.map((c) => {
      const length = (c.pct / 100) * CIRC
      const midAngleDeg = ((offset + length / 2) / CIRC) * 360 - 90 // 12 o'clock = 0
      const midAngleRad = (midAngleDeg * Math.PI) / 180
      const seg = {
        ...c,
        length,
        offset,
        dashGap: CIRC - length,
        midAngleRad,
        midAngleDeg,
      }
      offset += length
      return seg
    })
  }, [categories])

  if (categories.length === 0) {
    return (
      <div className="flex flex-col items-center pt-4">
        <div className="relative flex h-[260px] w-[260px] items-center justify-center rounded-full bg-surface-sunken/60 dark:bg-surface-sunken">
          <span className="text-sm text-ink-subtle">Нет данных</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center pt-2">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="overflow-visible">
          {/* Leader lines — рисуются ПОД кольцом, чтобы кольцо их перекрывало изнутри */}
          {segments.map((s) => {
            const x1 = cx + Math.cos(s.midAngleRad) * LEADER_END
            const y1 = cy + Math.sin(s.midAngleRad) * LEADER_END
            const x2 = cx + Math.cos(s.midAngleRad) * (ICON_R - ICON_SIZE / 2 - 2)
            const y2 = cy + Math.sin(s.midAngleRad) * (ICON_R - ICON_SIZE / 2 - 2)
            // Контрольная точка слегка смещена к центру — даёт мягкую кривую
            const mx = (x1 + x2) / 2
            const my = (y1 + y2) / 2
            const nudge = 6
            const nx = mx - Math.sin(s.midAngleRad) * nudge
            const ny = my + Math.cos(s.midAngleRad) * nudge
            return (
              <motion.path
                key={s.categoryId + '-leader'}
                d={`M ${x1} ${y1} Q ${nx} ${ny} ${x2} ${y2}`}
                fill="none"
                stroke={s.color}
                strokeWidth={1.25}
                strokeLinecap="round"
                opacity={0.55}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 0.55 }}
                transition={{ duration: 0.5, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
              />
            )
          })}

          {/* Track — фон кольца */}
          <circle
            cx={cx}
            cy={cy}
            r={CHART_R}
            fill="none"
            className="stroke-surface-sunken"
            strokeWidth={STROKE}
          />

          {/* Segments, rotated -90 чтобы старт был сверху */}
          <g transform={`rotate(-90 ${cx} ${cy})`}>
            {segments.map((s, i) => (
              <motion.circle
                key={s.categoryId + '-seg'}
                cx={cx}
                cy={cy}
                r={CHART_R}
                fill="none"
                stroke={s.color}
                strokeWidth={STROKE}
                strokeLinecap="butt"
                initial={{ strokeDasharray: `0 ${2 * Math.PI * CHART_R}`, strokeDashoffset: 0 }}
                animate={{
                  strokeDasharray: `${s.length} ${s.dashGap}`,
                  strokeDashoffset: -s.offset,
                }}
                transition={{ duration: 0.7, delay: 0.05 + i * 0.04, ease: [0.16, 1, 0.3, 1] }}
              />
            ))}
          </g>
        </svg>

        {/* Иконки + проценты — отдельным слоем HTML для красивого текста */}
        {segments.map((s, i) => {
          const x = cx + Math.cos(s.midAngleRad) * ICON_R
          const y = cy + Math.sin(s.midAngleRad) * ICON_R
          return (
            <motion.div
              key={s.categoryId + '-icon'}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: 0.4 + i * 0.03, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
              style={{ left: x, top: y }}
            >
              <div
                className="flex items-center justify-center rounded-full shadow-soft ring-2 ring-surface-raised dark:ring-surface-raised"
                style={{
                  width: ICON_SIZE,
                  height: ICON_SIZE,
                  background: s.color + '22',
                  color: s.color,
                }}
              >
                <CategoryIcon id={s.icon} size={Math.round(ICON_SIZE * 0.6)} />
              </div>
              <span className="tabular mt-0.5 text-[10px] font-bold text-ink">
                {s.pct >= 1 ? `${s.pct.toFixed(0)}%` : '<1%'}
              </span>
            </motion.div>
          )
        })}

        {/* Center label */}
        <div
          className="absolute flex flex-col items-center justify-center text-center"
          style={{
            inset: 0,
            margin: 'auto',
            width: CHART_R * 2 - STROKE,
            height: CHART_R * 2 - STROKE,
          }}
        >
          <span className="text-[10px] font-semibold uppercase tracking-widest text-ink-subtle">
            {kind === 'income' ? 'Доходы' : 'Расходы'}
          </span>
          <span className="mt-1 text-xl font-bold tracking-tight tabular text-ink">
            {formatMoney(total, currency)}
          </span>
          <span className="mt-0.5 text-[10px] text-ink-muted">
            {categories.length} {pluralCats(categories.length)}
          </span>
        </div>

        {/* Внешний радиус — ограничитель для overflow-visible на мобилках */}
        <div
          aria-hidden
          className="pointer-events-none absolute"
          style={{ inset: -RING_OUTER * 0, width: 0, height: 0 }}
        />
      </div>
    </div>
  )
}

function pluralCats(n: number) {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'категория'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'категории'
  return 'категорий'
}
