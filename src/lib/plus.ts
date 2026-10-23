import { tg } from './telegram'
import { useStore } from '../store/transactions'

/**
 * Кошель+ — премиум-функции: бот понимает голосовые, фото чеков и текст
 * своими словами (разбирает ИИ Gemini). Подключение — за звёзды Telegram,
 * следующим шагом.
 *
 * Пока закрытое тестирование: раздел открывают только тестеры, остальные
 * видят затемнённую плашку «Скоро». Список — id Telegram; проверка на
 * клиенте, потому что открывает она только описание, а не сами функции.
 */
const PLUS_TESTERS: readonly number[] = [
  439944083, // владелец
]

export function isPlusTester(): boolean {
  const id = tg.user?.id
  return id !== undefined && PLUS_TESTERS.includes(id)
}

/**
 * Тексты раздела — здесь, а не в общем словаре (lib/i18n): тот целиком лежит
 * в стартовом чанке, а Кошель+ нужен только ленивому Профилю и его шторке.
 */
const TEXT = {
  brand: { ru: 'Кошель', en: 'Koshel' },
  name: { ru: 'Кошель+', en: 'Koshel+' },
  soon: { ru: 'Скоро', en: 'Soon' },
  beta: { ru: 'Тест', en: 'Beta' },
  soon_label: { ru: 'Кошель+ — скоро', en: 'Koshel+ — coming soon' },
  tagline: {
    ru: 'Голос, фото чеков и текст своими словами — разбирает ИИ',
    en: 'Voice, receipt photos and free text — read by AI',
  },
  pill_voice: { ru: 'Голосовые', en: 'Voice' },
  pill_photo: { ru: 'Фото чеков', en: 'Receipts' },
  pill_text: { ru: 'Свободный текст', en: 'Free text' },
  sheet_sub: { ru: 'Премиум-функции · закрытый тест', en: 'Premium features · closed beta' },
  intro: {
    ru: 'Пиши боту как удобно — голосом, фото или своими словами, а ИИ Gemini от Google превращает это в записи.',
    en: 'Message the bot however you like — by voice, photo or in your own words — and Google’s Gemini AI turns it into entries.',
  },
  f_voice: { ru: 'Голосовые', en: 'Voice messages' },
  f_voice_sub: {
    ru: 'Скажи «кофе триста, такси четыреста» — бот запишет обе траты. Голосом можно и спросить',
    en: 'Say “coffee 3, taxi 12” and the bot records both. You can ask questions by voice too',
  },
  f_photo: { ru: 'Фото чека и скриншот банка', en: 'Receipts and bank screenshots' },
  f_photo_sub: {
    ru: 'С чека — итог, магазин и дата, со скриншота — каждая операция',
    en: 'A receipt gives the total, shop and date; a bank screenshot gives every entry',
  },
  f_text: { ru: 'Текст своими словами', en: 'Your own words' },
  f_text_sub: {
    ru: '«Вчера продукты 1240 и такси до дома 380» — ИИ разберёт суммы, категории и даты',
    en: '“Groceries 42 yesterday and a cab home 15” — the AI works out amounts, categories and dates',
  },
  try_bot: { ru: 'Попробовать в боте', en: 'Try it in the bot' },
  stars_soon: { ru: 'Подключение за звёзды Telegram — скоро', en: 'Unlock with Telegram Stars — coming soon' },
} satisfies Record<string, { ru: string; en: string }>

export type PlusKey = keyof typeof TEXT

export function usePlusT(): (key: PlusKey) => string {
  const lang = useStore((s) => s.lang)
  return (key) => (lang === 'en' ? TEXT[key].en : TEXT[key].ru)
}
