/**
 * Расчёты Аналитики (src/lib/overview.ts): чистые функции без браузера.
 *
 * Проверяем то, на чём аналитика раньше врала или могла бы врать: неполный
 * месяц сравнивается с прошлым К ТОМУ ЖЕ ДНЮ; регулярные платежи — аренда да,
 * «Продукты 550 ₽» трижды — нет; аренда не «разовая покупка»; каждая подсказка
 * срабатывает на своём случае и молчит без него; об одной категории — один раз.
 *
 * Запуск: `node --import ./worker/scripts/ts-resolve.mjs scripts/test-overview.mjs`
 * (Node 22.18+ сам понимает .ts; резолвер достраивает расширения импортов).
 */
process.env.TZ = 'Europe/Moscow'

const { buildOverview } = await import('../src/lib/overview.ts')
const { buildRecurring, recurringKey } = await import('../src/lib/recurring.ts')
const { DEFAULT_CATEGORIES } = await import('../src/store/categories.ts')

let failed = 0
let passed = 0
const check = (name, ok, detail) => {
  if (ok) passed++
  else {
    failed++
    console.error('✗ ' + name + (detail !== undefined ? ' — ' + JSON.stringify(detail) : ''))
  }
}

let seq = 0
let seed = 11
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
/** Операция в местное время: tx('2026-11-05 12:00', 'expense', 38000, 'home', 'Аренда'). */
const tx = (when, type, amount, categoryId, note = '') => {
  const [d, t = '12:00'] = when.split(' ')
  const [y, m, day] = d.split('-').map(Number)
  const [h, mi] = t.split(':').map(Number)
  return { id: 't' + seq++, type, amount, categoryId, date: new Date(y, m - 1, day, h, mi).toISOString(), note, currency: 'RUB' }
}
const key = (y, m, d) => +new Date(y, m - 1, d)
const byId = new Map(DEFAULT_CATEGORIES.map((c) => [c.id, c]))
const NOW = +new Date(2026, 10, 19, 15, 0) // 19 ноября 2026, 15:00

/** Месячные окна как у стора: текущий и три прошлых. */
function months(list, now = NOW) {
  const d = new Date(now)
  const at = (k) => [key(d.getFullYear(), d.getMonth() + 1 - k, 1), key(d.getFullYear(), d.getMonth() + 2 - k, 1)]
  const [start, end] = at(0)
  const bounds = [1, 2, 3].map((k) => { const [s, e] = at(k); return { start: s, end: e } })
  const inside = (t, s, e) => { const x = +new Date(new Date(t.date).setHours(0, 0, 0, 0)); return x >= s && x < e }
  return {
    current: list.filter((t) => inside(t, start, end)),
    previous: bounds.map((b) => list.filter((t) => inside(t, b.start, b.end))),
    previousBounds: bounds,
    startKey: start,
    endKey: end,
  }
}
const overview = (list, extra = {}) =>
  buildOverview({ ...months(list, extra.now ?? NOW), categories: DEFAULT_CATEGORIES, currency: 'RUB', now: NOW, budget: 0, budgetApplies: true, ...extra })
const kinds = (o) => o.insights.map((i) => i.kind)
const find = (o, kind) => o.insights.find((i) => i.kind === kind)

