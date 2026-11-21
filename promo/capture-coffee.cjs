/**
 * Съёмка настоящего приложения для второго ролика в TikTok («кофе — это же
 * мелочь»): сборка из dist/ (vite preview), данные в евро с 1 января, тёмная
 * тема, утро (≈ 8:40 по местному). Капучино почти каждый день — и Аналитика за
 * год сама складывает «мелочь» в крупную сумму.
 *
 * Кадры — screencast Chromium со временем каждого кадра; касания и отметки
 * эпизодов (marks) — дорожками, их рисует сцена promo/tiktok-coffee.html.
 * Сегодняшний кофе — та же запись, что бот делает из «Ушло 3,80 на капучино»
 * (без заметки: правила оставляют только категорию и сумму).
 *
 *   npx vite preview --port 4173   (в корне, после npm run build)
 *   node promo/capture-coffee.cjs [url]   → promo/out/capture-coffee/
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
const OUT = path.join(__dirname, 'out', 'capture-coffee')
const W = 390
const H = 844
const DPR = 2

/** Telegram без Telegram: пользователь есть, тема тёмная, всё остальное — пустышки. */
const TG_STUB = `
(() => {
  const noop = () => {}
  const deep = () => new Proxy(function () {}, { get: (t, k) => (k === 'isVisible' ? false : deep()), apply: () => undefined })
  const wa = {
    initData: '', initDataUnsafe: { user: { id: 1001, first_name: 'Алекс', language_code: 'ru', allows_write_to_pm: true } },
    colorScheme: 'dark', themeParams: {}, platform: 'ios', version: '8.0',
    isVersionAtLeast: () => true, ready: noop, expand: noop, setHeaderColor: noop, setBackgroundColor: noop, setBottomBarColor: noop,
    onEvent: noop, offEvent: noop, disableVerticalSwipes: noop, enableVerticalSwipes: noop,
    HapticFeedback: { impactOccurred: noop, selectionChanged: noop, notificationOccurred: noop },
    BackButton: { show: noop, hide: noop, onClick: noop, offClick: noop },
  }
  window.Telegram = { WebApp: new Proxy(wa, { get: (t, k) => (k in t ? t[k] : deep()) }) }
})()`

/**
 * Год жизни в евро с 1 января: зарплата и подработка, аренда, продукты, метро
 * и такси — и капучино почти каждое утро (по пятницам — с круассаном). Крупных
 * разовых покупок нет: подсказки за год должны говорить о мелочи, а не о
 * телевизоре. Сегодня — только утренний кофе, записанный ботом.
 */
