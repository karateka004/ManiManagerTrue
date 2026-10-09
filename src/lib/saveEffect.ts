import { useStore } from '../store/transactions'
import { getReward, type SaveEffect } from './rewards'
import { burst, BRAND_FX } from './fx'

/**
 * Эффект при записи операции — косметика из магазина (вид «effect»).
 * По умолчанию его нет: запись денег — не повод для фейерверка, пока человек
 * сам его не захотел. Частицы вылетают из кнопки «Записать».
 *
 * `preview` — проиграть конкретный эффект (примерка в магазине).
 */
export function playSaveEffect(from: Element | null | undefined, preview?: SaveEffect) {
  const effect: SaveEffect = preview ?? getReward(useStore.getState().equipped.effect)?.effect ?? 'none'
  switch (effect) {
    case 'sparks':
      burst(from, { colors: BRAND_FX, count: 18, spread: 84 })
      break
    case 'confetti':
      burst(from, {
        colors: ['#F43F5E', '#F59E0B', '#22C55E', '#3B82F6', '#A855F7', '#FFFFFF'],
        count: 28,
        spread: 120,
        confetti: true,
      })
      break
    case 'stars':
      burst(from, { colors: ['#FDE68A', '#FFFFFF', 'rgb(var(--brand-300))'], count: 16, spread: 110, shape: 'star' })
      break
    default:
      break
  }
}
