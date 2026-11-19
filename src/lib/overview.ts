/**
 * Расчёты вкладки «Аналитика»: показатели, подсказки, регулярные платежи.
 *
 * Модуль чистый: ничего не знает про стор и про React. На вход — уже отобранные
 * операции и границы окон, на выход — готовые числа и список подсказок. Так
 * весь расчёт видно целиком в одном файле и его можно проверять отдельно
 * (scripts/test-overview.mjs).
 *
 * Про «день» — везде localDayKey (локальная полночь), та же трактовка, что у
 * остальной аналитики; см. [[lib/day]]. Вторую здесь заводить нельзя, иначе
 * суммы в «Обзоре» разойдутся с календарём на границе суток.
 *
 * Про сравнения (2.11). Неполный период сравнивается с прошлым К ТОМУ ЖЕ ДНЮ:
 * 19 ноября — с 1–19 октября, а не со всем октябрём. Иначе середина любого
 * месяца выглядела экономией («−46% к прошлому»), а начало — чудом.
 *
 * Про стоимость: считается один раз на изменение данных (селектор в сторе
 * держит deps), но проходов по истории здесь несколько, поэтому внутри циклов
 * нет dayjs и нет создания промежуточных массивов.
 */

import type { Transaction } from '../store/transactions'
import type { Category } from '../store/categories'
import type { Currency } from './currencies'
import { daysBetween, localDayKey, nextDayKey, parseDay } from './day'
import { recurringKey } from './recurring'

/** Период длиннее — не строим разбивку по дням и прогноз (режим «за всё время»). */
const MAX_DAILY_DAYS = 400
/** Меньше — прогнозу не на чем держаться. */
const MIN_DAYS_FOR_FORECAST = 3
/** Ритм недели показываем, только когда каждый день недели успел встретиться. */
const MIN_DAYS_FOR_WEEKDAY = 14
/**
 * И только когда трат набралось хотя бы на неделю разных дней. Иначе две
 * операции за месяц рисуют «ритм» из одного столбика до потолка.
 */
const MIN_SPENT_DAYS_FOR_WEEKDAY = 7
/** Сколько самых дорогих покупок показываем. */
const TOP_BIGGEST = 3
/** Подсказок всего — больше экран не читается даже под «Ещё». */
const MAX_INSIGHTS = 8
/** Доля одной покупки в расходах периода, после которой о ней стоит сказать. */
const ONE_OFF_SHARE = 25
/** Меньше — это просто выходные, а не заслуга. */
const NO_SPEND_MIN_DAYS = 3
/** Покупка больше такой доли гибких трат — разовая: темп прогноза она не задаёт. */
const ONE_OFF_PACE_SHARE = 0.25

export interface CatDelta {
  categoryId: string
  name: string
  color: string
  icon: string
  amount: number
  /**
   * Сколько из этого — по сегодняшний день. Отличается от amount, когда что-то
   * записано наперёд (аренда 25-го — девятнадцатого): сравнивать с прошлым «к
   * тому же дню» можно только это, иначе будущая запись выглядит всплеском.
   */
  amountToDate: number
  /** С чем сравниваем: прошлый период целиком или к тому же дню (неполный). */
  prev: number
  /** Изменение в процентах; null — сравнивать не с чем. */
  deltaPct: number | null
  /** Доля от расходов (доходов) периода. */
  pct: number
}

interface InsightBase {
  id: string
  /** Вес: выше — важнее, сверху списка. */
  score: number
}
interface CatRef {
  categoryId: string
  name: string
  color: string
  icon: string
}

export type Insight = InsightBase &
  (
    /** Прогноз против месячного лимита; perDayLeft — сколько можно в день, чтобы уложиться. */
    | { kind: 'budget'; over: boolean; projected: number; budget: number; rest: number; perDayLeft: number; daysLeft: number }
    /** Расходы обогнали доходы периода. */
    | { kind: 'overspend'; diff: number }
    /** К концу периода выйдет заметно больше (меньше), чем в прошлый раз. */
    | { kind: 'pace'; over: boolean; diff: number; prev: number }
    /** Категория заметно дороже обычного к этому дню. */
    | ({ kind: 'spike'; amount: number; usual: number; pct: number } & CatRef)
    /** Категория заметно дешевле обычного — повод себя похвалить. */
    | ({ kind: 'drop'; amount: number; usual: number; pct: number } & CatRef)
    /** Категория дорожает несколько завершённых периодов подряд. */
    | ({ kind: 'trend'; values: number[] } & CatRef)
    /** Одна покупка забрала заметную долю периода. */
    | { kind: 'one_off'; categoryId: string; name: string; note: string; color: string; amount: number; share: number }
    /** Категория, которой в прошлые периоды не было вовсе. */
    | ({ kind: 'new_cat'; amount: number } & CatRef)
    /** В выходные день обходится заметно дороже будней. */
    | { kind: 'weekend'; ratio: number; weekend: number; weekday: number }
    /** Самый дорогой день недели против самого дешёвого. */
    | { kind: 'weekday'; day: number; avg: number; minDay: number; minAvg: number }
    /** Мелочь складывается: много покупок до limit. */
    | { kind: 'small'; count: number; total: number; limit: number; share: number }
    /** Доля дохода, которая осталась. */
    | { kind: 'savings'; rate: number; saved: number; prevRate: number | null }
    /** Доходы в прошлые периоды записывались, а в этом их нет. */
    | { kind: 'no_income' }
    /** Несколько дней подряд без единой траты. */
    | { kind: 'no_spend'; days: number }
    /** Самый дорогой день периода. */
    | { kind: 'peak_day'; key: number; amount: number; times: number }
  )

