/**
 * Клиент к Cloudflare Worker (бэкенду бота).
 *
 * ⚠️ После деплоя воркера вставь его URL в WORKER_URL ниже
 *    (вид: https://koshel-worker.<субдомен>.workers.dev).
 *    Пока строка пустая — функции просто молча ничего не делают,
 *    приложение продолжает работать как раньше.
 */
import { tg } from './telegram'

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
): Promise<{ ok: boolean; skipped?: boolean }> {
  if (!isBackendConfigured() || !tg.initData) return { ok: false }
  return post('/data/put', { initData: tg.initData, blob, updatedAt })
}
