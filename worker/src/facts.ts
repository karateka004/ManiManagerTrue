/**
 * Выжимка по деньгам для ответов на вопросы (ИИ 2.0).
 *
 * Модель пишет текст, а все ЧИСЛА — отсюда. Арифметику ей не доверяем: она
 * охотно напишет правдоподобный процент, которого нет в данных, а это уже не
 * оговорка, а выдуманный факт о чужих деньгах. Поэтому всё, что может
 * понадобиться в ответе, посчитано заранее — разницы, доли, средние, темп и
 * прогноз, — и лежит здесь уже отформатированным, ровно как пишет приложение.
 *
 * Каждое число, попавшее в выжимку, запоминается (`numbers`, `percents`):
 * ответ модели потом сверяется с этим списком, и строка с суммой, которой здесь
 * нет, до человека не доходит (см. answer.ts → ground).
 *
 * ЧТО УХОДИТ В GOOGLE: только итоги — по дням, неделям, месяцам, категориям и
 * дням недели, бюджет, лимиты и цели. Отдельные операции (сумма + дата +
 * заметка) не уходят. Тексты для человека (гайд, «О приложении», бот) обязаны
 * говорить то же самое.
 */
import type { UserContext } from './context'
import { allowance, mskDay, todayHint } from './context'
import { formatMoney } from './money'

export type Lang = 'ru' | 'en'

export interface Facts {
  text: string
  /** Денежные суммы из выжимки (целые, в основной валюте). */
  numbers: Set<number>
  /** Проценты из выжимки. */
  percents: Set<number>
}

const MONTHS_RU = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']
const MONTHS_GEN_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const WEEKDAYS_SHORT_RU = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']
const DAY_MS = 86_400_000

/** Английские названия встроенных категорий — для ответов по-английски. */
export const CATEGORY_EN: Record<string, string> = {
  salary: 'Salary', freelance: 'Freelance', gift_in: 'Gift', other_in: 'Other',
  food: 'Groceries', cafe: 'Cafe', transport: 'Transport', car: 'Car', home: 'Housing', health: 'Health',
  clothes: 'Clothes', fun: 'Fun', gift: 'Gifts', sport: 'Sport', phone: 'Mobile', other: 'Other',
}

function dateOf(day: number): Date {
  return new Date(day * DAY_MS)
}

/** «3 октября» по номеру суток. */
function dayText(day: number): string {
  const d = dateOf(day)
  return `${d.getUTCDate()} ${MONTHS_GEN_RU[d.getUTCMonth()]}`
}

/**
 * Округление суммы для текста: до копеек, пока сумма меньше сотни (у евро и
 * долларов «3,50 €» иначе становилось «4 €», и бот спорил сам с собой), дальше —
 * до целых: «939,23 ₴» в среднем за день — шум.
 */
export function roundMoney(n: number): number {
  return Math.abs(n) < 100 ? Math.round(n * 100) / 100 : Math.round(n)
}

/** «1 день», «3 дня», «5 дней». */
export function plural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100
  const b = a % 10
  const form = a > 10 && a < 20 ? forms[2] : b === 1 ? forms[0] : b >= 2 && b <= 4 ? forms[1] : forms[2]
  return `${n} ${form}`
}
const DAYS: [string, string, string] = ['день', 'дня', 'дней']

