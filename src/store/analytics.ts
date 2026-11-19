/**
 * Селекторы Аналитики (2.11): обзор и подсказки, календарь, шторка дня,
 * динамика, след категории. Отдельным модулем от стора: их и расчёты
 * lib/overview грузит только вкладка Аналитики (ленивый чанк), а стартовому
 * чанку с Главной они не нужны. Мемоизация — те же memo1/memo2 стора.
 */
import dayjs, { type Dayjs } from 'dayjs'
import {
  activeTransactions,
  memo1,
  memo2,
  periodBounds,
  selectAccountTransactions,
  selectAllCategories,
  selectAnalyticsCurrency,
  selectRecurring,
  txCurrency,
  UNIT,
  type Period,
  type State,
  type Transaction,
} from './transactions'
import { buildOverview, type Overview } from '../lib/overview'
import { recurringKey } from '../lib/recurring'
import { localDayKey, parseDay } from '../lib/day'

/* ---------- Тренды (виджет «Динамика» Аналитики) ---------- */

export type TrendGranularity = 'day' | 'week' | 'month' | 'year'

export interface TrendBucket {
  label: string
  income: number
  expense: number
  /** Границы корзины (локальные полуночи) — для подписи в подсказке графика. */
  start: number
  end: number
}

const TREND_COUNT: Record<TrendGranularity, number> = { day: 14, week: 12, month: 12, year: 5 }
/** Меньше корзин на графике не оставляем, даже если данных совсем немного. */
const TREND_MIN_BUCKETS = 4

function trendLabel(d: Dayjs, g: TrendGranularity): string {
  switch (g) {
    case 'day':
      return d.format('D.MM')
    case 'week':
      return d.startOf('week').format('D.MM')
    case 'month':
      return d.format('MMM')
    case 'year':
      return d.format('YYYY')
  }
}

/** Параметр — гранулярность (строка), чтобы memo2 кэшировал по ключу. */
export const selectTrend: (s: State, g: TrendGranularity) => TrendBucket[] = memo2((s, g) => {
  const n = TREND_COUNT[g]
  const unit: dayjs.ManipulateType = g
  const now = dayjs()
  const buckets = Array.from({ length: n }, (_, i) => {
    const d = now.subtract(n - 1 - i, unit)
    const start = d.startOf(unit)
    return { start: +start, end: +start.add(1, unit), label: trendLabel(d, g), income: 0, expense: 0 }
  })
  // Счёт = валюта. Складывать разные валюты нечем (курсов в приложении нет),
  // поэтому без выбранного счёта считаем основную валюту — ту же, в которой
  // подписан график (selectAnalyticsCurrency).
  const cur = s.account ?? s.currency
  for (const t of activeTransactions(s)) {
    if (txCurrency(t, s) !== cur) continue
    const x = parseDay(t.date)
    const b = buckets.find((bk) => x >= bk.start && x < bk.end)
    if (!b) continue
    if (t.type === 'income') b.income += t.amount
    else b.expense += t.amount
  }
  // Пустое прошлое не рисуем: у нового пользователя из двенадцати месяцев
  // одиннадцать были бы нулевыми, и график выглядел бы поломанным. Оставляем
  // минимум четыре корзины, чтобы не схлопнуть его в один столбик.
  const firstActive = buckets.findIndex((b) => b.income > 0 || b.expense > 0)
  const visible = firstActive > 0 ? buckets.slice(Math.min(firstActive, buckets.length - TREND_MIN_BUCKETS)) : buckets

  return visible.map(({ label, income, expense, start, end }) => ({ label, income, expense, start, end }))
})

/* ---------- Обзор (первый сегмент Аналитики) ---------- */

/** Сколько прошлых периодов берём для «обычной нормы» категории. */
const OVERVIEW_LOOKBACK = 3

/**
 * Границы предыдущих периодов такой же длины, свежайший первым.
 * Для «за всё время» предыдущего периода не существует — сравнивать не с чем.
 */
function previousWindows(p: Period, n: number): { start: number; end: number }[] {
  if (p.mode === 'all') return []
  const out: { start: number; end: number }[] = []

  if (p.mode === 'range') {
    // Произвольный диапазон сдвигаем на собственную длину.
    const { start, end } = periodBounds(p)
    const len = +end - +start
    for (let i = 1; i <= n; i++) out.push({ start: +start - len * i, end: +end - len * i })
    return out
  }

  const unit = UNIT[p.mode]
  for (let i = 1; i <= n; i++) {
    const anchor = dayjs(p.anchor).subtract(i, unit).format('YYYY-MM-DD')
    const { start, end } = periodBounds({ ...p, anchor })
    out.push({ start: +start, end: +end })
  }
  return out
}

/**
 * Всё, что нужно вкладке «Обзор», одним объектом.
 *
 * Один селектор, а не десяток: экран показывает срез целиком, а каждая
 * отдельная подписка — это ещё один шанс разбудить дерево. Считает он больше
 * остальных, поэтому deps перечислены честно: без изменения данных, периода,
 * счёта или лимита тело не выполняется вовсе.
 */
