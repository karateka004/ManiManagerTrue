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
  /**
   * Для титулов за уровень — какой нужен рекорд ежедневной серии (`streak.best`),
   * второе условие вдобавок к уровню. XP набивается пачкой операций за вечер,
   * а серия — нет: её можно набрать только заходя изо дня в день.
   */
  unlockDays?: number
  /** Короткое описание для витрины. */
  hint: string
  /**
   * Откуда берётся награда. Не задано — обычный товар магазина (за монеты);
   * 'level' — выдаётся бесплатно по достижении unlockLevel (экран «Титулы уровня»);
   * 'gift' — персональный подарок от команды (PERSONAL_GIFTS), в магазине не виден.
   */
  source?: 'level' | 'gift'
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
const LAGOON: AccentPalette = {
  50: '240 253 250', 100: '204 251 241', 200: '153 246 228', 300: '94 234 212',
  400: '45 212 191', 500: '20 184 166', 600: '13 148 136', 700: '15 118 110',
  800: '17 94 89', 900: '19 78 74',
}
const GOLD: AccentPalette = {
  50: '255 251 235', 100: '254 243 199', 200: '253 230 138', 300: '252 211 77',
  400: '251 191 36', 500: '245 158 11', 600: '217 119 6', 700: '180 83 9',
  800: '146 64 14', 900: '120 53 15',
}
const GRAPHITE: AccentPalette = {
  50: '248 250 252', 100: '241 245 249', 200: '226 232 240', 300: '203 213 225',
  400: '148 163 184', 500: '100 116 139', 600: '71 85 105', 700: '51 65 85',
  800: '30 41 59', 900: '15 23 42',
}

/** Палитра по id акцента (для применения в useTheme). */
export const ACCENT_PALETTES: Record<string, AccentPalette> = {
  accent_mint: MINT,
  accent_ocean: OCEAN,
  accent_grape: GRAPE,
  accent_sunset: SUNSET,
  accent_rose: ROSE,
  accent_lagoon: LAGOON,
  accent_gold: GOLD,
  accent_graphite: GRAPHITE,
}

/* ---------- Каталог наград ---------- */

