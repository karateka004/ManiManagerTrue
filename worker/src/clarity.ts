/**
 * Microsoft Clarity в админке: цифры поведения в приложении (Data Export API).
 *
 * Сами записи сессий Clarity наружу не отдаёт — их смотрят у них, админка ведёт
 * туда кнопками. Выгрузка даёт сводку за последние 24/48/72 часа: сессии, люди,
 * боты, «мёртвые» и «яростные» нажатия, быстрые возвраты, ошибки скриптов,
 * время и прокрутку, списки по устройствам, системам и странам — и разбивку
 * любых из них по ОС, устройству, стране (до трёх измерений за запрос).
 *
 * Лимит — 10 запросов в сутки на проект (сутки по UTC). Расход:
 *   00:00 МСК (ночной крон) — завершившиеся сутки: сводка + разбивка по ОС,
 *     2 запроса; сводка ложится в историю по дням (`clarity:hist`);
 *   06, 12 и 18 МСК (почасовой крон) — свежие 24 часа, по одному;
 *   сохранение токена и «Обновить» в админке — из остатка, но ночному снимку
 *     всегда остаётся два.
 *
 * Токен (Clarity → Settings → Data Export → Generate new API token) владелец
 * вставляет в админке, он лежит в `clarity:token` и наружу не уходит: админке
 * отдаём только «задан», последние символы и срок из самого токена.
 */
import type { Env } from './env'
import { mskDateStr, mskDay, mskDayStart } from './days'

/** Номер проекта — тот же, что CLARITY_ID в src/lib/clarity.ts приложения. */
export const CLARITY_PROJECT = 'z50dung9vo'
export const EXPORT_URL = 'https://www.clarity.ms/export-data/api/v1/project-live-insights'

const TOKEN_KEY = 'clarity:token'
const META_KEY = 'clarity:meta'
const LIVE_KEY = 'clarity:live'
const OS_KEY = 'clarity:os'
const HIST_KEY = 'clarity:hist'
const QUOTA_PREFIX = 'clarity:quota:'

/** Запросов в сутки на проект (документация Clarity). */
export const DAILY_LIMIT = 10
/** Столько оставляем ночному снимку: днём тратим не больше DAILY_LIMIT − NIGHT_RESERVE. */
const NIGHT_RESERVE = 2
/** Свежие 24 часа днём — в эти часы UTC (06, 12, 18 МСК). */
const DAY_HOURS_UTC = [3, 9, 15]
/** Дней в истории. */
const HIST_DAYS = 120
/** Строк одной метрики храним не больше: списки страниц и стран бывают длинными. */
const MAX_ROWS = 25

/** Метрики-«трение»: доля сессий, где это случилось. Порядок — порядок в админке. */
export const FRICTION = [
  'DeadClickCount',
  'RageClickCount',
  'QuickbackClick',
  'ExcessiveScroll',
  'ScriptErrorCount',
  'ErrorClickCount',
] as const

/** Строка метрики: подписи (ОС, страница, страна…) отдельно от чисел. */
export interface MetricRow {
  d: Record<string, string>
  n: Record<string, number>
}
/** Разобранный ответ: метрика → строки. */
export type Parsed = Record<string, MetricRow[]>

export interface Snapshot {
  at: number
  /** За сколько суток (1–3). */
  days: number
  m: Parsed
}

/** День истории (сутки по МСК). Только числа сводки — компактно. */
export interface ClarityDay {
  d: string
  /** Сессии, люди, боты. */
  s?: number
  u?: number
  b?: number
  /** Трение: метрика → % сессий. */
  f: Record<string, number>
  /** Прочие числа (время, прокрутка): «метрика.поле» → значение. */
  x: Record<string, number>
}

interface Meta {
  tail?: string
  exp?: number
  savedAt?: number
  /** Clarity отказал в доступе (401/403) — крон не тратит запросы, пока не вставят новый. */
  bad?: boolean
  err?: { at: number; status: number }
}

/** Для админки: всё, кроме самого токена. */
export interface ClarityBlock {
  project: string
  token: { set: boolean; tail?: string; exp?: number; savedAt?: number; bad?: boolean }
  live: Snapshot | null
  os: Snapshot | null
  hist: ClarityDay[]
  quota: { used: number; limit: number; left: number }
  err: { at: number; status: number } | null
}

/* ------------------------------------------------------------------ */
/* Разбор                                                              */
/* ------------------------------------------------------------------ */

