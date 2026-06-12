/**
 * Кошель — Cloudflare Worker (бэкенд для бота).
 *
 * Делает две вещи, которые статичное приложение не может само:
 *   1. /feedback — принимает отзыв из мини-аппа и шлёт его тебе в ЛС бота.
 *   2. /referral + /stats — учёт реферальных приглашений в KV.
 *
 * Безопасность: каждый запрос обязан содержать `initData` — подписанную
 * строку от Telegram WebApp. Воркер проверяет HMAC-подпись ботовым токеном,
 * поэтому подделать пользователя нельзя. Токен бота наружу не выходит.
 *
 * Секреты (выставляются через `wrangler secret put`):
 *   BOT_TOKEN      — токен @TrueManiManager_Bot из BotFather
 *   OWNER_CHAT_ID  — твой numeric chat_id (куда падают отзывы)
 *
 * KV namespace (биндинг в wrangler.toml): REFERRALS
 */

export interface Env {
  BOT_TOKEN: string
  OWNER_CHAT_ID: string
  REFERRALS: KVNamespace
  /** Через запятую: разрешённые Origin (по умолчанию *). */
  ALLOWED_ORIGINS?: string
}

interface TgUser {
  id: number
  first_name?: string
  last_name?: string
  username?: string
}

/** Запись о приглашённом друге (хранится в KV под `refs:<refId>`). */
interface ReferralFriend {
  id: number
  name: string
  username?: string
  /** epoch ms момента присоединения */
  at: number
}

/**
 * Публичная карточка участника для таблицы лидеров.
 * Хранится в одном ключе KV `leaderboard` как map `{ [id]: LeaderEntry }`.
 * Финансовые данные сюда НЕ попадают — только геймификация (XP/уровень и т.п.).
 */
interface LeaderEntry {
  id: number
  name: string
  username?: string
  xp: number
  level: number
  ops: number
  coins: number
  streakBest: number
  /** Сколько друзей пригласил (для рейтинга по рефералам). */
  refs: number
  /** epoch ms последнего обновления */
  at: number
}

/** Ключ и лимит размера таблицы лидеров в KV. */
const LB_KEY = 'leaderboard'
const LB_MAX = 500

/** Безопасное неотрицательное целое из недоверенного ввода. */
function clampInt(x: unknown): number {
  const n = Math.floor(Number(x))
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(n, 1_000_000_000)
}

/* ------------------------------------------------------------------ */
/* CORS                                                               */
/* ------------------------------------------------------------------ */

function corsHeaders(env: Env, origin: string | null): HeadersInit {
  const allowed = (env.ALLOWED_ORIGINS ?? '*').split(',').map((s) => s.trim()).filter(Boolean)
  // Никогда не отражаем ПРОИЗВОЛЬНЫЙ origin: '*' в списке = публично; иначе только
  // точное совпадение из allowlist, при несовпадении — первый разрешённый (а не запрошенный).
  let allowOrigin: string
  if (allowed.includes('*')) allowOrigin = '*'
  else if (origin && allowed.includes(origin)) allowOrigin = origin
  else allowOrigin = allowed[0] ?? '*'
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function json(data: unknown, init: ResponseInit, env: Env, origin: string | null): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(env, origin), ...(init.headers ?? {}) },
  })
}

/* ------------------------------------------------------------------ */
/* Проверка подписи Telegram initData                                  */
/* ------------------------------------------------------------------ */

async function hmac(keyBytes: ArrayBuffer | Uint8Array, msg: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg))
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Возвращает пользователя, если подпись валидна, иначе null.
 * Алгоритм из доков Telegram: «Validating data received via the Mini App».
 */
async function verifyInitData(initData: string, botTokenRaw: string): Promise<TgUser | null> {
  if (!initData) return null
  const botToken = botTokenRaw.trim() // секрет мог прийти с \r\n при задании через пайп
  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) return null
  params.delete('hash')

  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n')

  const secretKey = await hmac(new TextEncoder().encode('WebAppData'), botToken)
  const computed = toHex(await hmac(secretKey, dataCheckString))
  if (computed !== hash) return null

  // защита от старых данных (24 часа)
  const authDate = Number(params.get('auth_date') ?? 0)
  if (authDate && Date.now() / 1000 - authDate > 86400) return null

  try {
    const userRaw = params.get('user')
    // Поле user от Telegram компактное; что-то длиннее — мусор/попытка DoS парсера.
    if (!userRaw || userRaw.length > 1000) return null
    return JSON.parse(userRaw) as TgUser
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ */
/* Telegram Bot API                                                   */
/* ------------------------------------------------------------------ */

async function sendMessage(env: Env, chatId: string | number, text: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN.trim()}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  })
}

