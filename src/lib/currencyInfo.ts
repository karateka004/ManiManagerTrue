/**
 * Названия валют и поиск по ним.
 *
 * Отдельно от `currencies.ts` намеренно: тот модуль в стартовом чанке (на нём
 * formatMoney), а названия на двух языках и слова для поиска нужны только там,
 * где валюту выбирают, — в Настройках, шторке операции, быстром старте.
 *
 * `q` — слова, по которым человек ищет валюту, кроме её названия и кода:
 * страны на двух языках и как валюту называют в разговоре («бакс», «грн»).
 */
import { CURRENCIES, getCurrency, isCurrency, type Currency } from './currencies'
import type { Lang } from './i18n'

interface Info {
  ru: string
  en: string
  q: string
}

export const CURRENCY_INFO: Record<Currency, Info> = {
  USD: { ru: 'Доллар США', en: 'US Dollar', q: 'сша америка штаты бакс баксы usa us america united states buck' },
  EUR: {
    ru: 'Евро',
    en: 'Euro',
    q:
      'евросоюз европа германия франция испания италия нидерланды голландия австрия бельгия португалия финляндия ' +
      'ирландия греция латвия литва эстония словакия словения хорватия кипр мальта люксембург черногория болгария ' +
      'eu europe eurozone germany france spain italy netherlands austria belgium portugal finland ireland greece ' +
      'latvia lithuania estonia slovakia slovenia croatia cyprus malta luxembourg montenegro bulgaria',
  },
  UAH: { ru: 'Украинская гривна', en: 'Ukrainian Hryvnia', q: 'украина гривня грн ukraine hryvnia grivna' },
  RUB: { ru: 'Российский рубль', en: 'Russian Ruble', q: 'россия рф руб russia rouble' },
  KZT: { ru: 'Казахстанский тенге', en: 'Kazakhstani Tenge', q: 'казахстан kazakhstan' },
  BYN: { ru: 'Белорусский рубль', en: 'Belarusian Ruble', q: 'беларусь белоруссия бел belarus rouble' },
  UZS: { ru: 'Узбекский сум', en: 'Uzbekistani Som', q: 'узбекистан сўм uzbekistan sum soum' },
  KGS: { ru: 'Киргизский сом', en: 'Kyrgyzstani Som', q: 'киргизия кыргызстан kyrgyzstan kirgizia' },
  TJS: { ru: 'Таджикский сомони', en: 'Tajikistani Somoni', q: 'таджикистан tajikistan' },
  TMT: { ru: 'Туркменский манат', en: 'Turkmenistani Manat', q: 'туркменистан туркмения turkmenistan' },
  AZN: { ru: 'Азербайджанский манат', en: 'Azerbaijani Manat', q: 'азербайджан azerbaijan' },
  AMD: { ru: 'Армянский драм', en: 'Armenian Dram', q: 'армения armenia' },
  GEL: { ru: 'Грузинский лари', en: 'Georgian Lari', q: 'грузия georgia' },
  MDL: { ru: 'Молдавский лей', en: 'Moldovan Leu', q: 'молдова молдавия лей леи moldova lei' },
  GBP: { ru: 'Британский фунт', en: 'British Pound', q: 'великобритания англия британия фунт стерлингов uk england britain sterling' },
  PLN: { ru: 'Польский злотый', en: 'Polish Zloty', q: 'польша злотых poland zloty' },
  CZK: { ru: 'Чешская крона', en: 'Czech Koruna', q: 'чехия крона czech czechia koruna' },
  HUF: { ru: 'Венгерский форинт', en: 'Hungarian Forint', q: 'венгрия hungary' },
  RON: { ru: 'Румынский лей', en: 'Romanian Leu', q: 'румыния лей леи romania lei' },
  CHF: { ru: 'Швейцарский франк', en: 'Swiss Franc', q: 'швейцария лихтенштейн франк switzerland liechtenstein franc' },
  SEK: { ru: 'Шведская крона', en: 'Swedish Krona', q: 'швеция крона sweden krona' },
  NOK: { ru: 'Норвежская крона', en: 'Norwegian Krone', q: 'норвегия крона norway krone' },
  DKK: { ru: 'Датская крона', en: 'Danish Krone', q: 'дания гренландия крона denmark greenland krone' },
  ISK: { ru: 'Исландская крона', en: 'Icelandic Krona', q: 'исландия крона iceland krona' },
  RSD: { ru: 'Сербский динар', en: 'Serbian Dinar', q: 'сербия динар serbia dinar din' },
  MKD: { ru: 'Македонский денар', en: 'Macedonian Denar', q: 'македония северная македония macedonia north denar' },
  BAM: { ru: 'Конвертируемая марка', en: 'Convertible Mark', q: 'босния герцеговина марка bosnia herzegovina mark km' },
  ALL: { ru: 'Албанский лек', en: 'Albanian Lek', q: 'албания albania lek' },
  TRY: { ru: 'Турецкая лира', en: 'Turkish Lira', q: 'турция лира turkey turkiye lira' },
  ILS: { ru: 'Израильский шекель', en: 'Israeli Shekel', q: 'израиль шекель шекели шек israel shekel nis' },
  AED: { ru: 'Дирхам ОАЭ', en: 'UAE Dirham', q: 'оаэ эмираты дубай абу-даби дирхам uae emirates dubai abu dhabi dirham' },
  SAR: { ru: 'Саудовский риял', en: 'Saudi Riyal', q: 'саудовская аравия риял saudi arabia riyal' },
  QAR: { ru: 'Катарский риал', en: 'Qatari Riyal', q: 'катар риал qatar riyal' },
  KWD: { ru: 'Кувейтский динар', en: 'Kuwaiti Dinar', q: 'кувейт динар kuwait dinar' },
  BHD: { ru: 'Бахрейнский динар', en: 'Bahraini Dinar', q: 'бахрейн динар bahrain dinar' },
  OMR: { ru: 'Оманский риал', en: 'Omani Rial', q: 'оман риал oman rial' },
  JOD: { ru: 'Иорданский динар', en: 'Jordanian Dinar', q: 'иордания динар jordan dinar' },
  EGP: { ru: 'Египетский фунт', en: 'Egyptian Pound', q: 'египет фунт egypt pound' },
  MAD: { ru: 'Марокканский дирхам', en: 'Moroccan Dirham', q: 'марокко дирхам morocco dirham' },
  TND: { ru: 'Тунисский динар', en: 'Tunisian Dinar', q: 'тунис динар tunisia dinar' },
  DZD: { ru: 'Алжирский динар', en: 'Algerian Dinar', q: 'алжир динар algeria dinar' },
  IRR: { ru: 'Иранский риал', en: 'Iranian Rial', q: 'иран риал туман iran rial toman' },
  IQD: { ru: 'Иракский динар', en: 'Iraqi Dinar', q: 'ирак динар iraq dinar' },
  LBP: { ru: 'Ливанский фунт', en: 'Lebanese Pound', q: 'ливан фунт lebanon pound' },
  CNY: { ru: 'Китайский юань', en: 'Chinese Yuan', q: 'китай юань жэньминьби china yuan renminbi rmb' },
  HKD: { ru: 'Гонконгский доллар', en: 'Hong Kong Dollar', q: 'гонконг доллар hong kong dollar' },
  TWD: { ru: 'Тайваньский доллар', en: 'Taiwan Dollar', q: 'тайвань доллар taiwan dollar' },
  JPY: { ru: 'Японская иена', en: 'Japanese Yen', q: 'япония иена йена japan yen' },
  KRW: { ru: 'Южнокорейская вона', en: 'South Korean Won', q: 'корея южная корея вона korea south won' },
  MNT: { ru: 'Монгольский тугрик', en: 'Mongolian Tugrik', q: 'монголия тугрик mongolia tugrik togrog' },
  INR: { ru: 'Индийская рупия', en: 'Indian Rupee', q: 'индия гоа рупия india goa rupee' },
  PKR: { ru: 'Пакистанская рупия', en: 'Pakistani Rupee', q: 'пакистан рупия pakistan rupee' },
  BDT: { ru: 'Бангладешская така', en: 'Bangladeshi Taka', q: 'бангладеш така bangladesh taka' },
  LKR: { ru: 'Шри-ланкийская рупия', en: 'Sri Lankan Rupee', q: 'шри-ланка шри ланка цейлон рупия sri lanka ceylon rupee' },
  NPR: { ru: 'Непальская рупия', en: 'Nepalese Rupee', q: 'непал рупия nepal rupee' },
  THB: { ru: 'Тайский бат', en: 'Thai Baht', q: 'таиланд тайланд пхукет бангкок бат thailand phuket bangkok baht' },
  VND: { ru: 'Вьетнамский донг', en: 'Vietnamese Dong', q: 'вьетнам донг vietnam dong' },
  IDR: { ru: 'Индонезийская рупия', en: 'Indonesian Rupiah', q: 'индонезия бали рупия indonesia bali rupiah' },
  MYR: { ru: 'Малайзийский ринггит', en: 'Malaysian Ringgit', q: 'малайзия ринггит malaysia ringgit' },
  SGD: { ru: 'Сингапурский доллар', en: 'Singapore Dollar', q: 'сингапур доллар singapore dollar' },
  PHP: { ru: 'Филиппинское песо', en: 'Philippine Peso', q: 'филиппины песо philippines peso' },
  KHR: { ru: 'Камбоджийский риель', en: 'Cambodian Riel', q: 'камбоджа риель cambodia riel' },
  LAK: { ru: 'Лаосский кип', en: 'Lao Kip', q: 'лаос кип laos kip' },
  MMK: { ru: 'Мьянманский кьят', en: 'Myanmar Kyat', q: 'мьянма бирма кьят myanmar burma kyat' },
  AFN: { ru: 'Афганский афгани', en: 'Afghan Afghani', q: 'афганистан afghanistan' },
  MVR: { ru: 'Мальдивская руфия', en: 'Maldivian Rufiyaa', q: 'мальдивы руфия maldives rufiyaa' },
  AUD: { ru: 'Австралийский доллар', en: 'Australian Dollar', q: 'австралия доллар australia dollar' },
  NZD: { ru: 'Новозеландский доллар', en: 'New Zealand Dollar', q: 'новая зеландия доллар new zealand dollar' },
  CAD: { ru: 'Канадский доллар', en: 'Canadian Dollar', q: 'канада доллар canada dollar' },
  MXN: { ru: 'Мексиканское песо', en: 'Mexican Peso', q: 'мексика песо mexico peso' },
  BRL: { ru: 'Бразильский реал', en: 'Brazilian Real', q: 'бразилия реал brazil real' },
  ARS: { ru: 'Аргентинское песо', en: 'Argentine Peso', q: 'аргентина песо argentina peso' },
  CLP: { ru: 'Чилийское песо', en: 'Chilean Peso', q: 'чили песо chile peso' },
  COP: { ru: 'Колумбийское песо', en: 'Colombian Peso', q: 'колумбия песо colombia peso' },
  PEN: { ru: 'Перуанский соль', en: 'Peruvian Sol', q: 'перу соль peru sol' },
  UYU: { ru: 'Уругвайское песо', en: 'Uruguayan Peso', q: 'уругвай песо uruguay peso' },
  PYG: { ru: 'Парагвайский гуарани', en: 'Paraguayan Guarani', q: 'парагвай гуарани paraguay guarani' },
  BOB: { ru: 'Боливийский боливиано', en: 'Bolivian Boliviano', q: 'боливия боливиано bolivia boliviano' },
  VES: { ru: 'Венесуэльский боливар', en: 'Venezuelan Bolivar', q: 'венесуэла боливар venezuela bolivar' },
  CRC: { ru: 'Коста-риканский колон', en: 'Costa Rican Colon', q: 'коста-рика коста рика колон costa rica colon' },
  DOP: { ru: 'Доминиканское песо', en: 'Dominican Peso', q: 'доминикана доминиканская республика песо dominican republic peso' },
  GTQ: { ru: 'Гватемальский кетсаль', en: 'Guatemalan Quetzal', q: 'гватемала кетсаль guatemala quetzal' },
  CUP: { ru: 'Кубинское песо', en: 'Cuban Peso', q: 'куба песо cuba peso' },
  ZAR: { ru: 'Южноафриканский рэнд', en: 'South African Rand', q: 'юар южная африка рэнд south africa rand' },
  NGN: { ru: 'Нигерийская найра', en: 'Nigerian Naira', q: 'нигерия найра nigeria naira' },
  KES: { ru: 'Кенийский шиллинг', en: 'Kenyan Shilling', q: 'кения шиллинг kenya shilling' },
  GHS: { ru: 'Ганский седи', en: 'Ghanaian Cedi', q: 'гана седи ghana cedi' },
  ETB: { ru: 'Эфиопский быр', en: 'Ethiopian Birr', q: 'эфиопия быр бир ethiopia birr' },
  TZS: { ru: 'Танзанийский шиллинг', en: 'Tanzanian Shilling', q: 'танзания занзибар шиллинг tanzania zanzibar shilling' },
  UGX: { ru: 'Угандийский шиллинг', en: 'Ugandan Shilling', q: 'уганда шиллинг uganda shilling' },
  MUR: { ru: 'Маврикийская рупия', en: 'Mauritian Rupee', q: 'маврикий рупия mauritius rupee' },
  SCR: { ru: 'Сейшельская рупия', en: 'Seychellois Rupee', q: 'сейшелы сейшельские острова рупия seychelles rupee' },
}