export interface Overview {
  currency: Currency
  /** Границы периода в локальных полуночах — для подписей с датой. */
  startKey: number
  endKey: number
  spent: number
  income: number
  /** Период закончился (прошлый месяц) — сравнения идут по полным периодам. */
  complete: boolean
  /** С чем сравниваем расходы: прошлый период к тому же дню (или целиком). */
  prevSpent: number | null
  /** Прошлый период целиком — для подписи «в октябре всего…». */
  prevSpentFull: number | null
  /** Изменение к прошлому периоду в процентах; null — сравнивать не с чем. */
  deltaPct: number | null
  /** Доход прошлого периода целиком. */
  prevIncome: number | null
  /** Расходы по каждому дню периода. Пусто для слишком длинных периодов. */
  daily: number[]
  /** Доходы по каждому дню периода (та же длина, что daily). */
  dailyIncome: number[]
  daysTotal: number
  /** Сколько дней периода уже прожито. Равно daysTotal для прошедших периодов. */
  daysPassed: number
  /**
   * Сколько из прожитых дней человек уже вёл учёт: начал записывать 15-го —
   * дни с 1-го по 14-е не «без трат», а «ещё не записывал». По ним — средний
   * день, дни без трат, темп прогноза и ритм недели.
   */
  daysTracked: number
  /** Прогноз на оставшиеся дни. Пусто, если период кончился или данных мало. */
  forecast: number[]
  /**
   * Расходы по уже прожитым дням периода. Отличается от spent, когда операции
   * записаны будущим числом внутри периода (например, аренда вперёд).
   */
  spentToDate: number
  /** Средние расходы в день по прожитой части периода. */
  perDay: number
  /** Обычный расход в день — медиана прошлых периодов; null — истории нет. */
  usualPerDay: number | null
  /** Расходы к концу периода: прожитое плюс прогноз. */
  projected: number
  /** Сколько покупок (трат) и средний чек; у прошлого периода — к тому же дню. */
  expenseCount: number
  avgCheck: number
  prevAvgCheck: number | null
  /**
   * Прожитые дни без единой траты и такие дни подряд до сегодня. Сегодня, пока
   * трат нет, не считается: день ещё не кончился. noSpendOf — из скольких дней.
   */
  noSpendDays: number
  noSpendStreak: number
  noSpendOf: number
  /**
   * В периоде смешаны валюты, а счёт не выбран — суммы складывать нельзя и
   * итог в шапке бессмысленен. Экран должен об этом сказать.
   */
  mixedCurrency: boolean
  /** Месячный лимит; 0 — не задан или неприменим к этому периоду. */
  budget: number
  /** Средние расходы по дням недели, пн…вс. Пусто для коротких периодов. */
  weekday: number[]
  /** Все категории расходов, по убыванию, с изменением к прошлому. */
  categories: CatDelta[]
  /** Категории доходов, по убыванию. */
  incomeCategories: CatDelta[]
  /** Крупные покупки — без регулярных платежей (аренда — не покупка). */
  biggest: Transaction[]
  insights: Insight[]
}

export interface OverviewInput {
  /** Операции текущего периода с учётом выбранного счёта. */
  current: Transaction[]
  /** Операции предыдущих периодов той же длины, свежайший первым. */
  previous: Transaction[][]
  /** Границы предыдущих периодов (локальные полуночи), в том же порядке. */
  previousBounds?: { start: number; end: number }[]
  categories: Category[]
  currency: Currency
  /** Границы текущего периода в локальных полуночах. */
  startKey: number
  endKey: number
  /** «Сейчас» — параметром, чтобы расчёт был проверяемым. */
  now: number
  /** Месячный лимит; 0 — не задан. */
  budget: number
  /** Лимит имеет смысл только для месячного периода. */
  budgetApplies: boolean
  /**
   * Период без настоящих границ — «за всё время». Окно тогда сужается до самих
   * данных, см. buildOverview.
   */
  openEnded?: boolean
  /** Ключи регулярных платежей (recurringKey): они не «разовые покупки». */
  recurringKeys?: ReadonlySet<string>
  /**
   * Регулярные платежи, которых ждём: сумма и день (локальная полночь,
   * Recurring.nextDay). День уже прошёл — платёж просрочен, ждём завтра.
   * Прогноз кладёт их в свой день, а не размазывает по месяцу.
   */
  upcoming?: { amount: number; day: number }[]
  /**
   * Первый день учёта: локальная полночь самой ранней записи в этой валюте.
   * Прошлый период, начавшийся раньше, учтён не целиком — сравнивать с ним
   * нельзя (см. sliceWindow).
   */
  firstDay?: number
}

/** День операции как локальная полночь. */
const txDay = (t: Transaction) => parseDay(t.date)

const median = (xs: number[]): number => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Срез прошлого периода: целиком и к тому же дню, что прожит в текущем. */
interface Window {
  /**
   * Учёт начался посреди окна: человек пришёл 15 октября — октябрь у него не
   * «дешёвый», а записан наполовину. С таким окном не сравниваем ничего:
   * ни «к этому дню», ни обычный день, ни всплески, ни тренды.
   */
  partial: boolean
  spent: number
  spentToDate: number
  income: number
  count: number
  countToDate: number
  days: number
  cats: Map<string, number>
  catsToDate: Map<string, number>
}

/** Запаздывание учёта, которое окну прощаем: начал второго числа — месяц целый. */
const PARTIAL_GRACE = 0.07

