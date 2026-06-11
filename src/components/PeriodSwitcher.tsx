import { useState } from 'react'
import { AnimatePresence, m } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useStore, periodLabel, type PeriodMode } from '../store/transactions'
import { dayjs } from '../lib/format'
import { useT, weekdaysShort } from '../lib/i18n'
import { hapticSelect, hapticTap } from '../lib/telegram'

const TABS: { id: PeriodMode; label: string }[] = [
  { id: 'day', label: 'period.day' },
  { id: 'week', label: 'period.week' },
  { id: 'month', label: 'period.month' },
  { id: 'year', label: 'period.year' },
  { id: 'range', label: 'period.custom' },
]

export function PeriodSwitcher() {
  const period = useStore((s) => s.period)
  const setPeriodMode = useStore((s) => s.setPeriodMode)
  const shiftPeriod = useStore((s) => s.shiftPeriod)
  const setRange = useStore((s) => s.setRange)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const tr = useT()

  // Подпись периода: для «всё время» — из словаря, иначе дата из стора (dayjs локализован).
  const label = period.mode === 'all' ? tr('common.all_time') : periodLabel(period)

  const arrows = period.mode !== 'all' && period.mode !== 'range'
  const isCurrent =
    arrows && dayjs(period.anchor).isSame(dayjs(), period.mode as dayjs.OpUnitType)

  const selectTab = (id: PeriodMode) => {
    hapticSelect()
    if (id === 'range') {
      setPeriodMode('range')
      setCalendarOpen(true)
      return
    }
    setPeriodMode(id)
  }

  return (
    <div className="px-4 pt-1">
      {/* Segmented control */}
      <div className="flex gap-1 rounded-full bg-surface-sunken p-1">
        {TABS.map((t) => {
          const active = period.mode === t.id || (t.id === 'range' && period.mode === 'all')
          return (
            <button
              key={t.id}
              onClick={() => selectTab(t.id)}
              className={`relative flex-1 rounded-full py-1.5 text-xs font-semibold transition-colors ${
                active ? 'text-ink' : 'text-ink-subtle'
              }`}
            >
              {active && (
                <m.span
                  layoutId="period-pill"
                  className="absolute inset-0 rounded-full bg-surface-raised shadow-soft dark:shadow-soft-dark"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
              <span className="relative z-10">{tr(t.label)}</span>
            </button>
          )
        })}
      </div>

      {/* Label + arrows */}
      <div className="mt-2 flex items-center justify-between px-1">
        <button
          onClick={() => {
            if (!arrows) return
            hapticSelect()
            shiftPeriod(-1)
          }}
          disabled={!arrows}
          className="flex h-8 w-8 items-center justify-center rounded-full text-ink-subtle transition-colors active:bg-surface-sunken disabled:opacity-0"
          aria-label={tr('period.prev')}
        >
          <Chevron dir="left" />
        </button>

        <button
          onClick={() => {
            if (period.mode === 'range' || period.mode === 'all') {
              hapticSelect()
              setCalendarOpen(true)
            }
          }}
          className="min-w-0 flex-1 px-2"
        >
          <m.div
            key={label}
            initial={{ opacity: 0, y: -3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="truncate text-center text-base font-bold capitalize tracking-tight text-ink"
          >
            {label}
            {(period.mode === 'range' || period.mode === 'all') && (
              <span className="ml-1 align-middle text-ink-subtle">⌄</span>
            )}
          </m.div>
        </button>

        <button
          onClick={() => {
            if (!arrows || isCurrent) return
            hapticSelect()
            shiftPeriod(1)
          }}
          disabled={!arrows || isCurrent}
          className="flex h-8 w-8 items-center justify-center rounded-full text-ink-subtle transition-colors active:bg-surface-sunken disabled:opacity-20"
          aria-label={tr('period.next')}
        >
          <Chevron dir="right" />
        </button>
      </div>

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
    </div>
  )
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return dir === 'left' ? (
    <ChevronLeft size={18} strokeWidth={2.5} />
  ) : (
    <ChevronRight size={18} strokeWidth={2.5} />
  )
}

/* ---------- Range calendar modal ---------- */

interface CalProps {
  open: boolean
  initialStart?: string
  initialEnd?: string
  onClose: () => void
  onApply: (start: string, end: string) => void
  onAllTime: () => void
}

function RangeCalendar({ open, initialStart, initialEnd, onClose, onApply, onAllTime }: CalProps) {
  const [viewMonth, setViewMonth] = useState(() => dayjs(initialStart ?? undefined).startOf('month'))
  const [start, setStart] = useState<string | null>(initialStart ?? null)
  const [end, setEnd] = useState<string | null>(initialEnd ?? null)
  const t = useT()
  const lang = useStore((s) => s.lang)

  const reset = () => {
    setStart(null)
    setEnd(null)
  }

  const pick = (iso: string) => {
    hapticSelect()
    if (!start || (start && end)) {
      setStart(iso)
      setEnd(null)
    } else {
      // second pick
      if (dayjs(iso).isBefore(dayjs(start))) {
        setEnd(start)
        setStart(iso)
      } else {
        setEnd(iso)
      }
    }
  }

  const days = buildMonthGrid(viewMonth)
  const canApply = !!start

  return (
    <AnimatePresence>
      {open && (
        <>
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          />
          <m.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-5xl bg-surface-raised pb-2 shadow-raised"
            style={{ paddingBottom: 'var(--safe-bottom)' }}
          >
            <div className="flex justify-center pb-1 pt-3">
              <div className="h-1.5 w-12 rounded-full bg-surface-sunken" />
            </div>

            <div className="flex items-center justify-between px-6 py-2">
              <span className="text-base font-bold text-ink">{t('period.pick')}</span>
              <button onClick={onClose} className="text-sm font-medium text-ink-subtle active:text-ink-muted">
                {t('common.close')}
              </button>
            </div>

            {/* Month nav */}
            <div className="flex items-center justify-between px-6 py-1">
              <button
                onClick={() => { hapticSelect(); setViewMonth((m) => m.subtract(1, 'month')) }}
                className="flex h-8 w-8 items-center justify-center rounded-full text-ink-subtle active:bg-surface-sunken"
              >
                <Chevron dir="left" />
              </button>
              <span className="text-sm font-bold capitalize text-ink">{viewMonth.format('MMMM YYYY')}</span>
              <button
                onClick={() => { hapticSelect(); setViewMonth((m) => m.add(1, 'month')) }}
                className="flex h-8 w-8 items-center justify-center rounded-full text-ink-subtle active:bg-surface-sunken"
              >
                <Chevron dir="right" />
              </button>
            </div>

            {/* Weekday header */}
            <div className="grid grid-cols-7 gap-1 px-4 pt-1 text-center text-[10px] font-bold uppercase text-ink-subtle">
              {weekdaysShort(lang).map((d) => (
                <div key={d} className="py-1">{d}</div>
              ))}
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7 gap-1 px-4 pb-2">
              {days.map((d, i) => {
                if (!d) return <div key={`e${i}`} />
                const iso = d.format('YYYY-MM-DD')
                const isStart = iso === start
                const isEnd = iso === end
                const inRange = start && end && d.isAfter(dayjs(start).subtract(1, 'day')) && d.isBefore(dayjs(end).add(1, 'day'))
                const isToday = d.isSame(dayjs(), 'day')
                return (
                  <button
                    key={iso}
                    onClick={() => pick(iso)}
                    className={`relative flex h-9 items-center justify-center rounded-xl text-sm font-semibold transition-colors ${
                      isStart || isEnd
                        ? 'bg-brand-500 text-white'
                        : inRange
                        ? 'bg-brand-100 text-brand-600 dark:bg-brand-500/20'
                        : 'text-ink active:bg-surface-sunken'
                    }`}
                  >
                    {d.date()}
                    {isToday && !isStart && !isEnd && (
                      <span className="absolute bottom-1 h-1 w-1 rounded-full bg-brand-500" />
                    )}
                  </button>
                )
              })}
            </div>

            {/* Footer actions */}
            <div className="px-4 pt-1">
              <div className="mb-2 px-2 text-center text-xs text-ink-subtle">
                {start && end
                  ? `${dayjs(start).format('D MMM')} – ${dayjs(end).format('D MMM')}`
                  : start
                  ? t('period.pick_end', { date: dayjs(start).format('D MMM') })
                  : t('period.pick_start')}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={onAllTime}
                  className="flex-1 rounded-full bg-surface-sunken py-3 text-sm font-bold text-ink-muted active:scale-[0.98]"
                >
                  {t('common.all_time')}
                </button>
                <button
                  onClick={() => {
                    if (!start) return
                    onApply(start, end ?? start)
                  }}
                  disabled={!canApply}
                  className={`flex-[1.4] rounded-full bg-brand-500 py-3 text-sm font-bold text-white active:scale-[0.98] ${
                    canApply ? '' : 'opacity-40'
                  }`}
                >
                  {t('common.apply')}
                </button>
              </div>
              <button
                onClick={reset}
                className="mt-2 w-full py-1 text-center text-xs text-ink-subtle active:text-ink-muted"
              >
                {t('period.reset')}
              </button>
            </div>
          </m.div>
        </>
      )}
    </AnimatePresence>
  )
}

/** Сетка месяца с понедельника; null — пустые ячейки до 1-го числа. */
function buildMonthGrid(viewMonth: ReturnType<typeof dayjs>): (ReturnType<typeof dayjs> | null)[] {
  const first = viewMonth.startOf('month')
  const daysInMonth = viewMonth.daysInMonth()
  // dayjs ru: неделя с понедельника. day(): 0=вс..6=сб → сдвигаем к Пн=0
  const lead = (first.day() + 6) % 7
  const cells: (ReturnType<typeof dayjs> | null)[] = []
  for (let i = 0; i < lead; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(first.date(d))
  return cells
}
