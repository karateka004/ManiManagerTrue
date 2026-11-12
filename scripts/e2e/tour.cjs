// Обучение новичка 2.9 (vite preview :4180), касаниями CDP: предложение → «+» →
// сумма → категория → «Записать» → баланс → Аналитика → конец; нажатия мимо
// подсветки не срабатывают; «Разберусь сам», «Пропустить», продолжение после
// перезапуска, закрытая шторка возвращает к «+»; что уходит в /qs.
const { chromium } = require('playwright')
const path = require('node:path')
const fs = require('node:fs')

const BASE = process.env.BASE || 'http://localhost:4180/'
const OUT = path.join(__dirname, 'shots')
fs.mkdirSync(OUT, { recursive: true })
let fails = 0
const ok = (c, m, extra) => { if (!c) fails++; console.log((c ? 'OK   ' : 'FAIL ') + m + (c || extra === undefined ? '' : '  ' + JSON.stringify(extra))) }

async function newApp(browser, { tz = 'Europe/Moscow', width = 390, height = 844 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, timezoneId: tz })
  const qs = []
  await ctx.route('https://telegram.org/**', (r) => r.fulfill({ contentType: 'application/javascript', body: '' }))
  await ctx.route('https://*.clarity.ms/**', (r) => r.abort())
  await ctx.route('https://koshel-worker.karateka004.workers.dev/**', (r) => {
    if (r.request().url().endsWith('/qs')) qs.push(JSON.parse(r.request().postData() || '{}'))
    return r.fulfill({ contentType: 'application/json', body: '{"ok":true}' })
  })
  await ctx.addInitScript(() => {
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
  })
  const page = await ctx.newPage()
  page.errs = []
  page.on('pageerror', (e) => page.errs.push(e.message))
  await page.goto(BASE)
  await page.waitForTimeout(1500)
  const cdp = await ctx.newCDPSession(page)
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
  page.tapAt = async (x, y, after = 450) => { await touch('touchStart', x, y); await page.waitForTimeout(40); await touch('touchEnd'); await page.waitForTimeout(after) }
  page.tapEl = async (loc, after) => { const b = await loc.first().boundingBox(); await page.tapAt(b.x + b.width / 2, b.y + b.height / 2, after) }
  return { ctx, page, qs }
}

const card = (page) => page.locator('[data-tour-card]')
const cardText = (page) => card(page).textContent().catch(() => '')
const store = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('finance-mini-app:v1') || 'null'))
const sheetOpen = (page) => page.evaluate(() => { const b = document.querySelector('[data-tour=save]'); return !!b && b.getBoundingClientRect().bottom <= innerHeight + 4 })
const tour = (name) => `[data-tour="${name}"]`