function sliceWindow(txs: Transaction[], bounds: { start: number; end: number } | undefined, daysPassed: number, firstDay: number): Window {
  const w: Window = { partial: false, spent: 0, spentToDate: 0, income: 0, count: 0, countToDate: 0, days: 0, cats: new Map(), catsToDate: new Map() }
  const start = bounds?.start
  let first = Infinity
  let last = -Infinity
  for (const t of txs) {
    const d = txDay(t)
    if (Number.isFinite(d)) {
      if (d < first) first = d
      if (d > last) last = d
    }
    if (t.type === 'income') {
      w.income += t.amount
      continue
    }
    w.spent += t.amount
    w.count += 1
    w.cats.set(t.categoryId, (w.cats.get(t.categoryId) ?? 0) + t.amount)
    // Без начала окна «к тому же дню» не посчитать — считаем окно целиком.
    const early = start === undefined || daysBetween(start, d) < daysPassed
    if (early) {
      w.spentToDate += t.amount
      w.countToDate += 1
      w.catsToDate.set(t.categoryId, (w.catsToDate.get(t.categoryId) ?? 0) + t.amount)
    }
  }
  // Длина окна — по его границам; без них (проверки) — по самим данным.
  w.days = bounds ? Math.max(1, daysBetween(bounds.start, bounds.end)) : first === Infinity ? 0 : daysBetween(first, last) + 1
  if (bounds && firstDay > bounds.start) w.partial = daysBetween(bounds.start, firstDay) > Math.floor(w.days * PARTIAL_GRACE)
  return w
}

