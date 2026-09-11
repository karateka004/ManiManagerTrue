/**
 * Сверка категорий бота с категориями приложения.
 *
 * Бот разбирает «кофе 300» и должен положить операцию в ту же категорию, что
 * есть в приложении. Если id разойдутся (переименовали, удалили, добавили),
 * операция попадёт в несуществующую категорию и покажется «без категории» —
 * причём молча. Названия сверяем тоже: бот пишет их человеку в ответ
 * («Записал: Кафе 300 ₴»), и «Жилье» в чате против «Жильё» в приложении
 * читается как два разных места.
 *
 * Дублирование здесь сознательное: воркер собирается отдельно от приложения и
 * не может импортировать его модули. Лучше дубль под присмотром, чем импорт
 * через границу двух сборок.
 */
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('../../src/store/categories.ts', import.meta.url), 'utf8')
const bot = readFileSync(new URL('../src/entry.ts', import.meta.url), 'utf8')

// Приложение: `{ id: 'food', name: 'Еда', kind: 'expense', color: …`
const appCats = new Map()
for (const m of app.matchAll(/\{\s*id:\s*'([a-z_]+)',\s*name:\s*'([^']+)',\s*kind:\s*'(income|expense)'/g)) {
  appCats.set(m[1], { name: m[2].trim(), kind: m[3] })
}
// Бот: `{ id: 'food', kind: 'expense', name: 'Еда', words: [...] }`
const botCats = new Map()
for (const m of bot.matchAll(/\{\s*id:\s*'([a-z_]+)',\s*kind:\s*'(income|expense)',\s*name:\s*'([^']+)'/g)) {
  botCats.set(m[1], { name: m[3].trim(), kind: m[2] })
}

if (appCats.size === 0 || botCats.size === 0) {
  console.error(
    'check-categories: не смог разобрать списки (appCats=' + appCats.size + ', botCats=' + botCats.size + ')',
  )
  process.exit(1)
}

const problems = []
for (const [id, bc] of botCats) {
  const ac = appCats.get(id)
  if (!ac) problems.push(`бот знает «${id}», а в приложении такой категории нет`)
  else if (ac.kind !== bc.kind) problems.push(`«${id}»: в боте ${bc.kind}, в приложении ${ac.kind}`)
  else if (ac.name !== bc.name) problems.push(`«${id}»: в боте называется «${bc.name}», в приложении «${ac.name}»`)
}
for (const id of appCats.keys()) {
  if (!botCats.has(id)) {
    problems.push(`в приложении есть «${id}», а бот про неё не знает — в неё нельзя записать сообщением`)
  }
}

if (problems.length) {
  console.error('check-categories: списки категорий разошлись\n  - ' + problems.join('\n  - '))
  process.exit(1)
}
console.log(`check-categories: ${botCats.size} категорий совпадают с приложением (id, вид, название)`)
