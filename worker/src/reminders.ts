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
 * Пояс присылает приложение 2.6+ при синхронизации (`tz` в метаданных
 * `data:<id>`). Пока не прислало — пояс по валюте, если она почти однозначно
 * указывает на него (бат, тенге, лари…), иначе прежнее раннее окно 15–18 МСК:
 * сдвинуть всех без пояса на 18–21 МСК значило бы будить Бангкок в полночь.
 * «Сегодня» и дни тишины тоже считаются по местным суткам.
 *
 * НОВИЧКАМ (первые два дня после первого появления) — свои тексты: с тем, что
 * уже записано, и с одним следующим шагом, и кнопка приложения. Общая ротация
 * на второй день читалась как рассылка, и из вчерашних новичков не возвращался
 * почти никто. Сюда же — кто нажал Start в боте и ни разу ничего не записал
 * (`seen:<id>`): писать им бот может, а других следов они не оставляют.
 * Кто был один день и не вернулся, получает 1, 2, 5 и 14-й день — не девять
 * сообщений за месяц человеку, который попробовал однажды.
 *
 * ВЫКЛЮЧИТЬ. В приложении (Настройки → Уведомления) и в боте: /reminders и
 * кнопка «Не напоминать» под самим напоминанием. Источник правды —
 * ключ `remind:<id>`:
 *   '1' — включил сам;  '0' — выключил сам;
 *   'b' — бот заблокирован (Telegram ответил 403), выключили мы;
 *   'n' — писать нельзя: человек не нажимал Start (403 «can't initiate
 *         conversation»), тоже мы. Разрешит в приложении или напишет боту — оживёт.
 * Ключа нет — действует умолчание: включено, если человек не выключил тумблер
 * в приложении (`rm: 0` в карточке метаданных блоба — старый путь, когда запрос
 * с тумблера до сервера не дошёл). Явный выбор на сервере важнее карточки:
 * включил в боте после того, как выключил в приложении, — напоминаем.
 */
import type { Env } from './env'
import { DATA_PREFIX, type DataMeta } from './analytics'
import { INBOX_PREFIX, type InboxMeta } from './inbox'
import { APP_URL, BTN_OPEN } from './app'
import { DAY_MS, mskDateStr, mskHour } from './days'
import { plural } from './facts'
import { sendMessage } from './tg'

export const REMIND_PREFIX = 'remind:'
const remindKey = (id: string | number) => `${REMIND_PREFIX}${id}`

/* ------------------------------------------------------------------ */
/* Тексты                                                              */
/* ------------------------------------------------------------------ */

/**
 * Ежедневные — ротация по местным суткам человека. Каждый
 * зовёт ответить прямо в чат и даёт пример, который можно повторить: ответ на
 * напоминание стоит одного сообщения. У каждого свой повод — вопрос, память,
 * день без трат, вчерашнее, ответ бота, доходы, итог месяца, — чтобы неделя
 * напоминаний не читалась одной фразой по кругу. Без «вечера» (у кого пояс
 * неизвестен, окно начинается в 15:00 МСК), без морали и без рода: «Какие были
 * траты», а не «что потратил».
 */
export const REMINDER_TEXTS = [
  'Какие сегодня были траты? Напиши сюда своими словами, например: «Ушло 300 на кофе»',
  'Запиши траты, пока помнишь. Хватит одной фразы: «Такси до дома за 450»',
  'Сегодня пока без трат? Так тоже бывает. А если что-то было — напиши: «Обед за 350»',
  'Вчерашние траты тоже можно записать: «Вчера ушло 1200 на продукты»',
  'Напиши трату — в ответ покажу итог дня. Например: «Ушло 480 на аптеку»',
  'Доходы тоже пиши сюда: «Пришла зарплата 80 000» или «+5000 за подработку»',
  'Пара фраз в день — и к концу месяца ясно, на что ушли деньги. Например: «Сходили в кино за 600»',
]

/**
 * Для тех, кто молчит пять дней и больше. Не «давно не виделись» — это
 * напоминание о провале, — а снятое препятствие: восстанавливать пропущенное
 * не нужно, учёт не обязан быть идеальным.
 */
export const COMEBACK_TEXTS = [
  'Не нужно вспоминать всё, что было: продолжить можно с любой траты. Хоть с этой: «Такси за 450»',
  'Учёт не обязан быть идеальным: даже часть трат уже показывает, куда уходят деньги. Запиши одну: «Ушло 1200 на продукты»',
  'Если учёт снова понадобится — я здесь. Одна фраза — и продолжим: «Обед за 350»',
]

