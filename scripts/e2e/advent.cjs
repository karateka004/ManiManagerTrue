// Адвент-календарь прямо на «Прогрессе» (vite preview :4180) — по датам,
// часы страницы подменены (Date до кода приложения):
//   26 ноября — тизер: праздничный вид, снегирь, отсчёт, календарь под плитками
//               с закрытыми окошками, «Серия дня» на месте; стор 18 → 19;
//   5 декабря — точка на вкладке, карточка на Главной → календарь в поле зрения;
//               окошко дня раскрывает подарок под календарём (игрушка, серия,
//               монеты, вещь «Надеть», совет и действие), повтор без награды,
//               пропущенное за монеты (без монет — нельзя), правила за «?»;
//   7 декабря — заморозка из окошка спасает пропущенный день;
//   13 декабря — сундучок: вещь из магазина;
//   31 декабря — «Новый год этой ночью», окошко 31 и итоги года;
//   2 января — «Серия дня» вернулась, главный подарок (и когда окошек мало);
//   15 января — сезон закончился; Магазин: коллекция не продаётся;
//   три вида (ёлка, домик, шкатулка) — переключатель по ссылке, 320 px и светлая.
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

async function newApp(browser, { date, state = {}, version = 19, width = 390, scheme = 'dark', query = '' }) {
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
  await page.goto(BASE + query)
  await page.waitForTimeout(1300)
  return { ctx, page }
}

/** Стор из памяти приложения (persist пишет с задержкой — сначала сбросить). */
const store = async (page) => {
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')))
  return page.evaluate(() => JSON.parse(localStorage.getItem('finance-mini-app:v1') || 'null')?.state)
}
const progress = (page) => page.locator('[data-tour="tab-rewards"]').click().then(() => page.waitForTimeout(1500))
const CAL = '.tab-panel:not([data-off]) [data-advent-calendar]'
const door = (page, d) => page.locator(`${CAL} .adv-door[data-day="${d}"]`)
const reveal = (page) => page.locator(`${CAL} .adv-reveal`)
const revealText = (page) => reveal(page).innerText().catch(() => '')
const status = (page) => page.locator(`${CAL} [data-advent-status]`).innerText().catch(() => '')
const tap = async (page, d, wait = 900) => {
  await door(page, d).click()
  await page.waitForTimeout(wait)
}
const days = (n, skip = []) => {
  const out = []
  for (let d = 1; out.length < n && d <= 31; d++) if (!skip.includes(d)) out.push('2026-12-' + String(d).padStart(2, '0'))
  return out
}

