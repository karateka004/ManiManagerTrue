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
 * КОГДА. Вечером по местному времени — 18:00–21:59 (у каждого свой час окна).
 * Пояс присылает приложение при синхронизации (`tz` в метаданных `data:<id>`);
 * у того, кто пишет только боту, пояса нет — для него окно по МСК. Раньше окно
 * было 15–20 МСК для всех, и у релокантов в Азии напоминание приходило ночью.
 * «Сегодня» и дни тишины тоже считаются по местным суткам.
 *
 * НОВИЧКАМ (первые два дня после первого появления) — свои тексты: с тем, что
 * уже записано, и с одним следующим шагом. Общая ротация на второй день читалась
 * как рассылка, и из вчерашних новичков не возвращался почти никто.
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
import { DAY_MS, mskDateStr, mskHour } from './days'
import { plural } from './facts'
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

/**
 * Новичкам — на первый и второй день после первого появления. Тот, кто ещё
 * ничего не записал, получает один шаг до первой записи; тот, кто начал, —
 * своё число записей и то, ради чего стоит продолжить.
 */
export function newbieText(day: number, ops: number): string {
  if (ops <= 0) {
    return day <= 1
      ? 'Кошель ждёт первую запись. Напиши сюда трату одной строкой — например: кофе 300 — и я сразу покажу итог дня.'
      : 'Чтобы увидеть, куда уходят деньги, хватит пары строк в день. Начни с одной: такси 450'
  }
  return day <= 1
    ? `В Кошеле уже ${plural(ops, ['запись', 'записи', 'записей'])}. Продолжим? Сегодняшние траты — одной строкой сюда: обед 350`
    : 'Ещё пара дней записей — и станет видно, на что уходит больше всего. Какие сегодня траты? Например: продукты 1200'
}

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

/**
 * Текст на сегодня: ежедневный или «возвращалка» — по тому, сколько человек
 * молчит. Ротация — по местным суткам человека (`tz` — минуты от UTC).
 */
export function pickReminderText(nowMs: number, quietDays = 1, tz = DEFAULT_TZ): string {
  const dayNum = localDay(nowMs, tz)
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
 * Окно рассылки — по местному времени человека: 18:00–21:59, четыре часа-слота.
 * Крон бьёт каждый час; в каждый — те, у кого сейчас местный час их слота.
 * Слот — стабильный хеш id: нагрузка размазана по окну, и второй раз за сутки
 * человек в рассылку не попадает по построению.
 */
export const REM_LOCAL_START = 18
export const REM_SLOTS = 4
/** Пояс по умолчанию — МСК: у тех, кто пишет только боту, пояса нет. */
export const DEFAULT_TZ = 180
/** Сообщений в секунду. С запасом ниже лимита Telegram (~30), чтобы не ловить 429. */
const REM_SEND_PER_SEC = 25
/** Дни тишины, в которые напоминаем после первых трёх. Дальше 30-го — молчим. */
const SPARSE_DAYS = new Set([5, 7, 10, 14, 21, 30])
/** Сколько дней после первого появления человек считается новичком. */
const NEWBIE_DAYS = 2

/** Пояс из недоверенного ввода: минуты от UTC, кратные 15, от −12 до +14 часов. */
export function cleanTz(x: unknown): number | undefined {
  // Только число: Number(null), Number('') и Number(false) — это 0, то есть UTC.
  return typeof x === 'number' && Number.isInteger(x) && x >= -720 && x <= 840 && x % 15 === 0 ? x : undefined
}

/** Номер местных суток (как mskDay, но для любого пояса). */
export function localDay(ms: number, tz: number): number {
  return Math.floor((ms + tz * 60_000) / DAY_MS)
}

/** Местный час (0–23). */
export function localHour(ms: number, tz: number): number {
  return (((Math.floor((ms + tz * 60_000) / 3_600_000)) % 24) + 24) % 24
}

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

export interface Candidate {
  id: string
  /** Тумблер в приложении по карточке блоба: 0 — выключен (старый путь). */
  rm?: number
  quietDays: number
  tz: number
  /** Новичок: какой по счёту день после первого появления и сколько записей. */
  newbie?: { day: number; ops: number }
}

/**
 * Кому напоминать в этот час. Только по метаданным двух списков — без единого
 * чтения значений: на тысячах людей чтение каждого упёрлось бы в потолок
 * подзапросов вызова.
 */
export async function reminderCandidates(env: Env, nowMs: number): Promise<Candidate[]> {
  // Запись боту — из метаданных очереди: последняя (`l`), первая (`f`), сколько (`n`).
  const bot = new Map<string, InboxMeta>()
  let cursor: string | undefined
  do {
    const page = await env.REFERRALS.list<InboxMeta>({ prefix: INBOX_PREFIX, cursor })
    for (const k of page.keys) {
      const id = k.name.slice(INBOX_PREFIX.length)
      const m = k.metadata
      if (id && typeof m?.l === 'number' && Number.isFinite(m.l)) bot.set(id, m)
    }
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)

  const out: Candidate[] = []
  const seen = new Set<string>()
  const consider = (id: string, lastActive: number, tz: number, firstSeen: number, ops: number, rm?: number) => {
    if (localHour(nowMs, tz) !== REM_LOCAL_START + slotForId(id, REM_SLOTS)) return
    // Без единой метки времени — человек не появлялся с тех пор, как метки
    // ввели (давно): не тревожим.
    if (!(lastActive > 0)) return
    const today = localDay(nowMs, tz)
    // Сегодня уже был — напоминать не о чем. Дни тишины — по местным суткам.
    const quietDays = today - localDay(lastActive, tz)
    if (!dueAfterQuiet(quietDays)) return
    const since = firstSeen > 0 ? today - localDay(firstSeen, tz) : Infinity
    out.push({ id, rm, quietDays, tz, ...(since >= 1 && since <= NEWBIE_DAYS ? { newbie: { day: since, ops } } : {}) })
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
      const b = bot.get(id)
      const app = typeof m?.updatedAt === 'number' ? m.updatedAt : 0
      const first = Math.min(...[m?.firstSeen, b?.f].filter((x): x is number => typeof x === 'number' && x > 0), Infinity)
      consider(
        id,
        Math.max(app, b?.l ?? 0),
        cleanTz(m?.tz) ?? DEFAULT_TZ,
        Number.isFinite(first) ? first : 0,
        Math.max(m?.c?.ops ?? 0, b?.n ?? 0),
        m?.c?.rm,
      )
    }
    dataCursor = page.list_complete ? undefined : page.cursor
  } while (dataCursor)

  // Пишут только боту, приложение не открывали: пояса нет — МСК.
  for (const [id, b] of bot) {
    if (!seen.has(id) && /^\d+$/.test(id)) consider(id, b.l ?? 0, DEFAULT_TZ, b.f ?? 0, b.n ?? 0)
  }
  return out
}

