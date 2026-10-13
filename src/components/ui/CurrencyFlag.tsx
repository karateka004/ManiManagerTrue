import { useState } from 'react'
import clsx from 'clsx'
import { flagUrl, getCurrency, isCurrency } from '../../lib/currencies'

/**
 * Круглый флаг валюты. По флагу валюту находят глазами быстрее, чем по коду:
 * «UAH» и «USD» читаются похоже, а жёлто-синий круг ни с чем не спутать.
 *
 * Картинка декоративная (`alt=""`): код или название всегда стоят рядом.
 * Не загрузилась (нет сети при первом запуске) — кружок с символом валюты,
 * чтобы на месте флага не оставалась дыра. Обводка в 1 px — у белых флагов
 * (Япония) иначе нет края на белой карточке.
 */
export function CurrencyFlag({ code, size = 22, className }: { code: string; size?: number; className?: string }) {
  // Помним, у какого кода картинка не загрузилась: строка списка может получить
  // другой код, и чужая ошибка не должна прятать его флаг.
  const [failedFor, setFailedFor] = useState<string | null>(null)
  const failed = failedFor === code
  const src = flagUrl(code)
  const box = { width: size, height: size }

  if (!src || failed) {
    const symbol = isCurrency(code) ? getCurrency(code).symbol : code.slice(0, 1)
    return (
      <span
        aria-hidden
        style={{ ...box, fontSize: Math.round(size * (symbol.length > 1 ? 0.36 : 0.5)) }}
        className={clsx(
          'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-sunken font-bold leading-none text-ink-muted shadow-soft',
          className,
        )}
      >
        {symbol.slice(0, 3)}
      </span>
    )
  }

  return (
    <img
      src={src}
      alt=""
      aria-hidden
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailedFor(code)}
      style={box}
      className={clsx('inline-block shrink-0 rounded-full bg-surface-sunken shadow-soft', className)}
    />
  )
}
