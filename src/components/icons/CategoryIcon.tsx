import type { ReactElement, ReactNode, SVGProps } from 'react'

/**
 * Иконки категорий в стиле Monefy / Tabler Icons:
 * line-art, stroke-width 1.5, 24x24, currentColor.
 *
 * Все иконки — чистые контуры с round caps, никакой заливки,
 * чтобы цвет легко прокрашивался через currentColor.
 */

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

const baseProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

function Svg({ size = 24, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg width={size} height={size} {...baseProps} {...rest}>
      {children}
    </svg>
  )
}

/* ---------- Incomes ---------- */

// Зарплата — портфель с ручкой и пряжкой
function SalaryIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3" y="7" width="18" height="13" rx="2.5" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
      <path d="M3 12.5h18" />
      <path d="M11 11.5v2" />
    </Svg>
  )
}

// Подработка — банкнота с символом
function FreelanceIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="2.5" y="6.5" width="19" height="11" rx="2" />
      <circle cx="12" cy="12" r="2.4" />
      <path d="M5.5 9.5h.01M18.5 14.5h.01" />
    </Svg>
  )
}

// Подарок (доход) — коробка с лентой
function GiftInIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3.5 10h17v9.5a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5V10z" />
      <rect x="2.5" y="7" width="19" height="3.5" rx="0.8" />
      <path d="M12 7v13" />
      <path d="M12 7s-1.6-3.5-3.6-3.5a1.9 1.9 0 0 0 0 3.5H12zM12 7s1.6-3.5 3.6-3.5a1.9 1.9 0 0 1 0 3.5H12z" />
    </Svg>
  )
}

// Прочее (доход) — искра/звёздочка
function SparkleIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3.5l1.8 4.6 4.7 1.8-4.7 1.8L12 16.3l-1.8-4.6-4.7-1.8 4.7-1.8L12 3.5z" />
      <path d="M19 17l.7 1.8 1.8.7-1.8.7L19 22l-.7-1.8-1.8-.7 1.8-.7L19 17z" />
    </Svg>
  )
}

/* ---------- Expenses ---------- */

// Еда — продуктовая корзина
function FoodIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 6h2.2l2.3 9.4a2 2 0 0 0 1.9 1.5h7.6a2 2 0 0 0 2-1.5L21 9H6" />
      <circle cx="10" cy="20" r="1.3" />
      <circle cx="17" cy="20" r="1.3" />
    </Svg>
  )
}

// Кафе — чашка с паром
function CafeIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 9h13v6.5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V9z" />
      <path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17" />
      <path d="M8 5c.5.7.5 1.3 0 2M11 5c.5.7.5 1.3 0 2M14 5c.5.7.5 1.3 0 2" />
    </Svg>
  )
}

// Транспорт — автобус
function TransportIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="4" y="3.5" width="16" height="14" rx="2.5" />
      <path d="M4 12h16M8 3.5V6M16 3.5V6" />
      <circle cx="8" cy="20" r="1.3" />
      <circle cx="16" cy="20" r="1.3" />
      <path d="M8 18.7v-1.2M16 18.7v-1.2" />
    </Svg>
  )
}

// Машина — авто сбоку
function CarIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 14.5l1.7-5a2.5 2.5 0 0 1 2.4-1.7h9.8a2.5 2.5 0 0 1 2.4 1.7l1.7 5" />
      <path d="M3 14.5h18v3.5a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V17H7v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3.5z" />
      <circle cx="7.5" cy="15.5" r="0.9" />
      <circle cx="16.5" cy="15.5" r="0.9" />
    </Svg>
  )
}

// Жильё — домик с крышей и трубой
function HomeIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3.5 11.5L12 4l8.5 7.5" />
      <path d="M5 10.7V20a.5.5 0 0 0 .5.5h13a.5.5 0 0 0 .5-.5v-9.3" />
      <path d="M10 20.5v-5h4v5" />
      <path d="M17 6V4h2v3.7" />
    </Svg>
  )
}

