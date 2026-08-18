import { lazy, Suspense, useState, useEffect, useMemo, useRef } from 'react'
import { m, AnimatePresence } from 'framer-motion'
import { Calendar, Plus, ChevronDown, Delete } from 'lucide-react'
import {
  useStore,
  selectCategoriesByKind,
  selectQuickCurrencies,
  selectFrequent,
  type FrequentEntry,
  type Transaction,
} from '../store/transactions'
import type { CategoryKind } from '../store/categories'
import { formatMoney, dayjs } from '../lib/format'
import { useCatName, useT } from '../lib/i18n'
import { hapticTap, hapticSelect, hapticNotify } from '../lib/telegram'
import { CategoryIcon } from './icons/CategoryIcon'
import { CURRENCIES, getCurrency, type Currency } from '../lib/currencies'


// Редактор категорий — общий ленивый чанк (тот же, что в Settings).
const CategoryEditor = lazy(() => import('./CategoryEditor').then((m) => ({ default: m.CategoryEditor })))

interface Props {
  open: boolean
  kind: CategoryKind
  onClose: () => void
  /** Если задано — форма работает в режиме правки этой операции (а не создания новой). */
  editing?: Transaction | null
}

/**
 * Стабильные пустышки для подписок закрытой шторки.
 *
 * После первого открытия шторка остаётся смонтированной (чтобы отыграла анимация
 * закрытия), поэтому её подписки продолжают срабатывать. Если при закрытой шторке
 * отдавать новые пустые массивы, компонент будет перерисовываться на КАЖДУЮ
 * записанную операцию впустую. Одна и та же ссылка это исключает.
 */
const NO_TX: Transaction[] = []
const NO_FREQUENT: FrequentEntry[] = []

const OPS = ['+', '−', '×', '÷'] as const

/**
 * Раскладка клавиатуры. Раньше клавиши были просто глифами на фоне шторки — без
 * поверхностей не видно, куда жать, а операторы отличались от цифр только цветом
 * и сливались с ними. Теперь у каждой клавиши своя плашка, а колонка операторов
 * выделена тоном: цифры и калькулятор читаются как две разные зоны, при этом
 * сетка осталась 4x4 и шторка не стала выше.
 */
const KEYS: { k: string; kind: 'digit' | 'op' | 'back' }[] = [
  { k: '7', kind: 'digit' }, { k: '8', kind: 'digit' }, { k: '9', kind: 'digit' }, { k: '÷', kind: 'op' },
  { k: '4', kind: 'digit' }, { k: '5', kind: 'digit' }, { k: '6', kind: 'digit' }, { k: '×', kind: 'op' },
  { k: '1', kind: 'digit' }, { k: '2', kind: 'digit' }, { k: '3', kind: 'digit' }, { k: '−', kind: 'op' },
  { k: ',', kind: 'digit' }, { k: '0', kind: 'digit' }, { k: '⌫', kind: 'back' }, { k: '+', kind: 'op' },
]
const isOp = (ch: string) => OPS.includes(ch as (typeof OPS)[number])

/** Безопасный калькулятор: + − × ÷ с приоритетом, запятая = десятичный. */
function evalExpr(expr: string): number {
  if (!expr) return 0
  const norm = expr.replace(/,/g, '.').replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')
  // токенизация
  const tokens: (number | string)[] = []
  let num = ''
  for (const ch of norm) {
    if ('+-*/'.includes(ch)) {
      if (num === '') {
        if (ch === '-') { num = '-'; continue } // ведущий минус
      } else {
        tokens.push(parseFloat(num))
        num = ''
      }
      tokens.push(ch)
    } else {
      num += ch
    }
  }
  if (num !== '' && num !== '-') tokens.push(parseFloat(num))
  if (tokens.length === 0) return 0
  // первый проход: * /
  const pass1: (number | string)[] = []
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (t === '*' || t === '/') {
      const a = pass1.pop() as number
      const b = tokens[++i] as number
      if (typeof a !== 'number' || typeof b !== 'number') return 0
      pass1.push(t === '*' ? a * b : b === 0 ? 0 : a / b)
    } else {
      pass1.push(t)
    }
  }
  // второй проход: + -
  let acc = (pass1[0] as number) ?? 0
  for (let i = 1; i < pass1.length; i += 2) {
    const op = pass1[i]
    const b = pass1[i + 1] as number
    if (typeof b !== 'number') break
    acc = op === '+' ? acc + b : acc - b
  }
  return Number.isFinite(acc) ? Math.max(0, Math.round(acc * 100) / 100) : 0
}

