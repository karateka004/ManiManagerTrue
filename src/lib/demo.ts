/**
 * Демо-режим: детерминированный набор «живых» данных за ~2 года.
 *
 * Важно: демо НЕ трогает реальные транзакции пользователя. Стор хранит флаг
 * `demoMode`, а финансовые селекторы читают данные через `activeTransactions(s)`
 * — она подставляет этот набор вместо `s.transactions`, когда демо включено.
 *
 * Набор генерируется один раз (ленивый модульный кэш) и стабилен по ссылке,
 * чтобы мемоизация селекторов не сбрасывалась на каждый рендер.
 */
import dayjs from 'dayjs'
import type { Transaction } from '../store/transactions'

/** Детерминированный ГПСЧ (mulberry32) — одинаковый набор на всех устройствах. */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Сколько месяцев истории генерируем (≈2 года). */
const MONTHS_BACK = 24

interface ExpensePattern {
  categoryId: string
  /** Сколько раз в месяц примерно случается. */
  perMonth: number
  /** Диапазон суммы. */
  min: number
  max: number
  notes?: string[]
}

/** Шаблоны расходов — задают «характер» трат за месяц. */
const EXPENSE_PATTERNS: ExpensePattern[] = [
  { categoryId: 'food', perMonth: 12, min: 800, max: 5200, notes: ['Продукты', 'Супермаркет', 'Магазин у дома'] },
  { categoryId: 'cafe', perMonth: 9, min: 250, max: 2200, notes: ['Кофе', 'Обед', 'Завтрак', 'Ужин с друзьями'] },
  { categoryId: 'transport', perMonth: 10, min: 120, max: 1400, notes: ['Метро', 'Такси', 'Автобус'] },
  { categoryId: 'fun', perMonth: 4, min: 600, max: 4500, notes: ['Кино', 'Концерт', 'Игры', 'Подписка'] },
  { categoryId: 'clothes', perMonth: 2, min: 1500, max: 9000, notes: ['Одежда', 'Обувь'] },
  { categoryId: 'health', perMonth: 2, min: 700, max: 6500, notes: ['Аптека', 'Врач', 'Анализы'] },
  { categoryId: 'phone', perMonth: 1, min: 400, max: 1200, notes: ['Связь', 'Интернет'] },
  { categoryId: 'sport', perMonth: 2, min: 800, max: 3500, notes: ['Зал', 'Бассейн', 'Инвентарь'] },
  { categoryId: 'car', perMonth: 2, min: 1500, max: 8000, notes: ['Бензин', 'Парковка', 'Сервис'] },
  { categoryId: 'gift', perMonth: 1, min: 1000, max: 7000, notes: ['Подарок', 'День рождения'] },
]

/** Генерация набора за период. */
function build(): Transaction[] {
  const rnd = mulberry32(20240531)
  const txs: Transaction[] = []
  const now = dayjs()
  let counter = 0
  const id = () => `demo_${(counter++).toString(36)}`
  const between = (min: number, max: number) => Math.round((min + rnd() * (max - min)) / 10) * 10

  for (let m = MONTHS_BACK; m >= 0; m--) {
    const monthStart = now.subtract(m, 'month').startOf('month')
    const daysInMonth = monthStart.daysInMonth()
    // Не генерируем будущие даты в текущем месяце.
    const maxDay = m === 0 ? now.date() : daysInMonth

    // Зарплата 5-го числа (с лёгким ростом со временем).
    const salaryDay = Math.min(5, maxDay)
    const salaryBase = 78000 + (MONTHS_BACK - m) * 600
    txs.push({
      id: id(),
      type: 'income',
      amount: Math.round((salaryBase + between(-3000, 3000)) / 100) * 100,
      categoryId: 'salary',
      date: monthStart.date(salaryDay).hour(11).toISOString(),
      note: 'Зарплата',
    })

    // Иногда — аванс 20-го.
    if (20 <= maxDay && rnd() < 0.7) {
      txs.push({
        id: id(),
        type: 'income',
        amount: between(25000, 38000),
        categoryId: 'salary',
        date: monthStart.date(20).hour(11).toISOString(),
        note: 'Аванс',
      })
    }

    // Фриланс-подработка пару раз.
    const freelanceTimes = rnd() < 0.6 ? (rnd() < 0.4 ? 2 : 1) : 0
    for (let i = 0; i < freelanceTimes; i++) {
      const d = Math.min(1 + Math.floor(rnd() * (maxDay - 1)), maxDay)
      txs.push({
        id: id(),
        type: 'income',
        amount: between(8000, 26000),
        categoryId: 'freelance',
        date: monthStart.date(Math.max(1, d)).hour(15).toISOString(),
        note: 'Подработка',
      })
    }

    // Изредка подарок-доход.
    if (rnd() < 0.18) {
      const d = Math.max(1, Math.min(1 + Math.floor(rnd() * (maxDay - 1)), maxDay))
      txs.push({
        id: id(),
        type: 'income',
        amount: between(2000, 12000),
        categoryId: 'gift_in',
        date: monthStart.date(d).hour(13).toISOString(),
        note: 'Подарок',
      })
    }

    // Коммуналка 3-го числа.
    if (3 <= maxDay) {
      txs.push({
        id: id(),
        type: 'expense',
        amount: between(12000, 24000),
        categoryId: 'home',
        date: monthStart.date(3).hour(10).toISOString(),
        note: 'Коммуналка',
      })
    }

    // Расходы по шаблонам, разбросанные по дням месяца.
    for (const p of EXPENSE_PATTERNS) {
      const times = Math.max(0, Math.round(p.perMonth * (0.7 + rnd() * 0.6)))
      for (let i = 0; i < times; i++) {
        const day = 1 + Math.floor(rnd() * maxDay)
        const note = p.notes ? p.notes[Math.floor(rnd() * p.notes.length)] : undefined
        txs.push({
          id: id(),
          type: 'expense',
          amount: between(p.min, p.max),
          categoryId: p.categoryId,
          date: monthStart.date(Math.min(day, maxDay)).hour(9 + Math.floor(rnd() * 12)).toISOString(),
          note,
        })
      }
    }
  }

  // Новые сверху (как в реальном сторе).
  return txs.sort((a, b) => (a.date < b.date ? 1 : -1))
}

let cache: Transaction[] | null = null

/** Демо-набор за ~2 года (ленивая инициализация, стабильная ссылка). */
export function demoTransactions(): Transaction[] {
  if (!cache) cache = build()
  return cache
}
