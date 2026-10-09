import { Lock, Check, Flame, Star } from 'lucide-react'
import { useStore } from '../store/transactions'
import { useT } from '../lib/i18n'
import { hapticTap, hapticNotify } from '../lib/telegram'
import { Group, Row } from '../components/ui/Group'
import { ScreenHeader } from '../components/ui/ScreenHeader'
import { useLevel } from '../components/LevelBar'
import { LEVEL_REWARDS, type RewardDef } from '../lib/rewards'
import { RewardBadge } from '../components/rewards/RewardBadge'
import { burst, RARITY_FX } from '../lib/fx'

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
    <div className="pb-28">
      <ScreenHeader kicker={t('lvlrew.kicker')} title={t('lvlrew.title')} onBack={onBack} />

      <p className="caption mx-4 mt-3 px-1 leading-relaxed text-ink-muted">{t('lvlrew.hint')}</p>

      {/* Текущие показатели по обоим условиям — строками, без цветных квадратов */}
      <Group className="mx-4 mt-4">
        <Row
          icon={<Star size={18} strokeWidth={2} />}
          title={t('lvlrew.your_level')}
          value={<span className="text-ink-muted">{lvl.level}</span>}
        />
        <Row
          icon={<Flame size={18} strokeWidth={2} />}
          title={t('lvlrew.your_days')}
          value={<span className="text-ink-muted">{t('lvlrew.streak_value', { best: days, now: streakNow })}</span>}
        />
      </Group>

      <Group className="mx-4 mt-6" footer={t('lvlrew.progress', { n: claimed, total: LEVEL_REWARDS.length })}>
        {LEVEL_REWARDS.map((r) => (
          <LevelRewardRow key={r.id} reward={r} currentLevel={lvl.level} days={days} />
        ))}
      </Group>
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

  const onClaim = (from: Element) => {
    if (!unlocked || owned) return
    if (grantReward(reward.id)) {
      hapticNotify('success')
      // Всплеск в цветах редкости титула — из кнопки, которую нажали.
      burst(from, { colors: RARITY_FX[reward.rarity], count: 18, spread: 80 })
      equipReward('title', reward.id) // новый титул сразу надет — как покупка в магазине
    }
  }

  const onEquip = () => {
    if (!owned || equipped) return
    hapticTap()
    equipReward('title', reward.id)
  }

  return (
    <div className={`row ${unlocked ? '' : 'opacity-55'}`}>
      {/* Жетон уровня: градиент по редкости + номер уровня в углу */}
      <span key={owned ? 'own' : 'no'} className={`mr-3 shrink-0 ${owned ? 'pop' : ''}`}>
        <RewardBadge level={reward.unlockLevel} rarity={reward.rarity} size={40} dim={!unlocked} />
      </span>

      <div className="row-main">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold text-ink">{t('reward.' + reward.id + '.name')}</div>
          {owned ? (
            <div className="caption mt-0.5 truncate text-ink-subtle">{t('reward.' + reward.id + '.hint')}</div>
          ) : (
            /* Пока не забрано — вместо описания показываем оба условия с прогрессом */
            <div className="caption-sm mt-1 flex items-center gap-2">
              <span className={levelOk ? 'font-semibold text-ink' : 'text-ink-subtle'}>
                {levelOk && <Check size={12} strokeWidth={3} className="-mt-px mr-0.5 inline" aria-hidden />}
                {t('lb.level_short')} {reward.unlockLevel}
              </span>
              {needDays > 0 && (
                <span className={daysOk ? 'font-semibold text-ink' : 'text-ink-subtle'}>
                  {daysOk && <Check size={12} strokeWidth={3} className="-mt-px mr-0.5 inline" aria-hidden />}
                  {t('lvlrew.days_progress', { n: Math.min(days, needDays), need: needDays })}
                </span>
              )}
            </div>
          )}
        </div>

        {!unlocked ? (
          <span className="caption flex shrink-0 items-center gap-1 font-semibold text-ink-subtle">
            <Lock size={13} strokeWidth={2.5} />
            {!levelOk ? t('lvlrew.locked', { n: reward.unlockLevel }) : t('lvlrew.locked_days', { n: needDays })}
          </span>
        ) : !owned ? (
          <button
            onClick={(e) => onClaim(e.currentTarget)}
            className="press sheen shrink-0 rounded-full bg-brand-500 px-3.5 py-1.5 text-[13px] font-bold text-white"
          >
            {t('lvlrew.claim')}
          </button>
        ) : equipped ? (
          <span className="caption flex shrink-0 items-center gap-1 font-semibold text-ink-muted">
            <Check size={15} strokeWidth={2.8} className="pop" /> {t('roadpass.equipped')}
          </span>
        ) : (
          <button
            onClick={onEquip}
            className="press shrink-0 rounded-full bg-surface-sunken px-3.5 py-1.5 text-[13px] font-bold text-ink"
          >
            {t('roadpass.equip')}
          </button>
        )}
      </div>
    </div>
  )
}
