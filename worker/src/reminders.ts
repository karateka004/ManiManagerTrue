/**
 * Вечерние напоминания записать траты: кому, когда, каким текстом — и как их
 * выключить.
 *
 * КОМУ. Тем, кто ведёт учёт: в приложении (ключ `data:<id>`) или сообщениями
 * боту (`inbox:<id>`). Раньше в рассылку попадали только пользователи
 * приложения, а человек, записывающий траты одними сообщениями, напоминаний не
 * получал вовсе — хотя ответить на них ему проще всех.
 *
 * НЕ НАПОМИНАЕМ, если сегодня человек уже был: синхронизировал приложение или
 * написал боту. Раньше смотрели только на приложение, и тот, кто днём записал
 * три траты сообщениями, вечером получал «Что сегодня потратил?».
 *
 * КАК ЧАСТО. Первые три дня тишины — каждый вечер, потом всё реже: на 5, 7, 10,
 * 14, 21 и 30-й день, дальше молчим. Раньше напоминание шло каждый вечер всем,
 * кто не заходил, — и тому, кто бросил полгода назад. Такие сообщения не
 * возвращают, а раздражают: человек блокирует бота и заодно теряет запись
 * сообщениями. Пропавшим (5+ дней) — свои тексты, без упрёка.
 *
 * ВЫКЛЮЧИТЬ. В приложении (Настройки → Уведомления) и в боте: /reminders и
 * кнопка «Не напоминать» под самим напоминанием. Источник правды —
 * ключ `remind:<id>`:
 *   '1' — включил сам;  '0' — выключил сам;
 *   'b' — бот заблокирован (Telegram ответил 403), выключили мы.
 * Ключа нет — действует умолчание: включено, если человек не выключил тумблер
 * в приложении (`rm: 0` в карточке метаданных блоба — старый путь, когда запрос
 * с тумблера до сервера не дошёл). Явный выбор на сервере важнее карточки:
 * включил в боте после того, как выключил в приложении, — напоминаем.
 */
import type { Env } from './env'
import { DATA_PREFIX, type DataMeta } from './analytics'
import { INBOX_PREFIX, type InboxMeta } from './inbox'
import { mskDay, startOfTodayMskMs, MSK_OFFSET_MS } from './days'
import { sendMessage } from './tg'

export const REMIND_PREFIX = 'remind:'
const remindKey = (id: string | number) => `${REMIND_PREFIX}${id}`

/* ------------------------------------------------------------------ */
/* Тексты                                                              */
/* ------------------------------------------------------------------ */

/**
 * Ежедневные — ротация по дню МСК (у всех в один день один текст). Каждый
 * зовёт ответить прямо в чат и даёт пример, который можно повторить: ответ на
 * напоминание стоит одного сообщения. У каждого свой повод — вопрос, память,
 * день без трат, вчерашнее, ответ бота, доходы, итог месяца, — чтобы неделя
 * напоминаний не читалась одной фразой по кругу. Без «вечера» (окно начинается
 * в 15:00 МСК, а у релокантов в Азии это уже ночь), без морали и без рода:
 * «Какие были траты», а не «что потратил».
 */
export const REMINDER_TEXTS = [
  'Какие сегодня были траты? Напиши сюда одной строкой, например: кофе 300',
  'Запиши траты, пока помнишь. Хватит одной строки: такси 450',
  'Сегодня пока без трат? Так тоже бывает. А если что-то было — напиши: обед 350',
  'Вчерашние траты тоже можно записать: вчера продукты 1200',
  'Напиши трату — в ответ покажу итог дня. Например: аптека 480',
  'Доходы тоже пиши сюда — с плюсом впереди: +5000 подработка',
  'Пара строк в день — и к концу месяца ясно, на что ушли деньги. Например: кино 600',
]

/**
 * Для тех, кто молчит пять дней и больше. Не «давно не виделись» — это
 * напоминание о провале, — а снятое препятствие: восстанавливать пропущенное
 * не нужно, учёт не обязан быть идеальным.
 */
