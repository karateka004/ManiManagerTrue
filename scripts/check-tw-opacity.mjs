/**
 * Прозрачность в классах Tailwind — только из шкалы.
 *
 * `bg-brand-500/15` работает, а `bg-brand-500/16` Tailwind просто не
 * генерирует: ни ошибки, ни предупреждения, класса нет. Так в тёмной теме
 * месяцами жили сломанные плашки тренда и чипы в «Потоке денег» — светлый фон
 * от светлой темы и тёмный текст поверх. Глазами в коде это не видно, поэтому
 * проверяем на каждый lint.
 *
 * Если нужна прозрачность вне шкалы — пишите явно, в скобках: `bg-x/[.16]`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SCALE = new Set([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100])
const PREFIX = '(?:bg|text|border|ring|from|via|to|fill|stroke|shadow|outline|divide|placeholder|decoration|accent|caret)'
const RE = new RegExp(`(?<![\\w\\[-])((?:[a-z]+:)*${PREFIX}-[a-z0-9-]+)/(\\d{1,3})(?![\\d\\]])`, 'g')

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* files(p)
    else if (/\.(tsx?|css)$/.test(name)) yield p
  }
}

// Комментарии вырезаем: в них классы цитируются как пример ошибки.
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:])\/\/.*$/gm, '$1')

const bad = []
for (const f of files('src')) {
  const lines = stripComments(readFileSync(f, 'utf8')).split('\n')
  lines.forEach((line, i) => {
    for (const m of line.matchAll(RE)) {
      if (!SCALE.has(Number(m[2]))) bad.push(`${f}:${i + 1}  ${m[0]}`)
    }
  })
}

if (bad.length) {
  console.error('check-tw-opacity: прозрачность вне шкалы Tailwind — такие классы не генерируются:\n  ' + bad.join('\n  '))
  console.error('Возьмите ближайшее из шкалы (5, 10, 15, 20…) или задайте явно: /[.16]')
  process.exit(1)
}
console.log('check-tw-opacity: все прозрачности из шкалы')
