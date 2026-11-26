/**
 * Резолвер импортов без расширения — только для прогона тестов в Node.
 *
 * Код воркера пишет `import { parseEntry } from './entry'`, потому что его
 * собирает esbuild внутри wrangler и расширение ему не нужно. Node по спецификации
 * ESM так не умеет и требует «./entry.ts». Переписывать ради тестов все импорты
 * в рабочем коде — хвост, виляющий собакой; проще научить Node одному правилу.
 *
 * Второе правило — как у wrangler: `import html from './admin.html'` отдаёт текст файла.
 *
 * Подключается флагом: `node --import ./scripts/ts-resolve.mjs scripts/test-reply.mjs`
 */
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context)
    } catch (err) {
      // Достраиваем расширение только относительным путям без него: пакеты и
      // всё остальное должно падать ровно так же, как падало бы без хука.
      if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context)
      }
      throw err
    }
  },
  load(url, context, nextLoad) {
    if (url.startsWith('file:') && url.endsWith('.html')) {
      const text = readFileSync(fileURLToPath(url), 'utf8')
      return { format: 'module', source: 'export default ' + JSON.stringify(text), shortCircuit: true }
    }
    return nextLoad(url, context)
  },
})