export const REWARDS: RewardDef[] = [
  // Акценты
  { id: 'accent_mint', kind: 'accent', name: 'Мятный', rarity: 'common', unlockLevel: 1, hint: 'Классический зелёный акцент', palette: MINT },
  { id: 'accent_ocean', kind: 'accent', name: 'Океан', rarity: 'rare', unlockLevel: 3, hint: 'Спокойный синий', palette: OCEAN },
  { id: 'accent_grape', kind: 'accent', name: 'Виноград', rarity: 'epic', unlockLevel: 5, hint: 'Глубокий фиолетовый', palette: GRAPE },
  { id: 'accent_sunset', kind: 'accent', name: 'Закат', rarity: 'epic', unlockLevel: 6, hint: 'Тёплый оранжевый', palette: SUNSET },
  { id: 'accent_rose', kind: 'accent', name: 'Роза', rarity: 'legendary', unlockLevel: 7, hint: 'Яркий розовый', palette: ROSE },
  { id: 'accent_lagoon', kind: 'accent', name: 'Лагуна', rarity: 'rare', unlockLevel: 3, hint: 'Бирюзовая свежесть', palette: LAGOON },
  { id: 'accent_gold', kind: 'accent', name: 'Золотой', rarity: 'epic', unlockLevel: 8, hint: 'Роскошный янтарь', palette: GOLD },
  { id: 'accent_graphite', kind: 'accent', name: 'Графит', rarity: 'legendary', unlockLevel: 9, hint: 'Строгий монохром', palette: GRAPHITE },

  // Титулы
  { id: 'title_newbie', kind: 'title', name: 'Новенький', rarity: 'common', unlockLevel: 1, hint: 'Все с чего-то начинают', title: 'Новенький' },
  { id: 'title_saver', kind: 'title', name: 'Хранитель монет', rarity: 'rare', unlockLevel: 2, hint: 'Бережёшь каждую копейку', title: 'Хранитель монет' },
  { id: 'title_budget', kind: 'title', name: 'Магистр бюджета', rarity: 'rare', unlockLevel: 4, hint: 'Бюджет под контролем', title: 'Магистр бюджета' },
  { id: 'title_guru', kind: 'title', name: 'Гуру финансов', rarity: 'epic', unlockLevel: 5, hint: 'Деньги слушаются тебя', title: 'Гуру финансов' },
  { id: 'title_lord', kind: 'title', name: 'Властелин кошелька', rarity: 'legendary', unlockLevel: 7, hint: 'Вершина мастерства', title: 'Властелин кошелька' },
  { id: 'title_investor', kind: 'title', name: 'Инвестор', rarity: 'rare', unlockLevel: 3, hint: 'Деньги работают на тебя', title: 'Инвестор' },
  { id: 'title_shark', kind: 'title', name: 'Акула бизнеса', rarity: 'epic', unlockLevel: 6, hint: 'В финансах — как рыба в воде', title: 'Акула бизнеса' },
  { id: 'title_crypto', kind: 'title', name: 'Криптомагнат', rarity: 'legendary', unlockLevel: 9, hint: 'Портфель в цифре', title: 'Криптомагнат' },

  // Рамки аватара
  { id: 'frame_none', kind: 'frame', name: 'Без рамки', rarity: 'common', unlockLevel: 1, hint: 'Простой вид', frame: { ring: 'transparent' } },
  { id: 'frame_bronze', kind: 'frame', name: 'Бронза', rarity: 'rare', unlockLevel: 2, hint: 'Тёплый бронзовый ободок', frame: { ring: 'linear-gradient(135deg,#CD7F32,#E8B07A)' } },
  { id: 'frame_silver', kind: 'frame', name: 'Серебро', rarity: 'rare', unlockLevel: 4, hint: 'Холодный серебряный блеск', frame: { ring: 'linear-gradient(135deg,#C0C0C0,#EDEDED)' } },
  { id: 'frame_gold', kind: 'frame', name: 'Золото', rarity: 'epic', unlockLevel: 6, hint: 'Статусное золото', frame: { ring: 'linear-gradient(135deg,#F4C430,#FFE9A8)', glow: '0 0 12px rgba(244,196,48,0.5)' } },
  { id: 'frame_rainbow', kind: 'frame', name: 'Радуга', rarity: 'legendary', unlockLevel: 7, hint: 'Переливается всеми цветами', frame: { ring: 'conic-gradient(from 0deg,#F43F5E,#F59E0B,#22C55E,#3B82F6,#A855F7,#F43F5E)', glow: '0 0 14px rgba(168,85,247,0.45)' } },
  { id: 'frame_emerald', kind: 'frame', name: 'Изумруд', rarity: 'epic', unlockLevel: 5, hint: 'Драгоценная зелень', frame: { ring: 'linear-gradient(135deg,#10B981,#6EE7B7)', glow: '0 0 12px rgba(16,185,129,0.5)' } },
  { id: 'frame_neon', kind: 'frame', name: 'Неон', rarity: 'legendary', unlockLevel: 8, hint: 'Киберпанк-свечение', frame: { ring: 'linear-gradient(135deg,#22D3EE,#E879F9)', glow: '0 0 14px rgba(34,211,238,0.55)' } },

  // Титулы за уровень (source: 'level') — бесплатные, открываются прогрессом.
  // Два условия сразу: уровень И рекорд ежедневной серии (5/10/15/20, дальше шаг 10).
  // Основной «флекс»: надетый титул виден другим в таблице лидеров.
  { id: 'title_lvl1', kind: 'title', name: 'Первопроходец', rarity: 'common', unlockLevel: 1, unlockDays: 5, hint: 'Начало пути', source: 'level', title: 'Первопроходец' },
  { id: 'title_lvl2', kind: 'title', name: 'Копилка', rarity: 'common', unlockLevel: 2, unlockDays: 10, hint: 'Монетка к монетке', source: 'level', title: 'Копилка' },
  { id: 'title_lvl3', kind: 'title', name: 'Знаток монет', rarity: 'rare', unlockLevel: 3, unlockDays: 15, hint: 'Видит цену всему', source: 'level', title: 'Знаток монет' },
  { id: 'title_lvl4', kind: 'title', name: 'Мастер учёта', rarity: 'rare', unlockLevel: 4, unlockDays: 20, hint: 'Ни одной потерянной траты', source: 'level', title: 'Мастер учёта' },
  { id: 'title_lvl5', kind: 'title', name: 'Стратег', rarity: 'rare', unlockLevel: 5, unlockDays: 30, hint: 'Планирует на ходы вперёд', source: 'level', title: 'Стратег' },
  { id: 'title_lvl6', kind: 'title', name: 'Кит', rarity: 'epic', unlockLevel: 6, unlockDays: 40, hint: 'Крупная рыба в финансах', source: 'level', title: 'Кит' },
  { id: 'title_lvl7', kind: 'title', name: 'Живая легенда', rarity: 'epic', unlockLevel: 7, unlockDays: 50, hint: 'О тебе уже рассказывают', source: 'level', title: 'Живая легенда' },
  { id: 'title_lvl8', kind: 'title', name: 'Финансовый маг', rarity: 'epic', unlockLevel: 8, unlockDays: 60, hint: 'Деньги появляются из воздуха', source: 'level', title: 'Финансовый маг' },
  { id: 'title_lvl9', kind: 'title', name: 'Мидас', rarity: 'legendary', unlockLevel: 9, unlockDays: 70, hint: 'Всё, к чему прикасаешься, — золото', source: 'level', title: 'Мидас' },
  { id: 'title_lvl10', kind: 'title', name: 'Император Кошеля', rarity: 'legendary', unlockLevel: 10, unlockDays: 80, hint: 'Вершина. Выше только звёзды', source: 'level', title: 'Император Кошеля' },

  // Персональные подарки (source: 'gift') — выдаются вручную через PERSONAL_GIFTS.
  { id: 'title_ambassador', kind: 'title', name: 'Амбассадор', rarity: 'legendary', unlockLevel: 1, hint: 'Особый знак от команды Кошеля', source: 'gift', title: 'Амбассадор' },
]

