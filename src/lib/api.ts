/**
 * Клиент к Cloudflare Worker (бэкенду бота).
 *
 * ⚠️ После деплоя воркера вставь его URL в WORKER_URL ниже
 *    (вид: https://koshel-worker.<субдомен>.workers.dev).
 *    Пока строка пустая — функции просто молча ничего не делают,
 *    приложение продолжает работать как раньше.
 */
import { tg } from './telegram'
import { CURRENCIES, type Currency } from './currencies'

export const WORKER_URL = 'https://koshel-worker.karateka004.workers.dev'

/** Имя бота для реферальных ссылок. */
export const BOT_USERNAME = 'TrueManiManager_Bot'

/**
 * Короткое имя Mini App, если оно задано в BotFather (Bot Settings → Configure
 * Mini App → у приложения есть отдельный short name). Тогда ссылка вида
 * `t.me/<bot>/<short>?startapp=...` открывает именно это приложение и ПЕРЕДАЁТ
 * start_param.
 *
 * Если оставить пустым — используется ссылка `t.me/<bot>?startapp=...`, которая
 * открывает «Main Mini App». ВАЖНО: чтобы start_param дошёл, в BotFather должно
 * быть включено главное мини-приложение (Bot Settings → Configure Mini App →
 * Enable / задать URL). Бот ТОЛЬКО с кнопкой-меню start_param не получает —
 * тогда реферальная ссылка не сработает, пока не включишь Main Mini App.
 */
export const APP_SHORT_NAME = 'koshelapp'

export const isBackendConfigured = () => WORKER_URL.length > 0

/** Реф-ссылка-приглашение для текущего пользователя. */
export function buildReferralLink(): string {
  const id = tg.user?.id
  const base = APP_SHORT_NAME
    ? `https://t.me/${BOT_USERNAME}/${APP_SHORT_NAME}`
    : `https://t.me/${BOT_USERNAME}`
  // Без id (вне Telegram) отдаём чистую ссылку на бота — без пустого startapp.
  return id ? `${base}?startapp=ref${id}` : base
}

/** Достаёт числовой id пригласившего из start_param (формат refNNN). */
export function parseRefParam(param: string | null): string | null {
  if (!param) return null
  const digits = param.replace(/[^0-9]/g, '')
  // Telegram user id — до ~12 цифр; всё длиннее/пустое отбрасываем.
  return digits.length >= 1 && digits.length <= 12 ? digits : null
}

