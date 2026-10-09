import { useEffect, useRef } from 'react'
import { RewardBadge } from './rewards/RewardBadge'
import { useStore } from '../store/transactions'
import { LEVEL_REWARDS } from '../lib/rewards'
import { useT } from '../lib/i18n'
import { burst, BRAND_FX } from '../lib/fx'
import { hapticNotify } from '../lib/telegram'
import { useBackButton } from '../lib/useBackButton'
import { useHeroSkin } from '../lib/useHeroSkin'

/**
 * Экран нового уровня: жетон «падает» на карту, вспышка света за ним и
 * конфетти — один раз. Без вращающихся лучей: они укачивают и выглядят как
 * выигрыш в автомате. Всё появление — CSS, текст виден и без анимации.
 */
export function LevelUpOverlay({ level, onClose }: { level: number; onClose: () => void }) {
  const t = useT()
  const best = useStore((s) => s.streak.best)
  const badgeRef = useRef<HTMLDivElement>(null)
  const skin = useHeroSkin()
  const title = LEVEL_REWARDS.find((r) => r.unlockLevel === level)

  useBackButton(true, onClose)

  useEffect(() => {
    hapticNotify('success')
    // Конфетти — когда жетон «приземлился».
    const id = setTimeout(() => burst(badgeRef.current, { colors: [...BRAND_FX, '#FCD34D'], count: 34, spread: 150, confetti: true }), 420)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(id)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const titleLine = title
    ? best >= (title.unlockDays ?? 0)
      ? t('lvlup.title_ready', { name: t('reward.' + title.id + '.name') })
      : t('lvlup.title_days', { name: t('reward.' + title.id + '.name'), n: title.unlockDays ?? 0 })
    : null

  return (
    <div
      className="overlay-in fixed inset-0 z-[85] flex items-center justify-center bg-black/60 px-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="lvlup-title"
    >
      <div
        className={`card-in hero-surface relative w-full max-w-[320px] overflow-hidden rounded-4xl px-6 pb-6 pt-8 text-center ${skin}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Свет за жетоном — вспыхивает и остаётся мягким пятном */}
        <div
          aria-hidden
          className="lvlup-glow pointer-events-none absolute left-1/2 top-4 h-44 w-44 -translate-x-1/2 rounded-full"
          style={{ background: 'radial-gradient(closest-side, rgb(var(--brand-300) / 0.55), transparent)' }}
        />
        <div ref={badgeRef} className="lvlup-badge relative mx-auto w-fit">
          <RewardBadge level={level} size={88} glass />
        </div>
        {/* Номер — в надстрочнике, в заголовке только звание: «Уровень 6 ·
            Магнат» на 320 px рвалось, и точка повисала в конце строки. */}
        <div className="fade-up relative mt-5 text-[13px] font-semibold text-white/60" style={{ animationDelay: '260ms' }}>
          {t('lvlup.kicker_n', { level })}
        </div>
        <div id="lvlup-title" className="fade-up relative mt-1 text-[26px] font-extrabold leading-tight" style={{ animationDelay: '320ms' }}>
          {t('level.t' + level)}
        </div>
        {titleLine && (
          <div className="fade-up relative mt-2 text-[14px] leading-snug text-white/75" style={{ animationDelay: '380ms' }}>
            {titleLine}
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          className="press-soft fade-up relative mt-6 w-full rounded-full bg-white py-3.5 text-[15px] font-bold text-[#0B0E0C]"
          style={{ animationDelay: '440ms' }}
        >
          {t('lvlup.cta')}
        </button>
      </div>
    </div>
  )
}
