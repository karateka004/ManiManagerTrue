import { hapticSelect } from '../lib/telegram'
import { useT } from '../lib/i18n'

const TABS = [
  { id: 'expense', label: 'common.expense' },
  { id: 'income',  label: 'common.income' },
  { id: 'dynamics', label: 'analytics.dynamics' },
  { id: 'calendar', label: 'cal.tab' },
] as const

export type AnalyticsTab = typeof TABS[number]['id']

interface Props {
  value: AnalyticsTab
  onChange: (t: AnalyticsTab) => void
}

export function AnalyticsTabs({ value, onChange }: Props) {
  const t = useT()
  return (
    <div className="mx-4 mt-4 grid grid-cols-4 gap-1 rounded-full bg-surface-sunken p-1">
      {TABS.map((tab) => {
        const active = value === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => {
              hapticSelect()
              onChange(tab.id)
            }}
            className={`relative rounded-full py-2 text-[13px] font-semibold transition-colors ${
              active ? 'bg-surface-raised text-ink shadow-soft dark:shadow-soft-dark' : 'text-ink-muted'
            }`}
          >
            {t(tab.label)}
          </button>
        )
      })}
    </div>
  )
}
