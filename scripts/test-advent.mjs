/**
 * Адвент-календарь (src/lib/season.ts, src/lib/advent.ts) и его слияние в
 * облаке (src/lib/syncMerge.ts): чистые функции без браузера.
 *
 * Проверяем то, на чём праздник мог бы обмануть: окошко открывается только в
 * свой день и раньше не открывается; окошко дня засчитывает серию (как плитка
 * «Серия дня», которую оно заменяет); пропущенное стоит монет и серию не
 * трогает; главный подарок — только в январе и только за нужное число окошек;
 * окошко, открытое на двух телефонах, даёт подарок один раз; опыт адвента
 * совпадает с потолком рейтинга в воркере; у каждого окошка есть совет и у
 * каждой вещи — название.
 *
 * Запуск: `node --import ./worker/scripts/ts-resolve.mjs scripts/test-advent.mjs`
 */
import { readFileSync } from 'node:fs'
process.env.TZ = 'Europe/Moscow'

const S = await import('../src/lib/season.ts')
const A = await import('../src/lib/advent.ts')
const { REWARDS, getReward, STREAK_GIFTS } = await import('../src/lib/rewards.ts')
const { mergeStates, makeBase, doubledRewards } = await import('../src/lib/syncMerge.ts')
const { ADVENT_TIPS, FINAL_TIP } = await import('../src/components/advent/tips.ts')

let failed = 0
let passed = 0
const check = (name, ok, detail) => {
  if (ok) passed++
  else {
    failed++
    console.error('✗ ' + name + (detail !== undefined ? ' — ' + JSON.stringify(detail) : ''))
  }
}
const at = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min)
const fresh = (over = {}) => ({
  advent: [],
  coins: 100,
  bonusXp: 0,
  owned: ['accent_mint', 'title_newbie'],
  streak: { count: 0, best: 0, lastClaim: null },
  ...over,
})
const apply = (s, r) => ({ ...s, ...r.patch })

/* ---------- 1. Сезон по местным датам ---------- */
check('23 ноября — сезона нет', S.season(at(2026, 11, 23)).phase === 'off')
check('24 ноября — тизер', S.season(at(2026, 11, 24)).phase === 'teaser')
check('30 ноября 23:59 — ещё тизер', S.season(at(2026, 11, 30, 23, 59)).phase === 'teaser')
const dec1 = S.season(at(2026, 12, 1, 0, 1))
check('1 декабря 00:01 — окошко 1', dec1.phase === 'live' && dec1.day === 1 && dec1.year === 2026, dec1)
check('31 декабря — окошко 31', S.season(at(2026, 12, 31, 23, 59)).day === 31)
const jan1 = S.season(at(2027, 1, 1, 0, 0))
check('1 января — финал прошлого года', jan1.phase === 'finale' && jan1.year === 2026, jan1)
check('14 января — ещё финал', S.season(at(2027, 1, 14, 23, 0)).phase === 'finale')
check('15 января — сезон закончился', S.season(at(2027, 1, 15)).phase === 'off')
check('до Нового года: 31 декабря — 1', S.daysToNewYear(at(2026, 12, 31)) === 1)
check('до Нового года: 1 декабря — 31', S.daysToNewYear(at(2026, 12, 1)) === 31)
check('до Нового года: 25 ноября — 37', S.daysToNewYear(at(2026, 11, 25)) === 37)
check('до первого окошка: 25 ноября — 6', S.daysToAdvent(at(2026, 11, 25)) === 6)
check('ключ окошка', S.doorKey(2026, 5) === '2026-12-05')

