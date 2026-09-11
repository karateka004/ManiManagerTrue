/**
 * Разбор строки, присланной боту, в операцию.
 *
 * Смысл затеи: записать трату должно стоить одного сообщения, а не похода в
 * приложение. Человек пишет «кофе 300» — этого достаточно.
 *
 * Модуль намеренно чистый: ни KV, ни Telegram, ни fetch. Поэтому его можно
 * прогнать на сотне примеров без сети (см. worker/scripts/test-entry.mjs).
 */

/* ------------------------------------------------------------------ */
/* Категории                                                           */
/* ------------------------------------------------------------------ */
/*
 * Список id обязан совпадать с DEFAULT_CATEGORIES в src/store/categories.ts —
 * иначе бот запишет операцию в категорию, которой в приложении нет, и она
 * покажется «Без категории». Совпадение проверяется на каждый lint
 * (worker/scripts/check-categories.mjs), а не на честное слово.
 *
 * Синонимы — то, как люди на самом деле пишут. Их можно и нужно пополнять:
 * это самая дешёвая правка во всей затее.
 */
export interface CatRule {
  id: string
  kind: 'income' | 'expense'
  /** Слова, по которым узнаём категорию. Первое — название из приложения. */
  words: string[]
}

export const CATEGORY_RULES: CatRule[] = [
  // Доходы
  { id: 'salary', kind: 'income', words: ['зарплата', 'зп', 'зарплату', 'аванс', 'оклад', 'получка'] },
  { id: 'freelance', kind: 'income', words: ['подработка', 'фриланс', 'халтура', 'заказ', 'гонорар'] },
  { id: 'gift_in', kind: 'income', words: ['подарок', 'подарили', 'премия', 'кэшбек', 'кешбек', 'кэшбэк', 'возврат'] },
  { id: 'other_in', kind: 'income', words: ['доход', 'приход', 'продал', 'продала', 'перевод'] },

  // Расходы
  { id: 'food', kind: 'expense', words: ['еда', 'продукты', 'магазин', 'супермаркет', 'ашан', 'сильпо', 'атб', 'пятерочка', 'пятёрочка', 'лента', 'хлеб', 'молоко', 'обед', 'ужин', 'завтрак'] },
  { id: 'cafe', kind: 'expense', words: ['кафе', 'кофе', 'ресторан', 'бар', 'пиво', 'кофейня', 'старбакс', 'макдак', 'доставка', 'пицца', 'суши', 'бургер', 'латте', 'капучино'] },
  { id: 'transport', kind: 'expense', words: ['транспорт', 'метро', 'автобус', 'такси', 'убер', 'болт', 'маршрутка', 'трамвай', 'электричка', 'проезд', 'билет'] },
  { id: 'car', kind: 'expense', words: ['машина', 'авто', 'бензин', 'заправка', 'топливо', 'парковка', 'шиномонтаж', 'сто', 'мойка'] },
  { id: 'home', kind: 'expense', words: ['жилье', 'жильё', 'квартира', 'аренда', 'квартплата', 'коммуналка', 'свет', 'газ', 'вода', 'ипотека', 'ремонт'] },
  { id: 'health', kind: 'expense', words: ['здоровье', 'аптека', 'врач', 'лекарства', 'стоматолог', 'анализы', 'клиника', 'зубной', 'таблетки'] },
  { id: 'clothes', kind: 'expense', words: ['одежда', 'обувь', 'кроссовки', 'куртка', 'джинсы', 'футболка', 'шмотки'] },
  { id: 'fun', kind: 'expense', words: ['развлечения', 'кино', 'театр', 'концерт', 'игры', 'подписка', 'нетфликс', 'спотифай', 'клуб', 'бильярд'] },
  { id: 'gift', kind: 'expense', words: ['подарки', 'цветы', 'сувенир'] },
  { id: 'sport', kind: 'expense', words: ['спорт', 'зал', 'спортзал', 'фитнес', 'бассейн', 'тренер', 'йога'] },
  { id: 'phone', kind: 'expense', words: ['связь', 'телефон', 'интернет', 'мобильный', 'симка', 'тариф'] },
  { id: 'other', kind: 'expense', words: ['прочее', 'разное', 'другое'] },
]

/* ------------------------------------------------------------------ */
/* Валюты                                                              */
/* ------------------------------------------------------------------ */

/** Символы и слова → код валюты (коды из src/lib/currencies.ts). */
const CURRENCY_WORDS: [RegExp, string][] = [
  [/^(₴|грн|гривен|гривень|гривны|uah)$/, 'UAH'],
  [/^(€|евро|eur)$/, 'EUR'],
  [/^(\$|доллар|долларов|бакс|баксов|usd)$/, 'USD'],
  [/^(₽|руб|рублей|рубля|rub)$/, 'RUB'],
  [/^(₸|тенге|kzt)$/, 'KZT'],
  [/^(£|фунт|фунтов|gbp)$/, 'GBP'],
  [/^(₺|лир|лира|try)$/, 'TRY'],
  [/^(zł|злотых|pln)$/, 'PLN'],
]

/* ------------------------------------------------------------------ */
/* Разбор                                                              */
/* ------------------------------------------------------------------ */

export interface ParsedEntry {
  kind: 'income' | 'expense'
  amount: number
  currency?: string
  categoryId: string
  /** Что осталось от строки после суммы, валюты и слова-категории. */
  note?: string
  /** Категорию не узнали — записали в «Прочее». Об этом стоит сказать человеку. */
  guessed: boolean
}

