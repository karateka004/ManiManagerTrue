import { useMemo } from 'react'
import { useStore, selectAllCategories } from '../../../store/transactions'
import { useCatName } from '../../../lib/i18n'
import { parseDay } from '../../../lib/day'
import { CategoryIcon } from '../../icons/CategoryIcon'
import { getCategory } from '../../../store/categories'
import { useAdventT } from '../text'

const MONTHS = {
  ru: ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
}

/**
 * Итоги года — подарок 31-го окошка: сколько записей, сколько дней с учётом,
 * рекорд серии, самая частая категория и самый активный месяц. Только счёт —
 * без сумм (как и всё в геймификации). Записей за год нет — блока нет.
 */
export function YearRecap({ year }: { year: number }) {
  const t = useAdventT()
  const lang = useStore((s) => s.lang)
  const transactions = useStore((s) => s.transactions)
  const best = useStore((s) => s.streak.best)
  const categories = useStore(selectAllCategories)
  const catName = useCatName()

  const r = useMemo(() => {
    const days = new Set<number>()
    const byCat = new Map<string, number>()
    const byMonth = new Array(12).fill(0) as number[]
    let records = 0
    for (const tx of transactions) {
      const d = parseDay(tx.date)
      if (!Number.isFinite(d)) continue
      const at = new Date(d)
      if (at.getFullYear() !== year) continue
      records++
      days.add(d)
      byMonth[at.getMonth()]++
      if (tx.type === 'expense') byCat.set(tx.categoryId, (byCat.get(tx.categoryId) ?? 0) + 1)
    }
    let top: string | null = null
    for (const [id, n] of byCat) if (!top || n > (byCat.get(top) ?? 0)) top = id
    const month = byMonth.indexOf(Math.max(...byMonth))
    return { records, days: days.size, top, month }
  }, [transactions, year])

  if (r.records === 0) return null
  const cat = r.top ? getCategory(r.top, categories) : null
  const L = lang === 'en' ? 'en' : 'ru'
  const fmt = (n: number) => n.toLocaleString(L === 'en' ? 'en-US' : 'ru-RU')

  return (
    <div className="adv-recap" data-advent-recap>
      <div className="adv-rev-kicker">{t('recap.title', { year })}</div>
      <div className="adv-recap-grid">
        <Stat n={fmt(r.records)} label={t('recap.records')} />
        <Stat n={fmt(r.days)} label={t('recap.days')} />
        <Stat n={fmt(best)} label={t('recap.best')} />
        <Stat n={MONTHS[L][r.month]} label={t('recap.month')} word />
      </div>
      {cat && r.top && (
        <div className="adv-recap-top">
          <span className="adv-recap-ico" style={{ background: cat.color + '33', color: cat.color }}>
            <CategoryIcon id={cat.icon} size={17} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-semibold text-white/55">{t('recap.top')}</span>
            <span className="block truncate text-[14px] font-bold text-white">{catName(r.top, cat.name)}</span>
          </span>
        </div>
      )}
    </div>
  )
}

function Stat({ n, label, word }: { n: string; label: string; word?: boolean }) {
  return (
    <div className="adv-recap-stat">
      <span className={`adv-recap-n ${word ? 'is-word' : ''}`}>{n}</span>
      <span className="adv-recap-l">{label}</span>
    </div>
  )
}
