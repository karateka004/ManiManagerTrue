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
 * модель, но только по итогам, которые посчитали мы (facts.ts), и ответ
 * собирается карточкой, которую оформляем мы сами (answer.ts).
 *
 * Тексты здесь — интерфейс, а не отладочный вывод: их читает человек, который
 * на ходу пишет «кофе 300». Поэтому ответ на запись — не «записано», а то, чего
 * он не держит в голове: сколько осталось на сегодня.
 */
import type { Env } from './env'
import { APP_URL, BTN_OPEN } from './app'
import { parseEntries } from './entry'
import { askGemini, askGeminiMedia, type ParsedOp } from './gemini'
import {
  answerCard,
  cardToText,
  DEFAULT_ANSWER_MODEL,
  ICONS,
  langOfTelegram,
  isSmallTalk,
  looksLikeQuestion,
  questionLang,
  readChat,
  renderTelegram,
  saveChat,
  titleOfText,
  type AnswerCard,
  type IconSet,
  type Lang,
  type Turn,
} from './answer'
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
  setEntryCategory,
  MAX_INBOX,
  MAX_INBOX_IMPORT,
  type InboxEntry,
} from './inbox'
import { CURRENCY_META, formatMoney } from './money'
import { MAX_IMPORT_ROWS, parseCsvRows } from './csv'
import { plural } from './facts'
import { isRateLimited } from './limits'
import { campaignTag, rememberSource } from './sources'
import {
  BTN_TURN_OFF,
  BTN_TURN_ON,
  BTN_TURN_ON_AGAIN,
  forgetBlock,
  REMINDER_OFF_DONE,
  REMINDER_ON_DONE,
  REMINDERS_OFF,
  REMINDERS_ON,
  reminderKeyboard,
  remindersEnabled,
  rememberSeen,
  setReminderChoice,
} from './reminders'
import {
  answerCallback,
  downloadFile,
  editMessageReplyMarkup,
  editMessageText,
  escapeHtml,
  keepTyping,
  sendMessage,
  sendMessageDraft,
  setMyCommands,
  setMyDescription,
  setMyShortDescription,
  type TgCallbackQuery,
  type TgMessage,
  type TgUpdate,
} from './tg'

export { APP_URL, BTN_OPEN }

/**
 * Дашборд аналитики. Открывается из бота кнопкой web_app — тогда вход идёт по
 * подписи Telegram владельца, без пароля (см. handleAdminStats).
 */
export const ADMIN_URL = 'https://koshel-worker.karateka004.workers.dev/admin'

/** Команды для синей кнопки «Меню». Их мало намеренно: с ботом говорят словами. */
export const BOT_COMMANDS = [
  { command: 'today', description: 'Траты за сегодня' },
  { command: 'help', description: 'Как записывать и спрашивать' },
  { command: 'reminders', description: 'Настроить напоминания' },
  { command: 'start', description: 'Что умеет Кошель' },
]

/**
 * Описание бота на пустом экране чата — до кнопки «Начать». Для пришедшего по
 * рекламе это первое, что он читает о Кошеле: что это и почему стоит нажать.
 * До 512 символов, без разметки.
 */
export const BOT_DESCRIPTION = [
  'Учёт денег без таблиц и форм — просто пиши траты в чат.',
  '',
  'Как в заметках: «кофе 300», «вчера такси 450», «обед 12 €». Можно голосом или фото чека. Кошель сам разложит траты по категориям, а с бюджетом на месяц ещё и подскажет, сколько можно потратить сегодня.',
  '',
  'Можно и спросить: «на что больше всего ушло в этом месяце?»',
  '',
  'Графики, цели и вся история — в приложении внутри Telegram. Бесплатно, регистрация не нужна.',
].join('\n')

/** Короткое описание: профиль бота и превью пересланной ссылки. До 120 символов. */
export const BOT_SHORT_DESCRIPTION =
  'Учёт денег без таблиц и форм: напиши «кофе 300», скажи голосом или пришли фото чека — Кошель всё запишет. Бесплатно.'

/**
 * Профиль бота (описания и меню команд) выставляется сам после выката: крон
 * рейтинга раз в пять минут сверяет отпечаток текстов с тем, что уже выставлено.
 * Раньше профиль обновлялся только вместе с регистрацией вебхука, и новые тексты
 * ждали, пока владелец вспомнит дёрнуть /admin/webhook. Отпечаток считается из
 * самих текстов — версию руками поднимать не нужно.
 */
const PROFILE_KEY = 'bot:profile'
const PROFILE_FAIL_KEY = 'bot:profile:fail'

export function botProfileFingerprint(): string {
  const src = JSON.stringify([BOT_DESCRIPTION, BOT_SHORT_DESCRIPTION, BOT_COMMANDS])
  let h = 2166136261
  for (let i = 0; i < src.length; i++) h = Math.imul(h ^ src.charCodeAt(i), 16777619) >>> 0
  return h.toString(36)
}

export async function ensureBotProfile(env: Env, force = false): Promise<boolean> {
  const fp = botProfileFingerprint()
  if (!force) {
    const [have, failed] = await Promise.all([env.REFERRALS.get(PROFILE_KEY), env.REFERRALS.get(PROFILE_FAIL_KEY)])
    // После неудачи — пауза на час: Telegram не принял тексты, и стучаться к
    // нему каждые пять минут с тем же отказом незачем.
    if (have === fp || failed === fp) return have === fp
  }
  const [d, sd, c] = await Promise.all([
    setMyDescription(env, BOT_DESCRIPTION),
    setMyShortDescription(env, BOT_SHORT_DESCRIPTION),
    setMyCommands(env, BOT_COMMANDS),
  ])
  if (d && sd && c) {
    await env.REFERRALS.put(PROFILE_KEY, fp)
    return true
  }
  console.error('[bot] профиль не выставлен', { description: d, short: sd, commands: c })
  await env.REFERRALS.put(PROFILE_FAIL_KEY, fp, { expirationTtl: 3600 })
  return false
}

/* ------------------------------------------------------------------ */
/* Тексты                                                              */
/* ------------------------------------------------------------------ */

