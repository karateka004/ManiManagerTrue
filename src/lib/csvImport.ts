import type { Category, CategoryKind } from '../store/categories'
import type { Currency } from './currencies'
import { CURRENCIES } from './currencies'

/**
 * Разбор CSV с операциями.
 *
 * Рассчитан прежде всего на файлы, которые мы сами и выгружаем (см. lib/csv),
 * но к чужим относится терпимо: разделитель определяется по строке заголовка,
 * колонки узнаются по названию на обоих языках, а неразобранные строки просто
 * пропускаются со счётчиком — молча портить данные нельзя.
 *
 * Импорт всегда ДОБАВЛЯЕТ и никогда не заменяет: файл может оказаться чужим,
 * и подменять им историю было бы разрушительно.
 */

/** Строка длиннее — это не CSV, а что-то другое; не пытаемся разбирать. */
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
  /** Подписи типов на обоих языках уже учтены; это валюта по умолчанию. */
  fallbackCurrency: Currency
}

/* ---------- Разбор ---------- */

/** Определяем разделитель по строке заголовка: побеждает самый частый. */
function detectSep(headerLine: string): string {
  const candidates = [';', ',', '\t']
  let best = ';'
  let bestCount = -1
  for (const c of candidates) {
    const n = headerLine.split(c).length - 1
    if (n > bestCount) {
      bestCount = n
      best = c
    }
  }
  return bestCount > 0 ? best : ';'
}

/**
 * Разбор по RFC 4180: поле в кавычках может содержать разделитель, перенос
 * строки и удвоенные кавычки. Свой разбор, а не split — иначе заметка с
 * точкой с запятой разваливает строку.
 */
function parseCsv(text: string, sep: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let i = 0

  const pushField = () => {
    row.push(field)
    field = ''
  }
  const pushRow = () => {
    pushField()
    if (row.length > 1 || row[0] !== '') rows.push(row)
    row = []
  }

  while (i < text.length && rows.length <= MAX_ROWS) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        quoted = false
        i += 1
        continue
      }
      field += ch
      i += 1
      continue
    }
    if (ch === '"' && field === '') {
      quoted = true
      i += 1
      continue
    }
    if (ch === sep) {
      pushField()
      i += 1
      continue
    }
    if (ch === '\r') {
      i += 1
      continue
    }
    if (ch === '\n') {
      pushRow()
      i += 1
      continue
    }
    field += ch
    i += 1
  }
  if (field !== '' || row.length > 0) pushRow()
  return rows
}

/* ---------- Узнавание колонок ---------- */

const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-zа-яё]/gi, '')

const HEADER_ALIASES: Record<string, string[]> = {
  date: ['дата', 'date', 'день', 'day', 'datetime'],
  type: ['тип', 'type', 'вид', 'kind', 'направление'],
  category: ['категория', 'category', 'статья', 'группа'],
  amount: ['сумма', 'amount', 'value', 'цена', 'price', 'total'],
  currency: ['валюта', 'currency', 'cur'],
  note: ['заметка', 'note', 'комментарий', 'comment', 'описание', 'description', 'назначение'],
  tags: ['теги', 'tags', 'метки', 'tag'],
}

function mapHeader(cells: string[]): Record<string, number> {
  const out: Record<string, number> = {}
  cells.forEach((cell, i) => {
    const n = norm(cell)
    for (const [key, names] of Object.entries(HEADER_ALIASES)) {
      if (out[key] === undefined && names.includes(n)) out[key] = i
    }
  })
  return out
}

/* ---------- Разбор значений ---------- */

/** «2026-08-10», «10.08.2026» и «10/08/2026» — всё сводим к ISO. */
function parseDate(raw: string): string | null {
  const s = raw.trim()
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = /^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/.exec(s)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return null
}

/**
 * «1 234,56», «1234.56», «1.234,56» — всё это одна и та же сумма.
 * Последний разделитель считаем десятичным, остальное — разрядами.
 */
