/**
 * Кошель — Cloudflare Worker (бэкенд для бота).
 *
 * Делает то, чего статичное приложение не может само:
 *   1. /tg/webhook — принимает сообщения боту: «кофе 300» становится операцией.
 *   2. /inbox/* — очередь таких операций до ближайшего открытия приложения.
 *   3. /feedback — принимает отзыв из мини-аппа и шлёт его тебе в ЛС бота.
 *   4. /referral + /stats — учёт реферальных приглашений в KV.
 *   5. /data/* — облачная копия данных пользователя.
 *
 * Безопасность: запросы из мини-аппа обязаны содержать `initData` — подписанную
 * строку от Telegram WebApp. Воркер проверяет HMAC-подпись ботовым токеном,
 * поэтому подделать пользователя нельзя. Токен бота наружу не выходит.
 * Вебхук защищён отдельным секретом в заголовке (см. handleTgWebhook).
 *
 * Секреты (выставляются через `wrangler secret bulk`, см. CLAUDE.md):
 *   BOT_TOKEN         — токен @TrueManiManager_Bot из BotFather
 *   TG_WEBHOOK_SECRET — свой секрет вебхука (его же Telegram шлёт в заголовке)
 *   GEMINI_API_KEY    — ключ разбора сообщений (необязателен: без него работают правила)
 *   ADMIN_KEY         — ключ owner-ручек
 *
 * KV namespace (биндинг в wrangler.toml): REFERRALS
 */

import { ADMIN_HTML } from './admin'
import type { Env } from './env'
import { answerQuestion, APP_URL, BOT_COMMANDS, handleTgUpdate } from './bot'
import { dropFromInbox, readInbox, MAX_INBOX } from './inbox'
import { isRateLimited } from './limits'
import {
  escapeHtml,
  getWebhookInfo,
  sendMessage,
  setChatMenuButton,
  setMyCommands,
  setWebhook,
  type TgUpdate,
} from './tg'

export type { Env }

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
  /** ID надетой косметики (каталог на клиенте; здесь — просто строки). */
  title?: string
  frame?: string
  accent?: string
  ops: number
  coins: number
  streakBest: number
  /** Сколько друзей пригласил (для рейтинга по рефералам). */
  refs: number
  /** epoch ms последнего обновления */
  at: number
  /**
   * epoch ms первого запуска. Профиль уходит при КАЖДОМ старте, поэтому здесь
   * дата регистрации точнее, чем в метаданных `data:` (те появляются только
   * после первой синхронизации). Проставляется один раз и больше не меняется.
   */
  firstSeen?: number
  /** firstSeen — оценка (запись существовала до появления поля). */
  fsx?: 1
}

/** Ключ и лимит размера таблицы лидеров в KV. */
const LB_KEY = 'leaderboard'
const LB_MAX = 500

/* ---------- Потолок XP: рейтинг не должен верить числу из тела запроса ---------- */

/**
 * Клиент сам присылает свой XP, и раньше воркер принимал любое число до
 * миллиарда: одного запроса из консоли хватало, чтобы навсегда занять первое
 * место. Теперь значение режется потолком, выведенным из данных, которые сервер
 * знает сам: числа операций в облачном блобе и своего счётчика рефералов.
 *
 * Константы обязаны совпадать с клиентскими — при изменении правил начисления
 * поправить и здесь, иначе честные игроки упрутся в потолок.
 */
const XP_PER_TRANSACTION = 12 // src/lib/levels.ts
const XP_PER_REFERRAL = 25 // REF_REWARD.xp в src/store/transactions.ts
const XP_ALL_QUESTS = 1385 // сумма xp всех заданий в src/lib/quests.ts (QUESTS_TOTAL_XP)
/**
 * Запас на XP от ежедневной серии (src/lib/streak.ts: 2 XP в день плюс 20/40/100
 * на рубежах 7/14/30). Величина не фиксированная — она копится со временем,
 * поэтому считаем от рекорда серии из блоба самого игрока.
 *
 * Множитель 4 — на то, что серию можно набирать заново много раз, а рекорд при
 * этом не растёт. Слагаемое 600 — запас на рубежи и на игрока, у которого рекорд
 * ещё нулевой. Потолок обязан быть щедрым: заниженный отнимает прогресс у
 * честного человека, а это хуже, чем оставить накрутчику немного простора.
 */
const XP_PER_STREAK_DAY = 2
const STREAK_REBUILD_FACTOR = 4
const XP_STREAK_BASE = 600
/**
 * Запас на операции, записанные ПОСЛЕ последней выгрузки в облако: профиль
 * уходит при запуске, а блоб мог отстать на несколько записей. Потолок не должен
 * задевать честного человека, поэтому небольшой люфт закладываем намеренно.
 */
const XP_GRACE = 30 * XP_PER_TRANSACTION
/** Сколько операций принимаем на веру, если облачного блоба ещё нет (первый запуск). */
const OPS_WITHOUT_BLOB = 500
/**
 * Абсолютный предел, применяемый ко ВСЕМ записям рейтинга при каждой записи —
 * заодно подрезает значения, накрученные до появления проверки. Честному игроку
 * столько не набрать: это порядка 16 000 операций.
 */
/**
 * Абсолютный предел на ОДНУ присланную величину — заслон от значения вроде 1e9.
 * Уже сохранённые результаты не трогаем: накопленный прогресс сохраняется как есть.
 */
const HARD_MAX_XP = 200_000
const HARD_MAX_COINS = 200_000

/** Пороги уровней — копия LEVELS из src/lib/levels.ts. */
const LEVEL_MIN_XP = [0, 60, 180, 400, 750, 1300, 2200, 3500, 5200, 7500]

/** Уровень считаем из XP сами, а не берём из тела запроса. */
function levelForXp(xp: number): number {
  let level = 1
  for (let i = 0; i < LEVEL_MIN_XP.length; i++) if (xp >= LEVEL_MIN_XP[i]) level = i + 1
  return level
}

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
/**
 * Сравнение строк за постоянное время. Обычное `!==` выходит на первом же
 * несовпавшем символе, и по времени ответа подпись теоретически подбирается
 * побайтово. Разница в длине не секрет, её проверяем сразу.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

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
  if (!timingSafeEqual(computed, hash)) return null

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
/* Вызовы Bot API живут в src/tg.ts — их стало больше, чем уместно держать
   в файле с маршрутами (правка сообщения, ответ на кнопку, регистрация вебхука). */

function userLabel(u: TgUser): string {
  const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || 'Без имени'
  const handle = u.username ? ` (@${u.username})` : ''
  return `${escapeHtml(name)}${escapeHtml(handle)} [id ${u.id}]`
}

