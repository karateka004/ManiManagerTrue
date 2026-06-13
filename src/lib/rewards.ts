/**
 * Награды «Дороги достижений» (роудпасс).
 *
 * Три типа косметики, которую можно НАДЕТЬ (equip):
 *   - accent — акцентная палитра приложения (меняет CSS-переменные --brand-*);
 *   - title  — косметический титул в профиле;
 *   - frame  — рамка вокруг аватара.
 *
 * У каждой награды есть рарность и уровень разблокировки: «просто так всё
 * быть не должно» — крутое открывается только с ростом уровня.
 * Прогресс по уровням идёт от активности (XP), см. lib/levels.ts.
 */

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary'
export type RewardKind = 'accent' | 'title' | 'frame'

export interface RarityMeta {
  label: string
  /** Цвет рамки/акцента бейджа рарности. */
  color: string
  /** Эмодзи-маркер. */
  dot: string
}

export const RARITY: Record<Rarity, RarityMeta> = {
  common: { label: 'Обычная', color: '#94A3B8', dot: '⚪' },
  rare: { label: 'Редкая', color: '#3B82F6', dot: '🔵' },
  epic: { label: 'Эпическая', color: '#A855F7', dot: '🟣' },
  legendary: { label: 'Легендарная', color: '#F59E0B', dot: '🟡' },
}

/** Полная палитра акцента: 10 RGB-триплетов «r g b» для --brand-50..900. */
export type AccentPalette = Record<50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900, string>

export interface RewardDef {
  id: string
  kind: RewardKind
  name: string
  rarity: Rarity
  /** Уровень, с которого награда разблокирована. */
  unlockLevel: number
  /** Короткое описание для витрины. */
  hint: string
  /** Для title — текст титула. */
  title?: string
  /** Для accent — палитра. */
  palette?: AccentPalette
  /** Для frame — CSS-стиль кольца (применяется к аватару через style.background для ring). */
  frame?: { ring: string; glow?: string }
}

/* ---------- Акцентные палитры ---------- */

const MINT: AccentPalette = {
  50: '241 250 245', 100: '220 242 229', 200: '184 229 204', 300: '143 211 172',
  400: '93 185 150', 500: '60 163 123', 600: '45 136 102', 700: '36 110 84',
  800: '29 87 67', 900: '20 63 48',
}
const OCEAN: AccentPalette = {
  50: '239 246 255', 100: '219 234 254', 200: '191 219 254', 300: '147 197 253',
  400: '96 165 250', 500: '59 130 246', 600: '37 99 235', 700: '29 78 216',
  800: '30 64 175', 900: '30 58 138',
}
const GRAPE: AccentPalette = {
  50: '245 243 255', 100: '237 233 254', 200: '221 214 254', 300: '196 181 253',
  400: '167 139 250', 500: '139 92 246', 600: '124 58 237', 700: '109 40 217',
  800: '91 33 182', 900: '76 29 149',
}
const SUNSET: AccentPalette = {
  50: '255 247 237', 100: '255 237 213', 200: '254 215 170', 300: '253 186 116',
  400: '251 146 60', 500: '249 115 22', 600: '234 88 12', 700: '194 65 12',
  800: '154 52 18', 900: '124 45 18',
}
const ROSE: AccentPalette = {
  50: '255 241 242', 100: '255 228 230', 200: '254 205 211', 300: '253 164 175',
  400: '251 113 133', 500: '244 63 94', 600: '225 29 72', 700: '190 18 60',
  800: '159 18 57', 900: '136 19 55',
}

/** Палитра по id акцента (для применения в useTheme). */
export const ACCENT_PALETTES: Record<string, AccentPalette> = {
  accent_mint: MINT,
  accent_ocean: OCEAN,
  accent_grape: GRAPE,
  accent_sunset: SUNSET,
  accent_rose: ROSE,
}

/* ---------- Каталог наград ---------- */

