import { useMemo, useState } from 'react'
import { m } from 'framer-motion'
import { X, ArrowRight, Plus } from 'lucide-react'
import { useStore, selectCategoriesByKind } from '../../store/transactions'
import { CategoryIcon } from '../icons/CategoryIcon'
import { getCurrency, type Currency } from '../../lib/currencies'
import { formatMoney, dayjs } from '../../lib/format'
import { Money } from '../ui/Money'
import { hapticTap, hapticSelect, hapticNotify } from '../../lib/telegram'
import { useCatName, useT, type TFunc } from '../../lib/i18n'

/**
 * Быстрый старт для новичка: три шага до первого полезного вывода.
 *   1) доход → 2) пара расходов → 3) прогноз остатка на конец месяца.
 *
 * Операции пишутся в стор по-настоящему, поэтому после онбординга человек
 * попадает не в пустое приложение, а в уже живое: есть баланс и категории.
 * Закрыть можно на любом шаге, но с подтверждением — чтобы не выскочить случайно.
 *
 * 2.0: без значков в цветных квадратах над заголовками и без карточек на каждую
 * строку — заголовок крупный, шаги и итоги идут списком с тонкими линиями.
 * Переход между шагами — на CSS (`.tab-enter`), а не на framer: внутри шага
 * поля ввода и итоговая сумма, и прятать их за анимацией, которая может не
 * стартовать в свёрнутом webview, нельзя (см. «Грабли» в CLAUDE.md).
 */

/** Основные валюты для быстрого выбора на первом шаге. */
const QUICK_CURRENCIES: Currency[] = ['USD', 'EUR', 'UAH']

interface Draft {
  amount: number
  categoryId: string
}

type Cat = { id: string; name: string; icon: string; color: string }

const PRIMARY_BTN =
  'flex w-full items-center justify-center gap-2 rounded-full bg-brand-500 py-3.5 text-[15px] font-bold text-white transition active:scale-[0.99] disabled:opacity-40'

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
        <div className="flex items-center gap-3 px-5 pb-4 pt-5">
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
            className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-ink-muted active:scale-95"
          >
            <X size={16} strokeWidth={2.4} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5">
          <div key={step} className="tab-enter">
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
          </div>
        </div>
      </m.div>
    </>
  )
}

/** Заголовок шага: крупно, слева, без значка над ним. */
function StepHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <>
      <h2 className="text-[26px] font-bold leading-[1.15] tracking-tight text-ink">{title}</h2>
      {sub && <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">{sub}</p>}
    </>
  )
}

/* ---------- Шаг 0: приветствие ---------- */