const NUMERIC = /^-?\d+(?:\.\d+)?$/

/**
 * Ответ выгрузки → метрики со строками. Clarity отдаёт счётчики строками
 * («9554»), доли — числами; поля у метрик разные и меняются, поэтому разбор
 * общий: числа — в `n`, подписи — в `d`. Запрошенные измерения (OS, Device…) —
 * всегда подписи, даже если похожи на число. Не массив — null.
 */
export function parseExport(raw: unknown, dims: string[] = []): Parsed | null {
  if (!Array.isArray(raw)) return null
  const out: Parsed = {}
  for (const m of raw) {
    if (!m || typeof m !== 'object') continue
    const name = (m as { metricName?: unknown }).metricName
    const info = (m as { information?: unknown }).information
    if (typeof name !== 'string' || !name || !Array.isArray(info)) continue
    const rows: MetricRow[] = []
    for (const r of info) {
      if (!r || typeof r !== 'object') continue
      const row: MetricRow = { d: {}, n: {} }
      for (const [k, v] of Object.entries(r as Record<string, unknown>)) {
        const key = k.slice(0, 60)
        if (dims.includes(k)) {
          row.d[key] = v == null || v === '' ? '—' : String(v).slice(0, 120)
        } else if (typeof v === 'number' && Number.isFinite(v)) {
          row.n[key] = v
        } else if (typeof v === 'string' && NUMERIC.test(v.trim())) {
          row.n[key] = Number(v.trim())
        } else if (typeof v === 'string' && v) {
          row.d[key] = v.slice(0, 120)
        }
      }
      rows.push(row)
    }
    // Длинные списки (страницы, страны) — самые крупные строки сверху.
    if (rows.length > MAX_ROWS) {
      rows.sort((a, b) => rowWeight(b) - rowWeight(a))
      rows.length = MAX_ROWS
    }
    out[name.slice(0, 60)] = rows
  }
  return out
}

const WEIGHT_KEYS = ['totalSessionCount', 'sessionsCount', 'visitsCount', 'subTotal']
function rowWeight(r: MetricRow): number {
  for (const k of WEIGHT_KEYS) if (typeof r.n[k] === 'number') return r.n[k]
  const first = Object.values(r.n)[0]
  return typeof first === 'number' ? first : 0
}

/** День истории из сводки (без разбивки). */
export function dayRow(d: string, m: Parsed): ClarityDay {
  const row: ClarityDay = { d, f: {}, x: {} }
  const traffic = m.Traffic?.[0]?.n
  if (traffic) {
    if (traffic.totalSessionCount != null) row.s = traffic.totalSessionCount
    if (traffic.distantUserCount != null) row.u = traffic.distantUserCount
    if (traffic.totalBotSessionCount != null) row.b = traffic.totalBotSessionCount
  }
  for (const name of FRICTION) {
    const p = m[name]?.[0]?.n.sessionsWithMetricPercentage
    if (typeof p === 'number') row.f[name] = Math.round(p * 100) / 100
  }
  for (const name of ['EngagementTime', 'ScrollDepth']) {
    const n = m[name]?.[0]?.n
    if (!n) continue
    for (const [k, v] of Object.entries(n).slice(0, 4)) row.x[`${name}.${k}`] = v
  }
  return row
}

/** Вставить/заменить день, по порядку дат, не длиннее HIST_DAYS. */
export function putDay(hist: ClarityDay[], row: ClarityDay): ClarityDay[] {
  const next = hist.filter((h) => h.d !== row.d)
  next.push(row)
  next.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0))
  return next.slice(-HIST_DAYS)
}

/** Срок и хвост из самого токена (JWT): подпись не проверяем — только показать. */
export function tokenInfo(token: string): { tail: string; exp?: number } {
  const tail = token.slice(-4)
  try {
    const part = token.split('.')[1] ?? ''
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((part.length + 3) % 4)
    const payload = JSON.parse(atob(b64)) as { exp?: unknown }
    if (typeof payload.exp === 'number' && payload.exp > 0) return { tail, exp: payload.exp * 1000 }
  } catch {
    // Не JWT или другой формат — срок просто не покажем.
  }
  return { tail }
}

/** Похоже на токен выгрузки: три части через точку, без пробелов. */
export function looksLikeToken(t: string): boolean {
  return t.length >= 20 && t.length <= 4096 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(t)
}

/* ------------------------------------------------------------------ */
/* Сеть и квота                                                        */
/* ------------------------------------------------------------------ */

