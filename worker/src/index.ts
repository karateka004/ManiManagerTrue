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

import { ADMIN_HTML } from './admin'

export interface Env {
  BOT_TOKEN: string
  OWNER_CHAT_ID: string
  REFERRALS: KVNamespace
  /** Через запятую: разрешённые Origin (по умолчанию *). */
  ALLOWED_ORIGINS?: string
  /** Режим ежедневной рассылки напоминаний: 'off' | 'owner' | 'all' (по умолчанию 'off'). */
  REMINDERS_MODE?: string
  /** Секрет для owner-only ручного триггера теста напоминаний (/admin/test). */
  ADMIN_KEY?: string
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

/**
 * Шлёт сообщение от бота. `replyMarkup` — опциональная inline-клавиатура.
 * Возвращает `{ ok, status }` из ответа Telegram: status=403 означает, что бот
 * заблокирован пользователем (или аккаунт удалён) — вызывающий может отписать его.
 */
async function sendMessage(
  env: Env,
  chatId: string | number,
  text: string,
  replyMarkup?: unknown,
): Promise<{ ok: boolean; status: number }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN.trim()}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      }),
    })
    return { ok: res.ok, status: res.status }
  } catch {
    return { ok: false, status: 0 }
  }
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
      if (url.pathname === '/reminders' && req.method === 'POST') {
        return await handleReminders(req, env, origin)
      }
      if (url.pathname === '/admin/test' && req.method === 'POST') {
        return await handleAdminTest(req, env, origin)
      }
      if (url.pathname === '/admin' && req.method === 'GET') {
        return new Response(ADMIN_HTML, {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            // Внутренний инструмент: self + inline (графики/скрипт рисуются на странице).
            'Content-Security-Policy':
              "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'",
            'X-Frame-Options': 'DENY',
          },
        })
      }
      if (url.pathname === '/admin/stats' && req.method === 'POST') {
        return await handleAdminStats(req, env, origin)
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

  /** Cron-хендлер: снимок метрик (00:00 МСК) или почасовая рассылка напоминаний (см. wrangler.toml). */
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    if (event.cron === '0 21 * * *') {
      ctx.waitUntil(recordDailySnapshot(env, event.scheduledTime))
    } else {
      ctx.waitUntil(runDailyReminders(env, event.scheduledTime))
    }
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

  // Читаем значение+метаданные сразу: для защиты от гонок и для firstSeen (аналитика).
  const existing = await env.REFERRALS.getWithMetadata<{ updatedAt?: number; firstSeen?: number }>(key)

  // firstSeen — когда пользователя увидели впервые. Старым ключам без firstSeen ставим их
  // прошлый updatedAt (оценка, чтобы они НЕ считались «новыми сегодня»); новым — текущее время.
  let firstSeen: number
  if (typeof existing.metadata?.firstSeen === 'number') {
    firstSeen = existing.metadata.firstSeen
  } else if (existing.value) {
    try {
      firstSeen = parseUpdatedAt((JSON.parse(existing.value) as { updatedAt?: number }).updatedAt)
    } catch {
      firstSeen = updatedAt
    }
  } else {
    firstSeen = updatedAt
  }

  // Защита от гонок между устройствами: не перезаписываем более новую версию старой.
  if (existing.value) {
    try {
      const prev = JSON.parse(existing.value) as { updatedAt?: number }
      if (typeof prev.updatedAt === 'number' && prev.updatedAt > updatedAt) {
        return json({ ok: true, skipped: true, data: prev }, { status: 200 }, env, origin)
      }
    } catch {
      /* битое значение — перезапишем */
    }
  }

  // metadata {updatedAt, firstSeen} — чтобы cron/аналитика читали активность из list без чтения значений.
  await env.REFERRALS.put(key, JSON.stringify({ blob, updatedAt }), { metadata: { updatedAt, firstSeen } })
  return json({ ok: true, updatedAt }, { status: 200 }, env, origin)
}

/* ------------------------------------------------------------------ */
/* Ежедневные напоминания (cron)                                       */
/* ------------------------------------------------------------------ */
/*
 * Раз в день (cron в wrangler.toml) бот пишет тем, кто СЕГОДНЯ ещё не заходил,
 * мягкое напоминание записать траты. Аудитория = ключи `data:<id>` (все, кто
 * синхронизировался). Активность — по `updatedAt`. По умолчанию ВКЛЮЧЕНО; отписка —
 * `remind:<id> = '0'` (тумблер в приложении или авто-отписка при 403 «бот
 * заблокирован»). Дедуп за сутки — `notified:<id>`. Рубильник выката — REMINDERS_MODE.
 */

