// Адвент-календарь и праздничный «Прогресс» (vite preview :4180) — по датам,
// часы страницы подменены (Date до кода приложения):
//   26 ноября — тизер: праздничный вид, отсчёт, «Серия дня» на месте, окошки закрыты;
//   5 декабря — плитка вместо серии, точка на вкладке, карточка на Главной →
//               адвент; окошко дня (серия, монеты, совет, действие), повторный тап
//               без награды, пропущенное за монеты (и без монет — нельзя);
//   31 декабря — «Новый год этой ночью», окошко 31;
//   2 января — «Серия дня» вернулась, главный подарок (и когда окошек мало);
//   15 января — сезон закончился;
//   320 px — без вылезания по ширине и без обрезанного заголовка; светлая тема;
//   стор 18 → 19 (миграция), Магазин: новогодняя коллекция не продаётся.
const { chromium } = require('playwright')
const path = require('node:path')
const fs = require('node:fs')

const BASE = process.env.BASE || 'http://localhost:4180/'
const OUT = path.join(__dirname, 'shots')
fs.mkdirSync(OUT, { recursive: true })
let fails = 0
let passes = 0
const ok = (c, m, extra) => {
  if (c) passes++
  else fails++
  console.log((c ? 'OK   ' : 'FAIL ') + m + (c || extra === undefined ? '' : '  ' + JSON.stringify(extra)))
}

/** Операции за два месяца до «сегодня» страницы — чтобы приложение было обжитым. */
function seedState(extra, version) {
  return { version, extra }
}

async function newApp(browser, { date, state = {}, version = 19, width = 390, scheme = 'dark' }) {
  const ctx = await browser.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, timezoneId: 'Europe/Berlin', colorScheme: scheme })
  await ctx.route('https://telegram.org/**', (r) => r.fulfill({ contentType: 'application/javascript', body: '' }))
  await ctx.route('https://*.clarity.ms/**', (r) => r.abort())
  await ctx.route('https://koshel-worker.karateka004.workers.dev/**', (r) => r.fulfill({ contentType: 'application/json', body: '{"ok":true}' }))
  // Часы: «сейчас» = date, дальше идут как обычно.
  await ctx.addInitScript((iso) => {
    const T = new Date(iso).getTime()
    const D = Date
    const off = T - D.now()
    class FD extends D {
      constructor(...a) {
        super(...(a.length ? a : [D.now() + off]))
      }
      static now() {
        return D.now() + off
      }
    }
    globalThis.Date = FD
  }, date)
  await ctx.addInitScript(({ state, version, scheme }) => {
    if (!sessionStorage.getItem('__seeded')) {
      sessionStorage.setItem('__seeded', '1')
      localStorage.clear()
      for (const [k, v] of [['koshel:onboarded', '1'], ['koshel:lastVersion', '9.9.9'], ['koshel:curAsked', '1'], ['koshel:remindAsked', '1'], ['koshel:botWrite', '1'], ['koshel:tourDone', '1'], ['koshel:clarity', '0']]) localStorage.setItem(k, v)
      const tx = []
      const now = new Date()
      for (let i = 0; i < 60; i++) {
        const d = new Date(now)
        d.setDate(d.getDate() - Math.floor(i / 2) - 1)
        d.setHours(10, i, 0, 0)
        tx.push({ id: 'e' + d.getTime().toString(36) + i, type: 'expense', amount: 5 + (i % 7) * 3, categoryId: ['food', 'cafe', 'transport'][i % 3], date: d.toISOString(), currency: 'EUR' })
      }
      localStorage.setItem('finance-mini-app:v1', JSON.stringify({ state: Object.assign({ transactions: tx, currency: 'EUR', lastTxCurrency: 'EUR', lang: 'ru', themeMode: scheme, coins: 100, bonusXp: 0, streak: { count: 0, best: 0, lastClaim: null } }, state), version }))
    }
    const noop = () => {}
    window.Telegram = {
      WebApp: {
        initData: '', initDataUnsafe: { user: { id: 4242, first_name: 'Тест' } },
        platform: 'ios', version: '8.0', colorScheme: scheme, themeParams: {},
        isVersionAtLeast: () => true, ready: noop, expand: noop, close: noop,
        setHeaderColor: noop, setBackgroundColor: noop, setBottomBarColor: noop,
        disableVerticalSwipes: noop, enableVerticalSwipes: noop, onEvent: noop, offEvent: noop,
        openLink: noop, openTelegramLink: noop,
        HapticFeedback: { impactOccurred: noop, notificationOccurred: noop, selectionChanged: noop },
        BackButton: { show: noop, hide: noop, onClick: noop, offClick: noop },
      },
    }
  }, { state, version, scheme })
  const page = await ctx.newPage()
  page.errs = []
  page.on('pageerror', (e) => page.errs.push(e.message))
  await page.goto(BASE)
  await page.waitForTimeout(1300)
  return { ctx, page }
}

