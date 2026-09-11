/**
 * Сверка категорий бота с категориями приложения.
 *
 * Бот разбирает «кофе 300» и должен положить операцию в ту же категорию, что
 * есть в приложении. Если id разойдутся (переименовали, удалили, добавили),
 * операция попадёт в несуществующую категорию и покажется «без категории» —
 * причём молча. Поэтому списки сверяются на каждый lint.
 *
 * Дублирование здесь сознательное: воркер собирается отдельно от приложения и
 * не может импортировать его модули. Лучше дубль под присмотром, чем импорт
 * через границу двух сборок.
 */
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('../../src/store/categories.ts', import.meta.url), 'utf8')
const bot = readFileSync(new URL('../src/entry.ts', import.meta.url), 'utf8')

// id встроенных категорий приложения: строки вида `{ id: 'food', ... kind: 'expense'`
const appCats = new Map()
for (const m of app.matchAll(/\{\s*id:\s*'([a-z_]+)'[^}]*?kind:\s*'(income|expense)'/g)) {
  appCats.set(m[1], m[2])
}
// правила бота: `{ id: 'food', kind: 'expense', words: [...] }`
const botCats = new Map()
for (const m of bot.matchAll(/\{\s*id:\s*'([a-z_]+)',\s*kind:\s*'(income|expense)'/g)) {
  botCats.set(m[1], m[2])
}

if (appCats.size === 0 || botCats.size === 0) {
  console.error('check-categories: не смог разобрать списки (appCats=' + appCats.size + ', botCats=' + botCats.size + ')')
  process.exit(1)
}

const problems = []
for (const [id, kind] of botCats) {
  if (!appCats.has(id)) problems.push(`бот знает «${id}», а в приложении такой категории нет`)
  else if (appCats.get(id) !== kind) problems.push(`«${id}»: в боте ${kind}, в приложении ${appCats.get(id)}`)
}
for (const id of appCats.keys()) {
  if (!botCats.has(id)) problems.push(`в приложении есть «${id}», а бот про неё не знает — в неё нельзя записать сообщением`)
}

if (problems.length) {
  console.error('check-categories: списки категорий разошлись\n  - ' + problems.join('\n  - '))
  process.exit(1)
}
console.log(`check-categories: ${botCats.size} категорий совпадают с приложением`)
