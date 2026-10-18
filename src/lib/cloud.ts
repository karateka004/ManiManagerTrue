/**
 * Облачная синхронизация данных за Telegram-аккаунтом.
 *
 * Цель: с какого устройства человек ни зашёл в Telegram — у него его аккаунт и
 * его деньги. Весь стор приложения (persist-блоб) привязывается к TG-аккаунту
 * через воркер (KV `data:<userId>`, доступ только по проверенной подписи initData).
 *
 * Как (с 2.6) — без молчаливой потери записей:
 *  - Версию облака выдаёт сервер. Устройство хранит ОСНОВУ — каким облако было
 *    при последней синхронизации (syncMerge.ts) — и отправляет снимок «от этой
 *    версии». Облако изменил кто-то другой — сервер не затирает его, а отдаёт
 *    текущее; устройство сливает три версии (своё, облачное, основу) и
 *    отправляет итог. То же при запуске, если облако изменилось без нас.
 *  - Отправки идут по одной: вторая, ушедшая, пока первая в пути, конфликтовала
 *    бы с первой — то есть с самим собой.
 *  - Своя отправка, ответ на которую потерялся, узнаётся по случайному `pid`.
 *  - На любое изменение стора — отложенная отправка; при сворачивании — сразу.
 *
 * Чего не обещаем: KV не атомарен, и две отправки с разных концов света в одну
 * и ту же секунду могут разминуться — победит одна. Это редкость, а не правило.
 *
 * Вне Telegram (обычный браузер, превью) синк выключен — приложение работает
 * локально, как раньше.
 */
import { useStore, flushPersist } from '../store/transactions'
import { ackInbox, isBackendConfigured, pullCloud, pullInbox, pushCloud, type CloudSnapshot } from './api'
import { dataOf, hashString, localAdditions, makeBase, mergeStates, parseBase, planStartup, type SyncBase } from './syncMerge'
import { dedupeKey } from './csvImport'
import { translate } from './i18n'
import { showToast } from './toast'
import { tg } from './telegram'

/** Ключ persist-стора (см. `name` в store/transactions.ts). */
const PERSIST_KEY = 'finance-mini-app:v1'
/** Метка последней синхронизации у приложения до 2.6 (вне синкаемого блоба). */
const META_KEY = 'koshel:cloudMeta'
/** Основа для слияния (с 2.6), см. syncMerge.ts. */
const BASE_KEY = 'koshel:syncBase'
/** Пауза перед пушем после последнего изменения. */
const PUSH_DEBOUNCE = 1500
/**
 * Идентификаторы уже перенесённых записей бота. Нужны на один узкий случай:
 * операции добавлены в стор, а подтверждение приёма не дошло (связь оборвалась).
 * Без этого списка следующий запуск записал бы их второй раз.
 */
const INBOX_DONE_KEY = 'koshel:inboxDone'
/** Дальше помнить незачем: неподтверждённых записей столько не накапливается. */
const INBOX_DONE_MAX = 2000
/** Как часто перепроверять входящие при возврате в приложение. */
const INBOX_RECHECK_MS = 30_000

/** Метка последнего снимка у приложения до 2.6 — только для первого запуска 2.6. */
function legacyLocalAt(): number {
  try {
    const m = JSON.parse(localStorage.getItem(META_KEY) || '{}') as { updatedAt?: unknown }
    return typeof m.updatedAt === 'number' ? m.updatedAt : 0
  } catch {
    return 0
  }
}

function readBase(): SyncBase | null {
  try {
    return parseBase(localStorage.getItem(BASE_KEY))
  } catch {
    return null
  }
}

function writeBase(base: SyncBase): void {
  try {
    localStorage.setItem(BASE_KEY, JSON.stringify(base))
    // Метку держим и для старого формата: откатись приложение на 2.5 — оно
    // сравнит её с облаком как раньше.
    localStorage.setItem(META_KEY, JSON.stringify({ updatedAt: base.v }))
  } catch {
    // Нет места — без основы следующий запуск сольёт грубее (по времени
    // создания записей), но ничего не затрёт.
    try {
      localStorage.removeItem(BASE_KEY)
    } catch {
      /* совсем плохо */
    }
  }
}