/* ---------- 1. Неполный месяц — к тому же дню прошлого ---------- */
{
  const list = []
  // Октябрь: 1000 в день ровно, весь месяц (31 000), сентябрь и август — так же.
  for (const m of [8, 9, 10]) for (let d = 1; d <= (m === 9 ? 30 : 31); d++) list.push(tx(`2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, 'expense', 1000, 'food'))
  // Ноябрь: 1–19 по 1000 — ровно как в октябре к этому дню.
  for (let d = 1; d <= 19; d++) list.push(tx(`2026-11-${String(d).padStart(2, '0')}`, 'expense', 1000, 'food'))
  const o = overview(list)
  check('неполный месяц: сравнение с октябрём к 19-му (19 000), а не со всем (31 000)', o.prevSpent === 19000 && o.prevSpentFull === 31000, { prev: o.prevSpent, full: o.prevSpentFull })
  check('неполный месяц: изменение 0%, а не «−39%»', o.deltaPct === 0, o.deltaPct)
  check('неполный месяц: категория без «падения» к тому же дню', !o.insights.some((i) => i.kind === 'drop'), kinds(o))
  check('обычный день — 1000 ₽', Math.round(o.usualPerDay) === 1000, o.usualPerDay)
  check('средний чек 1000 ₽, к тому же дню прошлого — тоже', o.avgCheck === 1000 && o.prevAvgCheck === 1000, [o.avgCheck, o.prevAvgCheck])
  check('без дней без трат', o.noSpendDays === 0 && o.noSpendStreak === 0, [o.noSpendDays, o.noSpendStreak])
}

/* ---------- 2. Регулярные платежи ---------- */
{
  const list = []
  const notes = ['Пятёрочка', 'Продукты', 'Перекрёсток', 'ВкусВилл']
  for (let m = 5; m <= 11; m++) {
    const mm = String(m).padStart(2, '0')
    list.push(tx(`2026-${mm}-05`, 'expense', 38000, 'home', 'Аренда'))
    if (m <= 10 || true) list.push(tx(`2026-${mm}-12`, 'expense', 650, 'phone', 'Связь'))
    list.push(tx(`2026-${mm}-18`, 'expense', 299, 'fun', 'Подписка'))
    // Еда: много трат, и раз в месяц случайно одна и та же сумма с разными заметками.
    for (let d = 1; d <= 28; d += 2) list.push(tx(`2026-${mm}-${String(d).padStart(2, '0')}`, 'expense', 300 + Math.round(rnd() * 90) * 10, 'food', notes[Math.floor(rnd() * 4)]))
    list.push(tx(`2026-${mm}-${String(3 + (m % 4) * 6).padStart(2, '0')}`, 'expense', 550, 'food', notes[m % 4]))
  }
  const rec = buildRecurring(list.filter((t) => new Date(t.date) <= new Date(NOW)), NOW, byId, 'RUB')
  const titles = rec.map((r) => r.title || r.name)
  check('аренда, связь и подписка — регулярные', titles.includes('Аренда') && titles.includes('Связь') && titles.includes('Подписка'), titles)
  check('«Продукты 550 ₽» в частой категории с разными заметками — не регулярный', !rec.some((r) => r.categoryId === 'food'), titles)
  const rent = rec.find((r) => r.title === 'Аренда')
  check('аренда: следующий раз — 5 декабря', rent && new Date(rent.nextDay).getDate() === 5 && new Date(rent.nextDay).getMonth() === 11, rent && new Date(rent.nextDay).toString())

  // Та же сумма в частой категории, но одинаковая заметка и одно число — это подписка.
  const sub = []
  for (let m = 5; m <= 11; m++) {
    const mm = String(m).padStart(2, '0')
    for (let d = 1; d <= 28; d += 2) sub.push(tx(`2026-${mm}-${String(d).padStart(2, '0')}`, 'expense', 200 + Math.round(rnd() * 60) * 10, 'cafe', 'Кофе'))
    sub.push(tx(`2026-${mm}-09`, 'expense', 399, 'cafe', 'Абонемент на кофе'))
  }
  const rec2 = buildRecurring(sub, NOW, byId, 'RUB')
  check('частая категория, одна заметка и одно число — регулярный', rec2.some((r) => r.title === 'Абонемент на кофе'), rec2.map((r) => r.title))

  // Раз в четыре недели — число месяца гуляет: ждём через 28 дней, а не «того же числа».
  const four = [tx('2026-08-03', 'expense', 1200, 'gift'), tx('2026-08-31', 'expense', 1200, 'gift'), tx('2026-09-28', 'expense', 1200, 'gift'), tx('2026-10-26', 'expense', 1200, 'gift')]
  const rec3 = buildRecurring(four, NOW, byId, 'RUB')
  check('раз в 4 недели: следующий — через 28 дней (23 ноября)', rec3.length === 1 && new Date(rec3[0].nextDay).getDate() === 23, rec3.map((r) => new Date(r.nextDay).toDateString()))
}

/* ---------- 3. Аренда — не «разовая покупка»; крупные — без регулярных ---------- */
{
  const list = [tx('2026-11-05', 'expense', 38000, 'home', 'Аренда'), tx('2026-11-16', 'expense', 24990, 'clothes', 'Куртка')]
  for (let d = 1; d <= 18; d++) list.push(tx(`2026-11-${String(d).padStart(2, '0')}`, 'expense', 900, 'food'))
  const keys = new Set([recurringKey('home', 38000)])
  const o = overview(list, { recurringKeys: keys })
  check('крупные покупки — без аренды', o.biggest[0]?.note === 'Куртка' && !o.biggest.some((t) => t.categoryId === 'home'), o.biggest.map((t) => t.note))
  const one = find(o, 'one_off')
  check('разовая покупка — куртка, а не аренда', one && one.name === 'Куртка', one)
}

/* ---------- 4. Лимит: сколько можно в день, чтобы уложиться ---------- */
{
  const list = []
  for (let d = 1; d <= 19; d++) list.push(tx(`2026-11-${String(d).padStart(2, '0')}`, 'expense', 3000, 'food'))
  const o = overview(list, { budget: 70000 })
  const b = find(o, 'budget')
  check('лимит: прогноз выше лимита — подсказка сверху', b && b.over && o.insights[0].kind === 'budget', kinds(o))
  check('лимит: в день можно (70 000 − 57 000) / 11', b && Math.round(b.perDayLeft) === Math.round(13000 / 11) && b.daysLeft === 11, b)
}

/* ---------- 5. Всплеск и падение категорий к тому же дню ---------- */
{
  const list = []
  for (const m of [8, 9, 10]) {
    const mm = String(m).padStart(2, '0')
    for (let d = 1; d <= 28; d++) list.push(tx(`2026-${mm}-${String(d).padStart(2, '0')}`, 'expense', 500, 'food'))
    for (let d = 2; d <= 28; d += 3) list.push(tx(`2026-${mm}-${String(d).padStart(2, '0')}`, 'expense', 400, 'cafe'))
    for (let d = 1; d <= 28; d += 7) list.push(tx(`2026-${mm}-${String(d).padStart(2, '0')}`, 'expense', 2000, 'transport'))
  }
  for (let d = 1; d <= 19; d++) list.push(tx(`2026-11-${String(d).padStart(2, '0')}`, 'expense', 500, 'food'))
  // Кафе в ноябре — втрое чаще и дороже; транспорт — почти ноль.
  for (let d = 1; d <= 19; d++) list.push(tx(`2026-11-${String(d).padStart(2, '0')}`, 'expense', 700, 'cafe'))
  const o = overview(list)
  const sp = find(o, 'spike')
  check('всплеск: кафе против обычного к 19-му', sp && sp.categoryId === 'cafe' && sp.pct > 100, sp)
  const dr = find(o, 'drop')
  check('падение: транспорт заметно ниже обычного', dr && dr.categoryId === 'transport', dr)
  check('у категорий — изменение к тому же дню', o.categories.find((c) => c.categoryId === 'food')?.deltaPct === 0, o.categories.map((c) => [c.categoryId, Math.round(c.deltaPct ?? -1)]))
}

/* ---------- 6. Тренд: категория дорожает три месяца подряд ---------- */
{
  const list = []
  const transport = { 8: 3000, 9: 3900, 10: 5200 }
  for (const m of [8, 9, 10]) {
    const mm = String(m).padStart(2, '0')
    for (let d = 1; d <= 28; d++) list.push(tx(`2026-${mm}-${String(d).padStart(2, '0')}`, 'expense', 800, 'food'))
    list.push(tx(`2026-${mm}-10`, 'expense', transport[m], 'transport'))
  }
  for (let d = 1; d <= 19; d++) list.push(tx(`2026-11-${String(d).padStart(2, '0')}`, 'expense', 800, 'food'))
  const o = overview(list)
  const tr = find(o, 'trend')
  check('тренд: транспорт 3 000 → 3 900 → 5 200', tr && tr.categoryId === 'transport' && tr.values.join() === '3000,3900,5200', tr)
}

/* ---------- 7. Выходные, мелочь, пиковый день ---------- */
{
  const list = []
  for (const m of [9, 10]) for (let d = 1; d <= 28; d++) list.push(tx(`2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, 'expense', 1000, 'food'))
  for (let d = 1; d <= 19; d++) {
    const day = new Date(2026, 10, d).getDay()
    const weekend = day === 0 || day === 6
    list.push(tx(`2026-11-${String(d).padStart(2, '0')} 13:00`, 'expense', weekend ? 4000 : 1200, 'cafe'))
    // Мелочь: кофе каждый день.
    list.push(tx(`2026-11-${String(d).padStart(2, '0')} 09:00`, 'expense', 180, 'cafe', 'Кофе'))
  }
  // Дорогой день из восьми покупок — не одна «разовая», а именно день.
  for (let i = 0; i < 8; i++) list.push(tx(`2026-11-12 1${i}:00`, 'expense', 3000, 'clothes', 'Распродажа'))
  const o = overview(list)
  const we = find(o, 'weekend')
  check('выходные дороже будней', we && we.ratio > 2, we)
  const sm = find(o, 'small')
  check('мелочь: кофе каждый день — «до N ₽» круглой границей', sm && sm.count >= 19 && [100, 200, 500, 1000, 2000].includes(sm.limit), sm)
  const pk = find(o, 'peak_day')
  check('пиковый день — 12 ноября', pk && new Date(pk.key).getDate() === 12, pk)
  check('ритма недели нет без двух недель трат — weekday молчит, раз сказано про выходные', !o.insights.some((i) => i.kind === 'weekday'), kinds(o))
}