export const COMEBACK_TEXTS = [
  'Не нужно вспоминать всё, что было: продолжить можно с любой траты. Хоть с этой: такси 450',
  'Учёт не обязан быть идеальным: даже часть трат уже показывает, куда уходят деньги. Запиши одну: продукты 1200',
  'Если учёт снова понадобится — я здесь. Одна строка — и продолжим: обед 350',
]

/** Кнопка под напоминанием: выключить, не уходя из чата. */
export const REMINDER_BUTTON = 'Не напоминать'

/**
 * Экран /reminders. Главное успокоение — как часто бот пишет и что будет, если
 * человек пропадёт: «всё реже, а через месяц замолчу».
 */
export const REMINDERS_ON = [
  '<b>Напоминания включены</b>',
  'В дни без записей напоминаю ближе к вечеру, не чаще раза в день. Если записей долго не будет, буду писать всё реже, а через месяц замолчу.',
].join('\n')

export const REMINDERS_OFF = [
  '<b>Напоминания выключены</b>',
  'Включи — и в дни без записей я буду напоминать ближе к вечеру, не чаще раза в день.',
].join('\n')

/** Во что превращается напоминание после «Не напоминать»: запись сообщениями остаётся. */
export const REMINDER_OFF_DONE = 'Хорошо, больше не напоминаю. Траты сюда можно записывать в любой момент.'
export const REMINDER_ON_DONE = 'Включил: в дни без записей напомню ближе к вечеру.'

export const BTN_TURN_OFF = 'Выключить'
export const BTN_TURN_ON = 'Включить'
export const BTN_TURN_ON_AGAIN = 'Включить снова'

/** Текст на сегодня: ежедневный или «возвращалка» — по тому, сколько человек молчит. */
export function pickReminderText(nowMs: number, quietDays = 1): string {
  const dayNum = Math.floor((nowMs + MSK_OFFSET_MS) / 86_400_000)
  const list = quietDays >= 5 ? COMEBACK_TEXTS : REMINDER_TEXTS
  return list[((dayNum % list.length) + list.length) % list.length]
}

/* ------------------------------------------------------------------ */
/* Выбор человека                                                      */
/* ------------------------------------------------------------------ */

/** Явный выбор на сервере: true/false, null — не выбирал. 'b' (заблокировал бота) — тоже «выключено». */
export async function readReminderChoice(env: Env, id: string | number): Promise<boolean | null> {
  const v = await env.REFERRALS.get(remindKey(id))
  if (v === '1') return true
  if (v === '0' || v === 'b') return false
  return null
}

/**
 * Включены ли напоминания — с учётом умолчания. Карточку из метаданных блоба
 * читаем без самого блоба: `list` по точному имени. Ключ `data:<id>` — самый
 * короткий из всех с таким началом, поэтому в выдаче он первый.
 */
export async function remindersEnabled(env: Env, id: string | number): Promise<boolean> {
  const choice = await readReminderChoice(env, id)
  if (choice !== null) return choice
  return cardAllowsReminders(env, id)
}

/** Тумблер в карточке блоба (`rm: 0` — выключен в приложении); карточки нет — включено. */
async function cardAllowsReminders(env: Env, id: string | number): Promise<boolean> {
  const page = await env.REFERRALS.list<DataMeta>({ prefix: `${DATA_PREFIX}${id}`, limit: 1 })
  const own = page.keys[0]
  return !(own && own.name === `${DATA_PREFIX}${id}` && own.metadata?.c?.rm === 0)
}

/**
 * Что показать на тумблере в приложении — выбор САМОГО человека.
 *
 * Отличается от remindersEnabled одним: 'b' (Telegram сказал, что бот
 * заблокирован) — не выбор человека, а наше техническое состояние. Раньше
 * приложение получало на нём «выключено», записывало это в свой стор, и после
 * разблокировки напоминания уже не оживали: в карточке блоба оставался `rm: 0`.
 */
export async function reminderPreference(env: Env, id: string | number): Promise<boolean> {
  const v = await env.REFERRALS.get(remindKey(id))
  if (v === '1') return true
  if (v === '0') return false
  return cardAllowsReminders(env, id)
}