/* ------------------------------------------------------------------ */
/* Анти-абуз: rate limiting + чтение initData                          */
/* ------------------------------------------------------------------ */
/* Сам ограничитель — в src/limits.ts: им пользуется и бот. */

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
      // Вебхук — первым: это самый частый запрос к воркеру, и он единственный
      // приходит не из мини-аппа, а от Telegram (со своей проверкой доступа).
      if (url.pathname === '/tg/webhook' && req.method === 'POST') {
        return await handleTgWebhook(req, env)
      }
      if (url.pathname === '/ask' && req.method === 'POST') {
        return await handleAsk(req, env, origin)
      }
      if (url.pathname === '/inbox/get' && req.method === 'POST') {
        return await handleInboxGet(req, env, origin)
      }
      if (url.pathname === '/inbox/ack' && req.method === 'POST') {
        return await handleInboxAck(req, env, origin)
      }
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
      if (url.pathname === '/export' && req.method === 'POST') {
        return await handleExport(req, env, origin)
      }
      if (url.pathname === '/reminders' && req.method === 'POST') {
        return await handleReminders(req, env, origin)
      }
      if (url.pathname === '/check-sub' && req.method === 'POST') {
        return await handleCheckSub(req, env, origin)
      }
      if (url.pathname === '/gift-notify' && req.method === 'POST') {
        return await handleGiftNotify(req, env, origin)
      }
      if (url.pathname === '/admin/test' && req.method === 'POST') {
        return await handleAdminTest(req, env, origin)
      }
      if (url.pathname === '/admin/webhook' && req.method === 'POST') {
        return await handleAdminWebhook(req, env, origin)
      }
      if (url.pathname === '/admin' && req.method === 'GET') {
        return new Response(ADMIN_HTML, {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            // Внутренний инструмент: self + inline (графики/скрипт рисуются на странице).
            // Шрифт тот же, что в приложении, — иначе дашборд выглядел бы чужим.
            'Content-Security-Policy':
              "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
              "font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; connect-src 'self'",
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
      ctx.waitUntil(nightlyAnalytics(env, event.scheduledTime))
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
    title?: string
    frame?: string
    accent?: string
  }
  const user = await verifyInitData(body.initData ?? '', env.BOT_TOKEN)
  if (!user) return json({ ok: false, error: 'bad_init_data' }, { status: 401 }, env, origin)
  if (await isRateLimited(env, 'prof', user.id, 10, 60)) return tooMany(env, origin)

  // Число рефералов берём из авторитетного счётчика в KV, а не из тела запроса.
  const refs = clampInt((await env.REFERRALS.get(`count:${user.id}`)) ?? '0')

  // Читаем рейтинг заранее: прежняя запись нужна, чтобы потолок не опустил
  // уже достигнутый результат. Ниже map переприсваивается при обрезке до LB_MAX.
  let map = await readLeaderboard(env)
  const previousEntry = map[String(user.id)]

  // Число операций — из облачного блоба этого пользователя: он пишется другим
  // эндпоинтом и служит здесь независимым источником правды. Блоба может не быть
  // при самом первом запуске — тогда принимаем присланное, но с жёстким лимитом.
  const blobRaw = await env.REFERRALS.get(`${DATA_PREFIX}${user.id}`)
  let blobOps = -1
  let streakBest = 0
  if (blobRaw) {
    try {
      const stored = JSON.parse(blobRaw) as { blob?: unknown }
      if (typeof stored?.blob === 'string') {
        blobOps = blobTxCount(stored.blob)
        streakBest = Math.max(0, blobStreakBest(stored.blob))
      }
    } catch {
      /* битая запись — считаем, что блоба нет */
    }
  }
  const ops = blobOps >= 0 ? blobOps : Math.min(clampInt(body.ops), OPS_WITHOUT_BLOB)
  const streakXp = streakBest * XP_PER_STREAK_DAY * STREAK_REBUILD_FACTOR + XP_STREAK_BASE

  // Потолок: операции + рефералы + все задания + серия + запас на несинхронизированное.
  const maxXp =
    ops * XP_PER_TRANSACTION + refs * XP_PER_REFERRAL + XP_ALL_QUESTS + streakXp + XP_GRACE
  const capped = Math.min(clampInt(body.xp), maxXp, HARD_MAX_XP)

  // Косметика — недоверенные строки: только кап длины, клиент валидирует id по каталогу.
  const cosmetic = (x: unknown): string | undefined =>
    typeof x === 'string' && x ? x.slice(0, 40) : undefined
  const title = cosmetic(body.title)
  const frame = cosmetic(body.frame)
  const accent = cosmetic(body.accent)

  // Потолок только НЕ ПУСКАЕТ выше положенного, но никогда не опускает уже
  // достигнутое: если облачный блоб отстал или пропал, честный игрок не должен
  // потерять позицию. Накрутке это не помогает — поднять значение всё равно
  // можно только до потолка.
  const previousXp = clampInt(previousEntry?.xp)
  const xp = Math.max(capped, previousXp)

  const entry: LeaderEntry = {
    id: user.id,
    name: [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Без имени',
    username: user.username,
    xp,
    level: levelForXp(xp), // уровень выводим из XP, а не принимаем от клиента
    title,
    frame,
    accent,
    ops,
    coins: Math.min(clampInt(body.coins), HARD_MAX_COINS),
    streakBest: Math.min(clampInt(body.streakBest), 3650), // 10 лет — заведомо выше реального
    refs,
    at: Date.now(),
    // Дата первого запуска: ставим один раз и больше не трогаем. Для тех, кто
    // уже был в рейтинге до появления поля, берём дату последнего обновления —
    // это оценка «не позже чем», и аналитика помечает такие когорты приблизительными.
    firstSeen: previousEntry?.firstSeen ?? (previousEntry ? previousEntry.at : Date.now()),
    ...(previousEntry && previousEntry.firstSeen === undefined ? { fsx: 1 as const } : previousEntry?.fsx ? { fsx: 1 as const } : {}),
  }

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
  // Топ, отдаваемый клиенту. 100 — чтобы при нынешней базе (<100 активных)
  // в списке были видны все, а не только первые 50.
  const TOP = 100

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

/**
 * Сколько операций в persist-блобе приложения. Нужно, чтобы «пустой» снимок не
 * затирал сохранённые данные (сбой загрузки на новом устройстве).
 * -1 — блоб не разобрать: тогда по нему не судим и сохраняем как обычно.
 */
function blobTxCount(blob: string): number {
  try {
    const parsed = JSON.parse(blob) as { state?: { transactions?: unknown[] } }
    const list = parsed?.state?.transactions
    return Array.isArray(list) ? list.length : -1
  } catch {
    return -1
  }
}

/**
 * Рекорд ежедневной серии из блоба. Нужен для потолка XP: за серию тоже даётся
 * опыт, и без этого слагаемого потолок со временем задушил бы честного игрока.
 * -1 — блоб не разобрать.
 */
function blobStreakBest(blob: string): number {
  try {
    const parsed = JSON.parse(blob) as { state?: { streak?: { best?: unknown } } }
    const best = Number(parsed?.state?.streak?.best)
    return Number.isFinite(best) && best >= 0 ? Math.min(Math.floor(best), 3650) : 0
  } catch {
    return -1
  }
}

/* ---------- Аналитическая карточка пользователя ----------
   Дашборду нужны не сами данные человека, а несколько чисел про них: сколько
   операций, когда была последняя, какие разделы открывались, заданы ли бюджет и
   цели. Раньше админка ради этого читала и разбирала КАЖДЫЙ блоб на каждый свой
   запрос — это N обращений к KV и десятки мегабайт JSON на одну загрузку
   страницы; на нынешней базе такой запрос упирается в лимит подзапросов Worker.

   Считаем карточку там, где блоб и так уже в руках и уже разбирается, — в момент
   записи (`/data/put`), и кладём её в МЕТАДАННЫЕ ключа. Метаданные приходят
   вместе со списком ключей, поэтому вся аналитика собирается одним `list`.

   Сумм денег здесь нет и не будет: приложение прямо обещает пользователю, что
   доходы и расходы никуда не отправляются. Считаем только количества и даты. */

/** Короткие коды событий — метаданные KV ограничены 1024 байтами, имена туда не влезут. */
const EVENT_CODE: Record<string, string> = {
  visit_analytics: 'a',
  visit_charts: 'c',
  use_period: 'p',
  add_category: 'k',
  set_budget: 'b',
  add_goal: 'g',
  customize: 'z',
  open_planning: 'l',
  open_achievements: 'h',
  open_leaderboard: 'r',
  use_repeat: 'e',
  use_search: 's',
}

interface UserCard {
  /** Операций всего. */
  ops: number
  /** Дата первой/последней операции в epoch-днях (не мс — экономим байты). */
  ft?: number
  lt?: number
  /** Валюта, язык и тема — как настроил пользователь. */
  cur?: string
  lang?: string
  th?: string
  /** Задан общий месячный бюджет. */
  bud?: 1
  /** Сколько категорийных лимитов задано. */
  lim?: number
  gl?: number
  iv?: number
  cat?: number
  sb?: number
  dm?: 1
  rm?: 0
  /** Сколько разных валют встречается в операциях. */
  cc?: number
  /** Счётчики событий по коротким кодам (только ненулевые). */
  ev?: Record<string, number>
  /** Версия persist-стора — видно, кто ещё не обновился. */
  v?: number
}

interface DataMeta {
  updatedAt?: number
  firstSeen?: number
  /** Аналитическая карточка. Появляется у ключа при первой же записи после выката. */
  c?: UserCard
}

/** Потолок метаданных KV — 1024 байта. Держимся ниже с запасом. */
const META_BUDGET = 950

const EPOCH_DAY = 86_400_000

/** Собрать карточку из persist-блоба. null — блоб не разобрать. */
function buildUserCard(blob: string): UserCard | null {
  let state: Record<string, unknown>
  let version: unknown
  try {
    const parsed = JSON.parse(blob) as { state?: Record<string, unknown>; version?: unknown }
    if (!parsed || typeof parsed.state !== 'object' || !parsed.state) return null
    state = parsed.state
    version = parsed.version
  } catch {
    return null
  }

  const len = (x: unknown) => (Array.isArray(x) ? x.length : 0)
  const str = (x: unknown) => (typeof x === 'string' && x.length <= 12 ? x : undefined)

  const txs = Array.isArray(state.transactions) ? (state.transactions as { date?: unknown; currency?: unknown }[]) : []
  let first = Infinity
  let last = -Infinity
  const currencies = new Set<string>()
  for (const t of txs) {
    const ms = typeof t?.date === 'string' ? Date.parse(t.date) : NaN
    if (Number.isFinite(ms)) {
      if (ms < first) first = ms
      if (ms > last) last = ms
    }
    if (typeof t?.currency === 'string' && currencies.size < 12) currencies.add(t.currency)
  }

  const budgets = (state.budgets ?? {}) as Record<string, unknown>
  const limits = Object.keys(budgets).filter((k) => Number(budgets[k]) > 0).length

  const events = (state.events ?? {}) as Record<string, unknown>
  const ev: Record<string, number> = {}
  for (const key of Object.keys(events)) {
    const code = EVENT_CODE[key]
    const n = Math.floor(Number(events[key]) || 0)
    if (code && n > 0) ev[code] = Math.min(n, 99_999)
  }

  const streakBest = Math.floor(Number((state.streak as { best?: unknown } | undefined)?.best) || 0)

  const card: UserCard = { ops: txs.length }
  if (first !== Infinity) card.ft = Math.floor(first / EPOCH_DAY)
  if (last !== -Infinity) card.lt = Math.floor(last / EPOCH_DAY)
  if (str(state.currency)) card.cur = str(state.currency)
  if (str(state.lang)) card.lang = str(state.lang)
  if (str(state.themeMode)) card.th = str(state.themeMode)
  if (Number(state.monthlyBudget) > 0) card.bud = 1
  if (limits > 0) card.lim = limits
  if (len(state.goals)) card.gl = len(state.goals)
  if (len(state.investments)) card.iv = len(state.investments)
  if (len(state.customCategories)) card.cat = len(state.customCategories)
  if (streakBest > 0) card.sb = Math.min(streakBest, 3650)
  if (state.demoMode === true) card.dm = 1
  if (state.remindersEnabled === false) card.rm = 0
  if (currencies.size > 0) card.cc = currencies.size
  if (Object.keys(ev).length) card.ev = ev
  if (typeof version === 'number') card.v = version
  return card
}

/**
 * Метаданные под лимит KV. Если карточка вдруг не влезла — сначала жертвуем
 * событиями, потом карточкой целиком: даты активности важнее, на них держится
 * рассылка напоминаний.
 */
function fitMeta(meta: DataMeta): DataMeta {
  if (JSON.stringify(meta).length <= META_BUDGET) return meta
  if (meta.c?.ev) {
    const trimmed: DataMeta = { ...meta, c: { ...meta.c } }
    delete trimmed.c!.ev
    if (JSON.stringify(trimmed).length <= META_BUDGET) return trimmed
  }
  return { updatedAt: meta.updatedAt, firstSeen: meta.firstSeen }
}

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
    allowEmpty?: boolean
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
  const existing = await env.REFERRALS.getWithMetadata<DataMeta>(key)

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
      const prev = JSON.parse(existing.value) as { updatedAt?: number; blob?: string }
      if (typeof prev.updatedAt === 'number' && prev.updatedAt > updatedAt) {
        return json({ ok: true, skipped: true, data: prev }, { status: 200 }, env, origin)
      }
      // Последний рубеж против потери данных: снимок БЕЗ операций не затирает
      // сохранённый С операциями. Клиент присылает allowEmpty только когда
      // человек сам удалил всё — тогда пустой снимок законен.
      if (!body.allowEmpty && typeof prev.blob === 'string') {
        const prevTx = blobTxCount(prev.blob)
        const nextTx = blobTxCount(blob)
        if (nextTx === 0 && prevTx > 0) {
          return json({ ok: true, skipped: true, reason: 'empty_guard' }, { status: 200 }, env, origin)
        }
      }
    } catch {
      /* битое значение — перезапишем */
    }
  }

  // Метаданные несут всё, что нужно аналитике и рассылке: активность, дату
  // первого визита и компактную карточку. Благодаря им дашборд собирает статистику
  // одним `list`, ни разу не читая сами блобы (см. buildUserCard).
  const meta = fitMeta({ updatedAt, firstSeen, c: buildUserCard(blob) ?? undefined })
  await env.REFERRALS.put(key, JSON.stringify({ blob, updatedAt }), { metadata: meta })
  return json({ ok: true, updatedAt }, { status: 200 }, env, origin)
}

