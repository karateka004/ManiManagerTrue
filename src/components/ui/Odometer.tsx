import { memo } from 'react'
import { formatMoney, type Currency } from '../../lib/format'

/**
 * Число с цифрами-барабанами: при изменении значения цифры прокручиваются к
 * новым, как на табло. Сумма баланса, остаток на сегодня, XP, монеты.
 *
 * Почему не «счётчик» на requestAnimationFrame: в свёрнутом Telegram rAF
 * стоит, и счётчик застрял бы на СТАРОМ числе — показал бы неправду. Здесь
 * каждая цифра стоит на своём месте сразу (это обычный transform ленты), а
 * CSS transition лишь прокручивает к ней. Не отыграл переход — число всё
 * равно верное. Вёрстка — в styles/motion.css (.odo-*).
 *
 * Ключи цифр считаются справа: единицы остаются единицами, когда число
 * становится длиннее («999» → «1 000»), и прокручивается именно та цифра,
 * которая изменилась.
 */
export const Odometer = memo(function Odometer({
  text,
  className,
}: {
  /** Готовая строка (уже отформатированная): цифры крутятся, остальное стоит. */
  text: string
  className?: string
}) {
  const chars = [...text]
  const n = chars.length
  let digitIndex = 0
  return (
    <span className={`odo ${className ?? ''}`}>
      {/* Скринридеру — число целиком, а не россыпь лент с цифрами 0–9. */}
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {chars.map((ch, i) => {
          const fromRight = n - i
          if (ch >= '0' && ch <= '9') {
            const idx = digitIndex++
            return <Digit key={'d' + fromRight} d={ch.charCodeAt(0) - 48} i={Math.min(idx, 8)} />
          }
          return <span key={'c' + fromRight}>{ch}</span>
        })}
      </span>
    </span>
  )
})

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

function Digit({ d, i }: { d: number; i: number }) {
  return (
    <span className="odo-d" style={{ '--odo-i': i } as React.CSSProperties}>
      <span className="odo-ph">{d}</span>
      <span className="odo-win">
        <span className="odo-strip" style={{ transform: `translateY(${-d * 10}%)` }}>
          {DIGITS.map((x) => (
            <span key={x}>{x}</span>
          ))}
        </span>
      </span>
    </span>
  )
}

/** Разделитель, который formatMoney ставит между числом и символом валюты. */
const NBSP = String.fromCharCode(160)

/**
 * Крупная сумма с барабанами — то же оформление, что у `<Money>` (мелкий тихий
 * символ валюты и копейки), но цифры прокручиваются при изменении.
 *
 * Деньги с нуля не раскручиваются никогда: пока барабаны крутятся, на экране
 * неверная сумма, а при первом показе это просто ложь. Крутится только то,
 * что изменилось.
 */
export function AnimatedMoney({
  value,
  currency,
  sign,
  compact,
  className,
}: {
  value: number
  currency: Currency
  sign?: boolean
  compact?: boolean
  className?: string
}) {
  const text = formatMoney(value, currency, { sign, compact })
  const cut = text.lastIndexOf(NBSP)
  const num = cut >= 0 ? text.slice(0, cut) : text
  const symbol = cut >= 0 ? text.slice(cut + 1) : ''
  const frac = /[.,]\d{2}$/.exec(num)
  const whole = frac ? num.slice(0, frac.index) : num

  return (
    <span className={`money ${className ?? ''}`}>
      <Odometer text={whole} />
      {frac && (
        <span className="money-frac">
          <Odometer text={frac[0]} />
        </span>
      )}
      {symbol && <span className="money-sym">{symbol}</span>}
    </span>
  )
}
