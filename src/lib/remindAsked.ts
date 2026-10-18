/**
 * Спрашивали ли «Напоминать вечером?» (карточка на Главной). Отдельным крошечным
 * модулем: метку читает Главная в стартовом чанке, а сама карточка — ленивая.
 */
export const REMIND_ASKED_KEY = 'koshel:remindAsked'

export function remindAsked(): boolean {
  try {
    return localStorage.getItem(REMIND_ASKED_KEY) === '1'
  } catch {
    return true // без localStorage спрашивали бы на каждом запуске — лучше не спрашивать
  }
}

export function markRemindAsked(): void {
  try {
    localStorage.setItem(REMIND_ASKED_KEY, '1')
  } catch {
    /* приватный режим — карточка не покажется: remindAsked() вернёт true */
  }
}