/** Стор из памяти приложения (persist пишет с задержкой — сначала сбросить). */
const store = async (page) => {
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')))
  return page.evaluate(() => JSON.parse(localStorage.getItem('finance-mini-app:v1') || 'null')?.state)
}
const progress = (page) => page.locator('[data-tour="tab-rewards"]').click().then(() => page.waitForTimeout(1300))
const door = (page, d) => page.locator(`.door[data-day="${d}"]`)
// Текст всех открытых окон: поверх шторки может встать «Новый уровень» (главный подарок даёт +100 XP).
const sheetText = (page) => page.locator('[aria-modal=true]').evaluateAll((els) => els.map((e) => e.innerText).join('\n')).catch(() => '')
const closeSheet = (page) => page.keyboard.press('Escape').then(() => page.waitForTimeout(600))
const days = (n, skip = []) => {
  const out = []
  for (let d = 1; out.length < n && d <= 31; d++) if (!skip.includes(d)) out.push('2026-12-' + String(d).padStart(2, '0'))
  return out
}

;(async () => {
  const browser = await chromium.launch()

  /* 1. Тизер, 26 ноября: праздничный вид, отсчёт, серия на месте, окошки закрыты. */
  {
    const { ctx, page } = await newApp(browser, { date: '2026-11-26T12:00:00', version: 18 })
    const st = await store(page)
    ok(Array.isArray(st?.advent) && st.advent.length === 0, 'стор 18 → 19: появился пустой список окошек', st?.advent)
    await progress(page)
    ok(await page.locator('.festive-sky').count() === 1, 'тизер: небо со снегом над «Прогрессом»')
    ok((await page.locator('.tab-panel:not([data-off]) .kicker').first().innerText()).includes('С наступающим'), 'тизер: «С наступающим!»')
    const chip = (await page.locator('[data-ny-chip]').innerText().catch(() => '')).replace(/\s+/g, ' ')
    ok(chip.includes('36'), 'тизер: «Новый год через 36 дн.»', chip)
    ok(await page.locator('.hero-surface .garland').count() === 1, 'тизер: гирлянда на карте уровня')
    ok(await page.locator('[data-advent-tile]').count() === 0, 'тизер: плитки адвента ещё нет — «Серия дня» на месте')
    const card = await page.locator('[data-advent-card]').innerText().catch(() => '')
    ok(/через\s5\sдней/.test(card), 'тизер: карточка «через 5 дней»', card)
    await page.locator('[data-advent-card]').click()
    await page.waitForTimeout(1400)
    const states = await page.locator('.door').evaluateAll((els) => els.map((e) => e.dataset.state))
    ok(states.length === 31 && states.every((x) => x === 'locked'), 'тизер: 31 окошко, все закрыты', states)
    await door(page, 1).click()
    await page.waitForTimeout(500)
    ok((await page.locator('body').innerText()).includes('Окошки откроются с 1 декабря'), 'тизер: тап по окошку — «откроются с 1 декабря»')
    ok(((await store(page))?.advent ?? []).length === 0, 'тизер: ничего не открылось')
    await page.screenshot({ path: path.join(OUT, 'advent-teaser.png') })
    ok(page.errs.length === 0, 'тизер: ошибок нет', page.errs)
    await ctx.close()
  }

  /* 2. 5 декабря: плитка, точка, Главная → адвент, окошко дня, повтор, пропущенное. */
  {
    const state = { advent: ['2026-12-01', '2026-12-02', '2026-12-04'], streak: { count: 3, best: 9, lastClaim: '2026-12-04' }, coins: 25 }
    const { ctx, page } = await newApp(browser, { date: '2026-12-05T09:30:00', state })
    ok(await page.locator('[data-advent-dot]').count() === 1, '5 дек: точка на «Прогрессе»')
    ok(await page.locator('[data-advent-nudge]').count() === 1, '5 дек: на Главной «Окошко адвента ждёт»')
    await page.locator('[data-advent-nudge]').click()
    await page.waitForTimeout(1600)
    ok(await page.locator('.advent-grid').count() === 1, '5 дек: карточка Главной открыла адвент')
    ok((await door(page, 5).getAttribute('data-state')) === 'today', '5 дек: окошко 5 — сегодняшнее')
    ok((await door(page, 6).getAttribute('data-state')) === 'locked', '5 дек: окошко 6 закрыто')
    ok((await door(page, 3).getAttribute('data-state')) === 'missed', '5 дек: окошко 3 пропущено')
    ok((await door(page, 4).getAttribute('data-state')) === 'open', '5 дек: окошко 4 открыто')

    // Пропущенное без монет (25 < 30) — нельзя.
    await door(page, 3).click()
    await page.waitForTimeout(800)
    let txt = await sheetText(page)
    ok(txt.includes('Пропущенное окошко') && txt.includes('Не хватает 5'), '5 дек: пропущенное при 25 монетах — «Не хватает 5»', txt.slice(0, 160))
    await page.locator('[data-advent-late]').click({ force: true })
    await page.waitForTimeout(400)
    ok(!((await store(page))?.advent ?? []).some((k) => k.startsWith('2026-12-03')), '5 дек: без монет окошко не открылось')
    await closeSheet(page)

    // Окошко дня: серия, монеты, вещь, совет с действием.
    await door(page, 5).click()
    await page.waitForTimeout(1600)
    let st = await store(page)
    ok(st.advent.includes('2026-12-05'), '5 дек: окошко 5 открыто в свой день')
    ok(st.streak.lastClaim === '2026-12-05' && st.streak.count === 4, '5 дек: окошко засчитало день серии', st.streak)
    ok(st.coins === 25 + 10 + 5, '5 дек: монеты = окошко 10 + серия 5', st.coins)
    ok(st.owned.includes('accent_frost'), '5 дек: «Иней» в купленном')
    txt = await sheetText(page)
    ok(txt.includes('5 декабря') && txt.includes('Иней') && txt.includes('Совет дня') && txt.includes('Задать бюджет'), '5 дек: шторка — вещь, совет и «Задать бюджет»', txt.slice(0, 200))
    await page.locator('[data-advent-wear]').click()
    await page.waitForTimeout(300)
    ok((await store(page)).equipped.accent === 'accent_frost', '5 дек: «Надеть» надело «Иней»')
    await page.screenshot({ path: path.join(OUT, 'advent-door.png') })
    await page.locator('[data-advent-action]').click()
    await page.waitForTimeout(1200)
    ok((await page.locator('[aria-modal=true]').last().innerText()).includes('Бюджет'), '5 дек: «Задать бюджет» открыло планирование')
    await closeSheet(page)
    ok((await door(page, 5).getAttribute('data-state')) === 'open', '5 дек: окошко 5 теперь открыто')

    // Повторный тап — только посмотреть, без награды.
    await door(page, 5).click()
    await page.waitForTimeout(800)
    ok((await store(page)).coins === 40, '5 дек: повторный тап не начисляет', (await store(page)).coins)
    await closeSheet(page)

    // Пропущенное за монеты: 40 → 40 − 30 + 20.
    await door(page, 3).click()
    await page.waitForTimeout(700)
    await page.locator('[data-advent-late]').click()
    await page.waitForTimeout(900)
    st = await store(page)
    ok(st.advent.includes('2026-12-03:late'), '5 дек: пропущенное открыто за монеты (:late)')
    ok(st.coins === 40 - 30 + 20, '5 дек: монеты за пропущенное', st.coins)
    ok(st.streak.count === 4, '5 дек: пропущенное серию не трогает', st.streak)
    await closeSheet(page)

    // Точка и карточка Главной уходят.
    ok(await page.locator('[data-advent-dot]').count() === 0, '5 дек: точка на вкладке погасла')
    await page.locator('[data-tour="tab-home"]').click()
    await page.waitForTimeout(900)
    ok(await page.locator('[data-advent-nudge]').count() === 0, '5 дек: карточки на Главной больше нет')
    await page.locator('[data-tour="tab-rewards"]').click()
    await page.waitForTimeout(1200)
    // Повторный тап по вкладке — на хаб: там плитка адвента вместо серии.
    await page.locator('[data-tour="tab-rewards"]').click()
    await page.waitForTimeout(900)
    const tile = await page.locator('[data-advent-tile]').innerText().catch(() => '')
    ok(tile.includes('Открыто 5 из 31'), '5 дек: плитка — «Открыто 5 из 31»', tile)
    ok(page.errs.length === 0, '5 дек: ошибок нет', page.errs)
    await ctx.close()
  }

  /* 3. 31 декабря: «Новый год этой ночью», окошко 31 с «Дедом Морозом». */
  {
    const { ctx, page } = await newApp(browser, { date: '2026-12-31T21:00:00', state: { advent: days(20) } })
    await progress(page)
    ok((await page.locator('[data-ny-chip]').innerText().catch(() => '')).includes('этой ночью'), '31 дек: «Новый год этой ночью»')
    await page.locator('[data-advent-tile]').click()
    await page.waitForTimeout(1400)
    ok((await door(page, 31).getAttribute('data-state')) === 'today', '31 дек: окошко 31 — сегодняшнее')
    await door(page, 31).click()
    await page.waitForTimeout(1500)
    ok((await store(page)).owned.includes('title_santa'), '31 дек: «Дед Мороз» получен')
    ok(page.errs.length === 0, '31 дек: ошибок нет', page.errs)
    await ctx.close()
  }

  /* 4. 2 января, 24 окошка: серия на месте, главный подарок. */
  {
    const { ctx, page } = await newApp(browser, { date: '2027-01-02T12:00:00', state: { advent: days(24, [9, 17]), streak: { count: 0, best: 24, lastClaim: '2026-12-26' } } })
    await progress(page)
    ok(await page.locator('[data-advent-tile]').count() === 0, '2 янв: плитка адвента ушла — «Серия дня» вернулась')
    ok((await page.locator('.tab-panel:not([data-off]) .kicker').first().innerText()).includes('С Новым годом'), '2 янв: «С Новым годом!»')
    ok(await page.locator('[data-ny-chip]').count() === 0, '2 янв: отсчёта нет')
    const card = await page.locator('[data-advent-card]').innerText().catch(() => '')
    ok(card.includes('Главный подарок ждёт'), '2 янв: карточка «Главный подарок ждёт»', card)
    await page.locator('[data-advent-card]').click()
    await page.waitForTimeout(1400)
    ok((await page.locator('[data-advent-final]').getAttribute('data-advent-final')) === 'is-ready', '2 янв: главный подарок готов')
    ok((await door(page, 9).getAttribute('data-state')) === 'missed', '2 янв: неоткрытое — пропущенное')
    const before = await store(page)
    await page.locator('[data-advent-final]').click()
    await page.waitForTimeout(1500)
    const st = await store(page)
    ok(st.advent.includes('2026-final'), '2 янв: главный подарок открыт')
    ok(st.owned.includes('card_newyear') && st.owned.includes('title_newyear'), '2 янв: «Новогодняя ночь» и «Новогодний дух» получены')
    ok(st.bonusXp === before.bonusXp + 100 && st.coins === before.coins + 100, '2 янв: +100 монет и +100 XP', { c: st.coins, x: st.bonusXp })
    ok((await sheetText(page)).includes('С Новым годом'), '2 янв: шторка «С Новым годом!»')
    await page.screenshot({ path: path.join(OUT, 'advent-final.png') })
    await closeSheet(page)
    ok((await page.locator('[data-advent-final]').getAttribute('data-advent-final')) === 'is-done', '2 янв: главный подарок — «получено»')
    ok(page.errs.length === 0, '2 янв: ошибок нет', page.errs)
    await ctx.close()
  }

  /* 5. 2 января, 20 окошек: подарок закрыт, сколько не хватает. */
  {
    const { ctx, page } = await newApp(browser, { date: '2027-01-02T12:00:00', state: { advent: days(20) } })
    await progress(page)
    const card = await page.locator('[data-advent-card]').innerText().catch(() => '')
    ok(card.includes('открыто 20 из 31') && card.includes('4 окошка'), '2 янв, 20 окошек: «до главного подарка — 4 окошка»', card)
    await ctx.close()
  }

  /* 6. 15 января: сезон закончился. */
  {
    const { ctx, page } = await newApp(browser, { date: '2027-01-15T12:00:00', state: { advent: days(24), owned: ['accent_mint', 'card_newyear'] } })
    await progress(page)
    ok(await page.locator('.festive-sky').count() === 0 && (await page.locator('[data-advent-card]').count()) === 0, '15 янв: ни неба, ни карточки')
    ok((await page.locator('.tab-panel:not([data-off]) .kicker').first().innerText()).includes('Уровень'), '15 янв: обычная шапка')
    // Купленное из коллекции надеть можно и после сезона — в Магазине.
    await page.locator('text=Магазин').first().click()
    await page.waitForTimeout(1200)
    const shop = await page.locator('body').innerText()
    ok(shop.includes('Новогодняя коллекция'), '15 янв: в Магазине коллекция (есть её вещь)')
    await ctx.close()
  }

  /* 7. Магазин в сезон: коллекция не продаётся. */
  {
    const { ctx, page } = await newApp(browser, { date: '2026-12-05T12:00:00', state: { coins: 5000 } })
    await progress(page)
    await page.locator('text=Магазин').first().click()
    await page.waitForTimeout(1200)
    ok((await page.locator('body').innerText()).includes('Новогодняя коллекция'), 'Магазин: группа «Новогодняя коллекция»')
    await page.locator('.row', { hasText: 'Гирлянда' }).first().click()
    await page.waitForTimeout(1200)
    const txt = await sheetText(page)
    ok(txt.includes('Только из адвент-календаря') && !txt.includes('Купить'), 'Магазин: «Гирлянду» не купить — только из адвента', txt.slice(0, 160))
    ok(!(await store(page)).owned.includes('frame_garland'), 'Магазин: гирлянды нет в купленном')
    ok(page.errs.length === 0, 'Магазин: ошибок нет', page.errs)
    await ctx.close()
  }

  /* 8. 320 px и светлая тема: без вылезания и обрезанного заголовка. */
  for (const [width, scheme] of [[320, 'dark'], [390, 'light']]) {
    const { ctx, page } = await newApp(browser, { date: '2026-12-05T12:00:00', width, scheme, state: { advent: ['2026-12-01'] } })
    await progress(page)
    const kickerH = await page.locator('.tab-panel:not([data-off]) .kicker').first().evaluate((e) => e.getBoundingClientRect().height)
    ok(kickerH < 24, `${width}/${scheme}: «С наступающим!» в одну строку`, kickerH)
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}/${scheme}: хаб не шире экрана`)
    await page.locator('[data-advent-tile]').click()
    await page.waitForTimeout(1400)
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}/${scheme}: адвент не шире экрана`)
    const cut = await page.locator('.text-2xl.truncate').first().evaluate((e) => e.scrollWidth > e.clientWidth)
    ok(!cut, `${width}/${scheme}: заголовок «Адвент-календарь» целиком`)
    await page.screenshot({ path: path.join(OUT, `advent-${width}-${scheme}.png`) })
    ok(page.errs.length === 0, `${width}/${scheme}: ошибок нет`, page.errs)
    await ctx.close()
  }

  await browser.close()
  console.log(`\nадвент: ${passes} OK, ${fails} FAIL`)
  process.exit(fails ? 1 : 0)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
