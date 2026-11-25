import { useEffect, useState } from 'react'
import { Check, Coins, Flame, Gift, Lightbulb, Sparkles } from 'lucide-react'
import { useStore } from '../../store/transactions'
import { coinsWord, daysWord, useT } from '../../lib/i18n'
import { hapticTap } from '../../lib/telegram'
import { getReward, type RewardDef } from '../../lib/rewards'
import { ADVENT_LATE_PRICE } from '../../lib/season'
import { ADVENT_DOORS, ADVENT_FINAL, type AdventAction, type AdventGift, type OpenResult } from '../../lib/advent'
import { BottomSheet, SheetHeader } from '../ui/BottomSheet'
import { CoinAmount } from '../rewards/CoinAmount'
import { RewardStage, RewardThumb } from '../rewards/RewardPreview'
import { ADVENT_TIPS, FINAL_TIP, tipText } from './tips'
import { useAdventT } from './text'

export type DoorSheetState =
  /** Только что открыли: что получено (вместе с днём серии). */
  | { mode: 'got'; day: number; result: Extract<OpenResult, { ok: true }> }
  /** Открытое раньше: что в окошке и совет дня. */
  | { mode: 'view'; day: number }
  /** Пропущенное: открыть за монеты. */
  | { mode: 'late'; day: number }
  /** Главный подарок только что открыт. */
  | { mode: 'final'; gift: AdventGift }
  /** Главный подарок, открытый раньше. */
  | { mode: 'final_view' }

/**
 * Шторка окошка адвента. Состояние держит экран, содержимое — вложенный Body
 * (перерисовка того, кто рисует BottomSheet, заставляла framer перемерять лист).
 * Последнее показанное живёт, пока шторка уезжает.
 */
export function DoorSheet({
  state,
  year,
  dateOf,
  onClose,
  onLateOpen,
  onAction,
  canAsk,
}: {
  state: DoorSheetState | null
  year: number
  dateOf: (day: number) => string
  onClose: () => void
  onLateOpen: (day: number) => void
  onAction: (action: AdventAction, question?: string) => void
  canAsk: boolean
}) {
  const [shown, setShown] = useState(state)
  useEffect(() => {
    if (state) setShown(state)
  }, [state])
  return (
    <BottomSheet open={state !== null} onClose={onClose} padBottom={16}>
      {shown && (
        <Body
          key={'day' in shown ? `${shown.mode}-${shown.day}` : shown.mode}
          state={shown}
          year={year}
          dateOf={dateOf}
          onClose={onClose}
          onLateOpen={onLateOpen}
          onAction={onAction}
          canAsk={canAsk}
        />
      )}
    </BottomSheet>
  )
}

