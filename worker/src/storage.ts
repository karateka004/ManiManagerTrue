/**
 * База воркера (KV) — отчёт владельцу и очистка мусора.
 *
 * Короткоживущее (память разговора, выбор категории, отметки напоминаний,
 * метрики) пишется со сроком и исчезает само. Мусор — только то, что осталось
 * БЕЗ срока там, где он должен быть (ключи из старых версий), и очереди бота без
 * записей и без статистики. Данные людей — облако, рейтинг, напоминания,
 * рефералы, метки рекламы, отметки подарков — не трогаем никогда.
 *
 * Ключи без известного хозяина отчёт показывает, но не удаляет: новый ключ,
 * который забыли внести в FAMILIES, иначе ушёл бы вместе с мусором.
 *
 * Удаление — только кнопкой владельца под отчётом: сначала видно, что именно.
 */
import type { Env } from './env'
import { escapeHtml, sendMessage } from './tg'

interface Family {
  prefix: string
  label: string
  /** Ключи семейства всегда пишутся со сроком — без срока это остаток старой версии. */
  ttl?: true
  /** Один ключ с таким именем, а не префикс. */
  exact?: true
}

export const FAMILIES: Family[] = [
  { prefix: 'data:', label: 'облако приложения' },
  { prefix: 'inbox:', label: 'записи бота' },
  { prefix: 'leaderboard', label: 'рейтинг', exact: true },
  { prefix: 'lb:', label: 'рейтинг' },
  { prefix: 'remind:', label: 'напоминания' },
  { prefix: 'blocked:', label: 'напоминания' },
  { prefix: 'seen:', label: 'нажали Start', ttl: true },
  { prefix: 'remstat:', label: 'итоги напоминаний', ttl: true },
  { prefix: 'chat:', label: 'память разговора', ttl: true },
  { prefix: 'pick:', label: 'выбор категории', ttl: true },
  { prefix: 'metrics:', label: 'метрики', ttl: true },
  { prefix: 'metrics-history', label: 'метрики', exact: true },
  { prefix: 'src:', label: 'метки рекламы' },
  { prefix: 'claimed:', label: 'рефералы' },
  { prefix: 'count:', label: 'рефералы' },
  { prefix: 'refs:', label: 'рефералы' },
  { prefix: 'giftmsg:', label: 'подарки' },
  { prefix: 'bot:', label: 'служебное' },
  { prefix: 'promo:', label: 'служебное' },
  { prefix: 'admin:', label: 'служебное' },
]

/** За одно нажатие: у KV есть потолок операций на один запуск воркера. */
const MAX_DELETE = 800

export interface StorageScan {
  total: number
  byLabel: [string, number][]
  /** Мусор: короткоживущее без срока и пустые очереди без статистики. */
  junk: { name: string; why: 'nottl' | 'empty' }[]
  unknown: string[]
}

const familyOf = (name: string) => FAMILIES.find((f) => (f.exact ? name === f.prefix : name.startsWith(f.prefix)))

export async function scanStorage(env: Env): Promise<StorageScan> {
  const keys: { name: string; expiration?: number; metadata?: unknown }[] = []
  let cursor: string | undefined
  do {
    const page = await env.REFERRALS.list({ cursor, limit: 1000 })
    keys.push(...page.keys)
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)

  const counts = new Map<string, number>()
  const junk: StorageScan['junk'] = []
  const unknown: string[] = []
  const quietInboxes: string[] = []
  for (const k of keys) {
    const fam = familyOf(k.name)
    if (!fam) {
      unknown.push(k.name)
      continue
    }
    counts.set(fam.label, (counts.get(fam.label) ?? 0) + 1)
    if (fam.ttl && !k.expiration) junk.push({ name: k.name, why: 'nottl' })
    // Статистика записей через бота живёт в метаданных очереди — её не трогаем.
    const n = (k.metadata as { n?: unknown } | undefined)?.n
    if (fam.prefix === 'inbox:' && !(typeof n === 'number' && n > 0)) quietInboxes.push(k.name)
  }
  // Очередь без статистики — мусор, только если в ней и записей нет.
  for (const name of quietInboxes.slice(0, 100)) {
    const raw = await env.REFERRALS.get(name)
    let items = 0
    try {
      const parsed = raw ? (JSON.parse(raw) as { items?: unknown[] }) : null
      items = Array.isArray(parsed?.items) ? parsed.items.length : 0
    } catch {
      items = 0
    }
    if (items === 0) junk.push({ name, why: 'empty' })
  }
  return { total: keys.length, byLabel: [...counts].sort((a, b) => b[1] - a[1]), junk, unknown }
}

