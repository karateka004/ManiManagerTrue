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
import { ADMIN_URL, answerQuestion, APP_URL, BOT_COMMANDS, handleTgUpdate } from './bot'
import { dropFromInbox, readInbox, MAX_INBOX } from './inbox'
import { isRateLimited } from './limits'
import {
  BACKFILL_SLICE,
  DATA_PREFIX,
  activityStrip,
  assemble as assembleParts,
  backfillCards,
  buildUserCard,
  collectPeople,
  computeDashboard,
  dayReport,
  digestText,
  fitMeta,
  parseUpdatedAt,
  readHistory,
  recordSnapshot,
  sectionsOf,
  snapshotRow,
  type Collected,
  type DataMeta,
  type WebhookHealth,
} from './analytics'
import { MSK_OFFSET_MS, markDay, mskDay, mskDayStart, startOfTodayMskMs } from './days'
import { SRC_PREFIX, campaignTag, startParamOf, type SourceMeta } from './sources'
import type { InboxMeta } from './inbox'
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
  /**
   * Метка рекламной ссылки, по которой человек впервые открыл приложение
   * (sources.ts). Только для аналитики — в публичный рейтинг не уходит.
   */
  src?: string
  /**
   * Дни запусков приложения: маска и день её нулевого бита (days.ts). По ним
   * считается честное удержание D1…D30. Только для аналитики.
   */
  vm?: string
  vd?: number
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
            // telegram.org — скрипт WebApp: открытый из бота, дашборд входит по
            // подписи владельца без пароля. Встраивать страницу разрешено только
            // веб-версии Telegram (она открывает мини-аппы во фрейме).
            'Content-Security-Policy':
              "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
              "font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline' https://telegram.org; " +
              "connect-src 'self'; img-src 'self' data:; frame-ancestors 'self' https://web.telegram.org",
            'Cache-Control': 'no-store',
          },
        })
      }
      if (url.pathname === '/admin/stats' && req.method === 'POST') {
        return await handleAdminStats(req, env, origin)
      }
      if (url.pathname === '/admin/person' && req.method === 'POST') {
        return await handleAdminPerson(req, env, origin)
      }
      if (url.pathname === '/admin/digest' && req.method === 'POST') {
        return await handleAdminDigest(req, env, origin)
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
    } else if (event.cron === LB_CRON) {
      ctx.waitUntil(rebuildLeaderboard(env))
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

  // Прежняя карточка нужна, чтобы потолок не опустил уже достигнутый результат.
  const previousEntry = await readOwnLeaderEntry(env, user.id)

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

  const now = Date.now()
  // День запуска — в маску дней. Новой записи в KV это не стоит: карточка и так
  // переписывается при первом за сутки запуске (см. проверку ниже).
  const visits = markDay(
    previousEntry?.vm !== undefined ? { m: previousEntry.vm, d: previousEntry.vd } : undefined,
    mskDay(now),
  )
  // Метка рекламной ссылки — только при самом первом запуске: считаем первое
  // касание, и старый пользователь, нажавший на рекламу, не попадёт в её улов.
  const src = previousEntry ? previousEntry.src : (campaignTag(startParamOf(body.initData ?? '')) ?? undefined)

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
    at: now,
    // Дата первого запуска: ставим один раз и больше не трогаем. Для тех, кто
    // уже был в рейтинге до появления поля, берём дату последнего обновления —
    // это оценка «не позже чем», и аналитика помечает такие когорты приблизительными.
    firstSeen: previousEntry?.firstSeen ?? (previousEntry ? previousEntry.at : now),
    ...(previousEntry && previousEntry.firstSeen === undefined ? { fsx: 1 as const } : previousEntry?.fsx ? { fsx: 1 as const } : {}),
    ...(src ? { src } : {}),
    vm: visits.m,
    vd: visits.d,
  }

  // Профиль уходит при каждом запуске приложения, а меняется редко. Писать
  // карточку заново имеет смысл, только если в ней что-то изменилось или если
  // прошлая запись была в другие сутки: дата последнего визита нужна аналитике,
  // но с точностью до дня, а не до запуска.
  if (previousEntry && sameLeaderEntry(previousEntry, entry) && sameMskDay(previousEntry.at, entry.at)) {
    return json({ ok: true, unchanged: true }, { status: 200 }, env, origin)
  }

  try {
    await writeOwnLeaderEntry(env, entry)
  } catch (e) {
    // Не удалось записать карточку — это не повод ронять запуск приложения:
    // рейтинг подтянется при следующем визите.
    console.error('[profile] карточка не записана', e)
  }
  return json({ ok: true }, { status: 200 }, env, origin)
}

