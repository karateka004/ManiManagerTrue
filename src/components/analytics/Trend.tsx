import { memo, useMemo, useState } from 'react'
import { useStore, selectAnalyticsCurrency } from '../../store/transactions'
import { selectTrend, type TrendBucket, type TrendGranularity } from '../../store/analytics'
import { dayjs, formatMoney } from '../../lib/format'
import { MASK } from '../../lib/clarity'
import { GlassSeg, ScrubLayer, Widget } from './Glass'
import { useScrub } from './useScrub'
import { monthShort, useAnT } from './text'

type Gran = Exclude<TrendGranularity, 'day'>
/** Высота поля столбиков, px; справа — колонка подписей сетки. */
const H = 150

/** Круглая верхняя граница шкалы: 1, 2, 2,5, 5 × 10ⁿ — сетка в «ровных» числах. */
function niceCeil(v: number): number {
  if (v <= 0) return 1
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  const m = v / p
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p
}

/** Подпись сетки: «1 500», «15к», «1,5м» — без валюты, она в шапке. */
function axisNum(v: number, lang: string): string {
  const en = lang === 'en'
  if (v >= 1_000_000) return (v / 1_000_000).toLocaleString(en ? 'en' : 'ru', { maximumFractionDigits: 1 }) + (en ? 'm' : 'м')
  if (v >= 10_000) return (v / 1000).toLocaleString(en ? 'en' : 'ru', { maximumFractionDigits: 1 }) + (en ? 'k' : 'к')
  return Math.round(v).toLocaleString(en ? 'en' : 'ru')
}

/**
 * Динамика: доход и расход парными столбиками по неделям, месяцам или годам.
 * Раньше доход был кривой поверх столбиков — зарплата раз в две недели
 * превращала её в «пилу» до нуля, и график выглядел рваным. Пунктир — средний
 * расход по завершённым периодам (неполный текущий его не занижает), текущий
 * период — бледнее. Палец по графику показывает период целиком: потрачено,
 * пришло, разница.
 */