export function AddTransactionSheet({ open, kind: kindProp, onClose, editing }: Props) {
  // Вид операции — состояние, а не проп: сегмент в шапке переключает его прямо
  // в открытой шторке. С пропом синхронизируется при каждом открытии (см. эффект
  // ниже); в режиме правки стартует с типа правимой операции.
  const [kind, setKind] = useState<CategoryKind>(kindProp)
  const commitTransaction = useStore((s) => s.commitTransaction)
  const removeTransaction = useStore((s) => s.removeTransaction)
  const globalCurrency = useStore((s) => s.currency)
  const lastTxCurrency = useStore((s) => s.lastTxCurrency)
  const categories = useStore((s) => selectCategoriesByKind(s, kind))
  // Нужны только для подсказок тегов, то есть лишь при открытой шторке.
  const allTransactions = useStore((s) => (open ? s.transactions : NO_TX))
  // Быстрые валюты: настроенные в Settings либо подобранные по данным человека.
  const quickCurrencies = useStore(selectQuickCurrencies)
  // Привычные операции для повтора в один тап. Пока шторка закрыта, они не нужны —
  // и полный проход по всем операциям тоже.
  const frequent = useStore((st) => (open ? selectFrequent(st, kind) : NO_FREQUENT))
  const tr = useT()
  const catName = useCatName()

  const todayISO = dayjs().format('YYYY-MM-DD')
  const [expr, setExpr] = useState('0')
  const [categoryId, setCategoryId] = useState<string>('')
  const [note, setNote] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagDraft, setTagDraft] = useState('')
  const [date, setDate] = useState(todayISO)
  const [editorOpen, setEditorOpen] = useState(false)
  const [txCurrency, setTxCurrency] = useState<Currency>(lastTxCurrency)
  const [currencyOpen, setCurrencyOpen] = useState(false)
  const [showMoreCurrencies, setShowMoreCurrencies] = useState(false)
  const seenEditor = useRef(false)
  if (editorOpen) seenEditor.current = true

  const numeric = useMemo(() => evalExpr(expr), [expr])
  const hasOps = useMemo(() => [...expr].some(isOp), [expr])
  const canSubmit = numeric > 0 && categoryId !== ''

  // Недавние теги для подсказок
  const recentTags = useMemo(() => {
    const seen: string[] = []
    for (const t of allTransactions) {
      for (const tag of t.tags ?? []) {
        if (!seen.includes(tag)) seen.push(tag)
        if (seen.length >= 8) break
      }
    }
    return seen.filter((t) => !tags.includes(t))
  }, [allTransactions, tags])

  useEffect(() => {
    if (!open) return
    setKind(editing ? editing.type : kindProp)
    setCurrencyOpen(false)
    setShowMoreCurrencies(false)
    setTagDraft('')
    if (editing) {
      // Режим правки — заполняем форму из операции.
      setExpr(String(editing.amount).replace('.', ','))
      setCategoryId(editing.categoryId)
      setNote(editing.note ?? '')
      setTags(editing.tags ?? [])
      setDate(dayjs(editing.date).format('YYYY-MM-DD'))
      setTxCurrency(editing.currency ?? globalCurrency)
    } else {
      // Режим создания — пустая форма.
      setExpr('0')
      setCategoryId('')
      setNote('')
      setTags([])
      setDate(dayjs().format('YYYY-MM-DD'))
      setTxCurrency(lastTxCurrency)
    }
  }, [open, editing]) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Смена вида операции внутри шторки. Сумму, дату, заметку и теги сохраняем —
   * человек уже их ввёл, — а категорию сбрасываем: у расходов и доходов разные
   * списки, и старый id в новом списке не существует.
   */
  const switchKind = (next: CategoryKind) => {
    if (next === kind) return
    hapticSelect()
    setKind(next)
    setCategoryId('')
  }

  /**
   * Подставить частую операцию: сумма, категория и валюта разом. Намеренно НЕ
   * сохраняем сразу — человек должен увидеть, что подставилось, и подтвердить.
   * Случайный тап по чипу не должен создавать запись.
   */
  const applyFrequent = (f: FrequentEntry) => {
    hapticTap()
    setExpr(String(f.amount).replace('.', ','))
    setCategoryId(f.categoryId)
    setTxCurrency(f.currency)
  }

  const press = (key: string) => {
    hapticSelect()
    setExpr((cur) => {
      if (key === '⌫') {
        if (cur.length <= 1) return '0'
        return cur.slice(0, -1)
      }
      const last = cur[cur.length - 1]
      if (isOp(key)) {
        if (cur === '0') return cur // нельзя начинать с оператора
        if (isOp(last)) return cur.slice(0, -1) + key // заменить оператор
        return cur + key
      }
      if (key === ',') {
        // запятая допустима только если в текущем числе её ещё нет
        const lastNum = cur.split(/[+\-−×÷]/).pop() ?? ''
        if (lastNum.includes(',')) return cur
        if (lastNum === '') return cur + '0,'
        return cur + ','
      }
      // цифра
      if (cur === '0') return key
      if (isOp(last)) return cur + key
      return cur + key
    })
  }

  const addTag = (raw: string) => {
    const t = raw.trim().replace(/^#/, '').slice(0, 16)
    if (!t || tags.includes(t)) return
    if (tags.length >= 6) return
    hapticSelect()
    setTags((arr) => [...arr, t])
  }

  const submit = () => {
    if (!canSubmit) return
    hapticNotify('success')
    // Дата: если день не меняли — сохраняем исходное время операции (не сдвигаем).
    // Иначе сегодня → текущее время, прошлый день → полдень выбранной даты.
    const sameDay = editing && dayjs(editing.date).format('YYYY-MM-DD') === date
    const iso = sameDay
      ? editing!.date
      : date === dayjs().format('YYYY-MM-DD')
      ? new Date().toISOString()
      : dayjs(date).hour(12).minute(0).second(0).toISOString()
    const payload = {
      type: kind,
      amount: numeric,
      currency: txCurrency,
      categoryId,
      note: note.trim() || undefined,
      tags: tags.length ? tags : undefined,
      date: iso,
    }
    // Одно изменение стора на всё сохранение: добавление/правка, запоминание
    // валюты и сдвиг периода для операции «задним числом» (см. commitTransaction).
    commitTransaction(payload, editing?.id ?? null)
    onClose()
  }

  // Удаление операции прямо из формы правки.
  const removeEditing = () => {
    if (!editing) return
    hapticNotify('warning')
    removeTransaction(editing.id)
    onClose()
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          />

          <m.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[94vh] overflow-y-auto rounded-t-5xl bg-surface-raised shadow-raised"
            style={{ paddingBottom: 'var(--safe-bottom)' }}
          >
            <div className="flex justify-center pb-1 pt-3">
              <div className="h-1.5 w-12 rounded-full bg-surface-sunken" />
            </div>

            <div className="flex items-center justify-between gap-3 px-4 py-2">
              <div className="flex items-center gap-1 rounded-full bg-surface-sunken p-1">
                <button
                  onClick={() => switchKind('expense')}
                  aria-pressed={kind === 'expense'}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-bold transition-colors ${
                    kind === 'expense' ? 'bg-expense-soft text-expense-deep' : 'text-ink-subtle'
                  }`}
                >
                  − {tr('common.expense_one')}
                </button>
                <button
                  onClick={() => switchKind('income')}
                  aria-pressed={kind === 'income'}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-bold transition-colors ${
                    kind === 'income' ? 'bg-income-soft text-income-deep' : 'text-ink-subtle'
                  }`}
                >
                  + {tr('common.income_one')}
                </button>
              </div>
              <button onClick={onClose} className="shrink-0 pr-2 text-sm font-medium text-ink-subtle active:text-ink-muted">
                {tr('common.cancel')}
              </button>
            </div>

            {/* Amount display */}
            <div className="px-6 pt-2 pb-3 text-center">
              <div className={`text-display-lg tabular ${kind === 'expense' ? 'text-expense-deep' : 'text-income-deep'}`}>
                {kind === 'expense' ? '−' : '+'} {formatMoney(numeric, txCurrency)}
              </div>
              {hasOps && (
                <div className="mt-1 text-sm font-medium tabular text-ink-subtle">{expr} =</div>
              )}
              {/* Чип выбора валюты */}
              <div className="mt-2 flex flex-col items-center gap-2">
                <button
                  onClick={() => { hapticSelect(); setCurrencyOpen((v) => !v) }}
                  className="flex items-center gap-1.5 rounded-full border border-surface-raised bg-surface-raised px-3 py-1 text-xs font-semibold text-ink-muted active:bg-surface-sunken"
                >
                  <span>{getCurrency(txCurrency).symbol}</span>
                  <span>{txCurrency}</span>
                  <ChevronDown size={11} strokeWidth={2.5} className={`transition-transform ${currencyOpen ? 'rotate-180' : ''}`} />
                </button>
                {currencyOpen && (
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {quickCurrencies.map((code) => (
                      <button
                        key={code}
                        onClick={() => { hapticSelect(); setTxCurrency(code); setCurrencyOpen(false); setShowMoreCurrencies(false) }}
                        className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                          txCurrency === code ? 'bg-brand-500 text-white' : 'bg-surface-sunken text-ink-muted'
                        }`}
                      >
                        {getCurrency(code).symbol} {code}
                      </button>
                    ))}
                    {!showMoreCurrencies && (
                      <button
                        onClick={() => { hapticSelect(); setShowMoreCurrencies(true) }}
                        className="rounded-full bg-surface-sunken px-3 py-1 text-xs font-semibold text-ink-subtle"
                      >
                        {tr('add.more')}
                      </button>
                    )}
                    {showMoreCurrencies && CURRENCIES.filter((c) => !quickCurrencies.includes(c.code)).map((c) => (
                      <button
                        key={c.code}
                        onClick={() => { hapticSelect(); setTxCurrency(c.code); setCurrencyOpen(false); setShowMoreCurrencies(false) }}
                        className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                          txCurrency === c.code ? 'bg-brand-500 text-white' : 'bg-surface-sunken text-ink-muted'
                        }`}
                      >
                        {c.symbol} {c.code}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Повтор частых операций — только при создании: в правке подставлять
                чужую сумму поверх редактируемой было бы неожиданно. */}
            {!editing && frequent.length > 0 && (
              <div className="pb-3 pt-1">
                <div className="px-6 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-subtle">
                  {tr('add.frequent')}
                </div>
                <div className="no-scrollbar flex gap-2 overflow-x-auto px-6">
                  {frequent.map((f) => {
                    const cat = categories.find((c) => c.id === f.categoryId)
                    if (!cat) return null // категорию удалили — подсказку не показываем
                    return (
                      <button
                        key={`${f.categoryId}|${f.amount}|${f.currency}`}
                        onClick={() => applyFrequent(f)}
                        className="flex shrink-0 items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5 transition-transform active:scale-95"
                        style={{ background: cat.color + '1F' }}
                      >
                        <span
                          className="flex h-7 w-7 items-center justify-center rounded-full"
                          style={{ background: cat.color + '2E', color: cat.color }}
                        >
                          <CategoryIcon id={cat.icon} size={15} />
                        </span>
                        <span className="text-xs font-semibold text-ink">{catName(cat.id, cat.name)}</span>
                        <span className="tabular text-xs font-bold text-ink-muted">
                          {formatMoney(f.amount, f.currency)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Note */}
            <div className="px-6 pb-2">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={tr('add.note_ph')}
                className="w-full rounded-2xl bg-surface-sunken px-4 py-3 text-sm text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-brand-400"
                maxLength={60}
              />
            </div>

            {/* Date */}
            <div className="px-6 pb-2">
              <div className="flex items-center gap-1.5">
                {([
                  { id: todayISO, label: tr('add.today') },
                  { id: dayjs().subtract(1, 'day').format('YYYY-MM-DD'), label: tr('add.yesterday') },
                ] as const).map((opt) => {
                  const active = date === opt.id
                  return (
                    <button
                      key={opt.label}
                      onClick={() => { hapticSelect(); setDate(opt.id) }}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                        active ? 'bg-brand-500 text-white' : 'bg-surface-sunken text-ink-muted'
                      }`}
                    >
                      {opt.label}
                    </button>
                  )
                })}
                <label
                  className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    date !== todayISO && date !== dayjs().subtract(1, 'day').format('YYYY-MM-DD')
                      ? 'bg-brand-500 text-white'
                      : 'bg-surface-sunken text-ink-muted'
                  }`}
                >
                  <Calendar size={14} strokeWidth={2} />
                  <span className="capitalize">{dayjs(date).format('D MMM')}</span>
                  <input
                    type="date"
                    max={todayISO}
                    value={date}
                    onChange={(e) => { if (e.target.value) { hapticSelect(); setDate(e.target.value) } }}
                    className="absolute inset-0 cursor-pointer opacity-0"
                    aria-label={tr('add.pick_date')}
                  />
                </label>
              </div>
            </div>

            {/* Tags */}
            <div className="px-6 pb-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {tags.map((t) => (
                  <button
                    key={t}
                    onClick={() => { hapticSelect(); setTags((arr) => arr.filter((x) => x !== t)) }}
                    className="flex items-center gap-1 rounded-full bg-brand-100 px-2.5 py-1 text-xs font-semibold text-brand-600 active:scale-95 dark:bg-brand-500/20 dark:text-brand-300"
                  >
                    #{t}
                    <span className="text-brand-400">×</span>
                  </button>
                ))}
                {tags.length < 6 && (
                  <input
                    value={tagDraft}
                    onChange={(e) => setTagDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault()
                        addTag(tagDraft)
                        setTagDraft('')
                      } else if (e.key === 'Backspace' && tagDraft === '' && tags.length) {
                        setTags((arr) => arr.slice(0, -1))
                      }
                    }}
                    placeholder={tags.length ? tr('add.tag_ph') : tr('add.tag_add')}
                    className="min-w-[80px] flex-1 bg-transparent px-1 py-1 text-xs text-ink placeholder:text-ink-subtle focus:outline-none"
                    maxLength={16}
                  />
                )}
              </div>
              {recentTags.length > 0 && tags.length < 6 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {recentTags.slice(0, 6).map((t) => (
                    <button
                      key={t}
                      onClick={() => addTag(t)}
                      className="rounded-full bg-surface-sunken px-2.5 py-1 text-[11px] font-medium text-ink-muted active:scale-95"
                    >
                      #{t}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Categories grid */}
            <div className="px-4 pb-2">
              <div className="grid grid-cols-4 gap-2">
                {categories.map((c) => {
                  const active = c.id === categoryId
                  return (
                    <button
                      key={c.id}
                      onClick={() => { hapticSelect(); setCategoryId(c.id) }}
                      className={`flex flex-col items-center gap-1 rounded-2xl p-2 transition-all ${
                        active ? 'scale-105 shadow-soft' : 'active:scale-95'
                      }`}
                      style={{
                        background: active ? c.color + '22' : 'transparent',
                        boxShadow: active ? `inset 0 0 0 2px ${c.color}` : undefined,
                      }}
                    >
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-xl"
                        style={{ background: c.color + (active ? '33' : '15'), color: c.color }}
                      >
                        <CategoryIcon id={c.icon} size={20} />
                      </div>
                      <span className="text-[10px] font-medium leading-tight text-ink-muted">{catName(c.id, c.name)}</span>
                    </button>
                  )
                })}

                {/* + Создать */}
                <button
                  onClick={() => { hapticTap(); setEditorOpen(true) }}
                  className="flex flex-col items-center gap-1 rounded-2xl p-2 active:scale-95"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-dashed border-ink-subtle/40 text-ink-subtle">
                    <Plus size={20} strokeWidth={2} />
                  </div>
                  <span className="text-[10px] font-medium leading-tight text-ink-subtle">{tr('add.create')}</span>
                </button>
              </div>
            </div>

            {/* Клавиатура: цифры + калькулятор (см. KEYS) */}
            <div className="grid grid-cols-4 gap-1.5 px-4 pb-2">
              {KEYS.map(({ k, kind }) => (
                <button
                  key={k}
                  onClick={() => press(k)}
                  aria-label={kind === 'back' ? tr('common.delete') : k}
                  className={`flex items-center justify-center rounded-2xl py-3.5 text-2xl font-semibold transition-transform active:scale-95 ${
                    kind === 'op'
                      ? 'bg-brand-500/[0.18] text-brand-700 active:bg-brand-500/30 dark:bg-brand-500/20 dark:text-brand-300'
                      : kind === 'back'
                      ? 'bg-surface-sunken text-ink-muted active:bg-surface-sunken/70'
                      : 'bg-surface-sunken text-ink active:bg-surface-sunken/70'
                  }`}
                >
                  {kind === 'back' ? <Delete size={22} strokeWidth={2.2} /> : k}
                </button>
              ))}
            </div>

            <div className="px-4 pb-4 pt-1">
              <button
                onClick={submit}
                disabled={!canSubmit}
                className={`w-full rounded-full py-4 text-base font-bold text-white shadow-fab transition-transform active:scale-[0.98] ${
                  kind === 'expense' ? 'bg-expense' : 'bg-brand-500'
                } ${!canSubmit ? 'opacity-40' : ''}`}
              >
                {editing
                  ? tr('common.save')
                  : kind === 'expense'
                  ? tr('add.save_expense')
                  : tr('add.save_income')}
              </button>
              {editing && (
                <button
                  onClick={removeEditing}
                  className="mt-2 w-full rounded-full py-3 text-sm font-bold text-expense-deep active:bg-expense-soft"
                >
                  {tr('common.delete')}
                </button>
              )}
            </div>
          </m.div>

          {seenEditor.current && (
            <Suspense fallback={null}>
              <CategoryEditor
                open={editorOpen}
                defaultKind={kind}
                onClose={() => setEditorOpen(false)}
              />
            </Suspense>
          )}
        </>
      )}
    </AnimatePresence>
  )
}
