// Тап по балансу (vite preview :4180): новичок закрыл быстрый старт крестиком →
// баланс с валютой → тап → шторка записи с выбором валюты → выбрал драм и закрыл
// → основная валюта AMD, на Главной «0 ֏» → тап → доход и расход в драмах.
// Плюс: у человека с записями выбор валюты в шторке основную не трогает.
const { chromium } = require('playwright')
const path = require('node:path')
const fs = require('node:fs')

const BASE = process.env.BASE || 'http://localhost:4180/'
const OUT = path.join(__dirname, 'shots')
fs.mkdirSync(OUT, { recursive: true })
let fails = 0
const ok = (c, m, extra) => { if (!c) fails++; console.log((c ? 'OK   ' : 'FAIL ') + m + (c || extra === undefined ? '' : '  ' + JSON.stringify(extra))) }

async function newApp(browser, { preset, tz = 'Asia/Yerevan', scheme = 'dark', width = 390 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 780 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, timezoneId: tz, colorScheme: scheme })
  await ctx.route('https://telegram.org/**', (r) => r.fulfill({ contentType: 'application/javascript', body: '' }))
  await ctx.route('https://*.clarity.ms/**', (r) => r.abort())
  await ctx.route('https://koshel-worker.karateka004.workers.dev/**', (r) => r.fulfill({ contentType: 'application/json', body: '{"ok":true}' }))
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
  page.on('pageerror', (e) => page.errs.push(e.message))
  await page.goto(BASE)
  return { ctx, page }
}

const store = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('finance-mini-app:v1') || 'null'))
const settle = (page) => page.waitForTimeout(900)
// Карточка баланса на Главной (не карточка итога быстрого старта).
const hero = (page) => page.locator('.hero-surface[role=button]').first()
const sheet = (page) => page.locator('[aria-modal=true]').last()
const keys = async (page, digits) => {
  for (const d of digits) await sheet(page).getByRole('button', { name: d, exact: true }).click()
}

