/**
 * Прогон аналитики владельца на синтетической базе.
 *
 * KV подменён картой в памяти — той же формы, что у Cloudflare: значения,
 * метаданные (с круговым JSON, как при настоящей записи) и постраничный list.
 * Время заморожено, поэтому числа детерминированы.
 *
 * Проверяется то, на чём держатся выводы дашборда:
 *   - маска дней: сдвиг, запоздалая отметка, вылет за окно;
 *   - очередь бота копит статистику и не теряет её, когда пустеет;
 *     «Отменить» вычитает запись, подтверждение приложением — нет;
 *   - метка рекламной ссылки ставится один раз (первое касание);
 *   - сбор людей из всех следов, воронка, удержание D1, источники, сводка.
 *
 * Запуск: `node --import ./scripts/ts-resolve.mjs scripts/test-analytics.mjs`
 */
import { markDay, maskDays, mskDay, mskDayStart } from '../src/days.ts'
import { appendInbox, dropBatch, dropFromInbox, readInbox, entryId } from '../src/inbox.ts'
import { campaignTag, rememberSource, startParamOf } from '../src/sources.ts'
import {
  activityStrip,
  assemble,
  collectPeople,
  computeDashboard,
  dayReport,
  digestText,
  snapshotRow,
} from '../src/analytics.ts'

let failed = 0
let passed = 0
function check(name, ok, detail) {
  if (ok) passed++
  else {
    failed++
    console.error('✗ ' + name + (detail !== undefined ? ' — ' + JSON.stringify(detail) : ''))
  }
}
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), { got, want })

/* ---------- Поддельный KV ---------- */
class FakeKV {
  constructor() {
    this.m = new Map()
    this.writes = 0
  }
  async get(k) {
    const v = this.m.get(k)
    return v ? v.value : null
  }
  async getWithMetadata(k) {
    const v = this.m.get(k)
    return v ? { value: v.value, metadata: v.metadata } : { value: null, metadata: null }
  }
  async put(k, value, opts) {
    this.writes++
    // Как в настоящем KV: метаданные проходят через JSON.
    const metadata = opts && opts.metadata !== undefined ? JSON.parse(JSON.stringify(opts.metadata)) : null
    this.m.set(k, { value: String(value), metadata })
  }
  async delete(k) {
    this.writes++
    this.m.delete(k)
  }
  async list({ prefix = '', cursor, limit = 1000 } = {}) {
    const names = [...this.m.keys()].filter((k) => k.startsWith(prefix)).sort()
    const start = cursor ? Number(cursor) : 0
    const page = names.slice(start, start + limit)
    const next = start + limit
    return {
      keys: page.map((name) => ({ name, metadata: this.m.get(name).metadata ?? undefined })),
      list_complete: next >= names.length,
      cursor: String(next),
    }
  }
}

/* ---------- Время ---------- */
// 7 октября 2026, 15:30 МСК.
const NOW = Date.parse('2026-10-07T12:30:00.000Z')
const realNow = Date.now
Date.now = () => NOW
const TODAY = mskDay(NOW)
const at = (dayOffset, hourMsk = 12) => mskDayStart(TODAY + dayOffset) + hourMsk * 3_600_000

/* ---------- Маска дней ---------- */
{
  const a = markDay(undefined, 100)
  eq('маска: первая отметка', a, { m: '1', d: 100 })
  const b = markDay(a, 101)
  eq('маска: следующий день сдвигает окно', b, { m: '3', d: 101 })
  eq('маска: тот же день не меняет маску', markDay(b, 101), b)
  const c = markDay(b, 99)
  eq('маска: запоздалая отметка внутри окна', c, { m: '7', d: 101 })
  eq('маска: дни по возрастанию', maskDays(c), [99, 100, 101])
  eq('маска: пропуск дней', maskDays(markDay(markDay(undefined, 10), 13)), [10, 13])
  eq('маска: день за окном не ломает маску', markDay(b, 101 - 64), b)
  eq('маска: прыжок больше окна начинает заново', markDay(b, 101 + 64), { m: '1', d: 165 })
  eq('маска: битая строка не роняет разбор', maskDays({ m: 'zz', d: 5 }), [])
}