/* ---------- 8. Сбережения, перерасход, «доходов нет» ---------- */
{
  const base = []
  for (const m of [8, 9, 10]) {
    const mm = String(m).padStart(2, '0')
    base.push(tx(`2026-${mm}-10`, 'income', 100000, 'salary'))
    for (let d = 1; d <= 28; d++) base.push(tx(`2026-${mm}-${String(d).padStart(2, '0')}`, 'expense', 2500, 'food'))
  }
  // Октябрь целиком: доход 100 000, расход 70 000 → 30% отложено.
  const oct = overview(base, { now: +new Date(2026, 9, 31, 20) })
  const sv = find(oct, 'savings')
  check('сбережения: отложено 30% дохода', sv && Math.round(sv.rate) === 30 && sv.saved === 30000, sv)

  // Ноябрь: зарплата пришла, а тратим больше.
  const over = [...base, tx('2026-11-10', 'income', 100000, 'salary')]
  for (let d = 1; d <= 19; d++) over.push(tx(`2026-11-${String(d).padStart(2, '0')}`, 'expense', 6000, 'food'))
  const o2 = overview(over)
  check('перерасход: доход уже пришёл, расходы больше', find(o2, 'overspend')?.diff === 14000, find(o2, 'overspend'))

  // Ноябрь: доходов нет, хотя раньше записывались.
  const none = [...base]
  for (let d = 1; d <= 19; d++) none.push(tx(`2026-11-${String(d).padStart(2, '0')}`, 'expense', 2500, 'food'))
  const o3 = overview(none)
  check('«доходов пока нет» — раньше были', o3.insights.some((i) => i.kind === 'no_income'), kinds(o3))
  check('без дохода нет и «сбережений»', !o3.insights.some((i) => i.kind === 'savings' || i.kind === 'overspend'), kinds(o3))
}

