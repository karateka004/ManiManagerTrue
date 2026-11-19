/**
 * Съёмка настоящего приложения для ролика в TikTok («потратил всё на GTA 6 —
 * пора заняться бюджетом»): сборка из dist/ (vite preview), данные в евро (аудитория — русскоязычные в Европе),
 * тёмная тема, рейтинг — выдуманные игроки (ответ воркера подменён).
 * Кадры — screencast Chromium со временем каждого кадра; касания и отметки
 * эпизодов (marks) — дорожками, их рисует сцена promo/tiktok.html.
 *
 *   npx vite preview --port 4173   (в корне, после npm run build)
 *   node promo/capture-tiktok.cjs [url]   → promo/out/capture-tiktok/
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

const URL = process.argv[2] || 'http://localhost:4173/'
const OUT = path.join(__dirname, 'out', 'capture-tiktok')
const W = 390
const H = 844
const DPR = 2
const ME = 1001

/** Telegram без Telegram: пользователь есть (initData не пустой — рейтинг запрашивается), тема тёмная. */
const TG_STUB = `
(() => {
  const noop = () => {}
  const deep = () => new Proxy(function () {}, { get: (t, k) => (k === 'isVisible' ? false : deep()), apply: () => undefined })
  const wa = {
    initData: 'user=%7B%22id%22%3A${ME}%7D&hash=promo', initDataUnsafe: { user: { id: ${ME}, first_name: 'Алекс', language_code: 'ru', allows_write_to_pm: true } },
    colorScheme: 'dark', themeParams: {}, platform: 'ios', version: '8.0',
    isVersionAtLeast: () => true, ready: noop, expand: noop, setHeaderColor: noop, setBackgroundColor: noop, setBottomBarColor: noop,
    onEvent: noop, offEvent: noop, disableVerticalSwipes: noop, enableVerticalSwipes: noop,
    HapticFeedback: { impactOccurred: noop, selectionChanged: noop, notificationOccurred: noop },
    BackButton: { show: noop, hide: noop, onClick: noop, offClick: noop },
  }
  window.Telegram = { WebApp: new Proxy(wa, { get: (t, k) => (k in t ? t[k] : deep()) }) }
})()`

/**
 * Рейтинг: выдуманные игроки, только геймификация (XP, серии). Свой XP — как в
 * приложении (операции × 12 + бонус), чтобы таблица сходилась с «Прогрессом»:
 * трое выше, остальные ниже.
 */
function leaderboard(myXp) {
  const at = Date.now()
  // Пороги уровней — как LEVELS в src/lib/levels.ts.
  const level = (xp) => [0, 60, 180, 400, 750, 1300, 2200, 3500, 5200, 7500].filter((min) => xp >= min).length
  const row = (id, name, xp, streakBest, refs) => ({ id, name, xp, level: level(xp), ops: Math.round(xp / 12), coins: Math.round(xp / 9), streakBest, refs, at })
  const top = [
    row(11, 'Лиза', 9840, 64, 5),
    row(12, 'Тимур', 7960, 41, 2),
    row(13, 'Даша', myXp + 1480, 38, 7),
    row(ME, 'Алекс', myXp, 21, 1),
    row(14, 'Макс', myXp - 310, 19, 0),
    row(15, 'Артём', myXp - 820, 12, 3),
    row(16, 'Соня', 1640, 9, 0),
    row(17, 'Кирилл', 980, 6, 1),
  ]
  const refs = [...top].sort((a, b) => b.refs - a.refs)
  return {
    ok: true,
    total: 1250,
    xp: { top, me: { ...top[3], rank: 4 } },
    refs: { top: refs, me: { ...top[3], rank: refs.findIndex((r) => r.id === ME) + 1 } },
  }
}

