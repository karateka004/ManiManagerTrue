import { useEffect, useRef } from 'react'
import { pushBackHandler } from './telegram'

/**
 * Пока `active`, системная кнопка «Назад» Telegram (и Escape) вызывает `onBack`.
 * Вложенные экраны (Настройки, Магазин, Титулы) и шторки — как в нативных
 * приложениях: назад можно и кнопкой в шапке, и кнопкой Telegram.
 * `modal` — шторка или экран поверх всего: Escape закрывает её и из поля ввода.
 */
export function useBackButton(active: boolean, onBack: () => void, modal = false) {
  const ref = useRef(onBack)
  ref.current = onBack
  useEffect(() => {
    if (!active) return
    return pushBackHandler(() => ref.current(), modal)
  }, [active, modal])
}