export async function setReminderChoice(env: Env, id: string | number, on: boolean): Promise<void> {
  const v = on ? '1' : '0'
  // Метаданные дублируют значение: аналитика собирает выбор одним `list`, а
  // список значений ключей не отдаёт.
  await env.REFERRALS.put(remindKey(id), v, { metadata: { v } })
}

/**
 * Человек вернулся (написал боту) после того, как заблокировал его. Нашу
 * автоматическую отписку снимаем — напоминания снова по умолчанию, — а метку
 * «заблокировал» убираем: для аналитики он больше не потерян. Выключенное им
 * самим ('0') не трогаем.
 */
export async function forgetBlock(env: Env, id: string | number): Promise<void> {
  const [blocked, choice] = await Promise.all([
    env.REFERRALS.get(`blocked:${id}`),
    env.REFERRALS.get(remindKey(id)),
  ])
  if (!blocked && choice !== 'b') return
  const jobs: Promise<unknown>[] = []
  if (blocked) jobs.push(env.REFERRALS.delete(`blocked:${id}`))
  // До 2.2 автоматическая отписка писала '0' вместе с меткой блокировки —
  // такой '0' тоже наш, а не человека.
  if (choice === 'b' || (blocked && choice === '0')) jobs.push(env.REFERRALS.delete(remindKey(id)))
  await Promise.all(jobs)
}

/* ------------------------------------------------------------------ */
/* Расписание                                                          */
/* ------------------------------------------------------------------ */

/**
 * Окно рассылки: крон почасово в 12–17 UTC = 15:00–20:00 МСК. Каждый человек
 * привязан к своему часу (REM_SLOTS штук) детерминированным хешем id.
 */
export const REM_WINDOW_START_UTC = 12
export const REM_SLOTS = 6
/** Сообщений в секунду. С запасом ниже лимита Telegram (~30), чтобы не ловить 429. */
const REM_SEND_PER_SEC = 25
/** Дни тишины, в которые напоминаем после первых трёх. Дальше 30-го — молчим. */
const SPARSE_DAYS = new Set([5, 7, 10, 14, 21, 30])

/** Час-слот человека в окне рассылки (стабильный хеш id). */
export function slotForId(id: string, slots: number): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h % slots
}

