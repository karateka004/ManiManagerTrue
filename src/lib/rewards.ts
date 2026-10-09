/**
 * Награды «Дороги достижений» (роудпасс).
 *
 * Пять типов косметики, которую можно НАДЕТЬ (equip):
 *   - accent — акцентная палитра приложения (меняет CSS-переменные --brand-*);
 *   - title  — косметический титул в профиле;
 *   - frame  — рамка вокруг аватара (с 2.1 бывают живые: вращение, дыхание);
 *   - card   — обложка тёмной карты-героя (баланс на Главной, уровень);
 *   - effect — эффект при записи операции (искры, монетки, конфетти).
 *
 * У каждой награды есть рарность и уровень разблокировки: «просто так всё
 * быть не должно» — крутое открывается только с ростом уровня.
 * Прогресс по уровням идёт от активности (XP), см. lib/levels.ts.
 */

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary'
export type RewardKind = 'accent' | 'title' | 'frame' | 'card' | 'effect'

/**
 * Особая рамка (см. components/rewards/FrameRing и styles/skins.css):
 *   spin  — кольцо медленно вращается;
 *   pulse — дышит цветом акцента;
 *   week  — семь сегментов, закрашены дни текущей серии (данные, а не узор).
 * Анимируется только на крупном аватаре (от 56 px): на 40 px движение не
 * разглядеть, и оно читается как мельтешение.
 */
export type FrameAnim = 'spin' | 'pulse' | 'week'

/** Эффект записи операции (см. lib/saveEffect.ts). */
export type SaveEffect = 'none' | 'sparks' | 'confetti' | 'stars'

export interface RarityMeta {
  label: string
  /** Цвет рамки/акцента бейджа рарности. */
  color: string
}

