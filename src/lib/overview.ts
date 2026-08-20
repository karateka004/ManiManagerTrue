/**
 * Расчёты вкладки «Обзор» Аналитики.
 *
 * Модуль чистый: ничего не знает про стор и про React. На вход — уже отобранные
 * операции и границы окон, на выход — готовые числа и список наблюдений. Так
 * весь расчёт видно целиком в одном файле и его можно проверять отдельно.
 *
 * Про «день» — везде localDayKey (локальная полночь), та же трактовка, что у
 * остальной аналитики; см. [[lib/day]]. Вторую здесь заводить нельзя, иначе
 * суммы в «Обзоре» разойдутся с кольцом «Расходов» на границе суток.
 *
 * Про стоимость: считается один раз на изменение данных (селектор в сторе
 * держит deps), но проходов по истории здесь несколько, поэтому внутри циклов
 * нет dayjs и нет создания промежуточных массивов.
 */

import type { Transaction } from '../store/transactions'
import type { Category } from '../store/categories'
import type { Currency } from './currencies'
import { DAY_MS, daysBetween, localDayKey, parseDay } from './day'

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
/** Сколько категорий показываем в разбивке. */
const TOP_CATEGORIES = 6
/** Сколько самых дорогих операций показываем. */
const TOP_BIGGEST = 3
/** Больше карточек наблюдений не показываем — экран перестаёт читаться. */
const MAX_INSIGHTS = 4

/* ---------- Регулярные платежи ---------- */

/** Столько раз подряд — уже не совпадение. */
const RECUR_MIN_TIMES = 3
/** Разрыв между списаниями, дней: «раз в месяц» с запасом на плавающую дату. */
const RECUR_MIN_GAP = 25
const RECUR_MAX_GAP = 36
/** Если последнего списания давно нет — платёж закончился, не показываем. */
const RECUR_STALE_DAYS = 50
/** Глубина поиска регулярных платежей. */
const RECUR_WINDOW_DAYS = 400

export interface CatDelta {
  categoryId: string
  name: string
  color: string
  icon: string
  amount: number
  /** Сумма той же категории за прошлый период. */
  prev: number
  /** Изменение к прошлому периоду в процентах; null — сравнивать не с чем. */
  deltaPct: number | null
  /** Доля от расходов периода. */
  pct: number
}

export type Insight =
  /** Категория съела заметно больше, чем обычно за такой же период. */
  | { id: string; kind: 'spike'; categoryId: string; name: string; color: string; icon: string; amount: number; pct: number }
  /** Одинаковая сумма в одной категории раз в месяц — похоже на подписку. */
  | { id: string; kind: 'recurring'; categoryId: string; name: string; color: string; icon: string; amount: number; times: number; yearly: number }
  /** Самый дорогой день недели против самого дешёвого. */
  | { id: string; kind: 'weekday'; day: number; avg: number; minDay: number; minAvg: number }
  /** Прогноз против лимита или против прошлого периода. */
  | { id: string; kind: 'budget'; over: boolean; rest: number }
  | { id: string; kind: 'pace'; over: boolean; diff: number }

export interface Overview {
  currency: Currency
  /** Границы периода в локальных полуночах — для подписей с датой. */
  startKey: number
  endKey: number
  spent: number
  income: number
  /** Расходы за прошлый период; null — сравнивать не с чем. */
  prevSpent: number | null
  /** Изменение к прошлому периоду в процентах; null — сравнивать не с чем. */
  deltaPct: number | null
  /** Расходы по каждому дню периода. Пусто для слишком длинных периодов. */
  daily: number[]
  daysTotal: number
  /** Сколько дней периода уже прожито. Равно daysTotal для прошедших периодов. */
  daysPassed: number
  /** Прогноз на оставшиеся дни. Пусто, если период кончился или данных мало. */
  forecast: number[]
  /**
   * Расходы по уже прожитым дням периода. Отличается от spent, когда операции
   * записаны будущим числом внутри периода (например, аренда вперёд).
   */
  spentToDate: number
  /** Средние расходы в день по прожитой части периода. */
  perDay: number
  /** Расходы к концу периода: прожитое плюс прогноз. */
  projected: number
  /**
   * В периоде смешаны валюты, а счёт не выбран — суммы складывать нельзя и
   * итог в шапке бессмысленен. Экран должен об этом сказать.
   */
  mixedCurrency: boolean
  /** Месячный лимит; 0 — не задан или неприменим к этому периоду. */
  budget: number
  /** Средние расходы по дням недели, пн…вс. Пусто для коротких периодов. */
  weekday: number[]
  categories: CatDelta[]
  biggest: Transaction[]
  insights: Insight[]
}

