/**
 * Проверка синтаксиса скрипта админ-дашборда.
 *
 * Страница админки живёт внутри шаблонной строки (`ADMIN_HTML`), а её скрипт —
 * обычный текст внутри этой строки. `tsc` в текст не заглядывает, поэтому
 * сломанная скобка проходит проверку типов, собирается и выкатывается — и
 * обнаруживается только пустой страницей в браузере. Ровно так и случилось.
 *
 * Проверяем ДВЕ вещи:
 *   1. Исходник шаблона: в нём нет обратных кавычек, `${…}` и обратных слэшей.
 *      Первые два закрыли бы шаблонную строку, а слэш шаблон молча съедает:
 *      '\n' в исходнике превращается в настоящий перевод строки внутри
 *      JS-строки, и скрипт в браузере ломается, хотя исходник выглядит верно.
 *   2. Строку, которая реально уходит в браузер (значение ADMIN_HTML после
 *      обработки шаблона): её скрипт отдаётся парсеру Node.
 *
 * Запуск: `node --import ./scripts/ts-resolve.mjs scripts/check-admin-js.mjs`
 */
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { ADMIN_HTML } from '../src/admin.ts'

const src = readFileSync(new URL('../src/admin.ts', import.meta.url), 'utf8')
const START = 'export const ADMIN_HTML = `'
const begin = src.indexOf(START)
const end = src.lastIndexOf('`')
if (begin < 0 || end <= begin) {
  console.error('check-admin-js: не нашёл шаблон ADMIN_HTML в src/admin.ts')
  process.exit(1)
}
const template = src.slice(begin + START.length, end)
for (const [bad, why] of [
  ['`', 'обратная кавычка закроет шаблонную строку'],
  ['${', '${…} шаблон подставит как выражение'],
  ['\\', 'обратный слэш шаблон молча превратит в другой символ'],
]) {
  if (template.includes(bad)) {
    const line = src.slice(0, begin + START.length + template.indexOf(bad)).split('\n').length
    console.error(`check-admin-js: в ADMIN_HTML есть «${bad}» (строка ${line}) — ${why}`)
    process.exit(1)
  }
}

const open = ADMIN_HTML.lastIndexOf('<script>')
const close = ADMIN_HTML.lastIndexOf('</script>')
if (open < 0 || close < 0 || close < open) {
  console.error('check-admin-js: не нашёл <script> в ADMIN_HTML')
  process.exit(1)
}
const code = ADMIN_HTML.slice(open + '<script>'.length, close)
try {
  new vm.Script(code, { filename: 'admin.ts (инлайн-скрипт)' })
} catch (e) {
  console.error('check-admin-js: скрипт админки не разбирается\n' + e.message)
  process.exit(1)
}

console.log('check-admin-js: скрипт админки в порядке (' + code.length + ' символов)')