/* ------------------------------------------------------------------ */
/* Бот: приём сообщений и очередь входящих                             */
/* ------------------------------------------------------------------ */

/**
 * Вебхук Telegram.
 *
 * Доверие держится на секрете, который знают только Telegram и мы: он задан в
 * setWebhook и приходит в заголовке каждого обновления. Секрет не выставлен —
 * вебхук закрыт наглухо, и это правильный отказ: принимать «обновления» от кого
 * угодно означало бы, что записать операцию любому нашему пользователю может
 * любой, кто знает его numeric id.
 */
async function handleTgWebhook(req: Request, env: Env): Promise<Response> {
  const secret = env.TG_WEBHOOK_SECRET ?? ''
  const got = req.headers.get('X-Telegram-Bot-Api-Secret-Token') ?? ''
  if (!secret || !timingSafeEqual(got, secret)) {
    return new Response('forbidden', { status: 403 })
  }

  const update = (await req.json().catch(() => null)) as TgUpdate | null
  if (update) {
    try {
      await handleTgUpdate(update, env)
    } catch (e) {
      // Полную ошибку видно в `wrangler tail`.
      console.error('[bot] обновление не обработано', e)
    }
  }
  // Кроме чужого секрета отвечаем 200 всегда: на любой другой ответ Telegram
  // начнёт повторять доставку, и одно непонятое сообщение превратится в поток.
  return new Response('ok', { status: 200 })
}

