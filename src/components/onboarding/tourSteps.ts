/** Обучение новичка: шаги, главы, их цвета и место в QS_KEY (продолжение после перезапуска). */
import { type ComponentType } from 'react'
import { PieChart, Plus, Rocket, Wallet, type LucideProps } from 'lucide-react'
import { useStore } from '../../store/transactions'
import { QS_KEY } from '../../lib/introKeys'
import { tg } from '../../lib/telegram'

export type Step = 'offer' | 'plus' | 'amount' | 'category' | 'save' | 'balance' | 'analytics' | 'rewards' | 'done'
export const ORDER: Step[] = ['offer', 'plus', 'amount', 'category', 'save', 'balance', 'analytics', 'rewards', 'done']
/** Номер шага для админки — как QS_STEPS воркера. */
export const REPORT: Record<Step, number> = { offer: 0, plus: 1, amount: 2, category: 2, save: 2, balance: 3, analytics: 3, rewards: 3, done: 4 }
/** Шаги внутри шторки операции: шторку закрыли — снова к «+». */
export const IN_SHEET = new Set<Step>(['amount', 'category', 'save'])
/** Порядок шагов обучения 2.9 — чтобы продолжить незаконченное. */
export const ORDER_V2: readonly Step[] = ['offer', 'plus', 'amount', 'category', 'save', 'balance', 'analytics', 'done']

export const at = (name: string) => `[data-tour="${name}"]`

/** Вырез затемнения. */
export interface Spot {
  /** Цели; вырез — их общая рамка. */
  names: string[]
  /** Где в вырезе можно нажимать (селектор); нет — только смотреть. */
  tap?: string
  /** Радиус выреза; по умолчанию — как у цели. */
  r?: number
  /** Во всю ширину и до низа экрана — шторка. */
  bleed?: boolean
}
export interface StepDef {
  spots: Spot[]
  /** Кольцо — что нажать сейчас. */
  ring?: string
  /** Карточка: внизу (без вырезов), вверху (над шторкой) или у выреза № n. */
  card: 'modal' | 'top' | number
  /** Глава — для полоски прогресса. */
  chapter: number
}

/**
 * Шторка операции — один вырез от суммы до «Записать». Шапка (вид операции,
 * «Отмена») — под карточкой: на низком экране больше места нет нигде, а сумма,
 * категории и клавиши должны быть видны.
 */
export const SHEET: Spot = {
  names: ['amount', 'form', 'keypad', 'save'],
  tap: ['amount', 'form', 'keypad', 'save'].map(at).join(', '),
  bleed: true,
}
export const STEPS: Record<Step, StepDef> = {
  offer: { spots: [], card: 'modal', chapter: -1 },
  plus: { spots: [{ names: ['plus'], tap: at('plus') }], ring: 'plus', card: 0, chapter: 0 },
  amount: { spots: [SHEET], ring: 'keypad', card: 'top', chapter: 0 },
  category: { spots: [SHEET], ring: 'categories', card: 'top', chapter: 0 },
  save: { spots: [SHEET], ring: 'save', card: 'top', chapter: 0 },
  balance: { spots: [{ names: ['balance'] }, { names: ['tab-analytics'], tap: at('tab-analytics') }], ring: 'tab-analytics', card: 0, chapter: 1 },
  analytics: { spots: [{ names: ['spent'] }, { names: ['tab-rewards'], tap: at('tab-rewards') }], ring: 'tab-rewards', card: 0, chapter: 2 },
  rewards: { spots: [{ names: ['level'] }, { names: ['tab-home'], tap: at('tab-home') }], ring: 'tab-home', card: 0, chapter: 3 },
  // Итог: подсвечена кнопка ассистента в шапке Главной (есть только в Telegram),
  // с кольцом — без него светлый диск в углу выглядел сбоем. Без пульса: это окно.
  done: { spots: tg.isInTelegram ? [{ names: ['assistant'] }] : [], ring: tg.isInTelegram ? 'assistant' : undefined, card: 'modal', chapter: 4 },
}
export const CHAPTERS = 4
/** Куда ведёт строка действия карточки (её можно и нажать — это та же вкладка). */
export const NEXT_TAB: Partial<Record<Step, string>> = { balance: 'tab-analytics', analytics: 'tab-rewards', rewards: 'tab-home' }


/**
 * Оформление — как родной Telegram: предложение и итог — лист снизу (большая
 * иконка, заголовок по центру, список в сгруппированной плашке с цветными
 * квадратами, как в настройках Telegram, кнопка во всю ширину), подсказки на
 * шагах — тёмный пузырь с хвостиком, как подсказки Telegram, в обеих темах.
 * У каждой главы свой цвет: тот же квадрат — в плане на предложении и в
 * подсказках этой главы.
 */
export const PLAN_ICONS: ComponentType<LucideProps>[] = [Plus, Wallet, PieChart, Rocket]
export const CHAPTER_COLOR = ['rgb(var(--brand-500))', '#3E8EF7', '#F2994A', '#9A6BF2']
/** Синий Telegram — у совета «напиши боту». */
export const TG_BLUE = '#2AABEE'
export const BELL_RED = '#F05A55'
/**
 * Сколько пройдено внутри главы — полоска заполняется, как у историй Telegram.
 * В первой главе четыре шага, в остальных — по одному.
 */
export const CHAPTER_FILL: Partial<Record<Step, number>> = { plus: 0.25, amount: 0.5, category: 0.75, save: 1 }

/* ------------------------------------------------------------------ */
/* Место в QS_KEY: шаг (номер в ORDER) и id записанной в обучении траты. */

export interface Saved {
  v: 3
  s: number
  ids: string[]
}
export function readSaved(): { step: Step; id: string | null } {
  try {
    const v = JSON.parse(localStorage.getItem(QS_KEY) ?? 'null') as { v?: unknown; s?: unknown; ids?: unknown } | null
    if (!v || typeof v.s !== 'number') return { step: 'offer', id: null }
    // Обучение 2.9 — свой порядок шагов; анкета до 2.9 — начинаем сначала.
    const name: Step | undefined = v.v === 3 ? ORDER[Math.floor(v.s)] : v.v === 2 ? ORDER_V2[Math.floor(v.s)] : undefined
    if (!name) return { step: 'offer', id: null }
    const have = new Set(useStore.getState().transactions.map((x) => x.id))
    const ids = Array.isArray(v.ids) ? v.ids : []
    const id = typeof ids[0] === 'string' && have.has(ids[0]) ? ids[0] : null
    let step = name
    // Шторка после перезапуска закрыта — с «+». Запись есть — с баланса:
    // приложение открывается на Главной, там и продолжим. Дошёл до «Аналитики»
    // или «Прогресса» — с того же шага: вкладку Tour откроет сам.
    if (IN_SHEET.has(step)) step = 'plus'
    if (id && step !== 'done' && step !== 'analytics' && step !== 'rewards') step = 'balance'
    if (!id && step !== 'offer') step = 'plus'
    return { step, id }
  } catch {
    return { step: 'offer', id: null }
  }
}
export function writeSaved(step: Step, id: string | null) {
  try {
    localStorage.setItem(QS_KEY, JSON.stringify({ v: 3, s: ORDER.indexOf(step), ids: id ? [id] : [] } satisfies Saved))
  } catch {
    /* приватный режим — продолжить с места не выйдет */
  }
}
export function clearSaved() {
  try {
    localStorage.removeItem(QS_KEY)
  } catch {
    /* нечего чистить */
  }
}
