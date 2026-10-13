/**
 * Валюты: код, символ, локаль формата и флаг.
 *
 * Здесь только то, что нужно для вывода суммы, — модуль лежит в стартовом
 * чанке (его тянет formatMoney). Названия на двух языках и слова для поиска
 * живут в `currencyInfo.ts` и грузятся вместе с экранами, где валюту выбирают.
 *
 * Порядок важен в одном месте: первая валюта — запасная для незнакомого кода
 * (`getCurrency`). Дальше — по регионам, как их удобнее сверять; порядок в
 * выборе валюты задаёт `currencyInfo.ts`.
 *
 * Символ:
 *   - свой знак, если он есть и его узнают (₴ ₽ ₸ ₾ ₼ ֏ ₪ ₹ ₩ ₫ ฿);
 *   - местное сокращение, если им пишут суммы на месте (zł, Kč, Ft, сум, сом);
 *   - иначе код: «$» у песо и «Rs» у трёх рупий неотличимы друг от друга,
 *     а «300 MXN» понятно любому.
 *
 * Локаль — для разрядов и копеек, как принято в стране валюты. У каждой
 * проверены латинские цифры: у арабских, бенгальской и других локалей свои
 * цифры по умолчанию, поэтому там `en-XX` или `-u-nu-latn`.
 *
 * ВАЖНО: бот печатает суммы сам (worker/src/money.ts), и символ с локалью там
 * обязаны совпадать — сверяет `worker/scripts/check-currencies.mjs` на каждый
 * lint воркера. Добавляешь валюту — добавь и туда.
 */