const plural = (n: number, forms: [string, string, string]) => {
  const a = Math.abs(n) % 100
  const b = a % 10
  return `${n} ${a > 10 && a < 20 ? forms[2] : b > 1 && b < 5 ? forms[1] : b === 1 ? forms[0] : forms[2]}`
}
const KEYS: [string, string, string] = ['ключ', 'ключа', 'ключей']

/** Отчёт текстом и кнопка «Удалить мусор», если есть что удалять. */
export function storageReport(scan: StorageScan): { text: string; keyboard?: unknown } {
  const width = Math.max(...scan.byLabel.map(([l]) => l.length), 5)
  const table = scan.byLabel.map(([l, c]) => `${l.padEnd(width)}  ${String(c).padStart(6)}`).join('\n')
  const nottl = scan.junk.filter((j) => j.why === 'nottl').length
  const empty = scan.junk.length - nottl
  const lines = [`<b>База воркера</b> · ${plural(scan.total, KEYS)}`, `<pre>${escapeHtml(table)}</pre>`]
  if (scan.junk.length) {
    lines.push(
      `Мусор: ${plural(scan.junk.length, KEYS)} — ${[
        nottl ? `короткоживущие без срока: ${nottl}` : '',
        empty ? `пустые очереди бота: ${empty}` : '',
      ]
        .filter(Boolean)
        .join(', ')}.`,
    )
  } else {
    lines.push('Мусора нет: короткоживущее удаляется само.')
  }
  if (scan.unknown.length) {
    const sample = scan.unknown.slice(0, 5).map((n) => `<code>${escapeHtml(n.slice(0, 40))}</code>`).join(', ')
    lines.push(`Незнакомые: ${scan.unknown.length} (${sample}${scan.unknown.length > 5 ? ', …' : ''}) — не трогаю.`)
  }
  lines.push('<i>Облако, рейтинг, напоминания, рефералы и метки рекламы очистка не трогает.</i>')
  return {
    text: lines.join('\n'),
    keyboard: scan.junk.length
      ? { inline_keyboard: [[{ text: `Удалить мусор (${scan.junk.length})`, callback_data: 'k:clean' }]] }
      : undefined,
  }
}

/** Удалить мусор по свежему просмотру базы (а не по тому, что было в отчёте). */
export async function cleanStorage(env: Env): Promise<{ deleted: number; left: number; more: boolean }> {
  const scan = await scanStorage(env)
  const batch = scan.junk.slice(0, MAX_DELETE)
  for (const j of batch) await env.REFERRALS.delete(j.name)
  return { deleted: batch.length, left: scan.total - batch.length, more: scan.junk.length > batch.length }
}

/** Отчёт владельцу — один раз после выката, дальше по /storage. */
const REPORT_KEY = 'bot:storage-report'
const REPORT_ID = '1'

export async function sendStorageReport(env: Env, chatId: string | number): Promise<void> {
  const report = storageReport(await scanStorage(env))
  await sendMessage(env, chatId, report.text, report.keyboard)
}

export async function sendStorageReportOnce(env: Env): Promise<void> {
  const owner = String(env.OWNER_CHAT_ID ?? '').trim()
  if (!owner || (await env.REFERRALS.get(REPORT_KEY)) === REPORT_ID) return
  await env.REFERRALS.put(REPORT_KEY, REPORT_ID)
  await sendStorageReport(env, owner)
}
