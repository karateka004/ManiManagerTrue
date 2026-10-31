import { memo, useState, type AnimationEvent, type CSSProperties } from 'react'
import { formatMoney, type Currency } from '../../lib/format'
import { MASK } from '../../lib/clarity'

/**
 * Число с цифрами-барабанами: при изменении значения цифры прокручиваются к
 * новым, как на табло. Сумма баланса, остаток на сегодня, XP, монеты.
 *
 * Почему не «счётчик» на requestAnimationFrame: в свёрнутом Telegram rAF
 * стоит, и счётчик застрял бы на СТАРОМ числе — показал бы неправду. Здесь
 * лента с цифрами появляется только на время смены: её конечное положение —
 * новая цифра, а CSS-анимация лишь прокручивает к ней от старой. Не отыграла
 * анимация — число всё равно верное. В покое цифра — просто текст: ленты 0–9
 * у каждой цифры (14 элементов на цифру) делали карточку баланса самой
 * тяжёлой частью Главной — 227 элементов из ~520, а их отрисовка и раскладка
 * шли на каждом запуске ради анимации, которая при запуске не нужна.
 * Вёрстка — в styles/motion.css (.odo-*).
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
    <span className={`odo ${className ?? ''}`} {...MASK}>
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

/** «Меньше движения» в системе — цифры встают сразу, без ленты. */
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

function Digit({ d, i }: { d: number; i: number }) {
  // Смена цифры запоминается прямо при отрисовке (так React советует выводить
  // состояние из пропсов): откуда крутить и номер прокрутки — ключ ленты, чтобы
  // каждая смена начинала анимацию заново.
  const [roll, setRoll] = useState({ d, from: d, n: 0, on: false })
  if (roll.d !== d) setRoll({ d, from: roll.d, n: roll.n + 1, on: !reducedMotion() })

  if (!roll.on) return <span className="odo-d">{d}</span>

  const done = (e: AnimationEvent) => {
    if (e.target === e.currentTarget) setRoll((r) => (r.d === d ? { ...r, on: false } : r))
  }
  return (
    <span className="odo-d" style={{ '--odo-i': i } as CSSProperties}>
      <span className="odo-ph">{d}</span>
      <span className="odo-win">
        <span
          key={roll.n}
          className="odo-strip odo-roll"
          onAnimationEnd={done}
          style={
            {
              transform: `translateY(${-d * 10}%)`,
              '--odo-from': `${-roll.from * 10}%`,
              '--odo-to': `${-d * 10}%`,
            } as CSSProperties
          }
        >
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
    <span className={`money ${className ?? ''}`} {...MASK}>
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
