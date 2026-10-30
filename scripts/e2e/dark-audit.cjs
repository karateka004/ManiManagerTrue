// Тёмная тема по всему приложению (сборка на vite preview :4180): экраны,
// подэкраны и шторки на демо-данных. На каждом снимке — доля светлых пикселей
// (яркость > 0.82) и самые большие светлые элементы в DOM: так видно забытую
// светлую поверхность. Снимки — в shots/dark-*.png.
const { chromium } = require('playwright')
const path = require('node:path')
const fs = require('node:fs')
const OUT = path.join(__dirname, 'shots')
fs.mkdirSync(OUT, { recursive: true })

const theme = process.argv[2] || 'dark'
const BASE = process.env.BASE || 'http://localhost:4180/'
let bright = 0
;(async () => {
  const b = await chromium.launch()
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true })
  await ctx.route('https://telegram.org/**', (r) => r.fulfill({ contentType: 'application/javascript', body: '' }))
  await ctx.route('https://*.clarity.ms/**', (r) => r.abort())
  await ctx.route('https://koshel-worker.karateka004.workers.dev/**', (r) => r.abort())
  await ctx.addInitScript((theme) => {
    if (!sessionStorage.getItem('p')) {
      localStorage.setItem('finance-mini-app:v1', JSON.stringify({ state: { transactions: [], themeMode: theme, currency: 'UAH', demoMode: true }, version: 18 }))
      localStorage.setItem('koshel:onboarded', '1')
      localStorage.setItem('koshel:lastVersion', '2.8.0')
      sessionStorage.setItem('p', '1')
    }
    const noop = () => {}
    window.Telegram = { WebApp: { initData: '', initDataUnsafe: { user: { id: 439944083, first_name: 'Святослав' } }, platform: 'ios', version: '8.0', colorScheme: 'light', themeParams: {}, isVersionAtLeast: () => true, ready: noop, expand: noop, setHeaderColor: noop, setBackgroundColor: noop, setBottomBarColor: noop, onEvent: noop, offEvent: noop, disableVerticalSwipes: noop, enableVerticalSwipes: noop, openLink: noop, openTelegramLink: noop, showConfirm: (m, cb) => cb(false), HapticFeedback: { impactOccurred: noop, notificationOccurred: noop, selectionChanged: noop }, BackButton: { show: noop, hide: noop, onClick: noop, offClick: noop } } }
  }, theme)
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))
  await page.goto(BASE)
  await page.waitForTimeout(2000)

  // Яркие крупные элементы: фон светлее 0.82 и площадь больше 3000 px².
  const brightEls = () => page.evaluate(() => {
    const lum = (c) => { const m = c.match(/\d+(\.\d+)?/g); if (!m) return 0; const [r, g, bl, a = 1] = m.map(Number); if (a < 0.5) return 0; return (0.2126 * r + 0.7152 * g + 0.0722 * bl) / 255 }
    const out = []
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || cs.display === 'none') continue
      const r = el.getBoundingClientRect()
      if (r.width * r.height < 3000 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue
      if (el.closest('[data-off]')) continue
      const l = lum(cs.backgroundColor)
      if (l > 0.82) out.push({ tag: el.tagName, cls: String(el.className).slice(0, 90), l: Math.round(l * 100) / 100, w: Math.round(r.width), h: Math.round(r.height), txt: (el.textContent || '').trim().slice(0, 30) })
    }
    return out.slice(0, 6)
  })
  const shot = async (name) => {
    await page.waitForTimeout(700)
    const file = path.join(OUT, `${theme}-${name}.png`)
    const buf = await page.screenshot({ path: file })
    const els = await brightEls()
    if (els.length) bright++
    console.log(name.padEnd(22), els.length ? 'СВЕТЛЫЕ: ' + JSON.stringify(els) : 'ок')
  }
  const tab = async (name) => { await page.getByRole('button', { name }).first().click(); await page.waitForTimeout(500) }
  const esc = async () => { await page.keyboard.press('Escape'); await page.waitForTimeout(600) }

  await shot('home')
  await page.getByRole('button', { name: 'Добавить операцию' }).first().click(); await shot('sheet-add'); await esc()
  await page.getByRole('button', { name: 'Поиск по операциям' }).first().click(); await shot('sheet-search'); await esc()
  await page.getByRole('button', { name: 'Открыть ассистента' }).first().click(); await shot('sheet-assistant'); await esc()
  const budget = page.getByText('Задать бюджет месяца').first()
  if (await budget.count()) { await budget.click(); await shot('sheet-planning'); await esc() }
  await tab('Аналитика'); await shot('analytics')
  for (const sub of ['Доходы', 'Динамика', 'Календарь']) {
    const b2 = page.getByRole('button', { name: sub }).first()
    if (await b2.count()) { await b2.click(); await shot('analytics-' + sub) }
  }
  await tab('Прогресс'); await shot('rewards')
  await page.mouse.wheel(0, 900); await shot('rewards-scrolled')
  const shopBtn = page.getByRole('button', { name: /Магазин/ }).first()
  if (await shopBtn.count()) { await shopBtn.click(); await shot('shop'); await esc() }
  await tab('Профиль'); await shot('profile')
  const lb = page.getByRole('button', { name: /Таблица лидеров/ }).first()
  if (await lb.count()) { await lb.click(); await shot('sheet-leaderboard'); await esc() }
  const wn = page.getByRole('button', { name: /Обновления/ }).first()
  if (await wn.count()) { await wn.click(); await shot('sheet-whatsnew'); await esc() }
  const st = page.getByRole('button', { name: /Настройки/ }).first()
  if (await st.count()) {
    await st.click(); await shot('settings')
    await page.mouse.wheel(0, 1200); await shot('settings-scrolled')
    const cur = page.getByRole('button', { name: /Гривна|гривна|Hryvnia/ }).first()
    if (await cur.count()) { await cur.click(); await shot('sheet-currency'); await esc() }
  }
  if (errs.length) console.log('ОШИБКИ:', errs)
  await b.close()
  // В тёмной светлых поверхностей быть не должно; в светлой они — норма.
  const failed = errs.length > 0 || (theme === 'dark' && bright > 0)
  console.log(failed ? '\nЕСТЬ ПРОБЛЕМЫ' : '\nвсё OK')
  process.exit(failed ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
