import { useState } from 'react'
import { tg } from '../../../lib/telegram'

/**
 * Вид календаря адвента. Три варианта на выбор владельца (2.12.1): «Ёлка»,
 * «Зимний городок», «Шкатулка» — правила и подарки общие, разный только вид.
 * Выбор для сравнения: `?advent=village` в браузере, ссылка бота
 * `?startapp=adv_village` или переключатель под календарём у владельца.
 */
export type AdventVariant = 'tree' | 'village' | 'box'

export const ADVENT_VARIANTS: AdventVariant[] = ['tree', 'village', 'box']

/** Вид по умолчанию — пока владелец не выбрал. */
export const DEFAULT_VARIANT: AdventVariant = 'tree'

const KEY = 'koshel:adventStyle'
const OWNER_ID = 439944083

const isVariant = (v: unknown): v is AdventVariant => v === 'tree' || v === 'village' || v === 'box'

function readVariant(): AdventVariant {
  try {
    const q = new URLSearchParams(location.search).get('advent')
    const sp = tg.startParam
    const fromLink = sp && sp.startsWith('adv_') ? sp.slice(4) : null
    const pick = isVariant(q) ? q : isVariant(fromLink) ? fromLink : null
    if (pick) {
      localStorage.setItem(KEY, pick)
      return pick
    }
    const saved = localStorage.getItem(KEY)
    if (isVariant(saved)) return saved
  } catch {
    // хранилище недоступно — вид по умолчанию
  }
  return DEFAULT_VARIANT
}

/** Переключатель видов — только владельцу и при сравнении по ссылке. */
export function canPickVariant(): boolean {
  try {
    if (new URLSearchParams(location.search).has('advent')) return true
    if (tg.startParam?.startsWith('adv_')) return true
  } catch {
    // нет адреса — не показываем
  }
  return tg.user?.id === OWNER_ID
}

export function useAdventVariant(): [AdventVariant, (v: AdventVariant) => void] {
  const [v, setV] = useState<AdventVariant>(readVariant)
  const set = (next: AdventVariant) => {
    try {
      localStorage.setItem(KEY, next)
    } catch {
      // не запомнится — переключится только сейчас
    }
    setV(next)
  }
  return [v, set]
}
