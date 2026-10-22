/**
 * Голос и фото чеков в боте — на поддельных Telegram, Gemini и KV.
 *
 *   - голосовое и кружок → запись; вопрос голосом → ответ с тем, что услышали;
 *   - фото чека → одна запись с магазином и датой; самый крупный снимок;
 *   - модель не нашла суммы, а в расшифровке она есть — записывают правила;
 *   - отказы: нет ключа, квота, длинное, тяжёлое, незнакомый формат, сбой загрузки;
 *   - сильная модель отказала — лёгкая; отказ «нет такой» запоминается.
 *
 * Запуск: `node --import ./scripts/ts-resolve.mjs scripts/test-media.mjs`
 */
import { handleTgUpdate } from '../src/bot.ts'
import { DEFAULT_ANSWER_MODEL } from '../src/answer.ts'
import { DEFAULT_MODEL } from '../src/gemini.ts'
import { isRateLimited } from '../src/limits.ts'

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
  async put(k, value, opts) { this.m.set(k, { value: String(value), metadata: opts?.metadata ?? null }) }
  async delete(k) { this.m.delete(k) }
  async list({ prefix = '' } = {}) { return { keys: [...this.m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true } }
}

/* Поддельная сеть: Telegram (методы и файлы) и Gemini по сценарию. */
const tg = []
const gem = []
const FILE = new Uint8Array(70_000).map((_, i) => (i * 31 + 7) & 255)
let fileOk = true
/** Ответы модели разбора по очереди: объект — JSON-ответ, число — код ошибки. */
let mediaReplies = []
globalThis.fetch = async (url, init) => {
  const u = String(url)
  if (u.includes('/file/bot')) return new Response(FILE, { status: 200 })
  if (u.startsWith('https://generativelanguage.googleapis.com/')) {
    const model = u.match(/models\/([^:]+):/)[1]
    const body = JSON.parse(init.body)
    const media = body.systemInstruction.parts[0].text.includes('Сейчас пришло не текстом')
    gem.push({ model, body, media })
    // Ответы на вопросы в этом тесте не нужны — пусть отвечают правила.
    if (!media) return new Response('{"error":{"code":500}}', { status: 500 })
    const next = mediaReplies.shift()
    if (typeof next === 'number' || next === undefined) return new Response('{"error":{}}', { status: next ?? 500 })
    return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(next) }] } }] }), { status: 200 })
  }
  const method = u.split('/').pop()
  const body = init?.body ? JSON.parse(init.body) : {}
  tg.push({ method, body })
  if (method === 'getFile') {
    if (!fileOk) return new Response(JSON.stringify({ ok: false }), { status: 400 })
    return new Response(JSON.stringify({ ok: true, result: { file_path: 'voice/f.oga', file_size: FILE.length } }), { status: 200 })
  }
  return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 })
}

const kv = new FakeKV()
const env = { BOT_TOKEN: 'x', OWNER_CHAT_ID: '1', REFERRALS: kv, GEMINI_API_KEY: 'k' }
let nextId = 500
const send = async (fields, who = nextId++, e = env) => {
  await handleTgUpdate({ message: { message_id: 1, chat: { id: who, type: 'private' }, from: { id: who, first_name: 'Т' }, ...fields } }, e)
  return who
}
const inbox = async (who) => JSON.parse((await kv.get(`inbox:${who}`)) ?? '{"items":[]}').items
const lastText = () => tg.filter((c) => c.method === 'sendMessage').at(-1)?.body.text ?? ''
const lastGem = () => gem.at(-1)
const voice = { file_id: 'V', duration: 4, file_size: 9000, mime_type: 'audio/ogg' }
const yesterday = new Date(Date.now() - 86_400_000 + 3 * 3_600_000).toISOString().slice(0, 10)
const b64 = Buffer.from(FILE).toString('base64')

