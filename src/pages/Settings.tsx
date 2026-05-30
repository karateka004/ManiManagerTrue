import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore, selectCategoriesByKind, selectAllCategories } from '../store/transactions'
import type { Category } from '../store/categories'
import { hapticTap, hapticNotify, hapticSelect, tg } from '../lib/telegram'
import { CategoryIcon } from '../components/icons/CategoryIcon'
import { CategoryEditor } from '../components/CategoryEditor'
import { formatMoney } from '../lib/format'
import { CURRENCIES, getCurrency, type Currency } from '../lib/currencies'

export function SettingsPage() {
  const currency = useStore((s) => s.currency)
  const setCurrency = useStore((s) => s.setCurrency)
  const clearAll = useStore((s) => s.clearAll)
  const seedDemo = useStore((s) => s.seedDemo)
  const count = useStore((s) => s.transactions.length)
  const chartStyle = useStore((s) => s.chartStyle)
  const setChartStyle = useStore((s) => s.setChartStyle)
  const themeMode = useStore((s) => s.themeMode)
  const setThemeMode = useStore((s) => s.setThemeMode)
  const budgets = useStore((s) => s.budgets)
  const setBudget = useStore((s) => s.setBudget)
  const allCats = useStore(selectAllCategories)

  const expenseCats = useStore((s) => selectCategoriesByKind(s, 'expense'))
  const customCats = allCats.filter((c) => c.custom)
  const [budgetsOpen, setBudgetsOpen] = useState(false)
  const [editor, setEditor] = useState<{ open: boolean; cat: Category | null }>({ open: false, cat: null })
  const budgetsCount = Object.values(budgets).filter((v) => v > 0).length

  const handleClear = () => {
    if (!confirm('Удалить все операции? Это действие необратимо.')) return
    hapticNotify('warning')
    clearAll()
  }

  return (
    <div className="pb-24">
      <div className="px-6 pt-6 pb-2">
        <div className="text-xs font-semibold uppercase tracking-widest text-ink-subtle">Настройки</div>
        <div className="mt-0.5 text-2xl font-bold tracking-tight text-ink">Тонкая настройка</div>
      </div>

      {/* Currency */}
      <div className="mx-6 mt-4">
        <div className="mb-2 flex items-baseline justify-between px-2">
          <span className="text-xs font-bold uppercase tracking-wider text-ink-subtle">Валюта</span>
          <span className="text-[11px] text-ink-subtle">{getCurrency(currency).name}</span>
        </div>
        <div className="card grid grid-cols-3 gap-1.5 p-2 sm:grid-cols-4">
          {CURRENCIES.map((c) => {
            const active = currency === c.code
            return (
              <button
                key={c.code}
                onClick={() => {
                  hapticSelect()
                  setCurrency(c.code)
                }}
                aria-label={`${c.name} (${c.code})`}
                className={`flex flex-col items-center justify-center gap-0.5 rounded-2xl py-2.5 transition-colors ${
                  active ? 'bg-brand-500 text-white shadow-soft' : 'text-ink-muted active:bg-surface-sunken'
                }`}
              >
                <span className="text-lg font-bold leading-none">{c.symbol}</span>
                <span className={`text-[10px] font-semibold ${active ? 'text-white/90' : 'text-ink-subtle'}`}>
                  {c.code}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Chart style */}
      <div className="mx-6 mt-6">
        <div className="mb-2 px-2 text-xs font-bold uppercase tracking-wider text-ink-subtle">
          Стиль графика
        </div>
        <div className="card grid grid-cols-2 gap-1 p-1">
          {([
            { id: 'compact', label: 'Компактный' },
            { id: 'icons', label: 'С иконками' },
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

      {/* Theme */}
      <div className="mx-6 mt-6">
        <div className="mb-2 px-2 text-xs font-bold uppercase tracking-wider text-ink-subtle">Тема</div>
        <div className="card grid grid-cols-3 gap-1 p-1">
          {([
            { id: 'auto', label: 'Авто' },
            { id: 'light', label: 'Светлая' },
            { id: 'dark', label: 'Тёмная' },
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
            Бюджеты
          </span>
          <span className="text-xs text-ink-subtle">
            {budgetsCount > 0 ? `${budgetsCount} активн.` : 'не заданы'}{' '}
            <motion.span
              animate={{ rotate: budgetsOpen ? 180 : 0 }}
              className="ml-1 inline-block"
            >
              ⌄
            </motion.span>
          </span>
        </button>
        <AnimatePresence initial={false}>
          {budgetsOpen && (
            <motion.div
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
                Лимит — это месячный ориентир расхода на категорию. При расходе ≥80% появляется
                жёлтая полоса, при 100%+ — красная и тревожная плашка на главной.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Categories */}
      <div className="mx-6 mt-6">
        <div className="mb-2 flex items-center justify-between px-2">
          <span className="text-xs font-bold uppercase tracking-wider text-ink-subtle">Свои категории</span>
          <span className="text-[11px] text-ink-subtle">{customCats.length > 0 ? `${customCats.length} шт.` : 'нет'}</span>
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
              <span className="text-[11px] text-ink-subtle">{c.kind === 'income' ? 'доход' : 'расход'}</span>
              <span className="text-ink-subtle">›</span>
            </button>
          ))}
          <button
            onClick={() => { hapticTap(); setEditor({ open: true, cat: null }) }}
            className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-sunken/40"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-ink-subtle/40 text-ink-subtle">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-brand-600 dark:text-brand-300">Добавить категорию</span>
          </button>
        </div>
      </div>

      {/* Data */}
      <div className="mx-6 mt-6">
        <div className="mb-2 px-2 text-xs font-bold uppercase tracking-wider text-ink-subtle">Данные</div>
        <div className="card divide-y divide-surface-sunken">
          <SettingRow label="Всего операций" value={count.toString()} />
          <SettingRow
            label="Загрузить демо"
            value="→"
            onClick={() => {
              hapticTap()
              seedDemo()
            }}
          />
          <SettingRow
            label="Очистить всё"
            value="→"
            danger
            onClick={handleClear}
          />
        </div>
      </div>

      {/* About */}
      <div className="mx-6 mt-6">
        <div className="mb-2 px-2 text-xs font-bold uppercase tracking-wider text-ink-subtle">О приложении</div>
        <div className="card p-4 text-sm leading-relaxed text-ink-muted">
          <p>
            <span className="font-semibold text-ink">Кошель</span> — это простой
            трекер расходов и доходов в Telegram. Данные хранятся локально на
            устройстве.
          </p>
          <p className="mt-3 text-xs text-ink-subtle">
            Запущено внутри Telegram: {tg.isInTelegram ? '✅ да' : '❌ нет'}
          </p>
        </div>
      </div>

      {budgetsCount > 0 && <ActiveBudgetsBar total={Object.values(budgets).reduce((s, v) => s + v, 0)} currency={currency} />}

      <CategoryEditor
        open={editor.open}
        editing={editor.cat}
        onClose={() => setEditor({ open: false, cat: null })}
      />
    </div>
  )
}

function ActiveBudgetsBar({ total, currency }: { total: number; currency: Currency }) {
  return (
    <div className="mx-6 mt-4 text-center text-[11px] text-ink-subtle">
      Сумма активных лимитов: <span className="tabular font-semibold text-ink">{formatMoney(total, currency)}</span>
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