async function post(path: string, body: unknown): Promise<any> {
  if (!isBackendConfigured()) throw new Error('backend_not_configured')
  const res = await fetch(`${WORKER_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

/** Отправить отзыв (попадёт владельцу бота в ЛС). */
export async function sendFeedback(text: string): Promise<{ ok: boolean; error?: string }> {
  return post('/feedback', { initData: tg.initData, text })
}

/** Зарегистрировать реферала (вызывается один раз при заходе по ссылке). */
export async function registerReferral(ref: string): Promise<{ ok: boolean; counted?: boolean }> {
  return post('/referral', { initData: tg.initData, ref })
}

/** Запись о приглашённом друге. */
export interface ReferralFriend {
  id: number
  name: string
  username?: string
  /** epoch ms момента присоединения */
  at: number
}

/** Получить статистику рефералов: количество + список приглашённых. */
export async function getReferralStats(): Promise<{
  ok: boolean
  referrals: number
  friends: ReferralFriend[]
}> {
  if (!isBackendConfigured() || !tg.initData) return { ok: false, referrals: 0, friends: [] }
  // POST с телом: подписанный initData НЕ попадает в URL/логи/Referer.
  return post('/stats', { initData: tg.initData })
}

/* ---------- Таблица лидеров ---------- */

/** Публичная карточка участника (только геймификация, без финансов). */
export interface LeaderEntry {
  id: number
  name: string
  username?: string
  xp: number
  level: number
  /** ID надетого косметического титула (rewards.ts) — «флекс» в рейтинге. */
  title?: string
  /** ID надетой рамки аватара — рисуем ободок вокруг кружка игрока. */
  frame?: string
  /** ID надетого акцента — цвет ободка, когда рамки нет. */
  accent?: string
  ops: number
  coins: number
  streakBest: number
  /** Сколько друзей пригласил (для рейтинга по рефералам). */
  refs: number
  at: number
}

/** Одна доска рейтинга: топ + позиция текущего пользователя. */
export interface LeaderBoard {
  top: LeaderEntry[]
  me: (LeaderEntry & { rank: number }) | null
}

/** Закрепить статистику текущего участника на сервере (для рейтинга). */
export async function submitProfile(stats: {
  xp: number
  level: number
  ops: number
  coins: number
  streakBest: number
  /** ID надетой косметики (опционально — старый воркер поля просто игнорирует). */
  title?: string
  frame?: string
  accent?: string
}): Promise<{ ok: boolean }> {
  if (!isBackendConfigured() || !tg.initData) return { ok: false }
  return post('/profile', { initData: tg.initData, ...stats })
}

/**
 * Получить таблицы лидеров: две доски — по XP и по рефералам. Каждая содержит
 * топ участников + позицию текущего пользователя.
 */
export async function getLeaderboard(): Promise<{
  ok: boolean
  total: number
  xp: LeaderBoard
  refs: LeaderBoard
}> {
  const empty: LeaderBoard = { top: [], me: null }
  if (!isBackendConfigured() || !tg.initData) return { ok: false, total: 0, xp: empty, refs: empty }
  // POST с телом: подписанный initData НЕ попадает в URL/логи/Referer.
  return post('/leaderboard', { initData: tg.initData })
}

/* ---------- Облачная синхронизация данных (привязка к TG-аккаунту) ---------- */

/** Снимок данных пользователя в облаке: сериализованный стор + метка времени. */
export interface CloudSnapshot {
  /** Сериализованный persist-блоб приложения (`{state,version}` строкой). */
  blob: string
  /** epoch ms последнего изменения. */
  updatedAt: number
}

/** Забрать данные пользователя из облака (или null, если их там ещё нет). */
export async function pullCloud(): Promise<CloudSnapshot | null> {
  if (!isBackendConfigured() || !tg.initData) return null
  const res = await post('/data/get', { initData: tg.initData })
  return res?.ok && res.data ? (res.data as CloudSnapshot) : null
}

/** Сохранить данные пользователя в облако. */
export async function pushCloud(
  blob: string,
  updatedAt: number,
  /**
   * Разрешить сохранить снимок БЕЗ операций поверх облака, в котором они были.
   * Ставится только когда человек сам удалил все операции в этой сессии —
   * иначе сервер отклонит пустой снимок как защиту от потери данных.
   */
  allowEmpty = false,
): Promise<{ ok: boolean; skipped?: boolean }> {
  if (!isBackendConfigured() || !tg.initData) return { ok: false }
  return post('/data/put', { initData: tg.initData, blob, updatedAt, allowEmpty })
}

/* ---------- Входящие: операции, записанные сообщением боту ---------- */

/**
 * Операция, записанная через бота и ещё не перенесённая в приложение.
 *
 * Лежит в облаке ОТДЕЛЬНО от блоба (ключ `inbox:<id>`), а не внутри него.
 * Причина в том, что синхронизация — last-write-wins по времени, и приложение
 * отправляет свой блоб целиком: запиши бот прямо в блоб, открытое приложение
 * затёрло бы его запись своим следующим пушем, молча.
 */
export interface InboxEntry {
  /** Идентификатор транспорта: им же подтверждается приём. */
  id: string
  type: 'income' | 'expense'
  amount: number
  currency?: Currency
  categoryId: string
  note?: string
  date: string
}

const CURRENCY_CODES = new Set<string>(CURRENCIES.map((c) => c.code))

/**
 * Записи приходят из сети и попадают прямо в деньги человека, поэтому каждое
 * поле проверяем здесь, а не надеемся на сервер: сломанная сумма испортила бы
 * всю аналитику, а неизвестный код валюты выпал бы из подсчётов.
 */
function isUsableEntry(x: unknown): x is InboxEntry {
  const e = x as InboxEntry | null
  if (!e || typeof e.id !== 'string') return false
  if (e.type !== 'income' && e.type !== 'expense') return false
  if (typeof e.amount !== 'number' || !Number.isFinite(e.amount) || e.amount <= 0) return false
  if (typeof e.categoryId !== 'string' || !e.categoryId) return false
  if (typeof e.date !== 'string' || !e.date) return false
  if (e.currency !== undefined && !CURRENCY_CODES.has(e.currency)) return false
  if (e.note !== undefined && typeof e.note !== 'string') return false
  return true
}

/** Забрать операции, записанные через бота. Пусто — их нет или бэкенд недоступен. */
export async function pullInbox(): Promise<InboxEntry[]> {
  if (!isBackendConfigured() || !tg.initData) return []
  const res = await post('/inbox/get', { initData: tg.initData })
  const items = res?.ok && Array.isArray(res.items) ? res.items : []
  return items.filter(isUsableEntry)
}

/**
 * Подтвердить приём: эти записи уже в сторе, из очереди их можно убрать.
 * Подтверждаем по id, а не «очистить всё»: человек мог написать боту ровно в ту
 * секунду, пока шёл слив, и очистка целиком съела бы новую запись.
 */
export async function ackInbox(ids: string[]): Promise<boolean> {
  if (!isBackendConfigured() || !tg.initData || ids.length === 0) return false
  const res = await post('/inbox/ack', { initData: tg.initData, ids })
  return !!res?.ok
}

/* ---------- Напоминания (ежедневный пуш от бота) ---------- */

/**
 * Включить/выключить ежедневные напоминания для текущего пользователя на сервере.
 * Best-effort: вне Telegram — no-op, сетевые ошибки глушим (тумблер всё равно
 * сохранится локально и доедет облачным синком). Дефолт на сервере — включено.
 */
export async function setReminders(enabled: boolean): Promise<void> {
  if (!isBackendConfigured() || !tg.initData) return
  try {
    await post('/reminders', { initData: tg.initData, enabled })
  } catch {
    /* молча: повторим при следующем переключении */
  }
}

/* ---------- Подписка на канал (задание subscribe_channel) ---------- */

/**
 * Проверяет на сервере, подписан ли текущий пользователь на канал (бот делает
 * getChatMember). Вне Telegram / без бэкенда / при ошибке → false.
 */
export async function checkSubscription(): Promise<boolean> {
  if (!isBackendConfigured() || !tg.initData) return false
  try {
    const res = await post('/check-sub', { initData: tg.initData })
    return !!res?.subscribed
  } catch {
    return false
  }
}

/* ---------- Персональные подарки ---------- */

/**
 * Попросить бота поздравить текущего пользователя с персональным подарком в ЛС.
 * Сервер валидирует награды по своему whitelist и шлёт каждую один раз (дедуп в KV).
 * Возвращает true, если запрос дошёл (в т.ч. когда всё уже было отправлено раньше).
 */
export async function notifyGift(rewards: string[]): Promise<boolean> {
  if (!isBackendConfigured() || !tg.initData || rewards.length === 0) return false
  try {
    const res = await post('/gift-notify', { initData: tg.initData, rewards })
    return !!res?.ok
  } catch {
    return false
  }
}

/* ---------- Выгрузка операций ---------- */

export type ExportResult = 'ok' | 'blocked' | 'failed' | 'too_large' | 'no_backend'

/**
 * Отправить операции файлом в чат с ботом.
 *
 * Скачивание прямо из webview Telegram ненадёжно (на iOS ссылка с `download`
 * молча ничего не делает), поэтому файл отправляет бот. Вне Telegram вызывать
 * незачем — там сработает обычное скачивание, см. Settings.
 */
export async function exportTransactions(
  csv: string,
  filename: string,
  caption: string,
): Promise<ExportResult> {
  if (!isBackendConfigured() || !tg.initData) return 'no_backend'
  try {
    const r = await post('/export', { initData: tg.initData, csv, filename, caption })
    if (r?.ok) return 'ok'
    if (r?.error === 'blocked') return 'blocked'
    if (r?.error === 'too_large') return 'too_large'
    return 'failed'
  } catch {
    return 'failed'
  }
}
