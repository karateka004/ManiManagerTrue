import { useMemo } from 'react'
import { useStore } from '../store/transactions'
import { tg } from '../lib/telegram'
import { useT } from '../lib/i18n'
import { streakWeek } from '../lib/streak'
import { User } from 'lucide-react'
import { FrameRing, hasFrameRing } from './rewards/FrameRing'

/**
 * Аватар пользователя Telegram: фото или инициалы + надетая рамка.
 *
 * `frameId` — показать другую рамку (примерка в Магазине); по умолчанию —
 * надетая. Рамка «Неделя» закрашивает дни текущей серии.
 */
export function Avatar({
  size = 40,
  onClick,
  frameId,
}: {
  size?: number
  onClick?: () => void
  frameId?: string
}) {
  const t = useT()
  const user = tg.user
  // Без имени (вне Telegram) — силуэт, а не эмодзи: эмодзи рисует шрифт системы,
  // на каждом телефоне он свой и среди линейных иконок выглядит чужим.
  const initials = user?.first_name?.[0]?.toUpperCase() ?? null
  const photo = user?.photo_url
  const equippedFrame = useStore((s) => s.equipped.frame)
  const frame = frameId ?? equippedFrame
  const streak = useStore((s) => s.streak)
  const week = useMemo(() => (frame === 'frame_week' ? streakWeek(streak) : undefined), [frame, streak])
  const framed = hasFrameRing(frame)

  return (
    <FrameRing frameId={frame} size={size} week={week}>
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className={`press-icon flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-surface-sunken text-ink-muted ${
          framed ? '' : 'shadow-soft'
        }`}
        style={{ fontSize: Math.round(size * 0.38) }}
        aria-label={t('nav.profile')}
      >
        {photo ? (
          <img src={photo} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
        ) : initials ? (
          <span className="font-bold">{initials}</span>
        ) : (
          <User size={Math.round(size * 0.46)} strokeWidth={2} aria-hidden />
        )}
      </button>
    </FrameRing>
  )
}
