import { memo, useDeferredValue, useMemo, useState } from 'react'
import { useStore, periodBounds, type Period } from '../../store/transactions'
import { selectCalendarMonth, selectOverview, type CalendarDay } from '../../store/analytics'
import { dayjs, formatMoney } from '../../lib/format'
import { weekdaysShort } from '../../lib/i18n'
import { localDayKey } from '../../lib/day'
import { hapticTap } from '../../lib/telegram'
import { MASK } from '../../lib/clarity'
import { GlassSeg, Widget } from './Glass'
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

/** Что показывать в клетках: траты, доходы, оба двумя строками или итог дня. */
type CalMode = 'expense' | 'income' | 'both' | 'net'
const MODE_KEY = 'koshel:calMode'
function readMode(): CalMode {
  try {
    const v = localStorage.getItem(MODE_KEY)
    return v === 'income' || v === 'both' || v === 'net' ? v : 'expense'
  } catch {
    return 'expense'
  }
}
function saveMode(m: CalMode) {
  try {
    localStorage.setItem(MODE_KEY, m)
  } catch {
    /* приватный режим — выбор не запомнится */
  }
}

/**
 * Число в клетке. До 100 000 — целиком: дневной итог не округляем (4050, а не
 * «4,1к» — округление вверх искажало бы день). Дальше — тысячами («150к»).
 * На узком экране (меньше 360 px) клетка вмещает четыре цифры со знаком —
 * там тысячами уже от 10 000: «41к», «27,5к», а не «−410…».
 */
function cellNum(v: number, lang: string, narrow: boolean): string {
  const a = Math.round(Math.abs(v))
  if (a < (narrow ? 10_000 : 100_000)) return String(a)
  const k = a / 1000
  const text = (k < 100 ? Math.round(k * 10) / 10 : Math.round(k)).toLocaleString(lang === 'en' ? 'en' : 'ru')
  return text + (lang === 'en' ? 'k' : 'к')
}

