import { useState } from 'react'
import { AnimatePresence, m } from 'framer-motion'
import { Flame, Check, Sparkles } from 'lucide-react'
import { BottomSheet } from './ui/BottomSheet'
import { useStore } from '../store/transactions'
import { useT } from '../lib/i18n'
import { hapticTap, hapticSelect, hapticNotify } from '../lib/telegram'
import {
  REWARDS,
  RARITY,
  rewardsByKind,
  rewardPrice,
  type RewardDef,
  type RewardKind,
  type Rarity,
} from '../lib/rewards'
import {
  canClaim,
  effectiveStreak,
  nextMilestone,
  streakReward,
} from '../lib/streak'

interface Props {
  open: boolean
  onClose: () => void
}

const KIND_TITLE_KEY: Record<RewardKind, string> = {
  accent: 'roadpass.kind_accent',
  title: 'roadpass.kind_title',
  frame: 'roadpass.kind_frame',
}

const KIND_HINT_KEY: Record<RewardKind, string> = {
  accent: 'roadpass.kind_accent_hint',
  title: 'roadpass.kind_title_hint',
  frame: 'roadpass.kind_frame_hint',
}

/** «Достижения» — стрик (источник монет) + магазин надеваемых наград. */
export function RoadpassSheet({ open, onClose }: Props) {
  const coins = useStore((s) => s.coins)
  const owned = useStore((s) => s.owned)
  const t = useT()

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="flex items-center justify-between px-6 py-2">
        <span className="text-base font-bold text-ink">{t('profile.achievements')}</span>
        <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[12px] font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
          🪙 {coins.toLocaleString('ru-RU')}
        </span>
      </div>

      <p className="px-6 pb-1 text-[12px] leading-relaxed text-ink-subtle">
        {t('roadpass.intro')}
      </p>

      <StreakCard />

      <RewardSection kind="accent" />
      <RewardSection kind="title" />
      <RewardSection kind="frame" />

      <div className="px-6 pb-2 pt-4 text-center text-[11px] text-ink-subtle">
        {t('roadpass.owned_count', { n: REWARDS.filter((r) => owned.includes(r.id)).length, total: REWARDS.length })}
      </div>

      <button
        onClick={() => { hapticSelect(); onClose() }}
        className="mx-4 mt-1 w-[calc(100%-2rem)] rounded-full bg-surface-sunken py-3 text-sm font-bold text-ink-muted active:scale-[0.99]"
      >
        {t('common.done')}
      </button>
    </BottomSheet>
  )
}

/* ---------- Ежедневная серия ---------- */

function StreakCard() {
  const streak = useStore((s) => s.streak)
  const claimDailyStreak = useStore((s) => s.claimDailyStreak)
  const t = useT()
  const [reward, setReward] = useState<{ coins: number; xp: number; milestone: number } | null>(null)

  const active = effectiveStreak(streak)
  const claimable = canClaim(streak)
  const next = nextMilestone(active)
  // При заборе серия станет active + 1 (продолжение либо старт с 1).
  const preview = streakReward(active + 1)

  const onClaim = () => {
    if (!claimable) return
    const r = claimDailyStreak()
    if (r) {
      hapticNotify('success')
      setReward(r)
      setTimeout(() => setReward(null), 2600)
    }
  }

  return (
    <div className="mx-4 mt-3 overflow-hidden rounded-3xl bg-gradient-to-br from-amber-400 to-orange-500 p-4 text-white shadow-soft">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20">
            <Flame size={24} strokeWidth={2.2} fill={active > 0 ? 'currentColor' : 'none'} />
          </span>
          <div className="leading-tight">
            <div className="text-2xl font-extrabold tabular">{active} <span className="text-sm font-bold">{t('roadpass.days_short')}</span></div>
            <div className="text-[11px] text-white/80">{t('roadpass.streak_record', { best: streak.best })}</div>
          </div>
        </div>

        <button
          onClick={onClaim}
          disabled={!claimable}
          className={`shrink-0 rounded-2xl px-4 py-2.5 text-sm font-extrabold transition active:scale-95 ${
            claimable ? 'bg-white text-orange-600' : 'bg-white/20 text-white/70'
          }`}
        >
          {claimable ? t('quest.claim') : t('roadpass.claimed_today')}
        </button>
      </div>

      {next !== null && (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-[11px] text-white/85">
            <span>{t('roadpass.to_milestone', { n: next })}</span>
            <span className="font-semibold">{active}/{next}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/25">
            <m.div
              className="h-full rounded-full bg-white"
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, Math.round((active / next) * 100))}%` }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">
        {reward ? (
          <m.div
            key="reward"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="mt-3 flex items-center gap-2 rounded-2xl bg-white/20 px-3 py-2 text-sm font-bold"
          >
            <Sparkles size={16} strokeWidth={2.4} />
            +{reward.xp} XP · 🪙 {reward.coins}
            {reward.milestone > 0 && <span className="ml-auto text-[11px]">{t('roadpass.milestone_hit', { n: reward.milestone })}</span>}
          </m.div>
        ) : (
          claimable && (
            <div className="mt-3 text-[11px] text-white/80">
              {t('roadpass.today_reward', { xp: preview.xp, coins: preview.coins })}
              {preview.milestone > 0 && t('roadpass.milestone_suffix', { n: preview.milestone })}
            </div>
          )
        )}
      </AnimatePresence>
    </div>
  )
}

/* ---------- Магазин наград ---------- */

function RewardSection({ kind }: { kind: RewardKind }) {
  const items = rewardsByKind(kind)
  const t = useT()
  return (
    <div className="mx-4 mt-5">
      <div className="mb-1 px-2">
        <span className="text-xs font-bold uppercase tracking-wider text-ink-subtle">{t(KIND_TITLE_KEY[kind])}</span>
      </div>
      <p className="mb-2 px-2 text-[11px] text-ink-subtle">{t(KIND_HINT_KEY[kind])}</p>
      <div className="flex flex-col gap-2">
        {items.map((r) => (
          <RewardRow key={r.id} reward={r} />
        ))}
      </div>
    </div>
  )
}

function RewardRow({ reward }: { reward: RewardDef }) {
  const t = useT()
  const equippedId = useStore((s) => s.equipped[reward.kind])
  const owned = useStore((s) => s.owned.includes(reward.id))
  const coins = useStore((s) => s.coins)
  const equipReward = useStore((s) => s.equipReward)
  const buyReward = useStore((s) => s.buyReward)
  const equipped = equippedId === reward.id
  const rarity = RARITY[reward.rarity]
  const price = rewardPrice(reward)
  const affordable = coins >= price

  const onEquip = () => {
    if (!owned || equipped) return
    hapticTap()
    equipReward(reward.kind, reward.id)
  }

  const onBuy = () => {
    if (owned) return
    if (!affordable) { hapticNotify('error'); return }
    const ok = buyReward(reward.id)
    if (ok) {
      hapticNotify('success')
      equipReward(reward.kind, reward.id) // покупка сразу надевается
    }
  }

  return (
    <div
      className={`card flex items-center gap-3 p-3 transition ${owned ? '' : affordable ? '' : 'opacity-70'}`}
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
          🪙 {price.toLocaleString('ru-RU')}
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
