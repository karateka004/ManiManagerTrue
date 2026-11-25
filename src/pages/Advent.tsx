import { lazy, Suspense, useRef, useState, type RefObject } from 'react'
import { Check, Coins, Flame, Gift, Lock, Snowflake } from 'lucide-react'
import { useStore } from '../store/transactions'
import { daysWord, useT } from '../lib/i18n'
import { dayjs } from '../lib/format'
import { hapticNotify, hapticTap } from '../lib/telegram'
import { burst, flyCoins, floatText } from '../lib/fx'
import { showToast } from '../lib/toast'
import { clarityEvent } from '../lib/clarity'
import { getReward, RARITY, type RewardDef } from '../lib/rewards'
import {
  ADVENT_DAYS,
  ADVENT_FINAL_NEED,
  ADVENT_LATE_PRICE,
  daysToAdvent,
  daysToNewYear,
  finalKey,
  openedCount,
} from '../lib/season'
import {
  ADVENT_DOORS,
  ADVENT_ITEMS,
  doorState,
  openDoor,
  openFinal,
  type AdventSlice,
  type DoorState,
} from '../lib/advent'
import { ScreenHeader } from '../components/ui/ScreenHeader'
import { Group } from '../components/ui/Group'
import { Odometer } from '../components/ui/Odometer'
import { RewardThumb } from '../components/rewards/RewardPreview'
import { CardSnow, Garland } from '../components/advent/Festive'
import { useAdventT, windowsWord, type AdventT } from '../components/advent/text'
import { useSeason } from '../components/advent/useSeason'
import { DoorSheet, type DoorSheetState } from '../components/advent/DoorSheet'
import type { PlanTab } from '../components/PlanningSheet'
import { effectiveStreak } from '../lib/streak'
import '../styles/advent.css'

const PlanningSheet = lazy(() => import('../components/PlanningSheet').then((m) => ({ default: m.PlanningSheet })))
const ProductSheet = lazy(() => import('../components/rewards/ProductSheet').then((m) => ({ default: m.ProductSheet })))

/** Цвета праздника для всплеска над окошком. */
const FESTIVE_FX = ['#FF5A5F', '#FFD166', '#3DDC97', '#FFFFFF', '#4CC9F0']

const slice = (s: AdventSlice): AdventSlice => ({
  advent: s.advent,
  coins: s.coins,
  bonusXp: s.bonusXp,
  owned: s.owned,
  streak: s.streak,
})

/** Бумага дверцы: пять узоров, со сдвигом на ряд — соседние по столбцу не совпадают. */
const paperOf = (day: number) => (day - 1 + 2 * Math.floor((day - 1) / 5)) % 5

/**
 * Адвент-календарь — под-экран «Прогресса» (как Магазин и Титулы), ленивым
 * чанком. 31 окошко: окошко дня открывается тапом (дверца распахивается на
 * петлях, подарок и совет дня — в шторке), пропущенные — за монеты, будущие
 * закрыты. Внизу — главный подарок 1 января, коллекция и правила.
 *
 * Награды считает lib/advent.ts (чистые функции), сюда приходит готовое
 * изменение стора — одним setState.
 */