function seed(version) {
  if (sessionStorage.getItem('seeded')) return
  sessionStorage.setItem('seeded', '1')
  localStorage.clear()
  for (const [k, v] of [
    ['koshel:onboarded', '1'],
    ['koshel:lastVersion', version],
    ['koshel:curAsked', '1'],
    ['koshel:remindAsked', '1'],
    ['koshel:botWrite', '1'],
    ['koshel:tourDone', '1'],
    ['koshel:clarity', '0'],
  ])
    localStorage.setItem(k, v)
  let s = 11
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648
  const pick = (a) => a[Math.floor(rnd() * a.length)]
  const eur = (lo, hi, step = 0.5) => Math.round((lo + rnd() * (hi - lo)) / step) * step
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const start = new Date(now.getFullYear(), 0, 1)
  const tx = []
  let n = 0
  const add = (d, type, amount, categoryId, note) =>
    tx.push({ id: 'c' + d.getTime().toString(36) + (n++).toString(36), type, amount, categoryId, date: d.toISOString(), ...(note ? { note } : {}), currency: 'EUR' })
  for (let day = new Date(start), i = 0; day < today; day.setDate(day.getDate() + 1), i++) {
    const at = (hour) => {
      const d = new Date(day)
      d.setHours(hour, Math.floor(rnd() * 60), 0, 0)
      return d
    }
    const dom = day.getDate()
    if (dom === 1) add(at(10), 'income', 2400, 'salary', 'Зарплата')
    if (dom === 10) add(at(18), 'income', 450, 'freelance', 'Подработка')
    if (dom === 2) add(at(12), 'expense', 950, 'home', 'Аренда')
    if (dom === 5) add(at(13), 'expense', 20, 'phone', 'Связь')
    if (dom === 7) add(at(19), 'expense', 35, 'sport', 'Зал')
    if (rnd() < 0.93) {
      if (day.getDay() === 5) add(at(8), 'expense', 6.4, 'cafe', 'Капучино и круассан')
      else if (rnd() < 0.15) add(at(8), 'expense', 4.2, 'cafe', 'Флэт уайт')
      else add(at(8), 'expense', 3.8, 'cafe', 'Капучино')
    }
    if (i % 3 === 0) add(at(18), 'expense', eur(28, 78), 'food', 'Продукты')
    if (rnd() < 0.25) add(at(20), 'expense', eur(9, 19), 'transport', 'Такси')
    else if (rnd() < 0.5) add(at(9), 'expense', 2.5, 'transport', 'Метро')
    if (rnd() < 0.07) add(at(21), 'expense', eur(14, 40), 'fun', pick(['Кино', 'Концерт', 'Боулинг']))
    if (rnd() < 0.04) add(at(17), 'expense', eur(9, 30), 'health', 'Аптека')
    if (rnd() < 0.012) add(at(16), 'expense', eur(35, 90, 1), 'clothes', pick(['Кроссовки', 'Джинсы', 'Куртка']))
  }
  // Сегодняшний кофе — его только что записал бот (минуту назад, не «наперёд»).
  add(new Date(now.getTime() - 60_000), 'expense', 3.8, 'cafe')
  tx.sort((a, b) => b.date.localeCompare(a.date))
  localStorage.setItem(
    'finance-mini-app:v1',
    JSON.stringify({
      state: { transactions: tx, currency: 'EUR', lastTxCurrency: 'EUR', lang: 'ru', themeMode: 'dark', coins: 236, bonusXp: 300 },
      version: 18,
    }),
  )
}

