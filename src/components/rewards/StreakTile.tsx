import { Flame } from 'lucide-react'
import { useStore } from '../../store/transactions'
import { useT } from '../../lib/i18n'
import { hapticNotify } from '../../lib/telegram'
import { canClaim, effectiveStreak } from '../../lib/streak'

/** Серия дня как квадратная плитка хаба «Награды». Тап = забрать (если можно). */
export function StreakTile() {
  const streak = useStore((s) => s.streak)
  const claimDailyStreak = useStore((s) => s.claimDailyStreak)
  const t = useT()

  const active = effectiveStreak(streak)
  const claimable = canClaim(streak)

  const onClick = () => {
    if (!claimable) return
    if (claimDailyStreak()) hapticNotify('success')
  }

  return (
    <button
      onClick={onClick}
      disabled={!claimable}
      className={`relative flex aspect-square w-full flex-col justify-between overflow-hidden rounded-4xl p-4 text-left shadow-soft transition ${
        claimable
          ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white active:scale-[0.98]'
          : 'bg-surface-raised dark:shadow-soft-dark'
      }`}
    >
      {!claimable && (
        <span aria-hidden className="pointer-events-none absolute -right-7 -top-7 h-24 w-24 rounded-full bg-amber-400/25 blur-2xl" />
      )}

      <div className="relative flex items-start justify-between">
        <span
          className={`flex h-14 w-14 items-center justify-center rounded-3xl ${
            claimable ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300'
          }`}
        >
          <Flame size={26} strokeWidth={2.2} fill={active > 0 ? 'currentColor' : 'none'} />
        </span>
        {claimable ? (
          <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-extrabold text-orange-600">
            {t('quest.claim')}
          </span>
        ) : (
          <span className="rounded-full bg-surface-sunken px-2 py-1 text-[11px] font-bold text-ink-subtle">
            ✓
          </span>
        )}
      </div>

      <div className="relative">
        <div className={`text-[15px] font-bold leading-tight ${claimable ? 'text-white' : 'text-ink'}`}>
          {t('streak.title')}
        </div>
        <div className={`mt-1 text-[12px] leading-snug ${claimable ? 'text-white/85' : 'text-ink-subtle'}`}>
          {active} {t('roadpass.days_short')} · {t('roadpass.streak_record', { best: streak.best })}
        </div>
      </div>
    </button>
  )
}