function parseAmount(raw: string): number | null {
  const s = raw.replace(/[\s  ]/g, '').replace(/[^\d.,-]/g, '')
  if (!s) return null
  const lastDot = s.lastIndexOf('.')
  const lastComma = s.lastIndexOf(',')
  let normalized: string
  if (lastDot === -1 && lastComma === -1) normalized = s
  else if (lastComma > lastDot) normalized = s.replace(/\./g, '').replace(',', '.')
  else normalized = s.replace(/,/g, '')
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

const INCOME_WORDS = ['доход', 'приход', 'поступление', 'income', 'credit']
const EXPENSE_WORDS = ['расход', 'трата', 'списание', 'expense', 'debit']

function parseType(raw: string | undefined, amount: number): CategoryKind | null {
  const n = raw ? norm(raw) : ''
  if (n) {
    if (INCOME_WORDS.some((w) => n.startsWith(w))) return 'income'
    if (EXPENSE_WORDS.some((w) => n.startsWith(w))) return 'expense'
  }
  // Нет колонки типа — решает знак. Всё положительное без типа считаем
  // расходами: это трекер трат, и чужие выгрузки чаще всего именно о них.
  return amount < 0 ? 'expense' : null
}

/* ---------- Основная функция ---------- */

export function parseTransactionsCsv(text: string, opts: ParseOptions): ParseResult {
  // BOM в начале файла (его пишет и наша выгрузка, и Excel) не должен попасть в первую ячейку
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? ''
  const sep = detectSep(firstLine)
  const table = parseCsv(clean, sep)
  if (table.length === 0) return { rows: [], skipped: 0, sep }

  const header = mapHeader(table[0])
  // Заголовка нет — работаем по порядку колонок нашей же выгрузки.
  const hasHeader = header.date !== undefined || header.amount !== undefined
  const idx = hasHeader
    ? header
    : { date: 0, type: 1, category: 2, amount: 3, currency: 4, note: 5, tags: 6 }

  const byName = new Map<string, Category>()
  for (const c of opts.categories) {
    byName.set(norm(opts.categoryName(c)), c)
    byName.set(norm(c.name), c)
    byName.set(norm(c.id), c)
  }
  const currencyCodes = new Set(CURRENCIES.map((c) => c.code as string))

  const rows: ParsedRow[] = []
  let skipped = 0

  for (let r = hasHeader ? 1 : 0; r < table.length; r++) {
    const cells = table[r]
    const date = parseDate(cells[idx.date ?? 0] ?? '')
    const rawAmount = parseAmount(cells[idx.amount ?? 3] ?? '')
    if (!date || rawAmount === null || rawAmount === 0) {
      skipped += 1
      continue
    }

    const type = parseType(idx.type !== undefined ? cells[idx.type] : undefined, rawAmount) ?? 'expense'
    const amount = Math.abs(rawAmount)

    const catCell = idx.category !== undefined ? cells[idx.category] ?? '' : ''
    const found = byName.get(norm(catCell))
    // Категория не узнана или не того вида — «Прочее» своего вида.
    const categoryId = found && found.kind === type ? found.id : type === 'income' ? 'other_in' : 'other'

    const curCell = (idx.currency !== undefined ? cells[idx.currency] ?? '' : '').trim().toUpperCase()
    const currency = (currencyCodes.has(curCell) ? curCell : opts.fallbackCurrency) as Currency

    const note = (idx.note !== undefined ? cells[idx.note] ?? '' : '').trim()
    const tagCell = (idx.tags !== undefined ? cells[idx.tags] ?? '' : '').trim()
    const tags = tagCell ? tagCell.split(/[,;]/).map((x) => x.trim()).filter(Boolean) : undefined

    rows.push({ type, amount, categoryId, currency, date, note: note || undefined, tags })
  }

  return { rows, skipped, sep }
}

/** Ключ операции для отсева повторов: тот же день, сумма, категория и заметка. */
export function dedupeKey(t: { date: string; amount: number; categoryId: string; note?: string }): string {
  return `${t.date}|${Math.round(t.amount * 100)}|${t.categoryId}|${(t.note ?? '').trim().toLowerCase()}`
}
