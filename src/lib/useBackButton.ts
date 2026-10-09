import { useEffect, useRef } from 'react'
import { pushBackHandler } from './telegram'

/**
 * Пока `active`, системная кнопка «Назад» Telegram вызывает `onBack`.
 * Вложенные экраны (Настройки, Магазин, Титулы) и шторки — как в нативных
 * приложениях: назад можно и кнопкой в шапке, и кнопкой Telegram.
 */
export function useBackButton(active: boolean, onBack: () => void) {
  const ref = useRef(onBack)
  ref.current = onBack
  useEffect(() => {
    if (!active) return
    return pushBackHandler(() => ref.current())
  }, [active])
}
