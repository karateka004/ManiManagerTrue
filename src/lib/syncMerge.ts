/**
 * Слияние облачного синка — чистыми функциями, без стора и сети: их проверяет
 * scripts/test-sync.mjs.
 *
 * ЧТО ЗАЩИЩАЕМ. Облако — снимок всего стора. Раньше побеждал тот, кто отправил
 * последним, и записи пропадали молча: связь при запуске подвела, человек
 * записал траты, а облако тем временем обновил другой телефон; или два
 * устройства открыты одновременно и затирают друг друга.
 *
 * КАК (с 2.6). Устройство хранит ОСНОВУ — каким облако было при последней
 * синхронизации: значения настроек целиком и отпечатки (хеши) записей по id.
 * Облако изменилось без нас — сливаем три версии, как система контроля версий:
 *   - изменено только здесь — берём своё; только там — облачное;
 *   - удалено здесь, а там не трогали — удаляем; удалено там — тоже;
 *   - добавлено с обеих сторон — оставляем всё (запись бота, которую забрали
 *     оба телефона, — один раз: ключ содержимого `sameAs`);
 *   - изменено с обеих сторон: счётчики (монеты, опыт, события) складываются
 *     приращениями, купленное и полученные задания объединяются, у серии дней
 *     побеждает более поздняя, у меток времени — поздняя; настройки-объекты
 *     (лимиты) сливаются по ключам; в остальном побеждает это устройство —
 *     в нём человек действовал последним.
 * Часы устройств сравниваются только в одном месте — у приложения до 2.6, где
 * основы ещё нет (`localAdditions`), и то один раз.
 */

/* ---------- Отпечатки ---------- */

/** JSON с ключами по алфавиту: один и тот же объект — одна строка, в каком бы порядке ни шли поля. */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']'
  const o = v as Record<string, unknown>
  return (
    '{' +
    Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + canonical(o[k]))
      .join(',') +
    '}'
  )
}

/** FNV-1a, 32 бита — для сравнения «менялось ли», не для защиты. */
export function hashString(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

const fingerprint = (v: unknown) => hashString(canonical(v))
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b)

/* ---------- Основа ---------- */

/** Списки записей с id: сливаются поштучно. Остальное — значениями целиком. */
export const LIST_KEYS = ['transactions', 'customCategories', 'goals', 'investments'] as const

export interface SyncBase {
  /** Версия облака (выдаёт сервер), которой соответствует основа. */
  v: number
  /** Значения всего, что не списки записей (настройки, монеты, бюджеты…). */
  scalars: Record<string, unknown>
  /** Отпечатки записей по id. */
  lists: Record<string, Record<string, string>>
}

type Data = Record<string, unknown>

/** Данные стора без функций-действий. */
export function dataOf(state: object): Data {
  const out: Data = {}
  for (const [k, v] of Object.entries(state)) if (typeof v !== 'function') out[k] = v
  return out
}

export function makeBase(data: Data, v: number): SyncBase {
  const scalars: Data = {}
  const lists: Record<string, Record<string, string>> = {}
  for (const [k, val] of Object.entries(data)) {
    if ((LIST_KEYS as readonly string[]).includes(k) && Array.isArray(val)) {
      const map: Record<string, string> = {}
      for (const item of val) {
        const id = (item as { id?: unknown })?.id
        if (typeof id === 'string') map[id] = fingerprint(item)
      }
      lists[k] = map
    } else scalars[k] = val
  }
  return { v, scalars, lists }
}

/** Основа из недоверенного хранилища: форма проверяется, мусор — как «основы нет». */
export function parseBase(raw: string | null): SyncBase | null {
  if (!raw) return null
  try {
    const b = JSON.parse(raw) as SyncBase
    if (!b || typeof b.v !== 'number' || !Number.isFinite(b.v) || !isPlainObject(b.scalars) || !isPlainObject(b.lists)) return null
    return b
  } catch {
    return null
  }
}

/* ---------- Слияние ---------- */

/** Списки строк: применить к облачному то, что здесь добавили и убрали относительно основы. */
function mergeStringArrays(local: string[], cloud: string[], base: string[]): string[] {
  const l = new Set(local)
  const b = new Set(base)
  const out = cloud.filter((x) => !(b.has(x) && !l.has(x)))
  for (const x of local) if (!b.has(x) && !out.includes(x)) out.push(x)
  return out
}

function isPlainObject(v: unknown): v is Data {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)

