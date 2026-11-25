import type { DoorState } from '../../../lib/advent'
import type { AdventPhase } from '../../../lib/season'

/** Что знает доска календаря (шкатулка): правила и подарки — снаружи. */
export interface BoardProps {
  year: number
  phase: AdventPhase
  /** День декабря в `live`, иначе 0. */
  today: number
  /** Состояние окошка по дню: `states[day - 1]`. */
  states: DoorState[]
  /** Окошко, чей подарок раскрыт под календарём. */
  selected: number | null
  /** Только что открытое — играет анимация открытия. */
  opening: number | null
  doorRef: (day: number) => (el: HTMLButtonElement | null) => void
  onDoor: (day: number) => void
  /** Подпись окошка для диктора. */
  label: (day: number, state: DoorState) => string
}

/** Позиция окошка: столбец по дню недели (пн = 0), ряд — неделя декабря. */
export function weekGrid(year: number): { col: number; row: number }[] {
  const first = (new Date(year, 11, 1).getDay() + 6) % 7
  return Array.from({ length: 31 }, (_, i) => {
    const k = first + i
    return { col: k % 7, row: Math.floor(k / 7) }
  })
}
