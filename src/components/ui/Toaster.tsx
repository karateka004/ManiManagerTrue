import { Check, Coins, Gift, Link2, RotateCcw } from 'lucide-react'
import { hideToast, useToast, type Toast } from '../../lib/toast'
import { hapticTap } from '../../lib/telegram'

const ICONS: Record<NonNullable<Toast['icon']>, typeof Check> = {
  check: Check,
  coins: Coins,
  link: Link2,
  undo: RotateCcw,
  gift: Gift,
}

/**
 * Место для тоста — над плавающей панелью вкладок. Инверсная плашка (тёмная
 * в светлой теме и светлая в тёмной): она лежит поверх контента и не должна
 * сливаться с карточками под ней.
 *
 * Появление и уход — CSS (.toast-in / .toast-out): текст тоста — информация,
 * его нельзя оставить невидимым из-за незапустившейся анимации.
 */
export function Toaster() {
  const toast = useToast()
  if (!toast) return null
  const Icon = toast.icon ? ICONS[toast.icon] : null

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[90] flex justify-center px-3"
      style={{ bottom: 'calc(var(--safe-bottom, 0px) + 86px)' }}
      role="status"
      aria-live="polite"
    >
      <div
        key={toast.id}
        className={`pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl bg-ink py-2.5 pl-3.5 pr-2 text-surface-raised shadow-fab ${
          toast.leaving ? 'toast-out' : 'toast-in'
        }`}
        onClick={() => hideToast(toast.id)}
      >
        {Icon && (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-raised/15">
            <Icon size={15} strokeWidth={2.6} />
          </span>
        )}
        <div className="min-w-0 flex-1 py-0.5">
          <div className="truncate text-[14px] font-semibold leading-snug">{toast.text}</div>
          {toast.sub && <div className="truncate text-[12px] leading-snug opacity-70">{toast.sub}</div>}
        </div>
        {toast.action && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              hapticTap()
              toast.action!.run()
              hideToast(toast.id)
            }}
            className="press shrink-0 rounded-xl px-3 py-2 text-[14px] font-bold text-brand-300 dark:text-brand-700"
          >
            {toast.action.label}
          </button>
        )}
      </div>
    </div>
  )
}
