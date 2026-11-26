/**
 * Потолок XP рейтинга (воркер) складывается из общих чисел shared/xp.ts. Здесь —
 * что они совпадают с таблицами приложения: задания, адвент, опыт за операцию и
 * друга. Разойдутся — честный игрок упрётся в потолок, и его опыт в рейтинге срежут.
 *
 * Запуск: `node --import ./worker/scripts/ts-resolve.mjs scripts/test-xp.mjs`
 */
const X = await import('../shared/xp.ts')
const { QUESTS_TOTAL_XP } = await import('../src/lib/quests.ts')
const { ADVENT_TOTAL_XP } = await import('../src/lib/advent.ts')
const { XP_PER_TRANSACTION } = await import('../src/lib/levels.ts')

const problems = []
if (X.XP_ALL_QUESTS !== QUESTS_TOTAL_XP) problems.push(`задания: в shared ${X.XP_ALL_QUESTS}, в таблице ${QUESTS_TOTAL_XP}`)
if (X.XP_ADVENT !== ADVENT_TOTAL_XP) problems.push(`адвент: в shared ${X.XP_ADVENT}, в таблице ${ADVENT_TOTAL_XP}`)
if (X.XP_PER_TRANSACTION !== XP_PER_TRANSACTION) problems.push('опыт за операцию разошёлся')
if (problems.length) {
  console.error('test-xp: потолок XP разошёлся с наградами\n  - ' + problems.join('\n  - '))
  process.exit(1)
}
console.log(`test-xp: задания ${QUESTS_TOTAL_XP}, адвент ${ADVENT_TOTAL_XP}, операция ${XP_PER_TRANSACTION} — совпадают с потолком воркера`)
