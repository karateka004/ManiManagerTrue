/**
 * Ответы на вопросы (ИИ 2.0) — без сети: поддельные Gemini, Telegram и KV.
 *
 * Проверяется то, из-за чего бот раньше «отвечал как тупой»:
 *   - вопрос узнаётся по-русски (раньше `\b` не видел кириллицу, и «сколько я
 *     потратил» вопросом не считался), запись вопросом не становится;
 *   - тема без модели определяется, и правила отвечают на неё карточкой, а не
 *     «Не нашёл сумму»;
 *   - выдуманная моделью сумма до человека не доходит (ground), а суммы из
 *     выжимки и из вопроса — доходят;
 *   - карточка оформлена как в примере владельца и экранирована;
 *   - сквозные сценарии бота: вопрос → «Думает…» → карточка с продолжениями →
 *     память; кнопка-продолжение с вопросом в шапке; запись с явной валютой
 *     счёта; «Не та категория» в пачке из двух трат; иконки владельца и откат,
 *     если Telegram их не принял; приложение (/ask) и его «похоже на запись».
 *
 * Запуск: `node --import ./scripts/ts-resolve.mjs scripts/test-answer.mjs`
 */
import {
  cardToText,
  cleanHistory,
  ground,
  looksLikeQuestion,
  normalizeCard,
  parseAmount,
  questionLang,
  renderTelegram,
  rulesCard,
  topicOf,
} from '../src/answer.ts'
import { buildFacts } from '../src/facts.ts'
import { loadContext } from '../src/context.ts'
import { answerQuestion, handleTgUpdate } from '../src/bot.ts'

let failed = 0
let passed = 0
function check(name, ok, detail) {
  if (ok) passed++
  else {
    failed++
    console.error('✗ ' + name + (detail !== undefined ? ' — ' + JSON.stringify(detail) : ''))
  }
}
const norm = (s) => String(s).replace(/[   ]/g, ' ')

/* ------------------------------------------------------------------ */
/* Вопрос или запись                                                   */
/* ------------------------------------------------------------------ */

for (const q of [
  'сколько я потратил сегодня',
  'Сколько осталось',
  'как у меня с деньгами',
  'на что ушло больше всего',
  'Почему расходы выросли',
  'привет',
  'Спасибо',
  'what did I spend this week',
  'кофе 300?',
  'покажи итоги месяца',
]) {
  check(`вопрос: «${q}»`, looksLikeQuestion(q) === true)
}
for (const r of ['кофе 300', 'что-то 300', 'такси 450 и обед 380', 'вчера продукты 1200', '+50000 зарплата', 'какао 200', 'гдешник 50']) {
  check(`не вопрос: «${r}»`, looksLikeQuestion(r) === false)
}

/* ------------------------------------------------------------------ */
/* Тема                                                                */
/* ------------------------------------------------------------------ */

const TOPICS = [
  ['сколько я потратил сегодня?', 'today'],
  ['сколько осталось на сегодня?', 'budget'],
  ['могу ли я купить кроссовки?', 'budget'],
  ['а в прошлом месяце?', 'prev_month'],
  ['на что уходит больше всего?', 'categories'],
  ['как у меня с деньгами?', 'month'],
  ['Как у меня сейчас с финансами?', 'month'],
  ['Почему изменились расходы?', 'month'],
  ['когда накоплю на отпуск?', 'goals'],
  ['привет', 'greeting'],
  ['Добрый вечер', 'greeting'],
  ['спасибо!', 'thanks'],
  ['как поставить бюджет?', 'help'],
  ['что ты умеешь?', 'help'],
  ['вчера сколько ушло', 'yesterday'],
  ['сколько я заработал в этом месяце', 'income'],
  ['а за неделю?', 'week'],
  ['ааа', 'unknown'],
  ['how much did I spend this week', 'week'],
  ['hi', 'greeting'],
]
for (const [q, want] of TOPICS) {
  const got = topicOf(q)
  check(`тема «${q}» → ${want}`, got === want, got)
}

check('язык по буквам: кириллица', questionLang('сколько?', 'en') === 'ru')
check('язык по буквам: латиница', questionLang('how much?', 'ru') === 'en')
check('язык без букв — язык приложения', questionLang('???', 'en') === 'en')

