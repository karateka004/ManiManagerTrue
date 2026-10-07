/**
 * Аналитика для владельца: сбор людей, расчёт метрик, ночной снимок и сводка.
 *
 * Вынесено из index.ts целиком: там остались маршруты и проверка доступа, а
 * здесь — чистые функции над уже собранными данными. Чистые — значит без сети
 * и KV, поэтому их прогоняет scripts/test-analytics.mjs на синтетической базе.
 *
 * Принципы, на которых всё держится:
 *   - ОДНО множество людей на все метрики. Раньше «всего» брали из одних ключей,
 *     «с операциями» — из других, и процент одного от другого был бессмысленным.
 *   - Сбор стоит несколько `list` независимо от размера базы: всё нужное лежит
 *     в метаданных ключей и приходит вместе со списком, значения не читаем.
 *   - Денег здесь нет и не будет: приложение обещает, что суммы никуда не
 *     уходят. Считаем только количества и даты.
 *   - Чего не знаем — не выдумываем: до появления масок активности посуточной
 *     правды нет, и дашборд так и говорит, а не рисует нули.
 */
import type { Env } from './env'
import {
  DAY_MS,
  MSK_OFFSET_MS,
  isMask,
  maskDays,
  maskWindowStart,
  mskDateStr,
  mskDay,
  mskDayStart,
  mskHour,
  type DayMask,
} from './days'
import { INBOX_PREFIX, type InboxMeta } from './inbox'
import { SRC_PREFIX, type SourceMeta } from './sources'

/* ------------------------------------------------------------------ */
/* Карточка пользователя — метаданные ключа data:<id>                   */
/* ------------------------------------------------------------------ */
/*
 * Дашборду нужны не сами данные человека, а несколько чисел про них: сколько
 * операций, когда была последняя, какие разделы открывались, заданы ли бюджет и
 * цели. Считаем карточку там, где блоб и так уже в руках и уже разбирается, — в
 * момент записи (`/data/put`), и кладём её в МЕТАДАННЫЕ ключа.
 */

/** Префикс облачной копии данных пользователя. */
export const DATA_PREFIX = 'data:'

/** Короткие коды событий — метаданные KV ограничены 1024 байтами, имена туда не влезут. */
export const EVENT_CODE: Record<string, string> = {
  visit_analytics: 'a',
  visit_charts: 'c',
  use_period: 'p',
  add_category: 'k',
  set_budget: 'b',
  add_goal: 'g',
  customize: 'z',
  open_planning: 'l',
  open_achievements: 'h',
  open_leaderboard: 'r',
  use_repeat: 'e',
  use_search: 's',
}

export interface UserCard {
  /** Операций всего. */
  ops: number
  /** Дата первой/последней операции в epoch-днях UTC (не мс — экономим байты). */
  ft?: number
  lt?: number
  /** В скольких разных днях есть операции — глубина привычки. */
  dd?: number
  /** Валюта, язык и тема — как настроил пользователь. */
  cur?: string
  lang?: string
  th?: string
  /** Задан общий месячный бюджет. */
  bud?: 1
  /** Сколько категорийных лимитов задано. */
  lim?: number
  gl?: number
  iv?: number
  cat?: number
  sb?: number
  dm?: 1
  rm?: 0
  /** Сколько разных валют встречается в операциях. */
  cc?: number
  /** Счётчики событий по коротким кодам (только ненулевые). */
  ev?: Record<string, number>
  /** Версия persist-стора — видно, кто ещё не обновился. */
  v?: number
}

export interface DataMeta {
  updatedAt?: number
  firstSeen?: number
  /** Аналитическая карточка. Появляется у ключа при первой же записи после выката. */
  c?: UserCard
  /** Дни синхронизаций (см. days.ts): ещё один след активности, той же записью. */
  vm?: string
  vd?: number
}

/** Потолок метаданных KV — 1024 байта. Держимся ниже с запасом. */
const META_BUDGET = 950

const EPOCH_DAY = 86_400_000

/** Собрать карточку из persist-блоба. null — блоб не разобрать. */
export function buildUserCard(blob: string): UserCard | null {
  let state: Record<string, unknown>
  let version: unknown
  try {
    const parsed = JSON.parse(blob) as { state?: Record<string, unknown>; version?: unknown }
    if (!parsed || typeof parsed.state !== 'object' || !parsed.state) return null
    state = parsed.state
    version = parsed.version
  } catch {
    return null
  }

  const len = (x: unknown) => (Array.isArray(x) ? x.length : 0)
  const str = (x: unknown) => (typeof x === 'string' && x.length <= 12 ? x : undefined)

  const txs = Array.isArray(state.transactions) ? (state.transactions as { date?: unknown; currency?: unknown }[]) : []
  let first = Infinity
  let last = -Infinity
  const currencies = new Set<string>()
  const days = new Set<number>()
  for (const t of txs) {
    const ms = typeof t?.date === 'string' ? Date.parse(t.date) : NaN
    if (Number.isFinite(ms)) {
      if (ms < first) first = ms
      if (ms > last) last = ms
      if (days.size < 3650) days.add(Math.floor(ms / EPOCH_DAY))
    }
    if (typeof t?.currency === 'string' && currencies.size < 12) currencies.add(t.currency)
  }

  const budgets = (state.budgets ?? {}) as Record<string, unknown>
  const limits = Object.keys(budgets).filter((k) => Number(budgets[k]) > 0).length

  const events = (state.events ?? {}) as Record<string, unknown>
  const ev: Record<string, number> = {}
  for (const key of Object.keys(events)) {
    const code = EVENT_CODE[key]
    const n = Math.floor(Number(events[key]) || 0)
    if (code && n > 0) ev[code] = Math.min(n, 99_999)
  }

  const streakBest = Math.floor(Number((state.streak as { best?: unknown } | undefined)?.best) || 0)

  const card: UserCard = { ops: txs.length }
  if (first !== Infinity) card.ft = Math.floor(first / EPOCH_DAY)
  if (last !== -Infinity) card.lt = Math.floor(last / EPOCH_DAY)
  if (days.size > 0) card.dd = days.size
  if (str(state.currency)) card.cur = str(state.currency)
  if (str(state.lang)) card.lang = str(state.lang)
  if (str(state.themeMode)) card.th = str(state.themeMode)
  if (Number(state.monthlyBudget) > 0) card.bud = 1
  if (limits > 0) card.lim = limits
  if (len(state.goals)) card.gl = len(state.goals)
  if (len(state.investments)) card.iv = len(state.investments)
  if (len(state.customCategories)) card.cat = len(state.customCategories)
  if (streakBest > 0) card.sb = Math.min(streakBest, 3650)
  if (state.demoMode === true) card.dm = 1
  if (state.remindersEnabled === false) card.rm = 0
  if (currencies.size > 0) card.cc = currencies.size
  if (Object.keys(ev).length) card.ev = ev
  if (typeof version === 'number') card.v = version
  return card
}

