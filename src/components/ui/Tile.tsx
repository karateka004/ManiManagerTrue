import { type ReactNode } from 'react'
import { hapticTap } from '../../lib/telegram'
import { ACCENT_CHIP, type Accent } from './accent'

interface Props {
  icon: ReactNode
  title: string
  /** Подпись/метрика под заголовком. */
  subtitle?: string
  /** Бейдж в правом верхнем углу (например, счётчик к получению). */
  badge?: ReactNode
  accent?: Accent
  onClick?: () => void
}

/**
 * Крупная квадратная бенто-плитка для хаба «Награды».
 * `aspect-square` + 2 колонки в гриде = ровные квадраты.
 */
export function Tile({ icon, title, subtitle, badge, accent = 'brand', onClick }: Props) {
  return (
    <button
      onClick={() => { hapticTap(); onClick?.() }}
      className="relative flex aspect-square w-full flex-col justify-between overflow-hidden rounded-4xl bg-surface-raised p-4 text-left shadow-soft transition active:scale-[0.98] dark:shadow-soft-dark"
    >
      <div className="flex items-start justify-between">
        <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${ACCENT_CHIP[accent]}`}>
          {icon}
        </span>
        {badge}
      </div>
      <div>
        <div className="text-[15px] font-bold leading-tight text-ink">{title}</div>
        {subtitle && <div className="mt-1 text-[12px] leading-snug text-ink-subtle">{subtitle}</div>}
      </div>
    </button>
  )
}