/* ------------------------------------------------------------------ */
/* Числа                                                               */
/* ------------------------------------------------------------------ */

const AMOUNTS = [
  ['13 357', 13357],
  ['13.357', 13357],
  ['13,357', 13357],
  ['12,50', 12.5],
  ['1.234,56', 1234.56],
  ['1,234.56', 1234.56],
  ['1 234,5', 1234.5],
  ['300', 300],
]
for (const [s, want] of AMOUNTS) check(`сумма «${s}» → ${want}`, parseAmount(s) === want, parseAmount(s))

const FACTS = { text: '', numbers: new Set([4200, 900, 12202, 3000]), percents: new Set([34, 4]) }
const baseCard = (over = {}) => ({
  title: 'Расходы за октябрь',
  lead: 'Потрачено 4 200 ₴. Это на 1 300 ₴ больше обычного.',
  sections: [
    {
      heading: 'По категориям',
      icon: 'category',
      rows: [
        { label: 'Кафе', value: '4 200 ₴ (34%)' },
        { label: 'Еда', value: '999 ₴' },
        { label: 'Доля', value: '77%' },
      ],
    },
  ],
  tip: 'Урежь кафе на 1 300 ₴.',
  followups: ['А в прошлом месяце?'],
  source: 'model',
  ...over,
})
{
  const g = ground(baseCard(), FACTS, 'сколько я потратил?')
  check('ground: предложение с выдуманной суммой убрано из сути', g && norm(g.lead) === 'Потрачено 4 200 ₴.', g?.lead)
  check('ground: строка с суммой и процентом из выжимки осталась', g?.sections[0].rows.some((r) => r.label === 'Кафе'))
  check('ground: строка с выдуманной суммой выпала', !g?.sections[0].rows.some((r) => r.label === 'Еда'))
  check('ground: строка с выдуманным процентом выпала', !g?.sections[0].rows.some((r) => r.label === 'Доля'))
  check('ground: совет с выдуманной суммой выпал', g?.tip === undefined, g?.tip)
}
{
  const card = baseCard({ lead: 'Кроссовки за 3 500 ₴ сегодня не влезают.', sections: [], tip: '' })
  check('ground: сумма из вопроса разрешена', ground(card, FACTS, 'могу ли купить кроссовки за 3500?')?.lead.includes('3 500'))
  check('ground: «3,5к» в вопросе — это 3 500', ground(card, FACTS, 'потяну кроссовки за 3,5к?')?.lead.includes('3 500'))
  check('ground: без числа в вопросе — выпадает', ground(card, FACTS, 'могу ли купить кроссовки?') === null)
}
check(
  'ground: даты и счётчики без значка валюты не трогаем',
  ground(baseCard({ lead: 'Самый затратный день — 12 октября, записей 13.', sections: [] }), FACTS, 'когда?')?.lead.includes('12 октября'),
)
check(
  'ground: «2 Lego» не сумма в «L»',
  ground(baseCard({ lead: 'Купи 2 Lego.', sections: [] }), FACTS, '?')?.lead === 'Купи 2 Lego.',
)

/* ------------------------------------------------------------------ */
/* Нормализация ответа модели                                          */
/* ------------------------------------------------------------------ */

check('normalize: мусор — null', normalizeCard('строка') === null && normalizeCard(null) === null && normalizeCard({}) === null)
{
  const c = normalizeCard({
    title: '**Итоги**',
    lead: 'Потрачено `4 200 ₴`.',
    sections: [
      { heading: 'Раздел', icon: 'bomb', rows: [{ label: '• Кафе:', value: '4 200 ₴' }, { label: '', value: 'x' }] },
      { heading: '', rows: [{ label: 'a', value: 'b' }] },
    ],
    followups: ['А в прошлом месяце?', 'А в прошлом месяце?', 'ок', 42],
  })
  check('normalize: markdown снят', c?.title === 'Итоги' && norm(c?.lead) === 'Потрачено 4 200 ₴.', c)
  check('normalize: пробелы внутри суммы и перед знаком — неразрывные', c?.lead === 'Потрачено 4\u00a0200\u00a0₴.', c?.lead)
  check('normalize: чужая иконка отброшена, маркер и двоеточие у подписи сняты', c?.sections[0].icon === undefined && c?.sections[0].rows[0].label === 'Кафе', c?.sections)
  check('normalize: пустые строки и разделы без заголовка выброшены', c?.sections.length === 1 && c?.sections[0].rows.length === 1)
  check('normalize: продолжения без повторов и коротышей', JSON.stringify(c?.followups) === JSON.stringify(['А в прошлом месяце?']), c?.followups)
}

