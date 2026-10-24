/**
 * Прогон разбора строки на реальных формулировках.
 *
 * Разбор — чистая функция, сеть ему не нужна, поэтому проверять его дёшево и
 * незачем откладывать до живого бота. Запуск: `node scripts/test-entry.mjs`
 * (Node 24 понимает импорт .ts напрямую).
 *
 * Ожидание пишем только для того, что важно: вид операции, сумма, категория,
 * валюта. Заметку проверяем там, где она и есть смысл примера.
 */
import { parseEntry, parseEntries } from '../src/entry.ts'

/** [строка, ожидание] — ожидание null означает «разобрать не должен». */
const CASES = [
  // Число перед единицей срока или количества — не сумма
  ['абонемент на 3 месяца 2000', { kind: 'expense', amount: 2000 }],
  ['абонемент 3мес 1500', { kind: 'expense', amount: 1500 }],
  ['5 октября кофе 300', { kind: 'expense', amount: 300, categoryId: 'cafe' }],
  ['такси 2 раза по 300', { kind: 'expense', amount: 300, categoryId: 'transport' }],
  ['бензин 40 л 2500', { kind: 'expense', amount: 2500, categoryId: 'car' }],
  ['налог за 2023 год 5000', { kind: 'expense', amount: 5000 }],
  ['ужин на 4 человека 3200', { kind: 'expense', amount: 3200 }],
  ['аренда 30000 месяц', { kind: 'expense', amount: 30000 }],
  ['подписка 300 мес', { kind: 'expense', amount: 300 }],
  ['vpn 50 мес', { kind: 'expense', amount: 50 }],
  ['netflix 15 month', { kind: 'expense', amount: 15 }],
  ['мясо 1,5 кг 900', { kind: 'expense', amount: 900 }],
  ['свадьба 150 человек 300000', { kind: 'expense', amount: 300000 }],
  ['оплата 15 числа 5000', { kind: 'expense', amount: 5000 }],
  ['такси 12 км 450', { kind: 'expense', amount: 450, categoryId: 'transport' }],

  // Обычной фразой: глагол траты и висячие предлоги в заметку не идут, глагол задаёт направление
  ['Ушло 300 на кофе', { kind: 'expense', amount: 300, categoryId: 'cafe', note: undefined }],
  ['Потратила 20 евро на еду', { kind: 'expense', amount: 20, currency: 'EUR', categoryId: 'food', note: undefined }],
  ['Такси до работы за 450', { kind: 'expense', amount: 450, categoryId: 'transport', note: 'до работы' }],
  ['Ушло на ресторан 10 долларов', { kind: 'expense', amount: 10, currency: 'USD', categoryId: 'cafe', note: undefined }],
  ['Сходил в кино за 600', { kind: 'expense', amount: 600, categoryId: 'fun', note: undefined }],
  ['Пришла зарплата 80 000', { kind: 'income', amount: 80000, categoryId: 'salary', note: undefined }],
  ['Я потратил 2000 на подарок для мамы', { kind: 'expense', amount: 2000, categoryId: 'gift', note: 'для мамы' }],
  ['Пришёл счёт за свет 1200', { kind: 'expense', amount: 1200, categoryId: 'home' }],

  // Основное
  ['кофе 300', { kind: 'expense', amount: 300, categoryId: 'cafe' }],
  ['300 кофе', { kind: 'expense', amount: 300, categoryId: 'cafe' }],
  ['Кофе 300', { kind: 'expense', amount: 300, categoryId: 'cafe' }],
  ['-300 такси', { kind: 'expense', amount: 300, categoryId: 'transport' }],
  ['+50000 зарплата', { kind: 'income', amount: 50000, categoryId: 'salary' }],
  ['1 500 продукты', { kind: 'expense', amount: 1500, categoryId: 'food' }],
  ['аптека 340,50', { kind: 'expense', amount: 340.5, categoryId: 'health' }],

  // Заметка и валюта
  ['такси 450 до вокзала', { kind: 'expense', amount: 450, categoryId: 'transport', note: 'до вокзала' }],
  ['обед 12 €', { kind: 'expense', amount: 12, categoryId: 'food', currency: 'EUR' }],
  ['такси 450 грн', { kind: 'expense', amount: 450, categoryId: 'transport', currency: 'UAH' }],
  ['кафе 300₴', { kind: 'expense', amount: 300, categoryId: 'cafe', currency: 'UAH' }],
  ['бензин 2500 руб', { kind: 'expense', amount: 2500, categoryId: 'car', currency: 'RUB' }],
  ['обед 50000 сум', { kind: 'expense', amount: 50000, categoryId: 'food', currency: 'UZS' }],
  ['такси 15 лари', { kind: 'expense', amount: 15, categoryId: 'transport', currency: 'GEL' }],
  ['кофе 1500 драм', { kind: 'expense', amount: 1500, categoryId: 'cafe', currency: 'AMD' }],
  ['ужин 200 шекелей', { kind: 'expense', amount: 200, categoryId: 'food', currency: 'ILS' }],
  ['такси 300 бат', { kind: 'expense', amount: 300, categoryId: 'transport', currency: 'THB' }],
  ['кафе 12₾', { kind: 'expense', amount: 12, categoryId: 'cafe', currency: 'GEL' }],
  ['продукты 150 aed', { kind: 'expense', amount: 150, categoryId: 'food', currency: 'AED' }],
  // Многозначное слово валютой не считаем: «сом» — ещё и рыба
  ['сом 500', { kind: 'expense', amount: 500, categoryId: 'other', guessed: true, currency: undefined }],
  // Английские слова-коды и общие названия («динар» — их восемь) валютой не считаем
  ['gel 300', { kind: 'expense', amount: 300, currency: undefined }],
  ['300 динаров', { kind: 'expense', amount: 300, currency: undefined }],
  ['обед 300 дин', { kind: 'expense', amount: 300, categoryId: 'food', currency: 'RSD' }],

  // Категории по синонимам
  ['зп 120000', { kind: 'income', amount: 120000, categoryId: 'salary' }],
  ['спортзал 800', { kind: 'expense', amount: 800, categoryId: 'sport' }],
  ['нетфликс 199', { kind: 'expense', amount: 199, categoryId: 'fun' }],
  ['подарки 1000', { kind: 'expense', amount: 1000, categoryId: 'gift' }],
  ['подарок 1000', { kind: 'income', amount: 1000, categoryId: 'gift_in' }],
  ['квартира 25000', { kind: 'expense', amount: 25000, categoryId: 'home' }],
  ['зубной 3000', { kind: 'expense', amount: 3000, categoryId: 'health' }],
  ['кроссовки 3500', { kind: 'expense', amount: 3500, categoryId: 'clothes' }],
  ['проезд 60', { kind: 'expense', amount: 60, categoryId: 'transport' }],
  ['связь 250', { kind: 'expense', amount: 250, categoryId: 'phone' }],
  ['кино 600', { kind: 'expense', amount: 600, categoryId: 'fun' }],
  ['ужин 800', { kind: 'expense', amount: 800, categoryId: 'food' }],
  ['пиво 180', { kind: 'expense', amount: 180, categoryId: 'cafe' }],
  ['убер 320', { kind: 'expense', amount: 320, categoryId: 'transport' }],
  ['молоко 89', { kind: 'expense', amount: 89, categoryId: 'food' }],
  ['таблетки 450', { kind: 'expense', amount: 450, categoryId: 'health' }],
  ['йога 1200', { kind: 'expense', amount: 1200, categoryId: 'sport' }],
  ['подписка 500', { kind: 'expense', amount: 500, categoryId: 'fun' }],
  ['мойка 400', { kind: 'expense', amount: 400, categoryId: 'car' }],
  ['коммуналка 3200', { kind: 'expense', amount: 3200, categoryId: 'home' }],
  ['фриланс 15000', { kind: 'income', amount: 15000, categoryId: 'freelance' }],

  // Падежи
  ['продуктов на 1200', { kind: 'expense', amount: 1200, categoryId: 'food' }],
  ['за такси 300', { kind: 'expense', amount: 300, categoryId: 'transport' }],
  ['лекарства 780', { kind: 'expense', amount: 780, categoryId: 'health' }],

  // Категорию не узнали — записываем в «Прочее», но записываем
  ['что-то 500', { kind: 'expense', amount: 500, categoryId: 'other', guessed: true }],
  ['500', { kind: 'expense', amount: 500, categoryId: 'other', guessed: true }],
  ['корм коту 800', { kind: 'expense', amount: 800, categoryId: 'other', guessed: true }],

  // Знак спорит с категорией — верим знаку
  ['+300 такси', { kind: 'income', amount: 300, categoryId: 'other_in', guessed: true }],

  // Разобрать нельзя
  ['привет', null],
  ['кофе', null],
  ['', null],
  ['   ', null],
  ['как дела?', null],
]