export const RARITY: Record<Rarity, RarityMeta> = {
  common: { label: 'Обычная', color: '#94A3B8' },
  rare: { label: 'Редкая', color: '#3B82F6' },
  epic: { label: 'Эпическая', color: '#A855F7' },
  legendary: { label: 'Легендарная', color: '#F59E0B' },
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
  frame?: { ring: string; glow?: string; anim?: FrameAnim }
  /** Для card — id обложки: класс `skin-<id>` на .hero-surface ('' — классика). */
  card?: string
  /** Для effect — что проигрывается при записи операции. */
  effect?: SaveEffect
  /** Новинка релиза: в магазине помечается «Новое». */
  fresh?: boolean
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
  // 2.1 — короткие (до 14 знаков): длинный титул под именем режется многоточием.
  { id: 'title_minimal', kind: 'title', name: 'Минималист', rarity: 'rare', unlockLevel: 1, hint: 'Меньше вещей — больше свободы', title: 'Минималист', fresh: true },
  { id: 'title_treasurer', kind: 'title', name: 'Казначей', rarity: 'rare', unlockLevel: 1, hint: 'Каждая монета на учёте', title: 'Казначей', fresh: true },
  { id: 'title_stoic', kind: 'title', name: 'Стоик', rarity: 'epic', unlockLevel: 1, hint: 'Распродажи тебя не берут', title: 'Стоик', fresh: true },

  // Рамки аватара
  { id: 'frame_none', kind: 'frame', name: 'Без рамки', rarity: 'common', unlockLevel: 1, hint: 'Простой вид', frame: { ring: 'transparent' } },
  // Металлы — коническим градиентом: блики по кругу, как на настоящем ободке,
  // а не плоский переход из угла в угол.
  { id: 'frame_bronze', kind: 'frame', name: 'Бронза', rarity: 'rare', unlockLevel: 2, hint: 'Тёплый бронзовый ободок', frame: { ring: 'conic-gradient(from 200deg,#8C5326,#E8B07A,#B87333,#F3CDA4,#8C5326,#CD7F32,#8C5326)' } },
  { id: 'frame_silver', kind: 'frame', name: 'Серебро', rarity: 'rare', unlockLevel: 4, hint: 'Холодный серебряный блеск', frame: { ring: 'conic-gradient(from 200deg,#8E959C,#F4F6F8,#B6BCC2,#FFFFFF,#8E959C,#D3D8DC,#8E959C)' } },
  { id: 'frame_gold', kind: 'frame', name: 'Золото', rarity: 'epic', unlockLevel: 6, hint: 'Статусное золото', frame: { ring: 'conic-gradient(from 200deg,#A87A12,#FFE9A8,#E2B23C,#FFF4CC,#A87A12,#F4C430,#A87A12)', glow: '0 0 12px rgba(244,196,48,0.45)' } },
  { id: 'frame_rainbow', kind: 'frame', name: 'Радуга', rarity: 'legendary', unlockLevel: 7, hint: 'Переливается всеми цветами', frame: { ring: 'conic-gradient(from 0deg,#F43F5E,#F59E0B,#22C55E,#3B82F6,#A855F7,#F43F5E)', glow: '0 0 14px rgba(168,85,247,0.45)' } },
  { id: 'frame_emerald', kind: 'frame', name: 'Изумруд', rarity: 'epic', unlockLevel: 5, hint: 'Драгоценная зелень', frame: { ring: 'linear-gradient(135deg,#10B981,#6EE7B7)', glow: '0 0 12px rgba(16,185,129,0.5)' } },
  { id: 'frame_neon', kind: 'frame', name: 'Неон', rarity: 'legendary', unlockLevel: 8, hint: 'Киберпанк-свечение', frame: { ring: 'linear-gradient(135deg,#22D3EE,#E879F9)', glow: '0 0 14px rgba(34,211,238,0.55)' } },
  // 2.1 — особые рамки (CSS, только transform/opacity; анимация — от 56 px).
  { id: 'frame_ice', kind: 'frame', name: 'Лёд', rarity: 'rare', unlockLevel: 1, hint: 'Прозрачный холодный блеск', frame: { ring: 'conic-gradient(from 200deg,#7DD3FC,#F0F9FF,#38BDF8,#E0F2FE,#7DD3FC,#BAE6FD,#7DD3FC)', glow: '0 0 10px rgba(56,189,248,0.35)' }, fresh: true },
  { id: 'frame_week', kind: 'frame', name: 'Неделя', rarity: 'epic', unlockLevel: 1, hint: 'Семь делений — дни твоей серии', frame: { ring: 'rgb(var(--brand-500))', anim: 'week' }, fresh: true },
  { id: 'frame_pulse', kind: 'frame', name: 'Пульс', rarity: 'epic', unlockLevel: 1, hint: 'Дышит цветом твоего акцента', frame: { ring: 'conic-gradient(from 210deg, rgb(var(--brand-300)), rgb(var(--brand-600)), rgb(var(--brand-300)))', anim: 'pulse' }, fresh: true },
  { id: 'frame_vortex', kind: 'frame', name: 'Вихрь', rarity: 'legendary', unlockLevel: 1, hint: 'Кольцо, которое не стоит на месте', frame: { ring: 'conic-gradient(from 0deg,#22D3EE,#818CF8,#E879F9,#FB7185,#FBBF24,#22D3EE)', glow: '0 0 14px rgba(129,140,248,0.45)', anim: 'spin' }, fresh: true },

  // Обложки карты-героя (2.1). Все тёмные: светлота фона под текстом не выше
  // 0,08, подписи white/70 читаются на худшем участке (контраст от 4,5).
  { id: 'card_classic', kind: 'card', name: 'Классика', rarity: 'common', unlockLevel: 1, hint: 'Глубина цвета акцента', card: '' },
  { id: 'card_midnight', kind: 'card', name: 'Полночь', rarity: 'rare', unlockLevel: 1, hint: 'Чернильная синь и холодный свет', card: 'midnight', fresh: true },
  { id: 'card_titan', kind: 'card', name: 'Титан', rarity: 'rare', unlockLevel: 1, hint: 'Холодный металл с бликом', card: 'titan', fresh: true },
  { id: 'card_dawn', kind: 'card', name: 'Рассвет', rarity: 'rare', unlockLevel: 1, hint: 'Сливовый вечер и янтарный свет', card: 'dawn', fresh: true },
  { id: 'card_onyx', kind: 'card', name: 'Оникс', rarity: 'epic', unlockLevel: 1, hint: 'Чёрный камень с мягкими прожилками', card: 'onyx', fresh: true },
  { id: 'card_blackgold', kind: 'card', name: 'Чёрное золото', rarity: 'epic', unlockLevel: 1, hint: 'Золотая кромка на чёрном', card: 'blackgold', fresh: true },
  { id: 'card_aurora', kind: 'card', name: 'Северное сияние', rarity: 'legendary', unlockLevel: 1, hint: 'Всполохи света в углу карты', card: 'aurora', fresh: true },
  { id: 'card_holo', kind: 'card', name: 'Голограмма', rarity: 'legendary', unlockLevel: 1, hint: 'Переливается под пальцем', card: 'holo', fresh: true },

  // Эффекты записи операции (2.1).
  { id: 'effect_none', kind: 'effect', name: 'Без эффекта', rarity: 'common', unlockLevel: 1, hint: 'Запись без украшений', effect: 'none' },
  { id: 'effect_sparks', kind: 'effect', name: 'Искры', rarity: 'rare', unlockLevel: 1, hint: 'Вспышка цвета акцента', effect: 'sparks', fresh: true },
  { id: 'effect_confetti', kind: 'effect', name: 'Конфетти', rarity: 'epic', unlockLevel: 1, hint: 'Маленький праздник для привычки', effect: 'confetti', fresh: true },
  { id: 'effect_stars', kind: 'effect', name: 'Звездопад', rarity: 'legendary', unlockLevel: 1, hint: 'Звёзды летят из кнопки «Записать»', effect: 'stars', fresh: true },

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
  card: 'card_classic',
  effect: 'effect_none',
} as const