/**
 * Новичкам — на первый и второй день после первого появления. Тот, кто ещё
 * ничего не записал, получает один шаг до первой записи; тот, кто начал, —
 * своё число записей и то, ради чего стоит продолжить.
 */
export function newbieText(day: number, ops: number): string {
  if (ops <= 0) {
    return day <= 1
      ? 'Какая была последняя трата? Напиши её сюда своими словами, например: «Ушло 300 на кофе» — я запишу и разложу по категориям.'
      : 'Чтобы увидеть, куда уходят деньги, хватит пары фраз в день. Начни с одной — например: «Такси до работы за 450»'
  }
  return day <= 1
    ? `Вчера — ${plural(ops, ['запись', 'записи', 'записей'])} в Кошеле. Продолжим? Какие сегодня были траты? Например: «Обед за 350»`
    : 'Ещё пара дней записей — и станет видно, на что уходит больше всего. Какие сегодня были траты? Например: «Ушло 1200 на продукты»'
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
  if (v === '0' || v === 'b' || v === 'n') return false
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
  if (!blocked && choice !== 'b' && choice !== 'n') return
  const jobs: Promise<unknown>[] = []
  if (blocked) jobs.push(env.REFERRALS.delete(`blocked:${id}`))
  // До 2.2 автоматическая отписка писала '0' вместе с меткой блокировки —
  // такой '0' тоже наш, а не человека. 'n' («не нажимал Start») — тоже наш.
  if (choice === 'b' || choice === 'n' || (blocked && choice === '0')) jobs.push(env.REFERRALS.delete(remindKey(id)))
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
/**
 * Без пояса — прежнее раннее окно по МСК (15–18): было 15–20, и у живущих
 * восточнее Москвы оно попадает на вечер, а не на ночь.
 */
export const REM_FALLBACK_START = 15

/**
 * Пояс по основной валюте — пока приложение не прислало настоящий. Только где
 * валюта почти однозначно указывает на пояс; доллар, евро, фунт — нет.
 * Индонезия — по Бали (+8): релокантов там больше, чем в Джакарте (+7).
 */
const CURRENCY_TZ: Record<string, number> = {
  RUB: 180, BYN: 180, TRY: 180, UAH: 120, MDL: 120, GEL: 240, AMD: 240, AZN: 240, AED: 240, OMR: 240,
  KZT: 300, UZS: 300, TJS: 300, PKR: 300, KGS: 360, BDT: 360, INR: 330, LKR: 330, NPR: 345,
  THB: 420, VND: 420, KHR: 420, LAK: 420, IDR: 480, MYR: 480, SGD: 480, PHP: 480, CNY: 480,
  HKD: 480, TWD: 480, MNT: 480, KRW: 540, JPY: 540,
}

/** Пояс человека и час начала его окна: настоящий, по валюте или раннее окно по МСК. */
export function reminderClock(tz: unknown, currency: unknown): { tz: number; start: number } {
  const exact = cleanTz(tz)
  if (exact !== undefined) return { tz: exact, start: REM_LOCAL_START }
  const guessed = typeof currency === 'string' && Object.hasOwn(CURRENCY_TZ, currency) ? CURRENCY_TZ[currency] : undefined
  if (guessed !== undefined) return { tz: guessed, start: REM_LOCAL_START }
  return { tz: DEFAULT_TZ, start: REM_FALLBACK_START }
}
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

/** Был один день и не вернулся: 1, 2, 5 и 14-й день — и хватит. */
const ONE_DAY_SCHEDULE = new Set([1, 2, 5, 14])

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

/** Нажал Start в боте — метка первого появления (для тех, кто дальше не пошёл). */
export const SEEN_PREFIX = 'seen:'
export interface SeenMeta {
  at?: number
}

/** Запомнить первое появление в боте. Один раз: дальше метка не меняется. */
export async function rememberSeen(env: Env, id: string | number, nowMs: number): Promise<void> {
  const key = `${SEEN_PREFIX}${id}`
  if ((await env.REFERRALS.get(key)) !== null) return
  // Метка нужна только первые дни — потом сама исчезает.
  await env.REFERRALS.put(key, '1', { metadata: { at: nowMs } satisfies SeenMeta, expirationTtl: 7 * 86_400 })
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
  const consider = (
    id: string,
    lastActive: number,
    clock: { tz: number; start: number },
    firstSeen: number,
    ops: number,
    rm?: number,
  ) => {
    const { tz } = clock
    if (localHour(nowMs, tz) !== clock.start + slotForId(id, REM_SLOTS)) return
    // Без единой метки времени — человек не появлялся с тех пор, как метки
    // ввели (давно): не тревожим.
    if (!(lastActive > 0)) return
    const today = localDay(nowMs, tz)
    // Сегодня уже был — напоминать не о чем. Дни тишины — по местным суткам.
    const quietDays = today - localDay(lastActive, tz)
    const oneDay = firstSeen > 0 && localDay(firstSeen, tz) === localDay(lastActive, tz)
    if (oneDay ? !ONE_DAY_SCHEDULE.has(quietDays) : !dueAfterQuiet(quietDays)) return
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
      // Последняя синхронизация: версия облака или (2.6+) отметка сервера —
      // открыл приложение без правок, версия не сменилась, а был сегодня.
      const app = Math.max(typeof m?.updatedAt === 'number' ? m.updatedAt : 0, typeof m?.seen === 'number' ? m.seen : 0)
      const first = Math.min(...[m?.firstSeen, b?.f].filter((x): x is number => typeof x === 'number' && x > 0), Infinity)
      consider(
        id,
        Math.max(app, b?.l ?? 0),
        reminderClock(m?.tz, m?.c?.cur),
        Number.isFinite(first) ? first : 0,
        Math.max(m?.c?.ops ?? 0, b?.n ?? 0),
        m?.c?.rm,
      )
    }
    dataCursor = page.list_complete ? undefined : page.cursor
  } while (dataCursor)

  // Пишут только боту, приложение не открывали: пояса нет.
  for (const [id, b] of bot) {
    if (seen.has(id) || !/^\d+$/.test(id)) continue
    seen.add(id)
    consider(id, b.l ?? 0, reminderClock(undefined, undefined), b.f ?? 0, b.n ?? 0)
  }

  // Нажали Start в боте и дальше не пошли: ни приложения, ни записей. Только
  // как новичкам — первые два дня, потом метка истекает сама.
  let seenCursor: string | undefined
  do {
    const page: KVNamespaceListResult<SeenMeta> = await env.REFERRALS.list<SeenMeta>({ prefix: SEEN_PREFIX, cursor: seenCursor })
    for (const k of page.keys) {
      const id = k.name.slice(SEEN_PREFIX.length)
      const at = k.metadata?.at
      if (!id || seen.has(id) || !/^\d+$/.test(id) || typeof at !== 'number') continue
      const clock = reminderClock(undefined, undefined)
      const since = localDay(nowMs, clock.tz) - localDay(at, clock.tz)
      if (since >= 1 && since <= NEWBIE_DAYS) consider(id, at, clock, at, 0)
    }
    seenCursor = page.list_complete ? undefined : page.cursor
  } while (seenCursor)
  return out
}