/*
 * Знакомство — одно сообщение, которое перерисовывается кнопками, а не три
 * подряд. Главное действие — написать первую трату прямо сейчас, поэтому
 * сразу под примерами — вопрос «Какая была последняя трата?», а кнопки
 * второстепенны и стоят одним рядом: приложение и «Что ещё умею».
 *
 * Тексты выверены с критиком (2.2):
 *   - без эмодзи — как и ответы на записи: приветствие должно выглядеть тем же
 *     продуктом, что и всё остальное, а маркеры-эмодзи в Telegram выдают бота из
 *     конструктора;
 *   - никаких обещаний сверх умений: «сколько осталось на сегодня» — только с
 *     бюджетом месяца (и сказано, что он задаётся в приложении), про валюты —
 *     «по курсу не пересчитываю», вопросы — только те, что закрывает выжимка;
 *   - выключатель напоминаний не на приветствии (новичок их ещё не получал, и
 *     кнопка звала бы выключить), а там, где он нужен: под самим напоминанием,
 *     в меню (/reminders), в «Что ещё умею» и в Настройках приложения;
 *   - глаголы о человеке — без рода: «Какая была трата», а не «что потратил».
 *
 * Примеры — в цитате: так они читаются как образец, который можно повторить.
 */
export const START = [
  'Это <b>Кошель</b> — учёт денег без таблиц и форм.',
  '',
  'Пиши траты как в заметках — я запишу и сам разложу по категориям:',
  '<blockquote>кофе 300',
  'такси 450 и обед 380',
  'вчера продукты 1200</blockquote>',
  'Можно и голосовым, и фото чека.',
  'Записи появятся и в приложении — там графики, календарь трат и цели. А если задашь в нём бюджет на месяц, после каждой траты покажу, сколько осталось на сегодня.',
  '',
  'Какая была последняя трата? Напиши её сюда.',
].join('\n')

export const START_MORE = [
  '<b>Спрашивай</b> — отвечу по записям:',
  '<blockquote>на что ушло больше всего?',
  'трачу больше, чем раньше?',
  'когда накоплю на отпуск?</blockquote>',
  '',
  '<b>Голосом и фото</b> — скажи «кофе триста» или пришли фото чека: запишу итог и магазин. Скриншот истории из банка — тоже.',
  '',
  '<b>Другая валюта</b> — словом или знаком: «обед 12 €», «такси 15 лари». По курсу не пересчитываю.',
  '',
  '<b>В приложении</b> — лимиты по категориям и поиск, а за регулярный учёт — уровни и награды.',
  '',
  'Напоминания — /reminders, траты за сегодня — /today.',
  '<i>Сообщения разбирает Google Gemini: ему уходят текст, голосовые и фото, которые ты присылаешь, последние вопросы и итоги — по дням, месяцам и категориям, бюджет и цели, но не список трат.</i>',
].join('\n')

export const BTN_MORE = 'Что ещё умею'
export const BTN_BACK = '← Назад'

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
  'Голосом или фото — тоже запись:',
  'голосовое «такси четыреста пятьдесят»',
  'фото чека — запишу итог и магазин',
  '',
  'Можно спрашивать — я помню три последних вопроса:',
  'сколько я потратил за неделю',
  'на что больше всего ушло в этом месяце',
  'а в прошлом месяце?',
  'могу ли я купить кроссовки за 3000',
  'когда накоплю на отпуск</blockquote>',
  'Под записью — «Отменить» и «Не та категория». Сводка дня — /today, напоминания — /reminders.',
].join('\n')

const TOO_BIG = 'Похоже на опечатку — не записал. Проверь сумму.'
const NOT_TEXT = 'Понимаю текст, голосовые, фото чеков и файлы .csv. Напиши, например: кофе 300'
const CSV_MAX_BYTES = 1_000_000
const CSV_BAD =
  'Не смог прочитать файл. Нужен .csv до 1 МБ с колонками «Дата», «Сумма» (и по желанию «Тип», «Категория», «Валюта», «Заметка») — как выгрузка из Кошеля.'
const INBOX_FULL =
  `Накопилось ${MAX_INBOX} записей, и в приложение они ещё не перенеслись. ` +
  'Открой Кошель — он их заберёт, и я снова смогу записывать.'
const ALREADY_PULLED = 'Запись уже в приложении — поправить её можно там.'

const openButton = { text: BTN_OPEN, web_app: { url: APP_URL } }
const openKeyboard = { inline_keyboard: [[openButton]] }

/** Первый экран знакомства: приложение и «Что ещё умею» — одним рядом. */
const startKeyboard = {
  inline_keyboard: [[openButton, { text: BTN_MORE, callback_data: 'm:more' }]],
}

/** Ветка «Что ещё умею»: «Назад» на месте «Что ещё умею» — палец не двигается. */
const branchKeyboard = {
  inline_keyboard: [[openButton, { text: BTN_BACK, callback_data: 'm:0' }]],
}

