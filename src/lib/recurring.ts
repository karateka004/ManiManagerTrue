/**
 * Регулярные платежи — аренда, связь, подписки: одна и та же сумма в одной
 * категории примерно раз в месяц. Отдельным модулем от разбора Аналитики
 * (lib/overview): их показывает и Главная (напоминание «пора записать»), а
 * весь разбор нужен только вкладке Аналитики — пусть едет в её чанке.
 */
import type { Transaction } from '../store/transactions'
import type { Category } from '../store/categories'
import type { Currency } from './currencies'
import { DAY_MS, daysBetween, localDayKey, parseDay } from './day'

/** Столько раз подряд — уже не совпадение. */
const RECUR_MIN_TIMES = 3
/** Сколько промежутков вправе выбиваться из месячного ритма. */
const RECUR_MAX_OUTLIERS = 1
/** Разрыв между списаниями, дней: «раз в месяц» с запасом на плавающую дату. */
const RECUR_MIN_GAP = 25
const RECUR_MAX_GAP = 36
/** Платёж «одним числом», если число месяца гуляет не больше чем на столько. */
const RECUR_DOM_DRIFT = 2
/**
 * В частой категории (еда, кафе — десятки трат в месяц) одинаковые суммы раз в
 * месяц случаются сами собой: «Продукты 550 ₽» трижды — не подписка. Там
 * повтор засчитываем, только если его и называют одинаково.
 */
const RECUR_BUSY_PER_MONTH = 6
const RECUR_NOTE_SHARE = 0.6
/**
 * Запас сверх обычного промежутка. Если списания нет дольше — платёж, видимо,
 * закончился (отписались, съехали), и в панели ему не место. Считаем от самого
 * промежутка, а не фиксированным числом дней: у платежа раз в месяц и у платежа
 * раз в пять недель терпение должно быть разным.
 */
const RECUR_GRACE_DAYS = 12
/** Глубина поиска регулярных платежей. */
const RECUR_WINDOW_DAYS = 400
/**
 * Новая цена того же платежа: аренду подняли с 30 000 до 32 000. Запись в той
 * же категории не раньше чем за столько дней до срока и в пределах этой доли
 * от прежней суммы — это и есть очередной платёж, а не «просрочка» плюс
 * «разовая покупка 32 000».
 */
const RECUR_REPRICE_EARLY_DAYS = 3
const RECUR_REPRICE_SHARE = 0.25

/** Повторяющийся платёж: одинаковая сумма в одной категории примерно раз в месяц. */
export interface Recurring {
  id: string
  categoryId: string
  name: string
  color: string
  icon: string
  /**
   * Как назвать строку. Самая частая заметка группы, иначе название категории:
   * «Аренда» и «Бензин» узнаются, а две строки «Машина» подряд читаются как
   * дубликат, хотя это разные платежи.
   */
  title: string
  amount: number
  /**
   * Все ключи (recurringKey), под которыми платёж записывался: прежняя цена и
   * новая. По ним Аналитика узнаёт в записи регулярный платёж.
   */
  keys: string[]
  currency: Currency
  /** Сколько раз уже списывалось. */
  times: number
  /**
   * Когда списание ожидается. Вперёд НЕ прокручиваем: если дата уже прошла,
   * значит очередной платёж просто ещё не записан — на этом и держится
   * подсказка «пора записать».
   */
  nextDay: number
  /** Срок подошёл, а записи нет. */
  due: boolean
}

/** Ключ регулярного платежа: категория и сумма в копейках. */
export const recurringKey = (categoryId: string, amount: number) => categoryId + '|' + Math.round(amount * 100)

const capitalize = (v: string) => v.charAt(0).toUpperCase() + v.slice(1)

/** То же число в следующем месяце; в коротком месяце — его последний день. */
function sameDayNextMonth(key: number): Date {
  const next = new Date(key)
  const dom = next.getDate()
  next.setDate(1)
  next.setMonth(next.getMonth() + 1)
  next.setDate(Math.min(dom, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()))
  return next
}

/** Число месяца и разница между двумя числами по кругу (31 → 2 — это 2 дня). */
const domOf = (key: number) => new Date(key).getDate()
const domDrift = (a: number, b: number) => {
  const d = Math.abs(domOf(a) - domOf(b))
  return Math.min(d, 31 - d)
}

/**
 * Все регулярные платежи: одна и та же сумма в одной категории, три и больше
 * раз, примерно раз в месяц и примерно одним числом, последний раз — недавно.
 *
 * Совпадение суммы требуется ТОЧНОЕ. «Примерно столько же» ловило бы обычные
 * продукты, а подписка, аренда и связь списывают ровно одну и ту же цифру —
 * именно это и делает их узнаваемыми в ручных записях, без банка. В частых
 * категориях (еда, кафе) одинаковые суммы совпадают сами — там нужна ещё и
 * одинаковая заметка.
 *
 * Отсортированы по сумме убыв.: сверху то, что стоит дороже всего.
 */
