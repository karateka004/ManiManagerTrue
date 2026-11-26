/**
 * Проверка валют. Список один на приложение и бота (shared/currencies.ts), так
 * что символы и локали разойтись уже не могут. Остаётся проверить:
 *   1) код, который разбор бота умеет распознать (entry.ts), есть в списке — иначе
 *      операция получит валюту-призрак и выпадет из всех подсчётов;
 *   2) у каждой валюты есть файл флага;
 *   3) локаль печатает латинские цифры (у арабских и бенгальской свои, и «١٬٢٣٤»
 *      в сумме выглядело бы поломкой).
 */
import { existsSync, readFileSync } from 'node:fs'

const app = readFileSync(new URL('../../shared/currencies.ts', import.meta.url), 'utf8')
const entry = readFileSync(new URL('../src/entry.ts', import.meta.url), 'utf8')

// Приложение: `{ code: 'USD', symbol: '$', locale: 'en-US', flag: 'us' },`
const appCur = new Map()
for (const m of app.matchAll(/\{\s*code:\s*'([A-Z]{3})',\s*symbol:\s*'([^']+)',\s*locale:\s*'([^']+)',\s*flag:\s*'([a-z]+)'/g)) {
  appCur.set(m[1], { symbol: m[2], locale: m[3], flag: m[4] })
}

// Разбор: `[/^(₴|грн|…)$/, 'UAH'],` — коды, которые бот способен проставить сам.
const parsed = new Set()
for (const m of entry.matchAll(/\/,\s*'([A-Z]{3})'\s*\]/g)) parsed.add(m[1])

if (appCur.size === 0 || parsed.size === 0) {
  console.error(
    `check-currencies: не смог разобрать списки (валюты=${appCur.size}, разбор=${parsed.size})`,
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
  const flag = new URL(`../../public/flags/${a.flag}.svg`, import.meta.url)
  if (!existsSync(flag)) problems.push(`«${code}»: нет файла флага public/flags/${a.flag}.svg`)
  const sample = new Intl.NumberFormat(a.locale, { minimumFractionDigits: 2 }).format(1234567.89)
  if (!/^[0-9.,'\u00a0\u202f\u2019 ]+$/.test(sample)) {
    problems.push(`«${code}»: локаль ${a.locale} печатает «${sample}» — нужны латинские цифры`)
  }
}

if (problems.length) {
  console.error('check-currencies: с валютами не так\n  - ' + problems.join('\n  - '))
  process.exit(1)
}
console.log(`check-currencies: ${appCur.size} валют в общем списке, у всех флаг и латинские цифры; разбор ставит ${parsed.size} из них`)