/** Порядок разделов магазина: сначала то, что видно каждый день. */
export const SHOP_KINDS: RewardKind[] = ['card', 'accent', 'frame', 'title', 'effect']

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
 * Набор «витрины дня» — детерминированно по дате (`YYYY-MM-DD`) и меняется
 * ежедневно. Сидированный Фишер-Йейтс по покупаемым предметам; уже купленное
 * пропускается — скидка на то, что у человека есть, витрину только занимала.
 * Порядок одинаков для всех, поэтому у двух людей витрины совпадают, пока
 * они не купили разное.
 */
export function featuredToday(dateKey: string, owned: readonly string[] = []): string[] {
  const rnd = mulberry32(hashSeed('shop:' + dateKey))
  const pool = [...BUYABLE_IDS]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    const tmp = pool[i]
    pool[i] = pool[j]
    pool[j] = tmp
  }
  return pool.filter((id) => !owned.includes(id)).slice(0, FEATURED_COUNT)
}

/* ---------- Подарок за серию ---------- */

/**
 * Рубежи серии, за которые дарится вещь из магазина, и её редкость. Вместо
 * сундука за монеты: подарок — за привычку заходить каждый день, а не за азарт.
 */
export const STREAK_GIFTS: Record<number, Exclude<Rarity, 'common' | 'legendary'>> = {
  7: 'rare',
  14: 'rare',
  30: 'epic',
}

/**
 * Случайная ещё не купленная вещь нужной редкости; если такой не осталось —
 * следующей редкости (дарим лучше, а не ничего). null — всё уже есть.
 */
export function pickGift(owned: readonly string[], rarity: Rarity, rnd: () => number = Math.random): string | null {
  const order: Rarity[] = ['rare', 'epic', 'legendary']
  for (const r of order.slice(Math.max(0, order.indexOf(rarity)))) {
    const pool = SHOP_REWARDS.filter((x) => x.rarity === r && !owned.includes(x.id))
    if (pool.length) return pool[Math.min(pool.length - 1, Math.floor(rnd() * pool.length))].id
  }
  return null
}

/** Мс до полуночи по местному времени — витрина дня обновится в этот момент. */
export function msToMidnight(now: Date = new Date()): number {
  const next = new Date(now)
  next.setHours(24, 0, 0, 0)
  return next.getTime() - now.getTime()
}

/** Цена со скидкой витрины дня (округление вниз до 5). */
export function discountedPrice(reward: RewardDef, pct: number = DAILY_DISCOUNT_PCT): number {
  const full = rewardPrice(reward)
  return Math.max(0, Math.floor((full * (100 - pct)) / 100 / 5) * 5)
}
