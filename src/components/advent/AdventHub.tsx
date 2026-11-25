import { useMemo, type CSSProperties } from 'react'
import dayjs from 'dayjs'
import { Flame, Gift, Snowflake } from 'lucide-react'
import { useStore } from '../../store/transactions'
import { daysWord, useT } from '../../lib/i18n'
import { hapticTap } from '../../lib/telegram'
import { freezesLeft, isDoorOpen } from '../../lib/season'
import { effectiveStreak, missedDays, streakWeek } from '../../lib/streak'
import { TILE_RGB, TileBadge } from '../ui/Tile'
import { TileScene } from '../rewards/TileScene'
import { useAdventT } from './text'
import { useSeason } from './useSeason'

/**
 * В декабре на месте «Серии дня» — та же серия, но забирает её окошко дня
 * (календарь — прямо под плитками). Пока окошко ждёт, поле горит праздничным
 * красным и в углу — «Открыть»; тап — прокрутка к календарю и вспышка окошка.
 * Открыто — счёт серии и заморозки (подарок окошек 7 и 21).
 * Разметка повторяет Tile (как StreakTile): у горячего состояния своё поле.
 */
export function AdventTile({ onOpen }: { onOpen: () => void }) {
  const advent = useStore((s) => s.advent)
  const streak = useStore((s) => s.streak)
  const lang = useStore((s) => s.lang)
  const t = useAdventT()
  const tr = useT()
  const { s, now } = useSeason()
  const waiting = s.phase === 'live' && !isDoorOpen(advent, s.year, s.day)
  const freezes = freezesLeft(advent, now)
  const at = dayjs(now)
  const active = effectiveStreak(streak, at, freezes)
  const frozen = active > 0 && missedDays(streak, at) > 0
  const week = useMemo(() => streakWeek(streak, dayjs(now), freezes), [streak, now, freezes])

  const subtitle = waiting
    ? active > 0
      ? frozen
        ? t('tile.streak_frozen')
        : t('tile.streak_wait', { n: s.day })
      : t('tile.streak_none')
    : active > 0
      ? tr('streak.in_row', { n: active, word: daysWord(lang, active) })
      : tr('streak.none')

  return (
    <button
      type="button"
      onClick={() => {
        hapticTap()
        onOpen()
      }}
      data-advent-tile
      style={{ '--tile-a': waiting ? '255 255 255' : TILE_RGB.orange } as CSSProperties}
      className="press-soft relative flex min-h-[154px] w-full flex-col overflow-hidden rounded-4xl bg-surface-raised text-left shadow-soft"
    >
      <div className={`relative h-[106px] w-full overflow-hidden ${waiting ? 'advent-hot' : 'tile-art'}`}>
        <TileScene scene="flame" festive />
        <div className="absolute right-2.5 top-2.5">
          {waiting ? (
            <span className="sheen flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-extrabold text-[#a51a30] shadow-soft">
              <Gift size={12} strokeWidth={2.6} />
              {t('tile.open')}
            </span>
          ) : (
            <TileBadge>
              <span className="inline-flex items-center gap-1">
                <Flame size={12} strokeWidth={2.6} />
                {active}
                {freezes > 0 && (
                  <>
                    <Snowflake size={12} strokeWidth={2.6} className="ml-1 text-sky-300" />
                    {freezes}
                  </>
                )}
              </span>
            </TileBadge>
          )}
        </div>
      </div>
      <div className="w-full px-4 pb-4 pt-3">
        <div className="text-[16px] font-bold leading-tight text-ink">{tr('streak.title')}</div>
        <div className="mt-1 text-[12px] leading-snug text-ink-subtle">{subtitle}</div>
        {/* Семь последних дней серии; сегодняшний, пока окошко ждёт, «дышит». */}
        <span className="mt-2 flex gap-[3px]" aria-hidden>
          {week.map((on, i) => (
            <span
              key={i}
              className={`h-1 flex-1 rounded-full ${
                on ? 'bg-orange-500' : i === 6 && waiting ? 'breathe bg-[#e5484d]/50' : 'bg-surface-sunken'
              }`}
            />
          ))}
        </span>
      </div>
    </button>
  )
}
