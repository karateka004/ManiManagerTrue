/**
 * Что бот знает о пользователе, когда отвечает на сообщение.
 *
 * Ответ «записал и всё» бесполезен: человек и так знает, что он написал. Полезно
 * то, чего он не держит в голове, — сколько осталось на сегодня. Поэтому перед
 * ответом собираем короткую выжимку из его облачного блоба и из ещё не слитых
 * входящих.
 *
 * Читаем, но не пишем: блоб остаётся собственностью приложения (см. inbox.ts).
 */
import type { Env } from './env'
import { CATEGORY_RULES } from './entry'
import { readInbox, type InboxEntry } from './inbox'

/* ------------------------------------------------------------------ */
/* Сутки                                                               */
/* ------------------------------------------------------------------ */
/*
 * «Сегодня» у бота — по МСК. Часовой пояс человека Telegram не отдаёт, а весь
 * остальной воркер (рассылка напоминаний, ночные снимки метрик) уже живёт по
 * МСК — заводить рядом вторую трактовку суток значило бы получить два разных
 * «сегодня» в одном продукте.
 *
 * Сама операция при этом записывается точным моментом, поэтому в приложении она
 * ляжет в настоящий локальный день человека. Разойтись эти две трактовки могут
 * только у полуночи и только на подписи в ответе бота.
 */
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000
const DAY_MS = 86_400_000

/** Номер суток по МСК (целое число дней от эпохи). */
export function mskDay(ms: number): number {
  return Math.floor((ms + MSK_OFFSET_MS) / DAY_MS)
}

/**
 * Номер суток для даты операции.
 *
 * Дата без времени («2026-09-11») — это уже календарный день, и часовой пояс к
 * ней не применяется: `Date.parse` дал бы полночь UTC, то есть предыдущие сутки
 * по МСК, и запись «задним числом» уехала бы на день назад.
 */
export function mskDayOfIso(iso: string): number {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return Math.floor(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY_MS)
  }
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? mskDay(ms) : NaN
}

/** Год и месяц (0-11) по МСК для номера суток. */
function yearMonth(day: number): { y: number; m: number } {
  const d = new Date(day * DAY_MS)
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() }
}

/** Сколько суток осталось в месяце, считая сегодняшние. */
function daysLeftInMonth(day: number): number {
  const { y, m } = yearMonth(day)
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  const date = new Date(day * DAY_MS).getUTCDate()
  return Math.max(1, daysInMonth - date + 1)
}

const MONTHS = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
]
const MONTHS_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]
const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота']

/** Название месяца для подписи «Доходы за сентябрь». */
export function monthName(day: number): string {
  return MONTHS[yearMonth(day).m]
}

/**
 * Подпись дня для записи задним числом: «вчера», «9 сентября». Нужна только
 * тогда, когда день не сегодняшний, — подписывать «сегодня» под каждой тратой
 * значит повторять очевидное.
 */
export function dayLabel(iso: string, nowMs: number): string | null {
  const day = mskDayOfIso(iso)
  if (!Number.isFinite(day)) return null
  const today = mskDay(nowMs)
  if (day === today) return null
  if (day === today - 1) return 'вчера'
  const d = new Date(day * DAY_MS)
  return `${d.getUTCDate()} ${MONTHS_GEN[d.getUTCMonth()]}`
}

/** Сегодняшняя дата и день недели — уходят в подсказку модели, чтобы «вчера» и «в пятницу» разложились. */
export function todayHint(nowMs: number): { date: string; weekday: string } {
  const d = new Date(mskDay(nowMs) * DAY_MS)
  const iso = d.toISOString().slice(0, 10)
  return { date: iso, weekday: WEEKDAYS[d.getUTCDay()] }
}

/* ------------------------------------------------------------------ */
/* Выжимка                                                             */
/* ------------------------------------------------------------------ */

export interface UserCategory {
  id: string
  name: string
  kind: 'income' | 'expense'
}

