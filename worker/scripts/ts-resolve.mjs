/**
 * Резолвер импортов без расширения — только для прогона тестов в Node.
 *
 * Код воркера пишет `import { parseEntry } from './entry'`, потому что его
 * собирает esbuild внутри wrangler и расширение ему не нужно. Node по спецификации
 * ESM так не умеет и требует «./entry.ts». Переписывать ради тестов все импорты
 * в рабочем коде — хвост, виляющий собакой; проще научить Node одному правилу.
 *
 * Подключается флагом: `node --import ./scripts/ts-resolve.mjs scripts/test-reply.mjs`
 */
import { registerHooks } from 'node:module'

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
})
