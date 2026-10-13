/**
 * Прогон ответов бота.
 *
 * Ответ собирается из нескольких веток (бюджет задан / не задан / перебор /
 * доход / категорию не узнали / несколько операций / запись задним числом), и
 * все они — текст, который увидит человек. Сети для проверки не нужно: и
 * сборка ответа, и выжимка по пользователю — чистые функции.
 *
 * Запуск: `node --import ./scripts/ts-resolve.mjs scripts/test-reply.mjs`
 */
import { __test } from '../src/bot.ts'

const { recordReply } = __test

/** 11 сентября 2026, 12:00 МСК. */
const NOW = Date.parse('2026-09-11T09:00:00.000Z')

/** Пробелы в суммах неразрывные и узкие — для сравнения приводим к обычным. */
const norm = (s) => s.replace(/[\u00a0\u202f\u2009]/g, ' ')

function ctx(over = {}) {
  return {
    hasBlob: true,
    currency: 'UAH',
    monthlyBudget: 0,
    categories: [
      { id: 'cafe', name: 'Кафе', kind: 'expense' },
      { id: 'food', name: 'Еда', kind: 'expense' },
      { id: 'clothes', name: 'Одежда', kind: 'expense' },
      { id: 'other', name: 'Прочее', kind: 'expense' },
      { id: 'salary', name: 'Зарплата', kind: 'income' },
      { id: 'c_kot', name: 'Кот', kind: 'expense' },
    ],
    spentToday: 0,
    spentYesterday: 0,
    spentWeek: 0,
    spentMonth: 0,
    spentPrevMonth: 0,
    spentPrevSameDays: 0,
    incomeMonth: 0,
    incomePrevMonth: 0,
    incomePrevSameDays: 0,
    daysLeft: 20,
    ops: 0,
    balance: 0,
    byCategory: [],
    todayByCategory: [],
    prevByCategory: [],
    daysPassed: 11,
    pending: 0,
    months: [],
    prevFullByCategory: [],
    avgByCategory: [],
    avgMonths: 0,
    incomeByCategory: [],
    spentThisWeek: 0,
    spentLastWeek: 0,
    weekdayAvg: [],
    weekdayWeeks: 0,
    peakDay: null,
    activeDays: 0,
    spentYear: 0,
    incomeYear: 0,
    limits: [],
    goals: [],
    otherCurrencies: [],
    firstDay: null,
    ...over,
  }
}

const op = (over = {}) => ({
  type: 'expense',
  amount: 300,
  categoryId: 'cafe',
  guessed: false,
  ...over,
})