/** Напоминать ли после стольких дней тишины. */
export function dueAfterQuiet(quietDays: number): boolean {
  if (quietDays < 1) return false
  return quietDays <= 3 || SPARSE_DAYS.has(quietDays)
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

interface Candidate {
  id: string
  /** Тумблер в приложении по карточке блоба: 0 — выключен (старый путь). */
  rm?: number
  quietDays: number
}

/**
 * Кому напоминать в этот час. Только по метаданным двух списков — без единого
 * чтения значений: на тысячах людей чтение каждого упёрлось бы в потолок
 * подзапросов вызова.
 */
export async function reminderCandidates(env: Env, nowMs: number, slot: number): Promise<Candidate[]> {
  const today = mskDay(nowMs)
  const todayStart = startOfTodayMskMs(nowMs)

  // Последняя запись боту — из метаданных очереди (`l`).
  const botLast = new Map<string, number>()
  let cursor: string | undefined
  do {
    const page = await env.REFERRALS.list<InboxMeta>({ prefix: INBOX_PREFIX, cursor })
    for (const k of page.keys) {
      const id = k.name.slice(INBOX_PREFIX.length)
      const l = k.metadata?.l
      if (id && typeof l === 'number' && Number.isFinite(l)) botLast.set(id, l)
    }
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)

  const out: Candidate[] = []
  const seen = new Set<string>()
  const consider = (id: string, lastActive: number, rm?: number) => {
    if (slotForId(id, REM_SLOTS) !== slot) return
    // Сегодня уже был — напоминать не о чем.
    if (lastActive >= todayStart) return
    // Без единой метки времени — человек не появлялся с тех пор, как метки
    // ввели (давно): не тревожим.
    if (!(lastActive > 0)) return
    const quietDays = today - mskDay(lastActive)
    if (!dueAfterQuiet(quietDays)) return
    out.push({ id, rm, quietDays })
  }

  let dataCursor: string | undefined
  do {
    const page: KVNamespaceListResult<DataMeta> = await env.REFERRALS.list<DataMeta>({
      prefix: DATA_PREFIX,
      cursor: dataCursor,
    })
    for (const k of page.keys) {
      const id = k.name.slice(DATA_PREFIX.length)
      if (!id || !/^\d+$/.test(id)) continue
      seen.add(id)
      const m = k.metadata
      const app = typeof m?.updatedAt === 'number' ? m.updatedAt : 0
      consider(id, Math.max(app, botLast.get(id) ?? 0), m?.c?.rm)
    }
    dataCursor = page.list_complete ? undefined : page.cursor
  } while (dataCursor)

  // Пишут только боту, приложение не открывали.
  for (const [id, l] of botLast) {
    if (!seen.has(id) && /^\d+$/.test(id)) consider(id, l)
  }
  return out
}

/**
 * Почасовая рассылка (крон на каждый час окна). `nowMs` — время запуска
 * (event.scheduledTime). В каждый час — только те, чей слот = текущему часу.
 */
export async function runDailyReminders(env: Env, nowMs: number): Promise<void> {
  const mode = (env.REMINDERS_MODE ?? 'off').trim()
  if (mode === 'off') return

  const slot = new Date(nowMs).getUTCHours() - REM_WINDOW_START_UTC

  // Тестовый режим: только владельцу и один раз в день (на первом часу окна).
  if (mode === 'owner') {
    if (slot === 0) await sendMessage(env, env.OWNER_CHAT_ID, pickReminderText(nowMs), reminderKeyboard())
    return
  }

  // Вне окна (крон сработал в неожиданный час) — ничего.
  if (slot < 0 || slot >= REM_SLOTS) return

  const candidates = await reminderCandidates(env, nowMs, slot)

  // Порциями: Telegram пускает около 30 сообщений в секунду на бота, дальше 429.
  for (let i = 0; i < candidates.length; i += REM_SEND_PER_SEC) {
    const started = Date.now()
    // allSettled, а не all: один сбой чтения KV не должен обрывать рассылку
    // всему оставшемуся слоту.
    const results = await Promise.allSettled(candidates.slice(i, i + REM_SEND_PER_SEC).map((c) => remindOne(env, c, nowMs)))
    for (const r of results) if (r.status === 'rejected') console.error('[reminders] не отправлено', r.reason)
    const spent = Date.now() - started
    if (spent < 1000 && i + REM_SEND_PER_SEC < candidates.length) await sleep(1000 - spent)
  }
}

/** Кнопка под напоминанием. */
export function reminderKeyboard() {
  return { inline_keyboard: [[{ text: REMINDER_BUTTON, callback_data: 'r:0:n' }]] }
}

/**
 * Напоминание одному человеку.
 *
 * Метку «уже слали сегодня» не пишем: у каждого свой час в окне, и второй раз
 * в тот же день он в крон не попадает по построению.
 */
async function remindOne(env: Env, c: Candidate, nowMs: number): Promise<void> {
  const choice = await env.REFERRALS.get(remindKey(c.id))
  if (choice === '0' || choice === 'b') return
  // Явного выбора на сервере нет, а тумблер в приложении выключен.
  if (choice !== '1' && c.rm === 0) return

  const text = pickReminderText(nowMs, c.quietDays)
  let r = await sendMessage(env, c.id, text, reminderKeyboard())
  if (r.status === 429) {
    await sleep(1500)
    r = await sendMessage(env, c.id, text, reminderKeyboard())
  }
  if (r.status === 403) {
    // Бот заблокирован или аккаунт удалён — больше не беспокоим и метим для
    // аналитики. 'b', а не '0': вернётся — напоминания оживут (forgetBlock).
    await env.REFERRALS.put(remindKey(c.id), 'b', { metadata: { v: 'b' } })
    await env.REFERRALS.put(`blocked:${c.id}`, '1')
  }
}
