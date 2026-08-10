import { useState } from 'react'
import { m } from 'framer-motion'
import { ChevronLeft, Sparkles } from 'lucide-react'
import { useStore } from '../store/transactions'
import { useT } from '../lib/i18n'
import { hapticTap, hapticSelect } from '../lib/telegram'
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
          <div className="text-xs font-semibold uppercase tracking-widest text-ink-subtle">{t('shop.kicker')}</div>
          <div className="text-2xl font-bold tracking-tight text-ink">{t('shop.title')}</div>
        </div>
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-surface-sunken/70 px-2.5 py-1 text-[12px] font-bold tabular text-ink">
          🪙 {coins.toLocaleString('ru-RU')}
        </span>
      </div>

      {/* Витрина дня */}
      {featured.length > 0 && (
        <div className="mx-4 mt-2">
          <div className="mb-2 flex items-center gap-1.5 px-2">
            <Sparkles size={14} className="text-amber-500" />
            <span className="text-xs font-bold uppercase tracking-wider text-ink-subtle">{t('shop.featured')}</span>
            <span className="ml-auto text-[11px] font-bold text-amber-600 dark:text-amber-300">−{DAILY_DISCOUNT_PCT}%</span>
          </div>
          <div className="flex flex-col gap-2">
            {featured.map((r) => (
              <RewardRow key={'f-' + r.id} reward={r} priceOverride={discountedPrice(r)} />
            ))}
          </div>
        </div>
      )}

      {/* Табы по типам */}
      <div className="mx-4 mt-5 flex gap-1 rounded-full bg-surface-sunken p-1">
        {KIND_TABS.map((k) => {
          const active = tab === k.id
          return (
            <button
              key={k.id}
              onClick={() => { hapticSelect(); setTab(k.id) }}
              className={`relative flex-1 rounded-full py-1.5 text-xs font-semibold transition-colors ${
                active ? 'text-ink' : 'text-ink-subtle'
              }`}
            >
              {active && (
                <m.span
                  layoutId="shop-tab-pill"
                  className="absolute inset-0 rounded-full bg-surface-raised shadow-soft dark:shadow-soft-dark"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
              <span className="relative z-10">{t(k.key)}</span>
            </button>
          )
        })}
      </div>

      {/* Список выбранного типа */}
      <div className="mx-4 mt-3 flex flex-col gap-2">
        {items.map((r) => (
          <RewardRow key={r.id} reward={r} />
        ))}
      </div>

      <div className="mx-4 mt-4 text-center text-[11px] text-ink-subtle">
        {t('roadpass.owned_count', { n: ownedCount, total: SHOP_REWARDS.length })}
      </div>
    </div>
  )
}
