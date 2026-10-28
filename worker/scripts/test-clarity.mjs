/**
 * Clarity в админке и быстрый старт по шагам — на поддельном KV и сети.
 *
 *   - разбор выгрузки: счётчики строками, доли числами, измерения — подписи,
 *     незнакомые метрики не теряются, мусор не роняет;
 *   - токен: формат, отказ Clarity (не храним), принят (храним, наружу — только
 *     хвост и срок), заголовок Bearer, без перехода по перенаправлениям;
 *   - квота 10 в сутки: днём не больше 8, ночному снимку всегда остаются два,
 *     429 от Clarity закрывает сутки;
 *   - ночной снимок: день истории по МСК + разбивка по ОС; отказ 401/403
 *     останавливает крон до нового токена;
 *   - быстрый старт: шаги не откатываются, отметки не снимаются, сводка по окну.
 *
 * Запуск: `node --import ./scripts/ts-resolve.mjs scripts/test-clarity.mjs`
 */
import {
  DAILY_LIMIT,
  clarityAction,
  clarityBlock,
  clarityNightly,
  clarityTick,
  dayRow,
  looksLikeToken,
  parseExport,
  putDay,
  tokenInfo,
} from '../src/clarity.ts'
import { aggregateQs, mergeQs, trackQuickStart } from '../src/quickstart.ts'

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
  async put(k, value, opts) { this.m.set(k, { value: String(value), metadata: opts?.metadata ?? null, ttl: opts?.expirationTtl }) }
  async delete(k) { this.m.delete(k) }
  async list({ prefix = '', cursor } = {}) {
    const keys = [...this.m.keys()].filter((k) => k.startsWith(prefix)).sort().map((name) => ({ name, metadata: this.m.get(name).metadata ?? undefined }))
    return { keys, list_complete: true, cursor }
  }
}

// Ответ выгрузки — как в документации Clarity (счётчики строками).
const SAMPLE = [
  { metricName: 'Traffic', information: [{ totalSessionCount: '120', totalBotSessionCount: '0', distantUserCount: '87', PagesPerSessionPercentage: 1.04 }] },
  { metricName: 'DeadClickCount', information: [{ sessionsCount: '120', sessionsWithMetricPercentage: 12.5, sessionsWithoutMetricPercentage: 87.5, pagesViews: '130', subTotal: '41' }] },
  { metricName: 'RageClickCount', information: [{ sessionsCount: '120', sessionsWithMetricPercentage: 2.5, sessionsWithoutMetricPercentage: 97.5, pagesViews: '130', subTotal: '4' }] },
  { metricName: 'QuickbackClick', information: [{ sessionsCount: '120', sessionsWithMetricPercentage: 0, sessionsWithoutMetricPercentage: 100, pagesViews: '130', subTotal: '0' }] },
  { metricName: 'ScriptErrorCount', information: [{ sessionsCount: '120', sessionsWithMetricPercentage: 1.67, sessionsWithoutMetricPercentage: 98.33, pagesViews: '130', subTotal: '2' }] },
  { metricName: 'EngagementTime', information: [{ totalTime: '214', activeTime: '96' }] },
  { metricName: 'ScrollDepth', information: [{ averageScrollDepth: 63.2 }] },
  { metricName: 'OS', information: [{ name: 'Android', sessionsCount: '70' }, { name: 'iOS', sessionsCount: '45' }, { name: 'Windows', sessionsCount: '5' }] },
  { metricName: 'НоваяМетрика', information: [{ someCount: '7', label: 'x' }] },
  null,
  { metricName: 'Сломанная' },
]
const BY_OS = [
  { metricName: 'Traffic', information: [{ totalSessionCount: '70', totalBotSessionCount: '0', distantUserCount: '50', PagesPerSessionPercentage: 1, OS: 'Android' }, { totalSessionCount: '45', totalBotSessionCount: '0', distantUserCount: '33', PagesPerSessionPercentage: 1.1, OS: 'iOS' }] },
  { metricName: 'DeadClickCount', information: [{ sessionsCount: '70', sessionsWithMetricPercentage: 20, subTotal: '30', OS: 'Android' }, { sessionsCount: '45', sessionsWithMetricPercentage: 4.4, subTotal: '2', OS: 'iOS' }] },
]

