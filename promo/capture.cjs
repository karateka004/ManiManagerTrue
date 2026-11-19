/**
 * Съёмка настоящего приложения для анимации поста в канале: сборка из dist/
 * (vite preview), аккуратные данные в $, тёмная тема. Кадры — screencast
 * Chromium с временем каждого кадра; касания — отдельной дорожкой, их рисует
 * сцена (promo/channel.html), а не приложение.
 *
 *   npx vite preview --port 4173   (в корне, после npm run build)
 *   node promo/capture.cjs [url] [--scenario add|analytics]
 *                                   → promo/out/capture/: кадры *.jpg, timeline.json и .js (для сцены)
 *
 * Сценарии: add (пост 2.7.1) — Аналитика свайпом туда-обратно и запись траты;
 * analytics (пост 2.11) — новая Аналитика: палец по графику «Потрачено»,
 * подсказки, категории, день календаря, палец по динамике.
 */
const fs = require('node:fs')
const path = require('node:path')

function loadPlaywright() {
  for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
    try {
      return require(p)
    } catch {}
  }
  throw new Error('Нужен playwright: npm i -g playwright')
}

const args = process.argv.slice(2)
const flagAt = args.findIndex((a) => a.startsWith('--scenario'))
const SCENARIO = flagAt < 0 ? 'add' : args[flagAt].includes('=') ? args[flagAt].split('=')[1] : args[flagAt + 1]
const URL = args.find((a, i) => !a.startsWith('--') && i !== flagAt + 1) || 'http://localhost:4173/'
if (!['add', 'analytics'].includes(SCENARIO)) throw new Error('сценарий: add или analytics')
const OUT = path.join(__dirname, 'out', 'capture')
const W = 390
const H = 844
const DPR = 2

/** Telegram без Telegram: пользователь есть, тема тёмная, всё остальное — пустышки. */
const TG_STUB = `
(() => {
  const noop = () => {}
  const deep = () => new Proxy(function () {}, { get: (t, k) => (k === 'isVisible' ? false : deep()), apply: () => undefined })
  const wa = {
    initData: '', initDataUnsafe: { user: { id: 1001, first_name: 'Алекс', language_code: 'ru' } },
    colorScheme: 'dark', themeParams: {}, platform: 'ios', version: '8.0',
    isVersionAtLeast: () => true, ready: noop, expand: noop, setHeaderColor: noop, setBackgroundColor: noop,
    onEvent: noop, offEvent: noop, disableVerticalSwipes: noop, enableVerticalSwipes: noop,
    HapticFeedback: { impactOccurred: noop, selectionChanged: noop, notificationOccurred: noop },
    BackButton: { show: noop, hide: noop, onClick: noop, offClick: noop },
  }
  window.Telegram = { WebApp: new Proxy(wa, { get: (t, k) => (k in t ? t[k] : deep()) }) }
})()`

/**
 * Данные: обычная жизнь в долларах, без привязки к стране. Для Аналитики —
 * четыре с лишним месяца: подсказкам нужны три прошлых периода к тому же дню.
 */
function seed({ days, version }) {
  if (sessionStorage.getItem('seeded')) return
  sessionStorage.setItem('seeded', '1')
  localStorage.clear()
  for (const [k, v] of [
    ['koshel:onboarded', '1'],
    ['koshel:lastVersion', version],
    ['koshel:tourDone', '1'],
    ['koshel:curAsked', '1'],
    ['koshel:remindAsked', '1'],
    ['koshel:botWrite', '1'],
  ])
    localStorage.setItem(k, v)
  let s = 11
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648
  const pick = (a) => a[Math.floor(rnd() * a.length)]
  const money = (lo, hi, cents = true) => {
    const v = lo + rnd() * (hi - lo)
    return cents ? Math.round(v * 2) / 2 : Math.round(v)
  }
  const tx = []
  const now = new Date()
  const at = (daysAgo, hour) => {
    const d = new Date(now)
    d.setDate(d.getDate() - daysAgo)
    d.setHours(hour, Math.floor(rnd() * 60), 0, 0)
    return d
  }
  let n = 0
  const add = (d, type, amount, categoryId, note) =>
    tx.push({ id: 'c' + d.getTime().toString(36) + (n++).toString(36), type, amount, categoryId, date: d.toISOString(), ...(note ? { note } : {}) })
  for (let day = days; day >= 1; day--) {
    const d = at(day, 9)
    const dom = d.getDate()
    if (dom === 1) add(at(day, 10), 'income', 4200, 'salary', 'Зарплата')
    if (dom === 15 && rnd() > 0.3) add(at(day, 18), 'income', money(450, 900, false), 'freelance', 'Проект')
    if (dom === 2) add(at(day, 12), 'expense', 980, 'home', 'Аренда')
    if (dom === 5) add(at(day, 13), 'expense', 25, 'phone', 'Связь')
    if (dom === 7) add(at(day, 19), 'expense', 45, 'sport', 'Зал')
    if (rnd() < 0.8) add(at(day, 8), 'expense', money(3.5, 6), 'cafe', pick(['Кофе', 'Капучино', 'Кофе']))
    if (rnd() < 0.45) add(at(day, 13), 'expense', money(10, 17), 'cafe', 'Обед')
    if (day % 3 === 0) add(at(day, 18), 'expense', money(28, 86), 'food', 'Продукты')
    if (rnd() < 0.35) add(at(day, 20), 'expense', money(9, 19), 'transport', 'Такси')
    else if (rnd() < 0.5) add(at(day, 8), 'expense', 2.5, 'transport', 'Метро')
    if (rnd() < 0.08) add(at(day, 21), 'expense', money(14, 40), 'fun', pick(['Кино', 'Концерт', 'Игра']))
    if (rnd() < 0.06) add(at(day, 17), 'expense', money(12, 34), 'health', 'Аптека')
    if (rnd() < 0.05) add(at(day, 16), 'expense', money(45, 120, false), 'clothes', pick(['Кроссовки', 'Куртка', 'Джинсы']))
  }
  tx.sort((a, b) => b.date.localeCompare(a.date))
  localStorage.setItem(
    'finance-mini-app:v1',
    JSON.stringify({
      state: {
        transactions: tx,
        currency: 'USD',
        lastTxCurrency: 'USD',
        lang: 'ru',
        themeMode: 'dark',
        monthlyBudget: 2600,
        coins: 340,
        bonusXp: 600,
      },
      version: 17,
    }),
  )
}