/* ---------- Метки ссылок ---------- */
{
  eq('метка: обычная', campaignTag('Ads_Oct'), 'ads_oct')
  eq('метка: приглашение не метка', campaignTag('ref123'), null)
  eq('метка: мусор отсекается', campaignTag('a b'), null)
  eq('метка: слишком длинная', campaignTag('x'.repeat(33)), null)
  eq('метка: start_param из initData', startParamOf('auth_date=1&start_param=ads1&hash=x'), 'ads1')
  eq('метка: нет start_param', startParamOf('auth_date=1&hash=x'), null)
}

/* ---------- Очередь бота и метки на поддельном KV ---------- */
const kv = new FakeKV()
const env = { REFERRALS: kv, OWNER_CHAT_ID: '1', BOT_TOKEN: 'x' }
{
  const e = (batch, i) => ({ id: entryId(batch, i), type: 'expense', amount: 300, categoryId: 'cafe', date: new Date(NOW).toISOString() })
  await appendInbox(env, 301, [e('b1', 0), e('b1', 1)])
  let box = await readInbox(env, 301)
  eq('бот: счётчик после записи', box.meta.n, 2)
  eq('бот: первая и последняя запись', [box.meta.f, box.meta.l], [NOW, NOW])
  eq('бот: день отмечен в маске', maskDays({ m: box.meta.m, d: box.meta.d }), [TODAY])

  await dropBatch(env, 301, 'b1')
  box = await readInbox(env, 301)
  eq('бот: «Отменить» вычитает записи', box.meta.n, 0)
  check('бот: опустевшая очередь со статистикой не удаляется', kv.m.has('inbox:301'))

  await appendInbox(env, 301, [e('b2', 0)])
  await dropFromInbox(env, 301, [entryId('b2', 0)])
  box = await readInbox(env, 301)
  eq('бот: слив в приложение не вычитает', box.meta.n, 1)
  eq('бот: очередь пуста после слива', box.items.length, 0)

  // Ключ, записанный до появления статистики, по-прежнему удаляется целиком.
  await kv.put('inbox:302', JSON.stringify({ items: [e('b3', 0)], updatedAt: 1 }))
  await dropFromInbox(env, 302, [entryId('b3', 0)])
  check('бот: старый ключ без статистики удаляется', !kv.m.has('inbox:302'))

  await rememberSource(env, { id: 303, first_name: 'Аня', username: 'anya' }, 'ads1', at(0, 10))
  await rememberSource(env, { id: 303, first_name: 'Аня' }, 'ads2', at(0, 11))
  const src = await kv.getWithMetadata('src:303')
  eq('метка: запоминается первое касание', src.metadata.s, 'ads1')
  eq('метка: имя для дашборда', [src.metadata.n, src.metadata.u], ['Аня', 'anya'])
}

/* ---------- Синтетическая база ---------- */
const mask = (...offsets) => {
  let m
  for (const o of [...offsets].sort((a, b) => a - b)) m = markDay(m, TODAY + o)
  return m
}
const lbEntry = (id, name, firstSeen, extra = {}) => ({
  id,
  name,
  xp: 100,
  level: 2,
  ops: 0,
  coins: 10,
  streakBest: 1,
  refs: 0,
  at: firstSeen,
  firstSeen,
  ...extra,
})