/** Данные: ~16 недель жизни в евро (в «Динамике» — полные месяцы); на прошлой неделе — PS5 Pro и телевизор под неё, месяц в минусе. */
function seed() {
  if (sessionStorage.getItem('seeded')) return
  sessionStorage.setItem('seeded', '1')
  localStorage.clear()
  for (const [k, v] of [
    ['koshel:onboarded', '1'],
    ['koshel:lastVersion', '2.9.0'],
    ['koshel:curAsked', '1'],
    ['koshel:remindAsked', '1'],
    ['koshel:botWrite', '1'],
    ['koshel:tourDone', '1'],
    ['koshel:clarity', '0'],
  ])
    localStorage.setItem(k, v)
  let s = 7
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648
  const pick = (a) => a[Math.floor(rnd() * a.length)]
  const eur = (lo, hi, step = 0.5) => Math.round((lo + rnd() * (hi - lo)) / step) * step
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
    tx.push({ id: 'c' + d.getTime().toString(36) + (n++).toString(36), type, amount, categoryId, date: d.toISOString(), ...(note ? { note } : {}), currency: 'EUR' })
  for (let day = 111; day >= 1; day--) {
    const d = at(day, 9)
    const dom = d.getDate()
    if (dom === 1) add(at(day, 10), 'income', 2400, 'salary', 'Зарплата')
    if (dom === 10) add(at(day, 18), 'income', 450, 'freelance', 'Подработка')
    if (dom === 2) add(at(day, 12), 'expense', 950, 'home', 'Аренда')
    if (dom === 5) add(at(day, 13), 'expense', 20, 'phone', 'Связь')
    if (dom === 7) add(at(day, 19), 'expense', 35, 'sport', 'Зал')
    if (rnd() < 0.75) add(at(day, 8), 'expense', eur(3, 5), 'cafe', pick(['Кофе', 'Капучино', 'Флэт уайт']))
    if (rnd() < 0.4) add(at(day, 13), 'expense', eur(10, 16), 'cafe', 'Обед')
    if (day % 3 === 0) add(at(day, 18), 'expense', eur(28, 78), 'food', 'Продукты')
    if (rnd() < 0.3) add(at(day, 20), 'expense', eur(9, 19), 'transport', 'Такси')
    else if (rnd() < 0.5) add(at(day, 8), 'expense', 2.5, 'transport', 'Метро')
    if (rnd() < 0.07) add(at(day, 21), 'expense', eur(14, 40), 'fun', pick(['Кино', 'Концерт', 'Боулинг']))
    if (rnd() < 0.05) add(at(day, 17), 'expense', eur(9, 30), 'health', 'Аптека')
  }
  // Сама история: приставка под новую игру — и телевизор, чтобы «как в трейлере».
  add(at(5, 19), 'expense', 799, 'fun', 'PS5 Pro')
  add(at(5, 19), 'expense', 75, 'fun', 'Второй геймпад')
  add(at(4, 20), 'expense', 690, 'fun', 'Телевизор 4K')
  tx.sort((a, b) => b.date.localeCompare(a.date))
  localStorage.setItem(
    'finance-mini-app:v1',
    JSON.stringify({
      state: {
        transactions: tx,
        currency: 'EUR',
        lastTxCurrency: 'EUR',
        lang: 'ru',
        themeMode: 'dark',
        coins: 412,
        bonusXp: 600,
      },
      version: 18,
    }),
  )
}

