import { type CSSProperties, type ReactNode } from 'react'
import { hapticTap } from '../../lib/telegram'
import { ACCENT_RGB, type Accent } from './accent'
import { TileScene, type Scene } from '../rewards/TileScene'

interface Props {
  /** Векторная сцена на цветном поле — «обложка» плитки. */
  scene: Scene
  title: string
  /** Подпись под заголовком. Только ДАННЫЕ («11 дн. · рекорд 18»), не описание. */
  subtitle?: string
  /** Бейдж поверх обложки (счётчик монет, «+2», «Скоро»). */
  badge?: ReactNode
  accent?: Accent
  onClick?: () => void
  /** Неактивная плитка-заглушка: приглушённая, не кликается. */
  disabled?: boolean
}

/**
 * Бенто-плитка хаба «Прогресс»: сверху цветное поле с векторной сценой, снизу
 * подпись — как обложка альбома. Пришло на смену плоскому блоку с чип-иконкой:
 * плитки перестали быть одинаковыми прямоугольниками и стали различаться картинкой.
 *
 * Высота поля (106px) и сцены подобраны так, что низ сцены срезается краем поля —
 * фигуры выглядят стоящими на земле, а не висящими. Не менять по отдельности.
 */
export function Tile({ scene, title, subtitle, badge, accent = 'brand', onClick, disabled }: Props) {
  return (
    <button
      onClick={disabled ? undefined : () => { hapticTap(); onClick?.() }}
      disabled={disabled}
      style={{ '--tile-a': ACCENT_RGB[accent] } as CSSProperties}
      className={`relative flex min-h-[154px] w-full flex-col overflow-hidden rounded-4xl bg-surface-raised text-left shadow-soft transition dark:shadow-soft-dark ${
        disabled ? 'opacity-55' : 'active:scale-[0.98]'
      }`}
    >
      <div className="tile-art relative h-[106px] overflow-hidden">
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
 * Бейдж поверх обложки. Фон плотный (surface), а не полупрозрачный: под ним
 * может оказаться любой кусок сцены, и просвечивающая плашка сразу нечитаема.
 */
export function TileBadge({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-center gap-1 rounded-full bg-surface-raised px-2.5 py-1 text-[11px] font-extrabold text-ink shadow-soft dark:shadow-soft-dark">
      {children}
    </span>
  )
}
