import dayjs from 'dayjs'
import 'dayjs/locale/ru'
import 'dayjs/locale/en'
import relativeTime from 'dayjs/plugin/relativeTime'
import { getCurrency, type Currency } from './currencies'

dayjs.extend(relativeTime)
dayjs.locale('ru')

export type { Currency }

/** Текущий язык форматтера — влияет на суффикс «к»/«k» и даты. */
let currentLang: 'ru' | 'en' = 'ru'

/** Переключить локаль dayjs и язык форматтера (вызывается реактивно при смене s.lang). */
export function setFormatLocale(lang: 'ru' | 'en') {
  currentLang = lang
  dayjs.locale(lang)
}

/** Format amount with thin spaces between thousands and currency symbol */
export function formatMoney(value: number, currency: Currency = 'USD', opts?: { compact?: boolean; sign?: boolean }) {
  const meta = getCurrency(currency)
  const sign = opts?.sign ? (value > 0 ? '+' : value < 0 ? '−' : '') : ''
  const abs = Math.abs(value)

  if (opts?.compact && abs >= 1000) {
    const k = abs / 1000
    const formatted = k >= 100 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, '')
    return `${sign}${formatted}${currentLang === 'ru' ? 'к' : 'k'} ${meta.symbol}`
  }

  const formatted = new Intl.NumberFormat(meta.locale, {
    minimumFractionDigits: abs % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(abs)

  return `${sign}${formatted} ${meta.symbol}`
}

/** Short date for transaction rows (e.g. "5 февр.") */
export function formatShortDate(iso: string) {
  return dayjs(iso).format('D MMM')
}

/** Day header (e.g. "Сегодня, 25 июля") */
export function formatDayHeader(iso: string) {
  const d = dayjs(iso)
  const today = dayjs()
  const fmt = currentLang === 'ru' ? 'D MMMM' : 'MMMM D'
  if (d.isSame(today, 'day')) return `${currentLang === 'ru' ? 'Сегодня' : 'Today'}, ${d.format(fmt)}`
  if (d.isSame(today.subtract(1, 'day'), 'day'))
    return `${currentLang === 'ru' ? 'Вчера' : 'Yesterday'}, ${d.format(fmt)}`
  return d.format(currentLang === 'ru' ? 'D MMMM YYYY' : 'MMMM D, YYYY')
}

export function formatMonthLong(date: Date | string) {
  return dayjs(date).format('MMMM YYYY')
}

export function formatMonthShort(date: Date | string) {
  return dayjs(date).format('MMMM')
}

export { dayjs }
