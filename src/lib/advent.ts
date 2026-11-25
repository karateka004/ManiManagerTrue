/**
 * Адвент-календарь: что в окошках и как они открываются. Чистые функции без
 * стора и сети — их проверяет scripts/test-advent.mjs; экран адвента кладёт
 * результат в стор одним setState. Ленивый чанк: в стартовом только даты
 * (lib/season.ts).
 *
 * Правила:
 *   - окошко дня открывается в свой день бесплатно и засчитывает день серии
 *     (в декабре оно заменяет плитку «Серия дня»: та же награда серии, те же
 *     подарки за 7/14/30 дней — плюс подарок окошка);
 *   - пропущенное — позже, до 14 января, за ADVENT_LATE_PRICE монет и без дня
 *     серии;
 *   - будущие закрыты;
 *   - 1–14 января — главный подарок, если открыто не меньше ADVENT_FINAL_NEED.
 * Вещь, которая уже есть, — монетами (ADVENT_DUP_COINS): окошко не бывает пустым.
 *
 * Опыт адвента входит в потолок XP рейтинга: ADVENT_TOTAL_XP повторён в
 * worker/src/index.ts (XP_ADVENT), их сверяет test-advent.mjs.
 */
import dayjs from 'dayjs'
import { nextStreak, type StreakState, type StreakReward } from './streak'
import { STREAK_GIFTS, pickGift } from './rewards'
import {
  ADVENT_DAYS,
  ADVENT_FINAL_NEED,
  ADVENT_LATE_PRICE,
  LATE,
  doorKey,
  finalKey,
  freezeKey,
  freezesLeft,
  isDoorOpen,
  openedCount,
  season,
  type Season,
} from './season'

/** Действие под советом дня: запись, планирование, вопрос ассистенту. */
export type AdventAction = 'add' | 'limits' | 'budget' | 'goals' | 'ask'

export interface AdventDoor {
  day: number
  coins: number
  xp: number
  /** Вещь новогодней коллекции (lib/rewards, source 'advent'). */
  item?: string
  /** Заморозка серии: пропущенный день не обнулит серию (lib/season FREEZE_DAYS). */
  freeze?: boolean
  /** Сундучок: вещь магазина этой редкости, которой ещё нет. */
  chest?: 'rare' | 'epic'
  /** Кнопка под советом дня (текст — в components/advent/tips.ts). */
  action?: AdventAction
}

/**
 * 31 окошко. В каждом — монеты и опыт; в пятнадцати — вещь новогодней
 * коллекции: титулы-никнеймы, рамки аватара (видны в рейтинге), акценты,
 * обложка, эффект. В 7-м и 21-м — заморозка серии, в 13-м и 27-м — сундучок с
 * вещью из магазина (её ещё нет), в 31-м — Дед Мороз и итоги года.
 */
export const ADVENT_DOORS: AdventDoor[] = [
  { day: 1, coins: 10, xp: 10, item: 'title_snowman', action: 'limits' },
  { day: 2, coins: 15, xp: 5, action: 'add' },
  { day: 3, coins: 10, xp: 10, item: 'frame_icerim' },
  { day: 4, coins: 15, xp: 5 },
  { day: 5, coins: 10, xp: 10, item: 'accent_frost', action: 'budget' },
  { day: 6, coins: 25, xp: 10, action: 'goals' },
  { day: 7, coins: 20, xp: 15, freeze: true },
  { day: 8, coins: 10, xp: 5, item: 'title_elf' },
  { day: 9, coins: 20, xp: 10 },
  { day: 10, coins: 10, xp: 10, item: 'effect_snow', action: 'add' },
  { day: 11, coins: 25, xp: 10, action: 'ask' },
  { day: 12, coins: 10, xp: 5, item: 'title_tangerine' },
  { day: 13, coins: 15, xp: 15, chest: 'rare' },
  { day: 14, coins: 15, xp: 10, action: 'ask' },
  { day: 15, coins: 10, xp: 10, item: 'frame_tinsel' },
  { day: 16, coins: 10, xp: 5, item: 'title_reindeer' },
  { day: 17, coins: 25, xp: 10 },
  { day: 18, coins: 10, xp: 10, item: 'accent_cranberry' },
  { day: 19, coins: 30, xp: 15, action: 'goals' },
  { day: 20, coins: 10, xp: 10, item: 'card_lights', action: 'limits' },
  { day: 21, coins: 25, xp: 10, freeze: true },
  { day: 22, coins: 10, xp: 10, item: 'title_strategist' },
  { day: 23, coins: 25, xp: 15 },
  { day: 24, coins: 10, xp: 15, item: 'frame_candy', action: 'add' },
  { day: 25, coins: 15, xp: 15, item: 'frame_garland' },
  { day: 26, coins: 20, xp: 10, action: 'ask' },
  { day: 27, coins: 15, xp: 10, chest: 'epic', action: 'goals' },
  { day: 28, coins: 10, xp: 10, item: 'title_drifts' },
  { day: 29, coins: 15, xp: 15, item: 'frame_aurora', action: 'budget' },
  { day: 30, coins: 30, xp: 15, action: 'add' },
  { day: 31, coins: 20, xp: 20, item: 'title_santa' },
]

