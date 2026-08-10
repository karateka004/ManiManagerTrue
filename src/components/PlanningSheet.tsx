import { useMemo, useState } from 'react'
import { m, AnimatePresence } from 'framer-motion'
import { Target, Plus, Trash2, X, Wallet, SlidersHorizontal, Link2, Wand2 } from 'lucide-react'
import {
  useStore,
  selectCategoriesByKind,
  selectCurrentMonthExpense,
  selectCurrentMonthExpenseByCategory,
  selectAvgMonthlyExpenseByCategory,
  selectNetBalanceByCurrency,
  selectAnalyticsCurrency,
  selectAccounts,
  type Goal,
} from '../store/transactions'
import { getCurrency, type Currency } from '../lib/currencies'
import { formatMoney, dayjs } from '../lib/format'
import { CategoryIcon } from '../components/icons/CategoryIcon'
import { hapticSelect, hapticTap, hapticNotify } from '../lib/telegram'
import { useT, type TFunc } from '../lib/i18n'

interface Props {
  open: boolean
  onClose: () => void
}

type Tab = 'budget' | 'limits' | 'goals'

export function PlanningSheet({ open, onClose }: Props) {
  const t = useT()
  const [tab, setTab] = useState<Tab>('budget')

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
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92vh] flex-col rounded-t-5xl bg-surface-raised shadow-raised"
            style={{ paddingBottom: 'var(--safe-bottom)' }}
          >
            <div className="flex justify-center pb-1 pt-3">
              <div className="h-1.5 w-12 rounded-full bg-surface-sunken" />
            </div>

            <div className="flex items-center justify-between px-6 pb-2 pt-1">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                  <Target size={20} strokeWidth={2} />
                </span>
                <div className="leading-tight">
                  <div className="text-base font-bold text-ink">{t('plan.title')}</div>
                  <div className="text-[11px] text-ink-subtle">{t('plan.subtitle')}</div>
                </div>
              </div>
              <button onClick={onClose} className="text-ink-subtle active:text-ink-muted" aria-label={t('common.close')}>
                <X size={22} />
              </button>
            </div>

            {/* Вкладки */}
            <div className="px-4 pb-2">
              <div className="flex rounded-2xl bg-surface-sunken/60 p-1">
                <TabButton active={tab === 'budget'} onClick={() => { setTab('budget'); hapticSelect() }}>
                  <Wallet size={15} strokeWidth={2.4} /> {t('plan.tab_budget')}
                </TabButton>
                <TabButton active={tab === 'limits'} onClick={() => { setTab('limits'); hapticSelect() }}>
                  <SlidersHorizontal size={15} strokeWidth={2.4} /> {t('plan.tab_limits')}
                </TabButton>
                <TabButton active={tab === 'goals'} onClick={() => { setTab('goals'); hapticSelect() }}>
                  <Target size={15} strokeWidth={2.4} /> {t('plan.tab_goals')}
                </TabButton>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
              {tab === 'budget' && <BudgetTab t={t} />}
              {tab === 'limits' && <LimitsTab t={t} />}
              {tab === 'goals' && <GoalsTab t={t} />}
            </div>
          </m.div>
        </>
      )}
    </AnimatePresence>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-[13px] font-semibold transition-colors ${
        active ? 'bg-surface-raised text-ink shadow-sm' : 'text-ink-subtle active:text-ink-muted'
      }`}
    >
      {children}
    </button>
  )
}

/**
 * Сколько дней в текущем месяце ещё осталось, включая сегодня (минимум 1).
 * Основа подсказок «можно тратить в день» и прогноза до конца месяца.
 */
function daysLeftInMonth(): number {
  const now = dayjs()
  return Math.max(1, now.daysInMonth() - now.date() + 1)
}

/** Сколько дней месяца уже прошло, включая сегодня (минимум 1) — для прогноза темпа. */
function daysPassedInMonth(): number {
  return Math.max(1, dayjs().date())
}

/* ---------- Бюджет ---------- */

function BudgetTab({ t }: { t: TFunc }) {
  const currency = useStore((s) => s.currency)
  const budget = useStore((s) => s.monthlyBudget)
  const setBudget = useStore((s) => s.setMonthlyBudget)
  const spent = useStore(selectCurrentMonthExpense)
  const budgets = useStore((s) => s.budgets)
  const [draft, setDraft] = useState(budget > 0 ? String(budget) : '')

  // Сумма всех заданных лимитов — показываем, сколько бюджета уже расписано.
  const limitsTotal = useMemo(
    () => Object.values(budgets).reduce((sum, v) => sum + (v > 0 ? v : 0), 0),
    [budgets],
  )

  const commit = () => {
    const n = parseFloat(draft.replace(',', '.'))
    const safe = Number.isFinite(n) && n > 0 ? n : 0
    setBudget(safe)
    setDraft(safe > 0 ? String(safe) : '')
  }

  const ratio = budget > 0 ? spent / budget : 0
  const over = budget > 0 && spent > budget
  const left = Math.max(0, budget - spent)
  const sym = getCurrency(currency).symbol
  const barColor = over ? 'bg-expense' : ratio >= 0.8 ? 'bg-amber-400' : 'bg-brand-500'

  // Темп трат: сколько можно тратить в день до конца месяца и куда придём при
  // текущем среднедневном расходе. Это главный «навигационный» сигнал бюджета.
  const perDay = left / daysLeftInMonth()
  const forecast = (spent / daysPassedInMonth()) * dayjs().daysInMonth()
  const forecastOver = budget > 0 && forecast > budget

  return (
    <div>
      <div className="mb-1 px-1 text-xs font-bold uppercase tracking-wider text-ink-subtle">{t('plan.budget_title')}</div>
      <div className="card p-3">
        <div className="flex items-center gap-2 rounded-2xl bg-surface-sunken px-3 py-2.5">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            placeholder={t('plan.budget_placeholder')}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            className="flex-1 bg-transparent text-base font-bold text-ink placeholder:text-sm placeholder:font-normal placeholder:text-ink-subtle focus:outline-none tabular"
          />
          <span className="text-sm text-ink-subtle">{sym}</span>
        </div>

        {budget > 0 ? (
          <div className="mt-3">
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-sunken">
              <m.div
                className={`h-full rounded-full ${barColor}`}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[12px]">
              <span className="text-ink-subtle">
                {t('plan.budget_spent')}:{' '}
                <span className="font-semibold text-ink">{formatMoney(spent, currency)}</span>
              </span>
              {over ? (
                <span className="font-semibold text-expense-deep">
                  {t('plan.budget_over')}: {formatMoney(spent - budget, currency)}
                </span>
              ) : (
                <span className="font-semibold text-income-deep">
                  {t('plan.budget_left')}: {formatMoney(left, currency)}
                </span>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-2 px-1 text-[11px] leading-relaxed text-ink-subtle">{t('plan.budget_hint')}</p>
        )}
      </div>

      {budget > 0 && (
        <>
          {/* Темп трат: сколько в день и куда придём к концу месяца */}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <InfoBox
              label={t('plan.per_day')}
              value={formatMoney(perDay, currency)}
              hint={t('plan.days_left', { n: daysLeftInMonth() })}
              tone={over ? 'bad' : 'good'}
            />
            <InfoBox
              label={t('plan.forecast')}
              value={formatMoney(forecast, currency)}
              hint={forecastOver ? t('plan.forecast_over') : t('plan.forecast_ok')}
              tone={forecastOver ? 'bad' : 'good'}
            />
          </div>

          {/* Связь с лимитами: сколько бюджета уже расписано по категориям */}
          <div className="mt-2 rounded-3xl bg-surface-sunken/60 p-3">
            <div className="flex items-baseline justify-between text-[12px]">
              <span className="font-semibold text-ink">{t('plan.allocated')}</span>
              <span className="tabular font-bold text-ink">
                {formatMoney(limitsTotal, currency)} / {formatMoney(budget, currency)}
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
              <div
                className={`h-full rounded-full ${limitsTotal > budget ? 'bg-amber-400' : 'bg-brand-500'}`}
                style={{ width: `${Math.min(100, budget > 0 ? (limitsTotal / budget) * 100 : 0)}%` }}
              />
            </div>
            <div className="mt-1.5 text-[11px] text-ink-subtle">
              {limitsTotal > budget
                ? t('plan.allocated_over', { sum: formatMoney(limitsTotal - budget, currency) })
                : t('plan.allocated_free', { sum: formatMoney(budget - limitsTotal, currency) })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/** Маленькая карточка-показатель (темп трат, прогноз). */
function InfoBox({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint: string
  tone: 'good' | 'bad'
}) {
  return (
    <div className="card p-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-ink-subtle">{label}</div>
      <div className={`tabular text-base font-bold ${tone === 'bad' ? 'text-expense-deep' : 'text-ink'}`}>{value}</div>
      <div className="mt-0.5 text-[10px] leading-snug text-ink-subtle">{hint}</div>
    </div>
  )
}

/* ---------- Лимиты по категориям ---------- */

function LimitsTab({ t }: { t: TFunc }) {
  const currency = useStore((s) => s.currency)
  const budgets = useStore((s) => s.budgets)
  const setBudget = useStore((s) => s.setBudget)
  const monthlyBudget = useStore((s) => s.monthlyBudget)
  const expenseCats = useStore((s) => selectCategoriesByKind(s, 'expense'))
  const spentByCat = useStore(selectCurrentMonthExpenseByCategory)
  const avgByCat = useStore(selectAvgMonthlyExpenseByCategory)
  const sym = getCurrency(currency).symbol

  // Порядок: сначала категории с лимитом (самые «горячие» сверху), затем без
  // лимита по величине среднего расхода — крупные траты просятся настроиться первыми.
  const ordered = useMemo(() => {
    const withLimit = expenseCats.filter((c) => (budgets[c.id] ?? 0) > 0)
    const without = expenseCats.filter((c) => !((budgets[c.id] ?? 0) > 0))
    withLimit.sort(
      (a, b) => (spentByCat[b.id] ?? 0) / budgets[b.id] - (spentByCat[a.id] ?? 0) / budgets[a.id],
    )
    without.sort((a, b) => (avgByCat[b.id] ?? 0) - (avgByCat[a.id] ?? 0))
    return [...withLimit, ...without]
  }, [expenseCats, budgets, spentByCat, avgByCat])

  const limitsTotal = useMemo(
    () => Object.values(budgets).reduce((sum, v) => sum + (v > 0 ? v : 0), 0),
    [budgets],
  )
  const spentUnderLimits = useMemo(
    () =>
      Object.entries(budgets).reduce(
        (sum, [id, limit]) => (limit > 0 ? sum + (spentByCat[id] ?? 0) : sum),
        0,
      ),
    [budgets, spentByCat],
  )
  const withLimitCount = Object.values(budgets).filter((v) => v > 0).length

  return (
    <div>
      {/* Сводка: сколько категорий под контролем и как расходуются лимиты */}
      {withLimitCount > 0 && (
        <div className="mb-2 rounded-3xl bg-surface-sunken/60 p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-[12px] font-semibold text-ink">
              {t('plan.limits_covered', { n: withLimitCount })}
            </span>
            <span className="tabular text-[12px] font-bold text-ink">
              {formatMoney(spentUnderLimits, currency)} / {formatMoney(limitsTotal, currency)}
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
            <div
              className={`h-full rounded-full ${
                spentUnderLimits > limitsTotal ? 'bg-expense' : 'bg-brand-500'
              }`}
              style={{ width: `${Math.min(100, limitsTotal > 0 ? (spentUnderLimits / limitsTotal) * 100 : 0)}%` }}
            />
          </div>
          {monthlyBudget > 0 && limitsTotal > monthlyBudget && (
            <div className="mt-1.5 text-[11px] font-semibold text-amber-600 dark:text-amber-300">
              {t('plan.allocated_over', { sum: formatMoney(limitsTotal - monthlyBudget, currency) })}
            </div>
          )}
        </div>
      )}

      <p className="mb-2 px-1 text-[11px] leading-relaxed text-ink-subtle">{t('plan.limits_hint')}</p>

      {expenseCats.length === 0 ? (
        <div className="py-10 text-center text-sm text-ink-subtle">{t('plan.limits_empty')}</div>
      ) : (
        <div className="flex flex-col gap-2">
          {ordered.map((c) => (
            <LimitRow
              key={c.id}
              icon={c.icon}
              name={c.name}
              color={c.color}
              value={budgets[c.id] ?? 0}
              spent={spentByCat[c.id] ?? 0}
              avg={avgByCat[c.id] ?? 0}
              currency={currency}
              onChange={(v) => setBudget(c.id, v)}
              sym={sym}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Карточка лимита категории. Когда лимит задан — показывает прогресс расхода,
 * остаток и сколько можно тратить в день до конца месяца. Когда не задан —
 * предлагает поставить лимит из среднего расхода за прошлые месяцы (в один тап),
 * потому что «какую цифру писать?» и есть главный барьер настройки лимитов.
 */
function LimitRow({
  icon,
  name,
  color,
  value,
  spent,
  avg,
  currency,
  onChange,
  sym,
  t,
}: {
  icon: string
  name: string
  color: string
  value: number
  spent: number
  avg: number
  currency: Currency
  onChange: (v: number) => void
  sym: string
  t: TFunc
}) {
  const [draft, setDraft] = useState(value > 0 ? String(value) : '')

  const commit = (raw: string) => {
    const n = parseFloat(raw.replace(',', '.'))
    const safe = Number.isFinite(n) && n > 0 ? n : 0
    onChange(safe)
    setDraft(safe > 0 ? String(safe) : '')
  }

  const applyAvg = () => {
    hapticNotify('success')
    onChange(avg)
    setDraft(String(avg))
  }

  const ratio = value > 0 ? spent / value : 0
  const over = value > 0 && spent > value
  const left = Math.max(0, value - spent)
  const perDay = left / daysLeftInMonth()
  const barColor = over ? 'bg-expense' : ratio >= 0.8 ? 'bg-amber-400' : 'bg-brand-500'

  return (
    <div className="card p-3">
      <div className="flex items-center gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{ background: color + '22', color }}
          aria-hidden
        >
          <CategoryIcon id={icon} size={18} />
        </div>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{name}</span>
        <div className="flex items-center gap-1 rounded-2xl bg-surface-sunken px-3 py-1.5">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            placeholder="—"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => commit(draft)}
            className="w-20 bg-transparent text-right text-sm font-semibold text-ink placeholder:text-ink-subtle focus:outline-none tabular"
          />
          <span className="text-xs text-ink-subtle">{sym}</span>
        </div>
      </div>

      {value > 0 ? (
        <div className="mt-2.5">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
            <div
              className={`h-full rounded-full transition-all ${barColor}`}
              style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }}
            />
          </div>
          <div className="mt-1.5 flex items-baseline justify-between text-[11px]">
            <span className="text-ink-subtle">
              {formatMoney(spent, currency)} {t('plan.goal_of')} {formatMoney(value, currency)}
            </span>
            {over ? (
              <span className="font-semibold text-expense-deep">
                {t('plan.limit_over', { sum: formatMoney(spent - value, currency) })}
              </span>
            ) : (
              <span className="font-semibold text-income-deep">
                {t('plan.limit_per_day', { sum: formatMoney(perDay, currency) })}
              </span>
            )}
          </div>
        </div>
      ) : (
        avg > 0 && (
          /* Подсказка со средним расходом — ставится в один тап */
          <button
            onClick={applyAvg}
            className="mt-2 flex w-full items-center gap-2 rounded-2xl bg-surface-sunken/70 px-3 py-2 text-left active:scale-[0.99]"
          >
            <Wand2 size={15} strokeWidth={2.4} className="shrink-0 text-brand-600 dark:text-brand-300" />
            <span className="min-w-0 flex-1 truncate text-[11px] text-ink-subtle">
              {t('plan.limit_avg', { sum: formatMoney(avg, currency) })}
            </span>
            <span className="shrink-0 text-[11px] font-bold text-brand-600 dark:text-brand-300">
              {t('plan.limit_apply')}
            </span>
          </button>
        )
      )}
    </div>
  )
}

/* ---------- Цели ---------- */

function GoalsTab({ t }: { t: TFunc }) {
  const goals = useStore((s) => s.goals)
  const addGoal = useStore((s) => s.addGoal)
  const defaultCur = useStore(selectAnalyticsCurrency)
  const accounts = useStore(selectAccounts)
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [target, setTarget] = useState('')
  const [sync, setSync] = useState(false)
  const [cur, setCur] = useState<Currency>(defaultCur)

  // Валюты для выбора: текущая по умолчанию + основные + уже встречающиеся в данных.
  const curOptions = [...new Set<Currency>([defaultCur, 'USD', 'EUR', 'UAH', ...accounts])]

  const startAdding = () => { setCur(defaultCur); setAdding(true); hapticTap() }

  const submit = () => {
    const n = parseFloat(target.replace(',', '.'))
    if (!title.trim() || !Number.isFinite(n) || n <= 0) return
    hapticNotify('success')
    addGoal({ title: title.trim(), target: n, syncBalance: sync, currency: cur })
    setTitle('')
    setTarget('')
    setSync(false)
    setAdding(false)
  }

  return (
    <div>
      <p className="mb-2 px-1 text-[11px] leading-relaxed text-ink-subtle">{t('plan.goals_hint')}</p>

      {goals.length === 0 && !adding && (
        <div className="py-8 text-center text-sm text-ink-subtle">{t('plan.goals_empty')}</div>
      )}

      <div className="flex flex-col gap-2">
        {goals.map((g) => (
          <GoalCard key={g.id} goal={g} t={t} />
        ))}
      </div>

      {adding ? (
        <div className="card mt-2 p-3">
          <div className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-subtle">{t('plan.goal_new')}</div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('plan.goal_name_ph')}
            maxLength={40}
            className="mb-2 w-full rounded-2xl bg-surface-sunken px-3 py-2.5 text-sm text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
          <input
            type="number"
            inputMode="decimal"
            min={0}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder={t('plan.goal_target')}
            className="mb-2 w-full rounded-2xl bg-surface-sunken px-3 py-2.5 text-sm text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-brand-300 tabular"
          />

          {/* Валюта цели */}
          <div className="mb-2 flex flex-wrap gap-1.5">
            {curOptions.map((code) => (
              <button
                key={code}
                onClick={() => { setCur(code); hapticSelect() }}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  cur === code ? 'bg-brand-500 text-white' : 'bg-surface-sunken text-ink-muted'
                }`}
              >
                {getCurrency(code).symbol} {code}
              </button>
            ))}
          </div>

          {/* Синхронизация с общим балансом */}
          <button
            onClick={() => { setSync((v) => !v); hapticSelect() }}
            className="mb-2 flex w-full items-center gap-3 rounded-2xl bg-surface-sunken px-3 py-2.5 text-left"
          >
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${sync ? 'bg-brand-500 text-white' : 'bg-surface-raised text-ink-subtle'}`}>
              <Link2 size={16} strokeWidth={2.4} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-ink">{t('plan.goal_sync')}</span>
              <span className="block text-[10px] leading-snug text-ink-subtle">{t('plan.goal_sync_hint')}</span>
            </span>
            <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${sync ? 'bg-brand-500' : 'bg-ink-subtle/30'}`}>
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${sync ? 'left-[18px]' : 'left-0.5'}`} />
            </span>
          </button>

          <div className="flex gap-2">
            <button
              onClick={submit}
              disabled={!title.trim() || !(parseFloat(target.replace(',', '.')) > 0)}
              className="flex-1 rounded-2xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-white active:scale-[0.99] disabled:opacity-40"
            >
              {t('plan.goal_add')}
            </button>
            <button
              onClick={() => { setAdding(false); hapticSelect() }}
              className="rounded-2xl bg-surface-sunken px-4 py-2.5 text-sm font-bold text-ink-muted active:scale-[0.99]"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={startAdding}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ink-subtle/30 py-3 text-sm font-semibold text-brand-600 active:scale-[0.99] dark:text-brand-300"
        >
          <Plus size={18} strokeWidth={2.4} /> {t('plan.goal_new')}
        </button>
      )}
    </div>
  )
}

function GoalCard({ goal, t }: { goal: Goal; t: TFunc }) {
  const globalCurrency = useStore((s) => s.currency)
  const contribute = useStore((s) => s.contributeGoal)
  const removeGoal = useStore((s) => s.removeGoal)
  const netByCur = useStore(selectNetBalanceByCurrency)
  const [add, setAdd] = useState('')
  const cur = goal.currency ?? globalCurrency
  const sym = getCurrency(cur).symbol

  // Для синхронизированной цели «накоплено» = баланс по валюте цели (не уходит в минус).
  const saved = goal.syncBalance ? Math.max(0, netByCur[cur] ?? 0) : goal.saved
  const ratio = goal.target > 0 ? Math.min(1, saved / goal.target) : 0
  const done = goal.target > 0 && saved >= goal.target

  const onContribute = () => {
    const n = parseFloat(add.replace(',', '.'))
    if (!Number.isFinite(n) || n === 0) return
    hapticSelect()
    contribute(goal.id, n)
    setAdd('')
  }

  const onDelete = () => {
    if (!confirm(t('plan.goal_delete_confirm'))) return
    hapticNotify('warning')
    removeGoal(goal.id)
  }

  return (
    <div className="card p-3">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-surface-sunken text-xl">
          {goal.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-ink">{goal.title}</div>
          <div className="text-[11px] text-ink-subtle">
            {formatMoney(saved, cur)} {t('plan.goal_of')} {formatMoney(goal.target, cur)}
          </div>
        </div>
        <button onClick={onDelete} className="shrink-0 text-ink-subtle active:text-expense-deep" aria-label={t('common.delete')}>
          <Trash2 size={18} />
        </button>
      </div>

      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
        <m.div
          className={`h-full rounded-full ${done ? 'bg-income' : 'bg-gradient-to-r from-brand-400 to-brand-600'}`}
          initial={{ width: 0 }}
          animate={{ width: `${Math.round(ratio * 100)}%` }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>

      {goal.syncBalance ? (
        <div className="mt-2 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-brand-600 dark:text-brand-300">
          <Link2 size={13} strokeWidth={2.4} />
          {done ? t('plan.goal_done') : t('plan.goal_synced')}
        </div>
      ) : done ? (
        <div className="mt-2 text-center text-[12px] font-semibold text-income-deep">{t('plan.goal_done')}</div>
      ) : (
        <div className="mt-2 flex items-center gap-2">
          <div className="flex flex-1 items-center gap-1 rounded-2xl bg-surface-sunken px-3 py-2">
            <input
              type="number"
              inputMode="decimal"
              value={add}
              onChange={(e) => setAdd(e.target.value)}
              placeholder={t('plan.goal_contribute_ph')}
              className="w-full bg-transparent text-sm font-semibold text-ink placeholder:font-normal placeholder:text-ink-subtle focus:outline-none tabular"
            />
            <span className="text-xs text-ink-subtle">{sym}</span>
          </div>
          <button
            onClick={onContribute}
            className="shrink-0 rounded-2xl bg-brand-500 px-4 py-2 text-sm font-bold text-white active:scale-95"
          >
            {t('plan.goal_contribute')}
          </button>
        </div>
      )}
    </div>
  )
}