/* ---------- Разбор ---------- */
const p = parseExport(SAMPLE)
check('сессии строкой → число', p.Traffic[0].n.totalSessionCount === 120 && p.Traffic[0].n.PagesPerSessionPercentage === 1.04, p.Traffic)
check('доля трения — число', p.DeadClickCount[0].n.sessionsWithMetricPercentage === 12.5 && p.DeadClickCount[0].n.subTotal === 41)
check('списки: подпись отдельно от числа', p.OS[1].d.name === 'iOS' && p.OS[1].n.sessionsCount === 45, p.OS)
check('незнакомая метрика не теряется', p['НоваяМетрика'][0].n.someCount === 7 && p['НоваяМетрика'][0].d.label === 'x')
check('мусорные записи пропущены', !('Сломанная' in p) && Object.keys(p).length === 9, Object.keys(p))
check('не массив — null', parseExport({ error: 'x' }) === null && parseExport(null) === null)
const pos = parseExport(BY_OS, ['OS'])
check('измерение — подпись', pos.Traffic[0].d.OS === 'Android' && pos.DeadClickCount[1].d.OS === 'iOS' && pos.DeadClickCount[1].n.sessionsWithMetricPercentage === 4.4)
const numericDim = parseExport([{ metricName: 'Traffic', information: [{ totalSessionCount: '3', Campaign: '2024' }] }], ['Campaign'])
check('измерение-число остаётся подписью', numericDim.Traffic[0].d.Campaign === '2024' && !('Campaign' in numericDim.Traffic[0].n))
const long = parseExport([{ metricName: 'PopularPages', information: Array.from({ length: 40 }, (_, i) => ({ url: '/p' + i, visitsCount: String(i) })) }])
check('длинный список — 25 крупнейших', long.PopularPages.length === 25 && long.PopularPages[0].n.visitsCount === 39, long.PopularPages[0])

/* ---------- День истории ---------- */
const row = dayRow('2026-10-28', p)
check('день: сессии, люди, боты', row.s === 120 && row.u === 87 && row.b === 0, row)
check('день: трение в процентах', row.f.DeadClickCount === 12.5 && row.f.RageClickCount === 2.5 && row.f.QuickbackClick === 0 && row.f.ScriptErrorCount === 1.67 && !('ExcessiveScroll' in row.f), row.f)
check('день: время и прокрутка как пришли', row.x['EngagementTime.activeTime'] === 96 && row.x['ScrollDepth.averageScrollDepth'] === 63.2, row.x)
let hist = []
for (let d = 1; d <= 130; d++) hist = putDay(hist, { d: `2026-${String(Math.ceil(d / 28)).padStart(2, '0')}-${String(((d - 1) % 28) + 1).padStart(2, '0')}`, f: {}, x: {}, s: d })
check('история не длиннее 120 дней, по порядку', hist.length === 120 && hist[0].d < hist[119].d)
hist = putDay(hist, { d: hist[5].d, f: {}, x: {}, s: -1 })
check('тот же день заменяется, а не дублируется', hist.length === 120 && hist[5].s === -1)

/* ---------- Токен ---------- */
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const TOKEN = `${b64({ alg: 'RS256' })}.${b64({ exp: 1830000000, jti: 'x' })}.c2lnbmF0dXJlX3NlY3JldA`
check('токен узнаём', looksLikeToken(TOKEN) && !looksLikeToken('abc') && !looksLikeToken('a b.c.d') && !looksLikeToken('x'.repeat(30)))
const info = tokenInfo(TOKEN)
check('срок и хвост из токена', info.exp === 1830000000 * 1000 && info.tail === TOKEN.slice(-4), info)
check('не JWT — только хвост', JSON.stringify(tokenInfo('aaaa.bbbb.cccc')) === '{"tail":"cccc"}')

/* ---------- Сеть ---------- */
const calls = []
let reply = () => new Response(JSON.stringify(SAMPLE), { status: 200 })
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), init })
  return reply(String(url))
}
const kv = new FakeKV()
const env = { BOT_TOKEN: 'x', OWNER_CHAT_ID: '42', REFERRALS: kv }
// 28.10.2026 12:00 МСК = 09:00 UTC.
const NOW = Date.UTC(2026, 9, 28, 9, 0, 0)
const quota = () => Number(kv.m.get('clarity:quota:2026-10-28')?.value ?? 0)

let res = await clarityAction(env, { action: 'token', token: 'не токен' }, NOW)
check('не токен — отказ без запроса', res.error === 'bad_format' && calls.length === 0 && !kv.m.has('clarity:token'))

