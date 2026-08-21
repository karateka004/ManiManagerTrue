import { Coins } from 'lucide-react'

/**
 * Сумма в монетах: иконка + число.
 *
 * Раньше по всему приложению стояло эмодзи 🪙. Его рисует шрифт системы, поэтому
 * оно выглядит по-разному на разных телефонах, не подчиняется цвету текста и
 * среди line-art иконок смотрится инородно. Иконка lucide наследует currentColor
 * и живёт по тем же правилам, что остальной интерфейс.
 */
export function CoinAmount({ value, size = 13 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Coins size={size} strokeWidth={2.4} />
      {value.toLocaleString('ru-RU')}
    </span>
  )
}