// Здоровье — сердце с пульсом
function HealthIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
      <path d="M8 12.5h2l1-2 2 4 1-2h2" />
    </Svg>
  )
}

// Одежда — футболка
function ClothesIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8.5 4l-5 2.5L5 10l2.5-1v10.5a.5.5 0 0 0 .5.5h8a.5.5 0 0 0 .5-.5V9L19 10l1.5-3.5L15.5 4l-1.5 2-2 .8-2-.8L8.5 4z" />
    </Svg>
  )
}

// Развлечения — геймпад
function FunIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6 8.5h12a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3c-1 0-1.8-.4-2.5-1.2L14 14.5h-4l-1.5 1.8C7.8 17.1 7 17.5 6 17.5a3 3 0 0 1-3-3v-3a3 3 0 0 1 3-3z" />
      <path d="M7.5 11.5v2M6.5 12.5h2" />
      <circle cx="15" cy="11.8" r="0.7" />
      <circle cx="16.8" cy="13.3" r="0.7" />
    </Svg>
  )
}

// Подарки (расход) — коробка с бантом
function GiftIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="10" width="17" height="10" rx="1.2" />
      <path d="M2.5 7h19v3h-19z" />
      <path d="M12 7v13" />
      <path d="M12 7c-.6-1.8-1.7-3.5-3.4-3.5a1.8 1.8 0 1 0 0 3.5H12z" />
      <path d="M12 7c.6-1.8 1.7-3.5 3.4-3.5a1.8 1.8 0 1 1 0 3.5H12z" />
    </Svg>
  )
}

// Спорт — гантель
function SportIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 10v4M21 10v4" />
      <rect x="4.5" y="7.5" width="3" height="9" rx="0.8" />
      <rect x="16.5" y="7.5" width="3" height="9" rx="0.8" />
      <path d="M7.5 12h9" />
    </Svg>
  )
}

// Связь — смартфон
function PhoneIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <path d="M10 5.5h4" />
      <circle cx="12" cy="18.3" r="0.8" />
    </Svg>
  )
}

// Прочее (расход) — три точки в круге
function OtherIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="8" cy="12" r="0.7" />
      <circle cx="12" cy="12" r="0.7" />
      <circle cx="16" cy="12" r="0.7" />
    </Svg>
  )
}

/* ---------- Дополнительные иконки для пользовательских категорий ---------- */

