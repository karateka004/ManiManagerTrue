import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Gift, HelpCircle, Sparkles } from 'lucide-react'
import { useStore } from '../../../store/transactions'
import { daysWord } from '../../../lib/i18n'
import { dayjs } from '../../../lib/format'
import { hapticNotify, hapticTap } from '../../../lib/telegram'
import { burst, flyCoins, floatText, prefersReducedMotion, replay } from '../../../lib/fx'
import { showToast } from '../../../lib/toast'
import { clarityEvent } from '../../../lib/clarity'
import { msToMidnight } from '../../../lib/rewards'
import { onAdventFocus, rewardsNav } from '../../../lib/rewardsNav'
import { useTabActive } from '../../../lib/tabActive'
import {
  ADVENT_DAYS,
  ADVENT_FINAL_NEED,
  ADVENT_LATE_PRICE,
  daysToAdvent,
  finalKey,
  openedCount,
  season,
} from '../../../lib/season'
import { doorState, openDoor, openFinal, type AdventAction, type AdventSlice, type DoorState } from '../../../lib/advent'
import type { PlanTab } from '../../PlanningSheet'
import { useAdventT, windowsWord } from '../text'
import { useSeason } from '../useSeason'
import { CardSnow } from '../Festive'
import { Reveal, type RevealState } from './Reveal'
import { BoxBoard } from './BoxBoard'

const PlanningSheet = lazy(() => import('../../PlanningSheet').then((m) => ({ default: m.PlanningSheet })))

/** Цвета праздника для всплеска над окошком. */
const FESTIVE_FX = ['#FF5A5F', '#FFD166', '#3DDC97', '#FFFFFF', '#4CC9F0']

const slice = (s: AdventSlice): AdventSlice => ({
  advent: s.advent,
  coins: s.coins,
  bonusXp: s.bonusXp,
  owned: s.owned,
  streak: s.streak,
})

/**
 * Адвент-календарь прямо на «Прогрессе» (2.13): между плитками и заданиями,
 * без отдельного экрана и шторки. Шкатулка: крышка ящичка откидывается, внутри
 * — подарок; карточка подарка раскрывается под календарём. Правила — по «?».
 *
 * Награды считает lib/advent.ts (чистые функции): сюда приходит готовое
 * изменение стора, одним setState.
 */
