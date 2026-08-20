import { hapticSelect } from '../lib/telegram'
import { useT } from '../lib/i18n'

const TABS = [
  { id: 'overview', label: 'ov.tab' },
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
    <div className="mx-4 mt-4 flex overflow-x-auto rounded-full bg-surface-sunken p-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {TABS.map((tab) => {
        const active = value === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => {
              hapticSelect()
              onChange(tab.id)
            }}
            className={`relative shrink-0 grow basis-0 whitespace-nowrap rounded-full px-1.5 py-2 text-[12px] font-semibold transition-colors ${
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
