import { Coins, PackageOpen, Snowflake } from 'lucide-react'
import { getReward } from '../../../lib/rewards'
import type { DoorPrize } from '../../../lib/advent'
import { RewardThumb } from '../../rewards/RewardPreview'

/**
 * Что лежит в открытом ящичке шкатулки: настоящая миниатюра вещи (рамка
 * кольцом, титул и акцент — жетоном, обложка — карточкой), заморозка —
 * снежинкой, монеты — стопкой с числом.
 */
export function GiftGlyph({ prize }: { prize: DoorPrize }) {
  if (prize.type === 'item' || (prize.type === 'chest' && prize.id)) {
    const r = getReward(prize.id as string)
    if (r)
      return (
        <span className={`gg gg-item gg-${r.kind} gg-${r.rarity}`}>
          <RewardThumb reward={r} />
        </span>
      )
  }
  if (prize.type === 'chest') {
    return (
      <span className="gg gg-icon gg-chest">
        <PackageOpen size={20} strokeWidth={2.2} />
      </span>
    )
  }
  if (prize.type === 'freeze') {
    return (
      <span className="gg gg-icon gg-freeze">
        <Snowflake size={20} strokeWidth={2.4} />
      </span>
    )
  }
  return (
    <span className="gg gg-icon gg-coins">
      <Coins size={17} strokeWidth={2.4} />
      <b>{prize.type === 'coins' ? prize.coins : ''}</b>
    </span>
  )
}
