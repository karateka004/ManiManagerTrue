import type { ComponentType } from 'react'
import {
  CalendarCheck,
  CalendarRange,
  Compass,
  Crown,
  Flag,
  Flame,
  Medal,
  Megaphone,
  Palette,
  PenLine,
  PieChart,
  Receipt,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Target,
  TrendingUp,
  Trophy,
  UserPlus,
  Users,
  type LucideProps,
} from 'lucide-react'

/**
 * Иконки заданий.
 *
 * Раньше в карточке стояло эмодзи из определения задания. Эмодзи рисует шрифт
 * системы: на телефоне оно цветное и растровое, среди line-art интерфейса
 * выглядит инородно и дёшево, а на тёмной теме ещё и теряет контраст. Здесь тот
 * же набор lucide, что у категорий, плюс свой цвет на задание — борд читается с
 * одного взгляда, а не сливается в одинаковые серые квадраты.
 *
 * Ключ — id задания, поэтому определение квеста (`quests.ts`) остаётся про
 * правила и награды, а внешний вид живёт здесь.
 */
const ICONS: Record<string, { icon: ComponentType<LucideProps>; color: string }> = {
  first_tx: { icon: PenLine, color: '#3CA37B' },
  see_analytics: { icon: PieChart, color: '#6FA8DC' },
  subscribe_channel: { icon: Megaphone, color: '#E76F8E' },
  try_period: { icon: CalendarRange, color: '#9B7EDE' },
  tx_10: { icon: Receipt, color: '#F4A261' },
  set_budget: { icon: Target, color: '#E97373' },
  use_search: { icon: Search, color: '#4DB6AC' },
  make_category: { icon: Tag, color: '#B48EAD' },
  use_repeat: { icon: RefreshCw, color: '#5DB996' },
  diversify_5: { icon: Palette, color: '#F2C14E' },
  set_goal: { icon: Flag, color: '#7BC47F' },
  open_planning: { icon: Compass, color: '#6FA8DC' },
  streak_3: { icon: Flame, color: '#F4A261' },
  see_charts: { icon: TrendingUp, color: '#7C8DB5' },
  personalize: { icon: SlidersHorizontal, color: '#9B7EDE' },
  see_leaderboard: { icon: Trophy, color: '#F2C14E' },
  log_7: { icon: CalendarCheck, color: '#4DB6AC' },
  under_budget: { icon: ShieldCheck, color: '#3CA37B' },
  goal_reached: { icon: Medal, color: '#F2C14E' },
  invite_1: { icon: UserPlus, color: '#5DB996' },
  invite_3: { icon: Users, color: '#6FA8DC' },
  invite_5: { icon: Crown, color: '#F2C14E' },
}

/** Запасной вид, если задание добавили в пул, а иконку завести забыли. */
const FALLBACK = { icon: Sparkles, color: '#8A968F' }

export function QuestIcon({ id, size = 20 }: { id: string; size?: number }) {
  const { icon: Icon, color } = ICONS[id] ?? FALLBACK
  return (
    <span
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
      style={{ background: color + '1F', color }}
    >
      <Icon size={size} strokeWidth={2.2} />
    </span>
  )
}