;(async () => {
  const browser = await chromium.launch()

  /* 1. Тизер, 26 ноября: праздничный вид, календарь с закрытыми окошками. */
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
    ok(await page.locator('.tab-panel:not([data-off]) .hub-bullfinch').count() === 1, 'тизер: снегирь у гирлянды')
    ok(await page.locator('[data-advent-tile]').count() === 0, 'тизер: «Серия дня» на месте')
    ok(await page.locator(CAL).count() === 1, 'тизер: календарь прямо на «Прогрессе»')
    ok(/через\s5\sдней/.test(await status(page)), 'тизер: «Первое окошко — через 5 дней»', await status(page))
    const states = await page.locator(`${CAL} .adv-door`).evaluateAll((els) => els.map((e) => e.dataset.state))
    ok(states.length === 31 && states.every((x) => x === 'locked'), 'тизер: 31 окошко, все закрыты', states)
    // Календарь стоит между плитками и заданиями.
    const order = await page.evaluate((sel) => {
      const cal = document.querySelector(sel)
      const tiles = document.querySelector('.tab-panel:not([data-off]) .grid.grid-cols-2')
      return !!cal && !!tiles && !!(tiles.compareDocumentPosition(cal) & Node.DOCUMENT_POSITION_FOLLOWING)
    }, CAL)
    ok(order, 'тизер: календарь — под плитками')
    await tap(page, 1, 500)
    ok((await page.locator('body').innerText()).includes('Окошки откроются с 1 декабря'), 'тизер: тап по окошку — «откроются с 1 декабря»')
    ok(((await store(page))?.advent ?? []).length === 0, 'тизер: ничего не открылось')
    ok(await page.locator(`${CAL} [data-advent-variants]`).count() === 0, 'тизер: переключателя видов нет (не владелец)')
    await page.locator(CAL).screenshot({ path: path.join(OUT, 'advent-teaser.png') })
    ok(page.errs.length === 0, 'тизер: ошибок нет', page.errs)
    await ctx.close()
  }

  /* 2. 5 декабря: точка, Главная → календарь, окошко дня, повтор, пропущенное. */
  {
    const state = { advent: ['2026-12-01', '2026-12-02', '2026-12-04'], streak: { count: 3, best: 9, lastClaim: '2026-12-04' }, coins: 25 }
    const { ctx, page } = await newApp(browser, { date: '2026-12-05T09:30:00', state })
    ok(await page.locator('[data-advent-dot]').count() === 1, '5 дек: точка на «Прогрессе»')
    ok(await page.locator('[data-advent-nudge]').count() === 1, '5 дек: на Главной «Окошко адвента ждёт»')
    await page.locator('[data-advent-nudge]').click()
    await page.waitForTimeout(2200)
    const box = await page.locator(CAL).boundingBox()
    ok(!!box && box.y > -20 && box.y < 200, '5 дек: карточка Главной привела к календарю', box)
    ok((await door(page, 5).getAttribute('data-state')) === 'today', '5 дек: окошко 5 — сегодняшнее')
    ok((await door(page, 6).getAttribute('data-state')) === 'locked', '5 дек: окошко 6 закрыто')
    ok((await door(page, 3).getAttribute('data-state')) === 'missed', '5 дек: окошко 3 пропущено')
    ok((await door(page, 4).getAttribute('data-state')) === 'open', '5 дек: окошко 4 открыто')
    ok((await page.locator('[data-advent-tile]').innerText().catch(() => '')).includes('Открыть'), '5 дек: плитка серии зовёт открыть окошко')

    // Правила — за «?».
    await page.locator(`${CAL} [data-advent-rules-btn]`).click()
    await page.waitForTimeout(500)
    ok((await page.locator(`${CAL} [data-advent-rules]`).getAttribute('data-advent-rules')) === 'open', '5 дек: «?» раскрыл правила')
    ok((await page.locator(`${CAL} [data-advent-rules]`).innerText()).includes('заморозки'), '5 дек: в правилах — заморозки и сундучки')
    await page.locator(`${CAL} [data-advent-rules-btn]`).click()
    await page.waitForTimeout(400)

    // Пропущенное без монет (25 < 30) — нельзя.
    await tap(page, 3)
    let txt = await revealText(page)
    ok(txt.includes('Пропущенное окошко') && txt.includes('Не хватает 5'), '5 дек: пропущенное при 25 монетах — «Не хватает 5»', txt.slice(0, 160))
    await page.locator(`${CAL} [data-advent-late]`).click({ force: true })
    await page.waitForTimeout(400)
    ok(!((await store(page))?.advent ?? []).some((k) => k.startsWith('2026-12-03')), '5 дек: без монет окошко не открылось')

    // Окошко дня: серия, монеты, игрушка, вещь, совет с действием.
    await tap(page, 5, 1700)
    let st = await store(page)
    ok(st.advent.includes('2026-12-05'), '5 дек: окошко 5 открыто в свой день')
    ok(st.streak.lastClaim === '2026-12-05' && st.streak.count === 4, '5 дек: окошко засчитало день серии', st.streak)
    ok(st.coins === 25 + 10 + 5, '5 дек: монеты = окошко 10 + серия 5', st.coins)
    ok(st.owned.includes('accent_frost'), '5 дек: «Иней» в купленном')
    ok((await reveal(page).getAttribute('data-advent-reveal')) === 'got', '5 дек: подарок раскрылся под календарём')
    txt = await revealText(page)
    ok(txt.includes('5 декабря') && txt.includes('Варежка') && txt.includes('Иней') && txt.includes('Совет дня') && txt.includes('Задать бюджет'), '5 дек: игрушка «Варежка», вещь, совет и «Задать бюджет»', txt.slice(0, 260))
    ok(txt.includes('Серия 4 дня'), '5 дек: «Серия 4 дня»')
    await page.locator(`${CAL} [data-advent-wear]`).click()
    await page.waitForTimeout(300)
    ok((await store(page)).equipped.accent === 'accent_frost', '5 дек: «Надеть» надело «Иней»')
    await page.locator(CAL).screenshot({ path: path.join(OUT, 'advent-door.png') })
    await page.locator(`${CAL} [data-advent-action]`).click()
    await page.waitForTimeout(1200)
    ok((await page.locator('[aria-modal=true]').last().innerText()).includes('Бюджет'), '5 дек: «Задать бюджет» открыло планирование')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(700)
    ok((await door(page, 5).getAttribute('data-state')) === 'open', '5 дек: окошко 5 теперь открыто')
    ok((await door(page, 5).locator('svg').count()) > 0, '5 дек: в окошке висит игрушка')

    // Повторный тап — свернуть; ещё раз — посмотреть, без награды.
    await tap(page, 5, 600)
    ok((await reveal(page).getAttribute('data-advent-reveal')) === null, '5 дек: повторный тап свернул подарок')
    await tap(page, 5, 700)
    ok((await reveal(page).getAttribute('data-advent-reveal')) === 'view' && (await revealText(page)).includes('Варежка'), '5 дек: открытое — посмотреть игрушку')
    ok((await store(page)).coins === 40, '5 дек: повторный тап не начисляет', (await store(page)).coins)

    // Пропущенное за монеты: 40 → 40 − 30 + 20.
    await tap(page, 3, 700)
    await page.locator(`${CAL} [data-advent-late]`).click()
    await page.waitForTimeout(1100)
    st = await store(page)
    ok(st.advent.includes('2026-12-03:late'), '5 дек: пропущенное открыто за монеты (:late)')
    ok(st.coins === 40 - 30 + 20, '5 дек: монеты за пропущенное', st.coins)
    ok(st.streak.count === 4, '5 дек: пропущенное серию не трогает', st.streak)
    ok((await revealText(page)).includes('Снегирь'), '5 дек: игрушка пропущенного — «Снегирь»')

    // Точка и карточка Главной уходят, плитка показывает серию.
    ok(await page.locator('[data-advent-dot]').count() === 0, '5 дек: точка на вкладке погасла')
    const tile = await page.locator('[data-advent-tile]').innerText().catch(() => '')
    ok(tile.includes('Серия дня') && tile.includes('4 дня подряд'), '5 дек: плитка — «4 дня подряд»', tile)
    await page.locator('[data-tour="tab-home"]').click()
    await page.waitForTimeout(900)
    ok(await page.locator('[data-advent-nudge]').count() === 0, '5 дек: карточки на Главной больше нет')
    ok(page.errs.length === 0, '5 дек: ошибок нет', page.errs)
    await ctx.close()
  }

  /* 3. 7 декабря, пропущено 6-е: заморозка из окошка 7 спасает серию. */
  {
    const state = { advent: days(5), streak: { count: 5, best: 5, lastClaim: '2026-12-05' } }
    const { ctx, page } = await newApp(browser, { date: '2026-12-07T10:00:00', state })
    await progress(page)
    await tap(page, 7, 1700)
    const st = await store(page)
    ok(st.streak.count === 6 && st.streak.lastClaim === '2026-12-07', '7 дек: серия не сгорела — 6 дней', st.streak)
    ok(st.advent.includes('2026-frz-2026-12-06'), '7 дек: заморозка потрачена на 6-е')
    const txt = await revealText(page)
    ok(txt.includes('Заморозка серии') && txt.includes('спасла серию'), '7 дек: «Заморозка серии» и «спасла серию»', txt.slice(0, 300))
    ok(txt.includes('Копилка'), '7 дек: игрушка «Копилка»')
    ok(page.errs.length === 0, '7 дек: ошибок нет', page.errs)
    await ctx.close()
  }

  /* 4. 13 декабря: сундучок — вещь из магазина. */
  {
    const { ctx, page } = await newApp(browser, { date: '2026-12-13T10:00:00', state: { advent: days(12) } })
    await progress(page)
    await tap(page, 13, 1700)
    const st = await store(page)
    const chest = st.advent.find((k) => k.startsWith('2026-chest-13:'))
    ok(!!chest && st.owned.includes(chest.split(':')[1]), '13 дек: сундучок дал вещь из магазина', chest)
    ok((await revealText(page)).includes('Из сундучка'), '13 дек: «Из сундучка» в подарке')
    await tap(page, 13, 500)
    await tap(page, 13, 700)
    ok((await revealText(page)).includes('Из сундучка'), '13 дек: и при повторном просмотре видно, что было в сундучке')
    await ctx.close()
  }

  /* 5. 31 декабря: «Новый год этой ночью», окошко 31, итоги года. */
  {
    const { ctx, page } = await newApp(browser, { date: '2026-12-31T21:00:00', state: { advent: days(20) } })
    await progress(page)
    ok((await page.locator('[data-ny-chip]').innerText().catch(() => '')).includes('этой ночью'), '31 дек: «Новый год этой ночью»')
    ok((await door(page, 31).getAttribute('data-state')) === 'today', '31 дек: окошко 31 — сегодняшнее')
    await tap(page, 31, 1700)
    ok((await store(page)).owned.includes('title_santa'), '31 дек: «Дед Мороз» получен')
    const recap = await page.locator(`${CAL} [data-advent-recap]`).innerText().catch(() => '')
    ok(recap.includes('Твой 2026') && recap.includes('записей за год') && recap.includes('чаще всего'), '31 дек: итоги года', recap)
    ok(!/[€$₽]/.test(recap), '31 дек: в итогах — без сумм', recap)
    ok(page.errs.length === 0, '31 дек: ошибок нет', page.errs)
    await ctx.close()
  }

  /* 6. 2 января, 24 окошка: серия на месте, главный подарок. */
  {
    const { ctx, page } = await newApp(browser, { date: '2027-01-02T12:00:00', state: { advent: days(24, [9, 17]), streak: { count: 0, best: 24, lastClaim: '2026-12-26' } } })
    await progress(page)
    ok(await page.locator('[data-advent-tile]').count() === 0, '2 янв: «Серия дня» своей плиткой')
    ok((await page.locator('.tab-panel:not([data-off]) .kicker').first().innerText()).includes('С Новым годом'), '2 янв: «С Новым годом!»')
    ok(await page.locator('[data-ny-chip]').count() === 0, '2 янв: отсчёта нет')
    ok((await status(page)).includes('Главный подарок ждёт'), '2 янв: «Главный подарок ждёт»', await status(page))
    ok((await door(page, 9).getAttribute('data-state')) === 'missed', '2 янв: неоткрытое — пропущенное')
    const before = await store(page)
    await page.locator(`${CAL} [data-advent-final="is-ready"]`).click()
    await page.waitForTimeout(1600)
    const st = await store(page)
    ok(st.advent.includes('2026-final'), '2 янв: главный подарок открыт')
    ok(st.owned.includes('card_newyear') && st.owned.includes('title_newyear'), '2 янв: «Новогодняя ночь» и «Новогодний дух» получены')
    ok(st.bonusXp === before.bonusXp + 100 && st.coins === before.coins + 100, '2 янв: +100 монет и +100 XP', { c: st.coins, x: st.bonusXp })
    ok((await revealText(page)).includes('С Новым годом'), '2 янв: подарок «С Новым годом!»')
    await page.locator(CAL).screenshot({ path: path.join(OUT, 'advent-final.png') })
    ok((await page.locator(`${CAL} [data-advent-final]`).getAttribute('data-advent-final')) === 'is-done', '2 янв: главный подарок — «получено»')
    ok(page.errs.length === 0, '2 янв: ошибок нет', page.errs)
    await ctx.close()
  }

  /* 7. 2 января, 20 окошек: подарок закрыт, сколько не хватает. */
  {
    const { ctx, page } = await newApp(browser, { date: '2027-01-02T12:00:00', state: { advent: days(20) } })
    await progress(page)
    ok((await status(page)).includes('4 окошка'), '2 янв, 20 окошек: «до главного подарка — 4 окошка»', await status(page))
    ok(await page.locator(`${CAL} [data-advent-final="is-locked"]`).count() === 1, '2 янв, 20 окошек: подарок закрыт')
    await ctx.close()
  }

  /* 8. 15 января: сезон закончился; Магазин — коллекция. */
  {
    const { ctx, page } = await newApp(browser, { date: '2027-01-15T12:00:00', state: { advent: days(24), owned: ['accent_mint', 'card_newyear'] } })
    await progress(page)
    ok(await page.locator('.festive-sky').count() === 0 && (await page.locator(CAL).count()) === 0, '15 янв: ни неба, ни календаря')
    ok(await page.locator('.tab-panel:not([data-off]) .hub-bullfinch').count() === 0, '15 янв: снегирь улетел')
    ok((await page.locator('.tab-panel:not([data-off]) .kicker').first().innerText()).includes('Уровень'), '15 янв: обычная шапка')
    await page.locator('text=Магазин').first().click()
    await page.waitForTimeout(1200)
    ok((await page.locator('body').innerText()).includes('Новогодняя коллекция'), '15 янв: в Магазине коллекция (есть её вещь)')
    await ctx.close()
  }

  /* 9. Магазин в сезон: коллекция не продаётся. */
  {
    const { ctx, page } = await newApp(browser, { date: '2026-12-05T12:00:00', state: { coins: 5000 } })
    await progress(page)
    await page.locator('text=Магазин').first().click()
    await page.waitForTimeout(1200)
    ok((await page.locator('body').innerText()).includes('Новогодняя коллекция'), 'Магазин: группа «Новогодняя коллекция»')
    await page.locator('.row', { hasText: 'Гирлянда' }).first().click()
    await page.waitForTimeout(1200)
    const txt = await page.locator('[aria-modal=true]').evaluateAll((els) => els.map((e) => e.innerText).join('\n')).catch(() => '')
    ok(txt.includes('Только из адвент-календаря') && !txt.includes('Купить'), 'Магазин: «Гирлянду» не купить — только из адвента', txt.slice(0, 160))
    ok(!(await store(page)).owned.includes('frame_garland'), 'Магазин: гирлянды нет в купленном')
    ok(page.errs.length === 0, 'Магазин: ошибок нет', page.errs)
    await ctx.close()
  }

  /* 10. Три вида: переключатель по ссылке, 320 px и светлая — без вылезания, окошки не мельче пальца. */
  for (const [variant, width, scheme] of [['tree', 320, 'dark'], ['village', 320, 'dark'], ['box', 320, 'dark'], ['tree', 390, 'light'], ['village', 390, 'light'], ['box', 390, 'light']]) {
    const { ctx, page } = await newApp(browser, { date: '2026-12-05T12:00:00', width, scheme, state: { advent: ['2026-12-01', '2026-12-02'] }, query: `?advent=${variant}` })
    await progress(page)
    ok((await page.locator(CAL).getAttribute('data-variant')) === variant, `${variant} ${width}/${scheme}: вид из ссылки`)
    const kickerH = await page.locator('.tab-panel:not([data-off]) .kicker').first().evaluate((e) => e.getBoundingClientRect().height)
    ok(kickerH < 24, `${variant} ${width}/${scheme}: «С наступающим!» в одну строку`, kickerH)
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${variant} ${width}/${scheme}: не шире экрана`)
    const sizes = await page.locator(`${CAL} .adv-door`).evaluateAll((els) => els.map((e) => Math.min(e.getBoundingClientRect().width, e.getBoundingClientRect().height)))
    const min = Math.min(...sizes)
    ok(min >= 30, `${variant} ${width}/${scheme}: окошко не мельче 30 px`, min)
    await tap(page, 5, 1600)
    ok(((await store(page)).advent ?? []).includes('2026-12-05'), `${variant} ${width}/${scheme}: окошко дня открылось`)
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${variant} ${width}/${scheme}: с подарком не шире экрана`)
    if (variant === 'tree' && width === 320) {
      ok(await page.locator(`${CAL} [data-advent-variants]`).count() === 1, 'по ссылке ?advent= — переключатель видов')
      await page.locator(`${CAL} .adv-variant`, { hasText: 'Шкатулка' }).click()
      await page.waitForTimeout(700)
      ok((await page.locator(CAL).getAttribute('data-variant')) === 'box', 'переключатель: «Шкатулка»')
      ok((await page.evaluate(() => localStorage.getItem('koshel:adventStyle'))) === 'box', 'переключатель: выбор запомнен')
    }
    await page.locator(CAL).screenshot({ path: path.join(OUT, `advent-${variant}-${width}-${scheme}.png`) })
    ok(page.errs.length === 0, `${variant} ${width}/${scheme}: ошибок нет`, page.errs)
    await ctx.close()
  }

  await browser.close()
  console.log(`\nадвент: ${passes} OK, ${fails} FAIL`)
  process.exit(fails ? 1 : 0)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