/* ---------- 9. Одна категория — одна подсказка; порядок по весу ---------- */
{
  const list = []
  for (const m of [8, 9, 10]) {
    const mm = String(m).padStart(2, '0')
    for (let d = 1; d <= 28; d++) list.push(tx(`2026-${mm}-${String(d).padStart(2, '0')}`, 'expense', 1000, 'food'))
    list.push(tx(`2026-${mm}-14`, 'expense', 1500, 'clothes'))
  }
  for (let d = 1; d <= 19; d++) list.push(tx(`2026-11-${String(d).padStart(2, '0')}`, 'expense', 1000, 'food'))
  list.push(tx('2026-11-16', 'expense', 24990, 'clothes', 'Куртка'))
  const o = overview(list)
  const aboutClothes = o.insights.filter((i) => i.categoryId === 'clothes')
  check('об одежде — одна подсказка (всплеск важнее разовой покупки)', aboutClothes.length === 1 && aboutClothes[0].kind === 'spike', aboutClothes.map((i) => i.kind))
  const scores = o.insights.map((i) => i.score)
  check('подсказки по убыванию веса', scores.every((v, i) => i === 0 || scores[i - 1] >= v), scores)
}

/* ---------- 10. Новичок: одна запись — ничего не падает и не выдумывается ---------- */
{
  const o = overview([tx('2026-11-19 14:00', 'expense', 350, 'food')])
  check('новичок: одна трата — итог 350, без сравнений', o.spent === 350 && o.prevSpent === 0 && o.deltaPct === null, [o.spent, o.prevSpent, o.deltaPct])
  check('новичок: подсказок без истории нет', o.insights.length === 0, kinds(o))
  check('новичок: календарные массивы на весь месяц', o.daily.length === 30 && o.dailyIncome.length === 30, o.daily.length)
}

