/**
 * Разговор с ботом: приём сообщений, ответы, кнопки.
 *
 * Смысл всей затеи — записать трату должно стоить ОДНОГО сообщения. До этого
 * путь был такой: открыть Telegram, открыть мини-апп, дождаться webview, нажать
 * «+», набрать сумму, выбрать категорию, сохранить. Шесть действий вместо одного,
 * и это главная причина, по которой трекеры забрасывают.
 *
 * Бот не только записывает, но и отвечает: «сколько я потратил на кафе» — такой
 * же законный способ пользоваться Кошелём, как открыть Аналитику. Отвечает
 * модель, но только по итогам, которые посчитали мы (см. gemini.ts → buildFacts).
 *
 * Тексты здесь — интерфейс, а не отладочный вывод: их читает человек, который
 * на ходу пишет «кофе 300». Поэтому ответ на запись — не «записано», а то, чего
 * он не держит в голове: сколько осталось на сегодня.
 */
import type { Env } from './env'
import { parseEntry } from './entry'
import { askGemini, type ParsedOp } from './gemini'
import {
  allowance,
  applyEntries,
  dayLabel,
  loadContext,
  mskDay,
  mskDayOfIso,
  monthName,
  type UserContext,
} from './context'
import {
  appendInbox,
  dropBatch,
  entryId,
  newBatchId,
  readInbox,
  setBatchCategory,
  MAX_INBOX,
  type InboxEntry,
} from './inbox'
import { formatMoney } from './money'
import { isRateLimited } from './limits'
import {
  answerCallback,
  editMessageText,
  escapeHtml,
  sendMessage,
  sendTyping,
  type TgCallbackQuery,
  type TgMessage,
  type TgUpdate,
} from './tg'

/** URL мини-аппа для кнопки «Открыть» (публичный, не секрет). */
export const APP_URL = 'https://karateka004.github.io/ManiManagerTrue/'

/** Команды для синей кнопки «Меню». Их мало намеренно: с ботом говорят словами. */
export const BOT_COMMANDS = [
  { command: 'today', description: 'Сводка дня' },
  { command: 'start', description: 'Как записывать траты' },
  { command: 'help', description: 'Примеры и что я понимаю' },
]

/* ------------------------------------------------------------------ */
/* Тексты                                                              */
/* ------------------------------------------------------------------ */

/*
 * Знакомство сделано одним сообщением, которое перерисовывается кнопками, а не
 * тремя подряд. Человек, впервые открывший бота, должен увидеть не меню
 * возможностей, а одну строку, которую можно повторить прямо сейчас: весь смысл
 * продукта в том, что записать трату — это написать «кофе 300».
 */
/*
 * Примеры везде вынесены в цитату. Так они читаются как образец, который можно
 * повторить, а не как продолжение объяснения, — и заодно это единственный
 * способ дать сообщению структуру, не скатываясь в эмодзи и рамки из дефисов.
 */
const START = [
  '<b>Кошель</b> — учёт денег прямо в переписке.',
  '',
  'Напиши, что потратил, обычными словами:',
  '<blockquote>кофе 300',
  'вчера продукты 1200',
  'кроссовки 3500 и пиво 180</blockquote>',
  'Запишу, определю категорию и скажу, сколько осталось на сегодня.',
].join('\n')

const START_ASK = [
  '<b>Что можно спросить</b>',
  '',
  '<blockquote>сколько я потратил сегодня',
  'на что больше всего ушло в этом месяце',
  'сколько осталось до конца месяца</blockquote>',
  'Отвечаю по твоим записям — ничего не придумываю и советов не даю.',
].join('\n')

const START_HOW = [
  '<b>Как это устроено</b>',
  '',
  'Записи копятся здесь и переносятся в приложение, когда ты его открываешь.',
  'Под каждой записью — «Отменить» и «Не та категория».',
  '',
  'Чтобы вместо «потрачено» я говорил, сколько осталось, задай месячный бюджет в приложении.',
].join('\n')

