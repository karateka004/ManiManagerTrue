import { useStore } from '../store/transactions'
import { getReward } from './rewards'

/** Класс обложки карты-героя по id награды ('' — классика). См. styles/skins.css. */
export function heroSkinClass(cardId: string | null | undefined): string {
  const r = getReward(cardId)
  return r?.kind === 'card' && r.card ? `skin-${r.card}` : ''
}

/** Надетая обложка карты-героя: класс для `.hero-surface`. */
export function useHeroSkin(): string {
  return heroSkinClass(useStore((s) => s.equipped.card))
}
