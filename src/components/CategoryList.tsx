import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import {
  useStore,
  selectByCategoryAccount,
  selectTransactionsByCategory,
  selectBudgetStatuses,
  selectAnalyticsCurrency,
  type CategoryAggregate,
  type BudgetStatus,
  type Transaction,
} from '../store/transactions'
import { formatMoney, formatShortDate } from '../lib/format'
import { opsWord, useCatName, useT } from '../lib/i18n'
import type { Currency } from '../lib/currencies'
import { hapticTap, hapticSelect } from '../lib/telegram'
import { CategoryIcon } from './icons/CategoryIcon'
import { Reveal } from './ui/Reveal'
import { replay } from '../lib/fx'
import { isFresh, useTouchedAt } from '../lib/touched'
import { showToast } from '../lib/toast'

/**
 * Категории периода — по одной группе на доходы и расходы.
 *
 * 2.0: раньше каждая категория была отдельной карточкой с тенью и цветной
 * пилюлей-счётчиком у названия: пятнадцать одинаковых коробок, и на каждой по
 * три цветных пятна (значок, пилюля, сумма красным). Теперь это один список с
 * тонкими разделителями. Цвет остался там, где он — информация: значок
 * категории и полоска доли (по ним категорию узнают на диаграмме). Суммы —
 * обычным цветом текста: знак «+» у дохода и заголовок раздела и так говорят,
 * что это, а красный на каждой строке превращал список расходов в тревогу.
 */
export const CategoryList = memo(function CategoryList({ onEditTx }: { onEditTx: (t: Transaction) => void }) {
  const expenses = useStore((s) => selectByCategoryAccount(s, 'expense'))
  const incomes = useStore((s) => selectByCategoryAccount(s, 'income'))
  const budgets = useStore(selectBudgetStatuses)
  // Пересобираем карту только когда изменились сами бюджеты, иначе каждая строка
  // получала бы новый объект budget и memo на ней не срабатывал бы.
  const budgetByCat = useMemo(() => new Map(budgets.map((b) => [b.categoryId, b])), [budgets])
  const t = useT()
  // Каскад строк и рост полос — только при первом показе списка. Потом класс
  // снимается: иначе строка, сменившая место (React переставляет узел), снова
  // проигрывала бы появление с задержкой по своему номеру.
  const intro = useIntro()

  if (expenses.length === 0 && incomes.length === 0) {
    return <EmptyState />
  }

  return (
    <div className="mt-1 px-4">
      {expenses.length > 0 && (
        <Section title={t('common.expense')} cats={expenses} kind="expense">
          {expenses.map((c, i) => (
            <CategoryRow
              key={c.categoryId}
              cat={c}
              budget={budgetByCat.get(c.categoryId)}
              onEditTx={onEditTx}
              intro={intro ? i : -1}
            />
          ))}
        </Section>
      )}

      {incomes.length > 0 && (
        <Section title={t('common.income')} cats={incomes} kind="income">
          {incomes.map((c, i) => (
            <CategoryRow key={c.categoryId} cat={c} onEditTx={onEditTx} intro={intro ? expenses.length + i : -1} />
          ))}
        </Section>
      )}

      {/* Запас снизу, чтобы плавающая панель не закрывала последнюю строку. */}
      <div className="h-28" />
    </div>
  )
})

/** Каскад уже показывали в этой сессии — повторно на каждом заходе он надоедает. */
let introShown = false

/** true первые ~0,8 с после самого первого показа списка за сессию. */
function useIntro(): boolean {
  const [intro, setIntro] = useState(() => !introShown)
  useEffect(() => {
    if (!intro) return
    introShown = true
    const id = setTimeout(() => setIntro(false), 800)
    return () => clearTimeout(id)
  }, [intro])
  return intro
}

/**
 * Раздел: заголовок с итогом и группа строк. Расходы теперь идут первыми —
 * на Главную приходят посмотреть, куда ушли деньги, а доходов у большинства
 * одна-две строки.
 */
