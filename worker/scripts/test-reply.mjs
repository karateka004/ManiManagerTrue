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
    incomeMonth: 0,
    daysLeft: 20,
    ops: 0,
    balance: 0,
    byCategory: [],
    todayByCategory: [],
    pending: 0,
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

/* ---------- Выделение главного числа в ответе модели ---------- */

const ANSWER_CASES = [
  {
    name: 'сумма с разрядами и значком',
    answer: 'Потрачено сегодня 1 240 ₴, это на 340 ₴ больше, чем вчера.',
    want: 'Потрачено сегодня <b>1 240 ₴</b>, это на 340 ₴ больше, чем вчера.',
  },
  {
    name: 'сумма без разрядов',
    answer: 'На кафе ушло 4200 ₴.',
    want: 'На кафе ушло <b>4200 ₴</b>.',
  },
  {
    name: 'число без валюты тоже выделяется',
    answer: 'Всего записано 412 операции.',
    want: 'Всего записано <b>412</b> операции.',
  },
  {
    name: 'числа нет — текст не трогаем',
    answer: 'Таких данных у меня нет.',
    want: 'Таких данных у меня нет.',
  },
  {
    name: 'разметка модели экранируется, а не исполняется',
    answer: '<b>100 ₴</b> & всё',
    want: '&lt;b&gt;<b>100 ₴</b>&lt;/b&gt; &amp; всё',
  },
]

for (const c of ANSWER_CASES) {
  const got = norm(__test.answerReply(c.answer))
  const want = norm(c.want)
  if (got !== want) {
    failed++
    console.error(`✗ ответ модели: ${c.name}\n  ждали:  ${want}\n  получили: ${got}`)
  }
}

if (failed) {
  console.error(`test-reply: ${failed} проверок не прошли`)
  process.exit(1)
}
console.log(
  `test-reply: ${CASES.length} ответов, ${BAR_CASES.length} полос, ${TODAY_CASES.length} сводок, ${ANSWER_CASES.length} ответов модели — всё как ожидалось`,
)
