import { useEffect, useRef, type RefObject } from 'react'

/**
 * Листание экранов свайпом, как карусель (сам жест — lib/swipeEngine.ts).
 *
 * Движок — отдельным чанком: стартовому экрану он не нужен до первого
 * касания, а весит больше всего остального здесь. Грузится сразу после
 * первой отрисовки.
 */

export type SwipeDir = 'next' | 'prev'

/** Что в эту сторону. */
export type SwipeTarget =
  /** Соседний экран. `panel` может ещё не успеть отрисоваться — тогда текущий
   *  экран уезжает один, а сосед подхватывается, как только появится. */
  | { kind: 'panel'; panel: HTMLElement | null; scroll: number }
  /** «Назад» без панели под ним (Магазин → хаб «Прогресса»): экран тянется
   *  с сопротивлением и гаснет. */
  | { kind: 'back' }

export interface SwipeHost {
  /** Панель открытого экрана. */
  current(): HTMLElement | null
  /** Соседний экран, «назад» или ничего (край — экран пружинит). */
  target(dir: SwipeDir): SwipeTarget | null
  /** Жест вбок начался: соседей, которых ещё нет, пора отрисовать. */
  begin(): void
  /**
   * Ход жеста для нижней панели: доля ширины экрана, «+» — к следующей вкладке.
   * `follow` — палец на экране, капсула идёт за ним без своей пружины.
   */
  progress(p: number, follow: boolean): void
  /** Экраны доехали — переключить. Синхронно: после вызова DOM уже новый. */
  commit(dir: SwipeDir): void
}

export function useSwipeNav(rootRef: RefObject<HTMLElement>, host: SwipeHost) {
  const hostRef = useRef(host)
  hostRef.current = host

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    let alive = true
    let detach: (() => void) | null = null
    import('./swipeEngine')
      .then((m) => {
        if (alive) detach = m.attachSwipe(root, () => hostRef.current)
      })
      .catch(() => {
        /* нет сети — без свайпа, вкладки переключаются панелью */
      })
    return () => {
      alive = false
      detach?.()
    }
  }, [rootRef])
}