/* ---------- Рейтинг: карточка на человека + сборка кроном ----------
   Раньше весь рейтинг был ОДНИМ ключом KV, и каждый запуск приложения у
   каждого человека читал его целиком, менял свою строку и писал обратно. Это
   ломалось трижды:
     - KV принимает не больше одной записи в секунду на ключ, и после рассылки
       запуски шли бы чаще — записи отбивались бы с ошибкой;
     - чтение-изменение-запись без блокировки: двое одновременно — и карточка
       первого затёрта второй, молча;
     - ключ держал только топ-500 по XP, и новые люди с нулевым XP вытесняли
       друг друга сразу после записи.
   Теперь у каждого своя карточка `lb:<id>` (значение — та же карточка в
   метаданных, чтобы сборка шла одним `list` без чтения каждого ключа), а общий
   ключ `leaderboard` собирает крон раз в пять минут. Читатели рейтинга не
   изменились: им по-прежнему отдаётся один ключ. */

const LB_USER_PREFIX = 'lb:'

/** Расписание сборки общего ключа рейтинга — обязано совпадать со строкой в wrangler.toml. */
const LB_CRON = '*/5 * * * *'

/** Потолок метаданных KV — 1024 байта; держимся ниже с запасом. */
const LB_META_BUDGET = 950

/** Своя карточка: сначала новый ключ, для тех, кто ещё не заходил после перехода, — прежний общий. */
async function readOwnLeaderEntry(env: Env, id: number): Promise<LeaderEntry | undefined> {
  const own = await env.REFERRALS.getWithMetadata<LeaderEntry>(`${LB_USER_PREFIX}${id}`)
  if (own.metadata && typeof own.metadata.id === 'number') return own.metadata
  return (await readLeaderboard(env))[String(id)]
}

/** Карточка, ужатая под лимит метаданных: длинное имя важнее места в рейтинге. */
function fitLeaderEntry(e: LeaderEntry): LeaderEntry {
  const out: LeaderEntry = {
    ...e,
    name: e.name.slice(0, 64),
    username: e.username?.slice(0, 32),
  }
  if (JSON.stringify(out).length <= LB_META_BUDGET) return out
  return { ...out, name: out.name.slice(0, 24), title: undefined, frame: undefined, accent: undefined }
}

async function writeOwnLeaderEntry(env: Env, entry: LeaderEntry): Promise<void> {
  const fitted = fitLeaderEntry(entry)
  // Значение — короткая заглушка: всё нужное лежит в метаданных, которые
  // приходят вместе со списком ключей.
  await env.REFERRALS.put(`${LB_USER_PREFIX}${entry.id}`, '1', { metadata: fitted })
}

/** Совпадают ли две карточки по всему, кроме времени записи. */
function sameLeaderEntry(a: LeaderEntry, b: LeaderEntry): boolean {
  const strip = (e: LeaderEntry) => JSON.stringify({ ...e, at: 0 })
  return strip(fitLeaderEntry(a)) === strip(fitLeaderEntry(b))
}

function sameMskDay(a: number | undefined, b: number): boolean {
  if (typeof a !== 'number') return false
  return startOfTodayMskMs(a) === startOfTodayMskMs(b)
}