/** Приписка к самой первой записи: один раз, и только если бюджета ещё нет. */
const FIRST_RECORD_HINT =
  'Это первая запись. Задай месячный бюджет в приложении — тогда вместо «потрачено» я буду говорить, сколько осталось на сегодня.'

/*
 * Справка — одна сворачиваемая цитата. Развёрнутый список примеров занимает
 * два экрана, а нужен он один раз: `expandable` даёт короткий блок с «Развернуть»
 * вместо простыни, и это единственная в чате замена аккордеону.
 */
const HELP = [
  '<b>Как писать</b>',
  'Напиши сумму и на что — остальное разберу сам.',
  '<blockquote expandable>Сумма и слово — в любом порядке:',
  'кофе 300',
  '300 такси',
  '',
  'Знак задаёт направление, расход — по умолчанию:',
  '-1200 аптека',
  '+50000 зарплата',
  '',
  'Валюта — если она не основная:',
  'обед 12 €',
  'такси 450 грн',
  '',
  'День и несколько трат сразу:',
  'вчера продукты 1200',
  'кроссовки 3500 и пиво 180',
  '',
  'Можно спрашивать:',
  'сколько я потратил сегодня',
  'на что больше всего ушло в этом месяце',
  'сколько осталось до конца месяца</blockquote>',
  'Под записью — «Отменить» и «Не та категория». Сводка дня — /today.',
].join('\n')

const NO_AMOUNT = 'Не нашёл сумму. Напиши, например: кофе 300 — или спроси, сколько потрачено.'
const TOO_BIG = 'Похоже на опечатку — не записал. Проверь сумму.'
const NOT_TEXT = 'Пока понимаю только текст. Напиши, например: кофе 300'
const INBOX_FULL =
  `Накопилось ${MAX_INBOX} записей, и в приложение они ещё не перенеслись. ` +
  'Открой Кошель — он их заберёт, и я снова смогу записывать.'
const ALREADY_PULLED = 'Запись уже в приложении — поправить её можно там.'

const openButton = { text: 'Открыть Кошель', web_app: { url: APP_URL } }
const openKeyboard = { inline_keyboard: [[openButton]] }

/** Первый экран знакомства: две ветки и вход в приложение. */
const startKeyboard = {
  inline_keyboard: [
    [
      { text: 'Что можно спросить', callback_data: 'm:q' },
      { text: 'Как это устроено', callback_data: 'm:h' },
    ],
    [openButton],
  ],
}

/** Ветка знакомства: возврат к первому экрану и вход в приложение. */
const branchKeyboard = {
  inline_keyboard: [[{ text: '← Назад', callback_data: 'm:0' }], [openButton]],
}

/**
 * Кнопки под записью. Кнопки «Открыть Кошель» здесь намеренно нет: вход в
 * приложение и так постоянно висит слева от поля ввода (setChatMenuButton), а
 * повторять его под каждой записью — шум.
 */
const recordKeyboard = (batch: string) => ({
  inline_keyboard: [
    [
      { text: 'Отменить', callback_data: `u:${batch}` },
      { text: 'Не та категория', callback_data: `c:${batch}` },
    ],
  ],
})

/* ------------------------------------------------------------------ */
/* Потолки                                                             */
/* ------------------------------------------------------------------ */

/** Сообщений в минуту на человека. Выше — молча игнорируем: отвечать спамеру значит удваивать поток. */
const MSG_PER_MIN = 30
/**
 * Вызовов модели в сутки на человека. За разбор и ответы мы платим, и один
 * человек с залипшей клавиатурой не должен оплатить нам счёт: дальше в тот же
 * день он обслуживается правилами и этого почти не замечает.
 */
const MODEL_CALLS_PER_DAY = 200
/** Сколько категорий показываем на выбор — ряд из трёх в два этажа. */
const PICK_SIZE = 6
/** Предложенный список живёт час: дольше к этой записи не возвращаются. */
const PICK_TTL_SEC = 3600