function Section({
  title,
  cats,
  kind,
  children,
}: {
  title: string
  cats: CategoryAggregate[]
  kind: 'income' | 'expense'
  children: React.ReactNode
}) {
  // Суммы по валютам: в режиме «Все» категории могут быть в разных валютах —
  // не смешиваем их в одно число, а показываем по каждой (722 ₴ · 80 €).
  const byCur = new Map<Currency, number>()
  for (const c of cats) byCur.set(c.currency, (byCur.get(c.currency) ?? 0) + c.amount)
  const parts = [...byCur.entries()]

  return (
    <section className="mt-5 first:mt-2">
      <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
        <h2 className="section-title">{title}</h2>
        <span className="caption tabular-nums text-ink-muted">
          {parts.map(([cur, amount], i) => (
            <span key={cur}>
              {i > 0 && <span className="text-ink-subtle"> · </span>}
              {kind === 'income' ? '+' : ''}
              {formatMoney(amount, cur).replace('−', '')}
            </span>
          ))}
        </span>
      </div>
      <div className="card grouped overflow-hidden">{children}</div>
    </section>
  )
}

const CategoryRow = memo(function CategoryRow({
  cat,
  budget,
  onEditTx,
  intro,
}: {
  cat: CategoryAggregate
  budget?: BudgetStatus
  onEditTx: (t: Transaction) => void
  /** Номер строки для каскада при первом показе; -1 — без анимации появления. */
  intro: number
}) {
  const [open, setOpen] = useState(false)
  const currency = useStore(selectAnalyticsCurrency)
  const lang = useStore((s) => s.lang)
  const tr = useT()
  const catName = useCatName()

  // Сюда только что легла операция — строка вспыхивает фоном акцента.
  const rowRef = useRef<HTMLButtonElement>(null)
  const touchedAt = useTouchedAt(cat.categoryId)
  useEffect(() => {
    if (isFresh(touchedAt)) replay(rowRef.current, 'flash-row')
  }, [touchedAt])

  // Каскад: шаг 24 мс, не больше шести ступеней — дальше строки встают разом.
  const delay = intro >= 0 ? Math.min(intro, 5) * 24 : -1

  const toggle = () => {
    hapticSelect()
    setOpen((v) => !v)
  }

  const limitTone =
    budget?.level === 'over'
      ? 'font-semibold text-expense-deep dark:text-expense-soft'
      : budget?.level === 'warn'
        ? 'font-semibold text-amber-700 dark:text-amber-400'
        : 'text-ink-subtle'

  return (
    <>
      <button
        ref={rowRef}
        type="button"
        onClick={toggle}
        className={`row ${delay >= 0 ? 'rise-in-d' : ''}`}
        style={delay >= 0 ? ({ '--d': delay } as React.CSSProperties) : undefined}
        aria-expanded={open}
      >
        <span
          className="mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ background: cat.color + '22', color: cat.color }}
        >
          <CategoryIcon id={cat.icon} size={20} />
        </span>
        <span className="row-main flex-col items-stretch gap-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className="truncate text-[15px] font-semibold text-ink">{catName(cat.categoryId, cat.name)}</span>
            <span className="shrink-0 text-[15px] font-semibold tabular-nums text-ink">
              {cat.kind === 'income' ? '+' : ''}
              {formatMoney(cat.amount, cat.currency).replace('−', '')}
            </span>
          </span>
          <span className="flex items-baseline justify-between gap-3">
            <span className="caption-sm tabular-nums text-ink-subtle">
              {cat.count} {opsWord(lang, cat.count)} · {cat.pct.toFixed(0)}%
            </span>
            {budget && (
              <span className={`caption-sm shrink-0 tabular-nums ${limitTone}`}>
                {tr('cat.limit_line', {
                  limit: formatMoney(budget.limit, currency),
                  pct: Math.round(budget.ratio * 100),
                })}
              </span>
            )}
          </span>
          {/* Доля категории в разделе — тонкой полосой её цвета: по этому цвету
              категорию находят на диаграмме в Аналитике. */}
          <span className="mt-0.5 block h-[3px] w-full overflow-hidden rounded-full bg-surface-sunken">
            <span
              className={`block h-full rounded-full transition-[width] duration-500 ${delay >= 0 ? 'grow-x-d' : ''}`}
              style={
                {
                  width: `${Math.max(2, Math.min(cat.pct, 100))}%`,
                  background: cat.color,
                  '--d': delay + 80,
                } as React.CSSProperties
              }
            />
          </span>
        </span>
      </button>

      {/* Раскрытие без framer: высота едет через grid-template-rows (Reveal),
          операции в DOM сразу. Пока строка закрыта, список не смонтирован —
          его селектор не считается (см. RowTransactions). */}
      <Reveal open={open}>
        <RowTransactions cat={cat} currency={currency} onEditTx={onEditTx} />
      </Reveal>
    </>
  )
})

