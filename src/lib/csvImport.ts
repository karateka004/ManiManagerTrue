import type { Category, CategoryKind } from '../store/categories'
import type { Currency } from './currencies'
import { CURRENCIES } from './currencies'
import { cellOf, norm, parseCsvAmount, parseCsvDate, parseCsvKind, readCsv } from '../../shared/csv'

export { dedupeKey } from '../../shared/csv'

/**
 * Импорт CSV с операциями в Настройках. Разбор таблицы, дат, сумм и типа — общий
 * с ботом (shared/csv.ts); здесь — категории и валюты приложения.
 *
 * Рассчитан прежде всего на файлы, которые мы сами и выгружаем (см. lib/csv),
 * но к чужим относится терпимо; неразобранные строки пропускаются со счётчиком —
 * молча портить данные нельзя. Импорт всегда ДОБАВЛЯЕТ и никогда не заменяет.
 * Будущие даты берутся: в своей выгрузке могут быть записи наперёд.
 */

/** Больше — это не CSV, а что-то другое; не пытаемся разбирать. */
const MAX_ROWS = 20000

export interface ParsedRow {
  type: CategoryKind
  amount: number
  categoryId: string
  currency: Currency
  date: string
  note?: string
  tags?: string[]
}

export interface ParseResult {
  rows: ParsedRow[]
  /** Сколько строк не удалось разобрать. */
  skipped: number
  /** Разделитель, который определился. Показываем в отчёте — помогает понять сбой. */
  sep: string
}

export interface ParseOptions {
  categories: Category[]
  /** Название категории на языке интерфейса — им и сопоставляем. */
  categoryName: (c: Category) => string
  /** Валюта по умолчанию, если колонки нет или код незнакомый. */
  fallbackCurrency: Currency
}

export function parseTransactionsCsv(text: string, opts: ParseOptions): ParseResult {
  const { body, idx, sep } = readCsv(text, MAX_ROWS)

  const byName = new Map<string, Category>()
  for (const c of opts.categories) {
    byName.set(norm(opts.categoryName(c)), c)
    byName.set(norm(c.name), c)
    byName.set(norm(c.id), c)
  }
  const currencyCodes = new Set(CURRENCIES.map((c) => c.code as string))

  const rows: ParsedRow[] = []
  let skipped = 0
  for (const cells of body) {
    const date = parseCsvDate(cellOf(cells, idx, 'date'))
    const rawAmount = parseCsvAmount(cellOf(cells, idx, 'amount'))
    if (!date || rawAmount === null || rawAmount === 0) {
      skipped += 1
      continue
    }
    const type = parseCsvKind(cellOf(cells, idx, 'type'))
    const found = byName.get(norm(cellOf(cells, idx, 'category')))
    // Категория не узнана или не того вида — «Прочее» своего вида.
    const categoryId = found && found.kind === type ? found.id : type === 'income' ? 'other_in' : 'other'
    const curCell = cellOf(cells, idx, 'currency').toUpperCase()
    const currency = (currencyCodes.has(curCell) ? curCell : opts.fallbackCurrency) as Currency
    const note = cellOf(cells, idx, 'note')
    const tagCell = cellOf(cells, idx, 'tags')
    const tags = tagCell ? tagCell.split(/[,;]/).map((x) => x.trim()).filter(Boolean) : undefined
    rows.push({ type, amount: Math.abs(rawAmount), categoryId, currency, date, note: note || undefined, tags })
  }
  return { rows, skipped, sep }
}
