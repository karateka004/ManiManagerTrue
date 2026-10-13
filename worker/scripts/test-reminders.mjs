/**
 * Напоминания и их выключение — на поддельном KV и поддельном Telegram.
 *
 * Проверяется то, за что человек благодарит или блокирует бота:
 *   - кому напоминаем: был сегодня в приложении или писал боту — нет;
 *     пишет только боту — да; молчит — каждый вечер первые три дня, потом
 *     всё реже, после 30-го дня — тишина; пропавшим — другие тексты;
 *   - выбор человека: '0' и 'b' — не пишем, '1' важнее тумблера в приложении;
 *   - 403 — автоматическая отписка 'b', а вернулся — она снимается;
 *   - кнопки и команда: «Не напоминать» под напоминанием, /reminders, экран в
 *     знакомстве; профиль бота укладывается в лимиты Telegram.
 *
 * Запуск: `node --import ./scripts/ts-resolve.mjs scripts/test-reminders.mjs`
 */
import {
  COMEBACK_TEXTS,
  REMINDER_TEXTS,
  REM_SLOTS,
  REM_WINDOW_START_UTC,
  dueAfterQuiet,
  forgetBlock,
  pickReminderText,
  remindersEnabled,
  runDailyReminders,
  slotForId,
} from '../src/reminders.ts'
import {
  BOT_COMMANDS,
  BOT_DESCRIPTION,
  BOT_SHORT_DESCRIPTION,
  START,
  START_MORE,
  botProfileFingerprint,
  ensureBotProfile,
  handleTgUpdate,
} from '../src/bot.ts'

let failed = 0
let passed = 0
function check(name, ok, detail) {
  if (ok) passed++
  else {
    failed++
    console.error('✗ ' + name + (detail !== undefined ? ' — ' + JSON.stringify(detail) : ''))
  }
}

/* ---------- Поддельный KV (как в test-analytics) ---------- */
class FakeKV {
  constructor() {
    this.m = new Map()
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
    const metadata = opts && opts.metadata !== undefined ? JSON.parse(JSON.stringify(opts.metadata)) : null
    this.m.set(k, { value: String(value), metadata })
  }
  async delete(k) {
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

/* ---------- Поддельный Telegram ---------- */
let calls = []
let blockedIds = new Set()
globalThis.fetch = async (url, init) => {
  const method = String(url).split('/').pop()
  const body = init?.body ? JSON.parse(init.body) : {}
  calls.push({ method, body })
  if (method === 'sendMessage' && blockedIds.has(String(body.chat_id))) {
    return new Response(JSON.stringify({ ok: false, description: 'Forbidden: bot was blocked by the user' }), { status: 403 })
  }
  return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 })
}
const sent = () => calls.filter((c) => c.method === 'sendMessage')

/* ---------- Время ---------- */
// 7 октября 2026. Крон бьёт в начале часа окна; день МСК — 7 октября.
const DAY = 86_400_000
const dayStartMsk = Date.parse('2026-10-07T00:00:00+03:00')
const at = (daysAgo, hourMsk = 12) => dayStartMsk - daysAgo * DAY + hourMsk * 3_600_000

/** id, попадающий в нужный час окна: подбираем перебором. */
function idsForSlot(slot, count, from = 1000) {
  const out = []
  for (let n = from; out.length < count; n++) if (slotForId(String(n), REM_SLOTS) === slot) out.push(String(n))
  return out
}

const SLOT = 2
const cronAt = Date.UTC(2026, 9, 7, REM_WINDOW_START_UTC + SLOT, 0, 0)
const env = (kv) => ({ BOT_TOKEN: 'x', OWNER_CHAT_ID: '1', REMINDERS_MODE: 'all', REFERRALS: kv })