/**
 * Owner-only регистрация вебхука — чтобы это делалось с телефона, а не из
 * консоли. Защита та же, что у /admin/test: секрет в заголовке X-Admin-Key.
 * Адрес вебхука берём из самого запроса, чтобы не держать копию домена в коде.
 */
async function handleAdminWebhook(req: Request, env: Env, origin: string | null): Promise<Response> {
  const key = req.headers.get('X-Admin-Key') ?? ''
  if (!env.ADMIN_KEY || !timingSafeEqual(key, env.ADMIN_KEY)) {
    return json({ ok: false, error: 'forbidden' }, { status: 403 }, env, origin)
  }
  if (!env.TG_WEBHOOK_SECRET) {
    return json({ ok: false, error: 'no_webhook_secret' }, { status: 400 }, env, origin)
  }

  const target = `${new URL(req.url).origin}/tg/webhook`
  // Накопившуюся очередь сбрасываем: Telegram хранит недоставленные обновления
  // сутки, и среди них наверняка есть «привет» тем, кому бот никогда не отвечал.
  // Записать это сейчас как операции значило бы внести человеку то, чего он не ждёт.
  const set = await setWebhook(env, target, env.TG_WEBHOOK_SECRET, true)
  // Заодно обустраиваем сам чат: список команд для синей кнопки «Меню» и вход в
  // приложение слева от поля ввода. Это настройки бота, а не воркера, — их надо
  // выставить один раз, и логично делать это там же, где регистрируется вебхук.
  const commands = await setMyCommands(env, BOT_COMMANDS)
  const menu = await setChatMenuButton(env, 'Кошель', APP_URL)
  const info = await getWebhookInfo(env)
  return json({ ok: set.ok, url: target, set: set.body, commands, menu, info }, { status: 200 }, env, origin)
}

/**
 * Ассистент в мини-аппе: вопрос про свои деньги — ответ по своим же итогам.
 *
 * Считает и отвечает тот же код, что в чате (bot.ts → answerQuestion): одна
 * логика, одна выжимка, одна квота. Личность — из проверенной подписи initData,
 * поэтому чужие числа сюда попасть не могут.
 */
async function handleAsk(req: Request, env: Env, origin: string | null): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { initData?: string; text?: string }
  const user = await verifyInitData(body.initData ?? '', env.BOT_TOKEN)
  if (!user) return json({ ok: false, error: 'bad_init_data' }, { status: 401 }, env, origin)
  if (await isRateLimited(env, 'ask', user.id, 20, 60)) return tooMany(env, origin)

  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 500) : ''
  if (!text) return json({ ok: false, error: 'empty' }, { status: 400 }, env, origin)

  const res = await answerQuestion(env, user.id, text)
  return json(res, { status: 200 }, env, origin)
}

/** Отдать приложению операции, записанные через бота и ещё не забранные. */
async function handleInboxGet(req: Request, env: Env, origin: string | null): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { initData?: string }
  const user = await verifyInitData(body.initData ?? '', env.BOT_TOKEN)
  if (!user) return json({ ok: false, error: 'bad_init_data' }, { status: 401 }, env, origin)
  if (await isRateLimited(env, 'inbox', user.id, 60, 60)) return tooMany(env, origin)

  const inbox = await readInbox(env, user.id)
  return json({ ok: true, items: inbox.items }, { status: 200 }, env, origin)
}

/**
 * Подтверждение приёма: приложение записало эти операции у себя, из очереди их
 * можно убрать. Именно по списку id, а не «очистить всё» — человек мог написать
 * боту ровно в ту секунду, пока приложение сливало входящие.
 */
async function handleInboxAck(req: Request, env: Env, origin: string | null): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { initData?: string; ids?: unknown }
  const user = await verifyInitData(body.initData ?? '', env.BOT_TOKEN)
  if (!user) return json({ ok: false, error: 'bad_init_data' }, { status: 401 }, env, origin)
  if (await isRateLimited(env, 'inbox', user.id, 60, 60)) return tooMany(env, origin)

  const ids = Array.isArray(body.ids)
    ? body.ids.filter((x): x is string => typeof x === 'string').slice(0, MAX_INBOX)
    : []
  if (ids.length === 0) return json({ ok: true, removed: 0 }, { status: 200 }, env, origin)

  const { removed, left } = await dropFromInbox(env, user.id, ids)
  return json({ ok: true, removed: removed.length, left }, { status: 200 }, env, origin)
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

/**
 * Набор текстов напоминаний — ротация по дню (см. pickReminderText).
 *
 * Раньше напоминание звало открыть приложение — то есть напоминало пойти и
 * совершить ровно то трудное действие, из-за которого трекеры и забрасывают.
 * Теперь оно зовёт написать в этот же чат: ответить на него стоит одного
 * сообщения, не выходя из переписки.
 *
 * Кнопки у напоминания больше нет намеренно. Нажатием нельзя написать сообщение
 * за человека, а кнопка «Открыть Кошель» под текстом «напиши сюда» тянула бы
 * обратно туда, откуда мы уходим.
 */
const REMINDER_TEXTS = [
  'Что сегодня потратил? Напиши сюда одним сообщением — например: кофе 300',
  'Запиши траты, пока помнишь. Хватит одной строки: такси 450',
  'Как прошёл день с деньгами? Напиши прямо сюда: продукты 1200',
  'Не откладывай — потом сложнее вспомнить. Напиши, например: обед 350',
  'Сколько ушло сегодня? Ответь этим сообщением: кофе 300',
  'Вечерний чек-ин. Напиши сюда, что потратил: аптека 480',
  'Деньги любят учёт. Одно сообщение — и записано: бензин 2500',
]
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

/* ------------------------------------------------------------------ */
/* Выгрузка операций файлом                                            */
/* ------------------------------------------------------------------ */

/** Больше двух мегабайт — это уже не выгрузка, а попытка чем-то нас нагрузить. */
const EXPORT_MAX_BYTES = 2 * 1024 * 1024

/** Имя файла чистим до безопасного: приходит оно от клиента. */
function safeFilename(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.replace(/[^A-Za-z0-9._-]/g, '') : ''
  const cut = name.slice(0, 60)
  return cut.toLowerCase().endsWith('.csv') && cut.length > 4 ? cut : 'koshel.csv'
}

/**
 * Отправить пользователю его операции файлом в чат с ботом.
 *
 * Почему через бота, а не ссылкой на скачивание: в webview Telegram обычная
 * ссылка с `download` срабатывает не везде — на iOS она молча ничего не делает.
 * Бот у нас и так есть, и это единственный надёжный способ отдать человеку его
 * собственные данные.
 *
 * Файл приходит от клиента: это данные самого пользователя, и уходят они в его
 * же чат. Проверяем подпись initData, размер и имя файла — этого достаточно.
 */