export const TrendWidget = memo(function TrendWidget() {
  const [gran, setGran] = useState<Gran>('month')
  const buckets = useStore((s) => selectTrend(s, gran))
  const currency = useStore(selectAnalyticsCurrency)
  const lang = useStore((s) => s.lang)
  const t = useAnT()

  const now = Date.now()
  const stats = useMemo(() => {
    // Неполная первая корзина (учёт начался посреди месяца) среднее занижала бы.
    const done = buckets.filter((b) => b.end <= now && !b.partial && (b.expense > 0 || b.income > 0))
    const avg = done.length ? done.reduce((a, b) => a + b.expense, 0) / done.length : 0
    const top = niceCeil(Math.max(1, ...buckets.map((b) => Math.max(b.expense, b.income)), avg))
    return { avg, top, empty: buckets.every((b) => b.expense === 0 && b.income === 0), anyIncome: buckets.some((b) => b.income > 0) }
  }, [buckets, now])

  const n = buckets.length
  const pct = (v: number) => `${Math.min(100, (v / stats.top) * 100)}%`
  const money = (v: number) => formatMoney(Math.round(v), currency)

  /** Подпись под столбиками: «7 сен», «сен», «2025». */
  const label = (b: TrendBucket) => {
    const d = new Date(b.start)
    if (gran === 'week') return `${d.getDate()} ${monthShort(lang, d.getMonth())}`
    if (gran === 'month') return monthShort(lang, d.getMonth())
    return String(d.getFullYear())
  }
  /** Заголовок пузыря: «7–13 сентября», «Сентябрь 2026», «2025». */
  const title = (b: TrendBucket) => {
    if (gran === 'year') return dayjs(b.start).format('YYYY')
    if (gran === 'month') {
      const s = dayjs(b.start).format('MMMM YYYY')
      return s.charAt(0).toUpperCase() + s.slice(1)
    }
    const a = dayjs(b.start)
    const z = dayjs(b.end - 43_200_000)
    return a.month() === z.month() ? `${a.format('D')}–${z.format('D MMMM')}` : `${a.format('D MMM')} – ${z.format('D MMM')}`
  }

  const scrub = useScrub(
    n,
    (i) => {
      const b = buckets[i]
      if (!b) return null
      const lines: { text: string; tone?: 'good' | 'bad' | 'muted' }[] = [{ text: '−' + money(b.expense), tone: 'bad' }]
      if (b.income > 0) {
        lines.push({ text: '+' + money(b.income), tone: 'good' })
        const diff = b.income - b.expense
        lines.push({ text: t('w.trend_diff', { amount: (diff >= 0 ? '+' : '−') + money(Math.abs(diff)) }), tone: 'muted' })
      }
      return { x: (i + 0.5) / n, y: 1 - Math.min(1, b.expense / stats.top), title: title(b), lines, color: '#E97373' }
    },
    true,
  )

  const per = gran === 'month' ? t('w.trend_avg_month') : gran === 'week' ? t('w.trend_avg_week') : t('w.trend_avg_year')
  const every = n > 8 ? 2 : 1

  return (
    <Widget
      title={t('w.trend')}
      delay={180}
      action={
        <GlassSeg
          value={gran}
          onChange={setGran}
          options={[
            { id: 'week', label: t('w.gran_week') },
            { id: 'month', label: t('w.gran_month') },
            { id: 'year', label: t('w.gran_year') },
          ]}
        />
      }
      bodyClass="px-4 pb-3 pt-4"
    >
      {stats.empty ? (
        <div className="py-10 text-center text-[13px] text-ink-subtle">{t('w.trend_empty')}</div>
      ) : (
        <>
          {/* Легенда не влезает рядом (узкий экран) — уходит строкой ниже, а не сжимает сумму. */}
          <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
            <div className="shrink-0">
              <div className="text-[17px] font-extrabold tabular text-ink" {...MASK}>
                {stats.avg > 0 ? t('w.trend_avg', { amount: money(stats.avg) }) : '—'}
              </div>
              <div className="caption-sm text-ink-subtle">{t('w.trend_spent_per', { per })}</div>
            </div>
            <div className="flex shrink-0 items-center gap-3 text-[11.5px] font-semibold text-ink-subtle">
              {stats.anyIncome && (
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-[3px] bg-income" />
                  {t('w.income')}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-[3px] bg-expense" />
                {t('w.expense')}
              </span>
            </div>
          </div>

          <div key={gran} className="mt-4 flex">
            <div className="relative min-w-0 flex-1" style={{ height: H, touchAction: 'pan-y' }} data-swipe-ignore {...scrub.handlers}>
              {/* Сетка: ноль, половина, верх — в ровных числах. */}
              {[1, 0.5, 0].map((k) => (
                <span
                  key={k}
                  aria-hidden
                  className={`absolute inset-x-0 border-t ${k === 0 ? 'border-ink/[.14]' : 'border-dashed border-ink/[.08]'}`}
                  style={{ top: `${(1 - k) * 100}%` }}
                />
              ))}
              {/* Средний расход — пунктир поверх сетки. */}
              {stats.avg > 0 && (
                <span
                  aria-hidden
                  className="absolute inset-x-0 border-t-[1.5px] border-dashed border-expense/60"
                  style={{ bottom: pct(stats.avg) }}
                />
              )}
              <div className="absolute inset-0 flex items-end">
                {buckets.map((b, i) => {
                  const current = b.end > now
                  return (
                    <div key={b.start} className="flex h-full min-w-0 flex-1 items-end justify-center gap-[2px]">
                      {stats.anyIncome && (
                        <span
                          className={`an-rise block w-[30%] max-w-[11px] rounded-t-[4px] ${current ? 'bg-income/40' : 'bg-income'}`}
                          style={{ height: b.income > 0 ? `max(2px, ${pct(b.income)})` : 0, animationDelay: `${Math.min(i, 12) * 28}ms` }}
                        />
                      )}
                      <span
                        className={`an-rise block w-[30%] max-w-[11px] rounded-t-[4px] ${current ? 'bg-expense/45' : 'bg-expense'}`}
                        style={{ height: b.expense > 0 ? `max(2px, ${pct(b.expense)})` : 0, animationDelay: `${Math.min(i, 12) * 28 + 20}ms` }}
                      />
                    </div>
                  )
                })}
              </div>
              <ScrubLayer s={scrub} />
            </div>
            {/* Значения сетки — справа, мелко: только чтобы прикинуть масштаб. */}
            <div className="relative w-9 shrink-0 text-right text-[10px] font-semibold tabular text-ink-subtle" aria-hidden {...MASK}>
              {[1, 0.5].map((k) => (
                <span key={k} className="absolute right-0 -translate-y-1/2" style={{ top: `${(1 - k) * 100}%` }}>
                  {axisNum(stats.top * k, lang)}
                </span>
              ))}
              <span className="absolute right-0 -translate-y-1/2" style={{ top: '100%' }}>
                0
              </span>
            </div>
          </div>
          {/* Подписи — по центру своего столбика, без обрезки: идут через одну,
              места хватает на «21 сен». В клетку одного столбика оно не влезало. */}
          <div className="relative mr-9 mt-2 h-3.5">
            {buckets.map((b, i) =>
              i % every === (n - 1) % every ? (
                <span
                  key={b.start}
                  className={`absolute top-0 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold leading-none ${b.end > now ? 'text-ink' : 'text-ink-subtle'}`}
                  style={{ left: `${((i + 0.5) / n) * 100}%` }}
                >
                  {label(b)}
                </span>
              ) : null,
            )}
          </div>
        </>
      )}
    </Widget>
  )
})
