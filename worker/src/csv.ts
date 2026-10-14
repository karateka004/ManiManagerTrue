/**
 * Импорт CSV, присланного боту файлом.
 *
 * Разбор — копия src/lib/csvImport.ts (воркер не может импортировать модули
 * приложения): те же колонки на двух языках, тот же порядок по умолчанию (наша
 * выгрузка), те же правила сумм и типа. Расходиться им нельзя — файл, который
 * понимает приложение, должен понимать и бот.
 */
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

function detectSep(headerLine: string): string {
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

/** RFC 4180: кавычки, разделитель и перенос строки внутри поля. */
function parseTable(text: string, sep: string, maxRows: number): string[][] {
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

const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-zа-яё]/gi, '')

const HEADER_ALIASES: Record<string, string[]> = {
  date: ['дата', 'date', 'день', 'day', 'datetime'],
  type: ['тип', 'type', 'вид', 'kind', 'направление'],
  category: ['категория', 'category', 'статья', 'группа'],
  amount: ['сумма', 'amount', 'value', 'цена', 'price', 'total'],
  currency: ['валюта', 'currency', 'cur'],
  note: ['заметка', 'note', 'комментарий', 'comment', 'описание', 'description', 'назначение'],
}

function parseDate(raw: string): string | null {
  const s = raw.trim()
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  let iso = m ? `${m[1]}-${m[2]}-${m[3]}` : null
  if (!iso) {
    m = /^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/.exec(s)
    if (m) iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  if (!iso) return null
  // «31.02.2026» Date.parse молча превратил бы в 3 марта — сверяем обратно.
  const t = Date.parse(`${iso}T00:00:00Z`)
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== iso) return null
  const year = Number(iso.slice(0, 4))
  return year >= 2000 && t <= Date.now() + 2 * 86_400_000 ? iso : null
}

/** «1 234,56», «1234.56», «1.234,56»: последний разделитель — десятичный. */
function parseAmount(raw: string): number | null {
  const s = raw.replace(/[\s  ]/g, '').replace(/[^\d.,-]/g, '')
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
  return Number.isFinite(n) ? n : null
}

const INCOME_WORDS = ['доход', 'приход', 'поступление', 'income', 'credit']
const EXPENSE_WORDS = ['расход', 'трата', 'списание', 'expense', 'debit']

export function parseCsvRows(text: string, categories: UserCategory[], fallbackCurrency?: string): CsvResult {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const sep = detectSep(clean.split(/\r?\n/, 1)[0] ?? '')
  const table = parseTable(clean, sep, MAX_IMPORT_ROWS + 1)
  if (table.length === 0) return { rows: [], skipped: 0, truncated: false }

  const header: Record<string, number> = {}
  table[0].forEach((cell, i) => {
    const n = norm(cell)
    for (const [key, names] of Object.entries(HEADER_ALIASES)) {
      if (header[key] === undefined && names.includes(n)) header[key] = i
    }
  })
  const hasHeader = header.date !== undefined || header.amount !== undefined
  const idx: Record<string, number> = hasHeader ? header : { date: 0, type: 1, category: 2, amount: 3, currency: 4, note: 5 }

  const byName = new Map<string, UserCategory>()
  for (const c of categories) {
    byName.set(norm(c.name), c)
    byName.set(norm(c.id), c)
  }

  const rows: CsvRow[] = []
  let skipped = 0
  const body = table.slice(hasHeader ? 1 : 0)
  const truncated = body.length > MAX_IMPORT_ROWS
  for (const cells of body.slice(0, MAX_IMPORT_ROWS)) {
    const cell = (k: string) => (idx[k] !== undefined ? (cells[idx[k]] ?? '').trim() : '')
    const date = parseDate(cell('date'))
    const raw = parseAmount(cell('amount'))
    if (!date || raw === null || raw === 0 || Math.abs(raw) > 1e9) {
      skipped++
      continue
    }
    const t = norm(cell('type'))
    const type: 'income' | 'expense' = INCOME_WORDS.some((w) => t.startsWith(w))
      ? 'income'
      : EXPENSE_WORDS.some((w) => t.startsWith(w))
        ? 'expense'
        : 'expense'
    const found = byName.get(norm(cell('category')))
    const categoryId = found && found.kind === type ? found.id : type === 'income' ? 'other_in' : 'other'
    const cur = cell('currency').toUpperCase()
    const note = cell('note').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 120)
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