/* ---------- 11. Прогноз: аренда и разовая покупка не задают темп ---------- */
{
  const pad = (d) => String(d).padStart(2, '0')
  const list = []
  // Аренда пятого и ровно 1000 в день на еду; сегодня 6-е — сразу после аренды.
  for (const m of [8, 9, 10]) {
    list.push(tx(`2026-${pad(m)}-05`, 'expense', 38000, 'home', 'Аренда'))
    for (let d = 1; d <= (m === 9 ? 30 : 31); d++) list.push(tx(`2026-${pad(m)}-${pad(d)}`, 'expense', 1000, 'food'))
  }
  list.push(tx('2026-11-05', 'expense', 38000, 'home', 'Аренда'))
  for (let d = 1; d <= 6; d++) list.push(tx(`2026-11-${pad(d)}`, 'expense', 1000, 'food'))
  const now6 = +new Date(2026, 10, 6, 15, 0)
  const keys = new Set([recurringKey('home', 38000)])
  const upcoming = [{ amount: 38000, day: key(2026, 12, 5) }]
  const o = overview(list, { now: now6, recurringKeys: keys, upcoming })
  // 38 000 + 30 × 1000 = 68 000. Без разделения выходило 44 000 / 6 × 30 = 220 000.
  check('прогноз 6-го: аренда не размазана по месяцу (≈68 000)', Math.abs(o.projected - 68000) < 1, Math.round(o.projected))
  check('прогноз 6-го: без ложной подсказки «период дороже»', !o.insights.some((i) => i.kind === 'pace' && i.over), kinds(o))
  check('обычный день — к тому же дню прошлых месяцев (аренда в обоих)', Math.round(o.usualPerDay) === Math.round(o.perDay), [Math.round(o.usualPerDay), Math.round(o.perDay)])

  // Фитнес 22-го — ожидаемый платёж ложится в свой день.
  const o2 = overview(list, { now: now6, recurringKeys: keys, upcoming: [...upcoming, { amount: 2000, day: key(2026, 11, 22) }] })
  const at22 = o2.forecast[22 - 1 - o2.daysPassed]
  check('ожидаемый платёж — в свой день (22-е: 1000 + 2000)', Math.round(at22) === 3000 && Math.round(o2.projected) === 70000, [Math.round(at22), Math.round(o2.projected)])

  // Просроченный платёж (срок 3-го, записи нет) — ждём завтра.
  const o3 = overview(list, { now: now6, recurringKeys: keys, upcoming: [...upcoming, { amount: 650, day: key(2026, 11, 3) }] })
  check('просроченный платёж — завтра', Math.round(o3.forecast[0]) === 1650, Math.round(o3.forecast[0]))

  // Разовая покупка 30 000 третьего — темп остаётся 1000 в день.
  const o4 = overview([...list, tx('2026-11-03', 'expense', 30000, 'clothes', 'Пальто')], { now: now6, recurringKeys: keys, upcoming })
  check('разовая покупка не задаёт темп (≈98 000)', Math.abs(o4.projected - 98000) < 1, Math.round(o4.projected))

  // Ритм недели — без аренды: пятое ноября — четверг, но четверг не дороже прочих.
  const full = [...list]
  for (let d = 7; d <= 19; d++) full.push(tx(`2026-11-${pad(d)}`, 'expense', 1000, 'food'))
  const o5 = overview(full, { recurringKeys: keys, upcoming })
  check('ритм недели без аренды — дни ровные', o5.weekday.length === 7 && o5.weekday.every((v) => Math.round(v) === 1000), o5.weekday.map(Math.round))
  check('самый дорогой день — не день аренды', !o5.insights.some((i) => i.kind === 'peak_day'), kinds(o5))
  // Разовая покупка в понедельник 16-го — ритм её тоже не видит.
  const o6 = overview([...full, tx('2026-11-16', 'expense', 30000, 'clothes', 'Пальто')], { recurringKeys: keys, upcoming })
  check('ритм недели без разовой покупки — понедельник не дороже', o6.weekday.length === 7 && o6.weekday.every((v) => Math.round(v) === 1000), o6.weekday.map(Math.round))
}

