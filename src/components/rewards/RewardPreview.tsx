import { useEffect, useRef, type CSSProperties } from 'react'
import { User } from 'lucide-react'
import { useStore, selectTotalsByCurrency } from '../../store/transactions'
import type { AccentPalette, RewardDef } from '../../lib/rewards'
import { heroSkinClass } from '../../lib/useHeroSkin'
import { formatMoney } from '../../lib/format'
import { playSaveEffect } from '../../lib/saveEffect'
import { tg } from '../../lib/telegram'
import { useT } from '../../lib/i18n'
import { Money } from '../ui/Money'
import { Avatar } from '../Avatar'
import { RewardBadge } from './RewardBadge'
import { FrameRing } from './FrameRing'

/** CSS-переменные палитры: всё, что внутри, перекрашивается без надевания. */
function paletteVars(p: AccentPalette): CSSProperties {
  const out: Record<string, string> = {}
  for (const k of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const) out[`--brand-${k}`] = p[k]
  return out as CSSProperties
}

/**
 * Маленькое превью в строке магазина: мини-карта для обложки, кольцо для
 * рамки, жетон для остального. По превью видно, ЧТО покупаешь, а не только
 * как это называется.
 */
export function RewardThumb({ reward, dim }: { reward: RewardDef; dim?: boolean }) {
  const filter = dim ? 'grayscale(0.6) opacity(0.7)' : undefined
  if (reward.kind === 'card') {
    return (
      <span
        className={`hero-surface block h-[30px] w-[46px] rounded-[9px] ${heroSkinClass(reward.id)}`}
        style={{ filter }}
        aria-hidden
      >
        <span className="absolute left-[6px] top-[6px] h-[3px] w-[14px] rounded-full bg-white/50" />
        <span className="absolute left-[6px] top-[13px] h-[5px] w-[22px] rounded-full bg-white/85" />
      </span>
    )
  }
  if (reward.kind === 'frame') {
    return (
      <span style={{ filter }} aria-hidden>
        <FrameRing frameId={reward.id} size={40} animate={false}>
          <span className="flex h-full w-full items-center justify-center rounded-full bg-surface-sunken text-ink-subtle">
            <User size={17} strokeWidth={2.2} />
          </span>
        </FrameRing>
      </span>
    )
  }
  if (reward.kind === 'accent' && reward.palette) {
    return <RewardBadge rewardId={reward.id} palette={reward.palette} size={40} dim={dim} />
  }
  return <RewardBadge rewardId={reward.id} rarity={reward.rarity} size={40} dim={dim} />
}

/**
 * Крупная примерка в шторке товара: как вещь будет выглядеть на тебе. Ничего
 * не надевает — надетое синхронизируется и уходит в рейтинг, а примерка
 * должна оставаться примеркой (палитра перекрашивает только этот блок через
 * CSS-переменные, рамка рисуется на копии аватара).
 */
export function RewardStage({ reward }: { reward: RewardDef }) {
  const t = useT()

  if (reward.kind === 'card') return <CardStage reward={reward} />

  if (reward.kind === 'frame') {
    return (
      <div className="flex justify-center py-3">
        <Avatar size={104} frameId={reward.id} />
      </div>
    )
  }

  if (reward.kind === 'accent' && reward.palette) {
    return (
      <div style={paletteVars(reward.palette)} className="rounded-3xl bg-surface-sunken/60 p-3">
        <div className="hero-surface rounded-3xl px-4 py-3">
          <div className="caption text-white/70">{t('balance.month')}</div>
          <div className="mt-1 text-[26px] font-bold leading-none">8 380 €</div>
        </div>
        <div className="mt-3 flex items-center gap-2.5">
          <span className="flex-1 rounded-full bg-brand-500 py-2.5 text-center text-[14px] font-bold text-white">
            {t('add.save_expense')}
          </span>
          <span className="relative h-[26px] w-[44px] shrink-0 rounded-full bg-brand-500">
            <span className="absolute right-[3px] top-[3px] h-5 w-5 rounded-full bg-white shadow" />
          </span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
          <div className="grow-x h-full w-2/3 rounded-full bg-brand-500" />
        </div>
      </div>
    )
  }

  if (reward.kind === 'title') {
    const user = tg.user
    const name = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || t('profile.guest')
    return (
      <div className="flex items-center gap-3.5 rounded-3xl bg-surface-sunken/60 px-4 py-4">
        <Avatar size={56} />
        <div className="min-w-0">
          <div className="truncate text-[17px] font-bold text-ink">{name}</div>
          <div key={reward.id} className="pop mt-1 inline-flex rounded-full bg-surface-raised px-2.5 py-0.5 text-[13px] font-semibold text-ink shadow-soft">
            {t('reward.' + reward.id + '.name')}
          </div>
        </div>
      </div>
    )
  }

  if (reward.kind === 'effect') return <EffectStage reward={reward} />

  return (
    <div className="flex justify-center py-3">
      <RewardBadge rewardId={reward.id} rarity={reward.rarity} size={88} />
    </div>
  )
}

/** Обложка на карте с настоящим балансом за период — примеряешь на свои деньги. */
function CardStage({ reward }: { reward: RewardDef }) {
  const t = useT()
  const byCurrency = useStore(selectTotalsByCurrency)
  const currency = useStore((s) => s.account ?? s.currency)
  const totals = byCurrency[currency] ?? Object.values(byCurrency)[0] ?? { income: 0, expense: 0, balance: 0 }
  const cur = byCurrency[currency] ? currency : ((Object.keys(byCurrency)[0] as typeof currency | undefined) ?? currency)

  return (
    <div className={`hero-surface skin-live rounded-4xl px-6 py-5 ${heroSkinClass(reward.id)}`}>
      <div className="caption text-white/70">{t('balance.month')}</div>
      <div className="mt-1 text-[38px] font-bold leading-none tracking-tight">
        <Money value={totals.balance} currency={cur} />
      </div>
      <div className="mt-4 flex items-center gap-4">
        <div>
          <div className="caption text-white/65">{t('common.income')}</div>
          <div className="tabular text-sm font-bold">+ {formatMoney(totals.income, cur)}</div>
        </div>
        <div className="h-8 w-px bg-white/20" />
        <div>
          <div className="caption text-white/65">{t('common.expense')}</div>
          <div className="tabular text-sm font-bold">− {formatMoney(totals.expense, cur)}</div>
        </div>
      </div>
    </div>
  )
}

/** Эффект: кнопка «Записать» как в шторке — эффект играет при открытии и по нажатию. */
function EffectStage({ reward }: { reward: RewardDef }) {
  const t = useT()
  const ref = useRef<HTMLButtonElement>(null)
  const effect = reward.effect ?? 'none'

  useEffect(() => {
    const id = setTimeout(() => playSaveEffect(ref.current, effect), 380)
    return () => clearTimeout(id)
  }, [effect])

  return (
    <div className="rounded-3xl bg-surface-sunken/60 px-4 pb-3 pt-6">
      <button
        ref={ref}
        type="button"
        onClick={() => playSaveEffect(ref.current, effect)}
        className="press-soft w-full rounded-full bg-brand-500 py-3.5 text-[15px] font-bold text-white"
      >
        {t('add.save_expense')}
      </button>
      <div className="caption mt-2 text-center text-ink-subtle">{t('shop.effect_try')}</div>
    </div>
  )
}