/**
 * Все карточки рейтинга: прежний общий ключ, поверх него — личные карточки.
 * Нужно и крону, который собирает общий ключ, и админке, которой нужны все
 * люди, а не только топ.
 */
async function readAllLeaderEntries(env: Env): Promise<Record<string, LeaderEntry>> {
  const map = await readLeaderboard(env)
  let cursor: string | undefined
  do {
    const page = await env.REFERRALS.list<LeaderEntry>({ prefix: LB_USER_PREFIX, cursor })
    for (const k of page.keys) {
      const e = k.metadata
      if (e && typeof e.id === 'number') map[String(e.id)] = e
    }
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
  return map
}

/**
 * Собрать общий ключ рейтинга (крон раз в пять минут).
 *
 * В общий ключ идут топ по XP и топ по приглашениям — объединением, чтобы
 * доска рефералов не теряла людей с малым XP. Общее число участников кладём в
 * метаданные ключа: в самом ключе людей не больше топа, а «из скольких»
 * считается по всем.
 */
async function rebuildLeaderboard(env: Env): Promise<void> {
  const all = Object.values(await readAllLeaderEntries(env))
  const byXp = [...all].sort((a, b) => b.xp - a.xp).slice(0, LB_MAX)
  const byRefs = [...all]
    .filter((e) => (e.refs ?? 0) > 0)
    .sort((a, b) => (b.refs ?? 0) - (a.refs ?? 0))
    .slice(0, LB_MAX)

  const map: Record<string, LeaderEntry> = {}
  for (const e of [...byXp, ...byRefs]) map[String(e.id)] = e

  const next = JSON.stringify(map)
  const current = await env.REFERRALS.getWithMetadata<{ total?: number }>(LB_KEY)
  // Ничего не поменялось — не пишем: запись в KV стоит денег, а чтение почти нет.
  if (current.value === next && current.metadata?.total === all.length) return
  await env.REFERRALS.put(LB_KEY, next, { metadata: { total: all.length } })
}

/** Сколько всего участников (не только тех, кто попал в общий ключ). */
async function readLeaderboardTotal(env: Env, fallback: number): Promise<number> {
  const { metadata } = await env.REFERRALS.getWithMetadata<{ total?: number }>(LB_KEY)
  return typeof metadata?.total === 'number' ? Math.max(metadata.total, fallback) : fallback
}

/**
 * Карточка для чужих глаз. Метка источника, дни визитов и дата прихода нужны
 * только аналитике владельца: рейтинг видят все участники, и показывать им, когда
 * и как часто заходит каждый, незачем.
 */
function publicEntry(e: LeaderEntry): Omit<LeaderEntry, 'src' | 'vm' | 'vd' | 'firstSeen' | 'fsx'> {
  const { src: _src, vm: _vm, vd: _vd, firstSeen: _fs, fsx: _fsx, ...rest } = e
  return rest
}

/** Отдать топ участников + позицию вызывающего (по XP и по рефералам). */
async function handleLeaderboard(req: Request, env: Env, origin: string | null): Promise<Response> {
  const initData = await readInitData(req)
  const user = await verifyInitData(initData, env.BOT_TOKEN)
  if (!user) return json({ ok: false, error: 'bad_init_data' }, { status: 401 }, env, origin)

  const map = await readLeaderboard(env)
  const myId = String(user.id)
  // Свою карточку берём из личного ключа: общий собирается кроном раз в пять
  // минут, и без этого человек не видел бы себя сразу после первого запуска.
  const own = await env.REFERRALS.getWithMetadata<LeaderEntry>(`${LB_USER_PREFIX}${myId}`)
  if (own.metadata && typeof own.metadata.id === 'number') map[myId] = own.metadata
  const all = Object.values(map)
  // Топ, отдаваемый клиенту. 100 — чтобы при нынешней базе (<100 активных)
  // в списке были видны все, а не только первые 50.
  const TOP = 100

  // Собирает доску для заданной сортировки: топ + позиция вызывающего.
  const board = (sorted: LeaderEntry[]) => {
    const rankIdx = sorted.findIndex((e) => String(e.id) === myId)
    return {
      top: sorted.slice(0, TOP).map(publicEntry),
      me: rankIdx >= 0 ? { rank: rankIdx + 1, ...publicEntry(sorted[rankIdx]) } : null,
    }
  }

  const byXp = [...all].sort((a, b) => b.xp - a.xp || b.ops - a.ops || (a.at ?? 0) - (b.at ?? 0))
  const byRefs = [...all].sort(
    (a, b) => (b.refs ?? 0) - (a.refs ?? 0) || b.xp - a.xp || (a.at ?? 0) - (b.at ?? 0),
  )

  const total = await readLeaderboardTotal(env, all.length)
  return json({ ok: true, total, xp: board(byXp), refs: board(byRefs) }, { status: 200 }, env, origin)
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

/* Префикс ключа KV для пользовательских данных — DATA_PREFIX из analytics.ts. */
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

/* Аналитическая карточка (buildUserCard, fitMeta, DataMeta) — в analytics.ts. */

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
  // Синхронизация — тоже след активности: отмечаем день в маске той же записью.
  const visits = markDay(
    existing.metadata?.vm !== undefined ? { m: existing.metadata.vm, d: existing.metadata.vd } : undefined,
    mskDay(Date.now()),
  )
  const meta = fitMeta({ updatedAt, firstSeen, c: buildUserCard(blob) ?? undefined, vm: visits.m, vd: visits.d })
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
/**
 * Окно рассылки: cron бежит почасно в 12–17 UTC = 15:00–20:00 МСК. Каждый
 * пользователь привязан к своему часу-слоту (REM_SLOTS штук) детерминированным
 * хешем id — так база разносится по часам, а не шлётся вся разом.
 */
const REM_WINDOW_START_UTC = 12
const REM_SLOTS = 6

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

  // 1) Кандидаты — только по метаданным списка, без единого чтения значений.
  //    Раньше на каждого человека шло до трёх чтений и запись `notified:<id>`:
  //    на платном плане это упиралось в 10 000 подзапросов на вызов уже на
  //    нескольких тысячах человек в слоте, а на бесплатном — в 50, то есть
  //    примерно в дюжину человек в час.
  const candidates: string[] = []
  let cursor: string | undefined
  do {
    const page = await env.REFERRALS.list<DataMeta>({ prefix: DATA_PREFIX, cursor })
    for (const k of page.keys) {
      const id = k.name.slice(DATA_PREFIX.length)
      if (!id || slotForId(id, REM_SLOTS) !== currentSlot) continue
      const m = k.metadata
      // Сам выключил напоминания в приложении: тумблер едет в блобе, а оттуда в карточку.
      if (m?.c?.rm === 0) continue
      // Заходил сегодня — напоминать не о чем. Ключ без метки времени в метаданных
      // не обновлялся с тех пор, как метки появились, значит сегодня точно не заходил.
      if (typeof m?.updatedAt === 'number' && m.updatedAt >= todayStart) continue
      candidates.push(id)
    }
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)

  // 2) Рассылка порциями: Telegram пускает около 30 сообщений в секунду на бота,
  //    дальше отвечает 429. Последовательная отправка по одному на тысячах
  //    человек не уложилась бы во время вызова, параллельная без меры — в лимит.
  for (let i = 0; i < candidates.length; i += REM_SEND_PER_SEC) {
    const started = Date.now()
    await Promise.all(candidates.slice(i, i + REM_SEND_PER_SEC).map((id) => remindOne(env, id, text)))
    const spent = Date.now() - started
    if (spent < 1000 && i + REM_SEND_PER_SEC < candidates.length) await sleep(1000 - spent)
  }
}

/** Сообщений в секунду. С запасом ниже лимита Telegram (~30), чтобы не ловить 429. */
const REM_SEND_PER_SEC = 25

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Напоминание одному человеку.
 *
 * Метку «уже слали сегодня» больше не пишем: у каждого человека свой час в
 * окне рассылки, и второй раз в тот же день он в крон не попадает по
 * построению. Метка стоила записи KV на каждое напоминание — тысячи записей в
 * сутки после рассылки — и защищала только от повторного запуска крона, а
 * Cloudflare его не повторяет.
 */
async function remindOne(env: Env, id: string, text: string): Promise<void> {
  // Отписан: тумблер в приложении или авто-отписка, когда бота заблокировали.
  if ((await env.REFERRALS.get(`remind:${id}`)) === '0') return
  let r = await sendMessage(env, id, text)
  if (r.status === 429) {
    await sleep(1500)
    r = await sendMessage(env, id, text)
  }
  if (r.status === 403) {
    // Бот заблокирован / аккаунт удалён — больше не беспокоим + метим для аналитики.
    await env.REFERRALS.put(`remind:${id}`, '0')
    await env.REFERRALS.put(`blocked:${id}`, '1')
  }
}


/* ------------------------------------------------------------------ */
/* Аналитика владельца: дашборд, карточка человека, сводка              */
/* ------------------------------------------------------------------ */
/*
 * Расчёты живут в analytics.ts. Здесь — доступ, кэш и сбор входных данных.
 */

/**
 * Кто может смотреть аналитику. Два пути:
 *   - пароль (секрет ADMIN_KEY) в заголовке X-Admin-Key — из любого браузера;
 *   - подпись Telegram владельца в X-Tg-Init-Data — когда дашборд открыт
 *     кнопкой из бота (/admin или кнопка под утренней сводкой). Пароль тогда не
 *     нужен: подпись подделать нельзя, а id владельца известен.
 */
async function isAdmin(req: Request, env: Env): Promise<boolean> {
  const key = req.headers.get('X-Admin-Key') ?? ''
  if (key && env.ADMIN_KEY && timingSafeEqual(key, env.ADMIN_KEY)) return true
  const initData = req.headers.get('X-Tg-Init-Data') ?? ''
  if (!initData) return false
  const user = await verifyInitData(initData, env.BOT_TOKEN)
  return !!user && String(user.id) === String(env.OWNER_CHAT_ID ?? '').trim()
}

async function adminGate(req: Request, env: Env, origin: string | null, scope: string, perMin: number): Promise<Response | null> {
  if (!(await isAdmin(req, env))) return json({ ok: false, error: 'forbidden' }, { status: 403 }, env, origin)
  const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown'
  if (await isRateLimited(env, scope, ip, perMin, 60)) return tooMany(env, origin)
  return null
}

/**
 * Собранная таблица людей живёт в памяти изолята 20 секунд. Дашборд обновляется
 * сам раз в минуту и перерисовывается при каждом переключении — без кэша каждое
 * такое действие заново перечисляло бы всю базу.
 */
const COLLECT_TTL_MS = 20_000
let collectedCache: { at: number; c: Collected } | null = null

async function collectFresh(env: Env, maxAgeMs: number): Promise<Collected> {
  const now = Date.now()
  if (collectedCache && now - collectedCache.at <= maxAgeMs) return collectedCache.c
  const c = await collectPeople(env, readAllLeaderEntries(env))
  collectedCache = { at: now, c }
  return c
}

/**
 * Здоровье вебхука — ответ Telegram на getWebhookInfo, раз в минуту. После
 * рассылки это первое, что надо видеть: если бот не успевает, люди пишут ему, а
 * ответа не получают, и ни в одной другой цифре это не отразится.
 */
let webhookCache: { at: number; h: WebhookHealth | null } | null = null

async function webhookHealth(env: Env): Promise<WebhookHealth | null> {
  const now = Date.now()
  if (webhookCache && now - webhookCache.at < 60_000) return webhookCache.h
  let h: WebhookHealth | null = null
  try {
    const info = (await getWebhookInfo(env)) as {
      result?: { url?: string; pending_update_count?: number; last_error_message?: string; last_error_date?: number }
    } | null
    const r = info?.result
    if (r) {
      const pending = r.pending_update_count ?? 0
      const lastErrorAt = r.last_error_date ? r.last_error_date * 1000 : undefined
      // Старая ошибка — история, а не проблема: Telegram помнит последнюю
      // ошибку, даже если с тех пор всё доставлялось.
      const recentError = !!lastErrorAt && now - lastErrorAt < 30 * 60_000
      h = {
        registered: !!r.url,
        pending,
        ...(r.last_error_message ? { lastError: r.last_error_message.slice(0, 160) } : {}),
        ...(lastErrorAt ? { lastErrorAt } : {}),
        ok: !!r.url && pending < 50 && !recentError,
      }
    }
  } catch {
    h = null
  }
  webhookCache = { at: now, h }
  return h
}

/** Дашборд: всё, что нужно странице, одним ответом. */
async function handleAdminStats(req: Request, env: Env, origin: string | null): Promise<Response> {
  const denied = await adminGate(req, env, origin, 'admin', 60)
  if (denied) return denied

  const body = (await req.json().catch(() => ({}))) as { backfill?: boolean; fresh?: boolean }

  // Дозаполнение карточек — до сбора, чтобы результат был виден в этом же ответе.
  let backfill: { scanned: number; filled: number; done: boolean } | null = null
  if (body.backfill) {
    backfill = await backfillCards(env, BACKFILL_SLICE)
    if (backfill.filled) collectedCache = null
  }

  const now = Date.now()
  const [c, history, webhook] = await Promise.all([
    collectFresh(env, body.fresh ? 0 : COLLECT_TTL_MS),
    readHistory(env),
    webhookHealth(env),
  ])
  return json(
    { ...computeDashboard(c, history, now, webhook), backfill },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
    env,
    origin,
  )
}

/**
 * Карточка одного человека по нажатию в списке. Читаем его ключи напрямую —
 * шесть обращений к KV на одно нажатие, а не всю базу.
 */
async function handleAdminPerson(req: Request, env: Env, origin: string | null): Promise<Response> {
  const denied = await adminGate(req, env, origin, 'aperson', 60)
  if (denied) return denied

  const body = (await req.json().catch(() => ({}))) as { id?: unknown }
  const id = String(body.id ?? '')
  if (!/^\d{1,20}$/.test(id)) return json({ ok: false, error: 'bad_id' }, { status: 400 }, env, origin)

  // data:<id> перечисляем, а не читаем: значение — весь блоб человека (до 2 МБ),
  // а нужны только метаданные.
  const [dataPage, own, inbox, src, claimed, blocked, remind] = await Promise.all([
    env.REFERRALS.list<DataMeta>({ prefix: `${DATA_PREFIX}${id}`, limit: 20 }),
    env.REFERRALS.getWithMetadata<LeaderEntry>(`${LB_USER_PREFIX}${id}`),
    env.REFERRALS.getWithMetadata<InboxMeta>(`inbox:${id}`),
    env.REFERRALS.getWithMetadata<SourceMeta>(`${SRC_PREFIX}${id}`),
    env.REFERRALS.get(`claimed:${id}`),
    env.REFERRALS.get(`blocked:${id}`),
    env.REFERRALS.get(`remind:${id}`),
  ])
  const dataMeta = dataPage.keys.find((k) => k.name === `${DATA_PREFIX}${id}`)?.metadata ?? undefined
  const lbEntry =
    own.metadata && typeof own.metadata.id === 'number' ? own.metadata : (await readLeaderboard(env))[id]

  const one = assembleOne(id, dataMeta, lbEntry, inbox.metadata, src.metadata, !!claimed, !!blocked)
  const p = one.people[0]
  if (!p) return json({ ok: false, error: 'not_found' }, { status: 404 }, env, origin)

  // С какого дня маски знают правду — берём общий, если база недавно собиралась:
  // по одному человеку его не определить.
  const trackFrom = collectedCache?.c.trackFrom ?? one.trackFrom
  const now = Date.now()
  const today = mskDay(now)
  const span = 35
  const card = p.card
  return json(
    {
      ok: true,
      id: p.id,
      name: p.name,
      username: p.username,
      firstSeen: p.firstSeen,
      lastSeen: p.lastSeen,
      approx: p.approx,
      src: p.src,
      fromRef: p.fromRef,
      blocked: p.blocked,
      remindersOff: remind === '0' || card?.rm === 0,
      inApp: p.inApp,
      ops: p.ops,
      botOps: p.botOps,
      botFirst: p.bot?.f,
      botLast: p.bot?.l,
      lastWrite: p.lastWrite,
      card: card
        ? {
            ft: card.ft,
            lt: card.lt,
            dd: card.dd,
            cur: card.cur,
            lang: card.lang,
            th: card.th,
            bud: card.bud,
            lim: card.lim,
            gl: card.gl,
            iv: card.iv,
            cat: card.cat,
            sb: card.sb,
            dm: card.dm,
            cc: card.cc,
            v: card.v,
          }
        : null,
      sections: sectionsOf(card),
      game: { xp: p.xp, level: p.level, coins: p.coins, streakBest: p.streakBest, refs: p.refs },
      strip: activityStrip(p, trackFrom, today, span),
      stripFrom: mskDayStart(today - span + 1),
      trackFrom: trackFrom === null ? null : mskDayStart(trackFrom),
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
    env,
    origin,
  )
}

/** Один человек через ту же сборку, что и вся база: правила слияния одни. */
function assembleOne(
  id: string,
  data: DataMeta | undefined,
  lb: LeaderEntry | undefined,
  inbox: InboxMeta | null,
  src: SourceMeta | null,
  claimed: boolean,
  blocked: boolean,
): Collected {
  return assembleParts(
    data ? [[id, data]] : [],
    lb ? { [id]: lb } : {},
    [[id, inbox]],
    [[id, src]],
    claimed ? [id] : [],
    blocked ? [id] : [],
  )
}

/** Сводка в Telegram прямо сейчас — по кнопке в дашборде (итоги текущих суток). */
async function handleAdminDigest(req: Request, env: Env, origin: string | null): Promise<Response> {
  const denied = await adminGate(req, env, origin, 'adigest', 5)
  if (denied) return denied
  const now = Date.now()
  const c = await collectFresh(env, 0)
  const ok = await sendDigest(env, digestText(dayReport(c, mskDay(now), now)))
  return json({ ok }, { status: ok ? 200 : 502 }, env, origin)
}

/**
 * Отправить сводку владельцу с кнопкой, открывающей дашборд прямо в Telegram.
 * Ночная (`silent`) приходит без звука: крон срабатывает в полночь, а читать её
 * будут утром.
 */
async function sendDigest(env: Env, text: string, silent = false): Promise<boolean> {
  const owner = String(env.OWNER_CHAT_ID ?? '').trim()
  if (!owner) return false
  const r = await sendMessage(
    env,
    owner,
    text,
    { inline_keyboard: [[{ text: 'Открыть аналитику', web_app: { url: ADMIN_URL } }]] },
    silent,
  )
  return r.ok
}

/**
 * Ночь (00:00 МСК): снимок завершившихся суток для графиков, порция
 * дозаполнения карточек и утренняя сводка владельцу. Сбор один на всё.
 */
async function nightlyAnalytics(env: Env, nowMs: number): Promise<void> {
  const c = await collectPeople(env, readAllLeaderEntries(env))
  const ended = mskDay(nowMs) - 1
  await recordSnapshot(env, snapshotRow(c, ended, nowMs))
  try {
    await backfillCards(env, BACKFILL_SLICE)
  } catch (e) {
    console.error('[worker] backfill failed', e)
  }
  if ((env.ADMIN_DIGEST ?? 'on').trim() !== 'off') {
    try {
      await sendDigest(env, digestText(dayReport(c, ended, nowMs)), true)
    } catch (e) {
      console.error('[worker] digest failed', e)
    }
  }
}
