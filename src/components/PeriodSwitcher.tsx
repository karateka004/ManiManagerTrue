import { lazy, Suspense, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, MoreHorizontal, Check } from 'lucide-react'
import { useStore, periodLabel, type PeriodMode } from '../store/transactions'
import { dayjs } from '../lib/format'
import { useT } from '../lib/i18n'
import { hapticSelect, hapticTap } from '../lib/telegram'
import { SegTrack } from './ui/SegTrack'
import { useBackButton } from '../lib/useBackButton'

// Календарь своего периода — ленивый чанк (см. RangeCalendar.tsx).
const RangeCalendar = lazy(() => import('./RangeCalendar').then((m) => ({ default: m.RangeCalendar })))

// Основные чипы — частые периоды. Остальное (Год / Всё время / Период) — в «⋯»-меню.
const PRIMARY: { id: PeriodMode; label: string }[] = [
  { id: 'day', label: 'period.day' },
  { id: 'week', label: 'period.week' },
  { id: 'month', label: 'period.month' },
]

export function PeriodSwitcher() {
  const period = useStore((s) => s.period)
  const setPeriodMode = useStore((s) => s.setPeriodMode)
  const shiftPeriod = useStore((s) => s.shiftPeriod)
  const setRange = useStore((s) => s.setRange)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const seenCalendar = useRef(false)
  if (calendarOpen) seenCalendar.current = true
  const tr = useT()

  // Подпись периода: для «всё время» — из словаря, иначе дата из стора (dayjs локализован).
  const label = period.mode === 'all' ? tr('common.all_time') : periodLabel(period)

  const arrows = period.mode !== 'all' && period.mode !== 'range'
  const isCurrent =
    arrows && dayjs(period.anchor).isSame(dayjs(), period.mode as dayjs.OpUnitType)

  const [menuOpen, setMenuOpen] = useState(false)
  // Меню поверх экрана — «Назад» Telegram и Escape закрывают его, а не уводят
  // с вкладки (раньше подложка-ловушка оставалась висеть и съедала нажатия).
  useBackButton(menuOpen, () => setMenuOpen(false), true)
  // «⋯» подсвечен, когда активен режим из меню (Год / Всё время / Период).
  const moreActive = period.mode === 'year' || period.mode === 'all' || period.mode === 'range'

  // Куда листали период стрелками: подпись въезжает с этой стороны. Смена
  // режима (день/неделя/месяц) — без направления.
  const [shiftDir, setShiftDir] = useState(0)

  const selectPrimary = (id: PeriodMode) => {
    hapticSelect()
    setShiftDir(0)
    setPeriodMode(id)
  }
  const pickMore = (id: PeriodMode) => {
    hapticSelect()
    setShiftDir(0)
    setMenuOpen(false)
    if (id === 'range') {
      setPeriodMode('range')
      setCalendarOpen(true)
      return
    }
    setPeriodMode(id)
  }

  return (
    <div className="px-4 pt-1">
      {/* Сегмент: 3 основных чипа + «⋯»-меню. Плашка одна и ездит (SegTrack) —
          раньше это был framer layoutId, который при остановленном rAF мог
          застрять под прежним пунктом. */}
      <SegTrack active={period.mode} className="gap-1">
        {PRIMARY.map((t) => {
          const active = period.mode === t.id
          return (
            <button
              key={t.id}
              onClick={() => selectPrimary(t.id)}
              aria-pressed={active}
              className={`seg-item py-1.5 text-xs ${active ? 'seg-on' : 'text-ink-subtle'}`}
            >
              {tr(t.label)}
            </button>
          )
        })}

        {/* «⋯» — остальные периоды */}
        <button
          onClick={() => { hapticSelect(); setMenuOpen((v) => !v) }}
          aria-label={tr('period.more')}
          aria-expanded={menuOpen}
          className={`seg-item flex flex-none items-center justify-center px-3 py-1.5 ${moreActive ? 'seg-on' : 'text-ink-subtle'}`}
        >
          <MoreHorizontal size={16} strokeWidth={2.5} />
        </button>

        {menuOpen && (
          <>
            {/* клик-вне закрывает */}
            <button aria-hidden tabIndex={-1} onClick={() => setMenuOpen(false)} className="fixed inset-0 z-40 cursor-default" />
            <div className="menu-in absolute right-0 top-full z-50 mt-2 w-44 overflow-hidden rounded-2xl bg-surface-raised p-1 shadow-raised dark:shadow-raised-dark">
              <MoreItem label={tr('period.year')} active={period.mode === 'year'} onClick={() => pickMore('year')} />
              <MoreItem label={tr('common.all_time')} active={period.mode === 'all'} onClick={() => pickMore('all')} />
              <MoreItem label={tr('period.custom')} active={period.mode === 'range'} onClick={() => pickMore('range')} />
            </div>
          </>
        )}
      </SegTrack>

      {/* Label + arrows */}
      <div className="mt-2 flex items-center justify-between px-1">
        <button
          onClick={() => {
            if (!arrows) return
            hapticSelect()
            setShiftDir(-1)
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
          {/* Подпись периода въезжает с той стороны, куда листали. CSS, а не
              framer initial:opacity — подпись не может остаться невидимой. */}
          <div
            key={label}
            className={`truncate text-center text-base font-bold capitalize tracking-tight text-ink ${
              shiftDir > 0 ? 'tab-in-r' : shiftDir < 0 ? 'tab-in-l' : 'tab-enter'
            }`}
          >
            {label}
            {(period.mode === 'range' || period.mode === 'all') && (
              <span className="ml-1 align-middle text-ink-subtle">⌄</span>
            )}
          </div>
        </button>

        <button
          onClick={() => {
            if (!arrows || isCurrent) return
            hapticSelect()
            setShiftDir(1)
            shiftPeriod(1)
          }}
          disabled={!arrows || isCurrent}
          className="flex h-8 w-8 items-center justify-center rounded-full text-ink-subtle transition-colors active:bg-surface-sunken disabled:opacity-20"
          aria-label={tr('period.next')}
        >
          <Chevron dir="right" />
        </button>
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

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return dir === 'left' ? (
    <ChevronLeft size={18} strokeWidth={2.5} />
  ) : (
    <ChevronRight size={18} strokeWidth={2.5} />
  )
}

/** Пункт «⋯»-меню периодов. */
function MoreItem({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
        active ? 'bg-brand-500/15 text-brand-700 dark:text-brand-200' : 'text-ink-muted active:bg-surface-sunken'
      }`}
    >
      {label}
      {active && <Check size={16} strokeWidth={2.6} className="text-brand-600 dark:text-brand-300" />}
    </button>
  )
}