export function buildFacts(ctx: UserContext, nowMs: number, lang: Lang = 'ru'): Facts {
  const numbers = new Set<number>()
  const percents = new Set<number>()
  const cur = ctx.currency

  /** Сумма в выжимку: округлённая, отформатированная и запомненная. */
  const m = (n: number): string => {
    const v = roundMoney(n)
    numbers.add(Math.abs(Math.round(v)))
    return formatMoney(v, cur)
  }
  /** Процент в выжимку. */
  const p = (n: number): string => {
    const v = Math.round(n)
    percents.add(Math.abs(v))
    return `${v}%`
  }
  const names = new Map(ctx.categories.map((c) => [c.id, c.name]))
  const cat = (id: string): string => `«${(lang === 'en' && CATEGORY_EN[id]) || names.get(id) || id}»`

  if (ctx.opsAny === 0 && ctx.pending === 0 && !ctx.goals.length && !(ctx.monthlyBudget > 0)) {
    return {
      text: 'ДАННЫХ НЕТ: записей пока нет ни одной. Числа называть нельзя — их нет; предложи записать первую трату.',
      numbers,
      percents,
    }
  }

  const today = mskDay(nowMs)
  const { date, weekday } = todayHint(nowMs)
  const monthIdx = dateOf(today).getUTCMonth()
  const month = MONTHS_RU[monthIdx]
  const prevMonth = MONTHS_RU[(monthIdx + 11) % 12]
  const prevMonthGen = MONTHS_GEN_RU[(monthIdx + 11) % 12]
  const daysInMonth = ctx.daysPassed + ctx.daysLeft - 1
  const L: string[] = []

  L.push(
    cur
      ? `ДЕНЬГИ ЧЕЛОВЕКА. Сегодня ${date} (${weekday}). Валюта: ${cur}.`
      : `ДЕНЬГИ ЧЕЛОВЕКА. Сегодня ${date} (${weekday}). Валюта неизвестна — суммы пиши без знака валюты и не придумывай его.`,
  )
  if (ctx.firstDay !== null) L.push(`Учёт ведётся с ${dayText(ctx.firstDay)} ${dateOf(ctx.firstDay).getUTCFullYear()} года; всего операций: ${ctx.ops}.`)
  L.push('Все суммы уже посчитаны — копируй их как есть, вместе со значком валюты.')

  /* ---------- Сегодня и неделя ---------- */
  L.push('')
  L.push('СЕГОДНЯ И НЕДЕЛЯ')
  const todayCats = ctx.todayByCategory.slice(0, 6).map((c) => `${cat(c.id)} ${m(c.sum)}`).join(', ')
  L.push(`- сегодня расходы ${m(ctx.spentToday)}${todayCats ? ` — ${todayCats}` : ' (записей о тратах нет)'}`)
  L.push(`- вчера расходы ${m(ctx.spentYesterday)}`)
  L.push(`- эта неделя (с понедельника по сегодня): ${m(ctx.spentThisWeek)}; прошлая неделя целиком: ${m(ctx.spentLastWeek)}`)
  L.push(`- последние 7 дней: ${m(ctx.spentWeek)}`)

  /* ---------- Месяц ---------- */
  L.push('')
  L.push(`ЭТОТ МЕСЯЦ — ${month} (прошло ${ctx.daysPassed} из ${daysInMonth} ${daysInMonth % 10 === 1 && daysInMonth !== 11 ? 'дня' : 'дней'})`)
  if (ctx.trackedDays < ctx.daysPassed) L.push(`- учёт в этом месяце ведётся ${plural(ctx.trackedDays, DAYS)} (с ${ctx.daysPassed - ctx.trackedDays + 1}-го числа)`)
  // Сравнивать с прошлым месяцем честно, только если учёт покрывает его с 1-го.
  const cmp = (a: number, b: number) => (ctx.prevComparable ? compare(a, b, ctx.daysPassed, prevMonthGen, m, p) : '')
  L.push(`- расходы ${m(ctx.spentMonth)}${cmp(ctx.spentMonth, ctx.spentPrevSameDays)}`)
  L.push(`- доходы ${m(ctx.incomeMonth)}${cmp(ctx.incomeMonth, ctx.incomePrevSameDays)}`)
  if (ctx.incomeMonth > 0) {
    const left = ctx.incomeMonth - ctx.spentMonth
    L.push(
      left >= 0
        ? `- доходы минус расходы за месяц: остаётся ${m(left)} (${p((left / ctx.incomeMonth) * 100)} дохода)`
        : `- расходы превысили доходы месяца на ${m(-left)}`,
    )
  }
  if (ctx.trackedDays >= 1 && ctx.spentMonth > 0) {
    // Делим на дни учёта, а не на число месяца: у начавшего 13-го это 1 день.
    const perDay = ctx.spentMonth / ctx.trackedDays
    L.push(`- в среднем в день ${m(perDay)}`)
    if (ctx.trackedDays >= 3 && ctx.daysLeft > 1) {
      L.push(`- прогноз расходов на весь ${month} при таком темпе: ${m(ctx.spentMonth + perDay * (ctx.daysLeft - 1))}`)
    }
  }
  if (ctx.peakDay) {
    const top = ctx.peakDay.topCategory ? `, больше всего — ${cat(ctx.peakDay.topCategory)}` : ''
    L.push(`- самый затратный день: ${dayText(ctx.peakDay.day)} — ${m(ctx.peakDay.sum)}${top}`)
  }
  if (ctx.activeDays) L.push(`- дней с записанными тратами: ${ctx.activeDays}`)
  if (ctx.byCategory.length) {
    const total = ctx.spentMonth || 1
    L.push(
      `- расходы по категориям: ` +
        ctx.byCategory.slice(0, 10).map((c) => `${cat(c.id)} ${m(c.sum)} (${p((c.sum / total) * 100)})`).join(', '),
    )
  }
  if (ctx.incomeByCategory.length) {
    L.push(`- доходы по источникам: ` + ctx.incomeByCategory.slice(0, 6).map((c) => `${cat(c.id)} ${m(c.sum)}`).join(', '))
  }
  const movers = ctx.prevComparable ? topMovers(ctx, cat, m, p) : ''
  if (movers) L.push(`- сильнее всего изменилось к тем же ${plural(ctx.daysPassed, ['дню', 'дням', 'дням'])} прошлого месяца: ${movers}`)
  const unusual = unusualCategories(ctx, cat, m)
  if (unusual) L.push(`- ${unusual}`)
  for (const o of ctx.otherCurrencies) {
    L.push(
      `- в другой валюте (${o.code}) в этом месяце: расходы ${formatMoney(Math.round(o.spent), o.code)}, доходы ${formatMoney(Math.round(o.income), o.code)} — с основной не складывается, курсов нет`,
    )
    numbers.add(Math.round(o.spent))
    numbers.add(Math.round(o.income))
  }

  /* ---------- Бюджет ---------- */
  L.push('')
  L.push('БЮДЖЕТ')
  const left = allowance(ctx)
  if (left && ctx.monthlyBudget > 0) {
    const used = ctx.spentMonth / ctx.monthlyBudget
    const rest = ctx.monthlyBudget - ctx.spentMonth
    L.push(`- бюджет на ${month}: ${m(ctx.monthlyBudget)}; потрачено ${m(ctx.spentMonth)} (${p(used * 100)})`)
    L.push(
      rest >= 0
        ? `- до конца месяца осталось ${m(rest)} на ${ctx.daysLeft} дн. (включая сегодня); дневной лимит ${m(left.perDay)}`
        : `- бюджет месяца ПРЕВЫШЕН на ${m(-rest)}`,
    )
    L.push(
      left.leftToday >= 0
        ? `- на сегодня осталось ${m(left.leftToday)} из ${m(left.perDay)}`
        : `- сегодня ПЕРЕРАСХОД на ${m(-left.leftToday)} сверх дневного лимита ${m(left.perDay)}`,
    )
    if (ctx.trackedDays >= 3 && ctx.daysLeft > 1 && ctx.spentMonth > 0) {
      const forecast = ctx.spentMonth + (ctx.spentMonth / ctx.trackedDays) * (ctx.daysLeft - 1)
      const diff = ctx.monthlyBudget - forecast
      L.push(
        diff >= 0
          ? `- при нынешнем темпе к концу месяца уйдёт ${m(forecast)} — в рамках бюджета, запас ${m(diff)}`
          : `- при нынешнем темпе к концу месяца уйдёт ${m(forecast)} — это больше бюджета на ${m(-diff)}`,
      )
    }
  } else {
    L.push('- месячный бюджет не задан (задаётся в приложении: Профиль → Планирование → Бюджет)')
  }
  if (ctx.limits.length) {
    L.push(
      '- лимиты по категориям: ' +
        ctx.limits
          .map((l) =>
            l.spent > l.limit
              ? `${cat(l.id)} ${m(l.spent)} из ${m(l.limit)} — ПРЕВЫШЕН на ${m(l.spent - l.limit)}`
              : `${cat(l.id)} ${m(l.spent)} из ${m(l.limit)} (${p((l.spent / l.limit) * 100)}), осталось ${m(l.limit - l.spent)}`,
          )
          .join('; '),
    )
  }

  /* ---------- Прошлый месяц и история ---------- */
  if (ctx.spentPrevMonth > 0 || ctx.incomePrevMonth > 0) {
    L.push('')
    L.push(ctx.prevFrom ? `ПРОШЛЫЙ МЕСЯЦ — ${prevMonth}, учёт с ${ctx.prevFrom}-го (не полный месяц)` : `ПРОШЛЫЙ МЕСЯЦ — ${prevMonth}, целиком`)
    L.push(`- расходы ${m(ctx.spentPrevMonth)}, доходы ${m(ctx.incomePrevMonth)}`)
    if (ctx.incomePrevMonth > 0) {
      const saved = ctx.incomePrevMonth - ctx.spentPrevMonth
      L.push(
        saved >= 0
          ? `- отложено ${m(saved)} (${p((saved / ctx.incomePrevMonth) * 100)} дохода)`
          : `- расходы превысили доходы на ${m(-saved)}`,
      )
    }
    if (ctx.prevFullByCategory.length) {
      L.push(`- по категориям: ` + ctx.prevFullByCategory.slice(0, 8).map((c) => `${cat(c.id)} ${m(c.sum)}`).join(', '))
    }
  }
  const history = ctx.months.filter((r) => r.spent > 0 || r.income > 0)
  /** Средний остаток (доходы − расходы) за полный месяц — для целей. null — не посчитать. */
  let avgSaving: number | null = null
  if (history.length > 1) {
    L.push('')
    L.push('ПО МЕСЯЦАМ (расходы / доходы)')
    // Месяц первой записи (если начал не первого числа) и текущий — неполные:
    // в средний месяц их не берём, иначе «обычный месяц» занижен.
    const first = ctx.firstDay !== null ? dateOf(ctx.firstDay) : null
    const firstKey = first && first.getUTCDate() > 1 ? `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, '0')}` : ''
    const currentKey = `${dateOf(today).getUTCFullYear()}-${String(monthIdx + 1).padStart(2, '0')}`
    for (const r of history) {
      const [yy, mm] = r.key.split('-').map(Number)
      const partial =
        r.key === currentKey ? ', неполный' : r.key === firstKey && first ? `, учёт с ${first.getUTCDate()}-го` : ''
      L.push(`- ${MONTHS_RU[mm - 1]} ${yy}${partial}: ${m(r.spent)} / ${m(r.income)}`)
    }
    const full = history.filter((r) => r.key !== currentKey && r.key !== firstKey)
    if (full.length >= 2) {
      const avg = full.reduce((s, r) => s + r.spent, 0) / full.length
      L.push(`- средний расход за полный месяц: ${m(avg)} (по ${full.length} мес.)`)
    }
    // Остаток считаем только по месяцам, где записан доход: без доходов «остаток»
    // был бы просто минусом расходов, а человек, может, доходы и не ведёт.
    const withIncome = full.filter((r) => r.income > 0)
    if (withIncome.length >= 1) {
      avgSaving = withIncome.reduce((s, r) => s + r.income - r.spent, 0) / withIncome.length
      L.push(
        avgSaving >= 0
          ? `- в среднем за полный месяц остаётся ${m(avgSaving)} (доходы минус расходы, по ${withIncome.length} мес.)`
          : `- в среднем за полный месяц расходы больше доходов на ${m(-avgSaving)} (по ${withIncome.length} мес.)`,
      )
    }
    L.push(`- с начала года: расходы ${m(ctx.spentYear)}, доходы ${m(ctx.incomeYear)}`)
  }
  if (ctx.avgMonths > 0 && ctx.avgByCategory.length) {
    L.push(
      `- обычный месяц по категориям (среднее за ${ctx.avgMonths} мес.): ` +
        ctx.avgByCategory.slice(0, 8).map((c) => `${cat(c.id)} ${m(c.sum)}`).join(', '),
    )
  }
  if (ctx.weekdayWeeks >= 2 && ctx.weekdayAvg.length === 7) {
    const maxIdx = ctx.weekdayAvg.indexOf(Math.max(...ctx.weekdayAvg))
    L.push(
      `- средний расход по дням недели (за ${ctx.weekdayWeeks} нед.): ` +
        ctx.weekdayAvg.map((v, i) => `${WEEKDAYS_SHORT_RU[i]} ${m(v)}`).join(', ') +
        `; больше всего — ${WEEKDAYS_SHORT_RU[maxIdx]}`,
    )
  }

  /* ---------- Цели и баланс ---------- */
  L.push('')
  L.push('ЦЕЛИ И БАЛАНС')
  // formatMoney печатает модуль числа: минус баланса без явной формулировки
  // модель увидела бы плюсом и сказала «у тебя 12 800», когда это перерасход.
  if (ctx.balance >= 0) L.push(`- доходы минус расходы за всё время: ${m(ctx.balance)}`)
  else L.push(`- за всё время расходы больше доходов на ${m(-ctx.balance)}`)
  if (!ctx.hasIncome) L.push('- доходы не записаны — это просто сумма трат, а не деньги на руках')
  if (ctx.goals.length) {
    for (const g of ctx.goals) {
      const gm = (n: number) => {
        numbers.add(Math.round(n))
        return formatMoney(roundMoney(n), g.currency ?? cur)
      }
      const done = g.saved >= g.target
      L.push(
        `- цель «${g.title}»: накоплено ${gm(g.saved)} из ${gm(g.target)} (${p((g.saved / g.target) * 100)})` +
          (done ? ' — цель достигнута' : `, осталось ${gm(g.target - g.saved)}`),
      )
      if (done) continue
      // «Сколько откладывать» и «когда накоплю» — самые частые вопросы про цель,
      // а делить модели мы не доверяем: считаем сами.
      const rest = g.target - g.saved
      L.push(`  чтобы успеть за 3 / 6 / 12 мес., откладывать в месяц по ${gm(rest / 3)} / ${gm(rest / 6)} / ${gm(rest / 12)}`)
      const sameCurrency = (g.currency ?? cur) === cur
      if (sameCurrency && avgSaving !== null && avgSaving > 0) {
        const months = Math.ceil(rest / avgSaving)
        L.push(
          months <= 120
            ? `  если откладывать весь средний остаток (${m(avgSaving)} в месяц), цель наберётся примерно за ${months} мес.`
            : `  при среднем остатке ${m(avgSaving)} в месяц цель наберётся больше чем за 10 лет`,
        )
      }
    }
  } else {
    L.push('- накопительных целей нет (ставятся в приложении: Профиль → Планирование → Цели)')
  }
  if (ctx.pending > 0) L.push(`- ${plural(ctx.pending, ['запись', 'записи', 'записей'])} из чата ещё не перенесены в приложение (перенесутся при открытии), но в итогах выше уже учтены`)

  return { text: L.join('\n'), numbers, percents }
}

