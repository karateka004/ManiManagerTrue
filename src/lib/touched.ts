import { useSyncExternalStore } from 'react'

/**
 * «Только что изменили» — какую категорию задела последняя запись. Строка
 * этой категории на Главной вспыхивает фоном: видно, куда легла операция.
 *
 * Отдельный маленький сигнал, а не поле стора: это не данные, его не надо
 * сохранять и синхронизировать, а подписка на стор будила бы все строки.
 * Каждая строка подписана на «моя ли категория» — перерисовывается только та,
 * которую задели.
 */

let touched: { categoryId: string; at: number } | null = null
const listeners = new Set<() => void>()

/** Сколько живёт вспышка: открыл Главную позже — вспышки уже нет. */
const FRESH_MS = 3500

export function markTouched(categoryId: string) {
  touched = { categoryId, at: Date.now() }
  for (const l of listeners) l()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** Время последней записи в категорию (0 — не задевали). */
export function useTouchedAt(categoryId: string): number {
  return useSyncExternalStore(subscribe, () => (touched && touched.categoryId === categoryId ? touched.at : 0))
}

/** Свежая ли отметка: вспышку показываем, только пока запись «только что». */
export function isFresh(at: number): boolean {
  return at > 0 && Date.now() - at < FRESH_MS
}