/* ------------------------------------------------------------------ */
/* Выжимка: на то, что спрашивают про цели, есть готовые числа         */
/* ------------------------------------------------------------------ */

const NOW = Date.UTC(2026, 9, 13, 12, 0) // 13 октября 2026, 15:00 МСК
const DAY = 86_400_000

function blobFor(state) {
  return JSON.stringify({ blob: JSON.stringify({ state, version: 17 }) })
}

/** Детерминированная история: 4 месяца трат, зарплата 5-го числа. */
function history(days = 120) {
  const txs = []
  const cats = ['food', 'cafe', 'transport', 'fun']
  for (let d = 0; d < days; d++) {
    const t = new Date(NOW - d * DAY)
    txs.push({ id: `t${d}`, type: 'expense', amount: 200 + (d % 4) * 100, categoryId: cats[d % 4], date: t.toISOString() })
    if (t.getUTCDate() === 5) txs.push({ id: `s${d}`, type: 'income', amount: 40000, categoryId: 'salary', date: t.toISOString() })
  }
  return txs
}

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
  async list({ prefix = '', limit = 1000 } = {}) {
    const names = [...this.m.keys()].filter((k) => k.startsWith(prefix)).sort().slice(0, limit)
    return { keys: names.map((name) => ({ name, metadata: this.m.get(name).metadata ?? undefined })), list_complete: true }
  }
}

{
  const kv = new FakeKV()
  await kv.put(
    'data:7',
    blobFor({
      currency: 'UAH',
      monthlyBudget: 30000,
      transactions: history(),
      goals: [{ id: 'g', title: 'Отпуск', target: 60000, saved: 21000 }],
      budgets: { cafe: 4000 },
    }),
  )
  const ctx = await loadContext({ REFERRALS: kv }, 7, NOW)
  const f = buildFacts(ctx, NOW, 'ru')
  check('выжимка: есть «сколько откладывать на цель»', /откладывать в месяц по 13 000 ₴ \/ 6 500 ₴ \/ 3 250 ₴/.test(norm(f.text)), f.text.slice(-500))
  check('выжимка: суммы для цели зарегистрированы', f.numbers.has(13000) && f.numbers.has(6500) && f.numbers.has(3250))
  check('выжимка: средний остаток за полный месяц', /в среднем за полный месяц остаётся/.test(f.text))
  check('выжимка: срок цели при среднем остатке', /цель наберётся примерно за \d+ мес\./.test(f.text))
  check('выжимка: лимит по категории', /лимиты по категориям: «Кафе»/.test(f.text))

  /* ---------- Карточки без модели ---------- */
  const today = rulesCard('сколько я потратил сегодня?', ctx, NOW, 'ru')
  check('правила: сегодня', today.title === 'Сегодня' && /Потрачено/.test(today.lead) && today.source === 'rules', today)
  const budget = rulesCard('сколько осталось?', ctx, NOW, 'ru')
  check('правила: бюджет с месяцем и лимитами', budget.title === 'Бюджет' && budget.sections[0].heading === 'Октябрь' && budget.sections.some((s) => s.heading === 'Лимиты'), budget)
  const goals = rulesCard('когда накоплю на отпуск', ctx, NOW, 'ru')
  check('правила: цели', goals.sections[0]?.heading === 'Отпуск' && goals.sections[0].rows.some((r) => /35%/.test(r.value)), goals)
  const prev = rulesCard('а в прошлом месяце?', ctx, NOW, 'ru')
  check('правила: прошлый месяц', prev.title === 'Сентябрь' && prev.sections[0]?.rows.length > 0, prev)
  const cats = rulesCard('на что уходит больше всего?', ctx, NOW, 'ru')
  check('правила: категории в предложном падеже', cats.title === 'Куда ушло в октябре', cats.title)
  const en = rulesCard('how much did I spend today?', ctx, NOW, 'en')
  check('правила по-английски: и тексты, и категории', en.title === 'Today' && /Spent/.test(en.lead), en)
  const hello = rulesCard('привет', ctx, NOW, 'ru')
  check('правила: привет с подсказками', hello.title === 'Привет' && hello.followups.length === 3, hello)
  const unknown = rulesCard('ааа', ctx, NOW, 'ru')
  check('правила: непонятное — «Не понял», а не «Не нашёл сумму»', unknown.title === 'Не понял', unknown)
  const help = rulesCard('как поставить бюджет?', ctx, NOW, 'ru')
  check('правила: помощь с примерами записи', help.sections[0]?.rows.some((r) => r.value === 'кофе 300'), help)
}
{
  const empty = await loadContext({ REFERRALS: new FakeKV() }, 8, NOW)
  check('выжимка без данных — запрет называть числа', /ДАННЫХ НЕТ/.test(buildFacts(empty, NOW).text))
  const c = rulesCard('сколько я потратил?', empty, NOW, 'ru')
  check('правила без данных — зовём записать первую трату', c.title === 'Начнём с первой траты', c)
}