type CallResult = { ok: true; m: Parsed } | { ok: false; status: number }

/**
 * Один запрос выгрузки. Перенаправления не идём: токен уходит только на
 * www.clarity.ms. Нет ответа за 20 с — статус 0.
 */
async function exportCall(token: string, days: number, dims: string[]): Promise<CallResult> {
  const q = new URLSearchParams({ numOfDays: String(days) })
  dims.forEach((d, i) => q.set(`dimension${i + 1}`, d))
  try {
    const res = await fetch(`${EXPORT_URL}?${q}`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      redirect: 'manual',
      signal: AbortSignal.timeout(20_000),
    })
    if (res.status !== 200) return { ok: false, status: res.status }
    const m = parseExport(await res.json().catch(() => null), dims)
    return m ? { ok: true, m } : { ok: false, status: 502 }
  } catch {
    return { ok: false, status: 0 }
  }
}

const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

async function quotaUsed(env: Env, now: number): Promise<number> {
  return Number(await env.REFERRALS.get(QUOTA_PREFIX + utcDay(now))) || 0
}

/**
 * Запрос с учётом квоты. `cap` — до скольких запросов за сутки можно дойти
 * этим путём. Счётчик — наш (KV не атомарен, два запроса в одну секунду могут
 * посчитаться за один); 429 от Clarity — окончательный ответ: сутки закрыты.
 */
async function guardedCall(env: Env, token: string, now: number, cap: number, dims: string[]): Promise<CallResult> {
  const used = await quotaUsed(env, now)
  if (used >= cap) return { ok: false, status: 429 }
  await env.REFERRALS.put(QUOTA_PREFIX + utcDay(now), String(used + 1), { expirationTtl: 2 * 86_400 })
  const r = await exportCall(token, 1, dims)
  if (!r.ok && r.status === 429) {
    await env.REFERRALS.put(QUOTA_PREFIX + utcDay(now), String(DAILY_LIMIT), { expirationTtl: 2 * 86_400 })
  } else if (!r.ok && (r.status === 401 || r.status === 403)) {
    // Чужой или неверный токен проекту не засчитывается — возвращаем попытку.
    await env.REFERRALS.put(QUOTA_PREFIX + utcDay(now), String(used), { expirationTtl: 2 * 86_400 })
  }
  return r
}

