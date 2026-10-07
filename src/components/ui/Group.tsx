import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import clsx from 'clsx'

/**
 * Сгруппированный список — основной строительный блок 2.0.
 *
 * Заменил две вещи сразу: бенто-плитки (Tile) и отдельные карточки-строки
 * (MenuRow). И у тех, и у других каждая строчка была своей коробкой с тенью —
 * экран превращался в стопку одинаковых карточек, и глазу было не за что
 * зацепиться. Здесь строки живут в одной группе с тонкими разделителями, а
 * вес держат данные справа.
 *
 *   <Group title="Задания">
 *     <Row title="Первая операция" subtitle="+30 XP · 10 монет" value="0/1" />
 *     <Row title="Магазин" value="120 монет" chevron onClick={…} />
 *   </Group>
 */
export function Group({
  title,
  action,
  footer,
  children,
  className,
}: {
  /** Заголовок над группой (.section-title). */
  title?: ReactNode
  /** Тихое действие справа от заголовка: «Все», «ещё 16». */
  action?: ReactNode
  /** Подпись под группой — пояснение, а не данные. */
  footer?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={className}>
      {(title || action) && (
        <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
          {title && <h2 className="section-title">{title}</h2>}
          {action && <div className="caption shrink-0 text-ink-subtle">{action}</div>}
        </div>
      )}
      <div className="card grouped overflow-hidden">{children}</div>
      {footer && <p className="caption mt-2 px-1 text-ink-subtle">{footer}</p>}
    </section>
  )
}

/**
 * Строка группы.
 *
 * Иконка — простая линейная, цвета подписи. Цветной квадратик с иконкой
 * положен только категориям: там цвет — информация (по нему категорию узнают на
 * диаграмме). У служебной строки цветной квадрат ничего не сообщает и только
 * добавляет пятно — так и выглядел «нейрослоп».
 */
export function Row({
  icon,
  lead,
  title,
  subtitle,
  wrap,
  value,
  valueSub,
  trailing,
  chevron,
  onClick,
  disabled,
  children,
  className,
}: {
  /** Линейная иконка слева (16–20 px). Красится в text-ink-subtle. */
  icon?: ReactNode
  /** Произвольный элемент слева вместо иконки (аватар, цветной значок категории). */
  lead?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  /** Подпись переносится, а не режется многоточием — для пояснений у
      переключателей, где обрезанная фраза теряет смысл. */
  wrap?: boolean
  /** Значение справа: число, статус. */
  value?: ReactNode
  /** Подпись под значением. */
  valueSub?: ReactNode
  /** Свой элемент справа — кнопка «Забрать», переключатель. */
  trailing?: ReactNode
  chevron?: boolean
  onClick?: () => void
  disabled?: boolean
  /** Содержимое под строкой внутри её колонки — полоса прогресса, точки серии. */
  children?: ReactNode
  className?: string
}) {
  const body = (
    <>
      {lead ?? (icon && <span className="mr-3 flex w-5 shrink-0 justify-center text-ink-subtle">{icon}</span>)}
      <span className="row-main">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold leading-snug text-ink">{title}</span>
          {subtitle && (
            <span className={clsx('caption mt-0.5 block text-ink-subtle', wrap ? 'leading-snug' : 'truncate')}>{subtitle}</span>
          )}
          {children}
        </span>
        {(value !== undefined || valueSub) && (
          <span className="shrink-0 text-right">
            {value !== undefined && (
              <span className="block text-[15px] font-semibold tabular-nums text-ink">{value}</span>
            )}
            {valueSub && <span className="caption-sm mt-0.5 block text-ink-subtle">{valueSub}</span>}
          </span>
        )}
        {trailing}
        {chevron && <ChevronRight size={18} strokeWidth={2.2} className="-mr-1 shrink-0 text-ink-subtle" />}
      </span>
    </>
  )

  if (onClick) {
    return (
      <button type="button" onClick={onClick} disabled={disabled} className={clsx('row', className)}>
        {body}
      </button>
    )
  }
  return <div className={clsx('row', className)}>{body}</div>
}
