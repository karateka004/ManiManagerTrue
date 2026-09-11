/**
 * Сквозная проверка приёма сообщений на локальном воркере.
 *
 * Telegram для этого не нужен: вебхук — обычный POST, а обновление — обычный
 * JSON. Проверяем то, что нельзя проверить чистыми функциями: доступ по
 * секрету, запись в очередь, выдачу очереди приложению, подтверждение приёма,
 * отмену кнопкой и отказ работать в группе.
 *
 * Запуск (в соседнем окне должен идти `npx wrangler dev --local --port 8787`):
 *   node scripts/test-webhook.mjs
 */
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'

const BASE = process.env.BASE ?? 'http://127.0.0.1:8787'
const USER_ID = 777001

const vars = Object.fromEntries(
  readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)

/** Подписанная строка Telegram WebApp — так же, как её собирает настоящий клиент. */
function initData(token, userId) {
  const params = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: userId, first_name: 'Тест' }),
  }
  const check = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('\n')
  const secret = createHmac('sha256', 'WebAppData').update(token).digest()
  const hash = createHmac('sha256', secret).update(check).digest('hex')
  return new URLSearchParams({ ...params, hash }).toString()
}

const INIT = initData(vars.BOT_TOKEN, USER_ID)

const post = (path, body, headers = {}) =>
  fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })

const message = (text, chatType = 'private') => ({
  update_id: Math.floor(Math.random() * 1e9),
  message: {
    message_id: 1,
    chat: { id: USER_ID, type: chatType },
    from: { id: USER_ID, first_name: 'Тест' },
    text,
  },
})

/** Нажатие inline-кнопки под сообщением бота. */
const callback = (data) => ({
  update_id: Math.floor(Math.random() * 1e9),
  callback_query: {
    id: 'cb' + Math.random().toString(36).slice(2, 8),
    from: { id: USER_ID, first_name: 'Тест' },
    data,
    message: { message_id: 10, chat: { id: USER_ID, type: 'private' }, text: 'Записал: Кафе 300' },
  },
})

const webhook = (update, secret = vars.TG_WEBHOOK_SECRET) =>
  post('/tg/webhook', update, { 'X-Telegram-Bot-Api-Secret-Token': secret })

const inbox = async () => {
  const r = await post('/inbox/get', { initData: INIT })
  const j = await r.json()
  return j.items ?? []
}

let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) {
    failed++
    console.error(`✗ ${name}${detail ? ' — ' + detail : ''}`)
  } else {
    console.log(`✓ ${name}`)
  }
}

/* ---------- Доступ ---------- */

// Секрет — значение HTTP-заголовка, поэтому подложный тоже должен быть латиницей.
check('чужой секрет — 403', (await webhook(message('кофе 300'), 'wrong-secret-value')).status === 403)
check('без секрета — 403', (await post('/tg/webhook', message('кофе 300'))).status === 403)
check(
  'битая подпись initData — 401',
  (await post('/inbox/get', { initData: 'user=%7B%22id%22%3A1%7D&hash=deadbeef' })).status === 401,
)

/* ---------- Чистим очередь перед прогоном ---------- */

const leftovers = await inbox()
if (leftovers.length) await post('/inbox/ack', { initData: INIT, ids: leftovers.map((e) => e.id) })

/* ---------- Запись ---------- */

check('сообщение принято — 200', (await webhook(message('кофе 300'))).status === 200)

let items = await inbox()
check('операция попала в очередь', items.length === 1, `в очереди ${items.length}`)
if (items.length === 1) {
  const e = items[0]
  check('категория разобрана', e.categoryId === 'cafe', `получили ${e.categoryId}`)
  check('сумма разобрана', e.amount === 300, `получили ${e.amount}`)
  check('вид операции — расход', e.type === 'expense', `получили ${e.type}`)
  check('дата — точный момент', /^\d{4}-\d{2}-\d{2}T/.test(e.date), `получили ${e.date}`)
}

/* ---------- Отмена кнопкой ---------- */

const batch = items[0]?.id.split('-')[0]
await webhook({
  update_id: 2,
  callback_query: {
    id: 'cb1',
    from: { id: USER_ID, first_name: 'Тест' },
    data: `u:${batch}`,
    message: { message_id: 2, chat: { id: USER_ID, type: 'private' } },
  },
})
items = await inbox()
check('«Отменить» убрало запись', items.length === 0, `в очереди осталось ${items.length}`)

/* ---------- Подтверждение приёма ---------- */

await webhook(message('такси 450'))
items = await inbox()
const ackRes = await (await post('/inbox/ack', { initData: INIT, ids: items.map((e) => e.id) })).json()
check('подтверждение убрало запись', ackRes.removed === items.length, JSON.stringify(ackRes))
check('очередь пуста после подтверждения', (await inbox()).length === 0)

/* ---------- Что записывать не должны ---------- */

await webhook(message('привет'))
check('сообщение без суммы ничего не записывает', (await inbox()).length === 0)

await webhook(message('/start'))
check('команда ничего не записывает', (await inbox()).length === 0)

await webhook(message('кофе 300', 'group'))
check('сообщение из группы игнорируется', (await inbox()).length === 0)

/* ---------- Исправление категории кнопкой ---------- */

await webhook(message('кофе 300'))
items = await inbox()
const fixBatch = items[0]?.id.split('-')[0]
check('запись для исправления создана', items.length === 1 && items[0].categoryId === 'cafe')

await webhook(callback(`c:${fixBatch}`))
await webhook(callback(`p:${fixBatch}:0`))
items = await inbox()
check(
  'категория переставлена кнопкой',
  items.length === 1 && items[0].categoryId !== 'cafe',
  `категория осталась ${items[0]?.categoryId}`,
)
check('сумма при исправлении не пострадала', items[0]?.amount === 300, `сумма ${items[0]?.amount}`)

// Повторное нажатие по устаревшему списку не должно ничего портить.
await webhook(callback(`p:${fixBatch}:5`))
items = await inbox()
check('нажатие по устаревшему списку безвредно', items.length === 1 && items[0].amount === 300)

await post('/inbox/ack', { initData: INIT, ids: items.map((e) => e.id) })

/* ---------- Несколько операций ---------- */

await webhook(message('кроссовки 3500'))
await webhook(message('пиво 180'))
items = await inbox()
check('две записи копятся в очереди', items.length === 2, `в очереди ${items.length}`)
await post('/inbox/ack', { initData: INIT, ids: items.map((e) => e.id) })

if (failed) {
  console.error(`\ntest-webhook: ${failed} проверок не прошли`)
  process.exit(1)
}
console.log('\ntest-webhook: все проверки пройдены')
