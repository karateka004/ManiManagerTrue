import { Sprout } from 'lucide-react'
import { useStore } from '../../store/transactions'
import { useLevel } from '../LevelBar'
import { useT } from '../../lib/i18n'
import { canClaim } from '../../lib/streak'
import { MAX_STAGE, growthOf, stageOf } from '../../lib/garden'
import { Tile } from '../ui/Tile'

/**
 * Плитка входа в сад (на месте «Серии дня» — полив теперь живёт внутри игры).
 * Показывает стадию дерева и зовёт полить, если сегодня ещё не поливали.
 */
export function GardenTile({ onOpen }: { onOpen: () => void }) {
  const t = useT()
  const garden = useStore((s) => s.garden)
  const streak = useStore((s) => s.streak)
  const lvl = useLevel()

  const stage = garden.plantedAt ? stageOf(growthOf(garden, lvl.xp)).stage : 0
  const thirsty = canClaim(streak)

  return (
    <Tile
      icon={<Sprout size={26} strokeWidth={2} />}
      title={t('garden.title')}
      subtitle={
        garden.plantedAt
          ? t('garden.stage', { stage, max: MAX_STAGE })
          : t('garden.subtitle')
      }
      accent="brand"
      badge={
        thirsty ? (
          <span className="rounded-full bg-sky-100 px-2 py-1 text-[11px] font-bold text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
            💧
          </span>
        ) : (
          <span className="rounded-full bg-brand-100 px-2 py-1 text-[11px] font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
            🌳
          </span>
        )
      }
      onClick={onOpen}
    />
  )
}