export const CURRENCIES = [
  // Основные и соседи
  { code: 'USD', symbol: '$', locale: 'en-US', flag: 'us' },
  { code: 'EUR', symbol: '€', locale: 'de-DE', flag: 'eu' },
  { code: 'UAH', symbol: '₴', locale: 'uk-UA', flag: 'ua' },
  { code: 'RUB', symbol: '₽', locale: 'ru-RU', flag: 'ru' },
  { code: 'KZT', symbol: '₸', locale: 'ru-KZ', flag: 'kz' },
  { code: 'BYN', symbol: 'Br', locale: 'ru-BY', flag: 'by' },
  { code: 'UZS', symbol: 'сум', locale: 'ru-UZ', flag: 'uz' },
  { code: 'KGS', symbol: 'сом', locale: 'ru-KG', flag: 'kg' },
  { code: 'TJS', symbol: 'смн', locale: 'ru-TJ', flag: 'tj' },
  { code: 'TMT', symbol: 'TMT', locale: 'ru-TM', flag: 'tm' },
  { code: 'AZN', symbol: '₼', locale: 'az-AZ', flag: 'az' },
  { code: 'AMD', symbol: '֏', locale: 'hy-AM', flag: 'am' },
  { code: 'GEL', symbol: '₾', locale: 'ka-GE', flag: 'ge' },
  { code: 'MDL', symbol: 'MDL', locale: 'ro-MD', flag: 'md' },
  // Европа
  { code: 'GBP', symbol: '£', locale: 'en-GB', flag: 'gb' },
  { code: 'PLN', symbol: 'zł', locale: 'pl-PL', flag: 'pl' },
  { code: 'CZK', symbol: 'Kč', locale: 'cs-CZ', flag: 'cz' },
  { code: 'HUF', symbol: 'Ft', locale: 'hu-HU', flag: 'hu' },
  { code: 'RON', symbol: 'lei', locale: 'ro-RO', flag: 'ro' },
  { code: 'CHF', symbol: 'CHF', locale: 'de-CH', flag: 'ch' },
  { code: 'SEK', symbol: 'kr', locale: 'sv-SE', flag: 'se' },
  { code: 'NOK', symbol: 'kr', locale: 'nb-NO', flag: 'no' },
  { code: 'DKK', symbol: 'kr', locale: 'da-DK', flag: 'dk' },
  { code: 'ISK', symbol: 'kr', locale: 'is-IS', flag: 'is' },
  { code: 'RSD', symbol: 'дин.', locale: 'sr-RS', flag: 'rs' },
  { code: 'MKD', symbol: 'ден', locale: 'mk-MK', flag: 'mk' },
  { code: 'BAM', symbol: 'KM', locale: 'bs-BA', flag: 'ba' },
  { code: 'ALL', symbol: 'L', locale: 'sq-AL', flag: 'al' },
  { code: 'TRY', symbol: '₺', locale: 'tr-TR', flag: 'tr' },
  // Ближний Восток и Северная Африка
  { code: 'ILS', symbol: '₪', locale: 'he-IL', flag: 'il' },
  { code: 'AED', symbol: 'AED', locale: 'en-AE', flag: 'ae' },
  { code: 'SAR', symbol: 'SAR', locale: 'en-SA', flag: 'sa' },
  { code: 'QAR', symbol: 'QAR', locale: 'en-QA', flag: 'qa' },
  { code: 'KWD', symbol: 'KWD', locale: 'en-KW', flag: 'kw' },
  { code: 'BHD', symbol: 'BHD', locale: 'en-BH', flag: 'bh' },
  { code: 'OMR', symbol: 'OMR', locale: 'en-OM', flag: 'om' },
  { code: 'JOD', symbol: 'JOD', locale: 'en-JO', flag: 'jo' },
  { code: 'EGP', symbol: 'EGP', locale: 'en-EG', flag: 'eg' },
  { code: 'MAD', symbol: 'MAD', locale: 'fr-MA', flag: 'ma' },
  { code: 'TND', symbol: 'TND', locale: 'fr-TN', flag: 'tn' },
  { code: 'DZD', symbol: 'DZD', locale: 'fr-DZ', flag: 'dz' },
  { code: 'IRR', symbol: 'IRR', locale: 'en-IR', flag: 'ir' },
  { code: 'IQD', symbol: 'IQD', locale: 'en-IQ', flag: 'iq' },
  { code: 'LBP', symbol: 'LBP', locale: 'en-LB', flag: 'lb' },
  // Азия
  { code: 'CNY', symbol: '元', locale: 'zh-CN', flag: 'cn' },
  { code: 'HKD', symbol: 'HK$', locale: 'en-HK', flag: 'hk' },
  { code: 'TWD', symbol: 'NT$', locale: 'zh-TW', flag: 'tw' },
  { code: 'JPY', symbol: '¥', locale: 'ja-JP', flag: 'jp' },
  { code: 'KRW', symbol: '₩', locale: 'ko-KR', flag: 'kr' },
  { code: 'MNT', symbol: '₮', locale: 'mn-MN', flag: 'mn' },
  { code: 'INR', symbol: '₹', locale: 'en-IN', flag: 'in' },
  { code: 'PKR', symbol: 'PKR', locale: 'en-PK', flag: 'pk' },
  { code: 'BDT', symbol: '৳', locale: 'bn-BD-u-nu-latn', flag: 'bd' },
  { code: 'LKR', symbol: 'LKR', locale: 'en-LK', flag: 'lk' },
  { code: 'NPR', symbol: 'NPR', locale: 'en-NP', flag: 'np' },
  { code: 'THB', symbol: '฿', locale: 'th-TH', flag: 'th' },
  { code: 'VND', symbol: '₫', locale: 'vi-VN', flag: 'vn' },
  { code: 'IDR', symbol: 'Rp', locale: 'id-ID', flag: 'id' },
  { code: 'MYR', symbol: 'RM', locale: 'ms-MY', flag: 'my' },
  { code: 'SGD', symbol: 'S$', locale: 'en-SG', flag: 'sg' },
  { code: 'PHP', symbol: '₱', locale: 'en-PH', flag: 'ph' },
  { code: 'KHR', symbol: '៛', locale: 'km-KH-u-nu-latn', flag: 'kh' },
  { code: 'LAK', symbol: '₭', locale: 'lo-LA-u-nu-latn', flag: 'la' },
  { code: 'MMK', symbol: 'MMK', locale: 'en-MM', flag: 'mm' },
  { code: 'AFN', symbol: 'AFN', locale: 'en-AF', flag: 'af' },
  { code: 'MVR', symbol: 'MVR', locale: 'en-MV', flag: 'mv' },
  // Океания и Америка
  { code: 'AUD', symbol: 'A$', locale: 'en-AU', flag: 'au' },
  { code: 'NZD', symbol: 'NZ$', locale: 'en-NZ', flag: 'nz' },
  { code: 'CAD', symbol: 'CA$', locale: 'en-CA', flag: 'ca' },
  { code: 'MXN', symbol: 'MXN', locale: 'es-MX', flag: 'mx' },
  { code: 'BRL', symbol: 'R$', locale: 'pt-BR', flag: 'br' },
  { code: 'ARS', symbol: 'ARS', locale: 'es-AR', flag: 'ar' },
  { code: 'CLP', symbol: 'CLP', locale: 'es-CL', flag: 'cl' },
  { code: 'COP', symbol: 'COP', locale: 'es-CO', flag: 'co' },
  { code: 'PEN', symbol: 'S/', locale: 'es-PE', flag: 'pe' },
  { code: 'UYU', symbol: '$U', locale: 'es-UY', flag: 'uy' },
  { code: 'PYG', symbol: '₲', locale: 'es-PY', flag: 'py' },
  { code: 'BOB', symbol: 'Bs', locale: 'es-BO', flag: 'bo' },
  { code: 'VES', symbol: 'VES', locale: 'es-VE', flag: 've' },
  { code: 'CRC', symbol: '₡', locale: 'es-CR', flag: 'cr' },
  { code: 'DOP', symbol: 'DOP', locale: 'es-DO', flag: 'do' },
  { code: 'GTQ', symbol: 'Q', locale: 'es-GT', flag: 'gt' },
  { code: 'CUP', symbol: 'CUP', locale: 'es-CU', flag: 'cu' },
  // Африка и острова
  { code: 'ZAR', symbol: 'R', locale: 'en-ZA', flag: 'za' },
  { code: 'NGN', symbol: '₦', locale: 'en-NG', flag: 'ng' },
  { code: 'KES', symbol: 'KSh', locale: 'en-KE', flag: 'ke' },
  { code: 'GHS', symbol: '₵', locale: 'en-GH', flag: 'gh' },
  { code: 'ETB', symbol: 'ETB', locale: 'en-ET', flag: 'et' },
  { code: 'TZS', symbol: 'TSh', locale: 'en-TZ', flag: 'tz' },
  { code: 'UGX', symbol: 'USh', locale: 'en-UG', flag: 'ug' },
  { code: 'MUR', symbol: 'MUR', locale: 'en-MU', flag: 'mu' },
  { code: 'SCR', symbol: 'SCR', locale: 'en-SC', flag: 'sc' },
] as const

