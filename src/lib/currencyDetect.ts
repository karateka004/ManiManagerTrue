/**
 * Какой валютой человек, скорее всего, платит.
 *
 * Зачем: раньше быстрый старт открывался на долларе, и многие так и проходили
 * его на долларе — кофе за 300 гривен записывался как 300 $. Теперь валюта
 * подставляется сама, а человек её только подтверждает.
 *
 * Сигналы по убыванию надёжности:
 *   1) часовой пояс устройства — где человек физически находится;
 *   2) регион в языке системы («uk-UA», «ru-KZ») — у многих стоит «en-US» по
 *      умолчанию где угодно, поэтому только вторым;
 *   3) язык Telegram — для однозначных языков («uk» → гривна, «ka» → лари);
 *      русский однозначным не считаем: на нём пишут от Бреста до Бишкека.
 *
 * Ничего не сработало — доллар, как и раньше. Ошибиться не страшно: валюту
 * показываем крупно и с кнопкой «Изменить», а не ставим молча.
 *
 * Модуль грузится лениво (быстрый старт, подсказка на Главной) — таблица
 * поясов в стартовый чанк не попадает.
 */
import { CURRENCIES, isCurrency, type Currency } from './currencies'

/** Часовые пояса по валютам. Ссылки и старые имена — рядом с новыми. */
const TZ: Partial<Record<Currency, string[]>> = {
  USD: [
    'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix',
    'America/Anchorage', 'America/Juneau', 'America/Sitka', 'America/Nome', 'America/Adak', 'America/Boise',
    'America/Detroit', 'America/Menominee', 'Pacific/Honolulu', 'America/Puerto_Rico', 'Pacific/Guam',
    // Доллар — национальная валюта: Эквадор, Сальвадор, Панама, Восточный Тимор
    'America/Guayaquil', 'Pacific/Galapagos', 'America/El_Salvador', 'America/Panama', 'Asia/Dili',
  ],
  EUR: [
    'Europe/Berlin', 'Europe/Paris', 'Europe/Madrid', 'Europe/Rome', 'Europe/Amsterdam', 'Europe/Brussels',
    'Europe/Vienna', 'Europe/Lisbon', 'Europe/Dublin', 'Europe/Helsinki', 'Europe/Athens', 'Europe/Riga',
    'Europe/Vilnius', 'Europe/Tallinn', 'Europe/Bratislava', 'Europe/Ljubljana', 'Europe/Zagreb',
    'Europe/Luxembourg', 'Europe/Malta', 'Europe/Monaco', 'Europe/Andorra', 'Europe/San_Marino',
    'Europe/Vatican', 'Europe/Podgorica', 'Europe/Mariehamn', 'Europe/Sofia', 'Asia/Nicosia',
    'Europe/Nicosia', 'Atlantic/Canary', 'Atlantic/Madeira', 'Atlantic/Azores', 'Africa/Ceuta',
  ],
  UAH: ['Europe/Kyiv', 'Europe/Kiev', 'Europe/Uzhgorod', 'Europe/Zaporozhye'],
  RUB: [
    'Europe/Moscow', 'Europe/Kaliningrad', 'Europe/Samara', 'Europe/Volgograd', 'Europe/Saratov',
    'Europe/Ulyanovsk', 'Europe/Astrakhan', 'Europe/Kirov', 'Asia/Yekaterinburg', 'Asia/Omsk',
    'Asia/Novosibirsk', 'Asia/Barnaul', 'Asia/Tomsk', 'Asia/Novokuznetsk', 'Asia/Krasnoyarsk', 'Asia/Irkutsk',
    'Asia/Chita', 'Asia/Yakutsk', 'Asia/Khandyga', 'Asia/Vladivostok', 'Asia/Ust-Nera', 'Asia/Magadan',
    'Asia/Sakhalin', 'Asia/Srednekolymsk', 'Asia/Kamchatka', 'Asia/Anadyr', 'W-SU',
  ],
  KZT: ['Asia/Almaty', 'Asia/Qostanay', 'Asia/Qyzylorda', 'Asia/Aqtobe', 'Asia/Aqtau', 'Asia/Atyrau', 'Asia/Oral'],
  BYN: ['Europe/Minsk'],
  UZS: ['Asia/Tashkent', 'Asia/Samarkand'],
  KGS: ['Asia/Bishkek'],
  TJS: ['Asia/Dushanbe'],
  TMT: ['Asia/Ashgabat', 'Asia/Ashkhabad'],
  AZN: ['Asia/Baku'],
  AMD: ['Asia/Yerevan'],
  GEL: ['Asia/Tbilisi'],
  MDL: ['Europe/Chisinau'],
  GBP: ['Europe/London', 'Europe/Belfast', 'Europe/Guernsey', 'Europe/Jersey', 'Europe/Isle_of_Man', 'GB'],
  PLN: ['Europe/Warsaw', 'Poland'],
  CZK: ['Europe/Prague'],
  HUF: ['Europe/Budapest'],
  RON: ['Europe/Bucharest'],
  CHF: ['Europe/Zurich', 'Europe/Vaduz', 'Europe/Busingen'],
  SEK: ['Europe/Stockholm'],
  NOK: ['Europe/Oslo', 'Arctic/Longyearbyen'],
  DKK: ['Europe/Copenhagen', 'Atlantic/Faroe', 'America/Nuuk', 'America/Godthab'],
  ISK: ['Atlantic/Reykjavik', 'Iceland'],
  RSD: ['Europe/Belgrade'],
  MKD: ['Europe/Skopje'],
  BAM: ['Europe/Sarajevo'],
  ALL: ['Europe/Tirane'],
  TRY: ['Europe/Istanbul', 'Asia/Istanbul', 'Turkey'],
  ILS: ['Asia/Jerusalem', 'Asia/Tel_Aviv', 'Israel'],
  AED: ['Asia/Dubai'],
  SAR: ['Asia/Riyadh'],
  QAR: ['Asia/Qatar'],
  KWD: ['Asia/Kuwait'],
  BHD: ['Asia/Bahrain'],
  OMR: ['Asia/Muscat'],
  JOD: ['Asia/Amman'],
  EGP: ['Africa/Cairo', 'Egypt'],
  MAD: ['Africa/Casablanca'],
  TND: ['Africa/Tunis'],
  DZD: ['Africa/Algiers'],
  IRR: ['Asia/Tehran', 'Iran'],
  IQD: ['Asia/Baghdad'],
  LBP: ['Asia/Beirut'],
  CNY: ['Asia/Shanghai', 'Asia/Urumqi', 'Asia/Chongqing', 'Asia/Chungking', 'Asia/Harbin', 'PRC'],
  HKD: ['Asia/Hong_Kong', 'Hongkong'],
  TWD: ['Asia/Taipei', 'ROC'],
  JPY: ['Asia/Tokyo', 'Japan'],
  KRW: ['Asia/Seoul', 'ROK'],
  MNT: ['Asia/Ulaanbaatar', 'Asia/Ulan_Bator', 'Asia/Hovd', 'Asia/Choibalsan'],
  INR: ['Asia/Kolkata', 'Asia/Calcutta'],
  PKR: ['Asia/Karachi'],
  BDT: ['Asia/Dhaka', 'Asia/Dacca'],
  LKR: ['Asia/Colombo'],
  NPR: ['Asia/Kathmandu', 'Asia/Katmandu'],
  THB: ['Asia/Bangkok'],
  VND: ['Asia/Ho_Chi_Minh', 'Asia/Saigon'],
  IDR: ['Asia/Jakarta', 'Asia/Pontianak', 'Asia/Makassar', 'Asia/Ujung_Pandang', 'Asia/Jayapura'],
  MYR: ['Asia/Kuala_Lumpur', 'Asia/Kuching'],
  SGD: ['Asia/Singapore', 'Singapore'],
  PHP: ['Asia/Manila'],
  KHR: ['Asia/Phnom_Penh'],
  LAK: ['Asia/Vientiane'],
  MMK: ['Asia/Yangon', 'Asia/Rangoon'],
  AFN: ['Asia/Kabul'],
  MVR: ['Indian/Maldives'],
  NZD: ['Pacific/Auckland', 'Pacific/Chatham', 'NZ'],
  MXN: [
    'America/Mexico_City', 'America/Cancun', 'America/Merida', 'America/Monterrey', 'America/Matamoros',
    'America/Chihuahua', 'America/Ciudad_Juarez', 'America/Ojinaga', 'America/Mazatlan',
    'America/Bahia_Banderas', 'America/Hermosillo', 'America/Tijuana', 'America/Ensenada',
  ],
  BRL: [
    'America/Sao_Paulo', 'America/Rio_Branco', 'America/Manaus', 'America/Fortaleza', 'America/Recife',
    'America/Bahia', 'America/Belem', 'America/Maceio', 'America/Araguaina', 'America/Cuiaba',
    'America/Campo_Grande', 'America/Porto_Velho', 'America/Boa_Vista', 'America/Santarem',
    'America/Eirunepe', 'America/Noronha',
  ],
  ARS: ['America/Buenos_Aires', 'America/Cordoba', 'America/Mendoza'],
  CLP: ['America/Santiago', 'America/Punta_Arenas', 'Pacific/Easter'],
  COP: ['America/Bogota'],
  PEN: ['America/Lima'],
  UYU: ['America/Montevideo'],
  PYG: ['America/Asuncion'],
  BOB: ['America/La_Paz'],
  VES: ['America/Caracas'],
  CRC: ['America/Costa_Rica'],
  DOP: ['America/Santo_Domingo'],
  GTQ: ['America/Guatemala'],
  CUP: ['America/Havana', 'Cuba'],
  ZAR: ['Africa/Johannesburg'],
  NGN: ['Africa/Lagos'],
  KES: ['Africa/Nairobi'],
  GHS: ['Africa/Accra'],
  ETB: ['Africa/Addis_Ababa'],
  TZS: ['Africa/Dar_es_Salaam'],
  UGX: ['Africa/Kampala'],
  MUR: ['Indian/Mauritius'],
  SCR: ['Indian/Mahe'],
}

