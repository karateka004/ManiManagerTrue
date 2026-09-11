/**
 * Облачная синхронизация данных за Telegram-аккаунтом.
 *
 * Цель: с какого устройства человек ни зашёл в Telegram — у него его аккаунт и
 * его деньги. Весь стор приложения (persist-блоб) привязывается к TG-аккаунту
 * через воркер (KV `data:<userId>`, доступ только по проверенной подписи initData).
 *
 * Стратегия: last-write-wins по метке времени `updatedAt`.
 *  - При запуске тянем облако. Если оно новее локального — принимаем (rehydrate).
 *    Иначе заливаем локальные данные как базу.
 *  - На любое изменение стора — отложенный (debounced) пуш в облако.
 *  - При сворачивании/закрытии — досрочный сброс отложенного пуша.
 *
 * Сценарий «одно устройство за раз» (открыл на телефоне → потом на планшете)
 * работает идеально. Одновременное редактирование с двух устройств — редкий
 * случай: победит то, что изменилось последним (данные не мёржатся пооперационно).
 *
 * Вне Telegram (обычный браузер, превью) синк выключен — приложение работает
 * локально, как раньше.
 */
import { useStore, flushPersist } from '../store/transactions'
import { ackInbox, isBackendConfigured, pullCloud, pullInbox, pushCloud } from './api'
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
const INBOX_DONE_MAX = 100
/** Как часто перепроверять входящие при возврате в приложение. */
const INBOX_RECHECK_MS = 30_000

function getLocalUpdatedAt(): number {
  try {
    const m = JSON.parse(localStorage.getItem(META_KEY) || '{}')
    return typeof m.updatedAt === 'number' ? m.updatedAt : 0
  } catch {
    return 0
  }
}

function setLocalUpdatedAt(t: number): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify({ updatedAt: t }))
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
  flushPersist() // на диске должен лежать актуальный снимок, а не отложенный
  const blob = readBlob()
  if (!blob) return

  // Страховка от потери данных: не отправляем снимок без операций поверх
  // облака, в котором они были, — если только человек сам их не удалил.
  const local = txCount(blob)
  const emptyOverData = local === 0 && cloudTxAtStart > 0 && !hadDataThisSession
  if (emptyOverData) return

  const updatedAt = Date.now()
  setLocalUpdatedAt(updatedAt)
  try {
    await pushCloud(blob, updatedAt, local === 0 && hadDataThisSession)
  } catch {
    /* офлайн — отправим при следующем изменении */
  }
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

  const done = readDone()
  const fresh = items.filter((e) => !done.has(e.id))
  const commit = useStore.getState().commitTransaction
  for (const e of fresh) {
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
    )
  }

  writeDone([...done, ...fresh.map((e) => e.id)])
  try {
    // Подтверждаем ВСЕ пришедшие, включая те, что уже применяли раньше: иначе
    // однажды неподтверждённая запись осталась бы в очереди навсегда.
    await ackInbox(items.map((e) => e.id))
  } catch {
    /* не подтвердилось — подтвердим при следующем сливе, повтор отсечёт done */
  }
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
    return
  }

  try {
    const localAt = getLocalUpdatedAt()
    flushPersist() // читаем блоб напрямую — сначала дожидаемся отложенной записи
    const localTx = txCount(readBlob())
    const cloudTx = cloud && isValidBlob(cloud.blob) ? txCount(cloud.blob) : 0
    cloudTxAtStart = Math.max(0, cloudTx)
    hadDataThisSession = localTx > 0

    // Принимаем облако, если оно новее ЛИБО если локально пусто, а в облаке есть
    // операции (спасает новое устройство с «залипшей» локальной меткой времени).
    const cloudNewer = !!cloud && cloud.updatedAt > localAt
    const localEmpty = localTx === 0 && cloudTx > 0

    if (cloud && isValidBlob(cloud.blob) && (cloudNewer || localEmpty)) {
      // Облако новее и блоб валиден — принимаем его.
      adopting = true
      flushPersist() // отложенная запись не должна «догнать» и затереть облако
      const prev = readBlob() // снимок локального ДО перезаписи (для отката)
      try {
        localStorage.setItem(PERSIST_KEY, cloud.blob)
        // rehydrate перечитает storage, прогонит миграции и обновит стор.
        await useStore.persist.rehydrate()
        setLocalUpdatedAt(cloud.updatedAt)
        if (cloudTx > 0) hadDataThisSession = true
      } catch {
        // Применить не удалось — откатываемся на прежние локальные данные, не теряем их.
        try {
          if (prev !== null) localStorage.setItem(PERSIST_KEY, prev)
          else localStorage.removeItem(PERSIST_KEY)
          await useStore.persist.rehydrate()
        } catch {
          /* совсем плохо — оставляем как есть */
        }
      } finally {
        adopting = false
      }
    } else {
      // Локальные данные новее (или облака ещё нет) — заливаем их как базу.
      // Пустым локальным состоянием непустое облако не перезаписываем.
      const blob = readBlob()
      if (blob && !(localTx === 0 && cloudTx > 0)) {
        const updatedAt = localAt || Date.now()
        setLocalUpdatedAt(updatedAt)
        pushCloud(blob, updatedAt).catch(() => {})
      }
    }
  } catch {
    /* офлайн/ошибка сети — работаем локально, синхронизируемся позже */
  }

  // Любое изменение стора → отложенный пуш.
  useStore.subscribe(() => schedulePush())

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
