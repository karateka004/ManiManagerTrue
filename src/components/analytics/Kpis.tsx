import { memo, type ComponentType, type ReactNode } from 'react'
import { CalendarCheck, PiggyBank, Receipt, Sun, type LucideProps } from 'lucide-react'
import { useStore } from '../../store/transactions'
import { selectOverview } from '../../store/analytics'
import { formatMoney } from '../../lib/format'
import { daysWord } from '../../lib/i18n'
import { MASK } from '../../lib/clarity'
import { useAnT } from './text'

/**
 * Четыре маленьких виджета, как обзор в статистике Telegram: средний день,
 * сбережения, покупки и дни без трат. Каждый — одно число и одна строка
 * пояснения; цвет пояснения — только когда есть с чем сравнить.
 */
export const KpiGrid = memo(function KpiGrid() {
  const o = useStore(selectOverview)
  const lang = useStore((s) => s.lang)
  const t = useAnT()
  const money = (v: number) => formatMoney(Math.round(v), o.currency)

  const usual = o.usualPerDay
  const dayTone = usual && o.daysTracked > 0 ? (o.perDay > usual * 1.1 ? 'bad' : o.perDay < usual * 0.9 ? 'good' : undefined) : undefined
  const rate = o.income > 0 ? Math.round(((o.income - o.spent) / o.income) * 100) : null
  // Месяц идёт, а доход пришёл не весь (аванс есть, зарплата 25-го впереди):
  // минус тут — не перерасход, а календарь. Красить и пугать нечем.
  const incomeDue = !o.complete && o.prevIncome !== null && o.prevIncome > 0 && o.income < o.prevIncome * 0.9

  return (
    <div className="an-in mx-4 mt-3 grid grid-cols-2 gap-3" style={{ animationDelay: '60ms' }}>
      <Tile icon={Sun} label={t('kpi.day')} value={money(o.perDay)} sub={usual ? t('kpi.day_usual', { amount: money(usual) }) : undefined} tone={dayTone} />
      <Tile
        icon={PiggyBank}
        label={t('kpi.savings')}
        value={rate === null ? '—' : `${rate < 0 ? '−' : ''}${Math.abs(rate)}%`}
        sub={
          rate === null
            ? t('kpi.no_income')
            : rate < 0 && incomeDue
              ? t('kpi.income_due')
              : rate >= 0
                ? t('kpi.saved', { amount: money(o.income - o.spent) })
                : t('kpi.over', { amount: money(o.spent - o.income) })
        }
        tone={rate === null || incomeDue ? undefined : rate >= 10 ? 'good' : rate < 0 ? 'bad' : undefined}
      />
      <Tile
        icon={Receipt}
        label={t('kpi.count')}
        value={String(o.expenseCount)}
        sub={o.expenseCount > 0 ? t('kpi.check', { amount: money(o.avgCheck) }) : undefined}
      />
      <Tile
        icon={CalendarCheck}
        label={t('kpi.free')}
        value={`${o.noSpendDays} ${daysWord(lang, o.noSpendDays)}`}
        sub={
          o.noSpendStreak >= 2
            ? t('kpi.free_streak', { n: o.noSpendStreak })
            : o.daysTracked > 0
              ? t('kpi.free_of', { n: o.daysTracked, days: daysWord(lang, o.daysTracked) })
              : undefined
        }
        tone={o.noSpendStreak >= 2 ? 'good' : undefined}
      />
    </div>
  )
})

function Tile({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: ComponentType<LucideProps>
  label: string
  value: ReactNode
  sub?: string
  tone?: 'good' | 'bad'
}) {
  return (
    <div className="glass min-w-0 px-4 pb-3.5 pt-3">
      <div className="flex items-center gap-1.5 text-ink-subtle">
        <Icon size={14} strokeWidth={2.4} aria-hidden />
        <span className="caption-sm truncate">{label}</span>
      </div>
      <div className="mt-1.5 truncate text-[21px] font-extrabold leading-tight tracking-tight tabular text-ink max-[359px]:text-[18px]" {...MASK}>
        {value}
      </div>
      {sub && (
        <div
          className={`mt-0.5 line-clamp-2 text-[12px] font-semibold leading-snug ${
            tone === 'good' ? 'text-income-deep dark:text-income-light' : tone === 'bad' ? 'text-expense-deep dark:text-expense' : 'text-ink-subtle'
          }`}
          {...MASK}
        >
          {sub}
        </div>
      )}
    </div>
  )
}