/* ---------- 2. Окошко дня ---------- */
const d5 = at(2026, 12, 5, 9)
let s = fresh({ streak: { count: 3, best: 3, lastClaim: '2026-12-04' } })
let r = A.openDoor(s, 5, d5, () => 0)
check('окошко 5 открывается 5 декабря', r.ok && !r.late && r.price === 0, r)
check('в окошке 5 — «Иней»', r.ok && r.gift.items.includes('accent_frost'))
check('окошко дня засчитывает серию', r.ok && r.streak?.count === 4 && r.patch.streak?.lastClaim === '2026-12-05', r.streak)
check(
  'монеты и опыт: окошко + серия',
  r.ok && r.patch.coins === 100 + A.ADVENT_DOORS[4].coins + r.streak.coins && r.patch.bonusXp === A.ADVENT_DOORS[4].xp + r.streak.xp,
  r.patch,
)
s = apply(s, r)
check('ключ записан', s.advent.includes('2026-12-05'))
check('второй раз не открывается', A.openDoor(s, 5, d5).reason === 'opened')
check('завтрашнее окошко закрыто', A.openDoor(s, 6, d5).reason === 'locked')
check('окошко 0 и 32 — нет', A.openDoor(s, 0, d5).reason === 'locked' && A.openDoor(s, 32, d5).reason === 'locked')
check('в тизере окошек нет', A.openDoor(fresh(), 1, at(2026, 11, 28)).reason === 'season')
check('после 14 января — тоже', A.openDoor(fresh(), 3, at(2027, 1, 15)).reason === 'season')

// Серию сегодня уже забрали (старое приложение на втором телефоне) — окошко без дня серии.
r = A.openDoor(fresh({ streak: { count: 2, best: 2, lastClaim: '2026-12-05' } }), 5, d5)
check('серию сегодня уже забрали — окошко без серии', r.ok && r.streak === null && !r.patch.streak, r)

// Рубеж серии 7 — подарок за серию тоже приходит (как у плитки «Серия дня»).
r = A.openDoor(fresh({ streak: { count: 6, best: 6, lastClaim: '2026-12-08' } }), 9, at(2026, 12, 9), () => 0)
check('7 дней серии — подарок за рубеж', r.ok && r.streak?.milestone === 7 && !!r.streak.gift, r.streak)
check('подарок за рубеж — нужной редкости', r.ok && getReward(r.streak.gift)?.rarity === STREAK_GIFTS[7])
check('подарок за рубеж — в купленном', r.ok && r.patch.owned.includes(r.streak.gift))

// Вещь уже есть — монетами.
r = A.openDoor(fresh({ owned: ['accent_frost'] }), 5, d5)
check('вещь уже есть — монеты вместо неё', r.ok && r.gift.dup && r.gift.items.length === 0 && r.gift.coins === A.ADVENT_DOORS[4].coins + A.ADVENT_DUP_COINS, r.gift)

/* ---------- 3. Пропущенное окошко ---------- */
r = A.openDoor(fresh({ coins: 10 }), 3, d5)
check('пропущенное без монет — нельзя', !r.ok && r.reason === 'coins', r)
s = fresh({ coins: 40, streak: { count: 1, best: 4, lastClaim: '2026-12-05' } })
r = A.openDoor(s, 3, d5)
check('пропущенное — за монеты', r.ok && r.late && r.price === S.ADVENT_LATE_PRICE, r)
check('пропущенное — с ключом :late', r.ok && r.patch.advent.includes('2026-12-03:late'))
check('пропущенное серию не трогает', r.ok && r.streak === null && !r.patch.streak)
check('пропущенное: монеты = было − цена + подарок', r.ok && r.patch.coins === 40 - S.ADVENT_LATE_PRICE + A.ADVENT_DOORS[2].coins)
s = apply(s, r)
check('пропущенное засчитано как открытое', S.isDoorOpen(s.advent, 2026, 3) && S.openedCount(s.advent, 2026) === 1)
check('открытое позже второй раз не открыть', A.openDoor({ ...s, coins: 500 }, 3, d5).reason === 'opened')

// В январе — все неоткрытые пропущенные, открываются за монеты.
r = A.openDoor(fresh({ coins: 100 }), 31, at(2027, 1, 3))
check('3 января окошко 31 — пропущенное', r.ok && r.late && r.patch.advent.includes('2026-12-31:late'), r)

/* ---------- 4. Состояния окошек ---------- */
const live = S.season(d5)
check('открытое', A.doorState(['2026-12-02'], live, 2) === 'open')
check('сегодняшнее', A.doorState([], live, 5) === 'today')
check('прошлое неоткрытое — пропущено', A.doorState([], live, 4) === 'missed')
check('будущее — закрыто', A.doorState([], live, 6) === 'locked')
check('в тизере всё закрыто', A.doorState([], S.season(at(2026, 11, 26)), 1) === 'locked')
check('в январе неоткрытое — пропущено', A.doorState([], S.season(at(2027, 1, 2)), 20) === 'missed')
check('окошко дня ждёт — 5 декабря без ключа', S.todayDoorWaiting([], d5))
check('окошко дня не ждёт — открыто', !S.todayDoorWaiting(['2026-12-05'], d5))
check('окошко дня не ждёт — в январе', !S.todayDoorWaiting([], at(2027, 1, 2)))

