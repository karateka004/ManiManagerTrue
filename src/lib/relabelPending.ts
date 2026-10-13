import type { Currency } from './currencies'

/**
 * Предложение перенести записи после смены основной валюты, на которое ещё не
 * ответили.
 *
 * Живёт в localStorage, а не в состоянии экрана: вкладки перемонтируются, и
 * раньше, уйдя из Настроек после «Да, переключить», человек терял вопрос
 * насовсем — основная валюта уже новая и пустая, история в старой, а перенести
 * её можно было только сменой валюты туда и обратно. В синкаемый стор не
 * кладём: это вопрос интерфейса этого устройства, а не данные.
 */
const KEY = 'koshel:relabel'

export interface PendingRelabel {
  from: Currency
  to: Currency
}

export function readPendingRelabel(): PendingRelabel | null {
  try {
    const raw = localStorage.getItem(KEY)
    const p = raw ? (JSON.parse(raw) as Partial<PendingRelabel>) : null
    return p && typeof p.from === 'string' && typeof p.to === 'string' && p.from !== p.to ? (p as PendingRelabel) : null
  } catch {
    return null
  }
}

export function writePendingRelabel(p: PendingRelabel | null): void {
  try {
    if (p) localStorage.setItem(KEY, JSON.stringify(p))
    else localStorage.removeItem(KEY)
  } catch {
    /* приватный режим: вопрос проживёт, пока открыт экран, — как раньше */
  }
}
