import { Check } from 'lucide-react'
import { useStore } from '../../store/transactions'
import { useT } from '../../lib/i18n'
import { hapticTap, hapticNotify } from '../../lib/telegram'
import { RARITY, rewardPrice, type RewardDef, type Rarity } from '../../lib/rewards'

interface Props {
  reward: RewardDef
  /** Скидочная цена (витрина дня). Если задана и меньше обычной — показываем скидку. */
  priceOverride?: number
}

/** Строка магазина: превью + название + рарность + кнопка купить/надеть. */
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
      className={`card flex items-center gap-3 p-3 transition ${owned || affordable ? '' : 'opacity-70'}`}
      style={equipped ? { boxShadow: `inset 0 0 0 2px ${rarity.color}` } : undefined}
    >
      <RewardPreview reward={reward} dim={!owned && !affordable} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-ink">{t('reward.' + reward.id + '.name')}</span>
          <RarityBadge rarity={reward.rarity} />
        </div>
        <div className="truncate text-[11px] text-ink-subtle">{t('reward.' + reward.id + '.hint')}</div>
      </div>

      {owned ? (
        <button
          onClick={onEquip}
          disabled={equipped}
          className={`shrink-0 rounded-2xl px-3 py-2 text-xs font-bold transition active:scale-95 ${
            equipped ? 'bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300' : 'bg-brand-500 text-white'
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
          className={`shrink-0 rounded-2xl px-3 py-2 text-xs font-bold transition active:scale-95 ${
            affordable ? 'bg-amber-500 text-white' : 'bg-surface-sunken text-ink-subtle'
          }`}
        >
          {discounted ? (
            <span className="flex items-center gap-1">
              <span className="text-[10px] font-semibold text-white/70 line-through">{fullPrice.toLocaleString('ru-RU')}</span>
              🪙 {price.toLocaleString('ru-RU')}
            </span>
          ) : (
            <>🪙 {price.toLocaleString('ru-RU')}</>
          )}
        </button>
      )}
    </div>
  )
}

/** Превью награды: свотч палитры / буква титула / кольцо рамки. */
function RewardPreview({ reward, dim }: { reward: RewardDef; dim: boolean }) {
  const t = useT()
  const base = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl overflow-hidden'

  if (reward.kind === 'accent' && reward.palette) {
    return (
      <div
        className={base}
        style={{ background: `rgb(${reward.palette[500]})`, filter: dim ? 'grayscale(0.6)' : undefined }}
      >
        <span className="text-sm font-bold text-white">Aa</span>
      </div>
    )
  }

  if (reward.kind === 'frame' && reward.frame) {
    const transparent = reward.frame.ring === 'transparent'
    return (
      <div
        className={base}
        style={{
          background: transparent ? undefined : reward.frame.ring,
          boxShadow: dim ? undefined : reward.frame.glow,
          filter: dim ? 'grayscale(0.6)' : undefined,
        }}
      >
        <div className="h-5 w-5 rounded-full bg-surface-raised" />
      </div>
    )
  }

  // title
  return (
    <div className={`${base} bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300`}>
      <span className="text-base font-extrabold">{t('reward.' + reward.id + '.name')[0]}</span>
    </div>
  )
}

function RarityBadge({ rarity }: { rarity: Rarity }) {
  const t = useT()
  const meta = RARITY[rarity]
  return (
    <span
      className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
      style={{ background: `${meta.color}22`, color: meta.color }}
    >
      {t('rarity.' + rarity)}
    </span>
  )
}
