/**
 * Пост в канал обновлений — на поддельных Telegram, GitHub и KV.
 *
 *   - /post: владельцу — предпросмотр с «Опубликовать в канал», чужим — ничего;
 *   - публикует только владелец, один раз; ролик — тот же file_id, что в предпросмотре;
 *   - Telegram отказал (нет прав) — метка снята, владелец видит причину;
 *   - подпись влезает в лимит Telegram, кнопка ведёт в приложение с меткой канала;
 *   - разово после выката: пост, итог владельцу; второй раз — ничего.
 *
 * Запуск: `node --import ./scripts/ts-resolve.mjs scripts/test-channel.mjs`
 */
import { handleTgUpdate } from '../src/bot.ts'
import { APP_URL, CHANNEL, POST, launchOnce, nextFan, ensureAppLink, appInviteLink, fanStats, trackFan } from '../src/channel.ts'

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
  async put(k, value, opts) { this.m.set(k, { value: String(value), ttl: opts?.expirationTtl }) }
  async delete(k) { this.m.delete(k) }
  async list() { return { keys: [], list_complete: true } }
}

const calls = []
let channelFails = false
let nextMessage = 70
globalThis.fetch = async (url, init) => {
  const u = String(url)
  if (u.startsWith('https://raw.githubusercontent.com/')) return new Response(new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]), { status: 200 })
  const method = u.split('/').pop()
  const body = init?.body instanceof FormData ? Object.fromEntries(init.body.entries()) : init?.body ? JSON.parse(init.body) : {}
  calls.push({ method, body })
  if (method === 'createChatInviteLink') {
    return new Response(JSON.stringify({ ok: true, result: { invite_link: 'https://t.me/+AppLink', name: body.name } }), { status: 200 })
  }
  if (method === 'sendAnimation' || method === 'sendVideo') {
    if (body.chat_id === CHANNEL && channelFails) {
      return new Response(JSON.stringify({ ok: false, description: 'Bad Request: need administrator rights in the channel chat' }), { status: 400 })
    }
    return new Response(JSON.stringify({ ok: true, result: { message_id: nextMessage++, [method === 'sendVideo' ? 'video' : 'animation']: { file_id: 'F1' } } }), { status: 200 })
  }
  return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 })
}

const kv = new FakeKV()
const env = { BOT_TOKEN: 'x', OWNER_CHAT_ID: '42', REFERRALS: kv }
const msg = (id, text) => ({ message: { message_id: 1, chat: { id, type: 'private' }, from: { id, first_name: 'Т' }, text } })
const anims = () => calls.filter((c) => c.method === 'sendAnimation' || c.method === 'sendVideo')
const toChannel = () => anims().filter((c) => c.body.chat_id === CHANNEL)
const preview = { message_id: 5, chat: { id: 42, type: 'private' }, [POST.kind]: { file_id: 'F1' } }
const tap = (id) => handleTgUpdate({ callback_query: { id: 'cb', from: { id }, data: `n:${POST.id}`, message: preview } }, env)
const lastAnswer = () => calls.filter((c) => c.method === 'answerCallbackQuery').at(-1)?.body

/* /post */
await handleTgUpdate(msg(7, '/post'), env)
check('/post у чужого — без предпросмотра', anims().length === 0)
await handleTgUpdate(msg(42, '/post'), env)
const pv = anims().at(-1)
const kb = JSON.parse(pv?.body.reply_markup ?? '{}')
check('владельцу — предпросмотр роликом с подписью', pv?.body.chat_id === '42' && pv.body.caption === POST.caption && pv.body.parse_mode === 'HTML', pv?.body)
check('под ним — «Открыть Кошель» и «Опубликовать в канал»', kb.inline_keyboard?.[0]?.[0]?.url === APP_URL && kb.inline_keyboard?.[1]?.[0]?.callback_data === `n:${POST.id}`, kb)
check('подпись в пределах 1024 знаков без разметки', POST.caption.replace(/<[^>]+>/g, '').length <= 1024)
check('кнопка ведёт в приложение с меткой канала', /startapp=channel$/.test(APP_URL))

/* Публикация */
await tap(7)
check('чужое нажатие — ничего в канал', toChannel().length === 0)

channelFails = true
await tap(42)
check('Telegram отказал — метки нет, владелец видит причину', !kv.m.has(`channel:${POST.id}`) && lastAnswer()?.show_alert === true && lastAnswer()?.text.includes('need administrator rights'), lastAnswer())
channelFails = false