// A — старожил: пришёл 60 дней назад, после выката заходил позавчера и сегодня.
const mA = mask(-2, 0)
const lb = {
  101: lbEntry(101, 'Старожил', at(-60), { at: at(0, 9), vm: mA.m, vd: mA.d, ops: 40 }),
  // B — сегодня по рекламе, в приложении, но ничего не записал.
  102: lbEntry(102, 'Новичок', at(0, 11), { src: 'ads1', vm: mask(0).m, vd: mask(0).d }),
  // E — по приглашению 3 дня назад, вернулся на следующий день.
  105: lbEntry(105, 'Друг', at(-3, 14), { at: at(-2, 9), vm: mask(-3, -2).m, vd: mask(-3, -2).d, ops: 6 }),
  // F — 2 дня назад, больше не возвращался.
  106: lbEntry(106, 'Разовый', at(-2, 15), { vm: mask(-2).m, vd: mask(-2).d, ops: 1 }),
  // G — заблокировал бота, давно не заходил.
  107: lbEntry(107, 'Ушедший', at(-40), { at: at(-35) }),
}
const data = [
  ['101', { updatedAt: at(0, 9), firstSeen: at(-60), c: { ops: 40, lt: Math.floor(at(0, 9) / 86400000), dd: 25, ev: { a: 3 } } }],
  ['105', { updatedAt: at(-2, 9), firstSeen: at(-3, 14), c: { ops: 6, lt: Math.floor(at(-2, 9) / 86400000), dd: 2, bud: 1 } }],
  ['106', { updatedAt: at(-2, 15), firstSeen: at(-2, 15), c: { ops: 1, lt: Math.floor(at(-2, 15) / 86400000), dd: 1 } }],
]
// C — только бот: нажал «Старт» по рекламе вчера, писал вчера и сегодня.
const mC = mask(-1, 0)
const inbox = [
  ['104', { n: 3, f: at(-1, 10), l: at(0, 9), m: mC.m, d: mC.d }],
  ['108', null], // старый ключ без статистики — не человек для аналитики
]
const srcs = [
  ['104', { s: 'ads1', at: at(-1, 10), n: 'Бот-юзер' }],
  // D — нажал «Старт» по рекламе сегодня и больше ничего.
  ['109', { s: 'ads1', at: at(0, 13), n: 'Только старт', u: 'onlystart' }],
]
const c = assemble(data, lb, inbox, srcs, ['105'], ['107'])

{
  const ids = c.people.map((p) => p.id).sort()
  eq('сбор: все люди из всех следов', ids, ['101', '102', '104', '105', '106', '107', '109'])
  eq('сбор: начало масок — самый ранний отмеченный день', c.trackFrom, TODAY - 3)
  const byId = Object.fromEntries(c.people.map((p) => [p.id, p]))
  eq('сбор: бот-пользователь не в приложении', [byId['104'].inApp, byId['104'].botOps, byId['104'].src], [false, 3, 'ads1'])
  eq('сбор: имя из метки, когда рейтинга нет', [byId['109'].name, byId['109'].username], ['Только старт', 'onlystart'])
  eq('сбор: приглашённый и заблокированный', [byId['105'].fromRef, byId['107'].blocked], [true, true])
  check('сбор: день «Старта» считается днём активности', byId['109'].days.includes(TODAY), byId['109'].days)
  eq('сбор: последняя запись бота', byId['104'].lastWrite, at(0, 9))
}

