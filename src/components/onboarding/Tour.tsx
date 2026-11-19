import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from 'react'
import { ArrowDown, Bell, Check, MessageCircle, Pencil, PieChart, Plus, Rocket, Send, Wallet, type LucideProps } from 'lucide-react'
import { useStore } from '../../store/transactions'
import { detectCurrency } from '../../lib/currencyDetect'
import { reportQuickStart, setReminders } from '../../lib/api'
import { QS_KEY, TOUR_DONE_KEY } from '../../lib/introKeys'
import type { TourReason } from '../Intro'
import { CURRENCY_ASKED_KEY } from '../../lib/currencyAsked'
import { botCanWrite, canRequestBotWrite, hapticNotify, hapticTap, requestBotWrite, syncTelegramChrome, tg } from '../../lib/telegram'
import { useBackButton } from '../../lib/useBackButton'
import { showToast } from '../../lib/toast'
import { UNMASK, clarityEvent, clarityKeep, clarityTag } from '../../lib/clarity'
import { burst, prefersReducedMotion, replay } from '../../lib/fx'
import { isLowEnd } from '../../lib/perf'
import { XP_PER_TRANSACTION } from '../../lib/levels'

/**
 * Обучение новичка (2.10): как в играх — экран затемнён, подсвечено одно место,
 * и человек сам делает действие в настоящем интерфейсе. Четыре главы:
 *   1. Запись: «+» → сумма → категория → «Записать» (трата записывается по-настоящему);
 *   2. Баланс: что он считает и как записать доход → открой «Аналитику»;
 *   3. Аналитика: куда уходят деньги → загляни в «Прогресс»;
 *   4. Прогресс: опыт, уровни, задания → вернись на «Главную» → итог (бот,
 *      ассистент, правка записей, напоминания).
 * Лишних нажатий нет: каждое — действие в самом приложении (переход по
 * вкладкам и есть «дальше»); свои кнопки — только у предложения и итога.
 *
 * Как устроено. Цели помечены в разметке `data-tour="…"` (TabBar, BalanceCard,
 * AddTransactionSheet, герой Аналитики, Rewards). Каждый кадр читаем их
 * рамки и двигаем вырезы затемнения (SVG-маска), кольцо и карточку. Смена цели
 * — перетекание за ~0,45 с: вырез и кольцо едут к новой цели и догоняют её,
 * если она сама в движении (шторка выезжает); карточка идёт за местом пружиной.
 * В DOM пишем, только если что-то сдвинулось: в покое кадр ничего не стоит.
 * Цели на страницах ищем только в открытой вкладке: замер внутри скрытой
 * панели (content-visibility) заставил бы браузер считать её целиком.
 *
 * Шаг засчитываем по самому интерфейсу: шторка открылась, сумма набрана и
 * палец замер (`data-value`), категория выбрана, операция в сторе, вкладка
 * открыта. Нажатия мимо подсветки гасим на document в фазе перехвата и
 * отвечаем на них: карточка качнётся, кольцо вспыхнет. Свободны карточка, тост
 * и шторки поверх шторки операции (валюта, новая категория). Отклик на нажатие
 * мимо — только на короткое касание без сдвига (прокрутка — не промах) и не на
 * то, что подсвечено «посмотреть». Свайп между вкладками выключен по
 * `body[data-touring]` (его проверяет движок свайпа); `aria-modal` — только у
 * предложения и итога: на шагах нужное действие — вне карточки, и экранный
 * диктор не должен запирать фокус в ней. «Назад» Telegram и Escape: на
 * предложении — «Не сейчас», на итоге — «Поехали», на шагах — выход.
 * Слой — z 55: над шторкой операции (51), под вложенными (60) и тостом (90).
 *
 * Цикл кадров засыпает, когда ~15 кадров ничего не менялось: чтение рамок при
 * любой идущей CSS-анимации заставляет браузер пересчитывать стили каждый кадр
 * (на «Прогрессе» — и раскладку). Будят его ввод, прокрутка, смена размера,
 * начало анимаций и переходов, смена шага и стора; страховка — проверка раз в
 * 400 мс. Пульс кольца — три раза на каждую новую цель, не бесконечно.
 *
 * Шаги в админку (/qs, `v: 2`): 0 предложили, 1 начали, 2 открыли запись,
 * 3 записали первую трату, 4 дошли до конца. Только у новичков: повторное
 * предложение (заходит, а записей нет) и обучение по ссылке воронку не трогают.
 * Прошёл до конца — `TOUR_DONE_KEY`, повторно больше не предлагаем. Закрыл
 * приложение посреди — продолжает с того же места (QS_KEY).
 */

type Step = 'offer' | 'plus' | 'amount' | 'category' | 'save' | 'balance' | 'analytics' | 'rewards' | 'done'
const ORDER: Step[] = ['offer', 'plus', 'amount', 'category', 'save', 'balance', 'analytics', 'rewards', 'done']
/** Номер шага для админки — как QS_STEPS воркера. */
const REPORT: Record<Step, number> = { offer: 0, plus: 1, amount: 2, category: 2, save: 2, balance: 3, analytics: 3, rewards: 3, done: 4 }
/** Шаги внутри шторки операции: шторку закрыли — снова к «+». */
const IN_SHEET = new Set<Step>(['amount', 'category', 'save'])
/** Порядок шагов обучения 2.9 — чтобы продолжить незаконченное. */
const ORDER_V2: readonly Step[] = ['offer', 'plus', 'amount', 'category', 'save', 'balance', 'analytics', 'done']

const at = (name: string) => `[data-tour="${name}"]`

