// Clarity на сборке для прода (vite preview :4180): настоящий загрузчик проекта
// z50dung9vo и настоящий clarity.js (скачиваются при первом запуске в .cache/),
// сеть Clarity подменена, телеграм-обёртка — заглушкой. Проверяем: скрипт грузится
// (CSP не мешает), записи уходят, в них есть метки и события, и НЕТ того, что
// должно быть скрыто: заметки, сумм, имени, данных входа Telegram из адреса.
// CONTENT=false — строгий режим маскировки вместо Balanced.
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')
const { chromium } = require('playwright')

const CACHE = path.join(__dirname, '.cache')
const BASE = process.env.BASE || 'http://localhost:4180/'

async function cached(name, url) {
  const file = path.join(CACHE, name)
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8')
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: ${res.status}`)
  const text = await res.text()
  fs.mkdirSync(CACHE, { recursive: true })
  fs.writeFileSync(file, text)
  return text
}

const SECRET_NOTE = 'Секретнаязаметка'
const SECRET_NAME = 'Тайноимя'

;(async () => {
  // Загрузчик нашего проекта и та версия clarity.js, которую он грузит.
  const tagRaw = await cached('clarity-tag.js', 'https://www.clarity.ms/tag/z50dung9vo')
  const sdkUrl = (tagRaw.match(/https:\/\/scripts\.clarity\.ms\/[^"']+\/clarity\.js/) || [])[0]
  if (!sdkUrl) throw new Error('в загрузчике Clarity не нашёл адрес clarity.js')
  const TAG = tagRaw.replace('"content":true', '"content":' + (process.env.CONTENT || 'true'))
  const JS = await cached('clarity-' + sdkUrl.split('/').at(-2) + '.js', sdkUrl)

  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 390, height: 760 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true })
  const uploads = []
  const blocked = []
  await ctx.route('https://telegram.org/**', (r) => r.fulfill({ contentType: 'application/javascript', body: '' }))
  await ctx.route('https://koshel-worker.karateka004.workers.dev/**', (r) => r.abort())
  await ctx.route('https://www.clarity.ms/tag/**', (r) => {
    if (!r.request().url().endsWith('/z50dung9vo')) blocked.push(r.request().url())
    r.fulfill({ contentType: 'application/javascript', body: TAG })
  })
  await ctx.route('https://scripts.clarity.ms/**', (r) => r.fulfill({ contentType: 'application/javascript', body: JS }))
  const uploadHosts = new Set()
  await ctx.route('https://*.clarity.ms/collect', (r) => {
    uploadHosts.add(new URL(r.request().url()).host)
    uploads.push(r.request().postDataBuffer() ?? Buffer.alloc(0))
    r.fulfill({ status: 204, body: '' })
  })
  await ctx.route('https://c.clarity.ms/**', (r) => r.fulfill({ status: 204, body: '' }))
  await ctx.addInitScript(({ name }) => {
    const noop = () => {}
    window.Telegram = {
      WebApp: {
        initData: '',
        initDataUnsafe: { user: { id: 4242, first_name: name, allows_write_to_pm: false }, start_param: 'ads_oct' },
        platform: 'ios',
        version: '8.0',
        colorScheme: 'dark',
        themeParams: {},
        isVersionAtLeast: () => true,
        ready: noop, expand: noop, close: noop,
        setHeaderColor: noop, setBackgroundColor: noop, setBottomBarColor: noop,
        disableVerticalSwipes: noop, enableVerticalSwipes: noop,
        onEvent: noop, offEvent: noop,
        openLink: noop, openTelegramLink: noop,
        showConfirm: (m, cb) => cb && cb(true),
        requestWriteAccess: (cb) => cb && cb(true),
        HapticFeedback: { impactOccurred: noop, notificationOccurred: noop, selectionChanged: noop },
        BackButton: { show: noop, hide: noop, onClick: noop, offClick: noop },
        MainButton: { show: noop, hide: noop, enable: noop, disable: noop, onClick: noop, offClick: noop, setParams: noop },
      },
    }
  }, { name: SECRET_NAME })
  const page = await ctx.newPage()
  const problems = []
  page.on('console', (m) => { if (/Refused to|Content Security Policy/i.test(m.text())) problems.push(m.text()) })
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message))
  // Как в Telegram: данные входа — в хвосте адреса.
  await page.goto(BASE + '#tgWebAppData=' + encodeURIComponent('user={"id":4242,"first_name":"' + SECRET_NAME + '"}&hash=deadbeefcafe') + '&tgWebAppVersion=8.0')
  await page.waitForTimeout(800)
  let fails = 0
  const ok = (cond, msg) => { if (!cond) fails++; console.log((cond ? 'OK   ' : 'FAIL ') + msg) }

  // Быстрый старт 2.8: приветствие → настройки → трата → доход → итог → готово.
  const tap = async (re) => { await page.getByRole('button', { name: re }).first().click(); await page.waitForTimeout(520) }
  await tap(/Поехали/)
  await tap(/^Дальше/)
  await page.locator('input').first().fill('321')
  await tap(/^Дальше/)
  await page.locator('input').first().fill('50000')
  await tap(/^Дальше/)
  await tap(/Открыть приложение/)
  await page.waitForTimeout(600)

  // Обычная запись с заметкой через «+».
  const masks = await page.evaluate(() => document.querySelectorAll('[data-clarity-mask]').length)
  await page.locator('button[aria-label="Добавить операцию"]').first().click()
  await page.waitForTimeout(500)
  // Сумма — своей клавиатурой приложения.
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '7', exact: true }).first().click()
  await page.locator('[aria-modal="true"]').last().getByRole('button', { name: /^Еда/ }).first().click({ force: true })
  await page.locator('input[placeholder^="Заметка"]').first().fill(SECRET_NOTE)
  await page.getByRole('button', { name: /^Записать/ }).first().click({ timeout: 3000 })
  await page.waitForTimeout(900)
  for (const name of [/Аналитика/, /Прогресс/, /Профиль/, /Главная/]) {
    await page.getByRole('button', { name }).first().click().catch(() => {})
    await page.waitForTimeout(500)
  }
  // Clarity шлёт пачками; при уходе со страницы — сразу (sendBeacon).
  await page.waitForTimeout(6000)
  const state = await page.evaluate(() => ({ real: typeof window.clarity === 'function' && !!window.clarity.v, q: (window.clarity && window.clarity.q || []).length }))
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pagehide')) })
  await page.waitForTimeout(1500)

  const texts = uploads.map((b) => {
    try { return zlib.gunzipSync(b).toString('utf8') } catch { return b.toString('utf8') }
  })
  const all = texts.join('\n')
  const has = (s) => all.includes(s) || all.includes(JSON.stringify(s).slice(1, -1))
  ok(!problems.length, 'нет ошибок CSP и страницы' + (problems.length ? ': ' + problems.slice(0, 3).join(' | ') : ''))
  ok(blocked.length === 0, 'загрузчик запрошен с нашим номером проекта')
  ok(state.real, 'настоящий Clarity запущен (window.clarity.v)')
  ok(uploadHosts.size > 0 && [...uploadHosts].every((h) => h === 'g.clarity.ms'), 'отправка — на g.clarity.ms нашего проекта: ' + [...uploadHosts].join(','))
  ok(uploads.length > 0, 'записи уходят: ' + uploads.length + ' пачек, ' + Math.round(all.length / 1024) + ' КБ после распаковки')
  for (const ev of ['onboarding_welcome', 'onboarding_expenses', 'onboarding_income', 'onboarding_done', 'bot_write_yes', 'record_added', 'tab_analytics'])
    ok(has(ev), 'событие ' + ev)
  for (const tag of ['platform', 'ios', 'source', 'ads_oct', 'ops', 'onboarding'])
    ok(has(tag), 'метка ' + tag)
  ok(masks > 0, 'на странице помеченных для скрытия элементов: ' + masks)
  // Неизменный интерфейс читается: вопросы быстрого старта и подписи вкладок.
  ok(has('Сколько получаешь в месяц?'), 'видно шаг быстрого старта «Сколько получаешь в месяц?»')
  ok(has('Аналитика') && has('Прогресс'), 'видны подписи вкладок')
  ok(!has(SECRET_NOTE) && !has('Секретная'), 'заметки нет в записи')
  ok(!has(SECRET_NAME), 'имени нет в записи')
  ok(!has('tgWebAppData') && !has('deadbeefcafe'), 'данных входа Telegram из адреса в записи нет')
  ok(!(await page.evaluate(() => location.hash)), 'хвост адреса убран')
  // Суммы ищем среди строк записи (тексты узлов), а не в служебных числах протокола
  // (размеры окна, номера узлов): «777» как ширина экрана — не утечка.
  const strings = all.match(/"(?:[^"\\]|\\.)*"/g) || []
  const leak = strings.filter((x) => /777|321|50[ \u00a0\u202f]?000/.test(x) && !/^"(style|class|d|viewBox|points|transform)=/.test(x))
  ok(leak.length === 0, 'сумм нет в записи' + (leak.length ? ': ' + leak.slice(0, 5).join(' ') : ''))
  // Распакованная запись целиком — посмотреть глазами, что уходит.
  fs.mkdirSync(CACHE, { recursive: true })
  fs.writeFileSync(path.join(CACHE, 'clarity-payload.txt'), all)
  await browser.close()
  console.log(fails ? `\n${fails} FAIL` : '\nвсё OK')
  process.exit(fails ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
