/**
 * Разбор CSV с операциями — общий для приложения (src/lib/csvImport.ts, импорт в
 * Настройках) и бота (worker/src/csv.ts, файл в чат). Здесь только то, что не
 * зависит от среды: таблица, колонки, даты, суммы, тип. Чистые функции без
 * браузера, стора и воркера — их собирают и Vite, и Wrangler.
 *
 * Правила: разделитель — самый частый в строке заголовка; колонки узнаются по
 * названию на двух языках, без заголовка — порядок нашей выгрузки; последний
 * разделитель в сумме — десятичный; несуществующие даты («31.02») отбрасываются.
 */

export type CsvKind = 'income' | 'expense'
export type CsvColumn = 'date' | 'type' | 'category' | 'amount' | 'currency' | 'note' | 'tags'

/** Определяем разделитель по строке заголовка: побеждает самый частый. */
export function detectSep(headerLine: string): string {
  let best = ';'
  let bestCount = -1
  for (const c of [';', ',', '\t']) {
    const n = headerLine.split(c).length - 1
    if (n > bestCount) {
      bestCount = n
      best = c
    }
  }
  return bestCount > 0 ? best : ';'
}

/**
 * RFC 4180: поле в кавычках может содержать разделитель, перенос строки и
 * удвоенные кавычки. Свой разбор, а не split — иначе заметка с точкой с запятой
 * разваливает строку. Читает не больше maxRows строк.
 */
export function parseTable(text: string, sep: string, maxRows: number): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const pushRow = () => {
    row.push(field)
    field = ''
    if (row.length > 1 || row[0] !== '') rows.push(row)
    row = []
  }
  for (let i = 0; i < text.length && rows.length <= maxRows; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"' && field === '') quoted = true
    else if (ch === sep) {
      row.push(field)
      field = ''
    } else if (ch === '\n') pushRow()
    else if (ch !== '\r') field += ch
  }
  if (field !== '' || row.length > 0) pushRow()
  return rows
}

/** Для сравнения названий: только буквы, нижний регистр. */
export const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-zа-яё]/gi, '')

const HEADER_ALIASES: Record<CsvColumn, string[]> = {
  date: ['дата', 'date', 'день', 'day', 'datetime'],
  type: ['тип', 'type', 'вид', 'kind', 'направление'],
  category: ['категория', 'category', 'статья', 'группа'],
  amount: ['сумма', 'amount', 'value', 'цена', 'price', 'total'],
  currency: ['валюта', 'currency', 'cur'],
  note: ['заметка', 'note', 'комментарий', 'comment', 'описание', 'description', 'назначение'],
  tags: ['теги', 'tags', 'метки', 'tag'],
}

/** Порядок колонок нашей выгрузки — когда заголовка нет. */
const OUR_ORDER: Record<CsvColumn, number> = { date: 0, type: 1, category: 2, amount: 3, currency: 4, note: 5, tags: 6 }

export interface CsvTable {
  /** Строки данных (без заголовка). */
  body: string[][]
  /** Номер колонки по смыслу; нет колонки — undefined. */
  idx: Partial<Record<CsvColumn, number>>
  sep: string
}

/** Текст файла → строки данных и где какая колонка. BOM (Excel, наша выгрузка) срезается. */
export function readCsv(text: string, maxRows: number): CsvTable {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const sep = detectSep(clean.split(/\r?\n/, 1)[0] ?? '')
  const table = parseTable(clean, sep, maxRows + 1)
  if (table.length === 0) return { body: [], idx: {}, sep }
  const header: Partial<Record<CsvColumn, number>> = {}
  table[0].forEach((cell, i) => {
    const n = norm(cell)
    for (const [key, names] of Object.entries(HEADER_ALIASES) as [CsvColumn, string[]][]) {
      if (header[key] === undefined && names.includes(n)) header[key] = i
    }
  })
  const hasHeader = header.date !== undefined || header.amount !== undefined
  return { body: table.slice(hasHeader ? 1 : 0), idx: hasHeader ? header : OUR_ORDER, sep }
}

/** Значение колонки в строке (обрезанное); колонки нет — ''. */
export const cellOf = (cells: string[], idx: Partial<Record<CsvColumn, number>>, k: CsvColumn): string =>
  idx[k] !== undefined ? (cells[idx[k] as number] ?? '').trim() : ''

/**
 * «2026-08-10», «10.08.2026», «10/08/2026» → '2026-08-10'. Несуществующая дата
 * («31.02.2026» — Date молча сделал бы из неё 3 марта), год раньше 2000 или позже
 * `maxTime` — null.
 */
export function parseCsvDate(raw: string, maxTime = Infinity): string | null {
  const s = raw.trim()
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  let iso = m ? `${m[1]}-${m[2]}-${m[3]}` : null
  if (!iso) {
    m = /^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/.exec(s)
    if (m) iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  if (!iso) return null
  const t = Date.parse(`${iso}T00:00:00Z`)
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== iso) return null
  return Number(iso.slice(0, 4)) >= 2000 && t <= maxTime ? iso : null
}

/** Сумма больше этой — не сумма, а мусор (номер счёта, склеенные колонки). */
export const CSV_MAX_AMOUNT = 1e9

/** «1 234,56», «1234.56», «1.234,56»: последний разделитель — десятичный, остальные — разряды. */
export function parseCsvAmount(raw: string): number | null {
  const s = raw.replace(/[\s  ]/g, '').replace(/[^\d.,-]/g, '')
  if (!s) return null
  const lastDot = s.lastIndexOf('.')
  const lastComma = s.lastIndexOf(',')
  const normalized =
    lastDot === -1 && lastComma === -1
      ? s
      : lastComma > lastDot
        ? s.replace(/\./g, '').replace(',', '.')
        : s.replace(/,/g, '')
  const n = Number(normalized)
  return Number.isFinite(n) && Math.abs(n) <= CSV_MAX_AMOUNT ? n : null
}

const INCOME_WORDS = ['доход', 'приход', 'поступление', 'income', 'credit']

/**
 * Тип по колонке типа. Нет типа — расход: это трекер трат, и чужие выгрузки
 * (банк: «−25.94») чаще всего именно о них; знак суммы на тип не влияет.
 */
export function parseCsvKind(raw: string): CsvKind {
  const n = norm(raw)
  if (INCOME_WORDS.some((w) => n.startsWith(w))) return 'income'
  return 'expense'
}

/** Ключ операции для отсева повторов: тот же день, сумма, категория и заметка. */
export function dedupeKey(t: { date: string; amount: number; categoryId: string; note?: string }): string {
  return `${t.date}|${Math.round(t.amount * 100)}|${t.categoryId}|${(t.note ?? '').trim().toLowerCase()}`
}
