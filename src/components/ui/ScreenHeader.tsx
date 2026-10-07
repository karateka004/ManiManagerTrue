import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { hapticTap } from '../../lib/telegram'
import { useT } from '../../lib/i18n'

/**
 * Шапка вложенного экрана: «назад», надстрочник и заголовок, справа — значение.
 *
 * Одна на Настройки, Магазин и Титулы уровня: раньше у каждого экрана была своя
 * копия с квадратной полупрозрачной кнопкой «назад», и они понемногу расходились
 * в отступах. Кнопка — тот же круг, что у поиска и ассистента на Главной.
 */
export function ScreenHeader({
  kicker,
  title,
  onBack,
  trailing,
}: {
  kicker: string
  title: string
  onBack?: () => void
  trailing?: ReactNode
}) {
  const t = useT()
  return (
    <div className="flex items-center gap-3 px-4 pb-1 pt-6">
      {onBack && (
        <button
          onClick={() => { hapticTap(); onBack() }}
          aria-label={t('common.back')}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-raised text-ink-muted shadow-soft transition-transform active:scale-95"
        >
          <ChevronLeft size={20} strokeWidth={2.4} />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <div className="kicker">{kicker}</div>
        <div className="mt-0.5 truncate text-2xl font-bold tracking-tight text-ink">{title}</div>
      </div>
      {trailing}
    </div>
  )
}