const CASES = [
  {
    name: 'бюджет задан — дневной остаток в цитате',
    ops: [op()],
    ctx: ctx({ monthlyBudget: 18000, spentMonth: 260, spentToday: 260, daysLeft: 20 }),
    want: [
      '<b>Кафе · 300 ₴</b>',
      '<blockquote><code>███░░░░░░░</code>  осталось 640 ₴ из 900 ₴</blockquote>',
    ],
  },
  {
    name: 'бюджета нет — расход за сегодня',
    ops: [op()],
    ctx: ctx({ spentToday: 1240 }),
    want: ['<b>Кафе · 300 ₴</b>', '<blockquote>Сегодня потрачено 1 240 ₴</blockquote>'],
  },
  {
    name: 'перебор — честно про перебор, а не «осталось 0»',
    ops: [op()],
    ctx: ctx({ monthlyBudget: 18000, spentMonth: 1140, spentToday: 1140, daysLeft: 20 }),
    want: [
      '<b>Кафе · 300 ₴</b>',
      '<blockquote><code>██████████</code>  перебор на 240 ₴ от 900 ₴</blockquote>',
    ],
  },
  {
    name: 'доход отличается знаком плюс',
    ops: [op({ type: 'income', amount: 50000, categoryId: 'salary' })],
    ctx: ctx({ incomeMonth: 120000, monthlyBudget: 18000 }),
    want: ['<b>Зарплата · +50 000 ₴</b>', '<blockquote>Доходы за сентябрь — 120 000 ₴</blockquote>'],
  },
  {
    name: 'категорию не узнали — оговорка подписью, а не отдельной фразой',
    ops: [op({ categoryId: 'other', guessed: true })],
    ctx: ctx({ spentToday: 300 }),
    want: [
      '<b>Прочее · 300 ₴</b>',
      'категорию не разобрал',
      '<blockquote>Сегодня потрачено 300 ₴</blockquote>',
    ],
  },
  {
    name: 'несколько операций одним сообщением',
    ops: [op({ amount: 3500, categoryId: 'clothes' }), op({ amount: 180 })],
    ctx: ctx({ spentToday: 3680 }),
    want: [
      '<b>Одежда · 3 500 ₴</b>',
      '<b>Кафе · 180 ₴</b>',
      '<blockquote>Сегодня потрачено 3 680 ₴</blockquote>',
    ],
  },
  {
    name: 'запись задним числом — день подписью',
    ops: [op({ amount: 1200, categoryId: 'food', date: '2026-09-10' })],
    ctx: ctx({ spentToday: 0, spentMonth: 1200 }),
    want: ['<b>Еда · 1 200 ₴</b>', 'вчера', '<blockquote>Расходы за сентябрь — 1 200 ₴</blockquote>'],
  },
  {
    name: 'день раньше вчерашнего — числом и месяцем',
    ops: [op({ amount: 600, categoryId: 'food', date: '2026-09-03' })],
    ctx: ctx(),
    want: ['<b>Еда · 600 ₴</b>', '3 сентября', '<blockquote>Расходы за сентябрь — 0 ₴</blockquote>'],
  },
  {
    name: 'заметка уходит в подпись под записью',
    ops: [op({ amount: 450, note: 'до вокзала' })],
    ctx: ctx(),
    want: ['<b>Кафе · 450 ₴</b>', 'до вокзала', '<blockquote>Сегодня потрачено 0 ₴</blockquote>'],
  },
  {
    name: 'день и заметка вместе — через точку',
    ops: [op({ amount: 450, note: 'до вокзала', date: '2026-09-10' })],
    ctx: ctx(),
    want: [
      '<b>Кафе · 450 ₴</b>',
      'вчера · до вокзала',
      '<blockquote>Расходы за сентябрь — 0 ₴</blockquote>',
    ],
  },
  {
    name: 'своя категория человека — своим названием',
    ops: [op({ amount: 800, categoryId: 'c_kot' })],
    ctx: ctx(),
    want: ['<b>Кот · 800 ₴</b>', '<blockquote>Сегодня потрачено 0 ₴</blockquote>'],
  },
  {
    name: 'приложение ни разу не открывали — суммы без символа валюты',
    ops: [op()],
    ctx: ctx({ hasBlob: false, currency: undefined, spentToday: 300 }),
    want: ['<b>Кафе · 300</b>', '<blockquote>Сегодня потрачено 300</blockquote>'],
  },
  {
    name: 'валюта названа в сообщении, хотя основная другая',
    ops: [op({ amount: 12, currency: 'EUR', categoryId: 'food' })],
    ctx: ctx(),
    want: ['<b>Еда · 12 €</b>', '<blockquote>Сегодня потрачено 0 ₴</blockquote>'],
  },
  {
    name: 'опасные символы в заметке экранируются',
    ops: [op({ note: '<b>жирный</b> & кофе' })],
    ctx: ctx(),
    want: [
      '<b>Кафе · 300 ₴</b>',
      '&lt;b&gt;жирный&lt;/b&gt; &amp; кофе',
      '<blockquote>Сегодня потрачено 0 ₴</blockquote>',
    ],
  },
]

let failed = 0
for (const c of CASES) {
  const got = norm(recordReply(c.ops, c.ctx, NOW))
  const want = c.want.join('\n')
  if (got !== want) {
    failed++
    console.error(`✗ ${c.name}\n  ждали:\n${want}\n  получили:\n${got}\n`)
  }
}

/* ---------- Полоса расхода ---------- */

const BAR_CASES = [
  { used: 0, limit: 900, want: '░░░░░░░░░░', name: 'ничего не потрачено — полоса пустая' },
  { used: 20, limit: 900, want: '█░░░░░░░░░', name: 'потрачено чуть-чуть — одна клетка, а не пусто' },
  { used: 450, limit: 900, want: '█████░░░░░', name: 'половина лимита' },
  { used: 900, limit: 900, want: '██████████', name: 'лимит ровно исчерпан' },
  { used: 1400, limit: 900, want: '██████████', name: 'перебор — полоса не вылезает за десять клеток' },
  { used: 300, limit: 0, want: '', name: 'бюджета нет — полосы нет' },
]

for (const c of BAR_CASES) {
  const got = __test.budgetBar(c.used, c.limit)
  if (got !== c.want) {
    failed++
    console.error(`✗ полоса: ${c.name}\n  ждали «${c.want}», получили «${got}»`)
  }
}

/* ---------- Сводка дня ---------- */