/**
 * Ступени тепла: по квартилям, а не от максимума — иначе один дорогой день
 * (аренда) красил бы все остальные в самый бледный тон. Пока дней с суммой
 * мало, квартили ничего не значат — тогда от максимума.
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

const net = (d: CalendarDay | null) => (d ? d.income - d.expense : 0)

/**
 * Календарь месяца: тепловая карта и суммы в клетках. Переключатель — как
 * раньше: траты, доходы, оба (две строки: +доход и −трата) или итог дня
 * (доход минус траты). Цвет клетки — по выбранному: красная шкала трат,
 * зелёная — доходов, в итоге — по знаку. Выбор запоминается. Нажатие на день —
 * шторка со списком записей и правкой.
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
  const [mode, setMode] = useState<CalMode>(readMode)
  const narrow = typeof window !== 'undefined' && window.innerWidth < 360
  const num = (v: number) => cellNum(v, lang, narrow)

  const first = new Date(monthStart)
  const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  const offset = (first.getDay() + 6) % 7
  const todayKey = localDayKey(Date.now())
  const { start, end } = periodBounds(period)
  const lo = localDayKey(+start)
  const hi = localDayKey(+end)

  const levels = useMemo(() => {
    const exp = heatLevels(days.map((d) => d?.expense ?? 0))
    const inc = heatLevels(days.map((d) => d?.income ?? 0))
    // Итог: шкала по модулю — и плюс, и минус меряются одной меркой.
    const abs = heatLevels(days.map((d) => Math.abs(net(d))))
    return { exp, inc, abs }
  }, [days])

  const totals = useMemo(() => {
    let income = 0
    let expense = 0
    for (const d of days) {
      if (!d) continue
      income += d.income
      expense += d.expense
    }
    return { income, expense }
  }, [days])

  const money = (v: number) => formatMoney(Math.round(v), o.currency)
  const cells: (number | null)[] = [...Array.from({ length: offset }, () => null), ...Array.from({ length: count }, (_, i) => i + 1)]
  const monthName = dayjs(monthStart).format('MMMM YYYY')

  /** Клетка: фон по ступени и строки суммы. */
  const look = (day: CalendarDay | null): { cls: string; strong: boolean; lines: { text: string; tone: string }[] } => {
    const inc = day?.income ?? 0
    const exp = day?.expense ?? 0
    if (mode === 'expense') {
      const l = levels.exp(exp)
      return { cls: `heat-${l}`, strong: l >= 4, lines: exp > 0 ? [{ text: num(exp), tone: '' }] : [] }
    }
    if (mode === 'income') {
      const l = levels.inc(inc)
      return { cls: l ? `heat-in-${l}` : 'heat-0', strong: l >= 4, lines: inc > 0 ? [{ text: num(inc), tone: '' }] : [] }
    }
    if (mode === 'net') {
      const v = inc - exp
      if (!inc && !exp) return { cls: 'heat-0', strong: false, lines: [] }
      const l = levels.abs(Math.abs(v))
      return {
        cls: v > 0 ? `heat-in-${Math.max(1, l)}` : v < 0 ? `heat-${Math.max(1, l)}` : 'heat-0',
        strong: l >= 4 && v !== 0,
        lines: [{ text: (v > 0 ? '+' : v < 0 ? '−' : '') + num(v), tone: '' }],
      }
    }
    // Оба: две строки цветом, фон нейтральный — красное на красном не читается.
    const lines: { text: string; tone: string }[] = []
    if (inc > 0) lines.push({ text: '+' + num(inc), tone: 'text-income-deep dark:text-income-light' })
    if (exp > 0) lines.push({ text: '−' + num(exp), tone: 'text-expense-deep dark:text-expense' })
    return { cls: lines.length ? 'heat-both' : 'heat-0', strong: false, lines }
  }

  const netMonth = totals.income - totals.expense

  return (
    <Widget
      title={t('w.calendar')}
      delay={150}
      action={<span className="truncate text-[13px] font-semibold capitalize text-ink-subtle">{monthName}</span>}
      bodyClass="px-3 pb-3 pt-3"
    >
      <GlassSeg
        full
        value={mode}
        label={t('w.calendar')}
        onChange={(m) => {
          setMode(m)
          saveMode(m)
        }}
        options={[
          { id: 'expense', label: t('w.cal_expense') },
          { id: 'income', label: t('w.cal_income') },
          { id: 'both', label: t('w.cal_both') },
          { id: 'net', label: t('w.cal_net') },
        ]}
      />
      <div className="mt-3 grid grid-cols-7 gap-1.5 px-0.5 pb-1.5">
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
          const today = key === todayKey
          const v = look(day)
          return (
            <button
              key={d}
              type="button"
              disabled={future}
              onClick={() => {
                hapticTap()
                onDay(key)
              }}
              aria-label={`${dayjs(key).format('D MMMM')}${day?.expense ? ', −' + money(day.expense) : ''}${day?.income ? ', +' + money(day.income) : ''}`}
              className={`${v.cls} relative flex min-h-[46px] flex-col items-center justify-center gap-[3px] rounded-[11px] px-0.5 tabular transition-transform active:scale-95 ${
                v.strong ? 'text-white' : 'text-ink'
              } ${future ? 'opacity-30' : outside ? 'opacity-45' : ''} ${today ? 'ring-2 ring-brand-400 ring-offset-0' : ''}`}
            >
              <span className={`text-[12px] font-bold leading-none ${v.lines.length ? 'opacity-70' : ''}`}>{d}</span>
              {v.lines.map((l) => (
                <span
                  key={l.text}
                  className={`max-w-full truncate text-[10px] font-extrabold leading-none tracking-tight max-[359px]:text-[9px] ${l.tone}`}
                  {...MASK}
                >
                  {l.text}
                </span>
              ))}
              {mode === 'expense' && day && day.income > 0 && (
                <span aria-hidden className="absolute right-[5px] top-[5px] h-1.5 w-1.5 rounded-full bg-income shadow-[0_0_0_1.5px_rgb(var(--c-surface-raised))]" />
              )}
            </button>
          )
        })}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 px-1">
        {mode === 'both' ? (
          <div className="flex items-center gap-3 text-[11px] font-semibold text-ink-subtle">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[3px] bg-income" />
              {t('w.cal_in')}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[3px] bg-expense" />
              {t('w.cal_out')}
            </span>
          </div>
        ) : mode === 'net' ? (
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-subtle">
            {t('w.cal_minus')}
            {['heat-4', 'heat-2', 'heat-0', 'heat-in-2', 'heat-in-4'].map((c) => (
              <span key={c} className={`${c} h-3 w-3 rounded-[4px]`} />
            ))}
            {t('w.cal_plus')}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-subtle">
            {t('w.less_spent')}
            {[0, 1, 2, 3, 4].map((l) => (
              <span key={l} className={`${l === 0 ? 'heat-0' : mode === 'income' ? `heat-in-${l}` : `heat-${l}`} h-3 w-3 rounded-[4px]`} />
            ))}
            {t('w.more_spent')}
          </div>
        )}
        {/* Итог месяца — в выбранном виде. */}
        <div className="min-w-0 truncate text-right text-[12.5px] font-extrabold tabular" {...MASK}>
          {mode === 'expense' ? (
            <span className="text-expense-deep dark:text-expense">−{money(totals.expense)}</span>
          ) : mode === 'income' ? (
            <span className="text-income-deep dark:text-income-light">+{money(totals.income)}</span>
          ) : mode === 'net' ? (
            <span className={netMonth >= 0 ? 'text-income-deep dark:text-income-light' : 'text-expense-deep dark:text-expense'}>
              {netMonth > 0 ? '+' : netMonth < 0 ? '−' : ''}
              {money(Math.abs(netMonth))}
            </span>
          ) : (
            <>
              <span className="text-income-deep dark:text-income-light">+{money(totals.income)}</span>
              <span className="text-ink-subtle"> · </span>
              <span className="text-expense-deep dark:text-expense">−{money(totals.expense)}</span>
            </>
          )}
        </div>
      </div>
    </Widget>
  )
})
