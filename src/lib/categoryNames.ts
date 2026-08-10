/**
 * Локализация названий встроенных категорий.
 *
 * В `store/categories.ts` имена заданы по-русски — они остаются фолбэком
 * (и для пользовательских категорий, которые переводить нельзя: их назвал
 * пользователь). Отдельный модуль без зависимостей, чтобы им могли
 * пользоваться и стор, и i18n без циклических импортов.
 */

type Lang = 'ru' | 'en'

export const CATEGORY_NAMES: Record<string, Record<Lang, string>> = {
  // Доходы
  salary: { ru: 'Зарплата', en: 'Salary' },
  freelance: { ru: 'Подработка', en: 'Freelance' },
  gift_in: { ru: 'Подарок', en: 'Gift' },
  other_in: { ru: 'Прочее', en: 'Other' },

  // Расходы
  food: { ru: 'Еда', en: 'Groceries' },
  cafe: { ru: 'Кафе', en: 'Cafe' },
  transport: { ru: 'Транспорт', en: 'Transport' },
  car: { ru: 'Машина', en: 'Car' },
  home: { ru: 'Жильё', en: 'Housing' },
  health: { ru: 'Здоровье', en: 'Health' },
  clothes: { ru: 'Одежда', en: 'Clothes' },
  fun: { ru: 'Развлечения', en: 'Fun' },
  gift: { ru: 'Подарки', en: 'Gifts' },
  sport: { ru: 'Спорт', en: 'Sport' },
  phone: { ru: 'Связь', en: 'Mobile' },
  other: { ru: 'Прочее', en: 'Other' },
}

/** Название категории на языке интерфейса; для пользовательских — как есть. */
export function categoryName(lang: Lang, id: string, fallback: string): string {
  return CATEGORY_NAMES[id]?.[lang] ?? fallback
}