/* ------------------------------------------------------------------ */
/* Оформление                                                          */
/* ------------------------------------------------------------------ */
{
  const card = {
    title: 'Итоги <script>',
    lead: 'A & B',
    sections: [{ heading: 'Раздел', icon: 'money', rows: [{ label: 'Кафе', value: '<b>4 200 ₴</b>' }] }],
    tip: 'Совет',
    followups: [],
    source: 'model',
  }
  const html = renderTelegram(card, { echo: 'А в прошлом месяце?' })
  check('карточка: вопрос в шапке', html.startsWith('<i>› А в прошлом месяце?</i>\n<b>Итоги &lt;script&gt;</b>'), html)
  check('карточка: строки в цитате, значение жирным и экранировано', html.includes('<blockquote>• Кафе: <b>&lt;b&gt;4 200 ₴&lt;/b&gt;</b></blockquote>'), html)
  check('карточка: совет курсивом', html.endsWith('\n\n<i>Совет</i>'), html)
  const withIcons = renderTelegram(card, { icons: { money: { id: '5368324170671202286', fallback: '💰' }, tip: { id: 'bad"id', fallback: 'x' } } })
  check('карточка: иконка раздела — кастомная эмодзи', withIcons.includes('<tg-emoji emoji-id="5368324170671202286">💰</tg-emoji> <b>Раздел</b>'), withIcons)
  check('карточка: битый id иконки не попадает в разметку', !withIcons.includes('bad'), withIcons)
  const text = cardToText(card)
  check('текстом: абзацы, раздел одной строкой', text === 'Итоги <script>.\nA & B\n\nРаздел: Кафе — <b>4 200 ₴</b>.\n\nСовет', text)
}
check('история из приложения чистится', JSON.stringify(cleanHistory([{ q: 'a', a: 'b' }, { q: 1 }, 'x', { q: 'c', a: 'd' }])) === JSON.stringify([{ q: 'a', a: 'b' }, { q: 'c', a: 'd' }]))

/* ------------------------------------------------------------------ */
/* Сквозные сценарии бота                                              */
/* ------------------------------------------------------------------ */

let calls = []
/** Что ответит модель: parse(body) и answer(body) → объект или { status }. */
let model = { parse: () => ({ intent: 'unclear', entries: [] }), answer: () => ({ status: 500 }) }
/** Что ответит Telegram на sendMessage. */
let tgSend = () => ({ ok: true, status: 200 })