;(async () => {
  const browser = await chromium.launch()

  /* 0. Крестик подставляет валюту региона: Ереван — сразу «0 ֏»; регион не понять — «0 $». */
  for (const [tz, sym, code] of [['Asia/Yerevan', '֏', 'AMD'], ['UTC', '$', 'USD']]) {
    const { ctx, page } = await newApp(browser, { tz })
    await page.waitForTimeout(800)
    await page.getByRole('button', { name: /Закрыть|Close/ }).first().click()
    await page.waitForTimeout(900)
    await settle(page)
    const h = (await hero(page).textContent()) ?? ''
    const st = await store(page)
    ok(h.includes(sym) && (st?.state.currency ?? 'USD') === code, `${tz}: после крестика баланс «0 ${sym}»`, { h, c: st?.state.currency })
    ok(page.errs.length === 0, 'ошибок нет', page.errs)
    await ctx.close()
  }

  /* 1. Новичок (Москва): крестик → «0 ₽» → тап → драм поиском → закрыл → «0 ֏» → доход и расход. */
  {
    const { ctx, page } = await newApp(browser, { tz: 'Europe/Moscow' })
    await page.waitForTimeout(800)
    await page.getByRole('button', { name: /Закрыть|Close/ }).first().click()
    await page.waitForTimeout(900)
    let st = await store(page)
    ok((st?.state.transactions.length ?? 0) === 0, 'крестик: записей нет')
    const before = (await hero(page).textContent()) ?? ''
    ok(/0/.test(before) && before.includes('₽'), 'баланс не голый «0»: с валютой (регион — ₽)', before)
    ok(await page.getByRole('button', { name: /Баланс за месяц.*Записать операцию/ }).count() === 1, 'карточка баланса — кнопка: диктор читает баланс и «Записать операцию»')
    await page.screenshot({ path: path.join(OUT, 'bal-1-home-usd.png') })

    await hero(page).click()
    await page.waitForTimeout(700)
    ok(await sheet(page).getByRole('button', { name: /Расход/ }).first().isVisible(), 'тап по балансу — шторка записи открыта')
    ok(await sheet(page).getByRole('button', { name: /Доход/ }).first().isVisible(), 'в шторке можно выбрать доход')
    ok(await sheet(page).getByRole('button', { name: 'Другая валюта' }).isVisible(), 'новичку выбор валюты раскрыт сразу')
    await page.screenshot({ path: path.join(OUT, 'bal-2-sheet-fresh.png') })

    await sheet(page).getByRole('button', { name: 'Другая валюта' }).click()
    await page.waitForTimeout(700)
    ok(await page.getByText('Основная валюта', { exact: true }).isVisible(), 'выбор в шторке подписан «Основная валюта»')
    await page.screenshot({ path: path.join(OUT, 'bal-3-picker.png') })
    await page.getByLabel('Страна, валюта или код').fill('драм')
    await page.waitForTimeout(300)
    await page.locator('[aria-modal=true]').last().getByText('Армянский драм').first().click()
    await page.waitForTimeout(800)
    const chip = await sheet(page).getByRole('button', { expanded: false }).filter({ hasText: '֏' }).count()
    ok(chip > 0, 'в шторке валюта операции — драм')
    await settle(page)
    st = await store(page)
    ok(st.state.currency === 'AMD' && st.state.lastTxCurrency === 'AMD', 'основная валюта — AMD сразу, без записи', { c: st.state.currency, l: st.state.lastTxCurrency })
    ok(await page.evaluate(() => localStorage.getItem('koshel:curAsked')) === '1', 'вопрос о валюте на Главной больше не задаём')
    ok(st.state.transactions.length === 0, 'записей всё ещё нет')

    await sheet(page).getByRole('button', { name: 'Отмена' }).click()
    await page.waitForTimeout(900)
    const after = (await hero(page).textContent()) ?? ''
    ok(/0/.test(after) && after.includes('֏') && !after.includes('₽'), 'закрыл шторку — на Главной «0 ֏»', after)
    ok(!(await page.getByText(/Твоя валюта/).count()), 'подсказки «Твоя валюта — …?» нет')
    await page.screenshot({ path: path.join(OUT, 'bal-4-home-amd.png') })

    await page.reload()
    await page.waitForTimeout(1200)
    const reloaded = (await hero(page).textContent()) ?? ''
    ok(reloaded.includes('֏') && !(await page.getByText('Какие сегодня были траты?').count()), 'после перезапуска — драм, быстрый старт не возвращается', reloaded)

    // Доход прямо с баланса.
    await hero(page).click()
    await page.waitForTimeout(700)
    await sheet(page).getByRole('button', { name: /Доход/ }).first().click()
    await keys(page, ['5', '0', '0', '0', '0'])
    await sheet(page).getByRole('button', { name: 'Зарплата' }).click()
    await page.screenshot({ path: path.join(OUT, 'bal-5-income.png') })
    await sheet(page).getByRole('button', { name: 'Записать доход' }).click()
    await page.waitForTimeout(1200)
    await settle(page)
    st = await store(page)
    const inc = st.state.transactions[0]
    ok(st.state.transactions.length === 1 && inc.type === 'income' && inc.amount === 50000 && inc.currency === 'AMD', 'доход 50 000 ֏ записан с баланса', inc)

    // Расход — тоже с баланса; теперь записи есть, строка валют свёрнута.
    await hero(page).click()
    await page.waitForTimeout(700)
    ok(!(await sheet(page).getByRole('button', { name: 'Другая валюта' }).count()), 'с записями выбор валюты свёрнут, как раньше')
    await keys(page, ['3', '0', '0'])
    await sheet(page).getByRole('button', { name: 'Еда', exact: true }).click()
    await sheet(page).getByRole('button', { name: 'Записать расход' }).click()
    await page.waitForTimeout(1200)
    await settle(page)
    st = await store(page)
    const exp = st.state.transactions.find((t) => t.type === 'expense')
    ok(st.state.transactions.length === 2 && exp?.amount === 300 && exp?.currency === 'AMD', 'расход 300 ֏ записан с баланса', exp)
    const fin = (await hero(page).textContent()) ?? ''
    ok(fin.includes('֏') && /49[\s  ,.]?700/.test(fin), 'баланс 49 700 ֏', fin)
    await page.screenshot({ path: path.join(OUT, 'bal-6-home-after.png') })
    ok(page.errs.length === 0, 'ошибок нет', page.errs)
    await ctx.close()
  }

  /* 2. Новичок: быстрый чип валюты тоже делает её основной; «+» ведёт себя так же. */
  {
    const { ctx, page } = await newApp(browser, { tz: 'Europe/Berlin' })
    await page.waitForTimeout(800)
    await page.getByRole('button', { name: /Закрыть|Close/ }).first().click()
    await page.waitForTimeout(900)
    await page.getByRole('button', { name: 'Добавить операцию' }).first().click()
    await page.waitForTimeout(700)
    ok(await sheet(page).getByRole('button', { name: 'Другая валюта' }).isVisible(), '«+»: новичку выбор валюты раскрыт')
    // Регион — евро (уже основная после крестика); жмём доллар — другой чип.
    await sheet(page).getByRole('button', { name: /USD/ }).first().click()
    await page.waitForTimeout(300)
    await sheet(page).getByRole('button', { name: 'Отмена' }).click()
    await page.waitForTimeout(900)
    await settle(page)
    const st = await store(page)
    ok(st.state.currency === 'USD', 'быстрый чип доллара — основная USD', st.state.currency)
    const h = (await hero(page).textContent()) ?? ''
    ok(h.includes('$') && !h.includes('€'), 'на Главной «0 $»', h)
    ok(page.errs.length === 0, 'ошибок нет', page.errs)
    await ctx.close()
  }

  /* 3. С записями: валюта операции не меняет основную. */
  {
    const blob = JSON.stringify({
      state: { transactions: [{ id: 'a1', type: 'expense', amount: 5, categoryId: 'food', date: new Date().toISOString(), note: '', currency: 'UAH' }], currency: 'UAH', lastTxCurrency: 'UAH', themeMode: 'dark' },
      version: 18,
    })
    const { ctx, page } = await newApp(browser, { preset: { 'finance-mini-app:v1': blob, 'koshel:onboarded': '1', 'koshel:curAsked': '1' }, tz: 'Europe/Kyiv' })
    await page.waitForTimeout(1200)
    await hero(page).click()
    await page.waitForTimeout(700)
    ok(!(await sheet(page).getByRole('button', { name: 'Другая валюта' }).count()), 'с записями — строка валют свёрнута')
    await sheet(page).getByRole('button', { expanded: false }).filter({ hasText: /UAH|₴/ }).first().click()
    await page.waitForTimeout(300)
    await sheet(page).getByRole('button', { name: 'Другая валюта' }).click()
    await page.waitForTimeout(700)
    ok(await page.getByText('Валюта операции', { exact: true }).isVisible(), 'выбор подписан «Валюта операции»')
    await page.getByLabel('Страна, валюта или код').fill('USD')
    await page.waitForTimeout(300)
    await page.locator('[aria-modal=true]').last().getByText('Доллар США').first().click()
    await page.waitForTimeout(700)
    await sheet(page).getByRole('button', { name: 'Отмена' }).click()
    await page.waitForTimeout(900)
    await settle(page)
    const st = await store(page)
    ok(st.state.currency === 'UAH', 'основная осталась UAH', st.state.currency)
    ok(page.errs.length === 0, 'ошибок нет', page.errs)
    await ctx.close()
  }

  /* 4. Светлая тема и 320 px: карточка баланса с валютой, шторка открывается. */
  {
    const blob = JSON.stringify({ state: { transactions: [], themeMode: 'light' }, version: 18 })
    const { ctx, page } = await newApp(browser, { preset: { 'finance-mini-app:v1': blob, 'koshel:onboarded': '1', 'koshel:curAsked': '1' }, width: 320 })
    await page.waitForTimeout(1200)
    const h = (await hero(page).textContent()) ?? ''
    ok(/\$/.test(h), '320 px, светлая: «0 $»', h)
    await page.screenshot({ path: path.join(OUT, 'bal-7-light-320.png') })
    await hero(page).click()
    await page.waitForTimeout(700)
    ok(await sheet(page).getByRole('button', { name: 'Другая валюта' }).isVisible(), '320 px: шторка с выбором валюты')
    await page.screenshot({ path: path.join(OUT, 'bal-8-light-320-sheet.png') })
    ok(page.errs.length === 0, 'ошибок нет', page.errs)
    await ctx.close()
  }

  await browser.close()
  console.log(fails ? `\n${fails} FAIL` : '\nвсё OK')
  process.exit(fails ? 1 : 0)
})()
