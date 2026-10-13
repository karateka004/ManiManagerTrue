import { createContext, useContext } from 'react'

/**
 * Вкладка на экране или ждёт рядом скрытой.
 *
 * Соседние вкладки App держит отрисованными заранее: свайп сразу показывает
 * соседний экран и ведёт его за пальцем (lib/useSwipeNav). Скрытая вкладка не
 * должна вести себя как открытая — показывать «Назад» Telegram, ходить в сеть
 * «при открытии», двигать прокрутку окна. Такие эффекты смотрят сюда.
 */
export const TabActiveContext = createContext(true)

export function useTabActive(): boolean {
  return useContext(TabActiveContext)
}
