/**
 * Деньги в ответах бота: коды валют и формат суммы.
 *
 * Формат обязан совпадать с приложением (src/lib/format.ts): человек видит одну
 * и ту же трату в чате и на Главной, и «300 ₴» против «300.00 UAH» читалось бы
 * как две разные записи.
 */
import { CURRENCIES } from '../../shared/currencies'

/** Символ и локаль на каждый код валюты — из общего списка (shared/currencies.ts). */
export const CURRENCY_META: Record<string, { symbol: string; locale: string }> = Object.fromEntries(
  CURRENCIES.map((c) => [c.code, { symbol: c.symbol, locale: c.locale }]),
)

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