;(async () => {
  const { chromium } = loadPlaywright()
  fs.rmSync(OUT, { recursive: true, force: true })
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true, locale: 'ru-RU' })
  await ctx.route('https://telegram.org/**', (r) => r.fulfill({ contentType: 'application/javascript', body: TG_STUB }))
  await ctx.addInitScript(seed, SCENARIO === 'analytics' ? { days: 130, version: '2.11.0' } : { days: 70, version: '2.7.1' })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.error('[страница]', e.message))
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2600) // шрифты, соседние вкладки в простое

  const cdp = await ctx.newCDPSession(page)
  const frames = []
  const touches = []
  let t0 = null
  cdp.on('Page.screencastFrame', (f) => {
    const t = f.metadata.timestamp
    if (t0 === null) t0 = t
    const file = `${String(frames.length).padStart(4, '0')}.jpg`
    fs.writeFileSync(path.join(OUT, file), Buffer.from(f.data, 'base64'))
    frames.push({ file, t: t - t0 })
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {})
  })
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 94, maxWidth: W * DPR, maxHeight: H * DPR, everyNthFrame: 1 })
  // Первый кадр — точка отсчёта и для касаний.
  while (t0 === null) await page.waitForTimeout(20)
  const wall0 = Date.now() / 1000 - (frames.at(-1)?.t ?? 0)
  const mark = (kind, x, y) => touches.push({ t: Date.now() / 1000 - wall0, kind, x, y })
  const touch = async (type, x, y) => {
    mark(type === 'touchStart' ? 'down' : type === 'touchEnd' ? 'up' : 'move', x, y)
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
  }
  // Бросок пальцем: разгон и отпускание на ходу — как живой жест. Палец, который
  // замирает перед отпусканием (ease-out), на видео выглядел зависанием экрана.
  // Каждое касание через CDP — уже десятки миллисекунд, поэтому шагов немного.
  const swipe = async (x1, x2, y, steps = 8) => {
    await touch('touchStart', x1, y)
    for (let i = 1; i <= steps; i++) {
      await touch('touchMove', x1 + (x2 - x1) * Math.pow(i / steps, 1.35), y)
      await page.waitForTimeout(6)
    }
    await touch('touchEnd', x2, y)
  }
  const tapAt = async (x, y) => {
    await touch('touchStart', x, y)
    await page.waitForTimeout(70)
    await touch('touchEnd', x, y)
  }
  const tapEl = async (locator) => {
    const b = await locator.boundingBox()
    if (!b) throw new Error('нет элемента для касания')
    await tapAt(Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2))
  }
  const modal = '[aria-modal="true"]'
  // Палец ведёт по графику: плавно, с разгоном и торможением — как живая рука.
  const hdrag = async (x1, x2, y, steps = 26) => {
    await touch('touchStart', x1, y)
    await page.waitForTimeout(90)
    for (let i = 1; i <= steps; i++) {
      const k = i / steps
      await touch('touchMove', x1 + (x2 - x1) * (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2), y)
      await page.waitForTimeout(34)
    }
    await page.waitForTimeout(120)
    await touch('touchEnd', x2, y)
  }
  // Прокрутка «пальцем»: страницу ведём сами (scrollTo по кадрам), а палец
  // рисуем по той же дорожке. Настоящие касания здесь не годятся: начало жеста
  // на строке категории браузер иногда засчитывал как нажатие — открывалась
  // карточка категории, а за ней и правка записи. Без инерции: лист встаёт
  // ровно там, куда довели.
  const vdrag = async (dy, x = 195, from = 660) => {
    const y0 = await page.evaluate(() => scrollY)
    const steps = 16
    mark('down', x, from)
    await page.waitForTimeout(70)
    for (let i = 1; i <= steps; i++) {
      const k = i / steps
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
      await page.evaluate((y) => window.scrollTo(0, y), y0 + dy * e)
      mark('move', x, from - dy * e)
      await page.waitForTimeout(16)
    }
    await page.waitForTimeout(110)
    mark('up', x, from - dy)
  }
  /** Довести заголовок раздела до y на экране — одним-двумя движениями пальца. */
  const bringTitle = async (title, y = 92) => {
    for (let i = 0; i < 3; i++) {
      const top = await page.evaluate((title) => {
        const h = [...document.querySelectorAll('.tab-panel:not([data-off]) h2')].find((e) => e.textContent.trim() === title)
        return h ? h.getBoundingClientRect().top : null
      }, title)
      if (top === null) throw new Error('нет раздела ' + title)
      const dy = Math.round(top - y)
      if (Math.abs(dy) < 12) return
      await vdrag(Math.max(-430, Math.min(430, dy)))
      await page.waitForTimeout(260)
    }
  }

  if (SCENARIO === 'analytics') {
    const P = '.tab-panel:not([data-off])'
    await page.waitForTimeout(900)
    await tapEl(page.locator('[data-tour="tab-analytics"]'))
    await page.waitForTimeout(1500)
    // «Потрачено»: палец по прошедшим дням — пузырь с датой и суммой.
    let b = await page.locator(`${P} [data-tour="spent"] [data-swipe-ignore]`).first().boundingBox()
    await hdrag(b.x + b.width * 0.08, b.x + b.width * 0.56, b.y + b.height * 0.55)
    await page.waitForTimeout(900)
    // Подсказки.
    await bringTitle('Подсказки')
    await page.waitForTimeout(1700)
    // Категории.
    await bringTitle('Категории')
    await page.waitForTimeout(1500)
    // Календарь: день с тратами — шторка дня со списком.
    await bringTitle('Календарь')
    await page.waitForTimeout(800)
    const day = await page.evaluate((P) => {
      const all = [...document.querySelectorAll(`${P} button[aria-label*="−"]:not([disabled])`)]
      const seen = all.filter((e) => { const r = e.getBoundingClientRect(); return r.top > 120 && r.bottom < innerHeight - 140 })
      const e = seen[Math.min(seen.length - 1, 9)]
      if (!e) return null
      const r = e.getBoundingClientRect()
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
    }, P)
    if (!day) throw new Error('нет дня с тратами на экране')
    await tapAt(day.x, day.y)
    await page.waitForTimeout(1900)
    await tapEl(page.locator(`${modal} button[aria-label="Закрыть"]`).last())
    await page.waitForTimeout(800)
    // Динамика: палец по столбикам месяцев.
    await bringTitle('Динамика')
    await page.waitForTimeout(700)
    b = await page.locator(`${P} [data-swipe-ignore][style*="pan-y"]`).nth(1).boundingBox()
    await hdrag(b.x + b.width * 0.12, b.x + b.width * 0.9, b.y + b.height * 0.6)
    await page.waitForTimeout(1400)
  } else {
  await page.waitForTimeout(1000)
  await swipe(318, 108, 470) // Главная → Аналитика
  await page.waitForTimeout(1900)
  await swipe(72, 282, 470) // и назад
  await page.waitForTimeout(900)
  await tapEl(page.locator('button[aria-label="Добавить операцию"]'))
  await page.waitForTimeout(750)
  for (const d of ['2', '4']) {
    await tapEl(page.locator(`${modal} button`, { hasText: new RegExp(`^${d}$`) }).first())
    await page.waitForTimeout(330)
  }
  await page.waitForTimeout(200)
  await tapEl(page.locator(`${modal} button[aria-pressed]`, { hasText: 'Кафе' }).first())
  await page.waitForTimeout(550)
  await tapEl(page.locator(`${modal} button`, { hasText: /^Записать/ }).first())
  await page.waitForTimeout(2600)
  }

  await cdp.send('Page.stopScreencast')
  const duration = Date.now() / 1000 - wall0
  const timeline = { viewport: { w: W, h: H }, dpr: DPR, duration, frames, touches }
  fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify(timeline, null, 1))
  // Сцена открывается с диска (file://), а fetch туда не ходит — даём скриптом.
  fs.writeFileSync(path.join(OUT, 'timeline.js'), `window.TIMELINE = ${JSON.stringify(timeline)}\n`)
  const gaps = frames.slice(1).map((f, i) => f.t - frames[i].t).sort((a, b) => a - b)
  console.log(`кадров ${frames.length} за ${duration.toFixed(2)} с; шаг кадров: медиана ${(gaps[gaps.length >> 1] * 1000).toFixed(0)} мс, худший ${(gaps.at(-1) * 1000).toFixed(0)} мс; касаний ${touches.length}`)
  await browser.close()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
