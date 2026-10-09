import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { useStore } from '../../store/transactions'
import { rewardPrice, type RewardDef } from '../../lib/rewards'
import { coinsWord, useT } from '../../lib/i18n'
import { hapticNotify, hapticTap } from '../../lib/telegram'
import { burst, replay, RARITY_FX } from '../../lib/fx'
import { BottomSheet } from '../ui/BottomSheet'
import { Odometer } from '../ui/Odometer'
import { CoinAmount } from './CoinAmount'
import { RewardStage } from './RewardPreview'

/**
 * Шторка товара: примерка, цена и покупка в одном месте.
 *
 * Раньше покупка была одним нажатием на цену прямо в списке — промахнулся
 * пальцем, и 600 монет ушли. Здесь сначала видно, как вещь выглядит на тебе
 * (на твоей карте, твоём аватаре, твоём имени), сколько монет останется, и
 * только потом — «Купить».
 */
export function ProductSheet({
  reward,
  priceOverride,
  onClose,
}: {
  reward: RewardDef | null
  /** Цена со скидкой витрины дня. */
  priceOverride?: number
  onClose: () => void
}) {
  // Последний показанный товар живёт, пока шторка уезжает (иначе при закрытии
  // содержимое исчезало бы до конца анимации).
  const [shown, setShown] = useState(reward)
  useEffect(() => {
    if (reward) setShown(reward)
  }, [reward])

  return (
    <BottomSheet open={reward !== null} onClose={onClose} padBottom={16}>
      {shown && <Body key={shown.id} reward={shown} priceOverride={priceOverride} onClose={onClose} />}
    </BottomSheet>
  )
}

function Body({ reward, priceOverride, onClose }: { reward: RewardDef; priceOverride?: number; onClose: () => void }) {
  const t = useT()
  const lang = useStore((s) => s.lang)
  const coins = useStore((s) => s.coins)
  const owned = useStore((s) => s.owned.includes(reward.id))
  const equippedId = useStore((s) => s.equipped[reward.kind])
  const buyReward = useStore((s) => s.buyReward)
  const equipReward = useStore((s) => s.equipReward)
  const stageRef = useRef<HTMLDivElement>(null)
  const priceRef = useRef<HTMLDivElement>(null)
  const [justBought, setJustBought] = useState(false)

  const full = rewardPrice(reward)
  const price = priceOverride != null && priceOverride < full ? priceOverride : full
  const discounted = price < full
  const affordable = coins >= price
  const equipped = equippedId === reward.id

  const buy = () => {
    if (owned) return
    if (!affordable) {
      hapticNotify('error')
      replay(priceRef.current, 'shake')
      return
    }
    if (!buyReward(reward.id, priceOverride)) return
    hapticNotify('success')
    equipReward(reward.kind, reward.id) // купленное сразу надето
    setJustBought(true)
    burst(stageRef.current, {
      colors: RARITY_FX[reward.rarity],
      count: reward.rarity === 'rare' ? 18 : 30,
      spread: 130,
      confetti: reward.rarity !== 'rare',
    })
  }

  const equip = () => {
    if (!owned || equipped) return
    hapticTap()
    equipReward(reward.kind, reward.id)
  }

  return (
    <div className="px-5">
      <div ref={stageRef} className="tab-enter">
        <RewardStage reward={reward} />
      </div>

      <div className="mt-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[20px] font-extrabold leading-tight text-ink">{t('reward.' + reward.id + '.name')}</div>
          <div className="caption mt-1 text-ink-subtle">{t('reward.' + reward.id + '.hint')}</div>
        </div>
        {/* Редкость — словом и её цветом. Цвета текста свои (rarity-text-*):
            янтарь редкости на белом читался бы при контрасте 2,2:1. */}
        <span className={`caption-sm rarity-text-${reward.rarity} mt-1 shrink-0 font-bold`}>
          {t('rarity.' + reward.rarity)}
        </span>
      </div>

      <div ref={priceRef} className="mt-5">
        {owned ? (
          equipped ? (
            <div
              key={justBought ? 'bought' : 'eq'}
              className="flex items-center justify-center gap-2 rounded-full bg-surface-sunken py-3.5 text-[15px] font-bold text-ink"
            >
              <Check size={18} strokeWidth={2.8} className="pop" />
              {justBought ? t('shop.bought') : t('roadpass.equipped')}
            </div>
          ) : (
            <button type="button" onClick={equip} className="press-soft w-full rounded-full bg-brand-500 py-3.5 text-[15px] font-bold text-white">
              {t('roadpass.equip')}
            </button>
          )
        ) : (
          // Цена — один раз, в кнопке (со скидкой — зачёркнутая полная рядом).
          <button
            type="button"
            onClick={buy}
            aria-disabled={!affordable}
            className={`press-soft w-full rounded-full py-3.5 text-[15px] font-bold transition-colors ${
              affordable ? 'bg-brand-500 text-white' : 'bg-surface-sunken text-ink-subtle'
            }`}
          >
            {affordable ? (
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                {t('shop.buy')}
                {discounted && <span className="font-semibold line-through opacity-60">{full.toLocaleString('ru-RU')}</span>}
                <CoinAmount value={price} size={15} />
              </span>
            ) : (
              t('shop.not_enough_btn', { n: (price - coins).toLocaleString('ru-RU'), word: coinsWord(lang, price - coins) })
            )}
          </button>
        )}
        {owned && justBought && (
          <button type="button" onClick={onClose} className="mt-2 w-full py-2 text-center text-[14px] font-semibold text-ink-subtle">
            {t('common.close')}
          </button>
        )}
      </div>

      {/* Одна подпись о монетах: до покупки — сколько останется из скольких,
          после — сколько есть (барабаном: видно, как сумма уменьшилась). */}
      <div className="caption mt-3 flex items-center justify-center gap-1 tabular-nums text-ink-subtle">
        {!owned && affordable ? (
          t('shop.left_of', { left: (coins - price).toLocaleString('ru-RU'), all: coins.toLocaleString('ru-RU') })
        ) : (
          <>
            {t('shop.balance')}
            <span className="inline-flex items-center gap-1 font-semibold text-ink-muted">
              <Odometer text={coins.toLocaleString('ru-RU')} /> {coinsWord(lang, coins)}
            </span>
          </>
        )}
      </div>
    </div>
  )
}
