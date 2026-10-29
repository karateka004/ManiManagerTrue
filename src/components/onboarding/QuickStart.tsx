import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { m } from 'framer-motion'
import { X, ArrowRight, Plus } from 'lucide-react'
import { useStore, selectCategoriesByKind, type Transaction } from '../../store/transactions'
import { CategoryIcon } from '../icons/CategoryIcon'
import { getCurrency, type Currency } from '../../lib/currencies'
import { currencyName } from '../../lib/currencyInfo'
import { detectCurrency } from '../../lib/currencyDetect'
import { formatMoney, dayjs } from '../../lib/format'
import { reportQuickStart, setReminders } from '../../lib/api'
import { QS_KEY } from '../../lib/introKeys'
import { CURRENCY_ASKED_KEY } from '../../lib/currencyAsked'
import { Money } from '../ui/Money'
import { SegTrack } from '../ui/SegTrack'
import { Toggle } from '../ui/Toggle'
import { CurrencyFlag } from '../ui/CurrencyFlag'
import {
  botCanWrite,
  canRequestBotWrite,
  confirmAction,
  hapticNotify,
  hapticSelect,
  hapticTap,
  requestBotWrite,
  tg,
} from '../../lib/telegram'
import { useCatName, useT, type Lang, type TFunc } from '../../lib/i18n'
import { UNMASK, clarityEvent, clarityKeep, clarityTag } from '../../lib/clarity'

// Выбор валюты с поиском — общий ленивый чанк с Настройками и шторкой операции.
const CurrencyPicker = lazy(() => import('../CurrencyPicker').then((mod) => ({ default: mod.CurrencyPicker })))

/**
 * Быстрый старт для новичка: до первой записи — пара касаний.
 *   1) настройки (валюта, язык, напоминания) → 2) первая трата →
 *   3) доход (можно пропустить) → 4) итог: прогноз на месяц и бюджет, если
 *   есть доход; сколько потрачено, если только траты.
 *
 * 2.8: раньше без дохода дальше было не пройти, а «Показать результат» не
 * нажимался, пока набранную трату не добавили отдельной кнопкой, — выйти
 * можно было только крестиком, и на этих экранах терялась большая часть
 * новичков. Теперь трата идёт раньше дохода (сколько получаешь — вопрос
 * личный, его задают, когда польза уже видна), «Дальше» записывает набранную
 * сумму сам, и трату, и доход можно пропустить, а итог подстраивается под то,
 * что есть. Записанное сразу ложится в стор, а шаг с id записей — в koshel:qs:
 * кто закрыл приложение посреди быстрого старта (не крестиком), продолжает с
 * того же места. Шаги уходят в админку (reportQuickStart, без сумм).
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

type Cat = { id: string; name: string; icon: string; color: string }

const PRIMARY_BTN =
  'flex w-full items-center justify-center gap-2 rounded-full bg-brand-500 py-3.5 text-[15px] font-bold text-white transition active:scale-[0.99] disabled:opacity-40'

const SKIP_BTN = 'mt-2 w-full py-2.5 text-center text-[14px] font-semibold text-ink-muted transition active:opacity-60'

/** Шаги по порядку. Номера — те же, что у воркера (worker/src/quickstart.ts, QS_STEPS). */
const STEP = { welcome: 0, setup: 1, expense: 2, income: 3, result: 4 } as const
/** Имена шагов для событий Clarity: onboarding_<шаг>, выход — onboarding_exit + метка onboarding_exit_at. */
const STEP_NAMES = ['welcome', 'setup', 'expenses', 'income', 'result'] as const

/** Трат в быстром старте — не больше трёх: дальше это уже обычная запись. */
const MAX_EXPENSES = 3

/** Сумма из поля: запятая как точка; ноль, минус и нечисловое — 0; абсурдно большое — тоже. */
function parseAmount(s: string): number {
  const v = parseFloat(s.replace(',', '.'))
  return Number.isFinite(v) && v > 0 && v <= 1e12 ? v : 0
}

