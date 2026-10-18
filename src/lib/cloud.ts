/**
 * Облачная синхронизация данных за Telegram-аккаунтом.
 *
 * Цель: с какого устройства человек ни зашёл в Telegram — у него его аккаунт и
 * его деньги. Весь стор приложения (persist-блоб) привязывается к TG-аккаунту
 * через воркер (KV `data:<userId>`, доступ только по проверенной подписи initData).
 *
 * Стратегия (с 2.6): снимок целиком, но без молчаливой потери записей.
 *  - Устройство помнит версию облака, от которой ведёт (`base`). При запуске:
 *    облако не менялось без нас — отправляем своё; изменилось — принимаем его и
 *    возвращаем в него свои ещё не отправленные записи (см. syncMerge.ts).
 *  - На любое изменение стора — отложенный (debounced) пуш с этой версией.
 *    Облако тем временем изменил другой телефон — сервер не перезаписывает его,
 *    а возвращает текущее: сливаем так же и отправляем снова.
 *  - При сворачивании/закрытии — досрочный сброс отложенного пуша.
 *
 * Сливаются только новые записи (операции, свои категории, цели, активы). Правка
 * одной и той же записи на двух устройствах — побеждает облачная версия.
 *
 * Вне Telegram (обычный браузер, превью) синк выключен — приложение работает
 * локально, как раньше.
 */
import { useStore, flushPersist } from '../store/transactions'
import { ackInbox, isBackendConfigured, pullCloud, pullInbox, pushCloud, type CloudSnapshot } from './api'
import { localAdditions, planStartup } from './syncMerge'
import { dedupeKey } from './csvImport'
import { translate } from './i18n'
import { showToast } from './toast'
import { tg } from './telegram'

/** Ключ persist-стора (см. `name` в store/transactions.ts). */
const PERSIST_KEY = 'finance-mini-app:v1'
/** Локальная метка последней синхронизации (вне синкаемого блоба). */
const META_KEY = 'koshel:cloudMeta'
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

/** Что устройство знает о своей синхронизации (вне синкаемого блоба). */
interface SyncMeta {
  /** Метка последнего снимка этого устройства: отправленного или принятого. */
  updatedAt?: number
  /** Версия облака, от которой ведёт устройство (с 2.6). */
  base?: number
  /** Всё, что создано здесь раньше этого момента, облако уже видело. */
  syncedAt?: number
  /** Отправки без ответа: если облако окажется одной из них — это наш же снимок. */
  tried?: number[]
}
const TRIED_MAX = 5

function readMeta(): SyncMeta {
  try {
    const m = JSON.parse(localStorage.getItem(META_KEY) || '{}') as Record<string, unknown>
    const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : undefined)
    return {
      updatedAt: num(m.updatedAt),
      base: num(m.base),
      syncedAt: num(m.syncedAt),
      tried: Array.isArray(m.tried) ? m.tried.filter((x): x is number => typeof x === 'number') : [],
    }
  } catch {
    return { tried: [] }
  }
}

function writeMeta(patch: SyncMeta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify({ ...readMeta(), ...patch }))
  } catch {
    /* приватный режим / нет места — переживём */
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
/** Пока принимаем облако — не пушим (иначе тут же отправили бы только что скачанное). */
let adopting = false
/**
 * Принятие облака и перенос записей бота — по очереди: перенос, вклинившийся
 * между снимком своих записей и перечитыванием стора, потерял бы операции, о
 * приёме которых бот уже знает.
 */
let queue: Promise<unknown> = Promise.resolve()
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn)
  queue = run.catch(() => {})
  return run
}
/** Слияний по конфликту за минуту — защита от пинг-понга двух открытых устройств. */
let conflictTimes: number[] = []
let pushTimer: ReturnType<typeof setTimeout> | null = null
/** Сколько операций было в облаке на старте сессии (для защиты от затирания). */
let cloudTxAtStart = 0
/**
 * Были ли в этой сессии данные локально. Если были и исчезли — значит человек
 * сам всё удалил, и пустой снимок отправлять законно. Если приложение
 * стартовало пустым при непустом облаке — это сбой загрузки, пуш запрещён.
 */
