/**
 * Сторож админки.
 *
 * Страница — обычный файл src/admin.html, её скрипт внутри <script>. tsc его не
 * видит, поэтому проверяем здесь: скрипт разбирается как JavaScript, а значение,
 * которое отдаёт воркер (ADMIN_HTML), — ровно файл, побайтно.
 *
 * Запуск: `node --import ./scripts/ts-resolve.mjs scripts/check-admin-js.mjs`
 */
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { ADMIN_HTML } from '../src/admin.ts'

const file = readFileSync(new URL('../src/admin.html', import.meta.url), 'utf8')
if (file !== ADMIN_HTML) {
  console.error('check-admin-js: ADMIN_HTML не совпадает с src/admin.html')
  process.exit(1)
}

const open = ADMIN_HTML.lastIndexOf('<script>')
const close = ADMIN_HTML.lastIndexOf('</script>')
if (open < 0 || close < 0 || close < open) {
  console.error('check-admin-js: не нашёл <script> в admin.html')
  process.exit(1)
}
const code = ADMIN_HTML.slice(open + '<script>'.length, close)
try {
  new vm.Script(code, { filename: 'admin.html (скрипт)' })
} catch (e) {
  console.error('check-admin-js: скрипт админки не разбирается\n' + e.message)
  process.exit(1)
}

console.log('check-admin-js: скрипт админки в порядке (' + code.length + ' символов)')