/** Основа из снимка, который лежит в облаке под версией `v`. */
function baseFromBlob(blob: string, v: number): SyncBase | null {
  try {
    const state = (JSON.parse(blob) as { state?: Record<string, unknown> }).state
    return state && typeof state === 'object' ? makeBase(state, v) : null
  } catch {
    return null
  }
}

function readBlob(): string | null {
  try {
    return localStorage.getItem(PERSIST_KEY)
  } catch {
    return null
  }
}

/** Потолок размера облачного блоба на клиенте (типичный persist ~30–50 KB). */
const MAX_CLOUD_BLOB = 1_500_000

/**
 * Валидируем облачный блоб ПЕРЕД применением: непустая строка разумного размера,
 * валидный JSON, объект с числовым полем `version` (форма zustand-persist
 * `{ state, version }`). Защита от битого/огромного/«отравленного» значения
 * (если KV когда-нибудь скомпрометируют) и от падения на слабых устройствах.
 */
function isValidBlob(blob: unknown): blob is string {
  if (typeof blob !== 'string' || blob.length === 0 || blob.length > MAX_CLOUD_BLOB) return false
  try {
    const parsed = JSON.parse(blob) as { version?: unknown } | null
    return !!parsed && typeof parsed === 'object' && typeof parsed.version === 'number'
  } catch {
    return false
  }
}

/**
 * Сколько операций в persist-блобе. Ключевая величина для защиты от потери
 * данных: «пустой» снимок не должен затирать облако с операциями.
 * -1 — блоб не разобрать (не судим по нему).
 */
function txCount(blob: string | null): number {
  if (!blob) return 0
  try {
    const parsed = JSON.parse(blob) as { state?: { transactions?: unknown[] } }
    const list = parsed?.state?.transactions
    return Array.isArray(list) ? list.length : -1
  } catch {
    return -1
  }
}

let started = false
/** Пока сливаем с облаком — не пушим (иначе отправили бы полуготовое состояние). */
let adopting = false
let pushTimer: ReturnType<typeof setTimeout> | null = null
/** Отправка в пути: следующая ждёт её (`again`), а не идёт параллельно. */
let inflight = false
let again = false
/** Версия облака для отправки, пока основы нет (приложение до 2.6 или облака не было). */
let baseHint = 0
/**
 * Отправки без ответа (обрыв связи): pid → снимок. Если облако окажется одной
 * из них — это наш же снимок, а не чужая правка.
 */
const unanswered = new Map<string, string>()
/** Сколько операций было в облаке на старте сессии (для защиты от затирания). */
let cloudTxAtStart = 0
/**
 * Были ли в этой сессии данные локально. Если были и исчезли — значит человек
 * сам всё удалил, и пустой снимок отправлять законно. Если приложение
 * стартовало пустым при непустом облаке — это сбой загрузки, пуш запрещён.
 */
let hadDataThisSession = false
/** Слияний по конфликту за минуту — защита от пинг-понга двух открытых устройств. */
let conflictTimes: number[] = []
/**
 * Слияние с облаком и перенос записей бота — по очереди: перенос, вклинившийся
 * между снимком своего состояния и перечитыванием стора, потерял бы операции, о
 * приёме которых бот уже знает.
 */
let queue: Promise<unknown> = Promise.resolve()
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn)
  queue = run.catch(() => {})
  return run
}

function newPid(): string {
  const a = new Uint32Array(2)
  try {
    crypto.getRandomValues(a)
  } catch {
    a[0] = Math.random() * 2 ** 32
    a[1] = Math.random() * 2 ** 32
  }
  return a[0].toString(36) + a[1].toString(36)
}

function schedulePush(): void {
  if (adopting) return
  // Флаг «данные в этой сессии были» берём из стора в памяти, а не из блоба:
  // этот код выполняется на КАЖДОЕ изменение стора, а разбор блоба на сотнях
  // операций — сотни килобайт JSON.parse за тап. Проверяем только пока флаг
  // не взведён — дальше он всё равно не меняется.
  if (!hadDataThisSession && useStore.getState().transactions.length > 0) {
    hadDataThisSession = true
  }
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(flushPush, PUSH_DEBOUNCE)
}