await tap(42)
const posted = toChannel().at(-1)
const postKb = JSON.parse(posted?.body.reply_markup ?? '{}')
check('владелец — пост в канал тем же роликом (file_id), с подписью', posted?.body[POST.kind] === 'F1' && posted.body.caption === POST.caption, posted?.body)
check('в канале под постом — только «Открыть Кошель»', postKb.inline_keyboard?.length === 1 && postKb.inline_keyboard[0][0].url === APP_URL, postKb)
const mark = kv.m.get(`channel:${POST.id}`)
check('метка — id сообщения в канале, без срока', mark && /^\d+$/.test(mark.value) && mark.ttl === undefined, mark)
const edited = calls.filter((c) => c.method === 'editMessageReplyMarkup').at(-1)?.body
check('под предпросмотром — ссылка на пост', JSON.stringify(edited?.reply_markup).includes(`https://t.me/${CHANNEL.slice(1)}/${mark?.value}`), edited)

const before = toChannel().length
await tap(42)
check('второе нажатие — второго поста нет', toChannel().length === before && lastAnswer()?.text === 'Этот пост уже в канале.', lastAnswer())

await handleTgUpdate(msg(42, '/post'), env)
const again = JSON.parse(anims().at(-1)?.body.reply_markup ?? '{}')
check('/post после публикации — вместо кнопки ссылка на пост', again.inline_keyboard?.[1]?.[0]?.url?.includes(`/${mark?.value}`), again)

/* Разовый запуск после выката */
const launch = async (kv) => {
  calls.length = 0
  const e = { ...env, REFERRALS: kv }
  await launchOnce(e)
  await launchOnce(e)
  return calls.filter((c) => c.method === 'sendMessage').map((c) => c.body)
}
let report = await launch(new FakeKV())
check('запуск — пост в канал один раз, ролик нужного вида', toChannel().length === 1 && toChannel()[0].method === (POST.kind === 'video' ? 'sendVideo' : 'sendAnimation'), toChannel().map((c) => c.method))
check('владельцу — одно сообщение со ссылкой на пост', report.length === 1 && report[0].chat_id === '42' && report[0].text.includes(`https://t.me/${CHANNEL.slice(1)}/`), report)
const done = new FakeKV()
await done.put(`channel:${POST.id}`, '9')
report = await launch(done)
check('пост уже в канале (кнопкой) — второго нет', toChannel().length === 0 && report[0]?.text.includes('уже был'), report)

/* Особое задание: воронка и ссылка «из приложения» */
check('воронка: не подписан при показе → saw', nextFan(null, 'saw', false) === 'saw')
check('воронка: подписан при первом показе → had', nextFan(null, 'saw', true) === 'had')
check('воронка: нажал → click, подписался → joined', nextFan('saw', 'click', false) === 'click' && nextFan('click', 'saw', true) === 'joined')
check('воронка: подписался, не нажимая, → self', nextFan('saw', 'saw', true) === 'self')
check('воронка: конечные состояния не меняются', nextFan('had', 'click', false) === 'had' && nextFan('joined', 'saw', false) === 'joined' && nextFan('self', 'click', false) === 'self')
check('воронка: после нажатия обычная проверка не откатывает к saw', nextFan('click', 'saw', false) === 'click')
const fkv = new FakeKV()
fkv.list = async ({ prefix = '' } = {}) => ({ keys: [...fkv.m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name, metadata: fkv.m.get(name).metadata })), list_complete: true })
const putWithMeta = fkv.put.bind(fkv)
fkv.put = async (k, v, opts) => { await putWithMeta(k, v, opts); fkv.m.get(k).metadata = opts?.metadata }
const fenv = { ...env, REFERRALS: fkv }
await trackFan(fenv, 1, 'saw', false)
await trackFan(fenv, 1, 'click', false)
await trackFan(fenv, 1, 'saw', true)
await trackFan(fenv, 2, 'saw', true)
await trackFan(fenv, 3, 'saw', false)
await trackFan(fenv, 4, 'saw', false)
await trackFan(fenv, 4, 'saw', true)
const fs = await fanStats(fenv)
check('статистика воронки для админки', fs.joined === 1 && fs.self === 1 && fs.had === 1 && fs.saw === 1 && fs.click === 0 && fs.joined7 === 1, fs)
check('ключи воронки — со сроком', fkv.m.get('fan:1').ttl > 0)
calls.length = 0
await ensureAppLink(fenv)
await ensureAppLink(fenv)
const created = calls.filter((c) => c.method === 'createChatInviteLink')
check('ссылка «из приложения» создаётся один раз, в канал, с именем', created.length === 1 && created[0].body.chat_id === CHANNEL && !!created[0].body.name, created)
check('ссылка сохранена и отдаётся приложению', (await appInviteLink(fenv)) === 'https://t.me/+AppLink')

if (failed) {
  console.log(`test-channel: ${failed} из ${total} упали`)
  process.exit(1)
}
console.log(`test-channel: ${total} проверок — предпросмотр владельцу, публикация по кнопке один раз, отказ Telegram, разовый запуск`)