;(async () => {
  const { chromium } = loadPlaywright()
  fs.rmSync(OUT, { recursive: true, force: true })
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch()
  // Съёмка — «днём»: пояс, где сейчас около двух часов дня (приветствие «Добрый день»).
  const off = (((14 - new Date().getUTCHours()) % 24) + 24) % 24
  const shift = off > 14 ? off - 24 : off
  const timezoneId = shift === 0 ? 'Etc/GMT' : `Etc/GMT${shift > 0 ? '-' : '+'}${Math.abs(shift)}`
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true, locale: 'ru-RU', timezoneId })
  await ctx.route('https://telegram.org/**', (r) => r.fulfill({ contentType: 'application/javascript', body: TG_STUB }))
  await ctx.route('https://*.clarity.ms/**', (r) => r.abort())
  await ctx.addInitScript(seed)
  const page = await ctx.newPage()
  await ctx.route('https://koshel-worker.karateka004.workers.dev/**', async (r) => {
    if (!r.request().url().endsWith('/leaderboard')) return r.abort()
    const st = await page.evaluate(() => JSON.parse(localStorage.getItem('finance-mini-app:v1') || '{}').state || {})
    const myXp = (st.transactions?.length ?? 0) * 12 + (st.bonusXp ?? 0)
    return r.fulfill({ contentType: 'application/json', body: JSON.stringify(leaderboard(myXp)) })
  })
  page.on('pageerror', (e) => console.error('[страница]', e.message))
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.waitForTimeout(3000) // шрифты, соседние вкладки в простое

  const cdp = await ctx.newCDPSession(page)
  const frames = []
  const touches = []
  const marks = []
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
  while (t0 === null) await page.waitForTimeout(20)
  const wall0 = Date.now() / 1000 - (frames.at(-1)?.t ?? 0)
  const now = () => Date.now() / 1000 - wall0
  const mark = (id) => marks.push({ t: now(), id })
  const touch = async (type, x, y) => {
    touches.push({ t: now(), kind: type === 'touchStart' ? 'down' : type === 'touchEnd' ? 'up' : 'move', x, y })
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
  }
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
    const b = await locator.first().boundingBox()
    if (!b) throw new Error('нет элемента для касания')
    await tapAt(Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2))
  }
  const modal = '[aria-modal="true"]'

  // Главная: месяц в минусе.
  mark('home')
  await page.waitForTimeout(2200)

  // Запись: «+» → 79,99 → Развлечения → «GTA VI» → Записать.
  mark('add')
  await tapEl(page.locator('[data-tour="plus"]'))
  await page.waitForTimeout(700)
  for (const d of ['7', '9', ',', '9', '9']) {
    await tapEl(page.locator(`${modal} [data-tour="keypad"] button`, { hasText: new RegExp(`^${d}$`) }))
    await page.waitForTimeout(240)
  }
  await page.waitForTimeout(200)
  await tapEl(page.locator(`${modal} [data-tour="categories"] button`, { hasText: 'Развлеч' }))
  await page.waitForTimeout(400)
  await tapEl(page.locator(`${modal} input[placeholder^="Заметка"]`))
  await page.waitForTimeout(150)
  await page.keyboard.type('GTA VI', { delay: 70 })
  await page.waitForTimeout(350)
  await tapEl(page.locator(`${modal} [data-tour="save"]`))
  mark('saved')
  await page.waitForTimeout(2300)

  // Аналитика: расходы по категориям, доходы, динамика.
  mark('analytics')
  await swipe(318, 108, 470)
  await page.waitForTimeout(900)
  await tapEl(page.getByRole('button', { name: 'Расходы', exact: true }))
  await page.waitForTimeout(2000)
  mark('income')
  await tapEl(page.getByRole('button', { name: 'Доходы', exact: true }))
  await page.waitForTimeout(1500)
  mark('dynamics')
  await tapEl(page.getByRole('button', { name: 'Динамика', exact: true }))
  await page.waitForTimeout(1800)

  // Прогресс: уровень, задания — и рейтинг.
  mark('progress')
  await tapEl(page.locator('[data-tour="tab-rewards"]'))
  await page.waitForTimeout(1800)
  mark('leaderboard')
  await tapEl(page.getByRole('button', { name: /Таблица лидеров/ }))
  await page.waitForTimeout(2600)
  mark('end')

  await cdp.send('Page.stopScreencast')
  const duration = now()
  const timeline = { viewport: { w: W, h: H }, dpr: DPR, duration, frames, touches, marks }
  fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify(timeline, null, 1))
  fs.writeFileSync(path.join(OUT, 'timeline.js'), `window.TIMELINE = ${JSON.stringify(timeline)}\n`)
  console.log(`кадров ${frames.length} за ${duration.toFixed(2)} с; отметки: ${marks.map((m) => `${m.id}@${m.t.toFixed(1)}`).join(' ')}`)
  await browser.close()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
