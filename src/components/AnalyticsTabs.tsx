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
  // Пять сегментов в Manrope на экране 320 px не влезали: «Календарь» уезжал за
  // край и оставался доступен только прокруткой, о которой ничто не намекает.
  // Ниже 360 px ужимаем шрифт и поля — от 360 px всё помещается и так.
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
            className={`relative shrink-0 grow basis-0 whitespace-nowrap rounded-full px-1.5 py-2 text-[12px] font-semibold transition-colors max-[359px]:px-1 max-[359px]:text-[11px] ${
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