function Body({
  state,
  dateOf,
  onClose,
  onLateOpen,
  onAction,
  canAsk,
}: {
  state: DoorSheetState
  year: number
  dateOf: (day: number) => string
  onClose: () => void
  onLateOpen: (day: number) => void
  onAction: (action: AdventAction, question?: string) => void
  canAsk: boolean
}) {
  const t = useAdventT()
  const tr = useT()
  const lang = useStore((s) => s.lang)
  const coins = useStore((s) => s.coins)

  if (state.mode === 'late') {
    const door = ADVENT_DOORS[state.day - 1]
    const item = door?.item ? getReward(door.item) : undefined
    const short = ADVENT_LATE_PRICE - coins
    return (
      <>
        <SheetHeader title={t('sheet.late_t')} onClose={onClose} />
        <div className="px-5">
        <p className="text-[14px] leading-snug text-ink-muted [text-wrap:pretty]">
          {t('sheet.late_x', { date: dateOf(state.day), price: ADVENT_LATE_PRICE })}
        </p>
        {item && (
          <div className="mt-4 flex items-center gap-3 rounded-3xl bg-surface-sunken/70 px-4 py-3">
            <RewardThumb reward={item} />
            <span className="min-w-0 text-[14px] font-semibold text-ink">
              {t('sheet.late_inside', { name: tr('reward.' + item.id + '.name') })}
            </span>
          </div>
        )}
        <button
          type="button"
          data-advent-late
          onClick={() => (short > 0 ? hapticTap() : onLateOpen(state.day))}
          aria-disabled={short > 0}
          className={`press-soft mt-5 w-full rounded-full py-3.5 text-[15px] font-bold transition-colors ${
            short > 0 ? 'bg-surface-sunken text-ink-subtle' : 'bg-brand-500 text-white'
          }`}
        >
          {short > 0 ? (
            t('sheet.late_short', { n: short, word: coinsWord(lang, short) })
          ) : (
            <span className="inline-flex items-center gap-1.5">
              {t('sheet.late_btn', { price: '' }).trim()}
              <CoinAmount value={ADVENT_LATE_PRICE} size={15} />
            </span>
          )}
        </button>
        </div>
      </>
    )
  }

  if (state.mode === 'final' || state.mode === 'final_view') {
    const gift = state.mode === 'final' ? state.gift : null
    const items = ADVENT_FINAL.items.map((id) => getReward(id)).filter((r): r is RewardDef => !!r)
    return (
      <>
        <SheetHeader title={t('sheet.final_title')} onClose={onClose} />
        <div className="px-5">
        {items.map((r) => (
          <ItemBlock key={r.id} reward={r} />
        ))}
        <Chips coins={gift?.coins ?? ADVENT_FINAL.coins} xp={gift?.xp ?? ADVENT_FINAL.xp} lang={lang} />
        {gift?.dup && <Note>{t('sheet.dup', { n: gift.coins - ADVENT_FINAL.coins })}</Note>}
        <TipBlock text={tipText(FINAL_TIP, lang)} />
        <Done onClose={onClose} />
        </div>
      </>
    )
  }

  // Окошко: только что открытое или открытое раньше.
  const door = ADVENT_DOORS[state.day - 1]
  const result = state.mode === 'got' ? state.result : null
  const itemId = result ? result.gift.items[0] : door?.item
  const item = itemId ? getReward(itemId) : undefined
  const streakGift = result?.streak?.gift ? getReward(result.streak.gift) : undefined
  const tip = ADVENT_TIPS[state.day]
  const action = door?.action
  const showAction = action && (action !== 'ask' || (canAsk && tip?.ask))
  const coinsGot = result ? result.gift.coins + (result.streak?.coins ?? 0) : door?.coins ?? 0
  const xpGot = result ? result.gift.xp + (result.streak?.xp ?? 0) : door?.xp ?? 0

  return (
    <>
      <SheetHeader title={t('sheet.title', { date: dateOf(state.day) })} onClose={onClose} />
      <div className="px-5">
      {item && <ItemBlock reward={item} />}
      <Chips
        coins={coinsGot}
        xp={xpGot}
        lang={lang}
        streak={result?.streak ? { n: result.streak.count, word: daysWord(lang, result.streak.count) } : undefined}
      />
      {result?.gift.dup && <Note>{t('sheet.dup', { n: result.gift.coins - (door?.coins ?? 0) })}</Note>}
      {streakGift && (
        <Note icon={<Gift size={15} strokeWidth={2.4} />}>
          {t('sheet.streak_gift', { name: tr('reward.' + streakGift.id + '.name') })}
        </Note>
      )}
      {tip && (
        <TipBlock text={tipText(tip, lang)}>
          {showAction && (
            <button
              type="button"
              data-advent-action={action}
              onClick={() => onAction(action, tip.ask ? (lang === 'en' ? tip.ask.en : tip.ask.ru) : undefined)}
              className="press-soft mt-3 rounded-full bg-brand-500/[.12] px-3.5 py-2 text-[13px] font-bold text-brand-700 dark:text-brand-300"
            >
              {t(`act.${action}` as 'act.add')}
            </button>
          )}
        </TipBlock>
      )}
      <Done onClose={onClose} />
      </div>
    </>
  )
}