/** Главный подарок 1 января: легендарная обложка и титул. */
export const ADVENT_FINAL = { coins: 100, xp: 100, items: ['card_newyear', 'title_newyear'] }

/** Вещь окошка уже есть (купил раньше, прошлый сезон) — вместо неё монеты. */
export const ADVENT_DUP_COINS = 50

/** Весь опыт адвента — для потолка рейтинга (worker: XP_ADVENT). */
export const ADVENT_TOTAL_XP = ADVENT_DOORS.reduce((a, d) => a + d.xp, 0) + ADVENT_FINAL.xp

/** Вещи новогодней коллекции по порядку окошек (финальные — последними). */
export const ADVENT_ITEMS: { id: string; day: number | 'final' }[] = [
  ...ADVENT_DOORS.filter((d) => d.item).map((d) => ({ id: d.item as string, day: d.day })),
  ...ADVENT_FINAL.items.map((id) => ({ id, day: 'final' as const })),
]

export interface AdventGift {
  coins: number
  xp: number
  /** Новые вещи (уже имеющиеся заменены монетами), вместе с вещью из сундучка. */
  items: string[]
  /** Вещь окошка уже была — её монеты сверху. */
  dup: boolean
  /** Заморозок серии в окошке. */
  freeze: number
  /** Вещь из сундучка (она же в items); всё уже есть — null, монеты сверху. */
  chest: string | null
}

export function doorGift(day: number, owned: readonly string[], rnd: () => number = Math.random): AdventGift {
  const door = ADVENT_DOORS[day - 1]
  if (!door) return { coins: 0, xp: 0, items: [], dup: false, freeze: 0, chest: null }
  const dup = !!door.item && owned.includes(door.item)
  const items = door.item && !dup ? [door.item] : []
  let coins = door.coins + (dup ? ADVENT_DUP_COINS : 0)
  let chest: string | null = null
  if (door.chest) {
    chest = pickGift([...owned, ...items], door.chest, rnd)
    if (chest) items.push(chest)
    else coins += ADVENT_DUP_COINS
  }
  return { coins, xp: door.xp, items, dup, freeze: door.freeze ? 1 : 0, chest }
}

export function finalGift(owned: readonly string[]): AdventGift {
  const fresh = ADVENT_FINAL.items.filter((id) => !owned.includes(id))
  const dups = ADVENT_FINAL.items.length - fresh.length
  return {
    coins: ADVENT_FINAL.coins + dups * ADVENT_DUP_COINS,
    xp: ADVENT_FINAL.xp,
    items: fresh,
    dup: dups > 0,
    freeze: 0,
    chest: null,
  }
}

/** Что выпало из сундучка: '2026-chest-13:card_titan' в списке `advent`. */
export const chestKey = (year: number, day: number, id: string): string =>
  `${year}-chest-${String(day).padStart(2, '0')}:${id}`

export function chestOf(advent: readonly string[], year: number, day: number): string | null {
  const head = `${year}-chest-${String(day).padStart(2, '0')}:`
  const k = advent.find((x) => x.startsWith(head))
  return k ? k.slice(head.length) : null
}

/** Главное в окошке — что показать в ящичке и крупно в карточке подарка. */
export type DoorPrize =
  | { type: 'item'; id: string }
  | { type: 'chest'; id: string | null }
  | { type: 'freeze' }
  | { type: 'coins'; coins: number; xp: number }

export function doorPrize(day: number, advent: readonly string[], year: number): DoorPrize {
  const door = ADVENT_DOORS[day - 1]
  if (!door) return { type: 'coins', coins: 0, xp: 0 }
  if (door.item) return { type: 'item', id: door.item }
  if (door.chest) return { type: 'chest', id: chestOf(advent, year, day) }
  if (door.freeze) return { type: 'freeze' }
  return { type: 'coins', coins: door.coins, xp: door.xp }
}

/** Окошки с заморозкой в таблице совпадают с FREEZE_DAYS (сверяет test-advent). */
export const FREEZE_DOORS = ADVENT_DOORS.filter((d) => d.freeze).map((d) => d.day)

/** Состояние окошка на экране. */
export type DoorState = 'open' | 'today' | 'missed' | 'locked'

export function doorState(advent: readonly string[], s: Season, day: number): DoorState {
  if (s.phase === 'off' || s.phase === 'teaser') return 'locked'
  if (isDoorOpen(advent, s.year, day)) return 'open'
  if (s.phase === 'finale') return 'missed'
  if (day === s.day) return 'today'
  return day < s.day ? 'missed' : 'locked'
}

/** Поля стора, которые трогает адвент. */
export interface AdventSlice {
  advent: string[]
  coins: number
  bonusXp: number
  owned: string[]
  streak: StreakState
}