;(async () => {
  const browser = await chromium.launch()

  /* 1. Весь путь. */
  {
    const { ctx, page, qs } = await newApp(browser)
    ok(/Пройти обучение/.test(await cardText(page)), 'новичку предложено обучение')
    await page.screenshot({ path: path.join(OUT, 'tour-0-offer.png') })
    // Мимо карточки — не нажимается: баланс не открывает шторку.
    await page.tapEl(page.locator(tour('balance')), 600)
    ok(!(await sheetOpen(page)), 'на предложении остальной экран не нажимается')
    await page.tapEl(card(page).getByRole('button', { name: 'Пройти обучение' }))
    ok(/Нажми «\+»/.test(await cardText(page)), 'шаг 1: подсвечен «+»')
    let st = await store(page)
    ok(st?.state.currency === 'RUB', 'валюта по региону поставлена при старте обучения', st?.state.currency)
    await page.screenshot({ path: path.join(OUT, 'tour-1-plus.png') })
    await page.tapEl(page.locator(tour('tab-analytics')), 500)
    ok(/Нажми «\+»/.test(await cardText(page)) && !(await page.locator(`${tour('tab-analytics')}[aria-current=page]`).count()), 'вкладка «Аналитика» на этом шаге не нажимается')

    await page.tapEl(page.locator(tour('plus')), 900)
    ok((await sheetOpen(page)) && /Набери сумму/.test(await cardText(page)), 'шаг 2: шторка открыта, просим сумму')
    await page.screenshot({ path: path.join(OUT, 'tour-2-amount.png') })
    await page.tapEl(page.locator(tour('categories')).getByRole('button', { name: 'Еда', exact: true }), 300)
    ok(!(await page.locator(tour('categories')).getAttribute('data-value')), 'категорию раньше суммы не выбрать')
    for (const k of ['3', '5', '0']) await page.tapEl(page.locator(tour('keypad')).getByRole('button', { name: k, exact: true }), 120)
    ok((await page.locator(tour('amount')).getAttribute('data-value')) === '350', 'сумма набрана: 350')
    await page.tapEl(card(page).getByRole('button', { name: 'Готово' }), 500)
    ok(/выбери категорию/.test(await cardText(page)), 'шаг 3: категория')
    await page.screenshot({ path: path.join(OUT, 'tour-3-category.png') })
    await page.tapEl(page.locator(tour('categories')).getByRole('button', { name: 'Еда', exact: true }), 500)
    ok(/Записать расход/.test(await cardText(page)), 'шаг 4: «Записать»')
    await page.screenshot({ path: path.join(OUT, 'tour-4-save.png') })
    await page.tapEl(page.locator(tour('save')), 1400)
    st = await store(page)
    const t0 = st?.state.transactions?.[0]
    ok(st?.state.transactions?.length === 1 && t0.amount === 350 && t0.categoryId === 'food' && t0.currency === 'RUB', 'трата записана по-настоящему: 350 ₽, Еда', st?.state.transactions)
    ok(/баланс за месяц/.test(await cardText(page)) && !(await sheetOpen(page)), 'шаг 5: шторка закрылась, подсвечен баланс')
    await page.screenshot({ path: path.join(OUT, 'tour-5-balance.png') })
    await page.tapEl(card(page).getByRole('button', { name: 'Дальше' }), 500)
    ok(/куда уходят деньги/.test(await cardText(page)), 'шаг 6: вкладка «Аналитика»')
    await page.screenshot({ path: path.join(OUT, 'tour-6-analytics.png') })
    await page.tapEl(page.locator(tour('tab-analytics')), 900)
    ok(/Ты в деле/.test(await cardText(page)) && (await page.locator(`${tour('tab-analytics')}[aria-current=page]`).count()) === 1, 'Аналитика открыта, финал')
    await page.screenshot({ path: path.join(OUT, 'tour-7-done.png') })
    await page.tapEl(card(page).getByRole('button', { name: 'Начать' }), 800)
    ok(!(await card(page).count()), 'обучение закрыто')
    const ls = await page.evaluate(() => ({ on: localStorage.getItem('koshel:onboarded'), qs: localStorage.getItem('koshel:qs') }))
    ok(ls.on === '1' && ls.qs === null, 'метка «пройдено» стоит, место стёрто', ls)
    const steps = [...new Set(qs.map((x) => x.s))]
    ok(qs.every((x) => x.v === 2) && JSON.stringify(steps) === '[0,1,2,3,4]' && qs.at(-1).d === true && qs.at(-1).e === 1, '/qs: шаги 0–4 обучения и финиш', qs)
    ok(qs.every((x) => Object.keys(x).every((k) => ['initData', 's', 'e', 'i', 'd', 'x', 'v'].includes(k))), '/qs: без сумм')
    await page.reload(); await page.waitForTimeout(1200)
    ok(!(await card(page).count()), 'после перезапуска обучения нет')
    ok(page.errs.length === 0, 'ошибок нет', page.errs)
    await ctx.close()
  }

  /* 2. «Разберусь сам». */
  {
    const { ctx, page, qs } = await newApp(browser)
    await page.tapEl(card(page).getByRole('button', { name: 'Разберусь сам' }), 800)
    ok(!(await card(page).count()), '«Разберусь сам» — обучение закрыто')
    ok(qs.at(-1)?.x === 0 && qs.at(-1)?.v === 2, '/qs: отказ на предложении', qs.at(-1))
    await page.tapEl(page.locator(tour('balance')), 900)
    ok(await sheetOpen(page), 'приложение нажимается: баланс открывает запись')
    ok(page.errs.length === 0, 'ошибок нет', page.errs)
    await ctx.close()
  }

  /* 3. Продолжение после перезапуска и закрытая шторка. */
  {
    const { ctx, page } = await newApp(browser)
    await page.tapEl(card(page).getByRole('button', { name: 'Пройти обучение' }))
    await page.tapEl(page.locator(tour('plus')), 900)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(1200)
    ok(!(await sheetOpen(page)) && /Нажми «\+»/.test(await cardText(page)), 'шторку закрыли — снова к «+»')
    await page.reload(); await page.waitForTimeout(1500)
    ok(/Нажми «\+»/.test(await cardText(page)), 'перезапуск посреди — продолжаем с «+», а не с предложения')
    // «Пропустить» посреди — обучение уходит, шторка остаётся рабочей.
    await page.tapEl(page.locator(tour('plus')), 900)
    await page.tapEl(card(page).getByRole('button', { name: 'Пропустить обучение' }), 600)
    ok(!(await card(page).count()) && (await sheetOpen(page)), '«Пропустить» — обучение ушло, шторка на месте')
    await page.tapEl(page.locator(tour('categories')).getByRole('button', { name: 'Кафе', exact: true }), 300)
    ok((await page.locator(tour('categories')).getAttribute('data-value')) === 'cafe', 'после пропуска всё нажимается')
    ok(page.errs.length === 0, 'ошибок нет', page.errs)
    await ctx.close()
  }

  /* 4. Узкий экран 320×568: карточка не закрывает подсветку. */
  {
    const { ctx, page } = await newApp(browser, { width: 320, height: 568 })
    await page.tapEl(card(page).getByRole('button', { name: 'Пройти обучение' }))
    await page.tapEl(page.locator(tour('plus')), 900)
    const overlap = await page.evaluate(() => {
      const c = document.querySelector('[data-tour-card]').getBoundingClientRect()
      const k = document.querySelector('[data-tour="keypad"]').getBoundingClientRect()
      return { cardBottom: Math.round(c.bottom), keypadTop: Math.round(k.top), cardTop: Math.round(c.top) }
    })
    ok(overlap.cardBottom <= overlap.keypadTop && overlap.cardTop >= 0, '320 px: карточка над клавиатурой и в экране', overlap)
    await page.screenshot({ path: path.join(OUT, 'tour-8-320.png') })
    await ctx.close()
  }

  await browser.close()
  console.log(fails ? `\n${fails} FAIL` : '\nвсё OK')
  process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
