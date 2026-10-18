/**
 * Слияние облака (src/lib/syncMerge.ts): чистые функции без браузера.
 *
 * Сценарии, где раньше пропадали записи: запуск без связи + запись + облако,
 * обновлённое другим телефоном; два открытых устройства. Проверяем, что свои
 * несинхронизированные записи возвращаются, удалённое на другом устройстве не
 * воскресает, а запись бота, забранная обоими телефонами, не двоится.
 *
 * Запуск: `node scripts/test-sync.mjs` (Node 22.18+ сам понимает .ts).
 */
import { createdAtOf, localAdditions, planStartup } from '../src/lib/syncMerge.ts'

let failed = 0
let passed = 0
const check = (name, ok, detail) => {
  if (ok) passed++
  else {
    failed++
    console.error('✗ ' + name + (detail !== undefined ? ' — ' + JSON.stringify(detail) : ''))
  }
}

// id как у стора: случайная часть + Date.now() в base36.
const idAt = (t, salt = 'x7k2q9') => salt + t.toString(36)
const NOW = Date.UTC(2026, 9, 18, 12)
const H = 3_600_000

check('момент создания из id', createdAtOf(idAt(NOW - H), NOW) === NOW - H)
check('чужой формат id — неизвестно', createdAtOf('t1', NOW) === null && createdAtOf('food', NOW) === null && createdAtOf('c_food', NOW) === null)
check('метка из будущего — неизвестно', createdAtOf(idAt(NOW + 3 * 86_400_000), NOW) === null)

{
  const synced = NOW - 2 * H
  const old = { id: idAt(NOW - 5 * H, 'aaaa'), v: 'старая, синхронизирована' }
  const deletedThere = { id: idAt(NOW - 4 * H, 'bbbb'), v: 'удалили на другом телефоне' }
  const offline = { id: idAt(NOW - H, 'cccc'), v: 'записана без связи' }
  const fromThere = { id: idAt(NOW - 30 * 60_000, 'dddd'), v: 'с другого телефона' }
  const local = [offline, deletedThere, old]
  const cloud = [fromThere, old]
  const add = localAdditions(local, cloud, synced, NOW)
  check('своя запись без связи возвращается', add.length === 1 && add[0] === offline, add)
  check('удалённое на другом устройстве не воскресает', !add.includes(deletedThere))
  check('что уже в облаке — не дублируется', !add.includes(old))
  check('чужой формат id не возвращаем (не судим)', localAdditions([{ id: 't1' }], [], 0, NOW).length === 0)
}

{
  // Запись бота забрали оба телефона — у каждого свой id, содержимое одно.
  const key = (t) => `${t.date}|${t.amount}|${t.cat}`
  const mineBot = { id: idAt(NOW - 10 * 60_000, 'mine'), date: '2026-10-18T09:00:00Z', amount: 300, cat: 'cafe' }
  const theirsBot = { id: idAt(NOW - 9 * 60_000, 'their'), date: '2026-10-18T09:00:00Z', amount: 300, cat: 'cafe' }
  const mineOther = { id: idAt(NOW - 8 * 60_000, 'mine2'), date: '2026-10-18T10:00:00Z', amount: 450, cat: 'transport' }
  const add = localAdditions([mineBot, mineOther], [theirsBot], NOW - H, NOW, key)
  check('запись бота с двух телефонов не двоится', add.length === 1 && add[0] === mineOther, add)
  // Две одинаковые траты, обе свои: облако видело одну — вторая возвращается.
  const a = { id: idAt(NOW - 20 * 60_000, 'a1'), date: '2026-10-18', amount: 2.28, cat: 'transport' }
  const b = { id: idAt(NOW - 19 * 60_000, 'b1'), date: '2026-10-18', amount: 2.28, cat: 'transport' }
  const c = { id: idAt(NOW - 18 * 60_000, 'c1'), date: '2026-10-18', amount: 2.28, cat: 'transport' }
  const two = localAdditions([a, b, c], [{ ...c, id: idAt(NOW - 17 * 60_000, 'z9') }], NOW - H, NOW, key)
  check('одинаковых три, облако видело одну чужую — возвращаем две', two.length === 2, two)
}

{
  const base = { cloudTx: 5, localTx: 5, tried: [] }
  check('облака нет — отправить', planStartup({ ...base, cloudAt: null, localAt: 0 }) === 'push')
  check('пусто здесь, в облаке операции — принять', planStartup({ ...base, cloudAt: 100, localTx: 0, localAt: 500, base: 100 }) === 'adopt')
  check('облако не менялось без нас — отправить своё', planStartup({ ...base, cloudAt: 100, localAt: 300, base: 100 }) === 'push')
  check('облако менял другой — принять и слить', planStartup({ ...base, cloudAt: 200, localAt: 300, base: 100 }) === 'adopt')
  check('в облаке наш снимок без ответа — вести от него', planStartup({ ...base, cloudAt: 300, localAt: 300, base: 100, tried: [300] }) === 'own')
  check('приложение до 2.6: облако новее — принять', planStartup({ ...base, cloudAt: 400, localAt: 300 }) === 'adopt')
  check('приложение до 2.6: своё новее — отправить', planStartup({ ...base, cloudAt: 200, localAt: 300 }) === 'push')
}

if (failed) {
  console.error(`test-sync: ${failed} из ${failed + passed} не прошли`)
  process.exit(1)
}
console.log(`test-sync: ${passed} проверок — слияние облака, удалённое не воскресает, запись бота не двоится`)
