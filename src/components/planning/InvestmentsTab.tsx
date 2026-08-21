import { useMemo, useState } from 'react'
import { Plus, Trash2, Calculator, TrendingUp, Landmark, Bitcoin, PiggyBank, LineChart, Wallet } from 'lucide-react'
import { useStore, type Investment, type InvestmentKind } from '../../store/transactions'
import { getCurrency, type Currency } from '../../lib/currencies'
import { formatMoney } from '../../lib/format'
import { hapticSelect, hapticTap, hapticNotify } from '../../lib/telegram'
import { type TFunc } from '../../lib/i18n'

/** Иконка и оттенок под тип актива. */
const KIND_META: Record<InvestmentKind, { icon: typeof Landmark; color: string }> = {
  deposit: { icon: Landmark, color: '#3B82F6' },
  stocks: { icon: LineChart, color: '#10B981' },
  crypto: { icon: Bitcoin, color: '#F59E0B' },
  cash: { icon: PiggyBank, color: '#8B5CF6' },
  other: { icon: Wallet, color: '#94A3B8' },
}

const KINDS: InvestmentKind[] = ['deposit', 'stocks', 'crypto', 'cash', 'other']

/**
 * «Инвестиции и сбережения»: витрина капитала (вклады, акции, крипта, подушка)
 * + калькулятор сложного процента. На доходы/расходы и бюджеты не влияет —
 * это отдельный контур «сколько у меня накоплено и как оно растёт».
 */
