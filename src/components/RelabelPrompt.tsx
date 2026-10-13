import { ArrowRight } from 'lucide-react'
import { useStore } from '../store/transactions'
import { getCurrency, type Currency } from '../lib/currencies'
import { opsWord, useT } from '../lib/i18n'
import { hapticNotify, hapticSelect } from '../lib/telegram'
import { showToast } from '../lib/toast'
import { CurrencyFlag } from './ui/CurrencyFlag'

/** Сколько операций сейчас в этой валюте (с учётом записей без своей валюты). */
export function countInCurrency(
  s: { transactions: { currency?: Currency }[]; currency: Currency },
  code: Currency,
): number {
  let n = 0
  for (const t of s.transactions) if ((t.currency ?? s.currency) === code) n++
  return n
}

/**
 * «37 операций — в $. Перенести в ₴?» — после смены основной валюты.
 *
 * Самая частая история: человек прошёл быстрый старт на долларе по умолчанию
 * и месяц записывал гривны как доллары. Сменить основную валюту мало — старые
 * записи так и остались бы долларовыми, и на Главной появились бы два «счёта».
 * Перенос не пересчитывает суммы по курсу (курсов в приложении нет), а только
 * меняет код — ровно то, что нужно, когда валюта была выбрана по ошибке.
 *
 * Вопрос задаём, а не переносим молча: у того, кто правда переехал из одной
 * страны в другую, старые записи остаются в старой валюте. После переноса —
 * тост с «Вернуть».
 *
 * Слова о валютах — символами («в $», «в ₴»): названия 92 валют в предложном
 * падеже («в гривнах», «в лари») мы не держим, а символ читается и так.
 */
export function RelabelPrompt({
  from,
  to,
  onDone,
  className,
}: {
  from: Currency
  to: Currency
  onDone: () => void
  className?: string
}) {
  const t = useT()
  const lang = useStore((s) => s.lang)
  const count = useStore((s) => countInCurrency(s, from))
  const relabel = useStore((s) => s.relabelCurrency)
  const undo = useStore((s) => s.undoRelabel)

  if (count === 0 || from === to) return null

  const fromSym = getCurrency(from).symbol
  const toSym = getCurrency(to).symbol

  const move = () => {
    const r = relabel(from, to)
    hapticNotify('success')
    showToast({
      icon: 'check',
      text: t('cur.relabel_done', { to: toSym, n: r.tx.length, ops: opsWord(lang, r.tx.length) }),
      action: { label: t('toast.restore'), run: () => undo(r) },
      duration: 6000,
    })
    onDone()
  }

  return (
    <div className={`card p-4 tab-enter ${className ?? ''}`}>
      <div className="flex items-center gap-2" aria-hidden>
        <CurrencyFlag code={from} size={24} />
        <ArrowRight size={15} strokeWidth={2.4} className="text-ink-subtle" />
        <CurrencyFlag code={to} size={24} />
      </div>
      <div className="mt-3 text-[16px] font-bold leading-snug text-ink">
        {t('cur.relabel_title', { n: count, ops: opsWord(lang, count), from: fromSym })}
      </div>
      <p className="mt-1 text-[14px] leading-snug text-ink-muted">{t('cur.relabel_text', { to: toSym })}</p>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={move}
          className="press flex-1 rounded-full bg-brand-500 px-3 py-2.5 text-[14px] font-bold text-white"
        >
          {t('cur.relabel_do', { to: toSym })}
        </button>
        <button
          type="button"
          onClick={() => {
            hapticSelect()
            onDone()
          }}
          className="press flex-1 rounded-full bg-surface-sunken px-3 py-2.5 text-[14px] font-bold text-ink"
        >
          {t('cur.relabel_keep', { from: fromSym })}
        </button>
      </div>
    </div>
  )
}
