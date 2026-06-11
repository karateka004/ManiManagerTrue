import { type ReactNode } from 'react'
import { AnimatePresence, m } from 'framer-motion'

interface Props {
  open: boolean
  onClose: () => void
  children: ReactNode
  /** Доп. классы для листа (например, иной max-h или фон). */
  className?: string
}

/**
 * Общая нижняя шторка: затемнение + выезжающий снизу лист с «ручкой».
 * Заменяет дублированную разметку оверлея в Roadpass/Leaderboard/Planning и др.
 *
 * Только `m.*` (LazyMotion strict). Шторка появляется в ответ на действие
 * пользователя, поэтому rAF активен и framer-анимация уместна (в отличие от
 * появления вкладок/секций — там используем CSS `.tab-enter`).
 */
export function BottomSheet({ open, onClose, children, className = '' }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[70] bg-black/30 backdrop-blur-sm"
          />
          <m.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
            className={`fixed inset-x-0 bottom-0 z-[80] max-h-[94vh] overflow-y-auto rounded-t-5xl bg-surface-raised shadow-raised ${className}`}
            style={{ paddingBottom: 'calc(var(--safe-bottom, 0px) + 16px)' }}
          >
            <div className="flex justify-center pb-1 pt-3">
              <div className="h-1.5 w-12 rounded-full bg-surface-sunken" />
            </div>
            {children}
          </m.div>
        </>
      )}
    </AnimatePresence>
  )
}