export function InvestmentsTab({ t }: { t: TFunc }) {
  const investments = useStore((s) => s.investments)
  const globalCurrency = useStore((s) => s.currency)
  const addInvestment = useStore((s) => s.addInvestment)

  const [adding, setAdding] = useState(false)
  const [calcOpen, setCalcOpen] = useState(false)

  // Портфель по валютам + средневзвешенная доходность (для сводки и калькулятора).
  const summary = useMemo(() => {
    const byCur: Record<string, number> = {}
    let weighted = 0
    let total = 0
    for (const i of investments) {
      byCur[i.currency] = (byCur[i.currency] ?? 0) + i.amount
      weighted += i.amount * i.rate
      total += i.amount
    }
    // Годовой пассивный доход считаем по каждой валюте отдельно (суммы не смешиваем).
    const yearlyByCur: Record<string, number> = {}
    for (const i of investments) {
      yearlyByCur[i.currency] = (yearlyByCur[i.currency] ?? 0) + (i.amount * i.rate) / 100
    }
    return {
      byCur,
      yearlyByCur,
      avgRate: total > 0 ? weighted / total : 0,
      mainCurrency: (Object.keys(byCur).sort((a, b) => byCur[b] - byCur[a])[0] ?? globalCurrency) as Currency,
      mainAmount: 0,
    }
  }, [investments, globalCurrency])

  const curEntries = Object.entries(summary.byCur) as [Currency, number][]

  return (
    <div>
      {/* Сводка портфеля */}
      {investments.length > 0 && (
        <div className="card mb-2 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-ink-subtle">{t('inv.total')}</div>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {curEntries.map(([cur, sum]) => (
              <span key={cur} className="tabular text-xl font-bold text-ink">
                {formatMoney(sum, cur)}
              </span>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2 border-t border-surface-sunken pt-2 text-[11px]">
            <TrendingUp size={13} strokeWidth={2.4} className="shrink-0 text-income-deep" />
            <span className="text-ink-subtle">
              {t('inv.yearly')}:{' '}
              <span className="font-semibold text-income-deep">
                {(Object.entries(summary.yearlyByCur) as [Currency, number][])
                  .filter(([, v]) => v > 0)
                  .map(([cur, v]) => formatMoney(v, cur))
                  .join(' · ') || '—'}
              </span>
            </span>
            {summary.avgRate > 0 && (
              <span className="ml-auto shrink-0 tabular text-ink-subtle">
                ⌀ {summary.avgRate.toFixed(1)}%
              </span>
            )}
          </div>
        </div>
      )}

      {investments.length === 0 && !adding && (
        <p className="mb-2 px-1 text-[11px] leading-relaxed text-ink-subtle">{t('inv.hint')}</p>
      )}

      {/* Список активов */}
      <div className="flex flex-col gap-2">
        {investments.map((i) => (
          <InvestmentCard key={i.id} item={i} t={t} />
        ))}
      </div>

      {/* Добавление */}
      {adding ? (
        <AddInvestmentForm
          t={t}
          defaultCurrency={globalCurrency}
          onCancel={() => setAdding(false)}
          onSubmit={(v) => {
            addInvestment(v)
            hapticNotify('success')
            setAdding(false)
          }}
        />
      ) : (
        <button
          onClick={() => { hapticTap(); setAdding(true) }}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ink-subtle/30 py-3 text-sm font-semibold text-brand-600 active:scale-[0.99] dark:text-brand-300"
        >
          <Plus size={18} strokeWidth={2.4} /> {t('inv.add')}
        </button>
      )}

      {/* Калькулятор доходности */}
      <button
        onClick={() => { hapticTap(); setCalcOpen((v) => !v) }}
        className="mt-3 flex w-full items-center gap-3 rounded-2xl bg-surface-sunken/60 p-3 text-left active:scale-[0.99]"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
          <Calculator size={18} strokeWidth={2.2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">{t('inv.calc')}</span>
          <span className="block text-[11px] text-ink-subtle">{t('inv.calc_hint')}</span>
        </span>
        <span className="shrink-0 text-[11px] font-bold text-brand-600 dark:text-brand-300">
          {calcOpen ? t('inv.calc_hide') : t('inv.calc_open')}
        </span>
      </button>

      {calcOpen && (
        <CompoundCalculator
          t={t}
          currency={summary.mainCurrency}
          presetAmount={curEntries.length > 0 ? summary.byCur[summary.mainCurrency] ?? 0 : 0}
          presetRate={summary.avgRate}
        />
      )}
    </div>
  )
}

/* ---------- Карточка актива ---------- */

function InvestmentCard({ item, t }: { item: Investment; t: TFunc }) {
  const updateInvestment = useStore((s) => s.updateInvestment)
  const removeInvestment = useStore((s) => s.removeInvestment)
  const [amountDraft, setAmountDraft] = useState(String(item.amount))
  const meta = KIND_META[item.kind] ?? KIND_META.other
  const Icon = meta.icon
  const yearly = (item.amount * item.rate) / 100

  const commitAmount = () => {
    const n = parseFloat(amountDraft.replace(',', '.'))
    const safe = Number.isFinite(n) && n > 0 ? n : 0
    updateInvestment(item.id, { amount: safe })
    setAmountDraft(String(safe))
  }

  const onDelete = () => {
    if (!confirm(t('inv.delete_confirm'))) return
    hapticNotify('warning')
    removeInvestment(item.id)
  }

  return (
    <div className="card p-3">
      <div className="flex items-center gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{ background: meta.color + '22', color: meta.color }}
          aria-hidden
        >
          <Icon size={18} strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-ink">{item.title}</div>
          <div className="text-[11px] text-ink-subtle">
            {t('inv.kind_' + item.kind)}
            {item.rate > 0 && ` · ${item.rate}% ${t('inv.per_year')}`}
          </div>
        </div>
        <button onClick={onDelete} className="shrink-0 text-ink-subtle active:text-expense-deep" aria-label={t('common.delete')}>
          <Trash2 size={17} />
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <div className="flex flex-1 items-center gap-1 rounded-2xl bg-surface-sunken px-3 py-2">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            value={amountDraft}
            onChange={(e) => setAmountDraft(e.target.value)}
            onBlur={commitAmount}
            className="w-full bg-transparent text-sm font-bold text-ink focus:outline-none tabular"
          />
          <span className="text-xs text-ink-subtle">{getCurrency(item.currency).symbol}</span>
        </div>
        {yearly > 0 && (
          <span className="shrink-0 rounded-2xl bg-income/10 px-3 py-2 text-[11px] font-bold tabular text-income-deep">
            +{formatMoney(yearly, item.currency)}/{t('inv.year_short')}
          </span>
        )}
      </div>
    </div>
  )
}

/* ---------- Форма добавления ---------- */

function AddInvestmentForm({
  t,
  defaultCurrency,
  onSubmit,
  onCancel,
}: {
  t: TFunc
  defaultCurrency: Currency
  onSubmit: (v: { title: string; amount: number; rate: number; kind: InvestmentKind; currency: Currency }) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [rate, setRate] = useState('')
  const [kind, setKind] = useState<InvestmentKind>('deposit')
  const amountNum = parseFloat(amount.replace(',', '.'))
  const valid = title.trim().length > 0 && Number.isFinite(amountNum) && amountNum > 0

  return (
    <div className="card mt-2 p-3">
      <div className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-subtle">{t('inv.add')}</div>

      {/* Тип актива */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {KINDS.map((k) => {
          const meta = KIND_META[k]
          const active = kind === k
          return (
            <button
              key={k}
              onClick={() => { setKind(k); hapticSelect() }}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                active ? 'text-white' : 'bg-surface-sunken text-ink-muted'
              }`}
              style={active ? { background: meta.color } : undefined}
            >
              {t('inv.kind_' + k)}
            </button>
          )
        })}
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t('inv.name_ph')}
        maxLength={40}
        className="mb-2 w-full rounded-2xl bg-surface-sunken px-3 py-2.5 text-sm text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-brand-300"
      />
      <div className="mb-2 flex gap-2">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={t('inv.amount_ph')}
          className="min-w-0 flex-1 rounded-2xl bg-surface-sunken px-3 py-2.5 text-sm text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-brand-300 tabular"
        />
        <input
          type="number"
          inputMode="decimal"
          min={0}
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          placeholder={t('inv.rate_ph')}
          className="w-24 shrink-0 rounded-2xl bg-surface-sunken px-3 py-2.5 text-sm text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-brand-300 tabular"
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => {
            if (!valid) return
            const r = parseFloat(rate.replace(',', '.'))
            onSubmit({
              title: title.trim(),
              amount: amountNum,
              rate: Number.isFinite(r) && r > 0 ? r : 0,
              kind,
              currency: defaultCurrency,
            })
          }}
          disabled={!valid}
          className="flex-1 rounded-2xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-white active:scale-[0.99] disabled:opacity-40"
        >
          {t('common.save')}
        </button>
        <button
          onClick={() => { onCancel(); hapticSelect() }}
          className="rounded-2xl bg-surface-sunken px-4 py-2.5 text-sm font-bold text-ink-muted active:scale-[0.99]"
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>
  )
}

/* ---------- Калькулятор сложного процента ---------- */

/**
 * Считает помесячно (стандарт для таких калькуляторов): ставка делится на 12,
 * пополнение вносится каждый месяц. Даёт итог, вложенное, доход и эффективную
 * годовую ставку (APY) — то, во что превращается заявленный годовой процент
 * (APR) при ежемесячной капитализации.
 */
function compound(principal: number, monthly: number, annualRatePct: number, years: number) {
  const months = Math.max(0, Math.round(years * 12))
  const r = annualRatePct / 100 / 12
  let balance = principal
  for (let i = 0; i < months; i++) balance = balance * (1 + r) + monthly
  const invested = principal + monthly * months
  return {
    total: balance,
    invested,
    profit: balance - invested,
    apy: (Math.pow(1 + r, 12) - 1) * 100,
  }
}

function CompoundCalculator({
  t,
  currency,
  presetAmount,
  presetRate,
}: {
  t: TFunc
  currency: Currency
  presetAmount: number
  presetRate: number
}) {
  const [amount, setAmount] = useState(presetAmount > 0 ? String(Math.round(presetAmount)) : '')
  const [monthly, setMonthly] = useState('')
  const [rate, setRate] = useState(presetRate > 0 ? presetRate.toFixed(1) : '10')
  const [years, setYears] = useState('5')

  const num = (v: string) => {
    const n = parseFloat(v.replace(',', '.'))
    return Number.isFinite(n) && n > 0 ? n : 0
  }

  const res = compound(num(amount), num(monthly), num(rate), num(years))
  const sym = getCurrency(currency).symbol

  return (
    <div className="card mt-2 p-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label={t('inv.calc_amount')} value={amount} onChange={setAmount} suffix={sym} />
        <Field label={t('inv.calc_monthly')} value={monthly} onChange={setMonthly} suffix={sym} />
        <Field label={t('inv.calc_rate')} value={rate} onChange={setRate} suffix="%" />
        <Field label={t('inv.calc_years')} value={years} onChange={setYears} suffix={t('inv.year_short')} />
      </div>

      <div className="mt-3 rounded-2xl bg-surface-sunken/70 p-3">
        <div className="text-[10px] font-bold uppercase tracking-wider text-ink-subtle">{t('inv.calc_result')}</div>
        <div className="tabular text-2xl font-bold text-ink">{formatMoney(res.total, currency)}</div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
          <div>
            <div className="text-ink-subtle">{t('inv.calc_invested')}</div>
            <div className="tabular font-semibold text-ink">{formatMoney(res.invested, currency)}</div>
          </div>
          <div>
            <div className="text-ink-subtle">{t('inv.calc_profit')}</div>
            <div className="tabular font-semibold text-income-deep">+{formatMoney(res.profit, currency)}</div>
          </div>
        </div>
        <div className="mt-2 border-t border-surface-sunken pt-2 text-[11px] text-ink-subtle">
          {t('inv.calc_apy', { apy: res.apy.toFixed(2) })}
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  suffix: string
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-ink-subtle">{label}</span>
      <span className="flex items-center gap-1 rounded-2xl bg-surface-sunken px-3 py-2">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          className="w-full min-w-0 bg-transparent text-sm font-semibold text-ink placeholder:text-ink-subtle focus:outline-none tabular"
        />
        <span className="shrink-0 text-xs text-ink-subtle">{suffix}</span>
      </span>
    </label>
  )
}
