/**
 * Деньги в ответах бота: коды валют и формат суммы.
 *
 * Формат обязан совпадать с приложением (src/lib/format.ts): человек видит одну
 * и ту же трату в чате и на Главной, и «300 ₴» против «300.00 UAH» читалось бы
 * как две разные записи.
 */

/**
 * Символ и локаль на каждый код валюты — копия CURRENCIES из
 * src/lib/currencies.ts. Дубль сознательный (воркер собирается отдельно и не
 * может импортировать модули приложения), но молча разойтись он не должен:
 * совпадение проверяется на каждый lint — worker/scripts/check-currencies.mjs.
 */
export const CURRENCY_META: Record<string, { symbol: string; locale: string }> = {
  USD: { symbol: '$', locale: 'en-US' },
  EUR: { symbol: '€', locale: 'de-DE' },
  UAH: { symbol: '₴', locale: 'uk-UA' },
  RUB: { symbol: '₽', locale: 'ru-RU' },
  KZT: { symbol: '₸', locale: 'ru-KZ' },
  BYN: { symbol: 'Br', locale: 'ru-BY' },
  UZS: { symbol: 'сум', locale: 'ru-UZ' },
  KGS: { symbol: 'сом', locale: 'ru-KG' },
  TJS: { symbol: 'смн', locale: 'ru-TJ' },
  TMT: { symbol: 'TMT', locale: 'ru-TM' },
  AZN: { symbol: '₼', locale: 'az-AZ' },
  AMD: { symbol: '֏', locale: 'hy-AM' },
  GEL: { symbol: '₾', locale: 'ka-GE' },
  MDL: { symbol: 'MDL', locale: 'ro-MD' },
  GBP: { symbol: '£', locale: 'en-GB' },
  PLN: { symbol: 'zł', locale: 'pl-PL' },
  CZK: { symbol: 'Kč', locale: 'cs-CZ' },
  HUF: { symbol: 'Ft', locale: 'hu-HU' },
  RON: { symbol: 'lei', locale: 'ro-RO' },
  CHF: { symbol: 'CHF', locale: 'de-CH' },
  SEK: { symbol: 'kr', locale: 'sv-SE' },
  NOK: { symbol: 'kr', locale: 'nb-NO' },
  DKK: { symbol: 'kr', locale: 'da-DK' },
  ISK: { symbol: 'kr', locale: 'is-IS' },
  RSD: { symbol: 'дин.', locale: 'sr-RS' },
  MKD: { symbol: 'ден', locale: 'mk-MK' },
  BAM: { symbol: 'KM', locale: 'bs-BA' },
  ALL: { symbol: 'L', locale: 'sq-AL' },
  TRY: { symbol: '₺', locale: 'tr-TR' },
  ILS: { symbol: '₪', locale: 'he-IL' },
  AED: { symbol: 'AED', locale: 'en-AE' },
  SAR: { symbol: 'SAR', locale: 'en-SA' },
  QAR: { symbol: 'QAR', locale: 'en-QA' },
  KWD: { symbol: 'KWD', locale: 'en-KW' },
  BHD: { symbol: 'BHD', locale: 'en-BH' },
  OMR: { symbol: 'OMR', locale: 'en-OM' },
  JOD: { symbol: 'JOD', locale: 'en-JO' },
  EGP: { symbol: 'EGP', locale: 'en-EG' },
  MAD: { symbol: 'MAD', locale: 'fr-MA' },
  TND: { symbol: 'TND', locale: 'fr-TN' },
  DZD: { symbol: 'DZD', locale: 'fr-DZ' },
  IRR: { symbol: 'IRR', locale: 'en-IR' },
  IQD: { symbol: 'IQD', locale: 'en-IQ' },
  LBP: { symbol: 'LBP', locale: 'en-LB' },
  CNY: { symbol: '元', locale: 'zh-CN' },
  HKD: { symbol: 'HK$', locale: 'en-HK' },
  TWD: { symbol: 'NT$', locale: 'zh-TW' },
  JPY: { symbol: '¥', locale: 'ja-JP' },
  KRW: { symbol: '₩', locale: 'ko-KR' },
  MNT: { symbol: '₮', locale: 'mn-MN' },
  INR: { symbol: '₹', locale: 'en-IN' },
  PKR: { symbol: 'PKR', locale: 'en-PK' },
  BDT: { symbol: '৳', locale: 'bn-BD-u-nu-latn' },
  LKR: { symbol: 'LKR', locale: 'en-LK' },
  NPR: { symbol: 'NPR', locale: 'en-NP' },
  THB: { symbol: '฿', locale: 'th-TH' },
  VND: { symbol: '₫', locale: 'vi-VN' },
  IDR: { symbol: 'Rp', locale: 'id-ID' },
  MYR: { symbol: 'RM', locale: 'ms-MY' },
  SGD: { symbol: 'S$', locale: 'en-SG' },
  PHP: { symbol: '₱', locale: 'en-PH' },
  KHR: { symbol: '៛', locale: 'km-KH-u-nu-latn' },
  LAK: { symbol: '₭', locale: 'lo-LA-u-nu-latn' },
  MMK: { symbol: 'MMK', locale: 'en-MM' },
  AFN: { symbol: 'AFN', locale: 'en-AF' },
  MVR: { symbol: 'MVR', locale: 'en-MV' },
  AUD: { symbol: 'A$', locale: 'en-AU' },
  NZD: { symbol: 'NZ$', locale: 'en-NZ' },
  CAD: { symbol: 'CA$', locale: 'en-CA' },
  MXN: { symbol: 'MXN', locale: 'es-MX' },
  BRL: { symbol: 'R$', locale: 'pt-BR' },
  ARS: { symbol: 'ARS', locale: 'es-AR' },
  CLP: { symbol: 'CLP', locale: 'es-CL' },
  COP: { symbol: 'COP', locale: 'es-CO' },
  PEN: { symbol: 'S/', locale: 'es-PE' },
  UYU: { symbol: '$U', locale: 'es-UY' },
  PYG: { symbol: '₲', locale: 'es-PY' },
  BOB: { symbol: 'Bs', locale: 'es-BO' },
  VES: { symbol: 'VES', locale: 'es-VE' },
  CRC: { symbol: '₡', locale: 'es-CR' },
  DOP: { symbol: 'DOP', locale: 'es-DO' },
  GTQ: { symbol: 'Q', locale: 'es-GT' },
  CUP: { symbol: 'CUP', locale: 'es-CU' },
  ZAR: { symbol: 'R', locale: 'en-ZA' },
  NGN: { symbol: '₦', locale: 'en-NG' },
  KES: { symbol: 'KSh', locale: 'en-KE' },
  GHS: { symbol: '₵', locale: 'en-GH' },
  ETB: { symbol: 'ETB', locale: 'en-ET' },
  TZS: { symbol: 'TSh', locale: 'en-TZ' },
  UGX: { symbol: 'USh', locale: 'en-UG' },
  MUR: { symbol: 'MUR', locale: 'en-MU' },
  SCR: { symbol: 'SCR', locale: 'en-SC' },
}

/** Валюта, которую приложение действительно знает. Всё остальное записывать нельзя. */
export function isKnownCurrency(code: unknown): code is string {
  return typeof code === 'string' && Object.prototype.hasOwnProperty.call(CURRENCY_META, code)
}

/**
 * Сумма для ответа. Валюта неизвестна (человек ни разу не открывал приложение
 * и не назвал её) — печатаем голое число: подставить доллары за него было бы
 * враньём, а прятать сумму — бессмысленно.
 */
export function formatMoney(value: number, currency?: string): string {
  const meta = currency ? CURRENCY_META[currency] : undefined
  const locale = meta?.locale ?? 'ru-RU'
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value))
  // Пробел перед символом НЕРАЗРЫВНЫЙ — как в приложении: иначе длинная сумма
  // переносится так, что символ валюты уезжает на следующую строку. Константой,
  // а не символом в коде: невидимый пробел в исходнике однажды «почистят».
  const NBSP = String.fromCharCode(160)
  return meta ? `${formatted}${NBSP}${meta.symbol}` : formatted
}