/** Экран напоминаний (команда /reminders): что сейчас и переключатель. */
export function remindersScreen(on: boolean): { text: string; keyboard: unknown } {
  const toggle = on ? { text: BTN_TURN_OFF, callback_data: 'r:0:c' } : { text: BTN_TURN_ON, callback_data: 'r:1:c' }
  return { text: on ? REMINDERS_ON : REMINDERS_OFF, keyboard: { inline_keyboard: [[toggle]] } }
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
const MODEL_CALLS_PER_DAY = 50
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
  if (!text && msg.document && isCsvDocument(msg.document)) {
    await importCsv(env, userId, msg.document)
    return
  }
  const media = text ? null : mediaOf(msg)
  if (media) {
    await recordFromMedia(env, userId, msg, media, from.language_code)
    return
  }
  if (!text) {
    await sendMessage(env, userId, NOT_TEXT, openKeyboard)
    return
  }

  if (text.startsWith('/')) {
    const cmd = text.slice(1).split(/[\s@]/)[0].toLowerCase()
    if (cmd === 'start') {
      // «/start <метка>» — человек пришёл по рекламной ссылке на бота. Метку
      // запоминаем до ответа, но её сбой не должен стоить человеку приветствия.
      const tag = campaignTag(text.split(/\s+/)[1])
      if (tag) await rememberSource(env, from, tag, Date.now()).catch((e) => console.error('[start] метка не записана', e))
      // Вернулся после блокировки — снимаем нашу автоматическую отписку.
      await forgetBlock(env, userId).catch((e) => console.error('[start] блокировка не снята', e))
      // Первое появление: нажал Start и дальше не пошёл — завтра напомним как
      // новичку (других следов такой человек не оставляет).
      await rememberSeen(env, userId, Date.now()).catch((e) => console.error('[start] метка не записана', e))
      await sendMessage(env, userId, START, startKeyboard)
    } else if (cmd === 'today') await sendToday(env, userId)
    else if (cmd === 'reminders' || cmd === 'notifications') {
      const screen = remindersScreen(await remindersEnabled(env, userId))
      await sendMessage(env, userId, screen.text, screen.keyboard)
    }
    else if (cmd === 'icons' && String(userId) === String(env.OWNER_CHAT_ID).trim()) await setupIcons(env, userId, msg)
    else if (cmd === 'admin' && String(userId) === String(env.OWNER_CHAT_ID).trim()) {
      // Только владельцу и только в личке: кнопка web_app открывает дашборд
      // внутри Telegram, и вход идёт по его подписи — пароль не нужен.
      await sendMessage(env, userId, 'Аналитика Кошеля', {
        inline_keyboard: [[{ text: 'Открыть аналитику', web_app: { url: ADMIN_URL } }]],
      })
    } else await sendMessage(env, userId, HELP, openKeyboard)
    return
  }

  const now = Date.now()
  // «Печатает…» ставим ДО похода в модель и держим всё ожидание: дальше секунда-
  // другая тишины (а с ответом на вопрос — и больше), и без этой пометки человек
  // решит, что бот не получил сообщение.
  const stopTyping = keepTyping(env, userId)
  try {
    const [ctx] = await Promise.all([
      loadContext(env, userId, now),
      // Написал — значит, бот не заблокирован. Нашу автоматическую отписку
      // снимаем здесь, а не только на /start: разблокировавший бота часто сразу
      // пишет трату, и раньше так и оставался «заблокированным».
      forgetBlock(env, userId).catch((e) => console.error('[bot] блокировка не снята', e)),
    ])
    const question = looksLikeQuestion(text)

    // Вопрос без чисел — сразу к ответу, разбор записи не нужен: быстрее и на
    // вызов модели дешевле. С числом решает модель: «кофе 300?» и «могу ли
    // купить кроссовки за 3000?» — разные вещи.
    if (question && !/\d/.test(text)) {
      await replyWithAnswer(env, userId, text, ctx, now, { tgLang: from.language_code })
      return
    }

    const overQuota = await isRateLimited(env, 'gem', userId, MODEL_CALLS_PER_DAY, 86_400)
    const outcome = overQuota ? null : await askGemini(text, ctx, env, now)

    // Человек спросил, а не записал. Текст пишет модель, но строго по итогам,
    // которые посчитали мы, — выдумывать числа ей нечем. Похожее на вопрос
    // становится записью, только если модель прямо сказала «запись»: иначе из
    // «сколько я потратил 5 октября?» правила записали бы трату на 5.
    if (outcome?.intent === 'answer' || (question && outcome?.intent !== 'record')) {
      // Модель разбора не ответила (квота, сбой) — к модели ответов тоже не
      // идём: ответят правила.
      await replyWithAnswer(env, userId, text, ctx, now, { noModel: !outcome, tgLang: from.language_code })
      return
    }

    const { ops, reason } = resolveOps(outcome?.ops ?? [], text, ctx, now)
    if (ops.length === 0) {
      if (reason === 'too_big') await sendMessage(env, userId, TOO_BIG)
      // Суммы нет, и это не вопрос: «привет», «спасибо», «что ты умеешь» или
      // что-то непонятное. Отвечают правила — коротко и с подсказками, что
      // спросить, а не «Не нашёл сумму».
      else await replyWithAnswer(env, userId, text, ctx, now, { noModel: true, tgLang: from.language_code })
      return
    }

    await recordOps(env, userId, ops, ctx, now)
  } finally {
    stopTyping()
  }
}

function isCsvDocument(d: NonNullable<TgMessage['document']>): boolean {
  return /\.csv$/i.test(d.file_name ?? '') || /csv/i.test(d.mime_type ?? '')
}

/**
 * CSV файлом в чат — выписка банка или выгрузка Кошеля. Выбор файла в окне
 * мини-аппа на телефоне работает через раз (особенно на iOS), а «Поделиться →
 * Telegram» из почты или «Файлов» есть всегда.
 *
 * Записи идут в ту же очередь, что и сообщения боту, с пометкой `imp`:
 * приложение заберёт их при открытии и отсеет то, что уже записано, — выписку
 * присылают повторно и внахлёст.
 */
async function importCsv(env: Env, userId: number, doc: NonNullable<TgMessage['document']>): Promise<void> {
  if (!doc.file_id || (doc.file_size ?? 0) > CSV_MAX_BYTES) {
    await sendMessage(env, userId, CSV_BAD, openKeyboard)
    return
  }
  const stopTyping = keepTyping(env, userId)
  try {
    const now = Date.now()
    const [buf, ctx] = await Promise.all([downloadFile(env, doc.file_id, CSV_MAX_BYTES), loadContext(env, userId, now)])
    const text = buf ? new TextDecoder('utf-8').decode(buf) : ''
    const { rows, skipped, truncated } = parseCsvRows(text, ctx.categories, ctx.currency)
    if (rows.length === 0) {
      await sendMessage(env, userId, CSV_BAD, openKeyboard)
      return
    }
    const batch = newBatchId()
    const entries: InboxEntry[] = rows.map((r, i) => ({ id: entryId(batch, i), ...r, imp: 1 }))
    const saved = await appendInbox(env, userId, entries, { import: true })
    if (!saved.ok) {
      await sendMessage(
        env,
        userId,
        `В очереди уже много записей — вместе с файлом было бы больше ${MAX_INBOX_IMPORT}. Открой Кошель, он их заберёт, и пришли файл ещё раз.`,
        openKeyboard,
      )
      return
    }

    // Итоги по валютам: по ним видно, что файл прочитан правильно (знак, копейки).
    const sums = new Map<string, { out: number; in: number }>()
    for (const r of rows) {
      const k = r.currency ?? ''
      const v = sums.get(k) ?? { out: 0, in: 0 }
      if (r.type === 'expense') v.out += r.amount
      else v.in += r.amount
      sums.set(k, v)
    }
    const money = (n: number, cur: string) => formatMoney(Math.round(n * 100) / 100, cur || undefined)
    const lines = [...sums].map(([cur, v]) =>
      [v.out ? `расходы <b>${money(v.out, cur)}</b>` : '', v.in ? `доходы <b>${money(v.in, cur)}</b>` : ''].filter(Boolean).join(' · '),
    )
    const dates = rows.map((r) => r.date).sort()
    const day = (iso: string) => `${Number(iso.slice(8, 10))}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`
    const expenses = rows.filter((r) => r.type === 'expense').length
    const reply = [
      `<b>Файл принят: ${plural(rows.length, ['операция', 'операции', 'операций'])}</b>`,
      `${day(dates[0])} — ${day(dates[dates.length - 1])} · ${plural(expenses, ['расход', 'расхода', 'расходов'])}, ${plural(rows.length - expenses, ['доход', 'дохода', 'доходов'])}`,
      `<blockquote>${lines.join('\n')}</blockquote>`,
      skipped ? `Не разобрал строк: ${skipped}.` : '',
      truncated ? `Взял первые ${MAX_IMPORT_ROWS} строк — остальное пришли отдельным файлом.` : '',
      'Открой Кошель — операции появятся сами. Что уже записано, второй раз не добавлю.',
    ]
      .filter(Boolean)
      .join('\n')
    await sendMessage(env, userId, reply, {
      inline_keyboard: [[openButton], [{ text: 'Отменить', callback_data: `u:${batch}` }]],
    })
  } finally {
    stopTyping()
  }
}

