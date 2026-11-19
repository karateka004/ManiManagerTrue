import { memo, useDeferredValue, useMemo } from 'react'
import { useStore, periodBounds, type Period } from '../../store/transactions'
import { selectCalendarMonth, selectOverview } from '../../store/analytics'
import { dayjs, formatMoney } from '../../lib/format'
import { daysWord, weekdaysShort } from '../../lib/i18n'
import { localDayKey } from '../../lib/day'
import { hapticTap } from '../../lib/telegram'
import { MASK } from '../../lib/clarity'
import { Widget } from './Glass'
import { useAnT } from './text'

/**
 * Месяц календаря: тот, где кончается выбранный период, но не позже
 * сегодняшнего — у текущего года и «за всё время» это нынешний месяц.
 */
export function calendarMonth(period: Period): number {
  const { end } = periodBounds(period)
  const last = Math.min(+end - 1, Date.now())
  const d = new Date(last)
  return +new Date(d.getFullYear(), d.getMonth(), 1)
}

/**
 * Ступени тепла: по квартилям трат месяца, а не от максимума — иначе один
 * дорогой день (аренда) красил бы все остальные в самый бледный тон. Пока
 * дней с тратами мало, квартили ничего не значат — тогда от максимума.
 */
function heatLevels(values: number[]): (v: number) => number {
  const nz = values.filter((v) => v > 0).sort((a, b) => a - b)
  if (nz.length === 0) return () => 0
  if (nz.length < 6) {
    const max = nz[nz.length - 1]
    return (v) => (v <= 0 ? 0 : Math.max(1, Math.ceil((v / max) * 4)))
  }
  const q = (p: number) => nz[Math.min(nz.length - 1, Math.floor(p * (nz.length - 1)))]
  const [q1, q2, q3] = [q(0.25), q(0.5), q(0.8)]
  return (v) => (v <= 0 ? 0 : v <= q1 ? 1 : v <= q2 ? 2 : v <= q3 ? 3 : 4)
}

/**
 * Календарь — тепловая карта трат месяца. Цвет клетки — сколько потрачено в
 * день (пять ступеней), зелёная точка — был доход, кольцо — сегодня; дни вне
 * выбранного периода (неделя) приглушены. Нажатие — шторка дня со списком.
 * Раньше в клетках стояли числа «−3550» шрифтом 9 px: месяц не читался
 * взглядом, а цифры всё равно приходилось искать.
 */
export const CalendarWidget = memo(function CalendarWidget({ onDay }: { onDay: (dayKey: number) => void }) {
  // Ниже первого экрана: при смене периода сначала обновляется видимое
  // (герой, показатели, подсказки), этот виджет — следующей задачей.
  const period = useDeferredValue(useStore((s) => s.period))
  const monthStart = calendarMonth(period)
  const days = useStore((s) => selectCalendarMonth(s, monthStart))
  const o = useDeferredValue(useStore(selectOverview))
  const lang = useStore((s) => s.lang)
  const t = useAnT()

  const first = new Date(monthStart)
  const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  const offset = (first.getDay() + 6) % 7
  const todayKey = localDayKey(Date.now())
  const { start, end } = periodBounds(period)
  const lo = localDayKey(+start)
  const hi = localDayKey(+end)

  const level = useMemo(() => heatLevels(days.map((d) => d?.expense ?? 0)), [days])
  const stats = useMemo(() => {
    let free = 0
    let peak = 0
    let peakDay = 0
    for (let d = 1; d <= count; d++) {
      const key = +new Date(first.getFullYear(), first.getMonth(), d)
      if (key > todayKey) break
      const e = days[d]?.expense ?? 0
      if (e === 0) free += 1
      if (e > peak) {
        peak = e
        peakDay = key
      }
    }
    return { free, peak, peakDay }
  }, [days, count, monthStart, todayKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const cells: (number | null)[] = [...Array.from({ length: offset }, () => null), ...Array.from({ length: count }, (_, i) => i + 1)]
  const monthName = dayjs(monthStart).format('MMMM YYYY')

  return (
    <Widget
      title={t('w.calendar')}
      delay={150}
      action={<span className="truncate text-[13px] font-semibold capitalize text-ink-subtle">{monthName}</span>}
      bodyClass="px-3 pb-3 pt-3"
    >
      <div className="grid grid-cols-7 gap-1.5 px-0.5 pb-1.5">
        {weekdaysShort(lang).map((w, i) => (
          <div key={w} className={`text-center text-[11px] font-bold ${i >= 5 ? 'text-ink-muted' : 'text-ink-subtle'}`}>
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((d, i) => {
          if (d === null) return <span key={'e' + i} />
          const key = +new Date(first.getFullYear(), first.getMonth(), d)
          const day = days[d]
          const future = key > todayKey
          const outside = key < lo || key >= hi
          const lvl = level(day?.expense ?? 0)
          const today = key === todayKey
          return (
            <button
              key={d}
              type="button"
              disabled={future}
              onClick={() => {
                hapticTap()
                onDay(key)
              }}
              aria-label={`${dayjs(key).format('D MMMM')}${day?.expense ? ', −' + formatMoney(Math.round(day.expense), o.currency) : ''}${day?.income ? ', +' + formatMoney(Math.round(day.income), o.currency) : ''}`}
              className={`heat-${lvl} relative flex aspect-square items-center justify-center rounded-[11px] text-[13px] font-bold tabular transition-transform active:scale-95 ${
                lvl >= 4 ? 'text-white' : 'text-ink'
              } ${future ? 'opacity-30' : outside ? 'opacity-45' : ''} ${today ? 'ring-2 ring-brand-400 ring-offset-0' : ''}`}
            >
              {d}
              {day && day.income > 0 && (
                <span aria-hidden className="absolute bottom-[5px] left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-income shadow-[0_0_0_1.5px_rgb(var(--c-surface-raised))]" />
              )}
            </button>
          )
        })}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-subtle">
          {t('w.less_spent')}
          {[0, 1, 2, 3, 4].map((l) => (
            <span key={l} className={`heat-${l} h-3 w-3 rounded-[4px]`} />
          ))}
          {t('w.more_spent')}
        </div>
        <div className="min-w-0 truncate text-right text-[11.5px] font-semibold text-ink-subtle" {...MASK}>
          {stats.peak > 0 && stats.free === 0
            ? t('w.cal_peak', { date: dayjs(stats.peakDay).format(lang === 'en' ? 'MMM D' : 'D MMM') })
            : t('w.cal_free', { n: stats.free, days: daysWord(lang, stats.free) })}
        </div>
      </div>
    </Widget>
  )
})