/* ------------------------------------------------------------------ */
/* Точка входа                                                         */
/* ------------------------------------------------------------------ */

export async function handleTgUpdate(update: TgUpdate, env: Env): Promise<void> {
  if (update.callback_query) return handleCallback(update.callback_query, env)
  if (update.message) return handleMessage(update.message, env)
}

async function handleMessage(msg: TgMessage, env: Env): Promise<void> {
  // Только личная переписка. Бота могут добавить в группу, но группового
  // сценария в этой версии нет: там «кофе 300» пишут друг другу, а не боту.
  if (msg.chat?.type !== 'private') return
  const from = msg.from
  if (!from?.id || from.is_bot) return
  // id идёт в ключ KV (`inbox:<id>`), поэтому берём его числом и ничем иным:
  // строка вроде «1/../data:456» указала бы на чужой ключ. Подделать обновление
  // можно только зная секрет вебхука, но одна проверка дешевле этого допущения.
  const userId = Number(from.id)
  if (!Number.isSafeInteger(userId) || userId <= 0) return

  if (await isRateLimited(env, 'tgmsg', userId, MSG_PER_MIN, 60)) return

  const text = (msg.text ?? '').trim()
  if (!text) {
    // Голосовые и фото чеков — следующий шаг: модель умеет и то и другое, но
    // сначала должен заработать текстовый путь.
    await sendMessage(env, userId, NOT_TEXT, openKeyboard)
    return
  }

  if (text.startsWith('/')) {
    const cmd = text.slice(1).split(/[\s@]/)[0].toLowerCase()
    if (cmd === 'start') await sendMessage(env, userId, START, startKeyboard)
    else if (cmd === 'today') await sendToday(env, userId)
    else await sendMessage(env, userId, HELP, openKeyboard)
    return
  }

  const now = Date.now()
  // «Печатает…» ставим ДО похода в модель и не дожидаемся: дальше секунда-другая
  // тишины, и без этой пометки человек решит, что бот не получил сообщение.
  const typing = sendTyping(env, userId)
  const ctx = await loadContext(env, userId, now)
  const overQuota = await isRateLimited(env, 'gem', userId, MODEL_CALLS_PER_DAY, 86_400)
  const outcome = overQuota ? null : await askGemini(text, ctx, env, now)
  await typing.catch(() => {})

  // Человек спросил, а не записал. Текст пишет модель, но строго по итогам,
  // которые посчитали мы, — выдумывать числа ей нечем.
  if (outcome?.intent === 'answer' && outcome.answer) {
    await sendMessage(env, userId, answerReply(outcome.answer))
    return
  }

  const { ops, reason } = resolveOps(outcome?.ops ?? [], text, ctx)
  if (ops.length === 0) {
    await sendMessage(env, userId, reason === 'too_big' ? TOO_BIG : NO_AMOUNT)
    return
  }

  await recordOps(env, userId, ops, ctx, now)
}

/**
 * Что записываем: то, что разобрала модель, иначе — правила.
 *
 * Правила не только запасной путь на случай сбоя. Когда модель вернула «здесь
 * нет операции», а правила сумму всё-таки видят, верим правилам: отказать в
 * записи дороже, чем записать грубовато.
 */
function resolveOps(
  fromModel: ParsedOp[],
  text: string,
  ctx: UserContext,
): { ops: ParsedOp[]; reason?: 'no_amount' | 'too_big' } {
  if (fromModel.length > 0) return { ops: fromModel }

  const known = new Set(ctx.categories.map((c) => c.id))
  const byRules = parseEntry(text, known)
  if (byRules.ok) {
    const e = byRules.entry
    return {
      ops: [
        {
          type: e.kind,
          amount: e.amount,
          currency: e.currency,
          categoryId: e.categoryId,
          note: e.note,
          guessed: e.guessed,
        },
      ],
    }
  }
  return { ops: [], reason: byRules.reason === 'too_big' ? 'too_big' : 'no_amount' }
}

