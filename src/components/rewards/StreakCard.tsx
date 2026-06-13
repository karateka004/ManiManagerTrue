import { useState } from 'react'
import { AnimatePresence, m } from 'framer-motion'
import { Flame, Sparkles } from 'lucide-react'
import { useStore } from '../../store/transactions'
import { useT } from '../../lib/i18n'
import { hapticNotify } from '../../lib/telegram'
import { canClaim, effectiveStreak, nextMilestone, streakReward } from '../../lib/streak'

/** Ежедневная серия — источник монет. Картой на хабе «Награды». */
export function StreakCard() {
  const streak = useStore((s) => s.streak)
  const claimDailyStreak = useStore((s) => s.claimDailyStreak)
  const t = useT()
  const [reward, setReward] = useState<{ coins: number; xp: number; milestone: number } | null>(null)

  const active = effectiveStreak(streak)
  const claimable = canClaim(streak)
  const next = nextMilestone(active)
  // При заборе серия станет active + 1 (продолжение либо старт с 1).
  const preview = streakReward(active + 1)

  const onClaim = () => {
    if (!claimable) return
    const r = claimDailyStreak()
    if (r) {
      hapticNotify('success')
      setReward(r)
      setTimeout(() => setReward(null), 2600)
    }
  }

  return (
    <div className="mx-4 mt-3 overflow-hidden rounded-3xl bg-gradient-to-br from-amber-400 to-orange-500 p-4 text-white shadow-soft">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20">
            <Flame size={24} strokeWidth={2.2} fill={active > 0 ? 'currentColor' : 'none'} />
          </span>
          <div className="leading-tight">
            <div className="text-2xl font-extrabold tabular">{active} <span className="text-sm font-bold">{t('roadpass.days_short')}</span></div>
            <div className="text-[11px] text-white/80">{t('roadpass.streak_record', { best: streak.best })}</div>
          </div>
        </div>

        <button
          onClick={onClaim}
          disabled={!claimable}
          className={`shrink-0 rounded-2xl px-4 py-2.5 text-sm font-extrabold transition active:scale-95 ${
            claimable ? 'bg-white text-orange-600' : 'bg-white/20 text-white/70'
          }`}
        >
          {claimable ? t('quest.claim') : t('roadpass.claimed_today')}
        </button>
      </div>

      {next !== null && (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-[11px] text-white/85">
            <span>{t('roadpass.to_milestone', { n: next })}</span>
            <span className="font-semibold">{active}/{next}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/25">
            <m.div
              className="h-full rounded-full bg-white"
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, Math.round((active / next) * 100))}%` }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">
        {reward ? (
          <m.div
            key="reward"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="mt-3 flex items-center gap-2 rounded-2xl bg-white/20 px-3 py-2 text-sm font-bold"
          >
            <Sparkles size={16} strokeWidth={2.4} />
            +{reward.xp} XP · 🪙 {reward.coins}
            {reward.milestone > 0 && <span className="ml-auto text-[11px]">{t('roadpass.milestone_hit', { n: reward.milestone })}</span>}
          </m.div>
        ) : (
          claimable && (
            <div className="mt-3 text-[11px] text-white/80">
              {t('roadpass.today_reward', { xp: preview.xp, coins: preview.coins })}
              {preview.milestone > 0 && t('roadpass.milestone_suffix', { n: preview.milestone })}
            </div>
          )
        )}
      </AnimatePresence>
    </div>
  )
}
