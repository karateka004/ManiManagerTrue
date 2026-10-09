import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import {
  AnimatePresence,
  animate,
  m,
  useDragControls,
  useMotionValue,
  useTransform,
  type MotionStyle,
} from 'framer-motion'
import { X } from 'lucide-react'
import clsx from 'clsx'
import { hapticSelect, lockVerticalSwipes } from '../../lib/telegram'
import { useT } from '../../lib/i18n'
import { useBackButton } from '../../lib/useBackButton'

interface Props {
  open: boolean
  onClose: () => void
  children: ReactNode
  /** Доп. классы листа (фон, высота). */
  className?: string
  /**
   * 'scroll' — прокручивается весь лист (по умолчанию);
   * 'flex' — лист колонкой, прокрутку держит сам контент (шапка и вкладки стоят).
   */
  layout?: 'scroll' | 'flex'
  /** Слой: затемнение на z, лист на z+1. Шторка операции — 50, редактор категорий — 60. */
  z?: number
  /** Потолок высоты листа. */
  maxHeight?: string
  /** Фиксированная высота (чат ассистента). */
  height?: string
  /** Заголовок: если задан, шапка со «×» рисуется сама. */
  title?: ReactNode
  subtitle?: ReactNode
  /** Нижний отступ под контентом, px (поверх safe-area); null — без отступа
      (у шторки своя нижняя панель, которая сама учитывает safe-area). */
  padBottom?: number | null
}

/** Пружина выезда: быстро и почти без перелёта — лист «встаёт», а не болтается. */
const OPEN = { type: 'spring', stiffness: 420, damping: 40, mass: 0.9 } as const
/** Уход — короче и с разгоном: закрытие не должно задерживать человека. */
const CLOSE = { duration: 0.24, ease: [0.4, 0, 1, 1] } as const

/** Сдвиг, после которого отпущенный лист закрывается, px. */
const CLOSE_OFFSET = 110
/** …или скорость броска вниз, px/с. */
const CLOSE_VELOCITY = 650

const DragCtx = createContext<((e: ReactPointerEvent) => void) | null>(null)

/**
 * Начать перетаскивание листа с этого элемента — для собственных шапок
 * шторок (`onPointerDown={useSheetDrag()}`). Вне шторки — undefined.
 */
export function useSheetDrag(): ((e: ReactPointerEvent) => void) | undefined {
  return useContext(DragCtx) ?? undefined
}

/**
 * Общая нижняя шторка: затемнение + лист снизу с «ручкой».
 *
 * 2.1: одна на всё приложение (раньше у восьми шторок была своя копия
 * разметки и свои кривые), выезжает на пружине и закрывается свайпом вниз —
 * за ручку или за шапку. Затемнение светлеет вслед за пальцем, так что видно,
 * что шторка вот-вот закроется. Тянуть можно только за верх: за содержимым
 * остаётся обычная прокрутка.
 *
 * Только `m.*` (LazyMotion strict). Шторка открывается действием человека —
 * rAF в этот момент работает, и framer здесь уместен (в отличие от появления
 * вкладок и данных — там CSS).
 */