/**
 * Итоги рассылки за сутки (по МСК) — для ночной сводки владельцу. Отказы
 * Telegram — раздельно: «нет доступа» (человек не нажимал Start и не разрешал
 * боту писать) и «заблокировали». Иначе не понять, помогло ли разрешение.
 */
export interface ReminderStats {
  sent: number
  newbies: number
  noAccess: number
  blocked: number
}
const statKey = (dateStr: string) => `remstat:${dateStr}`

export async function readReminderStats(env: Env, dateStr: string): Promise<ReminderStats | null> {
  try {
    const raw = await env.REFERRALS.get(statKey(dateStr))
    if (!raw) return null
    const s = JSON.parse(raw) as Partial<ReminderStats> & { failed?: number }
    const n = (x: unknown) => (typeof x === 'number' && x > 0 ? x : 0)
    return { sent: n(s.sent), newbies: n(s.newbies), noAccess: n(s.noAccess), blocked: n(s.blocked) + n(s.failed) }
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
  const choices = await readChoices(env)

  const stats: ReminderStats = { sent: 0, newbies: 0, noAccess: 0, blocked: 0 }
  // Порциями: Telegram пускает около 30 сообщений в секунду на бота, дальше 429.
  for (let i = 0; i < candidates.length; i += REM_SEND_PER_SEC) {
    const started = Date.now()
    const batch = candidates.slice(i, i + REM_SEND_PER_SEC)
    // allSettled, а не all: один сбой чтения KV не должен обрывать рассылку
    // всему оставшемуся часу.
    const results = await Promise.allSettled(batch.map((c) => remindOne(env, c, nowMs, choices)))
    results.forEach((r, j) => {
      if (r.status === 'rejected') console.error('[reminders] не отправлено', r.reason)
      else if (r.value === 'sent') {
        stats.sent++
        if (batch[j].newbie) stats.newbies++
      } else if (r.value === 'no_access') stats.noAccess++
      else if (r.value === 'blocked') stats.blocked++
    })
    const spent = Date.now() - started
    if (spent < 1000 && i + REM_SEND_PER_SEC < candidates.length) await sleep(1000 - spent)
  }

  // Одна запись на час рассылки, а не на сообщение: на тысячах людей запись
  // KV на каждое напоминание стоила бы дороже самих напоминаний.
  if (stats.sent || stats.noAccess || stats.blocked) {
    try {
      const key = statKey(mskDateStr(nowMs))
      const prev = (await readReminderStats(env, mskDateStr(nowMs))) ?? { sent: 0, newbies: 0, noAccess: 0, blocked: 0 }
      const next: ReminderStats = {
        sent: prev.sent + stats.sent,
        newbies: prev.newbies + stats.newbies,
        noAccess: prev.noAccess + stats.noAccess,
        blocked: prev.blocked + stats.blocked,
      }
      await env.REFERRALS.put(key, JSON.stringify(next), { expirationTtl: 4 * 86_400 })
    } catch (e) {
      console.error('[reminders] итоги не записаны', e)
    }
  }
}

/**
 * Кнопка под напоминанием. Новичку — ещё и приложение: кто пришёл сразу в него,
 * записывал там, а не в чате.
 */
export function reminderKeyboard(withApp = false) {
  const off = [{ text: REMINDER_BUTTON, callback_data: 'r:0:n' }]
  return { inline_keyboard: withApp ? [[{ text: BTN_OPEN, web_app: { url: APP_URL } }], off] : [off] }
}

/**
 * Напоминание одному человеку.
 *
 * Метку «уже слали сегодня» не пишем: у каждого свой час в окне, и второй раз
 * в тот же день он в крон не попадает по построению.
 */
/**
 * Выборы людей одним списком: значение продублировано в метаданных ключа.
 * Раньше — чтение KV на каждого адресата, то есть вдвое больше подзапросов
 * вызова, чем самих сообщений. null — ключ без метаданных (старый), его читаем.
 */
async function readChoices(env: Env): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>()
  let cursor: string | undefined
  do {
    const page: KVNamespaceListResult<{ v?: unknown }> = await env.REFERRALS.list<{ v?: unknown }>({ prefix: REMIND_PREFIX, cursor })
    for (const k of page.keys) out.set(k.name.slice(REMIND_PREFIX.length), typeof k.metadata?.v === 'string' ? k.metadata.v : null)
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
  return out
}

async function remindOne(
  env: Env,
  c: Candidate,
  nowMs: number,
  choices: Map<string, string | null>,
): Promise<'sent' | 'skipped' | 'failed' | 'no_access' | 'blocked'> {
  const listed = choices.get(c.id)
  const choice = listed === undefined ? null : listed ?? (await env.REFERRALS.get(remindKey(c.id)))
  if (choice === '0' || choice === 'b' || choice === 'n') return 'skipped'
  // Явного выбора на сервере нет, а тумблер в приложении выключен.
  if (choice !== '1' && c.rm === 0) return 'skipped'

  const text = c.newbie ? newbieText(c.newbie.day, c.newbie.ops) : pickReminderText(nowMs, c.quietDays, c.tz)
  const keyboard = reminderKeyboard(!!c.newbie)
  let r = await sendMessage(env, c.id, text, keyboard)
  if (r.status === 429) {
    await sleep(1500)
    r = await sendMessage(env, c.id, text, keyboard)
  }
  if (r.status === 403) {
    // «Не нажимал Start» — не блокировка: человек открыл приложение по ссылке.
    // 'n' — тоже не беспокоим, но в «заблокировали» не считаем; разрешит в
    // приложении (там это теперь спрашивается) или напишет боту — оживёт.
    if (/initiate conversation/i.test(r.description ?? '')) {
      await env.REFERRALS.put(remindKey(c.id), 'n', { metadata: { v: 'n' } })
      return 'no_access'
    }
    // Бот заблокирован или аккаунт удалён — больше не беспокоим и метим для
    // аналитики. 'b', а не '0': вернётся — напоминания оживут (forgetBlock).
    await env.REFERRALS.put(remindKey(c.id), 'b', { metadata: { v: 'b' } })
    await env.REFERRALS.put(`blocked:${c.id}`, '1')
    return 'blocked'
  }
  return r.ok ? 'sent' : 'failed'
}
