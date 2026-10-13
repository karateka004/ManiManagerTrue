/**
 * Метка «валюту уже спрашивали» (localStorage). Ставят быстрый старт (человек
 * выбрал валюту сам) и подсказка на Главной (ответил «да» или «нет»). Отдельным
 * крошечным модулем: её читает Главная в стартовом чанке, а сами быстрый старт
 * и подсказка — ленивые.
 */
export const CURRENCY_ASKED_KEY = 'koshel:curAsked'

export function currencyAsked(): boolean {
  try {
    return localStorage.getItem(CURRENCY_ASKED_KEY) === '1'
  } catch {
    return true
  }
}
