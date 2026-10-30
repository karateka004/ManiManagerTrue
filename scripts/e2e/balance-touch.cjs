// Касания (CDP) по карточке баланса: свайп вбок — соседняя вкладка без шторки,
// вертикальная прокрутка — без шторки, короткий тап — шторка записи.
const { chromium } = require('playwright')
const BASE = process.env.BASE || 'http://localhost:4180/'
let fails = 0
const ok = (c, m, extra) => { if (!c) fails++; console.log((c ? 'OK   ' : 'FAIL ') + m + (c || extra === undefined ? '' : '  ' + JSON.stringify(extra))) }
;(async () => {
  const browser = await chromium.launch()
  const tx = Array.from({ length: 40 }, (_, i) => ({ id: 'a' + i, type: i % 5 ? 'expense' : 'income', amount: 100 + i, categoryId: i % 5 ? 'food' : 'salary', date: new Date(Date.now() - i * 3600e3).toISOString(), note: '', currency: 'RUB' }))
  const blob = JSON.stringify({ state: { transactions: tx, currency: 'RUB', lastTxCurrency: 'RUB', themeMode: 'dark' }, version: 18 })
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
  await ctx.route('https://telegram.org/**', (r) => r.fulfill({ contentType: 'application/javascript', body: '' }))
  await ctx.route('https://*.clarity.ms/**', (r) => r.abort())
  await ctx.route('https://koshel-worker.karateka004.workers.dev/**', (r) => r.fulfill({ contentType: 'application/json', body: '{"ok":true}' }))
  await ctx.addInitScript(({ blob }) => {
    if (!sessionStorage.getItem('__p')) {
      localStorage.setItem('finance-mini-app:v1', blob); localStorage.setItem('koshel:onboarded', '1'); localStorage.setItem('koshel:curAsked', '1')
      sessionStorage.setItem('__p', '1')
    }
  }, { blob })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))
  await page.goto(BASE)
  await page.waitForTimeout(1500)
  const cdp = await ctx.newCDPSession(page)
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
  const sheetOpen = () => page.locator('[aria-modal=true]').filter({ hasText: 'Записать расход' }).count()
  const tabActive = (name) => page.evaluate((n) => document.querySelector(`[data-tab="${n}"]`)?.hasAttribute('data-off') === false, name)
  const heroBox = async () => page.locator('.hero-surface[role=button]').first().boundingBox()

  // 1. Свайп влево по балансу → Аналитика, шторки нет.
  let b = await heroBox()
  const y = b.y + b.height / 2
  await touch('touchStart', b.x + b.width * 0.8, y)
  for (let i = 1; i <= 8; i++) { await touch('touchMove', b.x + b.width * 0.8 - i * 30, y + i); await page.waitForTimeout(16) }
  await touch('touchEnd')
  await page.waitForTimeout(900)
  const tabs = await page.evaluate(() => [...document.querySelectorAll('.tab-panel')].map((p) => (p.getAttribute('data-tab') || p.id || '?') + (p.hasAttribute('data-off') ? ':off' : ':on')))
  ok((await sheetOpen()) === 0, 'свайп по балансу — шторка не открылась')
  const onTab = await page.evaluate(() => [...document.querySelectorAll('nav button[aria-current="page"], nav [aria-selected="true"], nav [aria-current]')].map((e) => e.textContent.trim()))
  ok(onTab.some((t) => /Аналитика/.test(t)), 'свайп по балансу — открылась Аналитика', { onTab, tabs })

  // Назад на Главную кнопкой вкладки.
  await page.getByRole('button', { name: /Главная/ }).first().click()
  await page.waitForTimeout(900)

  // 2. Вертикальная прокрутка, начатая на балансе, — шторки нет.
  b = await heroBox()
  await touch('touchStart', b.x + b.width / 2, b.y + b.height - 10)
  for (let i = 1; i <= 8; i++) { await touch('touchMove', b.x + b.width / 2 + 1, b.y + b.height - 10 - i * 25); await page.waitForTimeout(16) }
  await touch('touchEnd')
  await page.waitForTimeout(900)
  ok((await sheetOpen()) === 0, 'прокрутка с баланса — шторка не открылась')

  // 3. Короткий тап — шторка записи.
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(300)
  b = await heroBox()
  await touch('touchStart', b.x + b.width / 2, b.y + b.height / 2)
  await page.waitForTimeout(60)
  await touch('touchEnd')
  await page.waitForTimeout(900)
  ok((await sheetOpen()) === 1, 'тап по балансу — шторка записи')
  ok(!(await page.locator('[aria-modal=true]').getByRole('button', { name: 'Другая валюта' }).count()), 'с записями валюта свёрнута')
  ok(errs.length === 0, 'ошибок нет', errs)
  await browser.close()
  console.log(fails ? `\n${fails} FAIL` : '\nвсё OK')
  process.exit(fails ? 1 : 0)
})()
