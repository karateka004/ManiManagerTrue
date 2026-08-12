import { Check, User } from 'lucide-react'
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
 * рамок — надетое отмечается тонким брендовым кольцом, цена — нейтральной пилюлей.
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
    <div
      className={`card flex items-center gap-3 p-3 transition ${
        equipped ? 'ring-1 ring-brand-500/40' : ''
      } ${owned || affordable ? '' : 'opacity-60'}`}
    >
      <RewardPreview reward={reward} dim={!owned && !affordable} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: rarity.color }} />
          <span className="truncate text-sm font-semibold text-ink">{t('reward.' + reward.id + '.name')}</span>
        </div>
        <div className="truncate text-[11px] text-ink-subtle">{t('reward.' + reward.id + '.hint')}</div>
      </div>

      {owned ? (
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
      ) : (
        <button
          onClick={onBuy}
          disabled={!affordable}
          className={`shrink-0 rounded-2xl px-3 py-2 text-xs font-bold tabular transition active:scale-95 ${
            affordable ? 'bg-surface-sunken text-ink' : 'bg-surface-sunken text-ink-subtle'
          }`}
        >
          <span className="flex items-center gap-1">
            {discounted && (
              <span className="text-[10px] font-semibold text-ink-subtle line-through">{fullPrice.toLocaleString('ru-RU')}</span>
            )}
            🪙 {price.toLocaleString('ru-RU')}
          </span>
        </button>
      )}
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
