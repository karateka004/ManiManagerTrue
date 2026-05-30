/**
 * Основные мировые валюты. Это единый источник правды:
 *  - стор (`store/transactions.ts`) использует `Currency` как тип поля `currency`,
 *  - форматтер (`lib/format.ts`) — `getCurrency()` для символа и locale,
 *  - UI Settings — рендерит сетку из `CURRENCIES`.
 *
 * Чтобы добавить новую валюту — просто добавьте строку сюда.
 * `locale` используется в Intl.NumberFormat для группировки разрядов.
 */
export const CURRENCIES = [
  { code: 'RUB', symbol: '₽',  name: 'Рубль',       locale: 'ru-RU' },
  { code: 'USD', symbol: '$',  name: 'Доллар',      locale: 'en-US' },
  { code: 'EUR', symbol: '€',  name: 'Евро',        locale: 'de-DE' },
  { code: 'GBP', symbol: '£',  name: 'Фунт',        locale: 'en-GB' },
  { code: 'JPY', symbol: '¥',  name: 'Иена',        locale: 'ja-JP' },
  { code: 'CNY', symbol: '元', name: 'Юань',        locale: 'zh-CN' },
  { code: 'CHF', symbol: '₣',  name: 'Франк',       locale: 'de-CH' },
  { code: 'KZT', symbol: '₸',  name: 'Тенге',       locale: 'ru-KZ' },
  { code: 'UAH', symbol: '₴',  name: 'Гривна',      locale: 'uk-UA' },
  { code: 'BYN', symbol: 'Br', name: 'Бел. рубль',  locale: 'ru-BY' },
  { code: 'TRY', symbol: '₺',  name: 'Лира',        locale: 'tr-TR' },
  { code: 'INR', symbol: '₹',  name: 'Рупия',       locale: 'en-IN' },
] as const

export type Currency = (typeof CURRENCIES)[number]['code']
export type CurrencyMeta = (typeof CURRENCIES)[number]

const byCode = new Map<string, CurrencyMeta>(CURRENCIES.map((c) => [c.code, c]))

export function getCurrency(code: Currency): CurrencyMeta {
  return byCode.get(code) ?? CURRENCIES[0]
}

export const currencySymbol = (code: Currency): string => getCurrency(code).symbol
