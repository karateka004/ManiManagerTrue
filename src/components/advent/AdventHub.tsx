import type { CSSProperties } from 'react'
import { ChevronRight, Gift } from 'lucide-react'
import { useStore } from '../../store/transactions'
import { hapticTap } from '../../lib/telegram'
import { daysWord } from '../../lib/i18n'
import {
  ADVENT_DAYS,
  ADVENT_FINAL_NEED,
  daysToAdvent,
  finalKey,
  isDoorOpen,
  openedCount,
} from '../../lib/season'
import { TILE_RGB, TileBadge } from '../ui/Tile'
import { TileScene } from '../rewards/TileScene'
import { CardSnow } from './Festive'
import { useAdventT, windowsWord } from './text'
import { useSeason } from './useSeason'

/**
 * Плитка адвента — в декабре на месте «Серии дня» (окошко дня засчитывает и
 * день серии). Пока окошко дня ждёт, поле горит праздничным красным и в углу —
 * «Открыть»; открыто — спокойная хвоя и счёт окошек. Тап — экран адвента.
 * Разметка повторяет Tile (как StreakTile): у горячего состояния своё поле.
 */
export function AdventTile({ onOpen }: { onOpen: () => void }) {
  const advent = useStore((s) => s.advent)
  const t = useAdventT()
  const { s } = useSeason()
  const opened = openedCount(advent, s.year)
  const waiting = s.phase === 'live' && !isDoorOpen(advent, s.year, s.day)

  return (
    <button
      type="button"
      onClick={() => {
        hapticTap()
        onOpen()
      }}
      data-advent-tile
      style={{ '--tile-a': waiting ? '255 255 255' : TILE_RGB.pine } as CSSProperties}
      className="press-soft relative flex min-h-[154px] w-full flex-col overflow-hidden rounded-4xl bg-surface-raised text-left shadow-soft"
    >
      <div className={`relative h-[106px] w-full overflow-hidden ${waiting ? 'advent-hot' : 'tile-art'}`}>
        <TileScene scene="advent" festive />
        <div className="absolute right-2.5 top-2.5">
          {waiting ? (
            <span className="sheen flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-extrabold text-[#a51a30] shadow-soft">
              <Gift size={12} strokeWidth={2.6} />
              {t('tile.open')}
            </span>
          ) : (
            <TileBadge>
              {opened}/{ADVENT_DAYS}
            </TileBadge>
          )}
        </div>
      </div>
      <div className="w-full px-4 pb-4 pt-3">
        <div className="text-[16px] font-bold leading-tight text-ink">{t('tile.title')}</div>
        <div className="mt-1 text-[12px] leading-snug text-ink-subtle">
          {waiting ? t('tile.waiting', { n: s.day }) : t('tile.opened', { n: opened, total: ADVENT_DAYS })}
        </div>
        {/* Сколько окошек открыто; засечка — порог главного подарка. */}
        <span className="relative mt-2 block h-1 overflow-hidden rounded-full bg-surface-sunken" aria-hidden>
          <span
            className="block h-full rounded-full bg-[#e5484d] transition-[width] duration-500"
            style={{ width: `${(opened / ADVENT_DAYS) * 100}%` }}
          />
          <span
            className="absolute top-0 h-full w-[2px] bg-[#e2ab3c]"
            style={{ left: `${(ADVENT_FINAL_NEED / ADVENT_DAYS) * 100}%` }}
          />
        </span>
      </div>
    </button>
  )
}

/**
 * Карточка адвента на хабе вне декабря: до 1 декабря — отсчёт до первого
 * окошка, 1–14 января — главный подарок (или сколько окошек не хватает).
 * В декабре её нет: там плитка.
 */
export function AdventCard({ onOpen }: { onOpen: () => void }) {
  const advent = useStore((s) => s.advent)
  const lang = useStore((s) => s.lang)
  const t = useAdventT()
  const { s, now } = useSeason()
  if (s.phase !== 'teaser' && s.phase !== 'finale') return null

  let title: string
  let text: string
  let chip: string | null = null
  let hot = false
  if (s.phase === 'teaser') {
    const days = daysToAdvent(now)
    title = t('card.teaser_t')
    text = t('card.teaser_x')
    chip = days <= 1 ? t('card.teaser_tomorrow') : t('card.teaser_in', { n: days, word: daysWord(lang, days) })
  } else {
    const opened = openedCount(advent, s.year)
    const done = advent.includes(finalKey(s.year))
    if (done) {
      title = t('card.done_t')
      text = t('card.done_x')
    } else if (opened >= ADVENT_FINAL_NEED) {
      title = t('card.final_t')
      text = t('card.final_x', { n: opened, total: ADVENT_DAYS })
      chip = t('final.open')
      hot = true
    } else {
      const left = ADVENT_FINAL_NEED - opened
      title = t('card.short_t', { n: opened, total: ADVENT_DAYS })
      text = t('card.short_x', { left, word: windowsWord(lang, left) })
    }
  }

  return (
    <button
      type="button"
      onClick={() => {
        hapticTap()
        onOpen()
      }}
      data-advent-card
      className={`advent-card press-soft mx-4 mt-4 block w-[calc(100%-2rem)] text-left ${hot ? 'is-hot' : ''}`}
    >
      <CardSnow />
      <div className="relative flex items-center gap-3 px-4 py-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15">
          <Gift size={24} strokeWidth={2.2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-extrabold leading-tight [text-wrap:balance]">{title}</span>
          <span className="mt-1 block text-[12.5px] leading-snug text-white/75 [text-wrap:pretty]">{text}</span>
        </span>
        {chip ? (
          <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-extrabold text-[#8f1530]">{chip}</span>
        ) : (
          <ChevronRight size={18} strokeWidth={2.4} className="shrink-0 text-white/60" />
        )}
      </div>
    </button>
  )
}