globalThis.fetch = async (url, init) => {
  const u = String(url)
  const body = init?.body ? JSON.parse(init.body) : {}
  if (u.includes('generativelanguage.googleapis.com')) {
    const modelName = u.split('/models/')[1].split(':')[0]
    const isParse = !!body.generationConfig?.responseSchema?.properties?.intent
    calls.push({ method: isParse ? 'gemini:parse' : 'gemini:answer', model: modelName, body })
    const out = (isParse ? model.parse : model.answer)(body, modelName)
    if (out && typeof out.status === 'number') return new Response('{"error":{}}', { status: out.status })
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] }), { status: 200 })
  }
  const method = u.split('/').pop()
  calls.push({ method, body })
  if (method === 'sendMessage') {
    const r = tgSend(body)
    return new Response(JSON.stringify({ ok: r.ok, result: {} }), { status: r.status })
  }
  return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 })
}
const byMethod = (m) => calls.filter((c) => c.method === m)
const lastSent = () => byMethod('sendMessage').at(-1)?.body

const makeEnv = (kv, over = {}) => ({ BOT_TOKEN: 'x', OWNER_CHAT_ID: '1', GEMINI_API_KEY: 'k', REFERRALS: kv, ...over })
const msg = (id, text, extra = {}) => ({
  message: { message_id: 10, chat: { id, type: 'private' }, from: { id, first_name: 'Т' }, text, ...extra },
})
const tap = (id, data, message) => ({ callback_query: { id: 'cb', from: { id }, data, message } })

const MODEL_CARD = {
  title: 'Сегодня',
  lead: 'Сегодня потрачено 500 ₴.',
  sections: [{ heading: 'По категориям', icon: 'category', rows: [{ label: 'Еда', value: '500 ₴' }, { label: 'Выдумка', value: '7 777 ₴' }] }],
  tip: '',
  followups: ['А за неделю?', 'Как по бюджету?'],
}

// 1. Вопрос без чисел: без разбора записи, «Думает…», карточка, продолжения, память.
{
  const kv = new FakeKV()
  await kv.put('data:101', blobFor({ currency: 'UAH', monthlyBudget: 0, transactions: history(10) }))
  calls = []
  model.answer = () => MODEL_CARD
  await handleTgUpdate(msg(101, 'сколько я потратил сегодня?'), makeEnv(kv))
  check('вопрос: разбор записи не вызывался', byMethod('gemini:parse').length === 0, calls.map((c) => c.method))
  check('вопрос: модель ответов — gemini-3.8-flash с LOW', byMethod('gemini:answer')[0]?.model === 'gemini-3.8-flash' && byMethod('gemini:answer')[0]?.body.generationConfig.thinkingConfig?.thinkingLevel === 'LOW', byMethod('gemini:answer')[0]?.body.generationConfig)
  check('вопрос: «Думает…» до ответа', calls.findIndex((c) => c.method === 'sendMessageDraft') < calls.findIndex((c) => c.method === 'sendMessage') && byMethod('sendMessageDraft')[0]?.body.text === '', calls.map((c) => c.method))
  check('вопрос: «печатает…» поставлен', byMethod('sendChatAction').length >= 1)
  const sent = lastSent()
  check('вопрос: карточка с заголовком и цитатой', norm(sent?.text).startsWith('<b>Сегодня</b>\nСегодня потрачено 500 ₴.') && norm(sent?.text).includes('<blockquote>• Еда: <b>500 ₴</b></blockquote>'), sent?.text)
  check('вопрос: выдуманная сумма отсеяна', !sent?.text.includes('7 777'), sent?.text)
  check('вопрос: кнопки-продолжения', JSON.stringify(sent?.reply_markup) === JSON.stringify({ inline_keyboard: [[{ text: 'А за неделю?', callback_data: 'q:0' }], [{ text: 'Как по бюджету?', callback_data: 'q:1' }]] }), sent?.reply_markup)
  const chat = JSON.parse((await kv.get('chat:101')) ?? '{}')
  check('вопрос: реплика запомнена', chat.turns?.length === 1 && chat.turns[0].q === 'сколько я потратил сегодня?', chat)

  // 2. Кнопка-продолжение: вопрос в шапке, прошлая реплика уходит модели.
  calls = []
  model.answer = () => ({ ...MODEL_CARD, title: 'Неделя', lead: 'За неделю — 500 ₴.', sections: [] })
  await handleTgUpdate(
    tap(101, 'q:0', { message_id: 11, chat: { id: 101, type: 'private' }, text: 'Сегодня\nСегодня потрачено 500 ₴.', reply_markup: sent.reply_markup }),
    makeEnv(kv),
  )
  const sent2 = lastSent()
  check('продолжение: вопрос с кнопки в шапке ответа', sent2?.text.startsWith('<i>› А за неделю?</i>\n<b>Неделя</b>'), sent2?.text)
  const contents = byMethod('gemini:answer')[0]?.body.contents ?? []
  check(
    'продолжение: модель видит прошлый вопрос и ответ',
    contents.length === 3 && contents[0].parts[0].text === 'сколько я потратил сегодня?' && contents[2].parts[0].text === 'А за неделю?',
    contents.map((c) => c.parts[0].text.slice(0, 40)),
  )
  check('продолжение: память — две реплики', JSON.parse(await kv.get('chat:101')).turns.length === 2)

  // 3. Кнопка под сообщением старше двух суток (без клавиатуры) — подсказка, без ответа.
  calls = []
  await handleTgUpdate(tap(101, 'q:0', { message_id: 12, chat: { id: 101, type: 'private' } }), makeEnv(kv))
  check('устаревшая кнопка: ответа нет, есть подсказка', byMethod('sendMessage').length === 0 && /устарела/.test(byMethod('answerCallbackQuery')[0]?.body.text ?? ''), calls.map((c) => c.method))
}