export interface UserContext {
  /** Приложение хоть раз синхронизировалось: иначе валюты и бюджета мы не знаем. */
  hasBlob: boolean
  /**
   * Основная валюта человека. Именно основная, а не выбранный на Главной
   * «счёт»: тот — фильтр просмотра и остаётся тем, что нажали последним, а
   * запись без своей валюты в приложении всегда в основной (txCurrency).
   * Со «счётом» бот считал гривны долларами и писал траты в доллары.
   */
  currency?: string
  /** Язык приложения ('ru' | 'en'); неизвестен — undefined. Для ответов без модели. */
  lang?: 'ru' | 'en'
  monthlyBudget: number
  /** Встроенные категории плюс собственные категории человека. */
  categories: UserCategory[]
  /** Расходы за сегодня в `currency` — из блоба и из ещё не слитых входящих. */
  spentToday: number
  spentYesterday: number
  spentWeek: number
  spentMonth: number
  spentPrevMonth: number
  /**
   * Расходы прошлого месяца за ТЕ ЖЕ первые дни, что уже прошли в этом.
   *
   * Без этого числа любое сравнение месяцев — враньё: двенадцать дней сентября
   * против полного августа всегда дают «расходы упали», даже когда человек
   * тратит больше прежнего.
   */
  spentPrevSameDays: number
  incomeMonth: number
  incomePrevMonth: number
  incomePrevSameDays: number
  daysLeft: number
  /** Сколько дней месяца уже прошло — без этого «больше, чем в прошлом месяце» врёт. */
  daysPassed: number
  /** Операций всего — чтобы отличить «ничего не тратил» от «ничего не записано». */
  ops: number
  /** Доходы минус расходы за всё время: то, что человек называет «сколько у меня». */
  balance: number
  /** Записан ли хоть один доход: без доходов «баланс» — просто сумма трат с минусом. */
  hasIncome: boolean
  /** Расходы месяца по категориям, от большей к меньшей (id → сумма). */
  byCategory: { id: string; sum: number }[]
  /** То же за сегодня — для сводки дня, которую бот печатает сам, без модели. */
  todayByCategory: { id: string; sum: number }[]
  /**
   * Расходы по категориям за прошлый месяц — за те же первые дни, что и
   * `byCategory`. Нужны, чтобы ответ объяснял причину («расходы упали за счёт
   * доставки»), а не просто называл итог. Без второй точки сравнивать нечего, и
   * любое «стало меньше» было бы выдумкой.
   */
  prevByCategory: { id: string; sum: number }[]
  /** Сколько записей уже ждёт слива (нужно, чтобы вовремя сказать о переполнении). */
  pending: number

  /* ---- Для ответов на вопросы (ИИ 2.0). Только итоги, без операций. ---- */

  /** Последние 12 месяцев, от старого к новому (текущий — неполный). Ключ «ГГГГ-ММ». */
  months: { key: string; spent: number; income: number }[]
  /** Прошлый месяц целиком по категориям. */
  prevFullByCategory: { id: string; sum: number }[]
  /**
   * Обычный месячный расход по категориям: среднее за полные месяцы перед
   * текущим (до трёх, но не раньше первой записи человека — иначе новичку
   * «среднее» занижалось бы пустыми месяцами).
   */
  avgByCategory: { id: string; sum: number }[]
  /** За сколько полных месяцев посчитано среднее (0 — не с чем сравнивать). */
  avgMonths: number
  /** Доходы этого месяца по категориям. */
  incomeByCategory: { id: string; sum: number }[]
  /** Календарная неделя: с понедельника по сегодня — и прошлая целиком. */
  spentThisWeek: number
  spentLastWeek: number
  /** Средний расход по дням недели (0 — понедельник) за полные недели до текущей, до восьми. */
  weekdayAvg: number[]
  /** За сколько недель посчитано (0 — данных мало). */
  weekdayWeeks: number
  /** Самый затратный день этого месяца и что в нём было больше всего. */
  peakDay: { day: number; sum: number; topCategory?: string } | null
  /** Дней с записанными расходами в этом месяце. */
  activeDays: number
  /** С начала года. */
  spentYear: number
  incomeYear: number
  /** Лимиты по категориям из приложения и сколько по ним потрачено в этом месяце. */
  limits: { id: string; limit: number; spent: number }[]
  /** Накопительные цели (название обрезано). */
  goals: { title: string; target: number; saved: number; currency?: string }[]
  /** Этот месяц в других валютах: человек ведёт несколько «счетов». */
  otherCurrencies: { code: string; spent: number; income: number }[]
  /** День первой записи (номер суток МСК) — с какого момента вообще есть данные. */
  firstDay: number | null
}