/** Итоги рассылки за сутки (по МСК) — для ночной сводки владельцу. */
export interface ReminderStats {
  sent: number
  newbies: number
  failed: number
}
const statKey = (dateStr: string) => `remstat:${dateStr}`

export async function readReminderStats(env: Env, dateStr: string): Promise<ReminderStats | null> {
  try {
    const raw = await env.REFERRALS.get(statKey(dateStr))
    return raw ? (JSON.parse(raw) as ReminderStats) : null
  } catch {
    return null
  }
}

/**
 * Почасовая рассылка (крон каждый час). `nowMs` — время запуска
 * (event.scheduledTime). В каждый час — только те, у кого сейчас их местный час.
 */
export async function runDailyReminders(env: Env, nowMs: number): Promise<void> {
  const mode = (env.REMINDERS_MODE ?? 'off').trim()
  if (mode === 'off') return

  // Тестовый режим: только владельцу и один раз в день — в 18 по МСК.
  if (mode === 'owner') {
    if (mskHour(nowMs) === REM_LOCAL_START) await sendMessage(env, env.OWNER_CHAT_ID, pickReminderText(nowMs), reminderKeyboard())
    return
  }

  const candidates = await reminderCandidates(env, nowMs)
  if (candidates.length === 0) return

  const stats: ReminderStats = { sent: 0, newbies: 0, failed: 0 }
  // Порциями: Telegram пускает около 30 сообщений в секунду на бота, дальше 429.
  for (let i = 0; i < candidates.length; i += REM_SEND_PER_SEC) {
    const started = Date.now()
    const batch = candidates.slice(i, i + REM_SEND_PER_SEC)
    // allSettled, а не all: один сбой чтения KV не должен обрывать рассылку
    // всему оставшемуся часу.
    const results = await Promise.allSettled(batch.map((c) => remindOne(env, c, nowMs)))
    results.forEach((r, j) => {
      if (r.status === 'rejected') console.error('[reminders] не отправлено', r.reason)
      else if (r.value === 'sent') {
        stats.sent++
        if (batch[j].newbie) stats.newbies++
      } else if (r.value === 'failed') stats.failed++
    })
    const spent = Date.now() - started
    if (spent < 1000 && i + REM_SEND_PER_SEC < candidates.length) await sleep(1000 - spent)
  }

  // Одна запись на час рассылки, а не на сообщение: на тысячах людей запись
  // KV на каждое напоминание стоила бы дороже самих напоминаний.
  if (stats.sent || stats.failed) {
    try {
      const key = statKey(mskDateStr(nowMs))
      const prev = (await readReminderStats(env, mskDateStr(nowMs))) ?? { sent: 0, newbies: 0, failed: 0 }
      const next = { sent: prev.sent + stats.sent, newbies: prev.newbies + stats.newbies, failed: prev.failed + stats.failed }
      await env.REFERRALS.put(key, JSON.stringify(next), { expirationTtl: 4 * 86_400 })
    } catch (e) {
      console.error('[reminders] итоги не записаны', e)
    }
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
async function remindOne(env: Env, c: Candidate, nowMs: number): Promise<'sent' | 'skipped' | 'failed'> {
  const choice = await env.REFERRALS.get(remindKey(c.id))
  if (choice === '0' || choice === 'b') return 'skipped'
  // Явного выбора на сервере нет, а тумблер в приложении выключен.
  if (choice !== '1' && c.rm === 0) return 'skipped'

  const text = c.newbie ? newbieText(c.newbie.day, c.newbie.ops) : pickReminderText(nowMs, c.quietDays, c.tz)
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
  return r.ok ? 'sent' : 'failed'
}