/* ---------- 5. Главный подарок ---------- */
const days = (n) => Array.from({ length: n }, (_, i) => S.doorKey(2026, i + 1) + (i % 3 === 0 ? ':late' : ''))
check('в декабре главный подарок закрыт', A.openFinal(fresh({ advent: days(31) }), at(2026, 12, 31)).reason === 'season')
check('23 окошка — мало', A.openFinal(fresh({ advent: days(S.ADVENT_FINAL_NEED - 1) }), at(2027, 1, 1)).reason === 'need')
s = fresh({ advent: days(S.ADVENT_FINAL_NEED) })
r = A.openFinal(s, at(2027, 1, 1, 0, 5))
check('24 окошка — подарок 1 января', r.ok && r.gift.items.includes('card_newyear') && r.gift.items.includes('title_newyear'), r)
check('ключ главного подарка', r.ok && r.patch.advent.includes('2026-final'))
check('опыт главного подарка', r.ok && r.patch.bonusXp === A.ADVENT_FINAL.xp)
s = apply(s, r)
check('второй раз не открыть', A.openFinal(s, at(2027, 1, 2)).reason === 'opened')
check('15 января — поздно', A.openFinal(fresh({ advent: days(31) }), at(2027, 1, 15)).reason === 'season')

/* ---------- 6. Каталог, советы, потолок рейтинга ---------- */
check('окошек 31, по порядку', A.ADVENT_DOORS.length === 31 && A.ADVENT_DOORS.every((d, i) => d.day === i + 1))
for (const d of A.ADVENT_DOORS) {
  if (d.item) check(`вещь окошка ${d.day} — из коллекции адвента`, getReward(d.item)?.source === 'advent', d.item)
  const tip = ADVENT_TIPS[d.day]
  check(`совет окошка ${d.day} — ru и en`, !!tip && tip.ru.length > 20 && tip.en.length > 20)
  check(`совет ${d.day}: вопрос ассистенту — только у действия «Спросить»`, (d.action === 'ask') === !!tip?.ask, d)
  check(`совет ${d.day} не длиннее 160 знаков`, (tip?.ru.length ?? 0) <= 160 && (tip?.en.length ?? 0) <= 160, tip?.ru.length)
}
check('совет главного подарка', FINAL_TIP.ru.length > 10 && FINAL_TIP.en.length > 10)
for (const id of A.ADVENT_FINAL.items) check(`вещь главного подарка ${id}`, getReward(id)?.source === 'advent')
const advRewards = REWARDS.filter((x) => x.source === 'advent')
const given = new Set(A.ADVENT_ITEMS.map((x) => x.id))
check('каждая вещь коллекции где-то выдаётся', advRewards.every((x) => given.has(x.id)), advRewards.map((x) => x.id))
check('в коллекции 9 вещей', advRewards.length === 9 && A.ADVENT_ITEMS.length === 9)
// Названия коллекции — в самом каталоге (ru и en): общий словарь в стартовом
// чанке, translate берёт их оттуда (lib/i18n.ts, rewardText). В словаре их быть
// не должно — иначе две правды разойдутся.
const dict = readFileSync(new URL('../src/lib/i18n.ts', import.meta.url), 'utf8')
for (const x of advRewards) {
  check(`название ${x.id}: ru и en в каталоге`, !!x.name && !!x.hint && !!x.en?.name && !!x.en?.hint, x)
  check(`название ${x.id} не в общем словаре`, !dict.includes(`'reward.${x.id}.name'`))
  if (x.kind === 'title') check(`титул ${x.id} не длиннее 14 знаков`, (x.title ?? '').length <= 14, x.title)
}
check('словарь берёт названия из каталога', /function rewardText/.test(dict) && /rewardText\(lang, key\) \?\? key/.test(dict))
const worker = readFileSync(new URL('../worker/src/index.ts', import.meta.url), 'utf8')
const wxp = Number(/const XP_ADVENT = (\d+)/.exec(worker)?.[1])
check('опыт адвента = потолок в воркере (XP_ADVENT)', wxp === A.ADVENT_TOTAL_XP, { app: A.ADVENT_TOTAL_XP, worker: wxp })
check('ключ → награда: окошко', A.adventKeyGift('2026-12-05')?.coins === A.ADVENT_DOORS[4].coins)
check('ключ → награда: главный', A.adventKeyGift('2026-final')?.xp === A.ADVENT_FINAL.xp)
check('ключ → награда: мусор', A.adventKeyGift('2026-11-05') === undefined && A.adventKeyGift('x') === undefined)

