import { lazy, Suspense, useRef, useState, type ReactNode } from 'react'
import { Plus, BookOpen, ChevronDown, Check, Target } from 'lucide-react'
import {
  useStore,
  selectCategoriesByKind,
  selectAllCategories,
  selectQuickCurrencies,
} from '../store/transactions'
import type { Category } from '../store/categories'
import { hapticTap, hapticNotify, hapticSelect, tg, confirmAction } from '../lib/telegram'
import { setReminders, exportTransactions } from '../lib/api'
import { buildCsv } from '../lib/csv'
import { parseTransactionsCsv, type ParsedRow } from '../lib/csvImport'
import { CategoryIcon } from '../components/icons/CategoryIcon'
import { SegTrack } from '../components/ui/SegTrack'
import { Group, Row } from '../components/ui/Group'
import { ScreenHeader } from '../components/ui/ScreenHeader'

// Редактор категорий — отдельным чанком, грузится по первому открытию.
const CategoryEditor = lazy(() => import('../components/CategoryEditor').then((m) => ({ default: m.CategoryEditor })))
// Гайд по приложению — отдельным чанком, грузится по первому открытию.
const GuideSheet = lazy(() => import('../components/GuideSheet').then((m) => ({ default: m.GuideSheet })))
import { formatMoney } from '../lib/format'
import { CURRENCIES, getCurrency, type Currency } from '../lib/currencies'
import { useCatName, useT } from '../lib/i18n'
import type { Lang } from '../lib/i18n'

/** Валюты, которые всегда на виду. Остальные — под кнопкой «Ещё». */
const MAIN_CURRENCY_CODES: Currency[] = ['USD', 'EUR', 'UAH']

/**
 * Настройки.
 *
 * 2.0: каждый переключатель раньше заливал выбранный вариант брендом — на экране
 * было восемь ярких зелёных плашек, и самым громким местом приложения стали
 * настройки. Теперь выбранное — светлая плашка на сером треке (`.seg-*`), а
 * бренд остался у включённых тумблеров и действия «Добавить категорию».
 * Раскрывающиеся блоки больше не на framer (`initial: height 0, opacity 0`):
 * внутри поля ввода, и при остановленном rAF они остались бы невидимыми.
 */