/* ------------------------------------------------------------------ */
/* Голос и фото                                                        */
/* ------------------------------------------------------------------ */
/*
 * Сказать «кофе триста» или сфотографировать чек быстрее, чем набрать: на ходу,
 * с пакетами в руках, в очереди у кассы. Разбирает только модель — правилам
 * звук и картинка не по силам, — поэтому без ключа Gemini и сверх суточной
 * квоты честно просим написать текстом.
 */

/** Голосовое длиннее — уже рассказ, а не трата, да и разбор дольше. */
const VOICE_MAX_SEC = 120
/** Потолок файла: в модель он уходит целиком. Фото в чате Telegram и так сжимает до сотен КБ. */
const MEDIA_MAX_BYTES = 8_000_000

/** Звук, который понимает модель: как тип называет Telegram → как его ждёт Gemini. */
const AUDIO_MIME: Record<string, string> = {
  'audio/ogg': 'audio/ogg',
  'audio/mpeg': 'audio/mp3',
  'audio/mp3': 'audio/mp3',
  'audio/wav': 'audio/wav',
  'audio/x-wav': 'audio/wav',
  'audio/aac': 'audio/aac',
  'audio/flac': 'audio/flac',
}
const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])

const MEDIA_OFF = 'Голосовые и фото сейчас не разбираю — напиши текстом, например: кофе 300'
const MEDIA_QUOTA = 'На сегодня голосовых и фото хватит — до завтра пиши текстом, например: кофе 300'
const MEDIA_FAILED = 'Не получилось разобрать. Пришли ещё раз или напиши текстом, например: кофе 300'
const VOICE_LONG = `Длинновато — разбираю голосовые до ${VOICE_MAX_SEC / 60} минут. Хватит и короткого: «кофе триста, такси четыреста»`
const MEDIA_BIG = 'Файл тяжеловат. Фото пришли обычным способом, не файлом, — так оно станет легче.'
const VOICE_BIG = 'Файл тяжеловат — разбираю до 8 МБ. Запиши голосовое прямо в чате.'
const MEDIA_FORMAT = 'Такой файл не открою. Запиши голосовое прямо в чате или пришли фото чека.'
const VOICE_UNCLEAR = 'Не расслышал сумму. Скажи, например: «кофе триста» — или напиши текстом.'
const PHOTO_UNCLEAR =
  'Не нашёл на фото суммы к оплате. Сфотографируй чек целиком, чтобы был виден итог, — или напиши: продукты 1200'

/** Что пришло: сказанное (голосовое, кружок, аудио) или картинка — и можно ли его разобрать. */
interface Media {
  kind: 'voice' | 'photo'
  fileId?: string
  /** Тип для модели. */
  mime?: string
  /** Почему не берём: длинное, тяжёлое, незнакомый формат. */
  problem?: 'long' | 'big' | 'format'
}

function mediaOf(msg: TgMessage): Media | null {
  const said = (f: NonNullable<TgMessage['voice']>, mime: string | undefined): Media => {
    if (!mime || !f.file_id) return { kind: 'voice', problem: 'format' }
    if ((f.duration ?? 0) > VOICE_MAX_SEC) return { kind: 'voice', problem: 'long' }
    if ((f.file_size ?? 0) > MEDIA_MAX_BYTES) return { kind: 'voice', problem: 'big' }
    return { kind: 'voice', fileId: f.file_id, mime }
  }
  if (msg.voice) return said(msg.voice, 'audio/ogg')
  if (msg.video_note) return said(msg.video_note, 'video/mp4')
  if (msg.audio) return said(msg.audio, AUDIO_MIME[(msg.audio.mime_type ?? '').toLowerCase()])
  if (msg.photo?.length) {
    // Самый крупный снимок из тех, что пролезают в потолок: мелкий шрифт чека
    // читается только в полном размере.
    const best = msg.photo
      .filter((p) => p.file_id && (p.file_size ?? 0) <= MEDIA_MAX_BYTES)
      .sort((a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0))[0]
    return best?.file_id ? { kind: 'photo', fileId: best.file_id, mime: 'image/jpeg' } : { kind: 'photo', problem: 'big' }
  }
  // Картинка файлом — без сжатия Telegram: так часто шлют скриншоты из банка.
  const doc = msg.document
  if (doc && /^image\//i.test(doc.mime_type ?? '')) {
    const mime = (doc.mime_type ?? '').toLowerCase()
    if (!IMAGE_MIME.has(mime) || !doc.file_id) return { kind: 'photo', problem: 'format' }
    if ((doc.file_size ?? 0) > MEDIA_MAX_BYTES) return { kind: 'photo', problem: 'big' }
    return { kind: 'photo', fileId: doc.file_id, mime }
  }
  return null
}

/**
 * Голосовое или фото — в запись. Голос дальше идёт тем же путём, что и текст:
 * сказанное и есть сообщение («сколько я потратил за неделю?» голосом — это
 * вопрос). С фото проще: чек — запись, вопрос в подписи — ответ.
 */
