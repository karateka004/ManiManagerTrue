/**
 * Встроенные категории — общие для приложения (src/store/categories.ts) и бота
 * (worker/src/entry.ts: слова, по которым бот узнаёт категорию). id, вид и
 * название — одни на обоих: бот пишет «Записал: Кафе 300 ₴» тем же словом, что
 * на Главной, и кладёт запись в ту же категорию.
 */
export type CategoryKind = 'income' | 'expense'

export interface Category {
  id: string
  name: string
  kind: CategoryKind
  color: string
  /** Ключ иконки в реестре CategoryIcon (для встроенных = id) */
  icon: string
  /** true — создана пользователем (можно редактировать/удалять) */
  custom?: boolean
}

/** Встроенные категории. Поле icon совпадает с ключом в реестре иконок. */
export const DEFAULT_CATEGORIES: Category[] = [
  // Income
  { id: 'salary',    name: 'Зарплата',     kind: 'income',  color: '#3CA37B', icon: 'salary' },
  { id: 'freelance', name: 'Подработка',   kind: 'income',  color: '#5DB996', icon: 'freelance' },
  { id: 'gift_in',   name: 'Подарок',      kind: 'income',  color: '#8FD3AC', icon: 'gift_in' },
  { id: 'other_in',  name: 'Прочее',       kind: 'income',  color: '#B8E5CC', icon: 'other_in' },

  // Expense
  { id: 'food',      name: 'Еда',          kind: 'expense', color: '#E97373', icon: 'food' },
  { id: 'cafe',      name: 'Кафе',         kind: 'expense', color: '#F4A261', icon: 'cafe' },
  { id: 'transport', name: 'Транспорт',    kind: 'expense', color: '#6FA8DC', icon: 'transport' },
  { id: 'car',       name: 'Машина',       kind: 'expense', color: '#7C8DB5', icon: 'car' },
  { id: 'home',      name: 'Жильё',        kind: 'expense', color: '#9B7EDE', icon: 'home' },
  { id: 'health',    name: 'Здоровье',     kind: 'expense', color: '#E76F8E', icon: 'health' },
  { id: 'clothes',   name: 'Одежда',       kind: 'expense', color: '#B48EAD', icon: 'clothes' },
  { id: 'fun',       name: 'Развлечения',  kind: 'expense', color: '#F2C14E', icon: 'fun' },
  { id: 'gift',      name: 'Подарки',      kind: 'expense', color: '#E29CC3', icon: 'gift' },
  { id: 'sport',     name: 'Спорт',        kind: 'expense', color: '#7BC47F', icon: 'sport' },
  { id: 'phone',     name: 'Связь',        kind: 'expense', color: '#4DB6AC', icon: 'phone' },
  { id: 'other',     name: 'Прочее',       kind: 'expense', color: '#A8A8A8', icon: 'other' },
]

