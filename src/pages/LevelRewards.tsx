import { ChevronLeft, Lock, Check } from 'lucide-react'
import { useStore } from '../store/transactions'
import { useT } from '../lib/i18n'
import { hapticTap, hapticNotify } from '../lib/telegram'
import { LEVELS } from '../lib/levels'
import { useLevel } from '../components/LevelBar'
import { RARITY, LEVEL_REWARDS, type RewardDef } from '../lib/rewards'

/**
 * Полноэкранные «Титулы уровня» (под-вид вкладки «Награды», заменил заглушку De-Fi).
 * За каждый уровень (1..10) — уникальный титул: забирается бесплатно по достижении
 * уровня, надевается в профиль и виден другим игрокам в таблице лидеров.
 */
export function LevelRewardsScreen({ onBack }: { onBack: () => void }) {
  const t = useT()
  const lvl = useLevel()
  const owned = useStore((s) => s.owned)
  const claimed = LEVEL_REWARDS.filter((r) => owned.includes(r.id)).length

  return (
    <div className="pb-24">
      {/* Шапка */}
      <div className="flex items-center gap-2 px-4 pt-6 pb-2">
        <button
          onClick={() => { hapticTap(); onBack() }}
          aria-label={t('common.back')}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-surface-sunken/60 text-ink-muted active:scale-95"
        >
          <ChevronLeft size={22} strokeWidth={2.2} />
        </button>
        <div className="min-w-0 flex-1 px-1">
          <div className="text-xs font-semibold uppercase tracking-widest text-ink-subtle">{t('lvlrew.kicker')}</div>
          <div className="text-2xl font-bold tracking-tight text-ink">{t('lvlrew.title')}</div>
        </div>
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-brand-100 px-2.5 py-1 text-[12px] font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
          {lvl.badge} {lvl.level}
        </span>
      </div>

      <p className="mx-4 mb-3 px-2 text-[12px] leading-relaxed text-ink-subtle">{t('lvlrew.hint')}</p>

      <div className="mx-4 flex flex-col gap-2">
        {LEVEL_REWARDS.map((r) => (
          <LevelRewardRow key={r.id} reward={r} currentLevel={lvl.level} />
        ))}
      </div>

      <div className="mx-4 mt-4 text-center text-[11px] text-ink-subtle">
        {t('lvlrew.progress', { n: claimed, total: LEVEL_REWARDS.length })}
      </div>
    </div>
  )
}

/** Строка титула: бейдж уровня + название + состояние (забрать / надеть / закрыт). */
function LevelRewardRow({ reward, currentLevel }: { reward: RewardDef; currentLevel: number }) {
  const t = useT()
  const owned = useStore((s) => s.owned.includes(reward.id))
  const equippedId = useStore((s) => s.equipped.title)
  const grantReward = useStore((s) => s.grantReward)
  const equipReward = useStore((s) => s.equipReward)

  const equipped = equippedId === reward.id
  const unlocked = currentLevel >= reward.unlockLevel
  const rarity = RARITY[reward.rarity]
  const badge = LEVELS[reward.unlockLevel - 1]?.badge ?? '🌱'

  const onClaim = () => {
    if (!unlocked || owned) return
    if (grantReward(reward.id)) {
      hapticNotify('success')
      equipReward('title', reward.id) // новый титул сразу надет — как покупка в магазине
    }
  }

  const onEquip = () => {
    if (!owned || equipped) return
    hapticTap()
    equipReward('title', reward.id)
  }

  return (
    <div className={`card flex items-center gap-3 p-3 ${unlocked ? '' : 'opacity-55'}`}>
      {/* Бейдж уровня */}
      <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-2xl bg-surface-sunken/70">
        <span className="text-base leading-none">{badge}</span>
        <span className="mt-0.5 text-[8px] font-bold uppercase leading-none text-ink-subtle">
          {t('lb.level_short')} {reward.unlockLevel}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: rarity.color }} />
          <span className="truncate text-sm font-semibold text-ink">{t('reward.' + reward.id + '.name')}</span>
        </div>
        <div className="truncate text-[11px] text-ink-subtle">{t('reward.' + reward.id + '.hint')}</div>
      </div>

      {!unlocked ? (
        <span className="flex shrink-0 items-center gap-1 rounded-2xl bg-surface-sunken px-3 py-2 text-xs font-bold text-ink-subtle">
          <Lock size={13} strokeWidth={2.5} /> {t('lvlrew.locked', { n: reward.unlockLevel })}
        </span>
      ) : !owned ? (
        <button
          onClick={onClaim}
          className="shrink-0 rounded-2xl bg-brand-500 px-3 py-2 text-xs font-bold text-white transition active:scale-95"
        >
          {t('lvlrew.claim')}
        </button>
      ) : (
        <button
          onClick={onEquip}
          disabled={equipped}
          className={`shrink-0 rounded-2xl px-3 py-2 text-xs font-bold transition active:scale-95 ${
            equipped ? 'bg-surface-sunken text-ink-subtle' : 'bg-brand-500 text-white'
          }`}
        >
          {equipped ? (
            <span className="flex items-center gap-1"><Check size={14} strokeWidth={3} /> {t('roadpass.equipped')}</span>
          ) : (
            t('roadpass.equip')
          )}
        </button>
      )}
    </div>
  )
}
