import type { ComponentType } from 'react'
import {
  Sprout, Calculator, PiggyBank, Briefcase, TrendingUp, Crown, Trophy,
  GraduationCap, Gem, Landmark, Coins, Sparkles, Bitcoin, Swords, BadgeCheck,
  Star, type LucideProps,
} from 'lucide-react'
import { RARITY, type Rarity } from '../../lib/rewards'

/**
 * Значок награды: вместо буквы-заглушки и эмодзи — самостоятельный бейдж
 * с градиентом по редкости и осмысленной иконкой внутри.
 *
 * Градиенты заданы кодом, а не картинками: масштабируются без потери качества,
 * не тянут ассеты в бандл и одинаково выглядят в светлой и тёмной теме.
 */

/** Иконка по id награды. Ключи совпадают с REWARDS в lib/rewards.ts. */
const ICON_BY_ID: Record<string, ComponentType<LucideProps>> = {
  // Титулы магазина
  title_newbie: Sprout,
  title_saver: Coins,
  title_budget: Calculator,
  title_guru: Sparkles,
  title_lord: Crown,
  title_investor: TrendingUp,
  title_shark: Swords,
  title_crypto: Bitcoin,
  title_ambassador: BadgeCheck,

  // Титулы за уровень (совпадают с иконками уровней)
  title_lvl1: Sprout,
  title_lvl2: PiggyBank,
  title_lvl3: Coins,
  title_lvl4: Calculator,
  title_lvl5: Briefcase,
  title_lvl6: TrendingUp,
  title_lvl7: Crown,
  title_lvl8: GraduationCap,
  title_lvl9: Gem,
  title_lvl10: Landmark,
}

/** Иконка уровня 1..10 — та же система символов, что у титулов за уровень. */
const LEVEL_ICONS: ComponentType<LucideProps>[] = [
  Sprout, PiggyBank, Coins, Calculator, Briefcase,
  TrendingUp, Crown, GraduationCap, Gem, Landmark,
]

/** Градиент фона по редкости: от спокойного серого к «драгоценному» золоту. */
const RARITY_GRADIENT: Record<Rarity, [string, string]> = {
  common: ['#8E9BA8', '#63707E'],
  rare: ['#4DA3FF', '#2563EB'],
  epic: ['#B57BFF', '#7C3AED'],
  legendary: ['#FFC24D', '#F0851B'],
}

/** Градиент по уровню: чем выше, тем «дороже» выглядит. */
function levelRarity(level: number): Rarity {
  if (level >= 9) return 'legendary'
  if (level >= 6) return 'epic'
  if (level >= 3) return 'rare'
  return 'common'
}

interface Props {
  /** id награды (для титулов) — определяет иконку. */
  rewardId?: string
  /** Уровень 1..10 — альтернатива rewardId для бейджа уровня. */
  level?: number
  rarity?: Rarity
  size?: number
  /** Приглушить (заблокированная награда). */
  dim?: boolean
}

export function RewardBadge({ rewardId, level, rarity, size = 40, dim }: Props) {
  const lvl = level ? Math.min(Math.max(1, Math.floor(level)), LEVEL_ICONS.length) : null
  const Icon = rewardId ? ICON_BY_ID[rewardId] : lvl ? LEVEL_ICONS[lvl - 1] : undefined
  const finalRarity: Rarity = rarity ?? (lvl ? levelRarity(lvl) : 'common')
  const [from, to] = RARITY_GRADIENT[finalRarity]
  const accent = RARITY[finalRarity].color
  // Уникальный id градиента: несколько бейджей на экране не должны мешать друг другу.
  const gid = `bg-${rewardId ?? 'lvl' + lvl}-${finalRarity}`

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size, filter: dim ? 'grayscale(0.75) opacity(0.65)' : undefined }}
      aria-hidden
    >
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={from} />
            <stop offset="100%" stopColor={to} />
          </linearGradient>
        </defs>
        {/* Скруглённый шестиугольник — форма «жетона», узнаваемая и спокойная */}
        <path
          d="M24 2.6c1.6 0 3.1.4 4.5 1.2l12 6.9a9 9 0 0 1 4.5 7.8v13.8a9 9 0 0 1-4.5 7.8l-12 6.9a9 9 0 0 1-9 0l-12-6.9a9 9 0 0 1-4.5-7.8V18.5a9 9 0 0 1 4.5-7.8l12-6.9A9 9 0 0 1 24 2.6z"
          fill={`url(#${gid})`}
        />
        {/* Мягкий блик сверху — объём без «пластика» */}
        <path
          d="M24 2.6c1.6 0 3.1.4 4.5 1.2l12 6.9c1.6.9 2.8 2.2 3.6 3.7-6 3.6-13 5.6-20.1 5.6s-14.1-2-20.1-5.6c.8-1.5 2-2.8 3.6-3.7l12-6.9A9 9 0 0 1 24 2.6z"
          fill="#fff"
          opacity="0.16"
        />
      </svg>

      {/* Символ поверх жетона */}
      <div className="absolute inset-0 flex items-center justify-center text-white">
        {Icon ? (
          <Icon size={Math.round(size * 0.44)} strokeWidth={2.1} />
        ) : (
          <Star size={Math.round(size * 0.44)} strokeWidth={2.1} />
        )}
      </div>

      {/* Номер уровня в углу — читается даже в мелком размере */}
      {lvl != null && size >= 34 && (
        <span
          className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full border-2 text-[9px] font-extrabold tabular"
          style={{
            width: Math.round(size * 0.42),
            height: Math.round(size * 0.42),
            background: accent,
            borderColor: 'rgb(var(--c-surface-raised))',
            color: '#fff',
          }}
        >
          {lvl}
        </span>
      )}
    </div>
  )
}