/** Вырез затемнения. */
interface Spot {
  /** Цели; вырез — их общая рамка. */
  names: string[]
  /** Где в вырезе можно нажимать (селектор); нет — только смотреть. */
  tap?: string
  /** Радиус выреза; по умолчанию — как у цели. */
  r?: number
  /** Во всю ширину и до низа экрана — шторка. */
  bleed?: boolean
}
interface StepDef {
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
const SHEET: Spot = {
  names: ['amount', 'form', 'keypad', 'save'],
  tap: ['amount', 'form', 'keypad', 'save'].map(at).join(', '),
  bleed: true,
}
const STEPS: Record<Step, StepDef> = {
  offer: { spots: [], card: 'modal', chapter: -1 },
  plus: { spots: [{ names: ['plus'], tap: at('plus') }], ring: 'plus', card: 0, chapter: 0 },
  amount: { spots: [SHEET], ring: 'keypad', card: 'top', chapter: 0 },
  category: { spots: [SHEET], ring: 'categories', card: 'top', chapter: 0 },
  save: { spots: [SHEET], ring: 'save', card: 'top', chapter: 0 },
  balance: { spots: [{ names: ['balance'] }, { names: ['tab-analytics'], tap: at('tab-analytics') }], ring: 'tab-analytics', card: 0, chapter: 1 },
  analytics: { spots: [{ names: ['spent'] }, { names: ['tab-rewards'], tap: at('tab-rewards') }], ring: 'tab-rewards', card: 0, chapter: 2 },
  rewards: { spots: [{ names: ['level'] }, { names: ['tab-home'], tap: at('tab-home') }], ring: 'tab-home', card: 0, chapter: 3 },
  // Итог: подсвечена кнопка ассистента в шапке Главной (есть только в Telegram).
  done: { spots: tg.isInTelegram ? [{ names: ['assistant'] }] : [], card: 'modal', chapter: 4 },
}
const CHAPTERS = 4
/** Куда ведёт строка действия карточки (её можно и нажать — это та же вкладка). */
const NEXT_TAB: Partial<Record<Step, string>> = { balance: 'tab-analytics', analytics: 'tab-rewards', rewards: 'tab-home' }

type Lang = 'ru' | 'en'
const TEXT = {
  ru: {
    offerTitle: 'Привет! Я Кошель',
    offerText: 'За минуту покажу главное: ты запишешь первую трату, а я подскажу, куда нажимать.',
    againTitle: 'Показать, как тут всё устроено?',
    againText: 'Минута — и ты запишешь первую трату, а я подскажу, куда нажимать.',
    plan: ['Запишешь первую трату', 'Поймёшь, как считается баланс', 'Увидишь, куда уходят деньги', 'Узнаешь про уровни и задания'],
    start: 'Покажи',
    decline: 'Не сейчас',
    skip: 'Пропустить',
    skipLabel: 'Пропустить обучение',
    again: 'Обучение можно пройти заново в Настройках',
    chapter: 'Глава {n} из {all}',
    plusTitle: 'Нажми «+»',
    plusText: 'Так записывается любая трата или доход.',
    amountTitle: 'Набери сумму',
    amountText: 'Например, сколько сегодня ушло на еду.',
    categoryTitle: 'Выбери категорию',
    categoryText: 'На что ушли деньги.',
    saveTitle: 'Нажми «Записать расход»',
    saveText: 'Заметка и дата — по желанию.',
    balanceTitle: 'Первая запись!',
    balanceTitleMore: 'Записано!',
    balanceExpense: 'Баланс — это доходы минус расходы за месяц. Пока доходов нет, он в минусе. Зарплату запишешь так же: «+» → «Доход».',
    balanceWithIncome: 'Баланс — это доходы минус расходы за месяц, и трата уже в нём. Доход записывается так же: «+» → «Доход».',
    balanceIncome: 'Баланс — это доходы минус расходы за месяц. Траты записываются так же: «+» → «Расход».',
    toAnalytics: 'Открой «Аналитику»',
    analyticsTitle: 'Куда уходят деньги',
    analyticsText: 'Сколько ушло за месяц, а ниже — категории и календарь. Чем больше записей, тем точнее прогноз.',
    toRewards: 'Загляни в «Прогресс»',
    rewardsTitle: 'Твой уровень',
    rewardsText: 'За каждую запись — опыт и новые уровни. За задания — ещё и монеты: на них покупают обложки и рамки.',
    toHome: 'Вернись на «Главную»',
    doneTitle: 'Ты в деле!',
    doneText: 'Записывай траты сразу, как они случились, — так картина будет честной.',
    tipBot: 'Можно и сообщением боту: «Ушло 300 на кофе» — запишет сам.',
    tipAsk: 'Спроси ассистента: «Сколько ушло на кафе?» — кнопка вверху Главной.',
    tipEdit: 'Ошибка в записи? Открой её в списке на Главной и поправь.',
    remindText: 'Напомню вечером, если за день не было ни одной записи.',
    remindOn: 'Напоминать вечером',
    remindOff: 'Не нужно',
    finish: 'Поехали',
  },
  en: {
    offerTitle: 'Hey! I’m Koshel',
    offerText: 'Let me show you the essentials in a minute: you’ll log your first expense, and I’ll point to where to tap.',
    againTitle: 'Want a quick tour?',
    againText: 'One minute: you’ll log an expense, and I’ll point to where to tap.',
    plan: ['Log your first expense', 'See how the balance works', 'See where your money goes', 'Learn about levels and quests'],
    start: 'Show me',
    decline: 'Not now',
    skip: 'Skip',
    skipLabel: 'Skip the tour',
    again: 'You can take the tour again in Settings',
    chapter: 'Chapter {n} of {all}',
    plusTitle: 'Tap “+”',
    plusText: 'That’s how you log any expense or income.',
    amountTitle: 'Type an amount',
    amountText: 'Say, what you spent on food today.',
    categoryTitle: 'Pick a category',
    categoryText: 'What was the money for?',
    saveTitle: 'Tap “Save expense”',
    saveText: 'A note and a date are optional.',
    balanceTitle: 'First entry!',
    balanceTitleMore: 'Saved!',
    balanceExpense: 'Balance is income minus expenses for the month. With no income yet, it’s in the red. Log your salary the same way: “+” → “Income”.',
    balanceWithIncome: 'Balance is income minus expenses for the month, and this expense is already in it. Income goes the same way: “+” → “Income”.',
    balanceIncome: 'Balance is income minus expenses for the month. Expenses go the same way: “+” → “Expense”.',
    toAnalytics: 'Open “Analytics”',
    analyticsTitle: 'Where the money goes',
    analyticsText: 'What you spent this month, and below — categories and the calendar. The more you log, the sharper the forecast.',
    toRewards: 'Check out “Progress”',
    rewardsTitle: 'Your level',
    rewardsText: 'Every entry earns XP and new levels. Quests also give coins — spend them on covers and frames.',
    toHome: 'Back to “Home”',
    doneTitle: 'You’re all set!',
    doneText: 'Log expenses as they happen — that keeps the picture honest.',
    tipBot: 'Or just message the bot: “Spent 300 on coffee” — it logs it for you.',
    tipAsk: 'Ask the assistant: “How much went on cafes?” — the button at the top of Home.',
    tipEdit: 'Spotted a mistake? Open the entry in the list on Home and fix it.',
    remindText: 'I’ll remind you in the evening if a day has no entries.',
    remindOn: 'Remind me in the evening',
    remindOff: 'No thanks',
    finish: 'Let’s go',
  },
} as const

const PLAN_ICONS: ComponentType<LucideProps>[] = [Plus, Wallet, PieChart, Rocket]

/* ------------------------------------------------------------------ */
/* Место в QS_KEY: шаг (номер в ORDER) и id записанной в обучении траты. */

interface Saved {
  v: 3
  s: number
  ids: string[]
}
function readSaved(): { step: Step; id: string | null } {
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
function writeSaved(step: Step, id: string | null) {
  try {
    localStorage.setItem(QS_KEY, JSON.stringify({ v: 3, s: ORDER.indexOf(step), ids: id ? [id] : [] } satisfies Saved))
  } catch {
    /* приватный режим — продолжить с места не выйдет */
  }
}
function clearSaved() {
  try {
    localStorage.removeItem(QS_KEY)
  } catch {
    /* нечего чистить */
  }
}

/* ------------------------------------------------------------------ */
/* Цели и рамки. */

interface Box {
  x: number
  y: number
  w: number
  h: number
  /** Радиус скругления. */
  r: number
}

const HIDDEN_PANEL = '.tab-panel[data-off]'
const found = new Map<string, HTMLElement>()
/**
 * Цель на экране: во вкладке — только в открытой (соседние отрисованы скрытыми,
 * и замер внутри них форсировал бы их расчёт), остальное — где есть.
 */
function find(name: string): HTMLElement | null {
  const known = found.get(name)
  if (known && known.isConnected && !known.closest(HIDDEN_PANEL)) return known
  for (const e of document.querySelectorAll<HTMLElement>(at(name))) {
    if (!e.closest(HIDDEN_PANEL)) {
      found.set(name, e)
      return e
    }
  }
  found.delete(name)
  return null
}
const isCurrent = (name: string) => find(name)?.getAttribute('aria-current') === 'page'
const TABS = ['tab-home', 'tab-analytics', 'tab-rewards', 'tab-profile']

/** Цели внутри прокрутки — видимая часть обрезается её рамкой. */
const CLIP: Record<string, string> = { categories: 'form' }

const radii = new WeakMap<Element, number>()
function radiusOf(e: Element, name: string, h: number): number {
  // Вкладки — пилюлей, как капсула выбранной вкладки.
  if (name.startsWith('tab-')) return h / 2
  let r = radii.get(e)
  if (r === undefined) {
    r = parseFloat(getComputedStyle(e).borderTopLeftRadius) || 0
    radii.set(e, r)
  }
  return r
}

/** Рамка цели, если она на экране. */
function rectOf(name: string): Box | null {
  const e = find(name)
  if (!e) return null
  const b = e.getBoundingClientRect()
  let top = b.top
  let bottom = b.bottom
  const clip = CLIP[name] ? find(CLIP[name]) : null
  if (clip) {
    const c = clip.getBoundingClientRect()
    top = Math.max(top, c.top)
    bottom = Math.min(bottom, c.bottom)
  }
  if (b.width < 2 || bottom - top < 2 || bottom <= 0 || top >= innerHeight) return null
  return { x: b.left, y: top, w: b.width, h: bottom - top, r: radiusOf(e, name, bottom - top) }
}

const PAD = 6
const MAX_HOLES = 2
/** Перетекание выреза и кольца к новой цели, мс. */
const DUR = 460
/** Пружина карточки: постоянная времени, мс. */
const CARD_TAU = 80
/** Палец замер на сумме — значит, набрал; пора к категории. Назад к сумме — только если стёр её. */
const SETTLE = 1000
/** Зазор между карточкой и целью (под хвостик). */
const GAP = 16
const EDGE = 10

function spotRect(s: Spot, vw: number, vh: number): Box | null {
  let u: Box | null = null
  for (const n of s.names) {
    const r = rectOf(n)
    if (!r) continue
    if (!u) u = r
    else {
      const x = Math.min(u.x, r.x)
      const y = Math.min(u.y, r.y)
      u = { x, y, w: Math.max(u.x + u.w, r.x + r.w) - x, h: Math.max(u.y + u.h, r.y + r.h) - y, r: u.r }
    }
  }
  if (!u) return null
  // Шторка — во всю ширину и до низа: края выреза уходят за экран.
  if (s.bleed) return { x: -30, y: u.y - PAD, w: vw + 60, h: vh + 30 - (u.y - PAD), r: 24 }
  const w = u.w + PAD * 2
  const h = u.h + PAD * 2
  return { x: u.x - PAD, y: u.y - PAD, w, h, r: Math.min(s.r ?? Math.max(14, u.r + PAD), w / 2, h / 2) }
}

function ringRect(name: string, vw: number): Box | null {
  const r = rectOf(name)
  if (!r) return null
  // Отступ от краёв экрана — как у остальных колец (лента категорий во всю ширину).
  const x = Math.max(EDGE, r.x - PAD)
  const w = Math.min(vw - EDGE, r.x + r.w + PAD) - x
  let bottom = r.y + r.h + PAD
  // Кольцо клавиш не заходит на «Записать» под ними.
  if (name === 'keypad') {
    const save = rectOf('save')
    if (save) bottom = Math.min(bottom, save.y - 2)
  }
  const h = bottom - (r.y - PAD)
  return { x, y: r.y - PAD, w, h, r: Math.min(Math.max(14, r.r + PAD), w / 2, h / 2) }
}

/** Тост «Записано · Отменить» — карточка его не закрывает. */
function toastRect(): Box | null {
  const t = document.querySelector('[data-toast]')
  if (!t) return null
  const b = t.getBoundingClientRect()
  return b.height > 0 ? { x: b.left, y: b.top, w: b.width, h: b.height, r: 0 } : null
}

/**
 * Шторка операции на экране (выезжает, открыта или ещё уходит) — по её верху
 * (сумме), а не по «Записать»: в альбомной ориентации кнопка ниже края экрана,
 * и шторка «не открывалась» — карточка так и просила нажать «+». И шаг
 * меняется, как только лист показался, а не когда въехал целиком.
 */
function sheetShown(): boolean {
  const a = find('amount')
  if (!a) return false
  const b = a.getBoundingClientRect()
  return b.height > 0 && b.top < innerHeight - 8
}

/**
 * Мало места под категории (низкий экран: видна полоска первой строки) —
 * сворачиваем клавиатуру, как касание пустого места: лист садится, и вся
 * сетка на виду. Сумма уже набрана; нажатие на неё вернёт клавиши.
 */
function foldKeypadIfCramped() {
  const cats = find('categories')
  const form = find('form')
  const pad = find('keypad')
  if (!cats || !form || !pad) return
  const c = cats.getBoundingClientRect()
  const f = form.getBoundingClientRect()
  if (Math.min(c.bottom, f.bottom) - Math.max(c.top, f.top) < c.height - 8) pad.dispatchEvent(new Event('tour-fold'))
}

/* Перетекание: от того, что на экране сейчас, к живой рамке цели. */
interface Anim {
  key: string
  /** Где цель: вкладка и «в шторке ли» — сменились, значит, другая страница. */
  kind: string
  from: Box | null
  cur: Box | null
  t0: number
  had: boolean
}
const newAnim = (): Anim => ({ key: '', kind: '', from: null, cur: null, t0: 0, had: false })
const ease = (t: number) => 1 - Math.pow(1 - t, 4)
const dot = (b: Box): Box => ({ x: b.x + b.w / 2, y: b.y + b.h / 2, w: 0, h: 0, r: 0 })
const mix = (a: Box, b: Box, p: number): Box => ({
  x: a.x + (b.x - a.x) * p,
  y: a.y + (b.y - a.y) * p,
  w: a.w + (b.w - a.w) * p,
  h: a.h + (b.h - a.h) * p,
  r: a.r + (b.r - a.r) * p,
})
function animate(a: Anim, key: string, target: Box | null, now: number, dur: number, kind = '', entry?: Box): Box | null {
  if (key !== a.key || !!target !== a.had) {
    // Новая цель, или та же появилась позже (вкладка догрузилась) / ушла с экрана.
    // Цель на другой странице (вкладка, шторка) — от старой не тянемся: вырез
    // проезжал по чужому экрану и высвечивал случайный кусок. Растёт из
    // середины новой цели, у шторки — снизу, вместе с листом.
    a.from = kind !== a.kind ? (entry ?? null) : a.cur
    a.key = key
    a.kind = kind
    a.t0 = now
    a.had = !!target
  }
  // Цели нет (ушла вместе со страницей, на новом шаге выреза нет) — вырез
  // закрывается сразу: сжимаясь, он высвечивал случайный кусок новой страницы.
  if (!target) {
    a.cur = null
    return null
  }
  const p = dur > 0 ? ease(Math.min(1, (now - a.t0) / dur)) : 1
  a.cur = p >= 1 ? target : mix(a.from ?? dot(target), target, p)
  return a.cur
}
/** Перетекание ещё идёт. */
const moving = (a: Anim, now: number, dur: number) => !!a.cur && dur > 0 && now - a.t0 < dur

type Side = '' | 'up' | 'down'
/**
 * Где карточка. Над шторкой — вплотную к вырезу, но не выше безопасной зоны.
 * У выреза — снизу (если влезает и цель в верхней половине) или сверху,
 * хвостиком к цели; сторону, на которой уже стоит, держит, пока влезает (тост
 * ушёл — карточка не перепрыгивает). Не влезает нигде — `side: ''`, где места
 * больше. Вырезы и тост не закрывает.
 */
function placeCard(
  mode: StepDef['card'],
  anchor: Box | null,
  keep: Box[],
  h: number,
  vh: number,
  safe: { top: number; bottom: number },
  stick: Side,
  bar: number,
): { y: number; side: Side } {
  const top = safe.top + EDGE
  const bottom = vh - safe.bottom - EDGE
  if (mode === 'top') {
    // Вплотную к вырезу: шапка шторки (вид операции) — под карточкой целиком,
    // а не торчит из-под неё половиной кнопок.
    const hole = keep[0]
    return { y: hole ? Math.max(safe.top + 4, hole.y - 2 - h) : top, side: '' }
  }
  if (mode === 'modal' || !anchor) {
    // Окно — над панелью вкладок, если влезает: из-под него выглядывали «+»
    // и подписи вкладок. Не влезает — как раньше, у низа экрана.
    let y = bar > 0 && bar - 12 - h >= top ? bar - 12 - h : bottom - h - 6
    for (const k of keep) if (k.y < y + h + 12 && k.y + k.h > y) y = Math.min(y, k.y - 12 - h)
    return { y: Math.max(top, y), side: '' }
  }
  const aTop = anchor.y
  const aBottom = anchor.y + anchor.h
  let belowEnd = bottom
  let aboveStart = top
  for (const k of keep) {
    if (k === anchor) continue
    if (k.y >= aBottom - 1) belowEnd = Math.min(belowEnd, k.y - 10)
    else if (k.y + k.h <= aTop + 1) aboveStart = Math.max(aboveStart, k.y + k.h + 10)
  }
  const fitsBelow = belowEnd - (aBottom + GAP) >= h
  const fitsAbove = aTop - GAP - aboveStart >= h
  const below = { y: aBottom + GAP, side: 'up' as Side }
  const above = { y: aTop - GAP - h, side: 'down' as Side }
  if (stick === 'up' && fitsBelow) return below
  if (stick === 'down' && fitsAbove) return above
  if (fitsBelow && (aTop + anchor.h / 2 < vh * 0.55 || !fitsAbove)) return below
  if (fitsAbove) return above
  // Нигде не влезает (низкий экран, высокая цель): как можно ниже, но над тостом
  // и вкладками — закрываем низ цели, а не то, что нажать.
  return { y: Math.max(top, Math.min(belowEnd, bottom) - h), side: '' }
}

/**
 * Карточке негде встать у цели (низкий экран) — подкручиваем страницу, чтобы
 * цель оказалась наверху: под ней освободится место. Один раз на шаг.
 */
function scrollToMakeRoom(anchor: Box, safeTop: number) {
  const room = document.documentElement.scrollHeight - innerHeight - scrollY
  const by = Math.min(anchor.y - safeTop - EDGE, room)
  if (by >= 24) window.scrollBy({ top: by, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
}

/* ------------------------------------------------------------------ */

const NOOP = () => {}
type Tip = [ComponentType<LucideProps>, string]

export function Tour({ onDone, reason = 'new' }: { onDone: () => void; reason?: TourReason }) {
  // Воронка в админке — только про новичков.
  const report = reason === 'new' ? reportQuickStart : NOOP
  const lang: Lang = useStore((s) => s.lang) === 'en' ? 'en' : 'ru'
  const tx = TEXT[lang]
  const [saved] = useState(readSaved)
  const [step, setStep] = useState<Step>(saved.step)
  const [recorded, setRecorded] = useState<string | null>(saved.id)
  const [leaving, setLeaving] = useState(false)
  const stepRef = useRef(step)
  // Вкладка, которую продолжение должно открыть само (см. ниже); '' — открыта.
  const resumeRef = useRef(saved.step === 'analytics' ? 'tab-analytics' : saved.step === 'rewards' ? 'tab-rewards' : '')
  const recordedRef = useRef(recorded)
  const leavingRef = useRef(false)
  // Своё нажатие (вернуть на Главную) защита пропускает.
  const free = useRef(false)

  const press = (name: string) => {
    const e = find(name)
    if (!e) return
    free.current = true
    try {
      e.click()
    } finally {
      free.current = false
    }
  }

  // Будильник цикла кадров (ставит цикл, см. ниже).
  const wakeRef = useRef<() => void>(NOOP)
  const go = (next: Step) => {
    if (stepRef.current === next) return
    stepRef.current = next
    wakeRef.current()
    // Баланс — на Главной: записали с другой вкладки — возвращаемся туда;
    // пролистали вниз — поднимаем к карточке.
    if (next === 'balance') {
      if (!isCurrent('tab-home')) press('tab-home')
      else {
        const b = rectOf('balance')
        if (!b || b.y < 0 || b.y + b.h > innerHeight - 90) window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
      }
    }
    // Итог — на Главной с самого верха: её прокручивали под карточку баланса,
    // и кнопка ассистента, о которой говорит совет, оставалась за краем.
    // Кадром позже: вкладка сначала восстанавливает свою прокрутку.
    if (next === 'done') requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' }))
    setStep(next)
  }

  // Каждую такую сессию держим в записях Clarity и метим шаги.
  useEffect(() => {
    clarityTag('onboarding', reason === 'new' ? 'tour' : 'tour_' + reason)
    clarityKeep('onboarding')
  }, [])
  useEffect(() => clarityEvent('onboarding_' + step), [step])
  // Место — в localStorage (не в стор: сохранённый стор значит «старый
  // пользователь»); с предложения не пишем — его и так покажем.
  useEffect(() => {
    if (step !== 'offer') writeSaved(step, recorded)
  }, [step, recorded])
  const reported = useRef(-1)
  useEffect(() => {
    const s = REPORT[step]
    if (s === reported.current) return
    const send = () => {
      reported.current = s
      report({ s, e: recorded ? 1 : 0, i: false, v: 2 })
    }
    // Предложение — не сразу: вернувшемуся на новый телефон облако приносит
    // записи через секунду-другую, и он не новичок (тихо уходим, см. ниже).
    // Ответил раньше — следующий шаг покроет и «предложили» (воркер берёт max).
    // Итог — тоже с задержкой: «Поехали» сразу шлёт отчёт с отметкой «дошёл»,
    // и два почти одновременных отчёта могли разминуться в KV — последним ложился
    // тот, что без отметки.
    if (step !== 'offer' && step !== 'done') return send()
    const id = window.setTimeout(
      () => {
        if (!leavingRef.current && stepRef.current === step) send()
      },
      step === 'offer' ? 3000 : 1500,
    )
    return () => clearTimeout(id)
  }, [step, recorded])
  // Пока идёт обучение, пустое место шторки клавиатуру не сворачивает.
  useEffect(() => {
    document.body.setAttribute('data-touring', '')
    return () => document.body.removeAttribute('data-touring')
  }, [])

  // Трата из шторки — шаг пройден (одна новая операция: облако, догнавшее
  // новое устройство, приносит их пачкой). Отменили её тостом, пока смотрим
  // баланс или аналитику, — снова к «+»: показывать нечего.
  useEffect(() => {
    return useStore.subscribe((s, prev) => {
      if (s.transactions === prev.transactions) return
      const cur = stepRef.current
      if (IN_SHEET.has(cur) && s.transactions.length === prev.transactions.length + 1) {
        const before = new Set(prev.transactions.map((x) => x.id))
        const fresh = s.transactions.find((x) => !before.has(x.id))
        if (fresh) {
          recordedRef.current = fresh.id
          setRecorded(fresh.id)
          go('balance')
        }
      } else if (
        (cur === 'balance' || cur === 'analytics' || cur === 'rewards' || cur === 'done') &&
        recordedRef.current &&
        !s.transactions.some((x) => x.id === recordedRef.current)
      ) {
        recordedRef.current = null
        setRecorded(null)
        go('plus')
      } else if (
        reason !== 'link' &&
        !recordedRef.current &&
        ((cur === 'offer' && s.transactions.length > 0) ||
          (cur === 'plus' && s.transactions.length > prev.transactions.length) ||
          (IN_SHEET.has(cur) && s.transactions.length > prev.transactions.length + 1))
      ) {
        // Облако принесло записи: это не новичок, а человек на новом телефоне
        // (или с очищенным кэшем) — даже если «Покажи» он успел нажать. Учебная
        // «первая запись» легла бы в его настоящие данные — тихо уходим, без
        // отчёта и тоста; открытую шторку операции закрываем (её «Назад»).
        clarityEvent('onboarding_returning')
        clearSaved()
        if (sheetShown()) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
        leave()
      }
      wakeRef.current()
    })
  }, [])

  // Валюта по региону — при ответе на предложение, НЕ при открытии: запись в
  // стор при открытии сохранила бы его, и ушедший с первого экрана в следующий
  // раз считался бы старым пользователем.
  // Валюту, которую человек уже выбирал (метка CURRENCY_ASKED_KEY), не трогаем:
  // повторное обучение или по ссылке меняло выбранный им USD на «местную».
  const applyRegion = () => {
    const s = useStore.getState()
    let asked = false
    try {
      asked = localStorage.getItem(CURRENCY_ASKED_KEY) === '1'
    } catch {
      /* приватный режим */
    }
    const d = detectCurrency()
    if (!asked && s.transactions.length === 0 && s.currency === 'USD' && d.currency !== 'USD') s.setCurrency(d.currency)
    try {
      localStorage.setItem(CURRENCY_ASKED_KEY, '1')
    } catch {
      /* приватный режим */
    }
  }

  // Уход — затемнение гаснет, потом снимаемся.
  const leave = () => {
    if (leavingRef.current) return
    leavingRef.current = true
    setLeaving(true)
    window.setTimeout(onDone, prefersReducedMotion() ? 0 : 200)
  }
  const exit = () => {
    if (leavingRef.current) return
    const s = REPORT[stepRef.current]
    hapticTap()
    clarityEvent('onboarding_exit')
    clarityTag('onboarding_exit_at', stepRef.current)
    report({ s, e: recordedRef.current ? 1 : 0, i: false, x: s, v: 2 })
    applyRegion()
    clearSaved()
    leave()
    // Выход без подтверждения — зато вернуться можно (Настройки → «Пройти обучение»).
    showToast({ text: tx.again })
  }
  const start = () => {
    hapticTap()
    applyRegion()
    // В демо учебная запись пряталась под чужими данными, а баланс показывал
    // демо-доход при тексте «пока доходов нет».
    const st = useStore.getState()
    if (st.demoMode) st.setDemoMode(false)
    go('plus')
  }

  // Напоминания: разрешение боту писать — в конце, когда человек уже понял,
  // зачем. Без разрешения бот не напишет ни разу.
  const reminders = useStore((s) => s.remindersEnabled)
  const [askRemind] = useState(() => tg.isInTelegram && !botCanWrite() && canRequestBotWrite())
  const busy = useRef(false)
  const [waiting, setWaiting] = useState(false)
  /** remind: null — ушли «Назад»: напоминания не трогаем (это не «Не нужно»). */
  const finish = async (remind: boolean | null) => {
    if (busy.current || leavingRef.current) return
    busy.current = true
    if (askRemind && remind !== null) {
      if (remind) {
        // Окно Telegram «разрешить боту писать»: пока ждём — кнопка занята;
        // не ответил за 8 с (окно не пришло) — идём дальше без напоминаний.
        setWaiting(true)
        const granted = await Promise.race([requestBotWrite(), new Promise<boolean>((r) => setTimeout(() => r(false), 8_000))])
        setWaiting(false)
        clarityEvent(granted ? 'bot_write_yes' : 'bot_write_no')
        if (granted) void setReminders(true)
        else useStore.getState().setRemindersEnabled(false)
      } else {
        useStore.getState().setRemindersEnabled(false)
      }
    }
    hapticNotify('success')
    clarityEvent('onboarding_done')
    report({ s: REPORT.done, e: recordedRef.current ? 1 : 0, i: false, d: true, v: 2 })
    try {
      localStorage.setItem(TOUR_DONE_KEY, '1')
    } catch {
      /* приватный режим */
    }
    clearSaved()
    if (!isCurrent('tab-home')) press('tab-home')
    leave()
  }

  // «Назад» Telegram и Escape — общая стопка: на предложении это «Не сейчас»,
  // на итоге — «Поехали», на шагах — выход (шторка операции поверх ловит своё).
  useBackButton(!leaving, () => (stepRef.current === 'done' ? void finish(null) : exit()), STEPS[step].card === 'modal')

  // Шапка и нижняя полоса Telegram — под затемнение: в светлой теме зелёная
  // шапка над тёмным экраном выглядела оторванной. Уходим — как было.
  useEffect(() => {
    const wa = tg.webApp
    if (!wa) return
    const dark = document.documentElement.classList.contains('dark')
    const head = dark ? '#050505' : '#163B2C'
    const bg = dark ? '#050505' : '#595957'
    try {
      wa.setHeaderColor(head)
    } catch {
      /* старый клиент */
    }
    try {
      if (wa.setBottomBarColor && wa.isVersionAtLeast?.('7.10')) wa.setBottomBarColor(bg)
    } catch {
      /* старый клиент */
    }
    return () => syncTelegramChrome(document.documentElement.classList.contains('dark'))
  }, [])

  // Продолжение с «Аналитики» или «Прогресса»: приложение открылось на Главной —
  // открываем нужную вкладку сами (панель вкладок могла ещё не встать). Пока не
  // открыли, шаги не двигаются: на «Прогрессе» открытая Главная засчитывалась
  // как «вернулся на Главную» — и сразу показывался итог.
  useEffect(() => {
    const name = resumeRef.current
    if (!name) return
    let tries = 0
    const id = window.setInterval(() => {
      if (isCurrent(name) || ++tries > 20) {
        clearInterval(id)
        resumeRef.current = ''
        wakeRef.current()
      } else if (find(name)) press(name)
    }, 150)
    return () => clearInterval(id)
  }, [])

  // Найденные цели держат узлы DOM — после ухода не держим.
  useEffect(() => () => found.clear(), [])

  const maskRefs = useRef<(SVGRectElement | null)[]>([])
  const ringRef = useRef<HTMLDivElement>(null)
  const posRef = useRef<HTMLDivElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const tailRef = useRef<HTMLSpanElement>(null)
  const safeRef = useRef<HTMLDivElement>(null)
  // Высота карточки — из ResizeObserver: читать её каждый кадр незачем.
  const cardH = useRef(0)
  const cardW = useRef(0)
  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card) return
    cardH.current = card.offsetHeight
    cardW.current = card.offsetWidth
    const ro = new ResizeObserver(() => {
      cardH.current = card.offsetHeight
      cardW.current = card.offsetWidth
      wakeRef.current()
    })
    ro.observe(card)
    return () => ro.disconnect()
  }, [])

  // Каждый кадр: шаг по интерфейсу → рамки целей → вырезы, кольцо, карточка.
  useLayoutEffect(() => {
    const reduce = prefersReducedMotion()
    const dur = reduce ? 0 : isLowEnd() ? 320 : DUR
    const holes = Array.from({ length: MAX_HOLES }, newAnim)
    const ring = newAnim()
    const wrote: string[] = []
    let wroteRing = '-'
    let wroteCard = ''
    let wroteTail = ''
    let wroteSide: Side | '-' = '-'
    // Сторона карточки на этом шаге (держим) и шаг, где страницу уже подкрутили.
    let stick: Side = ''
    let stickStep: Step | '' = ''
    let stepAt = 0
    let scrolledStep: Step | '' = ''
    let modalFor = ''
    let modalY = 0
    let wroteHide = false
    let cardY = NaN
    let last = performance.now()
    let goneAt = 0
    let lastAmount = -1
    let amountAt = 0
    let folded = false
    // Кадр что-то записал или чего-то ждёт — значит, не спим.
    let busy = false
    let pulsedFor = ''
    // Безопасная зона (вырез, «чёлка», полоска жестов) — по невидимой рамке из CSS-переменных.
    const safe = { top: 0, bottom: 0 }
    const readSafe = () => {
      const s = safeRef.current?.getBoundingClientRect()
      if (!s) return
      safe.top = Math.max(0, s.top)
      safe.bottom = Math.max(0, innerHeight - s.bottom)
    }
    readSafe()
    addEventListener('resize', readSafe)

    const progress = (now: number) => {
      const cur = stepRef.current
      if (cur === 'plus') {
        if (sheetShown()) go('amount')
        return
      }
      if (IN_SHEET.has(cur)) {
        if (!sheetShown()) {
          // Шторку закрыли (свайпом, «Назад») — снова к «+».
          if (!goneAt) goneAt = now
          else if (now - goneAt > 600) {
            goneAt = 0
            go('plus')
          }
          busy = true
          return
        }
        goneAt = 0
        const amount = Number(find('amount')?.dataset.value) || 0
        const cat = find('categories')?.dataset.value ?? ''
        if (amount !== lastAmount) {
          lastAmount = amount
          amountAt = now
        }
        // Сумма есть и палец замер — к категории; выбрана — к «Записать».
        // К клавишам — только если сумму стёрли до нуля: дописал цифру после
        // паузы — остаёмся на категории (раньше шаг скакал туда-обратно).
        const next: Step = amount <= 0 ? 'amount' : cat ? 'save' : cur !== 'amount' || now - amountAt >= SETTLE ? 'category' : 'amount'
        // Ждём паузу после цифры — цикл не засыпает, иначе шаг опоздает.
        if (next === 'amount' && amount > 0) busy = true
        if (next === 'category' && !folded) {
          folded = true
          foldKeypadIfCramped()
        } else if (next === 'amount') folded = false
        go(next)
        return
      }
      if (resumeRef.current) {
        busy = true
        return
      }
      if (cur === 'balance' && isCurrent('tab-analytics')) go('analytics')
      else if (cur === 'analytics' && isCurrent('tab-rewards')) go('rewards')
      else if (cur === 'rewards' && isCurrent('tab-home')) go('done')
    }

    let raf = 0
    let idle = 0
    let sleeping = false
    /** Один кадр: шаг, рамки, запись. Возвращает «что-то ещё идёт». */
    const frame = (now: number): boolean => {
      busy = false
      const dt = Math.min(50, Math.max(0, now - last))
      last = now
      if (leavingRef.current) return false
      const stepBefore = stepRef.current
      progress(now)
      if (stepRef.current !== stepBefore) busy = true
      const def = STEPS[stepRef.current]
      const vw = innerWidth
      const vh = innerHeight

      // Чтение — всё сразу, до записи.
      const live = def.spots.map((s) => spotRect(s, vw, vh))
      const ringLive = def.ring ? ringRect(def.ring, vw) : null
      const toast = toastRect()
      const inSheet = IN_SHEET.has(stepRef.current)
      // Страница целей: открытая вкладка (+ шторка). Сменилась — вырез и кольцо
      // не тянутся со старой, а вырастают на новой (animate).
      const page = (TABS.find(isCurrent) ?? '') + (inSheet ? '|sheet' : '')

      const shown: (Box | null)[] = []
      for (let i = 0; i < MAX_HOLES; i++) {
        const s = def.spots[i]
        const target = live[i] ?? null
        // Шторка — снизу, вместе с листом; остальное — из середины цели.
        const entry = target ? (s?.bleed ? { x: -30, y: vh, w: vw + 60, h: 0, r: 24 } : dot(target)) : undefined
        shown.push(animate(holes[i], s ? s.names.join('+') : '', target, now, dur, page, entry))
      }
      const ringNow = animate(ring, def.ring ?? '', ringLive, now, dur, page, ringLive ? dot(ringLive) : undefined)
      if (ringNow && def.ring && pulsedFor !== def.ring) {
        pulsedFor = def.ring
        if (!reduce) replay(ringRef.current, 'tour-pulse')
      }

      const keep = live.filter((b): b is Box => !!b)
      if (toast) keep.push(toast)
      const anchor = typeof def.card === 'number' ? (live[def.card] ?? null) : null
      const cur = stepRef.current
      if (stickStep !== cur) {
        stickStep = cur
        stepAt = now
        stick = ''
      }
      // Верх панели вкладок — окна (предложение, итог) встают над ней.
      const bar = def.card === 'modal' ? Math.min(rectOf('plus')?.y ?? Infinity, rectOf('tab-home')?.y ?? Infinity) : Infinity
      const place = placeCard(def.card, anchor, keep, cardH.current, vh, safe, stick, Number.isFinite(bar) ? bar : 0)
      // Окно на шаге только поднимается: ушёл тост — итог не уезжает вниз на 140 px.
      if (def.card === 'modal') {
        if (modalFor === cur + vh && place.y > modalY) place.y = modalY
        modalFor = cur + vh
        modalY = place.y
      }
      if (place.side) stick = place.side
      else if (anchor && scrolledStep !== cur && now - stepAt > DUR) {
        // Негде встать у цели — один раз подкручиваем страницу (низкий экран).
        // Не сразу: вкладка доезжает, карточка успевает сменить содержимое.
        scrolledStep = cur
        scrollToMakeRoom(anchor, safe.top)
      }
      // Больше трети экрана — переносим сразу (содержимое и так меняется
      // с проявлением): пролетая 600 px, карточка на полпути висела посреди
      // выезжающей шторки.
      cardY =
        Number.isNaN(cardY) || reduce || Math.abs(place.y - cardY) > vh / 3
          ? place.y
          : cardY + (place.y - cardY) * (1 - Math.exp(-dt / CARD_TAU))
      if (Math.abs(cardY - place.y) < 0.3) cardY = place.y
      else busy = true
      for (let i = 0; i < MAX_HOLES; i++) if (moving(holes[i], now, dur)) busy = true
      if (moving(ring, now, dur)) busy = true

      // Запись — только если что-то сдвинулось.
      for (let i = 0; i < MAX_HOLES; i++) {
        const node = maskRefs.current[i]
        const b = shown[i]
        if (!node) continue
        const sig = b && b.w > 0.5 && b.h > 0.5 ? `${b.x.toFixed(1)} ${b.y.toFixed(1)} ${b.w.toFixed(1)} ${b.h.toFixed(1)} ${b.r.toFixed(1)}` : ''
        if (sig === wrote[i]) continue
        wrote[i] = sig
        busy = true
        if (!b || !sig) {
          node.setAttribute('width', '0')
          node.setAttribute('height', '0')
          continue
        }
        node.setAttribute('x', b.x.toFixed(1))
        node.setAttribute('y', b.y.toFixed(1))
        node.setAttribute('width', b.w.toFixed(1))
        node.setAttribute('height', b.h.toFixed(1))
        node.setAttribute('rx', Math.max(0, b.r).toFixed(1))
        node.setAttribute('ry', Math.max(0, b.r).toFixed(1))
      }
      const rn = ringRef.current
      if (rn) {
        const sig = ringNow && ringNow.w > 1 && ringNow.h > 1 ? `${ringNow.x.toFixed(1)} ${ringNow.y.toFixed(1)} ${ringNow.w.toFixed(1)} ${ringNow.h.toFixed(1)} ${ringNow.r.toFixed(1)}` : ''
        if (sig !== wroteRing) {
          wroteRing = sig
          busy = true
          if (!ringNow || !sig) rn.style.display = 'none'
          else {
            rn.style.display = ''
            rn.style.transform = `translate3d(${ringNow.x.toFixed(1)}px, ${ringNow.y.toFixed(1)}px, 0)`
            rn.style.width = `${ringNow.w.toFixed(1)}px`
            rn.style.height = `${ringNow.h.toFixed(1)}px`
            rn.style.borderRadius = `${ringNow.r.toFixed(1)}px`
            // Пульс расходится на ~9 px при любом размере кольца.
            rn.style.setProperty('--px', (1 + 18 / Math.max(ringNow.w, 18)).toFixed(3))
            rn.style.setProperty('--py', (1 + 18 / Math.max(ringNow.h, 18)).toFixed(3))
          }
        }
      }
      const pos = posRef.current
      if (pos) {
        const sig = cardY.toFixed(1)
        if (sig !== wroteCard) {
          wroteCard = sig
          busy = true
          pos.style.transform = `translate3d(0, ${sig}px, 0)`
        }
        // Карточка баланса — когда шторка ушла: поверх уезжающего листа она
        // выглядела как часть шторки.
        const hide = cur === 'balance' && sheetShown()
        if (hide !== wroteHide) {
          wroteHide = hide
          busy = true
          pos.style.opacity = hide ? '0' : ''
        }
        if (hide) busy = true
      }
      const cardEl = cardRef.current
      if (cardEl && place.side !== wroteSide) {
        wroteSide = place.side
        if (place.side) cardEl.setAttribute('data-side', place.side)
        else cardEl.removeAttribute('data-side')
      }
      const tail = tailRef.current
      if (tail && anchor && place.side) {
        const w = cardW.current || Math.min(vw - 32, 384)
        const x = Math.min(Math.max(anchor.x + anchor.w / 2 - (vw - w) / 2, 28), w - 28)
        const sig = x.toFixed(1)
        if (sig !== wroteTail) {
          wroteTail = sig
          tail.style.transform = `translateX(${(x - 8).toFixed(1)}px) rotate(45deg)`
        }
      }
      return busy
    }
    const tick = (now: number) => {
      if (frame(now)) idle = 0
      else idle += 1
      // ~15 спокойных кадров — засыпаем до ввода, прокрутки или анимации.
      if (idle >= 15 || leavingRef.current) {
        sleeping = true
        return
      }
      raf = requestAnimationFrame(tick)
    }
    const wake = () => {
      idle = 0
      if (!sleeping || leavingRef.current) return
      sleeping = false
      last = performance.now()
      raf = requestAnimationFrame(tick)
    }
    wakeRef.current = wake
    // Будильники: ввод, прокрутка (и внутри шторки), размер, начало анимаций
    // и переходов (шторка выезжает, тост, вкладка). Страховка — раз в 400 мс:
    // один кадр без ожидания; что-то сдвинулось — просыпаемся.
    const opts = { capture: true, passive: true } as const
    const wakeOn = ['pointerdown', 'pointerup', 'keydown', 'input', 'transitionrun', 'animationstart'] as const
    for (const type of wakeOn) document.addEventListener(type, wake, opts)
    addEventListener('scroll', wake, opts)
    addEventListener('resize', wake)
    // Раз в секунду, а не чаще: чтение рамок при идущих CSS-анимациях страницы
    // (Аналитика, Прогресс) — пересчёт стилей, и опрос каждые 400 мс стоил втрое.
    const poll = window.setInterval(() => {
      if (sleeping && !leavingRef.current && frame(performance.now())) wake()
    }, 1000)
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      clearInterval(poll)
      wakeRef.current = NOOP
      for (const type of wakeOn) document.removeEventListener(type, wake, opts)
      removeEventListener('scroll', wake, opts)
      removeEventListener('resize', wake)
      removeEventListener('resize', readSafe)
    }
  }, [])

