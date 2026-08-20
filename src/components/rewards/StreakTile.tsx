import { type CSSProperties } from 'react'
import { Check } from 'lucide-react'
import { useStore } from '../../store/transactions'
import { useT } from '../../lib/i18n'
import { hapticNotify } from '../../lib/telegram'
import { canClaim, effectiveStreak } from '../../lib/streak'
import { ACCENT_RGB } from '../ui/accent'
import { TileBadge } from '../ui/Tile'
import { TileScene } from './TileScene'

/**
 * Серия дня — плитка хаба «Прогресс» с той же обложкой, что у остальных, но со
 * своей логикой: тап = забрать награду, если она доступна.
 *
 * Разметка повторяет Tile вручную, а не переиспользует его, потому что у горячего
 * состояния поле обложки заливается сплошным градиентом и пламя становится белым —
 * параметризовать это в общем Tile значило бы протащить в него частный случай.
 */
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
      style={{ '--tile-a': claimable ? '255 255 255' : ACCENT_RGB.orange } as CSSProperties}
      className={`relative flex min-h-[154px] w-full flex-col overflow-hidden rounded-4xl bg-surface-raised text-left shadow-soft transition dark:shadow-soft-dark ${
        claimable ? 'active:scale-[0.98]' : ''
      }`}
    >
      <div
        className={`relative h-[106px] overflow-hidden ${
          claimable ? 'bg-gradient-to-br from-amber-400 to-orange-500' : 'tile-art'
        }`}
      >
        <TileScene scene="flame" />
        <div className="absolute right-2.5 top-2.5">
          {claimable ? (
            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-extrabold text-orange-600 shadow-soft">
              {t('quest.claim')}
            </span>
          ) : (
            <TileBadge><Check size={13} strokeWidth={3} /></TileBadge>
          )}
        </div>
      </div>

      <div className="px-4 pb-4 pt-3">
        <div className="text-[16px] font-bold leading-tight text-ink">{t('streak.title')}</div>
        <div className="mt-1 text-[12px] leading-snug text-ink-subtle">
          {active} {t('roadpass.days_short')} · {t('roadpass.streak_record', { best: streak.best })}
        </div>
      </div>
    </button>
  )
}
