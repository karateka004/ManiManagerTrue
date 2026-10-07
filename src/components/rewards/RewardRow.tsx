import { Check, User } from 'lucide-react'
import { CoinAmount } from './CoinAmount'
import { useStore } from '../../store/transactions'
import { useT } from '../../lib/i18n'
import { hapticTap, hapticNotify } from '../../lib/telegram'
import { RARITY, rewardPrice, type RewardDef } from '../../lib/rewards'
import { RewardBadge } from './RewardBadge'

interface Props {
  reward: RewardDef
  /** Скидочная цена (витрина дня). Если задана и меньше обычной — показываем скидку. */
  priceOverride?: number
}

/**
 * Строка магазина: превью + название + рарность (тихая цветная точка) + одна
 * кнопка состояния. Визуал намеренно спокойный: без кричащих бейджей и цветных
 * рамок, цена — нейтральной пилюлей.
 *
 * 2.0: строка живёт в группе (`.card.grouped`), а не отдельной карточкой.
 * Надетое отмечено тихой галочкой справа — кольцо вокруг одной карточки из
 * десяти пропало вместе с самими карточками.
 */
export function RewardRow({ reward, priceOverride }: Props) {
  const t = useT()
  const equippedId = useStore((s) => s.equipped[reward.kind])
  const owned = useStore((s) => s.owned.includes(reward.id))
  const coins = useStore((s) => s.coins)
  const equipReward = useStore((s) => s.equipReward)
  const buyReward = useStore((s) => s.buyReward)
  const equipped = equippedId === reward.id
  const rarity = RARITY[reward.rarity]

  const fullPrice = rewardPrice(reward)
  const price = priceOverride ?? fullPrice
  const discounted = priceOverride != null && priceOverride < fullPrice
  const affordable = coins >= price

  const onEquip = () => {
    if (!owned || equipped) return
    hapticTap()
    equipReward(reward.kind, reward.id)
  }

  const onBuy = () => {
    if (owned) return
    if (!affordable) { hapticNotify('error'); return }
    const ok = buyReward(reward.id, priceOverride)
    if (ok) {
      hapticNotify('success')
      equipReward(reward.kind, reward.id) // покупка сразу надевается
    }
  }

  return (
    <div className={`row ${owned || affordable ? '' : 'opacity-60'}`}>
      <span className="mr-3 shrink-0">
        <RewardPreview reward={reward} dim={!owned && !affordable} />
      </span>

      <div className="row-main">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: rarity.color }} />
            <span className="truncate text-[15px] font-semibold text-ink">{t('reward.' + reward.id + '.name')}</span>
          </div>
          <div className="caption mt-0.5 truncate text-ink-subtle">{t('reward.' + reward.id + '.hint')}</div>
        </div>

        {owned ? (
          equipped ? (
            <span className="caption flex shrink-0 items-center gap-1 font-semibold text-ink-muted">
              <Check size={15} strokeWidth={2.8} /> {t('roadpass.equipped')}
            </span>
          ) : (
            <button
              onClick={onEquip}
              className="shrink-0 rounded-full bg-surface-sunken px-3.5 py-1.5 text-[13px] font-bold text-ink transition active:scale-95"
            >
              {t('roadpass.equip')}
            </button>
          )
        ) : (
          <button
            onClick={onBuy}
            disabled={!affordable}
            className={`shrink-0 rounded-full bg-surface-sunken px-3.5 py-1.5 text-[13px] font-bold tabular-nums transition active:scale-95 ${
              affordable ? 'text-ink' : 'text-ink-subtle'
            }`}
          >
            <span className="flex items-center gap-1">
              {discounted && (
                <span className="text-[11px] font-semibold text-ink-subtle line-through">{fullPrice.toLocaleString('ru-RU')}</span>
              )}
              <CoinAmount value={price} />
            </span>
          </button>
        )}
      </div>
    </div>
  )
}

/** Превью награды: жетон палитры / жетон титула / кольцо рамки на аватаре. */
function RewardPreview({ reward, dim }: { reward: RewardDef; dim: boolean }) {
  // accent — жетон в собственных цветах палитры с тематической иконкой
  if (reward.kind === 'accent' && reward.palette) {
    return <RewardBadge rewardId={reward.id} palette={reward.palette} size={40} dim={dim} />
  }

  // frame — кольцо вокруг силуэта: сразу понятно, что рамка надевается на аватар
  if (reward.kind === 'frame' && reward.frame) {
    const transparent = reward.frame.ring === 'transparent'
    return (
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
        style={{
          padding: 3,
          background: transparent ? 'rgb(var(--c-surface-sunken))' : reward.frame.ring,
          boxShadow: dim ? undefined : reward.frame.glow,
          filter: dim ? 'grayscale(0.6) opacity(0.7)' : undefined,
        }}
      >
        <span className="flex h-full w-full items-center justify-center rounded-full bg-surface-raised text-ink-subtle">
          <User size={17} strokeWidth={2.2} />
        </span>
      </div>
    )
  }

  // title — бейдж-жетон с градиентом редкости вместо буквы-заглушки
  return <RewardBadge rewardId={reward.id} rarity={reward.rarity} size={40} dim={dim} />
}