/** URL мини-аппа для кнопки «Открыть» (публичный, не секрет). */
const APP_URL = 'https://karateka004.github.io/ManiManagerTrue/'
/** Набор текстов напоминаний — ротация по дню (см. pickReminderText). */
const REMINDER_TEXTS = [
  'Есть ли транзакции сегодня? 👀\nЗапиши, пока не забыл — это займёт 10 секунд.',
  'Как прошёл день с деньгами? 💸\nОтметь траты, чтобы ничего не потерялось.',
  'Минутка на финансы 🧾\nВнеси сегодняшние операции в Кошель.',
  'Не забудь записать траты за день ✍️\nПотом сложнее вспомнить.',
  'Сколько ушло сегодня? 🤔\nЗагляни в Кошель и отметь.',
  'Вечерний чек-ин 🌙\nДобавь сегодняшние доходы и расходы.',
  'Деньги любят учёт 📊\nЗапиши, на что потратил сегодня.',
]
const REMINDER_BUTTON = {
  inline_keyboard: [[{ text: '📝 Открыть Кошель', web_app: { url: APP_URL } }]],
}
/** Сколько держим метку «уже слали сегодня» (20 ч — переживает один суточный цикл). */
const NOTIFIED_TTL_SEC = 72000
/** Сдвиг МСК от UTC (у МСК нет перехода на летнее время). */
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000
/**
 * Окно рассылки: cron бежит почасно в 12–17 UTC = 15:00–20:00 МСК. Каждый
 * пользователь привязан к своему часу-слоту (REM_SLOTS штук) детерминированным
 * хешем id — так база разносится по часам, а не шлётся вся разом.
 */
const REM_WINDOW_START_UTC = 12
const REM_SLOTS = 6

/** Начало текущих суток по МСК в epoch ms. */
function startOfTodayMskMs(nowMs: number): number {
  const dayStartMsk = Math.floor((nowMs + MSK_OFFSET_MS) / 86_400_000) * 86_400_000
  return dayStartMsk - MSK_OFFSET_MS
}

/** Текст напоминания на сегодня: ротация по номеру дня МСК (у всех одинаковый, меняется ежедневно). */
function pickReminderText(nowMs: number): string {
  const dayNum = Math.floor((nowMs + MSK_OFFSET_MS) / 86_400_000)
  const n = REMINDER_TEXTS.length
  return REMINDER_TEXTS[((dayNum % n) + n) % n]
}

/** Детерминированный час-слот пользователя в окне рассылки (стабильный хеш id). */
function slotForId(id: string, slots: number): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h % slots
}

/** Установить флаг напоминаний для пользователя (тумблер в приложении). */
async function handleReminders(req: Request, env: Env, origin: string | null): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { initData?: string; enabled?: boolean }
  const user = await verifyInitData(body.initData ?? '', env.BOT_TOKEN)
  if (!user) return json({ ok: false, error: 'bad_init_data' }, { status: 401 }, env, origin)
  if (await isRateLimited(env, 'rem', user.id, 10, 60)) return tooMany(env, origin)

  await env.REFERRALS.put(`remind:${user.id}`, body.enabled ? '1' : '0')
  return json({ ok: true }, { status: 200 }, env, origin)
}

/**
 * Owner-only ручной триггер для проверки: шлёт ВЛАДЕЛЬЦУ сегодняшнее напоминание
 * (тот же текст и кнопка, что в рассылке). Защита — секрет `ADMIN_KEY` в заголовке
 * `X-Admin-Key`. Радиус поражения минимален: эндпоинт всегда пишет только
 * OWNER_CHAT_ID, никого больше зацепить нельзя даже при утечке ключа.
 */
async function handleAdminTest(req: Request, env: Env, origin: string | null): Promise<Response> {
  const key = req.headers.get('X-Admin-Key') ?? ''
  if (!env.ADMIN_KEY || key !== env.ADMIN_KEY) {
    return json({ ok: false, error: 'forbidden' }, { status: 403 }, env, origin)
  }
  const r = await sendMessage(env, env.OWNER_CHAT_ID, pickReminderText(Date.now()), REMINDER_BUTTON)
  return json({ ok: r.ok, status: r.status }, { status: 200 }, env, origin)
}

/**
 * Почасовая рассылка напоминаний по слотам (вызывается из scheduled на каждый час
 * окна 12–17 UTC). `nowMs` — время запуска (event.scheduledTime). В каждый час
 * шлём только тем, чей слот = текущему часу окна, поэтому база разносится во времени.
 */