async function handleExport(req: Request, env: Env, origin: string | null): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { initData?: string; csv?: string; filename?: string; caption?: string }
  const user = await verifyInitData(body.initData ?? '', env.BOT_TOKEN)
  if (!user) return json({ ok: false, error: 'bad_init_data' }, { status: 401 }, env, origin)
  if (await isRateLimited(env, 'exp', user.id, 5, 3600)) return tooMany(env, origin)

  const csv = typeof body.csv === 'string' ? body.csv : ''
  if (!csv.trim()) return json({ ok: false, error: 'empty' }, { status: 400 }, env, origin)

  // BOM обязателен: без него Excel читает кириллицу как мусор.
  const bytes = new TextEncoder().encode(String.fromCharCode(0xfeff) + csv)
  if (bytes.length > EXPORT_MAX_BYTES) {
    return json({ ok: false, error: 'too_large' }, { status: 413 }, env, origin)
  }

  const form = new FormData()
  form.append('chat_id', String(user.id))
  form.append('caption', typeof body.caption === 'string' ? body.caption.slice(0, 200) : '')
  form.append('document', new Blob([bytes], { type: 'text/csv' }), safeFilename(body.filename))

  try {
    const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN.trim()}/sendDocument`, {
      method: 'POST',
      body: form,
    })
    const data = (await res.json()) as { ok?: boolean; description?: string }
    if (data?.ok) return json({ ok: true }, { status: 200 }, env, origin)
    // Бот не может писать первым: человек не запускал его или заблокировал.
    const blocked = /bot was blocked|chat not found|can't initiate conversation/i.test(data?.description ?? '')
    return json({ ok: false, error: blocked ? 'blocked' : 'send_failed' }, { status: 200 }, env, origin)
  } catch (e) {
    console.error('[worker] export failed', e)
    return json({ ok: false, error: 'send_failed' }, { status: 200 }, env, origin)
  }
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

/** Канал для задания «подписаться» (публичный username). */
const CHANNEL_USERNAME = '@Svyat_research'

/**
 * Проверка подписки на канал (задание subscribe_channel): бот вызывает getChatMember.
 * Требует, чтобы бот был АДМИНОМ канала — иначе Telegram не отдаст членство, и мы
 * мягко возвращаем subscribed:false (без 500), чтобы клиент просто показал «Подписаться».
 */
async function handleCheckSub(req: Request, env: Env, origin: string | null): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { initData?: string }
  const user = await verifyInitData(body.initData ?? '', env.BOT_TOKEN)
  if (!user) return json({ ok: false, error: 'bad_init_data' }, { status: 401 }, env, origin)
  if (await isRateLimited(env, 'sub', user.id, 20, 60)) return tooMany(env, origin)

  let subscribed = false
  try {
    const u =
      `https://api.telegram.org/bot${env.BOT_TOKEN.trim()}/getChatMember` +
      `?chat_id=${encodeURIComponent(CHANNEL_USERNAME)}&user_id=${user.id}`
    const r = await fetch(u)
    const data = (await r.json()) as { ok?: boolean; result?: { status?: string } }
    const st = data?.result?.status
    subscribed = data?.ok === true && (st === 'creator' || st === 'administrator' || st === 'member')
  } catch {
    subscribed = false
  }
  return json({ ok: true, subscribed }, { status: 200 }, env, origin)
}

/* ------------------------------------------------------------------ */
/* Персональные подарки: поздравление от бота                          */
/* ------------------------------------------------------------------ */

/**
 * Тексты поздравлений по id награды. Сервер шлёт ТОЛЬКО известные награды —
 * произвольный текст с клиента отправить нельзя.
 */
const GIFT_MESSAGES: Record<string, string> = {
  title_ambassador:
    '🎁 <b>Персональная награда от команды Кошеля</b>\n\n' +
    'Тебе вручён легендарный титул <b>«Амбассадор»</b> — особый знак за преданность приложению. ' +
    'Он уже у тебя в профиле и виден всем в таблице лидеров.\n\nСпасибо, что ты с нами! 💚',
}

/**
 * Поздравление получателю персонального подарка. Вызывается приложением в момент
 * выдачи (см. useGrantPersonalGifts): личность берём из проверенной подписи
 * initData — чужому человеку сообщение не уйдёт, численный id заранее не нужен.
 * Дедуп в KV (`giftmsg:<id>:<rewardId>`, бессрочно) — каждый подарок поздравляем один раз.
 */
async function handleGiftNotify(req: Request, env: Env, origin: string | null): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { initData?: string; rewards?: unknown }
  const user = await verifyInitData(body.initData ?? '', env.BOT_TOKEN)
  if (!user) return json({ ok: false, error: 'bad_init_data' }, { status: 401 }, env, origin)
  if (await isRateLimited(env, 'gift', user.id, 5, 60)) return tooMany(env, origin)

  const rewards = Array.isArray(body.rewards)
    ? body.rewards.filter((r): r is string => typeof r === 'string').slice(0, 10)
    : []

  let sent = 0
  for (const rewardId of rewards) {
    const text = GIFT_MESSAGES[rewardId]
    if (!text) continue // неизвестная награда — молча пропускаем
    const dedupKey = `giftmsg:${user.id}:${rewardId}`
    if (await env.REFERRALS.get(dedupKey)) continue
    const r = await sendMessage(env, user.id, text, {
      inline_keyboard: [[{ text: '👑 Открыть Кошель', web_app: { url: APP_URL } }]],
    })
    if (r.ok) {
      await env.REFERRALS.put(dedupKey, '1')
      sent++
    }
  }
  return json({ ok: true, sent }, { status: 200 }, env, origin)
}

/**
 * Owner-only ручной триггер для проверки: шлёт ВЛАДЕЛЬЦУ сегодняшнее напоминание
 * (тот же текст и кнопка, что в рассылке). Защита — секрет `ADMIN_KEY` в заголовке
 * `X-Admin-Key`. Радиус поражения минимален: эндпоинт всегда пишет только
 * OWNER_CHAT_ID, никого больше зацепить нельзя даже при утечке ключа.
 */