async function recordOps(
  env: Env,
  userId: number,
  ops: ParsedOp[],
  ctx: UserContext,
  now: number,
): Promise<void> {
  const batch = newBatchId()
  const entries: InboxEntry[] = ops.map((op, i) => ({
    id: entryId(batch, i),
    type: op.type,
    amount: op.amount,
    currency: op.currency,
    categoryId: op.categoryId,
    note: op.note,
    // Дата без времени — только когда человек назвал день. Иначе точный момент:
    // приложение разложит его в настоящий локальный день этого человека.
    date: op.date ?? new Date(now).toISOString(),
  }))

  // Признак первой в жизни записи снимаем ДО того, как учтём новую операцию.
  const firstEver = ctx.ops === 0 && ctx.pending === 0 && ctx.monthlyBudget === 0

  const saved = await appendInbox(env, userId, entries)
  if (!saved.ok) {
    await sendMessage(env, userId, INBOX_FULL, openKeyboard)
    return
  }

  applyEntries(ctx, entries, now)
  const reply = recordReply(ops, ctx, now)
  // Подсказку про бюджет даём ровно один раз — на первой записи. Повторять её
  // под каждой тратой значило бы попрекать человека настройкой, которую он
  // осознанно не сделал.
  await sendMessage(
    env,
    userId,
    firstEver ? `${reply}\n\n${FIRST_RECORD_HINT}` : reply,
    firstEver ? { inline_keyboard: [[...recordKeyboard(batch).inline_keyboard[0]], [openButton]] } : recordKeyboard(batch),
  )
}

/* ------------------------------------------------------------------ */
/* Ответ                                                               */
/* ------------------------------------------------------------------ */
/*
 * ЧТО ВООБЩЕ ДОСТУПНО В СООБЩЕНИИ БОТА. Ни таблиц, ни шрифтов, ни цветов, ни
 * размеров в Bot API нет. Есть: жирный, курсив, подчёркивание, зачёркнутый,
 * спойлер, ссылка, `моноширинный`, блок кода и цитата (в том числе
 * сворачиваемая). Всё «оформление» здесь собрано ровно из этого:
 *
 *   - моноширинный блок — единственный способ выровнять колонки, то есть
 *     единственная настоящая табличка;
 *   - блочные символы в моноширинном — единственная настоящая полоса прогресса;
 *   - цитата — единственная линия-разделитель;
 *   - контраст жирного и обычного — вся иерархия.
 *
 * Поэтому дисциплина важнее приёмов: одинаковые вещи выглядят одинаково везде,
 * и ни одного эмодзи.
 */

function nameOf(ctx: UserContext, id: string): string {
  return ctx.categories.find((c) => c.id === id)?.name ?? 'Прочее'
}

/** Клеток в полосе. Десять — влезает в строку на узком экране и делится на глаз. */
const BAR_CELLS = 10

/**
 * Полоса израсходованного дневного лимита.
 *
 * Заполненную клетку показываем при любом ненулевом расходе: пустая полоса
 * сразу после записи читалась бы как «трату не учли».
 */
function budgetBar(used: number, limit: number): string {
  if (!(limit > 0)) return ''
  const share = Math.min(1, Math.max(0, used / limit))
  const filled = used > 0 ? Math.max(1, Math.round(share * BAR_CELLS)) : 0
  return '█'.repeat(filled) + '░'.repeat(BAR_CELLS - filled)
}

/**
 * Сводка дня моноширинной табличкой: категории слева, суммы выровнены справа.
 *
 * Считает воркер, не модель: список операций человека наружу не уходит, а
 * сложить свои же числа мы умеем и без чужой помощи.
 */
