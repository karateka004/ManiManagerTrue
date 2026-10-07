import { useMemo } from 'react'
import { Flame } from 'lucide-react'
import { useStore } from '../../store/transactions'
import { daysWord, useT } from '../../lib/i18n'
import { hapticNotify } from '../../lib/telegram'
import { dayjs } from '../../lib/format'
import { canClaim, effectiveStreak, streakReward } from '../../lib/streak'
import { Row } from '../ui/Group'
import { CoinAmount } from './CoinAmount'

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
  const lang = useStore((s) => s.lang)
  const t = useT()

  const active = effectiveStreak(streak)
  const claimable = canClaim(streak)
  // Награда за сегодня: продолжение серии, если она жива, иначе первый день.
  const next = streakReward(active > 0 ? streak.count + 1 : 1)

  const week = useMemo(() => lastWeek(streak.lastClaim, active > 0 ? streak.count : 0), [streak.lastClaim, streak.count, active])

  const onClaim = () => {
    if (claimDailyStreak()) hapticNotify('success')
  }

  const subtitle =
    active > 0
      ? t('streak.in_row', { n: active, word: daysWord(lang, active) }) +
        (streak.best > active ? ' · ' + t('roadpass.streak_record', { best: streak.best }) : '')
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
            type="button"
            onClick={onClaim}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand-500 px-3.5 py-1.5 text-[13px] font-bold text-white transition-transform active:scale-95"
          >
            {t('quest.claim')}
            <span className="tabular-nums opacity-80">
              +<CoinAmount value={next.coins} size={12} />
            </span>
          </button>
        ) : undefined
      }
    >
      <span className="mt-2 flex gap-1" aria-hidden>
        {week.map((on, i) => (
          <span
            key={i}
            className={`h-1.5 w-5 rounded-full ${
              on ? 'bg-brand-500' : i === 6 && claimable ? 'bg-brand-500/25' : 'bg-surface-sunken'
            }`}
          />
        ))}
      </span>
    </Row>
  )
}

/**
 * Семь последних дней, сегодня — последним: true, если день входит в живую
 * серию. Серия — это `count` дней подряд, заканчивая днём `lastClaim`.
 */
function lastWeek(lastClaim: string | null, count: number): boolean[] {
  const out: boolean[] = []
  const last = lastClaim ? dayjs(lastClaim).startOf('day') : null
  const today = dayjs().startOf('day')
  for (let i = 6; i >= 0; i--) {
    if (!last || count <= 0) {
      out.push(false)
      continue
    }
    const back = last.diff(today.subtract(i, 'day'), 'day')
    out.push(back >= 0 && back < count)
  }
  return out
}