reply = () => new Response('', { status: 403 })
res = await clarityAction(env, { action: 'token', token: TOKEN }, NOW)
check('Clarity не принял — не храним и попытку не считаем', res.error === 'rejected' && res.status === 403 && !kv.m.has('clarity:token') && quota() === 0, res)

reply = () => new Response(JSON.stringify(SAMPLE), { status: 200 })
res = await clarityAction(env, { action: 'token', token: '  ' + TOKEN + '\n' }, NOW)
const last = calls.at(-1)
check('принят — храним токен и сводку', res.ok && kv.m.get('clarity:token').value === TOKEN && res.clarity.live?.m.Traffic[0].n.totalSessionCount === 120, res.error)
check('запрос: Bearer, сутки, без измерений', last.init.headers.Authorization === `Bearer ${TOKEN}` && /numOfDays=1$/.test(last.url) && last.url.startsWith('https://www.clarity.ms/export-data/api/v1/project-live-insights?'), last.url)
check('перенаправлениям не следуем', last.init.redirect === 'manual')
const block = await clarityBlock(env, NOW)
const blockJson = JSON.stringify(block)
check('токен наружу не уходит', !blockJson.includes(TOKEN) && !blockJson.includes(TOKEN.split('.')[1]) && !blockJson.includes('c2lnbmF0dXJl'))
check('админке — хвост, срок, проект', block.token.set && block.token.tail === TOKEN.slice(-4) && block.token.exp === 1830000000000 && block.project === 'z50dung9vo')
check('квота: 1 из 10, днём осталось 7', block.quota.used === 1 && block.quota.limit === DAILY_LIMIT && block.quota.left === 7, block.quota)

// «Обновить» — пока днём есть запас.
for (let i = 0; i < 7; i++) res = await clarityAction(env, { action: 'refresh' }, NOW)
check('обновить — до 8 запросов за день', res.ok && quota() === 8, quota())
const before = calls.length
res = await clarityAction(env, { action: 'refresh' }, NOW)
check('9-й днём — отказ без запроса', res.error === 'quota' && calls.length === before && quota() === 8, res.error)

// Крон днём: только в 06/12/18 МСК и тоже не трогает ночной запас.
await clarityTick(env, Date.UTC(2026, 9, 28, 4, 0))
check('крон в 07 МСК — ничего', calls.length === before)
await clarityTick(env, Date.UTC(2026, 9, 28, 9, 0))
check('крон в 12 МСК при исчерпанном дне — без запроса', calls.length === before)

// Ночной снимок 29.10 00:00 МСК (28.10 21:00 UTC) — два запроса из запаса.
const NIGHT = Date.UTC(2026, 9, 28, 21, 0)
reply = (url) => new Response(JSON.stringify(url.includes('dimension1=OS') ? BY_OS : SAMPLE), { status: 200 })
await clarityNightly(env, NIGHT)
const nb = await clarityBlock(env, NIGHT)
check('ночью — два запроса из запаса', calls.length === before + 2 && quota() === 10, quota())
check('история: сутки 28.10 по МСК', nb.hist.length === 1 && nb.hist[0].d === '2026-10-28' && nb.hist[0].s === 120, nb.hist)
check('разбивка по ОС сохранена', nb.os?.m.DeadClickCount[0].d.OS === 'Android' && nb.os.m.DeadClickCount[0].n.sessionsWithMetricPercentage === 20)
check('запрос по ОС — dimension1=OS', calls.at(-1).url.includes('dimension1=OS'))

// Новые сутки UTC — квота снова есть. 429 от Clarity закрывает сутки.
const NEXT = Date.UTC(2026, 9, 29, 3, 0)
reply = () => new Response('Exceeded daily limit', { status: 429 })
await clarityTick(env, NEXT)
check('429 — сутки закрыты', Number(kv.m.get('clarity:quota:2026-10-29')?.value) === DAILY_LIMIT)
const err429 = await clarityBlock(env, NEXT)
check('ошибка видна админке', err429.err?.status === 429 && err429.token.bad === false)

// Отказ 401 — крон перестаёт тратить запросы, пока не вставят новый токен.
const DAY3 = Date.UTC(2026, 9, 30, 21, 0)
reply = () => new Response('', { status: 401 })
await clarityNightly(env, DAY3)
const n401 = calls.length
await clarityNightly(env, DAY3 + 86_400_000)
await clarityTick(env, Date.UTC(2026, 10, 1, 9, 0))
const b401 = await clarityBlock(env, DAY3)
check('после 401 крон молчит', calls.length === n401 && b401.token.bad === true, calls.length - n401)