function todayTable(ctx: UserContext): string {
  const cur = ctx.currency
  const rows = ctx.todayByCategory.map(
    (c) => [nameOf(ctx, c.id).slice(0, 14), formatMoney(c.sum, cur)] as const,
  )
  if (rows.length === 0) return ''

  const nameW = Math.max(...rows.map((r) => r[0].length), 5)
  const sumW = Math.max(...rows.map((r) => r[1].length), formatMoney(ctx.spentToday, cur).length)
  // Выравниваем ДО экранирования: у «&amp;» длина строки уже не равна ширине.
  const line = (name: string, sum: string) => `${name.padEnd(nameW)}  ${sum.padStart(sumW)}`

  const body = rows.map(([n, s]) => line(n, s))
  // Итог отделяем чертой только когда строк больше одной — иначе это черта
  // между числом и тем же числом.
  if (rows.length > 1) {
    body.push('─'.repeat(nameW + 2 + sumW), line('Итого', formatMoney(ctx.spentToday, cur)))
  }
  return `<pre>${escapeHtml(body.join('\n'))}</pre>`
}

/**
 * Заголовок записи: «Еда · 51 €». У дохода стоит плюс, у расхода знака нет —
 * расход это девять записей из десяти, и минус перед каждой был бы шумом, а вот
 * доход в ленте одинаковых строк должен отличаться с одного взгляда.
 */
function opTitle(op: ParsedOp, ctx: UserContext): string {
  const money = formatMoney(op.amount, op.currency ?? ctx.currency)
  const sign = op.type === 'income' ? '+' : ''
  return `<b>${escapeHtml(nameOf(ctx, op.categoryId))} · ${sign}${money}</b>`
}

/**
 * Вторая строка записи — день, заметка, оговорка про категорию. Обычным
 * текстом: рядом с жирным заголовком он читается как подпись, и иерархия
 * возникает сама, без единого значка.
 */
function opDetail(op: ParsedOp, now: number): string {
  const bits: string[] = []
  const when = op.date ? dayLabel(op.date, now) : null
  if (when) bits.push(when)
  if (op.note) bits.push(escapeHtml(op.note))
  if (op.guessed) bits.push('категорию не разобрал')
  return bits.join(' · ')
}

/**
 * Ответ на запись.
 *
 * Слова «Записал:» здесь больше нет намеренно. Само сообщение и есть
 * подтверждение, а под ним стоит «Отменить» — подписывать это словом значит
 * объяснять очевидное. Осталась суть: что записано и сколько осталось.
 *
 * Итог уходит в цитату. В сообщении Telegram цитата — единственная доступная
 * графика: вертикальная линия слева. Она отделяет «сколько осталось» от самой
 * записи без единого значка и эмодзи.
 */
function recordReply(ops: ParsedOp[], ctx: UserContext, now: number): string {
  const lines: string[] = []
  for (const op of ops) {
    lines.push(opTitle(op, ctx))
    const detail = opDetail(op, now)
    if (detail) lines.push(detail)
  }
  const tail = summaryLine(ops, ctx, now)
  if (tail) lines.push(`<blockquote>${tail}</blockquote>`)
  return lines.join('\n')
}

/**
 * Денежное значение внутри обычного текста: число с разрядами через пробел,
 * необязательными копейками и необязательным значком валюты.
 */
const MONEY_IN_TEXT =
  /\d+(?:[\u0020\u00a0\u202f]\d{3})*(?:[.,]\d{1,2})?(?:[\u0020\u00a0\u202f]?(?:[₴$€£¥₸₺₽₹]|zł|Br))?/u

/**
 * Ответ модели на вопрос.
 *
 * Разметку модели не доверяем — её текст экранируется целиком, — поэтому главное
 * число выделяем сами, по первому денежному значению в уже экранированной
 * строке. В промпте есть правило ставить его первым. Так ответ на вопрос
 * выглядит из того же материала, что и ответ на запись: жирная суть, обычный
 * текст вокруг.
 */
