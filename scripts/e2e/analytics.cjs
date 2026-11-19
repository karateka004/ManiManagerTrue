// Аналитика 2.11 (vite preview :4180): виджеты одной лентой. Проверяем, что всё
// живое: меню периода и стрелки, палец по графику героя и динамики, подсказки с
// действиями (карточка категории, лимит), категории (доходы, «Все категории»),
// календарь → шторка дня → правка записи, «Спроси Кошель» → ассистент с вопросом.
// Плюс: пустая аналитика у новичка, 320 px без горизонтальной прокрутки, светлая тема.
// Данные — свои, выдуманные (~1500 записей за 8 месяцев), на любой день месяца.
const { chromium } = require('playwright')
const path = require('node:path')
const fs = require('node:fs')

const BASE = process.env.BASE || 'http://localhost:4180/'
const OUT = path.join(__dirname, 'shots')
fs.mkdirSync(OUT, { recursive: true })
let fails = 0
const ok = (c, m, extra) => {
  if (!c) fails++
  console.log((c ? 'OK   ' : 'FAIL ') + m + (c || extra === undefined ? '' : '  ' + JSON.stringify(extra)))
}

/** Траты каждый день, аренда 5-го, связь 12-го, зарплата 10-го и 25-го. */
function makeTransactions() {
  let s = 17
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - 8, 1)
  const out = []
  let n = 0
  const add = (at, type, amount, categoryId, note = '') =>
    out.push({ id: 'e' + (+at).toString(36) + (n++).toString(36), type, amount, categoryId, date: at.toISOString(), note, currency: 'RUB' })
  for (let d = new Date(start); d <= now; d.setDate(d.getDate() + 1)) {
    const y = d.getFullYear()
    const m = d.getMonth()
    const day = d.getDate()
    const at = (h) => new Date(y, m, day, h, 15)
    if (at(9) > now) break
    add(at(9), 'expense', Math.round((300 + rnd() * 2500) / 10) * 10, 'food', rnd() < 0.6 ? 'Продукты' : '')
    if (rnd() < 0.5) add(at(13), 'expense', Math.round((150 + rnd() * 900) / 10) * 10, 'cafe', 'Кофе')
    if (rnd() < 0.4) add(at(18), 'expense', Math.round((60 + rnd() * 700) / 10) * 10, 'transport', 'Такси')
    if (rnd() < 0.05) add(at(16), 'expense', Math.round((2000 + rnd() * 9000) / 10) * 10, 'clothes', 'Кроссовки')
    if (day === 5) add(at(12), 'expense', 38000, 'home', 'Аренда')
    if (day === 12) add(at(12), 'expense', 650, 'phone', 'Связь')
    if (day === 10) add(at(12), 'income', 62000, 'salary', 'Аванс')
    if (day === 25) add(at(12), 'income', 58000, 'salary', 'Зарплата')
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1))
}

const blob = (state) => JSON.stringify({ state: { currency: 'RUB', lastTxCurrency: 'RUB', themeMode: 'dark', ...state }, version: 18 })
const BASE_PRESET = { 'koshel:onboarded': '1', 'koshel:lastVersion': '9.9.9', 'koshel:curAsked': '1', 'koshel:tourDone': '1', 'koshel:remindAsked': '1' }