/** «— на 8% больше, чем за те же 13 дней сентября (11 480 ₴)». Первые дни месяца сравнивать не с чем. */
function compare(
  now: number,
  before: number,
  days: number,
  prevMonthGen: string,
  m: (n: number) => string,
  p: (n: number) => string,
): string {
  if (before <= 0 || days < 3) return ''
  const delta = ((now - before) / before) * 100
  const span = plural(days, ['день', 'дня', 'дней'])
  if (Math.round(delta) === 0) return ` — столько же, сколько за те же ${span} ${prevMonthGen} (${m(before)})`
  const word = delta > 0 ? `на ${p(delta)} больше` : `на ${p(-delta)} меньше`
  return ` — ${word}, чем за те же ${span} ${prevMonthGen} (${m(before)}), разница ${m(Math.abs(now - before))}`
}

/** Сколько категорий-движителей показываем. Три — это уже объяснение, а не список. */
const MOVERS = 3

/**
 * Категории, которые сильнее всего изменились к прошлому месяцу. Именно они
 * превращают ответ «расходы упали» в ответ «расходы упали за счёт доставки».
 */
function topMovers(
  ctx: UserContext,
  cat: (id: string) => string,
  m: (n: number) => string,
  p: (n: number) => string,
): string {
  if (ctx.daysPassed < 3 || ctx.prevByCategory.length === 0) return ''
  const before = new Map(ctx.prevByCategory.map((c) => [c.id, c.sum]))
  const after = new Map(ctx.byCategory.map((c) => [c.id, c.sum]))
  const rows: { id: string; delta: number; was: number; now: number }[] = []
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const was = before.get(id) ?? 0
    const nowSum = after.get(id) ?? 0
    if (Math.round(was) === Math.round(nowSum)) continue
    rows.push({ id, delta: nowSum - was, was, now: nowSum })
  }
  return rows
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, MOVERS)
    .map((r) => {
      const sign = r.delta > 0 ? '+' : '−'
      const share = r.was > 0 ? `, ${r.delta > 0 ? '+' : '−'}${p((Math.abs(r.delta) / r.was) * 100)}` : ''
      return `${cat(r.id)} ${sign}${m(Math.abs(r.delta))} (было ${m(r.was)}, стало ${m(r.now)}${share})`
    })
    .join('; ')
}

/**
 * Категории, где за неполный месяц уже потрачено больше, чем обычно уходит за
 * весь месяц. Это то, что человек сам не заметит и о чём стоит сказать.
 */
function unusualCategories(ctx: UserContext, cat: (id: string) => string, m: (n: number) => string): string {
  if (ctx.avgMonths === 0) return ''
  const usual = new Map(ctx.avgByCategory.map((c) => [c.id, c.sum]))
  const over = ctx.byCategory
    .filter((c) => (usual.get(c.id) ?? 0) > 0 && c.sum > (usual.get(c.id) ?? 0) * 1.05)
    .slice(0, 3)
  if (!over.length) return ''
  return (
    'уже больше, чем обычно за ВЕСЬ месяц: ' +
    over.map((c) => `${cat(c.id)} ${m(c.sum)} при обычных ${m(usual.get(c.id) ?? 0)} в месяц`).join('; ')
  )
}
