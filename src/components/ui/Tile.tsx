import { type CSSProperties, type ReactNode } from 'react'
import { hapticTap } from '../../lib/telegram'
import { TileScene, type Scene } from '../rewards/TileScene'

export type TileAccent = 'brand' | 'amber' | 'sky' | 'orange' | 'violet'

/**
 * RGB-триплеты для SVG-обложек: плитка кладёт их в `--tile-a`, а сцена
 * красится через `rgb(var(--tile-a) / …)`. `brand` ссылается на переменную
 * темы — такая обложка следует за купленной палитрой.
 */
export const TILE_RGB: Record<TileAccent, string> = {
  brand: 'var(--brand-500)',
  amber: '245 158 11',
  sky: '56 189 248',
  orange: '249 115 22',
  violet: '139 92 246',
}

interface Props {
  /** Векторная сцена на цветном поле — «обложка» плитки. */
  scene: Scene
  title: string
  /** Подпись под заголовком. Только ДАННЫЕ («14-е из 88»), не описание. */
  subtitle?: ReactNode
  /** Бейдж поверх обложки (монеты, «+2»). */
  badge?: ReactNode
  accent?: TileAccent
  onClick?: () => void
}

/**
 * Плитка хаба «Прогресс»: сверху цветное поле с живой сценой, снизу заголовок и
 * данные. Вернулись в 2.1 по просьбе: строки 2.0 оказались слишком сухими.
 *
 * Высота поля (106px) и сцены подобраны так, что низ сцены срезается краем
 * поля — фигуры стоят на земле, а не висят. Не менять по отдельности.
 */
export function Tile({ scene, title, subtitle, badge, accent = 'brand', onClick }: Props) {
  return (
    <button
      type="button"
      onClick={() => {
        hapticTap()
        onClick?.()
      }}
      style={{ '--tile-a': TILE_RGB[accent] } as CSSProperties}
      className="press-soft relative flex min-h-[154px] w-full flex-col overflow-hidden rounded-4xl bg-surface-raised text-left shadow-soft"
    >
      <div className="tile-art relative h-[106px] w-full overflow-hidden">
        <TileScene scene={scene} />
        {badge && <div className="absolute right-2.5 top-2.5">{badge}</div>}
      </div>
      <div className="px-4 pb-4 pt-3">
        <div className="text-[16px] font-bold leading-tight text-ink">{title}</div>
        {subtitle && <div className="mt-1 text-[12px] leading-snug text-ink-subtle">{subtitle}</div>}
      </div>
    </button>
  )
}

/**
 * Бейдж поверх обложки. Фон плотный, а не полупрозрачный: под ним может
 * оказаться любой кусок сцены, и просвечивающая плашка сразу нечитаема.
 */
export function TileBadge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`flex items-center gap-1 rounded-full bg-surface-raised px-2.5 py-1 text-[11px] font-extrabold tabular-nums text-ink shadow-soft ${className ?? ''}`}
    >
      {children}
    </span>
  )
}