/** Целые семейства поясов: проще префиксом, чем перечислять каждый. */
const TZ_PREFIX: [string, Currency][] = [
  ['America/Indiana/', 'USD'],
  ['America/Kentucky/', 'USD'],
  ['America/North_Dakota/', 'USD'],
  ['US/', 'USD'],
  ['America/Argentina/', 'ARS'],
  ['Australia/', 'AUD'],
  ['Canada/', 'CAD'],
  ['Brazil/', 'BRL'],
  ['Mexico/', 'MXN'],
]

/** Канада — отдельным списком: поясов много, и почти все только её. */
const CANADA = [
  'America/Toronto', 'America/Vancouver', 'America/Edmonton', 'America/Winnipeg', 'America/Halifax',
  'America/St_Johns', 'America/Regina', 'America/Moncton', 'America/Whitehorse', 'America/Yellowknife',
  'America/Iqaluit', 'America/Glace_Bay', 'America/Goose_Bay', 'America/Swift_Current', 'America/Dawson',
  'America/Dawson_Creek', 'America/Fort_Nelson', 'America/Creston', 'America/Cambridge_Bay', 'America/Inuvik',
  'America/Rankin_Inlet', 'America/Resolute', 'America/Atikokan', 'America/Blanc-Sablon', 'America/Montreal',
  'America/Nipigon', 'America/Thunder_Bay', 'America/Rainy_River', 'America/Pangnirtung',
]