/**
 * Метаданные под лимит KV. Если карточка вдруг не влезла — сначала жертвуем
 * событиями, потом карточкой целиком: даты активности важнее, на них держится
 * рассылка напоминаний.
 */
export function fitMeta(meta: DataMeta): DataMeta {
  if (JSON.stringify(meta).length <= META_BUDGET) return meta
  if (meta.c?.ev) {
    const trimmed: DataMeta = { ...meta, c: { ...meta.c } }
    delete trimmed.c!.ev
    if (JSON.stringify(trimmed).length <= META_BUDGET) return trimmed
  }
  const bare: DataMeta = { updatedAt: meta.updatedAt, firstSeen: meta.firstSeen }
  if (meta.vm !== undefined) {
    bare.vm = meta.vm
    bare.vd = meta.vd
  }
  return bare
}

/** Безопасная epoch-ms метка из недоверенного ввода. */
export function parseUpdatedAt(x: unknown): number {
  const n = Math.floor(Number(x))
  return Number.isFinite(n) && n > 0 ? n : Date.now()
}

/* ------------------------------------------------------------------ */
/* Люди                                                                */
/* ------------------------------------------------------------------ */

/**
 * Карточка рейтинга — только поля, которые читает аналитика. Полный тип живёт в
 * index.ts (LeaderEntry) и с этим совместим по структуре.
 */
export interface LbEntry {
  id: number
  name: string
  username?: string
  xp: number
  level: number
  ops: number
  coins: number
  streakBest: number
  refs: number
  at: number
  firstSeen?: number
  fsx?: 1
  /** Метка рекламной ссылки первого запуска (см. sources.ts). */
  src?: string
  /** Дни запусков приложения (см. days.ts). */
  vm?: string
  vd?: number
}

/** Человек в аналитике: слияние всех следов, которые он оставил. */
export interface Person {
  id: string
  name: string
  username?: string
  /** epoch ms первого и последнего появления. */
  firstSeen: number
  lastSeen: number
  /** День прихода (сутки МСК) — считается один раз: на нём держатся все когорты. */
  fday: number
  /** Дата прихода — оценка: человек появился раньше, чем мы начали её писать. */
  approx: boolean
  /** Операций в приложении (по карточке, иначе по рейтингу). */
  ops: number
  /** Записей через бота за всё время. */
  botOps: number
  xp: number
  level: number
  refs: number
  coins: number
  streakBest: number
  fromRef: boolean
  blocked: boolean
  /** Открывал мини-апп: есть облачный ключ или карточка рейтинга. */
  inApp: boolean
  card?: UserCard
  /** Метка рекламной ссылки, по которой пришёл. */
  src?: string
  bot?: InboxMeta
  /** Дни активности (МСК) по маскам — по возрастанию. */
  days: number[]
  /** С какого дня маски этого человека знают правду. */
  knownFrom: number
  /** Последняя запись операции (в приложении или боту), epoch ms; 0 — не было. */
  lastWrite: number
}

export interface Collected {
  people: Person[]
  /** Сколько облачных ключей с карточкой / всего. */
  withCard: number
  cloudKeys: number
  /**
   * Первый день, с которого маски знают активность всех людей; null — масок
   * ещё нет ни у кого. Раньше этого дня посуточной правды нет.
   */
  trackFrom: number | null
  /** Карточки рейтинга — нужны топам и игровым суммам. */
  lb: Record<string, LbEntry>
}

interface ListedKey<M> {
  name: string
  metadata?: M | null
}

