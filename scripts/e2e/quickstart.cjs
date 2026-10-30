// Быстрый старт 2.8 на сборке (vite preview :4180): все пути — трата и доход,
// без всего, только трата, только доход; продолжение после закрытия приложения;
// выход крестиком; что уходит в /qs; тёмная тема и цвета Telegram.
const { chromium } = require('playwright')
const path = require('node:path')
const fs = require('node:fs')

const BASE = process.env.BASE || 'http://localhost:4180/'
const OUT = path.join(__dirname, 'shots')
fs.mkdirSync(OUT, { recursive: true })
let fails = 0
const ok = (c, m, extra) => { if (!c) fails++; console.log((c ? 'OK   ' : 'FAIL ') + m + (c || extra === undefined ? '' : '  ' + JSON.stringify(extra))) }

async function newApp(browser, { preset, tgScheme = 'light', width = 390 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 780 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
  const qs = []
  const chrome = []
  await ctx.route('https://telegram.org/**', (r) => r.fulfill({ contentType: 'application/javascript', body: '' }))
  await ctx.route('https://*.clarity.ms/**', (r) => r.abort())
  await ctx.route('https://koshel-worker.karateka004.workers.dev/**', (r) => {
    const url = r.request().url()
    if (url.endsWith('/qs')) { qs.push(JSON.parse(r.request().postData() || '{}')); return r.fulfill({ contentType: 'application/json', body: '{"ok":true}' }) }
    return r.abort()
  })
  await ctx.exposeBinding('__chrome', (_s, kind, color) => { chrome.push([kind, color]) })
  await ctx.addInitScript(({ preset, tgScheme }) => {
    if (preset && !sessionStorage.getItem('__preset_done')) {
      for (const [k, v] of Object.entries(preset)) localStorage.setItem(k, v)
      sessionStorage.setItem('__preset_done', '1')
    }
    const noop = () => {}
    window.Telegram = {
      WebApp: {
        initData: 'user=%7B%22id%22%3A4242%7D&hash=x',
        initDataUnsafe: { user: { id: 4242, first_name: 'Тест', allows_write_to_pm: true } },
        platform: 'ios', version: '8.0', colorScheme: tgScheme, themeParams: {},
        isVersionAtLeast: () => true,
        ready: noop, expand: noop, close: noop,
        setHeaderColor: (c) => window.__chrome('header', c),
        setBackgroundColor: (c) => window.__chrome('bg', c),
        setBottomBarColor: (c) => window.__chrome('bottom', c),
        disableVerticalSwipes: noop, enableVerticalSwipes: noop,
        onEvent: noop, offEvent: noop, openLink: noop, openTelegramLink: noop,
        showConfirm: (m, cb) => cb && cb(true),
        requestWriteAccess: (cb) => cb && cb(true),
        HapticFeedback: { impactOccurred: noop, notificationOccurred: noop, selectionChanged: noop },
        BackButton: { show: noop, hide: noop, onClick: noop, offClick: noop },
        MainButton: { show: noop, hide: noop, enable: noop, disable: noop, onClick: noop, offClick: noop, setParams: noop },
      },
    }
  }, { preset, tgScheme })
  const page = await ctx.newPage()
  page.errs = []
  page.on('pageerror', (e) => page.errs.push(e.message))
  await page.goto(BASE)
  return { ctx, page, qs, chrome }
}

const tap = async (page, name) => {
  await page.getByRole('button', { name }).first().click()
  await page.waitForTimeout(520)
}
const store = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('finance-mini-app:v1') || 'null'))
// Persist пишет с задержкой — ждём, пока запись дойдёт.
const settle = (page) => page.waitForTimeout(900)
const qsOpen = (page) => page.getByRole('heading', { level: 2 }).first().isVisible().catch(() => false)

