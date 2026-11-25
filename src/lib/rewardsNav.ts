/**
 * Где человек был внутри вкладки «Прогресс»: хаб, Магазин или Титулы.
 * Адвент-календарь (2.12.1) — часть хаба, не под-экран: к нему ведёт `requestAdventFocus`.
 *
 * Вкладка размонтируется, когда уходишь от неё дальше соседней (App держит
 * отрисованными только открытую и её соседей по свайпу), поэтому открытый
 * под-экран и прокрутку хаба помним здесь, на уровне модуля:
 * ушёл из Магазина на Главную и вернулся — снова Магазин, и App ставит
 * прокрутку, запомненную как раз для него.
 *
 * Отдельный модуль, а не переменные в pages/Rewards.tsx: сбросить «Прогресс»
 * на хаб нужно и из App (строка «Уровень» в Профиле, повторный тап по
 * вкладке), а импорт из страницы втащил бы её ленивый чанк в стартовый.
 */

export type RewardsScreen = 'hub' | 'shop' | 'titles'

export const rewardsNav: { screen: RewardsScreen; hubScroll: number; focusAdvent: boolean } = {
  screen: 'hub',
  hubScroll: 0,
  focusAdvent: false,
}

const listeners = new Set<(screen: RewardsScreen) => void>()

/**
 * Вернуть «Прогресс» на хаб. `top` — ещё и в начало хаба (переход из Профиля
 * по строке уровня: человек шёл смотреть уровень, а он на самом верху);
 * без него хаб откроется там, где его оставили (как «назад» в iOS).
 */
export function resetRewardsNav(top: boolean) {
  rewardsNav.screen = 'hub'
  if (top) rewardsNav.hubScroll = 0
  for (const l of listeners) l('hub')
}

const focusListeners = new Set<() => void>()

/**
 * Показать адвент-календарь на хабе «Прогресса» (Главная: «окошко ждёт»,
 * плитка «Адвент»): календарь сам прокрутится к себе и подсветит окошко дня,
 * как только будет на экране — флаг живёт до этого момента (вкладка и чанк
 * календаря могли ещё не загрузиться).
 */
export function requestAdventFocus() {
  rewardsNav.focusAdvent = true
  for (const l of focusListeners) l()
}

export function onAdventFocus(listener: () => void): () => void {
  focusListeners.add(listener)
  return () => {
    focusListeners.delete(listener)
  }
}

/** Открытая вкладка узнаёт о сбросе (повторный тап по вкладке из Магазина) и о переходе извне. */
export function onRewardsReset(listener: (screen: RewardsScreen) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
