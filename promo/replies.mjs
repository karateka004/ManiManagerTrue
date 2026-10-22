/**
 * Ответы бота для ролика — настоящим кодом воркера, на поддельных Telegram,
 * Gemini и KV. Ролик не должен обещать того, чего бот не пишет: всё, что в нём
 * видно в ответах, печатает bot.ts.
 *
 * Модель здесь подменена: она возвращает то, что вернула бы на эти сообщения
 * (записи, «что услышал», карточку ответа). Дальше работает обычный путь —
 * проверка записей, очередь, расчёт остатка на день, сверка чисел карточки с
 * выжимкой (`ground`) и вёрстка для Telegram.
 *
 * Запуск из корня: `node --import ./worker/scripts/ts-resolve.mjs promo/replies.mjs`
 * Пишет promo/replies.js — его подключает bot-update.html.
 */
import { writeFileSync } from 'node:fs'

// Вечер 22 октября 2026: числа в ролике не зависят от дня запуска.
const NOW = Date.UTC(2026, 9, 22, 15, 45)
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

/*
 * Октябрь до вчерашнего дня: зарплата, аренда и обычные траты по категориям.
 * В долларах и без примет одной страны — ролик для всех, кто говорит по-русски.
 */
const at = (day, hour = 13) => new Date(Date.UTC(2026, 9, day, hour - 3)).toISOString()
const txs = []
let n = 0
const add = (type, categoryId, amount, day, note) => txs.push({ id: `t${n++}`, type, categoryId, amount, date: at(day), ...(note ? { note } : {}) })
add('income', 'salary', 4200, 1, 'Зарплата')
add('expense', 'home', 1200, 2, 'Аренда')
;[46, 28, 39, 31, 64, 22, 35, 41, 26, 37, 29, 22].forEach((a, i) => add('expense', 'food', a, 1 + Math.round((i * 20) / 11)))
;[14, 32, 18, 27, 21, 34, 9, 15].forEach((a, i) => add('expense', 'cafe', a, 2 + i * 2))
;[12, 9, 14, 11, 13, 16, 8, 12, 13, 10].forEach((a, i) => add('expense', 'transport', a, 1 + i * 2))
;[28, 22, 26].forEach((a, i) => add('expense', 'fun', a, 5 + i * 6))
add('expense', 'health', 58, 9, 'Аптека')
add('expense', 'phone', 25, 12, 'Связь')
const spentBefore = txs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
// Бюджет — чтобы на сегодня было ровно 180 $: осталось 10 дней, включая сегодня.
const BUDGET = spentBefore + 180 * 10

const kv = new FakeKV()
await kv.put(
  'data:777',
  JSON.stringify({
    blob: JSON.stringify({ state: { currency: 'USD', lang: 'ru', monthlyBudget: BUDGET, transactions: txs }, version: 17 }),
    updatedAt: NOW,
  }),
)

const sent = []
const model = []
globalThis.fetch = async (url, init) => {
  const u = String(url)
  if (u.includes('/file/bot')) return new Response(new Uint8Array(64), { status: 200 })
  if (u.startsWith('https://generativelanguage.googleapis.com/')) {
    const next = model.shift()
    if (!next) return new Response('{}', { status: 500 })
    return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(next) }] } }] }), { status: 200 })
  }
  const method = u.split('/').pop()
  const body = init?.body ? JSON.parse(init.body) : {}
  if (method === 'sendMessage') {
    sent.push({ text: body.text, buttons: body.reply_markup?.inline_keyboard?.map((r) => r.map((b) => b.text)) ?? [] })
  }
  if (method === 'getFile') return new Response(JSON.stringify({ ok: true, result: { file_path: 'f', file_size: 64 } }), { status: 200 })
  return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 })
}
const env = { BOT_TOKEN: 'x', OWNER_CHAT_ID: '1', REFERRALS: kv, GEMINI_API_KEY: 'k' }
const msg = (fields) => ({ message: { message_id: 1, chat: { id: 777, type: 'private' }, from: { id: 777, first_name: 'Аня', language_code: 'ru' }, ...fields } })
const voice = { voice: { file_id: 'v', duration: 4, file_size: 9000, mime_type: 'audio/ogg' } }

// 1. Текстом — три траты одним сообщением.
const TYPED = 'такси 12, обед 15 и кино 9'
model.push({
  intent: 'record',
  entries: [
    { type: 'expense', amount: 12, categoryId: 'transport', note: 'такси' },
    { type: 'expense', amount: 15, categoryId: 'cafe', note: 'обед' },
    { type: 'expense', amount: 9, categoryId: 'fun', note: 'кино' },
  ],
})
await handleTgUpdate(msg({ text: TYPED }), env)

// 2. Голосом — как говорят, а не как пишут.
const SAID = 'заправился на сорок и взял бургер за восемь'
model.push({
  intent: 'record',
  entries: [
    { type: 'expense', amount: 40, categoryId: 'car', note: 'заправка' },
    { type: 'expense', amount: 8, categoryId: 'cafe', note: 'бургер' },
  ],
  heard: SAID,
})
await handleTgUpdate(msg(voice), env)

// 3. Фото чека — итог, магазин и дата с чека.
model.push({
  intent: 'record',
  entries: [{ type: 'expense', amount: 36.4, categoryId: 'food', note: 'Green Market', date: '2026-10-22' }],
})
await handleTgUpdate(msg({ photo: [{ file_id: 'p', width: 960, height: 1280, file_size: 120000 }] }), env)

// 4. Вопрос голосом — карточка ответа. Числа в ней проходят сверку с выжимкой.
const ASKED = 'на что ушло больше всего в этом месяце?'
model.push({ intent: 'answer', entries: [], heard: ASKED })
model.push({
  title: 'Октябрь: куда ушли деньги',
  lead: 'Больше всего — «Жильё»: 1,200 $, это 55% расходов.',
  sections: [
    {
      heading: 'Дальше по тратам',
      icon: 'category',
      rows: [
        { label: 'Еда', value: '456.40 $ (21%)' },
        { label: 'Кафе', value: '193 $ (9%)' },
        { label: 'Транспорт', value: '130 $ (6%)' },
      ],
    },
  ],
  tip: 'Еда и кафе вместе — почти треть трат: лимит на «Кафе» поможет держать темп.',
  followups: ['А в прошлом месяце?', 'Сколько можно тратить в день?'],
})
await handleTgUpdate(msg(voice), env)

const [text, said, photo, answer] = sent
if (sent.length !== 4 || model.length) throw new Error(`ожидалось 4 ответа, есть ${sent.length}; модель не доела ${model.length}`)
const out = { typed: TYPED, said: SAID, asked: ASKED, text, voice: said, photo, answer }
writeFileSync(new URL('./replies.js', import.meta.url), `// Сгенерировано promo/replies.mjs — не править руками.\nwindow.REPLIES = ${JSON.stringify(out, null, 2)}\n`)
console.log(JSON.stringify(out, null, 2))