async function newApp(browser, { preset, scheme = 'dark', width = 390, height = 844 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, timezoneId: 'Europe/Moscow', colorScheme: scheme })
  await ctx.route('https://telegram.org/**', (r) => r.fulfill({ contentType: 'application/javascript', body: '' }))
  await ctx.route('https://*.clarity.ms/**', (r) => r.abort())
  const asked = []
  await ctx.route('https://koshel-worker.karateka004.workers.dev/**', (r) => {
    const url = r.request().url()
    if (url.includes('/ask')) {
      asked.push(r.request().postData() || '')
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, card: { title: 'Ответ', text: 'Проверочный ответ' } }) })
    }
    return r.fulfill({ contentType: 'application/json', body: '{"ok":true,"referrals":0,"friends":[]}' })
  })
  await ctx.addInitScript(({ preset }) => {
    if (preset && !sessionStorage.getItem('__preset_done')) {
      for (const [k, v] of Object.entries(preset)) localStorage.setItem(k, v)
      sessionStorage.setItem('__preset_done', '1')
    }
    const noop = () => {}
    window.Telegram = {
      WebApp: {
        initData: 'user=%7B%22id%22%3A4242%7D&hash=x',
        initDataUnsafe: { user: { id: 4242, first_name: 'Тест', allows_write_to_pm: true } },
        platform: 'ios', version: '8.0', colorScheme: 'dark', themeParams: {},
        isVersionAtLeast: () => true,
        ready: noop, expand: noop, close: noop,
        setHeaderColor: noop, setBackgroundColor: noop, setBottomBarColor: noop,
        disableVerticalSwipes: noop, enableVerticalSwipes: noop,
        onEvent: noop, offEvent: noop, openLink: noop, openTelegramLink: noop,
        showConfirm: (m, cb) => cb && cb(true),
        requestWriteAccess: (cb) => cb && cb(true),
        HapticFeedback: { impactOccurred: noop, notificationOccurred: noop, selectionChanged: noop },
        BackButton: { show: noop, hide: noop, onClick: noop, offClick: noop },
        MainButton: { show: noop, hide: noop, enable: noop, disable: noop, onClick: noop, offClick: noop, setParams: noop },
      },
    }
  }, { preset })
  const page = await ctx.newPage()
  page.errs = []
  page.asked = asked
  page.on('pageerror', (e) => page.errs.push(e.message))
  await page.goto(BASE)
  await page.waitForTimeout(1200)
  return { ctx, page }
}

/** Открытая вкладка (скрытые панели — с data-off). */
const panel = (page) => page.locator('.tab-panel:not([data-off])')
const sheet = (page) => page.locator('[aria-modal=true]').last()
const headTitle = (page) => panel(page).locator('[data-tour="analytics-head"] .text-\\[27px\\]').first().textContent()
const widget = (page, title) => panel(page).locator('section, div').filter({ has: page.getByText(title, { exact: true }) })

async function toAnalytics(page) {
  await page.locator('[data-tour="tab-analytics"]').click()
  await page.waitForTimeout(1100)
}

async function closeSheet(page) {
  await page.keyboard.press('Escape')
  await page.waitForTimeout(700)
}

/** Ведёт «пальцем» (указателем) по области графика и возвращает текст пузыря. */
async function scrub(page, area, from = 0.2, to = 0.6) {
  await area.scrollIntoViewIfNeeded()
  const box = await area.boundingBox()
  const y = box.y + box.height / 2
  await page.mouse.move(box.x + box.width * from, y)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * to, y, { steps: 6 })
  const layer = area.locator('.an-scrub')
  const on = await layer.getAttribute('data-on')
  const tip = (await area.locator('.an-tip').textContent()) ?? ''
  await page.mouse.up()
  return { on: on !== null, tip }
}

