/**
 * Категории бота. Список (id, вид, название) один на приложение и бота —
 * shared/categories.ts, разойтись он уже не может. Остаётся проверить, что у
 * каждой встроенной категории есть слова: без них в неё нельзя записать
 * сообщением, и что слов не осталось у категории, которой больше нет.
 *
 * Запуск: `node --import ./scripts/ts-resolve.mjs scripts/check-categories.mjs`
 */
import { readFileSync } from 'node:fs'
import { DEFAULT_CATEGORIES } from '../../shared/categories.ts'
import { CATEGORY_RULES } from '../src/entry.ts'

const entry = readFileSync(new URL('../src/entry.ts', import.meta.url), 'utf8')
const block = entry.slice(entry.indexOf('const WORDS'), entry.indexOf('export const CATEGORY_RULES'))
const wordIds = [...block.matchAll(/^\s{2}([a-z_]+):\s*\[/gm)].map((m) => m[1])
const ids = new Set(DEFAULT_CATEGORIES.map((c) => c.id))

const problems = []
for (const r of CATEGORY_RULES) if (r.words.length === 0) problems.push(`у «${r.id}» нет слов — сообщением в неё не записать`)
for (const id of wordIds) if (!ids.has(id)) problems.push(`слова для «${id}», а такой категории нет`)
if (wordIds.length === 0) problems.push('не смог прочитать WORDS в entry.ts')

if (problems.length) {
  console.error('check-categories:\n  - ' + problems.join('\n  - '))
  process.exit(1)
}
console.log(`check-categories: ${CATEGORY_RULES.length} категорий из общего списка, у всех есть слова`)
