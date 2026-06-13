import { type ReactNode } from 'react'
import { hapticTap } from '../../lib/telegram'
import { ACCENT_CHIP, ACCENT_GLOW, type Accent } from './accent'

interface Props {
  icon: ReactNode
  title: string
  /** Подпись/метрика под заголовком. */
  subtitle?: string
  /** Бейдж в правом верхнем углу (например, счётчик / «Скоро»). */
  badge?: ReactNode
  accent?: Accent
  onClick?: () => void
  /** Неактивная плитка-заглушка (De-Fi «Скоро»): приглушённая, не кликается. */
  disabled?: boolean
}

/**
 * Крупная квадратная бенто-плитка для хаба «Награды». Атмосферная подсветка в
 * углу + крупный чип-иконка → не выглядит пустой. `aspect-square` + 2 колонки = квадраты.
 */
export function Tile({ icon, title, subtitle, badge, accent = 'brand', onClick, disabled }: Props) {
  return (
    <button
      onClick={disabled ? undefined : () => { hapticTap(); onClick?.() }}
      disabled={disabled}
      className={`relative flex aspect-square w-full flex-col justify-between overflow-hidden rounded-4xl bg-surface-raised p-4 text-left shadow-soft transition dark:shadow-soft-dark ${
        disabled ? 'opacity-55' : 'active:scale-[0.98]'
      }`}
    >
      {/* Атмосферная подсветка в углу */}
      <span aria-hidden className={`pointer-events-none absolute -right-7 -top-7 h-24 w-24 rounded-full blur-2xl ${ACCENT_GLOW[accent]}`} />

      <div className="relative flex items-start justify-between">
        <span className={`flex h-14 w-14 items-center justify-center rounded-3xl ${ACCENT_CHIP[accent]}`}>
          {icon}
        </span>
        {badge}
      </div>
      <div className="relative">
        <div className="text-[15px] font-bold leading-tight text-ink">{title}</div>
        {subtitle && <div className="mt-1 text-[12px] leading-snug text-ink-subtle">{subtitle}</div>}
      </div>
    </button>
  )
}