/* ---------- Хелперы ---------- */

export const getReward = (id: string | null | undefined): RewardDef | undefined =>
  id ? REWARDS.find((r) => r.id === id) : undefined

/** Товары магазина (без уровневых и подарочных наград). */
export const SHOP_REWARDS: RewardDef[] = REWARDS.filter((r) => !r.source)

/** Товары магазина заданного типа. */
export const rewardsByKind = (kind: RewardKind): RewardDef[] =>
  SHOP_REWARDS.filter((r) => r.kind === kind)

/** Титулы за уровень — по возрастанию уровня (экран «Титулы уровня»). */
export const LEVEL_REWARDS: RewardDef[] = REWARDS.filter((r) => r.source === 'level').sort(
  (a, b) => a.unlockLevel - b.unlockLevel,
)

/**
 * Персональные подарки от команды: TG user id → id наград.
 * Выдаются автоматически при запуске (см. useGrantPersonalGifts в App.tsx),
 * идемпотентно через grantReward. Добавлять по согласованию с владельцем.
 */
export const PERSONAL_GIFTS: Record<string, string[]> = {
  // '<tg-user-id>': ['title_ambassador'],
}

/** То же по @username (в нижнем регистре, без @) — когда численный id неизвестен. */
export const PERSONAL_GIFTS_BY_USERNAME: Record<string, string[]> = {
  mikhail7182: ['title_ambassador'],
}

/** Подарки для конкретного пользователя: по id и/или username (пустой массив, если нет). */
export const giftsFor = (
  userId: number | string | undefined | null,
  username?: string | null,
): string[] => {
  const byId = userId == null ? [] : PERSONAL_GIFTS[String(userId)] ?? []
  const byName = username ? PERSONAL_GIFTS_BY_USERNAME[username.toLowerCase()] ?? [] : []
  return [...new Set([...byId, ...byName])]
}

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

/** Награды, которыми владеешь сразу (бесплатные common из магазина; уровневые и подарочные — нет). */
export const DEFAULT_OWNED: string[] = SHOP_REWARDS.filter((r) => RARITY_PRICE[r.rarity] === 0).map((r) => r.id)

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
/** Покупаемые предметы (не бесплатные common; только товары магазина). */
const BUYABLE_IDS: string[] = SHOP_REWARDS.filter((r) => RARITY_PRICE[r.rarity] > 0).map((r) => r.id)

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
