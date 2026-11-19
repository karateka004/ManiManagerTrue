// Обучение новичка 2.10 (vite preview :4180), касаниями CDP: предложение → «+» →
// сумма → категория → «Записать» → баланс → Аналитика → Прогресс → Главная →
// итог; нажатия мимо подсветки не срабатывают и отвечают «качанием»; свайп
// между вкладками выключен; «Разберусь сам», «Пропустить», продолжение после
// перезапуска, закрытая шторка возвращает к «+», отмена записи тостом; низкий
// экран (клавиатура уходит сама, карточка не закрывает сумму); что уходит в /qs.
const { chromium } = require('playwright')
const path = require('node:path')
const fs = require('node:fs')

const BASE = process.env.BASE || 'http://localhost:4180/'
const OUT = path.join(__dirname, 'shots')
fs.mkdirSync(OUT, { recursive: true })
let fails = 0
const ok = (c, m, extra) => { if (!c) fails++; console.log((c ? 'OK   ' : 'FAIL ') + m + (c || extra === undefined ? '' : '  ' + JSON.stringify(extra))) }

async function newApp(browser, { tz = 'Europe/Moscow', width = 390, height = 844, preset, url = '', wait = 1500, theme = 'dark' } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, timezoneId: tz, colorScheme: theme })
  const qs = []
  await ctx.route('https://telegram.org/**', (r) => r.fulfill({ contentType: 'application/javascript', body: '' }))
  await ctx.route('https://*.clarity.ms/**', (r) => r.abort())
  await ctx.route('https://koshel-worker.karateka004.workers.dev/**', (r) => {
    if (r.request().url().endsWith('/qs')) qs.push(JSON.parse(r.request().postData() || '{}'))
    return r.fulfill({ contentType: 'application/json', body: '{"ok":true,"referrals":0,"friends":[]}' })
  })
  await ctx.addInitScript(({ preset, theme }) => {
    if (preset && !sessionStorage.getItem('__p')) {
      for (const [k, v] of Object.entries(preset)) localStorage.setItem(k, v)
      sessionStorage.setItem('__p', '1')
    }
    const noop = () => {}
    window.Telegram = {
      WebApp: {
        initData: 'user=%7B%22id%22%3A4242%7D&hash=x',
        initDataUnsafe: { user: { id: 4242, first_name: 'Тест', allows_write_to_pm: true } },
        platform: 'ios', version: '8.0', colorScheme: theme, themeParams: {},
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
  }, { preset, theme })
  const page = await ctx.newPage()
  page.errs = []
  page.on('pageerror', (e) => page.errs.push(e.message))
  await page.goto(BASE + url)
  await page.waitForTimeout(wait)
  const cdp = await ctx.newCDPSession(page)
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
  page.tapAt = async (x, y, after = 450) => { await touch('touchStart', x, y); await page.waitForTimeout(40); await touch('touchEnd'); await page.waitForTimeout(after) }
  page.tapEl = async (loc, after) => { const b = await loc.first().boundingBox(); await page.tapAt(b.x + b.width / 2, b.y + b.height / 2, after) }
  page.swipe = async (x0, x1, y) => {
    await touch('touchStart', x0, y)
    for (let i = 1; i <= 8; i++) { await touch('touchMove', x0 + ((x1 - x0) * i) / 8, y); await page.waitForTimeout(16) }
    await touch('touchEnd'); await page.waitForTimeout(700)
  }
  return { ctx, page, qs }
}

const card = (page) => page.locator('[data-tour-card]')
const cardText = (page) => card(page).textContent().catch(() => '')
const store = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('finance-mini-app:v1') || 'null'))
const sheetOpen = (page) => page.evaluate(() => { const b = document.querySelector('[data-tour=save]'); return !!b && b.getBoundingClientRect().bottom <= innerHeight + 4 })
const tour = (name) => `[data-tour="${name}"]`
const active = (page, name) => page.locator(`${tour('tab-' + name)}[aria-current=page]`).count().then((n) => n === 1)
/** Рамки карточки, кольца и целей — проверить, что подсказка не закрывает нужное. */
const boxes = (page, names) => page.evaluate((names) => {
  const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right) } }
  const vis = (n) => [...document.querySelectorAll(`[data-tour="${n}"]`)].find((e) => !e.closest('.tab-panel[data-off]'))
  const out = { card: r(document.querySelector('[data-tour-card]')), ring: r(document.querySelector('.tour-ring')), side: document.querySelector('[data-tour-card]')?.getAttribute('data-side') ?? '', toast: r(document.querySelector('[role=status] > div')) }
  for (const n of names) out[n] = r(vis(n))
  return out
}, names)
const overlaps = (a, b) => !!a && !!b && a.top < b.bottom - 1 && b.top < a.bottom - 1

