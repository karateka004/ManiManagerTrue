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
  // Еда и напитки
  Pizza, Sandwich, Salad, IceCreamCone, Cake, Apple, Cherry, Fish, Egg, Milk,
  Wine, Martini, CupSoda, Beef, Carrot, Wheat, Popcorn, Candy, Donut, Soup,
  Utensils, ChefHat,
  // Транспорт и поездки
  Bike, TrainFront, Ship, Sailboat, Truck, TramFront, Rocket, CarTaxiFront,
  Luggage, MapPin, Mountain, Compass, Hotel, TentTree,
  // Дом и быт
  Sofa, Bed, Lamp, Refrigerator, Wrench, Hammer, PaintRoller, Plug, Lightbulb,
  Key, DoorOpen, Trash2, Droplets, Flame, Wifi,
  // Здоровье и красота
  Pill, Stethoscope, Syringe, Scissors, Bath, Glasses, Smile, Brain,
  // Досуг
  Music, Headphones, Film, Clapperboard, Ticket, Tv, PartyPopper, Palette,
  Camera, Guitar, Dices, Trophy, Volleyball, Medal, Snowflake,
  // Семья, дети, питомцы
  Baby, Backpack, GraduationCap, School, ToyBrick, Dog, Cat, Bird,
  // Деньги и работа
  PiggyBank, CreditCard, Landmark, Coins, TrendingUp, Bitcoin, HandCoins,
  BadgePercent, Calculator, ReceiptText, Vault, Laptop, Presentation, PenTool,
  Building2, Store, Factory,
  // Покупки и прочее
  ShoppingBag, Package, Gem, Watch, Heart, Star, Cigarette, Church, Leaf,
  Flower, TreePine, Sun, Umbrella, Shield, Newspaper, Mail, Globe, Cloud, Zap,
  HeartHandshake,
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

  // ---- Расширенный набор (пикер категорий) ----
  pizza: Pizza, sandwich: Sandwich, salad: Salad, icecream: IceCreamCone,
  cake: Cake, apple: Apple, cherry: Cherry, fish: Fish, egg: Egg, milk: Milk,
  wine: Wine, cocktail: Martini, soda: CupSoda, meat: Beef, carrot: Carrot,
  grocery: Wheat, popcorn: Popcorn, candy: Candy, donut: Donut, soup: Soup,
  restaurant: Utensils, cooking: ChefHat,

  bike: Bike, train: TrainFront, ship: Ship, boat: Sailboat, truck: Truck,
  tram: TramFront, rocket: Rocket, taxi: CarTaxiFront, luggage: Luggage,
  place: MapPin, mountain: Mountain, compass: Compass, hotel: Hotel,
  camping: TentTree,

  sofa: Sofa, bed: Bed, lamp: Lamp, fridge: Refrigerator, repair: Wrench,
  hammer: Hammer, paint: PaintRoller, electricity: Plug, bulb: Lightbulb,
  rent: Key, door: DoorOpen, trash: Trash2, water: Droplets, gas: Flame,
  internet: Wifi,

  pills: Pill, doctor: Stethoscope, vaccine: Syringe, barber: Scissors,
  spa: Bath, glasses: Glasses, dentist: Smile, therapy: Brain,

  music: Music, headphones: Headphones, movie: Film, cinema: Clapperboard,
  ticket: Ticket, tv: Tv, party: PartyPopper, art: Palette, photo: Camera,
  guitar: Guitar, boardgame: Dices, trophy: Trophy, ball: Volleyball,
  medal: Medal, winter: Snowflake,

  baby: Baby, backpack: Backpack, education: GraduationCap, school: School,
  toys: ToyBrick, dog: Dog, cat: Cat, bird: Bird,

  savings: PiggyBank, card: CreditCard, bank: Landmark, coins: Coins,
  invest: TrendingUp, crypto: Bitcoin, loan: HandCoins, tax: BadgePercent,
  calc: Calculator, bill: ReceiptText, vault: Vault, work: Laptop,
  course: Presentation, design: PenTool, office: Building2, shop: Store,
  business: Factory,

  bag: ShoppingBag, parcel: Package, jewelry: Gem, watch: Watch,
  charity: Heart, favorite: Star, tobacco: Cigarette, donation: Church,
  eco: Leaf, flowers: Flower, nature: TreePine, summer: Sun,
  insurance: Umbrella, security: Shield, press: Newspaper, post: Mail,
  online: Globe, cloud: Cloud, energy: Zap, help: HeartHandshake,
}