export function AdventScreen({
  onBack,
  onAdd,
  onAsk,
}: {
  onBack: () => void
  onAdd?: () => void
  onAsk?: (q: string) => void
}) {
  const t = useAdventT()
  const tr = useT()
  const lang = useStore((s) => s.lang)
  const advent = useStore((s) => s.advent)
  const coins = useStore((s) => s.coins)
  const streak = useStore((s) => s.streak)
  const { s, now } = useSeason()
  const year = s.year
  const opened = openedCount(advent, year)
  const finalDone = advent.includes(finalKey(year))

  const [sheet, setSheet] = useState<DoorSheetState | null>(null)
  const [plan, setPlan] = useState<{ open: boolean; tab: PlanTab }>({ open: false, tab: 'limits' })
  const planSeen = useRef(false)
  if (plan.open) planSeen.current = true
  const [product, setProduct] = useState<RewardDef | null>(null)
  const productSeen = useRef(false)
  if (product) productSeen.current = true
  const doorRefs = useRef<(HTMLButtonElement | null)[]>([])

  const dateOf = (day: number) => dayjs(new Date(year, 11, day)).format('D MMMM')

  const celebrate = (el: Element | null | undefined, coins: number, xp: number) => {
    if (!el) return
    burst(el, { colors: FESTIVE_FX, count: 26, spread: 120, confetti: true })
    if (coins > 0) flyCoins(el, Math.min(5, 3 + Math.round(coins / 10)))
    if (xp > 0) setTimeout(() => floatText(el, `+${xp} XP`), 180)
  }

  /** Открыть окошко: в свой день — бесплатно, пропущенное — за монеты. */
  const commit = (day: number) => {
    const r = openDoor(slice(useStore.getState()), day, new Date())
    if (!r.ok) {
      if (r.reason === 'coins') hapticNotify('error')
      return
    }
    useStore.setState(r.patch)
    hapticNotify('success')
    clarityEvent(r.late ? 'advent_late' : 'advent_door')
    celebrate(doorRefs.current[day - 1], r.gift.coins + (r.streak?.coins ?? 0), r.gift.xp + (r.streak?.xp ?? 0))
    // Дверца распахивается (переход в CSS) — шторка с подарком чуть позже.
    if (r.late) setSheet({ mode: 'got', day, result: r })
    else setTimeout(() => setSheet({ mode: 'got', day, result: r }), 520)
  }

  const tapDoor = (day: number, state: DoorState) => {
    if (state === 'locked') {
      hapticTap()
      showToast({ text: s.phase === 'teaser' ? t('door.teaser_toast') : t('door.locked_toast', { date: dateOf(day) }) })
      return
    }
    if (state === 'open') return setSheet({ mode: 'view', day })
    if (state === 'missed') return setSheet({ mode: 'late', day })
    commit(day)
  }

  const finalRef = useRef<HTMLButtonElement>(null)
  const claimFinal = () => {
    const r = openFinal(slice(useStore.getState()), new Date())
    if (!r.ok) return
    useStore.setState(r.patch)
    hapticNotify('success')
    clarityEvent('advent_final')
    const el = finalRef.current
    if (el) {
      burst(el, { colors: FESTIVE_FX, count: 40, spread: 170, confetti: true })
      flyCoins(el, 5)
    }
    setSheet({ mode: 'final', gift: r.gift })
  }

  const runAction = (action: 'add' | 'limits' | 'budget' | 'goals' | 'ask', question?: string) => {
    setSheet(null)
    if (action === 'add') onAdd?.()
    else if (action === 'ask') {
      if (question) onAsk?.(question)
    } else setPlan({ open: true, tab: action === 'limits' ? 'limits' : action === 'budget' ? 'budget' : 'goals' })
  }

  // Герой: отсчёт до Нового года (до 1 декабря — до первого окошка).
  const days = s.phase === 'teaser' ? daysToAdvent(now) : daysToNewYear(now)
  const headline =
    s.phase === 'finale'
      ? t('hero.ny')
      : s.phase === 'live' && days === 1
        ? t('hero.tonight')
        : null

  return (
    <div className="pb-28">
      <ScreenHeader
        kicker={t('screen.kicker', { year: year + 1 })}
        title={t('screen.title')}
        onBack={onBack}
        trailing={
          // На 320 px счётчик монет уступает место заголовку (иначе «Адвент-кал…»);
          // монетки тогда просто вспыхивают у окошка.
          <span
            data-coin-target
            className="flex shrink-0 items-center gap-1 rounded-full bg-surface-sunken px-3 py-1.5 text-[13px] font-bold tabular-nums text-ink max-[359px]:hidden"
          >
            <Coins size={14} strokeWidth={2.4} />
            <Odometer text={coins.toLocaleString('ru-RU')} />
          </span>
        }
      />

      <div className="advent-hero mx-4 mt-4 px-5 pb-5 pt-9" data-advent-hero>
        <CardSnow />
        <Garland />
        {headline ? (
          <div className="text-[28px] font-extrabold leading-tight tracking-tight">{headline}</div>
        ) : (
          <div className="flex items-baseline gap-2">
            <span className="text-[44px] font-extrabold leading-none tracking-tight tabular-nums">{days}</span>
            <span className="text-[15px] font-semibold text-white/80">
              {s.phase === 'teaser' ? daysWord(lang, days) : `${daysWord(lang, days)} ${t('hero.days')}`}
            </span>
          </div>
        )}
        {s.phase === 'teaser' && <div className="mt-1 text-[13px] text-white/70">{t('hero.teaser')}</div>}

        <div className="mt-5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[13px]">
          <span className="whitespace-nowrap font-bold">{t('hero.progress', { n: opened, total: ADVENT_DAYS })}</span>
          <span className="whitespace-nowrap text-white/65">{t('hero.need', { need: ADVENT_FINAL_NEED })}</span>
        </div>
        <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-white/15">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#ffd166] to-[#ff8a5b] transition-[width] duration-700"
            style={{ width: `${(opened / ADVENT_DAYS) * 100}%` }}
          />
          <span
            className="absolute top-0 h-full w-[2px] bg-white/80"
            style={{ left: `${(ADVENT_FINAL_NEED / ADVENT_DAYS) * 100}%` }}
          />
        </div>
        {s.phase === 'live' && (
          <div className="mt-3 flex items-center gap-1.5 text-[12.5px] text-white/75">
            <Flame size={14} strokeWidth={2.4} className="shrink-0 text-[#ffb366]" />
            {effectiveStreak(streak) > 0
              ? t('hero.streak', { n: streak.count, word: daysWord(lang, streak.count) })
              : t('hero.streak_none')}
          </div>
        )}
      </div>

      {/* 31 окошко: дверцы распахиваются на петлях (styles/advent.css). */}
      <div className="advent-grid mx-4 mt-5" data-advent-grid>
        {ADVENT_DOORS.map((door) => {
          const state = doorState(advent, s, door.day)
          const item = door.item ? getReward(door.item) : undefined
          return (
            <button
              key={door.day}
              ref={(el) => {
                doorRefs.current[door.day - 1] = el
              }}
              type="button"
              data-day={door.day}
              data-state={state}
              onClick={() => tapDoor(door.day, state)}
              aria-label={t(('door.sr_' + state) as 'door.sr_open', { date: dateOf(door.day), price: ADVENT_LATE_PRICE })}
              className={`door is-${state}`}
            >
              <span className="door-in" aria-hidden>
                {state !== 'locked' &&
                  (item ? (
                    <Gift size={20} strokeWidth={2.2} style={{ color: RARITY[item.rarity].color }} />
                  ) : (
                    <>
                      <Coins size={16} strokeWidth={2.4} className="text-[#e2a21a]" />
                      <span className="tabular-nums">+{door.coins}</span>
                    </>
                  ))}
              </span>
              <span className={`door-leaf paper-${paperOf(door.day)} ${item ? 'door-ribbon' : ''}`} aria-hidden>
                {item ? <span className="door-tag">{door.day}</span> : door.day}
              </span>
              {state === 'missed' && <Snowflake size={12} strokeWidth={2.6} className="door-frost" aria-hidden />}
              {state === 'today' && <span className="door-today">{t('door.today')}</span>}
            </button>
          )
        })}
      </div>

      <FinalCard
        refEl={finalRef}
        t={t}
        lang={lang}
        phase={s.phase}
        opened={opened}
        done={finalDone}
        onOpen={() => (finalDone ? setSheet({ mode: 'final_view' }) : claimFinal())}
      />

      <Group className="mx-4 mt-6" title={t('coll.title')} footer={t('coll.footer')}>
        {ADVENT_ITEMS.map(({ id, day }) => {
          const r = getReward(id)
          if (!r) return null
          return <CollectionRow key={id} reward={r} day={day} t={t} tr={tr} onOpen={() => setProduct(r)} />
        })}
      </Group>

      <p className="caption mx-5 mt-4 leading-relaxed text-ink-muted">
        {t('rules', { price: ADVENT_LATE_PRICE, need: ADVENT_FINAL_NEED, total: ADVENT_DAYS, word: windowsWord(lang, ADVENT_FINAL_NEED) })}
      </p>

      <DoorSheet
        state={sheet}
        year={year}
        dateOf={dateOf}
        onClose={() => setSheet(null)}
        onLateOpen={(day) => commit(day)}
        onAction={runAction}
        canAsk={!!onAsk}
      />

      <Suspense fallback={null}>
        {planSeen.current && (
          <PlanningSheet open={plan.open} initialTab={plan.tab} onClose={() => setPlan((p) => ({ ...p, open: false }))} />
        )}
        {productSeen.current && <ProductSheet reward={product} onClose={() => setProduct(null)} />}
      </Suspense>
    </div>
  )
}