function ReceiptIcon(p: IconProps) {
  return (<Svg {...p}><path d="M6 3.5h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3v-17z" /><path d="M9 8h6M9 11.5h6M9 15h4" /></Svg>)
}
function PlaneIcon(p: IconProps) {
  return (<Svg {...p}><path d="M10.5 13.5 4 15l-1-2 6-3.5L9 4l2 0 2 6 5.5-3a1.6 1.6 0 0 1 1.6 2.8L15 12l1 7-2 .6-3.5-6.1z" /></Svg>)
}
function TagIcon(p: IconProps) {
  return (<Svg {...p}><path d="M3.5 12.5 11 5h6.5v6.5L10 19a1.5 1.5 0 0 1-2.1 0l-4.4-4.4a1.5 1.5 0 0 1 0-2.1z" /><circle cx="14.5" cy="8.5" r="1" /></Svg>)
}
function PawIcon(p: IconProps) {
  return (<Svg {...p}><circle cx="6.5" cy="10" r="1.6" /><circle cx="10" cy="7" r="1.6" /><circle cx="14" cy="7" r="1.6" /><circle cx="17.5" cy="10" r="1.6" /><path d="M8 16c0-2 1.8-3.5 4-3.5s4 1.5 4 3.5c0 1.8-1.6 2.7-4 2.7S8 17.8 8 16z" /></Svg>)
}
function DevicesIcon(p: IconProps) {
  return (<Svg {...p}><rect x="2.5" y="5" width="13" height="9" rx="1.5" /><path d="M2.5 17h11" /><rect x="16" y="9" width="5.5" height="10" rx="1.3" /></Svg>)
}
function PotIcon(p: IconProps) {
  return (<Svg {...p}><path d="M4 9h16l-1 9.5a1.5 1.5 0 0 1-1.5 1.3H6.5A1.5 1.5 0 0 1 5 18.5L4 9z" /><path d="M2.5 9h19M7 9V6.5M17 9V6.5M12 9V5.5" /></Svg>)
}
function BrushIcon(p: IconProps) {
  return (<Svg {...p}><path d="M14 3.5 20.5 10l-7 7H8l-2.5 2.5L3 17l2.5-2.5V9l8.5-5.5z" /><path d="M11 7l6 6" /></Svg>)
}
function WasherIcon(p: IconProps) {
  return (<Svg {...p}><rect x="4.5" y="3" width="15" height="18" rx="2" /><circle cx="12" cy="13.5" r="4.5" /><path d="M8 6h.01M11 6h.01" /></Svg>)
}
function TentIcon(p: IconProps) {
  return (<Svg {...p}><path d="M12 4 3 19h18L12 4z" /><path d="M12 8.5 8 19M12 8.5 16 19" /></Svg>)
}
function GamepadIcon(p: IconProps) {
  return (<Svg {...p}><rect x="2.5" y="8" width="19" height="9" rx="4.5" /><path d="M7 11v3M5.5 12.5h3" /><circle cx="15.5" cy="11.8" r="0.8" /><circle cx="17.8" cy="13.6" r="0.8" /></Svg>)
}
function FirstAidIcon(p: IconProps) {
  return (<Svg {...p}><rect x="3" y="7" width="18" height="12" rx="2.5" /><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" /><path d="M12 10.5v5M9.5 13h5" /></Svg>)
}
function BookIcon(p: IconProps) {
  return (<Svg {...p}><path d="M12 6.5C10.5 5 8 4.5 4 5v13c4-.5 6.5 0 8 1.5 1.5-1.5 4-2 8-1.5V5c-4-.5-6.5 0-8 1.5z" /><path d="M12 6.5v13" /></Svg>)
}
function TshirtIcon(p: IconProps) {
  return (<Svg {...p}><path d="M8.5 4l-5 2.5L5 10l2.5-1v10.5a.5.5 0 0 0 .5.5h8a.5.5 0 0 0 .5-.5V9L19 10l1.5-3.5L15.5 4l-1.5 2-2 .8-2-.8L8.5 4z" /></Svg>)
}
function SneakerIcon(p: IconProps) {
  return (<Svg {...p}><path d="M3 16.5V11l4.5-1 3 3 5 1.2c2.4.6 5 .8 5 2.3v1.5a.5.5 0 0 1-.5.5H4a1 1 0 0 1-1-1.3z" /><path d="M7.5 10l2 2.4M11 13l2.5.6" /></Svg>)
}
function HouseMoneyIcon(p: IconProps) {
  return (<Svg {...p}><path d="M4 11 12 4.5 20 11" /><path d="M5.5 10v9.5h13V10" /><path d="M12 13v4M10.5 14h2.2a1 1 0 0 1 0 2H11a1 1 0 0 0 0 2h2.5" /></Svg>)
}
function HangerIcon(p: IconProps) {
  return (<Svg {...p}><path d="M12 7a2 2 0 1 1 2 2c-1 0-2 .6-2 1.6V12" /><path d="M12 12 3.5 17.5a1 1 0 0 0 .6 1.8h15.8a1 1 0 0 0 .6-1.8L12 12z" /></Svg>)
}
function TargetIcon(p: IconProps) {
  return (<Svg {...p}><circle cx="11" cy="13" r="7.5" /><circle cx="11" cy="13" r="3.5" /><path d="M16 8l2.5-2.5M18.5 5.5V3h-2.5" /></Svg>)
}
function CroissantIcon(p: IconProps) {
  return (<Svg {...p}><path d="M4 17c2-7 9-11 16-9-2 7-9 11-16 9z" /><path d="M4 17l3.5-3.5M9 16l3-5M13.5 14.5 17 11" /></Svg>)
}
function WalletIcon(p: IconProps) {
  return (<Svg {...p}><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 9.5h13a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2H3" /><circle cx="16.5" cy="13.5" r="0.9" /></Svg>)
}
function BasketIcon(p: IconProps) {
  return (<Svg {...p}><path d="M4 9h16l-1.4 9.2a1.5 1.5 0 0 1-1.5 1.3H6.9a1.5 1.5 0 0 1-1.5-1.3L4 9z" /><path d="M8.5 9 11 4M15.5 9 13 4M9.5 12.5v3.5M14.5 12.5v3.5" /></Svg>)
}
function CapIcon(p: IconProps) {
  return (<Svg {...p}><path d="M2.5 9 12 5l9.5 4-9.5 4-9.5-4z" /><path d="M6.5 11v4c0 1.3 2.5 2.5 5.5 2.5s5.5-1.2 5.5-2.5v-4M21.5 9v4.5" /></Svg>)
}
function FamilyIcon(p: IconProps) {
  return (<Svg {...p}><circle cx="8" cy="7" r="2.3" /><circle cx="16" cy="7" r="2.3" /><path d="M4 19v-1.5A3.5 3.5 0 0 1 7.5 14h1A3.5 3.5 0 0 1 12 17.5V19M12 19v-1.5A3.5 3.5 0 0 1 15.5 14h1a3.5 3.5 0 0 1 3.5 3.5V19" /></Svg>)
}
function MuscleIcon(p: IconProps) {
  return (<Svg {...p}><path d="M5 20v-5.5C5 11 7 9 10 9c1.5 0 2-1 2-2.5C12 5 13 4 14.5 4S17 5.2 17 7c0 4-1.5 6-1.5 8.5 0 2.5-1.5 4.5-4.5 4.5H5z" /><path d="M9.5 13c1.5.8 3.5.8 5 0" /></Svg>)
}
function BeerIcon(p: IconProps) {
  return (<Svg {...p}><path d="M5 8h10v11a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 5 19V8z" /><path d="M15 10h2.5A2.5 2.5 0 0 1 20 12.5v2A2.5 2.5 0 0 1 17.5 17H15" /><path d="M6 8c0-2 1.5-3.5 4-3.5S14 6 14 8" /></Svg>)
}
function FuelIcon(p: IconProps) {
  return (<Svg {...p}><rect x="4" y="4" width="9" height="16" rx="1.5" /><path d="M4 11h9" /><path d="M13 8h3.5a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0V9l-2.5-2.5" /></Svg>)
}

const REGISTRY: Record<string, (p: IconProps) => ReactElement> = {
  // income
  salary: SalaryIcon,
  freelance: FreelanceIcon,
  gift_in: GiftInIcon,
  other_in: SparkleIcon,

  // expense
  food: FoodIcon,
  cafe: CafeIcon,
  transport: TransportIcon,
  car: CarIcon,
  home: HomeIcon,
  health: HealthIcon,
  clothes: ClothesIcon,
  fun: FunIcon,
  gift: GiftIcon,
  sport: SportIcon,
  phone: PhoneIcon,
  other: OtherIcon,

  // extra (для пользовательских категорий)
  receipt: ReceiptIcon,
  plane: PlaneIcon,
  tag: TagIcon,
  paw: PawIcon,
  devices: DevicesIcon,
  pot: PotIcon,
  brush: BrushIcon,
  washer: WasherIcon,
  tent: TentIcon,
  gamepad: GamepadIcon,
  firstaid: FirstAidIcon,
  book: BookIcon,
  tshirt: TshirtIcon,
  sneaker: SneakerIcon,
  house_money: HouseMoneyIcon,
  hanger: HangerIcon,
  target: TargetIcon,
  croissant: CroissantIcon,
  wallet: WalletIcon,
  basket: BasketIcon,
  cap: CapIcon,
  family: FamilyIcon,
  muscle: MuscleIcon,
  beer: BeerIcon,
  fuel: FuelIcon,
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
  const Cmp = REGISTRY[id] ?? OtherIcon
  return <Cmp size={size} {...rest} />
}

export const hasCategoryIcon = (id: string) => id in REGISTRY
