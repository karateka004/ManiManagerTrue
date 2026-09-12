import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { BottomSheet } from './ui/BottomSheet'
import { CategoryIcon } from './icons/CategoryIcon'
import { useStore, selectAllCategories, type Transaction } from '../store/transactions'
import { categoryName } from '../lib/categoryNames'
import { useT } from '../lib/i18n'
import { formatMoney, dayjs } from '../lib/format'
import { hapticSelect } from '../lib/telegram'

interface Props {
  open: boolean
  onClose: () => void
  /** Открыть операцию на правку (шторка операции живёт в App). */
  onEditTx: (t: Transaction) => void
}

/** Сколько результатов показываем: длиннее список всё равно не просматривают. */
const MAX_RESULTS = 100

/**
 * Поиск по всем операциям.
 *
 * Ищет НЕ по выбранному периоду, а по всей истории: смысл поиска именно в том,
 * чтобы найти платёж, который не получается отыскать листанием — а листание уже
 * ограничено периодом и категорией.
 *
 * Совпадение ищется по одной строке-«стогу» на операцию: заметка, теги, название
 * категории и сумма. Поэтому «1250», «кафе» и «#отпуск» работают одинаково, без
 * отдельных правил на каждый случай. Стог пересобирается только при изменении
 * операций, категорий или языка — набор запроса его не трогает.
 */
export function SearchSheet({ open, onClose, onEditTx }: Props) {
  const transactions = useStore((s) => s.transactions)
  const categories = useStore(selectAllCategories)
  const lang = useStore((s) => s.lang)
  const globalCurrency = useStore((s) => s.currency)
  const track = useStore((s) => s.track)
  const t = useT()

  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Открыли — очищаем прошлый запрос и ставим фокус в поле.
  useEffect(() => {
    if (!open) return
    setQuery('')
    const id = setTimeout(() => inputRef.current?.focus(), 350)
    return () => clearTimeout(id)
  }, [open])

  const byId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])

  const index = useMemo(() => {
    if (!open) return []
    return transactions.map((tx) => {
      const cat = byId.get(tx.categoryId)
      const name = cat ? categoryName(lang, cat.id, cat.name) : ''
      const parts = [tx.note ?? '', (tx.tags ?? []).join(' '), name, String(tx.amount)]
      return { tx, cat, hay: parts.join(' ').toLowerCase() }
    })
  }, [open, transactions, byId, lang])

  const q = query.trim().toLowerCase()

  // Задание «найди операцию» засчитываем за настоящий поиск, а не за открытие
  // шторки: иначе оно выполнялось бы случайным тапом и ничему не учило.
  const searched = useRef(false)
  useEffect(() => {
    if (!open) { searched.current = false; return }
    if (searched.current || q.length < 2) return
    searched.current = true
    track('use_search')
  }, [open, q, track])
  const results = useMemo(() => {
    if (q.length === 0) return []
    return index
      .filter((row) => row.hay.includes(q))
      .sort((a, b) => (a.tx.date < b.tx.date ? 1 : -1))
      .slice(0, MAX_RESULTS)
  }, [index, q])

  const total = useMemo(() => (q.length === 0 ? 0 : index.filter((row) => row.hay.includes(q)).length), [index, q])

  return (
    <BottomSheet open={open} onClose={onClose} className="min-h-[80vh]">
      {/* Поле поиска липнет к верху: список длинный, а поле должно оставаться под рукой. */}
      <div className="sticky top-0 z-10 bg-surface-raised px-5 pb-3 pt-1">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              size={16}
              strokeWidth={2.4}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-subtle"
            />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('search.placeholder')}
              className="w-full rounded-2xl bg-surface-sunken py-3 pl-10 pr-9 text-sm text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-brand-400"
              maxLength={40}
            />
            {query.length > 0 && (
              <button
                onClick={() => { setQuery(''); inputRef.current?.focus() }}
                aria-label={t('common.clear')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-ink-subtle active:bg-surface-sunken"
              >
                <X size={15} strokeWidth={2.4} />
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-sm font-medium text-ink-subtle active:text-ink-muted"
          >
            {t('common.cancel')}
          </button>
        </div>

        {q.length > 0 && (
          <div className="mt-2 text-[11px] font-semibold text-ink-subtle">
            {t('search.found', { n: total })}
            {total > MAX_RESULTS ? ` · ${t('search.capped', { n: MAX_RESULTS })}` : ''}
          </div>
        )}
      </div>

      <div className="px-5 pb-2">
        {q.length === 0 ? (
          <div className="px-2 py-10 text-center text-sm text-ink-subtle">{t('search.hint')}</div>
        ) : results.length === 0 ? (
          <div className="px-2 py-10 text-center text-sm text-ink-subtle">{t('search.empty')}</div>
        ) : (
          <div className="space-y-1">
            {results.map(({ tx, cat }) => (
              <button
                key={tx.id}
                onClick={() => { hapticSelect(); onEditTx(tx); onClose() }}
                className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left active:bg-surface-sunken"
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: (cat?.color ?? '#A8A8A8') + '22', color: cat?.color ?? '#A8A8A8' }}
                >
                  <CategoryIcon id={cat?.icon ?? 'other'} size={18} />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">
                    {tx.note || (cat ? categoryName(lang, cat.id, cat.name) : '—')}
                  </span>
                  <span className="block truncate text-[11px] text-ink-subtle">
                    {cat && tx.note ? `${categoryName(lang, cat.id, cat.name)} · ` : ''}
                    {dayjs(tx.date).format('D MMM YYYY')}
                  </span>
                </span>

                <span
                  className={`shrink-0 tabular text-sm font-bold ${
                    tx.type === 'income' ? 'text-income-deep' : 'text-expense-deep'
                  }`}
                >
                  {tx.type === 'income' ? '+' : '−'}{' '}
                  {formatMoney(tx.amount, tx.currency ?? globalCurrency).replace('−', '')}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </BottomSheet>
  )
}