function userLabel(u: TgUser): string {
  const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || 'Без имени'
  const handle = u.username ? ` (@${u.username})` : ''
  return `${escapeHtml(name)}${escapeHtml(handle)} [id ${u.id}]`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/* ------------------------------------------------------------------ */
/* Анти-абуз: rate limiting + чтение initData                          */
/* ------------------------------------------------------------------ */

/**
 * Простой rate-limit на KV-счётчиках: возвращает true, если лимит уже превышен.
 * Ключ живёт `ttlSec` (минимум KV — 60 c) — окно примерно фиксированной длины.
 * Атомарности нет, но для анти-спама/анти-DDoS достаточно (Worker per-isolate
 * однопоточен). Считаем по проверенному `user.id`, поэтому аноним сюда не доходит.
 */
async function isRateLimited(
  env: Env,
  scope: string,
  id: string | number,
  limit: number,
  ttlSec: number,
): Promise<boolean> {
  const key = `rl:${scope}:${id}`
  const cur = Number((await env.REFERRALS.get(key)) ?? '0')
  if (cur >= limit) return true
  await env.REFERRALS.put(key, String(cur + 1), { expirationTtl: ttlSec })
  return false
}

function tooMany(env: Env, origin: string | null): Response {
  return json({ ok: false, error: 'rate_limited' }, { status: 429 }, env, origin)
}

/**
 * initData из тела POST (`{ initData }`) или из query `?initData=` (GET, обратная
 * совместимость со старыми закешированными клиентами на время выката). Новые
 * клиенты шлют POST с телом — подписанный токен не попадает в URL/логи/Referer.
 */
async function readInitData(req: Request): Promise<string> {
  if (req.method === 'POST') {
    const body = (await req.json().catch(() => ({}))) as { initData?: string }
    return typeof body.initData === 'string' ? body.initData : ''
  }
  return new URL(req.url).searchParams.get('initData') ?? ''
}

/* ------------------------------------------------------------------ */
/* Маршруты                                                           */
/* ------------------------------------------------------------------ */

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get('Origin')
    const url = new URL(req.url)

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env, origin) })
    }

    try {
      if (url.pathname === '/feedback' && req.method === 'POST') {
        return await handleFeedback(req, env, origin)
      }
      if (url.pathname === '/referral' && req.method === 'POST') {
        return await handleReferral(req, env, origin)
      }
      if (url.pathname === '/stats' && (req.method === 'GET' || req.method === 'POST')) {
        return await handleStats(req, env, origin)
      }
      if (url.pathname === '/profile' && req.method === 'POST') {
        return await handleProfile(req, env, origin)
      }
      if (url.pathname === '/leaderboard' && (req.method === 'GET' || req.method === 'POST')) {
        return await handleLeaderboard(req, env, origin)
      }
      if (url.pathname === '/data/get' && req.method === 'POST') {
        return await handleDataGet(req, env, origin)
      }
      if (url.pathname === '/data/put' && req.method === 'POST') {
        return await handleDataPut(req, env, origin)
      }
      if (url.pathname === '/' || url.pathname === '/health') {
        return json({ ok: true, service: 'koshel-worker' }, { status: 200 }, env, origin)
      }
    } catch (e) {
      // Не светим внутренности клиенту; полную ошибку видно в `wrangler tail`.
      console.error('[worker] unhandled error', e)
      return json({ ok: false, error: 'internal_error' }, { status: 500 }, env, origin)
    }

    return json({ ok: false, error: 'not_found' }, { status: 404 }, env, origin)
  },
}

async function handleFeedback(req: Request, env: Env, origin: string | null): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { initData?: string; text?: string }
  const user = await verifyInitData(body.initData ?? '', env.BOT_TOKEN)
  if (!user) return json({ ok: false, error: 'bad_init_data' }, { status: 401 }, env, origin)
  // Анти-спам в ЛС владельцу: не более 5 отзывов в час на пользователя.
  if (await isRateLimited(env, 'fb', user.id, 5, 3600)) return tooMany(env, origin)

  const text = (body.text ?? '').trim().slice(0, 2000)
  if (!text) return json({ ok: false, error: 'empty' }, { status: 400 }, env, origin)

  await sendMessage(
    env,
    env.OWNER_CHAT_ID,
    `📝 <b>Новый отзыв</b>\nОт: ${userLabel(user)}\n\n${escapeHtml(text)}`,
  )
  return json({ ok: true }, { status: 200 }, env, origin)
}