/** Главный подарок под сеткой: закрыт до 1 января, потом — открыть или «получено». */
function FinalCard({
  refEl,
  t,
  lang,
  phase,
  opened,
  done,
  onOpen,
}: {
  refEl: RefObject<HTMLButtonElement>
  t: AdventT
  lang: 'ru' | 'en'
  phase: string
  opened: number
  done: boolean
  onOpen: () => void
}) {
  const ready = phase === 'finale' && !done && opened >= ADVENT_FINAL_NEED
  const left = Math.max(0, ADVENT_FINAL_NEED - opened)
  const text = done
    ? t('final.got')
    : ready
      ? t('final.ready', { n: opened, total: ADVENT_DAYS })
      : phase === 'finale'
        ? t('final.short', { left, word: windowsWord(lang, left) })
        : t('final.locked', { need: ADVENT_FINAL_NEED, total: ADVENT_DAYS, n: opened, word: windowsWord(lang, ADVENT_FINAL_NEED) })
  const state = done ? 'is-done' : ready ? 'is-ready' : 'is-locked'
  return (
    <button
      ref={refEl}
      type="button"
      data-advent-final={state}
      onClick={() => {
        if (!ready && !done) {
          hapticTap()
          return
        }
        onOpen()
      }}
      className={`advent-final press-soft mx-4 mt-5 block w-[calc(100%-2rem)] text-left ${state}`}
    >
      <div className="flex items-center gap-3.5 px-4 py-4 pr-24">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15">
          {done ? <Check size={24} strokeWidth={2.6} /> : ready ? <Gift size={26} strokeWidth={2.2} /> : <Lock size={22} strokeWidth={2.4} />}
        </span>
        <span className="min-w-0">
          <span className="block text-[16px] font-extrabold leading-tight">{t('final.title')}</span>
          <span className="mt-1 block text-[12.5px] leading-snug text-white/80 [text-wrap:pretty]">{text}</span>
        </span>
      </div>
      {ready && (
        <span className="absolute bottom-4 right-4 rounded-full bg-white px-3 py-1.5 text-[12px] font-extrabold text-[#8f1530]">
          {t('final.open')}
        </span>
      )}
    </button>
  )
}