let tzIndex: Map<string, Currency> | null = null
function currencyForTimeZone(tz: string): Currency | null {
  if (!tzIndex) {
    tzIndex = new Map()
    for (const [code, zones] of Object.entries(TZ) as [Currency, string[]][]) {
      for (const z of zones) tzIndex.set(z, code)
    }
    for (const z of CANADA) tzIndex.set(z, 'CAD')
  }
  const exact = tzIndex.get(tz)
  if (exact) return exact
  for (const [prefix, code] of TZ_PREFIX) if (tz.startsWith(prefix)) return code
  return null
}

/** Страна (ISO 3166) → валюта, для региона из языка системы. */
const EURO_COUNTRIES =
  'AT BE CY DE EE ES FI FR GR HR IE IT LT LU LV MT NL PT SI SK BG AD MC SM VA ME XK'.split(' ')
const DOLLAR_COUNTRIES = 'US EC SV PA PR GU VI AS MP TL'.split(' ')
const EXTRA_COUNTRIES: Partial<Record<Currency, string[]>> = {
  CHF: ['LI'],
  DKK: ['GL', 'FO'],
  AUD: ['KI', 'NR', 'TV'],
  NZD: ['CK', 'NU'],
  NOK: ['SJ'],
}

let countryIndex: Map<string, Currency> | null = null
function currencyForCountry(cc: string): Currency | null {
  if (!countryIndex) {
    countryIndex = new Map()
    for (const c of CURRENCIES) if (c.flag.length === 2) countryIndex.set(c.flag.toUpperCase(), c.code)
    for (const cc2 of EURO_COUNTRIES) countryIndex.set(cc2, 'EUR')
    for (const cc2 of DOLLAR_COUNTRIES) countryIndex.set(cc2, 'USD')
    for (const [code, list] of Object.entries(EXTRA_COUNTRIES) as [Currency, string[]][]) {
      for (const cc2 of list) countryIndex.set(cc2, code)
    }
  }
  return countryIndex.get(cc.toUpperCase()) ?? null
}