export default function AdventCalendar({ onAdd, onAsk }: { onAdd?: () => void; onAsk?: (q: string) => void }) {
  const t = useAdventT()
  const lang = useStore((s) => s.lang)
  const advent = useStore((s) => s.advent)
  const { s, now } = useSeason()
  const year = s.year
  const opened = openedCount(advent, year)
  const finalDone = advent.includes(finalKey(year))

  const [reveal, setReveal] = useState<RevealState | null>(null)
  const [opening, setOpening] = useState<number | null>(null)
  const [rules, setRules] = useState(false)
  const [plan, setPlan] = useState<{ open: boolean; tab: PlanTab }>({ open: false, tab: 'limits' })
  const planSeen = useRef(false)
  if (plan.open) planSeen.current = true

  const rootRef = useRef<HTMLElement>(null)
  const revealRef = useRef<HTMLDivElement>(null)
  const doorEls = useRef<(HTMLButtonElement | null)[]>([])
  const doorRef = useCallback(
    (day: number) => (el: HTMLButtonElement | null) => {
      doorEls.current[day - 1] = el
    },
    [],
  )

  const states: DoorState[] = Array.from({ length: ADVENT_DAYS }, (_, i) => doorState(advent, s, i + 1))
  const today = s.phase === 'live' ? s.day : 0
  const dateOf = (day: number) => dayjs(new Date(year, 11, day)).format('D MMMM')

  // Под календарь раскрылся подарок — довести его до глаз, если он ниже экрана.
  const showReveal = (next: RevealState) => {
    setReveal(next)
    window.setTimeout(() => {
      const el = revealRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const bottom = window.innerHeight - 96 // над панелью вкладок
      if (r.top + Math.min(r.height, 260) > bottom) {
        window.scrollTo({ top: window.scrollY + (r.top + Math.min(r.height, 260) - bottom), behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
      }
    }, 360)
  }

  const celebrate = (el: Element | null | undefined, coins: number, xp: number) => {
    if (!el) return
    burst(el, { colors: FESTIVE_FX, count: 26, spread: 110, confetti: true })
    burst(el, { shape: 'snow', count: 10, spread: 70, colors: ['#ffffff'] })
    if (coins > 0) flyCoins(el, Math.min(5, 3 + Math.round(coins / 10)))
    if (xp > 0) window.setTimeout(() => floatText(el, `+${xp} XP`), 180)
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
    setOpening(day)
    window.setTimeout(() => setOpening((o) => (o === day ? null : o)), 1600)
    celebrate(doorEls.current[day - 1], r.gift.coins + (r.streak?.coins ?? 0), r.gift.xp + (r.streak?.xp ?? 0))
    // Дверца распахивается (переход в CSS) — подарок раскрывается чуть позже.
    window.setTimeout(() => showReveal({ mode: 'got', day, result: r }), r.late ? 260 : 520)
  }

  const onDoor = (day: number) => {
    const state = states[day - 1]
    if (state === 'locked') {
      hapticTap()
      showToast({ text: s.phase === 'teaser' ? t('door.teaser_toast') : t('door.locked_toast', { date: dateOf(day) }) })
      return
    }
    hapticTap()
    if (state === 'today') return commit(day)
    const mode = state === 'open' ? 'view' : 'late'
    // Повторный тап по тому же окошку — свернуть.
    if (reveal && 'day' in reveal && reveal.day === day && reveal.mode !== 'got') return setReveal(null)
    if (reveal && reveal.mode === 'got' && reveal.day === day) return setReveal(null)
    showReveal({ mode, day })
  }

  const finalBtn = useRef<HTMLButtonElement>(null)
  const claimFinal = () => {
    const r = openFinal(slice(useStore.getState()), new Date())
    if (!r.ok) return
    useStore.setState(r.patch)
    hapticNotify('success')
    clarityEvent('advent_final')
    const el = finalBtn.current
    if (el) {
      burst(el, { colors: FESTIVE_FX, count: 40, spread: 170, confetti: true })
      flyCoins(el, 5)
    }
    showReveal({ mode: 'final', gift: r.gift })
  }

  const runAction = (action: AdventAction, question?: string) => {
    if (action === 'add') onAdd?.()
    else if (action === 'ask') {
      if (question) onAsk?.(question)
    } else setPlan({ open: true, tab: action === 'limits' ? 'limits' : action === 'budget' ? 'budget' : 'goals' })
  }

  // Переход к календарю (Главная, плитка «Адвент»): прокрутка к нему и
  // подсветка окошка дня. Ждём, пока вкладка откроется и App поставит прокрутку.
  const active = useTabActive()
  const activeRef = useRef(active)
  activeRef.current = active
  useEffect(() => {
    const go = () => {
      if (!rewardsNav.focusAdvent || !activeRef.current) return
      rewardsNav.focusAdvent = false
      window.setTimeout(() => {
        const el = rootRef.current
        if (!el) return
        const top = el.getBoundingClientRect().top + window.scrollY - 12
        window.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
        const sea = season(new Date())
        if (sea.phase === 'live') window.setTimeout(() => replay(doorEls.current[sea.day - 1], 'is-pulse'), 420)
      }, 300)
    }
    go()
    return onAdventFocus(go)
  }, [active])

  // «Следующее окошко через…» — раз в минуту, пока вкладка открыта.
  const [, setTick] = useState(0)
  const ticking = active && s.phase === 'live' && today > 0 && states[today - 1] === 'open'
  useEffect(() => {
    if (!ticking) return
    const id = window.setInterval(() => setTick((n) => n + 1), 60_000)
    return () => window.clearInterval(id)
  }, [ticking])

  // Шапка: что сейчас с календарём.
  let status: string
  if (s.phase === 'teaser') {
    const d = daysToAdvent(now)
    status = d <= 1 ? t('cal.st_teaser_1') : t('cal.st_teaser', { n: d, word: daysWord(lang, d) })
  } else if (s.phase === 'finale') {
    const left = Math.max(0, ADVENT_FINAL_NEED - opened)
    status = finalDone ? t('cal.st_done') : left === 0 ? t('cal.st_final') : t('cal.st_short', { left, word: windowsWord(lang, left) })
  } else if (states[today - 1] === 'today') {
    status = t('cal.st_today', { day: today })
  } else {
    status = t('cal.st_opened', { n: opened, total: ADVENT_DAYS })
  }

  // Низ: что дальше.
  let next: string | null = null
  if (s.phase === 'teaser') next = t('cal.first_on')
  else if (s.phase === 'live') {
    if (states[today - 1] === 'today') next = t('cal.tap_today')
    else if (today < ADVENT_DAYS) {
      const ms = msToMidnight(new Date())
      const h = Math.floor(ms / 3_600_000)
      const m = Math.max(1, Math.floor((ms % 3_600_000) / 60_000))
      next = t('cal.next_in', { time: h > 0 ? t('cal.hours', { h, m }) : t('cal.minutes', { m }) })
    }
  }
  const finalReady = s.phase === 'finale' && !finalDone && opened >= ADVENT_FINAL_NEED

  const label = (day: number, state: DoorState) =>
    t(('door.sr_' + state) as 'door.sr_open', { date: dateOf(day), price: ADVENT_LATE_PRICE })

  return (
    <section
      ref={rootRef}
      data-advent-calendar
      className="adv-cal adv-box mx-4 mt-4"
      aria-label={t('cal.kicker')}
    >
      <CardSnow />
      <div className="adv-head">
        <div className="min-w-0">
          <div className="adv-kicker">
            <Sparkles size={13} strokeWidth={2.6} />
            {t('cal.kicker')}
          </div>
          <div className="adv-status" data-advent-status>
            {status}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            hapticTap()
            setRules((r) => !r)
          }}
          aria-expanded={rules}
          aria-label={t('cal.rules')}
          data-advent-rules-btn
          className="adv-icon-btn press-icon"
        >
          <HelpCircle size={18} strokeWidth={2.4} />
        </button>
      </div>

      <div className={`adv-fold ${rules ? 'is-open' : ''}`} data-advent-rules={rules ? 'open' : 'closed'}>
        <div className="adv-fold-clip">
          <ul className="adv-rules">
            <li>{t('cal.rule1')}</li>
            <li>{t('cal.rule2', { price: ADVENT_LATE_PRICE })}</li>
            <li>{t('cal.rule3')}</li>
            <li>{t('cal.rule4', { need: ADVENT_FINAL_NEED, total: ADVENT_DAYS, word: windowsWord(lang, ADVENT_FINAL_NEED) })}</li>
          </ul>
        </div>
      </div>

      <BoxBoard
        year={year}
        phase={s.phase}
        today={today}
        states={states}
        selected={reveal && 'day' in reveal ? reveal.day : null}
        opening={opening}
        doorRef={doorRef}
        onDoor={onDoor}
        label={label}
      />

      <div ref={revealRef}>
        <Reveal
          state={reveal}
          year={year}
          dateOf={dateOf}
          onClose={() => setReveal(null)}
          onLateOpen={(day) => commit(day)}
          onAction={runAction}
          canAsk={!!onAsk}
        />
      </div>

      <div className="adv-foot">
        <div className="adv-progress">
          <span className="font-bold">{t('cal.collected', { n: opened, total: ADVENT_DAYS })}</span>
          <span className="text-white/60">{t('hero.need', { need: ADVENT_FINAL_NEED })}</span>
        </div>
        <div className="adv-bar" aria-hidden>
          <i style={{ width: `${(opened / ADVENT_DAYS) * 100}%` }} />
          <b style={{ left: `${(ADVENT_FINAL_NEED / ADVENT_DAYS) * 100}%` }} />
        </div>
        {finalReady ? (
          <button ref={finalBtn} type="button" data-advent-final="is-ready" onClick={claimFinal} className="adv-btn adv-final-btn mt-3 w-full">
            <Gift size={17} strokeWidth={2.4} />
            {t('cal.final_btn')}
          </button>
        ) : finalDone ? (
          <button
            type="button"
            data-advent-final="is-done"
            onClick={() => showReveal({ mode: 'final_view' })}
            className="adv-next mt-2.5 underline-offset-2 hover:underline"
          >
            <Gift size={14} strokeWidth={2.4} />
            {t('cal.final_got')}
          </button>
        ) : (
          next && (
            <div className="adv-next mt-2.5" data-advent-next>
              {s.phase === 'live' && states[today - 1] === 'today' ? <span className="adv-dot" /> : null}
              {next}
            </div>
          )
        )}
        {s.phase === 'finale' && !finalDone && !finalReady && (
          <div className="adv-next mt-2.5" data-advent-final="is-locked">
            {t('final.short', {
              left: Math.max(0, ADVENT_FINAL_NEED - opened),
              word: windowsWord(lang, Math.max(0, ADVENT_FINAL_NEED - opened)),
            })}
          </div>
        )}
      </div>

      <Suspense fallback={null}>
        {planSeen.current && (
          <PlanningSheet open={plan.open} initialTab={plan.tab} onClose={() => setPlan((p) => ({ ...p, open: false }))} />
        )}
      </Suspense>
    </section>
  )
}
