/**
 * Быстрый старт по шагам: до какого шага доходят новички, сколько пропускают
 * трату и доход, на каком закрывают. Без сумм — только номер шага и «было/не
 * было».
 *
 * Приложение шлёт /qs при каждом шаге. Храним `qs:<id>` — всё в метаданных
 * (админка собирает одним list, не читая значений), со сроком 180 дней.
 * Кто бросил на середине и вернулся, продолжает с того же шага — запись та же.
 */
import type { Env } from './env'

/** Шаги по порядку — как STEP_NAMES в QuickStart.tsx приложения. */
export const QS_STEPS = ['welcome', 'setup', 'expense', 'income', 'result'] as const
const LAST = QS_STEPS.length - 1

export const QS_PREFIX = 'qs:'
const QS_TTL = 180 * 86_400

export interface QsMeta {
  /** Первый и последний раз. */
  t: number
  u: number
  /** Дальний шаг, до которого дошёл. */
  s: number
  /** Трат записано в быстром старте (0–3). */
  e?: number
  /** Ввёл доход. */
  i?: 1
  /** Дошёл до конца («Открыть приложение»). */
  d?: 1
  /** Закрыл крестиком на этом шаге (последний раз). */
  x?: number
}

const step = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= LAST ? v : null

/** Новый шаг поверх прошлого: дальше не откатываемся, отметки не снимаем. */
export function mergeQs(
  prev: QsMeta | null,
  body: { s?: unknown; e?: unknown; i?: unknown; d?: unknown; x?: unknown },
  now: number,
): QsMeta | null {
  const s = step(body.s)
  if (s === null) return null
  const e = typeof body.e === 'number' && Number.isInteger(body.e) ? Math.min(3, Math.max(0, body.e)) : 0
  const next: QsMeta = { t: prev?.t ?? now, u: now, s: Math.max(prev?.s ?? 0, s) }
  const ex = Math.max(prev?.e ?? 0, e)
  if (ex > 0) next.e = ex
  if (prev?.i || body.i === true) next.i = 1
  if (prev?.d || body.d === true) next.d = 1
  const x = step(body.x)
  if (x !== null) next.x = x
  else if (prev?.x != null) next.x = prev.x
  return next
}

export async function trackQuickStart(
  env: Env,
  userId: number | string,
  body: { s?: unknown; e?: unknown; i?: unknown; d?: unknown; x?: unknown },
  now = Date.now(),
): Promise<boolean> {
  const key = `${QS_PREFIX}${userId}`
  const prev = (await env.REFERRALS.getWithMetadata<QsMeta>(key)).metadata ?? null
  const next = mergeQs(prev, body, now)
  if (!next) return false
  await env.REFERRALS.put(key, '1', { metadata: next, expirationTtl: QS_TTL })
  return true
}

export interface QsStats {
  /** Окно в днях и с какого момента вообще есть замер. */
  days: number
  since: number | null
  started: number
  /** Сколько дошли до каждого шага (индекс = шаг). */
  reached: number[]
  done: number
  /** Записали хотя бы одну трату / ввели доход. */
  expense: number
  income: number
  /** Прошли шаг, ничего не введя. */
  skippedExpense: number
  skippedIncome: number
  /** Закрыли крестиком и не вернулись: по шагам. */
  exits: number[]
}

/** Сводка за `days` дней по первому заходу в быстрый старт. */
export function aggregateQs(rows: QsMeta[], now: number, days: number): QsStats {
  const from = now - days * 86_400_000
  const out: QsStats = {
    days,
    since: null,
    started: 0,
    reached: QS_STEPS.map(() => 0),
    done: 0,
    expense: 0,
    income: 0,
    skippedExpense: 0,
    skippedIncome: 0,
    exits: QS_STEPS.map(() => 0),
  }
  for (const r of rows) {
    if (typeof r?.t !== 'number') continue
    if (out.since === null || r.t < out.since) out.since = r.t
    if (r.t < from) continue
    out.started++
    for (let k = 0; k <= Math.min(LAST, r.s); k++) out.reached[k]++
    if (r.d) out.done++
    if ((r.e ?? 0) > 0) out.expense++
    if (r.i) out.income++
    if (r.s > QS_STEPS.indexOf('expense') && !((r.e ?? 0) > 0)) out.skippedExpense++
    if (r.s > QS_STEPS.indexOf('income') && !r.i) out.skippedIncome++
    if (r.x != null && !r.d) out.exits[r.x]++
  }
  return out
}

export async function quickStartStats(env: Env, now = Date.now(), days = 30): Promise<QsStats> {
  const rows: QsMeta[] = []
  let cursor: string | undefined
  do {
    const page = await env.REFERRALS.list<QsMeta>({ prefix: QS_PREFIX, cursor })
    for (const k of page.keys) if (k.metadata) rows.push(k.metadata)
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
  return aggregateQs(rows, now, days)
}