async function handleReferral(req: Request, env: Env, origin: string | null): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { initData?: string; ref?: string }
  const user = await verifyInitData(body.initData ?? '', env.BOT_TOKEN)
  if (!user) return json({ ok: false, error: 'bad_init_data' }, { status: 401 }, env, origin)
  if (await isRateLimited(env, 'ref', user.id, 10, 60)) return tooMany(env, origin)

  // slice до санитайза — чтобы не гонять регексп по гигантской строке.
  const refId = String(body.ref ?? '').slice(0, 32).replace(/[^0-9]/g, '')
  const me = String(user.id)
  if (!refId || refId === me) {
    return json({ ok: true, counted: false, reason: 'self_or_empty' }, { status: 200 }, env, origin)
  }

  // уже отмечен этим пользователем? (idempotent)
  const claimedKey = `claimed:${me}`
  const already = await env.REFERRALS.get(claimedKey)
  if (already) {
    return json({ ok: true, counted: false, reason: 'already' }, { status: 200 }, env, origin)
  }

  await env.REFERRALS.put(claimedKey, refId)
  const cntKey = `count:${refId}`
  const cur = Number((await env.REFERRALS.get(cntKey)) ?? '0') + 1
  await env.REFERRALS.put(cntKey, String(cur))

  // добавим приглашённого в список пригласившего (чтобы он видел, кто пришёл)
  const listKey = `refs:${refId}`
  let list: ReferralFriend[] = []
  try {
    list = JSON.parse((await env.REFERRALS.get(listKey)) ?? '[]')
  } catch {
    list = []
  }
  list.push({
    id: user.id,
    name: [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Без имени',
    username: user.username,
    at: Date.now(),
  })
  if (list.length > 100) list = list.slice(-100) // не даём значению KV разрастаться
  await env.REFERRALS.put(listKey, JSON.stringify(list))

  // уведомим пригласившего
  await sendMessage(
    env,
    refId,
    `🎉 По твоей ссылке присоединился новый пользователь: ${userLabel(user)}\nВсего приглашено: <b>${cur}</b>`,
  ).catch(() => {})

  return json({ ok: true, counted: true, referrerTotal: cur }, { status: 200 }, env, origin)
}

async function handleStats(req: Request, env: Env, origin: string | null): Promise<Response> {
  const initData = await readInitData(req)
  const user = await verifyInitData(initData, env.BOT_TOKEN)
  if (!user) return json({ ok: false, error: 'bad_init_data' }, { status: 401 }, env, origin)

  const referrals = Number((await env.REFERRALS.get(`count:${user.id}`)) ?? '0')
  let friends: ReferralFriend[] = []
  try {
    friends = JSON.parse((await env.REFERRALS.get(`refs:${user.id}`)) ?? '[]')
  } catch {
    friends = []
  }
  friends.sort((a, b) => (b.at ?? 0) - (a.at ?? 0)) // новые сверху
  return json({ ok: true, referrals, friends }, { status: 200 }, env, origin)
}

/* ------------------------------------------------------------------ */
/* Таблица лидеров                                                    */
/* ------------------------------------------------------------------ */

async function readLeaderboard(env: Env): Promise<Record<string, LeaderEntry>> {
  try {
    return JSON.parse((await env.REFERRALS.get(LB_KEY)) ?? '{}') as Record<string, LeaderEntry>
  } catch {
    return {}
  }
}

/** Закрепить статистику участника (вызывается клиентом при заходе в профиль). */
async function handleProfile(req: Request, env: Env, origin: string | null): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as {
    initData?: string
    xp?: number
    level?: number
    ops?: number
    coins?: number
    streakBest?: number
  }
  const user = await verifyInitData(body.initData ?? '', env.BOT_TOKEN)
  if (!user) return json({ ok: false, error: 'bad_init_data' }, { status: 401 }, env, origin)
  if (await isRateLimited(env, 'prof', user.id, 10, 60)) return tooMany(env, origin)

  // Число рефералов берём из авторитетного счётчика в KV, а не из тела запроса.
  const refs = clampInt((await env.REFERRALS.get(`count:${user.id}`)) ?? '0')

  const entry: LeaderEntry = {
    id: user.id,
    name: [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Без имени',
    username: user.username,
    xp: clampInt(body.xp),
    level: clampInt(body.level),
    ops: clampInt(body.ops),
    coins: clampInt(body.coins),
    streakBest: clampInt(body.streakBest),
    refs,
    at: Date.now(),
  }

  let map = await readLeaderboard(env)
  map[String(user.id)] = entry

  // Не даём KV-значению разрастаться: держим топ по XP (но себя сохраняем всегда).
  const entries = Object.values(map)
  if (entries.length > LB_MAX) {
    entries.sort((a, b) => b.xp - a.xp)
    const keep = entries.slice(0, LB_MAX)
    map = {}
    for (const e of keep) map[String(e.id)] = e
    map[String(user.id)] = entry
  }

  await env.REFERRALS.put(LB_KEY, JSON.stringify(map))
  return json({ ok: true }, { status: 200 }, env, origin)
}