async function flushPush(): Promise<void> {
  pushTimer = null
  // Сливаемся с облаком или предыдущая отправка ещё в пути — отправим после.
  if (adopting || inflight) {
    again = true
    return
  }
  inflight = true
  try {
    await pushOnce()
  } finally {
    inflight = false
    if (again) {
      again = false
      schedulePush()
    }
  }
}

async function pushOnce(): Promise<void> {
  flushPersist() // на диске должен лежать актуальный снимок, а не отложенный
  const blob = readBlob()
  if (!blob) return

  // Страховка от потери данных: не отправляем снимок без операций поверх
  // облака, в котором они были, — если только человек сам их не удалил.
  const local = txCount(blob)
  if (local === 0 && cloudTxAtStart > 0 && !hadDataThisSession) return

  const pid = newPid()
  unanswered.set(pid, blob)
  let res: Awaited<ReturnType<typeof pushCloud>> | null
  try {
    res = await pushCloud(blob, Date.now(), local === 0 && hadDataThisSession, readBase()?.v ?? baseHint, pid)
  } catch {
    return // офлайн — отправим при следующем изменении; снимок помним в unanswered
  }
  if (!res) return
  if (res.ok && !res.conflict && !res.skipped && typeof res.updatedAt === 'number') {
    // Принято. Все прежние отправки без ответа облаком не стали: иначе эта
    // получила бы конфликт.
    unanswered.clear()
    const base = baseFromBlob(blob, res.updatedAt)
    if (base) writeBase(base)
    return
  }
  // Облако изменил другой телефон (или старый сервер сказал «у меня новее»).
  if ((res.conflict || res.skipped) && res.data) await resolveConflict(res.data)
}

/**
 * Сервер не принял снимок: облако изменилось без нас. Если это наш же прошлый
 * снимок (ответ потерялся по дороге) — ведём от него. Иначе сливаем три версии
 * и отправляем итог.
 */
async function resolveConflict(snap: CloudSnapshot): Promise<void> {
  const mine = snap.pid ? unanswered.get(snap.pid) : undefined
  if (mine !== undefined) {
    unanswered.clear()
    const base = baseFromBlob(mine, snap.updatedAt)
    if (base) writeBase(base)
    again = true
    return
  }
  if (!isValidBlob(snap.blob)) return
  const now = Date.now()
  conflictTimes = conflictTimes.filter((t) => now - t < 60_000)
  if (conflictTimes.length >= 3) return
  conflictTimes.push(now)
  const { differs, visible } = await mergeCloud(snap)
  unanswered.clear()
  if (differs) again = true
  // Данные на экране поменялись посреди сессии — объясняем, откуда: иначе
  // чужая запись выглядела бы как сбой.
  if (visible) showToast({ text: translate(useStore.getState().lang, 'sync.merged') })
}

/**
 * Слить облачный снимок со своим состоянием и сделать облачное основой.
 * `differs` — итог отличается от облачного, его надо отправить; `visible` —
 * на экране что-то поменялось.
 */
function mergeCloud(snap: CloudSnapshot, mode: 'merge' | 'adopt' = 'merge'): Promise<{ differs: boolean; visible: boolean }> {
  return exclusive(async () => {
    // 'adopt' — основы нет или здесь пусто: облако плюс свои новые записи по
    // времени создания, без трёхстороннего слияния.
    const base = mode === 'merge' ? readBase() : null
    const local = dataOf(useStore.getState())
    adopting = true
    flushPersist() // отложенная запись не должна «догнать» и затереть облако
    const prev = readBlob() // снимок локального ДО перезаписи (для отката)
    try {
      localStorage.setItem(PERSIST_KEY, snap.blob)
      // rehydrate перечитает storage, прогонит миграции и обновит стор.
      await useStore.persist.rehydrate()
      const cloud = dataOf(useStore.getState())
      const { merged, differs } = base
        ? mergeStates(local, cloud, base, (t) => dedupeKey(t as Parameters<typeof dedupeKey>[0]))
        : legacyMerge(local, cloud, legacyLocalAt())
      if (differs) useStore.setState(merged)
      const next = makeBase(cloud, snap.updatedAt)
      writeBase(next)
      if (txCount(snap.blob) > 0 || (Array.isArray(local.transactions) && local.transactions.length > 0)) hadDataThisSession = true
      const visible = hashString(JSON.stringify(local.transactions)) !== hashString(JSON.stringify(useStore.getState().transactions))
      return { differs, visible }
    } catch {
      // Применить не удалось — откатываемся на прежние локальные данные, не теряем их.
      try {
        if (prev !== null) localStorage.setItem(PERSIST_KEY, prev)
        else localStorage.removeItem(PERSIST_KEY)
        await useStore.persist.rehydrate()
      } catch {
        /* совсем плохо — оставляем как есть */
      }
      return { differs: false, visible: false }
    } finally {
      adopting = false
    }
  })
}

