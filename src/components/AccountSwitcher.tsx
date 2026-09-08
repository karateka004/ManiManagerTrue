import { useEffect, type ReactNode } from 'react'
import { useStore, selectAccounts } from '../store/transactions'
import { getCurrency, type Currency } from '../lib/currencies'
import { hapticSelect } from '../lib/telegram'

/**
 * Переключатель «счёта» = валюты. Каждая валюта в данных — отдельный счёт.
 *
 * Сводного вида «Все» здесь нет намеренно: складывать гривны с евро нечем —
 * курсов в приложении не хранится, а одна цифра под разными значками врёт.
 * Поэтому в каждый момент показывается ровно одна валюта; невыбранное
 * состояние (account === null) означает основную валюту из настроек.
 *
 * Состояние общее (`store.account`) для Главной и Аналитики — пользователь
 * смотрит «один счёт» во всём приложении. Прячется, если валюта одна.
 */
export function AccountSwitcher() {
  const accounts = useStore(selectAccounts)
  const account = useStore((s) => s.account)
  const currency = useStore((s) => s.currency)
  const setAccount = useStore((s) => s.setAccount)

  useEffect(() => {
    // Выбранный счёт исчез из данных (удалили операции) — возвращаемся к основной валюте.
    if (account && !accounts.includes(account)) {
      setAccount(null)
      return
    }
    // Валют стало больше одной, а счёт не выбран — проставляем явно, иначе
    // чип показывал бы одну валюту, а карточка баланса — сразу все.
    if (!account && accounts.length > 1) {
      setAccount(accounts.includes(currency) ? currency : accounts[0])
    }
  }, [account, accounts, currency, setAccount])

  if (accounts.length < 2) return null

  // Невыбранное состояние показываем как основную валюту — она и считается.
  const shown = account ?? currency

  return (
    <div className="mx-6 mb-1 mt-1 flex flex-wrap gap-1.5">
      {accounts.map((c) => (
        <Chip key={c} active={shown === c} onClick={() => { hapticSelect(); setAccount(c) }}>
          {getCurrency(c).symbol} {c}
        </Chip>
      ))}
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
        active ? 'bg-brand-500 text-white' : 'bg-surface-sunken text-ink-muted'
      }`}
    >
      {children}
    </button>
  )
}