/** Название валюты на языке интерфейса. Незнакомый код — сам код. */
export function currencyName(code: string, lang: Lang): string {
  if (!isCurrency(code)) return code
  const info = CURRENCY_INFO[code]
  return lang === 'en' ? info.en : info.ru
}

/**
 * Название внутри фразы: «Твоя валюта — казахстанский тенге?». В списке
 * названия с прописной (это пункты), а посреди русского предложения прописная
 * у прилагательного режет глаз. Английские названия — имена собственные, их
 * не трогаем.
 */
export function currencyNameInText(code: string, lang: Lang): string {
  const name = currencyName(code, lang)
  return lang === 'en' ? name : name.charAt(0).toLowerCase() + name.slice(1)
}

/**
 * Частые валюты — верх списка выбора, пока поиск пуст. Порядок — по тому,
 * кто пользуется Кошелём: русскоязычный Telegram дома и в переезде.
 */
export const POPULAR_CURRENCIES: Currency[] = [
  'USD', 'EUR', 'UAH', 'RUB', 'KZT', 'BYN', 'UZS', 'GEL', 'AMD', 'PLN', 'TRY', 'GBP',
]

/**
 * Для сравнения без регистра, «ё» и диакритики: «zloty» найдёт «złoty»,
 * «ё» в запросе не мешает. Знаки (тире, точки) — пробелы: «шри ланка» и
 * «шри-ланка» одно и то же.
 */
