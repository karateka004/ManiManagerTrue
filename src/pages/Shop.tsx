import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Clock3, Coins } from 'lucide-react'
import { useStore, RECORD_COINS } from '../store/transactions'
import { coinsWord, useT, type TFunc } from '../lib/i18n'
import { hapticSelect } from '../lib/telegram'
import { Group } from '../components/ui/Group'
import { ScreenHeader } from '../components/ui/ScreenHeader'
import { Odometer } from '../components/ui/Odometer'
import { useSegPill } from '../components/ui/SegTrack'
import { dayjs } from '../lib/format'
import {
  rewardsByKind,
  getReward,
  featuredToday,
  discountedPrice,
  msToMidnight,
  DAILY_DISCOUNT_PCT,
  SHOP_KINDS,
  SHOP_REWARDS,
  type RewardDef,
  type RewardKind,
} from '../lib/rewards'
import { RewardRow } from '../components/rewards/RewardRow'

// Шторка товара — отдельным чанком по первому открытию (в нём примерка).
const ProductSheet = lazy(() => import('../components/rewards/ProductSheet').then((m) => ({ default: m.ProductSheet })))

const KIND_LABEL: Record<RewardKind, string> = {
  card: 'shop.kind_card',
  accent: 'shop.kind_accent',
  frame: 'shop.kind_frame',
  title: 'shop.kind_title',
  effect: 'shop.kind_effect',
}

/** Ключ снимка витрины дня: набор фиксируется при первом заходе за день. */
const DEAL_KEY = 'koshel:deal'

/**
 * Витрина дня — снимок на сутки. Купленное в набор не попадает (скидка на то,
 * что у человека уже есть, витрину только занимала), но и после покупки
 * витрина не перемешивается: купленная вещь остаётся на месте с пометкой.
 */