export function BottomSheet({
  open,
  onClose,
  children,
  className,
  layout = 'scroll',
  z = 40,
  maxHeight = '94vh',
  height,
  title,
  subtitle,
  padBottom = 16,
}: Props) {
  const controls = useDragControls()
  const dragY = useMotionValue(0)
  // Затемнение уходит вслед за листом: к 360 px сдвига — почти прозрачное.
  const shade = useTransform(dragY, [0, 360], [1, 0.1])

  // Системная «Назад» Telegram закрывает верхнюю шторку.
  useBackButton(open, onClose)

  // Новое открытие начинается с несдвинутого листа (после закрытия свайпом
  // сдвиг остался бы в motion value). До отрисовки — без прыжка в первом кадре.
  useLayoutEffect(() => {
    if (open) dragY.set(0)
  }, [open, dragY])

  // Пока шторка открыта, вертикальный свайп Telegram (сворачивание мини-аппа)
  // выключен: иначе жест «закрыть шторку» сворачивал бы всё приложение.
  useEffect(() => {
    if (!open) return
    const unlock = lockVerticalSwipes()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      unlock()
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  const startDrag = (e: ReactPointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    controls.start(e)
  }

  const sheetStyle: MotionStyle = {
    y: dragY,
    maxHeight,
    height,
    paddingBottom: padBottom === null ? undefined : `calc(var(--safe-bottom, 0px) + ${padBottom}px)`,
  }

  return (
    <AnimatePresence>
      {open && (
        <m.div
          key="shade"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          className="fixed inset-0"
          style={{ zIndex: z }}
        >
          {/* Без backdrop-blur: прозрачность затемнения идёт за пальцем, и
              размытие всего экрана пересчитывалось бы на каждом кадре —
              на Android это рывки. */}
          <m.div onClick={onClose} style={{ opacity: shade }} className="absolute inset-0 bg-black/40" />
        </m.div>
      )}
      {open && (
        <m.div
          key="sheet"
          initial={{ y: '100%' }}
          animate={{ y: 0, transition: OPEN }}
          exit={{ y: '100%', transition: CLOSE }}
          className="fixed inset-x-0 bottom-0"
          style={{ zIndex: z + 1 }}
        >
          <m.div
            role="dialog"
            aria-modal="true"
            drag="y"
            dragListener={false}
            dragControls={controls}
            dragConstraints={{ top: 0 }}
            dragElastic={{ top: 0 }}
            dragMomentum={false}
            onDragEnd={(_, info) => {
              if (info.offset.y > CLOSE_OFFSET || info.velocity.y > CLOSE_VELOCITY) {
                hapticSelect()
                onClose()
              } else {
                animate(dragY, 0, { type: 'spring', stiffness: 520, damping: 42 })
              }
            }}
            style={sheetStyle}
            className={clsx(
              'mx-auto w-full max-w-xl rounded-t-5xl bg-surface-raised shadow-raised dark:shadow-raised-dark',
              layout === 'flex' ? 'flex flex-col' : 'overflow-y-auto overscroll-contain',
              className,
            )}
          >
            {/* Ручка — зона захвата во всю ширину и повыше самой полоски. */}
            <div onPointerDown={startDrag} className="flex shrink-0 cursor-grab touch-none justify-center pb-2 pt-3">
              <div className="h-[5px] w-10 rounded-full bg-ink/15" />
            </div>
            <DragCtx.Provider value={startDrag}>
              {title !== undefined && <SheetHeader title={title} subtitle={subtitle} onClose={onClose} />}
              {children}
            </DragCtx.Provider>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  )
}

/** Своя шапка шторки, за которую можно тянуть лист (шторка операции). */
export function SheetDragZone({ className, children }: { className?: string; children: ReactNode }) {
  const startDrag = useSheetDrag()
  return (
    <div onPointerDown={startDrag} className={clsx('touch-none', className)}>
      {children}
    </div>
  )
}

/**
 * Шапка шторки: заголовок 17 px + круглая серая «×». За шапку тоже можно
 * тянуть лист вниз. `trailing` — своё действие вместо «×» (например, «Отмена»).
 */
export function SheetHeader({
  title,
  subtitle,
  onClose,
  trailing,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  onClose?: () => void
  trailing?: ReactNode
  className?: string
}) {
  const t = useT()
  const startDrag = useSheetDrag()
  return (
    <div
      onPointerDown={startDrag}
      className={clsx('flex shrink-0 touch-none items-center justify-between gap-3 px-5 pb-3 pt-0.5', className)}
    >
      <div className="min-w-0 leading-tight">
        <div className="truncate text-[17px] font-extrabold text-ink">{title}</div>
        {subtitle && <div className="caption mt-0.5 truncate text-ink-subtle">{subtitle}</div>}
      </div>
      {trailing ??
        (onClose && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onClose}
            aria-label={t('common.close')}
            className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-ink-muted"
          >
            <X size={18} strokeWidth={2.4} />
          </button>
        ))}
    </div>
  )
}
