import { m } from 'framer-motion'
import { Star } from 'lucide-react'
import { useStore } from '../store/transactions'
import { computeXp, levelFor } from '../lib/levels'
import { useT } from '../lib/i18n'

/** Хук: текущий прогресс уровня из стора (примитивы, без массивов). */
export function useLevel() {
  const count = useStore((s) => s.transactions.length)
  const bonusXp = useStore((s) => s.bonusXp)
  return levelFor(computeXp(count, bonusXp))
}

/** Компактная полоса прогресса для шапки. */
export function LevelBar({ onClick }: { onClick?: () => void }) {
  const lvl = useLevel()
  const t = useT()

  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2.5 text-left active:opacity-80"
      aria-label={t('level.aria')}
    >
      <div className="flex h-7 shrink-0 items-center gap-1 rounded-full bg-brand-100 px-2.5 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
        <Star size={13} fill="currentColor" strokeWidth={0} aria-hidden />
        <span className="text-[11px] font-extrabold leading-none">{lvl.level}</span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between">
          <span className="truncate text-[11px] font-bold text-ink">{t('level.t' + lvl.level)}</span>
          <span className="ml-2 shrink-0 text-[10px] font-medium text-ink-subtle">
            {lvl.isMax ? t('level.max_short') : `+${lvl.toNext} XP`}
          </span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
          <m.div
            className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600"
            initial={{ width: 0 }}
            animate={{ width: `${Math.round(lvl.ratio * 100)}%` }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
      </div>
    </button>
  )
}
