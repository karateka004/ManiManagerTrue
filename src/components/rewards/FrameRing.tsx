import type { CSSProperties, ReactNode } from 'react'
import clsx from 'clsx'
import { getReward } from '../../lib/rewards'

/** Меньше этого размера рамка не анимируется: движение не разглядеть. */
export const FRAME_ANIM_MIN = 56

/** Есть ли у рамки видимое кольцо («Без рамки» — нет). */
export function hasFrameRing(frameId: string | null | undefined): boolean {
  const f = getReward(frameId)?.frame
  return !!f && f.ring !== 'transparent'
}

/**
 * Кольцо «Недели»: семь делений по кругу, закрашены дни серии (сегодня —
 * последнее перед верхом). Без данных о днях (чужой аватар в рейтинге) —
 * все деления закрашены.
 */
function weekRing(week: boolean[] | undefined): string {
  const step = 360 / 7
  const gap = 2.6
  const on = 'rgb(var(--brand-500))'
  const off = 'rgb(var(--c-ink) / 0.14)'
  const parts: string[] = []
  for (let i = 0; i < 7; i++) {
    const a = i * step + gap
    const b = (i + 1) * step - gap
    const c = !week || week[i] ? on : off
    parts.push(`transparent ${(i * step).toFixed(2)}deg ${a.toFixed(2)}deg`, `${c} ${a.toFixed(2)}deg ${b.toFixed(2)}deg`)
    parts.push(`transparent ${b.toFixed(2)}deg ${((i + 1) * step).toFixed(2)}deg`)
  }
  return `conic-gradient(${parts.join(', ')})`
}

/**
 * Рамка вокруг аватара — одна на всё приложение: шапка Главной, Профиль,
 * рейтинг, Магазин. Раньше кольцо рисовали в трёх местах по-своему, и
 * анимированную рамку пришлось бы повторять трижды.
 *
 * Кольцо — псевдоэлемент (styles/skins.css): вращается или дышит он, а не
 * фото внутри. Содержимое (фото, инициал) растягивается на внутренний круг.
 */
export function FrameRing({
  frameId,
  size,
  week,
  animate,
  className,
  children,
}: {
  frameId: string | null | undefined
  size: number
  /** Дни серии за неделю — для рамки «Неделя». */
  week?: boolean[]
  /** Анимировать особую рамку; по умолчанию — от FRAME_ANIM_MIN. */
  animate?: boolean
  className?: string
  children: ReactNode
}) {
  const frame = getReward(frameId)?.frame
  if (!frame || frame.ring === 'transparent') {
    return (
      <div className={clsx('shrink-0', className)} style={{ width: size, height: size }}>
        {children}
      </div>
    )
  }
  const ringW = Math.max(2, Math.round(size * 0.07))
  const live = (animate ?? size >= FRAME_ANIM_MIN) && frame.anim && frame.anim !== 'week'
  const ring = frame.anim === 'week' ? weekRing(week) : frame.ring
  return (
    <div
      className={clsx('frame-ring flex shrink-0 items-center justify-center', live && `frame-anim-${frame.anim}`, className)}
      style={{ width: size, height: size, padding: ringW, boxShadow: frame.glow, '--ring': ring } as CSSProperties}
    >
      {children}
    </div>
  )
}
