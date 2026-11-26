import { DEFAULT_CATEGORIES, type Category, type CategoryKind } from '../../shared/categories'

export { DEFAULT_CATEGORIES }
export type { Category, CategoryKind }

/** @deprecated алиас для обратной совместимости — используйте DEFAULT_CATEGORIES */
export const CATEGORIES = DEFAULT_CATEGORIES

/** Палитра для выбора цвета новой категории */
export const CATEGORY_COLORS = [
  '#F2C14E', '#6FA8DC', '#7BC47F', '#E97373', '#E29CC3',
  '#B8E5CC', '#4DB6AC', '#9B7EDE', '#F4A261', '#7C8DB5',
  '#5DB996', '#E76F8E',
]

/** Найти категорию в произвольном списке (по умолчанию — только встроенные). */
export const getCategory = (id: string, list: Category[] = DEFAULT_CATEGORIES): Category => {
  return list.find((c) => c.id === id) ?? DEFAULT_CATEGORIES[DEFAULT_CATEGORIES.length - 1]
}

export const categoriesByKind = (kind: CategoryKind, list: Category[] = DEFAULT_CATEGORIES) =>
  list.filter((c) => c.kind === kind)
