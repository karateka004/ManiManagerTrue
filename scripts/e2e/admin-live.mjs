// Воркер выкачен: живая админка == ADMIN_HTML из рабочей копии (побайтно).
// Запуск из корня: `node --import ./worker/scripts/ts-resolve.mjs scripts/e2e/admin-live.mjs`
import { ADMIN_HTML } from '../../worker/src/admin.ts'

const url = `https://koshel-worker.karateka004.workers.dev/admin?nc=${Date.now()}`
const live = Buffer.from(await (await fetch(url)).arrayBuffer())
const local = Buffer.from(ADMIN_HTML, 'utf8')
if (live.equals(local)) {
  console.log(`живая админка совпадает (${live.length} байт)`)
} else {
  console.log(`ОТЛИЧАЕТСЯ: в рабочей копии ${local.length} байт, на воркере ${live.length}`)
  process.exit(1)
}