function answerReply(answer: string): string {
  const escaped = escapeHtml(answer)
  const m = escaped.match(MONEY_IN_TEXT)
  if (!m || m.index === undefined) return escaped
  return `${escaped.slice(0, m.index)}<b>${m[0]}</b>${escaped.slice(m.index + m[0].length)}`
}

/**
 * Ответ ассистента для мини-аппа.
 *
 * Тот же разбор и та же выжимка, что в чате, — второй промпт завёлся бы своей
 * жизнью и однажды начал бы отвечать иначе на тот же вопрос. Отличие одно:
 * записывать отсюда нельзя. В приложении для этого есть форма, а запись,
 * ушедшая в очередь и появившаяся «когда-нибудь потом», сбивала бы с толку
 * именно там, где операции видно сразу.
 */
export async function answerQuestion(
  env: Env,
  userId: number,
  text: string,
): Promise<{ ok: boolean; answer?: string; error?: string }> {
  // Квота общая с чатом: платим-то мы за то же самое, и разводить два счётчика
  // значит разрешить потратить дневной лимит дважды.
  if (await isRateLimited(env, 'gem', userId, MODEL_CALLS_PER_DAY, 86_400)) {
    return { ok: false, error: 'quota' }
  }
  const now = Date.now()
  const ctx = await loadContext(env, userId, now)
  const out = await askGemini(text, ctx, env, now)
  if (!out) return { ok: false, error: 'unavailable' }
  if (out.intent === 'answer' && out.answer) return { ok: true, answer: out.answer }
  if (out.intent === 'record' && out.ops.length > 0) return { ok: false, error: 'looks_like_record' }
  return { ok: false, error: 'unclear' }
}

/** Сводка дня — командой /today. Считаем сами: список операций наружу не уходит. */
async function sendToday(env: Env, userId: number): Promise<void> {
  const now = Date.now()
  const ctx = await loadContext(env, userId, now)
  await sendMessage(env, userId, todayReply(ctx), openKeyboard)
}

function todayReply(ctx: UserContext): string {
  const table = todayTable(ctx)
  if (!table) return 'Сегодня записей нет. Напиши, например: кофе 300'

  const lines = ['<b>Сегодня</b>', table]
  const left = allowance(ctx)
  if (left) {
    const perDay = Math.round(left.perDay)
    const today = Math.round(left.leftToday)
    const bar = `<code>${budgetBar(ctx.spentToday, left.perDay)}</code>  `
    lines.push(
      today >= 0
        ? `<blockquote>${bar}осталось ${formatMoney(today, ctx.currency)} из ${formatMoney(perDay, ctx.currency)}</blockquote>`
        : `<blockquote>${bar}перебор на ${formatMoney(-today, ctx.currency)} от ${formatMoney(perDay, ctx.currency)}</blockquote>`,
    )
  }
  return lines.join('\n')
}

/**
 * Вторая строка ответа — то, ради чего вообще стоит отвечать: сколько осталось.
 *
 * Для дохода дневной остаток не считается (он строится только из расходов), и
 * неподвижное число под записью зарплаты выглядело бы бессмысленно — там
 * уместнее итог месяца.
 */
function summaryLine(ops: ParsedOp[], ctx: UserContext, now: number): string | null {
  const cur = ctx.currency
  const onlyIncome = ops.every((o) => o.type === 'income')
  if (onlyIncome) {
    return `Доходы за ${monthName(mskDay(now))} — ${formatMoney(ctx.incomeMonth, cur)}`
  }

  // Запись задним числом сегодняшнего остатка не меняет, и «Сегодня потрачено
  // 0 ₴» под вчерашней тратой читается так, будто бот её не принял. Для таких
  // записей уместен итог месяца — он как раз изменился.
  const allBackdated = ops.every((o) => o.date && mskDayOfIso(o.date) !== mskDay(now))
  if (allBackdated) {
    return `Расходы за ${monthName(mskDay(now))} — ${formatMoney(ctx.spentMonth, cur)}`
  }

  const left = allowance(ctx)
  if (!left) return `Сегодня потрачено ${formatMoney(ctx.spentToday, cur)}`

  const perDay = Math.round(left.perDay)
  const today = Math.round(left.leftToday)
  // Полоса впереди текста: сначала видно, сколько лимита съедено, и только
  // потом читаются числа. Одного взгляда хватает, чтения не требуется.
  const bar = `<code>${budgetBar(ctx.spentToday, left.perDay)}</code>  `
  if (today >= 0) {
    return `${bar}осталось ${formatMoney(today, cur)} из ${formatMoney(perDay, cur)}`
  }
  return `${bar}перебор на ${formatMoney(-today, cur)} от ${formatMoney(perDay, cur)}`
}