// Clarity не ответил при сохранении — токен храним, данные придут по крону.
reply = () => { throw new Error('network') }
const DAY5 = Date.UTC(2026, 10, 2, 9, 0)
res = await clarityAction(env, { action: 'token', token: TOKEN }, DAY5)
check('нет связи — токен сохранён, пометка', res.ok && res.error === 'unreachable' && res.status === 0 && kv.m.has('clarity:token') && res.clarity.token.bad === false, res)
reply = () => new Response(JSON.stringify(SAMPLE), { status: 200 })
res = await clarityAction(env, { action: 'refresh' }, DAY5)
check('удачный запрос снимает ошибку', res.ok && res.clarity.err === null, res.clarity.err)

res = await clarityAction(env, { action: 'forget' }, DAY5)
check('отключить — токена нет, история цела', !kv.m.has('clarity:token') && !res.clarity.token.set && res.clarity.hist.length === 1)
res = await clarityAction(env, { action: 'refresh' }, DAY5)
check('без токена — no_token', res.error === 'no_token')
res = await clarityAction(env, { action: 'что-то' }, DAY5)
check('незнакомое действие', res.ok === false && res.error === 'bad_action')

/* ---------- Быстрый старт ---------- */
const T0 = Date.UTC(2026, 9, 28, 10, 0)
check('шаг не число — не пишем', mergeQs(null, { s: 'x' }, T0) === null && mergeQs(null, { s: 9 }, T0) === null)
let q = mergeQs(null, { s: 0 }, T0)
q = mergeQs(q, { s: 2, e: 1 }, T0 + 1000)
q = mergeQs(q, { s: 1 }, T0 + 2000)
check('назад не откатываемся', q.s === 2 && q.e === 1 && q.t === T0 && q.u === T0 + 2000, q)
q = mergeQs(q, { s: 3, e: 0, i: true }, T0 + 3000)
q = mergeQs(q, { s: 3, x: 3 }, T0 + 4000)
check('доход и выход помним, трат не меньше', q.i === 1 && q.x === 3 && q.e === 1, q)
q = mergeQs(q, { s: 4, d: true, e: 2 }, T0 + 5000)
check('дошёл до конца', q.d === 1 && q.s === 4 && q.e === 2 && q.x === 3)

const rows = [
  { t: T0, u: T0, s: 0 }, // ушёл с приветствия
  { t: T0, u: T0, s: 1, x: 1 }, // закрыл на настройках
  { t: T0, u: T0, s: 3, x: 3 }, // трату пропустил, закрыл на доходе
  { t: T0, u: T0, s: 4, e: 2, d: 1 }, // трата есть, доход пропустил, готово
  { t: T0, u: T0, s: 4, e: 1, i: 1, d: 1, x: 2 }, // закрывал, вернулся и закончил
  { t: T0 - 40 * 86_400_000, u: T0, s: 4, d: 1 }, // старше окна
]
const st = aggregateQs(rows, T0 + 3600_000, 30)
check('начали — в окне', st.started === 5 && st.since === T0 - 40 * 86_400_000, st)
check('дошли по шагам', JSON.stringify(st.reached) === '[5,4,3,3,2]', st.reached)
check('готово, трата, доход', st.done === 2 && st.expense === 2 && st.income === 1)
check('пропустили трату и доход', st.skippedExpense === 1 && st.skippedIncome === 1, st)
check('закрыли и не вернулись', JSON.stringify(st.exits) === '[0,1,0,1,0]', st.exits)

const qkv = new FakeKV()
await trackQuickStart({ REFERRALS: qkv }, 77, { s: 2, e: 1 }, T0)
await trackQuickStart({ REFERRALS: qkv }, 77, { s: 1 }, T0 + 1)
const saved = qkv.m.get('qs:77')
check('qs:<id> — в метаданных и со сроком', saved.metadata.s === 2 && saved.metadata.e === 1 && saved.ttl === 180 * 86_400, saved)
check('плохой шаг — не пишем', (await trackQuickStart({ REFERRALS: qkv }, 78, { s: -1 }, T0)) === false && !qkv.m.has('qs:78'))

if (failed) {
  console.log(`test-clarity: ${failed} из ${total} упали`)
  process.exit(1)
}
console.log(`test-clarity: ${total} проверок — разбор выгрузки, токен, квота, ночной снимок, быстрый старт по шагам`)