/** Группы иконок для пикера: заголовок (ключ i18n) + ключи иконок. */
export const ICON_GROUPS: { titleKey: string; keys: string[] }[] = [
  {
    titleKey: 'icons.g_popular',
    keys: ['food', 'cafe', 'transport', 'car', 'home', 'health', 'clothes', 'fun',
      'gift', 'sport', 'phone', 'salary', 'wallet', 'receipt', 'basket', 'other'],
  },
  {
    titleKey: 'icons.g_food',
    keys: ['pizza', 'sandwich', 'salad', 'soup', 'meat', 'fish', 'egg', 'milk',
      'carrot', 'apple', 'cherry', 'grocery', 'croissant', 'cake', 'donut', 'candy',
      'icecream', 'popcorn', 'restaurant', 'cooking', 'pot', 'beer', 'wine',
      'cocktail', 'soda'],
  },
  {
    titleKey: 'icons.g_transport',
    keys: ['bike', 'train', 'tram', 'taxi', 'truck', 'ship', 'boat', 'plane',
      'rocket', 'fuel', 'luggage', 'hotel', 'place', 'compass', 'mountain',
      'camping', 'tent'],
  },
  {
    titleKey: 'icons.g_home',
    keys: ['rent', 'house_money', 'sofa', 'bed', 'lamp', 'fridge', 'washer',
      'repair', 'hammer', 'paint', 'brush', 'electricity', 'bulb', 'water', 'gas',
      'internet', 'door', 'trash'],
  },
  {
    titleKey: 'icons.g_health',
    keys: ['pills', 'doctor', 'firstaid', 'vaccine', 'dentist', 'therapy',
      'glasses', 'spa', 'barber', 'muscle', 'ball', 'medal', 'winter'],
  },
  {
    titleKey: 'icons.g_fun',
    keys: ['music', 'headphones', 'guitar', 'movie', 'cinema', 'tv', 'ticket',
      'party', 'art', 'photo', 'boardgame', 'gamepad', 'trophy', 'book'],
  },
  {
    titleKey: 'icons.g_family',
    keys: ['family', 'baby', 'toys', 'school', 'education', 'backpack', 'paw',
      'dog', 'cat', 'bird'],
  },
  {
    titleKey: 'icons.g_money',
    keys: ['savings', 'card', 'bank', 'coins', 'invest', 'crypto', 'loan', 'tax',
      'bill', 'calc', 'vault', 'work', 'course', 'design', 'office', 'shop',
      'business', 'devices'],
  },
  {
    titleKey: 'icons.g_other',
    keys: ['bag', 'parcel', 'jewelry', 'watch', 'hanger', 'tshirt', 'cap',
      'sneaker', 'tag', 'target', 'charity', 'favorite', 'donation', 'help',
      'insurance', 'security', 'eco', 'flowers', 'nature', 'summer', 'press',
      'post', 'online', 'cloud', 'energy', 'tobacco'],
  },
]

/** Плоский список ключей пикера (в порядке групп). */
export const ICON_KEYS: string[] = ICON_GROUPS.flatMap((g) => g.keys)

interface CategoryIconProps extends Omit<SVGProps<SVGSVGElement>, 'id'> {
  id: string
  size?: number
}

export function CategoryIcon({ id, size = 22, ...rest }: CategoryIconProps) {
  const Cmp = REGISTRY[id] ?? MoreHorizontal
  return <Cmp size={size} strokeWidth={1.75} {...rest} />
}

export const hasCategoryIcon = (id: string) => id in REGISTRY
