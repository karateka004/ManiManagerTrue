/**
 * Отчёт по базе и очистка мусора — на поддельном KV и Telegram.
 *
 *   - мусор: короткоживущие ключи без срока и пустые очереди без статистики;
 *   - не мусор: облако, рейтинг, напоминания, рефералы, очереди со статистикой
 *     или с записями, короткоживущие со сроком, незнакомые ключи;
 *   - кнопка удаляет только мусор и только у владельца; отчёт приходит один раз.
 *
 * Запуск: `node --import ./scripts/ts-resolve.mjs scripts/test-storage.mjs`
 */
import { FAMILIES, scanStorage, storageReport, sendStorageReportOnce } from '../src/storage.ts'
import { handleTgUpdate } from '../src/bot.ts'
import { readFileSync, readdirSync } from 'node:fs'

let failed = 0
let total = 0
const check = (name, ok, extra) => {
  total++
  if (!ok) {
    failed++
    console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra))
  }
}

class FakeKV {
  constructor() { this.m = new Map() }
  async get(k) { return this.m.get(k)?.value ?? null }
  async getWithMetadata(k) { const v = this.m.get(k); return v ? { value: v.value, metadata: v.metadata } : { value: null, metadata: null } }
  async put(k, value, opts) { this.m.set(k, { value: String(value), metadata: opts?.metadata ?? null, expiration: opts?.expirationTtl ? Date.now() / 1000 + opts.expirationTtl : undefined }) }
  async delete(k) { this.m.delete(k) }
  async list({ prefix = '', cursor, limit = 1000 } = {}) {
    const all = [...this.m.keys()].filter((k) => k.startsWith(prefix)).sort()
    const from = cursor ? Number(cursor) : 0
    const keys = all.slice(from, from + limit).map((name) => ({ name, expiration: this.m.get(name).expiration, metadata: this.m.get(name).metadata ?? undefined }))
    const done = from + limit >= all.length
    return { keys, list_complete: done, cursor: done ? undefined : String(from + limit) }
  }
}

const calls = []
globalThis.fetch = async (url, init) => {
  const method = String(url).split('/').pop()
  calls.push({ method, body: init?.body ? JSON.parse(init.body) : {} })
  return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 })
}
const kv = new FakeKV()
const env = { BOT_TOKEN: 'x', OWNER_CHAT_ID: '42', REFERRALS: kv }

// Данные людей и служебное — не мусор.
await kv.put('data:1', '{"blob":"{}"}')
await kv.put('lb:1', '1', { metadata: { xp: 10 } })
await kv.put('leaderboard', '[]')
await kv.put('remind:1', '1')
await kv.put('claimed:2', '1')
await kv.put('src:1', 'ads')
await kv.put('giftmsg:1:crown', '1')
await kv.put('inbox:1', JSON.stringify({ items: [], updatedAt: 1 }), { metadata: { n: 5 } }) // статистика
await kv.put('inbox:2', JSON.stringify({ items: [{ id: 'a' }], updatedAt: 1 })) // записи ждут
await kv.put('chat:1', '{}', { expirationTtl: 3600 })
await kv.put('seen:9', '1', { expirationTtl: 3600 })
// Мусор.
await kv.put('chat:2', '{}') // без срока
await kv.put('pick:3:abc', '{}')
await kv.put('metrics:2025-01-01', '{}')
await kv.put('inbox:3', JSON.stringify({ items: [], updatedAt: 1 })) // пусто, без статистики
// Незнакомое — показать, не трогать.
await kv.put('notified:5', '1')
// Много ключей — список постранично.
for (let i = 0; i < 1200; i++) await kv.put(`data:${100 + i}`, '{}')

const scan = await scanStorage(env)
const junk = scan.junk.map((j) => j.name).sort()
check('весь список, постранично', scan.total === 1216, scan.total)
check('мусор — ровно короткоживущие без срока и пустая очередь', JSON.stringify(junk) === JSON.stringify(['chat:2', 'inbox:3', 'metrics:2025-01-01', 'pick:3:abc']), junk)
check('незнакомые — отдельно', JSON.stringify(scan.unknown) === '["notified:5"]', scan.unknown)
const report = storageReport(scan)
check('отчёт: число ключей, мусор и кнопка', report.text.includes('1216 ключей') && report.text.includes('Мусор: 4 ключа') && JSON.stringify(report.keyboard).includes('k:clean'), report.text)
check('отчёт: незнакомые не трогаю', report.text.includes('notified:5') && report.text.includes('не трогаю'))

// Отчёт владельцу — один раз.
await sendStorageReportOnce(env)
await sendStorageReportOnce(env)
check('после выката — один отчёт владельцу', calls.filter((c) => c.method === 'sendMessage' && c.body.chat_id === '42').length === 1)

// Кнопка у чужого — ничего не удаляет.
const press = (id) => handleTgUpdate({ callback_query: { id: 'cb', from: { id }, data: 'k:clean', message: { message_id: 7, chat: { id } } } }, env)
await press(7)
check('чужая кнопка — база цела', kv.m.has('chat:2') && kv.m.size === 1217)
await press(42)
check('кнопка владельца — удалён только мусор', !kv.m.has('chat:2') && !kv.m.has('inbox:3') && kv.m.has('inbox:1') && kv.m.has('inbox:2') && kv.m.has('chat:1') && kv.m.has('notified:5') && kv.m.size === 1213)
const edited = calls.filter((c) => c.method === 'editMessageText').at(-1)?.body.text
check('итог очистки в том же сообщении', edited?.includes('Удалено мусора: 4') && edited.includes('Ключей в базе: 1213'), edited)

// Каждый ключ, который пишет код воркера, должен быть в FAMILIES — иначе отчёт
// сочтёт его незнакомым (а будущая очистка могла бы задеть).
const src = readdirSync(new URL('../src/', import.meta.url)).filter((f) => f.endsWith('.ts'))
const literals = new Set()
for (const f of src) {
  const code = readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8')
  for (const m of code.matchAll(/REFERRALS\.(?:put|get|delete|getWithMetadata)\(\s*[`'"]([a-z][a-z-]*:?)/g)) literals.add(m[1])
  for (const m of code.matchAll(/(?:const|export const) [A-Z_]*(?:KEY|PREFIX)\s*=\s*'([a-z][a-z:-]*)'/g)) literals.add(m[1])
}
const orphan = [...literals].filter((k) => !FAMILIES.some((f) => (f.exact ? k === f.prefix : k.startsWith(f.prefix) || f.prefix.startsWith(k))))
check('все ключи из кода известны отчёту', orphan.length === 0, orphan)

if (failed) {
  console.log(`test-storage: ${failed} из ${total} упали`)
  process.exit(1)
}
console.log(`test-storage: ${total} проверок — мусор, данные людей целы, кнопка владельца, ключи кода известны`)
