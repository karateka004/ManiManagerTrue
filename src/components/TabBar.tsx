import type { ComponentType } from 'react'
import { Home, PieChart, User, Rocket, Plus, type LucideProps } from 'lucide-react'
import { hapticSelect, hapticTap } from '../lib/telegram'
import { useT } from '../lib/i18n'

// 'settings' остаётся валидным значением вкладки (рендерится в App), но в нижней
// панели его НЕТ — Настройки открываются из шапки Профиля (иконка-шестерёнка).
// Графики объединены в Аналитику (сегмент «Динамика») — отдельной вкладки нет.
export type Tab = 'home' | 'analytics' | 'rewards' | 'profile' | 'settings'

interface Props {
  value: Tab
  onChange: (t: Tab) => void
  /** Круглая кнопка справа от панели: добавить операцию с любой вкладки. */
  onAdd: () => void
}

const ITEMS: { id: Tab; labelKey: string; icon: ComponentType<LucideProps> }[] = [
  { id: 'home', labelKey: 'nav.home', icon: Home },
  { id: 'analytics', labelKey: 'nav.analytics', icon: PieChart },
  // Ракета, а не подарок: вкладка теперь про прогресс (уровень, серия, задания),
  // а награды — лишь одна из её частей.
  { id: 'rewards', labelKey: 'nav.rewards', icon: Rocket },
  { id: 'profile', labelKey: 'nav.profile', icon: User },
]

/**
 * Плавающая нижняя панель: пилюля с вкладками + отдельная круглая кнопка «+».
 *
 * Панель НЕ прижата к краю экрана и не тянется на всю ширину — она висит над
 * контентом с отступом, полупрозрачная и с backdrop-blur, поэтому лента операций
 * просвечивает под ней. Так же устроены нижние панели в Telegram и mono.
 *
 * Подсветка активной вкладки — одна капсула, которая ЕЗДИТ между позициями
 * (translateX по индексу), а не четыре независимых фона: переход читается как
 * движение, а не как перекраска. Ширина капсулы жёстко w-1/4, потому что вкладок
 * ровно четыре и они равной ширины (flex-1); при изменении их числа надо поправить
 * и ширину.
 */
export function TabBar({ value, onChange, onAdd }: Props) {
  const t = useT()
  const activeIndex = ITEMS.findIndex((i) => i.id === value)

  return (
    <div
      // pointer-events-none на обёртке: клики проходят сквозь пустое место
      // по бокам от панели, иначе невидимая полоса перехватывала бы тапы.
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-3"
      style={{ paddingBottom: 'calc(var(--safe-bottom, 0px) + 10px)' }}
    >
      <div className="flex w-full max-w-md items-center gap-2.5">
        <nav className="pointer-events-auto min-w-0 flex-1 rounded-full border border-black/[0.06] bg-surface-raised/80 p-1.5 shadow-fab backdrop-blur-xl dark:border-white/10 dark:shadow-raised-dark">
          <div className="relative flex items-stretch">
            {activeIndex >= 0 && (
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 w-1/4 rounded-full bg-brand-500/10 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] dark:bg-brand-500/20 motion-reduce:transition-none"
                style={{ transform: `translateX(${activeIndex * 100}%)` }}
              />
            )}

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
                  aria-current={active ? 'page' : undefined}
                  className={`relative flex min-w-0 flex-1 flex-col items-center gap-0.5 py-1 transition-colors ${
                    active ? 'text-brand-600 dark:text-brand-300' : 'text-ink-subtle'
                  }`}
                >
                  <Icon size={21} strokeWidth={active ? 2.4 : 2} />
                  <span className="max-w-full truncate text-[10px] font-semibold">{t(item.labelKey)}</span>
                </button>
              )
            })}
          </div>
        </nav>

        <button
          onClick={() => {
            hapticTap('medium')
            onAdd()
          }}
          aria-label={t('nav.add')}
          className="pointer-events-auto flex h-[56px] w-[56px] shrink-0 items-center justify-center rounded-full bg-brand-500 text-white shadow-fab transition-transform active:scale-95"
        >
          <Plus size={26} strokeWidth={2.75} />
        </button>
      </div>
    </div>
  )
}