export function SettingsPage({ onBack }: { onBack?: () => void }) {
  const t = useT()
  const catName = useCatName()
  const lang = useStore((s) => s.lang)
  const setLang = useStore((s) => s.setLang)
  const currency = useStore((s) => s.currency)
  const setCurrency = useStore((s) => s.setCurrency)
  const quickCurrencies = useStore(selectQuickCurrencies)
  const setQuickCurrency = useStore((s) => s.setQuickCurrency)
  const clearAll = useStore((s) => s.clearAll)
  const demoMode = useStore((s) => s.demoMode)
  const setDemoMode = useStore((s) => s.setDemoMode)
  const remindersEnabled = useStore((s) => s.remindersEnabled)
  const setRemindersEnabled = useStore((s) => s.setRemindersEnabled)
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
  // Какой слот быстрых валют сейчас меняем (null — список выбора скрыт).
  const [quickSlot, setQuickSlot] = useState<number | null>(null)

  const handleClear = async () => {
    if (!(await confirmAction(t('settings.clear_confirm')))) return
    hapticNotify('warning')
    clearAll()
  }

  const LANGS: { id: Lang; label: string }[] = [
    { id: 'ru', label: 'Русский' },
    { id: 'en', label: 'English' },
  ]

  return (
    <div className="pb-28">
      <ScreenHeader kicker={t('settings.kicker')} title={t('settings.title')} onBack={onBack} />

      <Group className="mx-4 mt-5">
        <Row
          icon={<BookOpen size={18} strokeWidth={2} />}
          title={t('settings.guide')}
          chevron
          onClick={() => { hapticTap(); setGuideOpen(true) }}
        />
      </Group>

      <Segment
        title={t('settings.language')}
        options={LANGS}
        value={lang}
        onChange={(id) => { hapticSelect(); setLang(id) }}
      />

      <Segment
        title={t('settings.theme')}
        options={[
          { id: 'auto', label: t('settings.theme_auto') },
          { id: 'light', label: t('settings.theme_light') },
          { id: 'dark', label: t('settings.theme_dark') },
        ]}
        value={themeMode}
        onChange={(id) => { hapticSelect(); setThemeMode(id) }}
      />

      {/* Валюта */}
      <section className="mx-4 mt-6">
        <SectionHead title={t('settings.currency')} action={getCurrency(currency).name} />
        <div className="rounded-3xl bg-surface-sunken p-1">
          <div className="grid grid-cols-3 gap-1">
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
          {moreOpen && (
            <div className="tab-enter mt-1 grid grid-cols-3 gap-1 sm:grid-cols-4">
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
          )}
        </div>
        <button
          onClick={() => { hapticSelect(); setMoreOpen((v) => !v) }}
          className="caption mx-auto mt-2 flex items-center gap-1 px-3 py-1.5 font-semibold text-ink-muted"
        >
          {moreOpen ? t('settings.hide') : t('settings.more_currencies')}
          <ChevronDown size={14} strokeWidth={2.4} className={`transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
        </button>
      </section>

      {/*
        Быстрый выбор валют в форме операции. Раньше там были зашиты USD/EUR/UAH,
        и человеку с рублём приходилось каждый раз лезть в «Ещё».
      */}
      <section className="mx-4 mt-4">
        <SectionHead
          title={t('settings.quick_cur')}
          action={
            quickSlot !== null ? (
              <span className="text-brand-600 dark:text-brand-300">{t('settings.quick_cur_pick')}</span>
            ) : undefined
          }
        />
        <div className="rounded-3xl bg-surface-sunken p-1">
          <div className="grid grid-cols-3 gap-1">
            {quickCurrencies.map((code, i) => {
              const meta = getCurrency(code)
              const editing = quickSlot === i
              return (
                <button
                  key={i}
                  onClick={() => { hapticSelect(); setQuickSlot(editing ? null : i) }}
                  className={`flex flex-col items-center gap-0.5 rounded-[20px] py-2.5 text-ink transition ${
                    editing ? 'seg-on ring-2 ring-inset ring-brand-500' : 'seg-on'
                  }`}
                >
                  <span className="text-lg font-bold leading-none">{meta.symbol}</span>
                  <span className="text-[11px] text-ink-subtle">{code}</span>
                </button>
              )
            })}
          </div>

          {quickSlot !== null && (
            <div className="tab-enter mt-1 grid grid-cols-4 gap-1">
              {CURRENCIES.map((c) => {
                const current = quickCurrencies[quickSlot] === c.code
                return (
                  <button
                    key={c.code}
                    onClick={() => {
                      hapticSelect()
                      setQuickCurrency(quickSlot, c.code)
                      setQuickSlot(null)
                    }}
                    className={`flex flex-col items-center gap-0.5 rounded-2xl py-2 transition ${
                      current ? 'seg-on' : 'text-ink-muted active:bg-surface-raised'
                    }`}
                  >
                    <span className="text-sm font-bold leading-none">{c.symbol}</span>
                    <span className="text-[10px] text-ink-subtle">{c.code}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <p className="caption mt-2 px-1 leading-snug text-ink-subtle">{t('settings.quick_cur_hint')}</p>
      </section>

      <Segment
        title={t('settings.chart_style')}
        options={[
          { id: 'compact', label: t('settings.chart_compact') },
          { id: 'icons', label: t('settings.chart_icons') },
        ]}
        value={chartStyle}
        onChange={(id) => { hapticSelect(); setChartStyle(id) }}
      />

      {/* Шапка Главной: дата или цель, и какая цель */}
      <Segment
        title={t('settings.home_header')}
        options={[
          { id: 'date', label: t('settings.hh_date') },
          { id: 'goal', label: t('settings.hh_goal') },
        ]}
        value={homeHeaderMode}
        onChange={(id) => { hapticSelect(); setHomeHeaderMode(id) }}
      >
        {homeHeaderMode === 'goal' &&
          (goals.length === 0 ? (
            <p className="caption mt-2 px-1 text-ink-subtle">{t('settings.hh_no_goals')}</p>
          ) : (
            <Group className="mt-3" footer={t('settings.hh_pick_goal')}>
              {goals.map((g) => {
                const active = (homeHeaderGoalId ?? goals[0]?.id) === g.id
                return (
                  <Row
                    key={g.id}
                    icon={<Target size={18} strokeWidth={2} />}
                    title={g.title}
                    trailing={
                      active ? <Check size={18} strokeWidth={2.6} className="shrink-0 text-brand-500" aria-hidden /> : undefined
                    }
                    onClick={() => { hapticSelect(); setHomeHeaderGoalId(g.id) }}
                  />
                )
              })}
            </Group>
          ))}
      </Segment>

      {/* Лимиты по категориям — свёрнуты: список длинный, а нужен редко */}
      <section className="mx-4 mt-6">
        <Group>
          <Row
            title={t('settings.budgets')}
            value={
              <span className="text-ink-muted">
                {budgetsCount > 0 ? t('settings.budgets_active', { n: budgetsCount }) : t('settings.budgets_none')}
              </span>
            }
            trailing={
              <ChevronDown
                size={18}
                strokeWidth={2.2}
                className={`-mr-1 shrink-0 text-ink-subtle transition-transform ${budgetsOpen ? 'rotate-180' : ''}`}
              />
            }
            onClick={() => { hapticSelect(); setBudgetsOpen((v) => !v) }}
          />
          {budgetsOpen &&
            expenseCats.map((c) => (
              <BudgetRow
                key={c.id}
                icon={c.icon}
                name={catName(c.id, c.name)}
                color={c.color}
                value={budgets[c.id] ?? 0}
                onChange={(v) => setBudget(c.id, v)}
                currencySymbol={getCurrency(currency).symbol}
              />
            ))}
        </Group>
        {budgetsOpen && <p className="caption mt-2 px-1 leading-snug text-ink-subtle">{t('settings.budget_hint')}</p>}
        {budgetsCount > 0 && (
          <p className="caption mt-2 px-1 text-ink-subtle">
            {t('settings.active_limits_sum')}{' '}
            <span className="font-semibold tabular-nums text-ink">
              {formatMoney(Object.values(budgets).reduce((s, v) => s + v, 0), currency)}
            </span>
          </p>
        )}
      </section>

      {/* Свои категории */}
      <Group
        className="mx-4 mt-6"
        title={t('settings.custom_categories')}
        action={customCats.length > 0 ? t('settings.cats_count', { n: customCats.length }) : undefined}
      >
        {customCats.map((c) => (
          <Row
            key={c.id}
            lead={<CatBadge icon={c.icon} color={c.color} />}
            title={c.name}
            value={
              <span className="caption font-medium text-ink-subtle">
                {c.kind === 'income' ? t('settings.income_cats') : t('settings.expense_cats')}
              </span>
            }
            chevron
            onClick={() => { hapticSelect(); setEditor({ open: true, cat: c }) }}
          />
        ))}
        <Row
          icon={<Plus size={18} strokeWidth={2.4} className="text-brand-600 dark:text-brand-300" />}
          title={<span className="text-brand-600 dark:text-brand-300">{t('settings.add_category')}</span>}
          onClick={() => { hapticTap(); setEditor({ open: true, cat: null }) }}
        />
      </Group>

      {/* Данные */}
      <Group className="mx-4 mt-6" title={t('settings.data')}>
        <Row title={t('settings.total_ops')} value={<span className="text-ink-muted">{count.toLocaleString('ru-RU')}</span>} />
        <Row
          title={t('settings.demo')}
          subtitle={t('settings.demo_hint')}
          wrap
          trailing={<Toggle on={demoMode} />}
          onClick={() => { hapticSelect(); setDemoMode(!demoMode) }}
        />
        <ExportRow />
        <ImportRow />
        <Row
          title={<span className="text-expense-deep dark:text-expense-soft">{t('settings.clear_all')}</span>}
          onClick={handleClear}
        />
      </Group>

      {/* Уведомления */}
      <Group className="mx-4 mt-6" title={t('settings.notifications')}>
        <Row
          title={t('settings.reminders')}
          subtitle={t('settings.reminders_hint')}
          wrap
          trailing={<Toggle on={remindersEnabled} />}
          onClick={() => {
            hapticSelect()
            const next = !remindersEnabled
            setRemindersEnabled(next)
            setReminders(next) // сообщаем серверу — чтобы cron сразу учёл
          }}
        />
      </Group>

      {/* О приложении */}
      <Group className="mx-4 mt-6" title={t('settings.about')}>
        <div className="row">
          <p className="row-main text-[14px] leading-relaxed text-ink-muted">{t('settings.about_text')}</p>
        </div>
        <Row
          title={t('settings.in_telegram').replace(/:\s*$/, '')}
          value={
            <span className={tg.isInTelegram ? 'text-income-deep dark:text-income-light' : 'text-ink-subtle'}>
              {tg.isInTelegram ? t('common.yes') : t('common.no')}
            </span>
          }
        />
      </Group>

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

/** Заголовок раздела с тихим значением справа. */
function SectionHead({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
      <h2 className="section-title">{title}</h2>
      {action && <span className="caption shrink-0 text-ink-subtle">{action}</span>}
    </div>
  )
}

/** Раздел-переключатель: заголовок и сегмент из 2–3 вариантов. */
function Segment<T extends string>({
  title,
  options,
  value,
  onChange,
  children,
}: {
  title: string
  options: readonly { id: T; label: string }[]
  value: T
  onChange: (id: T) => void
  children?: ReactNode
}) {
  return (
    <section className="mx-4 mt-6">
      <SectionHead title={title} />
      <SegTrack active={value} role="radiogroup" aria-label={title}>
        {options.map((opt) => (
          <button
            key={opt.id}
            role="radio"
            aria-checked={value === opt.id}
            onClick={() => onChange(opt.id)}
            className={`seg-item ${value === opt.id ? 'seg-on' : ''}`}
          >
            {opt.label}
          </button>
        ))}
      </SegTrack>
      {children}
    </section>
  )
}

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
      aria-pressed={active}
      className={`flex flex-col items-center justify-center gap-0.5 rounded-[20px] py-2.5 transition-colors ${
        active ? 'seg-on' : 'text-ink-muted'
      }`}
    >
      <span className={`text-lg font-bold leading-none ${active ? 'text-ink' : ''}`}>{symbol}</span>
      <span className="text-[11px] font-semibold text-ink-subtle">{code}</span>
    </button>
  )
}

/** Значок категории — цвет здесь информация: по нему категорию узнают везде. */
function CatBadge({ icon, color }: { icon: string; color: string }) {
  return (
    <span
      className="mr-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
      style={{ background: color + '22', color }}
      aria-hidden
    >
      <CategoryIcon id={icon} size={18} />
    </span>
  )
}

/** Тумблер. Сам по себе не кнопка — нажимается вся строка. */
function Toggle({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={`relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors ${on ? 'bg-brand-500' : 'bg-surface-sunken'}`}
    >
      <span
        className={`absolute top-[3px] h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.2)] transition-all ${
          on ? 'left-[21px]' : 'left-[3px]'
        }`}
      />
    </span>
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
    <div className="row tab-enter">
      <CatBadge icon={icon} color={color} />
      <div className="row-main">
        <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink">{name}</span>
        <div className="flex shrink-0 items-center gap-1 rounded-full bg-surface-sunken px-3 py-1.5">
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
            className="w-20 bg-transparent text-right text-[15px] font-semibold tabular-nums text-ink placeholder:text-ink-subtle focus:outline-none"
          />
          <span className="caption text-ink-subtle">{currencySymbol}</span>
        </div>
      </div>
    </div>
  )
}

/**
 * Строка-действие раздела «Данные». Пока действие не запускали — шеврон;
 * после — короткий результат справа («Готово», «Найдено 12»).
 */
function ActionRow({ label, result, onClick }: { label: string; result?: string; onClick?: () => void }) {
  return (
    <Row
      title={label}
      value={result !== undefined ? <span className="text-ink-muted">{result}</span> : undefined}
      chevron={!!onClick && result === undefined}
      onClick={onClick}
    />
  )
}

/**
 * Выгрузка операций в CSV.
 *
 * В Telegram файл присылает бот: скачивание прямо из webview работает не везде.
 * В обычном браузере (и в разработке) — привычная ссылка на скачивание.
 */
function ExportRow() {
  const transactions = useStore((s) => s.transactions)
  const currency = useStore((s) => s.currency)
  const categories = useStore(selectAllCategories)
  const [state, setState] = useState<'idle' | 'busy' | 'ok' | 'blocked' | 'failed'>('idle')
  const t = useT()
  const catName = useCatName()

  const result =
    state === 'busy'
      ? '…'
      : state === 'ok'
        ? t('settings.export_done')
        : state === 'blocked'
          ? t('settings.export_blocked')
          : state === 'failed'
            ? t('settings.export_failed')
            : undefined

  const run = async () => {
    if (state === 'busy' || transactions.length === 0) return
    hapticTap()
    setState('busy')

    const csv = buildCsv(transactions, {
      headers: [
        t('settings.csv_date'),
        t('settings.csv_type'),
        t('settings.csv_category'),
        t('settings.csv_amount'),
        t('settings.csv_currency'),
        t('settings.csv_note'),
        t('settings.csv_tags'),
      ],
      incomeLabel: t('common.income'),
      expenseLabel: t('common.expense'),
      categoryName: (id) => catName(id, categories.find((c) => c.id === id)?.name ?? id),
      fallbackCurrency: currency,
    })
    const filename = `koshel-${new Date().toISOString().slice(0, 10)}.csv`

    if (!tg.isInTelegram) {
      // BOM здесь дописываем сами: в Telegram это делает воркер.
      const blob = new Blob([String.fromCharCode(0xfeff) + csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      // Ссылку обязательно вставить в документ: по отсоединённому элементу
      // скачивание не запускается в части браузеров.
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setState('ok')
      hapticNotify('success')
      return
    }

    const res = await exportTransactions(csv, filename, t('settings.export_caption', { n: transactions.length }))
    setState(res === 'ok' ? 'ok' : res === 'blocked' ? 'blocked' : 'failed')
    hapticNotify(res === 'ok' ? 'success' : 'error')
  }

  return (
    <ActionRow
      label={t('settings.export')}
      result={result}
      onClick={transactions.length > 0 ? run : undefined}
    />
  )
}

/**
 * Загрузка операций из CSV.
 *
 * В два касания, без отдельного окна подтверждения: сначала файл разбирается и
 * строка показывает, что нашлось, вторым касанием операции добавляются. Молча
 * вливать чужой файл в историю нельзя, а полноценная шторка предпросмотра здесь
 * была бы тяжелее самой задачи.
 */
function ImportRow() {
  const categories = useStore(selectAllCategories)
  const currency = useStore((s) => s.currency)
  const importTransactions = useStore((s) => s.importTransactions)
  const inputRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<{ rows: ParsedRow[]; skipped: number } | null>(null)
  const [done, setDone] = useState<{ added: number; duplicates: number } | null>(null)
  const t = useT()
  const catName = useCatName()

  const pick = () => {
    hapticTap()
    setDone(null)
    inputRef.current?.click()
  }

  const read = async (file: File) => {
    const text = await file.text()
    const res = parseTransactionsCsv(text, {
      categories,
      categoryName: (c) => catName(c.id, c.name),
      fallbackCurrency: currency,
    })
    if (res.rows.length === 0) {
      setPending(null)
      setDone({ added: 0, duplicates: 0 })
      hapticNotify('error')
      return
    }
    setPending(res)
    hapticNotify('warning')
  }

  const commit = () => {
    if (!pending) return
    hapticNotify('success')
    setDone(importTransactions(pending.rows))
    setPending(null)
  }

  const result = pending
    ? t('settings.import_found', { n: pending.rows.length })
    : done
      ? done.added > 0
        ? t('settings.import_added', { n: done.added })
        : t('settings.import_none')
      : undefined

  return (
    <>
      <ActionRow
        label={pending ? t('settings.import_confirm') : t('settings.import')}
        result={result}
        onClick={pending ? commit : pick}
      />
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv,text/plain"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          // Сбрасываем значение: иначе повторный выбор того же файла не сработает.
          e.target.value = ''
          if (f) void read(f)
        }}
      />
    </>
  )
}