// 4. Модель ответов не ответила → лёгкая модель → правила.
{
  const kv = new FakeKV()
  await kv.put('data:102', blobFor({ currency: 'UAH', transactions: history(10) }))
  calls = []
  model.answer = (_b, name) => (name === 'gemini-3.8-flash' ? { status: 503 } : { status: 500 })
  await handleTgUpdate(msg(102, 'сколько я потратил сегодня?'), makeEnv(kv))
  const tried = byMethod('gemini:answer').map((c) => c.model)
  check('сбой: сначала сильная, потом лёгкая модель', JSON.stringify(tried) === JSON.stringify(['gemini-3.8-flash', 'gemini-3.5-flash-lite']), tried)
  check('сбой: ответили правила', lastSent()?.text.startsWith('<b>Сегодня</b>'), lastSent()?.text)
}

// 5. Запись: явная валюта счёта и лимит под записью.
{
  const kv = new FakeKV()
  await kv.put('data:103', blobFor({ currency: 'UAH', account: 'USD', transactions: [], budgets: { cafe: 50 } }))
  calls = []
  model.parse = () => ({ intent: 'record', entries: [{ type: 'expense', amount: 3, categoryId: 'cafe' }] })
  await handleTgUpdate(msg(103, 'кофе 3'), makeEnv(kv))
  const inbox = JSON.parse((await kv.get('inbox:103')) ?? '{}')
  check('запись: валюта — выбранный счёт, явно', inbox.items?.[0]?.currency === 'USD', inbox.items)
  check('запись: ответ в той же валюте', norm(lastSent()?.text ?? '').includes('Кафе · 3 $'), lastSent()?.text)
  check('запись: лимит категории в ответе', norm(lastSent()?.text ?? '').includes('лимит «Кафе»: 3 $ из 50 $'), lastSent()?.text)
}

// 6. Без ключа: «привет» и непонятное — карточки правил, а не «Не нашёл сумму».
{
  const kv = new FakeKV()
  await kv.put('data:104', blobFor({ currency: 'UAH', transactions: history(5) }))
  calls = []
  await handleTgUpdate(msg(104, 'привет'), makeEnv(kv, { GEMINI_API_KEY: '' }))
  check('без модели: привет', lastSent()?.text.startsWith('<b>Привет</b>'), lastSent()?.text)
  check('без модели: «Думает…» не показываем', byMethod('sendMessageDraft').length === 0)
  calls = []
  await handleTgUpdate(msg(104, 'ааа'), makeEnv(kv, { GEMINI_API_KEY: '' }))
  check('без модели: непонятное', lastSent()?.text.startsWith('<b>Не понял</b>'), lastSent()?.text)
  calls = []
  await handleTgUpdate(msg(104, 'сколько я потратил 5 октября?'), makeEnv(kv, { GEMINI_API_KEY: '' }))
  check('без модели: вопрос с числом не записывается тратой', !(await kv.get('inbox:104')) && /^<b>/.test(lastSent()?.text ?? ''), lastSent()?.text)
}

