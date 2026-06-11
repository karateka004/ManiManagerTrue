import { useEffect, type ReactNode } from 'react'
import { useStore, selectAccounts } from '../store/transactions'
import { getCurrency, type Currency } from '../lib/currencies'
import { hapticSelect } from '../lib/telegram'
import { useT } from '../lib/i18n'

/**
 * Переключатель «счёта» = валюты. Каждая валюта в данных — отдельный счёт.
 * «Все» (account === null) показывает сводный вид (суммы по валютам
 * складываются как есть). Выбор конкретного счёта делает суммы корректными
 * (без смешивания валют). Состояние общее (`store.account`) для Главной и
 * Аналитики — пользователь смотрит «один счёт» во всём приложении.
 * Прячется, если валюта одна — переключать нечего.
 */
export function AccountSwitcher() {
  const accounts = useStore(selectAccounts)
  const account = useStore((s) => s.account)
  const setAccount = useStore((s) => s.setAccount)
  const t = useT()

  // Если выбранный счёт исчез из данных (удалили операции) — сбрасываем на «Все».
  useEffect(() => {
    if (account && !accounts.includes(account)) setAccount(null)
  }, [account, accounts, setAccount])

  if (accounts.length < 2) return null

  const pick = (c: Currency | null) => { hapticSelect(); setAccount(c) }

  return (
    <div className="mx-6 mb-1 mt-1 flex flex-wrap gap-1.5">
      <Chip active={account === null} onClick={() => pick(null)}>{t('account.all')}</Chip>
      {accounts.map((c) => (
        <Chip key={c} active={account === c} onClick={() => pick(c)}>
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
