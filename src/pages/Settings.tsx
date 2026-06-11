import { lazy, Suspense, useRef, useState } from 'react'
import { AnimatePresence, m } from 'framer-motion'
import { Plus, BookOpen } from 'lucide-react'
import { useStore, selectCategoriesByKind, selectAllCategories } from '../store/transactions'
import type { Category } from '../store/categories'
import { hapticTap, hapticNotify, hapticSelect, tg } from '../lib/telegram'
import { CategoryIcon } from '../components/icons/CategoryIcon'

// Редактор категорий — отдельным чанком, грузится по первому открытию.
const CategoryEditor = lazy(() => import('../components/CategoryEditor').then((m) => ({ default: m.CategoryEditor })))
// Гайд по приложению — отдельным чанком, грузится по первому открытию.
const GuideSheet = lazy(() => import('../components/GuideSheet').then((m) => ({ default: m.GuideSheet })))
import { formatMoney } from '../lib/format'
import { CURRENCIES, getCurrency, type Currency } from '../lib/currencies'
import { useT } from '../lib/i18n'
import type { Lang } from '../lib/i18n'

/** Валюты, которые всегда на виду. Остальные — под кнопкой «Ещё». */
const MAIN_CURRENCY_CODES: Currency[] = ['USD', 'EUR', 'UAH']

function CurrencyTile({
  code,
  symbol,
  name,
  active,
  onClick,
}: {
  code: Currency
  symbol: string
  name: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      aria-label={`${name} (${code})`}
      className={`flex flex-col items-center justify-center gap-0.5 rounded-2xl py-2.5 transition-colors ${
        active ? 'bg-brand-500 text-white shadow-soft' : 'text-ink-muted active:bg-surface-sunken'
      }`}
    >
      <span className="text-lg font-bold leading-none">{symbol}</span>
      <span className={`text-[10px] font-semibold ${active ? 'text-white/90' : 'text-ink-subtle'}`}>{code}</span>
    </button>
  )
}