/* ------------------------------------------------------------------ */
/* Кнопки                                                              */
/* ------------------------------------------------------------------ */

const pickKey = (userId: number, batch: string) => `pick:${userId}:${batch}`

async function handleCallback(q: TgCallbackQuery, env: Env): Promise<void> {
  if (!q.from?.id) return
  // Числом и ничем иным — id идёт в ключ KV (см. то же в handleMessage).
  const userId = Number(q.from.id)
  if (!Number.isSafeInteger(userId) || userId <= 0) return
  if (await isRateLimited(env, 'tgcb', userId, MSG_PER_MIN, 60)) return

  const data = q.data ?? ''
  const action = data.slice(0, 2)
  const rest = data.slice(2)

  if (action === 'u:') return undoBatch(q, env, userId, rest)
  if (action === 'c:') return offerCategories(q, env, userId, rest)
  if (action === 'p:') return pickCategory(q, env, userId, rest)
  if (action === 'm:') return showStartBranch(q, env, rest)
  await answerCallback(env, q.id)
}

/**
 * Ветки знакомства. Перерисовываем то же сообщение, а не шлём новое: иначе
 * человек, нажавший две кнопки подряд, получает простыню из трёх сообщений
 * вместо одного экрана, по которому можно ходить туда-обратно.
 */
async function showStartBranch(q: TgCallbackQuery, env: Env, branch: string): Promise<void> {
  await answerCallback(env, q.id)
  if (!q.message) return
  const screen =
    branch === 'q'
      ? { text: START_ASK, keyboard: branchKeyboard }
      : branch === 'h'
        ? { text: START_HOW, keyboard: branchKeyboard }
        : { text: START, keyboard: startKeyboard }
  await editMessageText(env, q.message.chat.id, q.message.message_id, screen.text, screen.keyboard)
}

/** «Отменить»: убрать пачку из очереди и переписать сообщение. */
async function undoBatch(q: TgCallbackQuery, env: Env, userId: number, batch: string): Promise<void> {
  const { removed } = await dropBatch(env, userId, batch)
  if (removed.length === 0) {
    // Приложение успело забрать запись: там она уже настоящая операция, и
    // удалять её должен человек в приложении, а не мы у него за спиной.
    await answerCallback(env, q.id, ALREADY_PULLED, true)
    return
  }

  await answerCallback(env, q.id)
  if (!q.message) return

  const ctx = await loadContext(env, userId, Date.now())
  const what = removed
    .map((e) => `${escapeHtml(nameOf(ctx, e.categoryId))} ${formatMoney(e.amount, e.currency ?? ctx.currency)}`)
    .join(', ')
  // Правим исходное сообщение, а не шлём второе: в чате не должно остаться
  // следа от записи, которой человек передумал.
  await editMessageText(env, q.message.chat.id, q.message.message_id, `Отменил: ${what}`)
}

/**
 * «Не та категория»: показать выбор прямо под записью.
 *
 * Без этой кнопки единственный способ поправить разбор — пойти в приложение, то
 * есть совершить ровно то действие, от которого мы и уводим.
 */
