import { lazy, Suspense, useMemo, useRef, useState } from 'react'
import { m } from 'framer-motion'
import { X, ArrowRight, Plus } from 'lucide-react'
import { useStore, selectCategoriesByKind } from '../../store/transactions'
import { CategoryIcon } from '../icons/CategoryIcon'
import { getCurrency, type Currency } from '../../lib/currencies'
import { currencyName } from '../../lib/currencyInfo'
import { detectCurrency } from '../../lib/currencyDetect'
import { formatMoney, dayjs } from '../../lib/format'
import { setReminders } from '../../lib/api'
import { CURRENCY_ASKED_KEY } from '../../lib/currencyAsked'
import { Money } from '../ui/Money'
import { SegTrack } from '../ui/SegTrack'
import { Toggle } from '../ui/Toggle'
import { CurrencyFlag } from '../ui/CurrencyFlag'
import { hapticTap, hapticSelect, hapticNotify, confirmAction } from '../../lib/telegram'
import { useCatName, useT, type Lang, type TFunc } from '../../lib/i18n'

// Выбор валюты с поиском — общий ленивый чанк с Настройками и шторкой операции.
const CurrencyPicker = lazy(() => import('../CurrencyPicker').then((mod) => ({ default: mod.CurrencyPicker })))

/**
 * Быстрый старт для новичка: четыре шага до первого полезного вывода.
 *   1) настройки (валюта, язык, напоминания) → 2) доход → 3) пара расходов →
 *   4) прогноз на месяц и бюджет.
 *
 * 2.2: раньше валюта стояла сегментом USD/EUR/UAH под полем дохода, выбрана была
 * долларом — и многие так и проходили быстрый старт на долларе, записывая
 * гривны и рубли как доллары. Теперь валюта определяется по региону, стоит
 * отдельным шагом крупно, с флагом, а сменить её можно на любую из 92 —
 * поиском. На последнем шаге доход становится бюджетом месяца (тумблер, можно
 * выключить): без бюджета Главная и бот не могут сказать «сколько можно
 * потратить сегодня», а это главное, ради чего записывают траты.
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

const LANGS: { id: Lang; label: string }[] = [
  { id: 'ru', label: 'Русский' },
  { id: 'en', label: 'English' },
]

interface Draft {
  amount: number
  categoryId: string
}

type Cat = { id: string; name: string; icon: string; color: string }

const PRIMARY_BTN =
  'flex w-full items-center justify-center gap-2 rounded-full bg-brand-500 py-3.5 text-[15px] font-bold text-white transition active:scale-[0.99] disabled:opacity-40'

/**
 * Сколько трат нужно для прогноза. Хватает одной: раньше требовалось две, и
 * тот, у кого сегодня была одна покупка, застревал на шаге — выйти можно было
 * только через «×». Порог один на кнопку и на её обработчик.
 */
const MIN_EXPENSES = 1

