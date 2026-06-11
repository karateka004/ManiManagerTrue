import type { ComponentType } from 'react'
import { Home, PieChart, BarChart3, User, Gift, type LucideProps } from 'lucide-react'
import { hapticSelect } from '../lib/telegram'
import { useT } from '../lib/i18n'

// 'settings' остаётся валидным значением вкладки (рендерится в App), но в нижней
// панели его НЕТ — Настройки открываются из шапки Профиля (иконка-шестерёнка).
export type Tab = 'home' | 'analytics' | 'charts' | 'rewards' | 'profile' | 'settings'

interface Props {
  value: Tab
  onChange: (t: Tab) => void
}

const ITEMS: { id: Tab; labelKey: string; icon: ComponentType<LucideProps> }[] = [
  { id: 'home', labelKey: 'nav.home', icon: Home },
  { id: 'analytics', labelKey: 'nav.analytics', icon: PieChart },
  { id: 'charts', labelKey: 'nav.charts', icon: BarChart3 },
  { id: 'rewards', labelKey: 'nav.rewards', icon: Gift },
  { id: 'profile', labelKey: 'nav.profile', icon: User },
]

export function TabBar({ value, onChange }: Props) {
  const t = useT()
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-surface-sunken bg-surface-raised/95 backdrop-blur"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
    >
      <div className="mx-auto flex max-w-md items-center justify-around py-2">
        {ITEMS.map((item) => {
          const active = value === item.id
          const Icon = item.icon
          return (
            <button
              key={item.id}
              onClick={() => {
                hapticSelect()
                onChange(item.id)
              }}
              className={`flex flex-1 flex-col items-center gap-0.5 py-1.5 active:opacity-70 ${
                active ? 'text-brand-500' : 'text-ink-subtle'
              }`}
            >
              <Icon size={22} strokeWidth={active ? 2.4 : 2} />
              <span className="text-[10px] font-semibold">{t(item.labelKey)}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