/** Незаконченный быстрый старт (QS_KEY): шаг и id записанных в нём операций. */
interface Saved {
  s: number
  ids: string[]
  inc: string | null
  /** Тумблер «бюджет из дохода» на итоге. */
  b?: boolean
}
function readSaved(): Saved | null {
  try {
    const v = JSON.parse(localStorage.getItem(QS_KEY) ?? 'null') as Partial<Saved> | null
    if (!v || typeof v.s !== 'number' || !(v.s >= STEP.welcome && v.s <= STEP.result)) return null
    // id, которых в сторе нет (отложенная запись не успела до закрытия), — выбрасываем:
    // иначе они занимали бы места трат и блокировали валюту.
    const have = new Set(useStore.getState().transactions.map((x) => x.id))
    return {
      s: Math.floor(v.s),
      ids: Array.isArray(v.ids) ? v.ids.filter((x): x is string => typeof x === 'string' && have.has(x)).slice(0, MAX_EXPENSES) : [],
      inc: typeof v.inc === 'string' && have.has(v.inc) ? v.inc : null,
      b: v.b !== false,
    }
  } catch {
    return null
  }
}
function writeSaved(v: Saved) {
  try {
    localStorage.setItem(QS_KEY, JSON.stringify(v))
  } catch {
    /* приватный режим — продолжить с места не выйдет, начнём сначала */
  }
}
function clearSaved() {
  try {
    localStorage.removeItem(QS_KEY)
  } catch {
    /* нечего чистить */
  }
}

