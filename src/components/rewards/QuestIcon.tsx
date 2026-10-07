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
 * Ключ — id задания, поэтому определение квеста (`quests.ts`) остаётся про
 * правила и награды, а внешний вид живёт здесь.
 *
 * 2.0: иконка линейная и цвета подписи, без цветного квадрата. Раньше у каждого
 * задания был свой цвет, и список из шести заданий превращался в шесть пятен,
 * которые ничего не сообщали: цвет задания не значит ничего, в отличие от цвета
 * категории (по нему её находят на диаграмме). Заметным в списке должно быть
 * только готовое к получению — его выделяет кнопка «Забрать».
 */
const ICONS: Record<string, ComponentType<LucideProps>> = {
  first_tx: PenLine,
  see_analytics: PieChart,
  subscribe_channel: Megaphone,
  try_period: CalendarRange,
  tx_10: Receipt,
  set_budget: Target,
  use_search: Search,
  make_category: Tag,
  use_repeat: RefreshCw,
  diversify_5: Palette,
  set_goal: Flag,
  open_planning: Compass,
  streak_3: Flame,
  see_charts: TrendingUp,
  personalize: SlidersHorizontal,
  see_leaderboard: Trophy,
  log_7: CalendarCheck,
  under_budget: ShieldCheck,
  goal_reached: Medal,
  invite_1: UserPlus,
  invite_3: Users,
  invite_5: Crown,
}

export function QuestIcon({ id, size = 20 }: { id: string; size?: number }) {
  // Запасной вид — если задание добавили в пул, а иконку завести забыли.
  const Icon = ICONS[id] ?? Sparkles
  return <Icon size={size} strokeWidth={2} aria-hidden />
}