/**
 * Языки Telegram, по которым валюта почти наверняка ясна. Русского и
 * английского нет: на них говорят в десятках стран.
 */
const LANG_CURRENCY: Record<string, Currency> = {
  uk: 'UAH', be: 'BYN', kk: 'KZT', uz: 'UZS', ky: 'KGS', tg: 'TJS', tk: 'TMT', az: 'AZN', hy: 'AMD',
  ka: 'GEL', pl: 'PLN', cs: 'CZK', hu: 'HUF', ro: 'RON', sv: 'SEK', nb: 'NOK', no: 'NOK', da: 'DKK',
  is: 'ISK', sr: 'RSD', mk: 'MKD', bs: 'BAM', sq: 'ALL', tr: 'TRY', he: 'ILS', ja: 'JPY', ko: 'KRW',
  mn: 'MNT', th: 'THB', vi: 'VND', id: 'IDR', ms: 'MYR', fil: 'PHP', km: 'KHR', lo: 'LAK', my: 'MMK',
  fa: 'IRR', bn: 'BDT', si: 'LKR', ne: 'NPR', zh: 'CNY',
  de: 'EUR', fr: 'EUR', it: 'EUR', nl: 'EUR', fi: 'EUR', el: 'EUR', et: 'EUR', lv: 'EUR', lt: 'EUR',
  sk: 'EUR', sl: 'EUR', hr: 'EUR', mt: 'EUR', ga: 'EUR', bg: 'EUR',
}

export interface Detected {
  currency: Currency
  /** По какому признаку: tz — часовой пояс, locale — язык системы, tg — язык Telegram. */
  source: 'tz' | 'locale' | 'tg' | 'default'
}

/** Регион из тега языка: «uk-UA» → UA, «sr-Latn-RS» → RS, «en» → null. */
function regionOf(tag: string): string | null {
  const parts = tag.replace(/_/g, '-').split('-')
  for (let i = parts.length - 1; i > 0; i--) {
    if (/^[A-Za-z]{2}$/.test(parts[i])) return parts[i].toUpperCase()
  }
  return null
}

/**
 * Определить валюту. `tgLang` — `language_code` из Telegram (может не быть).
 * Окружение передаётся явно — так функцию проверяют без браузера.
 */
export function detectCurrency(
  env: { timeZone?: string; languages?: readonly string[]; tgLang?: string } = browserEnv(),
): Detected {
  const tz = env.timeZone ? currencyForTimeZone(env.timeZone) : null
  if (tz) return { currency: tz, source: 'tz' }

  for (const tag of env.languages ?? []) {
    const cc = regionOf(tag)
    // «en-US» стоит по умолчанию у множества людей не из США — ему не верим.
    if (!cc || tag.toLowerCase() === 'en-us') continue
    const c = currencyForCountry(cc)
    if (c) return { currency: c, source: 'locale' }
  }

  const lang = (env.tgLang ?? '').toLowerCase().split(/[-_]/)[0]
  const byLang = LANG_CURRENCY[lang]
  if (byLang && isCurrency(byLang)) return { currency: byLang, source: 'tg' }

  return { currency: 'USD', source: 'default' }
}

function browserEnv(): { timeZone?: string; languages?: readonly string[]; tgLang?: string } {
  let timeZone: string | undefined
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    /* старый движок */
  }
  const nav = typeof navigator !== 'undefined' ? navigator : undefined
  const languages = nav?.languages?.length ? nav.languages : nav?.language ? [nav.language] : []
  const tgLang =
    typeof window !== 'undefined' ? window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code : undefined
  return { timeZone, languages, tgLang }
}