export function buildOverview(input: OverviewInput): Overview {
  const { current, previous, categories, currency, now, budget, budgetApplies, openEnded } = input
  const recurringKeys = input.recurringKeys ?? new Set<string>()

  /* ---------- Окно периода ----------
     «За всё время» — это границы 1970…2100, а не дни, в которые человек жил.
     Считать по ним нельзя: расход в день делился бы на двадцать тысяч дней,
     разбивки по дням для такого окна нет вовсе (MAX_DAILY_DAYS), а цикл «дней
     подряд без трат» читал пустой массив и насчитывал их с 1970 года. Сужаем
     окно до самих данных: от первой операции до последней (но не раньше, чем
     до сегодня — иначе «сегодня» оказался бы за границей периода). */
  let startKey = input.startKey
  let endKey = input.endKey
  if (openEnded) {
    const todayKey = localDayKey(now)
    let first = Infinity
    let last = -Infinity
    for (const t of current) {
      const d = txDay(t)
      if (!Number.isFinite(d)) continue
      if (d < first) first = d
      if (d > last) last = d
    }
    startKey = first === Infinity ? todayKey : Math.min(first, todayKey)
    endKey = nextDayKey(last === -Infinity ? todayKey : Math.max(last, todayKey))
  }

  // Складывать евро с рублями нельзя. Счёт не выбран и валют больше одной —
  // предупреждаем, вместо того чтобы молча показать сумму-бессмыслицу.
  let mixedCurrency = false
  for (const t of current) {
    if ((t.currency ?? currency) !== currency) {
      mixedCurrency = true
      break
    }
  }

  /* ---------- Разбивка по дням ---------- */
  const daysTotal = Math.max(1, daysBetween(startKey, endKey))
  const trackDaily = daysTotal <= MAX_DAILY_DAYS
  const daily = trackDaily ? new Array<number>(daysTotal).fill(0) : []
  const dailyIncome = trackDaily ? new Array<number>(daysTotal).fill(0) : []
  // Регулярные платежи по дням: аренда пятого числа — не привычка тратить, и
  // ни темп, ни ритм недели она задавать не должна.
  const fixedDaily = trackDaily ? new Array<number>(daysTotal).fill(0) : []

  let spent = 0
  let income = 0
  let expenseCount = 0
  for (const t of current) {
    if (t.type === 'income') income += t.amount
    else {
      spent += t.amount
      expenseCount += 1
    }
    if (!trackDaily) continue
    const i = daysBetween(startKey, txDay(t))
    if (i >= 0 && i < daysTotal) {
      if (t.type === 'income') dailyIncome[i] += t.amount
      else {
        daily[i] += t.amount
        if (recurringKeys.has(recurringKey(t.categoryId, t.amount))) fixedDaily[i] += t.amount
      }
    }
  }

  const todayKey = localDayKey(now)
  const daysPassed =
    todayKey >= endKey ? daysTotal : todayKey < startKey ? 0 : Math.min(daysTotal, daysBetween(startKey, todayKey) + 1)
  const complete = daysPassed >= daysTotal
  // С какого дня периода идёт учёт (индекс) и сколько таких дней уже прожито.
  const trackFrom =
    input.firstDay !== undefined && Number.isFinite(input.firstDay) && input.firstDay > startKey
      ? Math.min(daysPassed, daysBetween(startKey, input.firstDay))
      : 0
  const daysTracked = daysPassed - trackFrom

  /* ---------- Прошлые периоды: целиком и к тому же дню ---------- */
  const firstDay = input.firstDay !== undefined && Number.isFinite(input.firstDay) ? input.firstDay : -Infinity
  const windows = previous.map((txs, i) => sliceWindow(txs, input.previousBounds?.[i], daysPassed, firstDay))
  // Окна, учтённые не целиком, в сравнения не идут вовсе (Window.partial).
  const filled = windows.filter((w) => !w.partial && (w.spent > 0 || w.income > 0))
  const prev0 = windows.length && !windows[0].partial ? windows[0] : null

  const spentToDate = trackDaily ? sumRange(daily, 0, daysPassed) : spent
  const prevSpent = prev0 ? (complete ? prev0.spent : prev0.spentToDate) : null
  const prevSpentFull = prev0 ? prev0.spent : null
  const base = complete ? spent : spentToDate
  const deltaPct = prevSpent && prevSpent > 0 ? ((base - prevSpent) / prevSpent) * 100 : null

  /* ---------- Ритм недели ----------
     Без регулярных платежей и без разовых крупных покупок: аренда, списанная
     в четверг, делала четверг «самым дорогим днём» на весь месяц, а зимняя
     куртка — понедельник. Это дата договора и случай, а не привычка. */
  const habit = trackDaily ? daily.map((v, i) => v - fixedDaily[i]) : []
  const oneOff = trackDaily ? oneOffDaily(current, recurringKeys, habit, startKey, daysPassed) : []
  const steady = trackDaily ? habit.map((v, i) => v - oneOff[i]) : []
  let spentDays = 0
  if (trackDaily) for (let i = trackFrom; i < daysPassed; i++) if (steady[i] > 0) spentDays += 1
  const weekday =
    trackDaily && daysTracked >= MIN_DAYS_FOR_WEEKDAY && spentDays >= MIN_SPENT_DAYS_FOR_WEEKDAY
      ? weekdayAverages(steady, startKey, trackFrom, daysPassed)
      : []

  /* ---------- Прогноз до конца периода ----------
     Темп считаем ТОЛЬКО по прожитым дням. Иначе записанная вперёд аренда
     задирает средний расход в день, а потом ещё раз добавляется прогнозом
     на тот же день — месяц «выходил» вдвое дороже, чем на самом деле. */
  const perDay = daysTracked > 0 ? spentToDate / daysTracked : 0
  // Прогноз — когда учёт идёт хотя бы три дня: по одной записи новичка
  // «к концу месяца выйдет 553 ₽» — не прогноз, а шум.
  // «За всё время» — не период с концом: запись наперёд растягивала окно до
  // января, и герой обещал «к 5 января ≈ 95 000, ещё 47 дней».
  const canForecast = !openEnded && trackDaily && daysTracked >= MIN_DAYS_FOR_FORECAST && daysPassed < daysTotal
  const expected = canForecast ? expectedPayments(input.upcoming ?? [], startKey, todayKey, daysPassed, daysTotal) : []
  const forecast = canForecast
    ? buildForecast({
        // Темп — по тем же «ровным» тратам: без регулярных и разовых.
        pace: daysTracked > 0 ? sumRange(steady, 0, daysPassed) / daysTracked : 0,
        weekday,
        habit,
        fixed: fixedDaily,
        expected,
        startKey,
        daysPassed,
        daysTotal,
      })
    : []
  const projected = spentToDate + forecast.reduce((a, b) => a + b, 0)
  // Что до конца периода уже не изменить: записано наперёд и ждущие платежи.
  // «В день можно до…» считается за их вычетом — иначе аренда 25-го съедала
  // бы деньги, которые подсказка уже разрешила потратить.
  const committed = canForecast ? sumRange(daily, daysPassed, daysTotal) + expected.reduce((a, b) => a + b, 0) : 0
  // Обычный день — к тому же дню прошлых периодов: аренда пятого числа в
  // неполном месяце делит на 19 дней, а в полном — на 31, и «средний день»
  // в середине месяца всегда выходил бы дороже обычного.
  const usualPerDay = filled.length
    ? median(filled.filter((w) => w.days > 0).map((w) => (complete || daysPassed <= 0 ? w.spent / w.days : w.spentToDate / Math.min(daysPassed, w.days)))) || null
    : null

  /* ---------- Дни без трат ---------- */
  // Сегодня без трат — ещё не «день без трат»: вечером может быть ужин.
  let noSpendDays = 0
  let noSpendStreak = 0
  let noSpendOf = daysTracked
  if (trackDaily) {
    const todayOpen = !complete && daysPassed > trackFrom && daily[daysPassed - 1] === 0
    const lastDone = todayOpen ? daysPassed - 1 : daysPassed
    if (todayOpen) noSpendOf -= 1
    for (let i = trackFrom; i < lastDone; i++) if (daily[i] === 0) noSpendDays += 1
    for (let i = lastDone - 1; i >= trackFrom && daily[i] === 0; i--) noSpendStreak += 1
  }

  /* ---------- Категории с изменениями ---------- */
  const byId = new Map(categories.map((c) => [c.id, c]))
  const ref = (categoryId: string): CatRef => {
    const c = byId.get(categoryId)
    return { categoryId, name: c?.name ?? categoryId, color: c?.color ?? '#8A968F', icon: c?.icon ?? 'other' }
  }
  const curCats = new Map<string, number>()
  const curCatsToDate = new Map<string, number>()
  const curInc = new Map<string, number>()
  // Граница «по сегодня»: записанное наперёд сравнивать с прошлым к тому же
  // дню нельзя — в прошлом месяце этого дня ещё не было.
  const tomorrowKey = complete ? Infinity : shiftDay(startKey, daysPassed)
  for (const t of current) {
    const m = t.type === 'income' ? curInc : curCats
    m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + t.amount)
    if (t.type !== 'income' && txDay(t) < tomorrowKey) curCatsToDate.set(t.categoryId, (curCatsToDate.get(t.categoryId) ?? 0) + t.amount)
  }
  const prevCats = prev0 ? (complete ? prev0.cats : prev0.catsToDate) : null
  const cats: CatDelta[] = [...curCats.entries()]
    .map(([categoryId, amount]) => {
      const was = prevCats?.get(categoryId) ?? 0
      const amountToDate = curCatsToDate.get(categoryId) ?? 0
      return {
        ...ref(categoryId),
        amount,
        amountToDate,
        prev: was,
        deltaPct: was > 0 ? ((amountToDate - was) / was) * 100 : null,
        pct: spent > 0 ? (amount / spent) * 100 : 0,
      }
    })
    .sort((a, b) => b.amount - a.amount)
  const incomeCats: CatDelta[] = [...curInc.entries()]
    .map(([categoryId, amount]) => ({ ...ref(categoryId), amount, amountToDate: amount, prev: 0, deltaPct: null, pct: income > 0 ? (amount / income) * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount)

  // Крупные покупки — без регулярных платежей: аренда каждый месяц сверху
  // списка ничего не сообщает, а «зимняя куртка» — сообщает.
  const purchases = current.filter((t) => t.type === 'expense' && !recurringKeys.has(recurringKey(t.categoryId, t.amount)))
  const biggest = purchases.sort((a, b) => b.amount - a.amount).slice(0, TOP_BIGGEST)

  const avgCheck = expenseCount > 0 ? spent / expenseCount : 0
  const prevCount = prev0 ? (complete ? prev0.count : prev0.countToDate) : 0
  const prevAvgCheck = prev0 && prevCount > 0 && prevSpent !== null ? prevSpent / prevCount : null

  const insights = buildInsights({
    cats,
    biggest: biggest[0] ?? null,
    daily,
    habit,
    trackFrom,
    startKey,
    daysPassed,
    daysTotal,
    complete,
    windows,
    spent,
    spentToDate,
    perDay,
    income,
    expenseCount,
    weekday,
    forecast,
    projected,
    committed,
    prevSpentFull,
    current,
    recurringKeys,
    noSpendStreak,
    budget: budgetApplies ? budget : 0,
    ref,
  })

  return {
    currency,
    startKey,
    endKey,
    spent,
    income,
    complete,
    spentToDate,
    perDay,
    usualPerDay,
    mixedCurrency,
    prevSpent,
    prevSpentFull,
    deltaPct,
    // Доход прошлого периода — только сигнал «обычно он приходит» (Kpis): тут
    // и неполное окно годится — зарплата, записанная в нём, приходила.
    prevIncome: windows.length ? windows[0].income : null,
    daily,
    dailyIncome,
    daysTotal,
    daysPassed,
    daysTracked,
    forecast,
    projected,
    expenseCount,
    avgCheck,
    prevAvgCheck,
    noSpendDays,
    noSpendStreak,
    noSpendOf,
    budget: budgetApplies ? budget : 0,
    weekday,
    categories: cats,
    incomeCategories: incomeCats,
    biggest,
    insights,
  }
}

/* ---------- Внутренности ---------- */

const sumRange = (a: number[], from: number, to: number) => {
  let sum = 0
  for (let i = from; i < to; i++) sum += a[i]
  return sum
}

/**
 * Средние расходы по дням недели за прожитую часть периода. Делим на число
 * ВСТРЕТИВШИХСЯ дней недели, а не на семь: в неполном месяце понедельников
 * может быть на один больше, чем воскресений.
 */
function weekdayAverages(daily: number[], startKey: number, from: number, daysPassed: number): number[] {
  const sum = new Array<number>(7).fill(0)
  const count = new Array<number>(7).fill(0)
  const cursor = new Date(startKey)
  cursor.setDate(cursor.getDate() + from)
  for (let i = from; i < daysPassed; i++) {
    const w = (cursor.getDay() + 6) % 7
    sum[w] += daily[i]
    count[w] += 1
    cursor.setDate(cursor.getDate() + 1)
  }
  return sum.map((v, i) => (count[i] ? v / count[i] : 0))
}

/**
 * Разовые крупные покупки по дням прожитой части периода — то, что не задаёт
 * ни темп прогноза, ни ритм недели. Аренда пятого числа, размазанная по месяцу,
 * делала его вдвое дороже (к шестому числу темп — 9 000 в день вместо 3 500),
 * а зимняя куртка объявляла, что куртки будут покупаться каждую неделю.
 * Разовой считаем покупку (не регулярный платёж), которая одна — больше
 * четверти гибких трат; у новичка (меньше шести трат) — ничего: судить не по чему.
 */
function oneOffDaily(current: Transaction[], recurringKeys: ReadonlySet<string>, habit: number[], startKey: number, daysPassed: number): number[] {
  const out = new Array<number>(habit.length).fill(0)
  const toDate = sumRange(habit, 0, daysPassed)
  let count = 0
  const big: { i: number; amount: number }[] = []
  for (const t of current) {
    if (t.type !== 'expense' || recurringKeys.has(recurringKey(t.categoryId, t.amount))) continue
    const i = daysBetween(startKey, txDay(t))
    if (i < 0 || i >= daysPassed) continue
    count += 1
    if (t.amount >= toDate * ONE_OFF_PACE_SHARE) big.push({ i, amount: t.amount })
  }
  if (count >= 6) for (const b of big) out[b.i] += b.amount
  return out
}

/**
 * Прогноз на оставшиеся дни: гибкий темп, разложенный по дням недели (суббота
 * у большинства дороже понедельника, а ровная линия читалась бы как «данных
 * нет»), плюс регулярные платежи — в свой день: связь двенадцатого, фитнес
 * двадцать второго. То, что уже записано наперёд, — факт, а не оценка.
 */
function buildForecast(x: {
  pace: number
  weekday: number[]
  habit: number[]
  fixed: number[]
  /** Ожидаемые регулярные платежи по оставшимся дням (expectedPayments). */
  expected: number[]
  startKey: number
  daysPassed: number
  daysTotal: number
}): number[] {
  // Коэффициенты дня недели со средним 1. Без данных о ритме — ровный темп.
  let factor = new Array<number>(7).fill(1)
  const mean = x.weekday.length ? x.weekday.reduce((a, b) => a + b, 0) / 7 : 0
  if (mean > 0) {
    // Обрезаем края: один разовый выброс не должен растягивать прогноз втрое.
    factor = x.weekday.map((v) => Math.min(2, Math.max(0.4, v / mean)))
  }

  const out: number[] = []
  const cursor = new Date(x.startKey)
  cursor.setDate(cursor.getDate() + x.daysPassed)
  for (let i = x.daysPassed; i < x.daysTotal; i++) {
    const usual = x.pace * factor[(cursor.getDay() + 6) % 7]
    // Записанное наперёд не может оказаться НИЖЕ прогноза: это уже факт.
    out.push(Math.max(x.habit[i] ?? 0, usual) + (x.fixed[i] ?? 0) + x.expected[i - x.daysPassed])
    cursor.setDate(cursor.getDate() + 1)
  }
  return out
}

/**
 * Ожидаемые регулярные платежи по оставшимся дням периода: каждый месяц до
 * конца периода (в годе их одиннадцать, а не один); просроченный (срок
 * прошёл, записи нет) — завтра.
 */
function expectedPayments(upcoming: { amount: number; day: number }[], startKey: number, todayKey: number, daysPassed: number, daysTotal: number): number[] {
  const expected = new Array<number>(daysTotal - daysPassed).fill(0)
  const endKey = shiftDay(startKey, daysTotal)
  for (const u of upcoming) {
    const dom = new Date(u.day).getDate()
    let day = u.day
    if (day <= todayKey) {
      expected[0] += u.amount
      while (day <= todayKey) day = nextMonthDay(day, dom)
    }
    for (; day < endKey; day = nextMonthDay(day, dom)) {
      const i = daysBetween(startKey, day)
      if (i >= daysPassed && i < daysTotal) expected[i - daysPassed] += u.amount
    }
  }
  return expected
}

/** То же число через месяц; в коротком месяце — его последний день (31 → 30). */
function nextMonthDay(key: number, dom: number): number {
  const d = new Date(key)
  d.setDate(1)
  d.setMonth(d.getMonth() + 1)
  d.setDate(Math.min(dom, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()))
  d.setHours(0, 0, 0, 0)
  return +d
}

/** День через n дней — через Date: в сутки перевода часов не 24 часа. */
function shiftDay(key: number, n: number): number {
  const d = new Date(key)
  d.setDate(d.getDate() + n)
  d.setHours(0, 0, 0, 0)
  return +d
}

/** Круглая граница «мелочи»: 1, 2, 5 × 10ⁿ — «до 500 ₽», а не «до 437 ₽». */
function niceLimit(v: number): number {
  if (v <= 0) return 0
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  const m = v / p
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p
}

interface InsightInput {
  cats: CatDelta[]
  /** Самая крупная покупка периода (без регулярных платежей). */
  biggest: Transaction | null
  /** Расходы по дням периода и где начало. */
  daily: number[]
  /** То же без регулярных платежей. */
  habit: number[]
  /** С какого дня периода (индекс) идёт учёт. */
  trackFrom: number
  startKey: number
  daysPassed: number
  daysTotal: number
  complete: boolean
  windows: Window[]
  spent: number
  spentToDate: number
  perDay: number
  income: number
  /** Сколько трат в периоде: «одна покупка — 100%» у новичка ничего не значит. */
  expenseCount: number
  weekday: number[]
  forecast: number[]
  projected: number
  /** Записано наперёд и ждущие регулярные платежи до конца периода. */
  committed: number
  prevSpentFull: number | null
  current: Transaction[]
  recurringKeys: ReadonlySet<string>
  noSpendStreak: number
  budget: number
  ref: (categoryId: string) => CatRef
}

/**
 * Подсказки. Каждое правило отвечает «на что обратить внимание» и получает вес;
 * сверху — то, что требует действия (лимит, перерасход), ниже — наблюдения и
 * поводы похвалить. Об одной категории говорим один раз — самым важным.
 */
function buildInsights(x: InsightInput): Insight[] {
  const out: Insight[] = []
  const filled = x.windows.filter((w) => !w.partial && w.spent > 0)
  const base = x.complete ? x.spent : x.spentToDate
  // Сумма категории для сравнений: в идущем периоде — по сегодня (CatDelta).
  const now = (c: CatDelta) => (x.complete ? c.amount : c.amountToDate)
  const usualOf = (categoryId: string) =>
    median(filled.map((w) => (x.complete ? w.cats : w.catsToDate).get(categoryId) ?? 0))

  /* 1. Куда придём к концу периода: к лимиту, если он задан. И сколько тогда
        можно в день, чтобы уложиться, — это и есть совет, а не упрёк. */
  const daysLeft = x.daysTotal - x.daysPassed
  if (x.budget > 0 && x.forecast.length > 0) {
    const over = x.projected > x.budget
    out.push({
      id: 'budget',
      kind: 'budget',
      score: over ? 96 : 30,
      over,
      projected: x.projected,
      budget: x.budget,
      rest: Math.abs(x.budget - x.projected),
      perDayLeft: Math.max(0, x.budget - x.spentToDate - x.committed) / Math.max(1, daysLeft),
      daysLeft,
    })
  } else if (x.forecast.length > 0 && x.prevSpentFull && x.prevSpentFull > 0) {
    const diff = x.projected - x.prevSpentFull
    // Разница меньше десятой — это шум, говорить не о чем.
    if (Math.abs(diff) > x.prevSpentFull * 0.1) {
      out.push({ id: 'pace', kind: 'pace', score: diff > 0 ? 58 : 34, over: diff > 0, diff: Math.abs(diff), prev: x.prevSpentFull })
    }
  }

  /* 2. Расходы обогнали доходы. В идущем периоде — только если доход уже
        пришёл в обычном объёме: иначе зарплата 25-го просто ещё впереди. */
  const w0 = x.windows[0] && !x.windows[0].partial ? x.windows[0] : null
  const prevIncome = w0?.income ?? 0
  const incomeIn = x.complete || (prevIncome > 0 && x.income >= prevIncome * 0.9)
  if (x.income > 0 && x.spent > x.income && incomeIn) {
    out.push({ id: 'overspend', kind: 'overspend', score: 86, diff: x.spent - x.income })
  } else if (x.income > 0 && incomeIn) {
    /* 3. Сколько дохода осталось — повод похвалить, если откладывается заметная доля. */
    const rate = ((x.income - x.spent) / x.income) * 100
    const prevRate = w0 && w0.income > 0 ? ((w0.income - w0.spent) / w0.income) * 100 : null
    if (rate >= 10) {
      out.push({
        id: 'savings',
        kind: 'savings',
        score: 36 + (prevRate !== null && rate - prevRate >= 5 ? 8 : 0),
        rate,
        saved: x.income - x.spent,
        prevRate,
      })
    }
  }

  /* 4. Доходы раньше записывались, а сейчас их нет: остаток врёт. */
  if (!x.complete && x.income === 0 && x.daysPassed >= 10 && x.windows.some((w) => w.income > 0) && x.spentToDate > 0) {
    out.push({ id: 'no_income', kind: 'no_income', score: 44 })
  }

  /* 5. Категория вышла за свою норму (медиана прошлых периодов к тому же
        дню). Нужно минимум два периода истории: один аномальный месяц не
        должен объявлять нормой сам себя. И обратное — заметно меньше обычного. */
  if (filled.length >= 2) {
    // Не больше двух всплесков и одного падения — самых крупных в деньгах.
    const spikes: { cat: CatDelta; usual: number; excess: number }[] = []
    for (const cat of x.cats.slice(0, 6)) {
      const usual = usualOf(cat.categoryId)
      // Изменение должно быть заметным на фоне всех расходов, а не «на 3 евро».
      const amount = now(cat)
      if (usual > 0 && amount >= usual * 1.4 && amount - usual >= base * 0.05) {
        spikes.push({ cat, usual, excess: amount - usual })
      }
    }
    for (const { cat, usual } of spikes.sort((a, b) => b.excess - a.excess).slice(0, 2)) {
      const amount = now(cat)
      const pct = ((amount - usual) / usual) * 100
      out.push({ id: 'spike:' + cat.categoryId, kind: 'spike', score: 70 + Math.min(15, pct / 20), ...x.ref(cat.categoryId), amount, usual, pct })
    }
    let drop: { categoryId: string; usual: number; amount: number } | null = null
    for (const [categoryId] of filled[0].cats) {
      const usual = usualOf(categoryId)
      const c = x.cats.find((v) => v.categoryId === categoryId)
      const amount = c ? now(c) : 0
      if (usual <= 0 || amount > usual * 0.6 || usual - amount < base * 0.05) continue
      if (!drop || usual - amount > drop.usual - drop.amount) drop = { categoryId, usual, amount }
    }
    if (drop) {
      const pct = ((drop.usual - drop.amount) / drop.usual) * 100
      out.push({ id: 'drop:' + drop.categoryId, kind: 'drop', score: 32, ...x.ref(drop.categoryId), amount: drop.amount, usual: drop.usual, pct })
    }
  }

  /* 6. Категория дорожает три завершённых периода подряд — тренд, а не всплеск. */
  if (x.windows.length >= 3 && x.windows.every((w) => !w.partial && w.spent > 0)) {
    const [w0, w1, w2] = x.windows
    let best: { categoryId: string; values: number[]; growth: number } | null = null
    for (const [categoryId, a0] of w0.cats) {
      const a1 = w1.cats.get(categoryId) ?? 0
      const a2 = w2.cats.get(categoryId) ?? 0
      if (a2 <= 0 || a1 < a2 * 1.1 || a0 < a1 * 1.1 || a0 < w0.spent * 0.05) continue
      const growth = a0 / a2
      if (!best || growth > best.growth) best = { categoryId, values: [a2, a1, a0], growth }
    }
    if (best) out.push({ id: 'trend:' + best.categoryId, kind: 'trend', score: 50, ...x.ref(best.categoryId), values: best.values })
  }

  /* 7. Одна покупка забрала заметную долю периода. Регулярные платежи — не
        покупки: аренда и так каждый месяц самая крупная. */
  if (x.biggest && x.spent > 0 && x.expenseCount >= 6) {
    const share = (x.biggest.amount / x.spent) * 100
    if (share >= ONE_OFF_SHARE) {
      const c = x.ref(x.biggest.categoryId)
      out.push({
        id: 'one_off:' + x.biggest.id,
        kind: 'one_off',
        score: 54,
        categoryId: c.categoryId,
        // Имя категории экран переводит сам (catName); заметка — как есть.
        name: c.name,
        note: x.biggest.note?.trim() ?? '',
        color: c.color,
        amount: x.biggest.amount,
        share,
      })
    }
  }

  /* 8. Категория, которой раньше не было вовсе. Часто это разовая история
        (переезд, лечение), и человеку полезно увидеть её отдельной строкой. */
  if (filled.length >= 2) {
    for (const cat of x.cats.slice(0, 3)) {
      if (filled.some((w) => (w.cats.get(cat.categoryId) ?? 0) > 0)) continue
      if (cat.amount < x.spent * 0.08) continue
      out.push({ id: 'new_cat:' + cat.categoryId, kind: 'new_cat', score: 25, ...x.ref(cat.categoryId), amount: cat.amount })
      break
    }
  }

  /* 9. Выходные против будней: обычный (медианный) день, а не сумма — суббот
        меньше, и одна крупная покупка во вторник не должна переворачивать вывод. */
  if (x.habit.length > 0) {
    const we: number[] = []
    const wd: number[] = []
    const cursor = new Date(x.startKey)
    cursor.setDate(cursor.getDate() + x.trackFrom)
    for (let i = x.trackFrom; i < Math.min(x.daysPassed, x.habit.length); i++) {
      const dow = cursor.getDay()
      ;(dow === 0 || dow === 6 ? we : wd).push(x.habit[i])
      cursor.setDate(cursor.getDate() + 1)
    }
    const weDay = median(we)
    const wdDay = median(wd)
    if (we.length >= 4 && wd.length >= 8 && wdDay > 0 && weDay >= wdDay * 1.6) {
      out.push({ id: 'weekend', kind: 'weekend', score: 40 + Math.min(10, (weDay / wdDay - 1.6) * 10), ratio: weDay / wdDay, weekend: weDay, weekday: wdDay })
    }
  }

  /* 10. Самый дорогой день недели против самого дешёвого — если про выходные
         уже не сказано. Дешёвым считаем самый дешёвый ИЗ НЕПУСТЫХ: в неполном
         месяце какой-то день недели легко оказывается нулевым. */
  if (x.weekday.length === 7 && !out.some((i) => i.kind === 'weekend')) {
    let hi = 0
    let lo = -1
    let filledDays = 0
    for (let i = 0; i < 7; i++) {
      if (x.weekday[i] > x.weekday[hi]) hi = i
      if (x.weekday[i] > 0) {
        filledDays += 1
        if (lo < 0 || x.weekday[i] < x.weekday[lo]) lo = i
      }
    }
    if (filledDays >= 4 && lo >= 0 && hi !== lo && x.weekday[hi] >= x.weekday[lo] * 1.5) {
      out.push({ id: 'weekday', kind: 'weekday', score: 20, day: hi, avg: x.weekday[hi], minDay: lo, minAvg: x.weekday[lo] })
    }
  }

  /* 11. Мелочь складывается: кофе и шоколадки по отдельности не видны, а
         вместе — как одна крупная покупка. Граница — круглая и от своего
         среднего дня, а не одна на всех: 300 ₽ и 3 € — разная «мелочь». */
  if (x.perDay > 0) {
    const limit = niceLimit(x.perDay * 0.15)
    let count = 0
    let total = 0
    for (const t of x.current) {
      if (t.type !== 'expense' || t.amount > limit) continue
      if (x.recurringKeys.has(recurringKey(t.categoryId, t.amount))) continue
      count += 1
      total += t.amount
    }
    const share = x.spent > 0 ? (total / x.spent) * 100 : 0
    if (limit > 0 && count >= 10 && share >= 3) out.push({ id: 'small', kind: 'small', score: 34 + Math.min(8, share / 2), count, total, limit, share })
  }

  /* 12. Самый дорогой день периода — если он заметно выше обычного дня и это
         не та же разовая покупка, о которой уже сказано. */
  if (x.daily.length > 0 && x.daysPassed >= 7) {
    let peak = -1
    const nonZero: number[] = []
    for (let i = 0; i < Math.min(x.daysPassed, x.daily.length); i++) {
      if (x.daily[i] <= 0) continue
      nonZero.push(x.daily[i])
      if (peak < 0 || x.daily[i] > x.daily[peak]) peak = i
    }
    const usualDay = median(nonZero)
    if (peak >= 0 && usualDay > 0) {
      const amount = x.daily[peak]
      const times = amount / usualDay
      const key = shiftDay(x.startKey, peak)
      const sameAsOneOff = x.biggest && parseDay(x.biggest.date) === key && out.some((i) => i.kind === 'one_off')
      // День аренды — самый дорогой каждый месяц, и это не новость.
      const mostlyFixed = x.habit[peak] < amount * 0.5
      if (times >= 3 && amount >= x.spentToDate * 0.1 && !sameAsOneOff && !mostlyFixed) {
        out.push({ id: 'peak_day', kind: 'peak_day', score: 26, key, amount, times })
      }
    }
  }

  /* 13. Дни подряд без трат — единственное наблюдение, которым приятно
         похвастаться. Считаем от последнего прожитого дня назад. */
  // Только у того, кто траты записывает: у записывающего одни доходы «17 дней
  // без трат» — не заслуга, а отсутствие записей.
  if (x.noSpendStreak >= NO_SPEND_MIN_DAYS && (x.spent > 0 || filled.length > 0))
    out.push({ id: 'no_spend', kind: 'no_spend', score: 28, days: x.noSpendStreak })

  // Сверху — важное; об одной категории — один раз.
  out.sort((a, b) => b.score - a.score)
  const told = new Set<string>()
  const result: Insight[] = []
  for (const i of out) {
    const cat = 'categoryId' in i ? i.categoryId : null
    if (cat && told.has(cat)) continue
    if (cat) told.add(cat)
    result.push(i)
    if (result.length >= MAX_INSIGHTS) break
  }
  return result
}