/* ---------- 11б. Название платежа — как его пишет человек ---------- */
{
  const list = ['2026-08-18', '2026-09-18', '2026-10-18'].map((d) => tx(d, 'expense', 299, 'fun', 'Яндекс Плюс'))
  const rec = buildRecurring(list, NOW, byId, 'RUB')
  check('название платежа сохраняет написание («Яндекс Плюс»)', rec.length === 1 && rec[0].title === 'Яндекс Плюс', rec.map((r) => r.title))
}

/* ---------- 11в. Учёт начался посреди месяца ---------- */
{
  const pad = (d) => String(d).padStart(2, '0')
  const list = []
  for (let d = 15; d <= 19; d++) list.push(tx(`2026-11-${pad(d)}`, 'expense', 1000, 'food'))
  const o = overview(list, { firstDay: key(2026, 11, 15) })
  check('начал 15-го: средний день 1000, а не 5000 / 19', Math.round(o.perDay) === 1000 && o.daysTracked === 5, [Math.round(o.perDay), o.daysTracked])
  check('начал 15-го: дни до начала — не «без трат»', o.noSpendDays === 0, o.noSpendDays)
  check('начал 15-го: прогноз по дням учёта (5 000 + 11 × 1000)', Math.round(o.projected) === 16000, Math.round(o.projected))
  const one = overview([tx('2026-11-19 14:00', 'expense', 350, 'food')], { firstDay: key(2026, 11, 19) })
  check('первая запись сегодня: без прогноза, средний день = 350', one.forecast.length === 0 && Math.round(one.perDay) === 350 && one.noSpendDays === 0, [one.forecast.length, one.perDay, one.noSpendDays])
}

/* ---------- 12. Прогноз года: аренда — каждый месяц до конца ---------- */
{
  const pad = (d) => String(d).padStart(2, '0')
  const list = []
  for (let m = 1; m <= 2; m++) {
    list.push(tx(`2026-${pad(m)}-05`, 'expense', 38000, 'home', 'Аренда'))
    for (let d = 1; d <= (m === 1 ? 31 : 28); d++) list.push(tx(`2026-${pad(m)}-${pad(d)}`, 'expense', 1000, 'food'))
  }
  const now = +new Date(2026, 1, 28, 15, 0) // 28 февраля
  const o = buildOverview({
    current: list,
    previous: [[], [], []],
    categories: DEFAULT_CATEGORIES,
    currency: 'RUB',
    startKey: key(2026, 1, 1),
    endKey: key(2027, 1, 1),
    now,
    budget: 0,
    budgetApplies: false,
    recurringKeys: new Set([recurringKey('home', 38000)]),
    upcoming: [{ amount: 38000, day: key(2026, 3, 5) }],
  })
  // Прожито 59 дней: 59 000 еды + 2 аренды. Впереди 306 дней еды и 10 аренд (март…декабрь).
  const want = 59000 + 2 * 38000 + 306 * 1000 + 10 * 38000
  check('год: аренда в прогнозе каждый месяц (10 раз до конца года)', Math.abs(o.projected - want) < 1, [Math.round(o.projected), want])
}

console.log(`test-overview: ${passed} проверок${failed ? `, упало ${failed}` : ''} — сравнения к тому же дню, регулярные платежи, подсказки`)
if (failed) process.exit(1)
