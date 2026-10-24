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
  /**
   * Название категории ровно как в приложении: бот пишет в ответе «Записал:
   * Кафе 300 ₴», а не служебный id. Брать его первым словом из `words` было
   * нельзя — там пишут так, как говорят («доход»), а категория в приложении
   * называется иначе («Прочее»). Совпадение названий проверяет check-categories.
   */
  name: string
  /** Слова, по которым узнаём категорию. */
  words: string[]
}

export const CATEGORY_RULES: CatRule[] = [
  // Доходы
  { id: 'salary', kind: 'income', name: 'Зарплата', words: ['зарплата', 'зп', 'зарплату', 'аванс', 'оклад', 'получка'] },
  { id: 'freelance', kind: 'income', name: 'Подработка', words: ['подработка', 'фриланс', 'халтура', 'заказ', 'гонорар'] },
  { id: 'gift_in', kind: 'income', name: 'Подарок', words: ['подарок', 'подарили', 'премия', 'кэшбек', 'кешбек', 'кэшбэк', 'возврат'] },
  { id: 'other_in', kind: 'income', name: 'Прочее', words: ['доход', 'приход', 'продал', 'продала', 'перевод'] },

  // Расходы
  { id: 'food', kind: 'expense', name: 'Еда', words: ['еда', 'еду', 'еды', 'едой', 'продукты', 'магазин', 'супермаркет', 'ашан', 'сильпо', 'атб', 'пятерочка', 'пятёрочка', 'лента', 'хлеб', 'молоко', 'обед', 'ужин', 'завтрак'] },
  { id: 'cafe', kind: 'expense', name: 'Кафе', words: ['кафе', 'кофе', 'ресторан', 'бар', 'пиво', 'кофейня', 'старбакс', 'макдак', 'доставка', 'пицца', 'суши', 'бургер', 'латте', 'капучино'] },
  { id: 'transport', kind: 'expense', name: 'Транспорт', words: ['транспорт', 'метро', 'автобус', 'такси', 'убер', 'болт', 'маршрутка', 'трамвай', 'электричка', 'проезд', 'билет'] },
  { id: 'car', kind: 'expense', name: 'Машина', words: ['машина', 'авто', 'бензин', 'заправка', 'топливо', 'парковка', 'шиномонтаж', 'сто', 'мойка'] },
  { id: 'home', kind: 'expense', name: 'Жильё', words: ['жилье', 'жильё', 'квартира', 'аренда', 'квартплата', 'коммуналка', 'свет', 'газ', 'вода', 'ипотека', 'ремонт'] },
  { id: 'health', kind: 'expense', name: 'Здоровье', words: ['здоровье', 'аптека', 'врач', 'лекарства', 'стоматолог', 'анализы', 'клиника', 'зубной', 'таблетки'] },
  { id: 'clothes', kind: 'expense', name: 'Одежда', words: ['одежда', 'обувь', 'кроссовки', 'куртка', 'джинсы', 'футболка', 'шмотки'] },
  { id: 'fun', kind: 'expense', name: 'Развлечения', words: ['развлечения', 'кино', 'театр', 'концерт', 'игры', 'подписка', 'нетфликс', 'спотифай', 'клуб', 'бильярд'] },
  { id: 'gift', kind: 'expense', name: 'Подарки', words: ['подарки', 'цветы', 'сувенир'] },
  { id: 'sport', kind: 'expense', name: 'Спорт', words: ['спорт', 'зал', 'спортзал', 'фитнес', 'бассейн', 'тренер', 'йога'] },
  { id: 'phone', kind: 'expense', name: 'Связь', words: ['связь', 'телефон', 'интернет', 'мобильный', 'симка', 'тариф'] },
  { id: 'other', kind: 'expense', name: 'Прочее', words: ['прочее', 'разное', 'другое'] },
]

