import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'

/** Сколько едет высота (совпадает с transition у .reveal в styles/motion.css). */
const DURATION = 360

/**
 * Плавное раскрытие блока по высоте.
 *
 * Высота едет через grid-template-rows 0fr → 1fr (.reveal): без измерений в JS
 * и без framer. Содержимое монтируется при открытии и размонтируется после
 * того, как блок схлопнулся, — так раскрытая строка со своим селектором не
 * считает ничего, пока закрыта.
 *
 * Открытие ставится в layout-эффекте после принудительного пересчёта стилей:
 * браузер видит закрытое состояние и анимирует переход к открытому. Не
 * отыграл переход — блок всё равно открыт (атрибут уже стоит).
 */
export function Reveal({ open, children, className }: { open: boolean; children: ReactNode; className?: string }) {
  const [mounted, setMounted] = useState(open)
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (open) {
      if (!mounted) {
        setMounted(true)
        return
      }
      if (el && el.dataset.open !== 'true') {
        void el.offsetHeight
        el.dataset.open = 'true'
      }
      return
    }
    if (!el) return
    el.dataset.open = 'false'
    const t = setTimeout(() => setMounted(false), DURATION)
    return () => clearTimeout(t)
  }, [open, mounted])

  if (!mounted) return null
  return (
    <div ref={ref} className={clsx('reveal', className)}>
      <div>{children}</div>
    </div>
  )
}
