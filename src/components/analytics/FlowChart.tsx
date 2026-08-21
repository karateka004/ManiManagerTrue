import { useMemo } from 'react'
import { useStore, selectOverview } from '../../store/transactions'
import { formatMoney } from '../../lib/format'
import { useCatName, useT } from '../../lib/i18n'
import { hapticTap } from '../../lib/telegram'

/** Высота строки категории. Лента втекает ровно в её середину, поэтому число фиксированное. */
const ROW = 46
/** Ширина колонки с лентами. */
const FLOW_W = 92
/** Спина потока — её левый край и толщина. */
const SPINE_X = 6
const SPINE_W = 7
/** Тоньше ленту не рисуем: иначе категория в один процент исчезает совсем. */
const MIN_RIBBON = 2.5

/**
 * «Поток денег»: доход делится на потраченное и остаток, а потраченное
 * растекается по категориям.
 *
 * Две точные ступени вместо одной большой диаграммы Sankey. Классическая
 * горизонтальная на 360 px нечитаема — колонки съедают всю ширину и подписи
 * некуда девать. Здесь верхняя полоса показывает деление дохода (пропорция
 * честная), а ниже спина «потрачено» веером уходит в обычные строки списка:
 * названия и суммы читаются как текст, а толщина ленты передаёт долю.
 *
 * Заменяет прежний блок «По категориям»: это он и есть, только вместо полосы
 * прогресса — лента, и вдобавок видно, сколько от дохода осталось.
 */
export function FlowChart({ onPick }: { onPick: (categoryId: string) => void }) {
  const o = useStore(selectOverview)
  const t = useT()
  const catName = useCatName()

  const rows = useMemo(() => {
    const list = o.categories.map((c) => ({
      id: c.categoryId,
      name: catName(c.categoryId, c.name),
      color: c.color,
      amount: c.amount,
      deltaPct: c.deltaPct,
    }))
    if (o.categoriesRest > 0) {
      list.push({ id: '__rest', name: t('ov.flow_rest'), color: '#8A968F', amount: o.categoriesRest, deltaPct: null })
    }
    return list
  }, [o.categories, o.categoriesRest, catName, t])

  const H = rows.length * ROW
  const spent = o.spent || 1

  // Толщины лент: доля категории от расходов, но не тоньше видимого минимума.
  const ribbons = useMemo(() => {
    let cum = 0
    return rows.map((r, i) => {
      const th = Math.max(MIN_RIBBON, (r.amount / spent) * H)
      const y0 = cum
      cum += (r.amount / spent) * H
      const targetY = i * ROW + ROW / 2
      // У строки лента сужается до высоты строки: крупная категория с честной
      // толщиной в полтораста пикселей вылезала бы за верхний край диаграммы.
      const half = Math.min(th, ROW - 12) / 2
      const x0 = SPINE_X + SPINE_W
      const x1 = FLOW_W
      const mid = (x0 + x1) / 2
      // Верхняя граница ленты идёт вперёд, нижняя — обратно; между ними заливка.
      const top = `M${x0} ${y0.toFixed(1)} C${mid} ${y0.toFixed(1)} ${mid} ${(targetY - half).toFixed(1)} ${x1} ${(targetY - half).toFixed(1)}`
      const bottom = `L${x1} ${(targetY + half).toFixed(1)} C${mid} ${(targetY + half).toFixed(1)} ${mid} ${(y0 + th).toFixed(1)} ${x0} ${(y0 + th).toFixed(1)} Z`
      return { ...r, d: top + bottom }
    })
  }, [rows, spent, H])

  const rest = Math.max(0, o.income - o.spent)
  const spentShare = o.income > 0 ? Math.min(100, (o.spent / o.income) * 100) : 100

  return (
    <div className="mx-4 rounded-3xl bg-surface-raised px-4 py-4 shadow-soft dark:shadow-soft-dark">
      {o.income > 0 && (
        <div className="mb-4">
          <div className="flex items-baseline justify-between gap-2 text-[12px]">
            <span className="font-semibold text-ink-muted">{t('ov.flow_income')}</span>
            <span className="tabular font-bold text-ink">{formatMoney(o.income, o.currency)}</span>
          </div>
          <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-surface-sunken">
            <span aria-hidden className="bg-expense" style={{ width: `${spentShare}%` }} />
            <span aria-hidden className="flex-1 bg-income" />
          </div>
          <div className="mt-1.5 flex justify-between text-[11px]">
            <span className="text-expense-deep dark:text-expense">
              {t('ov.flow_spent')} {formatMoney(o.spent, o.currency)}
            </span>
            {rest > 0 && (
              <span className="text-income-deep dark:text-brand-300">
                {t('ov.flow_rest_left')} {formatMoney(rest, o.currency)}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="flex">
        <svg
          aria-hidden
          width={FLOW_W}
          height={H}
          viewBox={`0 0 ${FLOW_W} ${H}`}
          className="shrink-0"
          style={{ height: H }}
        >
          {/* Спина — это «потрачено»: из неё и растекаются ленты */}
          <rect x={SPINE_X} y={0} width={SPINE_W} height={H} rx={3.5} className="fill-expense" />
          {ribbons.map((r) => (
            <path key={r.id} d={r.d} fill={r.color} fillOpacity={0.5} />
          ))}
        </svg>

        <div className="min-w-0 flex-1">
          {rows.map((r) => {
            const d = r.deltaPct === null ? null : Math.round(r.deltaPct)
            return (
              <button
                key={r.id}
                // «Прочее» — свёрнутый хвост, за ним нет одной категории
                onClick={r.id === '__rest' ? undefined : () => { hapticTap(); onPick(r.id) }}
                disabled={r.id === '__rest'}
                className="flex w-full items-center justify-between gap-2 text-left active:opacity-70 disabled:active:opacity-100"
                style={{ height: ROW }}
              >
                <span className="min-w-0 flex items-center gap-2">
                  <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color }} />
                  <span className="truncate text-[14px] font-bold text-ink">{r.name}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {d !== null && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[11px] font-extrabold ${
                        Math.abs(d) < 5
                          ? 'bg-surface-sunken text-ink-subtle'
                          : d > 0
                            ? 'bg-expense-soft text-expense-deep dark:bg-expense/18 dark:text-expense'
                            : 'bg-income-soft text-income-deep dark:bg-brand-500/18 dark:text-brand-300'
                      }`}
                    >
                      {Math.abs(d) < 5 ? t('ov.as_usual') : `${d > 0 ? '+' : '−'}${Math.abs(d)}%`}
                    </span>
                  )}
                  <span className="tabular text-[14px] font-bold text-ink">{formatMoney(r.amount, o.currency)}</span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
