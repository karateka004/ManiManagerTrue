// Двойной тап не проскакивает шаг; вернувшийся с данными не застревает в быстром старте.
const { chromium } = require('playwright')
const BASE = process.env.BASE || 'http://localhost:4180/'
;(async () => {
  const b = await chromium.launch()
  const mk = async (preset) => {
    const ctx = await b.newContext({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true })
    await ctx.route('https://telegram.org/**', (r) => r.fulfill({ contentType: 'application/javascript', body: '' }))
    await ctx.route('https://*.clarity.ms/**', (r) => r.abort())
    await ctx.route('https://koshel-worker.karateka004.workers.dev/**', (r) => r.abort())
    await ctx.addInitScript((preset) => {
      if (preset && !sessionStorage.getItem('p')) { for (const [k, v] of Object.entries(preset)) localStorage.setItem(k, v); sessionStorage.setItem('p', '1') }
      const noop = () => {}
      window.Telegram = { WebApp: { initData: '', initDataUnsafe: { user: { id: 1, first_name: 'T' } }, platform: 'ios', colorScheme: 'dark', themeParams: {}, isVersionAtLeast: () => true, ready: noop, expand: noop, setHeaderColor: noop, setBackgroundColor: noop, setBottomBarColor: noop, onEvent: noop, offEvent: noop, disableVerticalSwipes: noop, enableVerticalSwipes: noop, showConfirm: (m, cb) => cb(true), requestWriteAccess: (cb) => cb(true), HapticFeedback: { impactOccurred: noop, notificationOccurred: noop, selectionChanged: noop }, BackButton: { show: noop, hide: noop, onClick: noop, offClick: noop } } }
    }, preset)
    const p = await ctx.newPage(); await p.goto(BASE); await p.waitForTimeout(1200); return { ctx, p }
  }
  let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log((c ? 'OK   ' : 'FAIL ') + m) }
  // Двойной тап по «Сегодня трат не было» (там же потом «Пропустить»).
  { const { ctx, p } = await mk()
    await p.getByRole('button', { name: /Поехали/ }).click(); await p.waitForTimeout(600)
    const next = p.getByRole('button', { name: /^Дальше/ }); const box = await next.boundingBox()
    await p.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2); await p.waitForTimeout(200)
    await p.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2); await p.waitForTimeout(700)
    ok(await p.getByText('Какие сегодня были траты?').isVisible(), 'двойной тап «Дальше» на настройках — остались на трате')
    const skip = p.getByRole('button', { name: 'Сегодня трат не было' }); const sb = await skip.boundingBox()
    await p.touchscreen.tap(sb.x + sb.width / 2, sb.y + sb.height / 2); await p.waitForTimeout(250)
    await p.touchscreen.tap(sb.x + sb.width / 2, sb.y + sb.height / 2); await p.waitForTimeout(700)
    ok(await p.getByText('Сколько получаешь в месяц?').isVisible(), 'двойной тап «Сегодня трат не было» — остались на доходе')
    ok(!(await p.locator('input:focus').count()), 'клавиатура сама не открывается (нет автофокуса)')
    await ctx.close() }
  // Вернувшийся: в сторе свои операции + незаконченный быстрый старт — не показываем.
  { const blob = JSON.stringify({ state: { transactions: [{ id: 'old1', type: 'expense', amount: 9, categoryId: 'food', date: new Date().toISOString(), note: '' }], currency: 'UAH' }, version: 18 })
    const { ctx, p } = await mk({ 'finance-mini-app:v1': blob, 'koshel:qs': JSON.stringify({ s: 2, ids: [], inc: null }) })
    ok(!(await p.getByText('Какие сегодня были траты?').count()), 'вернувшийся с данными — быстрый старт не возвращается')
    await ctx.close() }
  // Шаг 0 не сохраняется: место пишется только после «Поехали».
  { const { ctx, p } = await mk()
    ok((await p.evaluate(() => localStorage.getItem('koshel:qs'))) === null, 'на приветствии место не сохраняется')
    await ctx.close() }
  await b.close(); console.log(fails ? 'ПРОВАЛОВ: ' + fails : 'всё прошло'); process.exit(fails ? 1 : 0)
})()
