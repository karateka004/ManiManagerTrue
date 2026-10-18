/**
 * Слияние облака (src/lib/syncMerge.ts): чистые функции без браузера.
 *
 * Три версии — своя (L), облачная (C) и основа (B, каким облако было при
 * последней синхронизации). Проверяем то, на чём раньше терялись данные:
 * правки и удаления с обеих сторон, добавления с обеих сторон, счётчики
 * (монеты), купленное, запись бота, забранная двумя телефонами, и что
 * удалённое на другом устройстве не воскресает.
 *
 * Запуск: `node scripts/test-sync.mjs` (Node 22.18+ сам понимает .ts).
 */
import { createdAtOf, localAdditions, makeBase, mergeStates, planStartup, canonical } from '../src/lib/syncMerge.ts'

let failed = 0
let passed = 0
const check = (name, ok, detail) => {
  if (ok) passed++
  else {
    failed++
    console.error('✗ ' + name + (detail !== undefined ? ' — ' + JSON.stringify(detail) : ''))
  }
}

const tx = (id, amount, note = '') => ({ id, type: 'expense', amount, categoryId: 'food', date: '2026-10-18', note })
const ids = (list) => list.map((t) => t.id)
const key = (t) => `${t.date}|${t.amount}|${t.categoryId}|${t.note ?? ''}`

// Основа: три операции, 100 монет, куплено два предмета, тема светлая.
const B = {
  transactions: [tx('a', 100), tx('b', 200), tx('c', 300)],
  coins: 100,
  owned: ['x', 'y'],
  themeMode: 'light',
  budgets: { food: 5000, cafe: 2000 },
  goals: [{ id: 'g1', title: 'Отпуск', target: 1000, saved: 0 }],
}
const base = makeBase(B, 1000)

{
  // Здесь: правка a, удаление b, новая d, потратил 30 монет, купил z, тёмная тема.
  const L = {
    ...B,
    transactions: [tx('d', 50), tx('a', 111), tx('c', 300)],
    coins: 70,
    owned: ['x', 'y', 'z'],
    themeMode: 'dark',
  }
  // Там: правка c, новая e, заработал 20 монет, купил w, лимит кафе 3000.
  const C = {
    ...B,
    transactions: [tx('e', 70), tx('a', 100), tx('b', 200), tx('c', 333)],
    coins: 120,
    owned: ['x', 'y', 'w'],
    budgets: { food: 5000, cafe: 3000 },
  }
  const { merged, differs } = mergeStates(L, C, base, key)
  const byId = Object.fromEntries(merged.transactions.map((t) => [t.id, t.amount]))
  check('своя правка сохраняется (a=111)', byId.a === 111, byId)
  check('своё удаление сохраняется (b нет)', byId.b === undefined, byId)
  check('чужая правка приходит (c=333)', byId.c === 333, byId)
  check('добавленное с обеих сторон — всё (d и e)', byId.d === 50 && byId.e === 70, byId)
  check('свои новые операции — сверху', merged.transactions[0].id === 'd', ids(merged.transactions))
  check('монеты: приращения складываются (100 −30 +20 = 90)', merged.coins === 90, merged.coins)
  check('купленное: объединяется (x, y, w, z)', canonical([...merged.owned].sort()) === canonical(['w', 'x', 'y', 'z']), merged.owned)
  check('настройка, изменённая только здесь, — своя', merged.themeMode === 'dark')
  check('настройка, изменённая только там, — облачная', merged.budgets.cafe === 3000, merged.budgets)
  check('итог отличается от облака — надо отправить', differs === true)
}

{
  // Удалено там, здесь не трогали — не воскресает; удалено там, здесь правили — остаётся.
  const L = { ...B, transactions: [tx('a', 100), tx('b', 222), tx('c', 300)] }
  const C = { ...B, transactions: [tx('c', 300)] }
  const { merged } = mergeStates(L, C, base, key)
  check('удалённое на другом устройстве не воскресает (a)', !ids(merged.transactions).includes('a'), ids(merged.transactions))
  check('удалено там, но здесь поправлено — остаётся (b=222)', merged.transactions.some((t) => t.id === 'b' && t.amount === 222), merged.transactions)
}

{
  // Удалено здесь, там поправили — правка важнее удаления.
  const L = { ...B, transactions: [tx('a', 100), tx('c', 300)] }
  const C = { ...B, transactions: [tx('a', 100), tx('b', 250), tx('c', 300)] }
  const { merged } = mergeStates(L, C, base, key)
  check('удалено здесь, но там поправлено — остаётся', merged.transactions.some((t) => t.id === 'b' && t.amount === 250))
}

{
  // Ничего не меняли здесь — итог равен облаку, отправлять нечего.
  const C = { ...B, transactions: [tx('n', 1), ...B.transactions], coins: 130 }
  const { merged, differs } = mergeStates(B, C, base, key)
  check('здесь без изменений — итог равен облаку', !differs && canonical(merged) === canonical(C))
}

