/**
 * Где человек был внутри вкладки «Прогресс»: хаб, Магазин или Титулы.
 *
 * Вкладка размонтируется, когда уходишь на другую (App пересоздаёт её по key),
 * поэтому открытый под-экран и прокрутку хаба помним здесь, на уровне модуля:
 * ушёл из Магазина на Главную и вернулся — снова Магазин, и App ставит
 * прокрутку, запомненную как раз для него.
 *
 * Отдельный модуль, а не переменные в pages/Rewards.tsx: сбросить «Прогресс»
 * на хаб нужно и из App (строка «Уровень» в Профиле, повторный тап по
 * вкладке), а импорт из страницы втащил бы её ленивый чанк в стартовый.
 */

export type RewardsScreen = 'hub' | 'shop' | 'titles'

export const rewardsNav: { screen: RewardsScreen; hubScroll: number } = { screen: 'hub', hubScroll: 0 }

const listeners = new Set<() => void>()

/**
 * Вернуть «Прогресс» на хаб. `top` — ещё и в начало хаба (переход из Профиля
 * по строке уровня: человек шёл смотреть уровень, а он на самом верху);
 * без него хаб откроется там, где его оставили (как «назад» в iOS).
 */
export function resetRewardsNav(top: boolean) {
  rewardsNav.screen = 'hub'
  if (top) rewardsNav.hubScroll = 0
  for (const l of listeners) l()
}

/** Открытая вкладка узнаёт о сбросе (повторный тап по вкладке из Магазина). */
export function onRewardsReset(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
