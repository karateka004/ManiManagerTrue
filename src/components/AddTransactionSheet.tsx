import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore, selectCategoriesByKind } from '../store/transactions'
import type { CategoryKind } from '../store/categories'
import { formatMoney } from '../lib/format'
import { hapticTap, hapticSelect, hapticNotify } from '../lib/telegram'
import { CategoryIcon } from './icons/CategoryIcon'
import { CategoryEditor } from './CategoryEditor'

interface Props {
  open: boolean
  kind: CategoryKind
  onClose: () => void
}

const OPS = ['+', '−', '×', '÷'] as const
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

export function AddTransactionSheet({ open, kind, onClose }: Props) {
  const addTransaction = useStore((s) => s.addTransaction)
  const currency = useStore((s) => s.currency)
  const categories = useStore((s) => selectCategoriesByKind(s, kind))
  const allTransactions = useStore((s) => s.transactions)

  const [expr, setExpr] = useState('0')
  const [categoryId, setCategoryId] = useState<string>('')
  const [note, setNote] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagDraft, setTagDraft] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)

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
    if (open) {
      setExpr('0')
      setCategoryId('')
      setNote('')
      setTags([])
      setTagDraft('')
    }
  }, [open, kind])

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
    addTransaction({
      type: kind,
      amount: numeric,
      categoryId,
      note: note.trim() || undefined,
      tags: tags.length ? tags : undefined,
      date: new Date().toISOString(),
    })
    onClose()
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          />

          <motion.div
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

            <div className="flex items-center justify-between px-6 py-2">
              <span className={`pill text-sm ${
                kind === 'expense' ? 'bg-expense-soft text-expense-deep' : 'bg-income-soft text-income-deep'
              }`}>
                {kind === 'expense' ? '− Расход' : '+ Доход'}
              </span>
              <button onClick={onClose} className="text-ink-subtle text-sm font-medium active:text-ink-muted">
                Отмена
              </button>
            </div>

            {/* Amount display */}
            <div className="px-6 pt-2 pb-3 text-center">
              <div className={`text-display-lg tabular ${kind === 'expense' ? 'text-expense-deep' : 'text-income-deep'}`}>
                {kind === 'expense' ? '−' : '+'} {formatMoney(numeric, currency)}
              </div>
              {hasOps && (
                <div className="mt-1 text-sm font-medium tabular text-ink-subtle">{expr} =</div>
              )}
            </div>

            {/* Note */}
            <div className="px-6 pb-2">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Заметка (необязательно)"
                className="w-full rounded-2xl bg-surface-sunken px-4 py-3 text-sm text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-brand-400"
                maxLength={60}
              />
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
                    placeholder={tags.length ? '+ тег' : '+ добавить тег'}
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
                      <span className="text-[10px] font-medium leading-tight text-ink-muted">{c.name}</span>
                    </button>
                  )
                })}

                {/* + Создать */}
                <button
                  onClick={() => { hapticTap(); setEditorOpen(true) }}
                  className="flex flex-col items-center gap-1 rounded-2xl p-2 active:scale-95"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-dashed border-ink-subtle/40 text-ink-subtle">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </div>
                  <span className="text-[10px] font-medium leading-tight text-ink-subtle">Создать</span>
                </button>
              </div>
            </div>

            {/* Numpad with operators */}
            <div className="grid grid-cols-4 gap-1 px-4 pb-2">
              {['7','8','9','÷','4','5','6','×','1','2','3','−',',','0','⌫','+'].map((k) => (
                <button
                  key={k}
                  onClick={() => press(k)}
                  className={`rounded-2xl py-3 text-2xl font-semibold active:bg-surface-sunken ${
                    isOp(k) ? 'text-brand-500' : 'text-ink'
                  }`}
                >
                  {k}
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
                {kind === 'expense' ? 'Записать расход' : 'Записать доход'}
              </button>
            </div>
          </motion.div>

          <CategoryEditor
            open={editorOpen}
            defaultKind={kind}
            onClose={() => setEditorOpen(false)}
          />
        </>
      )}
    </AnimatePresence>
  )
}