async function offerCategories(q: TgCallbackQuery, env: Env, userId: number, batch: string): Promise<void> {
  const inbox = await readInbox(env, userId)
  const mine = inbox.items.filter((e) => e.id.startsWith(`${batch}-`))
  if (mine.length === 0) {
    await answerCallback(env, q.id, ALREADY_PULLED, true)
    return
  }

  const ctx = await loadContext(env, userId, Date.now())
  const kind = mine[0].type
  const current = new Set(mine.map((e) => e.categoryId))

  // Порядок — по тратам этого человека за месяц: та категория, куда он и правда
  // носит деньги, должна стоять первой, а не той, что первая в общем списке.
  const weight = new Map(ctx.byCategory.map((c, i) => [c.id, i]))
  const candidates = ctx.categories
    .filter((c) => c.kind === kind && !current.has(c.id))
    .sort((a, b) => (weight.get(a.id) ?? 999) - (weight.get(b.id) ?? 999))
    .slice(0, PICK_SIZE)

  if (candidates.length === 0) {
    await answerCallback(env, q.id)
    return
  }

  // Список кладём в KV и ссылаемся на него номером: в callback_data всего 64
  // байта, а id своей категории человека — это 'c_' плюс cuid.
  await env.REFERRALS.put(
    pickKey(userId, batch),
    JSON.stringify(candidates.map((c) => c.id)),
    { expirationTtl: PICK_TTL_SEC },
  )

  await answerCallback(env, q.id)
  if (!q.message) return

  const rows: { text: string; callback_data: string }[][] = []
  candidates.forEach((c, i) => {
    if (i % 2 === 0) rows.push([])
    rows[rows.length - 1].push({ text: c.name, callback_data: `p:${batch}:${i}` })
  })
  // Текст сообщения не трогаем: запись уже верная по сумме, меняется только
  // клавиатура под ней.
  await editMessageText(env, q.message.chat.id, q.message.message_id, q.message.text ?? 'Записал', {
    inline_keyboard: rows,
  })
}

/** Выбор категории из предложенных: переставляем и возвращаем обычный вид записи. */
async function pickCategory(q: TgCallbackQuery, env: Env, userId: number, rest: string): Promise<void> {
  const sep = rest.lastIndexOf(':')
  const batch = sep > 0 ? rest.slice(0, sep) : ''
  const index = Number(rest.slice(sep + 1))
  if (!batch || !Number.isInteger(index) || index < 0 || index >= PICK_SIZE) {
    await answerCallback(env, q.id)
    return
  }

  const raw = await env.REFERRALS.get(pickKey(userId, batch))
  const ids = raw ? (JSON.parse(raw) as unknown) : null
  const categoryId = Array.isArray(ids) && typeof ids[index] === 'string' ? (ids[index] as string) : null
  if (!categoryId) {
    await answerCallback(env, q.id, 'Список устарел — напиши трату заново.', true)
    return
  }

  const updated = await setBatchCategory(env, userId, batch, categoryId)
  if (updated.length === 0) {
    await answerCallback(env, q.id, ALREADY_PULLED, true)
    return
  }
  await env.REFERRALS.delete(pickKey(userId, batch))
  await answerCallback(env, q.id)
  if (!q.message) return

  const now = Date.now()
  const ctx = await loadContext(env, userId, now)
  // Категорию выбрал человек, поэтому `guessed` больше не про эту запись: строка
  // «категорию не разобрал» после ручного выбора была бы издевательством.
  const ops: ParsedOp[] = updated.map((e) => ({
    type: e.type,
    amount: e.amount,
    currency: e.currency,
    categoryId: e.categoryId,
    note: e.note,
    date: /^\d{4}-\d{2}-\d{2}$/.test(e.date) ? e.date : undefined,
    guessed: false,
  }))
  await editMessageText(
    env,
    q.message.chat.id,
    q.message.message_id,
    recordReply(ops, ctx, now),
    recordKeyboard(batch),
  )
}

/** Экспорт для тестов ответов без сети. */
export const __test = { recordReply, summaryLine, opTitle, opDetail, todayReply, answerReply, budgetBar }