export const selectOverview: (s: State) => Overview = memo1(
  (s) => {
    const { start, end } = periodBounds(s.period)
    const recurring = selectRecurring(s)
    // Одна валюта, как и везде: текущий период уже отфильтрован
    // selectAccountTransactions, и прошлые окна должны считаться так же —
    // иначе сравнение «стало/было» складывало бы разные валюты.
    const cur = s.account ?? s.currency
    const inAccount = (t: Transaction) => txCurrency(t, s) === cur
    const all = activeTransactions(s)

    const windows = previousWindows(s.period, OVERVIEW_LOOKBACK)
    const previous: Transaction[][] = windows.map(() => [])

    // Один проход по истории на все окна сразу: операций может быть тысячи.
    // Заодно — первый день учёта (дни до него — не «без трат»).
    let firstDay = Infinity
    for (const t of all) {
      if (!inAccount(t)) continue
      const x = parseDay(t.date)
      if (!Number.isFinite(x)) continue
      if (x < firstDay) firstDay = x
      for (let i = 0; i < windows.length; i++) {
        if (x >= windows[i].start && x < windows[i].end) {
          previous[i].push(t)
          break
        }
      }
    }

    return buildOverview({
      current: selectAccountTransactions(s),
      previous,
      previousBounds: windows.map((w) => ({ start: localDayKey(w.start), end: localDayKey(w.end) })),
      categories: selectAllCategories(s),
      currency: selectAnalyticsCurrency(s),
      startKey: localDayKey(+start),
      endKey: localDayKey(+end),
      now: Date.now(),
      budget: s.monthlyBudget,
      // Лимит месячный — на неделе или годе полоса врала бы.
      budgetApplies: s.period.mode === 'month',
      // «За всё время» — окно 1970…2100, реальных границ у него нет.
      openEnded: s.period.mode === 'all',
      // Аренда и подписки — не «разовые покупки» и не «мелочь».
      recurringKeys: new Set(recurring.map((r) => recurringKey(r.categoryId, r.amount))),
      upcoming: recurring.map((r) => ({ amount: r.amount, day: r.nextDay })),
      firstDay: firstDay === Infinity ? undefined : firstDay,
    })
  },
  (s) => [activeTransactions(s), s.period, s.account, s.currency, s.monthlyBudget, s.customCategories],
)

/* ---------- Календарь Аналитики ---------- */

/** Итоги одного дня для календаря. */
export interface CalendarDay {
  expense: number
  income: number
  count: number
}

/**
 * Месяц календаря: итоги по дням в валюте счёта, индекс — число месяца (0 не
 * используется). Массив, а не Map: memo сравнивает результат по полям, а у Map
 * их нет — новый месяц «совпал» бы со старым, и календарь не обновлялся.
 * Параметр — начало месяца (локальная полночь), кэш — по нему: листая месяцы
 * туда-обратно, второй раз ничего не считаем.
 */
export const selectCalendarMonth: (s: State, monthStart: number) => (CalendarDay | null)[] = memo2(
  (s, monthStart) => {
    const first = new Date(monthStart)
    const next = +new Date(first.getFullYear(), first.getMonth() + 1, 1)
    const cur = s.account ?? s.currency
    const out: (CalendarDay | null)[] = new Array(32).fill(null)
    for (const t of activeTransactions(s)) {
      if (txCurrency(t, s) !== cur) continue
      const x = parseDay(t.date)
      if (!(x >= monthStart && x < next)) continue
      const d = new Date(x).getDate()
      const day = out[d] ?? (out[d] = { expense: 0, income: 0, count: 0 })
      if (t.type === 'income') day.income += t.amount
      else day.expense += t.amount
      day.count += 1
    }
    return out
  },
  (s, monthStart) => [activeTransactions(s), s.account, s.currency, monthStart],
)

/** Операции одного дня (локальная полночь) в валюте счёта — для шторки дня. */
export const selectDayTransactions: (s: State, dayKey: number) => Transaction[] = memo2(
  (s, dayKey) => {
    const cur = s.account ?? s.currency
    return activeTransactions(s)
      .filter((t) => txCurrency(t, s) === cur && parseDay(t.date) === dayKey)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
  },
  (s, dayKey) => [activeTransactions(s), s.account, s.currency, dayKey],
)

/* ---------- Помесячный след категории ---------- */

/** Сколько месяцев показываем в карточке категории. */
const CATEGORY_MONTHS = 6

export interface CategoryMonth {
  /** Короткая подпись месяца («авг.»). */
  label: string
  amount: number
  /** Начало месяца — ключом для React и для сортировки. */
  start: number
}

/**
 * Расходы категории по месяцам — «а как было раньше».
 *
 * Не зависит от выбранного периода: смысл именно в том, чтобы увидеть след
 * категории за полгода, каким бы месяцем ни листали Аналитику. Счёт при этом
 * учитывается — иначе в мультивалютном профиле сложились бы разные валюты.
 */
export const selectCategoryMonths: (s: State, categoryId: string) => CategoryMonth[] = memo2(
  (s, categoryId) => {
    const now = dayjs().startOf('month')
    const buckets = Array.from({ length: CATEGORY_MONTHS }, (_, i) => {
      const d = now.subtract(CATEGORY_MONTHS - 1 - i, 'month')
      return { start: +d, end: +d.add(1, 'month'), label: d.format('MMM'), amount: 0 }
    })
    const cur = s.account ?? s.currency
    for (const t of activeTransactions(s)) {
      if (t.type !== 'expense' || t.categoryId !== categoryId) continue
      if (txCurrency(t, s) !== cur) continue
      const x = parseDay(t.date)
      if (!Number.isFinite(x)) continue
      for (const b of buckets) {
        if (x >= b.start && x < b.end) {
          b.amount += t.amount
          break
        }
      }
    }
    return buckets.map(({ label, amount, start }) => ({ label, amount, start }))
  },
  (s, categoryId) => [activeTransactions(s), s.account, s.currency, categoryId],
)
