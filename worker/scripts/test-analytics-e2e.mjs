/**
 * Сквозная проверка аналитики владельца на локальном воркере.
 *
 * Проверяет цепочку целиком, как она пойдёт после рекламной рассылки:
 *   - человек открыл приложение по ссылке ?startapp=<метка> — метка и день
 *     запуска легли в его карточку рейтинга;
 *   - синхронизация данных отметила день и посчитала дни с записями;
 *   - другой человек нажал «Старт» по ссылке ?start=<метка> и записал трату
 *     боту, ни разу не открыв приложение, — он тоже виден в дашборде;
 *   - в публичный рейтинг не утекают метка, дни визитов и дата прихода;
 *   - дашборд пускает по паролю и по подписи владельца, а чужую подпись — нет.
 *
 * Запуск (в соседнем окне, со своим .dev.vars — секреты там любые):
 *   npx wrangler dev --local --port 8787
 *   node scripts/test-analytics-e2e.mjs
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
const OWNER = 439944083 // OWNER_CHAT_ID из wrangler.toml
// Свои id на каждый прогон: локальный KV между запусками не чистится.
const A = 900000000 + Math.floor(Math.random() * 1e6)
const B = A + 1
const TAG_APP = 'e2e_app'
const TAG_BOT = 'e2e_bot'

function initData(userId, name, extra = {}) {
  const params = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: userId, first_name: name }),
    ...extra,
  }
  const check = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('\n')
  const secret = createHmac('sha256', 'WebAppData').update(vars.BOT_TOKEN).digest()
  const hash = createHmac('sha256', secret).update(check).digest('hex')
  return new URLSearchParams({ ...params, hash }).toString()
}

async function post(path, body, headers = {}) {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  return { status: r.status, json: await r.json().catch(() => null), headers: r.headers }
}
const admin = (path, body = {}) => post(path, body, { 'X-Admin-Key': vars.ADMIN_KEY })

let failed = 0
const check = (name, ok, detail) => {
  if (ok) console.log('✓ ' + name)
  else {
    failed++
    console.error('✗ ' + name + (detail !== undefined ? ' — ' + JSON.stringify(detail).slice(0, 400) : ''))
  }
}

/* 1. Запуск приложения по рекламной ссылке */
const prof = { xp: 0, level: 1, ops: 0, coins: 0, streakBest: 0 }
let r = await post('/profile', { initData: initData(A, 'Аня', { start_param: TAG_APP }), ...prof })
check('профиль по рекламной ссылке принят', r.status === 200 && r.json?.ok, r)
r = await post('/profile', { initData: initData(A, 'Аня', { start_param: 'other_tag' }), ...prof })
check('повторный запуск в тот же день ничего не пишет', r.json?.unchanged === true, r.json)

/* 2. Синхронизация данных: две операции в разные дни */
const blob = JSON.stringify({
  version: 16,
  state: {
    transactions: [
      { id: 't1', type: 'expense', amount: 1, categoryId: 'food', date: new Date(Date.now() - 2 * 86400000).toISOString() },
      { id: 't2', type: 'expense', amount: 1, categoryId: 'cafe', date: new Date().toISOString() },
    ],
    currency: 'UAH',
    lang: 'ru',
  },
})
r = await post('/data/put', { initData: initData(A, 'Аня'), blob, updatedAt: Date.now() })
check('синхронизация принята', r.status === 200 && r.json?.ok, r)

/* 3. Бот: «Старт» по рекламной ссылке и трата сообщением */
const hook = (text, id) =>
  fetch(BASE + '/tg/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': vars.TG_WEBHOOK_SECRET },
    body: JSON.stringify({
      update_id: id,
      message: { message_id: id, chat: { id: B, type: 'private' }, from: { id: B, first_name: 'Борис', username: 'boris_e2e' }, text },
    }),
  })
check('вебхук: «/start <метка>»', (await hook('/start ' + TAG_BOT, 1)).status === 200)
check('вебхук: «/start <другая метка>»', (await hook('/start other_tag', 2)).status === 200)
check('вебхук: трата сообщением', (await hook('кофе 300', 3)).status === 200)

/* 4. Дашборд */
r = await admin('/admin/stats', { fresh: true })
check('дашборд по паролю', r.status === 200 && r.json?.ok, r.status)
const d = r.json
const pa = d?.people?.find((p) => p.i === String(A))
const pb = d?.people?.find((p) => p.i === String(B))
check('человек из приложения: метка ссылки, приложение', pa?.s === TAG_APP && pa?.a === 1, pa)
check('человек из приложения: операции по синхронизации', pa?.o === 2, pa)
check('человек из бота: первое касание, без приложения, 1 запись', pb?.s === TAG_BOT && !pb?.a && pb?.b === 1, pb)
check('человек из бота: имя и ник со «Старта»', pb?.n === 'Борис' && pb?.u === 'boris_e2e', pb)
const keys = (d?.sources ?? []).map((s) => s.key)
check('источники: обе метки', keys.includes('src:' + TAG_APP) && keys.includes('src:' + TAG_BOT), keys)
check('маски начали писаться', typeof d?.trackFrom === 'string', d?.trackFrom)
check('сегодня: оба новичка в списке', [A, B].every((id) => d?.today?.newcomers?.some((n) => n.i === String(id))), d?.today?.newcomers?.length)

/* 5. Карточка человека */
r = await admin('/admin/person', { id: String(A) })
check('карточка: дни с записями из синхронизации', r.json?.card?.dd === 2, r.json?.card)
check('карточка: сегодня отмечен как день активности', r.json?.strip?.[r.json.strip.length - 1] === 1, r.json?.strip)
r = await admin('/admin/person', { id: String(B) })
check('карточка бот-пользователя: запись через бота', r.json?.botOps === 1 && r.json?.inApp === false, r.json)
r = await admin('/admin/person', { id: '../data:1' })
check('карточка: id только цифрами', r.status === 400, r.status)

/* 6. Публичный рейтинг без аналитических полей */
r = await post('/leaderboard', { initData: initData(A, 'Аня') })
const me = r.json?.xp?.me
check('рейтинг: себя видно сразу', me && me.id === A, r.json)
check('рейтинг: без метки, дней визитов и даты прихода', me && !('src' in me) && !('vm' in me) && !('vd' in me) && !('firstSeen' in me), me)

/* 7. Доступ */
r = await post('/admin/stats', {}, { 'X-Tg-Init-Data': initData(OWNER, 'Владелец') })
check('дашборд по подписи владельца', r.status === 200, r.status)
r = await post('/admin/stats', {}, { 'X-Tg-Init-Data': initData(A, 'Аня') })
check('чужая подпись — отказ', r.status === 403, r.status)
r = await post('/admin/stats', {}, { 'X-Admin-Key': 'wrong' })
check('неверный пароль — отказ', r.status === 403, r.status)
const page = await fetch(BASE + '/admin')
const csp = page.headers.get('content-security-policy') ?? ''
check('страница: CSP пускает скрипт Telegram и веб-Telegram во фрейм', csp.includes('https://telegram.org') && csp.includes('frame-ancestors'), csp)

if (failed) {
  console.error(`test-analytics-e2e: ${failed} провалено`)
  process.exit(1)
}
console.log('test-analytics-e2e: вся цепочка — от рекламной ссылки до дашборда — работает')