/**
 * Список операций раскрытой категории. Вынесен отдельным компонентом ради
 * подписки: пока строка свёрнута, он не смонтирован — и селектор, проходящий по
 * всем операциям периода, для неё не считается. Раньше эта работа выполнялась
 * для КАЖДОЙ категории на каждое изменение стора, даже для свёрнутых.
 */
function RowTransactions({
  cat,
  currency,
  onEditTx,
}: {
  cat: CategoryAggregate
  currency: Currency
  onEditTx: (t: Transaction) => void
}) {
  const transactions = useStore((s) => selectTransactionsByCategory(s, cat.categoryId))
  const removeTransaction = useStore((s) => s.removeTransaction)
  const restoreTransaction = useStore((s) => s.restoreTransaction)
  const tr = useT()
  const catName = useCatName()

  // Удаление крестиком — с возможностью вернуть: промахнуться по маленькой
  // кнопке легко, а операция пропадала молча.
  const remove = (t: Transaction) => {
    hapticTap('medium')
    removeTransaction(t.id)
    showToast({
      icon: 'undo',
      text: tr('toast.deleted'),
      sub: `${catName(cat.categoryId, cat.name)} · ${formatMoney(t.amount, t.currency ?? currency)}`,
      duration: 6000,
      action: { label: tr('toast.restore'), run: () => restoreTransaction(t) },
    })
  }

  return (
    <div className="bg-surface-sunken/50 pb-1 pl-[68px] pr-2">
      {transactions.map((t) => (
        <div key={t.id} className="flex items-center gap-2 border-t border-hairline first:border-t-0">
          <button
            type="button"
            onClick={() => { hapticSelect(); onEditTx(t) }}
            className="flex min-w-0 flex-1 items-center justify-between gap-3 py-2.5 text-left active:opacity-60"
            aria-label={tr('common.edit')}
          >
            <span className="min-w-0">
              <span className="block truncate text-[14px] text-ink">{t.note || formatShortDate(t.date)}</span>
              {t.note && <span className="caption-sm block text-ink-subtle">{formatShortDate(t.date)}</span>}
            </span>
            <span className="shrink-0 text-[14px] font-semibold tabular-nums text-ink">
              {cat.kind === 'income' ? '+' : ''}
              {formatMoney(t.amount, t.currency ?? currency).replace('−', '')}
            </span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              remove(t)
            }}
            className="press flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-subtle active:text-expense"
            aria-label={tr('common.delete')}
          >
            <X size={15} strokeWidth={2.4} />
          </button>
        </div>
      ))}
    </div>
  )
}

/**
 * Пусто за период. Без большой иконки в круге — картинка без цифр ничего не
 * сообщает. Главное действие здесь — «+» в нижней панели, поэтому кнопка демо —
 * второстепенная и нейтральная.
 */
function EmptyState() {
  const setDemoMode = useStore((s) => s.setDemoMode)
  const t = useT()

  return (
    <div className="px-4 pb-28 pt-2">
      <div className="card px-5 py-6">
        <h3 className="text-[17px] font-bold text-ink">{t('empty.title')}</h3>
        <p className="mt-1.5 text-[14px] leading-relaxed text-ink-muted">{t('empty.text')}</p>
        <button
          type="button"
          onClick={() => { hapticTap(); setDemoMode(true) }}
          className="mt-4 rounded-full bg-surface-sunken px-4 py-2.5 text-[14px] font-semibold text-ink transition-transform active:scale-95"
        >
          {t('empty.enable_demo')}
        </button>
      </div>
    </div>
  )
}