export type Currency = (typeof CURRENCIES)[number]['code']
export type CurrencyMeta = (typeof CURRENCIES)[number]

const byCode = new Map<string, CurrencyMeta>(CURRENCIES.map((c) => [c.code, c]))

/** Код из списка приложения. Незнакомые (из будущей версии, мусор) — нет. */
export function isCurrency(code: unknown): code is Currency {
  return typeof code === 'string' && byCode.has(code)
}

export function getCurrency(code: Currency): CurrencyMeta {
  return byCode.get(code) ?? CURRENCIES[0]
}

export const currencySymbol = (code: Currency): string => getCurrency(code).symbol

/** Знаки, которые носят несколько валют («kr» — у SEK, NOK, DKK, ISK). */
const SHARED_SYMBOLS = (() => {
  const seen = new Map<string, number>()
  for (const c of CURRENCIES) seen.set(c.symbol, (seen.get(c.symbol) ?? 0) + 1)
  return new Set([...seen].filter(([, n]) => n > 1).map(([sym]) => sym))
})()

/**
 * Знак валюты для текста, где по нему надо понять, о какой валюте речь:
 * «Перенести в kr / Оставить в kr» не говорит ничего, поэтому у общих знаков —
 * код («Перенести в NOK»).
 */
export function currencyMark(code: Currency): string {
  const sym = getCurrency(code).symbol
  return SHARED_SYMBOLS.has(sym) ? code : sym
}

/**
 * Адрес флага валюты. Флаги лежат файлами в `public/flags` (набор circle-flags,
 * MIT): картинка грузится, только когда её показали, и дальше берётся из кэша.
 * Путь относительный, от страницы: приложение живёт в подкаталоге GitHub
 * Pages, а адрес страницы не меняется (вкладки — состояние, не маршруты).
 */
export function flagUrl(code: string): string | null {
  const meta = byCode.get(code)
  return meta ? `./flags/${meta.flag}.svg` : null
}
