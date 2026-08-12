import { useEffect, useMemo, useState } from 'react'
import { m } from 'framer-motion'
import { ChevronLeft, Droplets, Check, Sparkles } from 'lucide-react'
import {
  useStore,
  selectGoalsReached,
  selectBudgetMonthKept,
} from '../store/transactions'
import { useLevel } from '../components/LevelBar'
import { useT } from '../lib/i18n'
import { hapticTap, hapticNotify } from '../lib/telegram'
import { canClaim } from '../lib/streak'
import {
  MAX_STAGE,
  UPGRADES,
  UNLOCKS,
  growthOf,
  pendingUnlocks,
  stageOf,
  type GardenMetrics,
} from '../lib/garden'
import { GardenScene } from '../components/garden/Scene'

/**
 * Экран мини-игры «Сад» — полноэкранный под-вид вкладки «Прогресс»
 * (по образцу `pages/Shop.tsx`). Пока доступен только тестировщикам.
 */
export function GardenScreen({ onBack }: { onBack: () => void }) {
  const t = useT()
  const garden = useStore((s) => s.garden)
  const coins = useStore((s) => s.coins)
  const streak = useStore((s) => s.streak)
  const transactions = useStore((s) => s.transactions)
  const goalsReached = useStore(selectGoalsReached)
  const budgetKept = useStore(selectBudgetMonthKept)
  const plantSeed = useStore((s) => s.plantSeed)
  const buyUpgrade = useStore((s) => s.buyGardenUpgrade)
  const unlockItems = useStore((s) => s.unlockGardenItems)
  const markStage = useStore((s) => s.markGardenStage)
  const claimDailyStreak = useStore((s) => s.claimDailyStreak)
  const lvl = useLevel()

  const [toast, setToast] = useState<string | null>(null)

  const growth = growthOf(garden, lvl.xp)
  const progress = stageOf(growth)
  const thirsty = canClaim(streak)

  const metrics: GardenMetrics = useMemo(
    () => ({
      streakBest: streak.best,
      transactions: transactions.length,
      goalsReached,
      budgetMonthKept: budgetKept > 0,
      level: lvl.level,
      referrals: 0, // рефералы считает вкладка «Прогресс»; в саду не тянем сеть
      stage: progress.stage,
    }),
    [streak.best, transactions.length, goalsReached, budgetKept, lvl.level, progress.stage],
  )

  // Заслуженные элементы открываем при заходе на экран.
  useEffect(() => {
    if (!garden.plantedAt) return
    const fresh = pendingUnlocks(garden, metrics)
    if (fresh.length > 0) {
      unlockItems(fresh)
      const first = fresh[0]
      setToast(t('garden.unlock.' + first))
      hapticNotify('success')
    }
  }, [garden, metrics, unlockItems, t])

  // «Дерево подросло» — один раз на стадию.
  useEffect(() => {
    if (!garden.plantedAt || progress.stage === garden.seenStage) return
    if (progress.stage > garden.seenStage) setToast(t('garden.grew'))
    markStage(progress.stage)
  }, [progress.stage, garden.plantedAt, garden.seenStage, markStage, t])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(id)
  }, [toast])

  const onWater = () => {
    if (!thirsty) return
    const reward = claimDailyStreak()
    if (reward) {
      hapticNotify('success')
      setToast(`+${reward.coins} 🪙`)
    }
  }

  const onPlant = () => {
    hapticTap('medium')
    plantSeed(lvl.xp)
  }

  return (
    <div className="pb-28">
      <div className="flex items-center gap-2 px-4 pt-6 pb-2">
        <button
          onClick={() => { hapticTap(); onBack() }}
          aria-label={t('common.back')}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-surface-sunken/60 text-ink-muted active:scale-95"
        >
          <ChevronLeft size={22} strokeWidth={2.2} />
        </button>
        <div className="min-w-0 flex-1 px-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-widest text-ink-subtle">
              {t('garden.kicker')}
            </span>
            <span className="rounded-full bg-brand-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-brand-600 dark:text-brand-300">
              {t('garden.beta')}
            </span>
          </div>
          <div className="text-2xl font-bold tracking-tight text-ink">{t('garden.title')}</div>
        </div>
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-surface-sunken/70 px-2.5 py-1 text-[12px] font-bold tabular text-ink">
          🪙 {coins.toLocaleString('ru-RU')}
        </span>
      </div>

      <div className="relative mx-4 mt-1">
        <GardenScene stage={progress.stage} unlocked={garden.unlocked} thirsty={thirsty} />

        {toast && (
          <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
            <span className="flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-[13px] font-bold text-white backdrop-blur">
              <Sparkles size={14} /> {toast}
            </span>
          </div>
        )}
      </div>

      {!garden.plantedAt ? (
        <div className="mx-4 mt-4 rounded-4xl bg-surface-raised p-5 text-center shadow-soft dark:shadow-soft-dark">
          <div className="text-base font-bold text-ink">{t('garden.plant')}</div>
          <p className="mx-auto mt-1.5 max-w-[280px] text-[13px] leading-snug text-ink-subtle">
            {t('garden.plant_hint')}
          </p>
          <button
            onClick={onPlant}
            className="mt-4 w-full rounded-2xl bg-brand-500 py-3 text-sm font-bold text-white active:scale-[0.98]"
          >
            {t('garden.plant')}
          </button>
        </div>
      ) : (
        <>
          {/* Прогресс роста + полив */}
          <div className="mx-4 mt-4 rounded-4xl bg-surface-raised p-4 shadow-soft dark:shadow-soft-dark">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] font-bold text-ink">
                {t('garden.stage', { stage: progress.stage, max: MAX_STAGE })}
              </span>
              <span className="text-[11px] tabular text-ink-subtle">
                {progress.isMax ? t('garden.max') : t('garden.to_next', { n: progress.toNext })}
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
              <m.div
                className="h-full rounded-full bg-brand-500"
                initial={{ width: 0 }}
                animate={{ width: `${Math.round(progress.ratio * 100)}%` }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>

            <button
              onClick={onWater}
              disabled={!thirsty}
              className={`mt-3 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold transition ${
                thirsty
                  ? 'bg-gradient-to-br from-sky-400 to-sky-600 text-white active:scale-[0.98]'
                  : 'bg-surface-sunken text-ink-subtle'
              }`}
            >
              {thirsty ? <Droplets size={18} strokeWidth={2.4} /> : <Check size={18} strokeWidth={2.4} />}
              {thirsty ? t('garden.water') : t('garden.watered')}
            </button>
            {thirsty && (
              <div className="mt-1.5 text-center text-[11px] text-ink-subtle">{t('garden.thirsty')}</div>
            )}
          </div>

          {/* Уход за деревом */}
          <div className="mx-4 mt-5">
            <div className="mb-2 px-2 text-xs font-bold uppercase tracking-wider text-ink-subtle">
              {t('garden.upgrades')}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {UPGRADES.map((u) => {
                const owned = garden.upgrades.includes(u.id)
                const affordable = coins >= u.price
                return (
                  <button
                    key={u.id}
                    disabled={owned || !affordable}
                    onClick={() => {
                      if (buyUpgrade(u.id)) {
                        hapticNotify('success')
                        setToast(t('garden.up.' + u.id + '.name'))
                      }
                    }}
                    className={`rounded-3xl p-3 text-left shadow-soft transition dark:shadow-soft-dark ${
                      owned ? 'bg-brand-500/10' : 'bg-surface-raised'
                    } ${!owned && affordable ? 'active:scale-[0.98]' : ''} ${
                      !owned && !affordable ? 'opacity-55' : ''
                    }`}
                  >
                    <div className="text-[13px] font-bold leading-tight text-ink">
                      {t('garden.up.' + u.id + '.name')}
                    </div>
                    <div className="mt-1 text-[11px] leading-snug text-ink-subtle">
                      {t('garden.up.' + u.id + '.hint')}
                    </div>
                    <div className="mt-2 text-[12px] font-bold tabular text-ink">
                      {owned ? (
                        <span className="text-brand-600 dark:text-brand-300">✓ {t('garden.bought')}</span>
                      ) : (
                        <>🪙 {u.price}</>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Коллекция редких элементов */}
          <div className="mx-4 mt-5">
            <div className="mb-2 flex items-center justify-between px-2">
              <span className="text-xs font-bold uppercase tracking-wider text-ink-subtle">
                {t('garden.collection')}
              </span>
              <span className="text-[11px] tabular text-ink-subtle">
                {garden.unlocked.length} / {UNLOCKS.length}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              {UNLOCKS.map((u) => {
                const open = garden.unlocked.includes(u.id)
                return (
                  <div
                    key={u.id}
                    className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${
                      open ? 'bg-surface-raised' : 'bg-surface-sunken/40'
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[15px] ${
                        open ? 'bg-brand-500/15' : 'bg-surface-sunken'
                      }`}
                    >
                      {open ? '✓' : '🔒'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className={`text-[13px] font-semibold ${open ? 'text-ink' : 'text-ink-subtle'}`}>
                        {t('garden.unlock.' + u.id)}
                      </div>
                      <div className="text-[11px] text-ink-subtle">{t('garden.unlock.' + u.id + '.how')}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