async function runDailyReminders(env: Env, nowMs: number): Promise<void> {
  const mode = (env.REMINDERS_MODE ?? 'off').trim()
  if (mode === 'off') return

  const text = pickReminderText(nowMs) // один текст на весь день
  const currentSlot = new Date(nowMs).getUTCHours() - REM_WINDOW_START_UTC

  // Тестовый режим: только владельцу и один раз в день (на первом часу окна).
  if (mode === 'owner') {
    if (currentSlot === 0) await sendMessage(env, env.OWNER_CHAT_ID, text, REMINDER_BUTTON)
    return
  }

  // Вне окна рассылки (страховка, если cron сработал в неожиданный час) — ничего.
  if (currentSlot < 0 || currentSlot >= REM_SLOTS) return

  const todayStart = startOfTodayMskMs(nowMs)
  let cursor: string | undefined

  do {
    const page = await env.REFERRALS.list<{ updatedAt: number }>({ prefix: DATA_PREFIX, cursor })
    for (const k of page.keys) {
      const id = k.name.slice(DATA_PREFIX.length)
      if (!id) continue

      // 0) Слот пользователя: не его час окна — пропускаем дёшево, без KV-чтений.
      if (slotForId(id, REM_SLOTS) !== currentSlot) continue

      // 1) Отписан? (дефолт ON = ключ отсутствует)
      if ((await env.REFERRALS.get(`remind:${id}`)) === '0') continue

      // 2) Заходил сегодня? (по метаданным, иначе читаем значение — для старых ключей)
      let updatedAt = k.metadata?.updatedAt
      if (typeof updatedAt !== 'number') {
        try {
          const raw = await env.REFERRALS.get(k.name)
          updatedAt = raw ? (JSON.parse(raw) as { updatedAt?: number }).updatedAt : undefined
        } catch {
          updatedAt = undefined
        }
      }
      if (typeof updatedAt === 'number' && updatedAt >= todayStart) continue

      // 3) Уже слали сегодня?
      if (await env.REFERRALS.get(`notified:${id}`)) continue

      const r = await sendMessage(env, id, text, REMINDER_BUTTON)
      if (r.ok) {
        await env.REFERRALS.put(`notified:${id}`, '1', { expirationTtl: NOTIFIED_TTL_SEC })
      } else if (r.status === 403) {
        // Бот заблокирован / аккаунт удалён — больше не беспокоим + метим для аналитики.
        await env.REFERRALS.put(`remind:${id}`, '0')
        await env.REFERRALS.put(`blocked:${id}`, '1')
      }
    }
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
}

/* ------------------------------------------------------------------ */
/* Аналитика: ежедневные снимки + админ-API                            */
/* ------------------------------------------------------------------ */

const METRICS_PREFIX = 'metrics:'
const METRICS_TTL_SEC = 65 * 86400 // авто-прунинг старых снимков (~2 мес) через TTL KV
const DAY_MS = 86_400_000

interface MetricsRow {
  date: string
  total: number
  withData: number
  new: number
  dau: number
  wau: number
  mau: number
  blocked: number
}

/** Строка даты YYYY-MM-DD по МСК для epoch ms. */
function mskDateStr(ms: number): string {
  const d = new Date(ms + MSK_OFFSET_MS)
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${d.getUTCFullYear()}-${m}-${day}`
}

/** Число заблокировавших бота (ключи blocked:*). */
async function countBlocked(env: Env): Promise<number> {
  let n = 0
  let cursor: string | undefined
  do {
    const page = await env.REFERRALS.list({ prefix: 'blocked:', cursor })
    n += page.keys.length
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
  return n
}

/** Снимок метрик завершившихся суток МСК (cron 00:00 МСК) — история для графиков. */
async function recordDailySnapshot(env: Env, nowMs: number): Promise<void> {
  const todayStart = startOfTodayMskMs(nowMs)
  const endedStart = todayStart - DAY_MS
  const weekAgo = nowMs - 7 * DAY_MS
  const monthAgo = nowMs - 30 * DAY_MS

  let total = 0
  let dau = 0
  let wau = 0
  let mau = 0
  let newCount = 0
  let cursor: string | undefined
  do {
    const page = await env.REFERRALS.list<{ updatedAt?: number; firstSeen?: number }>({ prefix: DATA_PREFIX, cursor })
    for (const k of page.keys) {
      total++
      const u = k.metadata?.updatedAt ?? 0
      if (u >= endedStart && u < todayStart) dau++
      if (u >= weekAgo) wau++
      if (u >= monthAgo) mau++
      const f = k.metadata?.firstSeen
      if (typeof f === 'number' && f >= endedStart && f < todayStart) newCount++
    }
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)

  const lb = await readLeaderboard(env)
  const withData = Object.values(lb).filter((e) => e.ops > 0).length
  const blocked = await countBlocked(env)

  const row: MetricsRow = { date: mskDateStr(endedStart), total, withData, new: newCount, dau, wau, mau, blocked }
  // Дублируем строку в metadata — чтобы дашборд читал историю из list без N чтений.
  await env.REFERRALS.put(`${METRICS_PREFIX}${row.date}`, JSON.stringify(row), {
    metadata: row,
    expirationTtl: METRICS_TTL_SEC,
  })
}

/** Админ-API: агрегированная аналитика. Защита — секрет ADMIN_KEY + лёгкий IP-rate-limit. */
async function handleAdminStats(req: Request, env: Env, origin: string | null): Promise<Response> {
  const key = req.headers.get('X-Admin-Key') ?? ''
  if (!env.ADMIN_KEY || key !== env.ADMIN_KEY) {
    return json({ ok: false, error: 'forbidden' }, { status: 403 }, env, origin)
  }
  const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown'
  if (await isRateLimited(env, 'admin', ip, 60, 60)) return tooMany(env, origin)

  const now = Date.now()
  const todayStart = startOfTodayMskMs(now)
  const yesterdayStart = todayStart - DAY_MS
  const weekAgo = now - 7 * DAY_MS
  const monthAgo = now - 30 * DAY_MS

  let total = 0
  let dau = 0
  let wau = 0
  let mau = 0
  let newToday = 0
  let new7 = 0
  let new30 = 0
  let newYesterday = 0
  let retainedFromYesterday = 0
  let cursor: string | undefined
  do {
    const page = await env.REFERRALS.list<{ updatedAt?: number; firstSeen?: number }>({ prefix: DATA_PREFIX, cursor })
    for (const k of page.keys) {
      total++
      const u = k.metadata?.updatedAt ?? 0
      if (u >= todayStart) dau++
      if (u >= weekAgo) wau++
      if (u >= monthAgo) mau++
      const f = k.metadata?.firstSeen
      if (typeof f === 'number') {
        if (f >= todayStart) newToday++
        if (f >= weekAgo) new7++
        if (f >= monthAgo) new30++
        if (f >= yesterdayStart && f < todayStart) {
          newYesterday++
          if (u >= todayStart) retainedFromYesterday++
        }
      }
    }
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)

  const lb = await readLeaderboard(env)
  const entries = Object.values(lb)
  const withData = entries.filter((e) => e.ops > 0).length
  const sumXp = entries.reduce((s, e) => s + (e.xp || 0), 0)
  const sumCoins = entries.reduce((s, e) => s + (e.coins || 0), 0)
  const avgLevel = entries.length ? entries.reduce((s, e) => s + (e.level || 0), 0) / entries.length : 0
  const totalRefs = entries.reduce((s, e) => s + (e.refs || 0), 0)
  const topXp = [...entries]
    .sort((a, b) => b.xp - a.xp)
    .slice(0, 10)
    .map((e) => ({ name: e.name, username: e.username, level: e.level, xp: e.xp, ops: e.ops }))
  const topRefs = [...entries]
    .filter((e) => (e.refs || 0) > 0)
    .sort((a, b) => (b.refs || 0) - (a.refs || 0))
    .slice(0, 10)
    .map((e) => ({ name: e.name, username: e.username, refs: e.refs }))

  const blocked = await countBlocked(env)

  // История из снимков (metadata в metrics:*).
  const history: MetricsRow[] = []
  let mcur: string | undefined
  do {
    const page = await env.REFERRALS.list<MetricsRow>({ prefix: METRICS_PREFIX, cursor: mcur })
    for (const k of page.keys) if (k.metadata) history.push(k.metadata)
    mcur = page.list_complete ? undefined : page.cursor
  } while (mcur)
  history.sort((a, b) => (a.date < b.date ? -1 : 1))

  const round1 = (x: number) => Math.round(x * 10) / 10
  const stickiness = mau ? round1((dau / mau) * 100) : 0
  const retentionD1 =
    newYesterday > 0
      ? { pct: round1((retainedFromYesterday / newYesterday) * 100), base: newYesterday, returned: retainedFromYesterday }
      : null

  return json(
    {
      ok: true,
      generatedAt: now,
      users: { total, blocked, withData, withDataPct: total ? round1((withData / total) * 100) : 0 },
      newUsers: { today: newToday, d7: new7, d30: new30 },
      active: { dau, wau, mau, stickiness },
      retentionD1,
      referrals: { total: totalRefs },
      game: { sumXp, sumCoins, avgLevel: round1(avgLevel) },
      topXp,
      topRefs,
      history: history.slice(-30),
    },
    { status: 200 },
    env,
    origin,
  )
}