/** Вещь из окошка: примерка (как в Магазине), название, редкость и «Надеть». */
function ItemBlock({ reward }: { reward: RewardDef }) {
  const t = useAdventT()
  const tr = useT()
  const owned = useStore((s) => s.owned.includes(reward.id))
  const equipped = useStore((s) => s.equipped[reward.kind] === reward.id)
  const equipReward = useStore((s) => s.equipReward)
  return (
    <div className="mb-4">
      <div className="tab-enter">
        <RewardStage reward={reward} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[18px] font-extrabold leading-tight text-ink">{tr('reward.' + reward.id + '.name')}</div>
          <div className={`caption-sm rarity-text-${reward.rarity} mt-0.5 font-bold`}>{tr('rarity.' + reward.rarity)}</div>
        </div>
        {owned &&
          (equipped ? (
            <span className="caption flex shrink-0 items-center gap-1 font-semibold text-ink-muted">
              <Check size={15} strokeWidth={2.8} className="pop" /> {t('sheet.worn')}
            </span>
          ) : (
            <button
              type="button"
              data-advent-wear
              onClick={() => {
                hapticTap()
                equipReward(reward.kind, reward.id)
              }}
              className="press-soft shrink-0 rounded-full bg-brand-500 px-4 py-2 text-[13px] font-bold text-white"
            >
              {t('sheet.wear')}
            </button>
          ))}
      </div>
    </div>
  )
}

function Chips({
  coins,
  xp,
  lang,
  streak,
}: {
  coins: number
  xp: number
  lang: 'ru' | 'en'
  streak?: { n: number; word: string }
}) {
  const t = useAdventT()
  return (
    <div className="flex flex-wrap gap-2">
      {coins > 0 && (
        <span className="flex items-center gap-1.5 rounded-full bg-[#f5b524]/[.16] px-3 py-1.5 text-[13px] font-bold text-[#9a6400] dark:text-[#ffd27a]">
          <Coins size={15} strokeWidth={2.4} />
          {t('sheet.coins', { n: coins, word: coinsWord(lang, coins) })}
        </span>
      )}
      {xp > 0 && (
        <span className="flex items-center gap-1.5 rounded-full bg-brand-500/[.12] px-3 py-1.5 text-[13px] font-bold text-brand-700 dark:text-brand-300">
          <Sparkles size={15} strokeWidth={2.4} />
          {t('sheet.xp', { n: xp })}
        </span>
      )}
      {streak && (
        <span className="flex items-center gap-1.5 rounded-full bg-orange-500/[.14] px-3 py-1.5 text-[13px] font-bold text-orange-700 dark:text-orange-300">
          <Flame size={15} strokeWidth={2.4} />
          {t('sheet.streak', streak)}
        </span>
      )}
    </div>
  )
}

function Note({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="mt-3 flex items-center gap-2 text-[13px] leading-snug text-ink-muted">
      {icon}
      <span>{children}</span>
    </div>
  )
}

function TipBlock({ text, children }: { text: string; children?: React.ReactNode }) {
  const t = useAdventT()
  return (
    <div className="mt-4 rounded-3xl bg-surface-sunken/70 px-4 py-3.5">
      <div className="flex items-center gap-1.5 text-[12px] font-bold text-ink-subtle">
        <Lightbulb size={14} strokeWidth={2.4} />
        {t('sheet.tip')}
      </div>
      <p className="mt-1.5 text-[14px] leading-snug text-ink [text-wrap:pretty]">{text}</p>
      {children}
    </div>
  )
}

function Done({ onClose }: { onClose: () => void }) {
  const t = useAdventT()
  return (
    <button
      type="button"
      onClick={onClose}
      className="press-soft mt-5 w-full rounded-full bg-surface-sunken py-3.5 text-[15px] font-bold text-ink"
    >
      {t('sheet.done')}
    </button>
  )
}