function useDailyDeal(owned: string[]): string[] {
  const today = dayjs().format('YYYY-MM-DD')
  return useMemo(() => {
    try {
      const raw = localStorage.getItem(DEAL_KEY)
      const saved = raw ? (JSON.parse(raw) as { date?: string; ids?: unknown }) : null
      if (saved?.date === today && Array.isArray(saved.ids) && saved.ids.every((x) => typeof x === 'string')) {
        return saved.ids as string[]
      }
    } catch {
      /* битый снимок — соберём заново */
    }
    const ids = featuredToday(today, owned)
    try {
      localStorage.setItem(DEAL_KEY, JSON.stringify({ date: today, ids }))
    } catch {
      /* приватный режим — витрина просто пересчитается */
    }
    return ids
    // Снимок зависит только от дня: покупка не должна менять витрину.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today])
}

/** «через 5 ч 12 мин» до полуночи; тикает раз в полминуты, без секунд. */
function useUntilMidnight(t: TFunc): string {
  const [ms, setMs] = useState(() => msToMidnight())
  useEffect(() => {
    const id = setInterval(() => setMs(msToMidnight()), 30_000)
    return () => clearInterval(id)
  }, [])
  const minutes = Math.max(1, Math.ceil(ms / 60_000))
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? t('time.hm', { h, m }) : t('time.m', { m })
}

/** Полноэкранный магазин кастомизации (под-вид вкладки «Прогресс»). */
export function ShopScreen({ onBack }: { onBack: () => void }) {
  const t = useT()
  const lang = useStore((s) => s.lang)
  const coins = useStore((s) => s.coins)
  const owned = useStore((s) => s.owned)
  const [tab, setTab] = useState<RewardKind>('card')
  const [product, setProduct] = useState<{ reward: RewardDef; price?: number } | null>(null)
  const seenProduct = useRef(false)
  if (product) seenProduct.current = true

  const dealIds = useDailyDeal(owned)
  const featured = dealIds.map((id) => getReward(id)).filter((r): r is RewardDef => Boolean(r))
  const until = useUntilMidnight(t)
  const items = rewardsByKind(tab)
  const ownedCount = SHOP_REWARDS.filter((r) => owned.includes(r.id)).length
  const { trackRef, pillRef } = useSegPill<HTMLDivElement>(tab)
  // Чипы видов не помещаются на узком экране — правый край тает, чтобы было
  // видно, что ряд прокручивается (иначе «Эффекты» не найти).
  const [chipsOverflow, setChipsOverflow] = useState(false)
  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    const check = () => setChipsOverflow(el.scrollWidth - el.clientWidth > 2 && el.scrollLeft + el.clientWidth < el.scrollWidth - 2)
    check()
    el.addEventListener('scroll', check, { passive: true })
    window.addEventListener('resize', check)
    document.fonts?.ready.then(check)
    return () => {
      el.removeEventListener('scroll', check)
      window.removeEventListener('resize', check)
    }
  }, [trackRef])
  // Выбранный вид — в видимую часть ряда.
  useEffect(() => {
    trackRef.current
      ?.querySelector<HTMLElement>(':scope > .seg-on')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }, [tab, trackRef])

  const open = (reward: RewardDef, price?: number) => setProduct({ reward, price })

  return (
    <div className="pb-28">
      <ScreenHeader
        kicker={t('shop.kicker')}
        title={t('shop.title')}
        onBack={onBack}
        trailing={
          // Счётчик монет — барабаном: покупка видна как убывание суммы.
          <span
            data-coin-target
            className="flex shrink-0 items-center gap-1 rounded-full bg-surface-sunken px-3 py-1.5 text-[13px] font-bold tabular-nums text-ink"
          >
            <Coins size={14} strokeWidth={2.4} />
            <Odometer text={coins.toLocaleString('ru-RU')} />
          </span>
        }
      />

      {/* Витрина дня — группой строк, со сроком до обновления */}
      {featured.length > 0 && (
        <Group
          className="mx-4 mt-5"
          title={
            <span className="flex items-baseline gap-2">
              {t('shop.featured')}
              <span className="caption font-semibold text-ink-subtle">−{DAILY_DISCOUNT_PCT}%</span>
            </span>
          }
          action={
            // Срок до новой витрины — коротко и с часами: «через …» не влезало
            // рядом с заголовком на 320 px и переносило его на две строки.
            <span className="flex items-center gap-1 tabular-nums" aria-label={t('shop.deal_refresh', { time: until })}>
              <Clock3 size={13} strokeWidth={2.4} />
              {until}
            </span>
          }
          bodyClassName="stagger"
        >
          {featured.map((r) => (
            <RewardRow key={'f-' + r.id} reward={r} priceOverride={discountedPrice(r)} onOpen={open} />
          ))}
        </Group>
      )}

      {/* Виды наград — чипы с плашкой, прокрутка вбок на узком экране */}
      <div
        ref={trackRef}
        className="no-scrollbar relative mx-4 mt-6 flex gap-1 overflow-x-auto rounded-full bg-surface-sunken p-1"
        style={
          chipsOverflow
            ? {
                WebkitMaskImage: 'linear-gradient(90deg, #000 calc(100% - 32px), transparent)',
                maskImage: 'linear-gradient(90deg, #000 calc(100% - 32px), transparent)',
              }
            : undefined
        }
      >
        <span ref={pillRef} className="seg-pill" aria-hidden />
        {SHOP_KINDS.map((k) => (
          <button
            key={k}
            onClick={() => { hapticSelect(); setTab(k) }}
            aria-pressed={tab === k}
            className={`seg-slot shrink-0 grow whitespace-nowrap rounded-full px-2 py-1.5 text-[13px] font-semibold transition-colors duration-200 ${
              tab === k ? 'seg-on text-ink' : 'text-ink-muted'
            }`}
          >
            {t(KIND_LABEL[k])}
          </button>
        ))}
      </div>

      {/* Смена вида — список заново каскадом (key) */}
      <Group
        key={tab}
        className="mx-4 mt-3"
        bodyClassName="stagger"
        footer={t('roadpass.owned_count', { n: ownedCount, total: SHOP_REWARDS.length })}
      >
        {items.map((r) => (
          <RewardRow key={r.id} reward={r} onOpen={open} />
        ))}
      </Group>

      {/* Откуда берутся монеты — без этого цена в 600 читается как стена. */}
      <div className="mx-4 mt-5 flex items-start gap-3 rounded-3xl bg-surface-sunken/60 px-4 py-3.5">
        <Coins size={18} strokeWidth={2} className="mt-0.5 shrink-0 text-ink-subtle" />
        <p className="caption leading-snug text-ink-muted">
          {t('shop.earn', { n: RECORD_COINS, word: coinsWord(lang, RECORD_COINS) })}
        </p>
      </div>

      {seenProduct.current && (
        <Suspense fallback={null}>
          <ProductSheet reward={product?.reward ?? null} priceOverride={product?.price} onClose={() => setProduct(null)} />
        </Suspense>
      )}
    </div>
  )
}