/** Категория по id среди встроенных. */
export function findCategory(id: string): CatRule | undefined {
  return CATEGORY_RULES.find((r) => r.id === id)
}

/* ------------------------------------------------------------------ */
/* Валюты                                                              */
/* ------------------------------------------------------------------ */

/**
 * Символы и слова → код валюты (коды из src/lib/currencies.ts).
 *
 * Слово нужно там, где валюта записи отличается от основной: основную
 * подставит приложение само. Поэтому многозначные слова сюда не берём — «сом»
 * (рыба), «вон», «лей» и «крона» (чьи?), «рупия», «песо», «динар» (их в списке
 * восемь), «дирхам» (эмиратский и марокканский), а из кодов — те, что совпадают
 * с английскими словами (all, cup, pen, bob, mad, php, try, gel, cop, cad):
 * записать покупку рыбы в киргизских сомах хуже, чем не узнать валюту. Такие
 * случаи разбирает модель — она видит основную валюту человека.
 */
const CURRENCY_WORDS: [RegExp, string][] = [
  [/^(₴|грн|гривен|гривень|гривны|гривна|гривня|uah)$/, 'UAH'],
  [/^(€|евро|eur)$/, 'EUR'],
  [/^(\$|доллар|долларов|доллара|бакс|баксов|бакса|usd)$/, 'USD'],
  [/^(₽|руб|рублей|рубля|rub)$/, 'RUB'],
  [/^(₸|тенге|kzt)$/, 'KZT'],
  [/^(£|фунт|фунтов|gbp)$/, 'GBP'],
  [/^(₺|лир|лира)$/, 'TRY'],
  [/^(zł|злотых|злотый|pln)$/, 'PLN'],
  [/^(byn)$/, 'BYN'],
  [/^(сум|сумов|сўм|uzs)$/, 'UZS'],
  [/^(сомов|kgs)$/, 'KGS'],
  [/^(сомони|tjs)$/, 'TJS'],
  [/^(tmt)$/, 'TMT'],
  [/^(₼|манат|манатов|маната|azn)$/, 'AZN'],
  [/^(֏|драм|драмов|драма|amd)$/, 'AMD'],
  [/^(₾|лари)$/, 'GEL'],
  [/^(mdl)$/, 'MDL'],
  [/^(kč|czk)$/, 'CZK'],
  [/^(форинт|форинтов|huf)$/, 'HUF'],
  [/^(ron)$/, 'RON'],
  [/^(франк|франков|франка|chf)$/, 'CHF'],
  [/^(sek)$/, 'SEK'],
  [/^(nok)$/, 'NOK'],
  [/^(dkk)$/, 'DKK'],
  [/^(isk)$/, 'ISK'],
  [/^(дин|rsd)$/, 'RSD'],
  [/^(mkd)$/, 'MKD'],
  [/^(bam)$/, 'BAM'],
  [/^(₪|шекель|шекелей|шекеля|шек|ils)$/, 'ILS'],
  [/^(aed)$/, 'AED'],
  [/^(sar)$/, 'SAR'],
  [/^(qar)$/, 'QAR'],
  [/^(kwd)$/, 'KWD'],
  [/^(bhd)$/, 'BHD'],
  [/^(omr)$/, 'OMR'],
  [/^(jod)$/, 'JOD'],
  [/^(egp)$/, 'EGP'],
  [/^(tnd)$/, 'TND'],
  [/^(dzd)$/, 'DZD'],
  [/^(irr)$/, 'IRR'],
  [/^(iqd)$/, 'IQD'],
  [/^(lbp)$/, 'LBP'],
  [/^(юань|юаней|юаня|元|cny|rmb)$/, 'CNY'],
  [/^(hkd)$/, 'HKD'],
  [/^(twd)$/, 'TWD'],
  [/^(иена|иен|иены|йена|йен|йены|jpy)$/, 'JPY'],
  [/^(₩|krw)$/, 'KRW'],
  [/^(₮|тугрик|тугриков|mnt)$/, 'MNT'],
  [/^(₹|inr)$/, 'INR'],
  [/^(pkr)$/, 'PKR'],
  [/^(৳|bdt)$/, 'BDT'],
  [/^(lkr)$/, 'LKR'],
  [/^(npr)$/, 'NPR'],
  [/^(฿|бат|батов|бата|thb)$/, 'THB'],
  [/^(₫|донг|донгов|донга|vnd)$/, 'VND'],
  [/^(idr)$/, 'IDR'],
  [/^(ринггит|ринггитов|myr)$/, 'MYR'],
  [/^(sgd)$/, 'SGD'],
  [/^(₱)$/, 'PHP'],
  [/^(៛|khr)$/, 'KHR'],
  [/^(₭|lak)$/, 'LAK'],
  [/^(mmk)$/, 'MMK'],
  [/^(afn)$/, 'AFN'],
  [/^(mvr)$/, 'MVR'],
  [/^(aud)$/, 'AUD'],
  [/^(nzd)$/, 'NZD'],
  [/^(mxn)$/, 'MXN'],
  [/^(brl)$/, 'BRL'],
  [/^(ars)$/, 'ARS'],
  [/^(clp)$/, 'CLP'],
  [/^(uyu)$/, 'UYU'],
  [/^(₲|pyg)$/, 'PYG'],
  [/^(ves)$/, 'VES'],
  [/^(₡|crc)$/, 'CRC'],
  [/^(dop)$/, 'DOP'],
  [/^(gtq)$/, 'GTQ'],
  [/^(zar)$/, 'ZAR'],
  [/^(₦|ngn)$/, 'NGN'],
  [/^(kes)$/, 'KES'],
  [/^(₵|ghs)$/, 'GHS'],
  [/^(etb)$/, 'ETB'],
  [/^(tzs)$/, 'TZS'],
  [/^(ugx)$/, 'UGX'],
  [/^(mur)$/, 'MUR'],
  [/^(scr)$/, 'SCR'],
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
  /** «вчера» — 1, «позавчера» — 2. Нет поля — запись сегодняшняя. */
  daysAgo?: number
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
    .replace(/[«»"'`;:!?()]/g, ' ')
    // Точка и запятая — знаки препинания везде, КРОМЕ места между цифрами: там
    // это разделитель копеек. Раньше они резались заодно со скобками, и «аптека
    // 340,50» превращалась в «340» и отдельно висящее «50» в заметке — сумма
    // молча теряла копейки.
    .replace(/[.,](?!\d)/g, ' ')
    .replace(/(?<!\d)[.,]/g, ' ')
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
 * День словом. Без модели «вчера продукты 1200» раньше записывалось сегодняшним
 * днём с заметкой «вчера» — а это пример, который бот сам предлагает повторить
 * в приветствии и напоминаниях.
 */
const DAY_WORDS: Record<string, number> = { сегодня: 0, вчера: 1, позавчера: 2 }

/**
 * День словом в токене. Только собственные ключи: `tok in DAY_WORDS` узнавал и
 * «constructor» с «__proto__» — «кофе 300 constructor» без модели давал дату
 * «NaN-NaN-NaN», то есть операцию, которой нет ни в одном периоде.
 */
function dayOf(tok: string): number | undefined {
  return Object.hasOwn(DAY_WORDS, tok) ? DAY_WORDS[tok] : undefined
}

/** День словом во всей строке (0 — «сегодня»); нет — undefined. */
export function dayWordIn(raw: string): number | undefined {
  for (const tok of normalize(raw).split(' ')) {
    const d = dayOf(tok)
    if (d !== undefined) return d
  }
  return undefined
}

/**
 * Единица счёта после числа: срок, количество, число месяца. «Абонемент на 3
 * месяца 2000» — сумма 2000, а не 3; «5 октября кофе 300» — 300.
 *
 * Длинные слова — основой («месяц…», «октябр…»), короткие — целиком: «мес» и
 * «л» узнаём, а «г» и «гр» нет — так пишут и граммы, и гривны.
 */
const COUNT_UNIT =
  /^(?:день|дня|дней|дн|недел\p{L}*|нед|месяц\p{L}*|мес|год|года|годов|лет|раз|раза|час|часа|часов|ч|минут\p{L}*|мин|сутки|суток|шт|штук\p{L}*|кг|килограмм\p{L}*|л|литр\p{L}*|человек\p{L}*|чел|км|числа|число|январ\p{L}*|феврал\p{L}*|март\p{L}*|апрел\p{L}*|май|мая|июн\p{L}*|июл\p{L}*|август\p{L}*|сентябр\p{L}*|октябр\p{L}*|ноябр\p{L}*|декабр\p{L}*|days?|weeks?|months?|years?|times|hours?|pcs)$/u
const YEAR_WORD = /^(?:год|года|году|years?)$/u
const MEASURE_UNIT = /^(?:кг|килограмм\p{L}*|л|литр\p{L}*|км)$/u

/**
 * Число на месте `i` — счёт, а не сумма: за ним (или слитно с ним) единица
 * срока или количества. Небольшое («аренда 30000 месяц» — деньги в месяц), год
 * («за 2023 год»); дробь — только у веса и объёма («мясо 1,5 кг 900»). Решает
 * вызывающий: счёт пропускается, только если в сообщении есть другое число —
 * «vpn 50 мес» и «netflix 15 month» остаются суммами.
 */
function isCount(tokens: string[], i: number, n: number): boolean {
  const glued = tokens[i].match(/^\d+(?:[.,]\d+)?(\p{L}+)$/u)?.[1]
  const unit = glued ?? tokens[i + 1]
  if (unit === undefined || !COUNT_UNIT.test(unit)) return false
  if (!Number.isInteger(n)) return MEASURE_UNIT.test(unit)
  return n <= 1000 || (YEAR_WORD.test(unit) && n >= 1900 && n <= 2100)
}

/** Слова самой траты — в заметку не идут: «потратил», «ушло», «заплатила», «spent». */
const NOTE_FILLER =
  /^(?:я|потратил[аио]?|потрачено|тратил[аи]?|ушл[аоиь]|уш[её]л|заплатил[аи]?|оплатил[аи]?|отдал[аи]?|купил[аи]?|взял[аи]?|сходил[аи]?|съездил[аи]?|пришл[аои]|приш[её]л|получил[аи]?|заработал[аи]?|spent|paid|bought|got|earned)$/u
/** Глаголы, по которым ясно направление денег (без знака «+»/«−»). */
const SPEND_VERB = /^(?:потратил[аи]?|потрачено|тратил[аи]?|ушл[аои]|уш[её]л|заплатил[аи]?|оплатил[аи]?|отдал[аи]?|купил[аи]?|spent|paid|bought)$/u
const INCOME_VERB = /^(?:получил[аи]?|заработал[аи]?|earned)$/u
/** Предлоги: без своего слова (оно ушло в сумму, категорию…) в заметке висят. */
const NOTE_PREP = /^(?:на|за|в|во|по|к|ко|до|с|со|для|on|for|at|in|to)$/u

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
  // День словом — где угодно в строке; в сумму, категорию и заметку не идёт.
  let daysAgo: number | undefined
  const dayAt = new Set<string>()
  for (const tok of tokens) {
    const d = dayOf(tok)
    if (d !== undefined) {
      daysAgo = d || undefined
      dayAt.add(tok)
    }
  }

  /* ---------- Сумма ---------- */
  // Сначала склеиваем разряды, записанные через пробел: «1 500» → «1500»,
  // «1 200,50» → «1200,50». Только цепочкой от первой группы в 1–3 цифры:
  // «1500 200» — это два числа, а не 1 500 200.
  const merged: string[] = []
  let chain = false
  for (const tok of tokens) {
    const prev = merged[merged.length - 1]
    const groupable = prev !== undefined && (chain || /^\d{1,3}$/.test(prev))
    if (groupable && /^\d{3}(?:[.,]\d{1,2})?$/.test(tok)) {
      merged[merged.length - 1] = prev + tok
      // После копеек цепочка кончилась: «1 200,50 300» — уже другое число.
      chain = !/[.,]/.test(tok)
    } else {
      merged.push(tok)
      chain = false
    }
  }

  // Сумма — первое число, которое не счёт («на 3 месяца», «5 октября»). Если
  // других чисел нет, счёт всё-таки сумма: «vpn 50 мес».
  let amount: number | null = null
  let amountAt = -1
  let countAt = -1
  for (let i = 0; i < merged.length; i++) {
    const n = parseAmountToken(merged[i])
    if (n !== null && n > 0) {
      if (isCount(merged, i, n)) {
        if (countAt < 0) countAt = i
        continue
      }
      amount = n
      amountAt = i
      break
    }
  }
  if (amount === null && countAt >= 0) {
    amount = parseAmountToken(merged[countAt])
    amountAt = countAt
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
  // Глагол сам говорит, куда деньги: «потратил 2000 на подарок» — расход, хотя
  // «подарок» без глагола — полученный (доход). Знак важнее глагола (ниже).
  const bare = (tok: string) => tok.replace(/[^\p{L}]/gu, '')
  const verbKind: 'income' | 'expense' | null = forcedKind
    ? null
    : merged.some((t) => SPEND_VERB.test(bare(t)))
      ? 'expense'
      : merged.some((t) => INCOME_VERB.test(bare(t)))
        ? 'income'
        : null
  // Ищем самое длинное совпадение: «спортзал» должен победить «зал».
  let best: { rule: CatRule; at: number; len: number; exact: boolean } | null = null
  for (let i = 0; i < merged.length; i++) {
    if (i === amountAt || i === currencyAt || dayAt.has(merged[i])) continue
    const word = bare(merged[i])
    if (!word) continue
    for (const rule of CATEGORY_RULES) {
      if (verbKind && rule.kind !== verbKind) continue
      for (const w of rule.words) {
        // Совпадение по началу слова ловит падежи: «такси», «обеде», «продуктов».
        const exact = word === w
        const hit = exact || (word.length >= 4 && word.startsWith(w.slice(0, Math.max(4, w.length - 2))))
        if (!hit) continue
        // Точное слово важнее длины. Иначе «подарки» (расход) проигрывало
        // доходному «подарок»: длина та же, совпадение по началу слова
        // засчитывалось наравне с точным, и побеждало то, что выше в списке, —
        // покупка подарка записывалась доходом.
        const better = !best || (exact && !best.exact) || (exact === best.exact && w.length > best.len)
        if (better) best = { rule, at: i, len: w.length, exact }
      }
    }
  }

  const fallbackKind: 'income' | 'expense' = forcedKind ?? verbKind ?? 'expense'
  let rule = best?.rule
  // Знак спорит с категорией: «+300 такси» — это доход, а такси расходная.
  // Верим знаку, он поставлен осознанно.
  if (rule && forcedKind && rule.kind !== forcedKind) rule = undefined

  const guessed = !rule
  const kind: 'income' | 'expense' = rule ? rule.kind : fallbackKind
  let categoryId = rule ? rule.id : kind === 'income' ? 'other_in' : 'other'
  if (known && !known.has(categoryId)) categoryId = kind === 'income' ? 'other_in' : 'other'

  /* ---------- Заметка ---------- */
  // Траты пишут и обычной фразой: «ушло 300 на кофе», «такси до работы за 450».
  // Глагол траты и предлог, чьё слово ушло в сумму, валюту, категорию или день,
  // в заметке — мусор («ушло на»), а «до работы» — смысл, его оставляем.
  const skip = new Set<number>([amountAt])
  if (currencyAt >= 0) skip.add(currencyAt)
  if (best && rule) skip.add(best.at)
  const gone = (i: number) => skip.has(i) || dayAt.has(merged[i]) || NOTE_FILLER.test(bare(merged[i]))
  const note = merged
    .filter((tok, i) => !gone(i) && !(NOTE_PREP.test(bare(tok)) && (i + 1 >= merged.length || gone(i + 1))))
    .join(' ')
    .replace(/(^|\s)[+-](\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // «spent 3 on coffee»: английский предлог в начале заметки — от глагола.
    .replace(/^(?:on|for|at|in|to) /u, '')
    .slice(0, 120)

  return {
    ok: true,
    entry: {
      kind,
      amount,
      currency,
      categoryId,
      note: note || undefined,
      guessed,
      ...(daysAgo ? { daysAgo } : {}),
    },
  }
}

/**
 * Несколько трат в одном сообщении: «такси 450 и обед 380», «кофе 300, такси
 * 450». Раньше без модели записывалась только первая — молча, а пример
 * «кроссовки 3500 и пиво 180» бот сам показывает в справке.
 *
 * Делим по «и», запятой, точке с запятой и переносу строки, но только если
 * в КАЖДОЙ части есть своя сумма: «хлеб и молоко 120» — одна покупка. Запятая
 * перед цифрой не делит («340,50» — копейки), а перенос строки делит всегда:
 * «300 кофе⏎450 такси» — это две траты, а не одна с заметкой «кофе 450».
 *
 * День словом действует на свою часть и на следующие за ней: «вчера такси 450
 * и обед 380» — обе вчера, «кофе 300 вчера и обед 380 сегодня» — по-разному.
 * Части до первого названного дня берут его же: «такси 450 и обед 380 вчера».
 */
export function parseEntries(raw: string, known?: Set<string>): ParsedEntry[] | ParseResult {
  const parts = raw
    .split(/\s+и\s+|,(?!\d)|[;\n]+/i)
    .map((p) => p.trim())
    .filter(Boolean)
  // «Обед 350, -50 скидка» — это не две траты, а одна со скидкой. Без модели
  // честнее записать одну сумму, чем лишний расход в 50.
  const discount = parts.length >= 2 && parts.some((p, i) => i > 0 && /^[-−]\s*\d/.test(p) && /скидк|discount/i.test(p))
  if (parts.length >= 2 && parts.length <= 10 && !discount) {
    const each = parts.map((p) => parseEntry(p, known))
    if (each.every((r) => r.ok)) {
      const entries: ParsedEntry[] = []
      const days: (number | undefined)[] = []
      parts.forEach((part, i) => {
        const entry = (each[i] as { ok: true; entry: ParsedEntry }).entry
        // «Кофе 300 и 50 копеек» — это 300,50, а не две траты.
        const cents = part.match(KOPECKS_RE)
        const prev = entries[entries.length - 1]
        if (cents && prev) {
          prev.amount = Math.round((prev.amount + Number(cents[1]) / 100) * 100) / 100
          return
        }
        entries.push({ ...entry })
        days.push(dayWordIn(part))
      })
      let current = days.find((d) => d !== undefined)
      return entries.map((e, i) => {
        if (days[i] !== undefined) current = days[i]
        const { daysAgo: _drop, ...rest } = e
        return current ? { ...rest, daysAgo: current } : rest
      })
    }
  }
  return parseEntry(raw, known)
}

/** Копейки отдельной частью: «50 копеек», «20 коп», «99 центов». */
const KOPECKS_RE = /^(\d{1,2})\s*(?:коп(?:еек|ейки|ейка)?|цент(?:ов|а)?|cents?)\.?$/iu