// 6б. Модель разбора не уверена («unclear»), а сообщение — вопрос с числом: не записываем.
{
  const kv = new FakeKV()
  await kv.put('data:108', blobFor({ currency: 'UAH', transactions: history(5) }))
  calls = []
  model.parse = () => ({ intent: 'unclear', entries: [] })
  model.answer = () => ({ title: 'Пятое октября', lead: 'Отдельных дней в итогах нет — загляни в Календарь.', sections: [], followups: [] })
  await handleTgUpdate(msg(108, 'сколько я потратил 5 октября?'), makeEnv(kv))
  check('unclear + вопрос с числом: не трата, а ответ', !(await kv.get('inbox:108')) && lastSent()?.text.startsWith('<b>Пятое октября</b>'), lastSent()?.text)
  model.parse = () => ({ intent: 'unclear', entries: [] })
  calls = []
  await handleTgUpdate(msg(108, 'шаурма 250'), makeEnv(kv))
  check('unclear без вопроса: правила записывают', JSON.parse((await kv.get('inbox:108')) ?? '{"items":[]}').items.length === 1)
}

// 7. «Не та категория» в пачке из двух трат: правится только выбранная.
{
  const kv = new FakeKV()
  await kv.put('data:105', blobFor({ currency: 'UAH', transactions: [] }))
  calls = []
  await handleTgUpdate(msg(105, 'такси 450 и обед 380'), makeEnv(kv, { GEMINI_API_KEY: '' }))
  const items = JSON.parse(await kv.get('inbox:105')).items
  const batch = items[0].id.split('-')[0]
  check('пачка: две записи', items.length === 2 && items[0].categoryId === 'transport' && items[1].categoryId === 'food', items)
  const shown = { message_id: 20, chat: { id: 105, type: 'private' }, text: 'Транспорт · 450 ₴' }
  calls = []
  await handleTgUpdate(tap(105, `c:${batch}`, shown), makeEnv(kv, { GEMINI_API_KEY: '' }))
  const pickRows = byMethod('editMessageReplyMarkup')[0]?.body.reply_markup.inline_keyboard ?? []
  check('пачка: сначала выбор записи (и «Назад»)', pickRows.length === 3 && pickRows[1][0].callback_data === `e:${batch}:1` && pickRows[2][0].callback_data === `b:${batch}`, pickRows)
  calls = []
  await handleTgUpdate(tap(105, `e:${batch}:1`, shown), makeEnv(kv, { GEMINI_API_KEY: '' }))
  const catRows = byMethod('editMessageReplyMarkup')[0]?.body.reply_markup.inline_keyboard ?? []
  const pick = JSON.parse(await kv.get(`pick:105:${batch}`))
  check('пачка: категории для второй записи, без её текущей', pick.i === 1 && !pick.ids.includes('food') && catRows.flat().some((b) => b.callback_data === `p:${batch}:0`), { pick, catRows })
  calls = []
  await handleTgUpdate(tap(105, `p:${batch}:0`, shown), makeEnv(kv, { GEMINI_API_KEY: '' }))
  const after = JSON.parse(await kv.get('inbox:105')).items
  check('пачка: первая запись не тронута, вторая — новая категория', after[0].categoryId === 'transport' && after[1].categoryId === pick.ids[0], after)
  check('пачка: запись перерисована с обычными кнопками', byMethod('editMessageText')[0]?.body.reply_markup.inline_keyboard[0][0].callback_data === `u:${batch}`)
}

