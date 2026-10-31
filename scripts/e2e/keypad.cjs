// Клавиатура шторки операции (vite preview :4180), касаниями CDP, как на телефоне:
// касание пустого места сворачивает клавиатуру (лист садится), сумма возвращает её,
// двойное касание закрывает шторку — даже если лист успел сдвинуться под пальцем;
// промахи между клавишами и плитками ничего не сворачивают; поле заметки теряет
// фокус; «Записать» без суммы возвращает клавиатуру. Плюс кадры под CPU ×4.
const { chromium } = require('playwright')
const path = require('node:path')
const fs = require('node:fs')

const BASE = process.env.BASE || 'http://localhost:4180/'
const OUT = path.join(__dirname, 'shots')
fs.mkdirSync(OUT, { recursive: true })
let fails = 0
const ok = (c, m, extra) => { if (!c) fails++; console.log((c ? 'OK   ' : 'FAIL ') + m + (c || extra === undefined ? '' : '  ' + JSON.stringify(extra))) }

;(async () => {
  const browser = await chromium.launch()
  const tx = Array.from({ length: 30 }, (_, i) => ({ id: 'k' + i, type: i % 6 ? 'expense' : 'income', amount: 100 + i, categoryId: i % 6 ? 'food' : 'salary', date: new Date(Date.now() - i * 5400e3).toISOString(), note: '', currency: 'AMD' }))
  const blob = JSON.stringify({ state: { transactions: tx, currency: 'AMD', lastTxCurrency: 'AMD', themeMode: 'dark' }, version: 18 })
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
  await ctx.route('https://telegram.org/**', (r) => r.fulfill({ contentType: 'application/javascript', body: '' }))
  await ctx.route('https://*.clarity.ms/**', (r) => r.abort())
  await ctx.route('https://koshel-worker.karateka004.workers.dev/**', (r) => r.fulfill({ contentType: 'application/json', body: '{"ok":true}' }))
  await ctx.addInitScript(({ blob }) => {
    if (!sessionStorage.getItem('__p')) {
      localStorage.setItem('finance-mini-app:v1', blob)
      localStorage.setItem('koshel:onboarded', '1')
      localStorage.setItem('koshel:curAsked', '1')
      sessionStorage.setItem('__p', '1')
    }
  }, { blob })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))
  await page.goto(BASE)
  await page.waitForTimeout(1500)
  const cdp = await ctx.newCDPSession(page)
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
  const tap = async (x, y, after = 0) => { await touch('touchStart', x, y); await page.waitForTimeout(40); await touch('touchEnd'); if (after) await page.waitForTimeout(after) }
  const state = () => page.evaluate(() => {
    const sheet = document.querySelector('[aria-modal=true]')
    const fold = document.querySelector('.keypad-fold')
    return {
      open: !!sheet && /Записать/.test(sheet.textContent || ''),
      folded: !!fold?.classList.contains('is-folded'),
      keypadH: fold ? Math.round(fold.getBoundingClientRect().height) : -1,
      sheetTop: sheet ? Math.round(sheet.getBoundingClientRect().top) : -1,
      inert: !!fold?.inert,
      focused: document.activeElement?.tagName,
    }
  })
  const openSheet = async () => {
    await page.getByRole('button', { name: 'Добавить операцию' }).first().click()
    await page.waitForTimeout(700)
  }
  // Пустое место — справа от суммы, где на скриншоте крестик.
  const blank = () => page.evaluate(() => {
    const amount = document.querySelector('[aria-modal=true] .text-display-lg')
    const r = amount.getBoundingClientRect()
    return { x: Math.min(innerWidth - 20, r.right + 40), y: r.top + r.height / 2 }
  })
  const center = (loc) => loc.boundingBox().then((b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 }))

  // 1. Касание пустого места — клавиатура сворачивается, лист садится.
  await openSheet()
  let s0 = await state()
  ok(s0.open && !s0.folded && s0.keypadH > 200, 'шторка открыта, клавиатура на месте', s0)
  await page.screenshot({ path: path.join(OUT, 'keypad-0-open.png') })
  let b = await blank()
  await tap(b.x, b.y, 500)
  let s1 = await state()
  ok(s1.open && s1.folded && s1.keypadH === 0 && s1.inert, 'касание справа от суммы — клавиатура свёрнута', s1)
  ok(s1.sheetTop > s0.sheetTop + 100, `лист сел по содержимому: верх ${s0.sheetTop} → ${s1.sheetTop}`)
  await page.screenshot({ path: path.join(OUT, 'keypad-1-folded.png') })

  // 2. Одиночное касание пустого места при свёрнутой — ничего не закрывает.
  b = await blank()
  await tap(b.x, b.y, 600)
  ok((await state()).open, 'одно касание при свёрнутой клавиатуре — шторка на месте')

  // 3. Сумма возвращает клавиатуру.
  const amt = await center(page.locator('[aria-modal=true] .text-display-lg').first())
  await tap(amt.x, amt.y, 500)
  let s3 = await state()
  ok(!s3.folded && s3.keypadH > 200 && !s3.inert && Math.abs(s3.sheetTop - s0.sheetTop) < 2, 'нажатие на сумму — клавиатура вернулась, лист на прежней высоте', s3)

  // 4. Промахи: между клавишами и между плитками категорий — не сворачивают.
  const k8 = await page.locator('[aria-modal=true]').getByRole('button', { name: '8', exact: true }).boundingBox()
  await tap(k8.x - 3, k8.y + k8.height / 2, 300)
  ok(!(await state()).folded, 'промах между клавишами — клавиатура на месте')
  const food = await page.locator('[aria-modal=true]').getByRole('button', { name: 'Еда', exact: true }).boundingBox()
  await tap(food.x + food.width + 3, food.y + food.height / 2, 300)
  ok(!(await state()).folded, 'промах между плитками категорий — клавиатура на месте')
  // Цифры набираются как раньше.
  const k5 = await center(page.locator('[aria-modal=true]').getByRole('button', { name: '5', exact: true }))
  await tap(k5.x, k5.y, 120); await tap(k5.x, k5.y, 120)
  ok(/55/.test(await page.locator('[aria-modal=true] .text-display-lg').first().textContent()), 'клавиши набирают сумму: 55')

  // 5. Поле заметки: касание пустого места убирает и системную клавиатуру.
  await page.locator('[aria-modal=true] input[placeholder^="Заметка"]').first().focus()
  ok((await state()).focused === 'INPUT', 'заметка в фокусе')
  b = await blank()
  await tap(b.x, b.y, 500)
  const s5 = await state()
  ok(s5.focused !== 'INPUT' && s5.folded, 'касание пустого места — фокус снят, клавиатура свёрнута', s5)

  // 6. «Записать» без категории при свёрнутой клавиатуре — сумма есть, клавиатура не нужна;
  //    а без суммы — клавиатура возвращается.
  await page.locator('[aria-modal=true]').getByRole('button', { name: 'Отмена' }).click()
  await page.waitForTimeout(700)
  await openSheet()
  b = await blank()
  await tap(b.x, b.y, 500)
  const save = await center(page.locator('[aria-modal=true]').getByRole('button', { name: 'Записать расход' }))
  await tap(save.x, save.y, 500)
  const s6 = await state()
  ok(s6.open && !s6.folded, '«Записать» без суммы — клавиатура вернулась', s6)

  // 7. Двойное касание пустого места — шторка закрывается.
  b = await blank()
  await tap(b.x, b.y, 150)
  await tap(b.x, b.y, 800)
  ok(!(await state()).open, 'двойное касание — шторка закрыта')

  // 8. Двойное там, где после первого касания под пальцем оказывается сегмент:
  //    слева от суммы, лист садится на ~180 px — закрывается, вид не переключается.
  await openSheet()
  const left = await page.evaluate(() => {
    const r = document.querySelector('[aria-modal=true] .text-display-lg').getBoundingClientRect()
    return { x: Math.max(20, r.left - 40), y: r.top + r.height / 2 }
  })
  await tap(left.x, left.y, 260)
  await tap(left.x, left.y, 800)
  ok(!(await state()).open, 'двойное слева от суммы (лист сдвинулся) — шторка закрыта')
  await page.waitForTimeout(400)

  // 9. Плавность: кадры во время сворачивания и разворачивания под CPU ×4.
  await openSheet()
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  await page.waitForTimeout(300)
  const frames = async (act) => {
    await page.evaluate(() => {
      window.__f = []
      let last = performance.now()
      const loop = (t) => { window.__f.push(t - last); last = t; if (window.__f.length < 40) requestAnimationFrame(loop) }
      requestAnimationFrame(loop)
    })
    await act()
    await page.waitForTimeout(900)
    const f = await page.evaluate(() => window.__f.slice(1))
    return { max: Math.round(Math.max(...f)), over20: f.filter((x) => x > 20).length, n: f.length }
  }
  b = await blank()
  const fold = await frames(() => tap(b.x, b.y))
  const amt2 = await center(page.locator('[aria-modal=true] .text-display-lg').first())
  const unfold = await frames(() => tap(amt2.x, amt2.y))
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  console.log('     кадры, CPU ×4 — сворачивание:', JSON.stringify(fold), ' разворачивание:', JSON.stringify(unfold))
  ok(fold.max < 34 && unfold.max < 34, `без рывков: худший кадр ${fold.max} / ${unfold.max} мс`)

  ok(errs.length === 0, 'ошибок нет', errs)
  await browser.close()
  console.log(fails ? `\n${fails} FAIL` : '\nвсё OK')
  process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