async function listAll<M>(env: Env, prefix: string): Promise<ListedKey<M>[]> {
  const out: ListedKey<M>[] = []
  let cursor: string | undefined
  do {
    const page = await env.REFERRALS.list<M>({ prefix, cursor })
    for (const k of page.keys) out.push({ name: k.name, metadata: k.metadata ?? null })
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
  return out
}

function maskOf(m: unknown, d: unknown): DayMask | undefined {
  const v = { m, d }
  return isMask(v) ? v : undefined
}

/** Метаданные очереди бота — недоверенные, берём только поля правильного вида. */
function botMeta(x: InboxMeta | null | undefined): InboxMeta | undefined {
  if (!x || typeof x !== 'object' || typeof x.n !== 'number') return undefined
  return x
}

/**
 * Слить следы одного человека в Person. Вынесено из сбора, чтобы тест мог
 * проверить правила слияния без KV.
 */
export function mergePerson(
  id: string,
  m: DataMeta | undefined,
  e: LbEntry | undefined,
  b: InboxMeta | undefined,
  s: SourceMeta | undefined,
  fromRef: boolean,
  blocked: boolean,
): Person | null {
  const firsts = [m?.firstSeen, e?.firstSeen, b?.f, s?.at].filter(
    (x): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0,
  )
  const lasts = [m?.updatedAt, e?.at, b?.l, s?.at].filter(
    (x): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0,
  )
  if (!firsts.length && !lasts.length) return null
  const lastSeen = Math.max(...lasts, ...firsts)
  const firstSeen = firsts.length ? Math.min(...firsts) : lastSeen
  const approx = e?.fsx === 1 || firsts.length === 0

  const masks = [maskOf(e?.vm, e?.vd), maskOf(m?.vm, m?.vd), maskOf(b?.m, b?.d)].filter(
    (x): x is DayMask => !!x,
  )
  const daySet = new Set<number>()
  for (const mk of masks) for (const d of maskDays(mk)) daySet.add(d)
  const days = [...daySet].sort((a, c) => a - c)
  const knownFrom = masks.length ? Math.max(...masks.map(maskWindowStart)) : -Infinity

  // Первое касание: метка бота против метки первого запуска приложения —
  // побеждает та, что раньше.
  let src = e?.src
  if (s?.s && (!src || s.at <= (e?.firstSeen ?? Infinity))) src = s.s

  const card = m?.c
  const ltMs = card?.lt !== undefined ? card.lt * EPOCH_DAY : 0
  const botLast = b && typeof b.l === 'number' && (b.n ?? 0) > 0 ? b.l : 0
  const lastWrite = Math.max(ltMs, botLast)

  return {
    id,
    name: e?.name ?? s?.n ?? 'Без имени',
    username: e?.username ?? s?.u,
    firstSeen,
    lastSeen,
    fday: mskDay(firstSeen),
    approx,
    ops: card ? card.ops : (e?.ops ?? 0),
    botOps: b?.n ?? 0,
    xp: e?.xp ?? 0,
    level: e?.level ?? 1,
    refs: e?.refs ?? 0,
    coins: e?.coins ?? 0,
    streakBest: e?.streakBest ?? card?.sb ?? 0,
    fromRef,
    blocked,
    inApp: !!m || !!e,
    card,
    src,
    bot: b,
    days,
    knownFrom,
    lastWrite,
  }
}

/**
 * Единая таблица людей. Источники:
 *  - `data:<id>` — облачная копия: активность, дата прихода, карточка, маска;
 *  - рейтинг — имя, XP, операции, рефералы, запуски (профиль уходит при каждом
 *    старте, поэтому здесь есть и те, кто ни разу не синхронизировался);
 *  - `inbox:<id>` — записи через бота (в том числе у тех, кто приложение не открывал);
 *  - `src:<id>` — пришёл по рекламной ссылке на бота;
 *  - `claimed:<id>` / `blocked:<id>` — по приглашению / заблокировал бота.
 */
export async function collectPeople(
  env: Env,
  lbSource: Record<string, LbEntry> | Promise<Record<string, LbEntry>>,
): Promise<Collected> {
  // Рейтинг читается своим кодом (index.ts) — принимаем и готовый, и обещанный,
  // чтобы его перечисление шло параллельно с остальными.
  const [dataKeys, inboxKeys, srcKeys, claimedKeys, blockedKeys, lb] = await Promise.all([
    listAll<DataMeta>(env, DATA_PREFIX),
    listAll<InboxMeta>(env, INBOX_PREFIX),
    listAll<SourceMeta>(env, SRC_PREFIX),
    listAll<unknown>(env, 'claimed:'),
    listAll<unknown>(env, 'blocked:'),
    Promise.resolve(lbSource),
  ])
  return assemble(
    dataKeys.map((k) => [k.name.slice(DATA_PREFIX.length), k.metadata ?? {}] as [string, DataMeta]),
    lb,
    inboxKeys.map((k) => [k.name.slice(INBOX_PREFIX.length), k.metadata ?? null] as [string, InboxMeta | null]),
    srcKeys.map((k) => [k.name.slice(SRC_PREFIX.length), k.metadata ?? null] as [string, SourceMeta | null]),
    claimedKeys.map((k) => k.name.slice('claimed:'.length)),
    blockedKeys.map((k) => k.name.slice('blocked:'.length)),
  )
}

/** Сборка из уже прочитанных списков — чистая, её проверяет тест. */
export function assemble(
  data: [string, DataMeta][],
  lb: Record<string, LbEntry>,
  inbox: [string, InboxMeta | null][],
  srcs: [string, SourceMeta | null][],
  claimed: string[],
  blocked: string[],
): Collected {
  const meta = new Map(data)
  const bots = new Map<string, InboxMeta>()
  for (const [id, x] of inbox) {
    const b = botMeta(x)
    if (b) bots.set(id, b)
  }
  const sources = new Map<string, SourceMeta>()
  for (const [id, x] of srcs) {
    if (x && typeof x.s === 'string' && typeof x.at === 'number') sources.set(id, x)
  }
  const referred = new Set(claimed)
  const blockedSet = new Set(blocked)

  const ids = new Set<string>([...meta.keys(), ...Object.keys(lb), ...bots.keys(), ...sources.keys()])
  const people: Person[] = []
  let withCard = 0
  let trackFrom: number | null = null
  for (const id of ids) {
    if (!/^\d{1,20}$/.test(id)) continue
    const m = meta.get(id)
    if (m?.c) withCard++
    const p = mergePerson(id, m, lb[id], bots.get(id), sources.get(id), referred.has(id), blockedSet.has(id))
    if (!p) continue
    if (p.days.length && (trackFrom === null || p.days[0] < trackFrom)) trackFrom = p.days[0]
    people.push(p)
  }

  // День прихода и день последнего появления — тоже дни активности, даже если
  // маска их не отметила (человек нажал «Старт» в боте и больше ничего не
  // сделал). Добавляем их только после начала масок: раньше любой день без
  // отметки значит «неизвестно», а не «не был».
  if (trackFrom !== null) {
    for (const p of people) {
      const extra = [p.fday, mskDay(p.lastSeen)].filter((d) => d >= trackFrom! && !binaryHas(p.days, d))
      if (extra.length) p.days = [...new Set([...p.days, ...extra])].sort((a, b) => a - b)
    }
  }
  people.sort((a, b) => b.lastSeen - a.lastSeen)
  return { people, withCard, cloudKeys: meta.size, trackFrom, lb }
}

/* ------------------------------------------------------------------ */
/* Правила                                                             */
/* ------------------------------------------------------------------ */

/** Записал хоть одну операцию — в приложении или боту. */
export const activated = (p: Person): boolean => p.ops > 0 || p.botOps > 0

/** Сколько операций у человека — не меньше. Записи бота после слива тоже лежат в приложении. */
export const totalOps = (p: Person): number => Math.max(p.ops, p.botOps)

/** Писал за последние `days` суток. */
export function wroteWithin(p: Person, days: number, now: number): boolean {
  if (p.card?.lt !== undefined && Math.floor(now / EPOCH_DAY) - p.card.lt <= days) return true
  return p.botOps > 0 && !!p.bot?.l && p.bot.l >= now - days * DAY_MS
}

/**
 * Был ли человек активен в день `day`: true/false — знаем точно, null — не
 * знаем (день до появления масок или за краем окна).
 */
export function activeOn(p: Person, day: number, trackFrom: number | null): boolean | null {
  if (trackFrom === null || day < trackFrom || day < p.knownFrom) return null
  return binaryHas(p.days, day)
}

function binaryHas(arr: number[], x: number): boolean {
  let lo = 0
  let hi = arr.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (arr[mid] === x) return true
    if (arr[mid] < x) lo = mid + 1
    else hi = mid - 1
  }
  return false
}

/** Вернулся ли в какой-то день после дня прихода. */
export function cameBack(p: Person): boolean {
  const first = p.fday
  if (mskDay(p.lastSeen) > first) return true
  return p.days.length > 0 && p.days[p.days.length - 1] > first
}

/** Понедельник недели (номер суток МСК). 1970-01-01 — четверг. */
export function weekStartDay(day: number): number {
  return day - ((day + 3) % 7)
}

export function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0
}

/* ------------------------------------------------------------------ */
/* Сегменты: источник × окно прихода                                    */
/* ------------------------------------------------------------------ */

export interface Segment {
  key: string
  label: string
  match: (p: Person) => boolean
}

/** Подпись метки: сама метка, иначе получится «ads_oct» и «Сами» в одном списке. */
export function segmentsFor(ps: Person[]): Segment[] {
  const counts = new Map<string, number>()
  for (const p of ps) if (p.src) counts.set(p.src, (counts.get(p.src) ?? 0) + 1)
  const tags = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  const out: Segment[] = [
    { key: 'all', label: 'Все', match: () => true },
    { key: 'organic', label: 'Сами', match: (p) => !p.src && !p.fromRef },
    { key: 'ref', label: 'По приглашению', match: (p) => !p.src && p.fromRef },
  ]
  for (const [tag] of tags) out.push({ key: 'src:' + tag, label: tag, match: (p) => p.src === tag })
  return out
}

/** Окна прихода для воронки: все / 30 дней / 7 дней / сегодня. */
export const WINDOWS = ['all', '30', '7', '1'] as const
export type Win = (typeof WINDOWS)[number]