async function readJson<T>(env: Env, key: string): Promise<T | null> {
  const raw = await env.REFERRALS.get(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

async function noteResult(env: Env, r: CallResult, now: number): Promise<void> {
  const meta = (await readJson<Meta>(env, META_KEY)) ?? {}
  if (r.ok) {
    if (!meta.err && !meta.bad) return
    delete meta.err
    delete meta.bad
  } else {
    meta.err = { at: now, status: r.status }
    if (r.status === 401 || r.status === 403) meta.bad = true
  }
  await env.REFERRALS.put(META_KEY, JSON.stringify(meta))
}

/* ------------------------------------------------------------------ */
/* Расписание                                                          */
/* ------------------------------------------------------------------ */

async function usableToken(env: Env): Promise<string | null> {
  const [token, meta] = await Promise.all([env.REFERRALS.get(TOKEN_KEY), readJson<Meta>(env, META_KEY)])
  return token && !meta?.bad ? token : null
}

/**
 * 00:00 МСК: итог завершившихся суток — в историю, плюс разбивка по ОС
 * (где спотыкаются: Android, iOS, компьютер).
 */
export async function clarityNightly(env: Env, now: number): Promise<void> {
  const token = await usableToken(env)
  if (!token) return
  const day = await guardedCall(env, token, now, DAILY_LIMIT, [])
  await noteResult(env, day, now)
  if (!day.ok) return
  const ended = mskDateStr(mskDayStart(mskDay(now) - 1))
  const hist = (await readJson<ClarityDay[]>(env, HIST_KEY)) ?? []
  await Promise.all([
    env.REFERRALS.put(LIVE_KEY, JSON.stringify({ at: now, days: 1, m: day.m } satisfies Snapshot)),
    env.REFERRALS.put(HIST_KEY, JSON.stringify(putDay(hist, dayRow(ended, day.m)))),
  ])
  const os = await guardedCall(env, token, now, DAILY_LIMIT, ['OS'])
  if (os.ok) await env.REFERRALS.put(OS_KEY, JSON.stringify({ at: now, days: 1, m: os.m } satisfies Snapshot))
}

/** Почасовой крон: в 06, 12 и 18 МСК — свежие 24 часа. */
export async function clarityTick(env: Env, now: number): Promise<void> {
  if (!DAY_HOURS_UTC.includes(new Date(now).getUTCHours())) return
  const token = await usableToken(env)
  if (token) await refreshLive(env, token, now)
}

async function refreshLive(env: Env, token: string, now: number): Promise<CallResult> {
  const r = await guardedCall(env, token, now, DAILY_LIMIT - NIGHT_RESERVE, [])
  await noteResult(env, r, now)
  if (r.ok) await env.REFERRALS.put(LIVE_KEY, JSON.stringify({ at: now, days: 1, m: r.m } satisfies Snapshot))
  return r
}

/* ------------------------------------------------------------------ */
/* Админка                                                             */
/* ------------------------------------------------------------------ */

export async function clarityBlock(env: Env, now = Date.now()): Promise<ClarityBlock> {
  const [token, meta, live, os, hist, used] = await Promise.all([
    env.REFERRALS.get(TOKEN_KEY),
    readJson<Meta>(env, META_KEY),
    readJson<Snapshot>(env, LIVE_KEY),
    readJson<Snapshot>(env, OS_KEY),
    readJson<ClarityDay[]>(env, HIST_KEY),
    quotaUsed(env, now),
  ])
  return {
    project: CLARITY_PROJECT,
    token: token
      ? { set: true, tail: meta?.tail, exp: meta?.exp, savedAt: meta?.savedAt, bad: !!meta?.bad }
      : { set: false },
    live,
    os,
    hist: (hist ?? []).slice(-60),
    quota: { used: Math.min(used, DAILY_LIMIT), limit: DAILY_LIMIT, left: Math.max(0, DAILY_LIMIT - NIGHT_RESERVE - used) },
    err: meta?.err ?? null,
  }
}

export type ClarityAction =
  | { action: 'token'; token: string }
  | { action: 'forget' }
  | { action: 'refresh' }

/**
 * Действие из админки. Ответ — свежий блок и, если что-то не так, код:
 *   bad_format — не похоже на токен; rejected — Clarity не принял токен (не
 *   сохраняем); no_token; quota — сутки исчерпаны; unreachable — Clarity не
 *   ответил (токен сохранён, данные придут по расписанию).
 */
export async function clarityAction(
  env: Env,
  body: { action?: unknown; token?: unknown },
  now = Date.now(),
): Promise<{ ok: boolean; error?: string; status?: number; clarity: ClarityBlock }> {
  const done = async (ok: boolean, error?: string, status?: number) => ({
    ok,
    ...(error ? { error } : {}),
    ...(status != null ? { status } : {}),
    clarity: await clarityBlock(env, now),
  })

  if (body.action === 'forget') {
    await Promise.all([env.REFERRALS.delete(TOKEN_KEY), env.REFERRALS.delete(META_KEY)])
    return done(true)
  }

  if (body.action === 'refresh') {
    const token = await env.REFERRALS.get(TOKEN_KEY)
    if (!token) return done(false, 'no_token')
    const r = await refreshLive(env, token, now)
    return r.ok ? done(true) : done(false, r.status === 429 ? 'quota' : r.status === 401 || r.status === 403 ? 'rejected' : 'unreachable', r.status)
  }

  if (body.action === 'token') {
    const token = String(body.token ?? '').trim()
    if (!looksLikeToken(token)) return done(false, 'bad_format')
    const r = await guardedCall(env, token, now, DAILY_LIMIT - NIGHT_RESERVE, [])
    // Не принят — не храним: иначе крон тратил бы на него запросы.
    if (!r.ok && (r.status === 401 || r.status === 403)) return done(false, 'rejected', r.status)
    const meta: Meta = { ...tokenInfo(token), savedAt: now }
    if (!r.ok) meta.err = { at: now, status: r.status }
    await Promise.all([
      env.REFERRALS.put(TOKEN_KEY, token),
      env.REFERRALS.put(META_KEY, JSON.stringify(meta)),
      ...(r.ok ? [env.REFERRALS.put(LIVE_KEY, JSON.stringify({ at: now, days: 1, m: r.m } satisfies Snapshot))] : []),
    ])
    return r.ok ? done(true) : done(true, r.status === 429 ? 'quota' : 'unreachable', r.status)
  }

  return done(false, 'bad_action')
}
