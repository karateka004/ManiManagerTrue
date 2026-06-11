import { useStore } from '../store/transactions'
import { tg } from '../lib/telegram'
import { getReward } from '../lib/rewards'
import { useT } from '../lib/i18n'

/** Аватар пользователя Telegram: фото или инициалы + надетая рамка. */
export function Avatar({ size = 40, onClick }: { size?: number; onClick?: () => void }) {
  const t = useT()
  const user = tg.user
  const initials = (user?.first_name?.[0] ?? '🌿').toUpperCase()
  const photo = user?.photo_url
  const frame = getReward(useStore((s) => s.equipped.frame))?.frame
  const hasFrame = !!frame && frame.ring !== 'transparent'
  const ringW = Math.max(2, Math.round(size * 0.07))
  const innerSize = hasFrame ? size - ringW * 2 : size

  const inner = (
    <button
      onClick={onClick}
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-100 text-brand-600 active:scale-95 ${
        hasFrame ? '' : 'ring-2 ring-brand-200/60 dark:ring-brand-500/30'
      }`}
      style={{ width: innerSize, height: innerSize, fontSize: Math.round(innerSize * 0.42) }}
      aria-label={t('nav.profile')}
    >
      {photo ? (
        <img src={photo} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <span className="font-bold">{initials}</span>
      )}
    </button>
  )

  if (!hasFrame) return inner

  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size, padding: ringW, background: frame!.ring, boxShadow: frame!.glow }}
    >
      {inner}
    </div>
  )
}