/* Голосом записать */
{
  mediaReplies = [{ intent: 'record', entries: [{ type: 'expense', amount: 300, categoryId: 'cafe' }], heard: 'кофе триста' }]
  const who = await send({ voice })
  const items = await inbox(who)
  const part = lastGem()?.body.contents[0].parts[0].inline_data
  check('голосовое → запись 300 в «Кафе»', items.length === 1 && items[0].amount === 300 && items[0].categoryId === 'cafe', items)
  check('в модель ушёл звук целиком, audio/ogg', part?.mime_type === 'audio/ogg' && part.data === b64, part?.mime_type)
  check('разбирает модель ответов, думает немного', lastGem()?.model === DEFAULT_ANSWER_MODEL && lastGem()?.body.generationConfig.thinkingConfig?.thinkingLevel === 'LOW', lastGem()?.model)
  check('под записью — «Отменить»', JSON.stringify(tg.filter((c) => c.method === 'sendMessage').at(-1)?.body.reply_markup).includes('"u:'))
}

/* Голосом спросить */
{
  mediaReplies = [{ intent: 'answer', entries: [], heard: 'сколько я потратил за неделю' }]
  await send({ voice })
  check('вопрос голосом — ответ, а над ним услышанное', lastText().includes('<i>› сколько я потратил за неделю</i>'), lastText())
}

/* Модель не нашла записи, а сумму в расшифровке видят правила */
{
  mediaReplies = [{ intent: 'unclear', entries: [], heard: 'такси 450' }]
  const who = await send({ voice })
  const items = await inbox(who)
  check('расшифровку дочитали правила: такси 450', items.length === 1 && items[0].amount === 450 && items[0].categoryId === 'transport', items)
}
{
  mediaReplies = [{ intent: 'unclear', entries: [], heard: 'ээ' }]
  const who = await send({ voice })
  check('ничего не расслышал — просит сказать сумму', lastText().startsWith('Не расслышал сумму') && (await inbox(who)).length === 0, lastText())
}

/* Кружок и аудиофайлы */
{
  mediaReplies = [{ intent: 'record', entries: [{ type: 'expense', amount: 120, categoryId: 'food' }] }]
  await send({ video_note: { file_id: 'N', duration: 10, file_size: 50_000 } })
  check('кружок → video/mp4', lastGem()?.body.contents[0].parts[0].inline_data.mime_type === 'video/mp4')
  mediaReplies = [{ intent: 'record', entries: [{ type: 'expense', amount: 120, categoryId: 'food' }] }]
  await send({ audio: { file_id: 'A', duration: 10, file_size: 50_000, mime_type: 'audio/mpeg' } })
  check('mp3 → audio/mp3', lastGem()?.body.contents[0].parts[0].inline_data.mime_type === 'audio/mp3')
  const before = gem.length
  await send({ audio: { file_id: 'A', duration: 10, file_size: 50_000, mime_type: 'audio/x-m4a' } })
  check('незнакомый звук — не в модель, подсказка', gem.length === before && lastText().startsWith('Такой файл не открою'), lastText())
}

/* Фото чека */
{
  mediaReplies = [{ intent: 'record', entries: [{ type: 'expense', amount: 1234.5, categoryId: 'food', note: 'Пятёрочка', date: yesterday }] }]
  const photo = [
    { file_id: 'small', width: 90, height: 160, file_size: 2000 },
    { file_id: 'big', width: 720, height: 1280, file_size: 90_000 },
    { file_id: 'mid', width: 320, height: 568, file_size: 20_000 },
  ]
  const who = await send({ photo, caption: 'продукты на неделю' })
  const items = await inbox(who)
  const parts = lastGem()?.body.contents[0].parts
  check('чек → одна запись: итог, магазин, дата с чека', items.length === 1 && items[0].amount === 1234.5 && items[0].note === 'Пятёрочка' && items[0].date === yesterday, items)
  check('взят самый крупный снимок', tg.filter((c) => c.method === 'getFile').at(-1)?.body.file_id === 'big')
  check('картинка — image/jpeg, подпись — вторым куском', parts?.[0].inline_data.mime_type === 'image/jpeg' && parts?.[1]?.text === 'Подпись: продукты на неделю', parts?.[1])
  check('в подсказке — правила для чеков', lastGem()?.body.systemInstruction.parts[0].text.includes('ИТОГ к оплате'))
}
{
  mediaReplies = [{ intent: 'unclear', entries: [] }]
  const who = await send({ photo: [{ file_id: 'p', width: 800, height: 600, file_size: 50_000 }] })
  check('на фото нет суммы — просит снять чек целиком', lastText().startsWith('Не нашёл на фото суммы') && (await inbox(who)).length === 0, lastText())
}
{
  // Скриншот истории операций: записей больше обычного потолка в 10, но не без конца.
  mediaReplies = [{ intent: 'record', entries: Array.from({ length: 20 }, (_, i) => ({ type: 'expense', amount: 10 + i, categoryId: 'food' })) }]
  const who = await send({ document: { file_id: 'D', file_name: 'IMG_1.PNG', mime_type: 'image/png', file_size: 300_000 } })
  check('скриншот файлом (png) → не больше 15 записей', (await inbox(who)).length === 15 && lastGem()?.body.contents[0].parts[0].inline_data.mime_type === 'image/png')
}
{
  const before = gem.length
  await send({ document: { file_id: 'G', file_name: 'a.gif', mime_type: 'image/gif', file_size: 3000 } })
  check('gif — не в модель, подсказка', gem.length === before && lastText().startsWith('Такой файл не открою'), lastText())
}

