import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Check, Search, X } from 'lucide-react'
import { BottomSheet } from './ui/BottomSheet'
import { Group, Row } from './ui/Group'
import { CurrencyFlag } from './ui/CurrencyFlag'
import { getCurrency, type Currency } from '../lib/currencies'
import { currencyName, currenciesByName, POPULAR_CURRENCIES, searchCurrencies } from '../lib/currencyInfo'
import { detectCurrency } from '../lib/currencyDetect'
import { useStore } from '../store/transactions'
import { useT, type Lang, type TFunc } from '../lib/i18n'
import { hapticSelect } from '../lib/telegram'

interface Props {
  open: boolean
  onClose: () => void
  /** Выбранная сейчас — с галочкой и первой в списке частых. */
  value: Currency | null
  onPick: (code: Currency) => void
  title?: string
  subtitle?: string
  /** Слой шторки: над шторкой операции (50) и быстрым стартом (80) — выше обычного. */
  z?: number
}

/**
 * Выбор валюты: поиск сверху, ниже частые и все по алфавиту.
 *
 * Валют 92, и листать их никто не станет — поэтому поле поиска стоит на месте,
 * а список под ним прокручивается. Ищется по стране («грузия»), названию
 * («лари»), коду («GEL») и символу («₾»), на обоих языках сразу: человек с
 * английским интерфейсом может искать по-русски, и наоборот. Enter выбирает
 * первую найденную — «лари» и «Готово» на клавиатуре.
 *
 * Поле не получает фокус само: клавиатура закрыла бы половину частых валют, а
 * обычно нужная как раз среди них.
 */
export function CurrencyPicker({ open, onClose, value, onPick, title, subtitle, z }: Props) {
  const t = useT()
  const lang = useStore((s) => s.lang)
  const [query, setQuery] = useState('')
  // Поиск по 92 строкам дешёвый, но перерисовка списка — нет: набор не ждёт её.
  const deferred = useDeferredValue(query)

  // Каждое открытие — с чистого поиска.
  useEffect(() => {
    if (open) setQuery('')
  }, [open])

  // Валюта по региону — вторая в частых (после выбранной), с подписью.
  const detected = useMemo(() => {
    const d = detectCurrency()
    return d.source === 'default' ? null : d.currency
  }, [])

  const top = useMemo(() => {
    const list: Currency[] = []
    const add = (c: Currency | null) => {
      if (c && !list.includes(c)) list.push(c)
    }
    add(value)
    add(detected)
    POPULAR_CURRENCIES.forEach(add)
    return list
  }, [value, detected])

  const all = useMemo(() => currenciesByName(lang), [lang])
  const results = useMemo(() => (deferred.trim() ? searchCurrencies(deferred, lang) : null), [deferred, lang])

  const pick = (code: Currency) => {
    hapticSelect()
    onPick(code)
    onClose()
  }

  const row = (code: Currency) => (
    <CurrencyRow
      key={code}
      code={code}
      lang={lang}
      t={t}
      active={code === value}
      regional={code === detected}
      onPick={pick}
    />
  )

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      layout="flex"
      height="86vh"
      z={z}
      title={title ?? t('cur.title')}
      subtitle={subtitle}
    >
      <div className="shrink-0 px-4 pb-3">
        <label className="flex items-center gap-2.5 rounded-2xl bg-surface-sunken px-3.5 py-2.5">
          <Search size={17} strokeWidth={2.2} className="shrink-0 text-ink-subtle" aria-hidden />
          <input
            type="text"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              const first = searchCurrencies(query, lang)[0]
              if (first) pick(first)
            }}
            placeholder={t('cur.search')}
            aria-label={t('cur.search')}
            className="min-w-0 flex-1 bg-transparent text-[15px] text-ink placeholder:text-ink-subtle focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={t('cur.clear')}
              className="press-icon -mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink/10 text-ink-muted"
            >
              <X size={13} strokeWidth={2.6} />
            </button>
          )}
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
        {results ? (
          results.length > 0 ? (
            <Group>{results.map(row)}</Group>
          ) : (
            <div className="px-2 pt-8 text-center">
              <div className="text-[15px] font-semibold text-ink">{t('cur.empty', { q: query.trim() })}</div>
              <div className="caption mt-1.5 leading-snug text-ink-subtle">{t('cur.empty_hint')}</div>
            </div>
          )
        ) : (
          <>
            <Group title={t('cur.popular')}>{top.map(row)}</Group>
            <Group className="mt-5" title={t('cur.all')}>
              {all.map(row)}
            </Group>
          </>
        )}
      </div>
    </BottomSheet>
  )
}

function CurrencyRow({
  code,
  lang,
  t,
  active,
  regional,
  onPick,
}: {
  code: Currency
  lang: Lang
  t: TFunc
  active: boolean
  regional: boolean
  onPick: (code: Currency) => void
}) {
  const symbol = getCurrency(code).symbol
  return (
    <Row
      lead={<CurrencyFlag code={code} size={30} className="mr-3" />}
      title={currencyName(code, lang)}
      subtitle={regional ? t('cur.region') : undefined}
      value={
        <span className="text-[13px] font-semibold text-ink-subtle">
          {symbol === code ? code : `${symbol} · ${code}`}
        </span>
      }
      trailing={
        active ? <Check size={18} strokeWidth={2.6} className="shrink-0 text-brand-500" aria-label={t('cur.selected')} /> : undefined
      }
      onClick={() => onPick(code)}
    />
  )
}