function inWindow(p: Person, win: Win, now: number): boolean {
  if (win === 'all') return true
  if (win === '1') return p.firstSeen >= mskDayStart(mskDay(now))
  return p.firstSeen >= now - Number(win) * DAY_MS
}

/* ------------------------------------------------------------------ */
/* Расчёт дашборда                                                     */
/* ------------------------------------------------------------------ */

export interface MetricsRow {
  date: string
  total: number
  withData: number
  new: number
  dau: number
  wau: number
  mau: number
  blocked: number
  /** Сколько человек записали хоть одну операцию за последние 7 дней. */
  writers?: number
  /** Из пришедших в этот день — сколько успели записать операцию (в тот же день). */
  newAct?: number
}

export interface WebhookHealth {
  /** Адрес вебхука задан — иначе бот вообще не получает сообщений. */
  registered: boolean
  pending: number
  lastError?: string
  lastErrorAt?: number
  ok: boolean
}

/** Названия событий-вовлечения: ключи — реальные счётчики из store.events. */
export const EVENT_LABELS: Record<string, string> = {
  visit_analytics: 'Аналитика',
  visit_charts: 'Динамика',
  use_period: 'Смена периода',
  use_search: 'Поиск по операциям',
  use_repeat: 'Повтор операции',
  open_planning: 'Планирование',
  set_budget: 'Бюджет и лимиты',
  add_goal: 'Цели',
  add_category: 'Свои категории',
  customize: 'Оформление',
  open_achievements: 'Достижения',
  open_leaderboard: 'Лидерборд',
}
const CODE_EVENT: Record<string, string> = Object.fromEntries(Object.entries(EVENT_CODE).map(([ev, code]) => [code, ev]))

/** Дни в днях удержания: D1, D3, D7, D14, D30. */
export const RET_DAYS = [1, 3, 7, 14, 30]
/** Недели удержания для недельных когорт. */
export const RET_WEEKS = [1, 2, 3, 4]

/** Ячейка удержания: из скольких мерили и сколько вернулись. Нет — ещё не наступило или неизвестно. */
export type Cell = [number, number] | null

/** Люди по дню прихода — один проход вместо фильтра на каждую когорту. */
function byArrival(ps: Person[], key: (p: Person) => number): Map<number, Person[]> {
  const m = new Map<number, Person[]>()
  for (const p of ps) {
    const k = key(p)
    const list = m.get(k)
    if (list) list.push(p)
    else m.set(k, [p])
  }
  return m
}

function retentionDaily(ps: Person[], trackFrom: number | null, today: number) {
  const rows: { date: string; size: number; cells: Cell[] }[] = []
  const groups = byArrival(ps, (p) => p.fday)
  for (let f = today; f >= today - 13; f--) {
    const cohort = groups.get(f) ?? []
    const cells: Cell[] = RET_DAYS.map((k) => {
      const day = f + k
      if (day >= today) return null // день ещё не прожит целиком
      let base = 0
      let n = 0
      for (const p of cohort) {
        const a = activeOn(p, day, trackFrom)
        if (a === null) continue
        base++
        if (a) n++
      }
      return base ? [base, n] : null
    })
    rows.push({ date: mskDateStr(mskDayStart(f)), size: cohort.length, cells })
  }
  return rows
}

function retentionWeekly(ps: Person[], trackFrom: number | null, today: number, now: number) {
  const rows: {
    week: string
    size: number
    act: number
    alive: number
    approx: number
    cells: Cell[]
  }[] = []
  const thisWeek = weekStartDay(today)
  const groups = byArrival(ps, (p) => weekStartDay(p.fday))
  for (let w = thisWeek; w >= thisWeek - 7 * 7; w -= 7) {
    const cohort = groups.get(w) ?? []
    const cells: Cell[] = RET_WEEKS.map((k) => {
      let base = 0
      let n = 0
      for (const p of cohort) {
        const f = p.fday
        const from = f + 7 * (k - 1) + 1
        const to = f + 7 * k
        if (to >= today) continue // неделя этого человека ещё не прожита
        if (activeOn(p, from, trackFrom) === null) continue
        base++
        for (let d = from; d <= to; d++) {
          if (activeOn(p, d, trackFrom)) {
            n++
            break
          }
        }
      }
      return base ? [base, n] : null
    })
    rows.push({
      week: mskDateStr(mskDayStart(w)),
      size: cohort.length,
      act: cohort.filter(activated).length,
      alive: cohort.filter((p) => p.lastSeen >= now - 7 * DAY_MS).length,
      approx: cohort.filter((p) => p.approx).length,
      cells,
    })
  }
  return rows
}

function funnelOf(ps: Person[], now: number) {
  let act = 0
  let back = 0
  let five = 0
  let live = 0
  let app = 0
  let bot = 0
  for (const p of ps) {
    if (p.inApp) app++
    if (p.botOps > 0) bot++
    if (!activated(p)) continue
    act++
    if (!cameBack(p)) continue
    back++
    if (totalOps(p) < 5) continue
    five++
    if (wroteWithin(p, 7, now)) live++
  }
  return { n: ps.length, steps: [ps.length, act, back, five, live], app, bot }
}

/** D1 по когортам последних двух недель — одно число для верхней карточки. */
function d1Recent(ps: Person[], trackFrom: number | null, today: number): { base: number; n: number } {
  let base = 0
  let n = 0
  for (const p of ps) {
    const f = p.fday
    if (f < today - 15 || f + 1 >= today) continue
    const a = activeOn(p, f + 1, trackFrom)
    if (a === null) continue
    base++
    if (a) n++
  }
  return { base, n }
}

export interface PersonRow {
  i: string
  n: string
  u?: string
  fs: number
  ls: number
  o: number
  b: number
  s?: string
  r?: 1
  x?: 1
  a?: 1
  w?: number
  d?: number
  xp: number
  rf?: number
  e?: 1
}

const PEOPLE_CAP = 3000