let hadDataThisSession = false

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
  // Облако как раз принимается — отправим после, уже слитое.
  if (adopting) {
    pushTimer = setTimeout(flushPush, PUSH_DEBOUNCE)
    return
  }
  const meta = readMeta()
  // Метка снимка — до чтения: всё, что создано раньше неё, в снимке есть.
  // Строго растёт: два снимка с одной меткой сервер не различил бы.
  const updatedAt = Math.max(Date.now(), (meta.updatedAt ?? 0) + 1)
  flushPersist() // на диске должен лежать актуальный снимок, а не отложенный
  const blob = readBlob()
  if (!blob) return

  // Страховка от потери данных: не отправляем снимок без операций поверх
  // облака, в котором они были, — если только человек сам их не удалил.
  const local = txCount(blob)
  const emptyOverData = local === 0 && cloudTxAtStart > 0 && !hadDataThisSession
  if (emptyOverData) return

  writeMeta({ updatedAt, tried: [...(meta.tried ?? []), updatedAt].slice(-TRIED_MAX) })
  let res: Awaited<ReturnType<typeof pushCloud>> | null
  try {
    res = await pushCloud(blob, updatedAt, local === 0 && hadDataThisSession, meta.base)
  } catch {
    return // офлайн — отправим при следующем изменении; метка останется в tried
  }
  if (!res) return
  // Облако изменил другой телефон (или старый сервер сказал «у меня новее»).
  if ((res.conflict || res.skipped) && res.data) {
    await resolveConflict(res.data)
    return
  }
  if (res.ok && !res.skipped) writeMeta({ base: updatedAt, syncedAt: updatedAt, tried: [] })
}

/**
 * Сервер не принял снимок: облако изменилось без нас. Если это наш же прошлый
 * снимок (ответ потерялся по дороге) — просто ведём от него. Иначе принимаем
 * облако, возвращаем свои несинхронизированные записи и отправляем снова.
 */
async function resolveConflict(snap: CloudSnapshot): Promise<void> {
  const meta = readMeta()
  if ((meta.tried ?? []).includes(snap.updatedAt)) {
    writeMeta({ base: snap.updatedAt, syncedAt: Math.max(meta.syncedAt ?? 0, snap.updatedAt), tried: [] })
    schedulePush()
    return
  }
  if (!isValidBlob(snap.blob)) return
  const now = Date.now()
  conflictTimes = conflictTimes.filter((t) => now - t < 60_000)
  if (conflictTimes.length >= 3) return
  conflictTimes.push(now)
  const added = await adoptCloud(snap)
  if (added > 0) schedulePush()
  // Данные на экране поменялись посреди сессии — объясняем, откуда: иначе
  // чужая запись или откат своей правки выглядели бы как сбой.
  showToast({ text: translate(useStore.getState().lang, 'sync.merged') })
}

/**
 * Принять облачный снимок и вернуть в него то, что сделано здесь после
 * последней подтверждённой синхронизации и в облако не попало. Возвращает,
 * сколько записей вернули (больше нуля — облаку их нужно отправить).
 */
