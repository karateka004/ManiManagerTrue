/**
 * Облако (2.6): версия-основа при отправке и часовой пояс — на поддельном KV.
 *
 *   - отправка с устаревшей версией-основой не затирает чужое — сервер отдаёт
 *     текущее (`conflict` + `data`), приложение сольёт и пришлёт снова;
 *   - повтор той же отправки — не конфликт; старое приложение без `base` — как раньше;
 *   - пояс из приложения ложится в метаданные и не теряется, когда его не прислали;
 *   - включение напоминаний в приложении снимает метку «заблокировал».
 *
 * Запуск: `node --import ./scripts/ts-resolve.mjs scripts/test-sync.mjs`
 */
import { createHmac } from 'node:crypto'
import worker from '../src/index.ts'

let failed = 0
let passed = 0
function check(name, ok, detail) {
  if (ok) passed++
  else {
    failed++
    console.error('✗ ' + name + (detail !== undefined ? ' — ' + JSON.stringify(detail) : ''))
  }
}

class FakeKV {
  constructor() {
    this.m = new Map()
  }
  async get(k) {
    return this.m.get(k)?.value ?? null
  }
  async getWithMetadata(k) {
    const v = this.m.get(k)
    return v ? { value: v.value, metadata: v.metadata } : { value: null, metadata: null }
  }
  async put(k, value, opts) {
    this.m.set(k, { value: String(value), metadata: opts?.metadata !== undefined ? JSON.parse(JSON.stringify(opts.metadata)) : null })
  }
  async delete(k) {
    this.m.delete(k)
  }
  async list({ prefix = '' } = {}) {
    return { keys: [...this.m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name, metadata: this.m.get(name).metadata ?? undefined })), list_complete: true }
  }
}

const TOKEN = 'test-token'
function initData(userId) {
  const params = { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: userId, first_name: 'Т' }) }
  const check = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('\n')
  const secret = createHmac('sha256', 'WebAppData').update(TOKEN).digest()
  const hash = createHmac('sha256', secret).update(check).digest('hex')
  return new URLSearchParams({ ...params, hash }).toString()
}

const kv = new FakeKV()
const env = { BOT_TOKEN: TOKEN, OWNER_CHAT_ID: '1', REFERRALS: kv, ALLOWED_ORIGINS: '*' }
const ctx = { waitUntil() {}, passThroughOnException() {} }
// Свой id на каждый сценарий: лимитер в памяти — 20 отправок в минуту на человека.
let nextId = 9000
async function put(id, body) {
  const res = await worker.fetch(
    new Request('https://w/data/put', { method: 'POST', body: JSON.stringify({ initData: initData(id), ...body }) }),
    env,
    ctx,
  )
  return res.json()
}
const blob = (n) => JSON.stringify({ state: { transactions: Array.from({ length: n }, (_, i) => ({ id: 't' + i })) }, version: 17 })
const stored = (id) => JSON.parse(kv.m.get(`data:${id}`).value)
const meta = (id) => kv.m.get(`data:${id}`).metadata

{
  const id = nextId++
  const a = await put(id, { blob: blob(1), updatedAt: 1000, base: 0, tz: 180 })
  check('первая отправка с основой 0 — принята', a.ok && !a.conflict && stored(id).updatedAt === 1000, a)
  const b = await put(id, { blob: blob(2), updatedAt: 2000, base: 1000 })
  check('отправка от текущей версии — принята', b.ok && !b.conflict && stored(id).updatedAt === 2000, b)
  const c = await put(id, { blob: blob(3), updatedAt: 3000, base: 1000 })
  check('устаревшая основа — конфликт, облако не тронуто', c.ok && c.conflict === true && stored(id).updatedAt === 2000, c)
  check('конфликт возвращает текущий снимок', c.data?.updatedAt === 2000 && c.data?.blob === blob(2), c.data)
  const d = await put(id, { blob: blob(2), updatedAt: 2000, base: 1000 })
  check('повтор той же отправки — не конфликт', d.ok && !d.conflict, d)
  const e = await put(id, { blob: blob(4), updatedAt: 4000 })
  check('приложение до 2.6 (без основы) — как раньше, перезаписывает', e.ok && !e.conflict && stored(id).updatedAt === 4000, e)
  const f = await put(id, { blob: blob(5), updatedAt: 3500 })
  check('…и старое правило «у сервера новее» осталось', f.skipped === true && stored(id).updatedAt === 4000, f)
}

{
  const id = nextId++
  await put(id, { blob: blob(1), updatedAt: 1000, base: 0, tz: 420 })
  check('пояс — в метаданных', meta(id).tz === 420, meta(id))
  await put(id, { blob: blob(1), updatedAt: 2000, base: 1000 })
  check('приложение без пояса — прежний не теряется', meta(id).tz === 420, meta(id))
  await put(id, { blob: blob(1), updatedAt: 3000, base: 2000, tz: 'мусор' })
  check('мусорный пояс не принимается', meta(id).tz === 420, meta(id))
  await put(id, { blob: blob(1), updatedAt: 4000, base: 3000, tz: -300 })
  check('сменил пояс — обновился', meta(id).tz === -300, meta(id))
}

{
  const id = nextId++
  await kv.put(`blocked:${id}`, '1')
  await kv.put(`remind:${id}`, 'b')
  const res = await worker.fetch(
    new Request('https://w/reminders', { method: 'POST', body: JSON.stringify({ initData: initData(id), enabled: true }) }),
    env,
    ctx,
  )
  const j = await res.json()
  check('включил напоминания в приложении — «1» и метка блокировки снята', j.ok && (await kv.get(`remind:${id}`)) === '1' && (await kv.get(`blocked:${id}`)) === null, j)
}

if (failed) {
  console.error(`test-sync: ${failed} из ${failed + passed} проверок не прошли`)
  process.exit(1)
}
console.log(`test-sync: ${passed} проверок — версия облака, конфликт, пояс, разблокировка напоминаний`)
