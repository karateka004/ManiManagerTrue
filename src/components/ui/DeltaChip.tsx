import { ArrowDownRight, ArrowUpRight } from 'lucide-react'

interface Props {
  /** Изменение в процентах, со знаком. 0 сюда не передают — для «как обычно» своя подпись. */
  delta: number
  /**
   * Хорош ли рост. Для трат — нет: потратили больше, чем в прошлый раз, это
   * красное. Для доходов и накоплений было бы наоборот.
   */
  goodWhenUp?: boolean
}

/**
 * Плашка изменения к прошлому периоду: «↘ 5%».
 *
 * Раньше она была скопирована в три места, и во всех трёх тёмная тема была
 * сломана одинаково: фон задавался как `dark:bg-brand-500/16`, а прозрачности
 * 16 в шкале Tailwind нет — класс молча не генерировался. В тёмной теме
 * оставался светлый фон от светлой, а цвет текста брался тёмный: мятное на
 * почти белом, читалось еле-еле. Теперь плашка одна, и прозрачности только
 * из шкалы (см. .delta-* в index.css).
 *
 * Стрелка — диагональная, а не зигзаг TrendingUp: зигзаг рисует график, а нам
 * нужно направление, и в 12 пикселях он превращается в кашу.
 */
export function DeltaChip({ delta, goodWhenUp = false }: Props) {
  const up = delta > 0
  const good = goodWhenUp ? up : !up
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className={`delta-chip ${good ? 'delta-good' : 'delta-bad'}`}>
      <Icon size={13} strokeWidth={2.4} aria-hidden />
      {Math.abs(delta)}%
    </span>
  )
}