/** Встроенные категории в том виде, в каком их видит человек. */
export const DEFAULT_CATEGORIES: UserCategory[] = CATEGORY_RULES.map((r) => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
}))

/** Понедельник недели, в которую попадает день (номер суток МСК). */
function mondayOf(day: number): number {
  // 1 января 1970 года — четверг: (day + 3) % 7 даёт 0 для понедельника.
  return day - (((day + 3) % 7) + 7) % 7
}

/** «ГГГГ-ММ» для года и месяца (0-11). */
function monthKey(y: number, m: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}`
}

/** Сколько месяцев от (y1, m1) до (y2, m2). */
function monthsBetween(a: { y: number; m: number }, b: { y: number; m: number }): number {
  return (b.y - a.y) * 12 + (b.m - a.m)
}

/** Запись для подсчёта: операция из блоба или из ещё не слитых входящих. */
interface Countable {
  type?: unknown
  amount?: unknown
  currency?: unknown
  date?: unknown
  categoryId?: unknown
}

/** Промежуточные суммы одного прохода по операциям. */
interface Acc {
  today: number
  y: number
  m: number
  prev: { y: number; m: number }
  weekStart: number
  perCategory: Map<string, number>
  perCategoryToday: Map<string, number>
  perCategoryPrev: Map<string, number>
  perCategoryPrevFull: Map<string, number>
  /** Полные месяцы перед текущим: «ГГГГ-ММ» → категория → сумма. */
  perCategoryByMonth: Map<string, Map<string, number>>
  incomePerCategory: Map<string, number>
  perDay: Map<number, number>
  perDayCategory: Map<number, Map<string, number>>
  weekday: number[]
  months: Map<string, { spent: number; income: number }>
  net: Map<string, number>
  other: Map<string, { spent: number; income: number }>
  firstDay: number | null
}

function newAcc(today: number): Acc {
  const { y, m } = yearMonth(today)
  return {
    today,
    y,
    m,
    prev: yearMonth(today - new Date(today * DAY_MS).getUTCDate()),
    weekStart: mondayOf(today),
    perCategory: new Map(),
    perCategoryToday: new Map(),
    perCategoryPrev: new Map(),
    perCategoryPrevFull: new Map(),
    perCategoryByMonth: new Map(),
    incomePerCategory: new Map(),
    perDay: new Map(),
    perDayCategory: new Map(),
    weekday: [0, 0, 0, 0, 0, 0, 0],
    months: new Map(),
    net: new Map(),
    other: new Map(),
    firstDay: null,
  }
}

const bump = (map: Map<string, number>, key: string, by: number) => map.set(key, (map.get(key) ?? 0) + by)

/**
 * Учесть одну операцию во всех итогах сразу. Один проход по блобу: он бывает
 * до 2 МБ, и второй обход стоил бы заметных миллисекунд процессора воркера.
 */
function accumulate(ctx: UserContext, acc: Acc, t: Countable): void {
  const amount = Number(t?.amount)
  if (!Number.isFinite(amount) || amount <= 0) return
  const day = typeof t?.date === 'string' ? mskDayOfIso(t.date) : NaN
  if (!Number.isFinite(day)) return
  const income = t?.type === 'income'
  // У записи без своей валюты подразумевается основная (txCurrency в приложении
  // устроен так же). Основная неизвестна (приложение ни разу не открывали) — в
  // итоги идут только записи без валюты: «обед 12 €» к «кофе 300» не прибавить.
  const code = typeof t?.currency === 'string' ? t.currency : ctx.currency
  const isMain = typeof t?.currency === 'string' ? t.currency === ctx.currency : true
  const ym = yearMonth(day)
  const thisMonth = ym.y === acc.y && ym.m === acc.m

  // Баланс по каждой валюте — для целей, привязанных к балансу своей валюты.
  if (code) bump(acc.net, code, income ? amount : -amount)

  // Операции в другой валюте в итоги основной не смешиваем: курсов у нас нет.
  if (!isMain) {
    if (thisMonth && code) {
      const row = acc.other.get(code) ?? { spent: 0, income: 0 }
      if (income) row.income += amount
      else row.spent += amount
      acc.other.set(code, row)
    }
    return
  }

  if (acc.firstDay === null || day < acc.firstDay) acc.firstDay = day
  const prevMonth = ym.y === acc.prev.y && ym.m === acc.prev.m
  // Число месяца нужно, чтобы сравнивать сопоставимые отрезки: прошлый месяц
  // берём не целиком, а по то же число, которое идёт сейчас.
  const sameDaysAgo = prevMonth && new Date(day * DAY_MS).getUTCDate() <= ctx.daysPassed
  const ago = monthsBetween(ym, { y: acc.y, m: acc.m })
  ctx.ops++

  if (ago >= 0 && ago < 12) {
    const key = monthKey(ym.y, ym.m)
    const row = acc.months.get(key) ?? { spent: 0, income: 0 }
    if (income) row.income += amount
    else row.spent += amount
    acc.months.set(key, row)
  }
  if (ym.y === acc.y && day <= acc.today) {
    if (income) ctx.incomeYear += amount
    else ctx.spentYear += amount
  }

  if (income) {
    ctx.balance += amount
    ctx.hasIncome = true
    if (thisMonth) {
      ctx.incomeMonth += amount
      bump(acc.incomePerCategory, typeof t?.categoryId === 'string' ? t.categoryId : 'other_in', amount)
    } else if (prevMonth) {
      ctx.incomePrevMonth += amount
      if (sameDaysAgo) ctx.incomePrevSameDays += amount
    }
    return
  }

  ctx.balance -= amount
  const id = typeof t?.categoryId === 'string' ? t.categoryId : 'other'
  if (thisMonth) {
    ctx.spentMonth += amount
    bump(acc.perCategory, id, amount)
    acc.perDay.set(day, (acc.perDay.get(day) ?? 0) + amount)
    const dayCats = acc.perDayCategory.get(day) ?? new Map<string, number>()
    bump(dayCats, id, amount)
    acc.perDayCategory.set(day, dayCats)
  } else if (prevMonth) {
    ctx.spentPrevMonth += amount
    bump(acc.perCategoryPrevFull, id, amount)
    if (sameDaysAgo) {
      ctx.spentPrevSameDays += amount
      bump(acc.perCategoryPrev, id, amount)
    }
  }
  if (ago >= 1 && ago <= 3) {
    const key = monthKey(ym.y, ym.m)
    const cats = acc.perCategoryByMonth.get(key) ?? new Map<string, number>()
    bump(cats, id, amount)
    acc.perCategoryByMonth.set(key, cats)
  }
  if (day === acc.today) {
    ctx.spentToday += amount
    bump(acc.perCategoryToday, id, amount)
  }
  if (day === acc.today - 1) ctx.spentYesterday += amount
  // «За неделю» — последние семь суток, включая сегодняшние: так это слово и
  // понимают в разговоре, а не «с понедельника».
  if (day > acc.today - 7 && day <= acc.today) ctx.spentWeek += amount
  // А «эта неделя» и «прошлая неделя» — календарные, с понедельника.
  if (day >= acc.weekStart && day <= acc.today) ctx.spentThisWeek += amount
  else if (day >= acc.weekStart - 7 && day < acc.weekStart) ctx.spentLastWeek += amount
  // Дни недели — по полным неделям перед текущей, до восьми.
  if (day < acc.weekStart && day >= acc.weekStart - 56) acc.weekday[(day - mondayOf(day)) % 7] += amount
}

const sortedRows = (m: Map<string, number>) =>
  [...m].map(([id, sum]) => ({ id, sum })).sort((a, b) => b.sum - a.sum)

/** Свести промежуточные суммы в выжимку. */
function finalize(ctx: UserContext, acc: Acc, state: Record<string, unknown> | null): void {
  ctx.byCategory = sortedRows(acc.perCategory)
  ctx.todayByCategory = sortedRows(acc.perCategoryToday)
  ctx.prevByCategory = sortedRows(acc.perCategoryPrev)
  ctx.prevFullByCategory = sortedRows(acc.perCategoryPrevFull)
  ctx.incomeByCategory = sortedRows(acc.incomePerCategory)
  ctx.firstDay = acc.firstDay

  // Двенадцать месяцев подряд, включая пустые: «в июле ничего» — тоже ответ.
  const months: UserContext['months'] = []
  for (let back = 11; back >= 0; back--) {
    const total = acc.y * 12 + acc.m - back
    const key = monthKey(Math.floor(total / 12), total % 12)
    const row = acc.months.get(key)
    months.push({ key, spent: row?.spent ?? 0, income: row?.income ?? 0 })
  }
  // Месяцы до первой записи — не «ничего не тратил», а «ещё не вёл учёт».
  if (acc.firstDay !== null) {
    const first = yearMonth(acc.firstDay)
    ctx.months = months.filter((r) => {
      const [yy, mm] = r.key.split('-').map(Number)
      return monthsBetween(first, { y: yy, m: mm - 1 }) >= 0
    })
  } else ctx.months = []

  // Обычный месяц по категориям: полные месяцы перед текущим, не раньше первой записи.
  let avgMonths = 0
  const avg = new Map<string, number>()
  if (acc.firstDay !== null) {
    const first = yearMonth(acc.firstDay)
    for (let back = 1; back <= 3; back++) {
      const total = acc.y * 12 + acc.m - back
      const ym = { y: Math.floor(total / 12), m: total % 12 }
      if (monthsBetween(first, ym) < 0) break
      // Месяц, в котором человек начал вести учёт, — неполный: в среднее его не берём,
      // если только других месяцев нет.
      if (monthsBetween(first, ym) === 0 && avgMonths > 0) break
      avgMonths++
      for (const [id, sum] of acc.perCategoryByMonth.get(monthKey(ym.y, ym.m)) ?? []) bump(avg, id, sum)
    }
  }
  ctx.avgMonths = avgMonths
  ctx.avgByCategory = avgMonths ? sortedRows(avg).map((r) => ({ id: r.id, sum: r.sum / avgMonths })) : []

  // Дни недели: столько полных недель, сколько есть с первой записи (до восьми).
  if (acc.firstDay !== null && acc.firstDay < acc.weekStart) {
    const weeks = Math.min(8, Math.floor((acc.weekStart - mondayOf(acc.firstDay)) / 7))
    ctx.weekdayWeeks = weeks
    ctx.weekdayAvg = weeks ? acc.weekday.map((sum) => sum / weeks) : []
  }

  // Самый затратный день месяца.
  let peak: UserContext['peakDay'] = null
  for (const [day, sum] of acc.perDay) {
    if (!peak || sum > peak.sum) peak = { day, sum }
  }
  if (peak) {
    const top = sortedRows(acc.perDayCategory.get(peak.day) ?? new Map())[0]
    if (top) peak.topCategory = top.id
  }
  ctx.peakDay = peak
  ctx.activeDays = acc.perDay.size

  ctx.otherCurrencies = [...acc.other]
    .map(([code, v]) => ({ code, spent: v.spent, income: v.income }))
    .filter((r) => r.spent > 0 || r.income > 0)

  if (!state) return
  // Лимиты по категориям — тем же полем, что в приложении (budgets: id → сумма).
  const budgets = state.budgets && typeof state.budgets === 'object' ? (state.budgets as Record<string, unknown>) : {}
  ctx.limits = Object.entries(budgets)
    .map(([id, v]) => ({ id, limit: Number(v), spent: acc.perCategory.get(id) ?? 0 }))
    .filter((r) => Number.isFinite(r.limit) && r.limit > 0)
    .sort((a, b) => b.spent / b.limit - a.spent / a.limit)
    .slice(0, 12)
  // Цели: «накоплено» — как в приложении: ручные взносы или баланс своей валюты.
  const goals = Array.isArray(state.goals) ? (state.goals as Record<string, unknown>[]) : []
  ctx.goals = goals
    .filter((g) => typeof g?.title === 'string' && Number(g?.target) > 0)
    .slice(0, 8)
    .map((g) => {
      const currency = typeof g.currency === 'string' ? g.currency : ctx.currency
      const saved = g.syncBalance
        ? Math.max(0, acc.net.get(currency ?? '') ?? 0)
        : Math.max(0, Number(g.saved) || 0)
      return { title: String(g.title).slice(0, 40), target: Number(g.target), saved, currency }
    })
}

/**
 * Собрать выжимку. Блоб может быть большим (до 2 МБ), поэтому проходим по
 * операциям ровно один раз и ничего из них не сохраняем — только считаем.
 */
export async function loadContext(env: Env, userId: string | number, nowMs: number): Promise<UserContext> {
  const today = mskDay(nowMs)

  const ctx: UserContext = {
    hasBlob: false,
    monthlyBudget: 0,
    categories: DEFAULT_CATEGORIES,
    spentToday: 0,
    spentYesterday: 0,
    spentWeek: 0,
    spentMonth: 0,
    spentPrevMonth: 0,
    spentPrevSameDays: 0,
    incomeMonth: 0,
    incomePrevMonth: 0,
    incomePrevSameDays: 0,
    daysLeft: daysLeftInMonth(today),
    daysPassed: new Date(today * DAY_MS).getUTCDate(),
    ops: 0,
    balance: 0,
    hasIncome: false,
    byCategory: [],
    todayByCategory: [],
    prevByCategory: [],
    pending: 0,
    months: [],
    prevFullByCategory: [],
    avgByCategory: [],
    avgMonths: 0,
    incomeByCategory: [],
    spentThisWeek: 0,
    spentLastWeek: 0,
    weekdayAvg: [],
    weekdayWeeks: 0,
    peakDay: null,
    activeDays: 0,
    spentYear: 0,
    incomeYear: 0,
    limits: [],
    goals: [],
    otherCurrencies: [],
    firstDay: null,
  }

  const raw = await env.REFERRALS.get(`data:${userId}`)
  let txs: Countable[] = []
  let state: Record<string, unknown> | null = null
  if (raw) {
    try {
      const outer = JSON.parse(raw) as { blob?: string }
      const parsed = (JSON.parse(String(outer?.blob ?? '')) as { state?: Record<string, unknown> })?.state
      if (parsed && typeof parsed === 'object') {
        state = parsed
        ctx.hasBlob = true
        const main = typeof state.currency === 'string' ? state.currency : undefined
        const account = typeof state.account === 'string' ? state.account : undefined
        ctx.currency = main ?? account
        if (state.lang === 'ru' || state.lang === 'en') ctx.lang = state.lang
        ctx.monthlyBudget = Number(state.monthlyBudget) > 0 ? Number(state.monthlyBudget) : 0
        const custom = Array.isArray(state.customCategories) ? state.customCategories : []
        const extra: UserCategory[] = []
        for (const c of custom as { id?: unknown; name?: unknown; kind?: unknown }[]) {
          if (typeof c?.id === 'string' && typeof c?.name === 'string' && (c.kind === 'income' || c.kind === 'expense')) {
            extra.push({ id: c.id, name: c.name.slice(0, 40), kind: c.kind })
          }
        }
        if (extra.length) ctx.categories = [...DEFAULT_CATEGORIES, ...extra.slice(0, 40)]
        txs = Array.isArray(state.transactions) ? (state.transactions as Countable[]) : []
      }
    } catch {
      /* битый блоб — считаем, что данных нет: отвечать всё равно надо */
    }
  }

  const acc = newAcc(today)
  for (const t of txs) accumulate(ctx, acc, t)

  // Входящие — это уже записанные операции, которых приложение ещё не видело.
  // Не учесть их значило бы показать остаток, который человек только что сам изменил.
  const inbox = await readInbox(env, userId)
  ctx.pending = inbox.items.length
  for (const e of inbox.items) accumulate(ctx, acc, e)

  finalize(ctx, acc, state)
  return ctx
}

/**
 * Досчитать в выжимку только что записанные операции. Нужно, чтобы ответ
 * показывал остаток УЖЕ с учётом этой траты: «осталось 640» сразу после того,
 * как человек потратил 300, иначе число выглядит враньём.
 */
export function applyEntries(ctx: UserContext, entries: InboxEntry[], nowMs: number): void {
  const today = mskDay(nowMs)
  const { y, m } = yearMonth(today)
  for (const e of entries) addEntryToContext(ctx, e, today, y, m)
  ctx.pending += entries.length
}

/** Учесть одну запись входящих в выжимке. */
function addEntryToContext(
  ctx: UserContext,
  e: InboxEntry,
  today: number,
  year: number,
  month: number,
): void {
  if (typeof e.currency === 'string' && e.currency !== ctx.currency) return
  const day = mskDayOfIso(e.date)
  if (!Number.isFinite(day)) return
  const ym = yearMonth(day)
  const thisMonth = ym.y === year && ym.m === month
  ctx.ops++
  if (e.type === 'income') {
    ctx.balance += e.amount
    if (thisMonth) ctx.incomeMonth += e.amount
    return
  }
  ctx.balance -= e.amount
  if (thisMonth) {
    ctx.spentMonth += e.amount
    const row = ctx.byCategory.find((c) => c.id === e.categoryId)
    if (row) row.sum += e.amount
    else ctx.byCategory.push({ id: e.categoryId, sum: e.amount })
    ctx.byCategory.sort((a, b) => b.sum - a.sum)
  }
  if (day === today) {
    ctx.spentToday += e.amount
    const row = ctx.todayByCategory.find((c) => c.id === e.categoryId)
    if (row) row.sum += e.amount
    else ctx.todayByCategory.push({ id: e.categoryId, sum: e.amount })
    ctx.todayByCategory.sort((a, b) => b.sum - a.sum)
  }
  if (day === today - 1) ctx.spentYesterday += e.amount
  if (day > today - 7 && day <= today) ctx.spentWeek += e.amount
}

export interface Allowance {
  /** Сколько можно тратить в день, чтобы уложиться в остаток месяца. */
  perDay: number
  /** Сколько ещё можно потратить сегодня (может быть отрицательным). */
  leftToday: number
}

/**
 * Дневной лимит из месячного бюджета — та же формула, что в приложении
 * (selectDailyAllowance): считается от ОСТАТКА бюджета, поэтому перерасход
 * сегодня ужимает завтрашний лимит, а экономия расширяет.
 *
 * null — бюджет не задан, показывать нечего.
 */
export function allowance(ctx: UserContext): Allowance | null {
  if (!(ctx.monthlyBudget > 0)) return null
  const perDay = Math.max(0, (ctx.monthlyBudget - ctx.spentMonth + ctx.spentToday) / ctx.daysLeft)
  return { perDay, leftToday: perDay - ctx.spentToday }
}
