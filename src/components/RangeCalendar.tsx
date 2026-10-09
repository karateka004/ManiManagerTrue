import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useStore } from '../store/transactions'
import { dayjs } from '../lib/format'
import { useT, weekdaysShort } from '../lib/i18n'
import { hapticSelect } from '../lib/telegram'
import { BottomSheet, SheetHeader } from './ui/BottomSheet'

/**
 * Шторка выбора своего периода — отдельный ленивый чанк: нужна редко, а
 * шторка тянет за собой движок перетаскивания framer, которому не место в
 * стартовом JS (PeriodSwitcher стоит на Главной).
 */

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

export function RangeCalendar({ open, initialStart, initialEnd, onClose, onApply, onAllTime }: CalProps) {
  const [viewMonth, setViewMonth] = useState(() => dayjs(initialStart ?? undefined).startOf('month'))
  const [start, setStart] = useState<string | null>(initialStart ?? null)
  const [end, setEnd] = useState<string | null>(initialEnd ?? null)
  // Куда листали месяц: сетка дней въезжает с этой стороны.
  const [monthDir, setMonthDir] = useState(0)
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
    <BottomSheet open={open} onClose={onClose} padBottom={8}>
      <SheetHeader
        title={t('period.pick')}
        trailing={
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onClose}
            className="shrink-0 text-sm font-medium text-ink-subtle active:text-ink-muted"
          >
            {t('common.close')}
          </button>
        }
      />

      {/* Month nav */}
      <div className="flex items-center justify-between px-6 py-1">
        <button
          onClick={() => { hapticSelect(); setMonthDir(-1); setViewMonth((m) => m.subtract(1, 'month')) }}
          className="flex h-8 w-8 items-center justify-center rounded-full text-ink-subtle active:bg-surface-sunken"
        >
          <Chevron dir="left" />
        </button>
        <span className="text-sm font-bold capitalize text-ink">{viewMonth.format('MMMM YYYY')}</span>
        <button
          onClick={() => { hapticSelect(); setMonthDir(1); setViewMonth((m) => m.add(1, 'month')) }}
          className="flex h-8 w-8 items-center justify-center rounded-full text-ink-subtle active:bg-surface-sunken"
        >
          <Chevron dir="right" />
        </button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-1 px-4 pt-1 text-center caption-sm capitalize text-ink-subtle">
        {weekdaysShort(lang).map((d) => (
          <div key={d} className="py-1">{d}</div>
        ))}
      </div>

      {/* Day grid */}
      <div
        key={viewMonth.format('YYYY-MM')}
        className={`grid grid-cols-7 gap-1 px-4 pb-2 ${monthDir > 0 ? 'tab-in-r' : monthDir < 0 ? 'tab-in-l' : ''}`}
      >
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
    </BottomSheet>
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