// 8. Иконки владельца: сохраняются по /icons, встают в ответы; Telegram не принял — без них.
{
  const kv = new FakeKV()
  await kv.put('data:1', blobFor({ currency: 'UAH', transactions: history(5) }))
  calls = []
  await handleTgUpdate(msg(999, '/icons'), makeEnv(kv))
  check('иконки: не владельцу — справка, а не настройка', !(await kv.get('bot:icons')))
  const text = '/icons 💰📊'
  await handleTgUpdate(
    msg(1, text, {
      entities: [
        { type: 'bot_command', offset: 0, length: 6 },
        { type: 'custom_emoji', offset: 7, length: 2, custom_emoji_id: '111' },
        { type: 'custom_emoji', offset: 9, length: 2, custom_emoji_id: '222' },
      ],
    }),
    makeEnv(kv),
  )
  const saved = JSON.parse((await kv.get('bot:icons')) ?? '{}')
  check('иконки: сохранены по порядку', saved.money?.id === '111' && saved.money?.fallback === '💰' && saved.chart?.id === '222', saved)
  calls = []
  model.answer = () => ({ title: 'Месяц', lead: 'Итоги ниже.', sections: [{ heading: 'Итоги', icon: 'chart', rows: [{ label: 'Записей', value: 'много' }] }], followups: [] })
  await handleTgUpdate(msg(1, 'как у меня дела?'), makeEnv(kv))
  check('иконки: в ответе', lastSent()?.text.includes('<tg-emoji emoji-id="222">📊</tg-emoji> <b>Итоги</b>'), lastSent()?.text)
  calls = []
  tgSend = (body) => (String(body.text).includes('tg-emoji') ? { ok: false, status: 400 } : { ok: true, status: 200 })
  await handleTgUpdate(msg(1, 'как у меня дела?'), makeEnv(kv))
  const sends = byMethod('sendMessage')
  check('иконки не приняты: тот же ответ без них', sends.length === 2 && !sends[1].body.text.includes('tg-emoji') && sends[1].body.text.includes('<b>Итоги</b>'), sends.map((s) => s.body.text))
  tgSend = () => ({ ok: true, status: 200 })
  await handleTgUpdate(msg(1, '/icons off'), makeEnv(kv))
  check('иконки: /icons off', !(await kv.get('bot:icons')))
}

// 9. Приложение (/ask): похожее на запись — подсказка, вопрос — карточка и текст для старых версий.
{
  const kv = new FakeKV()
  await kv.put('data:106', blobFor({ currency: 'UAH', transactions: history(10) }))
  const env = makeEnv(kv)
  const rec = await answerQuestion(env, 106, 'кофе 300')
  check('/ask: запись — looks_like_record', rec.ok === false && rec.error === 'looks_like_record', rec)
  calls = []
  model.answer = () => MODEL_CARD
  const res = await answerQuestion(env, 106, 'сколько я потратил сегодня?', [{ q: 'привет', a: 'Привет.' }], 'ru')
  check('/ask: карточка', res.ok && res.card?.title === 'Сегодня' && res.card.sections[0].rows.length === 1, res)
  check('/ask: текст для старых приложений — абзацами', /^Сегодня\.\nСегодня потрачено 500 ₴\.\n\nПо категориям: Еда — 500 ₴\.$/.test(norm(res.answer ?? '')), res.answer)
  check('/ask: история из приложения ушла модели', byMethod('gemini:answer')[0]?.body.contents.length === 3)
}

// 10. Написал — значит, не заблокировал: наша автоматическая отписка снимается.
{
  const kv = new FakeKV()
  await kv.put('data:107', blobFor({ currency: 'UAH', transactions: [] }))
  await kv.put('remind:107', 'b')
  await handleTgUpdate(msg(107, 'кофе 300'), makeEnv(kv, { GEMINI_API_KEY: '' }))
  check('разблокировал и написал трату — отписка снята', (await kv.get('remind:107')) === null)
  await kv.put('remind:107', '0')
  await handleTgUpdate(msg(107, 'кофе 300'), makeEnv(kv, { GEMINI_API_KEY: '' }))
  check('свой выбор «выключено» не трогаем', (await kv.get('remind:107')) === '0')
}

if (failed) {
  console.error(`\ntest-answer: ${failed} из ${failed + passed} проверок не прошли`)
  process.exit(1)
}
console.log(`test-answer: ${passed} проверок — вопросы, темы, числа, карточки, сценарии бота и приложения`)
