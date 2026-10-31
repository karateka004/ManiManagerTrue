import { useEffect, useSyncExternalStore, type ComponentType, type ReactElement, type SVGProps } from 'react'
import {
  Briefcase, Banknote, Gift, Sparkles, ShoppingCart, Coffee, Bus, Car,
  Home, HeartPulse, Shirt, Gamepad2, Dumbbell, Smartphone, MoreHorizontal, Receipt,
  Wallet, ShoppingBasket,
  type LucideProps,
} from 'lucide-react'

/**
 * Иконки категорий на базе lucide-react (line-art, currentColor).
 *
 * Здесь — только встроенные категории и самые частые свои: этот модуль едет в
 * стартовом чанке (список категорий на Главной). Остальные ~150 иконок пикера
 * лежат в categoryIconsMore.tsx и грузятся отдельным чанком: в стартовом они
 * весили ~75 КБ (~17 КБ gzip) — больше половины всего, что грузилось ради
 * иконок. Нужна иконка из того набора, а он ещё не пришёл, — на её месте пустое
 * место того же размера, через мгновение иконка; main.tsx начинает загрузку
 * сразу, если у человека есть свои категории с такими иконками.
 */

export type IconProps = SVGProps<SVGSVGElement> & { size?: number }
export type AnyIcon = ComponentType<LucideProps> | ((p: IconProps) => ReactElement)

/* ---------- Встроенный набор: ключ → компонент иконки ---------- */

const BASE: Record<string, AnyIcon> = {
  salary: Briefcase, freelance: Banknote, gift_in: Gift, other_in: Sparkles,
  food: ShoppingCart, cafe: Coffee, transport: Bus, car: Car,
  home: Home, health: HeartPulse, clothes: Shirt, fun: Gamepad2,
  gift: Gift, sport: Dumbbell, phone: Smartphone, other: MoreHorizontal,
  receipt: Receipt, wallet: Wallet, basket: ShoppingBasket,
}

/** Иконка из встроенного набора — рисуется без загрузки. */
export const isBaseIcon = (id: string) => id in BASE

/* ---------- Остальные иконки — ленивым чанком ---------- */

let more: Record<string, AnyIcon> | null = null
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()

/** Вызывает categoryIconsMore при загрузке: набор сразу доступен всем, кто ждал. */
export function registerMoreIcons(icons: Record<string, AnyIcon>) {
  more = icons
  for (const l of listeners) l()
}

/** Загрузить остальные иконки (один раз; сбой сети — повтор при следующем вызове). */
export function loadMoreIcons(): Promise<void> {
  loading ??= import('./categoryIconsMore').then(
    () => undefined,
    () => {
      loading = null
    },
  )
  return loading
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
const snapshot = () => more

interface CategoryIconProps extends Omit<SVGProps<SVGSVGElement>, 'id'> {
  id: string
  size?: number
}

function MoreIcon({ id, size = 22, ...rest }: CategoryIconProps) {
  const icons = useSyncExternalStore(subscribe, snapshot)
  useEffect(() => {
    if (!icons) void loadMoreIcons()
  }, [icons])
  // Пока набор грузится — пустое место того же размера: строка не прыгает.
  if (!icons) return <svg width={size} height={size} aria-hidden {...rest} />
  const Cmp = icons[id] ?? MoreHorizontal
  return <Cmp size={size} strokeWidth={1.75} {...rest} />
}

export function CategoryIcon({ id, size = 22, ...rest }: CategoryIconProps) {
  const Cmp = BASE[id]
  if (Cmp) return <Cmp size={size} strokeWidth={1.75} {...rest} />
  return <MoreIcon id={id} size={size} {...rest} />
}