export function QuickStart({ onDone }: { onDone: () => void }) {
  const t = useT()
  const [step, setStep] = useState(0)

  const currency = useStore((s) => s.currency)
  const setCurrency = useStore((s) => s.setCurrency)
  const lang = useStore((s) => s.lang)
  const setLang = useStore((s) => s.setLang)
  const reminders = useStore((s) => s.remindersEnabled)
  const setRemindersEnabled = useStore((s) => s.setRemindersEnabled)
  const setMonthlyBudget = useStore((s) => s.setMonthlyBudget)
  const addTransaction = useStore((s) => s.addTransaction)
  const incomeCats = useStore((s) => selectCategoriesByKind(s, 'income'))
  const expenseCats = useStore((s) => selectCategoriesByKind(s, 'expense'))

  // Валюта по региону. Подставляется по «Поехали» (к шагу настроек) и при
  // выходе через «×» — так и закрывший быстрый старт сразу получит свою валюту,
  // а не доллар. НЕ при открытии: любая запись в стор при открытии сохраняет
  // его, и тот, кто просто ушёл с первого экрана, в следующий запуск считался
  // бы старым пользователем — быстрый старт ему больше не показался бы
  // (useIntro смотрит, есть ли сохранённый стор).
  const [detected] = useState(() => detectCurrency())
  const [currencyTouched, setCurrencyTouched] = useState(false)
  const applyDetected = () => {
    const s = useStore.getState()
    if (s.transactions.length === 0 && s.currency === 'USD' && detected.currency !== 'USD') {
      setCurrency(detected.currency)
    }
  }
  const regional = !currencyTouched && detected.source !== 'default' && currency === detected.currency

  const [pickerOpen, setPickerOpen] = useState(false)
  const seenPicker = useRef(false)
  if (pickerOpen) seenPicker.current = true

  // Бюджет месяца из дохода — включён по умолчанию, выключается тумблером.
  const [budgetOn, setBudgetOn] = useState(true)

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

  const close = async () => {
    // Защита от случайного выхода: спрашиваем подтверждение.
    if (!(await confirmAction(t('qs.exit_confirm')))) return
    hapticSelect()
    applyDetected()
    markCurrencyAsked()
    onDone()
  }

  const goSetup = () => {
    hapticTap()
    markCurrencyAsked()
    setStep(2)
  }

  const toggleReminders = () => {
    hapticSelect()
    const next = !reminders
    setRemindersEnabled(next)
    // Рассылка идёт по серверу. Не дошло — возвращаем тумблер: иначе он
    // показывал бы «выключено», а бот вечером всё равно написал бы.
    setReminders(next).then((ok) => {
      if (!ok) setRemindersEnabled(!next)
    })
  }

  const finish = () => {
    hapticNotify('success')
    if (budgetOn && income > 0) setMonthlyBudget(Math.round(income))
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
    setStep(3)
  }

  const addExpense = () => {
    const value = parseFloat(expAmount.replace(',', '.')) || 0
    if (value <= 0 || expenses.length >= 3) return
    hapticNotify('success')
    setExpenses((prev) => [...prev, { amount: value, categoryId: expCat }])
    setExpAmount('')
  }

  const goForecast = () => {
    if (expenses.length < MIN_EXPENSES) return
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
    setStep(4)
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
            {[1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors duration-500 ${
                  step >= i ? 'bg-brand-500' : 'bg-surface-sunken'
                }`}
              />
            ))}
          </div>
          <button
            onClick={close}
            aria-label={t('common.close')}
            className="press-icon -mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-ink-muted"
          >
            <X size={16} strokeWidth={2.4} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5">
          {/* Шаги идут вперёд — каждый следующий въезжает справа. */}
          <div key={step} className={step === 0 ? 'tab-enter' : 'tab-in-deep'}>
            {step === 0 && (
              <StepWelcome t={t} onStart={() => { hapticTap(); applyDetected(); setStep(1) }} />
            )}

            {step === 1 && (
              <StepSetup
                t={t}
                lang={lang}
                onLang={(l) => { hapticSelect(); setLang(l) }}
                currency={currency}
                regional={regional}
                onChangeCurrency={() => { hapticTap(); setPickerOpen(true) }}
                reminders={reminders}
                onReminders={toggleReminders}
                onNext={goSetup}
              />
            )}

            {step === 2 && (
              <StepIncome
                t={t}
                amount={incomeAmount}
                onAmount={setIncomeAmount}
                cats={incomeCats}
                catId={incomeCat}
                onCat={setIncomeCat}
                currency={currency}
                onCurrency={() => { hapticTap(); setPickerOpen(true) }}
                canGo={income > 0}
                onNext={goIncome}
              />
            )}

            {step === 3 && (
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

            {step === 4 && (
              <StepForecast
                t={t}
                currency={currency}
                income={income}
                spentToday={spentToday}
                projected={forecast.projected}
                safeDaily={forecast.safeDaily}
                budgetOn={budgetOn}
                onBudget={() => { hapticSelect(); setBudgetOn((v) => !v) }}
                onDone={finish}
              />
            )}
          </div>
        </div>
      </m.div>

      {/* Выбор валюты — поверх быстрого старта (он на слоях 70/80). */}
      {seenPicker.current && (
        <Suspense fallback={null}>
          <CurrencyPicker
            open={pickerOpen}
            onClose={() => setPickerOpen(false)}
            value={currency}
            onPick={(c) => {
              setCurrencyTouched(true)
              setCurrency(c)
            }}
            z={85}
          />
        </Suspense>
      )}
    </>
  )
}

function markCurrencyAsked() {
  try {
    localStorage.setItem(CURRENCY_ASKED_KEY, '1')
  } catch {
    /* приватный режим — подсказка на Главной просто не узнает, что спрашивали */
  }
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

/* ---------- Шаг 1: настройки ---------- */

/**
 * Валюта — крупно, с флагом и словами «подобрали по региону»: её видно, и её
 * легко поменять. Язык и напоминания — здесь же, потому что это ровно те
 * настройки, которые иначе человек нашёл бы только через неделю в Настройках
 * (или не нашёл бы: напоминание, о котором не предупредили, выглядит спамом).
 */
function StepSetup({
  t, lang, onLang, currency, regional, onChangeCurrency, reminders, onReminders, onNext,
}: {
  t: TFunc
  lang: Lang
  onLang: (l: Lang) => void
  currency: Currency
  regional: boolean
  onChangeCurrency: () => void
  reminders: boolean
  onReminders: () => void
  onNext: () => void
}) {
  return (
    <div className="pb-2">
      <StepHead title={t('qs.setup_title')} sub={t('qs.setup_sub')} />

      <div className="caption mt-6 text-ink-subtle">{t('qs.setup_currency')}</div>
      <button
        type="button"
        onClick={onChangeCurrency}
        className="press-soft mt-2 flex w-full items-center gap-3.5 rounded-3xl bg-surface-sunken px-4 py-3.5 text-left"
      >
        <CurrencyFlag code={currency} size={40} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[17px] font-bold leading-tight text-ink">
            {currencyName(currency, lang)}
          </span>
          {/* Определили сами — так и говорим; выбрал человек — символ и код. */}
          <span className="caption mt-1 block truncate text-ink-subtle">
            {regional ? t('qs.setup_detected') : currencyTag(currency)}
          </span>
        </span>
        <span className="shrink-0 rounded-full bg-surface-raised px-3 py-1.5 text-[13px] font-bold text-ink shadow-soft">
          {t('cur.change')}
        </span>
      </button>

      <div className="caption mt-5 text-ink-subtle">{t('qs.setup_language')}</div>
      <SegTrack active={lang} className="mt-2">
        {LANGS.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => onLang(l.id)}
            className={`seg-item py-1.5 text-[13px] ${lang === l.id ? 'seg-on' : ''}`}
          >
            {l.label}
          </button>
        ))}
      </SegTrack>

      <button
        type="button"
        role="switch"
        aria-checked={reminders}
        onClick={onReminders}
        className="mt-5 flex w-full items-center gap-3 border-y border-hairline py-3.5 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-ink">{t('qs.setup_reminders')}</span>
          <span className="caption mt-0.5 block leading-snug text-ink-subtle">{t('qs.setup_reminders_hint')}</span>
        </span>
        <Toggle on={reminders} />
      </button>

      <button onClick={onNext} className={`${PRIMARY_BTN} mt-6`}>
        {t('qs.next')} <ArrowRight size={17} strokeWidth={2.6} />
      </button>
    </div>
  )
}

/** «₴ · UAH», а у валют без своего знака — просто «AED». */
function currencyTag(code: Currency): string {
  const symbol = getCurrency(code).symbol
  return symbol === code ? code : `${symbol} · ${code}`
}

/* ---------- Шаг 2: доход ---------- */

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
  /** Тап по валюте у поля — сменить её, не возвращаясь на шаг назад. */
  onCurrency: () => void
  canGo: boolean
  onNext: () => void
}) {
  return (
    <div className="pb-2">
      <StepHead title={t('qs.income_title')} sub={t('qs.income_sub')} />

      <AmountField value={amount} onChange={onAmount} currency={currency} onCurrency={onCurrency} autoFocus />

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
  const enough = items.length >= MIN_EXPENSES
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
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-subtle active:text-expense-deep dark:active:text-expense-soft"
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
  t, currency, income, spentToday, projected, safeDaily, budgetOn, onBudget, onDone,
}: {
  t: TFunc
  currency: Currency
  income: number
  spentToday: number
  projected: number
  safeDaily: number
  budgetOn: boolean
  onBudget: () => void
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

      {/* Доход становится бюджетом месяца: из него Главная и бот считают,
          сколько можно потратить сегодня. Включено — но видно и выключается. */}
      <button
        type="button"
        role="switch"
        aria-checked={budgetOn}
        onClick={onBudget}
        className="mt-4 flex w-full items-center gap-3 border-y border-hairline py-3.5 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-ink">
            {t('qs.budget_title', { sum: formatMoney(Math.round(income), currency) })}
          </span>
          <span className="caption mt-0.5 block leading-snug text-ink-subtle">{t('qs.budget_hint')}</span>
        </span>
        <Toggle on={budgetOn} />
      </button>

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
  value, onChange, currency, onCurrency, autoFocus,
}: {
  value: string
  onChange: (v: string) => void
  currency: Currency
  onCurrency?: () => void
  autoFocus?: boolean
}) {
  const symbol = getCurrency(currency).symbol
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
      {onCurrency ? (
        <button
          type="button"
          onClick={onCurrency}
          aria-label={symbol}
          className="press flex shrink-0 items-center gap-1.5 rounded-full bg-surface-raised py-1 pl-1 pr-2.5 text-[15px] font-bold text-ink shadow-soft"
        >
          <CurrencyFlag code={currency} size={22} />
          {symbol}
        </button>
      ) : (
        <span className="shrink-0 text-lg font-semibold text-ink-subtle">{symbol}</span>
      )}
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
