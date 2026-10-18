/**
 * Решения облачного синка — чистыми функциями, без стора и сети: их проверяет
 * scripts/test-sync.mjs.
 *
 * ЧТО ЗАЩИЩАЕМ. Облако — снимок всего стора, и победителем раньше был тот, кто
 * отправил последним. Отсюда две дыры, где записи пропадали молча:
 *   1. Связь при запуске подвела, человек записал траты, а облако тем временем
 *      обновил другой телефон — повторная загрузка принимала облако целиком.
 *   2. Два устройства открыты одновременно: отправка одного затирала то, что
 *      успело записать другое.
 *
 * КАК. Устройство помнит, от какой версии облака оно ведёт (`base`). Облако
 * изменилось без нас — не перезаписываем его и не принимаем молча, а сливаем:
 * берём облачный снимок и возвращаем в него то, что сделано здесь и до облака
 * ещё не доходило, — операции, свои категории, цели и активы, созданные после
 * последней подтверждённой отправки (`syncedAt`). Момент создания — в самом id
 * (хвост cuid, см. store/transactions.ts).
 *
 * ЧЕГО НЕ ДЕЛАЕМ. Правки и удаления, сделанные без связи, не сливаются: из двух
 * версий одной записи побеждает облачная. Удалённое на другом устройстве не
 * воскресает — возвращаем только созданное здесь после последней синхронизации.
 */

/** Хвост cuid — Date.now() в base36: восемь знаков до 2059 года. */
const STAMP_LEN = 8
/** Раньше этого момента наших id не было — значит, хвост не метка времени. */
const EPOCH_MIN = Date.UTC(2020, 0, 1)

/** Когда создан объект с таким id. null — id не нашего формата (не судим по нему). */
export function createdAtOf(id: string, now = Date.now()): number | null {
  if (typeof id !== 'string' || id.length < STAMP_LEN + 1) return null
  const tail = id.slice(-STAMP_LEN)
  if (!/^[0-9a-z]+$/.test(tail)) return null
  const t = parseInt(tail, 36)
  return t >= EPOCH_MIN && t <= now + 86_400_000 ? t : null
}

/**
 * Что создано здесь после `since` и в облачном снимке отсутствует. Совпадение
 * id — это одна и та же запись, даже если её правили.
 *
 * `sameAs` — ключ содержимого для записей, которые могли появиться на двух
 * устройствах независимо: запись из бота забирают оба открытых телефона, каждый
 * со своим id. Такая запись, уже пришедшая в облако с другого устройства, второй
 * раз не возвращается (с учётом количества: две одинаковые — две).
 */
export function localAdditions<T extends { id: string }>(
  local: T[],
  cloud: T[],
  since: number,
  now = Date.now(),
  sameAs?: (x: T) => string,
): T[] {
  if (!Array.isArray(local) || local.length === 0) return []
  const cloudList = Array.isArray(cloud) ? cloud.filter((x) => x && typeof x.id === 'string') : []
  const inCloud = new Set(cloudList.map((x) => x.id))
  const fresh = local.filter((x) => {
    if (!x || typeof x.id !== 'string' || inCloud.has(x.id)) return false
    const at = createdAtOf(x.id, now)
    return at !== null && at > since
  })
  if (!sameAs || fresh.length === 0) return fresh
  // Пришедшее с других устройств: в облаке есть, у нас — нет.
  const localIds = new Set(local.map((x) => x?.id))
  const theirs = new Map<string, number>()
  for (const x of cloudList) {
    if (localIds.has(x.id)) continue
    const k = sameAs(x)
    theirs.set(k, (theirs.get(k) ?? 0) + 1)
  }
  return fresh.filter((x) => {
    const k = sameAs(x)
    const n = theirs.get(k) ?? 0
    if (n === 0) return true
    theirs.set(k, n - 1)
    return false
  })
}

/**
 * Что делать при запуске, когда облако скачано.
 *   'adopt' — принять облако и вернуть в него свои несинхронизированные записи;
 *   'push'  — облако не менялось без нас: отправить своё (как и раньше на каждом
 *             запуске — правка за секунду до закрытия могла не уйти);
 *   'own'   — в облаке наш же снимок, ответ на отправку которого потерялся.
 */
export type StartupPlan = 'adopt' | 'push' | 'own'

export function planStartup(i: {
  /** Метка облачного снимка; null — облака нет или оно битое. */
  cloudAt: number | null
  cloudTx: number
  localTx: number
  /** Метка последнего снимка этого устройства (отправленного или принятого). */
  localAt: number
  /** От какой версии облака ведёт устройство; undefined — приложение до 2.6. */
  base?: number
  /** Метки отправок, ответ на которые не пришёл. */
  tried: number[]
}): StartupPlan {
  if (i.cloudAt === null) return 'push'
  // Пусто здесь, а в облаке есть операции — это новое устройство или сбой
  // загрузки, а не «человек всё удалил».
  if (i.localTx === 0 && i.cloudTx > 0) return 'adopt'
  if (i.base !== undefined) {
    if (i.cloudAt === i.base) return 'push'
    if (i.tried.includes(i.cloudAt)) return 'own'
    return 'adopt'
  }
  // Приложение до 2.6 версию-основу не помнило: решаем по времени, как раньше,
  // но принятие облака теперь возвращает свои новые записи.
  return i.cloudAt > i.localAt ? 'adopt' : 'push'
}