export type ParseResult =
  | { ok: true; entry: ParsedEntry }
  | { ok: false; reason: 'empty' | 'no_amount' | 'too_big' }

/** Потолок суммы: выше — это почти наверняка опечатка, а не покупка. */
const MAX_AMOUNT = 1_000_000_000

/** Приводим к виду, в котором сравнивать слова безопасно. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"'`.,;:!?()]/g, ' ')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Число из токена. Понимает «300», «1500,50», «1 500» (склеивается отдельно),
 * «300₴» (валюта слиплась с числом). Возвращает null, если это не число.
 */
function parseAmountToken(tok: string): number | null {
  const cleaned = tok.replace(/[^\d.,]/g, '')
  if (!cleaned || !/\d/.test(cleaned)) return null
  // Разделитель дробной части — последняя запятая или точка, если после неё 1–2 цифры.
  const m = cleaned.match(/^(\d+)(?:[.,](\d{1,2}))?$/)
  if (!m) {
    // «1.500» или «1,500» в значении тысяч — берём как целое.
    const digits = cleaned.replace(/[.,]/g, '')
    if (!/^\d+$/.test(digits)) return null
    return Number(digits)
  }
  return Number(m[2] ? `${m[1]}.${m[2]}` : m[1])
}

/** Валюта из токена, если он ею является. */
function currencyOf(tok: string): string | null {
  const t = tok.replace(/[^\p{L}\p{Sc}$]/gu, '')
  if (!t) return null
  for (const [re, code] of CURRENCY_WORDS) if (re.test(t)) return code
  return null
}

/**
 * Разобрать сообщение в операцию.
 *
 * `known` — id категорий, которые реально есть у пользователя (встроенные плюс
 * его собственные). Если распознанной категории у него нет, отдаём «Прочее»:
 * записать во что-то несуществующее хуже, чем записать грубо.
 */
export function parseEntry(raw: string, known?: Set<string>): ParseResult {
  const text = normalize(raw)
  if (!text) return { ok: false, reason: 'empty' }

  // Знак: «+100» — доход, «-100» — расход. Пишут слитно с числом.
  let forcedKind: 'income' | 'expense' | null = null
  const signed = text.match(/(^|\s)([+-])\s*\d/)
  if (signed) forcedKind = signed[2] === '+' ? 'income' : 'expense'

  const tokens = text.split(' ')

  /* ---------- Сумма ---------- */
  // Сначала склеиваем разряды, записанные через пробел: «1 500» → «1500».
  const merged: string[] = []
  for (const tok of tokens) {
    const prev = merged[merged.length - 1]
    if (prev && /^\d+$/.test(prev) && /^\d{3}$/.test(tok)) merged[merged.length - 1] = prev + tok
    else merged.push(tok)
  }

  let amount: number | null = null
  let amountAt = -1
  for (let i = 0; i < merged.length; i++) {
    const n = parseAmountToken(merged[i])
    if (n !== null && n > 0) {
      amount = n
      amountAt = i
      break
    }
  }
  if (amount === null) return { ok: false, reason: 'no_amount' }
  if (amount > MAX_AMOUNT) return { ok: false, reason: 'too_big' }

  /* ---------- Валюта ---------- */
  let currency: string | undefined
  let currencyAt = -1
  // Сначала — слипшаяся с числом («300₴»), потом соседний токен.
  const glued = currencyOf(merged[amountAt])
  if (glued) currency = glued
  else {
    for (const i of [amountAt + 1, amountAt - 1]) {
      if (i < 0 || i >= merged.length) continue
      const c = currencyOf(merged[i])
      if (c) {
        currency = c
        currencyAt = i
        break
      }
    }
  }

  /* ---------- Категория ---------- */
  // Ищем самое длинное совпадение: «спортзал» должен победить «зал».
  let best: { rule: CatRule; at: number; len: number } | null = null
  for (let i = 0; i < merged.length; i++) {
    if (i === amountAt || i === currencyAt) continue
    const word = merged[i].replace(/[^\p{L}]/gu, '')
    if (!word) continue
    for (const rule of CATEGORY_RULES) {
      for (const w of rule.words) {
        // Совпадение по началу слова ловит падежи: «такси», «обеде», «продуктов».
        const hit = word === w || (word.length >= 4 && word.startsWith(w.slice(0, Math.max(4, w.length - 2))))
        if (!hit) continue
        if (!best || w.length > best.len) best = { rule, at: i, len: w.length }
      }
    }
  }

  const fallbackKind: 'income' | 'expense' = forcedKind ?? 'expense'
  let rule = best?.rule
  // Знак спорит с категорией: «+300 такси» — это доход, а такси расходная.
  // Верим знаку, он поставлен осознанно.
  if (rule && forcedKind && rule.kind !== forcedKind) rule = undefined

  const guessed = !rule
  const kind: 'income' | 'expense' = rule ? rule.kind : fallbackKind
  let categoryId = rule ? rule.id : kind === 'income' ? 'other_in' : 'other'
  if (known && !known.has(categoryId)) categoryId = kind === 'income' ? 'other_in' : 'other'

  /* ---------- Заметка ---------- */
  const skip = new Set<number>([amountAt])
  if (currencyAt >= 0) skip.add(currencyAt)
  if (best && rule) skip.add(best.at)
  const note = merged
    .filter((_, i) => !skip.has(i))
    .join(' ')
    .replace(/(^|\s)[+-](\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)

  return {
    ok: true,
    entry: { kind, amount, currency, categoryId, note: note || undefined, guessed },
  }
}
