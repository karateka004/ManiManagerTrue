/**
 * Промо-ролик владельцу: один раз после выката и по /promo — на поддельных KV,
 * GitHub и Telegram. Чужому /promo — обычная справка.
 *
 * Запуск: `node --import ./scripts/ts-resolve.mjs scripts/test-promo.mjs`
 */
import { PROMO_ID, sendPromo, sendPromoOnce } from '../src/promo.ts'
import { handleTgUpdate } from '../src/bot.ts'

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

const calls = []
let rawOk = true
globalThis.fetch = async (url, init) => {
  const u = String(url)
  if (u.startsWith('https://raw.githubusercontent.com/')) {
    return rawOk ? new Response(new Uint8Array(1000), { status: 200 }) : new Response('nope', { status: 404 })
  }
  const method = u.split('/').pop()
  if (init?.body instanceof FormData) {
    const f = init.body
    const field = { sendAnimation: 'animation', sendVideo: 'video', sendDocument: 'document' }[method]
    calls.push({ method, chat: f.get('chat_id'), file: f.get(field), asIs: f.get('disable_content_type_detection'), stream: f.get('supports_streaming') })
  } else {
    calls.push({ method, body: init?.body ? JSON.parse(init.body) : {} })
  }
  return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 })
}
const kv = new FakeKV()
const env = { BOT_TOKEN: 'x', OWNER_CHAT_ID: '42', REFERRALS: kv }
const files = () => calls.filter((c) => ['sendAnimation', 'sendVideo', 'sendDocument'].includes(c.method))
const count = (list, m) => list.filter((c) => c.method === m).length

await sendPromoOnce(env)
const first = files()
check('после выката — владельцу три видео со звуком, две анимации и гиф файлом', first.length === 6 && first.every((c) => c.chat === '42') && count(first, 'sendVideo') === 3 && count(first, 'sendAnimation') === 2 && count(first, 'sendDocument') === 1, first.map((c) => c.method))
check('видео — с потоковым воспроизведением', first.filter((c) => c.method === 'sendVideo').every((c) => c.stream === 'true'))
check('гиф уходит как есть, не превращается в анимацию', first.find((c) => c.method === 'sendDocument')?.asIs === 'true')
check('файл приложен байтами, с именем', first.every((c) => c.file?.size === 1000 && /\.(mp4|gif)$/.test(c.file?.name ?? '')))
check('метка отправки в KV', (await kv.get('promo:sent')) === PROMO_ID)

await sendPromoOnce(env)
check('второй крон — тишина', files().length === 6)

const update = (id) => ({ message: { message_id: 1, chat: { id, type: 'private' }, from: { id, first_name: 'Т' }, text: '/promo' } })
await handleTgUpdate(update(42), env)
check('/promo от владельца — ролик ещё раз', files().length === 12)
const before = files().length
await handleTgUpdate(update(7), env)
check('/promo от чужого — файлов нет, обычная справка', files().length === before && calls.at(-1)?.method === 'sendMessage' && calls.at(-1)?.body.text.includes('Как писать'))

rawOk = false
check('файл не скачался — false, без падения', (await sendPromo(env, '42')) === false)

if (failed) {
  console.log(`test-promo: ${failed} из ${total} упали`)
  process.exit(1)
}
console.log(`test-promo: ${total} проверок — ролик владельцу один раз, /promo, чужим — справка`)
