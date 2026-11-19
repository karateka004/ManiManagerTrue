import type { ReactNode, RefObject } from 'react'
import { useSegPill } from '../ui/SegTrack'
import { hapticSelect } from '../../lib/telegram'

/**
 * Виджет Аналитики: заголовок раздела над стеклянной карточкой — как группы в
 * настройках Telegram и виджеты iOS. Справа от заголовка — свой переключатель
 * или действие (`action`). Одна карточка — один вопрос: «сколько потрачено»,
 * «на что», «когда».
 */
export function Widget({
  title,
  action,
  children,
  className = '',
  bodyClass = 'p-4',
  hero,
  delay,
  ...rest
}: {
  title?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  bodyClass?: string
  /** Главный виджет — стекло с подсветкой акцентом. */
  hero?: boolean
  /** Задержка появления, мс (каскад сверху вниз при первом показе). */
  delay?: number
  'data-tour'?: string
}) {
  return (
    // Всё, кроме героя, — content-visibility: auto (.an-lazy): виджеты за
    // экраном браузер не считает и не рисует. Без этого смена периода
    // перерисовывала все шестнадцать стеклянных карточек ленты сразу.
    <section
      className={`an-in ${hero ? 'mx-4 mt-5' : 'an-lazy px-4 pb-10 pt-5 -mb-10'} ${className}`}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {(title || action) && (
        <div className="mb-2 flex min-h-[28px] items-center justify-between gap-3 px-1.5">
          {title && <h2 className="section-title truncate">{title}</h2>}
          {action}
        </div>
      )}
      <div className={`glass ${hero ? 'glass-hero' : ''} ${bodyClass}`} data-tour={rest['data-tour']}>
        {children}
      </div>
    </section>
  )
}

/** Сегмент внутри виджета: «Расходы | Доходы», «Недели | Месяцы». Плашка едет. */
export function GlassSeg<T extends string>({
  value,
  options,
  onChange,
  label,
  full,
}: {
  value: T
  options: { id: T; label: string }[]
  onChange: (v: T) => void
  label?: string
  /** Во всю ширину карточки (переключатель внутри виджета, а не в шапке). */
  full?: boolean
}) {
  const { trackRef, pillRef } = useSegPill<HTMLDivElement>(value)
  return (
    <div ref={trackRef} className={`an-seg ${full ? 'w-full' : 'shrink-0'}`} role="group" aria-label={label} data-swipe-ignore>
      <span ref={pillRef} className="seg-pill" aria-hidden />
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={o.id === value}
          className={o.id === value ? 'seg-on' : ''}
          onClick={() => {
            if (o.id === value) return
            hapticSelect()
            onChange(o.id)
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Небольшое действие под подсказкой: «Подробнее», «Поставить лимит». */
export function ActionChip({ children, onClick, strong }: { children: ReactNode; onClick: () => void; strong?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`press-soft rounded-full px-3 py-1.5 text-[12.5px] font-bold ${
        strong ? 'bg-brand-500/[.14] text-brand-700 dark:bg-brand-500/20 dark:text-brand-200' : 'glass-btn text-ink-muted'
      }`}
    >
      {children}
    </button>
  )
}

/** Шестнадцатеричный цвет категории → «r g b» для CSS-переменных с прозрачностью. */
export function rgbTriplet(hex: string): string {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h.slice(0, 6), 16)
  if (!Number.isFinite(n)) return '111 168 220'
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
}

/** Слой подсказки графика для useScrub: линия, точка, пузырь. */
export function ScrubLayer({
  s,
}: {
  s: {
    boxRef: RefObject<HTMLDivElement>
    guideRef: RefObject<HTMLDivElement>
    dotRef: RefObject<HTMLSpanElement>
    tipRef: RefObject<HTMLDivElement>
  }
}) {
  return (
    <div ref={s.boxRef} className="an-scrub" aria-hidden>
      <div ref={s.guideRef} className="an-guide">
        <span ref={s.dotRef} className="an-dot" />
      </div>
      <div ref={s.tipRef} className="an-tip" />
    </div>
  )
}
