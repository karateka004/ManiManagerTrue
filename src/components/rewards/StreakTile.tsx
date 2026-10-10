import { useMemo, useRef, useState, type CSSProperties } from 'react'
import { Check, Coins } from 'lucide-react'
import { useStore } from '../../store/transactions'
import { daysWord, useT } from '../../lib/i18n'
import { hapticNotify, hapticTap } from '../../lib/telegram'
import { canClaim, effectiveStreak, streakReward, streakWeek } from '../../lib/streak'
import { burst, flyCoins, floatText, BRAND_FX } from '../../lib/fx'
import { showToast } from '../../lib/toast'
import { getReward, STREAK_GIFTS } from '../../lib/rewards'
import { TILE_RGB, TileBadge } from '../ui/Tile'
import { TileScene } from './TileScene'

/**
 * Серия дня — плитка хаба «Прогресс»: тап забирает награду дня, если она ждёт.
 *
 * Пока награда не забрана, поле обложки горит сплошным градиентом, пламя белое
 * и колышется, а в углу — «Забрать +5». Под заголовком — данные: длина серии
 * (или счёт до подарка) и семь последних дней полосками.
 *
 * Разметка повторяет Tile вручную: у горячего состояния своё поле и свой цвет
 * сцены — протаскивать этот частный случай в общий Tile незачем.
 */
export function StreakTile() {
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

  // Только что забрали — сегодняшняя полоска заполняется с отскоком.
  const [justClaimed, setJustClaimed] = useState(false)
  const badgeRef = useRef<HTMLSpanElement>(null)

  const onClick = () => {
    if (!claimable) {
      hapticTap()
      return
    }
    // Координаты бейджа — до изменения стора: после него бейдж сменится.
    const from = badgeRef.current?.getBoundingClientRect()
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

  // Ближайший рубеж с подарком: до него три дня или меньше — пишем счёт до
  // него («4 из 7 до подарка») вместо рекорда: это повод не пропустить завтра.
  const giftDay = Object.keys(STREAK_GIFTS)
    .map(Number)
    .sort((a, b) => a - b)
    .find((day) => day > active)
  const giftSoon = giftDay !== undefined && giftDay - active <= 3

  const subtitle =
    active > 0
      ? giftSoon
        ? t('streak.gift_hint', { n: active, of: giftDay })
        : t('streak.in_row', { n: active, word: daysWord(lang, active) }) +
          (streak.best > active ? ' · ' + t('roadpass.streak_record', { best: streak.best }) : '')
      : streak.best > 0
        ? t('roadpass.streak_record', { best: streak.best })
        : t('streak.none')

  return (
    <button
      type="button"
      onClick={onClick}
      aria-disabled={!claimable}
      style={{ '--tile-a': claimable ? '255 255 255' : TILE_RGB.orange } as CSSProperties}
      className="press-soft relative flex min-h-[154px] w-full flex-col overflow-hidden rounded-4xl bg-surface-raised text-left shadow-soft"
    >
      <div
        className={`relative h-[106px] w-full overflow-hidden ${
          claimable ? 'bg-gradient-to-br from-amber-400 to-orange-500' : 'tile-art'
        }`}
      >
        <TileScene scene="flame" />
        <div className="absolute right-2.5 top-2.5">
          {claimable ? (
            <span
              ref={badgeRef}
              className="sheen flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-extrabold tabular-nums text-orange-600 shadow-soft"
            >
              {t('quest.claim')} +<Coins size={11} strokeWidth={2.6} />
              {next.coins}
            </span>
          ) : (
            <TileBadge>
              <Check size={13} strokeWidth={3} className={justClaimed ? 'pop' : ''} />
            </TileBadge>
          )}
        </div>
      </div>

      <div className="w-full px-4 pb-4 pt-3">
        <div className="text-[16px] font-bold leading-tight text-ink">{t('streak.title')}</div>
        <div className="mt-1 text-[12px] leading-snug text-ink-subtle">{subtitle}</div>
        {/* Семь последних дней: закрашены дни серии; сегодняшний, пока награда
            ждёт, мягко «дышит», после получения — заполняется с отскоком. */}
        <span className="mt-2 flex gap-[3px]" aria-hidden>
          {week.map((on, i) => (
            <span
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                on ? 'bg-orange-500' : i === 6 && claimable ? 'breathe bg-orange-500/40' : 'bg-surface-sunken'
              } ${i === 6 && on && justClaimed ? 'pop' : ''}`}
            />
          ))}
        </span>
      </div>
    </button>
  )
}