export function normalizeQuery(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}\p{Sc}]+/gu, ' ')
    .trim()
}

/** Стог для поиска на каждую валюту: код, символ, оба названия и слова-подсказки. */
let HAYSTACK: Map<Currency, { code: string; name: string; words: string[]; all: string }> | null = null
function haystack() {
  if (HAYSTACK) return HAYSTACK
  HAYSTACK = new Map()
  for (const c of CURRENCIES) {
    const info = CURRENCY_INFO[c.code]
    const all = normalizeQuery(`${c.code} ${c.symbol} ${info.ru} ${info.en} ${info.q}`)
    HAYSTACK.set(c.code, {
      code: c.code.toLowerCase(),
      name: normalizeQuery(`${info.ru} ${info.en}`),
      words: all.split(' '),
      all,
    })
  }
  return HAYSTACK
}

/**
 * Поиск валюты. Каждое слово запроса должно найтись (началом слова или
 * подстрокой); выше — точный код, затем начало названия, затем начало любого
 * слова, затем просто совпадение внутри. Символ ищется как есть: «₾» → лари.
 */
export function searchCurrencies(query: string, lang: Lang): Currency[] {
  const q = normalizeQuery(query)
  if (!q) return []
  const parts = q.split(' ')
  const hay = haystack()
  const scored: { code: Currency; score: number }[] = []
  for (const c of CURRENCIES) {
    const h = hay.get(c.code)!
    let score = 0
    let ok = true
    for (const p of parts) {
      let s: number
      if (h.code === p) s = 0
      else if (h.code.startsWith(p)) s = 1
      else if (h.name.startsWith(p)) s = 2
      else if (h.words.some((w) => w.startsWith(p))) s = 3
      else if (h.all.includes(p)) s = 4
      else {
        ok = false
        break
      }
      score += s
    }
    if (ok) scored.push({ code: c.code, score })
  }
  const popular = (code: Currency) => {
    const i = POPULAR_CURRENCIES.indexOf(code)
    return i < 0 ? 999 : i
  }
  return scored
    .sort(
      (a, b) =>
        a.score - b.score ||
        popular(a.code) - popular(b.code) ||
        currencyName(a.code, lang).localeCompare(currencyName(b.code, lang), lang),
    )
    .map((x) => x.code)
}

/** Все валюты по алфавиту названий — нижняя часть списка выбора. */
export function currenciesByName(lang: Lang): Currency[] {
  return CURRENCIES.map((c) => c.code).sort((a, b) =>
    currencyName(a, lang).localeCompare(currencyName(b, lang), lang),
  )
}

/** «Гривна · ₴» — подпись к флагу там, где места мало. */
export function currencyLabel(code: Currency, lang: Lang): string {
  return `${currencyName(code, lang)} · ${getCurrency(code).symbol}`
}
