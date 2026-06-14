import { useMemo } from 'react'
import { m } from 'framer-motion'
import { useStore, selectByCategoryAccount, selectAccountTotals, selectAnalyticsCurrency } from '../store/transactions'
import { formatMoney } from '../lib/format'
import { useT, categoriesWord } from '../lib/i18n'
import type { CategoryKind } from '../store/categories'
import { CategoryIcon } from './icons/CategoryIcon'

interface Props {
  kind: CategoryKind
}

/**
 * Диаграмма в стиле Monefy: круг с сегментами, вокруг — иконки категорий
 * с процентами под ними. Иконки распределены РАВНОМЕРНО по кругу на
 * фиксированном радиусе ICON_R (угловой шаг 360/N): никогда не налезают
 * друг на друга и не вылезают за край даже на узких экранах. Связь иконки
 * с долькой — по цвету чипа (тон = цвет сегмента). Соединительных линий
 * (leader lines) нет специально: при равномерных иконках и пропорциональных
 * дольках они пересекались «паутиной» в центре.
 */
export function DonutChartWithIcons({ kind }: Props) {
  const categories = useStore((s) => selectByCategoryAccount(s, kind))
  const totals = useStore(selectAccountTotals)
  const currency = useStore(selectAnalyticsCurrency)
  const t = useT()
  const lang = useStore((s) => s.lang)

  const total = kind === 'income' ? totals.income : totals.expense

  // Geometry
  const SIZE = 300
  const STROKE = 28
  const CHART_R = 96             // радиус центра кольца
  const ICON_R = CHART_R + 26    // радиус иконок: ближе к кольцу, чтобы влезали с запасом на 320px
  const ICON_SIZE = 34

  const cx = SIZE / 2
  const cy = SIZE / 2

  const segments = useMemo(() => {
    const CIRC = 2 * Math.PI * CHART_R
    let offset = 0
    return categories.map((c) => {
      const length = (c.pct / 100) * CIRC
      const seg = {
        ...c,
        length,
        offset,
        dashGap: CIRC - length,
      }
      offset += length
      return seg
    })
  }, [categories])

  /**
   * Иконки распределяем РАВНОМЕРНО по всему кольцу на ФИКСИРОВАННОМ радиусе:
   * угловой шаг 360/n гарантирует, что кружки никогда не налезают друг на друга,
   * а постоянный радиус — что иконки не вылезают за край даже на узких экранах
   * (раньше радиальная «ступенька» +28px выталкивала иконку за вьюпорт). Порядок
   * иконок = порядок сегментов. Старт каждой иконки — с 12 часов (-90°).
   */
  const iconAnglesRad = useMemo(() => {
    const n = segments.length
    return segments.map((_, i) => ((-90 + (i * 360) / n) * Math.PI) / 180)
  }, [segments])

  if (categories.length === 0) {
    return (
      <div className="flex flex-col items-center pt-4">
        <div className="relative flex h-[260px] w-[260px] items-center justify-center rounded-full bg-surface-sunken/60 dark:bg-surface-sunken">
          <span className="text-sm text-ink-subtle">{t('chart.no_data')}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center pt-2">
      {/* marginBottom резервирует место под иконку+процент, выступающие ниже SVG-бокса */}
      <div className="relative" style={{ width: SIZE, height: SIZE, marginBottom: 34 }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="overflow-visible">
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
              <m.circle
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
          const iconAngle = iconAnglesRad[i]
          const iconR = ICON_R
          const x = cx + Math.cos(iconAngle) * iconR
          const y = cy + Math.sin(iconAngle) * iconR
          return (
            <m.div
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
            </m.div>
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
            {kind === 'income' ? t('common.income') : t('common.expense')}
          </span>
          <span className="mt-1 text-xl font-bold tracking-tight tabular text-ink">
            {formatMoney(total, currency)}
          </span>
          <span className="mt-0.5 text-[10px] text-ink-muted">
            {categories.length} {categoriesWord(lang, categories.length)}
          </span>
        </div>
      </div>
    </div>
  )
}