async function handleAdminTest(req: Request, env: Env, origin: string | null): Promise<Response> {
  const key = req.headers.get('X-Admin-Key') ?? ''
  if (!env.ADMIN_KEY || !timingSafeEqual(key, env.ADMIN_KEY)) {
    return json({ ok: false, error: 'forbidden' }, { status: 403 }, env, origin)
  }
  const r = await sendMessage(env, env.OWNER_CHAT_ID, pickReminderText(Date.now()))
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
    if (currentSlot === 0) await sendMessage(env, env.OWNER_CHAT_ID, text)
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

      const r = await sendMessage(env, id, text)
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
/* Аналитика: единая таблица пользователей, снимки, админ-API           */
/* ------------------------------------------------------------------ */
/*
 * Принцип: все метрики считаются из ОДНОГО множества людей. Раньше «всего»
 * брали из ключей `data:*`, а «с операциями» — из рейтинга, и процент одного от
 * другого получался бессмысленным: это разные популяции (в рейтинг попадают при
 * запуске, ключ `data:` появляется только после первой синхронизации).
 *
 * Сбор стоит несколько подзапросов независимо от размера базы: перечисление
 * ключей отдаёт метаданные вместе со списком, а карточка пользователя (ops,
 * даты, разделы, настройки) уже лежит в метаданных — см. buildUserCard.
 */

const METRICS_PREFIX = 'metrics:'
const METRICS_TTL_SEC = 65 * 86400 // авто-прунинг старых снимков (~2 мес) через TTL KV
const DAY_MS = 86_400_000

/**
 * Названия событий-вовлечения. Ключи — РЕАЛЬНЫЕ счётчики из `store.events`
 * (см. вызовы track() и bumpEvent() в src/store/transactions.ts). Прежний список
 * наполовину состоял из id заданий (`first_tx`, `see_analytics`, `try_period`…),
 * которые никогда не инкрементятся, — эти строки в дашборде были всегда пустыми,
 * а реальные `use_repeat`/`use_search` выводились сырыми ключами.
 */
const EVENT_LABELS: Record<string, string> = {
  visit_analytics: 'Аналитика',
  visit_charts: 'Динамика',
  use_period: 'Смена периода',
  use_search: 'Поиск по операциям',
  use_repeat: 'Повтор операции',
  open_planning: 'Планирование',
  set_budget: 'Бюджет и лимиты',
  add_goal: 'Цели',
  add_category: 'Свои категории',
  customize: 'Оформление',
  open_achievements: 'Достижения',
  open_leaderboard: 'Лидерборд',
}
/** Обратная карта: короткий код в карточке → имя события. */
const CODE_EVENT: Record<string, string> = Object.fromEntries(
  Object.entries(EVENT_CODE).map(([ev, code]) => [code, ev]),
)

interface MetricsRow {
  date: string
  total: number
  withData: number
  new: number
  dau: number
  wau: number
  mau: number
  blocked: number
  /** Сколько человек записали хоть одну операцию за последние 7 дней. */
  writers?: number
}

/** Строка даты YYYY-MM-DD по МСК для epoch ms. */
function mskDateStr(ms: number): string {
  const d = new Date(ms + MSK_OFFSET_MS)
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${d.getUTCFullYear()}-${m}-${day}`
}

/** Все id по префиксу ключа (значения не читаем — только имена). */
async function idsByPrefix(env: Env, prefix: string): Promise<Set<string>> {
  const out = new Set<string>()
  let cursor: string | undefined
  do {
    const page = await env.REFERRALS.list({ prefix, cursor })
    for (const k of page.keys) out.add(k.name.slice(prefix.length))
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
  return out
}

/** Человек в аналитике: слияние облачного ключа, карточки и записи рейтинга. */
interface Person {
  id: string
  name: string
  username?: string
  /** epoch ms первого и последнего появления. */
  firstSeen: number
  lastSeen: number
  /** Дата регистрации — оценка (пользователь появился раньше, чем мы начали её писать). */
  approx: boolean
  ops: number
  xp: number
  level: number
  refs: number
  /** Пришёл по чьей-то реферальной ссылке. */
  fromRef: boolean
  /** Заблокировал бота. */
  blocked: boolean
  card?: UserCard
}

/**
 * Единая таблица пользователей. Источники:
 *  - ключи `data:<id>` — метаданные (активность, дата первого визита, карточка);
 *  - рейтинг — имя, XP, уровень, операции, рефералы и дата запуска (профиль
 *    уходит при КАЖДОМ старте, поэтому здесь есть и те, кто ещё не синхронизировался);
 *  - `claimed:<id>` — кто пришёл по приглашению;
 *  - `blocked:<id>` — кто заблокировал бота.
 */
async function collectPeople(env: Env): Promise<{ people: Person[]; withCard: number; cloudKeys: number }> {
  const meta = new Map<string, DataMeta>()
  let cursor: string | undefined
  do {
    const page = await env.REFERRALS.list<DataMeta>({ prefix: DATA_PREFIX, cursor })
    for (const k of page.keys) meta.set(k.name.slice(DATA_PREFIX.length), k.metadata ?? {})
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)

  const [lb, referred, blocked] = await Promise.all([
    readLeaderboard(env),
    idsByPrefix(env, 'claimed:'),
    idsByPrefix(env, 'blocked:'),
  ])

  const ids = new Set<string>([...meta.keys(), ...Object.keys(lb)])
  const people: Person[] = []
  let withCard = 0

  for (const id of ids) {
    const m = meta.get(id)
    const e = lb[id]
    const cloudAt = typeof m?.updatedAt === 'number' ? m.updatedAt : 0
    const launchAt = e?.at ?? 0
    const lastSeen = Math.max(cloudAt, launchAt)

    // Дата регистрации: берём самую раннюю из известных. Оценкой считаем случай,
    // когда обе метки появились уже после того, как человек начал пользоваться, —
    // тогда «когорта» у него условная, и дашборд говорит об этом честно.
    const candidates = [m?.firstSeen, e?.firstSeen].filter((x): x is number => typeof x === 'number' && x > 0)
    const firstSeen = candidates.length ? Math.min(...candidates) : lastSeen
    const approx = e?.fsx === 1 || candidates.length === 0

    if (m?.c) withCard++
    people.push({
      id,
      name: e?.name ?? 'Без имени',
      username: e?.username,
      firstSeen,
      lastSeen,
      approx,
      ops: m?.c ? m.c.ops : (e?.ops ?? 0),
      xp: e?.xp ?? 0,
      level: e?.level ?? 1,
      refs: e?.refs ?? 0,
      fromRef: referred.has(id),
      blocked: blocked.has(id),
      card: m?.c,
    })
  }

  people.sort((a, b) => b.lastSeen - a.lastSeen)
  return { people, withCard, cloudKeys: meta.size }
}

/**
 * Ночная аналитика: снимок суток плюс небольшая порция дозаполнения карточек.
 * Порция маленькая, чтобы ночной запуск не упёрся в лимит подзапросов; за
 * несколько ночей база догоняется сама, а срочно это делается кнопкой в дашборде.
 */
async function nightlyAnalytics(env: Env, nowMs: number): Promise<void> {
  await recordDailySnapshot(env, nowMs)
  try {
    await backfillCards(env, BACKFILL_SLICE)
  } catch (e) {
    console.error('[worker] backfill failed', e)
  }
}

/** Снимок метрик завершившихся суток МСК (cron 00:00 МСК) — история для графиков. */
async function recordDailySnapshot(env: Env, nowMs: number): Promise<void> {
  const todayStart = startOfTodayMskMs(nowMs)
  const endedStart = todayStart - DAY_MS
  const { people } = await collectPeople(env)
  const dayNow = Math.floor(nowMs / DAY_MS)

  let dau = 0
  let wau = 0
  let mau = 0
  let newCount = 0
  let writers = 0
  let withData = 0
  let blocked = 0
  for (const p of people) {
    if (p.lastSeen >= endedStart && p.lastSeen < todayStart) dau++
    if (p.lastSeen >= nowMs - 7 * DAY_MS) wau++
    if (p.lastSeen >= nowMs - 30 * DAY_MS) mau++
    if (p.firstSeen >= endedStart && p.firstSeen < todayStart) newCount++
    if (p.ops > 0) withData++
    if (p.blocked) blocked++
    if (p.card?.lt !== undefined && dayNow - p.card.lt <= 7) writers++
  }

  const row: MetricsRow = {
    date: mskDateStr(endedStart),
    total: people.length,
    withData,
    new: newCount,
    dau,
    wau,
    mau,
    blocked,
    writers,
  }
  // Дублируем строку в metadata — чтобы дашборд читал историю из list без N чтений.
  await env.REFERRALS.put(`${METRICS_PREFIX}${row.date}`, JSON.stringify(row), {
    metadata: row,
    expirationTtl: METRICS_TTL_SEC,
  })
  await appendHistory(env, row)
}

/**
 * Скользящая история в ОДНОМ ключе. Раньше дашборд собирал график из метаданных
 * ключей `metrics:*` — это работает, пока строка снимка влезает в лимит
 * метаданных KV (1024 байта) и пока ключи не вычищены по TTL. Один массив
 * читается одним запросом, не зависит от лимита метаданных и переживает
 * прунинг посуточных ключей.
 */
const HISTORY_KEY = 'metrics-history'
const HISTORY_MAX = 120

async function readHistory(env: Env): Promise<MetricsRow[]> {
  try {
    const raw = await env.REFERRALS.get(HISTORY_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(parsed) ? (parsed as MetricsRow[]) : []
  } catch {
    return []
  }
}

async function appendHistory(env: Env, row: MetricsRow): Promise<void> {
  const rows = (await readHistory(env)).filter((r) => r && r.date !== row.date)
  rows.push(row)
  rows.sort((a, b) => (a.date < b.date ? -1 : 1))
  await env.REFERRALS.put(HISTORY_KEY, JSON.stringify(rows.slice(-HISTORY_MAX)))
}

/* ---------- Дозаполнение карточек ---------- */
/*
 * Карточка появляется у ключа при первой записи после выката. У тех, кто с тех пор
 * не заходил, её нет, и в разрезах они не видны. Проходим базу порциями: читаем
 * блоб, считаем карточку, кладём значение обратно с новыми метаданными.
 *
 * Порция маленькая намеренно — у Worker есть потолок подзапросов на один вызов,
 * и упереться в него на большой базе значит не получить вообще ничего.
 *
 * Гонка с одновременной записью пользователя теоретически возможна (мы вернём его
 * прежний блоб), но она самоисправляется: локальная метка времени у клиента
 * останется новее серверной, и при следующем запуске он зальёт свои данные заново.
 */
const BACKFILL_CURSOR_KEY = 'admin:backfill-cursor'
// 12 ключей за нажатие = 24 обращения к KV. Вместе со сбором статистики в том же
// запросе это заведомо ниже потолка подзапросов Worker — лучше несколько нажатий,
// чем один запрос, который целиком упадёт на большой базе.
const BACKFILL_SLICE = 12

async function backfillCards(env: Env, slice: number): Promise<{ scanned: number; filled: number; done: boolean }> {
  const startCursor = (await env.REFERRALS.get(BACKFILL_CURSOR_KEY)) ?? undefined
  const page = await env.REFERRALS.list<DataMeta>({ prefix: DATA_PREFIX, cursor: startCursor, limit: 200 })

  let scanned = 0
  let filled = 0
  for (const k of page.keys) {
    if (filled >= slice) break
    scanned++
    if (k.metadata?.c) continue
    const got = await env.REFERRALS.getWithMetadata<DataMeta>(k.name)
    if (!got.value) continue
    let stored: { blob?: string; updatedAt?: number }
    try {
      stored = JSON.parse(got.value) as { blob?: string; updatedAt?: number }
    } catch {
      continue
    }
    if (typeof stored.blob !== 'string') continue
    const card = buildUserCard(stored.blob)
    if (!card) continue
    const updatedAt = parseUpdatedAt(stored.updatedAt)
    const meta = fitMeta({
      updatedAt,
      firstSeen: got.metadata?.firstSeen ?? updatedAt,
      c: card,
    })
    await env.REFERRALS.put(k.name, got.value, { metadata: meta })
    filled++
  }

  // Курсор двигаем только когда страница пройдена целиком, иначе на следующем
  // заходе перепрыгнули бы ключи, до которых не добрались из-за лимита порции.
  const finishedPage = scanned >= page.keys.length
  const done = finishedPage && page.list_complete
  if (done) await env.REFERRALS.delete(BACKFILL_CURSOR_KEY)
  else if (finishedPage && !page.list_complete) await env.REFERRALS.put(BACKFILL_CURSOR_KEY, page.cursor)

  return { scanned, filled, done }
}

/* ---------- Админ-API ---------- */

/** Доля в процентах с одним знаком. */
function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0
}

/** Понедельник недели (МСК) в epoch ms — ключ когорты. */
function weekStartMsk(ms: number): number {
  const dayStart = Math.floor((ms + MSK_OFFSET_MS) / DAY_MS) * DAY_MS - MSK_OFFSET_MS
  // 1970-01-01 — четверг, поэтому сдвигаем на 3 дня, чтобы неделя начиналась с понедельника.
  const dayIndex = Math.floor((dayStart + MSK_OFFSET_MS) / DAY_MS)
  const dow = (dayIndex + 3) % 7
  return dayStart - dow * DAY_MS
}

/** Админ-API: агрегированная аналитика. Защита — секрет ADMIN_KEY + лёгкий IP-rate-limit. */
async function handleAdminStats(req: Request, env: Env, origin: string | null): Promise<Response> {
  const key = req.headers.get('X-Admin-Key') ?? ''
  if (!env.ADMIN_KEY || !timingSafeEqual(key, env.ADMIN_KEY)) {
    return json({ ok: false, error: 'forbidden' }, { status: 403 }, env, origin)
  }
  const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown'
  if (await isRateLimited(env, 'admin', ip, 60, 60)) return tooMany(env, origin)

  const body = (await req.json().catch(() => ({}))) as { backfill?: boolean }

  // Дозаполнение карточек по кнопке — до сбора статистики, чтобы результат
  // сразу был виден в этом же ответе.
  let backfill: { scanned: number; filled: number; done: boolean } | null = null
  if (body.backfill) backfill = await backfillCards(env, BACKFILL_SLICE)

  const now = Date.now()
  const todayStart = startOfTodayMskMs(now)
  const dayNow = Math.floor(now / DAY_MS)
  const d7 = now - 7 * DAY_MS
  const d14 = now - 14 * DAY_MS
  const d30 = now - 30 * DAY_MS

  const { people, withCard, cloudKeys } = await collectPeople(env)
  const total = people.length

  /* ---------- Базовые счётчики ---------- */
  let dau = 0
  let wau = 0
  let mau = 0
  let newToday = 0
  let new7 = 0
  let newPrev7 = 0
  let new30 = 0
  let withOps = 0
  let fromRef = 0
  let blocked = 0
  let remindersOff = 0
  let writers7 = 0
  let writers30 = 0
  let sleeping = 0
  let churned = 0
  let zeroOps = 0

  /* Воронка. Каждый шаг — это ПОДМНОЖЕСТВО предыдущего (условие складывается с
     условиями всех шагов выше), иначе «воронка» местами расширялась бы и потери
     между шагами теряли смысл. Признаки, которые в такую цепочку не встают
     (например, заданный бюджет), считаем отдельными числами, а не ступенями. */
  let f1 = 0 // записали операцию
  let f2 = 0 // …и вернулись в другой день
  let f3 = 0 // …и набрали 5 операций
  let f4 = 0 // …и записывали за последние 30 дней
  let planned = 0 // задали бюджет, лимит или цель (отдельная метрика)

  // «Вернулись хотя бы раз»: считаем только по тем, кто зарегистрировался
  // минимум сутки назад — у сегодняшних новичков шанса вернуться ещё не было.
  let returnBase = 0
  let returned = 0

  const sections: Record<string, { users: number; total: number; active: number }> = {}
  const currency: Record<string, number> = {}
  const lang: Record<string, number> = {}
  const theme: Record<string, number> = {}
  const versions: Record<string, number> = {}
  const opsBuckets = [0, 0, 0, 0, 0] // 0 / 1–4 / 5–19 / 20–99 / 100+

  let sumXp = 0
  let sumLevel = 0
  let totalRefs = 0

  for (const p of people) {
    if (p.lastSeen >= todayStart) dau++
    if (p.lastSeen >= d7) wau++
    if (p.lastSeen >= d30) mau++
    else churned++
    if (p.lastSeen < d7 && p.lastSeen >= d30) sleeping++
    if (p.firstSeen >= todayStart) newToday++
    if (p.firstSeen >= d7) new7++
    if (p.firstSeen >= d14 && p.firstSeen < d7) newPrev7++
    if (p.firstSeen >= d30) new30++
    if (p.fromRef) fromRef++
    if (p.blocked) blocked++

    sumXp += p.xp
    sumLevel += p.level
    totalRefs += p.refs

    const c = p.card
    if (c) {
      if (c.rm === 0) remindersOff++
      if (c.lt !== undefined) {
        if (dayNow - c.lt <= 7) writers7++
        if (dayNow - c.lt <= 30) writers30++
      }
      if (c.cur) currency[c.cur] = (currency[c.cur] ?? 0) + 1
      if (c.lang) lang[c.lang] = (lang[c.lang] ?? 0) + 1
      if (c.th) theme[c.th] = (theme[c.th] ?? 0) + 1
      if (c.v !== undefined) versions[String(c.v)] = (versions[String(c.v)] ?? 0) + 1
      if (c.ev) {
        const activeNow = p.lastSeen >= d30
        for (const code of Object.keys(c.ev)) {
          const ev = CODE_EVENT[code]
          if (!ev) continue
          const s = sections[ev] ?? { users: 0, total: 0, active: 0 }
          s.users += 1
          s.total += c.ev[code]
          if (activeNow) s.active += 1
          sections[ev] = s
        }
      }
      if (c.bud || c.lim || c.gl) planned++
    }

    const ops = p.ops
    if (ops > 0) withOps++
    else zeroOps++
    if (ops === 0) opsBuckets[0]++
    else if (ops < 5) opsBuckets[1]++
    else if (ops < 20) opsBuckets[2]++
    else if (ops < 100) opsBuckets[3]++
    else opsBuckets[4]++

    const cameBack = Math.floor((p.lastSeen + MSK_OFFSET_MS) / DAY_MS) > Math.floor((p.firstSeen + MSK_OFFSET_MS) / DAY_MS)
    const writes30 = p.card?.lt !== undefined && dayNow - p.card.lt <= 30
    if (ops >= 1) {
      f1++
      if (cameBack) {
        f2++
        if (ops >= 5) {
          f3++
          if (writes30) f4++
        }
      }
    }
    if (p.firstSeen < todayStart) {
      returnBase++
      if (cameBack) returned++
    }
  }

  /* ---------- Рейтинг: монеты и топы ---------- */
  const lb = await readLeaderboard(env)
  const entries = Object.values(lb)
  const sumCoins = entries.reduce((s, e) => s + (e.coins || 0), 0)
  const topXp = [...entries]
    .sort((a, b) => b.xp - a.xp)
    .slice(0, 10)
    .map((e) => ({ name: e.name, username: e.username, level: e.level, xp: e.xp, ops: e.ops }))
  const topRefs = [...entries]
    .filter((e) => (e.refs || 0) > 0)
    .sort((a, b) => (b.refs || 0) - (a.refs || 0))
    .slice(0, 10)
    .map((e) => ({ name: e.name, username: e.username, refs: e.refs }))

  /* ---------- Когорты по неделям ---------- */
  const cohortMap = new Map<number, { joined: number; activated: number; alive: number; approx: number }>()
  const firstWeek = weekStartMsk(now - 56 * DAY_MS)
  for (const p of people) {
    const w = weekStartMsk(p.firstSeen)
    if (w < firstWeek) continue
    const c = cohortMap.get(w) ?? { joined: 0, activated: 0, alive: 0, approx: 0 }
    c.joined++
    if (p.ops > 0) c.activated++
    if (p.lastSeen >= d7) c.alive++
    if (p.approx) c.approx++
    cohortMap.set(w, c)
  }
  // Недели без единого новичка тоже показываем нулевой строкой: пропуск в таблице
  // читался бы как «этой недели не было», а не как «на этой неделе никто не пришёл».
  const cohorts: { week: string; joined: number; activated: number; alive: number; approx: number }[] = []
  for (let w = firstWeek; w <= weekStartMsk(now); w += 7 * DAY_MS) {
    const c = cohortMap.get(w) ?? { joined: 0, activated: 0, alive: 0, approx: 0 }
    cohorts.push({ week: mskDateStr(w), ...c })
  }

  /* ---------- История снимков ----------
     Основной источник — скользящий массив. Посуточные ключи читаем следом ради
     тех двух месяцев, что накопились до его появления: их метаданные уже есть в
     ответе list, лишних обращений это не стоит. */
  const byDate = new Map<string, MetricsRow>()
  let mcur: string | undefined
  do {
    const page = await env.REFERRALS.list<MetricsRow>({ prefix: METRICS_PREFIX, cursor: mcur })
    for (const k of page.keys) if (k.metadata?.date) byDate.set(k.metadata.date, k.metadata)
    mcur = page.list_complete ? undefined : page.cursor
  } while (mcur)
  for (const r of await readHistory(env)) if (r?.date) byDate.set(r.date, r)
  const history = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1))

  const sectionList = Object.keys(sections)
    .map((ev) => ({
      key: ev,
      label: EVENT_LABELS[ev] ?? ev,
      users: sections[ev].users,
      active: sections[ev].active,
      total: sections[ev].total,
    }))
    .sort((a, b) => b.users - a.users || b.total - a.total)

  const dist = (m: Record<string, number>) =>
    Object.keys(m)
      .map((k) => ({ key: k, n: m[k] }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 8)

  return json(
    {
      ok: true,
      generatedAt: now,
      backfill,
      coverage: { withCard, cloudKeys, total, pct: pct(withCard, cloudKeys), launchOnly: total - cloudKeys },
      users: {
        total,
        blocked,
        withOps,
        withOpsPct: pct(withOps, total),
        zeroOps,
        fromRef,
        organic: total - fromRef,
        remindersOff,
      },
      newUsers: { today: newToday, d7: new7, prev7: newPrev7, d30: new30 },
      active: { dau, wau, mau, stickiness: pct(dau, mau), writers7, writers30 },
      lifecycle: { active: wau, sleeping, churned, zeroOps },
      funnel: [
        { key: 'open', label: 'Открыли приложение', users: total },
        { key: 'tx1', label: 'Записали операцию', users: f1 },
        { key: 'back', label: '…и вернулись в другой день', users: f2 },
        { key: 'tx5', label: '…и набрали 5 операций', users: f3 },
        { key: 'live', label: '…и пишут до сих пор', users: f4 },
      ],
      planned,
      retention: { returnedPct: pct(returned, returnBase), returned, base: returnBase },
      cohorts,
      referrals: { total: totalRefs },
      game: { sumXp, sumCoins, avgLevel: total ? Math.round((sumLevel / total) * 10) / 10 : 0 },
      topXp,
      topRefs,
      sections: sectionList,
      settings: {
        currency: dist(currency),
        lang: dist(lang),
        theme: dist(theme),
        version: dist(versions),
      },
      opsBuckets,
      history: history.slice(-60),
      people: people.slice(0, 300).map((p) => ({
        id: p.id,
        name: p.name,
        username: p.username,
        firstSeen: p.firstSeen,
        lastSeen: p.lastSeen,
        approx: p.approx,
        ops: p.ops,
        xp: p.xp,
        level: p.level,
        refs: p.refs,
        fromRef: p.fromRef,
        blocked: p.blocked,
        lastTx: p.card?.lt,
        hasCard: !!p.card,
      })),
      dayNow,
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
    env,
    origin,
  )
}