/* ---------- Кому напоминаем ---------- */
{
  const kv = new FakeKV()
  const [appToday, appYesterday, botToday, botOnly, quiet4, quiet5, quiet31, off, blockedAuto, onOverRm, rmOff, noStamp, sends403] =
    idsForSlot(SLOT, 13)
  const putData = (id, updatedAt, c) => kv.put(`data:${id}`, '{}', { metadata: { ...(updatedAt ? { updatedAt } : {}), ...(c ? { c } : {}) } })
  const putInbox = (id, l) => kv.put(`inbox:${id}`, '{"items":[]}', { metadata: { n: 3, f: l - DAY, l } })

  await putData(appToday, at(0, 9))
  await putData(appYesterday, at(1))
  await putData(botToday, at(6))
  await putInbox(botToday, at(0, 10))
  await putInbox(botOnly, at(2))
  await putData(quiet4, at(4))
  await putData(quiet5, at(5))
  await putData(quiet31, at(31))
  await putData(off, at(1))
  await kv.put(`remind:${off}`, '0')
  await putData(blockedAuto, at(1))
  await kv.put(`remind:${blockedAuto}`, 'b')
  await putData(onOverRm, at(1), { rm: 0 })
  await kv.put(`remind:${onOverRm}`, '1')
  await putData(rmOff, at(1), { rm: 0 })
  await putData(noStamp, 0)
  await putData(sends403, at(2))
  // Чужой час окна — не трогаем, даже если молчит.
  const [otherSlot] = idsForSlot(SLOT + 1, 1)
  await putData(otherSlot, at(1))

  calls = []
  blockedIds = new Set([sends403])
  await runDailyReminders(env(kv), cronAt)
  const to = new Set(sent().map((c) => String(c.body.chat_id)))

  check('был в приложении сегодня — не напоминаем', !to.has(appToday))
  check('вчера был — напоминаем', to.has(appYesterday))
  check('сегодня писал боту — не напоминаем, хотя приложение давно не открывал', !to.has(botToday))
  check('пишет только боту — напоминаем', to.has(botOnly))
  check('молчит 4 дня — пропускаем (реже)', !to.has(quiet4))
  check('молчит 5 дней — напоминаем', to.has(quiet5))
  check('молчит больше месяца — тишина', !to.has(quiet31))
  check('выключил сам — не пишем', !to.has(off))
  check('заблокировал бота — не пишем', !to.has(blockedAuto))
  check('включил в боте после тумблера в приложении — пишем', to.has(onOverRm))
  check('тумблер в приложении выключен, выбора на сервере нет — не пишем', !to.has(rmOff))
  check('без метки времени (давно не появлялся) — не тревожим', !to.has(noStamp))
  check('чужой час окна — не трогаем', !to.has(otherSlot))

  const msg = sent().find((c) => String(c.body.chat_id) === appYesterday)
  check('ежедневный текст из ротации', REMINDER_TEXTS.includes(msg?.body.text), msg?.body.text)
  check('под напоминанием — кнопка «Не напоминать»', msg?.body.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data === 'r:0:n')
  const comeback = sent().find((c) => String(c.body.chat_id) === quiet5)
  check('пропавшему — текст-возвращалка', COMEBACK_TEXTS.includes(comeback?.body.text), comeback?.body.text)

  check('403 — автоматическая отписка «b»', (await kv.get(`remind:${sends403}`)) === 'b')
  check('403 — метка «заблокировал» для аналитики', (await kv.get(`blocked:${sends403}`)) === '1')
}

/* ---------- Расписание затухания ---------- */
{
  const due = Array.from({ length: 35 }, (_, i) => i).filter(dueAfterQuiet)
  check('дни напоминаний: 1–3, 5, 7, 10, 14, 21, 30', JSON.stringify(due) === JSON.stringify([1, 2, 3, 5, 7, 10, 14, 21, 30]), due)
  check('ротация: тот же день — тот же текст', pickReminderText(cronAt) === pickReminderText(cronAt + 3_600_000))
  check('ротация: следующий день — другой текст', pickReminderText(cronAt) !== pickReminderText(cronAt + DAY))
  check('тексты напоминаний ≤ 160 символов', [...REMINDER_TEXTS, ...COMEBACK_TEXTS].every((t) => t.length <= 160))
}

/* ---------- Выбор: чтение и возврат после блокировки ---------- */
{
  const kv = new FakeKV()
  const e = env(kv)
  check('ничего не выбирал — включено', (await remindersEnabled(e, 501)) === true)
  await kv.put('data:501', '{}', { metadata: { updatedAt: at(1), c: { rm: 0 } } })
  // Ключ с тем же началом не должен сбивать поиск своей карточки.
  await kv.put('data:5010', '{}', { metadata: { updatedAt: at(1) } })
  check('выключил тумблером в приложении — выключено', (await remindersEnabled(e, 501)) === false)
  check('чужая карточка с похожим id не влияет', (await remindersEnabled(e, 50)) === true)
  await kv.put('remind:501', '1')
  check('выбор на сервере важнее карточки', (await remindersEnabled(e, 501)) === true)

  await kv.put('remind:777', '0')
  await kv.put('blocked:777', '1')
  await forgetBlock(e, 777)
  check('вернулся после блокировки (старая отписка «0») — отписка снята', (await kv.get('remind:777')) === null)
  check('вернулся — метка «заблокировал» снята', (await kv.get('blocked:777')) === null)

  await kv.put('remind:778', '0')
  await forgetBlock(e, 778)
  check('выключил сам — возвращение не включает', (await kv.get('remind:778')) === '0')

  await kv.put('remind:779', 'b')
  await forgetBlock(e, 779)
  check('автоматическая отписка «b» снимается', (await kv.get('remind:779')) === null)
}

