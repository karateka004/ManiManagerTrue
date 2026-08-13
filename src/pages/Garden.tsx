import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, Droplets, Check } from 'lucide-react'
import { useStore, selectGoalsReached, selectBudgetMonthKept } from '../store/transactions'
import { useLevel } from '../components/LevelBar'
import { useT } from '../lib/i18n'
import { hapticTap, hapticNotify } from '../lib/telegram'
import { canClaim, effectiveStreak } from '../lib/streak'
import {
  MAX_STAGE,
  UPGRADES,
  UNLOCKS,
  getUnlock,
  growthOf,
  hasStreakShield,
  pendingUnlocks,
  stageOf,
  type GardenMetrics,
} from '../lib/garden'
import { GardenScene, sprite } from '../components/garden/Scene'

/**
 * Экран мини-игры «Сад» — полноэкранный под-вид вкладки «Прогресс».
 *
 * Верстка сознательно НЕ карточная: сцена во всю ширину, статус и действие —
 * HUD поверх неё, инвентарь и коллекция — ряды слотов. Стопка одинаковых
 * скруглённых карточек читалась как экран настроек, а не как игра.
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
  const [watering, setWatering] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)

  const growth = growthOf(garden, lvl.xp)
  const progress = stageOf(growth)
  const thirsty = canClaim(streak)
  const days = effectiveStreak(streak, undefined, hasStreakShield(garden.upgrades))

  const metrics: GardenMetrics = useMemo(
    () => ({
      streakBest: streak.best,
      transactions: transactions.length,
      goalsReached,
      budgetMonthKept: budgetKept > 0,
      level: lvl.level,
      referrals: 0,
      stage: progress.stage,
    }),
    [streak.best, transactions.length, goalsReached, budgetKept, lvl.level, progress.stage],
  )

  useEffect(() => {
    if (!garden.plantedAt) return
    const fresh = pendingUnlocks(garden, metrics)
    if (fresh.length > 0) {
      unlockItems(fresh)
      setToast(t('garden.unlock.' + fresh[0]))
      hapticNotify('success')
    }
  }, [garden, metrics, unlockItems, t])

  useEffect(() => {
    if (!garden.plantedAt || progress.stage === garden.seenStage) return
    if (progress.stage > garden.seenStage) setToast(t('garden.grew'))
    markStage(progress.stage)
  }, [progress.stage, garden.plantedAt, garden.seenStage, markStage, t])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2400)
    return () => clearTimeout(id)
  }, [toast])

  const onWater = () => {
    if (!thirsty) return
    const reward = claimDailyStreak()
    if (!reward) return
    hapticNotify('success')
    setWatering(true)
    setTimeout(() => setWatering(false), 1100)
    setToast(`+${reward.coins} 🪙`)
  }

  const planted = Boolean(garden.plantedAt)

  return (
    <div className="pb-28">
      {/* Компактная шапка: заголовок и монеты, ничего лишнего. */}
      <div className="flex items-center gap-2 px-4 pt-5 pb-2">
        <button
          onClick={() => { hapticTap(); onBack() }}
          aria-label={t('common.back')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-surface-sunken/60 text-ink-muted active:scale-95"
        >
          <ChevronLeft size={20} strokeWidth={2.2} />
        </button>
        <div className="min-w-0 flex-1 truncate text-[17px] font-bold tracking-tight text-ink">
          {t('garden.title')}
          <span className="ml-2 rounded-full bg-brand-500/15 px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase text-brand-600 dark:text-brand-300">
            {t('garden.beta')}
          </span>
        </div>
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-surface-sunken/70 px-2.5 py-1 text-[12px] font-bold tabular text-ink">
          🪙 {coins.toLocaleString('ru-RU')}
        </span>
      </div>

      {/* Игровое поле во всю ширину — дерево главный герой экрана. */}
      <div className="relative">
        <GardenScene
          stage={planted ? progress.stage : 0}
          unlocked={garden.unlocked}
          thirsty={planted && thirsty}
          streak={days}
          watering={watering}
        />

        {/* Серия — маленький игровой чип в углу поля. */}
        {planted && days > 0 && (
          <div className="pointer-events-none absolute left-3 top-3 rounded-lg bg-black/45 px-2 py-1 text-[12px] font-bold text-white backdrop-blur-sm">
            🔥 {days}
          </div>
        )}

        {toast && (
          <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
            <span className="rounded-lg bg-black/60 px-3 py-1.5 text-[13px] font-bold text-white backdrop-blur-sm">
              {toast}
            </span>
          </div>
        )}

        {/* Затемнение у нижней кромки — HUD читается поверх любой сцены. */}
        {planted && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-32"
            style={{ background: 'linear-gradient(to top, rgba(12,26,18,0.72), rgba(12,26,18,0))' }}
          />
        )}

        {/* HUD прогресса и действие — поверх поля, а не отдельной карточкой. */}
        {planted && (
          <div className="absolute inset-x-3 bottom-3">
            <div className="mb-2 flex items-end justify-between text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.55)]">
              <span className="text-[13px] font-bold">
                {t('garden.stage', { stage: progress.stage, max: MAX_STAGE })}
              </span>
              <span className="text-[11px] tabular opacity-90">
                {progress.isMax ? t('garden.max') : t('garden.to_next', { n: progress.toNext })}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/35">
              <div
                className="h-full rounded-full bg-brand-400 transition-[width] duration-500"
                style={{ width: `${Math.round(progress.ratio * 100)}%` }}
              />
            </div>

            {/*
              Пока не полито — крупная кнопка-действие. После полива она уступает
              место миру: остаётся тонкая строчка-подтверждение.
            */}
            {thirsty ? (
              <button
                onClick={onWater}
                className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl bg-sky-400 py-2.5 text-[14px] font-extrabold text-white shadow-lg transition active:translate-y-px active:bg-sky-500"
              >
                <Droplets size={17} strokeWidth={2.6} />
                {t('garden.water')}
              </button>
            ) : (
              <div className="mt-2 flex items-center justify-center gap-1.5 text-[12px] font-semibold text-white/85 [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
                <Check size={14} strokeWidth={2.8} />
                {t('garden.watered')}
              </div>
            )}
          </div>
        )}
      </div>

      {!planted ? (
        <div className="mx-4 mt-5 text-center">
          <p className="mx-auto max-w-[290px] text-[13px] leading-snug text-ink-subtle">{t('garden.plant_hint')}</p>
          <button
            onClick={() => { hapticTap('medium'); plantSeed(lvl.xp) }}
            className="mt-3 w-full rounded-2xl bg-brand-500 py-3 text-sm font-bold text-white active:scale-[0.98]"
          >
            {t('garden.plant')}
          </button>
        </div>
      ) : (
        <>
          {/* Уход — ряд слотов инвентаря, а не четыре карточки. */}
          <div className="mt-5 px-4">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-subtle">
              {t('garden.upgrades')}
            </div>
            <div className="grid grid-cols-4 gap-2">
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
                    title={t('garden.up.' + u.id + '.hint')}
                    className={`flex flex-col items-center gap-1 rounded-xl border-2 p-2 transition ${
                      owned
                        ? 'border-brand-500/60 bg-brand-500/10'
                        : affordable
                        ? 'border-surface-sunken bg-surface-raised active:translate-y-px'
                        : 'border-surface-sunken bg-surface-sunken/40 opacity-60'
                    }`}
                  >
                    <img
                      src={sprite('icon-' + u.id)}
                      alt=""
                      className="h-8 w-8 max-w-none"
                      style={{ imageRendering: 'pixelated' }}
                    />
                    <span className="text-[10px] font-bold tabular text-ink">
                      {owned ? '✓' : `🪙 ${u.price}`}
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="mt-1.5 min-h-[15px] text-[11px] leading-snug text-ink-subtle">
              {t('garden.up.' + (UPGRADES.find((u) => !garden.upgrades.includes(u.id))?.id ?? 'leaves') + '.hint')}
            </p>
          </div>

          {/* Коллекция — сетка слотов; закрытое показываем силуэтом, а не замком в списке. */}
          <div className="mt-4 px-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-ink-subtle">
                {t('garden.collection')}
              </span>
              <span className="text-[11px] tabular text-ink-subtle">
                {garden.unlocked.length} / {UNLOCKS.length}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {UNLOCKS.map((u) => {
                const open = garden.unlocked.includes(u.id)
                const def = getUnlock(u.id)
                return (
                  <button
                    key={u.id}
                    onClick={() => { hapticTap(); setPicked(picked === u.id ? null : u.id) }}
                    className={`flex h-16 items-center justify-center rounded-xl border-2 transition ${
                      open ? 'border-brand-500/50 bg-brand-500/10' : 'border-surface-sunken bg-surface-sunken/30'
                    } ${picked === u.id ? 'ring-2 ring-brand-400' : ''}`}
                  >
                    <img
                      src={sprite(def!.sprite)}
                      alt=""
                      className="max-h-[42px] max-w-[46px]"
                      style={{
                        imageRendering: 'pixelated',
                        // Закрытое — тёмный силуэт: видно, что там что-то есть, и хочется открыть.
                        filter: open ? undefined : 'brightness(0) opacity(0.32)',
                      }}
                    />
                  </button>
                )
              })}
            </div>
            <p className="mt-2 min-h-[32px] text-[12px] leading-snug text-ink-subtle">
              {picked ? (
                <>
                  <span className="font-bold text-ink">{t('garden.unlock.' + picked)}</span>
                  {' — '}
                  {garden.unlocked.includes(picked)
                    ? t('garden.bought')
                    : t('garden.unlock.' + picked + '.how')}
                </>
              ) : (
                t('garden.collection_hint')
              )}
            </p>
          </div>
        </>
      )}
    </div>
  )
}