;(async () => {
  const browser = await chromium.launch()

  /* 1. Трата и доход: «Дальше» сам записывает набранную трату. */
  {
    const { ctx, page, qs, chrome } = await newApp(browser)
    await page.waitForTimeout(700)
    ok(await page.evaluate(() => document.documentElement.classList.contains('dark')), 'новичок: тёмная тема с первого кадра (Telegram светлый)')
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    ok(bg === 'rgb(14, 15, 14)', 'фон страницы тёмный: ' + bg)
    ok(chrome.some(([k, c]) => k === 'bg' && c === '#0E0F0E') && chrome.some(([k, c]) => k === 'bottom' && c === '#0E0F0E') && chrome.some(([k, c]) => k === 'header' && c === '#0E0F0E'), 'Telegram: шапка, фон и нижняя полоса — цвет страницы', chrome)
    await page.screenshot({ path: path.join(OUT, 'qs-0-welcome.png') })
    await tap(page, /Поехали/)
    await tap(page, /^Дальше/)
    ok(await page.getByText('Какие сегодня были траты?').isVisible(), 'после настроек — сразу трата')
    ok(await page.getByRole('button', { name: /^Дальше/ }).isDisabled(), 'пусто — «Дальше» неактивна')
    ok(await page.getByRole('button', { name: 'Сегодня трат не было' }).isVisible(), 'есть «Сегодня трат не было»')
    await page.screenshot({ path: path.join(OUT, 'qs-2-expense-empty.png') })
    await page.locator('input[type=number]').first().fill('321')
    ok(!(await page.getByRole('button', { name: 'Сегодня трат не было' }).isVisible()), 'сумма набрана — пропуск спрятан')
    await tap(page, /^Дальше/)
    ok(await page.getByText('Сколько получаешь в месяц?').isVisible(), '«Дальше» с набранной суммой — к доходу')
    await settle(page)
    let st = await store(page)
    ok(st.state.transactions.length === 1 && st.state.transactions[0].amount === 321 && st.state.transactions[0].type === 'expense', 'трата записана сразу', st.state.transactions)
    ok(st.version === 18 && st.state.themeMode === 'dark', 'стор: версия 18, тема тёмная', { v: st.version, t: st.state.themeMode })
    ok(await page.getByRole('button', { name: 'Пропустить' }).isVisible(), 'доход можно пропустить')
    await page.screenshot({ path: path.join(OUT, 'qs-3-income.png') })
    await page.locator('input[type=number]').first().fill('50000')
    await tap(page, /^Дальше/)
    const hero = await page.locator('div.fixed.bottom-0 .hero-surface').first().textContent()
    ok(/Останется к концу месяца|Не хватит к концу месяца/.test(hero), 'итог: прогноз на месяц', hero)
    ok(await page.getByText(/Бюджет на месяц/).isVisible(), 'бюджет из дохода предложен')
    await page.screenshot({ path: path.join(OUT, 'qs-4-result-both.png') })
    await tap(page, /Открыть приложение/)
    await settle(page)
    st = await store(page)
    ok(st.state.transactions.length === 2 && st.state.monthlyBudget === 50000, 'итог: 2 операции, бюджет 50 000', { n: st.state.transactions.length, b: st.state.monthlyBudget })
    const ls = await page.evaluate(() => ({ on: localStorage.getItem('koshel:onboarded'), qs: localStorage.getItem('koshel:qs') }))
    ok(ls.on === '1' && ls.qs === null, 'быстрый старт закрыт: метка стоит, место стёрто', ls)
    const steps = qs.map((x) => x.s)
    const last = qs.at(-1)
    ok(JSON.stringify(steps.slice(0, 5)) === '[0,1,2,3,4]' && last.d === true && last.e === 1 && last.i === true, '/qs: шаги 0–4 и «дошёл до конца» с тратой и доходом', qs)
    ok(qs.every((x) => !('amount' in x) && Object.keys(x).every((k) => ['initData', 's', 'e', 'i', 'd', 'x'].includes(k))), '/qs: сумм нет')
    ok(page.errs.length === 0, 'ошибок нет', page.errs)
    await ctx.close()
  }

  /* 2. Без траты и без дохода. */
  {
    const { ctx, page, qs } = await newApp(browser)
    await page.waitForTimeout(600)
    await tap(page, /Поехали/)
    await tap(page, /^Дальше/)
    await tap(page, 'Сегодня трат не было')
    ok(await page.getByText('Сколько получаешь в месяц?').isVisible(), 'пропуск траты — к доходу')
    ok(await page.getByRole('button', { name: /^Дальше/ }).isDisabled(), 'доход пуст — «Дальше» неактивна')
    await tap(page, 'Пропустить')
    ok(await page.getByText('Всё готово').isVisible(), 'ничего не записал — «Всё готово» без прогноза')
    ok(!(await page.locator('div.fixed.bottom-0 .hero-surface').count()), 'нет пустой карточки с нулём')
    await page.screenshot({ path: path.join(OUT, 'qs-4-result-none.png') })
    await tap(page, /Открыть приложение/)
    await settle(page)
    const st = await store(page)
    ok((st?.state.transactions.length ?? 0) === 0 && (st?.state.monthlyBudget ?? 0) === 0, 'ничего не записано, бюджета нет')
    ok(await page.getByText('Пусто, но это поправимо').isVisible(), 'Главная — подсказка, как записать')
    const last = qs.at(-1)
    ok(last.d === true && last.e === 0 && last.i === false, '/qs: дошёл до конца без траты и дохода', last)
    await ctx.close()
  }

  /* 3. Только траты: две кнопкой «Добавить», третья — «Дальше»; удалить одну. */
  {
    const { ctx, page } = await newApp(browser)
    await page.waitForTimeout(600)
    await tap(page, /Поехали/)
    await tap(page, /^Дальше/)
    const input = page.locator('input[type=number]').first()
    await input.fill('100'); await tap(page, /Добавить трату/)
    await input.fill('250'); await tap(page, /Добавить трату/)
    ok((await page.locator('li').count()) === 2, 'две траты в списке')
    await page.locator('li').first().getByRole('button').click(); await page.waitForTimeout(300)
    ok((await page.locator('li').count()) === 1, 'удалить одну — осталась одна')
    await input.fill('40'); await tap(page, /^Дальше/)
    await settle(page)
    let st = await store(page)
    ok(st.state.transactions.length === 2 && st.state.transactions.map((t) => t.amount).sort((a, b) => a - b).join() === '40,250', 'в сторе ровно 250 и 40 (удалённая убрана)', st.state.transactions.map((t) => t.amount))
    await tap(page, 'Пропустить')
    const hero = await page.locator('div.fixed.bottom-0 .hero-surface').first().textContent()
    ok(/Траты за день/.test(hero) && /290/.test(hero.replace(/\s/g, '')), 'итог: потрачено 290', hero)
    ok(/бюджет месяца на Главной/.test(hero), 'подсказка, как получить дневную планку', hero)
    ok(!(await page.getByText(/Бюджет на месяц/).count()), 'без дохода бюджет не предлагаем')
    await page.screenshot({ path: path.join(OUT, 'qs-4-result-spent.png') })
    await ctx.close()
  }

  /* 4. Только доход. */
  {
    const { ctx, page } = await newApp(browser)
    await page.waitForTimeout(600)
    await tap(page, /Поехали/)
    await tap(page, /^Дальше/)
    await tap(page, 'Сегодня трат не было')
    await page.locator('input[type=number]').first().fill('31000')
    await tap(page, /^Дальше/)
    const days = await page.evaluate(() => new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate())
    const hero = (await page.locator('div.fixed.bottom-0 .hero-surface').first().textContent()).replace(/[\s,\u00a0\u202f]/g, '')
    const left = days - new Date().getDate() + 1; ok(hero.includes('Можнотратитьвдень') && hero.includes(String(Math.round(31000 / left)) + '$'), 'итог: можно тратить в день ' + Math.round(31000 / left) + ' (как на Главной)', hero)
    ok(await page.getByText(/Бюджет на месяц/).isVisible(), 'бюджет из дохода предложен')
    await page.screenshot({ path: path.join(OUT, 'qs-4-result-income.png') })
    await ctx.close()
  }

  /* 5. Закрыл приложение посреди быстрого старта — продолжает с того же шага. */
  {
    const { ctx, page } = await newApp(browser)
    await page.waitForTimeout(600)
    await tap(page, /Поехали/)
    await tap(page, /^Дальше/)
    await page.locator('input[type=number]').first().fill('555')
    await tap(page, /Добавить трату/)
    await settle(page)
    await page.reload()
    await page.waitForTimeout(1200)
    ok(await page.getByText('Какие сегодня были траты?').isVisible(), 'после перезапуска — снова шаг траты')
    ok((await page.locator('li').count()) === 1 && /555/.test(await page.locator('li').first().textContent()), 'записанная трата на месте')
    await tap(page, /^Дальше/)
    await tap(page, 'Пропустить')
    await tap(page, /Открыть приложение/)
    await settle(page)
    const st = await store(page)
    ok(st.state.transactions.length === 1, 'без дублей: одна трата', st.state.transactions.length)
    await page.reload(); await page.waitForTimeout(1000)
    ok(!(await page.getByText('Какие сегодня были траты?').count()), 'после конца — больше не показываем')
    await ctx.close()
  }

  /* 6. Выход крестиком на доходе. */
  {
    const { ctx, page, qs } = await newApp(browser)
    await page.waitForTimeout(600)
    await tap(page, /Поехали/)
    await tap(page, /^Дальше/)
    await tap(page, 'Сегодня трат не было')
    await page.getByRole('button', { name: /Закрыть|Close/ }).first().click()
    await page.waitForTimeout(800)
    const ls = await page.evaluate(() => ({ on: localStorage.getItem('koshel:onboarded'), qs: localStorage.getItem('koshel:qs') }))
    ok(ls.on === '1' && ls.qs === null, 'крестик: метка стоит, место стёрто', ls)
    ok(qs.at(-1).x === 3 && !qs.at(-1).d, '/qs: закрыл на доходе', qs.at(-1))
    await page.reload(); await page.waitForTimeout(1000)
    ok(!(await page.getByText('Сколько получаешь в месяц?').count()), 'после крестика не возвращаем')
    await ctx.close()
  }

  /* 7. Старые пользователи: «авто» → тёмная; выбранная светлая остаётся. */
  for (const [mode, want] of [['auto', 'dark'], ['light', 'light'], ['dark', 'dark']]) {
    const blob = JSON.stringify({ state: { transactions: [{ id: 'a1', type: 'expense', amount: 5, categoryId: 'food', date: new Date().toISOString(), note: '' }], themeMode: mode, currency: 'UAH' }, version: 17 })
    const { ctx, page, chrome } = await newApp(browser, { preset: { 'finance-mini-app:v1': blob, 'koshel:onboarded': '1' }, tgScheme: 'light' })
    await page.waitForTimeout(1200)
    const dark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
    await settle(page)
    const st = await store(page)
    ok(dark === (want === 'dark') && st.state.themeMode === want && st.version === 18, `старый «${mode}» → ${want}`, { dark, t: st.state.themeMode, v: st.version })
    if (want === 'light') ok(chrome.some(([k, c]) => k === 'bg' && c === '#F6F6F3'), 'светлая: фон Telegram — цвет страницы', chrome)
    await ctx.close()
  }

  await browser.close()
  console.log(fails ? `ПРОВАЛОВ: ${fails}` : 'всё прошло')
  process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