/* ---------- Кнопки и команды в чате ---------- */
{
  const kv = new FakeKV()
  const e = env(kv)
  const from = { id: 4242, is_bot: false, first_name: 'Тест' }
  const chat = { id: 4242, type: 'private' }
  const message = (text) => ({ update_id: 1, message: { message_id: 10, from, chat, date: 0, text } })
  const press = (data) => ({
    update_id: 2,
    callback_query: { id: 'cb', from, data, message: { message_id: 11, chat, date: 0, text: 'x' } },
  })
  const last = (method) => calls.filter((c) => c.method === method).at(-1)

  calls = []
  await kv.put('remind:4242', 'b')
  await kv.put('blocked:4242', '1')
  await handleTgUpdate(message('/start'), e)
  check('/start — приветствие', last('sendMessage')?.body.text === START)
  const kb = last('sendMessage')?.body.reply_markup?.inline_keyboard ?? []
  check('/start — один ряд: приложение и «Что ещё умею»', kb.length === 1 && !!kb[0]?.[0]?.web_app && kb[0]?.[1]?.callback_data === 'm:more', kb)
  check('/start — вернувшемуся снята отписка', (await kv.get('remind:4242')) === null)
  check('/start — и метка «заблокировал»', (await kv.get('blocked:4242')) === null)

  calls = []
  await handleTgUpdate(press('m:more'), e)
  const more = last('editMessageText')?.body
  check('«Что ещё умею» перерисовывает карточку', more?.text === START_MORE)
  check('в «Что ещё умею» — приложение и «Назад» одним рядом', more?.reply_markup?.inline_keyboard?.[0]?.[1]?.callback_data === 'm:0')
  check('в «Что ещё умею» сказано про /reminders и Gemini', /\/reminders/.test(START_MORE) && /Gemini/.test(START_MORE))

  calls = []
  await handleTgUpdate(press('m:0'), e)
  check('«Назад» возвращает приветствие', last('editMessageText')?.body.text === START)

  calls = []
  await handleTgUpdate(message('/reminders'), e)
  const on = last('sendMessage')?.body
  check('/reminders — «включены» по умолчанию', /включены/i.test(on?.text ?? ''), on?.text)
  check('/reminders — кнопка «Выключить»', on?.reply_markup?.inline_keyboard?.flat().map((b) => b.callback_data).join() === 'r:0:c')

  calls = []
  await handleTgUpdate(press('r:0:c'), e)
  check('выключил командой — записано «0»', (await kv.get('remind:4242')) === '0')
  const off = last('editMessageText')?.body
  check('экран перерисован в «выключены» с кнопкой «Включить»', /выключены/i.test(off?.text ?? '') && off?.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data === 'r:1:c')

  calls = []
  await handleTgUpdate(press('r:1:c'), e)
  check('включил командой — записано «1»', (await kv.get('remind:4242')) === '1')

  calls = []
  await handleTgUpdate(press('r:0:n'), e)
  const done = last('editMessageText')?.body
  check('«Не напоминать» под напоминанием — записано «0»', (await kv.get('remind:4242')) === '0')
  check('напоминание стало подтверждением с кнопкой «Включить снова»', done?.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data === 'r:1:n')

  calls = []
  await handleTgUpdate(press('r:1:n'), e)
  const again = last('editMessageText')?.body
  check('«Включить снова» — записано «1»', (await kv.get('remind:4242')) === '1')
  check('…и на месте снова «Не напоминать»', again?.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data === 'r:0:n')

  calls = []
  await handleTgUpdate(press('m:q'), e)
  check('кнопка из старого знакомства («Что можно спросить») не сломана', last('editMessageText')?.body.text === START_MORE)

  calls = []
  await handleTgUpdate(press('r:1:zz'), e)
  check('чужой хвост колбэка не ломает бота — экран команды', /включены/i.test(last('editMessageText')?.body.text ?? ''))
}

/* ---------- Профиль бота ---------- */
{
  check('описание бота ≤ 512', BOT_DESCRIPTION.length <= 512, BOT_DESCRIPTION.length)
  check('короткое описание ≤ 120', BOT_SHORT_DESCRIPTION.length <= 120, BOT_SHORT_DESCRIPTION.length)
  check(
    'команды: имена и описания в лимитах Telegram',
    BOT_COMMANDS.every((c) => /^[a-z0-9_]{1,32}$/.test(c.command) && c.description.length >= 1 && c.description.length <= 256),
  )
  check('приветствие помещается в сообщение', START.length < 4096 && START_MORE.length < 4096)

  const kv = new FakeKV()
  calls = []
  check('профиль выставляется', (await ensureBotProfile(env(kv))) === true)
  check('выставлены описание, короткое описание и команды', ['setMyDescription', 'setMyShortDescription', 'setMyCommands'].every((m) => calls.some((c) => c.method === m)))
  calls = []
  await ensureBotProfile(env(kv))
  check('тот же отпечаток — второй раз Telegram не дёргаем', calls.length === 0, calls.map((c) => c.method))
  check('отпечаток стабилен', botProfileFingerprint() === botProfileFingerprint())
}

if (failed) {
  console.error(`\ntest-reminders: ${failed} из ${passed + failed} проверок не прошли`)
  process.exit(1)
}
console.log(`test-reminders: ${passed} проверок — кому и когда напоминать, выключение в чате, профиль бота`)
