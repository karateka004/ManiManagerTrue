/**
 * Проверка синтаксиса скрипта админ-дашборда.
 *
 * Страница админки живёт внутри шаблонной строки (`ADMIN_HTML`), а её скрипт —
 * обычный текст внутри этой строки. `tsc` в текст не заглядывает, поэтому
 * сломанная скобка проходит проверку типов, собирается и выкатывается — и
 * обнаруживается только пустой страницей в браузере. Ровно так и случилось.
 *
 * Здесь скрипт вырезается из HTML и отдаётся парсеру Node.
 */
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const src = readFileSync(new URL('../src/admin.ts', import.meta.url), 'utf8')

const open = src.lastIndexOf('<script>')
const close = src.lastIndexOf('</script>')
if (open < 0 || close < 0 || close < open) {
  console.error('check-admin-js: не нашёл <script> в ADMIN_HTML')
  process.exit(1)
}
const code = src.slice(open + '<script>'.length, close)

try {
  new vm.Script(code, { filename: 'admin.ts (инлайн-скрипт)' })
} catch (e) {
  console.error('check-admin-js: скрипт админки не разбирается\n' + e.message)
  process.exit(1)
}

// Обратные кавычки внутри скрипта закрыли бы шаблонную строку ADMIN_HTML,
// поэтому весь скрипт написан на конкатенации. Ловим случайный возврат к ним.
if (code.includes('`') || code.includes('${')) {
  console.error('check-admin-js: в скрипте есть обратная кавычка или ${…} — они ломают шаблонную строку ADMIN_HTML')
  process.exit(1)
}

console.log('check-admin-js: скрипт админки в порядке (' + code.length + ' символов)')