/**
 * Слияние без основы (первый запуск 2.6 на старых данных): облако плюс свои
 * записи, созданные после последней отправки старого приложения.
 */
function legacyMerge(
  local: Record<string, unknown>,
  cloud: Record<string, unknown>,
  since: number,
): { merged: Record<string, unknown>; differs: boolean } {
  const merged: Record<string, unknown> = { ...cloud }
  let differs = false
  for (const k of ['transactions', 'customCategories', 'goals', 'investments']) {
    const mine = Array.isArray(local[k]) ? (local[k] as { id: string }[]) : []
    const theirs = Array.isArray(cloud[k]) ? (cloud[k] as { id: string }[]) : []
    const add = localAdditions(mine, theirs, since)
    if (add.length) {
      differs = true
      merged[k] = k === 'transactions' ? [...add, ...theirs] : [...theirs, ...add]
    }
  }
  return { merged, differs }
}

function flushNow(): void {
  if (pushTimer) {
    clearTimeout(pushTimer)
    pushTimer = null
    void flushPush()
  }
}

/* ------------------------------------------------------------------ */
/* Входящие от бота                                                    */
/* ------------------------------------------------------------------ */

function readDone(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(INBOX_DONE_KEY) || '[]')
    return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

function writeDone(ids: string[]): void {
  try {
    localStorage.setItem(INBOX_DONE_KEY, JSON.stringify(ids.slice(-INBOX_DONE_MAX)))
  } catch {
    /* приватный режим / нет места — переживём, повтор маловероятен */
  }
}

let lastInboxAt = 0

/**
 * Перенести в стор операции, записанные сообщением боту.
 *
 * Записываем через `commitTransaction`, а не подменой массива: стор — источник
 * правды, и в этом действии живёт ещё и сдвиг периода просмотра на дату
 * операции. Запись «вчера продукты 1200» иначе попала бы в стор, но исчезла бы
 * с глаз, если человек смотрит на сегодняшний день.
 *
 * Порядок важен: сначала записать, потом подтвердить приём. Обратный порядок
 * терял бы операции при обрыве связи, а этот в худшем случае принесёт их
 * дважды — от чего и страхует список уже применённых id.
 */
async function mergeInbox(): Promise<void> {
  lastInboxAt = Date.now()
  let items
  try {
    items = await pullInbox()
  } catch {
    return // офлайн — заберём при следующем открытии
  }
  if (items.length === 0) return
  await exclusive(async () => applyInbox(items))
  try {
    // Подтверждаем ВСЕ пришедшие, включая те, что уже применяли раньше: иначе
    // однажды неподтверждённая запись осталась бы в очереди навсегда.
    await ackInbox(items.map((e) => e.id))
  } catch {
    /* не подтвердилось — подтвердим при следующем сливе, повтор отсечёт done */
  }
}

function applyInbox(items: Awaited<ReturnType<typeof pullInbox>>): void {
  const done = readDone()
  const fresh = items.filter((e) => !done.has(e.id))
  // Файл — одним импортом: он отсеет уже записанное (выписку присылают
  // повторно и внахлёст) и не дёргает стор сотни раз подряд.
  const imported = fresh.filter((e) => e.imp)
  if (imported.length) {
    const main = useStore.getState().currency
    useStore.getState().importTransactions(
      imported.map((e) => ({
        type: e.type,
        amount: e.amount,
        currency: e.currency ?? main,
        categoryId: e.categoryId,
        note: e.note,
        date: e.date,
      })),
    )
  }
  const commit = useStore.getState().commitTransaction
  for (const e of fresh.filter((x) => !x.imp)) {
    commit(
      {
        type: e.type,
        amount: e.amount,
        currency: e.currency,
        categoryId: e.categoryId,
        note: e.note,
        date: e.date,
      },
      null,
      // Период на экране не сдвигаем: человек открыл приложение, а не
      // записывал задним числом.
      { focus: false },
    )
  }

  writeDone([...done, ...fresh.map((e) => e.id)])
}

