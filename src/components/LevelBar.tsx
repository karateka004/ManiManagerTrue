import { useStore } from '../store/transactions'
import { computeXp, levelFor } from '../lib/levels'

/**
 * Хук: текущий прогресс уровня из стора (примитивы, без массивов).
 *
 * Сама полоса уровня, жившая здесь, ушла в 2.0: уровень теперь рисуют герой
 * «Прогресса» и строка в Профиле. Файл оставлен ради хука — на него ссылаются
 * три экрана.
 */
export function useLevel() {
  const count = useStore((s) => s.transactions.length)
  const bonusXp = useStore((s) => s.bonusXp)
  return levelFor(computeXp(count, bonusXp))
}
