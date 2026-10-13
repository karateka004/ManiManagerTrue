/**
 * Сверка валют бота с валютами приложения.
 *
 * Тут легко потерять деньги молча. Разбор в боте узнаёт валюту по слову или
 * символу и кладёт её код в операцию. Если такого кода в приложении нет, запись
 * получает валюту-призрак: в подсчётах она не совпадает ни с чем (селекторы
 * фильтруют по коду), то есть операция есть, а в суммах её нет.
 *
 * Проверяем четыре вещи:
 *   1) код, который бот умеет распознать, известен и приложению;
 *   2) у бота есть символ и локаль на КАЖДУЮ валюту приложения — иначе сумма в
 *      ответе напечатается без символа;
 *   3) символ и локаль совпадают — «300 ₴» в чате и на Главной должны выглядеть
 *      одинаково, иначе это читается как две разные записи;
 *   4) у каждой валюты есть файл флага, а локаль печатает латинские цифры:
 *      у арабских и бенгальской локалей цифры по умолчанию свои, и «١٬٢٣٤»
 *      в сумме выглядело бы поломкой.
 */
import { existsSync, readFileSync } from 'node:fs'

const app = readFileSync(new URL('../../src/lib/currencies.ts', import.meta.url), 'utf8')
const money = readFileSync(new URL('../src/money.ts', import.meta.url), 'utf8')
const entry = readFileSync(new URL('../src/entry.ts', import.meta.url), 'utf8')

// Приложение: `{ code: 'USD', symbol: '$', locale: 'en-US', flag: 'us' },`
const appCur = new Map()
for (const m of app.matchAll(/\{\s*code:\s*'([A-Z]{3})',\s*symbol:\s*'([^']+)',\s*locale:\s*'([^']+)',\s*flag:\s*'([a-z]+)'/g)) {
  appCur.set(m[1], { symbol: m[2], locale: m[3], flag: m[4] })
}

// Воркер: `USD: { symbol: '$', locale: 'en-US' },`
const botCur = new Map()
for (const m of money.matchAll(/([A-Z]{3}):\s*\{\s*symbol:\s*'([^']+)',\s*locale:\s*'([^']+)'\s*\}/g)) {
  botCur.set(m[1], { symbol: m[2], locale: m[3] })
}

// Разбор: `[/^(₴|грн|…)$/, 'UAH'],` — коды, которые бот способен проставить сам.
const parsed = new Set()
for (const m of entry.matchAll(/\/,\s*'([A-Z]{3})'\s*\]/g)) parsed.add(m[1])

if (appCur.size === 0 || botCur.size === 0 || parsed.size === 0) {
  console.error(
    `check-currencies: не смог разобрать списки (приложение=${appCur.size}, воркер=${botCur.size}, разбор=${parsed.size})`,
  )
  process.exit(1)
}

const problems = []
for (const code of parsed) {
  if (!appCur.has(code)) {
    problems.push(`разбор умеет ставить «${code}», а в приложении такой валюты нет — операция выпадет из всех подсчётов`)
  }
}
for (const [code, a] of appCur) {
  const b = botCur.get(code)
  if (!b) problems.push(`в приложении есть «${code}», а у бота нет символа — сумма напечатается без него`)
  else if (b.symbol !== a.symbol) problems.push(`«${code}»: символ у бота «${b.symbol}», в приложении «${a.symbol}»`)
  else if (b.locale !== a.locale) problems.push(`«${code}»: локаль у бота «${b.locale}», в приложении «${a.locale}»`)
}
for (const code of botCur.keys()) {
  if (!appCur.has(code)) problems.push(`у бота есть «${code}», а в приложении такой валюты нет`)
}
for (const [code, a] of appCur) {
  const flag = new URL(`../../public/flags/${a.flag}.svg`, import.meta.url)
  if (!existsSync(flag)) problems.push(`«${code}»: нет файла флага public/flags/${a.flag}.svg`)
  const sample = new Intl.NumberFormat(a.locale, { minimumFractionDigits: 2 }).format(1234567.89)
  if (!/^[0-9.,'\u00a0\u202f\u2019 ]+$/.test(sample)) {
    problems.push(`«${code}»: локаль ${a.locale} печатает «${sample}» — нужны латинские цифры`)
  }
}

if (problems.length) {
  console.error('check-currencies: списки валют разошлись\n  - ' + problems.join('\n  - '))
  process.exit(1)
}
console.log(`check-currencies: ${appCur.size} валют совпадают, разбор ставит ${parsed.size} из них`)
