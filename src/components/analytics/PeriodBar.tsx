import { lazy, Suspense, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { useStore, periodLabel, type PeriodMode } from '../../store/transactions'
import { dayjs } from '../../lib/format'
import { useT } from '../../lib/i18n'
import { hapticSelect, hapticTap } from '../../lib/telegram'
import { useBackButton } from '../../lib/useBackButton'
import { UNMASK } from '../../lib/clarity'
import { useAnT } from './text'

// Календарь своего периода — тот же ленивый чанк, что у Главной.
const RangeCalendar = lazy(() => import('../RangeCalendar').then((m) => ({ default: m.RangeCalendar })))

const MODES: { id: PeriodMode; label: string }[] = [
  { id: 'day', label: 'period.day' },
  { id: 'week', label: 'period.week' },
  { id: 'month', label: 'period.month' },
  { id: 'year', label: 'period.year' },
  { id: 'all', label: 'common.all_time' },
  { id: 'range', label: 'period.custom' },
]

/**
 * Шапка Аналитики: период — заголовком страницы («Ноябрь 2026»), стрелки
 * рядом, вид периода — стеклянной кнопкой с меню. Раньше это были два ряда
 * (сегмент «День/Неделя/Месяц/⋯» и подпись со стрелками) плюс пять вкладок
 * под ними — четыре ряда управления до первого числа. Период общий с Главной.
 */
export function PeriodBar() {
  const period = useStore((s) => s.period)
  const setPeriodMode = useStore((s) => s.setPeriodMode)
  const shiftPeriod = useStore((s) => s.shiftPeriod)
  const setRange = useStore((s) => s.setRange)
  const tr = useT()
  const t = useAnT()
  const [menu, setMenu] = useState(false)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const seenCalendar = useRef(false)
  if (calendarOpen) seenCalendar.current = true
  // Куда листали: подпись въезжает с этой стороны.
  const [dir, setDir] = useState(0)
  useBackButton(menu, () => setMenu(false), true)

  const label = period.mode === 'all' ? tr('common.all_time') : periodLabel(period)
  const arrows = period.mode !== 'all' && period.mode !== 'range'
  const isCurrent = arrows && dayjs(period.anchor).isSame(dayjs(), period.mode as dayjs.OpUnitType)
  const modeLabel = tr(MODES.find((m) => m.id === period.mode)?.label ?? 'period.month')

  const shift = (d: -1 | 1) => {
    if (!arrows || (d > 0 && isCurrent)) return
    hapticSelect()
    setDir(d)
    shiftPeriod(d)
  }
  const pick = (id: PeriodMode) => {
    hapticSelect()
    setMenu(false)
    setDir(0)
    if (id === 'range') {
      setPeriodMode('range')
      setCalendarOpen(true)
      return
    }
    setPeriodMode(id)
  }

  return (
    <div className="relative z-10 px-5 pt-6" data-tour="analytics-head" {...UNMASK}>
      <div className="flex items-center justify-between gap-3">
        <div className="kicker">{t('title')}</div>
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              hapticSelect()
              setMenu((v) => !v)
            }}
            aria-expanded={menu}
            aria-label={t('mode')}
            className="press-soft glass-btn flex items-center gap-1 rounded-full py-1.5 pl-3 pr-2 text-[13px] font-bold text-ink"
          >
            {modeLabel}
            <ChevronDown size={14} strokeWidth={2.6} className={`text-ink-subtle transition-transform duration-300 ${menu ? 'rotate-180' : ''}`} />
          </button>
          {menu && (
            <>
              {/* Нажатие мимо закрывает меню; пока оно открыто, свайп не листает вкладки. */}
              <button aria-hidden tabIndex={-1} onClick={() => setMenu(false)} data-swipe-ignore className="fixed inset-0 z-40 cursor-default" />
              <div data-swipe-ignore className="menu-in absolute right-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-2xl bg-surface-raised p-1 shadow-raised ring-1 ring-black/5 dark:shadow-raised-dark dark:ring-white/10">
                {MODES.map((m) => {
                  const active = period.mode === m.id
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => pick(m.id)}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
                        active ? 'bg-brand-500/15 text-brand-700 dark:text-brand-200' : 'text-ink-muted active:bg-surface-sunken'
                      }`}
                    >
                      {tr(m.label)}
                      {active && <Check size={16} strokeWidth={2.6} className="text-brand-600 dark:text-brand-300" />}
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-1 flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            if (period.mode === 'range' || period.mode === 'all') {
              hapticTap()
              setCalendarOpen(true)
            }
          }}
          className="min-w-0 flex-1 text-left"
        >
          <div
            key={label}
            className={`truncate text-[27px] font-extrabold capitalize leading-tight tracking-tight text-ink max-[359px]:text-[23px] ${
              dir > 0 ? 'tab-in-r' : dir < 0 ? 'tab-in-l' : ''
            }`}
          >
            {label}
          </div>
        </button>
        {arrows && (
          <div className="glass-btn flex shrink-0 items-center rounded-full p-0.5">
            <button
              type="button"
              onClick={() => shift(-1)}
              aria-label={tr('period.prev')}
              className="press-icon flex h-9 w-9 items-center justify-center rounded-full text-ink-muted"
            >
              <ChevronLeft size={19} strokeWidth={2.6} />
            </button>
            <button
              type="button"
              onClick={() => shift(1)}
              disabled={isCurrent}
              aria-label={tr('period.next')}
              className="press-icon flex h-9 w-9 items-center justify-center rounded-full text-ink-muted disabled:opacity-25"
            >
              <ChevronRight size={19} strokeWidth={2.6} />
            </button>
          </div>
        )}
      </div>

      {seenCalendar.current && (
        <Suspense fallback={null}>
          <RangeCalendar
            open={calendarOpen}
            initialStart={period.rangeStart}
            initialEnd={period.rangeEnd}
            onClose={() => setCalendarOpen(false)}
            onApply={(start, end) => {
              setRange(start, end)
              setCalendarOpen(false)
            }}
            onAllTime={() => {
              hapticTap()
              setPeriodMode('all')
              setCalendarOpen(false)
            }}
          />
        </Suspense>
      )}
    </div>
  )
}