/** Всё, что нужно дашборду, одним объектом. */
export function computeDashboard(
  c: Collected,
  history: MetricsRow[],
  now: number,
  webhook: WebhookHealth | null,
) {
  const ps = c.people
  const today = mskDay(now)
  const todayStart = mskDayStart(today)
  const d7 = now - 7 * DAY_MS
  const d14 = now - 14 * DAY_MS
  const d30 = now - 30 * DAY_MS
  const tf = c.trackFrom

  /* ---------- Верхние числа ---------- */
  let newToday = 0
  let new7 = 0
  let newPrev7 = 0
  let new30 = 0
  let dau = 0
  let dauNew = 0
  let wau = 0
  let mau = 0
  let writers7 = 0
  let writers30 = 0
  let withOps = 0
  let fromRef = 0
  let campaign = 0
  let organic = 0
  let blocked = 0
  let remindersOff = 0
  let inApp = 0
  let botUsers = 0
  let botUsers7 = 0
  let botOps = 0
  let onlyBot = 0
  let startOnly = 0
  let sleeping = 0
  let gone = 0
  let zero = 0
  let botWriters7 = 0
  let act7 = 0
  for (const p of ps) {
    const isNewToday = p.firstSeen >= todayStart
    if (isNewToday) newToday++
    if (p.firstSeen >= d7) {
      new7++
      if (activated(p)) act7++
    }
    if (p.firstSeen >= d14 && p.firstSeen < d7) newPrev7++
    if (p.firstSeen >= d30) new30++
    if (p.lastSeen >= todayStart) {
      dau++
      if (isNewToday) dauNew++
    }
    if (p.lastSeen >= d7) wau++
    else if (p.lastSeen >= d30) sleeping++
    else gone++
    if (p.lastSeen >= d30) mau++
    const w7 = wroteWithin(p, 7, now)
    if (w7) writers7++
    if (wroteWithin(p, 30, now)) writers30++
    if (activated(p)) withOps++
    else zero++
    if (p.src) campaign++
    else if (p.fromRef) fromRef++
    else organic++
    if (p.blocked) blocked++
    if (p.card?.rm === 0) remindersOff++
    if (p.inApp) inApp++
    if (p.botOps > 0) {
      botUsers++
      botOps += p.botOps
      if (p.bot?.l && p.bot.l >= d7) {
        botUsers7++
        if (w7) botWriters7++
      }
      if (!p.inApp) onlyBot++
    } else if (!p.inApp) startOnly++
  }
  const d1 = d1Recent(ps, tf, today)

  /* ---------- Посуточные ряды за 14 дней ---------- */
  const byDate = new Map(history.map((r) => [r.date, r]))
  const spark = { days: [] as string[], fresh: [] as number[], active: [] as (number | null)[], writers: [] as (number | null)[], total: [] as (number | null)[] }
  // Один проход по людям вместо четырнадцати: приток по дню прихода, активность
  // по отмеченным дням каждого.
  const freshBy = new Map<number, number>()
  const activeBy = new Map<number, number>()
  for (const p of ps) {
    if (p.fday >= today - 13) freshBy.set(p.fday, (freshBy.get(p.fday) ?? 0) + 1)
    for (let i = p.days.length - 1; i >= 0 && p.days[i] >= today - 13; i--) {
      activeBy.set(p.days[i], (activeBy.get(p.days[i]) ?? 0) + 1)
    }
  }
  for (let d = today - 13; d <= today; d++) {
    const date = mskDateStr(mskDayStart(d))
    spark.days.push(date)
    const fresh = freshBy.get(d) ?? 0
    const active = activeBy.get(d) ?? 0
    spark.fresh.push(fresh)
    const row = byDate.get(date)
    spark.active.push(tf !== null && d >= tf ? active : row ? row.dau : null)
    spark.writers.push(d === today ? writers7 : (row?.writers ?? null))
    spark.total.push(d === today ? ps.length : (row?.total ?? null))
  }

  /* ---------- Сегодня ---------- */
  const hourNow = mskHour(now)
  const hours = new Array(hourNow + 1).fill(0) as number[]
  const hoursY = new Array(24).fill(0) as number[]
  const yStart = todayStart - DAY_MS
  const newcomers: {
    i: string
    n: string
    u?: string
    at: number
    s?: string
    r?: 1
    act?: 1
    app?: 1
    bot?: 1
  }[] = []
  let lastHour = 0
  // Считаем по всем сегодняшним, а не по списку новичков: список обрезан до 60.
  let todayAct = 0
  let todayBot = 0
  for (const p of ps) {
    if (p.firstSeen >= todayStart) {
      hours[Math.min(hourNow, mskHour(p.firstSeen))]++
      if (p.firstSeen >= now - 3_600_000) lastHour++
      if (activated(p)) todayAct++
      if (p.botOps > 0) todayBot++
      newcomers.push({
        i: p.id,
        n: p.name,
        u: p.username,
        at: p.firstSeen,
        ...(p.src ? { s: p.src } : {}),
        ...(p.fromRef ? { r: 1 as const } : {}),
        ...(activated(p) ? { act: 1 as const } : {}),
        ...(p.inApp ? { app: 1 as const } : {}),
        ...(p.botOps > 0 ? { bot: 1 as const } : {}),
      })
    } else if (p.firstSeen >= yStart) {
      hoursY[mskHour(p.firstSeen)]++
    }
  }
  newcomers.sort((a, b) => b.at - a.at)
  // «Обычно» — медиана притока за две предыдущие недели: среднее на маленькой
  // базе тянет за собой один удачный день и показывает несуществующую норму.
  const usual = median(spark.fresh.slice(0, 13))

  /* ---------- Сегменты ---------- */
  const segs = segmentsFor(ps)
  const funnels: Record<string, Record<string, ReturnType<typeof funnelOf>>> = {}
  const retention: Record<string, { daily: ReturnType<typeof retentionDaily>; weekly: ReturnType<typeof retentionWeekly> }> = {}
  const sources: {
    key: string
    label: string
    n: number
    fresh7: number
    app: number
    act: number
    back: number
    bot: number
    d1: [number, number]
    first: number
    last: number
  }[] = []
  for (const seg of segs) {
    const members = ps.filter(seg.match)
    funnels[seg.key] = {}
    for (const win of WINDOWS) funnels[seg.key][win] = funnelOf(members.filter((p) => inWindow(p, win, now)), now)
    retention[seg.key] = {
      daily: retentionDaily(members, tf, today),
      weekly: retentionWeekly(members, tf, today, now),
    }
    if (seg.key === 'all') continue
    const d1s = d1Recent(members, tf, today)
    sources.push({
      key: seg.key,
      label: seg.label,
      n: members.length,
      fresh7: members.filter((p) => p.firstSeen >= d7).length,
      app: members.filter((p) => p.inApp).length,
      act: members.filter(activated).length,
      back: members.filter(cameBack).length,
      bot: members.filter((p) => p.botOps > 0).length,
      d1: [d1s.base, d1s.n],
      first: members.length ? Math.min(...members.map((p) => p.firstSeen)) : 0,
      last: members.length ? Math.max(...members.map((p) => p.firstSeen)) : 0,
    })
  }

  /* ---------- Продукт ---------- */
  const sections: Record<string, { users: number; total: number; active: number }> = {}
  const dist = { currency: {} as Record<string, number>, lang: {} as Record<string, number>, theme: {} as Record<string, number>, version: {} as Record<string, number> }
  const planning = { cards: 0, budget: 0, limits: 0, goals: 0, invest: 0, cats: 0, demo: 0 }
  const opsBuckets = [0, 0, 0, 0, 0] // 0 / 1–4 / 5–19 / 20–99 / 100+
  const daysBuckets = [0, 0, 0, 0, 0] // 1 / 2–3 / 4–7 / 8–30 / 31+
  const bump = (m: Record<string, number>, k?: string | number) => {
    if (k === undefined) return
    const key = String(k)
    m[key] = (m[key] ?? 0) + 1
  }
  for (const p of ps) {
    const ops = totalOps(p)
    opsBuckets[ops === 0 ? 0 : ops < 5 ? 1 : ops < 20 ? 2 : ops < 100 ? 3 : 4]++
    const c = p.card
    if (!c) continue
    planning.cards++
    if (c.bud) planning.budget++
    if (c.lim) planning.limits++
    if (c.gl) planning.goals++
    if (c.iv) planning.invest++
    if (c.cat) planning.cats++
    if (c.dm) planning.demo++
    if (c.dd) daysBuckets[c.dd === 1 ? 0 : c.dd <= 3 ? 1 : c.dd <= 7 ? 2 : c.dd <= 30 ? 3 : 4]++
    bump(dist.currency, c.cur)
    bump(dist.lang, c.lang)
    bump(dist.theme, c.th)
    bump(dist.version, c.v)
    if (c.ev) {
      const activeNow = p.lastSeen >= d30
      for (const code of Object.keys(c.ev)) {
        const ev = CODE_EVENT[code]
        if (!ev) continue
        const s = sections[ev] ?? { users: 0, total: 0, active: 0 }
        s.users++
        s.total += c.ev[code]
        if (activeNow) s.active++
        sections[ev] = s
      }
    }
  }
  const top = (m: Record<string, number>) =>
    Object.keys(m)
      .map((k) => ({ key: k, n: m[k] }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 8)

  /* ---------- Игра ---------- */
  const entries = Object.values(c.lb)
  const sumXp = entries.reduce((s, e) => s + (e.xp || 0), 0)
  const sumCoins = entries.reduce((s, e) => s + (e.coins || 0), 0)
  const sumLevel = entries.reduce((s, e) => s + (e.level || 0), 0)
  const totalRefs = entries.reduce((s, e) => s + (e.refs || 0), 0)
  const topXp = [...entries]
    .sort((a, b) => b.xp - a.xp)
    .slice(0, 10)
    .map((e) => ({ i: String(e.id), n: e.name, u: e.username, level: e.level, xp: e.xp, ops: e.ops }))
  const topRefs = [...entries]
    .filter((e) => (e.refs || 0) > 0)
    .sort((a, b) => (b.refs || 0) - (a.refs || 0))
    .slice(0, 10)
    .map((e) => ({ i: String(e.id), n: e.name, u: e.username, refs: e.refs }))

  /* ---------- Люди ---------- */
  const rows: PersonRow[] = ps.slice(0, PEOPLE_CAP).map((p) => {
    const r: PersonRow = { i: p.id, n: p.name, fs: p.firstSeen, ls: p.lastSeen, o: p.ops, b: p.botOps, xp: p.xp }
    if (p.username) r.u = p.username
    if (p.src) r.s = p.src
    if (p.fromRef) r.r = 1
    if (p.blocked) r.x = 1
    if (p.inApp) r.a = 1
    if (p.lastWrite) r.w = p.lastWrite
    if (p.refs) r.rf = p.refs
    if (p.approx) r.e = 1
    const recent = p.days.filter((d) => d > today - 30).length
    if (recent) r.d = recent
    return r
  })

  const kpi = {
    total: ps.length,
    inApp,
    newToday,
    new7,
    newPrev7,
    new30,
    dau,
    dauNew,
    dauBack: dau - dauNew,
    wau,
    mau,
    writers7,
    writers30,
    withOps,
    withOpsPct: pct(withOps, ps.length),
    act7,
    fromRef,
    campaign,
    organic,
    blocked,
    remindersOff,
    d1,
    usual,
    lastHour,
  }

  const bot = { users: botUsers, users7: botUsers7, ops: botOps, onlyBot, startOnly, writers7: botWriters7 }

  return {
    ok: true as const,
    generatedAt: now,
    trackFrom: tf === null ? null : mskDateStr(mskDayStart(tf)),
    coverage: {
      withCard: c.withCard,
      cloudKeys: c.cloudKeys,
      total: ps.length,
      pct: pct(c.withCard, c.cloudKeys),
      launchOnly: ps.filter((p) => p.inApp).length - c.cloudKeys,
    },
    kpi,
    spark,
    today: { hours, hoursY, hourNow, act: todayAct, bot: todayBot, newcomers: newcomers.slice(0, 60) },
    segments: segs.map((s) => ({ key: s.key, label: s.label })),
    funnels,
    retention,
    retDays: RET_DAYS,
    retWeeks: RET_WEEKS,
    lifecycle: { active: wau, sleeping, gone, zero },
    sources: sources.sort((a, b) => b.n - a.n),
    bot,
    webhook,
    product: {
      sections: Object.keys(sections)
        .map((ev) => ({ key: ev, label: EVENT_LABELS[ev] ?? ev, ...sections[ev] }))
        .sort((a, b) => b.users - a.users || b.total - a.total),
      planning,
      settings: { currency: top(dist.currency), lang: top(dist.lang), theme: top(dist.theme), version: top(dist.version) },
      opsBuckets,
      daysBuckets,
    },
    game: { sumXp, sumCoins, avgLevel: entries.length ? Math.round((sumLevel / entries.length) * 10) / 10 : 0, refs: totalRefs },
    topXp,
    topRefs,
    history: history.slice(-60),
    people: rows,
    peopleTotal: ps.length,
    insights: insights({ kpi, bot, webhook, segs: sources, trackFrom: tf, today }),
  }
}

export type Dashboard = ReturnType<typeof computeDashboard>

function median(xs: number[]): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

/* ------------------------------------------------------------------ */
/* Выводы — что важно прямо сейчас                                     */
/* ------------------------------------------------------------------ */

export interface Insight {
  tone: 'good' | 'bad' | 'info'
  text: string
}

/**
 * Несколько фраз о главном. Дашборд показывает числа, но владелец открывает его
 * с вопросом «что происходит?» — и ответ должен быть сверху, словами, а не
 * собираться в голове из шести карточек. Каждое правило срабатывает только когда
 * данных хватает, чтобы вывод не был шумом.
 */
function insights(x: {
  kpi: {
    newToday: number
    usual: number
    new7: number
    act7: number
    writers7: number
    d1: { base: number; n: number }
    lastHour: number
  }
  bot: { users7: number; writers7: number }
  webhook: WebhookHealth | null
  segs: { label: string; n: number; act: number; key: string }[]
  trackFrom: number | null
  today: number
}): Insight[] {
  const out: Insight[] = []
  const { kpi } = x

  if (x.webhook && !x.webhook.registered) {
    out.push({ tone: 'bad', text: 'Вебхук бота не зарегистрирован — бот сейчас не получает сообщений. Нужен POST /admin/webhook.' })
  } else if (x.webhook && !x.webhook.ok) {
    out.push({
      tone: 'bad',
      text: x.webhook.pending > 0
        ? `У бота в очереди ${x.webhook.pending} необработанных сообщений${x.webhook.lastError ? ` — последняя ошибка: ${x.webhook.lastError}` : ''}. Люди пишут, а ответа не получают.`
        : `Вебхук бота сообщает об ошибке: ${x.webhook.lastError ?? 'без описания'}.`,
    })
  }

  if (kpi.newToday >= 3 && kpi.newToday >= 3 * Math.max(1, kpi.usual)) {
    out.push({
      tone: 'good',
      text: `Сегодня новых: ${kpi.newToday} — обычно ${kpi.usual} в день.${kpi.lastHour ? ` За последний час — ${kpi.lastHour}.` : ''}`,
    })
  }

  if (kpi.new7 >= 5) {
    const p = Math.round(pct(kpi.act7, kpi.new7))
    out.push({
      tone: p >= 40 ? 'good' : 'bad',
      text: `Новичков за неделю: ${kpi.new7}, хоть одну операцию записали ${kpi.act7} (${p}%).${
        p < 40 ? ' Остальные ушли, ничего не записав, — главное узкое место сейчас здесь.' : ''
      }`,
    })
  }

  if (kpi.d1.base >= 10) {
    const p = Math.round(pct(kpi.d1.n, kpi.d1.base))
    out.push({
      tone: p >= 25 ? 'good' : 'info',
      text: `На следующий день возвращаются ${p}% новичков: ${kpi.d1.n} из ${kpi.d1.base} за последние две недели.`,
    })
  } else if (x.trackFrom === null || x.today - x.trackFrom < 2) {
    out.push({
      tone: 'info',
      text: 'Посуточное удержание начало копиться только что — первые цифры D1 появятся через пару дней.',
    })
  }

  // Источник с лучшей долей дошедших до операции — только среди тех, где людей достаточно.
  const meaningful = x.segs.filter((s) => s.n >= 10)
  if (meaningful.length >= 2) {
    const best = [...meaningful].sort((a, b) => b.act / b.n - a.act / a.n)[0]
    const worst = [...meaningful].sort((a, b) => a.act / a.n - b.act / b.n)[0]
    if (best.key !== worst.key && best.act / best.n - worst.act / worst.n >= 0.15) {
      out.push({
        tone: 'info',
        text: `Лучше всех доходят до операции пришедшие из «${best.label}» — ${Math.round(pct(best.act, best.n))}%, хуже всех из «${worst.label}» — ${Math.round(pct(worst.act, worst.n))}%.`,
      })
    }
  }

  if (kpi.writers7 >= 5 && x.bot.writers7 > 0) {
    out.push({
      tone: 'info',
      text: `Через бота пишут ${x.bot.writers7} из ${kpi.writers7} записывающих за неделю (${Math.round(pct(x.bot.writers7, kpi.writers7))}%).`,
    })
  }
  return out.slice(0, 5)
}

/* ------------------------------------------------------------------ */
/* Ночной снимок и история                                             */
/* ------------------------------------------------------------------ */

export const METRICS_PREFIX = 'metrics:'
const METRICS_TTL_SEC = 65 * 86400 // авто-прунинг старых снимков (~2 мес) через TTL KV
const HISTORY_KEY = 'metrics-history'
const HISTORY_MAX = 120

/** Строка снимка для завершившихся суток `day`. */
export function snapshotRow(c: Collected, day: number, now: number): MetricsRow {
  const start = mskDayStart(day)
  const end = start + DAY_MS
  const tf = c.trackFrom
  let dau = 0
  let wau = 0
  let mau = 0
  let fresh = 0
  let freshAct = 0
  let withData = 0
  let blocked = 0
  let writers = 0
  for (const p of c.people) {
    if (p.firstSeen >= end) continue // пришёл уже после этих суток
    // Активность за сами сутки: по маске, если она знает этот день; иначе —
    // по последнему визиту (это занижает: вчерашний гость, зашедший и сегодня,
    // не попадёт во вчерашний день — так было до масок).
    const a = activeOn(p, day, tf)
    if (a === null ? p.lastSeen >= start && p.lastSeen < end : a) dau++
    if (p.lastSeen >= end - 7 * DAY_MS) wau++
    if (p.lastSeen >= end - 30 * DAY_MS) mau++
    if (p.firstSeen >= start) {
      fresh++
      if (activated(p)) freshAct++
    }
    if (activated(p)) withData++
    if (p.blocked) blocked++
    if (wroteWithin(p, 7, end)) writers++
  }
  return {
    date: mskDateStr(start),
    total: c.people.filter((p) => p.firstSeen < end).length,
    withData,
    new: fresh,
    dau,
    wau,
    mau,
    blocked,
    writers,
    newAct: freshAct,
  }
}

export async function recordSnapshot(env: Env, row: MetricsRow): Promise<void> {
  // Дублируем строку в metadata — чтобы дашборд читал историю из list без N чтений.
  await env.REFERRALS.put(`${METRICS_PREFIX}${row.date}`, JSON.stringify(row), {
    metadata: row,
    expirationTtl: METRICS_TTL_SEC,
  })
  const rows = (await readHistoryKey(env)).filter((r) => r && r.date !== row.date)
  rows.push(row)
  rows.sort((a, b) => (a.date < b.date ? -1 : 1))
  await env.REFERRALS.put(HISTORY_KEY, JSON.stringify(rows.slice(-HISTORY_MAX)))
}

async function readHistoryKey(env: Env): Promise<MetricsRow[]> {
  try {
    const raw = await env.REFERRALS.get(HISTORY_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(parsed) ? (parsed as MetricsRow[]) : []
  } catch {
    return []
  }
}

/**
 * История снимков. Основной источник — скользящий массив в одном ключе;
 * посуточные ключи читаем следом ради истории, накопленной до его появления
 * (их метаданные уже есть в ответе list).
 */
export async function readHistory(env: Env): Promise<MetricsRow[]> {
  const byDate = new Map<string, MetricsRow>()
  for (const k of await listAll<MetricsRow>(env, METRICS_PREFIX)) {
    if (k.metadata?.date) byDate.set(k.metadata.date, k.metadata)
  }
  for (const r of await readHistoryKey(env)) if (r?.date) byDate.set(r.date, r)
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
}

/* ---------- Дозаполнение карточек ---------- */
/*
 * Карточка появляется у ключа при первой записи после выката. У тех, кто с тех
 * пор не заходил, её нет, и в разрезах они не видны. Проходим базу порциями:
 * читаем блоб, считаем карточку, кладём значение обратно с новыми метаданными.
 * Порция маленькая намеренно — у Worker есть потолок подзапросов на вызов.
 */
const BACKFILL_CURSOR_KEY = 'admin:backfill-cursor'
export const BACKFILL_SLICE = 12

export async function backfillCards(env: Env, slice: number): Promise<{ scanned: number; filled: number; done: boolean }> {
  const startCursor = (await env.REFERRALS.get(BACKFILL_CURSOR_KEY)) ?? undefined
  const page = await env.REFERRALS.list<DataMeta>({ prefix: DATA_PREFIX, cursor: startCursor, limit: 200 })

  let scanned = 0
  let filled = 0
  for (const k of page.keys) {
    if (filled >= slice) break
    scanned++
    if (k.metadata?.c) continue
    const got = await env.REFERRALS.getWithMetadata<DataMeta>(k.name)
    if (!got.value) continue
    let stored: { blob?: string; updatedAt?: number }
    try {
      stored = JSON.parse(got.value) as { blob?: string; updatedAt?: number }
    } catch {
      continue
    }
    if (typeof stored.blob !== 'string') continue
    const card = buildUserCard(stored.blob)
    if (!card) continue
    const updatedAt = parseUpdatedAt(stored.updatedAt)
    const meta = fitMeta({
      ...(got.metadata ?? {}),
      updatedAt,
      firstSeen: got.metadata?.firstSeen ?? updatedAt,
      c: card,
    })
    await env.REFERRALS.put(k.name, got.value, { metadata: meta })
    filled++
  }

  // Курсор двигаем только когда страница пройдена целиком, иначе на следующем
  // заходе перепрыгнули бы ключи, до которых не добрались из-за лимита порции.
  const finishedPage = scanned >= page.keys.length
  const done = finishedPage && page.list_complete
  if (done) await env.REFERRALS.delete(BACKFILL_CURSOR_KEY)
  else if (finishedPage && !page.list_complete) await env.REFERRALS.put(BACKFILL_CURSOR_KEY, page.cursor)

  return { scanned, filled, done }
}

/* ------------------------------------------------------------------ */
/* Сводка владельцу в Telegram                                         */
/* ------------------------------------------------------------------ */

/** Итоги суток `day` — то, что владелец хочет знать утром, не открывая дашборд. */
export function dayReport(c: Collected, day: number, now: number) {
  const start = mskDayStart(day)
  const end = start + DAY_MS
  const tf = c.trackFrom
  const fresh = c.people.filter((p) => p.firstSeen >= start && p.firstSeen < end)
  let active = 0
  let back = 0
  for (const p of c.people) {
    if (p.firstSeen >= end) continue
    const a = activeOn(p, day, tf)
    const was = a === null ? p.lastSeen >= start && p.lastSeen < end : a
    if (!was) continue
    active++
    if (p.firstSeen < start) back++
  }
  const bySrc = new Map<string, number>()
  for (const p of fresh) {
    const k = p.src ? p.src : p.fromRef ? 'по приглашению' : 'сами'
    bySrc.set(k, (bySrc.get(k) ?? 0) + 1)
  }
  // «Обычно» — медиана притока за предыдущие 14 суток.
  const prev: number[] = []
  for (let d = day - 14; d < day; d++) {
    const s = mskDayStart(d)
    prev.push(c.people.filter((p) => p.firstSeen >= s && p.firstSeen < s + DAY_MS).length)
  }
  // D1 вчерашних новичков — день `day` для них первый после прихода.
  const yStart = start - DAY_MS
  let d1Base = 0
  let d1n = 0
  for (const p of c.people) {
    if (p.firstSeen < yStart || p.firstSeen >= start) continue
    const a = activeOn(p, day, tf)
    if (a === null) continue
    d1Base++
    if (a) d1n++
  }
  const botActive = c.people.filter((p) => p.botOps > 0 && p.bot?.l && p.bot.l >= start && p.bot.l < end).length
  return {
    date: mskDateStr(start),
    fresh: fresh.length,
    usual: median(prev),
    freshAct: fresh.filter(activated).length,
    freshBot: fresh.filter((p) => p.botOps > 0).length,
    active,
    back,
    botActive,
    d1: d1Base ? { base: d1Base, n: d1n } : null,
    sources: [...bySrc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4),
    total: c.people.filter((p) => p.firstSeen < end).length,
    wau: c.people.filter((p) => p.lastSeen >= end - 7 * DAY_MS && p.firstSeen < end).length,
    partial: now < end,
  }
}

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']

/** Текст сводки (parse_mode: HTML). Без эмодзи — числа говорят сами. */
export function digestText(r: ReturnType<typeof dayReport>): string {
  const [, m, d] = r.date.split('-').map(Number)
  const title = `${d} ${MONTHS[m - 1]}${r.partial ? ', на сейчас' : ''}`
  const lines: string[] = [`<b>Кошель · ${title}</b>`, '']
  lines.push(`Новых: <b>${r.fresh}</b>${r.usual !== r.fresh ? ` · обычно ${r.usual}` : ''}`)
  if (r.fresh > 0) {
    lines.push(`Записали операцию: <b>${r.freshAct}</b> из ${r.fresh} (${Math.round(pct(r.freshAct, r.fresh))}%)${r.freshBot ? ` · через бота ${r.freshBot}` : ''}`)
  }
  lines.push(`Заходили: <b>${r.active}</b> · из них вернулись ${r.back}`)
  if (r.d1) lines.push(`Вернулись вчерашние новички: <b>${r.d1.n}</b> из ${r.d1.base} (${Math.round(pct(r.d1.n, r.d1.base))}%)`)
  if (r.botActive) lines.push(`Писали боту: ${r.botActive}`)
  if (r.sources.length) {
    lines.push('')
    lines.push('Откуда новые: ' + r.sources.map(([k, n]) => `${escape(k)} — ${n}`).join(', '))
  }
  lines.push('')
  lines.push(`Всего людей: ${r.total} · активны за неделю ${r.wau}`)
  return lines.join('\n')
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/* ------------------------------------------------------------------ */
/* Карточка одного человека — по нажатию в списке                      */
/* ------------------------------------------------------------------ */

/** Расшифровать короткие коды событий для карточки человека. */
export function sectionsOf(card: UserCard | undefined): { label: string; n: number }[] {
  if (!card?.ev) return []
  return Object.keys(card.ev)
    .map((code) => ({ label: EVENT_LABELS[CODE_EVENT[code]] ?? code, n: card.ev![code] }))
    .sort((a, b) => b.n - a.n)
}

/** Отметки активности за последние `span` суток: 1 — был, 0 — не был, null — неизвестно. */
export function activityStrip(p: Person, trackFrom: number | null, today: number, span: number): (0 | 1 | null)[] {
  const out: (0 | 1 | null)[] = []
  for (let d = today - span + 1; d <= today; d++) {
    if (d < mskDay(p.firstSeen)) {
      out.push(null)
      continue
    }
    const a = activeOn(p, d, trackFrom)
    out.push(a === null ? null : a ? 1 : 0)
  }
  return out
}

/** Сутки по МСК — реэкспорт для маршрутов, чтобы не тянуть days.ts отдельно. */
export { mskDay, MSK_OFFSET_MS }
