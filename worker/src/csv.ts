/**
 * Импорт CSV, присланного боту файлом. Разбор таблицы, дат, сумм и типа — общий
 * с приложением (shared/csv.ts): файл, который понимает приложение, понимает и
 * бот. Здесь — свои пределы бота (1000 строк, не из будущего, заметка ≤ 120) и
 * категории человека.
 */
import { cellOf, norm, parseCsvAmount, parseCsvDate, parseCsvKind, readCsv } from '../../shared/csv'
import type { UserCategory } from './context'
import { isKnownCurrency } from './money'

/** Больше строк из одного файла не берём: это уже не выписка, а что-то другое. */
export const MAX_IMPORT_ROWS = 1000

export interface CsvRow {
  type: 'income' | 'expense'
  amount: number
  categoryId: string
  currency?: string
  /** 'ГГГГ-ММ-ДД'. */
  date: string
  note?: string
}

export interface CsvResult {
  rows: CsvRow[]
  skipped: number
  /** Строк было больше MAX_IMPORT_ROWS — хвост не взяли. */
  truncated: boolean
}

export function parseCsvRows(text: string, categories: UserCategory[], fallbackCurrency?: string): CsvResult {
  const { body, idx } = readCsv(text, MAX_IMPORT_ROWS)
  const byName = new Map<string, UserCategory>()
  for (const c of categories) {
    byName.set(norm(c.name), c)
    byName.set(norm(c.id), c)
  }
  // Запись из будущего в выписке — ошибка файла; запас — двое суток на часовые пояса.
  const maxTime = Date.now() + 2 * 86_400_000
  const rows: CsvRow[] = []
  let skipped = 0
  const truncated = body.length > MAX_IMPORT_ROWS
  for (const cells of body.slice(0, MAX_IMPORT_ROWS)) {
    const date = parseCsvDate(cellOf(cells, idx, 'date'), maxTime)
    const raw = parseCsvAmount(cellOf(cells, idx, 'amount'))
    if (!date || raw === null || raw === 0) {
      skipped++
      continue
    }
    const type = parseCsvKind(cellOf(cells, idx, 'type'))
    const found = byName.get(norm(cellOf(cells, idx, 'category')))
    const categoryId = found && found.kind === type ? found.id : type === 'income' ? 'other_in' : 'other'
    const cur = cellOf(cells, idx, 'currency').toUpperCase()
    const note = cellOf(cells, idx, 'note').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 120)
    rows.push({
      type,
      amount: Math.round(Math.abs(raw) * 100) / 100,
      categoryId,
      currency: isKnownCurrency(cur) ? cur : fallbackCurrency,
      date,
      note: note || undefined,
    })
  }
  return { rows, skipped, truncated }
}