const TODAY_CASES = [
  {
    name: 'пусто — предлагаем записать, а не показываем пустую табличку',
    ctx: ctx(),
    want: 'Сегодня записей нет. Напиши, например: кофе 300',
  },
  {
    name: 'одна категория — без итоговой черты',
    ctx: ctx({ spentToday: 300, todayByCategory: [{ id: 'cafe', sum: 300 }] }),
    want: ['<b>Сегодня</b>', '<pre>Кафе   300 ₴</pre>'].join('\n'),
  },
  {
    name: 'несколько категорий — колонки выровнены, снизу итог',
    ctx: ctx({
      spentToday: 1950,
      todayByCategory: [
        { id: 'food', sum: 1200 },
        { id: 'clothes', sum: 450 },
        { id: 'cafe', sum: 300 },
      ],
    }),
    want: [
      '<b>Сегодня</b>',
      '<pre>Еда     1 200 ₴',
      'Одежда    450 ₴',
      'Кафе      300 ₴',
      '───────────────',
      'Итого   1 950 ₴</pre>',
    ].join('\n'),
  },
  {
    name: 'с бюджетом — под табличкой полоса и остаток',
    ctx: ctx({
      monthlyBudget: 18000,
      spentMonth: 260,
      spentToday: 260,
      daysLeft: 20,
      todayByCategory: [{ id: 'cafe', sum: 260 }],
    }),
    want: [
      '<b>Сегодня</b>',
      '<pre>Кафе   260 ₴</pre>',
      '<blockquote><code>███░░░░░░░</code>  осталось 640 ₴ из 900 ₴</blockquote>',
    ].join('\n'),
  },
]

for (const c of TODAY_CASES) {
  const got = norm(__test.todayReply(c.ctx))
  if (got !== c.want) {
    failed++
    console.error(`✗ сводка дня: ${c.name}\n  ждали:\n${c.want}\n  получили:\n${got}\n`)
  }
}

/* ---------- Лимит категории под записью ---------- */

const LIMIT_CASES = [
  {
    name: 'лимит задан — сколько из него ушло, вместе с этой тратой',
    ops: [op({ amount: 300 })],
    ctx: ctx({ spentToday: 300, byCategory: [{ id: 'cafe', sum: 4200 }], limits: [{ id: 'cafe', limit: 5000, spent: 3900 }] }),
    want: [
      '<b>Кафе · 300 ₴</b>',
      '<blockquote>Сегодня потрачено 300 ₴',
      'лимит «Кафе»: 4 200 ₴ из 5 000 ₴</blockquote>',
    ],
  },
  {
    name: 'лимит превышен — так и сказано',
    ops: [op({ amount: 900 })],
    ctx: ctx({ spentToday: 900, byCategory: [{ id: 'cafe', sum: 5300 }], limits: [{ id: 'cafe', limit: 5000, spent: 4400 }] }),
    want: [
      '<b>Кафе · 900 ₴</b>',
      '<blockquote>Сегодня потрачено 900 ₴',
      'лимит «Кафе» превышен на 300 ₴</blockquote>',
    ],
  },
  {
    name: 'трата в другой валюте лимит в основной не трогает',
    ops: [op({ amount: 12, currency: 'EUR' })],
    ctx: ctx({ byCategory: [{ id: 'cafe', sum: 4200 }], limits: [{ id: 'cafe', limit: 5000, spent: 4200 }] }),
    want: ['<b>Кафе · 12 €</b>', '<blockquote>Сегодня потрачено 0 ₴</blockquote>'],
  },
  {
    name: 'запись в прошлый месяц текущий лимит не трогает',
    ops: [op({ amount: 300, date: '2026-08-20' })],
    ctx: ctx({ spentMonth: 1000, byCategory: [{ id: 'cafe', sum: 1000 }], limits: [{ id: 'cafe', limit: 5000, spent: 1000 }] }),
    want: ['<b>Кафе · 300 ₴</b>', '20 августа', '<blockquote>Расходы за сентябрь — 1 000 ₴</blockquote>'],
  },
]

for (const c of LIMIT_CASES) {
  const got = norm(recordReply(c.ops, c.ctx, NOW))
  const want = norm(c.want.join('\n'))
  if (got !== want) {
    failed++
    console.error(`✗ лимит: ${c.name}\n  ждали:\n${want}\n  получили:\n${got}\n`)
  }
}

if (failed) {
  console.error(`test-reply: ${failed} проверок не прошли`)
  process.exit(1)
}
console.log(
  `test-reply: ${CASES.length} ответов, ${BAR_CASES.length} полос, ${TODAY_CASES.length} сводок, ${LIMIT_CASES.length} строк лимита — всё как ожидалось`,
)
