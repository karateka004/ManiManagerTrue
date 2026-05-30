import dayjs from 'dayjs'
import 'dayjs/locale/ru'
import relativeTime from 'dayjs/plugin/relativeTime'
import { getCurrency, type Currency } from './currencies'

dayjs.extend(relativeTime)
dayjs.locale('ru')

export type { Currency }

/** Format amount with thin spaces between thousands and currency symbol */
export function formatMoney(value: number, currency: Currency = 'RUB', opts?: { compact?: boolean; sign?: boolean }) {
  const meta = getCurrency(currency)
  const sign = opts?.sign ? (value > 0 ? '+' : value < 0 ? '−' : '') : ''
  const abs = Math.abs(value)

  if (opts?.compact && abs >= 1000) {
    const k = abs / 1000
    const formatted = k >= 100 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, '')
    return `${sign}${formatted}K ${meta.symbol}`
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
  if (d.isSame(today, 'day')) return `Сегодня, ${d.format('D MMMM')}`
  if (d.isSame(today.subtract(1, 'day'), 'day')) return `Вчера, ${d.format('D MMMM')}`
  return d.format('D MMMM YYYY')
}

export function formatMonthLong(date: Date | string) {
  return dayjs(date).format('MMMM YYYY')
}

export function formatMonthShort(date: Date | string) {
  return dayjs(date).format('MMMM')
}

export { dayjs }