/* Отказы до похода в модель */
{
  const before = tg.filter((c) => c.method === 'getFile').length
  await send({ voice: { ...voice, duration: 300 } })
  check('голосовое длиннее 2 минут — подсказка, без загрузки', lastText().startsWith('Длинновато') && tg.filter((c) => c.method === 'getFile').length === before, lastText())
  await send({ photo: [{ file_id: 'huge', width: 4000, height: 3000, file_size: 9_000_000 }] })
  check('тяжёлое фото — подсказка', lastText().startsWith('Файл тяжеловат'), lastText())
  await send({ voice }, nextId++, { ...env, GEMINI_API_KEY: '' })
  check('без ключа модели — «напиши текстом», без загрузки', lastText().startsWith('Голосовые и фото сейчас не разбираю') && tg.filter((c) => c.method === 'getFile').length === before, lastText())
  const who = nextId++
  for (let i = 0; i < 50; i++) await isRateLimited(env, 'gem', who, 50, 86_400)
  await send({ voice }, who)
  check('квота на сегодня кончилась — «до завтра текстом»', lastText().startsWith('На сегодня голосовых и фото хватит'), lastText())
}

/* Сбои */
{
  fileOk = false
  const before = gem.length
  await send({ voice })
  fileOk = true
  check('файл не скачался — «не получилось», модель не звали', lastText().startsWith('Не получилось разобрать') && gem.length === before, lastText())

  mediaReplies = [404, { intent: 'record', entries: [{ type: 'expense', amount: 77, categoryId: 'other' }] }]
  let who = await send({ voice })
  const models = gem.slice(-2).map((g) => g.model)
  check('сильная модель «нет такой» → лёгкая, запись есть', models[0] === DEFAULT_ANSWER_MODEL && models[1] === DEFAULT_MODEL && (await inbox(who)).length === 1, models)
  mediaReplies = [{ intent: 'record', entries: [{ type: 'expense', amount: 78, categoryId: 'other' }] }]
  who = await send({ voice })
  check('…и дальше сразу лёгкая', lastGem()?.model === DEFAULT_MODEL && (await inbox(who)).length === 1, lastGem()?.model)

  mediaReplies = [500]
  who = await send({ voice })
  check('обе модели не ответили — «не получилось», без записи', lastText().startsWith('Не получилось разобрать') && (await inbox(who)).length === 0, lastText())
}

/* Прочее не текстом — подсказка, что бот понимает */
{
  await send({ sticker: { file_id: 'S' } })
  check('стикер — список того, что понимаю', lastText().startsWith('Понимаю текст, голосовые, фото чеков'), lastText())
}

if (failed) {
  console.log(`test-media: ${failed} из ${total} упали`)
  process.exit(1)
}
console.log(`test-media: ${total} проверок — голос, кружок, фото чека, скриншот, отказы, откат модели`)