export interface OverviewInput {
  /** Операции текущего периода с учётом выбранного счёта. */
  current: Transaction[]
  /** Операции предыдущих периодов той же длины, свежайший первым. */
  previous: Transaction[][]
  /** История по счёту за последний год — для поиска регулярных платежей. */
  history: Transaction[]
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
}

/** День операции как локальная полночь. */
const txDay = (t: Transaction) => parseDay(t.date)

const sumExpense = (txs: Transaction[]) =>
  txs.reduce((acc, t) => (t.type === 'expense' ? acc + t.amount : acc), 0)

export function buildOverview(input: OverviewInput): Overview {
  const { current, previous, history, categories, currency, startKey, endKey, now, budget, budgetApplies } = input

  const spent = sumExpense(current)
  const income = current.reduce((acc, t) => (t.type === 'income' ? acc + t.amount : acc), 0)

  // Складывать евро с рублями нельзя. Счёт не выбран и валют больше одной —
  // предупреждаем, вместо того чтобы молча показать сумму-бессмыслицу.
  let mixedCurrency = false
  for (const t of current) {
    if ((t.currency ?? currency) !== currency) {
      mixedCurrency = true
      break
    }
  }

  /* ---------- Сравнение с прошлым периодом ---------- */
  const prevSpent = previous.length ? sumExpense(previous[0]) : null
  const deltaPct = prevSpent && prevSpent > 0 ? ((spent - prevSpent) / prevSpent) * 100 : null

  /* ---------- Разбивка по дням ---------- */
  const daysTotal = Math.max(1, daysBetween(startKey, endKey))
  const trackDaily = daysTotal <= MAX_DAILY_DAYS
  const daily = trackDaily ? new Array<number>(daysTotal).fill(0) : []

  if (trackDaily) {
    for (const t of current) {
      if (t.type !== 'expense') continue
      const i = daysBetween(startKey, txDay(t))
      if (i >= 0 && i < daysTotal) daily[i] += t.amount
    }
  }

  const todayKey = localDayKey(now)
  const daysPassed =
    todayKey >= endKey ? daysTotal : todayKey < startKey ? 0 : Math.min(daysTotal, daysBetween(startKey, todayKey) + 1)

  /* ---------- Ритм недели ---------- */
  let spentDays = 0
  if (trackDaily) for (let i = 0; i < daysPassed; i++) if (daily[i] > 0) spentDays += 1
  const weekday =
    trackDaily && daysPassed >= MIN_DAYS_FOR_WEEKDAY && spentDays >= MIN_SPENT_DAYS_FOR_WEEKDAY
      ? weekdayAverages(daily, startKey, daysPassed)
      : []

  /* ---------- Прогноз до конца периода ----------
     Темп считаем ТОЛЬКО по прожитым дням. Иначе записанная вперёд аренда
     задирает средний расход в день, а потом ещё раз добавляется прогнозом
     на тот же день — месяц «выходил» вдвое дороже, чем на самом деле. */
  const spentToDate = trackDaily ? sumRange(daily, 0, daysPassed) : spent
  const perDay = daysPassed > 0 ? spentToDate / daysPassed : 0
  const forecast =
    trackDaily && daysPassed >= MIN_DAYS_FOR_FORECAST && daysPassed < daysTotal
      ? buildForecast(perDay, weekday, daily, startKey, daysPassed, daysTotal)
      : []
  const projected = spentToDate + forecast.reduce((a, b) => a + b, 0)

  /* ---------- Категории с дельтами ---------- */
  const byId = new Map(categories.map((c) => [c.id, c]))
  const cur = totalsByCategory(current)
  const prev = previous.length ? totalsByCategory(previous[0]) : new Map<string, number>()

  const cats: CatDelta[] = [...cur.entries()]
    .map(([categoryId, amount]) => {
      const c = byId.get(categoryId)
      const was = prev.get(categoryId) ?? 0
      return {
        categoryId,
        name: c?.name ?? categoryId,
        color: c?.color ?? '#8A968F',
        icon: c?.icon ?? 'other',
        amount,
        prev: was,
        deltaPct: was > 0 ? ((amount - was) / was) * 100 : null,
        pct: spent > 0 ? (amount / spent) * 100 : 0,
      }
    })
    .sort((a, b) => b.amount - a.amount)

  const biggest = current
    .filter((t) => t.type === 'expense')
    .sort((a, b) => b.amount - a.amount)
    .slice(0, TOP_BIGGEST)

  const insights = buildInsights({
    cats,
    previous,
    byId,
    spent,
    weekday,
    forecast,
    projected,
    prevSpent,
    budget: budgetApplies ? budget : 0,
    history,
    now,
  })

  return {
    currency,
    startKey,
    endKey,
    spent,
    spentToDate,
    perDay,
    income,
    mixedCurrency,
    prevSpent,
    deltaPct,
    daily,
    daysTotal,
    daysPassed,
    forecast,
    projected,
    budget: budgetApplies ? budget : 0,
    weekday,
    categories: cats.slice(0, TOP_CATEGORIES),
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

function totalsByCategory(txs: Transaction[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const t of txs) {
    if (t.type !== 'expense') continue
    map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + t.amount)
  }
  return map
}

/**
 * Средние расходы по дням недели за прожитую часть периода. Делим на число
 * ВСТРЕТИВШИХСЯ дней недели, а не на семь: в неполном месяце понедельников
 * может быть на один больше, чем воскресений.
 */
function weekdayAverages(daily: number[], startKey: number, daysPassed: number): number[] {
  const sum = new Array<number>(7).fill(0)
  const count = new Array<number>(7).fill(0)
  const cursor = new Date(startKey)
  for (let i = 0; i < daysPassed; i++) {
    const w = (cursor.getDay() + 6) % 7
    sum[w] += daily[i]
    count[w] += 1
    cursor.setDate(cursor.getDate() + 1)
  }
  return sum.map((v, i) => (count[i] ? v / count[i] : 0))
}

/**
 * Прогноз на оставшиеся дни. Не ровный средний темп, а средний темп, разложенный
 * по дням недели: суббота у большинства дороже понедельника, и ровная линия
 * читалась бы как «данных нет».
 */
function buildForecast(
  avgDaily: number,
  weekday: number[],
  daily: number[],
  startKey: number,
  daysPassed: number,
  daysTotal: number,
): number[] {
  // Коэффициенты дня недели со средним 1. Без данных о ритме — ровный темп.
  let factor = new Array<number>(7).fill(1)
  const mean = weekday.length ? weekday.reduce((a, b) => a + b, 0) / 7 : 0
  if (mean > 0) {
    // Обрезаем края: один разовый выброс не должен растягивать прогноз втрое.
    factor = weekday.map((v) => Math.min(2, Math.max(0.4, v / mean)))
  }

  const out: number[] = []
  const cursor = new Date(startKey)
  cursor.setDate(cursor.getDate() + daysPassed)
  for (let i = daysPassed; i < daysTotal; i++) {
    // На день с уже записанной операцией прогноз не может быть НИЖЕ известной
    // суммы: аренда, отмеченная вперёд, — это не оценка, а факт.
    out.push(Math.max(daily[i] ?? 0, avgDaily * factor[(cursor.getDay() + 6) % 7]))
    cursor.setDate(cursor.getDate() + 1)
  }
  return out
}

/**
 * Регулярный платёж: одна и та же сумма в одной категории, три и больше раз,
 * с промежутком около месяца, и последний раз — недавно. Точное совпадение
 * суммы намеренно: подписки списывают ровно столько же, а «примерно столько же»
 * поймало бы обычные продукты.
 */
function findRecurring(history: Transaction[], now: number): { key: string; amount: number; categoryId: string; times: number } | null {
  const since = now - RECUR_WINDOW_DAYS * DAY_MS
  const groups = new Map<string, number[]>()

  for (const t of history) {
    if (t.type !== 'expense') continue
    const at = parseDay(t.date)
    if (!Number.isFinite(at) || at < since) continue
    const key = t.categoryId + '|' + Math.round(t.amount * 100)
    const list = groups.get(key)
    if (list) list.push(at)
    else groups.set(key, [at])
  }

  const todayKey = localDayKey(now)
  let best: { key: string; amount: number; categoryId: string; times: number } | null = null

  for (const [key, rawDays] of groups) {
    if (rawDays.length < RECUR_MIN_TIMES) continue
    const days = [...new Set(rawDays)].sort((a, b) => a - b)
    if (days.length < RECUR_MIN_TIMES) continue
    if (daysBetween(days[days.length - 1], todayKey) > RECUR_STALE_DAYS) continue

    let monthly = true
    for (let i = 1; i < days.length; i++) {
      const gap = daysBetween(days[i - 1], days[i])
      if (gap < RECUR_MIN_GAP || gap > RECUR_MAX_GAP) {
        monthly = false
        break
      }
    }
    if (!monthly) continue

    const sep = key.lastIndexOf('|')
    const amount = Number(key.slice(sep + 1)) / 100
    if (!best || amount > best.amount) {
      best = { key, amount, categoryId: key.slice(0, sep), times: days.length }
    }
  }

  return best
}

interface InsightInput {
  cats: CatDelta[]
  previous: Transaction[][]
  byId: Map<string, Category>
  spent: number
  weekday: number[]
  forecast: number[]
  projected: number
  prevSpent: number | null
  budget: number
  history: Transaction[]
  now: number
}

function buildInsights(x: InsightInput): Insight[] {
  const out: Insight[] = []

  /* 1. Категория вышла за свою обычную норму. Сравниваем со средним по
        предыдущим периодам, а не с одним прошлым: один аномальный месяц не
        должен объявлять нормой сам себя. Нужно минимум два периода истории. */
  const windows = x.previous.filter((w) => w.length > 0)
  if (windows.length >= 2) {
    const totals = windows.map(totalsByCategory)
    let top: { cat: CatDelta; avg: number } | null = null
    for (const cat of x.cats.slice(0, 3)) {
      const avg = totals.reduce((a, m) => a + (m.get(cat.categoryId) ?? 0), 0) / totals.length
      if (avg <= 0 || cat.amount < avg * 1.4) continue
      // Превышение должно быть заметным на фоне всех расходов, а не «на 3 евро».
      if (cat.amount - avg < x.spent * 0.05) continue
      if (!top || cat.amount - avg > top.cat.amount - top.avg) top = { cat, avg }
    }
    if (top) {
      out.push({
        id: 'spike:' + top.cat.categoryId,
        kind: 'spike',
        categoryId: top.cat.categoryId,
        name: top.cat.name,
        color: top.cat.color,
        icon: top.cat.icon,
        amount: top.cat.amount,
        pct: ((top.cat.amount - top.avg) / top.avg) * 100,
      })
    }
  }

  /* 2. Регулярный платёж. */
  const rec = findRecurring(x.history, x.now)
  if (rec) {
    const c = x.byId.get(rec.categoryId)
    out.push({
      id: 'recurring:' + rec.key,
      kind: 'recurring',
      categoryId: rec.categoryId,
      name: c?.name ?? rec.categoryId,
      color: c?.color ?? '#8A968F',
      icon: c?.icon ?? 'other',
      amount: rec.amount,
      times: rec.times,
      yearly: rec.amount * 12,
    })
  }

  /* 3. Самый дорогой день недели против самого дешёвого.
        Дешёвым считаем самый дешёвый ИЗ НЕПУСТЫХ: в неполном месяце какой-то
        день недели легко оказывается нулевым, и сравнение «78 € против 0 €»
        ничего не сообщает. Если непустых дней меньше четырёх — ритма ещё нет. */
  if (x.weekday.length === 7) {
    let hi = 0
    let lo = -1
    let filled = 0
    for (let i = 0; i < 7; i++) {
      if (x.weekday[i] > x.weekday[hi]) hi = i
      if (x.weekday[i] > 0) {
        filled += 1
        if (lo < 0 || x.weekday[i] < x.weekday[lo]) lo = i
      }
    }
    if (filled >= 4 && lo >= 0 && hi !== lo && x.weekday[hi] >= x.weekday[lo] * 1.5) {
      out.push({ id: 'weekday', kind: 'weekday', day: hi, avg: x.weekday[hi], minDay: lo, minAvg: x.weekday[lo] })
    }
  }

  /* 4. Куда придём к концу периода: к лимиту, если он задан, иначе к прошлому. */
  if (x.forecast.length > 0) {
    if (x.budget > 0) {
      out.push({ id: 'budget', kind: 'budget', over: x.projected > x.budget, rest: Math.abs(x.budget - x.projected) })
    } else if (x.prevSpent && x.prevSpent > 0) {
      const diff = x.projected - x.prevSpent
      // Разница меньше десятой — это шум, говорить не о чем.
      if (Math.abs(diff) > x.prevSpent * 0.1) {
        out.push({ id: 'pace', kind: 'pace', over: diff > 0, diff: Math.abs(diff) })
      }
    }
  }

  return out.slice(0, MAX_INSIGHTS)
}
