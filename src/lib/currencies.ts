/**
 * Валюты приложения. Сам список (код, символ, локаль, флаг) — общий с ботом, в
 * shared/currencies.ts; здесь — то, что нужно только приложению. Модуль лежит в
 * стартовом чанке (его тянет formatMoney). Названия и поиск — `currencyInfo.ts`.
 */
import { CURRENCIES } from '../../shared/currencies'

export { CURRENCIES }


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