;(async () => {
  const browser = await chromium.launch()

  /* 1. Весь путь. */
  {
    const { ctx, page, qs } = await newApp(browser)
    ok(/Пройти обучение/.test(await cardText(page)) && (await card(page).locator('li').count()) === 4, 'новичку предложено обучение с планом из четырёх глав')
    await page.screenshot({ path: path.join(OUT, 'tour-0-offer.png') })
    // Мимо карточки — не нажимается: баланс не открывает шторку, карточка качается.
    await page.tapEl(page.locator(tour('balance')), 200)
    ok(!(await sheetOpen(page)), 'на предложении остальной экран не нажимается')
    ok(await page.evaluate(() => !!document.querySelector('.tour-nudge')), 'нажатие мимо — карточка отвечает качанием')
    await page.waitForTimeout(400)
    await page.tapEl(card(page).getByRole('button', { name: 'Пройти обучение' }), 700)
    ok(/Нажми «\+»/.test(await cardText(page)), 'шаг «+»: подсвечен «+»')
    let st = await store(page)
    ok(st?.state.currency === 'RUB', 'валюта по региону поставлена при старте обучения', st?.state.currency)
    let b = await boxes(page, ['plus'])
    ok(b.side === 'down' && b.card.bottom <= b.plus.top - 8 && b.ring && Math.abs(b.ring.top - (b.plus.top - 6)) <= 2, 'карточка над «+» хвостиком к нему, кольцо — вокруг', b)
    await page.screenshot({ path: path.join(OUT, 'tour-1-plus.png') })
    await page.tapEl(page.locator(tour('tab-analytics')), 500)
    ok(/Нажми «\+»/.test(await cardText(page)) && !(await active(page, 'analytics')), 'вкладка «Аналитика» на этом шаге не нажимается')
    // Свайп между вкладками во время обучения выключен.
    await page.swipe(330, 60, 600)
    ok(await active(page, 'home'), 'свайп по экрану вкладку не меняет')

    await page.tapEl(page.locator(tour('plus')), 900)
    ok((await sheetOpen(page)) && /Набери сумму/.test(await cardText(page)), 'шаг суммы: шторка открыта, просим сумму')
    await page.waitForTimeout(300)
    b = await boxes(page, ['amount', 'keypad'])
    ok(b.card.bottom <= b.amount.top + 4 && b.card.top >= 0, 'карточка над суммой: сумма и клавиши видны', b)
    ok(b.ring && Math.abs(b.ring.top - (b.keypad.top - 6)) <= 2, 'кольцо — на клавиатуре', b)
    await page.screenshot({ path: path.join(OUT, 'tour-2-amount.png') })
    // Шапка шторки (вид операции, «Отмена») под затемнением — не нажимается.
    await page.tapEl(page.locator('[role=dialog][aria-modal=true]').filter({ has: page.locator(tour('save')) }).getByRole('button', { name: '+ Доход' }), 300)
    ok(/Записать расход/.test(await page.locator(tour('save')).textContent()), 'переключатель «Доход» на шаге суммы не нажимается')
    for (const k of ['3', '5', '0']) await page.tapEl(page.locator(tour('keypad')).getByRole('button', { name: k, exact: true }), 120)
    ok((await page.locator(tour('amount')).getAttribute('data-value')) === '350', 'сумма набрана: 350')
    ok(/Набери сумму/.test(await cardText(page)), 'пока палец на клавишах — шаг не меняется')
    await page.waitForTimeout(900)
    ok(/Выбери категорию/.test(await cardText(page)), 'палец замер — шаг категории, без «Готово»')
    await page.waitForTimeout(500)
    b = await boxes(page, ['categories'])
    ok(b.ring && Math.abs(b.ring.top - (b.categories.top - 6)) <= 2, 'кольцо — на категориях', b)
    ok(!(await page.locator('.keypad-fold.is-folded').count()), 'высокий экран: клавиатура на месте')
    await page.screenshot({ path: path.join(OUT, 'tour-3-category.png') })
    await page.tapEl(page.locator(tour('categories')).getByRole('button', { name: 'Еда', exact: true }), 500)
    ok(/Нажми «Записать расход»/.test(await cardText(page)), 'шаг «Записать»')
    await page.waitForTimeout(300)
    b = await boxes(page, ['save'])
    ok(b.ring && Math.abs(b.ring.top - (b.save.top - 6)) <= 2, 'кольцо — на «Записать»', b)
    await page.screenshot({ path: path.join(OUT, 'tour-4-save.png') })
    await page.tapEl(page.locator(tour('save')), 1300)
    st = await store(page)
    const t0 = st?.state.transactions?.[0]
    ok(st?.state.transactions?.length === 1 && t0.amount === 350 && t0.categoryId === 'food' && t0.currency === 'RUB', 'трата записана по-настоящему: 350 ₽, Еда', st?.state.transactions)
    ok(/Первая запись!/.test(await cardText(page)) && /\+12 XP/.test(await cardText(page)) && !(await sheetOpen(page)), 'шаг баланса: шторка закрылась, «+12 XP»')
    b = await boxes(page, ['balance', 'tab-analytics'])
    ok(!overlaps(b.card, b.balance) && !overlaps(b.card, b.toast) && !overlaps(b.card, b['tab-analytics']), 'карточка не закрывает баланс, тост и вкладку', b)
    ok(b.ring && Math.abs(b.ring.left - (b['tab-analytics'].left - 6)) <= 2, 'кольцо — на «Аналитике»', b)
    await page.screenshot({ path: path.join(OUT, 'tour-5-balance.png') })
    await page.tapEl(page.locator(tour('tab-rewards')), 400)
    ok(await active(page, 'home'), 'на шаге баланса «Прогресс» не нажимается')
    await page.tapEl(page.locator(tour('tab-analytics')), 1100)
    ok((await active(page, 'analytics')) && /Куда уходят деньги/.test(await cardText(page)), 'шаг аналитики: вкладка открыта')
    b = await boxes(page, ['analytics-tabs', 'spent', 'tab-rewards'])
    ok(b.spent && !overlaps(b.card, b.spent) && !overlaps(b.card, b['analytics-tabs']), 'карточка не закрывает обзор', b)
    await page.screenshot({ path: path.join(OUT, 'tour-6-analytics.png') })
    await page.tapEl(page.locator(tour('tab-rewards')), 1100)
    ok((await active(page, 'rewards')) && /Твой уровень/.test(await cardText(page)), 'шаг прогресса: вкладка открыта')
    b = await boxes(page, ['level'])
    ok(b.level && !overlaps(b.card, b.level), 'карточка не закрывает уровень', b)
    await page.screenshot({ path: path.join(OUT, 'tour-7-rewards.png') })
    await page.tapEl(page.locator(tour('tab-home')), 1100)
    ok((await active(page, 'home')) && /Ты в деле/.test(await cardText(page)), 'вернулись на Главную — итог')
    ok(/боту/.test(await cardText(page)) && /ассистента/.test(await cardText(page)), 'в итоге — бот и ассистент')
    await page.screenshot({ path: path.join(OUT, 'tour-8-done.png') })
    await page.tapEl(card(page).getByRole('button', { name: 'Начать' }), 800)
    ok(!(await card(page).count()), 'обучение закрыто')
    const ls = await page.evaluate(() => ({ on: localStorage.getItem('koshel:onboarded'), qs: localStorage.getItem('koshel:qs'), done: localStorage.getItem('koshel:tourDone') }))
    ok(ls.on === '1' && ls.qs === null && ls.done === '1', 'метки «пройдено» стоят, место стёрто', ls)
    await page.tapEl(page.locator(tour('balance')), 900)
    ok(await sheetOpen(page), 'после обучения всё нажимается: баланс открывает запись')
    await page.keyboard.press('Escape'); await page.waitForTimeout(600)
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

  /* 3. Продолжение после перезапуска, закрытая шторка, отмена записи, «Пропустить». */
  {
    const { ctx, page } = await newApp(browser)
    await page.tapEl(card(page).getByRole('button', { name: 'Пройти обучение' }))
    await page.tapEl(page.locator(tour('plus')), 900)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(1200)
    ok(!(await sheetOpen(page)) && /Нажми «\+»/.test(await cardText(page)), 'шторку закрыли — снова к «+»')
    await page.reload(); await page.waitForTimeout(1500)
    ok(/Нажми «\+»/.test(await cardText(page)), 'перезапуск посреди — продолжаем с «+», а не с предложения')
    // Категория раньше суммы — можно; сумма следом ведёт сразу к «Записать».
    await page.tapEl(page.locator(tour('plus')), 900)
    await page.tapEl(page.locator(tour('categories')).getByRole('button', { name: 'Кафе', exact: true }), 300)
    ok(/Набери сумму/.test(await cardText(page)), 'категория раньше суммы: просим сумму')
    for (const k of ['1', '2']) await page.tapEl(page.locator(tour('keypad')).getByRole('button', { name: k, exact: true }), 120)
    ok(/Записать расход/.test(await cardText(page)), 'сумма и категория есть — к «Записать»')
    await page.tapEl(page.locator(tour('save')), 1300)
    ok(/Первая запись/.test(await cardText(page)), 'записано — шаг баланса')
    await page.tapEl(page.getByRole('button', { name: 'Отменить' }), 900)
    const st = await store(page)
    ok(st?.state.transactions?.length === 0 && /Нажми «\+»/.test(await cardText(page)), 'запись отменили тостом — снова к «+»', st?.state.transactions?.length)
    await page.tapEl(page.locator(tour('plus')), 900)
    for (const k of ['5', '0']) await page.tapEl(page.locator(tour('keypad')).getByRole('button', { name: k, exact: true }), 120)
    await page.tapEl(page.locator(tour('categories')).getByRole('button', { name: 'Еда', exact: true }), 300)
    await page.tapEl(page.locator(tour('save')), 1300)
    await page.reload(); await page.waitForTimeout(1500)
    ok(/Первая запись/.test(await cardText(page)), 'перезапуск после записи — продолжаем с баланса')
    // «Пропустить» посреди — обучение уходит, всё нажимается.
    await page.tapEl(card(page).getByRole('button', { name: 'Пропустить обучение' }), 600)
    ok(!(await card(page).count()), '«Пропустить» — обучение ушло')
    await page.tapEl(page.locator(tour('tab-rewards')), 700)
    ok(await active(page, 'rewards'), 'после пропуска вкладки нажимаются')
    ok(page.errs.length === 0, 'ошибок нет', page.errs)
    await ctx.close()
  }

  /* 4. Низкие экраны: карточка не закрывает сумму, клавиатура уходит сама, если категориям тесно. */
  for (const [w, h] of [[320, 568], [375, 590], [360, 720]]) {
    const { ctx, page } = await newApp(browser, { width: w, height: h })
    await page.tapEl(card(page).getByRole('button', { name: 'Пройти обучение' }))
    let b = await boxes(page, ['plus'])
    ok(b.card.bottom <= b.plus.top && b.card.top >= 0, `${w}×${h}: карточка над «+»`, b)
    await page.tapEl(page.locator(tour('plus')), 900)
    b = await boxes(page, ['amount', 'keypad'])
    ok(b.card.top >= 0 && b.card.bottom <= b.amount.top + 6, `${w}×${h}: карточка над суммой, сумма и клавиши видны`, b)
    if (w === 320) await page.screenshot({ path: path.join(OUT, 'tour-9-320-amount.png') })
    for (const k of ['4', '0', '0']) await page.tapEl(page.locator(tour('keypad')).getByRole('button', { name: k, exact: true }), 120)
    await page.waitForTimeout(1300)
    const cats = await page.evaluate(() => {
      const c = document.querySelector('[data-tour=categories]').getBoundingClientRect()
      const f = document.querySelector('[data-tour=form]').getBoundingClientRect()
      return { seen: Math.round(Math.min(c.bottom, f.bottom) - Math.max(c.top, f.top)), full: Math.round(c.height), folded: !!document.querySelector('.keypad-fold.is-folded') }
    })
    ok(/Выбери категорию/.test(await cardText(page)) && cats.seen >= cats.full - 8, `${w}×${h}: категории видны целиком${cats.folded ? ' (клавиатура ушла сама)' : ''}`, cats)
    b = await boxes(page, ['categories'])
    ok(!overlaps(b.card, b.categories), `${w}×${h}: карточка не закрывает категории`, b)
    if (w === 320) await page.screenshot({ path: path.join(OUT, 'tour-9-320-category.png') })
    await page.tapEl(page.locator(tour('categories')).getByRole('button', { name: 'Еда', exact: true }), 500)
    await page.tapEl(page.locator(tour('save')), 1300)
    b = await boxes(page, ['balance', 'tab-analytics'])
    ok(/Первая запись/.test(await cardText(page)) && !overlaps(b.card, b.balance) && !overlaps(b.card, b.toast) && b.card.top >= 0 && b.card.bottom <= h, `${w}×${h}: шаг баланса — карточка в экране, не на балансе и не под тостом`, b)
    if (w === 320) await page.screenshot({ path: path.join(OUT, 'tour-9-320-balance.png') })
    await page.tapEl(page.locator(tour('tab-analytics')), 1100)
    b = await boxes(page, ['spent', 'tab-rewards'])
    ok(b.card.top >= 0 && b.card.bottom <= h && !overlaps(b.card, b.toast) && !overlaps(b.card, b['tab-rewards']), `${w}×${h}: шаг аналитики — карточка в экране, не под тостом и не на вкладке`, b)
    if (w === 320) await page.screenshot({ path: path.join(OUT, 'tour-9-320-analytics.png') })
    ok(page.errs.length === 0, 'ошибок нет', page.errs)
    await ctx.close()
  }

  /* 5. Светлая тема — снимки. */
  {
    // Стор со светлой темой = уже открывал приложение: обучение приходит повторным предложением.
    const { ctx, page } = await newApp(browser, { theme: 'light', preset: { 'finance-mini-app:v1': JSON.stringify({ state: { themeMode: 'light' }, version: 18 }) } })
    await card(page).waitFor()
    await page.waitForTimeout(500)
    await page.screenshot({ path: path.join(OUT, 'tour-light-offer.png') })
    await page.tapEl(card(page).getByRole('button', { name: 'Пройти обучение' }))
    await page.tapEl(page.locator(tour('plus')), 900)
    for (const k of ['2', '5', '0']) await page.tapEl(page.locator(tour('keypad')).getByRole('button', { name: k, exact: true }), 120)
    await page.waitForTimeout(900)
    await page.tapEl(page.locator(tour('categories')).getByRole('button', { name: 'Еда', exact: true }), 500)
    await page.tapEl(page.locator(tour('save')), 1300)
    await page.screenshot({ path: path.join(OUT, 'tour-light-balance.png') })
    ok(/Первая запись/.test(await cardText(page)), 'светлая тема: путь тот же')
    ok(page.errs.length === 0, 'ошибок нет', page.errs)
    await ctx.close()
  }

  /* 5б. «Меньше движения»: без перетеканий, всё сразу на месте, путь тот же. */
  {
    const { ctx, page } = await newApp(browser)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.tapEl(card(page).getByRole('button', { name: 'Пройти обучение' }), 300)
    let b = await boxes(page, ['plus'])
    ok(b.ring && Math.abs(b.ring.top - (b.plus.top - 6)) <= 1, 'меньше движения: кольцо сразу на «+»', b)
    await page.tapEl(page.locator(tour('plus')), 700)
    for (const k of ['9', '9']) await page.tapEl(page.locator(tour('keypad')).getByRole('button', { name: k, exact: true }), 100)
    await page.waitForTimeout(900)
    await page.tapEl(page.locator(tour('categories')).getByRole('button', { name: 'Еда', exact: true }), 300)
    await page.tapEl(page.locator(tour('save')), 1000)
    ok(/Первая запись/.test(await cardText(page)), 'меньше движения: путь тот же')
    ok(page.errs.length === 0, 'ошибок нет', page.errs)
    await ctx.close()
  }

  /* 6. Повторное предложение тем, кто заходит, а записей нет. */
  const DAY = 86_400_000
  const blob = (dates) => JSON.stringify({ state: { transactions: dates.map((d, i) => ({ id: 'r' + i, type: 'expense', amount: 10, categoryId: 'food', date: new Date(d).toISOString(), note: '', currency: 'RUB' })), currency: 'RUB', themeMode: 'dark' }, version: 18 })
  const old = { 'koshel:onboarded': '1', 'koshel:lastVersion': '2.9.0', 'koshel:curAsked': '1' }
  const cases = [
    ['записей нет совсем', [], true],
    ['записи есть (позавчера), сегодня нет', [Date.now() - 2 * DAY], false],
  ]
  for (const [name, dates, want] of cases) {
    const { ctx, page, qs } = await newApp(browser, { preset: { ...old, 'finance-mini-app:v1': blob(dates) }, wait: 1000 })
    ok(!(await card(page).count()), `${name}: сразу при запуске — не мешаем`)
    await page.waitForTimeout(2600)
    const shown = /Показать, как тут всё устроено/.test(await cardText(page))
    ok(shown === want, `${name}: обучение ${want ? 'предложено' : 'не предлагаем'}`)
    if (want) {
      await page.tapEl(card(page).getByRole('button', { name: 'Разберусь сам' }), 600)
      ok(!(await card(page).count()) && qs.length === 0, `${name}: «Разберусь сам» закрывает, в воронку новичков не идёт`)
      await page.reload(); await page.waitForTimeout(3800)
      ok(!(await card(page).count()), `${name}: в тот же день второй раз не предлагаем`)
    }
    ok(page.errs.length === 0, 'ошибок нет', page.errs)
    await ctx.close()
  }
  {
    const { ctx, page } = await newApp(browser, { preset: { ...old, 'finance-mini-app:v1': blob([]), 'koshel:tourDone': '1' }, wait: 4000 })
    ok(!(await card(page).count()), 'прошёл обучение до конца — больше не предлагаем')
    await ctx.close()
  }
  {
    const { ctx, page } = await newApp(browser, { preset: { ...old, 'finance-mini-app:v1': blob([]), 'koshel:tourAsk': JSON.stringify({ n: 3, d: 0 }) }, wait: 4000 })
    ok(!(await card(page).count()), 'предлагали уже трижды — хватит')
    await ctx.close()
  }

  /* 7. Ссылка для проверки: ?tour=1 — сразу, даже у постоянного пользователя. */
  {
    const { ctx, page, qs } = await newApp(browser, { preset: { ...old, 'koshel:tourDone': '1', 'finance-mini-app:v1': blob([Date.now() - 30 * DAY, Date.now()]) }, url: '?tour=1' })
    ok(/Показать, как тут всё устроено/.test(await cardText(page)), 'ссылка ?tour=1 — обучение сразу')
    await page.tapEl(card(page).getByRole('button', { name: 'Пройти обучение' }))
    await page.tapEl(page.locator(tour('plus')), 900)
    ok(/Набери сумму/.test(await cardText(page)) && qs.length === 0, 'по ссылке проходится как обычно и в воронку не идёт')
    await ctx.close()
  }

  /* 8. Незаконченное обучение 2.9 (место в старом формате) продолжается. */
  {
    const { ctx, page } = await newApp(browser, { preset: { 'koshel:qs': JSON.stringify({ v: 2, s: 2, ids: [] }) } })
    ok(/Нажми «\+»/.test(await cardText(page)), 'место из обучения 2.9 — продолжаем с «+»')
    await ctx.close()
  }

  await browser.close()
  console.log(fails ? `\n${fails} FAIL` : '\nвсё OK')
  process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