const dash = computeDashboard(c, [], NOW, { registered: true, pending: 0, ok: true })
{
  const k = dash.kpi
  eq('итог: всего людей', k.total, 7)
  eq('итог: в приложении', k.inApp, 5)
  eq('итог: новых сегодня (B и D)', k.newToday, 2)
  eq('итог: записали хоть раз (A, C, E, F)', k.withOps, 4)
  eq('итог: источники разбиты без пересечений', [k.campaign, k.fromRef, k.organic], [3, 1, 3])
  eq('итог: сегодня заходили — новые и вернувшиеся', [k.dau, k.dauNew, k.dauBack], [4, 2, 2])
  eq('итог: писали за неделю (A, C, E, F)', k.writers7, 4)

  const f = dash.funnels.all.all
  // Записали: A, C, E, F. Вернулись: A, C, E (F — нет). 5+ операций: A и E
  // (у бот-пользователя C только три). Пишут за неделю: оба.
  eq('воронка: пришли → записали → вернулись → 5+ → пишут', f.steps, [7, 4, 3, 2, 2])
  eq('воронка: сегодняшние', dash.funnels.all['1'].steps, [2, 0, 0, 0, 0])
  const ads = dash.funnels['src:ads1'].all
  eq('воронка по рекламе', ads.steps, [3, 1, 1, 0, 0])
  eq('воронка по рекламе: в приложении и в боте', [ads.app, ads.bot], [1, 1])

  const src = dash.sources.find((s) => s.key === 'src:ads1')
  eq('источник: улов рекламы', [src.n, src.app, src.act, src.bot], [3, 1, 1, 1])

  const daily = dash.retention.all.daily
  const rowE = daily.find((r) => r.date === new Date(mskDayStart(TODAY - 3) + 3 * 3600000).toISOString().slice(0, 10))
  eq('удержание: когорта E — D1 вернулся', rowE.cells[0], [1, 1])
  const rowF = daily.find((r) => r.size === 1 && r.cells[0] && r.cells[0][1] === 0)
  check('удержание: когорта F — D1 не вернулся', !!rowF, daily)
  check('удержание: сегодняшняя когорта без ячеек', daily[0].cells.every((x) => x === null), daily[0])
  // В расчёт идут когорты, у которых первый день после прихода уже прожит:
  // E (вернулся) и F (нет). Вчерашний C ещё не может вернуться «на следующий день».
  eq('удержание: D1 для верхней карточки', dash.kpi.d1, { base: 2, n: 1 })

  eq('бот: пользователи, только бот, только старт', [dash.bot.users, dash.bot.onlyBot, dash.bot.startOnly], [1, 1, 1])
  eq('сегодня: приток по часам', dash.today.hours.reduce((a, b) => a + b, 0), 2)
  eq('сегодня: записали и пишут боту — по всем, не по списку', [dash.today.act, dash.today.bot], [0, 0])
  eq('сегодня: список новичков свежими сверху', dash.today.newcomers.map((x) => x.i), ['109', '102'])
  check('люди: строки для списка', dash.people.length === 7 && dash.people[0].i, dash.people[0])
  check('выводы: есть хотя бы один', Array.isArray(dash.insights), dash.insights)
}

{
  const r = dayReport(c, TODAY - 1, NOW)
  eq('сводка: вчерашний приток — бот-пользователь', [r.fresh, r.freshAct, r.freshBot], [1, 1, 1])
  check('сводка: вчера не частичный день', r.partial === false)
  const text = digestText(r)
  check('сводка: текст с заголовком и цифрами', text.includes('Кошель · 6 октября') && text.includes('Новых: <b>1</b>'), text)
  const today = dayReport(c, TODAY, NOW)
  check('сводка: сегодня помечено «на сейчас»', digestText(today).includes('на сейчас'))
  const row = snapshotRow(c, TODAY - 1, NOW)
  eq('снимок: вчера', [row.new, row.newAct, row.total], [1, 1, 5])
}

{
  const e = c.people.find((p) => p.id === '105')
  const strip = activityStrip(e, c.trackFrom, TODAY, 7)
  // Дни −6…0: до прихода (−3) — неизвестно, потом −3 и −2 был, −1 и сегодня — нет.
  eq('полоса активности: до прихода — пусто, потом дни', strip, [null, null, null, 1, 1, 0, 0])
}

/* ---------- Сбор через KV целиком ---------- */
{
  const kv2 = new FakeKV()
  for (const [id, meta] of data) await kv2.put('data:' + id, '{}', { metadata: meta })
  for (const [id, meta] of inbox) await kv2.put('inbox:' + id, '{"items":[]}', meta ? { metadata: meta } : undefined)
  for (const [id, meta] of srcs) await kv2.put('src:' + id, meta.s, { metadata: meta })
  await kv2.put('claimed:105', '1')
  await kv2.put('blocked:107', '1')
  const got = await collectPeople({ REFERRALS: kv2 }, Promise.resolve(lb))
  eq('KV: тот же результат, что и чистая сборка', got.people.map((p) => p.id), c.people.map((p) => p.id))
  eq('KV: сбор ничего не записывает', kv2.writes, data.length + inbox.length + srcs.length + 2)
}

Date.now = realNow
if (failed) {
  console.error(`test-analytics: ${failed} провалено, ${passed} прошло`)
  process.exit(1)
}
console.log(`test-analytics: ${passed} проверок — маски, бот, метки, люди, воронка, удержание, сводка`)
