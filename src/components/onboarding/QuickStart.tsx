import { useMemo, useState } from 'react'
import { m, AnimatePresence } from 'framer-motion'
import { X, ArrowRight, Plus, Check, Sparkles } from 'lucide-react'
import { useStore, selectCategoriesByKind } from '../../store/transactions'
import { CategoryIcon } from '../icons/CategoryIcon'
import { getCurrency, type Currency } from '../../lib/currencies'
import { formatMoney, dayjs } from '../../lib/format'
import { hapticTap, hapticSelect, hapticNotify } from '../../lib/telegram'
import { useT, type TFunc } from '../../lib/i18n'

/**
 * Быстрый старт для новичка: три шага до первого полезного вывода.
 *   1) доход → 2) пара расходов → 3) прогноз остатка на конец месяца.
 *
 * Операции пишутся в стор по-настоящему, поэтому после онбординга человек
 * попадает не в пустое приложение, а в уже живое: есть баланс и категории.
 * Закрыть можно на любом шаге, но с подтверждением — чтобы не выскочить случайно.
 */

/** Основные валюты для быстрого выбора на первом шаге. */
const QUICK_CURRENCIES: Currency[] = ['USD', 'EUR', 'UAH']

interface Draft {
  amount: number
  categoryId: string
}

export function QuickStart({ onDone }: { onDone: () => void }) {
  const t = useT()
  const [step, setStep] = useState(0)

  const currency = useStore((s) => s.currency)
  const setCurrency = useStore((s) => s.setCurrency)
  const addTransaction = useStore((s) => s.addTransaction)
  const incomeCats = useStore((s) => selectCategoriesByKind(s, 'income'))
  const expenseCats = useStore((s) => selectCategoriesByKind(s, 'expense'))

  // Шаг 1 — доход.
  const [incomeAmount, setIncomeAmount] = useState('')
  const [incomeCat, setIncomeCat] = useState('salary')
  // Шаг 2 — расходы (копим в черновике, пишем в стор при переходе дальше).
  const [expenses, setExpenses] = useState<Draft[]>([])
  const [expAmount, setExpAmount] = useState('')
  const [expCat, setExpCat] = useState('food')

  const income = parseFloat(incomeAmount.replace(',', '.')) || 0
  const spentToday = expenses.reduce((sum, e) => sum + e.amount, 0)

  /** Прогноз: если каждый день тратить как сегодня — что останется к концу месяца. */
  const forecast = useMemo(() => {
    const daysTotal = dayjs().daysInMonth()
    const projected = income - spentToday * daysTotal
    const safeDaily = daysTotal > 0 ? income / daysTotal : 0
    return { projected, safeDaily, daysTotal }
  }, [income, spentToday])

  const close = () => {
    // Защита от случайного выхода: спрашиваем подтверждение.
    if (!confirm(t('qs.exit_confirm'))) return
    hapticSelect()
    onDone()
  }

  const goIncome = () => {
    if (income <= 0) return
    hapticTap()
    addTransaction({
      type: 'income',
      amount: income,
      categoryId: incomeCat,
      date: new Date().toISOString(),
      note: '',
      currency,
    })
    setStep(2)
  }

  const addExpense = () => {
    const value = parseFloat(expAmount.replace(',', '.')) || 0
    if (value <= 0 || expenses.length >= 3) return
    hapticNotify('success')
    setExpenses((prev) => [...prev, { amount: value, categoryId: expCat }])
    setExpAmount('')
  }

  const goForecast = () => {
    if (expenses.length < 2) return
    hapticTap()
    for (const e of expenses) {
      addTransaction({
        type: 'expense',
        amount: e.amount,
        categoryId: e.categoryId,
        date: new Date().toISOString(),
        note: '',
        currency,
      })
    }
    setStep(3)
  }

  return (
    <>
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm"
      />
      <m.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
        className="fixed inset-x-0 bottom-0 z-[80] flex max-h-[94vh] flex-col rounded-t-5xl bg-surface-raised shadow-raised"
        style={{ paddingBottom: 'calc(var(--safe-bottom, 0px) + 16px)' }}
      >
        {/* Шапка: прогресс по шагам + закрыть */}
        <div className="flex items-center gap-3 px-5 pb-3 pt-4">
          <div className="flex flex-1 gap-1.5">
            {[1, 2, 3].map((i) => (
              <span
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  step >= i ? 'bg-brand-500' : 'bg-surface-sunken'
                }`}
              />
            ))}
          </div>
          <button
            onClick={close}
            aria-label={t('common.close')}
            className="shrink-0 text-ink-subtle active:text-ink-muted"
          >
            <X size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5">
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.18 }}
            >
              {step === 0 && <StepWelcome t={t} onStart={() => { hapticTap(); setStep(1) }} />}

              {step === 1 && (
                <StepIncome
                  t={t}
                  amount={incomeAmount}
                  onAmount={setIncomeAmount}
                  cats={incomeCats}
                  catId={incomeCat}
                  onCat={setIncomeCat}
                  currency={currency}
                  onCurrency={(c) => { setCurrency(c); hapticSelect() }}
                  canGo={income > 0}
                  onNext={goIncome}
                />
              )}

              {step === 2 && (
                <StepExpenses
                  t={t}
                  amount={expAmount}
                  onAmount={setExpAmount}
                  cats={expenseCats}
                  catId={expCat}
                  onCat={setExpCat}
                  currency={currency}
                  items={expenses}
                  onAdd={addExpense}
                  onRemove={(i) => setExpenses((p) => p.filter((_, idx) => idx !== i))}
                  onNext={goForecast}
                />
              )}

              {step === 3 && (
                <StepForecast
                  t={t}
                  currency={currency}
                  income={income}
                  spentToday={spentToday}
                  projected={forecast.projected}
                  safeDaily={forecast.safeDaily}
                  onDone={() => { hapticNotify('success'); onDone() }}
                />
              )}
            </m.div>
          </AnimatePresence>
        </div>
      </m.div>
    </>
  )
}

/* ---------- Шаг 0: приветствие ---------- */

function StepWelcome({ t, onStart }: { t: TFunc; onStart: () => void }) {
  return (
    <div className="pb-2 text-center">
      <div className="text-5xl">🌿</div>
      <div className="mt-2 text-2xl font-bold tracking-tight text-ink">{t('qs.welcome_title')}</div>
      <p className="mx-auto mt-2 max-w-[300px] text-[14px] leading-relaxed text-ink-muted">
        {t('qs.welcome_sub')}
      </p>

      <div className="mt-5 flex flex-col gap-2 text-left">
        {[
          { n: '1', key: 'qs.plan_1' },
          { n: '2', key: 'qs.plan_2' },
          { n: '3', key: 'qs.plan_3' },
        ].map((s) => (
          <div key={s.n} className="flex items-center gap-3 rounded-2xl bg-surface-sunken/60 px-3 py-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500 text-[12px] font-bold text-white">
              {s.n}
            </span>
            <span className="text-[13px] font-medium text-ink">{t(s.key)}</span>
          </div>
        ))}
      </div>

      <button
        onClick={onStart}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-brand-500 py-3.5 text-sm font-bold text-white active:scale-[0.99]"
      >
        {t('qs.start')} <ArrowRight size={17} strokeWidth={2.6} />
      </button>
      <div className="mt-2 text-[11px] text-ink-subtle">{t('qs.takes_a_minute')}</div>
    </div>
  )
}

/* ---------- Шаг 1: доход ---------- */

function StepIncome({
  t, amount, onAmount, cats, catId, onCat, currency, onCurrency, canGo, onNext,
}: {
  t: TFunc
  amount: string
  onAmount: (v: string) => void
  cats: { id: string; name: string; icon: string; color: string }[]
  catId: string
  onCat: (id: string) => void
  currency: Currency
  onCurrency: (c: Currency) => void
  canGo: boolean
  onNext: () => void
}) {
  return (
    <div className="pb-2">
      <div className="text-xl font-bold text-ink">{t('qs.income_title')}</div>
      <p className="mt-1 text-[13px] leading-snug text-ink-subtle">{t('qs.income_sub')}</p>

      <AmountField value={amount} onChange={onAmount} currency={currency} autoFocus />

      {/* Валюта — один тап, чтобы дальше всё считалось правильно */}
      <div className="mt-2 flex gap-1.5">
        {QUICK_CURRENCIES.map((c) => (
          <button
            key={c}
            onClick={() => onCurrency(c)}
            className={`flex-1 rounded-xl py-1.5 text-[12px] font-semibold transition-colors ${
              currency === c ? 'bg-brand-500 text-white' : 'bg-surface-sunken text-ink-muted'
            }`}
          >
            {getCurrency(c).symbol} {c}
          </button>
        ))}
      </div>

      <div className="mt-4 text-[11px] font-bold uppercase tracking-wider text-ink-subtle">
        {t('qs.income_source')}
      </div>
      <CategoryChips cats={cats} selected={catId} onSelect={onCat} />

      <button
        onClick={onNext}
        disabled={!canGo}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-brand-500 py-3.5 text-sm font-bold text-white transition active:scale-[0.99] disabled:opacity-40"
      >
        {t('qs.next')} <ArrowRight size={17} strokeWidth={2.6} />
      </button>
    </div>
  )
}

/* ---------- Шаг 2: расходы ---------- */

function StepExpenses({
  t, amount, onAmount, cats, catId, onCat, currency, items, onAdd, onRemove, onNext,
}: {
  t: TFunc
  amount: string
  onAmount: (v: string) => void
  cats: { id: string; name: string; icon: string; color: string }[]
  catId: string
  onCat: (id: string) => void
  currency: Currency
  items: Draft[]
  onAdd: () => void
  onRemove: (i: number) => void
  onNext: () => void
}) {
  const catById = (id: string) => cats.find((c) => c.id === id)
  const enough = items.length >= 2
  const full = items.length >= 3

  return (
    <div className="pb-2">
      <div className="text-xl font-bold text-ink">{t('qs.expense_title')}</div>
      <p className="mt-1 text-[13px] leading-snug text-ink-subtle">{t('qs.expense_sub')}</p>

      {!full && (
        <>
          <AmountField value={amount} onChange={onAmount} currency={currency} />
          <CategoryChips cats={cats} selected={catId} onSelect={onCat} />
          <button
            onClick={onAdd}
            disabled={!(parseFloat(amount.replace(',', '.')) > 0)}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-surface-sunken py-3 text-sm font-bold text-ink transition active:scale-[0.99] disabled:opacity-40"
          >
            <Plus size={17} strokeWidth={2.6} /> {t('qs.add_expense')}
          </button>
        </>
      )}

      {/* Уже добавленные траты */}
      {items.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          {items.map((e, i) => {
            const c = catById(e.categoryId)
            return (
              <div key={i} className="flex items-center gap-2.5 rounded-2xl bg-surface-sunken/60 px-3 py-2">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: (c?.color ?? '#888') + '22', color: c?.color ?? '#888' }}
                >
                  <CategoryIcon id={c?.icon ?? 'other'} size={16} />
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{c?.name}</span>
                <span className="tabular text-[13px] font-bold text-expense-deep">
                  −{formatMoney(e.amount, currency)}
                </span>
                <button
                  onClick={() => onRemove(i)}
                  aria-label={t('common.delete')}
                  className="shrink-0 text-ink-subtle active:text-expense-deep"
                >
                  <X size={15} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-3 text-center text-[11px] text-ink-subtle">
        {t('qs.expense_counter', { n: items.length })}
      </div>

      <button
        onClick={onNext}
        disabled={!enough}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-brand-500 py-3.5 text-sm font-bold text-white transition active:scale-[0.99] disabled:opacity-40"
      >
        {t('qs.show_result')} <Sparkles size={17} strokeWidth={2.4} />
      </button>
    </div>
  )
}

/* ---------- Шаг 3: инсайт ---------- */

function StepForecast({
  t, currency, income, spentToday, projected, safeDaily, onDone,
}: {
  t: TFunc
  currency: Currency
  income: number
  spentToday: number
  projected: number
  safeDaily: number
  onDone: () => void
}) {
  const positive = projected >= 0
  return (
    <div className="pb-2 text-center">
      <div className="text-4xl">{positive ? '🎉' : '⚠️'}</div>
      <div className="mt-2 text-xl font-bold text-ink">{t('qs.result_title')}</div>

      {/* Главная цифра прогноза */}
      <div
        className={`mt-4 rounded-4xl p-5 ${
          positive
            ? 'bg-gradient-to-br from-brand-500 to-brand-700'
            : 'bg-gradient-to-br from-rose-500 to-rose-700'
        } text-white shadow-soft`}
      >
        <div className="text-[11px] font-semibold uppercase tracking-widest text-white/70">
          {positive ? t('qs.result_left_label') : t('qs.result_short_label')}
        </div>
        <div className="mt-1 text-display-lg tabular font-bold">
          {formatMoney(Math.abs(projected), currency)}
        </div>
        <div className="mt-1 text-[12px] leading-snug text-white/80">{t('qs.result_hint')}</div>
      </div>

      {/* Расшифровка, чтобы цифра не выглядела магией */}
      <div className="mt-3 flex gap-2">
        <MiniStat label={t('common.income')} value={formatMoney(income, currency)} tone="income" />
        <MiniStat label={t('qs.spent_today')} value={formatMoney(spentToday, currency)} tone="expense" />
      </div>

      <div className="mt-3 flex items-start gap-2.5 rounded-3xl bg-surface-sunken/60 p-3 text-left">
        <span className="mt-0.5 text-base leading-none">💡</span>
        <span className="text-[12px] leading-relaxed text-ink-muted">
          {t('qs.result_advice', { sum: formatMoney(safeDaily, currency) })}
        </span>
      </div>

      <button
        onClick={onDone}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-brand-500 py-3.5 text-sm font-bold text-white active:scale-[0.99]"
      >
        <Check size={17} strokeWidth={2.8} /> {t('qs.finish')}
      </button>
      <div className="mt-2 text-[11px] leading-snug text-ink-subtle">{t('qs.finish_hint')}</div>
    </div>
  )
}

/* ---------- Общие мелочи ---------- */

/** Крупное поле суммы с символом валюты. */
function AmountField({
  value, onChange, currency, autoFocus,
}: {
  value: string
  onChange: (v: string) => void
  currency: Currency
  autoFocus?: boolean
}) {
  return (
    <div className="mt-3 flex items-center gap-2 rounded-3xl bg-surface-sunken px-4 py-3.5">
      <input
        type="number"
        inputMode="decimal"
        min={0}
        autoFocus={autoFocus}
        placeholder="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="tabular w-full bg-transparent text-2xl font-bold text-ink placeholder:text-ink-subtle focus:outline-none"
      />
      <span className="shrink-0 text-lg font-semibold text-ink-subtle">{getCurrency(currency).symbol}</span>
    </div>
  )
}

/** Горизонтальная лента чипов-категорий. */
function CategoryChips({
  cats, selected, onSelect,
}: {
  cats: { id: string; name: string; icon: string; color: string }[]
  selected: string
  onSelect: (id: string) => void
}) {
  return (
    <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
      {cats.map((c) => {
        const active = c.id === selected
        return (
          <button
            key={c.id}
            onClick={() => { onSelect(c.id); hapticSelect() }}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-[12px] font-semibold transition-colors ${
              active ? 'text-white' : 'bg-surface-sunken text-ink-muted'
            }`}
            style={active ? { background: c.color } : undefined}
          >
            <CategoryIcon id={c.icon} size={15} />
            {c.name}
          </button>
        )
      })}
    </div>
  )
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: 'income' | 'expense' }) {
  return (
    <div className="flex-1 rounded-2xl bg-surface-sunken/60 p-3 text-left">
      <div className="text-[10px] font-bold uppercase tracking-wider text-ink-subtle">{label}</div>
      <div className={`tabular text-sm font-bold ${tone === 'income' ? 'text-income-deep' : 'text-expense-deep'}`}>
        {value}
      </div>
    </div>
  )
}