let failed = 0
for (const [input, want] of CASES) {
  const got = parseEntry(input)

  if (want === null) {
    if (got.ok) {
      failed++
      console.error(`✗ «${input}» — не должен был разобраться, а получилось ${JSON.stringify(got.entry)}`)
    }
    continue
  }

  if (!got.ok) {
    failed++
    console.error(`✗ «${input}» — не разобралось (${got.reason})`)
    continue
  }

  const diff = []
  for (const [key, expected] of Object.entries(want)) {
    if (got.entry[key] !== expected) diff.push(`${key}: ждали ${expected}, получили ${got.entry[key]}`)
  }
  if (diff.length) {
    failed++
    console.error(`✗ «${input}» — ${diff.join('; ')}`)
  }
}

// Потолок суммы: выше — почти наверняка опечатка.
const tooBig = parseEntry('дом 2000000000')
if (tooBig.ok || tooBig.reason !== 'too_big') {
  failed++
  console.error(`✗ «дом 2000000000» — ждали отказ too_big, получили ${JSON.stringify(tooBig)}`)
}

/* ---------- День словом и несколько трат в одном сообщении ---------- */
// Это примеры из приветствия, справки и напоминаний: без модели они обязаны
// разбираться так же, как с ней.
const MULTI = [
  ['вчера продукты 1200', [{ amount: 1200, categoryId: 'food', daysAgo: 1, note: undefined }]],
  ['позавчера кино 600', [{ amount: 600, categoryId: 'fun', daysAgo: 2 }]],
  ['сегодня кофе 300', [{ amount: 300, categoryId: 'cafe', daysAgo: undefined, note: undefined }]],
  ['такси 450 и обед 380', [{ amount: 450, categoryId: 'transport' }, { amount: 380, categoryId: 'food' }]],
  ['кроссовки 3500 и пиво 180', [{ amount: 3500, categoryId: 'clothes' }, { amount: 180, categoryId: 'cafe' }]],
  ['кофе 300, такси 450', [{ amount: 300, categoryId: 'cafe' }, { amount: 450, categoryId: 'transport' }]],
  ['обед 12 €, такси 15 лари', [{ amount: 12, currency: 'EUR' }, { amount: 15, currency: 'GEL' }]],
  ['вчера такси 300 и обед 500', [{ amount: 300, daysAgo: 1 }, { amount: 500, daysAgo: 1 }]],
  ['+50000 зарплата и -300 кофе', [{ kind: 'income', amount: 50000 }, { kind: 'expense', amount: 300 }]],
  // Не делится: у одной из частей нет своей суммы, запятая перед цифрой — копейки
  ['хлеб и молоко 120', [{ amount: 120, categoryId: 'food' }]],
  ['аптека 340,50', [{ amount: 340.5, categoryId: 'health' }]],
  ['такси туда и обратно 600', [{ amount: 600, categoryId: 'transport' }]],
  // Находки критика 2.2
  // Слово-ключ прототипа — не день: раньше давало дату NaN-NaN-NaN
  ['кофе 300 constructor', [{ amount: 300, categoryId: 'cafe', daysAgo: undefined }]],
  ['кофе 300 __proto__', [{ amount: 300, categoryId: 'cafe', daysAgo: undefined }]],
  ['toString 300', [{ amount: 300, daysAgo: undefined }]],
  // Перенос строки делит всегда, даже перед цифрой
  ['300 кофе\n450 такси', [{ amount: 300, categoryId: 'cafe' }, { amount: 450, categoryId: 'transport' }]],
  ['кофе 300\n500 такси', [{ amount: 300, categoryId: 'cafe' }, { amount: 500, categoryId: 'transport' }]],
  // Разряды с копейками
  ['продукты 1 200,50', [{ amount: 1200.5, categoryId: 'food' }]],
  ['кофе 300; продукты 1 200,50', [{ amount: 300 }, { amount: 1200.5 }]],
  ['1500 200 такси', [{ amount: 1500 }]],
  ['1 500 000 ипотека', [{ amount: 1500000, categoryId: 'home' }]],
  // Свой день у каждой части
  ['кофе 300 вчера и обед 380 сегодня', [{ amount: 300, daysAgo: 1 }, { amount: 380, daysAgo: undefined }]],
  ['такси 450 и обед 380 вчера', [{ amount: 450, daysAgo: 1 }, { amount: 380, daysAgo: 1 }]],
  // Копейки отдельной частью и скидка — одна трата
  ['кофе 300 и 50 копеек', [{ amount: 300.5, categoryId: 'cafe' }]],
  ['обед 350, -50 скидка', [{ amount: 350, categoryId: 'food' }]],
]
let multiFailed = 0
for (const [input, want] of MULTI) {
  const r = parseEntries(input)
  const got = Array.isArray(r) ? r : r.ok ? [r.entry] : []
  const diff = []
  if (got.length !== want.length) diff.push(`операций ${got.length}, ждали ${want.length}`)
  else {
    want.forEach((w, i) => {
      for (const [key, expected] of Object.entries(w)) {
        if (got[i][key] !== expected) diff.push(`#${i + 1} ${key}: ждали ${expected}, получили ${got[i][key]}`)
      }
    })
  }
  if (diff.length) {
    multiFailed++
    console.error(`✗ «${input}» — ${diff.join('; ')}`)
  }
}
failed += multiFailed

if (failed) {
  console.error(`\ntest-entry: ${failed} из ${CASES.length + 1 + MULTI.length} примеров разобраны не так`)
  process.exit(1)
}
console.log(`test-entry: ${CASES.length + 1 + MULTI.length} примеров разобраны как ожидалось (из них ${MULTI.length} — день словом и несколько трат)`)