;(async () => {
  const { chromium } = loadPlaywright()
  fs.rmSync(OUT, { recursive: true, force: true })
  fs.mkdirSync(OUT, { recursive: true })
  const version = /APP_VERSION = '([^']+)'/.exec(fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'introKeys.ts'), 'utf8'))[1]
  const browser = await chromium.launch()
  // Съёмка — «утром»: пояс, где сейчас около 8 утра (кофе только что записан, «Доброе утро»).
  const off = (((8 - new Date().getUTCHours()) % 24) + 24) % 24
  const shift = off > 14 ? off - 24 : off
  const timezoneId = shift === 0 ? 'Etc/GMT' : `Etc/GMT${shift > 0 ? '-' : '+'}${Math.abs(shift)}`
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true, locale: 'ru-RU', timezoneId })
  await ctx.route('https://telegram.org/**', (r) => r.fulfill({ contentType: 'application/javascript', body: TG_STUB }))
  await ctx.route('https://*.clarity.ms/**', (r) => r.abort())
  await ctx.route('https://koshel-worker.karateka004.workers.dev/**', (r) => r.abort())
  await ctx.addInitScript(seed, version)
  const page = await ctx.newPage()
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
  const track = (kind, x, y) => touches.push({ t: now(), kind, x, y })
  const touch = async (type, x, y) => {
    track(type === 'touchStart' ? 'down' : type === 'touchEnd' ? 'up' : 'move', x, y)
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
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
  // Палец ведёт по графику: плавно, с разгоном и торможением — как живая рука.
  const hdrag = async (x1, x2, y, steps = 24) => {
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
  // Прокрутка «пальцем»: прокручиваем сами (scrollTo по кадрам), палец рисуем
  // по той же дорожке — настоящий жест на строке категории браузер засчитывал
  // нажатием (см. capture.cjs). scroller — окно или прокручиваемый лист шторки.
  const vdrag = async (dy, { x = 195, from = 560, sheet = false } = {}) => {
    const scroll = (y) =>
      page.evaluate(
        ([y, sheet]) => {
          const el = sheet ? [...document.querySelectorAll('[aria-modal="true"]')].at(-1) : null
          if (el) el.scrollTop = y
          else window.scrollTo(0, y)
          return el ? el.scrollTop : scrollY
        },
        [y, sheet],
      )
    const y0 = await page.evaluate((sheet) => {
      const el = sheet ? [...document.querySelectorAll('[aria-modal="true"]')].at(-1) : null
      return el ? el.scrollTop : scrollY
    }, sheet)
    const steps = 16
    track('down', x, from)
    await page.waitForTimeout(70)
    for (let i = 1; i <= steps; i++) {
      const k = i / steps
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
      await scroll(y0 + dy * e)
      track('move', x, from - dy * e)
      await page.waitForTimeout(16)
    }
    await page.waitForTimeout(110)
    track('up', x, from - dy)
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
  const P = '.tab-panel:not([data-off])'
  const modal = '[aria-modal="true"]'

  // Главная: утро, сегодняшний кофе уже в списке.
  mark('home')
  await page.waitForTimeout(1500)

  // Аналитика → период «Год».
  mark('analytics')
  await tapEl(page.locator('[data-tour="tab-analytics"]'))
  await page.waitForTimeout(1100)
  await tapEl(page.locator(`${P} button[aria-label="Период"]`))
  await page.waitForTimeout(450)
  mark('year')
  await tapEl(page.locator(`${P} button`, { hasText: /^Год$/ }))
  await page.waitForTimeout(1000)
  // «Потрачено» за год: палец по графику.
  const b = await page.locator(`${P} [data-tour="spent"] [data-swipe-ignore]`).first().boundingBox()
  mark('scrub')
  await hdrag(b.x + b.width * 0.1, b.x + b.width * 0.82, b.y + b.height * 0.55)
  await page.waitForTimeout(600)

  // Подсказки: «Мелочь складывается».
  await bringTitle('Подсказки')
  mark('insights')
  const insight = await page.evaluate((P) => {
    const h = [...document.querySelectorAll(`${P} h2`)].find((e) => e.textContent.trim() === 'Подсказки')
    return h?.closest('section')?.querySelector('.glass')?.innerText ?? ''
  }, P)
  await page.waitForTimeout(2200)

  // Категории → «Кафе»: карточка с полугодом и списком капучино.
  await bringTitle('Категории')
  await page.waitForTimeout(500)
  mark('cafe')
  await tapEl(page.locator(`${P} button`, { hasText: /^Кафе/ }))
  await page.waitForTimeout(1500)
  mark('list')
  const sheetAmount = await page.evaluate(() => [...document.querySelectorAll('[aria-modal="true"]')].at(-1)?.querySelector('.tabular')?.textContent ?? '')
  await vdrag(420, { sheet: true })
  await page.waitForTimeout(500)
  await vdrag(420, { sheet: true })
  await page.waitForTimeout(1600)
  mark('end')

  await cdp.send('Page.stopScreencast')
  const duration = now()
  // Числа для подписей сцены — из того же стора, что на экране.
  const facts = await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('finance-mini-app:v1')).state
    const y = new Date().getFullYear()
    const year = st.transactions.filter((t) => new Date(t.date).getFullYear() === y)
    const cafe = year.filter((t) => t.categoryId === 'cafe')
    return { cafe: cafe.reduce((a, t) => a + t.amount, 0), cups: cafe.length, ops: st.transactions.length }
  })
  facts.insight = insight
  facts.sheetAmount = sheetAmount
  const timeline = { viewport: { w: W, h: H }, dpr: DPR, duration, frames, touches, marks, facts }
  fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify(timeline, null, 1))
  fs.writeFileSync(path.join(OUT, 'timeline.js'), `window.TIMELINE = ${JSON.stringify(timeline)}\n`)
  const gaps = frames.slice(1).map((f, i) => f.t - frames[i].t).sort((a, b) => a - b)
  console.log(`кадров ${frames.length} за ${duration.toFixed(2)} с; худший шаг ${(gaps.at(-1) * 1000).toFixed(0)} мс`)
  console.log(`отметки: ${marks.map((m) => `${m.id}@${m.t.toFixed(1)}`).join(' ')}`)
  console.log('факты:', JSON.stringify(facts))
  await browser.close()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