function adoptCloud(snap: CloudSnapshot): Promise<number> {
  return exclusive(async () => {
    const meta = readMeta()
    // Приложение до 2.6 не помнило syncedAt — берём метку последней отправки.
    const since = meta.syncedAt ?? meta.updatedAt ?? 0
    const mine = useStore.getState()
    const keep = {
      transactions: mine.transactions,
      customCategories: mine.customCategories,
      goals: mine.goals,
      investments: mine.investments,
    }
    adopting = true
    flushPersist() // отложенная запись не должна «догнать» и затереть облако
    const prev = readBlob() // снимок локального ДО перезаписи (для отката)
    try {
      localStorage.setItem(PERSIST_KEY, snap.blob)
      // rehydrate перечитает storage, прогонит миграции и обновит стор.
      await useStore.persist.rehydrate()
      const cloud = useStore.getState()
      const extra = {
        transactions: localAdditions(keep.transactions, cloud.transactions, since, Date.now(), dedupeKey),
        customCategories: localAdditions(keep.customCategories, cloud.customCategories, since),
        goals: localAdditions(keep.goals, cloud.goals, since),
        investments: localAdditions(keep.investments, cloud.investments, since),
      }
      const added = extra.transactions.length + extra.customCategories.length + extra.goals.length + extra.investments.length
      if (added > 0) {
        useStore.setState((s) => ({
          transactions: [...extra.transactions, ...s.transactions],
          customCategories: [...s.customCategories, ...extra.customCategories],
          goals: [...s.goals, ...extra.goals],
          investments: [...s.investments, ...extra.investments],
        }))
      }
      // syncedAt не двигаем: возвращённые записи облако ещё не видело — если и
      // следующая отправка сорвётся, их надо будет вернуть снова.
      writeMeta({ updatedAt: snap.updatedAt, base: snap.updatedAt, tried: [] })
      if (txCount(snap.blob) > 0 || keep.transactions.length > 0) hadDataThisSession = true
      return added
    } catch {
      // Применить не удалось — откатываемся на прежние локальные данные, не теряем их.
      try {
        if (prev !== null) localStorage.setItem(PERSIST_KEY, prev)
        else localStorage.removeItem(PERSIST_KEY)
        await useStore.persist.rehydrate()
      } catch {
        /* совсем плохо — оставляем как есть */
      }
      return 0
    } finally {
      adopting = false
    }
  })
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
 * Инициализация синка: тянем облако, решаем кто новее, подписываемся на изменения.
 * Идемпотентна (запускается один раз). Безопасна вне Telegram — просто выходит.
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
    // Сеть подвела. Раньше синк на этом заканчивался до следующего холодного
    // старта, и правки всей сессии не уходили в облако. Теперь — повтор, когда
    // приложение снова на экране или через полминуты (не больше трёх раз).
    started = false
    armSyncRetry()
    return
  }

  let pushAfter = false
  try {
    const meta = readMeta()
    flushPersist() // читаем блоб напрямую — сначала дожидаемся отложенной записи
    const localTx = txCount(readBlob())
    const valid = !!cloud && isValidBlob(cloud.blob)
    const cloudTx = valid ? txCount(cloud!.blob) : 0
    cloudTxAtStart = Math.max(0, cloudTx)
    hadDataThisSession = localTx > 0

    const plan = planStartup({
      cloudAt: valid ? cloud!.updatedAt : null,
      cloudTx,
      localTx,
      localAt: meta.updatedAt ?? 0,
      base: meta.base,
      tried: meta.tried ?? [],
    })
    if (plan === 'adopt') {
      // Облако изменилось без нас: принимаем и возвращаем свои новые записи.
      if ((await adoptCloud(cloud!)) > 0) pushAfter = true
    } else {
      // Облако не менялось без нас (или в нём наш же снимок) — отправляем своё,
      // ведя от того, что в облаке лежит. Пустым локальным состоянием непустое
      // облако не перезаписываем.
      writeMeta({ base: cloud ? cloud.updatedAt : 0 })
      if (!(localTx === 0 && cloudTx > 0)) pushAfter = true
    }
  } catch {
    /* офлайн/ошибка сети — работаем локально, синхронизируемся позже */
  }

  // Любое изменение стора → отложенный пуш.
  useStore.subscribe(() => schedulePush())
  if (pushAfter) void flushPush()

  // Записи из бота забираем ПОСЛЕ того, как разобрались с облаком: принятие
  // облачного снимка перечитывает storage целиком (rehydrate) и стёрло бы всё,
  // что мы добавили до него. Подписка на изменения уже стоит, поэтому
  // перенесённые операции сами уедут в облако ближайшим пушем.
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
