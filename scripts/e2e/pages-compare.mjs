// Прод == проверенная сборка: каждый файл dist/ сверяется побайтно с тем, что
// отдаёт GitHub Pages. Запускать после зелёного «Деплоя приложения» на той же
// сборке, что гонялась в сценариях: `npm run build && node scripts/e2e/pages-compare.mjs`.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIST = fileURLToPath(new URL('../../dist/', import.meta.url))
const PAGES = process.env.PAGES || 'https://karateka004.github.io/ManiManagerTrue/'

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* walk(p)
    else yield p
  }
}

const files = [...walk(DIST)].sort()
let same = 0
const diff = []
// По восемь запросов разом: файлов ~150, по одному — минута.
for (let i = 0; i < files.length; i += 8) {
  await Promise.all(
    files.slice(i, i + 8).map(async (file) => {
      const rel = relative(DIST, file).split(sep).join('/')
      // Оборванное соединение — ещё попытка: это сеть, а не разница.
      for (let attempt = 1; ; attempt++) {
        try {
          const res = await fetch(`${PAGES}${rel}?nocache=${Date.now()}${i}`)
          const live = Buffer.from(await res.arrayBuffer())
          if (res.ok && live.equals(readFileSync(file))) same++
          else diff.push(`${rel} (${res.status})`)
          break
        } catch (e) {
          if (attempt < 3) continue
          diff.push(`${rel} (${e.cause?.code ?? e.message})`)
          break
        }
      }
    }),
  )
}
for (const d of diff) console.log('РАЗНИЦА:', d)
const main = readFileSync(join(DIST, 'index.html'), 'utf8').match(/assets\/(index-[\w-]+\.js)/)?.[1]
console.log(`бандл ${main}: совпало ${same}, отличается ${diff.length}`)
process.exit(diff.length ? 1 : 0)