  // Нажатия мимо подсветки гасим и отвечаем на них: карточка качнётся, кольцо
  // вспыхнет. Свободны: карточка, тост, места для нажатия на шаге и шторки
  // поверх шторки операции.
  useEffect(() => {
    if (leaving) return
    let nudgedAt = 0
    // Касание мимо: где и когда началось. Отвечаем на отпускание — если палец
    // почти не сдвинулся: прокрутка затемнённой части — не промах (раньше
    // карточка качалась на каждую попытку пролистать «Аналитику»).
    let down: { id: number; x: number; y: number; t: number; look: boolean } | null = null
    // Подсвечено «посмотреть» (баланс, «Потрачено», уровень): нажатие гасим, но
    // не ругаемся — человек делает ровно то, что просили.
    const lookOnly = (target: EventTarget | null) =>
      target instanceof Element && STEPS[stepRef.current].spots.some((s) => !s.tap && s.names.some((n) => !!target.closest(at(n))))
    const allowed = (target: EventTarget | null) => {
      if (free.current) return true
      if (!(target instanceof Element)) return false
      // Карточка обучения и тост («Записано · Отменить» — его кнопка должна работать).
      if (target.closest('[data-tour-card], [role="status"]')) return true
      const dlg = target.closest('[role="dialog"]')
      if (dlg && !dlg.querySelector(at('save'))) return true
      return STEPS[stepRef.current].spots.some((s) => !!s.tap && !!target.closest(s.tap))
    }
    const guard = (e: Event) => {
      if (allowed(e.target)) return
      e.stopPropagation()
      e.preventDefault()
      if (e.type !== 'pointerdown') return
      const p = e as PointerEvent
      down = { id: p.pointerId, x: p.clientX, y: p.clientY, t: performance.now(), look: lookOnly(e.target) }
    }
    const nudge = () => {
      const now = performance.now()
      if (now - nudgedAt < 450) return
      nudgedAt = now
      hapticTap()
      if (prefersReducedMotion()) {
        // Без движения: кольцо на миг ярче.
        const ring = ringRef.current
        ring?.classList.add('tour-lit')
        window.setTimeout(() => ring?.classList.remove('tour-lit'), 420)
        return
      }
      replay(shellRef.current, 'tour-nudge')
      replay(ringRef.current, 'tour-flash')
    }
    const up = (e: PointerEvent) => {
      const d = down
      down = null
      if (!d || d.id !== e.pointerId || d.look) return
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10 || performance.now() - d.t > 700) return
      nudge()
    }
    const cancel = () => {
      down = null
    }
    const types = ['click', 'pointerdown', 'mousedown'] as const
    for (const type of types) document.addEventListener(type, guard, true)
    document.addEventListener('pointerup', up, true)
    document.addEventListener('pointercancel', cancel, true)
    return () => {
      for (const type of types) document.removeEventListener(type, guard, true)
      document.removeEventListener('pointerup', up, true)
      document.removeEventListener('pointercancel', cancel, true)
    }
  }, [leaving])

  // Итог — с конфетти от галочки.
  const badgeRef = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (step !== 'done') return
    const id = window.setTimeout(() => burst(badgeRef.current, { confetti: true, count: 18, spread: 80 }), 260)
    return () => clearTimeout(id)
  }, [step])

  const def = STEPS[step]
  const modal = def.card === 'modal'
  const recordedType = recorded ? useStore.getState().transactions.find((x) => x.id === recorded)?.type : undefined
  // «Первая запись!» — только если она и правда первая (повтор из Настроек — нет).
  const firstEver = useStore.getState().transactions.length <= 1
  // «Пока доходов нет, он в минусе» — только если их в этом месяце и правда нет.
  const incomeThisMonth = (() => {
    const now = new Date()
    return useStore
      .getState()
      .transactions.some((x) => x.type === 'income' && new Date(x.date).getMonth() === now.getMonth() && new Date(x.date).getFullYear() === now.getFullYear())
  })()
  const compact: Partial<Record<Step, readonly [string, string]>> = {
    plus: [tx.plusTitle, tx.plusText],
    amount: [tx.amountTitle, tx.amountText],
    category: [tx.categoryTitle, tx.categoryText],
    save: [tx.saveTitle, tx.saveText],
  }
  const info: Partial<Record<Step, readonly [string, string, string]>> = {
    balance: [firstEver ? tx.balanceTitle : tx.balanceTitleMore, recordedType === 'income' ? tx.balanceIncome : incomeThisMonth ? tx.balanceWithIncome : tx.balanceExpense, tx.toAnalytics],
    analytics: [tx.analyticsTitle, tx.analyticsText, tx.toRewards],
    rewards: [tx.rewardsTitle, tx.rewardsText, tx.toHome],
  }
  // Не больше двух советов: итог и так последний экран перед работой.
  const tips: Tip[] = tg.isInTelegram ? [[Send, tx.tipBot], [MessageCircle, tx.tipAsk]] : [[Pencil, tx.tipEdit]]
  if (askRemind && reminders) tips.push([Bell, tx.remindText])
  const short = compact[step]
  const long = info[step]

  return (
    <div className={`fixed inset-0 z-[55] ${leaving ? 'tour-out' : ''}`} style={{ pointerEvents: 'none' }} data-swipe-ignore>
      <div ref={safeRef} className="absolute inset-x-0" style={{ top: 'var(--safe-top, 0px)', bottom: 'var(--safe-bottom, 0px)' }} aria-hidden />
      <svg className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <mask id="tour-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {Array.from({ length: MAX_HOLES }, (_, i) => (
              <rect key={i} ref={(n) => { maskRefs.current[i] = n }} width="0" height="0" fill="black" />
            ))}
          </mask>
        </defs>
        <rect className="tour-dim" x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,0.64)" mask="url(#tour-mask)" />
      </svg>
      <div ref={ringRef} className="tour-ring" style={{ display: 'none' }} />

      <div ref={posRef} className="tour-pos">
        <div ref={shellRef}>
          <div
            ref={cardRef}
            data-tour-card
            data-modal={modal ? '' : undefined}
            role="dialog"
            aria-modal={modal ? 'true' : undefined}
            aria-labelledby="tour-title"
            {...UNMASK}
            className={`tour-card rounded-3xl bg-surface-raised ${modal ? 'p-5' : 'px-4 pb-3.5 pt-3'}`}
            style={{ pointerEvents: leaving ? 'none' : 'auto' }}
          >
            <span ref={tailRef} className="tour-tail" aria-hidden />
            {/* Полоска глав — вне сменяемого содержимого: заливка переходит плавно. */}
            {!modal && (
              <>
                {/* Полоска и «Пропустить» — одним рядом, по одной линии. Кнопка
                    высотой 44 px (цель касания), но строку не раздувает: поля −20 px. */}
                <div className="relative z-[1] mb-2.5 flex items-center gap-3">
                  <div className="flex flex-1 gap-1" aria-hidden>
                    {Array.from({ length: CHAPTERS }, (_, i) => (
                      <span
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-colors duration-500 ${i <= def.chapter ? 'bg-brand-500' : 'bg-ink-subtle/[.35]'}`}
                      />
                    ))}
                  </div>
                  <span className="sr-only">{tx.chapter.replace('{n}', String(def.chapter + 1)).replace('{all}', String(CHAPTERS))}</span>
                  {/* «Пропустить» словом, а не крестиком: «×» в приложении закрывает
                      один слой, а здесь уходит всё обучение. */}
                  <button
                    type="button"
                    onClick={exit}
                    aria-label={tx.skipLabel}
                    className="press-soft -my-5 -mr-2 flex h-11 shrink-0 items-center rounded-full px-2.5 text-[13px] font-semibold text-ink-muted"
                  >
                    {tx.skip}
                  </button>
                </div>
              </>
            )}
            {/* Объявляется только сменяемое содержимое: на всём окне диктор на каждом
                шаге заново читал полоску глав и «Пропустить обучение». */}
            <div key={step} className="tour-swap relative" aria-live="polite">
              {step === 'offer' && (
                <>
                  <div id="tour-title" className="text-[22px] font-extrabold leading-tight text-ink">
                    {reason === 'new' ? tx.offerTitle : tx.againTitle}
                  </div>
                  <p className="mt-1.5 text-[15px] leading-snug text-ink-muted">{reason === 'new' ? tx.offerText : tx.againText}</p>
                  <ol className="tour-plan stagger mt-4">
                    {tx.plan.map((label, i) => {
                      const Icon = PLAN_ICONS[i]
                      return (
                        <li key={label} className="flex items-center gap-3">
                          <span className="tour-plan-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-ink-muted">
                            <Icon size={17} strokeWidth={2.4} />
                          </span>
                          <span className="text-[15px] font-semibold leading-snug text-ink">{label}</span>
                        </li>
                      )
                    })}
                  </ol>
                  <div className="mt-5 flex flex-col gap-1.5">
                    <button type="button" onClick={start} className="press-soft w-full rounded-full bg-brand-500 py-3.5 text-base font-bold text-white">
                      {tx.start}
                    </button>
                    <button type="button" onClick={exit} className="press-soft w-full rounded-full py-3 text-sm font-semibold text-ink-muted">
                      {tx.decline}
                    </button>
                  </div>
                </>
              )}

              {short && (
                <>
                  <div id="tour-title" className="text-[17px] font-extrabold leading-tight text-ink">
                    {short[0]}
                  </div>
                  <p className="mt-0.5 text-[14px] leading-snug text-ink-muted">{short[1]}</p>
                </>
              )}

              {long && (
                <>
                  <div id="tour-title" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[17px] font-extrabold leading-tight text-ink">
                    {long[0]}
                    {/* Опыт — нейтральной плашкой: зелёный здесь уже у кольца,
                        полоски глав и действия, четвёртый акцент — лишний. */}
                    {step === 'balance' && (
                      <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[12px] font-extrabold text-ink-muted">+{XP_PER_TRANSACTION} XP</span>
                    )}
                  </div>
                  <p className="mt-1 text-[14px] leading-snug text-ink-muted">{long[1]}</p>
                  {/* Что нажать дальше — кольцо уже на этой вкладке. Строка выглядит
                      как ссылка — пусть и работает как она: открывает ту же вкладку. */}
                  <button
                    type="button"
                    onClick={() => {
                      const tab = NEXT_TAB[step]
                      if (!tab) return
                      hapticTap()
                      press(tab)
                    }}
                    className="press-soft -mx-1 mt-1.5 flex min-h-[40px] items-center gap-2 rounded-full px-1 text-left text-[14px] font-bold text-brand-700 dark:text-brand-300"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/[.14]">
                      <ArrowDown size={14} strokeWidth={2.6} />
                    </span>
                    {long[2]}
                  </button>
                </>
              )}

              {step === 'done' && (
                <>
                  <div className="flex items-center gap-3">
                    <span ref={badgeRef} className="tour-check flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white">
                      <Check size={22} strokeWidth={3} />
                    </span>
                    <div id="tour-title" className="text-[22px] font-extrabold leading-tight text-ink">
                      {tx.doneTitle}
                    </div>
                  </div>
                  <p className="mt-2.5 text-[15px] leading-snug text-ink-muted">{tx.doneText}</p>
                  <ul className="stagger mt-3.5 space-y-2.5">
                    {tips.map(([Icon, text]) => (
                      <li key={text} className="flex items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-ink-muted">
                          <Icon size={15} strokeWidth={2.4} />
                        </span>
                        <span className="text-[14px] leading-snug text-ink">{text}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-5 flex flex-col gap-1.5">
                    {askRemind && reminders ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void finish(true)}
                          disabled={waiting}
                          aria-busy={waiting || undefined}
                          className="press-soft flex w-full items-center justify-center gap-2 rounded-full bg-brand-500 py-3.5 text-base font-bold text-white disabled:opacity-80"
                        >
                          {waiting && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />}
                          {tx.remindOn}
                        </button>
                        <button
                          type="button"
                          onClick={() => void finish(false)}
                          disabled={waiting}
                          className="press-soft w-full rounded-full py-3 text-sm font-semibold text-ink-muted"
                        >
                          {tx.remindOff}
                        </button>
                      </>
                    ) : (
                      <button type="button" onClick={() => void finish(false)} className="press-soft w-full rounded-full bg-brand-500 py-3.5 text-base font-bold text-white">
                        {tx.finish}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
