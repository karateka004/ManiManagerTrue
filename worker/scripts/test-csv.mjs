/**
 * CSV файлом в чат: разбор и сценарий бота на поддельных Telegram и KV.
 * Запуск: `node --import ./scripts/ts-resolve.mjs scripts/test-csv.mjs`
 */
import { parseCsvRows } from '../src/csv.ts'
import { handleTgUpdate } from '../src/bot.ts'
import { DEFAULT_CATEGORIES } from '../src/context.ts'

let failed = 0
let total = 0
const check = (name, ok, extra) => {
  total++
  if (!ok) {
    failed++
    console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra))
  }
}

const OUR = [
  'Дата;Тип;Категория;Сумма;Валюта;Заметка',
  '12.10.2026;Расход;transport;2,28;EUR;Метро',
  '12.10.2026;Расход;transport;2,28;EUR;Метро',
  '13.10.2026;Расход;Кафе;1 234,50;UAH;"Обед; с коллегами"',
  '13.10.2026;Доход;salary;2481,26;EUR;Зарплата',
  '31.02.2026;Расход;food;10;EUR;битая дата',
  '14.10.2026;Расход;food;abc;EUR;битая сумма',
].join('\n')
const r = parseCsvRows('﻿' + OUR, DEFAULT_CATEGORIES, 'USD')
check('наша выгрузка: 4 строки, 2 пропущено', r.rows.length === 4 && r.skipped === 2, r)
check('одинаковые проезды в один день — обе', r.rows.filter((x) => x.amount === 2.28).length === 2)
check('разряды и копейки, категория по названию, кавычки', r.rows[2].amount === 1234.5 && r.rows[2].categoryId === 'cafe' && r.rows[2].note === 'Обед; с коллегами' && r.rows[2].currency === 'UAH', r.rows[2])
check('доход по типу, дата в ISO', r.rows[3].type === 'income' && r.rows[3].categoryId === 'salary' && r.rows[3].date === '2026-10-13', r.rows[3])

const bank = parseCsvRows('Date,Description,Amount\n2026-10-01,Dirk,-25.94\n2026-10-02,Salary,2000\n', DEFAULT_CATEGORIES, 'EUR')
check('банковская: минус — расход, без типа — расход, валюта по умолчанию', bank.rows.length === 2 && bank.rows[0].type === 'expense' && bank.rows[0].amount === 25.94 && bank.rows[0].currency === 'EUR', bank)
check('незнакомая категория — «Прочее» своего вида', bank.rows[0].categoryId === 'other')
check('будущая дата не берётся', parseCsvRows('Дата;Сумма\n01.01.2099;5', DEFAULT_CATEGORIES).rows.length === 0)

/* Сценарий бота */
class FakeKV {
  constructor() { this.m = new Map() }
  async get(k) { return this.m.get(k)?.value ?? null }
  async getWithMetadata(k) { const v = this.m.get(k); return v ? { value: v.value, metadata: v.metadata } : { value: null, metadata: null } }
  async put(k, value, opts) { this.m.set(k, { value: String(value), metadata: opts?.metadata ?? null }) }
  async delete(k) { this.m.delete(k) }
  async list({ prefix = '' } = {}) { return { keys: [...this.m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true } }
}
const calls = []
let fileBody = OUR
globalThis.fetch = async (url, init) => {
  const u = String(url)
  if (u.includes('/file/bot')) return new Response(fileBody, { status: 200 })
  const method = u.split('/').pop()
  const body = init?.body ? JSON.parse(init.body) : {}
  calls.push({ method, body })
  if (method === 'getFile') return new Response(JSON.stringify({ ok: true, result: { file_path: 'documents/f.csv', file_size: fileBody.length } }), { status: 200 })
  return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 })
}
const kv = new FakeKV()
const env = { BOT_TOKEN: 'x', OWNER_CHAT_ID: '1', REFERRALS: kv }
const doc = (name) => ({ message: { message_id: 5, chat: { id: 77, type: 'private' }, from: { id: 77, first_name: 'Т' }, document: { file_id: 'F', file_name: name, file_size: 300 } } })

await handleTgUpdate(doc('statement.csv'), env)
const inbox = JSON.parse((await kv.get('inbox:77')) ?? '{"items":[]}').items
const sent = calls.filter((c) => c.method === 'sendMessage').at(-1)?.body
check('бот: 4 записи в очереди с пометкой импорта', inbox.length === 4 && inbox.every((e) => e.imp === 1), inbox)
check('бот: ответ с числом и кнопкой «Отменить»', sent?.text.includes('Файл принят: 4 операции') && sent.text.includes('Не разобрал строк: 2') && JSON.stringify(sent.reply_markup).includes('"u:'), sent)
const undo = sent.reply_markup.inline_keyboard[1][0].callback_data
await handleTgUpdate({ callback_query: { id: 'cb', from: { id: 77 }, data: undo, message: { message_id: 9, chat: { id: 77 } } } }, env)
const after = JSON.parse((await kv.get('inbox:77')) ?? '{"items":[]}').items
const edited = calls.filter((c) => c.method === 'editMessageText').at(-1)?.body
check('бот: «Отменить» убирает весь файл одной строкой', after.length === 0 && edited?.text === 'Отменил загрузку файла: 4 операции.', { after, edited })

fileBody = 'просто текст без чисел'
await handleTgUpdate(doc('x.csv'), env)
check('бот: нечитаемый файл — подсказка о формате', calls.filter((c) => c.method === 'sendMessage').at(-1)?.body.text.startsWith('Не смог прочитать файл'))
await handleTgUpdate(doc('photo.jpg'), env)
check('бот: не CSV и не картинка — «понимаю текст и файлы .csv»', calls.filter((c) => c.method === 'sendMessage').at(-1)?.body.text.startsWith('Понимаю текст и файлы .csv'))

if (failed) {
  console.log(`test-csv: ${failed} из ${total} упали`)
  process.exit(1)
}
console.log(`test-csv: ${total} проверок — разбор файла, очередь, отмена, ошибки формата`)