/* ---------- 7. Облако: два телефона ---------- */
const rewards = {
  quest: () => undefined,
  streak: () => ({ xp: 2, coins: 5 }),
  referral: { xp: 25, coins: 10 },
  advent: A.adventKeyGift,
}
const g5 = A.adventKeyGift('2026-12-05')
// Основа: ничего не открыто. Оба телефона открыли окошко 5 в свой день.
const base0 = { advent: [], coins: 100, bonusXp: 0, streak: { count: 0, best: 0, lastClaim: null } }
const both = { advent: ['2026-12-05'], coins: 100 + g5.coins + 5, bonusXp: g5.xp + 2, streak: { count: 1, best: 1, lastClaim: '2026-12-05' } }
let m = mergeStates({ ...both, coins: both.coins + 7 }, both, makeBase(base0, 1), undefined, rewards)
// Здесь ещё +7 монет за запись — их сохраняем, подарок окошка и день серии — по разу.
check('одно окошко на двух телефонах — подарок один', m.merged.coins === 100 + g5.coins + 5 + 7, m.merged.coins)
check('…и опыт один', m.merged.bonusXp === g5.xp + 2, m.merged.bonusXp)
check('…ключ один', m.merged.advent.length === 1)
// Разные окошки — оба подарка.
const g3 = A.adventKeyGift('2026-12-03')
const l = { ...base0, advent: ['2026-12-05'], coins: 100 + g5.coins, bonusXp: g5.xp }
const c = { ...base0, advent: ['2026-12-03:late'], coins: 100 - g3.price + g3.coins, bonusXp: g3.xp }
m = mergeStates(l, c, makeBase(base0, 1), undefined, rewards)
check('разные окошки — оба открыты', m.merged.advent.includes('2026-12-05') && m.merged.advent.includes('2026-12-03:late'))
check('разные окошки — оба подарка', m.merged.coins === 100 + g5.coins - g3.price + g3.coins, m.merged.coins)
// Одно окошко: здесь в свой день, там позже за монеты — оплата лишняя, возвращаем.
const late = { ...base0, advent: ['2026-12-05:late'], coins: 100 - g5.price + g5.coins, bonusXp: g5.xp }
const ontime = { ...base0, advent: ['2026-12-05'], coins: 100 + g5.coins + 3, bonusXp: g5.xp }
m = mergeStates(ontime, late, makeBase(base0, 1), undefined, rewards)
check('в свой день + позже — подарок один, оплата возвращена', m.merged.coins === 100 + g5.coins + 3, m.merged.coins)
check('…окошко открыто', S.isDoorOpen(m.merged.advent, 2026, 5) && S.openedCount(m.merged.advent, 2026) === 1)
// Главный подарок на двух телефонах.
const fin = { ...base0, advent: ['2026-final'], coins: 100 + A.ADVENT_FINAL.coins, bonusXp: A.ADVENT_FINAL.xp }
m = mergeStates({ ...fin, coins: fin.coins + 2 }, fin, makeBase(base0, 1), undefined, rewards)
check('главный подарок на двух телефонах — один', m.merged.coins === 100 + A.ADVENT_FINAL.coins + 2 && m.merged.bonusXp === A.ADVENT_FINAL.xp, m.merged)
// Без поля в основе (основа от старого приложения) — ничего не вычитаем.
check('основа без адвента — без поправки', doubledRewards(both, both, { coins: 100 }, rewards).coins === 0)

console.log(`адвент: ${passed} проверок прошли` + (failed ? `, ${failed} не прошли` : ''))
if (failed) process.exit(1)
