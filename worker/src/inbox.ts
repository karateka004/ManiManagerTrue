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
import { markDay, mskDay, type DayMask } from './days'

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
  /** Статистика записей через бота — живёт в метаданных ключа (см. InboxMeta). */
  meta: InboxMeta
}

/**
 * Статистика записей через бота — в МЕТАДАННЫХ ключа очереди.
 *
 * Аналитике нужно знать, кто и как часто пишет боту, а очередь хранит только
 * ещё не забранные записи и после слива пустеет. Отдельный счётчик стоил бы
 * отдельной записи KV на каждое сообщение; метаданные же едут той же записью,
 * что и сама очередь, — бесплатно. Метаданные приходят вместе со списком
 * ключей, поэтому дашборд собирает всех пишущих боту одним `list`.
 */
export interface InboxMeta {
  /** Сколько операций человек записал через бота за всё время (минус отменённые). */
  n?: number
  /** Первая и последняя запись, epoch ms. */
  f?: number
  l?: number
  /** Дни, в которые человек писал боту (см. days.ts). */
  m?: string
  d?: number
}

export const INBOX_PREFIX = 'inbox:'
const PREFIX = INBOX_PREFIX

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
  const got = await env.REFERRALS.getWithMetadata<InboxMeta>(inboxKey(userId))
  const meta = cleanMeta(got.metadata)
  const raw = got.value
  if (!raw) return { items: [], updatedAt: 0, meta }
  try {
    const parsed = JSON.parse(raw) as Partial<Inbox>
    const items = Array.isArray(parsed?.items) ? parsed.items.filter(isUsableEntry) : []
    return { items, updatedAt: Number(parsed?.updatedAt) || 0, meta }
  } catch {
    // Битое значение не должно запирать человеку запись навсегда.
    return { items: [], updatedAt: 0, meta }
  }
}

/** Метаданные из хранилища — недоверенные: берём только поля правильного вида. */
function cleanMeta(x: InboxMeta | null | undefined): InboxMeta {
  if (!x || typeof x !== 'object') return {}
  const out: InboxMeta = {}
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : undefined)
  if (num(x.n) !== undefined) out.n = num(x.n)
  if (num(x.f) !== undefined) out.f = num(x.f)
  if (num(x.l) !== undefined) out.l = num(x.l)
  if (typeof x.m === 'string' && num(x.d) !== undefined) {
    out.m = x.m
    out.d = num(x.d)
  }
  return out
}

/** Учесть новые записи в статистике: счётчик, первая/последняя и день активности. */
function countRecords(meta: InboxMeta, added: number, now: number): InboxMeta {
  const mask: DayMask = markDay(meta.m !== undefined ? { m: meta.m, d: meta.d } : undefined, mskDay(now))
  return { n: (meta.n ?? 0) + added, f: meta.f ?? now, l: now, m: mask.m, d: mask.d }
}

/** Записать очередь вместе со статистикой. */
async function writeInbox(env: Env, userId: string | number, items: InboxEntry[], meta: InboxMeta): Promise<void> {
  await env.REFERRALS.put(inboxKey(userId), JSON.stringify({ items, updatedAt: Date.now() }), { metadata: meta })
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
  await writeInbox(env, userId, items, countRecords(inbox.meta, entries.length, Date.now()))
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
  return dropWhere(env, userId, (e) => drop.has(e.id), false)
}

/** Убрать целиком пачку одного сообщения — за этим стоит кнопка «Отменить». */
export async function dropBatch(
  env: Env,
  userId: string | number,
  batch: string,
): Promise<{ removed: InboxEntry[]; left: number }> {
  return dropWhere(env, userId, (e) => e.id.startsWith(`${batch}-`), true)
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
  await writeInbox(env, userId, items, inbox.meta)
  return items.filter(mine)
}

/**
 * `undo` — человек сам отменил запись кнопкой: её не было, и из счётчика она
 * уходит. Подтверждение приёма приложением — не отмена: запись состоялась,
 * просто переехала в приложение.
 */
async function dropWhere(
  env: Env,
  userId: string | number,
  match: (e: InboxEntry) => boolean,
  undo: boolean,
): Promise<{ removed: InboxEntry[]; left: number }> {
  const inbox = await readInbox(env, userId)
  const removed = inbox.items.filter(match)
  if (removed.length === 0) return { removed, left: inbox.items.length }
  const items = inbox.items.filter((e) => !match(e))
  const meta: InboxMeta = undo ? { ...inbox.meta, n: Math.max(0, (inbox.meta.n ?? 0) - removed.length) } : inbox.meta
  // Опустевшую очередь больше не удаляем, а оставляем пустой: в её метаданных
  // живёт статистика записей через бота, и удаление стёрло бы её вместе с
  // ключом. По стоимости это та же одна операция записи, что и удаление.
  // Ключ без статистики (записан до её появления) удаляем, как раньше.
  if (items.length === 0 && meta.n === undefined) await env.REFERRALS.delete(inboxKey(userId))
  else await writeInbox(env, userId, items, meta)
  return { removed, left: items.length }
}
