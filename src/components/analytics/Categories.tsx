import { memo, useDeferredValue, useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useStore } from '../../store/transactions'
import { selectOverview } from '../../store/analytics'
import type { CatDelta } from '../../lib/overview'
import { formatMoney } from '../../lib/format'
import { categoriesWord, useCatName } from '../../lib/i18n'
import { hapticSelect, hapticTap } from '../../lib/telegram'
import { MASK } from '../../lib/clarity'
import type { Currency } from '../../lib/currencies'
import { CategoryIcon } from '../icons/CategoryIcon'
import { GlassSeg, Widget } from './Glass'
import { useAnT } from './text'

/** Сколько строк видно сразу; остальные — под «Все категории». */
const SHOWN = 5
const SIZE = 156
const STROKE = 18
const R = (SIZE - STROKE) / 2
const CIRC = 2 * Math.PI * R
/** Зазор между дольками кольца, px по окружности. */
const GAP = 3

type Kind = 'expense' | 'income'

/**
 * Категории: кольцо (как «Хранилище» в Telegram) и список с долей и
 * изменением. Изменение у неполного периода — к тому же дню прошлого:
 * «−46%» в середине месяца больше не значит «экономия». Строка ведёт в
 * карточку категории.
 */
export const CategoriesWidget = memo(function CategoriesWidget({ onPick }: { onPick: (categoryId: string) => void }) {
  // Ниже первого экрана: при смене периода сначала обновляется видимое
  // (герой, показатели, подсказки), этот виджет — следующей задачей.
  const o = useDeferredValue(useStore(selectOverview))
  const lang = useStore((s) => s.lang)
  const t = useAnT()
  const catName = useCatName()
  const [kind, setKind] = useState<Kind>('expense')
  const [all, setAll] = useState(false)

  const list = kind === 'expense' ? o.categories : o.incomeCategories
  const total = kind === 'expense' ? o.spent : o.income
  const rows = all ? list : list.slice(0, SHOWN)

  // Дольки: длина по доле, между ними — зазор; крошечные — не тоньше видимого.
  const arcs = useMemo(() => {
    let offset = 0
    const gap = list.length > 1 ? GAP : 0
    return list.map((c) => {
      const len = Math.max(1.5, (c.amount / Math.max(total, 1)) * CIRC - gap)
      const arc = { id: c.categoryId, color: c.color, len, offset }
      offset += len + gap
      return arc
    })
  }, [list, total])

  return (
    <Widget
      title={t('w.categories')}
      delay={120}
      action={
        <GlassSeg
          value={kind}
          onChange={(k) => {
            setKind(k)
            setAll(false)
          }}
          options={[
            { id: 'expense', label: t('w.expense') },
            { id: 'income', label: t('w.income') },
          ]}
        />
      }
      bodyClass="px-4 pb-2 pt-4"
    >
      {list.length === 0 ? (
        <div className="py-8 text-center text-[13px] text-ink-subtle">{t('w.cat_empty')}</div>
      ) : (
        <>
          <div className="relative mx-auto" style={{ width: SIZE, height: SIZE }}>
            <svg width={SIZE} height={SIZE} className="-rotate-90" aria-hidden key={kind}>
              <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="currentColor" strokeWidth={STROKE} className="text-ink/[.06]" />
              {arcs.map((a, i) => (
                <circle
                  key={a.id}
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={R}
                  fill="none"
                  stroke={a.color}
                  strokeWidth={STROKE}
                  strokeDasharray={`${a.len.toFixed(2)} ${(CIRC - a.len).toFixed(2)}`}
                  strokeDashoffset={(-a.offset).toFixed(2)}
                  className="an-sweep"
                  style={{ '--len': a.len.toFixed(2), animationDelay: `${Math.min(i, 8) * 45}ms` } as React.CSSProperties}
                />
              ))}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="caption-sm text-ink-subtle">{kind === 'expense' ? t('w.expense') : t('w.income')}</span>
              <span className="mt-0.5 text-[19px] font-extrabold tracking-tight text-ink tabular" {...MASK}>
                {formatMoney(Math.round(total), o.currency, { compact: total >= 1_000_000 })}
              </span>
              <span className="text-[11px] text-ink-subtle">
                {list.length} {categoriesWord(lang, list.length)}
              </span>
            </div>
          </div>

          <div className="mt-3">
            {rows.map((c, i) => (
              <CatRow
                key={c.categoryId}
                c={c}
                first={i === 0}
                name={catName(c.categoryId, c.name)}
                showDelta={kind === 'expense'}
                currency={o.currency}
                onPick={onPick}
              />
            ))}
          </div>

          {list.length > SHOWN && (
            <button
              type="button"
              onClick={() => {
                hapticSelect()
                setAll((v) => !v)
              }}
              className="press-soft flex w-full items-center justify-center gap-1 border-t border-hairline py-3 text-[13px] font-bold text-ink-muted"
            >
              {all ? t('w.less') : t('w.all', { n: list.length })}
              <ChevronDown size={15} strokeWidth={2.6} className={`transition-transform duration-300 ${all ? 'rotate-180' : ''}`} />
            </button>
          )}
          {kind === 'expense' && !o.complete && o.prevSpent !== null && list.some((c) => c.deltaPct !== null) && (
            <div className="pb-2 pt-1 text-center text-[11px] text-ink-subtle">{t('w.cat_note')}</div>
          )}
        </>
      )}
    </Widget>
  )
})

function CatRow({
  c,
  first,
  name,
  showDelta,
  currency,
  onPick,
}: {
  c: CatDelta
  first: boolean
  name: string
  showDelta: boolean
  currency: Currency
  onPick: (id: string) => void
}) {
  const t = useAnT()
  const d = c.deltaPct === null ? null : Math.round(c.deltaPct)
  return (
    <button
      type="button"
      onClick={() => {
        hapticTap()
        onPick(c.categoryId)
      }}
      className={`flex w-full items-center gap-3 py-2.5 text-left active:opacity-70 ${first ? '' : 'border-t border-hairline'}`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: c.color + '26', color: c.color }}>
        <CategoryIcon id={c.icon} size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[14px] font-bold text-ink">{name}</span>
          <span className="shrink-0 text-[14px] font-extrabold tabular text-ink" {...MASK}>
            {formatMoney(Math.round(c.amount), currency)}
          </span>
        </span>
        <span className="mt-1.5 flex items-center gap-2">
          <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-ink/[.06]">
            <span className="block h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, c.pct))}%`, background: c.color }} />
          </span>
          <span className="w-9 shrink-0 text-right text-[11.5px] font-bold tabular text-ink-subtle">{c.pct >= 1 ? `${Math.round(c.pct)}%` : '<1%'}</span>
          {showDelta && d !== null && (
            <span
              className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10.5px] font-extrabold ${
                Math.abs(d) < 5
                  ? 'bg-ink/[.06] text-ink-subtle'
                  : d > 0
                    ? 'bg-expense/15 text-expense-deep dark:text-expense-soft'
                    : 'bg-income/15 text-income-deep dark:text-income-light'
              }`}
            >
              {Math.abs(d) < 5 ? t('w.usual') : `${d > 0 ? '+' : '−'}${Math.abs(d)}%`}
            </span>
          )}
        </span>
      </span>
    </button>
  )
}