export function buildRecurring(
  history: Transaction[],
  now: number,
  byId: Map<string, Category>,
  fallbackCurrency: Currency,
): Recurring[] {
  const since = now - RECUR_WINDOW_DAYS * DAY_MS
  const groups = new Map<string, { days: number[]; notes: Map<string, number>; spelled: Map<string, string>; currency: Currency }>()
  const perCategory = new Map<string, number>()
  // Траты по категориям — искать новую цену платежа (RECUR_REPRICE_*).
  const byCategory = new Map<string, { at: number; amount: number; note: string }[]>()
  let first = Infinity

  for (const t of history) {
    if (t.type !== 'expense') continue
    const at = parseDay(t.date)
    if (!Number.isFinite(at) || at < since) continue
    if (at < first) first = at
    perCategory.set(t.categoryId, (perCategory.get(t.categoryId) ?? 0) + 1)
    let list = byCategory.get(t.categoryId)
    if (!list) byCategory.set(t.categoryId, (list = []))
    list.push({ at, amount: t.amount, note: t.note?.trim().toLowerCase() ?? '' })
    const key = recurringKey(t.categoryId, t.amount)
    let g = groups.get(key)
    if (!g) {
      g = { days: [], notes: new Map(), spelled: new Map(), currency: t.currency ?? fallbackCurrency }
      groups.set(key, g)
    }
    g.days.push(at)
    const spelled = t.note?.trim()
    const note = spelled?.toLowerCase()
    if (spelled && note) {
      g.notes.set(note, (g.notes.get(note) ?? 0) + 1)
      // Как человек это пишет — «Яндекс Плюс», а не «Яндекс плюс».
      if (!g.spelled.has(note)) g.spelled.set(note, spelled)
    }
  }

  const todayKey = localDayKey(now)
  const months = first === Infinity ? 1 : Math.max(1, daysBetween(first, todayKey) / 30.4)
  const out: Recurring[] = []

  for (const [key, group] of groups) {
    const rawDays = group.days
    if (rawDays.length < RECUR_MIN_TIMES) continue
    const days = [...new Set(rawDays)].sort((a, b) => a - b)
    if (days.length < RECUR_MIN_TIMES) continue
    const last = days[days.length - 1]

    // Один промежуток может выпасть из месячного ритма — люди записывают
    // задним числом и с опозданием. Требовать идеального ряда нельзя: тогда
    // запись платежа, просроченного на полтора месяца, ломала бы группу и
    // платёж исчезал бы из панели сразу после того, как его внесли.
    let inRange = 0
    let outliers = 0
    let total = 0
    let fixedDay = true
    for (let i = 1; i < days.length; i++) {
      const step = daysBetween(days[i - 1], days[i])
      if (step < RECUR_MIN_GAP || step > RECUR_MAX_GAP) {
        outliers += 1
        continue
      }
      inRange += 1
      total += step
      if (domDrift(days[i - 1], days[i]) > RECUR_DOM_DRIFT) fixedDay = false
    }
    if (inRange < RECUR_MIN_TIMES - 1 || outliers > RECUR_MAX_OUTLIERS) continue

    const gap = Math.round(total / inRange)
    if (daysBetween(last, todayKey) > gap + RECUR_GRACE_DAYS) continue

    const sep = key.lastIndexOf('|')
    const categoryId = key.slice(0, sep)

    // Самая частая заметка группы; при равенстве — первая встреченная.
    let title = ''
    let best = 0
    for (const [note, count] of group.notes) {
      if (count > best) {
        best = count
        title = note
      }
    }
    const busy = (perCategory.get(categoryId) ?? 0) / months >= RECUR_BUSY_PER_MONTH
    if (busy && best / rawDays.length < RECUR_NOTE_SHARE) continue

    // Платёж одним числом (аренда — пятого) ждём в то же число следующего
    // месяца, а не через «средние 30,7 дня» — те давали шестое. Платёж раз в
    // четыре недели гуляет по месяцу — его ждём через свой промежуток.
    const c = byId.get(categoryId)
    const nextAfter = (day: number) => {
      if (fixedDay && gap >= 28) return sameDayNextMonth(day)
      const next = new Date(day)
      next.setDate(next.getDate() + gap)
      return next
    }
    let amount = Number(key.slice(sep + 1)) / 100
    const keys = [key]
    let next = nextAfter(last)

    // Платёж подорожал (подешевел): после последнего списания по старой цене,
    // не раньше чем за три дня до срока, в той же категории записана сумма в
    // пределах четверти от прежней. Это очередной платёж — по новой цене: срок
    // сдвигается от него, а запись не считается ни просрочкой, ни разовой
    // покупкой. В частой категории — только с той же заметкой.
    const from = +next - RECUR_REPRICE_EARLY_DAYS * DAY_MS
    let repriced: { at: number; amount: number } | null = null
    for (const x of byCategory.get(categoryId) ?? []) {
      if (x.at <= last || x.at < from || x.amount === amount) continue
      if (Math.abs(x.amount - amount) > amount * RECUR_REPRICE_SHARE) continue
      if (busy && x.note !== title) continue
      if (!repriced || x.at > repriced.at) repriced = x
    }
    if (repriced) {
      amount = repriced.amount
      keys.push(recurringKey(categoryId, repriced.amount))
      next = nextAfter(repriced.at)
    }

    out.push({
      id: key,
      categoryId,
      title: title ? capitalize(group.spelled.get(title) ?? title) : '',
      name: c?.name ?? categoryId,
      color: c?.color ?? '#8A968F',
      icon: c?.icon ?? 'other',
      amount,
      keys,
      currency: group.currency,
      times: days.length + (repriced ? 1 : 0),
      nextDay: +next,
      due: +next <= todayKey,
    })
  }

  // Все: панели сами решают, сколько строк показать, а расчётам (прогноз,
  // «разовые покупки») нужен каждый платёж, а не первые шесть.
  return out.sort((a, b) => b.amount - a.amount)
}