/** Счётчик: оба устройства прибавляли или тратили — складываем приращения. */
function counter(l: unknown, c: unknown, b: unknown): unknown {
  if (!num(l) || !num(c)) return l
  return num(b) ? Math.max(0, b + (l - b) + (c - b)) : Math.max(l, c)
}

function perKey(l: unknown, c: unknown, b: unknown, leaf: (l: unknown, c: unknown, b: unknown) => unknown): unknown {
  if (!isPlainObject(l) || !isPlainObject(c)) return l
  const base = isPlainObject(b) ? b : {}
  const out: Data = {}
  for (const k of new Set([...Object.keys(c), ...Object.keys(l)])) {
    const lv = l[k]
    const cv = c[k]
    const bv = base[k]
    const v = same(lv, cv) || same(lv, bv) ? cv : same(cv, bv) ? lv : leaf(lv, cv, bv)
    if (v !== undefined) out[k] = v
  }
  return out
}

const later = (l: unknown, c: unknown) => (num(l) && num(c) ? Math.max(l, c) : l)

/**
 * Поля, изменённые с обеих сторон, где «побеждает это устройство» было бы
 * неправдой. Остальное — своё (объекты — по ключам).
 */
const BOTH_CHANGED: Record<string, (l: unknown, c: unknown, b: unknown) => unknown> = {
  coins: counter,
  bonusXp: counter,
  events: (l, c, b) => perKey(l, c, b, counter),
  owned: (l, c, b) => strings(l, c, b),
  claimedQuests: (l, c, b) => strings(l, c, b),
  // Сколько друзей уже вознаграждено — не прибавляется, а догоняется.
  rewardedReferrals: later,
  // Когда получены награды заданий — по ключам, поздняя метка.
  questClaims: (l, c, b) => perKey(l, c, b, later),
  // Серия дня: та, что забрана позже (при равенстве — длиннее); рекорд — больший.
  streak: (l, c) => {
    const a = l as { count?: number; best?: number; lastClaim?: string | null }
    const z = c as { count?: number; best?: number; lastClaim?: string | null }
    if (!isPlainObject(a) || !isPlainObject(z)) return l
    const la = a.lastClaim ?? ''
    const lz = z.lastClaim ?? ''
    const win = la > lz ? a : lz > la ? z : (a.count ?? 0) >= (z.count ?? 0) ? a : z
    return { ...win, best: Math.max(a.best ?? 0, z.best ?? 0) }
  },
}

function strings(l: unknown, c: unknown, b: unknown): unknown {
  const isStrings = (x: unknown): x is string[] => Array.isArray(x) && x.every((v) => typeof v === 'string')
  if (!isStrings(l) || !isStrings(c)) return l
  return mergeStringArrays(l, c, isStrings(b) ? b : [])
}

function mergeValue(key: string, local: unknown, cloud: unknown, base: unknown): unknown {
  if (same(local, cloud)) return cloud
  if (same(local, base)) return cloud // менялось только там
  if (same(cloud, base)) return local // менялось только здесь
  const special = BOTH_CHANGED[key]
  if (special) return special(local, cloud, base)
  // Объект настроек (лимиты по категориям, надетое) — по ключам: правка разных
  // ключей на двух устройствах сохраняется вся; одного и того же — своя.
  if (isPlainObject(local) && isPlainObject(cloud)) return perKey(local, cloud, base, (l) => l)
  return local
}

/**
 * Записи списка. Порядок — облачный; свои новые — в начало (`newFirst`, у
 * операций новые сверху) или в конец.
 */
