import { useMemo, useRef, useState } from 'react'
import { Flame } from 'lucide-react'
import { useStore } from '../../store/transactions'
import { daysWord, useT } from '../../lib/i18n'
import { hapticNotify } from '../../lib/telegram'
import { canClaim, effectiveStreak, streakReward, streakWeek } from '../../lib/streak'
import { Row } from '../ui/Group'
import { CoinAmount } from './CoinAmount'
import { burst, flyCoins, floatText, BRAND_FX } from '../../lib/fx'
import { showToast } from '../../lib/toast'
import { getReward, STREAK_GIFTS } from '../../lib/rewards'

/**
 * Серия дня — строка хаба «Прогресс».
 *
 * 2.0: была плиткой с нарисованным пламенем, которое ничего не сообщало, а под
 * ним — «0 дн. · рекорд 0». Теперь картинку заменили сами данные: семь последних
 * дней полосками (закрашены дни текущей серии), а кнопка показывает, сколько
 * монет даст сегодняшний день. Кнопка есть только пока награду можно забрать.
 */
export function StreakRow() {
  const streak = useStore((s) => s.streak)
  const claimDailyStreak = useStore((s) => s.claimDailyStreak)
  const equipReward = useStore((s) => s.equipReward)
  const lang = useStore((s) => s.lang)
  const t = useT()

  const active = effectiveStreak(streak)
  const claimable = canClaim(streak)
  // Награда за сегодня: продолжение серии, если она жива, иначе первый день.
  const next = streakReward(active > 0 ? streak.count + 1 : 1)

  const week = useMemo(() => streakWeek(streak), [streak])

  // Только что забрали — сегодняшняя полоска «вспыхивает» при заполнении.
  const [justClaimed, setJustClaimed] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)

  const onClaim = () => {
    // Координаты кнопки — до изменения стора: после него кнопка исчезнет.
    const from = btnRef.current?.getBoundingClientRect()
    const reward = claimDailyStreak()
    if (!reward) return
    hapticNotify('success')
    setJustClaimed(true)
    if (from) {
      const at = { x: from.left + from.width / 2, y: from.top + from.height / 2 }
      floatText(at, `+${reward.coins}`)
      flyCoins(at, Math.min(8, 3 + Math.round(reward.coins / 5)))
      // Рубеж серии (3/7/14/30 дней) — небольшое конфетти поверх монеток.
      if (reward.milestone) burst(at, { colors: BRAND_FX, count: 22, spread: 110, confetti: true })
    }
    // Подарок за рубеж — тостом с «Надеть»: вещь уже в купленном.
    const gift = getReward(reward.gift)
    if (gift) {
      showToast({
        icon: 'gift',
        text: t('streak.gift', { n: reward.milestone }),
        sub: t('reward.' + gift.id + '.name'),
        duration: 7000,
        action: { label: t('roadpass.equip'), run: () => equipReward(gift.kind, gift.id) },
      })
    }
  }

  // Ближайший рубеж с подарком: до него три дня или меньше — говорим о нём
  // вместо рекорда (это повод не пропустить завтра).
  const giftDay = Object.keys(STREAK_GIFTS)
    .map(Number)
    .sort((a, b) => a - b)
    .find((d) => d > active)
  const giftSoon = giftDay !== undefined && giftDay - active <= 3

  const subtitle =
    active > 0
      ? t('streak.in_row', { n: active, word: daysWord(lang, active) }) +
        (giftSoon
          ? ' · ' + t('streak.gift_hint', { n: giftDay })
          : streak.best > active
            ? ' · ' + t('roadpass.streak_record', { best: streak.best })
            : '')
      : streak.best > 0
        ? t('roadpass.streak_record', { best: streak.best })
        : t('streak.none')

  return (
    <Row
      icon={<Flame size={18} strokeWidth={2} />}
      title={t('streak.title')}
      subtitle={subtitle}
      trailing={
        claimable ? (
          <button
            ref={btnRef}
            type="button"
            onClick={onClaim}
            className="press sheen flex shrink-0 items-center gap-1.5 rounded-full bg-brand-500 px-3.5 py-1.5 text-[13px] font-bold text-white"
          >
            {t('quest.claim')}
            <span className="tabular-nums opacity-80">
              +<CoinAmount value={next.coins} size={12} />
            </span>
          </button>
        ) : undefined
      }
    >
      {/* Сегодняшняя полоска, пока награда ждёт, мягко «дышит»; после
          получения — заполняется с отскоком. */}
      <span className="mt-2 flex gap-1" aria-hidden>
        {week.map((on, i) => (
          <span
            key={i}
            className={`h-1.5 w-5 rounded-full transition-colors duration-300 ${
              on ? 'bg-brand-500' : i === 6 && claimable ? 'breathe bg-brand-500/40' : 'bg-surface-sunken'
            } ${i === 6 && on && justClaimed ? 'pop' : ''}`}
          />
        ))}
      </span>
    </Row>
  )
}
