/**
 * Сквозная проверка поведения под нагрузкой на локальном воркере.
 *
 * Проверяем то, что сломало бы воркер после рассылки:
 *   - ограничитель больше не пишет в KV и не роняет запросы;
 *   - профиль пишет личную карточку и НЕ переписывает её, если ничего не поменялось;
 *   - человек видит себя в рейтинге сразу, ещё до сборки общего ключа кроном;
 *   - крон собирает общий ключ и общее число участников.
 *
 * Запуск (в соседнем окне):
 *   npx wrangler dev --local --port 8787 --test-scheduled
 *   node scripts/test-load.mjs
 * Затем — что ограничитель ничего не записал:
 *   npx wrangler kv key list --binding REFERRALS --local --prefix rl:
 */
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'

const BASE = process.env.BASE ?? 'http://127.0.0.1:8787'

const vars = Object.fromEntries(
  readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)

function initData(userId, name) {
  const params = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: userId, first_name: name }),
  }
  const check = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('\n')
  const secret = createHmac('sha256', 'WebAppData').update(vars.BOT_TOKEN).digest()
  const hash = createHmac('sha256', secret).update(check).digest('hex')
  return new URLSearchParams({ ...params, hash }).toString()
}

const post = async (path, body) => {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: r.status, json: await r.json().catch(() => null) }
}

let failed = 0
const check = (name, ok, detail = '') => {
  if (ok) console.log(`✓ ${name}`)
  else {
    failed++
    console.error(`✗ ${name}${detail ? ' — ' + detail : ''}`)
  }
}

// Свежие id на каждый прогон: локальный KV живёт между запусками.
const base = 880000 + Math.floor(Math.random() * 10000)
const A = base
const B = base + 1
const INIT_A = initData(A, 'Анна')
const INIT_B = initData(B, 'Борис')

const profile = (init, xp) =>
  post('/profile', { initData: init, xp, level: 1, ops: 0, coins: 10, streakBest: 0 })

/* ---------- Профиль: первая запись и холостой повтор ---------- */

let r = await profile(INIT_A, 24)
check('первый профиль принят', r.status === 200 && r.json?.ok === true, JSON.stringify(r.json))
check('первый профиль записан, а не пропущен', r.json?.unchanged !== true)

r = await profile(INIT_A, 24)
check('тот же профиль второй раз — без записи', r.json?.unchanged === true, JSON.stringify(r.json))

r = await profile(INIT_A, 36)
check('изменился XP — запись есть', r.json?.ok === true && r.json?.unchanged !== true, JSON.stringify(r.json))

await profile(INIT_B, 12)

/* ---------- Рейтинг до сборки кроном ---------- */

r = await post('/leaderboard', { initData: INIT_A })
const meBefore = r.json?.xp?.me
check('себя видно до сборки общего ключа', meBefore?.id === A, JSON.stringify(meBefore))
check('в своей карточке свежий XP', meBefore?.xp === 36, `xp ${meBefore?.xp}`)

/* ---------- Сборка общего ключа кроном ---------- */

const cron = await fetch(`${BASE}/__scheduled?cron=${encodeURIComponent('*/5 * * * *')}`)
check('крон сборки рейтинга отработал', cron.ok, `HTTP ${cron.status}`)

r = await post('/leaderboard', { initData: INIT_B })
const ids = (r.json?.xp?.top ?? []).map((e) => e.id)
check('после сборки в общем топе оба', ids.includes(A) && ids.includes(B), `в топе ${ids.length}`)
check('общее число участников посчитано', (r.json?.total ?? 0) >= 2, `total ${r.json?.total}`)
check('Анна выше Бориса по XP', ids.indexOf(A) < ids.indexOf(B))

/* ---------- Ограничитель: держит лимит и не ломает запросы ---------- */

let ok = 0
let limited = 0
for (let i = 0; i < 65; i++) {
  const x = await post('/inbox/get', { initData: INIT_B })
  if (x.status === 200) ok++
  else if (x.status === 429) limited++
}
check('ограничитель пропускает 60 в минуту', ok === 60, `прошло ${ok}`)
check('лишнее отбивает 429, а не 500', limited === 5, `отбито ${limited}`)

if (failed) {
  console.error(`\ntest-load: ${failed} проверок не прошли`)
  process.exit(1)
}
console.log('\ntest-load: все проверки пройдены')
