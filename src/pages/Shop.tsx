import { useState } from 'react'
import { CoinAmount } from '../components/rewards/CoinAmount'
import { useStore } from '../store/transactions'
import { useT } from '../lib/i18n'
import { hapticSelect } from '../lib/telegram'
import { Group } from '../components/ui/Group'
import { ScreenHeader } from '../components/ui/ScreenHeader'
import { dayjs } from '../lib/format'
import {
  rewardsByKind,
  getReward,
  featuredToday,
  discountedPrice,
  DAILY_DISCOUNT_PCT,
  SHOP_REWARDS,
  type RewardDef,
  type RewardKind,
} from '../lib/rewards'
import { RewardRow } from '../components/rewards/RewardRow'

const KIND_TABS: { id: RewardKind; key: string }[] = [
  { id: 'accent', key: 'roadpass.kind_accent' },
  { id: 'title', key: 'roadpass.kind_title' },
  { id: 'frame', key: 'roadpass.kind_frame' },
]

/** Полноэкранный магазин кастомизации (под-вид вкладки «Награды»). */
export function ShopScreen({ onBack }: { onBack: () => void }) {
  const t = useT()
  const coins = useStore((s) => s.coins)
  const owned = useStore((s) => s.owned)
  const [tab, setTab] = useState<RewardKind>('accent')

  // Витрина дня — детерминирована по дате, меняется ежедневно.
  const featured = featuredToday(dayjs().format('YYYY-MM-DD'))
    .map((id) => getReward(id))
    .filter((r): r is RewardDef => Boolean(r))
  const items = rewardsByKind(tab)
  const ownedCount = SHOP_REWARDS.filter((r) => owned.includes(r.id)).length

  return (
    <div className="pb-28">
      <ScreenHeader
        kicker={t('shop.kicker')}
        title={t('shop.title')}
        onBack={onBack}
        trailing={
          <span className="flex shrink-0 items-center rounded-full bg-surface-sunken px-3 py-1.5 text-[13px] font-bold tabular-nums text-ink">
            <CoinAmount value={coins} size={14} />
          </span>
        }
      />

      {/* Витрина дня — группой строк, как всё остальное в 2.0 */}
      {featured.length > 0 && (
        <Group className="mx-4 mt-5" title={t('shop.featured')} action={`−${DAILY_DISCOUNT_PCT}%`}>
          {featured.map((r) => (
            <RewardRow key={'f-' + r.id} reward={r} priceOverride={discountedPrice(r)} />
          ))}
        </Group>
      )}

      {/* Типы наград — тот же нейтральный сегмент, что в Настройках */}
      <div className="seg-track mx-4 mt-6">
        {KIND_TABS.map((k) => (
          <button
            key={k.id}
            onClick={() => { hapticSelect(); setTab(k.id) }}
            className={`seg-item px-2 py-1.5 text-[13px] ${tab === k.id ? 'seg-on' : ''}`}
          >
            {t(k.key)}
          </button>
        ))}
      </div>

      <Group className="mx-4 mt-3" footer={t('roadpass.owned_count', { n: ownedCount, total: SHOP_REWARDS.length })}>
        {items.map((r) => (
          <RewardRow key={r.id} reward={r} />
        ))}
      </Group>
    </div>
  )
}
