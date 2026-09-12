import { ChevronLeft, Lock, Check, Flame, Star } from 'lucide-react'
import { useStore } from '../store/transactions'
import { useT } from '../lib/i18n'
import { hapticTap, hapticNotify } from '../lib/telegram'
import { useLevel } from '../components/LevelBar'
import { RARITY, LEVEL_REWARDS, type RewardDef } from '../lib/rewards'
import { RewardBadge } from '../components/rewards/RewardBadge'

/**
 * Полноэкранные «Титулы уровня» (под-вид вкладки «Награды», заменил заглушку De-Fi).
 * За каждый уровень (1..10) — уникальный титул: забирается бесплатно по достижении
 * уровня, надевается в профиль и виден другим игрокам в таблице лидеров.
 */
export function LevelRewardsScreen({ onBack }: { onBack: () => void }) {
  const t = useT()
  const lvl = useLevel()
  // Второе условие — рекорд ежедневной серии («Серия дня» на хабе наград).
  const days = useStore((s) => s.streak.best)
  const streakNow = useStore((s) => s.streak.count)
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
        {/* Значок уровня — тот же, что в шапке «Прогресса»: эмодзи из levels.ts
            здесь рисовал системный шрифт и выбивался из остальных иконок. */}
        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand-100 px-2.5 py-1 text-[12px] font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
          <RewardBadge level={lvl.level} size={20} />
          {lvl.level}
        </span>
      </div>

      <p className="mx-4 mb-3 px-2 text-[12px] leading-relaxed text-ink-subtle">{t('lvlrew.hint')}</p>

      {/* Текущие показатели по обоим условиям */}
      <div className="mx-4 mb-3 grid grid-cols-2 gap-2">
        <StatChip icon={<Star size={15} strokeWidth={2.4} />} label={t('lvlrew.your_level')} value={String(lvl.level)} />
        <StatChip
          icon={<Flame size={15} strokeWidth={2.4} />}
          label={t('lvlrew.your_days')}
          value={t('lvlrew.streak_value', { best: days, now: streakNow })}
        />
      </div>

      <div className="mx-4 flex flex-col gap-2">
        {LEVEL_REWARDS.map((r) => (
          <LevelRewardRow key={r.id} reward={r} currentLevel={lvl.level} days={days} />
        ))}
      </div>

      <div className="mx-4 mt-4 text-center text-[11px] text-ink-subtle">
        {t('lvlrew.progress', { n: claimed, total: LEVEL_REWARDS.length })}
      </div>
    </div>
  )
}

/** Небольшой чип с текущим показателем (уровень / дни). */
function StatChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-surface-sunken/60 px-3 py-2">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
        {icon}
      </span>
      <div className="min-w-0 leading-tight">
        <div className="text-[10px] font-bold uppercase tracking-wider text-ink-subtle">{label}</div>
        <div className="tabular text-sm font-bold text-ink">{value}</div>
      </div>
    </div>
  )
}

/** Строка титула: бейдж уровня + название + состояние (забрать / надеть / закрыт). */
function LevelRewardRow({
  reward,
  currentLevel,
  days,
}: {
  reward: RewardDef
  currentLevel: number
  days: number
}) {
  const t = useT()
  const owned = useStore((s) => s.owned.includes(reward.id))
  const equippedId = useStore((s) => s.equipped.title)
  const grantReward = useStore((s) => s.grantReward)
  const equipReward = useStore((s) => s.equipReward)

  const equipped = equippedId === reward.id
  const needDays = reward.unlockDays ?? 0
  const levelOk = currentLevel >= reward.unlockLevel
  const daysOk = days >= needDays
  const unlocked = levelOk && daysOk
  const rarity = RARITY[reward.rarity]

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
      {/* Жетон уровня: градиент по редкости + номер уровня в углу */}
      <RewardBadge level={reward.unlockLevel} rarity={reward.rarity} size={42} dim={!unlocked} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: rarity.color }} />
          <span className="truncate text-sm font-semibold text-ink">{t('reward.' + reward.id + '.name')}</span>
        </div>
        {owned ? (
          <div className="truncate text-[11px] text-ink-subtle">{t('reward.' + reward.id + '.hint')}</div>
        ) : (
          /* Пока не забрано — вместо описания показываем оба условия с прогрессом */
          <div className="mt-0.5 flex items-center gap-2 text-[11px]">
            <span className={levelOk ? 'font-semibold text-income-deep' : 'text-ink-subtle'}>
              {levelOk ? '✓' : ''} {t('lb.level_short')} {reward.unlockLevel}
            </span>
            {needDays > 0 && (
              <span className={daysOk ? 'font-semibold text-income-deep' : 'text-ink-subtle'}>
                {daysOk ? '✓' : ''} {t('lvlrew.days_progress', { n: Math.min(days, needDays), need: needDays })}
              </span>
            )}
          </div>
        )}
      </div>

      {!unlocked ? (
        <span className="flex shrink-0 items-center gap-1 rounded-2xl bg-surface-sunken px-3 py-2 text-xs font-bold text-ink-subtle">
          <Lock size={13} strokeWidth={2.5} />
          {!levelOk ? t('lvlrew.locked', { n: reward.unlockLevel }) : t('lvlrew.locked_days', { n: needDays })}
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