export function mergeList<T>(
  local: T[],
  cloud: T[],
  base: Record<string, string>,
  opts: { newFirst?: boolean; sameAs?: (x: T) => string } = {},
): T[] {
  const idOf = (x: T) => (x as { id?: unknown } | null)?.id
  const localById = new Map<string, T>()
  for (const x of local) {
    const id = idOf(x)
    if (typeof id === 'string') localById.set(id, x)
  }
  const cloudIds = new Set<string>()
  const out: T[] = []
  for (const c of cloud) {
    const id = idOf(c)
    if (typeof id !== 'string') {
      out.push(c)
      continue
    }
    cloudIds.add(id)
    const l = localById.get(id)
    const b = base[id]
    if (l !== undefined) {
      const hl = fingerprint(l)
      // Правили только там — облачное; только здесь или с обеих сторон — своё:
      // здесь человек действовал последним.
      out.push(hl === fingerprint(c) || hl === b ? c : l)
    } else if (b !== undefined) {
      // Удалено здесь. Там не трогали — удаляем; там успели поправить — оставляем.
      if (fingerprint(c) !== b) out.push(c)
    } else out.push(c) // добавлено там
  }

  // Своё, чего в облаке нет.
  const theirsNew = new Map<string, number>()
  if (opts.sameAs) {
    for (const c of cloud) {
      const id = idOf(c)
      if (typeof id === 'string' && base[id] === undefined && !localById.has(id)) {
        const k = opts.sameAs(c)
        theirsNew.set(k, (theirsNew.get(k) ?? 0) + 1)
      }
    }
  }
  const mineNew: T[] = []
  for (const l of local) {
    const id = idOf(l)
    if (typeof id !== 'string' || cloudIds.has(id)) continue
    const b = base[id]
    if (b !== undefined) {
      // Удалено там. Здесь не трогали — удаляем; здесь поправили — оставляем.
      if (fingerprint(l) !== b) mineNew.push(l)
      continue
    }
    if (opts.sameAs) {
      // Добавлено с обеих сторон одно и то же (запись бота забрали два телефона).
      const k = opts.sameAs(l)
      const n = theirsNew.get(k) ?? 0
      if (n > 0) {
        theirsNew.set(k, n - 1)
        continue
      }
    }
    mineNew.push(l)
  }
  return opts.newFirst ? [...mineNew, ...out] : [...out, ...mineNew]
}

/**
 * Слить локальное состояние с облачным относительно основы. Возвращает итог и
 * признак «отличается от облачного» — тогда итог надо отправить.
 */
export function mergeStates(
  local: Data,
  cloud: Data,
  base: SyncBase,
  sameAs?: (t: unknown) => string,
): { merged: Data; differs: boolean } {
  const merged: Data = {}
  for (const k of new Set([...Object.keys(cloud), ...Object.keys(local)])) {
    if ((LIST_KEYS as readonly string[]).includes(k) && Array.isArray(local[k]) && Array.isArray(cloud[k])) {
      merged[k] = mergeList(local[k] as unknown[], cloud[k] as unknown[], base.lists[k] ?? {}, {
        newFirst: k === 'transactions',
        sameAs: k === 'transactions' ? sameAs : undefined,
      })
    } else {
      const v = mergeValue(k, local[k], cloud[k], base.scalars[k])
      if (v !== undefined) merged[k] = v
    }
  }
  return { merged, differs: !same(merged, cloud) }
}

/* ---------- Приложение до 2.6: основы нет ---------- */

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
 * Без основы (первый запуск 2.6 на устройстве со старыми данными): что создано
 * здесь после `since` (метка последней отправки старого приложения) и в облаке
 * отсутствует. Грубее трёхстороннего слияния, но случается один раз.
 */
export function localAdditions<T extends { id: string }>(local: T[], cloud: T[], since: number, now = Date.now()): T[] {
  if (!Array.isArray(local) || local.length === 0) return []
  const inCloud = new Set((Array.isArray(cloud) ? cloud : []).map((x) => x?.id))
  return local.filter((x) => {
    if (!x || typeof x.id !== 'string' || inCloud.has(x.id)) return false
    const at = createdAtOf(x.id, now)
    return at !== null && at > since
  })
}

/* ---------- Запуск ---------- */

/**
 * Что делать при запуске, когда облако скачано.
 *   'push'  — облака нет или оно не менялось без нас: отправить своё;
 *   'merge' — облако изменилось без нас, основа есть: слить три версии;
 *   'adopt' — основы нет (приложение до 2.6), облако новее или здесь пусто:
 *             принять облако и вернуть свои новые записи по времени создания.
 */
export type StartupPlan = 'push' | 'merge' | 'adopt'

export function planStartup(i: {
  /** Версия облака; null — облака нет. */
  cloudAt: number | null
  cloudTx: number
  localTx: number
  /** Метка последнего снимка у приложения до 2.6. */
  localAt: number
  /** Версия, от которой ведёт основа; undefined — основы нет. */
  baseV?: number
}): StartupPlan {
  if (i.cloudAt === null) return 'push'
  // Пусто здесь, а в облаке есть операции — новое устройство или сбой загрузки,
  // а не «человек всё удалил»: принимаем облако как есть. Трёхстороннее слияние
  // тут опасно — пустота против основы выглядела бы как удаление всего.
  if (i.localTx === 0 && i.cloudTx > 0) return 'adopt'
  if (i.baseV !== undefined) return i.cloudAt === i.baseV ? 'push' : 'merge'
  return i.cloudAt > i.localAt ? 'adopt' : 'push'
}