function StepWelcome({ t, onStart }: { t: TFunc; onStart: () => void }) {
  return (
    <div className="pb-2">
      <StepHead title={t('qs.welcome_title')} sub={t('qs.welcome_sub')} />

      {/* План — нумерованным списком с тонкими линиями. Номер — цифрой, а не
          зелёным кружком: бренд-цвет здесь положен одной кнопке «Поехали». */}
      <ol className="mt-6 border-y border-hairline">
        {['qs.plan_1', 'qs.plan_2', 'qs.plan_3'].map((key, i) => (
          <li key={key} className="flex items-baseline gap-4 border-t border-hairline py-3.5 first:border-t-0">
            <span className="w-4 shrink-0 text-[15px] font-bold tabular-nums text-ink-subtle">{i + 1}</span>
            <span className="text-[16px] font-semibold text-ink">{t(key)}</span>
          </li>
        ))}
      </ol>

      <button onClick={onStart} className={`${PRIMARY_BTN} mt-6`}>
        {t('qs.start')} <ArrowRight size={17} strokeWidth={2.6} />
      </button>
      <div className="caption mt-3 text-center text-ink-subtle">{t('qs.takes_a_minute')}</div>
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
  cats: Cat[]
  catId: string
  onCat: (id: string) => void
  currency: Currency
  onCurrency: (c: Currency) => void
  canGo: boolean
  onNext: () => void
}) {
  return (
    <div className="pb-2">
      <StepHead title={t('qs.income_title')} sub={t('qs.income_sub')} />

      <AmountField value={amount} onChange={onAmount} currency={currency} autoFocus />

      {/* Валюта — один тап, чтобы дальше всё считалось правильно. Сегмент
          нейтральный: это настройка, а не главное действие экрана. */}
      <div className="seg-track mt-3">
        {QUICK_CURRENCIES.map((c) => (
          <button
            key={c}
            onClick={() => onCurrency(c)}
            className={`seg-item py-1.5 text-[13px] ${currency === c ? 'seg-on' : ''}`}
          >
            {getCurrency(c).symbol} {c}
          </button>
        ))}
      </div>

      <div className="caption mt-5 text-ink-subtle">{t('qs.income_source')}</div>
      <CategoryChips cats={cats} selected={catId} onSelect={onCat} />

      <button onClick={onNext} disabled={!canGo} className={`${PRIMARY_BTN} mt-6`}>
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
  cats: Cat[]
  catId: string
  onCat: (id: string) => void
  currency: Currency
  items: Draft[]
  onAdd: () => void
  onRemove: (i: number) => void
  onNext: () => void
}) {
  const catById = (id: string) => cats.find((c) => c.id === id)
  const catName = useCatName()
  const enough = items.length >= 2
  const full = items.length >= 3

  return (
    <div className="pb-2">
      <StepHead title={t('qs.expense_title')} sub={t('qs.expense_sub')} />

      {!full && (
        <>
          <AmountField value={amount} onChange={onAmount} currency={currency} />
          <CategoryChips cats={cats} selected={catId} onSelect={onCat} />
          <button
            onClick={onAdd}
            disabled={!(parseFloat(amount.replace(',', '.')) > 0)}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-surface-sunken py-3 text-[15px] font-bold text-ink transition active:scale-[0.99] disabled:opacity-40"
          >
            <Plus size={17} strokeWidth={2.6} /> {t('qs.add_expense')}
          </button>
        </>
      )}

      {/* Уже добавленные траты — список с линиями. Значок в цвете категории
          оставлен: по этому цвету её потом узнают на Главной и в Аналитике. */}
      {items.length > 0 && (
        <ul className="mt-4 border-y border-hairline">
          {items.map((e, i) => {
            const c = catById(e.categoryId)
            return (
              <li key={i} className="flex items-center gap-3 border-t border-hairline py-2.5 first:border-t-0">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: (c?.color ?? '#888') + '22', color: c?.color ?? '#888' }}
                >
                  <CategoryIcon id={c?.icon ?? 'other'} size={16} />
                </span>
                <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink">{c && catName(c.id, c.name)}</span>
                <span className="text-[15px] font-semibold tabular-nums text-ink">−{formatMoney(e.amount, currency)}</span>
                <button
                  onClick={() => onRemove(i)}
                  aria-label={t('common.delete')}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-subtle active:text-expense-deep"
                >
                  <X size={15} />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <div className="caption mt-4 text-center tabular-nums text-ink-subtle">
        {t('qs.expense_counter', { n: items.length })}
      </div>

      <button onClick={onNext} disabled={!enough} className={`${PRIMARY_BTN} mt-3`}>
        {t('qs.show_result')} <ArrowRight size={17} strokeWidth={2.6} />
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
    <div className="pb-2">
      <StepHead title={t('qs.result_title')} />

      {/* Главная цифра прогноза — на той же глубокой поверхности, что баланс на
          Главной. Минус говорит подпись и цвет самого числа, а не красная заливка
          всей карточки: тревожная плашка во весь экран на первой минуте пугала. */}
      <div className="hero-surface mt-5 rounded-4xl p-5">
        <div className="caption text-white/70">
          {positive ? t('qs.result_left_label') : t('qs.result_short_label')}
        </div>
        <div className={`mt-1.5 text-display-lg font-bold ${positive ? '' : 'text-expense-soft'}`}>
          <Money value={Math.abs(projected)} currency={currency} />
        </div>
        <div className="caption mt-1.5 leading-snug text-white/70">{t('qs.result_hint')}</div>
      </div>

      {/* Расшифровка, чтобы цифра не выглядела магией */}
      <dl className="mt-4 border-y border-hairline">
        <div className="flex items-baseline justify-between gap-3 py-3">
          <dt className="text-[15px] text-ink-muted">{t('common.income')}</dt>
          <dd className="text-[15px] font-semibold tabular-nums text-ink">+{formatMoney(income, currency)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-t border-hairline py-3">
          <dt className="text-[15px] text-ink-muted">{t('qs.spent_today')}</dt>
          <dd className="text-[15px] font-semibold tabular-nums text-ink">−{formatMoney(spentToday, currency)}</dd>
        </div>
      </dl>

      <p className="mt-4 text-[14px] leading-relaxed text-ink-muted">
        {t('qs.result_advice', { sum: formatMoney(Math.round(safeDaily), currency) })}
      </p>

      <button onClick={onDone} className={`${PRIMARY_BTN} mt-6`}>
        {t('qs.finish')}
      </button>
      <div className="caption mt-3 text-center leading-snug text-ink-subtle">{t('qs.finish_hint')}</div>
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
    <div className="mt-5 flex items-center gap-2 rounded-3xl bg-surface-sunken px-4 py-3.5">
      <input
        type="number"
        inputMode="decimal"
        min={0}
        autoFocus={autoFocus}
        placeholder="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent text-[28px] font-bold tabular-nums text-ink placeholder:text-ink-subtle focus:outline-none"
      />
      <span className="shrink-0 text-lg font-semibold text-ink-subtle">{getCurrency(currency).symbol}</span>
    </div>
  )
}

/**
 * Горизонтальная лента чипов-категорий. Выбранный — светлая плашка с кольцом в
 * цвете категории, а не сплошная заливка: шесть разных ярких заливок по мере
 * выбора перекрашивали бы весь шаг.
 */
function CategoryChips({
  cats, selected, onSelect,
}: {
  cats: Cat[]
  selected: string
  onSelect: (id: string) => void
}) {
  const catName = useCatName()
  return (
    <div className="-mx-5 mt-2 flex gap-1.5 overflow-x-auto px-5 py-1" style={{ scrollbarWidth: 'none' }}>
      {cats.map((c) => {
        const active = c.id === selected
        return (
          <button
            key={c.id}
            onClick={() => { onSelect(c.id); hapticSelect() }}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-semibold transition-colors ${
              active ? 'text-ink' : 'bg-surface-sunken text-ink-muted'
            }`}
            style={active ? { background: c.color + '22', boxShadow: `inset 0 0 0 1.5px ${c.color}` } : undefined}
          >
            <span style={{ color: c.color }}>
              <CategoryIcon id={c.icon} size={15} />
            </span>
            {catName(c.id, c.name)}
          </button>
        )
      })}
    </div>
  )
}
