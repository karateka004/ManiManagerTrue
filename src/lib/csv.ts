import type { Transaction } from '../store/transactions'

/**
 * Выгрузка операций в CSV.
 *
 * Разделитель — точка с запятой, а не запятая: Excel в русской и армянской
 * локали разбирает по запятой только если её же считает десятичным знаком,
 * и файл открывается одной колонкой. Google Sheets определяет разделитель сам,
 * так что точка с запятой безопаснее для обоих.
 *
 * Байтовый порядок (BOM) дописывает воркер — без него Excel читает кириллицу
 * как мусор, а собирать файл здесь и портить его в дороге ни к чему.
 */

const SEP = ';'

/** Экранирование по RFC 4180: кавычки удваиваем, поле в кавычках, если внутри спецсимвол. */
function cell(value: string | number | undefined): string {
  const s = value === undefined || value === null ? '' : String(value)
  if (!s) return ''
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export interface CsvOptions {
  /** Заголовки колонок на языке интерфейса. */
  headers: string[]
  /** Подписи типов операций. */
  incomeLabel: string
  expenseLabel: string
  /** Название категории на языке интерфейса. */
  categoryName: (id: string) => string
  /** Валюта по умолчанию для операций без своей. */
  fallbackCurrency: string
}

/** Операции по возрастанию даты: так файл читается как история, а не как лента. */
export function buildCsv(transactions: Transaction[], opts: CsvOptions): string {
  const rows = [opts.headers.map(cell).join(SEP)]

  const sorted = [...transactions].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  for (const t of sorted) {
    rows.push(
      [
        cell(t.date),
        cell(t.type === 'income' ? opts.incomeLabel : opts.expenseLabel),
        cell(opts.categoryName(t.categoryId)),
        // Точка как десятичный знак: так число читают и Excel, и таблицы, и pandas.
        cell(t.amount.toFixed(2)),
        cell(t.currency ?? opts.fallbackCurrency),
        cell(t.note),
        cell(t.tags?.join(', ')),
      ].join(SEP),
    )
  }

  return rows.join('\r\n')
}