export function QuickStart({ onDone }: { onDone: () => void }) {
  const t = useT()
  // Продолжаем с того места, где закрыли приложение (QS_KEY), иначе с начала.
  const [saved] = useState(readSaved)
  const [step, setStep] = useState<number>(saved?.s ?? STEP.welcome)
  // id операций, записанных в быстром старте: траты по порядку и доход.
  const [ids, setIds] = useState<string[]>(saved?.ids ?? [])
  const [incId, setIncId] = useState<string | null>(saved?.inc ?? null)
  // Где уходят из быстрого старта — главная потеря воронки: каждую такую
  // сессию держим в записях и метим шаги.
  useEffect(() => {
    clarityTag('onboarding', 'yes')
    clarityKeep('onboarding')
  }, [])
  useEffect(() => clarityEvent('onboarding_' + STEP_NAMES[step]), [step])
  // Бюджет месяца из дохода — включён по умолчанию, выключается тумблером.
  const [budgetOn, setBudgetOn] = useState(saved?.b ?? true)
  // Место — в localStorage (не в стор: сохранённый стор значит «старый
  // пользователь»), шаг — в админку. С приветствия место не пишем: новичку и
  // так покажем, а вернувшийся на новое устройство (облако подтянулось) не
  // должен застревать в быстром старте при каждом запуске.
  useEffect(() => {
    if (step > STEP.welcome) writeSaved({ s: step, ids, inc: incId, b: budgetOn })
  }, [step, ids, incId, budgetOn])
  // Кнопки соседних шагов стоят в одном месте: двойной тап проскакивал шаг.
  // Нажатия в первые 450 мс после смены шага не принимаем.
  const stepAt = useRef(performance.now())
  const settled = () => performance.now() - stepAt.current > 450
  const go = (next: number) => {
    stepAt.current = performance.now()
    setStep(next)
  }
  const progress = useRef({ e: 0, i: false })
  useEffect(() => reportQuickStart({ s: step, ...progress.current }), [step])

  const currency = useStore((s) => s.currency)
  const setCurrency = useStore((s) => s.setCurrency)
  const lang = useStore((s) => s.lang)
  const setLang = useStore((s) => s.setLang)
  const reminders = useStore((s) => s.remindersEnabled)
  const setRemindersEnabled = useStore((s) => s.setRemindersEnabled)
  const setMonthlyBudget = useStore((s) => s.setMonthlyBudget)
  const addTransaction = useStore((s) => s.addTransaction)
  const removeTransaction = useStore((s) => s.removeTransaction)
  const incomeCats = useStore((s) => selectCategoriesByKind(s, 'income'))
  const expenseCats = useStore((s) => selectCategoriesByKind(s, 'expense'))
  // Записанное в быстром старте — из стора по id: после перезапуска (QS_KEY)
  // список и итог те же. Удалённое где-то ещё просто пропадает из списка.
  const transactions = useStore((s) => s.transactions)
  const expenses = useMemo(
    () => ids.map((id) => transactions.find((x) => x.id === id)).filter((x): x is Transaction => !!x),
    [ids, transactions],
  )
  const incomeTx = useMemo(() => (incId ? transactions.find((x) => x.id === incId) ?? null : null), [incId, transactions])
  progress.current = { e: expenses.length, i: !!incomeTx }

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


  // Шаг траты: сумма в поле ещё не записана.
  const [expAmount, setExpAmount] = useState('')
  const [expCat, setExpCat] = useState('food')
  // Шаг дохода.
  const [incomeAmount, setIncomeAmount] = useState('')
  const [incomeCat, setIncomeCat] = useState('salary')

  const expDraft = parseAmount(expAmount)
  const incomeDraft = parseAmount(incomeAmount)
  // Итог считаем в основной валюте: запись в другой (валюту сменили уже после
  // неё) в одну сумму с этой не складываем.
  const spentToday = expenses.reduce((sum, e) => sum + ((e.currency ?? currency) === currency ? e.amount : 0), 0)
  const income = incomeTx && (incomeTx.currency ?? currency) === currency ? incomeTx.amount : 0
  // Валюту меняем, пока в быстром старте ничего не записано: иначе первая
  // запись осталась бы в прежней валюте, а итог смешал бы две.
  const canChangeCurrency = expenses.length === 0 && !incomeTx

  const close = async () => {
    // Защита от случайного выхода: спрашиваем подтверждение.
    if (!(await confirmAction(t('qs.exit_confirm')))) return
    clarityEvent('onboarding_exit')
    clarityTag('onboarding_exit_at', STEP_NAMES[step])
    reportQuickStart({ s: step, ...progress.current, x: step })
    hapticSelect()
    applyDetected()
    markCurrencyAsked()
    clearSaved()
    onDone()
  }

  const goSetup = async () => {
    if (!settled()) return
    hapticTap()
    markCurrencyAsked()
    // Напоминания включены, а писать боту нельзя (открыли по ссылке, Start не
    // нажимали) — Telegram спросит разрешение, пока на экране тумблер, который
    // это объясняет. Шаг меняем ПОСЛЕ ответа: на следующем в фокусе поле дохода,
    // и клавиатура открылась бы вместе с системным окном. Без разрешения бот не
    // напишет ни разу, поэтому отказ честно выключает тумблер.
    if (reminders && tg.isInTelegram && !botCanWrite() && canRequestBotWrite()) {
      if (asking.current) return
      asking.current = true
      const answer = requestBotWrite().then((granted) => {
        clarityEvent(granted ? 'bot_write_yes' : 'bot_write_no')
        if (granted) void setReminders(true)
        else setRemindersEnabled(false)
      })
      // Ответ Telegram может задержаться (свернули окно) — дальше через 20 с, а
      // тумблер поправит сам ответ, когда придёт.
      await Promise.race([answer, new Promise<void>((r) => setTimeout(r, 20_000))])
      asking.current = false
    }
    go(STEP.expense)
  }

  // Пока сервер не ответил, второе нажатие не принимаем: при двойном тапе без
  // сети откат первого запроса переписал бы второй, и тумблер разошёлся бы с
  // сервером.
  const remindersBusy = useRef(false)
  const asking = useRef(false)
  const toggleReminders = () => {
    if (remindersBusy.current) return
    remindersBusy.current = true
    hapticSelect()
    const next = !reminders
    setRemindersEnabled(next)
    // Рассылка идёт по серверу. Не дошло — возвращаем тумблер: иначе он
    // показывал бы «выключено», а бот вечером всё равно написал бы.
    setReminders(next).then((ok) => {
      remindersBusy.current = false
      if (!ok) setRemindersEnabled(!next)
    })
  }

  // Быстрый старт видит и тот, кто вернулся на новое устройство: облако за это
  // время подтянулось, и его бюджет месяца затирать доходом из быстрого старта
  // нельзя. Предлагаем бюджет только тем, у кого его нет.
  const hasBudget = useStore((s) => s.monthlyBudget > 0)
  const finish = () => {
    if (!settled()) return
    clarityEvent('onboarding_done')
    reportQuickStart({ s: STEP.result, ...progress.current, d: true })
    hapticNotify('success')
    if (budgetOn && income > 0 && useStore.getState().monthlyBudget === 0) setMonthlyBudget(Math.round(income))
    clearSaved()
    onDone()
  }

  /** Трата из поля — сразу в стор (первая запись не теряется, даже если закроют приложение). */
  const recordExpense = (): boolean => {
    if (expDraft <= 0 || expenses.length >= MAX_EXPENSES) return false
    const id = addTransaction({
      type: 'expense',
      amount: expDraft,
      categoryId: expCat,
      date: new Date().toISOString(),
      note: '',
      currency,
    })
    setIds((prev) => [...prev, id])
    setExpAmount('')
    return true
  }
  const addExpense = () => {
    if (recordExpense()) hapticNotify('success')
  }
  const removeExpense = (id: string) => {
    hapticSelect()
    removeTransaction(id)
    setIds((prev) => prev.filter((x) => x !== id))
  }
  // «Дальше» записывает и набранное, но не добавленное: раньше кнопка ждала
  // отдельного «Добавить трату», и с суммой в поле человек упирался в серую кнопку.
  const goIncome = () => {
    if (!settled()) return
    const recorded = recordExpense()
    if (!recorded && expenses.length === 0) return
    hapticTap()
    go(STEP.income)
  }
  const skipExpense = () => {
    if (!settled()) return
    hapticSelect()
    clarityEvent('onboarding_skip_expense')
    go(STEP.income)
  }

  const goResult = () => {
    if (!settled() || incomeDraft <= 0) return
    hapticTap()
    const id = addTransaction({
      type: 'income',
      amount: incomeDraft,
      categoryId: incomeCat,
      date: new Date().toISOString(),
      note: '',
      currency,
    })
    setIncId(id)
    go(STEP.result)
  }
  const skipIncome = () => {
    if (!settled()) return
    hapticSelect()
    clarityEvent('onboarding_skip_income')
    go(STEP.result)
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
          <div className="flex flex-1 gap-1.5" role="progressbar" aria-valuemin={0} aria-valuemax={4} aria-valuenow={step} aria-label={t('qs.progress', { n: Math.max(1, step) })}>
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
            {step === STEP.welcome && (
              <StepWelcome t={t} onStart={() => { if (!settled()) return; hapticTap(); applyDetected(); go(STEP.setup) }} />
            )}

            {step === STEP.setup && (
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

            {step === STEP.expense && (
              <StepExpenses
                t={t}
                amount={expAmount}
                onAmount={setExpAmount}
                cats={expenseCats}
                catId={expCat}
                onCat={setExpCat}
                currency={currency}
                onCurrency={canChangeCurrency ? () => { hapticTap(); setPickerOpen(true) } : undefined}
                items={expenses}
                canAdd={expDraft > 0 && expenses.length < MAX_EXPENSES}
                canNext={expDraft > 0 || expenses.length > 0}
                onAdd={addExpense}
                onRemove={removeExpense}
                onNext={goIncome}
                onSkip={skipExpense}
              />
            )}

            {step === STEP.income && (
              <StepIncome
                t={t}
                amount={incomeAmount}
                onAmount={setIncomeAmount}
                cats={incomeCats}
                catId={incomeCat}
                onCat={setIncomeCat}
                currency={currency}
                onCurrency={canChangeCurrency ? () => { hapticTap(); setPickerOpen(true) } : undefined}
                canGo={incomeDraft > 0}
                onNext={goResult}
                onSkip={skipIncome}
              />
            )}

            {step === STEP.result && (
              <StepResult
                t={t}
                currency={currency}
                income={income}
                spentToday={spentToday}
                recorded={expenses.length > 0 || !!incomeTx}
                budgetOn={budgetOn}
                hasBudget={hasBudget}
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
      <h2 className="text-[26px] font-bold leading-[1.15] tracking-tight text-ink" {...UNMASK}>{title}</h2>
      {sub && <p className="mt-2 text-[15px] leading-relaxed text-ink-muted" {...UNMASK}>{sub}</p>}
    </>
  )
}

/* ---------- Шаг 0: приветствие ---------- */

function StepWelcome({ t, onStart }: { t: TFunc; onStart: () => void }) {
  return (
    <div className="pb-2" {...UNMASK}>
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
          <span className="caption mt-0.5 block leading-snug text-ink-subtle">
            {t(reminders && tg.isInTelegram && !botCanWrite() && canRequestBotWrite() ? 'qs.setup_reminders_hint_ask' : 'qs.setup_reminders_hint')}
          </span>
        </span>
        <Toggle on={reminders} />
      </button>

      <button onClick={onNext} className={`${PRIMARY_BTN} mt-6`} {...UNMASK}>
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

/* ---------- Шаг 2: первая трата ---------- */

function StepExpenses({
  t, amount, onAmount, cats, catId, onCat, currency, onCurrency, items, canAdd, canNext, onAdd, onRemove, onNext, onSkip,
}: {
  t: TFunc
  amount: string
  onAmount: (v: string) => void
  cats: Cat[]
  catId: string
  onCat: (id: string) => void
  currency: Currency
  /** Нет — валюту уже не меняем (в быстром старте есть записи). */
  onCurrency?: () => void
  /** Записанные в быстром старте траты. */
  items: Transaction[]
  canAdd: boolean
  canNext: boolean
  onAdd: () => void
  onRemove: (id: string) => void
  onNext: () => void
  onSkip: () => void
}) {
  const lang = useStore((s) => s.lang)
  const catById = (id: string) => cats.find((c) => c.id === id)
  const catName = useCatName()
  const full = items.length >= MAX_EXPENSES

  return (
    <div className="pb-2">
      <StepHead title={t('qs.expense_title')} sub={t('qs.expense_sub')} />

      {!full && (
        <>
          <AmountField
            value={amount}
            onChange={onAmount}
            currency={currency}
            onCurrency={onCurrency}
            currencyLabel={`${currencyName(currency, lang)} — ${t('cur.change').toLowerCase()}`}
            onEnter={onNext}
          />
          <CategoryChips cats={cats} selected={catId} onSelect={onCat} />
          {/* Ещё трата — записать и остаться на шаге. Одну хватает и «Дальше»:
              он записывает набранную сумму сам. */}
          <button
            onClick={onAdd}
            disabled={!canAdd}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-surface-sunken py-3 text-[15px] font-bold text-ink transition active:scale-[0.99] disabled:opacity-40"
          >
            <Plus size={17} strokeWidth={2.6} /> {t('qs.add_expense')}
          </button>
        </>
      )}

      {/* Уже записанные траты — список с линиями. Значок в цвете категории
          оставлен: по этому цвету её потом узнают на Главной и в Аналитике. */}
      {items.length > 0 && (
        <ul className="mt-4 border-y border-hairline">
          {items.map((e) => {
            const c = catById(e.categoryId)
            return (
              <li key={e.id} className="flex items-center gap-3 border-t border-hairline py-2.5 first:border-t-0">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: (c?.color ?? '#888') + '22', color: c?.color ?? '#888' }}
                >
                  <CategoryIcon id={c?.icon ?? 'other'} size={16} />
                </span>
                <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink">{c && catName(c.id, c.name)}</span>
                <span className="text-[15px] font-semibold tabular-nums text-ink">−{formatMoney(e.amount, e.currency ?? currency)}</span>
                <button
                  onClick={() => onRemove(e.id)}
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

      {items.length > 0 && (
        <div className="caption mt-4 text-center tabular-nums text-ink-subtle">
          {t('qs.expense_counter', { n: items.length })}
        </div>
      )}

      <button onClick={onNext} disabled={!canNext} className={`${PRIMARY_BTN} mt-4`} {...UNMASK}>
        {t('qs.next')} <ArrowRight size={17} strokeWidth={2.6} />
      </button>
      {/* Трат сегодня не было — дальше без них, а не только крестиком. */}
      {!canNext && (
        <button type="button" onClick={onSkip} className={SKIP_BTN} {...UNMASK}>
          {t('qs.expense_skip')}
        </button>
      )}
    </div>
  )
}

/* ---------- Шаг 3: доход (можно пропустить) ---------- */

function StepIncome({
  t, amount, onAmount, cats, catId, onCat, currency, onCurrency, canGo, onNext, onSkip,
}: {
  t: TFunc
  amount: string
  onAmount: (v: string) => void
  cats: Cat[]
  catId: string
  onCat: (id: string) => void
  currency: Currency
  /** Тап по валюте у поля — сменить её, не возвращаясь на шаг назад (пока ничего не записано). */
  onCurrency?: () => void
  canGo: boolean
  onNext: () => void
  onSkip: () => void
}) {
  const lang = useStore((s) => s.lang)
  return (
    <div className="pb-2">
      <StepHead title={t('qs.income_title')} sub={t('qs.income_sub')} />

      <AmountField
        value={amount}
        onChange={onAmount}
        currency={currency}
        onCurrency={onCurrency}
        currencyLabel={`${currencyName(currency, lang)} — ${t('cur.change').toLowerCase()}`}
        onEnter={onNext}
      />

      <div className="caption mt-5 text-ink-subtle">{t('qs.income_source')}</div>
      <CategoryChips cats={cats} selected={catId} onSelect={onCat} />

      <button onClick={onNext} disabled={!canGo} className={`${PRIMARY_BTN} mt-6`} {...UNMASK}>
        {t('qs.next')} <ArrowRight size={17} strokeWidth={2.6} />
      </button>
      <button type="button" onClick={onSkip} className={SKIP_BTN} {...UNMASK}>
        {t('qs.skip')}
      </button>
    </div>
  )
}

/* ---------- Шаг 4: итог ---------- */

/**
 * Итог под то, что записали:
 *   доход и траты — прогноз на месяц и дневная планка;
 *   только доход — сколько можно тратить в день;
 *   только траты — сколько потрачено и как получить дневную планку;
 *   ничего — как записывать дальше.
 * Бюджет из дохода предлагаем, только если доход есть.
 */
function StepResult({
  t, currency, income, spentToday, recorded, budgetOn, hasBudget, onBudget, onDone,
}: {
  t: TFunc
  currency: Currency
  income: number
  spentToday: number
  /** В быстром старте что-то записано (подпись «операции уже сохранены»). */
  recorded: boolean
  budgetOn: boolean
  /** Бюджет уже задан (облако вернувшегося человека) — не предлагаем. */
  hasBudget: boolean
  onBudget: () => void
  onDone: () => void
}) {
  // Как на Главной (selectDailyAllowance): бюджет делится на оставшиеся дни
  // месяца, сегодняшний — тоже. Иначе через секунду там была бы другая цифра.
  const daysLeft = Math.max(1, dayjs().daysInMonth() - dayjs().date() + 1)
  const safeDaily = income > 0 ? income / daysLeft : 0
  const projected = income - spentToday * daysLeft
  const positive = projected >= 0
  const hasIncome = income > 0
  const hasSpent = spentToday > 0

  if (!hasIncome && !hasSpent) {
    return (
      <div className="pb-2">
        <StepHead title={t('qs.done_title')} sub={t('qs.done_sub')} />
        <button onClick={onDone} className={`${PRIMARY_BTN} mt-6`} {...UNMASK}>
          {t('qs.finish')}
        </button>
      </div>
    )
  }

  return (
    <div className="pb-2">
      <StepHead title={t('qs.result_title')} />

      {/* Главная цифра — на той же глубокой поверхности, что баланс на Главной.
          Минус говорит подпись и цвет самого числа, а не красная заливка всей
          карточки: тревожная плашка во весь экран на первой минуте пугала. */}
      <div className="hero-surface mt-5 rounded-4xl p-5">
        <div className="caption text-white/70">
          {hasIncome && hasSpent
            ? positive ? t('qs.result_left_label') : t('qs.result_short_label')
            : hasIncome ? t('qs.daily_label') : t('qs.spent_today')}
        </div>
        <div className={`mt-1.5 text-display-lg font-bold ${hasIncome && hasSpent && !positive ? 'text-expense-soft' : ''}`}>
          <Money value={hasIncome && hasSpent ? Math.abs(projected) : hasIncome ? Math.round(safeDaily) : spentToday} currency={currency} />
        </div>
        <div className="caption mt-1.5 leading-snug text-white/70">
          {hasIncome && hasSpent ? t('qs.result_hint') : hasIncome ? t('qs.daily_hint', { n: daysLeft }) : t('qs.no_income_hint')}
        </div>
      </div>

      {/* Расшифровка, чтобы цифра не выглядела магией */}
      {hasIncome && (
        <dl className="mt-4 border-y border-hairline">
          <div className="flex items-baseline justify-between gap-3 py-3">
            <dt className="text-[15px] text-ink-muted">{t('common.income')}</dt>
            <dd className="text-[15px] font-semibold tabular-nums text-ink">+{formatMoney(income, currency)}</dd>
          </div>
          {hasSpent && (
            <div className="flex items-baseline justify-between gap-3 border-t border-hairline py-3">
              <dt className="text-[15px] text-ink-muted">{t('qs.spent_today')}</dt>
              <dd className="text-[15px] font-semibold tabular-nums text-ink">−{formatMoney(spentToday, currency)}</dd>
            </div>
          )}
        </dl>
      )}

      {hasIncome && (
        <p className="mt-4 text-[14px] leading-relaxed text-ink-muted">
          {hasSpent
            ? t('qs.result_advice', { sum: formatMoney(Math.round(safeDaily), currency) })
            : t('qs.daily_advice')}
        </p>
      )}

      {/* Доход становится бюджетом месяца: из него Главная и бот считают,
          сколько можно потратить сегодня. Включено — но видно и выключается. */}
      {hasIncome && !hasBudget && (
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
      )}

      <button onClick={onDone} className={`${PRIMARY_BTN} mt-6`} {...UNMASK}>
        {t('qs.finish')}
      </button>
      <div className="caption mt-3 text-center leading-snug text-ink-subtle">
        {t(recorded ? 'qs.finish_hint' : 'qs.done_sub')}
      </div>
    </div>
  )
}

/* ---------- Общие мелочи ---------- */

/** Крупное поле суммы с символом валюты. */
/**
 * Без автофокуса: открытая сразу клавиатура закрывала «Дальше» и «Пропустить» —
 * тот самый тупик. Ввод — касанием поля, «Готово»/Enter клавиатуры = «Дальше».
 */
function AmountField({
  value, onChange, currency, onCurrency, currencyLabel, onEnter,
}: {
  value: string
  onChange: (v: string) => void
  currency: Currency
  onCurrency?: () => void
  /** Для экранного диктора: голый «₸» ничего не говорит. */
  currencyLabel?: string
  onEnter?: () => void
}) {
  const symbol = getCurrency(currency).symbol
  return (
    <div className="mt-5 flex items-center gap-2 rounded-3xl bg-surface-sunken px-4 py-3.5">
      <input
        type="number"
        inputMode="decimal"
        min={0}
        enterKeyHint="next"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onEnter) {
            e.preventDefault()
            ;(e.target as HTMLInputElement).blur()
            onEnter()
          }
        }}
        placeholder="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent text-[28px] font-bold tabular-nums text-ink placeholder:text-ink-subtle focus:outline-none"
      />
      {onCurrency ? (
        <button
          type="button"
          onClick={onCurrency}
          aria-label={currencyLabel ?? symbol}
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
