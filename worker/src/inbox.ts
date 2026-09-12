/**
 * «Входящие» — операции, записанные через бота и ещё не забранные приложением.
 *
 * ПОЧЕМУ ОТДЕЛЬНЫЙ КЛЮЧ, А НЕ ЗАПИСЬ В `data:<id>`
 *
 * Синхронизация у нас last-write-wins по `updatedAt`, и приложение пушит свой
 * persist-блоб ЦЕЛИКОМ. Если бот допишет операцию прямо в блоб, а приложение в
 * этот момент открыто, то его следующий пуш затрёт её — молча, без единого
 * признака сбоя. Защита в handleDataPut ловит только «пустое поверх непустого»
 * и здесь бесполезна.
 *
 * С отдельным ключом приложение остаётся единственным, кто пишет свой блоб, и
 * весь этот класс гонок исчезает по построению, а не по внимательности.
 *
 * Побочная выгода: человеку, который написал боту, но ни разу не открывал
 * мини-апп, не нужно собирать persist-блоб на сервере — а значит, не нужно
 * дублировать в воркере версию стора и всю лесенку миграций.
 */
import type { Env } from './env'

/** Одна запись во входящих. Поля — подмножество Transaction из приложения. */
export interface InboxEntry {
  /**
   * Идентификатор транспорта, а не операции: по нему приложение подтверждает
   * приём. Свой id операции стор всё равно выдаст сам в commitTransaction.
   */
  id: string
  type: 'income' | 'expense'
  amount: number
  /** Код валюты. Нет поля — приложение подставит основную валюту пользователя. */
  currency?: string
  categoryId: string
  note?: string
  /** ISO-момент (или 'ГГГГ-ММ-ДД' для записи задним числом). */
  date: string
}

export interface Inbox {
  items: InboxEntry[]
  updatedAt: number
}

const PREFIX = 'inbox:'

/**
 * Потолок очереди. Двести неслитых записей — это «приложение не открывали
 * месяц»; дальше мы не выбрасываем старое молча, а честно отвечаем человеку,
 * что записи ждут. Тихая потеря траты хуже отказа записать.
 */
export const MAX_INBOX = 200

export const inboxKey = (userId: string | number): string => `${PREFIX}${userId}`

/**
 * Идентификатор пачки: одно сообщение может содержать несколько операций
 * («кроссовки 3500 и пиво 180»), и отменять их надо вместе — человек передумал
 * про сообщение, а не про вторую его половину.
 *
 * id записи = `<пачка>-<номер>`, поэтому кнопке «Отменить» достаточно нести
 * id пачки. В callback_data Telegram даёт 64 байта — список из десяти
 * идентификаторов туда не влез бы.
 */
export function newBatchId(): string {
  return Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 5)
}

export const entryId = (batch: string, index: number): string => `${batch}-${index}`

export async function readInbox(env: Env, userId: string | number): Promise<Inbox> {
  const raw = await env.REFERRALS.get(inboxKey(userId))
  if (!raw) return { items: [], updatedAt: 0 }
  try {
    const parsed = JSON.parse(raw) as Partial<Inbox>
    const items = Array.isArray(parsed?.items) ? parsed.items.filter(isUsableEntry) : []
    return { items, updatedAt: Number(parsed?.updatedAt) || 0 }
  } catch {
    // Битое значение не должно запирать человеку запись навсегда.
    return { items: [], updatedAt: 0 }
  }
}

function isUsableEntry(x: unknown): x is InboxEntry {
  const e = x as InboxEntry | null
  return (
    !!e &&
    typeof e.id === 'string' &&
    (e.type === 'income' || e.type === 'expense') &&
    typeof e.amount === 'number' &&
    Number.isFinite(e.amount) &&
    e.amount > 0 &&
    typeof e.categoryId === 'string' &&
    typeof e.date === 'string'
  )
}

/**
 * Добавить записи в очередь.
 *
 * Чтение-изменение-запись в KV не атомарны, но Telegram доставляет обновления
 * одного чата последовательно, дожидаясь ответа на предыдущее, — два сообщения
 * от одного человека не наложатся. Гонка возможна только между ботом и сливом
 * в приложении, и там она безобидна: подтверждение приёма идёт по id, а не
 * «очистить всё» (см. dropFromInbox).
 */
export async function appendInbox(
  env: Env,
  userId: string | number,
  entries: InboxEntry[],
): Promise<{ ok: boolean; full: boolean; items: InboxEntry[] }> {
  const inbox = await readInbox(env, userId)
  if (inbox.items.length + entries.length > MAX_INBOX) {
    return { ok: false, full: true, items: inbox.items }
  }
  const items = [...inbox.items, ...entries]
  await env.REFERRALS.put(inboxKey(userId), JSON.stringify({ items, updatedAt: Date.now() }))
  return { ok: true, full: false, items }
}

/**
 * Убрать записи по id. Так работает и подтверждение приёма от приложения, и
 * кнопка «Отменить» под ответом бота.
 *
 * Именно по id, а не «очистить ключ»: человек мог написать боту ровно в ту
 * секунду, пока приложение сливало входящие, и очистка целиком съела бы эту
 * запись вместе с подтверждёнными.
 */
export async function dropFromInbox(
  env: Env,
  userId: string | number,
  ids: string[],
): Promise<{ removed: InboxEntry[]; left: number }> {
  const drop = new Set(ids)
  return dropWhere(env, userId, (e) => drop.has(e.id))
}

/** Убрать целиком пачку одного сообщения — за этим стоит кнопка «Отменить». */
export async function dropBatch(
  env: Env,
  userId: string | number,
  batch: string,
): Promise<{ removed: InboxEntry[]; left: number }> {
  return dropWhere(env, userId, (e) => e.id.startsWith(`${batch}-`))
}

/**
 * Переставить категорию у всей пачки — за этим стоит кнопка «Не та категория».
 * Возвращает обновлённые записи (пусто — пачку уже забрало приложение).
 */
export async function setBatchCategory(
  env: Env,
  userId: string | number,
  batch: string,
  categoryId: string,
): Promise<InboxEntry[]> {
  const inbox = await readInbox(env, userId)
  const mine = (e: InboxEntry) => e.id.startsWith(`${batch}-`)
  if (!inbox.items.some(mine)) return []
  const items = inbox.items.map((e) => (mine(e) ? { ...e, categoryId } : e))
  await env.REFERRALS.put(inboxKey(userId), JSON.stringify({ items, updatedAt: Date.now() }))
  return items.filter(mine)
}

async function dropWhere(
  env: Env,
  userId: string | number,
  match: (e: InboxEntry) => boolean,
): Promise<{ removed: InboxEntry[]; left: number }> {
  const inbox = await readInbox(env, userId)
  const removed = inbox.items.filter(match)
  if (removed.length === 0) return { removed, left: inbox.items.length }
  const items = inbox.items.filter((e) => !match(e))
  if (items.length === 0) await env.REFERRALS.delete(inboxKey(userId))
  else await env.REFERRALS.put(inboxKey(userId), JSON.stringify({ items, updatedAt: Date.now() }))
  return { removed, left: items.length }
}
