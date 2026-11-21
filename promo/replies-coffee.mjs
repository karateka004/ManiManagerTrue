/**
 * Ответы бота для второго ролика в TikTok («кофе — это же мелочь») — настоящим
 * кодом воркера на поддельных Telegram и KV, как promo/replies.mjs. Модель не
 * участвует: обычные фразы («Ушло 3,80 на капучино») разбирают правила, так
 * ответят и тем, у кого нет Кошель+.
 *
 * Запуск из корня: `node --import ./worker/scripts/ts-resolve.mjs promo/replies-coffee.mjs`
 * Пишет promo/replies-coffee.js — его подключает tiktok-coffee.html.
 */
import { writeFileSync } from 'node:fs'

// Часы двигаем сами: вчера утром и вечером, сегодня в 8:41 по Европе (UTC+1).
let NOW = Date.UTC(2026, 10, 20, 7, 17)
Date.now = () => NOW

const { handleTgUpdate } = await import('../worker/src/bot.ts')

class FakeKV {
  constructor() { this.m = new Map() }
  async get(k) { return this.m.get(k)?.value ?? null }
  async getWithMetadata(k) { const v = this.m.get(k); return v ? { value: v.value, metadata: v.metadata } : { value: null, metadata: null } }
  async put(k, value, opts) { this.m.set(k, { value: String(value), metadata: opts?.metadata ?? null }) }
  async delete(k) { this.m.delete(k) }
  async list({ prefix = '' } = {}) { return { keys: [...this.m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true } }
}

// В облаке — только зарплата: траты дня бот считает по своей очереди записей.
const kv = new FakeKV()
await kv.put(
  'data:777',
  JSON.stringify({
    blob: JSON.stringify({
      state: {
        currency: 'EUR',
        lang: 'ru',
        transactions: [{ id: 's1', type: 'income', categoryId: 'salary', amount: 2400, note: 'Зарплата', date: new Date(Date.UTC(2026, 10, 1, 9)).toISOString() }],
      },
      version: 18,
    }),
    updatedAt: NOW,
  }),
)

const sent = []
globalThis.fetch = async (url, init) => {
  const u = String(url)
  if (u.startsWith('https://generativelanguage.googleapis.com/')) return new Response('{}', { status: 500 })
  const method = u.split('/').pop()
  const body = init?.body ? JSON.parse(init.body) : {}
  if (method === 'sendMessage') sent.push({ text: body.text, buttons: body.reply_markup?.inline_keyboard?.map((r) => r.map((b) => b.text)) ?? [] })
  return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 })
}
const env = { BOT_TOKEN: 'x', OWNER_CHAT_ID: '1', REFERRALS: kv }

/** Переписка: вчера утром и вечером — привычка; сегодня утром — кофе из ролика. */
const CHAT = [
  { day: 'Вчера', at: Date.UTC(2026, 10, 20, 7, 17), typed: 'Взял кофе с круассаном за 6,40' },
  { day: 'Вчера', at: Date.UTC(2026, 10, 20, 18, 5), typed: 'Купил продуктов на 41,50' },
  { day: 'Сегодня', at: Date.UTC(2026, 10, 21, 7, 41), typed: 'Ушло 3,80 на капучино' },
]
const out = []
for (const m of CHAT) {
  NOW = m.at
  sent.length = 0
  await handleTgUpdate({ message: { message_id: 1, chat: { id: 777, type: 'private' }, from: { id: 777, first_name: 'Алекс', language_code: 'ru' }, text: m.typed } }, env)
  if (sent.length !== 1) throw new Error(`«${m.typed}»: ожидался один ответ, есть ${sent.length}`)
  const d = new Date(m.at + 3600_000)
  out.push({ day: m.day, time: `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, '0')}`, typed: m.typed, reply: sent[0] })
}
const inbox = JSON.parse((await kv.get('inbox:777')) ?? '{"items":[]}').items
const last = inbox.at(-1)
if (inbox.length !== 3 || last.categoryId !== 'cafe' || last.amount !== 3.8) throw new Error('бот записал не то: ' + JSON.stringify(inbox))
writeFileSync(new URL('./replies-coffee.js', import.meta.url), `// Сгенерировано promo/replies-coffee.mjs — не править руками.\nwindow.CHAT = ${JSON.stringify(out, null, 2)}\n`)
console.log(JSON.stringify(out, null, 2))