;(async () => {
  const browser = await chromium.launch()
  const txs = makeTransactions()

  /* 1. Человек с историей: всё на месте, всё нажимается. */
  {
    const { ctx, page } = await newApp(browser, { preset: { ...BASE_PRESET, 'finance-mini-app:v1': blob({ transactions: txs }) } })
    await toAnalytics(page)
    const hero = panel(page).locator('[data-tour="spent"]')
    const heroText = (await hero.textContent()) ?? ''
    ok(heroText.includes('Потрачено') && /\d/.test(heroText), 'герой: «Потрачено» и сумма', heroText.slice(0, 80))
    ok(/К этому дню в|В [а-я]+е —/.test(heroText), 'герой: сравнение с прошлым месяцем (к тому же дню или целиком)', heroText.slice(0, 160))
    for (const label of ['Средний день', 'Сбережения', 'Покупок', 'Без трат']) ok(await panel(page).getByText(label, { exact: true }).count() === 1, `показатель «${label}»`)

    // Палец по графику героя: линия и пузырь с датой и суммой.
    const s1 = await scrub(page, hero.locator('[data-swipe-ignore]').first())
    ok(s1.on && /\d/.test(s1.tip), 'герой: палец по графику — пузырь с суммой', s1)
    await page.waitForTimeout(2200)
    ok((await hero.locator('.an-scrub').getAttribute('data-on')) === null, 'герой: пузырь гаснет после отпускания')

    // Меню периода: Неделя → заголовок и стор; затем снова Месяц.
    const month0 = (await headTitle(page))?.trim()
    await panel(page).getByRole('button', { name: 'Период' }).click()
    await page.waitForTimeout(300)
    await panel(page).getByRole('button', { name: 'Неделя', exact: true }).click()
    await page.waitForTimeout(800)
    // Период — поле вида: на диск уходит не сразу (LAZY_KEYS), сверяем по экрану.
    const chip = () => panel(page).getByRole('button', { name: 'Период' }).textContent()
    const week = (await headTitle(page))?.trim()
    ok((await chip())?.includes('Неделя') && week !== month0, 'меню периода: неделя', { chip: await chip(), week })
    await panel(page).getByRole('button', { name: 'Период' }).click()
    await page.waitForTimeout(300)
    await panel(page).getByRole('button', { name: 'Месяц', exact: true }).click()
    await page.waitForTimeout(800)
    ok((await chip())?.includes('Месяц') && (await headTitle(page))?.trim() === month0, 'меню периода: снова месяц', (await headTitle(page))?.trim())

    // Стрелки: назад — прошлый месяц, вперёд — вернулись; «вперёд» с текущего выключена.
    ok(await panel(page).getByRole('button', { name: 'Вперёд' }).isDisabled(), 'стрелка «вперёд» на текущем месяце выключена')
    await panel(page).getByRole('button', { name: 'Назад' }).click()
    await page.waitForTimeout(800)
    const prev = (await headTitle(page))?.trim()
    const prevHero = (await hero.textContent()) ?? ''
    ok(prev !== month0 && !prevHero.includes('К этому дню'), 'стрелка «назад»: прошлый месяц, сравнение целиком', { prev, hero: prevHero.slice(0, 120) })
    await panel(page).getByRole('button', { name: 'Вперёд' }).click()
    await page.waitForTimeout(800)
    ok((await headTitle(page))?.trim() === month0, 'стрелка «вперёд»: вернулись')

    // Подсказки: «Ещё N» раскрывает, «Подробнее» — карточка категории, «Поставить лимит» — планирование.
    const more = panel(page).getByRole('button', { name: /^Ещё \d+$/ })
    if (await more.count()) {
      const rows0 = await panel(page).getByText('Подробнее', { exact: true }).count()
      await more.first().click()
      await page.waitForTimeout(500)
      ok(await panel(page).getByRole('button', { name: 'Свернуть' }).count() === 1, 'подсказки: «Ещё» раскрывает список', { rows0 })
      await panel(page).getByRole('button', { name: 'Свернуть' }).click()
      await page.waitForTimeout(400)
    } else ok(true, 'подсказок не больше трёх — «Ещё» не нужна')
    const details = panel(page).getByRole('button', { name: 'Подробнее', exact: true })
    if (await details.count()) {
      await details.first().scrollIntoViewIfNeeded()
      await details.first().click()
      await page.waitForTimeout(900)
      const txt = (await sheet(page).textContent()) ?? ''
      ok((await sheet(page).count()) === 1 && /\d/.test(txt), 'подсказка → карточка категории', txt.slice(0, 80))
      await closeSheet(page)
    } else ok(true, 'подсказок про категории нет')
    const limit = panel(page).getByRole('button', { name: 'Поставить лимит', exact: true })
    if (await limit.count()) {
      await limit.first().click()
      await page.waitForTimeout(1300)
      const txt = (await sheet(page).textContent()) ?? ''
      ok(/Лимиты/.test(txt), 'подсказка → «Поставить лимит» открывает лимиты', txt.slice(0, 80))
      await closeSheet(page)
    }

    // Категории: доходы и «Все категории».
    const cats = panel(page).locator('[role=group]').filter({ hasText: 'Доходы' }).first()
    await cats.scrollIntoViewIfNeeded()
    await cats.getByRole('button', { name: 'Доходы', exact: true }).click()
    await page.waitForTimeout(600)
    ok(await panel(page).getByText('Зарплата', { exact: true }).count() >= 1, 'категории: доходы — «Зарплата»')
    await cats.getByRole('button', { name: 'Расходы', exact: true }).click()
    await page.waitForTimeout(600)
    const all = panel(page).getByRole('button', { name: /^Все категории · \d+$/ })
    if (await all.count()) {
      await all.click()
      await page.waitForTimeout(500)
      ok(await panel(page).getByText('Связь', { exact: true }).count() >= 1, 'категории: «Все категории» раскрывает хвост')
    } else ok(true, 'категорий мало — «Все категории» не нужна')

    // Календарь: день с тратами → шторка дня → запись → правка.
    // Клетка дня: подпись для диктора — текстом в .sr-only (не aria-label: его Clarity пишет как есть).
    const day = panel(page).locator('button[data-day]:not([disabled])').filter({ has: page.locator('.sr-only', { hasText: '−' }) }).first()
    await day.scrollIntoViewIfNeeded()
    const label = await day.locator('.sr-only').textContent()
    ok(!(await panel(page).locator('button[data-day][aria-label]').count()), 'календарь: суммы не в атрибутах клеток')
    await day.click()
    await page.waitForTimeout(900)
    const dayText = (await sheet(page).textContent()) ?? ''
    ok(dayText.includes('Потрачено') && /\d/.test(dayText), 'календарь → шторка дня', { label, text: dayText.slice(0, 80) })
    await sheet(page).locator('button.text-left').first().click()
    await page.waitForTimeout(1100)
    const amount = await page.locator('[data-tour="amount"]').last().getAttribute('data-value')
    ok(Number(amount) > 0, 'шторка дня → запись открывается на правку', amount)
    await closeSheet(page)

    // Календарь: режимы как раньше — суммы прямо в клетках.
    const calSeg = panel(page).getByRole('group', { name: 'Календарь' })
    await calSeg.scrollIntoViewIfNeeded()
    // Видимый текст клеток (без .sr-only) — у дней, где подпись говорит о трате (знак).
    const cells = (sign) =>
      page.evaluate(
        (sign) =>
          [...document.querySelectorAll('.tab-panel:not([data-off]) button[data-day]:not([disabled])')]
            .filter((b) => (b.querySelector('.sr-only')?.textContent ?? '').includes(sign))
            .map((b) => [...b.children].filter((c) => !c.classList.contains('sr-only')).map((c) => c.textContent).join('').trim()),
        sign,
      )
    const cellText = () => cells('−')
    const spentCells = await cellText()
    ok(spentCells.length > 0 && spentCells.every((t) => /^\d{1,2}\d+/.test(t.replace(/\s/g, ''))), 'календарь «Траты»: в клетках сумма дня', spentCells.slice(0, 4))
    await calSeg.getByRole('button', { name: 'Оба', exact: true }).click()
    await page.waitForTimeout(400)
    const both = await cells('+')
    // Дни с доходом: строка «+…», а если в тот же день были и траты — ещё «−…».
    ok(both.length > 0 && both.every((t) => /\+\d/.test(t)) && both.some((t) => /−\d/.test(t)), 'календарь «Оба»: доход и трата двумя строками', both.slice(0, 3))
    await calSeg.getByRole('button', { name: 'Итог', exact: true }).click()
    await page.waitForTimeout(400)
    const netCells = await cellText()
    ok(netCells.some((t) => /[+−]\d/.test(t)), 'календарь «Итог»: итог дня со знаком', netCells.slice(0, 3))
    await calSeg.getByRole('button', { name: 'Траты', exact: true }).click()
    await page.waitForTimeout(300)

    // Динамика: недели, палец по столбикам, подписи «7 сен» (а не «709»).
    const trendSeg = panel(page).locator('[role=group]').filter({ hasText: 'Недели' }).first()
    await trendSeg.scrollIntoViewIfNeeded()
    await trendSeg.getByRole('button', { name: 'Недели', exact: true }).click()
    await page.waitForTimeout(700)
    const trendArea = panel(page).locator('[data-swipe-ignore][style*="pan-y"]').nth(1)
    const weekLabels = await page.evaluate((el) => {
      const box = el.parentElement.parentElement
      return [...box.querySelectorAll('span.whitespace-nowrap')].map((s) => s.textContent.trim()).filter(Boolean)
    }, await trendArea.elementHandle())
    ok(weekLabels.length >= 4 && weekLabels.every((t) => /^\d{1,2} [а-я]{3}$/.test(t)), 'динамика по неделям: подписи «7 сен»', weekLabels)
    const s2 = await scrub(page, trendArea, 0.3, 0.9)
    ok(s2.on && /−/.test(s2.tip), 'динамика: палец по столбикам — пузырь с расходом', s2)
    await trendSeg.getByRole('button', { name: 'Месяцы', exact: true }).click()
    await page.waitForTimeout(500)

    // «Спроси Кошель»: вопрос уходит ассистенту сразу.
    const ask = panel(page).getByText('Спроси Кошель', { exact: true })
    if (await ask.count()) {
      const q = panel(page).locator('button').filter({ hasText: /\?$/ }).first()
      await q.scrollIntoViewIfNeeded()
      const question = ((await q.textContent()) ?? '').trim()
      await q.click()
      await page.waitForTimeout(1500)
      const txt = (await sheet(page).textContent()) ?? ''
      ok(txt.includes(question) && page.asked.some((b) => b.includes(question.slice(0, 12))), '«Спроси Кошель» → ассистент сразу задаёт вопрос', { question, asked: page.asked.length })
      await closeSheet(page)
    } else ok(false, '«Спроси Кошель» не показан в Telegram')

    // Ушли на Главную и вернулись — без ошибок; горизонтальной прокрутки нет.
    await page.locator('[data-tour="tab-home"]').click()
    await page.waitForTimeout(700)
    await toAnalytics(page)
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    ok(wide <= 0, 'нет горизонтальной прокрутки (390)', wide)
    ok(page.errs.length === 0, 'ошибок нет', page.errs)
    await page.screenshot({ path: path.join(OUT, 'analytics-390.png') })
    await ctx.close()
  }

  /* 2. 320 px и светлая тема: всё влезает. */
  for (const [width, scheme] of [[320, 'dark'], [375, 'light']]) {
    const { ctx, page } = await newApp(browser, { preset: { ...BASE_PRESET, 'finance-mini-app:v1': blob({ transactions: txs, themeMode: scheme }) }, width, height: 700, scheme })
    await toAnalytics(page)
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    ok(wide <= 0, `${width} px, ${scheme}: без горизонтальной прокрутки`, wide)
    // Кнопки подсказки в одну строку (на узком экране — под значком).
    const chips = panel(page).getByRole('button', { name: 'Поставить лимит', exact: true })
    if (await chips.count()) {
      const a = await panel(page).getByRole('button', { name: 'Подробнее', exact: true }).first().boundingBox()
      const b = await chips.first().boundingBox()
      ok(a && b && Math.abs(a.y - b.y) < 4, `${width} px: «Подробнее» и «Поставить лимит» в одну строку`, { a, b })
    }
    ok(page.errs.length === 0, `${width} px: ошибок нет`, page.errs)
    await page.screenshot({ path: path.join(OUT, `analytics-${width}-${scheme}.png`) })
    await ctx.close()
  }

  /* 3. Новичок без записей: пустая аналитика ведёт к первой записи. */
  {
    const { ctx, page } = await newApp(browser, { preset: { ...BASE_PRESET, 'finance-mini-app:v1': blob({ transactions: [] }) } })
    await toAnalytics(page)
    ok(await panel(page).getByText('Здесь пока пусто', { exact: true }).count() === 1, 'пусто: заглушка')
    await panel(page).getByRole('button', { name: 'Записать трату' }).click()
    await page.waitForTimeout(1000)
    ok(await page.locator('[data-tour="amount"]').count() >= 1, 'пусто: «Записать трату» открывает шторку записи')
    ok(page.errs.length === 0, 'пусто: ошибок нет', page.errs)
    await ctx.close()
  }

  await browser.close()
  console.log(fails ? `\n${fails} проверок упало` : '\nВсе проверки прошли')
  process.exit(fails ? 1 : 0)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
