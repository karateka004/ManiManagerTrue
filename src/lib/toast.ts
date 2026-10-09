import { useSyncExternalStore } from 'react'

/**
 * Короткие уведомления внизу экрана: «Записано · Еда −300 € · Отменить»,
 * «Куплено», «Ссылка скопирована».
 *
 * Одно уведомление за раз: новое заменяет старое, очередь из трёх «записано»
 * подряд была бы шумом. Хранилище — модульное, а не в zustand-сторе: тост не
 * данные пользователя, его не надо сохранять и синхронизировать.
 */

export interface ToastAction {
  label: string
  run: () => void
}

export interface Toast {
  id: number
  text: string
  /** Вторая строка, приглушённая. */
  sub?: string
  action?: ToastAction
  icon?: 'check' | 'coins' | 'link' | 'undo' | 'gift'
  /** Сколько висит, мс. С действием — дольше: человеку нужно успеть нажать. */
  duration: number
  /** Уходит: проигрывается анимация исчезновения. */
  leaving?: boolean
}

let current: Toast | null = null
let seq = 0
let hideTimer: ReturnType<typeof setTimeout> | undefined
let removeTimer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function showToast(t: Omit<Toast, 'id' | 'duration' | 'leaving'> & { duration?: number }): number {
  clearTimeout(hideTimer)
  clearTimeout(removeTimer)
  const id = ++seq
  const duration = t.duration ?? (t.action ? 5000 : 2600)
  current = { ...t, id, duration }
  emit()
  hideTimer = setTimeout(() => hideToast(id), duration)
  return id
}

/** Спрятать (текущее или конкретное, если id совпадает). */
export function hideToast(id?: number) {
  if (!current || (id !== undefined && current.id !== id) || current.leaving) return
  clearTimeout(hideTimer)
  current = { ...current, leaving: true }
  emit()
  const leavingId = current.id
  removeTimer = setTimeout(() => {
    if (current?.id === leavingId) {
      current = null
      emit()
    }
  }, 220)
}

export function useToast(): Toast | null {
  return useSyncExternalStore(subscribe, () => current, () => null)
}