/** Строка коллекции: вещь, где она лежит (окошко N или главный подарок) и «Надеть». */
function CollectionRow({
  reward,
  day,
  t,
  tr,
  onOpen,
}: {
  reward: RewardDef
  day: number | 'final'
  t: AdventT
  tr: (k: string) => string
  onOpen: () => void
}) {
  const owned = useStore((s) => s.owned.includes(reward.id))
  const equipped = useStore((s) => s.equipped[reward.kind] === reward.id)
  const equipReward = useStore((s) => s.equipReward)
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        hapticTap()
        onOpen()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      className="row cursor-pointer"
    >
      <span className="mr-3 shrink-0">
        <RewardThumb reward={reward} dim={!owned} />
      </span>
      <span className="row-main">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-ink">{tr('reward.' + reward.id + '.name')}</span>
          <span className="caption mt-0.5 block truncate text-ink-subtle">
            {day === 'final' ? t('coll.final') : t('coll.day', { day })}
          </span>
        </span>
        {owned ? (
          equipped ? (
            <span className="caption flex shrink-0 items-center gap-1 font-semibold text-ink-muted">
              <Check size={15} strokeWidth={2.8} /> {t('sheet.worn')}
            </span>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                hapticTap()
                equipReward(reward.kind, reward.id)
              }}
              className="press shrink-0 rounded-full bg-surface-sunken px-3.5 py-1.5 text-[13px] font-bold text-ink"
            >
              {t('sheet.wear')}
            </button>
          )
        ) : (
          <Lock size={16} strokeWidth={2.4} className="shrink-0 text-ink-subtle" aria-hidden />
        )}
      </span>
    </div>
  )
}
