/** Сделать в простое; возвращает отмену. На iOS requestIdleCallback нет — таймер. */
export function whenIdle(fn: () => void): () => void {
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number
    cancelIdleCallback?: (id: number) => void
  }
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(fn, { timeout: 1000 })
    return () => w.cancelIdleCallback?.(id)
  }
  const id = setTimeout(fn, 400)
  return () => clearTimeout(id)
}