async function recordFromMedia(env: Env, userId: number, msg: TgMessage, media: Media, tgLang?: string): Promise<void> {
  if (media.problem || !media.fileId || !media.mime) {
    const why =
      media.problem === 'long' ? VOICE_LONG : media.problem === 'big' ? (media.kind === 'photo' ? MEDIA_BIG : VOICE_BIG) : MEDIA_FORMAT
    await sendMessage(env, userId, why)
    return
  }
  if (!env.GEMINI_API_KEY?.trim()) {
    await sendMessage(env, userId, MEDIA_OFF)
    return
  }
  if (await isRateLimited(env, 'gem', userId, MODEL_CALLS_PER_DAY, 86_400)) {
    await sendMessage(env, userId, MEDIA_QUOTA)
    return
  }

  const stopTyping = keepTyping(env, userId)
  try {
    const now = Date.now()
    const [bytes, ctx] = await Promise.all([
      downloadFile(env, media.fileId, MEDIA_MAX_BYTES),
      loadContext(env, userId, now),
      forgetBlock(env, userId).catch((e) => console.error('[bot] блокировка не снята', e)),
    ])
    const caption = (msg.caption ?? '').trim()
    const preferred = env.GEMINI_ANSWER_MODEL?.trim() || DEFAULT_ANSWER_MODEL
    const outcome = bytes ? await askGeminiMedia({ mime: media.mime, bytes }, caption, ctx, env, now, preferred) : null
    if (!outcome) {
      await sendMessage(env, userId, MEDIA_FAILED)
      return
    }

    if (media.kind === 'photo') {
      if (outcome.intent === 'record') await recordOps(env, userId, outcome.ops, ctx, now)
      // Картинка с вопросом в подписи («могу ли я это купить?») — отвечаем на подпись.
      else if (outcome.intent === 'answer' && caption) await replyWithAnswer(env, userId, caption, ctx, now, { tgLang })
      else await sendMessage(env, userId, PHOTO_UNCLEAR)
      return
    }

    const said = outcome.heard ?? ''
    if (said && (outcome.intent === 'answer' || (looksLikeQuestion(said) && outcome.intent !== 'record'))) {
      // Над ответом — что услышали: голос не перечитаешь, а ответ на
      // ослышку без этой строки выглядел бы ответом невпопад.
      await replyWithAnswer(env, userId, said, ctx, now, { echo: said, tgLang })
      return
    }
    // Модель не нашла записи, а в расшифровке сумма есть — пусть попробуют правила.
    const { ops, reason } = resolveOps(outcome.ops, said, ctx, now)
    if (ops.length > 0) await recordOps(env, userId, ops, ctx, now)
    else await sendMessage(env, userId, reason === 'too_big' ? TOO_BIG : VOICE_UNCLEAR)
  } finally {
    stopTyping()
  }
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
  now: number,
): { ops: ParsedOp[]; reason?: 'no_amount' | 'too_big' } {
  if (fromModel.length > 0) return { ops: fromModel }

  const known = new Set(ctx.categories.map((c) => c.id))
  const byRules = parseEntries(text, known)
  if (Array.isArray(byRules) || byRules.ok) {
    const entries = Array.isArray(byRules) ? byRules : [byRules.entry]
    return {
      ops: entries.map((e) => ({
        type: e.kind,
        amount: e.amount,
        currency: e.currency,
        categoryId: e.categoryId,
        note: e.note,
        // «вчера» — тот же момент суток назад: приложение разложит его в
        // настоящий вчерашний день человека, а не во вчера по МСК (у живущих
        // не в МСК часть суток «вчера» иначе уезжала на день).
        ...(e.daysAgo ? { date: new Date(now - e.daysAgo * 86_400_000).toISOString() } : {}),
        guessed: e.guessed,
      })),
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
    // Валюта — явно, основная (ctx.currency). Без поля приложение отнесло бы
    // запись к той основной, что будет в момент слива, — а её могли сменить.
    // Основная неизвестна (приложение не открывали) — без валюты.
    currency: op.currency ?? ctx.currency,
    categoryId: op.categoryId,
    note: op.note,
    // Дата без времени — когда день назвала модель. Иначе точный момент:
    // приложение разложит его в настоящий локальный день этого человека.
    date: op.date && Number.isFinite(Date.parse(op.date)) ? op.date : new Date(now).toISOString(),
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
  const tail = [summaryLine(ops, ctx, now), ...limitLines(ops, ctx, now)].filter(Boolean)
  if (tail.length) lines.push(`<blockquote>${tail.join('\n')}</blockquote>`)
  return lines.join('\n')
}

/**
 * Лимит категории, в которую только что записали, — если он задан в
 * приложении. Это ровно то, чего человек не держит в голове: «Кафе: 4 200 из
 * 5 000» сразу после кофе полезнее любого «записано». Не больше двух строк.
 */
function limitLines(ops: ParsedOp[], ctx: UserContext, now: number): string[] {
  const today = mskDay(now)
  const seen = new Set<string>()
  const out: string[] = []
  for (const op of ops) {
    if (op.type !== 'expense' || seen.has(op.categoryId)) continue
    seen.add(op.categoryId)
    if ((op.currency ?? ctx.currency) !== ctx.currency) continue
    // Запись в прошлый месяц текущий лимит не трогает.
    if (op.date) {
      const d = new Date(mskDayOfIso(op.date) * 86_400_000)
      const t = new Date(today * 86_400_000)
      if (d.getUTCFullYear() !== t.getUTCFullYear() || d.getUTCMonth() !== t.getUTCMonth()) continue
    }
    const limit = ctx.limits.find((l) => l.id === op.categoryId)?.limit
    if (!limit) continue
    const spent = ctx.byCategory.find((c) => c.id === op.categoryId)?.sum ?? 0
    const name = escapeHtml(nameOf(ctx, op.categoryId))
    out.push(
      spent > limit
        ? `лимит «${name}» превышен на ${formatMoney(Math.round(spent - limit), ctx.currency)}`
        : `лимит «${name}»: ${formatMoney(Math.round(spent), ctx.currency)} из ${formatMoney(Math.round(limit), ctx.currency)}`,
    )
    if (out.length >= 2) break
  }
  return out
}

/**
 * Ответ ассистента для мини-аппа.
 *
 * Та же выжимка, та же модель и та же карточка, что в чате, — второй промпт
 * завёлся бы своей жизнью и однажды начал бы отвечать иначе на тот же вопрос.
 * Отличия два. Записывать отсюда нельзя: в приложении для этого есть форма, а
 * запись, ушедшая в очередь и появившаяся «когда-нибудь потом», сбивала бы с
 * толку именно там, где операции видно сразу. И память разговора приносит
 * само приложение — переписка живёт, пока открыт экран.
 *
 * `answer` — карточка простым текстом: его показывают приложения до 2.3.
 */
export async function answerQuestion(
  env: Env,
  userId: number,
  text: string,
  history: Turn[] = [],
  appLang?: Lang,
): Promise<{ ok: boolean; answer?: string; card?: AnswerCard; error?: string }> {
  const now = Date.now()
  const ctx = await loadContext(env, userId, now)
  if (!looksLikeQuestion(text) && /\d/.test(text)) {
    const known = new Set(ctx.categories.map((c) => c.id))
    const parsed = parseEntries(text, known)
    if (Array.isArray(parsed) || parsed.ok) return { ok: false, error: 'looks_like_record' }
  }
  // Квота общая с чатом: платим-то мы за то же самое, и разводить два счётчика
  // значит разрешить потратить дневной лимит дважды. Кончилась — отвечают
  // правила, а не «лимит исчерпан».
  const allowModel = !(await isRateLimited(env, 'gem', userId, MODEL_CALLS_PER_DAY, 86_400))
  const card = await answerCard(env, text, ctx, now, history, questionLang(text, appLang ?? ctx.lang), allowModel)
  return { ok: true, answer: cardToText(card), card }
}

/* ------------------------------------------------------------------ */
/* Иконки разделов (только владелец)                                   */
/* ------------------------------------------------------------------ */

/** Подписи иконок в том же порядке, что ICONS: владелец присылает эмодзи по этому списку. */
const ICON_NAMES: Record<(typeof ICONS)[number], string> = {
  money: 'деньги',
  chart: 'итоги, график',
  calendar: 'календарь, сравнение',
  budget: 'бюджет',
  category: 'категории',
  goal: 'цель',
  income: 'доходы',
  warning: 'внимание',
  tip: 'совет',
  help: 'помощь, как сделать',
}

/**
 * /icons — иконки у заголовков разделов ответа, как в примере владельца.
 *
 * Это кастомные эмодзи Telegram: боту они доступны, только если у владельца
 * бота есть Telegram Premium (или юзернейм с Fragment). Поэтому включаются
 * вручную: владелец присылает «/icons» и следом, в том же сообщении, свои
 * эмодзи по порядку. Бот сразу показывает пример; Telegram его не принял —
 * иконки не сохраняются. «/icons off» — выключить.
 */
async function setupIcons(env: Env, userId: number, msg: TgMessage): Promise<void> {
  const text = msg.text ?? ''
  if (/^\/icons(@\w+)?\s+off\s*$/i.test(text)) {
    await env.REFERRALS.delete(ICONS_KEY)
    iconsCache = null
    await sendMessage(env, userId, 'Иконки выключены: ответы без них.')
    return
  }
  const custom = (msg.entities ?? []).filter((e) => e.type === 'custom_emoji' && /^\d{1,24}$/.test(e.custom_emoji_id ?? ''))
  if (!custom.length) {
    await sendMessage(
      env,
      userId,
      [
        '<b>Иконки у разделов ответа</b>',
        'Пришли «/icons» и в том же сообщении кастомные эмодзи по порядку:',
        `<blockquote>${ICONS.map((k, i) => `${i + 1}. ${ICON_NAMES[k]}`).join('\n')}</blockquote>`,
        'Можно не все — сколько пришлёшь, столько и встанет. Нужен Telegram Premium у владельца бота: без него Telegram показывает обычные эмодзи. «/icons off» — выключить.',
      ].join('\n'),
    )
    return
  }
  const set: IconSet = {}
  custom.slice(0, ICONS.length).forEach((e, i) => {
    set[ICONS[i]] = { id: e.custom_emoji_id as string, fallback: text.slice(e.offset, e.offset + e.length) || '•' }
  })
  const sample: AnswerCard = {
    title: 'Так будут выглядеть ответы',
    lead: 'Иконки встают перед заголовками разделов.',
    sections: Object.keys(set).slice(0, 3).map((k) => ({
      heading: ICON_NAMES[k as (typeof ICONS)[number]],
      icon: k as (typeof ICONS)[number],
      rows: [{ label: 'Пример', value: '1 234 ₴' }],
    })),
    followups: [],
    source: 'rules',
  }
  const r = await sendMessage(env, userId, renderTelegram(sample, { icons: set }))
  if (!r.ok) {
    await sendMessage(env, userId, 'Telegram не принял эти эмодзи — иконки не сохранил. Похоже, у владельца бота нет Telegram Premium.')
    return
  }
  await env.REFERRALS.put(ICONS_KEY, JSON.stringify(set))
  iconsCache = null
  await sendMessage(env, userId, `Сохранил ${Object.keys(set).length} из ${ICONS.length}. Если в примере выше обычные эмодзи вместо своих — Telegram их не пустил, выключи: /icons off`)
}

/* ------------------------------------------------------------------ */
/* Ответ на вопрос в чате                                              */
/* ------------------------------------------------------------------ */

/**
 * Кнопки-продолжения под ответом: по одной в ряд — это целые вопросы, рядом
 * они обрезались бы. В callback_data только номер: сам вопрос — текст кнопки,
 * Telegram пришлёт его вместе с нажатием (message.reply_markup).
 */
function followupRows(items: string[]): { text: string; callback_data: string }[][] {
  return items.slice(0, 3).map((text, i) => [{ text, callback_data: `q:${i}` }])
}

/** Иконки разделов (команда /icons). Кэш в памяти изолята — чтобы не читать KV на каждый ответ. */
const ICONS_KEY = 'bot:icons'
let iconsCache: { at: number; value: IconSet | undefined } | null = null

async function readIcons(env: Env): Promise<IconSet | undefined> {
  if (iconsCache && Date.now() - iconsCache.at < 60_000) return iconsCache.value
  let value: IconSet | undefined
  try {
    const raw = await env.REFERRALS.get(ICONS_KEY)
    value = raw ? (JSON.parse(raw) as IconSet) : undefined
  } catch {
    value = undefined
  }
  iconsCache = { at: Date.now(), value }
  return value
}

/** Отправить карточку. Telegram не принял кастомные эмодзи — тут же без них. */
async function sendCard(
  env: Env,
  chatId: number,
  card: AnswerCard,
  opts: { echo?: string; extraRows?: unknown[][] } = {},
): Promise<void> {
  const rows = [...(opts.extraRows ?? []), ...followupRows(card.followups)]
  const keyboard = rows.length ? { inline_keyboard: rows } : undefined
  const icons = await readIcons(env)
  const r = await sendMessage(env, chatId, renderTelegram(card, { echo: opts.echo, icons }), keyboard)
  if (!r.ok && r.status === 400 && icons && Object.keys(icons).length) {
    console.error('[bot] карточка с иконками не принята — шлю без них')
    const plain = await sendMessage(env, chatId, renderTelegram(card, { echo: opts.echo }), keyboard)
    // Без иконок прошло — значит, дело в них (у владельца кончился Premium):
    // выключаем, иначе каждый ответ уходил бы дважды. Включить снова — /icons.
    if (plain.ok) {
      iconsCache = { at: Date.now(), value: undefined }
      await env.REFERRALS.delete(ICONS_KEY).catch(() => {})
    }
  }
}

/**
 * Ответить на вопрос карточкой и запомнить реплику.
 *
 * Пока думает модель, в чате висит родной пузырь «Думает…» (черновик с пустым
 * текстом) — понятнее, чем одно «печатает…» на десять секунд. Ответ правилами
 * мгновенный, черновик ему не нужен.
 */
async function replyWithAnswer(
  env: Env,
  userId: number,
  question: string,
  ctx: UserContext,
  now: number,
  opts: { echo?: string; noModel?: boolean; history?: Turn[]; tgLang?: string },
): Promise<void> {
  const allowModel =
    !opts.noModel && !isSmallTalk(question) && !(await isRateLimited(env, 'gem', userId, MODEL_CALLS_PER_DAY, 86_400))
  const draft = allowModel && env.GEMINI_API_KEY ? sendMessageDraft(env, userId, 1 + Math.floor(Math.random() * 2_000_000_000)) : null
  const history = opts.history ?? (await readChat(env, userId))
  const lang = questionLang(question, ctx.lang ?? langOfTelegram(opts.tgLang))
  const card = await answerCard(env, question, ctx, now, history, lang, allowModel)
  // Черновик обязан долететь раньше ответа: иначе «Думает…» повиснет под ним.
  await draft?.catch(() => {})
  await sendCard(env, userId, card, { echo: opts.echo })
  await saveChat(env, userId, [...history, { q: question, a: cardToText(card) }]).catch((e) =>
    console.error('[bot] реплика не сохранена', e),
  )
}

/** Вопросы под сводкой дня: из неё естественно продолжить разговор. */
const TODAY_FOLLOWUPS = ['А за неделю?', 'На что уходит больше всего?']

/** Сводка дня — командой /today. Считаем сами: список операций наружу не уходит. */
async function sendToday(env: Env, userId: number): Promise<void> {
  const now = Date.now()
  const ctx = await loadContext(env, userId, now)
  await sendMessage(env, userId, todayReply(ctx), {
    inline_keyboard: [[openButton], ...(ctx.ops > 0 ? followupRows(TODAY_FOLLOWUPS) : [])],
  })
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
  if (action === 'e:') return offerEntryCategories(q, env, userId, rest)
  if (action === 'p:') return pickCategory(q, env, userId, rest)
  if (action === 'b:') return backToRecord(q, env, userId, rest)
  if (action === 'q:') return askFollowup(q, env, userId, data)
  if (action === 'm:') return showStartBranch(q, env, rest)
  if (action === 'r:') return toggleReminders(q, env, userId, rest)
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
  // 'q' и 'h' — ветки прежнего знакомства: кнопки под старыми сообщениями в
  // чатах людей ведут сюда же.
  const screen =
    branch === 'more' || branch === 'q' || branch === 'h'
      ? { text: START_MORE, keyboard: branchKeyboard }
      : { text: START, keyboard: startKeyboard }
  await editMessageText(env, q.message.chat.id, q.message.message_id, screen.text, screen.keyboard)
}

/**
 * Включить или выключить напоминания кнопкой. `rest` — «<0|1>:<откуда>»:
 *   n — кнопка под самим напоминанием: сообщение становится подтверждением,
 *       и переключатель работает на месте («Включить снова» ↔ «Не напоминать»);
 *   c — экран команды /reminders: экран перерисовывается.
 */
async function toggleReminders(q: TgCallbackQuery, env: Env, userId: number, rest: string): Promise<void> {
  const [flag, ctx] = rest.split(':')
  const on = flag === '1'
  await setReminderChoice(env, userId, on)
  await answerCallback(env, q.id)
  if (!q.message) return
  const { chat, message_id } = q.message
  if (ctx === 'n') {
    // Под напоминанием: «Не напоминать» превращает его в подтверждение с
    // кнопкой вернуть, «Включить снова» — в короткое «готово».
    if (on) await editMessageText(env, chat.id, message_id, REMINDER_ON_DONE, reminderKeyboard())
    else {
      await editMessageText(env, chat.id, message_id, REMINDER_OFF_DONE, {
        inline_keyboard: [[{ text: BTN_TURN_ON_AGAIN, callback_data: 'r:1:n' }]],
      })
    }
    return
  }
  const screen = remindersScreen(on)
  await editMessageText(env, chat.id, message_id, screen.text, screen.keyboard)
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
  if (removed.some((e) => e.imp)) {
    await editMessageText(env, q.message.chat.id, q.message.message_id, `Отменил загрузку файла: ${plural(removed.length, ['операция', 'операции', 'операций'])}.`)
    return
  }

  const ctx = await loadContext(env, userId, Date.now())
  const what = removed
    .map((e) => `${escapeHtml(nameOf(ctx, e.categoryId))} ${formatMoney(e.amount, e.currency ?? ctx.currency)}`)
    .join(', ')
  // Правим исходное сообщение, а не шлём второе: в чате не должно остаться
  // следа от записи, которой человек передумал.
  await editMessageText(env, q.message.chat.id, q.message.message_id, `Отменил: ${what}`)
}

/**
 * Кнопка-продолжение под ответом («А в прошлом месяце?»). Вопрос — текст самой
 * кнопки: Telegram присылает клавиатуру сообщения вместе с нажатием.
 */
async function askFollowup(q: TgCallbackQuery, env: Env, userId: number, data: string): Promise<void> {
  const question = q.message?.reply_markup?.inline_keyboard
    ?.flat()
    .find((b) => b.callback_data === data)
    ?.text?.trim()
  if (!question) {
    // Сообщение старше двух суток Telegram присылает без клавиатуры.
    await answerCallback(env, q.id, 'Спроси это сообщением — кнопка устарела.')
    return
  }
  await answerCallback(env, q.id)
  const now = Date.now()
  const stopTyping = keepTyping(env, userId)
  try {
    const [ctx, turns] = await Promise.all([loadContext(env, userId, now), readChat(env, userId)])
    // Продолжение относится к ТОМУ ответу, под которым нажата кнопка. Если он
    // уже не последний в памяти (человек успел спросить другое), подкладываем
    // его текст — иначе «а в прошлом месяце?» продолжило бы чужой вопрос.
    const shown = (q.message?.text ?? '').slice(0, 900)
    const lastTitle = titleOfText(turns.at(-1)?.a ?? '')
    const history = shown && !(lastTitle && shown.includes(lastTitle)) ? [...turns, { q: '…', a: shown }].slice(-3) : turns
    await replyWithAnswer(env, userId, question, ctx, now, { echo: question, history, tgLang: q.from.language_code })
  } finally {
    stopTyping()
  }
}

/** Название и сумма записи для кнопки выбора: «Такси 450 ₴». */
function entryButtonText(ctx: UserContext, e: InboxEntry): string {
  return `${nameOf(ctx, e.categoryId)} ${formatMoney(e.amount, e.currency ?? ctx.currency)}`.slice(0, 40)
}

/**
 * «Не та категория»: показать выбор прямо под записью.
 *
 * Без этой кнопки единственный способ поправить разбор — пойти в приложение, то
 * есть совершить ровно то действие, от которого мы и уводим.
 *
 * В пачке из нескольких трат сначала спрашиваем, какую из них править: раньше
 * выбранная категория ставилась всем — «такси 450 и обед 380» становились
 * двумя «Кафе», а расход рядом с зарплатой получал доходную категорию.
 */
async function offerCategories(q: TgCallbackQuery, env: Env, userId: number, batch: string): Promise<void> {
  const inbox = await readInbox(env, userId)
  const mine = inbox.items.filter((e) => e.id.startsWith(`${batch}-`))
  if (mine.length === 0) {
    await answerCallback(env, q.id, ALREADY_PULLED, true)
    return
  }
  if (mine.length === 1) {
    return showCategoryChoice(q, env, userId, batch, mine[0])
  }

  await answerCallback(env, q.id)
  if (!q.message) return
  const ctx = await loadContext(env, userId, Date.now())
  const rows = mine.map((e) => [{ text: entryButtonText(ctx, e), callback_data: `e:${batch}:${e.id.slice(batch.length + 1)}` }])
  rows.push([{ text: BTN_BACK, callback_data: `b:${batch}` }])
  await editMessageReplyMarkup(env, q.message.chat.id, q.message.message_id, { inline_keyboard: rows })
}

/** Выбрана запись пачки — показать категории для неё. `rest` — «<пачка>:<номер>». */
async function offerEntryCategories(q: TgCallbackQuery, env: Env, userId: number, rest: string): Promise<void> {
  const sep = rest.lastIndexOf(':')
  const batch = sep > 0 ? rest.slice(0, sep) : ''
  const entry = (await readInbox(env, userId)).items.find((e) => e.id === `${batch}-${rest.slice(sep + 1)}`)
  if (!batch || !entry) {
    await answerCallback(env, q.id, ALREADY_PULLED, true)
    return
  }
  return showCategoryChoice(q, env, userId, batch, entry)
}

/** Категории того же вида, что у записи, — по тратам человека за месяц. */
async function showCategoryChoice(
  q: TgCallbackQuery,
  env: Env,
  userId: number,
  batch: string,
  entry: InboxEntry,
): Promise<void> {
  const ctx = await loadContext(env, userId, Date.now())
  // Порядок — по тратам этого человека за месяц: та категория, куда он и правда
  // носит деньги, должна стоять первой, а не той, что первая в общем списке.
  const weight = new Map(ctx.byCategory.map((c, i) => [c.id, i]))
  const candidates = ctx.categories
    .filter((c) => c.kind === entry.type && c.id !== entry.categoryId)
    .sort((a, b) => (weight.get(a.id) ?? 999) - (weight.get(b.id) ?? 999))
    .slice(0, PICK_SIZE)

  if (candidates.length === 0) {
    await answerCallback(env, q.id)
    return
  }

  // Список кладём в KV и ссылаемся на него номером: в callback_data всего 64
  // байта, а id своей категории человека — это 'c_' плюс cuid. Вместе со
  // списком — какую запись пачки правим.
  const index = Number(entry.id.slice(batch.length + 1))
  await env.REFERRALS.put(
    pickKey(userId, batch),
    JSON.stringify({ i: index, ids: candidates.map((c) => c.id) }),
    { expirationTtl: PICK_TTL_SEC },
  )

  await answerCallback(env, q.id)
  if (!q.message) return

  const rows: { text: string; callback_data: string }[][] = []
  candidates.forEach((c, i) => {
    if (i % 2 === 0) rows.push([])
    rows[rows.length - 1].push({ text: c.name, callback_data: `p:${batch}:${i}` })
  })
  rows.push([{ text: BTN_BACK, callback_data: `b:${batch}` }])
  // Текст сообщения не трогаем: запись уже верная по сумме, меняется только
  // клавиатура под ней.
  await editMessageReplyMarkup(env, q.message.chat.id, q.message.message_id, { inline_keyboard: rows })
}

/** «Назад» из выбора — вернуть обычные кнопки записи. */
async function backToRecord(q: TgCallbackQuery, env: Env, userId: number, batch: string): Promise<void> {
  await answerCallback(env, q.id)
  if (!q.message || !batch) return
  await editMessageReplyMarkup(env, q.message.chat.id, q.message.message_id, recordKeyboard(batch))
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
  let pick: unknown = null
  try {
    pick = raw ? JSON.parse(raw) : null
  } catch {
    pick = null
  }
  // До 2.3 в KV лежал просто список id — для всей пачки сразу.
  const ids = Array.isArray(pick) ? pick : (pick as { ids?: unknown })?.ids
  const entryIndex = Array.isArray(pick) ? null : Number((pick as { i?: unknown })?.i)
  const categoryId = Array.isArray(ids) && typeof ids[index] === 'string' ? (ids[index] as string) : null
  if (!categoryId) {
    await answerCallback(env, q.id, 'Список устарел — напиши трату заново.', true)
    return
  }

  const updated =
    entryIndex !== null && Number.isInteger(entryIndex)
      ? await setEntryCategory(env, userId, batch, entryIndex, categoryId)
      : await setBatchCategory(env, userId, batch, categoryId)
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
  // Дата — любая, какая была: подпись дня (вчера, 9 сентября) считается из неё
  // же, а сегодняшний момент подписи не получит.
  const ops: ParsedOp[] = updated.map((e) => ({
    type: e.type,
    amount: e.amount,
    currency: e.currency,
    categoryId: e.categoryId,
    note: e.note,
    date: e.date,
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
export const __test = { recordReply, summaryLine, limitLines, opTitle, opDetail, todayReply, budgetBar, remindersScreen, resolveOps, followupRows }