export type StreakPart = StreakReward & {
  count: number
  gift: string | null
  /** Сколько пропущенных дней закрыли заморозки. */
  frozen: number
}

export type OpenResult =
  | {
      ok: true
      day: number
      /** Открыто позже своего дня — за монеты, без дня серии. */
      late: boolean
      price: number
      gift: AdventGift
      /** День серии, если окошко открыто в свой день и сегодня серию ещё не забирали. */
      streak: StreakPart | null
      patch: Partial<AdventSlice>
    }
  | { ok: false; reason: 'season' | 'locked' | 'opened' | 'coins' }

/**
 * Открыть окошко `day`. Возвращает изменение стора (patch) и что получено —
 * для празднования на экране. Ничего не меняет сам.
 */
export function openDoor(s: AdventSlice, day: number, now: Date = new Date(), rnd: () => number = Math.random): OpenResult {
  const sea = season(now)
  if (sea.phase !== 'live' && sea.phase !== 'finale') return { ok: false, reason: 'season' }
  if (!Number.isInteger(day) || day < 1 || day > ADVENT_DAYS) return { ok: false, reason: 'locked' }
  if (sea.phase === 'live' && day > sea.day) return { ok: false, reason: 'locked' }
  if (isDoorOpen(s.advent, sea.year, day)) return { ok: false, reason: 'opened' }

  const late = !(sea.phase === 'live' && day === sea.day)
  const price = late ? ADVENT_LATE_PRICE : 0
  if (s.coins < price) return { ok: false, reason: 'coins' }

  const gift = doorGift(day, s.owned, rnd)
  let owned = gift.items.length ? [...s.owned, ...gift.items] : s.owned
  let coins = s.coins - price + gift.coins
  let bonusXp = s.bonusXp + gift.xp
  let streakPart: StreakPart | null = null
  let streak: StreakState | undefined
  let advent = [...s.advent, doorKey(sea.year, day) + (late ? LATE : '')]
  if (gift.chest) advent.push(chestKey(sea.year, day, gift.chest))

  // Окошко дня = день серии (с подарком за 7/14/30 дней, как у плитки серии).
  // Заморозки — в том числе только что выпавшая — закрывают пропущенные дни.
  if (!late) {
    const next = nextStreak(s.streak, dayjs(now), freezesLeft(advent, now))
    if (next) {
      const rarity = STREAK_GIFTS[next.reward.milestone]
      const streakGift = rarity ? pickGift(owned, rarity, rnd) : null
      if (streakGift) owned = [...owned, streakGift]
      coins += next.reward.coins
      bonusXp += next.reward.xp
      streak = next.state
      if (next.frozen.length) advent = [...advent, ...next.frozen.map((d) => freezeKey(sea.year, d))]
      streakPart = { ...next.reward, count: next.state.count, gift: streakGift, frozen: next.frozen.length }
    }
  }

  const patch: Partial<AdventSlice> = {
    advent,
    coins: Math.max(0, coins),
    bonusXp: Math.max(0, bonusXp),
    ...(owned !== s.owned ? { owned } : {}),
    ...(streak ? { streak } : {}),
  }
  return { ok: true, day, late, price, gift, streak: streakPart, patch }
}

export type FinalResult =
  | { ok: true; gift: AdventGift; patch: Partial<AdventSlice> }
  | { ok: false; reason: 'season' | 'need' | 'opened' }

/** Главный подарок: 1–14 января, если открыто не меньше ADVENT_FINAL_NEED окошек. */
export function openFinal(s: AdventSlice, now: Date = new Date()): FinalResult {
  const sea = season(now)
  if (sea.phase !== 'finale') return { ok: false, reason: 'season' }
  const key = finalKey(sea.year)
  if (s.advent.includes(key)) return { ok: false, reason: 'opened' }
  if (openedCount(s.advent, sea.year) < ADVENT_FINAL_NEED) return { ok: false, reason: 'need' }
  const gift = finalGift(s.owned)
  return {
    ok: true,
    gift,
    patch: {
      advent: [...s.advent, key],
      coins: Math.max(0, s.coins + gift.coins),
      bonusXp: Math.max(0, s.bonusXp + gift.xp),
      ...(gift.items.length ? { owned: [...s.owned, ...gift.items] } : {}),
    },
  }
}

/**
 * Награда по ключу из списка `advent` — для слияния облака: окошко, открытое
 * на двух устройствах до синхронизации, дало бы подарок дважды. Вещи без
 * монет-замены: какая из сторон уже владела вещью, при слиянии не узнать.
 */
export function adventKeyGift(key: string): { xp: number; coins: number; price: number } | undefined {
  const door = /^(\d{4})-12-(\d{2})$/.exec(key)
  if (door) {
    const d = ADVENT_DOORS[Number(door[2]) - 1]
    return d ? { xp: d.xp, coins: d.coins, price: ADVENT_LATE_PRICE } : undefined
  }
  if (/^\d{4}-final$/.test(key)) return { xp: ADVENT_FINAL.xp, coins: ADVENT_FINAL.coins, price: 0 }
  return undefined
}