let retryArmed = false
let timedRetries = 0
function armSyncRetry(): void {
  if (retryArmed || typeof document === 'undefined') return
  retryArmed = true
  const retry = () => {
    if (!retryArmed) return
    retryArmed = false
    document.removeEventListener('visibilitychange', onVisible)
    clearTimeout(timer)
    void initCloudSync()
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible') retry()
  }
  document.addEventListener('visibilitychange', onVisible)
  const timer = timedRetries < 3 ? setTimeout(retry, 30000) : undefined
  if (timer !== undefined) timedRetries++
}

/**
 * Инициализация синка: тянем облако, решаем, что с ним делать, подписываемся на
 * изменения. Идемпотентна (запускается один раз). Безопасна вне Telegram.
 */
export async function initCloudSync(): Promise<void> {
  if (started) return
  if (!isBackendConfigured() || !tg.isInTelegram || !tg.initData) return
  started = true

  // Скачивание облака отделено от остальной логики: если оно не удалось, мы НЕ
  // знаем, что там лежит, и потому не имеем права ничего отправлять в этой
  // сессии — иначе пустой старт затрёт нормальные данные. Работаем локально,
  // синхронизируемся при следующем запуске.
  let cloud: Awaited<ReturnType<typeof pullCloud>>
  try {
    cloud = await pullCloud()
  } catch {
    // Сеть подвела (или сервер ответил ошибкой — это не «облака нет»). Повтор,
    // когда приложение снова на экране или через полминуты (не больше трёх раз).
    started = false
    armSyncRetry()
    return
  }

  let pushAfter = false
  try {
    const base = readBase()
    flushPersist() // читаем блоб напрямую — сначала дожидаемся отложенной записи
    const localTx = txCount(readBlob())
    const valid = !!cloud && isValidBlob(cloud.blob)
    const cloudTx = valid ? txCount(cloud!.blob) : 0
    cloudTxAtStart = Math.max(0, cloudTx)
    hadDataThisSession = localTx > 0

    // Облако битое — перезаписываем его своим, ведя от его версии.
    const plan = valid
      ? planStartup({ cloudAt: cloud!.updatedAt, cloudTx, localTx, localAt: legacyLocalAt(), baseV: base?.v })
      : 'push'
    if (plan === 'push') {
      // Облака нет или оно не менялось без нас — отправляем своё. Пустым
      // локальным состоянием непустое облако не перезаписываем.
      if (!base) baseHint = cloud ? cloud.updatedAt : 0
      if (!(localTx === 0 && cloudTx > 0)) pushAfter = true
    } else {
      // Облако изменилось без нас: сливаем (или, без основы, принимаем и
      // возвращаем свои новые записи). Отправляем и без отличий: сервер не
      // выпустит новую версию на то же содержимое, но отметит, что человек
      // сегодня заходил (по этому напоминания понимают, что писать не нужно).
      await mergeCloud(cloud!, plan)
      pushAfter = true
    }
  } catch {
    /* офлайн/ошибка — работаем локально, синхронизируемся позже */
  }

  // Любое изменение стора → отложенный пуш.
  useStore.subscribe(() => schedulePush())
  if (pushAfter) void flushPush()

  // Записи из бота забираем ПОСЛЕ того, как разобрались с облаком: слияние
  // перечитывает storage целиком (rehydrate) и стёрло бы всё, что мы добавили
  // до него. Подписка на изменения уже стоит, поэтому перенесённые операции
  // сами уедут в облако ближайшим пушем.
  await mergeInbox()

  // Не теряем последние правки при сворачивании/закрытии мини-аппа.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushNow()
      return
    }
    // Вернулись в приложение — возможно, человек тем временем написал боту.
    // Webview при этом не перезапускается, и без этой проверки запись ждала бы
    // до следующего холодного старта.
    if (Date.now() - lastInboxAt > INBOX_RECHECK_MS) void mergeInbox()
  })
  window.addEventListener('pagehide', flushNow)
}
