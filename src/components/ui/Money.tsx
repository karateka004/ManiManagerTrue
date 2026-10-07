import { formatMoney, type Currency } from '../../lib/format'

/** Разделитель, который formatMoney всегда ставит между числом и символом валюты. */
const NBSP = String.fromCharCode(160)

interface Props {
  value: number
  currency: Currency
  /** Показать знак «+»/«−» (как formatMoney с sign). */
  sign?: boolean
  compact?: boolean
  className?: string
}

/**
 * Сумма для КРУПНОГО показа: вес несут цифры, а не значок валюты.
 *
 * У «8 380 €», набранного одним кеглем, символ валюты весит столько же, сколько
 * цифры, и глаз цепляется за него раньше, чем за сумму. Дорогие банковские
 * интерфейсы делают символ мельче и тише, а копейки — чуть мельче целой части:
 * сначала читается порядок суммы, детали — потом.
 *
 * Строка та же, что у formatMoney, — меняется только оформление частей. Поэтому
 * для строк списков компонент НЕ нужен: там важнее ровный столбец, а мелкий
 * символ его рвёт.
 */
export function Money({ value, currency, sign, compact, className }: Props) {
  const text = formatMoney(value, currency, { sign, compact })
  const cut = text.lastIndexOf(NBSP)
  const num = cut >= 0 ? text.slice(0, cut) : text
  const symbol = cut >= 0 ? text.slice(cut + 1) : ''
  // Копейки — ровно две цифры после последнего разделителя. «8.380» (немецкие
  // тысячи) сюда не попадает: после точки там три цифры.
  const frac = /[.,]\d{2}$/.exec(num)
  const whole = frac ? num.slice(0, frac.index) : num

  return (
    <span className={`money ${className ?? ''}`}>
      {whole}
      {frac && <span className="money-frac">{frac[0]}</span>}
      {symbol && <span className="money-sym">{symbol}</span>}
    </span>
  )
}
