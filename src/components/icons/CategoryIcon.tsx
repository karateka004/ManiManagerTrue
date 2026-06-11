import type { ComponentType, ReactElement, SVGProps } from 'react'
import {
  Briefcase,
  Banknote,
  Gift,
  Sparkles,
  ShoppingCart,
  Coffee,
  Bus,
  Car,
  Home,
  HeartPulse,
  Shirt,
  Gamepad2,
  Dumbbell,
  Smartphone,
  MoreHorizontal,
  Receipt,
  Plane,
  Tag,
  PawPrint,
  MonitorSmartphone,
  CookingPot,
  Paintbrush,
  WashingMachine,
  Tent,
  BriefcaseMedical,
  BookOpen,
  Footprints,
  Target,
  Croissant,
  Wallet,
  ShoppingBasket,
  Users,
  Beer,
  Fuel,
  type LucideProps,
} from 'lucide-react'

/**
 * Иконки категорий на базе lucide-react (line-art, currentColor).
 * Несколько иконок, которых нет в lucide (вешалка, кепка, бицепс, дом-копилка),
 * дорисованы вручную в том же стиле: 24x24, stroke-width 2, round caps.
 */

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

/* ---------- Кастомные иконки (нет в lucide) ---------- */

const customBase = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

// Вешалка для одежды
function HangerIcon({ size = 24, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} {...customBase} {...rest}>
      <path d="M12 8a2 2 0 1 1 2 2c-1.1 0-2 .7-2 1.8V13" />
      <path d="M12 13 3.6 18.1A1 1 0 0 0 4.1 20h15.8a1 1 0 0 0 .5-1.9L12 13z" />
    </svg>
  )
}

// Бейсболка
function CapIcon({ size = 24, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} {...customBase} {...rest}>
      <path d="M3 15a9 9 0 0 1 18 0" />
      <path d="M21 15c1.2 0 2 .8 2 1.5S22.2 18 21 18H3v-3z" />
      <path d="M12 6v9" />
    </svg>
  )
}

// Бицепс / сила
function MuscleIcon({ size = 24, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} {...customBase} {...rest}>
      <path d="M5 20v-5.5C5 11 7 9 10 9c1.6 0 2-1 2-2.5C12 5 13 4 14.5 4S17 5.2 17 7c0 4-1.5 6-1.5 8.5 0 2.5-1.6 4.5-4.5 4.5H5z" />
      <path d="M9.5 13c1.5.8 3.5.8 5 0" />
    </svg>
  )
}

// Дом-копилка (ипотека / жильё с деньгами)
function HouseMoneyIcon({ size = 24, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} {...customBase} {...rest}>
      <path d="M4 11 12 4.5 20 11" />
      <path d="M5.5 10v9.5h13V10" />
      <path d="M12 13v4" />
      <path d="M10.5 14h2.2a1 1 0 0 1 0 2H11a1 1 0 0 0 0 2h2.5" />
    </svg>
  )
}

/* ---------- Реестр: ключ → компонент иконки ---------- */

type AnyIcon = ComponentType<LucideProps> | ((p: IconProps) => ReactElement)

const REGISTRY: Record<string, AnyIcon> = {
  // income
  salary: Briefcase,
  freelance: Banknote,
  gift_in: Gift,
  other_in: Sparkles,

  // expense
  food: ShoppingCart,
  cafe: Coffee,
  transport: Bus,
  car: Car,
  home: Home,
  health: HeartPulse,
  clothes: Shirt,
  fun: Gamepad2,
  gift: Gift,
  sport: Dumbbell,
  phone: Smartphone,
  other: MoreHorizontal,

  // extra (для пользовательских категорий)
  receipt: Receipt,
  plane: Plane,
  tag: Tag,
  paw: PawPrint,
  devices: MonitorSmartphone,
  pot: CookingPot,
  brush: Paintbrush,
  washer: WashingMachine,
  tent: Tent,
  gamepad: Gamepad2,
  firstaid: BriefcaseMedical,
  book: BookOpen,
  tshirt: Shirt,
  sneaker: Footprints,
  house_money: HouseMoneyIcon,
  hanger: HangerIcon,
  target: Target,
  croissant: Croissant,
  wallet: Wallet,
  basket: ShoppingBasket,
  cap: CapIcon,
  family: Users,
  muscle: MuscleIcon,
  beer: Beer,
  fuel: Fuel,
}

/** Ключи иконок, доступные в пикере при создании категории. */
export const ICON_KEYS: string[] = [
  'receipt', 'plane', 'tag', 'paw', 'devices',
  'pot', 'brush', 'washer', 'tent', 'gamepad',
  'car', 'firstaid', 'book', 'tshirt', 'sneaker',
  'house_money', 'hanger', 'target', 'croissant', 'wallet',
  'basket', 'cap', 'family', 'muscle', 'beer',
  'fuel', 'food', 'cafe', 'transport', 'home',
  'health', 'phone', 'sport', 'gift', 'salary',
]

interface CategoryIconProps extends Omit<SVGProps<SVGSVGElement>, 'id'> {
  id: string
  size?: number
}

export function CategoryIcon({ id, size = 22, ...rest }: CategoryIconProps) {
  const Cmp = REGISTRY[id] ?? MoreHorizontal
  return <Cmp size={size} strokeWidth={1.75} {...rest} />
}

export const hasCategoryIcon = (id: string) => id in REGISTRY