export const REWARDS: RewardDef[] = [
  // Акценты
  { id: 'accent_mint', kind: 'accent', name: 'Мятный', rarity: 'common', unlockLevel: 1, hint: 'Классический зелёный акцент', palette: MINT },
  { id: 'accent_ocean', kind: 'accent', name: 'Океан', rarity: 'rare', unlockLevel: 3, hint: 'Спокойный синий', palette: OCEAN },
  { id: 'accent_grape', kind: 'accent', name: 'Виноград', rarity: 'epic', unlockLevel: 5, hint: 'Глубокий фиолетовый', palette: GRAPE },
  { id: 'accent_sunset', kind: 'accent', name: 'Закат', rarity: 'epic', unlockLevel: 6, hint: 'Тёплый оранжевый', palette: SUNSET },
  { id: 'accent_rose', kind: 'accent', name: 'Роза', rarity: 'legendary', unlockLevel: 7, hint: 'Яркий розовый', palette: ROSE },

  // Титулы
  { id: 'title_newbie', kind: 'title', name: 'Новенький', rarity: 'common', unlockLevel: 1, hint: 'Все с чего-то начинают', title: 'Новенький' },
  { id: 'title_saver', kind: 'title', name: 'Хранитель монет', rarity: 'rare', unlockLevel: 2, hint: 'Бережёшь каждую копейку', title: 'Хранитель монет' },
  { id: 'title_budget', kind: 'title', name: 'Магистр бюджета', rarity: 'rare', unlockLevel: 4, hint: 'Бюджет под контролем', title: 'Магистр бюджета' },
  { id: 'title_guru', kind: 'title', name: 'Гуру финансов', rarity: 'epic', unlockLevel: 5, hint: 'Деньги слушаются тебя', title: 'Гуру финансов' },
  { id: 'title_lord', kind: 'title', name: 'Властелин кошелька', rarity: 'legendary', unlockLevel: 7, hint: 'Вершина мастерства', title: 'Властелин кошелька' },

  // Рамки аватара
  { id: 'frame_none', kind: 'frame', name: 'Без рамки', rarity: 'common', unlockLevel: 1, hint: 'Простой вид', frame: { ring: 'transparent' } },
  { id: 'frame_bronze', kind: 'frame', name: 'Бронза', rarity: 'rare', unlockLevel: 2, hint: 'Тёплый бронзовый ободок', frame: { ring: 'linear-gradient(135deg,#CD7F32,#E8B07A)' } },
  { id: 'frame_silver', kind: 'frame', name: 'Серебро', rarity: 'rare', unlockLevel: 4, hint: 'Холодный серебряный блеск', frame: { ring: 'linear-gradient(135deg,#C0C0C0,#EDEDED)' } },
  { id: 'frame_gold', kind: 'frame', name: 'Золото', rarity: 'epic', unlockLevel: 6, hint: 'Статусное золото', frame: { ring: 'linear-gradient(135deg,#F4C430,#FFE9A8)', glow: '0 0 12px rgba(244,196,48,0.5)' } },
  { id: 'frame_rainbow', kind: 'frame', name: 'Радуга', rarity: 'legendary', unlockLevel: 7, hint: 'Переливается всеми цветами', frame: { ring: 'conic-gradient(from 0deg,#F43F5E,#F59E0B,#22C55E,#3B82F6,#A855F7,#F43F5E)', glow: '0 0 14px rgba(168,85,247,0.45)' } },
]

/* ---------- Хелперы ---------- */

export const getReward = (id: string | null | undefined): RewardDef | undefined =>
  id ? REWARDS.find((r) => r.id === id) : undefined

export const rewardsByKind = (kind: RewardKind): RewardDef[] =>
  REWARDS.filter((r) => r.kind === kind)

export const isRewardUnlocked = (r: RewardDef, level: number): boolean =>
  level >= r.unlockLevel

/** Сколько наград уже разблокировано на данном уровне (для бейджа). */
export const unlockedCount = (level: number): number =>
  REWARDS.filter((r) => isRewardUnlocked(r, level)).length

/* ---------- Экономика: цена награды по рарности ---------- */

/**
 * Цена награды в монетах. Рарность = ценник: обычные в наборе бесплатно,
 * легендарные стоят дорого. Монеты копятся за ежедневную серию и задания —
 * так получается осмысленный сток валюты (см. lib/streak.ts, lib/quests.ts).
 */
export const RARITY_PRICE: Record<Rarity, number> = {
  common: 0,
  rare: 100,
  epic: 250,
  legendary: 600,
}

export const rewardPrice = (r: RewardDef): number => RARITY_PRICE[r.rarity]

/** Награды, которыми владеешь сразу (бесплатные common). */
export const DEFAULT_OWNED: string[] = REWARDS.filter((r) => RARITY_PRICE[r.rarity] === 0).map((r) => r.id)

/** Дефолтные надетые награды (когда ничего не выбрано). */
export const DEFAULT_EQUIPPED = {
  title: 'title_newbie',
  accent: 'accent_mint',
  frame: 'frame_none',
} as const

/* ---------- Витрина дня (ежедневная ротация со скидкой) ---------- */

/** Скидка витрины дня, %. */
export const DAILY_DISCOUNT_PCT = 30
/** Сколько предметов в витрине дня. */
const FEATURED_COUNT = 3
/** Покупаемые предметы (не бесплатные common). */
const BUYABLE_IDS: string[] = REWARDS.filter((r) => RARITY_PRICE[r.rarity] > 0).map((r) => r.id)

/** Детерминированный сид из строки (FNV-1a). */
function hashSeed(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** mulberry32 — детерминированный PRNG (тот же приём, что в demo.ts). */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Набор «витрины дня» — детерминированно по дате (`YYYY-MM-DD`), одинаков для всех
 * в этот день и меняется ежедневно. Сидированный Фишер-Йейтс по покупаемым предметам.
 */
export function featuredToday(dateKey: string): string[] {
  const rnd = mulberry32(hashSeed('shop:' + dateKey))
  const pool = [...BUYABLE_IDS]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    const tmp = pool[i]
    pool[i] = pool[j]
    pool[j] = tmp
  }
  return pool.slice(0, Math.min(FEATURED_COUNT, pool.length))
}

/** Цена со скидкой витрины дня (округление вниз до 5). */
export function discountedPrice(reward: RewardDef, pct: number = DAILY_DISCOUNT_PCT): number {
  const full = rewardPrice(reward)
  return Math.max(0, Math.floor((full * (100 - pct)) / 100 / 5) * 5)
}