{
  // Запись бота забрали оба телефона: у каждого свой id, содержимое одно.
  const bot = (id) => ({ ...tx(id, 300, 'кофе'), date: '2026-10-18T09:00:00.000Z' })
  const L = { ...B, transactions: [bot('mine'), ...B.transactions] }
  const C = { ...B, transactions: [bot('theirs'), ...B.transactions] }
  const { merged } = mergeStates(L, C, base, key)
  check('запись бота с двух телефонов не двоится', merged.transactions.filter((t) => t.note === 'кофе').length === 1, ids(merged.transactions))
  // Две одинаковые свои траты, облако видело одну чужую такую же — остаётся две.
  const L2 = { ...B, transactions: [tx('p1', 2.28, 'метро'), tx('p2', 2.28, 'метро'), ...B.transactions] }
  const C2 = { ...B, transactions: [tx('q1', 2.28, 'метро'), ...B.transactions] }
  const r2 = mergeStates(L2, C2, base, key).merged
  check('одинаковых: своих две, чужая одна — итого две', r2.transactions.filter((t) => t.note === 'метро').length === 2, ids(r2.transactions))
}

{
  // Цели — тоже поштучно; правка с обеих сторон — своя.
  const L = { ...B, goals: [{ id: 'g1', title: 'Отпуск', target: 1000, saved: 300 }] }
  const C = { ...B, goals: [{ id: 'g1', title: 'Отпуск', target: 1500, saved: 0 }] }
  const { merged } = mergeStates(L, C, base, key)
  check('цель, изменённая с обеих сторон, — своя', merged.goals[0].saved === 300)
}

{
  // Поля, изменённые с обеих сторон, — по смыслу поля, а не «своё».
  const B2 = {
    streak: { count: 3, best: 5, lastClaim: '2026-10-16' },
    questClaims: { first_tx: 1000 },
    budgets: { food: 5000, cafe: 2000 },
    events: { use_search: 2, visit_analytics: 1 },
    rewardedReferrals: 1,
    monthlyBudget: 30000,
  }
  const base2 = makeBase(B2, 1)
  const L = {
    streak: { count: 4, best: 5, lastClaim: '2026-10-17' },
    questClaims: { first_tx: 1000, tx_10: 5000 },
    budgets: { food: 6000, cafe: 2000 },
    events: { use_search: 5, visit_analytics: 1 },
    rewardedReferrals: 2,
    monthlyBudget: 35000,
  }
  const C = {
    streak: { count: 4, best: 6, lastClaim: '2026-10-17' },
    questClaims: { first_tx: 1000, tx_10: 7000 },
    budgets: { food: 5000, cafe: 3000 },
    events: { use_search: 3, visit_analytics: 4 },
    rewardedReferrals: 2,
    monthlyBudget: 40000,
  }
  const m = mergeStates(L, C, base2).merged
  check('серия дня, забранная в один день на двух телефонах, — не удваивается', m.streak.count === 4 && m.streak.best === 6, m.streak)
  check('метка получения награды — поздняя, а не сумма', m.questClaims.tx_10 === 7000, m.questClaims)
  check('лимиты: разные категории с двух устройств — обе правки', m.budgets.food === 6000 && m.budgets.cafe === 3000, m.budgets)
  check('счётчики событий — приращения по ключам', m.events.use_search === 6 && m.events.visit_analytics === 4, m.events)
  check('вознаграждённые друзья — догоняются, а не складываются', m.rewardedReferrals === 2, m.rewardedReferrals)
  check('бюджет месяца, заданный на обоих, — свой', m.monthlyBudget === 35000, m.monthlyBudget)
}

// Время создания из id — только для первого запуска 2.6 без основы.
const idAt = (t, salt = 'x7k2q9') => salt + t.toString(36)
const NOW = Date.UTC(2026, 9, 18, 12)
const H = 3_600_000
check('момент создания из id', createdAtOf(idAt(NOW - H), NOW) === NOW - H)
check('чужой формат id — неизвестно', createdAtOf('t1', NOW) === null && createdAtOf('food', NOW) === null)
{
  const offline = { id: idAt(NOW - H, 'cccc') }
  const old = { id: idAt(NOW - 5 * H, 'aaaa') }
  const add = localAdditions([offline, old], [], NOW - 2 * H, NOW)
  check('без основы: возвращаются только созданные после последней отправки', add.length === 1 && add[0] === offline, add)
}

{
  const s = { cloudTx: 5, localTx: 5, localAt: 0 }
  check('облака нет — отправить', planStartup({ ...s, cloudAt: null }) === 'push')
  check('облако не менялось без нас — отправить своё', planStartup({ ...s, cloudAt: 100, baseV: 100 }) === 'push')
  check('облако менял другой — слить', planStartup({ ...s, cloudAt: 200, baseV: 100 }) === 'merge')
  check('пусто здесь, в облаке операции — принять как есть (даже с основой)', planStartup({ ...s, cloudAt: 200, localTx: 0, baseV: 100 }) === 'adopt')
  check('до 2.6: облако новее — принять', planStartup({ ...s, cloudAt: 400, localAt: 300 }) === 'adopt')
  check('до 2.6: своё новее — отправить', planStartup({ ...s, cloudAt: 200, localAt: 300 }) === 'push')
}

if (failed) {
  console.error(`test-sync: ${failed} из ${failed + passed} не прошли`)
  process.exit(1)
}
console.log(`test-sync: ${passed} проверок — трёхстороннее слияние: правки, удаления, монеты, запись бота`)
