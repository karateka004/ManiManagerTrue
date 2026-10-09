import { Check } from 'lucide-react'
import { CoinAmount } from './CoinAmount'
import { useStore } from '../../store/transactions'
import { useT } from '../../lib/i18n'
import { hapticSelect, hapticTap } from '../../lib/telegram'
import { rewardPrice, type RewardDef } from '../../lib/rewards'
import { RewardThumb } from './RewardPreview'

interface Props {
  reward: RewardDef
  /** Скидочная цена (витрина дня). Если задана и меньше обычной — показываем скидку. */
  priceOverride?: number
  /** Открыть шторку товара: примерка и покупка там. */
  onOpen: (reward: RewardDef, priceOverride?: number) => void
}

/**
 * Строка магазина: превью + название + одно состояние справа.
 *
 * 2.1: покупка больше не происходит нажатием на цену в строке — строка
 * открывает шторку с примеркой, ценой и «Купить». Купленное можно надеть
 * прямо отсюда (это не тратит монет). Точка редкости убрана: редкость и так
 * видна по цене, а в шторке названа словом.
 */
export function RewardRow({ reward, priceOverride, onOpen }: Props) {
  const t = useT()
  const equippedId = useStore((s) => s.equipped[reward.kind])
  const owned = useStore((s) => s.owned.includes(reward.id))
  const coins = useStore((s) => s.coins)
  const equipReward = useStore((s) => s.equipReward)
  const equipped = equippedId === reward.id

  const fullPrice = rewardPrice(reward)
  const price = priceOverride ?? fullPrice
  const discounted = priceOverride != null && priceOverride < fullPrice
  const affordable = coins >= price

  const open = () => {
    hapticSelect()
    onOpen(reward, priceOverride)
  }

  const onEquip = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    if (!owned || equipped) return
    hapticTap()
    equipReward(reward.kind, reward.id)
  }

  // Строка — не <button>: внутри неё настоящая кнопка «Надеть», а кнопка в
  // кнопке — невалидная вложенность (скринридер читает их одной). Поэтому
  // строка — div с ролью кнопки и клавиатурой.
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          open()
        }
      }}
      className="row cursor-pointer"
    >
      <span className="mr-3 shrink-0">
        <RewardThumb reward={reward} dim={!owned && !affordable} />
      </span>

      <span className="row-main">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-ink">{t('reward.' + reward.id + '.name')}</span>
          {/* «Новое» — первым словом подписи, а не плашкой у названия: на
              320 px плашка съедала название до «Гологра…». */}
          <span className="caption mt-0.5 block truncate text-ink-subtle">
            {reward.fresh && !owned && (
              <span className="font-semibold text-brand-600 dark:text-brand-300">{t('shop.new')} · </span>
            )}
            {t('reward.' + reward.id + '.hint')}
          </span>
        </span>

        {owned ? (
          equipped ? (
            <span className="caption flex shrink-0 items-center gap-1 font-semibold text-ink-muted">
              <Check size={15} strokeWidth={2.8} className="pop" /> {t('roadpass.equipped')}
            </span>
          ) : (
            <button
              type="button"
              onClick={onEquip}
              className="press shrink-0 rounded-full bg-surface-sunken px-3.5 py-1.5 text-[13px] font-bold text-ink"
            >
              {t('roadpass.equip')}
            </button>
          )
        ) : (
          <span
            className={`flex shrink-0 items-center gap-1 rounded-full bg-surface-sunken px-3 py-1.5 text-[13px] font-bold tabular-nums ${
              affordable ? 'text-ink' : 'text-ink-subtle'
            }`}
          >
            {discounted && (
              <span className="text-[11px] font-semibold text-ink-subtle line-through">{fullPrice.toLocaleString('ru-RU')}</span>
            )}
            <CoinAmount value={price} />
          </span>
        )}
      </span>
    </div>
  )
}
