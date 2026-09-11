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
  /** Валюта, в которой считаем остаток: выбранный «счёт» или основная. */
  currency?: string
  monthlyBudget: number
  /** Встроенные категории плюс собственные категории человека. */
  categories: UserCategory[]
  /** Расходы за сегодня в `currency` — из блоба и из ещё не слитых входящих. */
  spentToday: number
  spentYesterday: number
  spentWeek: number
  spentMonth: number
  spentPrevMonth: number
  incomeMonth: number
  daysLeft: number
  /** Операций всего — чтобы отличить «ничего не тратил» от «ничего не записано». */
  ops: number
  /** Доходы минус расходы за всё время: то, что человек называет «сколько у меня». */
  balance: number
  /** Расходы месяца по категориям, от большей к меньшей (id → сумма). */
  byCategory: { id: string; sum: number }[]
  /** Сколько записей уже ждёт слива (нужно, чтобы вовремя сказать о переполнении). */
  pending: number
}

interface BlobTx {
  type?: unknown
  amount?: unknown
  currency?: unknown
  date?: unknown
  categoryId?: unknown
}

/** Встроенные категории в том виде, в каком их видит человек. */
export const DEFAULT_CATEGORIES: UserCategory[] = CATEGORY_RULES.map((r) => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
}))

/**
 * Собрать выжимку. Блоб может быть большим (до 2 МБ), поэтому проходим по
 * операциям ровно один раз и ничего из них не сохраняем — только считаем.
 */
export async function loadContext(env: Env, userId: string | number, nowMs: number): Promise<UserContext> {
  const today = mskDay(nowMs)
  const { y, m } = yearMonth(today)

  const prev = yearMonth(today - new Date(today * DAY_MS).getUTCDate())

  const ctx: UserContext = {
    hasBlob: false,
    monthlyBudget: 0,
    categories: DEFAULT_CATEGORIES,
    spentToday: 0,
    spentYesterday: 0,
    spentWeek: 0,
    spentMonth: 0,
    spentPrevMonth: 0,
    incomeMonth: 0,
    daysLeft: daysLeftInMonth(today),
    ops: 0,
    balance: 0,
    byCategory: [],
    pending: 0,
  }

  const raw = await env.REFERRALS.get(`data:${userId}`)
  let txs: BlobTx[] = []
  if (raw) {
    try {
      const outer = JSON.parse(raw) as { blob?: string }
      const state = (JSON.parse(String(outer?.blob ?? '')) as { state?: Record<string, unknown> })?.state
      if (state && typeof state === 'object') {
        ctx.hasBlob = true
        const main = typeof state.currency === 'string' ? state.currency : undefined
        const account = typeof state.account === 'string' ? state.account : undefined
        ctx.currency = account ?? main
        ctx.monthlyBudget = Number(state.monthlyBudget) > 0 ? Number(state.monthlyBudget) : 0
        const custom = Array.isArray(state.customCategories) ? state.customCategories : []
        const extra: UserCategory[] = []
        for (const c of custom as { id?: unknown; name?: unknown; kind?: unknown }[]) {
          if (typeof c?.id === 'string' && typeof c?.name === 'string' && (c.kind === 'income' || c.kind === 'expense')) {
            extra.push({ id: c.id, name: c.name.slice(0, 40), kind: c.kind })
          }
        }
        if (extra.length) ctx.categories = [...DEFAULT_CATEGORIES, ...extra.slice(0, 40)]
        txs = Array.isArray(state.transactions) ? (state.transactions as BlobTx[]) : []
      }
    } catch {
      /* битый блоб — считаем, что данных нет: отвечать всё равно надо */
    }
  }

  // Основная валюта нужна и для сравнения операций: у записи без своей валюты
  // она подразумевается (txCurrency в приложении устроен так же).
  const cur = ctx.currency
  const sameCurrency = (c: unknown): boolean => (typeof c === 'string' ? c === cur : true)

  const perCategory = new Map<string, number>()
  for (const t of txs) {
    if (!sameCurrency(t?.currency)) continue
    const amount = Number(t?.amount)
    if (!Number.isFinite(amount) || amount <= 0) continue
    const day = typeof t?.date === 'string' ? mskDayOfIso(t.date) : NaN
    if (!Number.isFinite(day)) continue
    const ym = yearMonth(day)
    const thisMonth = ym.y === y && ym.m === m
    ctx.ops++
    if (t?.type === 'income') {
      ctx.balance += amount
      if (thisMonth) ctx.incomeMonth += amount
      continue
    }
    ctx.balance -= amount
    if (thisMonth) {
      ctx.spentMonth += amount
      const id = typeof t?.categoryId === 'string' ? t.categoryId : 'other'
      perCategory.set(id, (perCategory.get(id) ?? 0) + amount)
    } else if (ym.y === prev.y && ym.m === prev.m) {
      ctx.spentPrevMonth += amount
    }
    if (day === today) ctx.spentToday += amount
    if (day === today - 1) ctx.spentYesterday += amount
    // «За неделю» — последние семь суток, включая сегодняшние: так это слово и
    // понимают в разговоре, а не «с понедельника».
    if (day > today - 7 && day <= today) ctx.spentWeek += amount
  }
  ctx.byCategory = [...perCategory]
    .map(([id, sum]) => ({ id, sum }))
    .sort((a, b) => b.sum - a.sum)

  // Входящие — это уже записанные операции, которых приложение ещё не видело.
  // Не учесть их значило бы показать остаток, который человек только что сам изменил.
  const inbox = await readInbox(env, userId)
  ctx.pending = inbox.items.length
  for (const e of inbox.items) addEntryToContext(ctx, e, today, y, m)

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
  if (day === today) ctx.spentToday += e.amount
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
