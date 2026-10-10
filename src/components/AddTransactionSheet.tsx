import { lazy, Suspense, useState, useEffect, useMemo, useRef } from 'react'
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
import { coinsWord, useCatName, useT } from '../lib/i18n'
import { hapticTap, hapticSelect, hapticNotify } from '../lib/telegram'
import { CategoryIcon } from './icons/CategoryIcon'
import { CURRENCIES, getCurrency, type Currency } from '../lib/currencies'
import { BottomSheet, SheetDragZone } from './ui/BottomSheet'
import { SegTrack } from './ui/SegTrack'
import { replay } from '../lib/fx'
import { showToast } from '../lib/toast'
import { markTouched } from '../lib/touched'
import { playSaveEffect } from '../lib/saveEffect'


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
 * поверхностей не видно, куда жать. Теперь у цифр своя плашка, а операторы —
 * контурные: цифры и калькулятор читаются как две разные зоны. Мятной заливки у
 * операторов больше нет (2.0): бренд в шторке один — у кнопки «Сохранить».
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
  const track = useStore((s) => s.track)
  const removeTransaction = useStore((s) => s.removeTransaction)
  const restoreTransaction = useStore((s) => s.restoreTransaction)
  const undoCommit = useStore((s) => s.undoCommit)
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
  const lang = useStore((s) => s.lang)

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
  // Попытка сохранить без категории — подсказка над сеткой, пока не выберут.
  const [needCategory, setNeedCategory] = useState(false)
  const amountRef = useRef<HTMLDivElement>(null)
  const hintRef = useRef<HTMLDivElement>(null)
  const saveRef = useRef<HTMLButtonElement>(null)

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
    setNeedCategory(false)
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
    track('use_repeat')
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
    // Сохранить пока нельзя — показываем, чего не хватает, а не молчим
    // серой кнопкой: трясётся сумма или сетка категорий.
    if (!canSubmit) {
      hapticNotify('error')
      if (numeric <= 0) replay(amountRef.current, 'shake')
      else {
        // Подсказка появляется (и трясётся при повторной попытке) над
        // категориями — трясти всю сетку из тринадцати плиток было шумно.
        setNeedCategory(true)
        replay(hintRef.current, 'shake')
      }
      return
    }
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
    const before = editing
    const { coins: coinsBefore, coinDay: coinDayBefore } = useStore.getState()
    const id = commitTransaction(payload, editing?.id ?? null)
    // Первая запись за день приносит монеты (RECORD_COINS) — скажем об этом.
    const gained = useStore.getState().coins - coinsBefore
    markTouched(categoryId)
    // Эффект из магазина — праздник привычки, а не трат: первая запись дня
    // (за неё и монеты) и доход. Каждый расход с конфетти и правка с
    // фейерверком — странный сигнал для приложения про экономию.
    if (!before && (kind === 'income' || gained > 0)) playSaveEffect(saveRef.current)

    // Тост с отменой: случайно записанное убирается одним нажатием, а не
    // поиском строки и крестиком. Правку «отменить» — вернуть прежние поля.
    const cat = categories.find((c) => c.id === categoryId)
    const signed = (kind === 'expense' ? '−' : '+') + formatMoney(numeric, txCurrency).replace('−', '')
    showToast({
      icon: gained > 0 ? 'coins' : 'check',
      text: before ? tr('toast.saved_edit') : tr('toast.saved'),
      // «+2 монеты» — во второй строке: в первой на 320 px оно обрезалось.
      sub: `${cat ? catName(cat.id, cat.name) + ' · ' : ''}${signed}${gained > 0 ? ` · +${gained} ${coinsWord(lang, gained)}` : ''}`,
      action: {
        label: tr('toast.undo'),
        run: () => {
          if (before) {
            // Поля, которых в прежней версии не было (дописали заметку), тоже
            // откатываем: правка сливается с операцией, а не заменяет её.
            const { id: _id, ...prev } = before
            commitTransaction({ note: undefined, tags: undefined, currency: undefined, ...prev }, before.id)
          } else {
            // Монеты за первую запись дня уходят вместе с ней.
            undoCommit(id, gained > 0 ? { coins: gained, coinDay: coinDayBefore } : null)
          }
        },
      },
    })
    onClose()
  }

  // Удаление операции прямо из формы правки — с возможностью вернуть.
  const removeEditing = () => {
    if (!editing) return
    hapticNotify('warning')
    const removed = editing
    removeTransaction(removed.id)
    const cat = categories.find((c) => c.id === removed.categoryId)
    showToast({
      icon: 'undo',
      text: tr('toast.deleted'),
      sub: `${cat ? catName(cat.id, cat.name) + ' · ' : ''}${formatMoney(removed.amount, removed.currency ?? globalCurrency)}`,
      duration: 6000,
      action: { label: tr('toast.restore'), run: () => restoreTransaction(removed) },
    })
    onClose()
  }

  const todayKey = todayISO
  const yesterdayKey = dayjs().subtract(1, 'day').format('YYYY-MM-DD')

  return (
    <>
      {/* 2.1: шторка колонкой. Сумма сверху и клавиатура с «Записать» внизу
          закреплены, между ними прокручивается остальное. Раньше прокручивался
          весь лист, и на экране 390×844 кнопка «Записать» оказывалась за краем. */}
      <BottomSheet open={open} onClose={onClose} z={50} layout="flex" padBottom={null}>
        <SheetDragZone className="flex shrink-0 items-center justify-between gap-3 px-4 pb-1 pt-0.5">
          {/* Сегмент нейтральный: красная и зелёная заливки делали переключатель
              самым ярким местом шторки, а вид операции и так виден по знаку суммы. */}
          <SegTrack active={kind}>
            <button
              onClick={() => switchKind('expense')}
              aria-pressed={kind === 'expense'}
              className={`seg-item px-4 py-1.5 ${kind === 'expense' ? 'seg-on' : ''}`}
            >
              − {tr('common.expense_one')}
            </button>
            <button
              onClick={() => switchKind('income')}
              aria-pressed={kind === 'income'}
              className={`seg-item px-4 py-1.5 ${kind === 'income' ? 'seg-on' : ''}`}
            >
              + {tr('common.income_one')}
            </button>
          </SegTrack>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onClose}
            className="shrink-0 pr-2 text-sm font-medium text-ink-subtle active:text-ink-muted"
          >
            {tr('common.cancel')}
          </button>
        </SheetDragZone>

        {/* Сумма — всегда на виду: её набирают клавиатурой снизу. */}
        <div className="shrink-0 px-6 pb-2 pt-1 text-center">
          <div ref={amountRef} className="text-display-lg text-ink">
            <AmountChars value={numeric} currency={txCurrency} sign={kind === 'expense' ? '−' : '+'} />
          </div>
          {hasOps && (
            <div className="mt-1 text-sm font-medium tabular text-ink-subtle">{expr} =</div>
          )}
          {/* Чип выбора валюты */}
          <div className="mt-2 flex flex-col items-center gap-2">
            <button
              onClick={() => { hapticSelect(); setCurrencyOpen((v) => !v) }}
              aria-expanded={currencyOpen}
              className="press flex items-center gap-1.5 rounded-full bg-surface-sunken px-3 py-1 text-[13px] font-semibold text-ink-muted"
            >
              <span>{getCurrency(txCurrency).symbol}</span>
              <span>{txCurrency}</span>
              <ChevronDown size={11} strokeWidth={2.5} className={`transition-transform duration-300 ${currencyOpen ? 'rotate-180' : ''}`} />
            </button>
            {currencyOpen && (
              <div className="menu-in flex flex-wrap justify-center gap-1.5" style={{ transformOrigin: 'top center' }}>
                {quickCurrencies.map((code) => (
                  <button
                    key={code}
                    onClick={() => { hapticSelect(); setTxCurrency(code); setCurrencyOpen(false); setShowMoreCurrencies(false) }}
                    className={`press rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                      txCurrency === code ? 'bg-ink text-surface-raised' : 'bg-surface-sunken text-ink-muted'
                    }`}
                  >
                    {getCurrency(code).symbol} {code}
                  </button>
                ))}
                {!showMoreCurrencies && (
                  <button
                    onClick={() => { hapticSelect(); setShowMoreCurrencies(true) }}
                    className="press rounded-full bg-surface-sunken px-3 py-1 text-xs font-semibold text-ink-subtle"
                  >
                    {tr('add.more')}
                  </button>
                )}
                {showMoreCurrencies && CURRENCIES.filter((c) => !quickCurrencies.includes(c.code)).map((c) => (
                  <button
                    key={c.code}
                    onClick={() => { hapticSelect(); setTxCurrency(c.code); setCurrencyOpen(false); setShowMoreCurrencies(false) }}
                    className={`press rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                      txCurrency === c.code ? 'bg-ink text-surface-raised' : 'bg-surface-sunken text-ink-muted'
                    }`}
                  >
                    {c.symbol} {c.code}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Середина прокручивается: повтор, категории, заметка, дата, теги. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
          {/* Повтор частых операций — только при создании: в правке подставлять
              чужую сумму поверх редактируемой было бы неожиданно. */}
          {!editing && frequent.length > 0 && (
            <div className="pb-2 pt-1">
              <div className="caption px-6 pb-1.5 text-ink-subtle">{tr('add.frequent')}</div>
              <div className="no-scrollbar stagger flex gap-2 overflow-x-auto px-6">
                {frequent.map((f) => {
                  const cat = categories.find((c) => c.id === f.categoryId)
                  if (!cat) return null // категорию удалили — подсказку не показываем
                  return (
                    <button
                      key={`${f.categoryId}|${f.amount}|${f.currency}`}
                      onClick={() => applyFrequent(f)}
                      className="press flex shrink-0 items-center gap-2 rounded-full bg-surface-sunken py-1.5 pl-1.5 pr-3.5"
                    >
                      <span
                        className="flex h-7 w-7 items-center justify-center rounded-full"
                        style={{ background: cat.color + '22', color: cat.color }}
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

          {/* Категории — две строки с прокруткой вбок: обязательное поле должно
              быть видно без прокрутки шторки. Подсказка трясётся, если пытались
              сохранить без категории. */}
          <div className="pt-1">
            {needCategory && !categoryId && (
              <div ref={hintRef} className="caption px-6 pb-1 font-semibold text-expense-deep dark:text-expense-soft">
                {tr('add.pick_category')}
              </div>
            )}
            <div
              className="no-scrollbar grid auto-cols-[76px] grid-flow-col grid-rows-2 gap-x-1 gap-y-1 overflow-x-auto px-4 pb-1"
              style={{
                WebkitMaskImage: 'linear-gradient(90deg, #000 calc(100% - 28px), transparent)',
                maskImage: 'linear-gradient(90deg, #000 calc(100% - 28px), transparent)',
              }}
            >
              {categories.map((c) => {
                const active = c.id === categoryId
                return (
                  <button
                    key={c.id}
                    onClick={() => { hapticSelect(); setCategoryId(c.id); setNeedCategory(false) }}
                    aria-pressed={active}
                    className="press flex flex-col items-center gap-1 rounded-2xl px-1 py-1.5 transition-[background-color,box-shadow] duration-200"
                    style={{
                      background: active ? c.color + '22' : 'transparent',
                      boxShadow: active ? `inset 0 0 0 2px ${c.color}` : undefined,
                    }}
                  >
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors duration-200 ${active ? 'pop' : ''}`}
                      style={{ background: c.color + (active ? '33' : '15'), color: c.color }}
                    >
                      <CategoryIcon id={c.icon} size={20} />
                    </div>
                    <span className={`w-full truncate text-center text-[11px] font-medium leading-tight ${active ? 'text-ink' : 'text-ink-muted'}`}>
                      {catName(c.id, c.name)}
                    </span>
                  </button>
                )
              })}

              {/* + Создать */}
              <button
                onClick={() => { hapticTap(); setEditorOpen(true) }}
                className="press flex flex-col items-center gap-1 rounded-2xl px-1 py-1.5"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-sunken text-ink-subtle">
                  <Plus size={20} strokeWidth={2} />
                </div>
                <span className="text-[11px] font-medium leading-tight text-ink-subtle">{tr('add.create')}</span>
              </button>
            </div>
          </div>

          {/* Заметка */}
          <div className="px-6 pb-2 pt-2">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={tr('add.note_ph')}
              className="w-full rounded-2xl bg-surface-sunken px-4 py-2.5 text-sm text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-brand-400"
              maxLength={60}
            />
          </div>

          {/* Дата */}
          <div className="px-6 pb-2">
            <SegTrack active={date}>
              {([
                { id: todayKey, label: tr('add.today') },
                { id: yesterdayKey, label: tr('add.yesterday') },
              ] as const).map((opt) => {
                const active = date === opt.id
                return (
                  <button
                    key={opt.label}
                    onClick={() => { hapticSelect(); setDate(opt.id) }}
                    className={`seg-item py-1.5 text-[13px] ${active ? 'seg-on' : ''}`}
                  >
                    {opt.label}
                  </button>
                )
              })}
              <label
                className={`seg-item relative flex items-center justify-center gap-1.5 py-1.5 text-[13px] ${
                  date !== todayKey && date !== yesterdayKey ? 'seg-on' : ''
                }`}
              >
                <Calendar size={14} strokeWidth={2} />
                <span>{dayjs(date).format('D MMM')}</span>
                <input
                  type="date"
                  max={todayKey}
                  value={date}
                  onChange={(e) => { if (e.target.value) { hapticSelect(); setDate(e.target.value) } }}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  aria-label={tr('add.pick_date')}
                />
              </label>
            </SegTrack>
          </div>

          {/* Теги */}
          <div className="px-6">
            <div className="flex flex-wrap items-center gap-1.5">
              {tags.map((t) => (
                <button
                  key={t}
                  onClick={() => { hapticSelect(); setTags((arr) => arr.filter((x) => x !== t)) }}
                  className="pop flex items-center gap-1 rounded-full bg-surface-sunken px-2.5 py-1 text-xs font-semibold text-ink"
                >
                  #{t}
                  <span className="text-ink-subtle">×</span>
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
                    className="press rounded-full bg-surface-sunken px-2.5 py-1 text-[11px] font-medium text-ink-muted"
                  >
                    #{t}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Низ закреплён: клавиатура и «Записать» всегда под пальцем. */}
        <div
          className="shrink-0 border-t border-hairline bg-surface-raised px-4 pt-2"
          style={{ paddingBottom: 'calc(var(--safe-bottom, 0px) + 12px)' }}
        >
          {/* Клавиатура: цифры + калькулятор (см. KEYS) */}
          <div className="grid grid-cols-4 gap-1.5 pb-2">
            {KEYS.map(({ k, kind }) => (
              <button
                key={k}
                onClick={() => press(k)}
                aria-label={kind === 'back' ? tr('common.delete') : k}
                className={`press flex h-12 items-center justify-center rounded-2xl text-2xl font-semibold [@media(max-height:640px)]:h-11 ${
                  kind === 'op'
                    ? 'text-ink-muted shadow-soft active:bg-surface-sunken'
                    : kind === 'back'
                    ? 'bg-surface-sunken text-ink-muted active:bg-surface-sunken/70'
                    : 'bg-surface-sunken text-ink active:bg-surface-sunken/70'
                }`}
              >
                {kind === 'back' ? <Delete size={22} strokeWidth={2.2} /> : k}
              </button>
            ))}
          </div>

          {/* Не disabled: нажатие на неготовую кнопку объясняет, чего не хватает
              (тряска суммы или подсказки про категорию), вместо молчаливой
              серой кнопки. */}
          <button
            ref={saveRef}
            onClick={submit}
            aria-disabled={!canSubmit}
            className={`press-soft w-full rounded-full bg-brand-500 py-3.5 text-base font-bold text-white transition-opacity duration-200 ${
              !canSubmit ? 'opacity-40' : ''
            }`}
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
              className="press-soft mt-1 w-full rounded-full py-2.5 text-sm font-bold text-expense-deep active:bg-surface-sunken dark:text-expense-soft"
            >
              {tr('common.delete')}
            </button>
          )}
        </div>
      </BottomSheet>

      {/* Редактор категорий — своя шторка поверх этой (слой 60). Вне BottomSheet:
          иначе он закрывался бы вместе с листом при свайпе. */}
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
  )
}

/** Разделитель, который formatMoney ставит между числом и символом валюты. */
const NBSP = String.fromCharCode(160)

/**
 * Сумма в шторке: тот же вид, что у `<Money>`, но каждый новый знак при вводе
 * въезжает снизу (.char-in) — как на табло калькулятора. Ключи знаков — слева:
 * уже набранное стоит на месте, анимируется только дописанное.
 */
function AmountChars({ value, currency, sign }: { value: number; currency: Currency; sign: string }) {
  const text = formatMoney(value, currency)
  const cut = text.lastIndexOf(NBSP)
  const num = cut >= 0 ? text.slice(0, cut) : text
  const symbol = cut >= 0 ? text.slice(cut + 1) : ''
  const frac = /[.,]\d{2}$/.exec(num)
  const whole = frac ? num.slice(0, frac.index) : num
  return (
    <span className="money">
      {sign}{' '}
      {[...whole].map((ch, i) => (
        <span key={i + ch} className="char-in">
          {ch}
        </span>
      ))}
      {frac && <span className="money-frac">{frac[0]}</span>}
      {symbol && <span className="money-sym">{symbol}</span>}
    </span>
  )
}