/** Отдать топ участников + позицию вызывающего (по XP и по рефералам). */
async function handleLeaderboard(req: Request, env: Env, origin: string | null): Promise<Response> {
  const initData = await readInitData(req)
  const user = await verifyInitData(initData, env.BOT_TOKEN)
  if (!user) return json({ ok: false, error: 'bad_init_data' }, { status: 401 }, env, origin)

  const map = await readLeaderboard(env)
  const all = Object.values(map)
  const myId = String(user.id)
  const TOP = 50

  // Собирает доску для заданной сортировки: топ + позиция вызывающего.
  const board = (sorted: LeaderEntry[]) => {
    const rankIdx = sorted.findIndex((e) => String(e.id) === myId)
    return {
      top: sorted.slice(0, TOP),
      me: rankIdx >= 0 ? { rank: rankIdx + 1, ...sorted[rankIdx] } : null,
    }
  }

  const byXp = [...all].sort((a, b) => b.xp - a.xp || b.ops - a.ops || (a.at ?? 0) - (b.at ?? 0))
  const byRefs = [...all].sort(
    (a, b) => (b.refs ?? 0) - (a.refs ?? 0) || b.xp - a.xp || (a.at ?? 0) - (b.at ?? 0),
  )

  return json(
    { ok: true, total: all.length, xp: board(byXp), refs: board(byRefs) },
    { status: 200 },
    env,
    origin,
  )
}

/* ------------------------------------------------------------------ */
/* Облачная синхронизация данных пользователя                          */
/* ------------------------------------------------------------------ */
/*
 * Привязывает весь стор приложения к Telegram-аккаунту, чтобы данные были
 * доступны с любого устройства. Храним сериализованный persist-блоб приложения
 * (строка `{state,version}`) в KV под ключом `data:<userId>` вместе с меткой
 * времени последнего изменения. Стратегия разрешения конфликтов — last-write-wins
 * по `updatedAt` (для персонального приложения сценарий «одно устройство за раз»
 * этого достаточно). Доступ только по проверенной подписи initData — чужие данные
 * прочитать нельзя.
 */

/** Префикс ключа KV для пользовательских данных. */
const DATA_PREFIX = 'data:'
/** Потолок размера блоба (символов) — защита от разрастания значения KV. */
const MAX_BLOB = 2_000_000

/** Безопасная epoch-ms метка из недоверенного ввода (clampInt тут не годится — режет до 1e9). */
function parseUpdatedAt(x: unknown): number {
  const n = Math.floor(Number(x))
  return Number.isFinite(n) && n > 0 ? n : Date.now()
}

/** Отдать сохранённые данные пользователя (или null, если их ещё нет). */
async function handleDataGet(req: Request, env: Env, origin: string | null): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { initData?: string }
  const user = await verifyInitData(body.initData ?? '', env.BOT_TOKEN)
  if (!user) return json({ ok: false, error: 'bad_init_data' }, { status: 401 }, env, origin)

  const raw = await env.REFERRALS.get(`${DATA_PREFIX}${user.id}`)
  let data: { blob: string; updatedAt: number } | null = null
  if (raw) {
    try {
      data = JSON.parse(raw)
    } catch {
      data = null
    }
  }
  return json({ ok: true, data }, { status: 200 }, env, origin)
}

/** Сохранить данные пользователя. Не затираем более свежие данные более старыми. */
async function handleDataPut(req: Request, env: Env, origin: string | null): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as {
    initData?: string
    blob?: string
    updatedAt?: number
  }
  const user = await verifyInitData(body.initData ?? '', env.BOT_TOKEN)
  if (!user) return json({ ok: false, error: 'bad_init_data' }, { status: 401 }, env, origin)
  // Анти-DDoS/квота: не более 20 записей в минуту на пользователя (блоб до 2 MB).
  if (await isRateLimited(env, 'dput', user.id, 20, 60)) return tooMany(env, origin)

  const blob = typeof body.blob === 'string' ? body.blob : ''
  if (!blob) return json({ ok: false, error: 'empty' }, { status: 400 }, env, origin)
  if (blob.length > MAX_BLOB) return json({ ok: false, error: 'too_large' }, { status: 413 }, env, origin)

  const updatedAt = parseUpdatedAt(body.updatedAt)
  const key = `${DATA_PREFIX}${user.id}`

  // Защита от гонок между устройствами: не перезаписываем более новую версию старой.
  const existingRaw = await env.REFERRALS.get(key)
  if (existingRaw) {
    try {
      const existing = JSON.parse(existingRaw) as { updatedAt?: number }
      if (typeof existing.updatedAt === 'number' && existing.updatedAt > updatedAt) {
        return json({ ok: true, skipped: true, data: existing }, { status: 200 }, env, origin)
      }
    } catch {
      /* битое значение — перезапишем */
    }
  }

  await env.REFERRALS.put(key, JSON.stringify({ blob, updatedAt }))
  return json({ ok: true, updatedAt }, { status: 200 }, env, origin)
}
