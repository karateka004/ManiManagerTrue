import { useState } from 'react'
import { BalanceCard } from '../components/BalanceCard'
import { PeriodSwitcher } from '../components/PeriodSwitcher'
import { CategoryList } from '../components/CategoryList'
import { BudgetAlert } from '../components/BudgetAlert'
import { FabButtons } from '../components/FabButtons'
import { AddTransactionSheet } from '../components/AddTransactionSheet'
import type { CategoryKind } from '../store/categories'

export function HomePage() {
  const [sheet, setSheet] = useState<{ open: boolean; kind: CategoryKind }>({
    open: false,
    kind: 'expense',
  })

  return (
    <div className="pb-24">
      <Header />
      <PeriodSwitcher />
      <BalanceCard />
      <BudgetAlert />
      <CategoryList />

      <FabButtons
        onAddExpense={() => setSheet({ open: true, kind: 'expense' })}
        onAddIncome={() => setSheet({ open: true, kind: 'income' })}
      />

      <AddTransactionSheet
        open={sheet.open}
        kind={sheet.kind}
        onClose={() => setSheet((s) => ({ ...s, open: false }))}
      />
    </div>
  )
}

function Header() {
  const h = new Date().getHours()
  const greeting =
    h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер'

  return (
    <div className="flex items-center justify-between px-6 pt-6 pb-2">
      <div>
        <div className="text-xs font-semibold uppercase tracking-widest text-ink-subtle">Кошель</div>
        <div className="mt-0.5 text-base font-bold text-ink">{greeting} 👋</div>
      </div>
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-lg">
        🌿
      </div>
    </div>
  )
}
