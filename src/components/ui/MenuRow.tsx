import { type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { hapticTap } from '../../lib/telegram'
import { ACCENT_CHIP, type Accent } from './accent'

interface Props {
  icon: ReactNode
  title: ReactNode
  hint?: string
  accent?: Accent
  /** Содержимое справа: бейдж и т.п. По умолчанию — шеврон. */
  trailing?: ReactNode
  onClick?: () => void
}

/**
 * Строка-ряд с иконкой-чипом, заголовком, подсказкой и хвостом (бейдж/шеврон).
 * Заменяет дублированную inline-разметку «менюшек» в Профиле.
 */
export function MenuRow({ icon, title, hint, accent = 'brand', trailing, onClick }: Props) {
  return (
    <button
      onClick={() => { hapticTap(); onClick?.() }}
      className="flex w-full items-center gap-3 rounded-3xl bg-surface-sunken/60 p-3 text-left active:scale-[0.99]"
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${ACCENT_CHIP[accent]}`}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-ink">{title}</div>
        {hint && <div className="text-[11px] text-ink-subtle">{hint}</div>}
      </div>
      {trailing ?? <ChevronRight size={18} className="text-ink-subtle" />}
    </button>
  )
}