export function SettingsPage() {
  const t = useT()
  const lang = useStore((s) => s.lang)
  const setLang = useStore((s) => s.setLang)
  const currency = useStore((s) => s.currency)
  const setCurrency = useStore((s) => s.setCurrency)
  const clearAll = useStore((s) => s.clearAll)
  const demoMode = useStore((s) => s.demoMode)
  const setDemoMode = useStore((s) => s.setDemoMode)
  const count = useStore((s) => s.transactions.length)
  const chartStyle = useStore((s) => s.chartStyle)
  const setChartStyle = useStore((s) => s.setChartStyle)
  const themeMode = useStore((s) => s.themeMode)
  const setThemeMode = useStore((s) => s.setThemeMode)
  const budgets = useStore((s) => s.budgets)
  const setBudget = useStore((s) => s.setBudget)
  const allCats = useStore(selectAllCategories)
  const homeHeaderMode = useStore((s) => s.homeHeaderMode)
  const setHomeHeaderMode = useStore((s) => s.setHomeHeaderMode)
  const homeHeaderGoalId = useStore((s) => s.homeHeaderGoalId)
  const setHomeHeaderGoalId = useStore((s) => s.setHomeHeaderGoalId)
  const goals = useStore((s) => s.goals)

  const expenseCats = useStore((s) => selectCategoriesByKind(s, 'expense'))
  const customCats = allCats.filter((c) => c.custom)
  const [budgetsOpen, setBudgetsOpen] = useState(false)
  const [editor, setEditor] = useState<{ open: boolean; cat: Category | null }>({ open: false, cat: null })
  // Монтируем редактор только после первого открытия (держим смонтированным для анимации закрытия).
  const seenEditor = useRef(false)
  if (editor.open) seenEditor.current = true
  const [guideOpen, setGuideOpen] = useState(false)
  const seenGuide = useRef(false)
  if (guideOpen) seenGuide.current = true
  const budgetsCount = Object.values(budgets).filter((v) => v > 0).length

  const mainCurrencies = CURRENCIES.filter((c) => MAIN_CURRENCY_CODES.includes(c.code))
  const moreCurrencies = CURRENCIES.filter((c) => !MAIN_CURRENCY_CODES.includes(c.code))
  const activeIsMain = MAIN_CURRENCY_CODES.includes(currency)
  const [moreOpen, setMoreOpen] = useState(!activeIsMain)

  const handleClear = () => {
    if (!confirm(t('settings.clear_confirm'))) return
    hapticNotify('warning')
    clearAll()
  }

  const LANGS: { id: Lang; label: string }[] = [
    { id: 'ru', label: 'Русский' },
    { id: 'en', label: 'English' },
  ]

  return (
    <div className="pb-24">
      <div className="px-6 pt-6 pb-2">
        <div className="text-xs font-semibold uppercase tracking-widest text-ink-subtle">{t('settings.kicker')}</div>
        <div className="mt-0.5 text-2xl font-bold tracking-tight text-ink">{t('settings.title')}</div>
      </div>

      {/* Guide */}
      <div className="mx-6 mt-4">
        <button
          onClick={() => { hapticTap(); setGuideOpen(true) }}
          className="card flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-surface-sunken/40"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
            <BookOpen size={20} strokeWidth={2} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-ink">{t('settings.guide')}</span>
            <span className="mt-0.5 block text-[11px] text-ink-subtle">{t('settings.guide_hint')}</span>
          </span>
          <span className="shrink-0 text-ink-subtle">›</span>
        </button>
      </div>

      {/* Language */}
      <div className="mx-6 mt-6">
        <div className="mb-2 px-2 text-xs font-bold uppercase tracking-wider text-ink-subtle">{t('settings.language')}</div>
        <div className="card grid grid-cols-2 gap-1 p-1">
          {LANGS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => { hapticSelect(); setLang(opt.id) }}
              className={`rounded-2xl py-3 text-sm font-bold transition-colors ${
                lang === opt.id ? 'bg-brand-500 text-white' : 'text-ink-muted'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Currency */}
      <div className="mx-6 mt-6">
        <div className="mb-2 flex items-baseline justify-between px-2">
          <span className="text-xs font-bold uppercase tracking-wider text-ink-subtle">{t('settings.currency')}</span>
          <span className="text-[11px] text-ink-subtle">{getCurrency(currency).name}</span>
        </div>
        <div className="card p-2">
          <div className="grid grid-cols-3 gap-1.5">
            {mainCurrencies.map((c) => (
              <CurrencyTile
                key={c.code}
                code={c.code}
                symbol={c.symbol}
                active={currency === c.code}
                name={c.name}
                onClick={() => { hapticSelect(); setCurrency(c.code) }}
              />
            ))}
          </div>

          <button
            onClick={() => { hapticSelect(); setMoreOpen((v) => !v) }}
            className="mt-2 flex w-full items-center justify-center gap-1 rounded-2xl bg-surface-sunken/60 py-2 text-xs font-semibold text-ink-muted active:bg-surface-sunken"
          >
            {moreOpen ? t('settings.hide') : t('settings.more_currencies')}
            <m.span animate={{ rotate: moreOpen ? 180 : 0 }} className="inline-block">⌄</m.span>
          </button>

          <AnimatePresence initial={false}>
            {moreOpen && (
              <m.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                  {moreCurrencies.map((c) => (
                    <CurrencyTile
                      key={c.code}
                      code={c.code}
                      symbol={c.symbol}
                      active={currency === c.code}
                      name={c.name}
                      onClick={() => { hapticSelect(); setCurrency(c.code) }}
                    />
                  ))}
                </div>
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Chart style */}
      <div className="mx-6 mt-6">
        <div className="mb-2 px-2 text-xs font-bold uppercase tracking-wider text-ink-subtle">
          {t('settings.chart_style')}
        </div>
        <div className="card grid grid-cols-2 gap-1 p-1">
          {([
            { id: 'compact', label: t('settings.chart_compact') },
            { id: 'icons', label: t('settings.chart_icons') },
          ] as const).map((opt) => (
            <button
              key={opt.id}
              onClick={() => {
                hapticSelect()
                setChartStyle(opt.id)
              }}
              className={`rounded-2xl py-3 text-sm font-bold transition-colors ${
                chartStyle === opt.id ? 'bg-brand-500 text-white' : 'text-ink-muted'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Home header */}
      <div className="mx-6 mt-6">
        <div className="mb-2 px-2 text-xs font-bold uppercase tracking-wider text-ink-subtle">
          {t('settings.home_header')}
        </div>
        <div className="card p-1">
          <div className="grid grid-cols-2 gap-1">
            {([
              { id: 'date', label: t('settings.hh_date') },
              { id: 'goal', label: t('settings.hh_goal') },
            ] as const).map((opt) => (
              <button
                key={opt.id}
                onClick={() => { hapticSelect(); setHomeHeaderMode(opt.id) }}
                className={`rounded-2xl py-3 text-sm font-bold transition-colors ${
                  homeHeaderMode === opt.id ? 'bg-brand-500 text-white' : 'text-ink-muted'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {homeHeaderMode === 'goal' && (
            goals.length === 0 ? (
              <div className="px-2 py-3 text-center text-xs text-ink-subtle">{t('settings.hh_no_goals')}</div>
            ) : (
              <div className="mt-1 border-t border-surface-sunken pt-2">
                <div className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
                  {t('settings.hh_pick_goal')}
                </div>
                <div className="flex flex-col gap-1">
                  {goals.map((g) => {
                    const active = (homeHeaderGoalId ?? goals[0]?.id) === g.id
                    return (
                      <button
                        key={g.id}
                        onClick={() => { hapticSelect(); setHomeHeaderGoalId(g.id) }}
                        className={`flex items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
                          active ? 'bg-brand-500/15 text-brand-700 dark:text-brand-200' : 'text-ink-muted active:bg-surface-sunken'
                        }`}
                      >
                        <span className="shrink-0 text-base">{g.icon}</span>
                        <span className="truncate">{g.title}</span>
                        {active && <span className="ml-auto shrink-0 text-brand-500">✓</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          )}
        </div>
      </div>

      {/* Theme */}
      <div className="mx-6 mt-6">
        <div className="mb-2 px-2 text-xs font-bold uppercase tracking-wider text-ink-subtle">{t('settings.theme')}</div>
        <div className="card grid grid-cols-3 gap-1 p-1">
          {([
            { id: 'auto', label: t('settings.theme_auto') },
            { id: 'light', label: t('settings.theme_light') },
            { id: 'dark', label: t('settings.theme_dark') },
          ] as const).map((opt) => (
            <button
              key={opt.id}
              onClick={() => {
                hapticSelect()
                setThemeMode(opt.id)
              }}
              className={`rounded-2xl py-3 text-sm font-bold transition-colors ${
                themeMode === opt.id ? 'bg-brand-500 text-white' : 'text-ink-muted'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Budgets */}
      <div className="mx-6 mt-6">
        <button
          onClick={() => {
            hapticSelect()
            setBudgetsOpen((v) => !v)
          }}
          className="mb-2 flex w-full items-center justify-between px-2"
        >
          <span className="text-xs font-bold uppercase tracking-wider text-ink-subtle">
            {t('settings.budgets')}
          </span>
          <span className="text-xs text-ink-subtle">
            {budgetsCount > 0 ? t('settings.budgets_active', { n: budgetsCount }) : t('settings.budgets_none')}{' '}
            <m.span
              animate={{ rotate: budgetsOpen ? 180 : 0 }}
              className="ml-1 inline-block"
            >
              ⌄
            </m.span>
          </span>
        </button>
        <AnimatePresence initial={false}>
          {budgetsOpen && (
            <m.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <div className="card divide-y divide-surface-sunken">
                {expenseCats.map((c) => (
                  <BudgetRow
                    key={c.id}
                    icon={c.icon}
                    name={c.name}
                    color={c.color}
                    value={budgets[c.id] ?? 0}
                    onChange={(v) => setBudget(c.id, v)}
                    currencySymbol={getCurrency(currency).symbol}
                  />
                ))}
              </div>
              <p className="mx-2 mt-2 text-[11px] leading-relaxed text-ink-subtle">
                {t('settings.budget_hint')}
              </p>
            </m.div>
          )}
        </AnimatePresence>
      </div>

      {/* Categories */}
      <div className="mx-6 mt-6">
        <div className="mb-2 flex items-center justify-between px-2">
          <span className="text-xs font-bold uppercase tracking-wider text-ink-subtle">{t('settings.custom_categories')}</span>
          <span className="text-[11px] text-ink-subtle">{customCats.length > 0 ? t('settings.cats_count', { n: customCats.length }) : t('settings.cats_none')}</span>
        </div>
        <div className="card divide-y divide-surface-sunken">
          {customCats.map((c) => (
            <button
              key={c.id}
              onClick={() => { hapticSelect(); setEditor({ open: true, cat: c }) }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-surface-sunken/40"
            >
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                style={{ background: c.color + '22', color: c.color }}
              >
                <CategoryIcon id={c.icon} size={18} />
              </div>
              <span className="flex-1 text-sm font-medium text-ink">{c.name}</span>
              <span className="text-[11px] text-ink-subtle">{c.kind === 'income' ? t('settings.income_cats') : t('settings.expense_cats')}</span>
              <span className="text-ink-subtle">›</span>
            </button>
          ))}
          <button
            onClick={() => { hapticTap(); setEditor({ open: true, cat: null }) }}
            className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-sunken/40"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-ink-subtle/40 text-ink-subtle">
              <Plus size={18} strokeWidth={2} />
            </div>
            <span className="text-sm font-semibold text-brand-600 dark:text-brand-300">{t('settings.add_category')}</span>
          </button>
        </div>
      </div>

      {/* Data */}
      <div className="mx-6 mt-6">
        <div className="mb-2 px-2 text-xs font-bold uppercase tracking-wider text-ink-subtle">{t('settings.data')}</div>
        <div className="card divide-y divide-surface-sunken">
          <SettingRow label={t('settings.total_ops')} value={count.toString()} />
          <ToggleRow
            label={t('settings.demo')}
            hint={t('settings.demo_hint')}
            on={demoMode}
            onToggle={() => {
              hapticSelect()
              setDemoMode(!demoMode)
            }}
          />
          <SettingRow
            label={t('settings.clear_all')}
            value="→"
            danger
            onClick={handleClear}
          />
        </div>
      </div>

      {/* About */}
      <div className="mx-6 mt-6">
        <div className="mb-2 px-2 text-xs font-bold uppercase tracking-wider text-ink-subtle">{t('settings.about')}</div>
        <div className="card p-4 text-sm leading-relaxed text-ink-muted">
          <p>{t('settings.about_text')}</p>
          <p className="mt-3 text-xs text-ink-subtle">
            {t('settings.in_telegram')} {tg.isInTelegram ? '✅' : '❌'}
          </p>
        </div>
      </div>

      {budgetsCount > 0 && <ActiveBudgetsBar total={Object.values(budgets).reduce((s, v) => s + v, 0)} currency={currency} t={t} />}

      {seenEditor.current && (
        <Suspense fallback={null}>
          <CategoryEditor
            open={editor.open}
            editing={editor.cat}
            onClose={() => setEditor({ open: false, cat: null })}
          />
        </Suspense>
      )}

      {seenGuide.current && (
        <Suspense fallback={null}>
          <GuideSheet open={guideOpen} onClose={() => setGuideOpen(false)} />
        </Suspense>
      )}
    </div>
  )
}

function ActiveBudgetsBar({ total, currency, t }: { total: number; currency: Currency; t: ReturnType<typeof useT> }) {
  return (
    <div className="mx-6 mt-4 text-center text-[11px] text-ink-subtle">
      {t('settings.active_limits_sum')} <span className="tabular font-semibold text-ink">{formatMoney(total, currency)}</span>
    </div>
  )
}

interface BudgetRowProps {
  icon: string
  name: string
  color: string
  value: number
  onChange: (v: number) => void
  currencySymbol: string
}

function BudgetRow({ icon, name, color, value, onChange, currencySymbol }: BudgetRowProps) {
  const [draft, setDraft] = useState(value > 0 ? String(value) : '')

  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
        style={{ background: color + '22', color }}
        aria-hidden
      >
        <CategoryIcon id={icon} size={18} />
      </div>
      <span className="flex-1 text-sm font-medium text-ink">{name}</span>
      <div className="flex items-center gap-1 rounded-2xl bg-surface-sunken px-3 py-1.5">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          placeholder="—"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const n = parseFloat(draft.replace(',', '.'))
            const safe = Number.isFinite(n) && n > 0 ? n : 0
            onChange(safe)
            setDraft(safe > 0 ? String(safe) : '')
          }}
          className="w-20 bg-transparent text-right text-sm font-semibold text-ink placeholder:text-ink-subtle focus:outline-none tabular"
        />
        <span className="text-xs text-ink-subtle">{currencySymbol}</span>
      </div>
    </div>
  )
}

function ToggleRow({
  label,
  hint,
  on,
  onToggle,
}: {
  label: string
  hint?: string
  on: boolean
  onToggle: () => void
}) {
  return (
    <button onClick={onToggle} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:bg-surface-sunken/40">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {hint && <span className="mt-0.5 block text-[11px] leading-snug text-ink-subtle">{hint}</span>}
      </span>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-brand-500' : 'bg-surface-sunken'}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`}
        />
      </span>
    </button>
  )
}

interface RowProps {
  label: string
  value: string
  onClick?: () => void
  danger?: boolean
}

function SettingRow({ label, value, onClick, danger }: RowProps) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="flex w-full items-center justify-between px-4 py-3 text-left active:bg-surface-sunken/40 disabled:active:bg-transparent"
    >
      <span className={`text-sm font-medium ${danger ? 'text-expense-deep' : 'text-ink'}`}>
        {label}
      </span>
      <span className="tabular text-sm text-ink-subtle">{value}</span>
    </button>
  )
}
