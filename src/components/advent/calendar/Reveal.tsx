import { useEffect, useState, type ReactNode } from 'react'
import { Check, ChevronUp, Coins, Flame, Gift, Lightbulb, Lock, PackageOpen, Snowflake, Sparkles } from 'lucide-react'
import { useStore } from '../../../store/transactions'
import { coinsWord, daysWord, useT } from '../../../lib/i18n'
import { hapticTap } from '../../../lib/telegram'
import { getReward, type RewardDef } from '../../../lib/rewards'
import { ADVENT_LATE_PRICE } from '../../../lib/season'
import { ADVENT_DOORS, ADVENT_DUP_COINS, ADVENT_FINAL, doorPrize, type AdventAction, type AdventGift, type OpenResult } from '../../../lib/advent'
import { CoinAmount } from '../../rewards/CoinAmount'
import { RewardThumb } from '../../rewards/RewardPreview'
import { ADVENT_TIPS, FINAL_TIP, tipText } from '../tips'
import { useAdventT } from '../text'
import { YearRecap } from './YearRecap'

export type RevealState =
  /** Только что открыли: что получено (вместе с днём серии). */
  | { mode: 'got'; day: number; result: Extract<OpenResult, { ok: true }> }
  /** Открытое раньше: что было внутри и совет дня. */
  | { mode: 'view'; day: number }
  /** Пропущенное: открыть за монеты. */
  | { mode: 'late'; day: number }
  /** Главный подарок только что открыт. */
  | { mode: 'final'; gift: AdventGift }
  /** Главный подарок, открытый раньше. */
  | { mode: 'final_view' }

const keyOf = (s: RevealState) => ('day' in s ? `${s.mode}-${s.day}` : s.mode)

/**
 * Подарок окошка — прямо под календарём, без шторки: раскрывается (сетка
 * 0fr → 1fr, как клавиатура шторки операции) и сворачивается. Последнее
 * показанное живёт, пока карточка складывается.
 */
export function Reveal({
  state,
  year,
  dateOf,
  onClose,
  onLateOpen,
  onAction,
  canAsk,
}: {
  state: RevealState | null
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
    <div className={`adv-reveal ${state ? 'is-open' : ''}`} data-advent-reveal={state ? state.mode : undefined}>
      <div className="adv-reveal-clip">
        {shown && (
          <Body
            key={keyOf(shown)}
            state={shown}
            year={year}
            dateOf={dateOf}
            onClose={onClose}
            onLateOpen={onLateOpen}
            onAction={onAction}
            canAsk={canAsk}
          />
        )}
      </div>
    </div>
  )
}

function Body({
  state,
  year,
  dateOf,
  onClose,
  onLateOpen,
  onAction,
  canAsk,
}: {
  state: RevealState
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
  const advent = useStore((s) => s.advent)

  if (state.mode === 'final' || state.mode === 'final_view') {
    const gift = state.mode === 'final' ? state.gift : null
    const items = ADVENT_FINAL.items.map((id) => getReward(id)).filter((r): r is RewardDef => !!r)
    return (
      <div className="adv-rev">
        <Head label={t('sheet.final_title')} onClose={onClose} />
        <div className="adv-rev-hero">
          <span className="adv-rev-medal adv-medal-legendary adv-rev-wrapped is-new" aria-hidden>
            <Gift size={40} strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <div className="adv-rev-kicker">{t('final.title')}</div>
            <div className="adv-rev-name">{t('final.got')}</div>
          </div>
        </div>
        <div className="mt-3 space-y-2">
          {items.map((r) => (
            <ItemRow key={r.id} reward={r} />
          ))}
        </div>
        <Chips coins={gift?.coins ?? ADVENT_FINAL.coins} xp={gift?.xp ?? ADVENT_FINAL.xp} lang={lang} />
        {gift?.dup && <Note>{t('sheet.dup', { n: gift.coins - ADVENT_FINAL.coins })}</Note>}
        <Tip text={tipText(FINAL_TIP, lang)} />
      </div>
    )
  }

  const door = ADVENT_DOORS[state.day - 1]

  if (state.mode === 'late') {
    const short = ADVENT_LATE_PRICE - coins
    return (
      <div className="adv-rev">
        <Head label={t('rev.late', { date: dateOf(state.day) })} onClose={onClose} />
        <div className="adv-rev-hero">
          <span className="adv-rev-medal adv-rev-wrapped" aria-hidden>
            <Gift size={30} strokeWidth={1.9} />
          </span>
          <div className="min-w-0">
            <div className="adv-rev-name">{t('sheet.late_t')}</div>
            <p className="adv-rev-note">{t('sheet.late_x', { date: dateOf(state.day), price: ADVENT_LATE_PRICE })}</p>
          </div>
        </div>
        <button
          type="button"
          data-advent-late
          onClick={() => (short > 0 ? hapticTap() : onLateOpen(state.day))}
          aria-disabled={short > 0}
          className={`adv-btn mt-4 w-full ${short > 0 ? 'is-off' : ''}`}
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
    )
  }

  // Окошко: только что открытое или открытое раньше.
  const result = state.mode === 'got' ? state.result : null
  // Что было в окошке: у только что открытого — по факту (сундучок мог оказаться
  // монетами), у открытого раньше — по таблице и ключу сундучка.
  const prize = result
    ? door?.chest
      ? ({ type: 'chest', id: result.gift.chest } as const)
      : doorPrize(state.day, advent, year)
    : doorPrize(state.day, advent, year)
  const prizeItem = prize.type === 'item' || prize.type === 'chest' ? (prize.id ? getReward(prize.id) : undefined) : undefined
  const streakGift = result?.streak?.gift ? getReward(result.streak.gift) : undefined
  const frozen = result?.streak?.frozen ?? 0
  const dupItem = !!result?.gift.dup
  const tip = ADVENT_TIPS[state.day]
  const action = door?.action
  const showAction = action && (action !== 'ask' || (canAsk && tip?.ask))
  const coinsGot = result ? result.gift.coins + (result.streak?.coins ?? 0) : door?.coins ?? 0
  const xpGot = result ? result.gift.xp + (result.streak?.xp ?? 0) : door?.xp ?? 0
  const label = result
    ? result.late
      ? t('rev.opened', { date: dateOf(state.day) })
      : t('rev.today', { date: dateOf(state.day) })
    : t('rev.opened', { date: dateOf(state.day) })
  const kicker = prize.type === 'chest' ? t('gift.chest') : result ? t('rev.got') : t('rev.was')
  const chips = (
    <Chips
      coins={coinsGot}
      xp={xpGot}
      lang={lang}
      streak={result?.streak ? { n: result.streak.count, word: daysWord(lang, result.streak.count) } : undefined}
    />
  )

  return (
    <div className="adv-rev">
      <Head label={label} onClose={onClose} />
      {prizeItem ? (
        <PrizeItem reward={prizeItem} kicker={kicker} isNew={!!result}>
          {chips}
        </PrizeItem>
      ) : (
        <div className="adv-rev-hero">
          <span className={`adv-rev-medal ${result ? 'is-new' : ''} ${prize.type === 'freeze' ? 'is-freeze' : 'is-coins'}`} aria-hidden>
            {prize.type === 'freeze' ? (
              <Snowflake size={30} strokeWidth={2.2} />
            ) : prize.type === 'chest' ? (
              <PackageOpen size={30} strokeWidth={2} />
            ) : (
              <Coins size={30} strokeWidth={2.2} />
            )}
          </span>
          <div className="min-w-0">
            <div className="adv-rev-kicker">{kicker}</div>
            <div className="adv-rev-name">
              {prize.type === 'freeze'
                ? t('gift.freeze')
                : prize.type === 'chest'
                  ? t('gift.chest_coins')
                  : t(coinsName(door?.coins ?? 0))}
            </div>
            <p className="adv-rev-note">
              {prize.type === 'freeze' ? t('gift.freeze_x') : prize.type === 'chest' ? t('gift.chest_empty') : t('gift.coins_x')}
            </p>
          </div>
        </div>
      )}
      {!prizeItem && chips}
      {frozen > 0 && (
        <Note icon={<Snowflake size={15} strokeWidth={2.4} />}>
          {frozen === 1 ? t('gift.frozen') : t('gift.frozen_n', { n: frozen, word: daysWord(lang, frozen) })}
        </Note>
      )}
      {dupItem && <Note>{t('sheet.dup', { n: ADVENT_DUP_COINS })}</Note>}
      {streakGift && (
        <Note icon={<Gift size={15} strokeWidth={2.4} />}>
          {t('sheet.streak_gift', { name: tr('reward.' + streakGift.id + '.name') })}
        </Note>
      )}
      {state.day === 31 && <YearRecap year={year} />}
      {tip && (
        <Tip text={tipText(tip, lang)}>
          {showAction && (
            <button
              type="button"
              data-advent-action={action}
              onClick={() => onAction(action, tip.ask ? (lang === 'en' ? tip.ask.en : tip.ask.ru) : undefined)}
              className="adv-btn adv-btn-soft mt-3"
            >
              {t(`act.${action}` as 'act.add')}
            </button>
          )}
        </Tip>
      )}
    </div>
  )
}

/** Название монетного окошка — по щедрости. */
const coinsName = (n: number) => (n <= 15 ? 'gift.coins_s' : n <= 25 ? 'gift.coins_m' : 'gift.coins_l')

/**
 * Вещь из окошка крупно: жетон в медальоне цвета редкости, вид вещи, название,
 * описание и «Надеть» — сразу, без Магазина. Титул показан так, как его увидят
 * в рейтинге: плашкой под именем.
 */
function PrizeItem({ reward, kicker, isNew, children }: { reward: RewardDef; kicker: string; isNew: boolean; children?: ReactNode }) {
  const t = useAdventT()
  const tr = useT()
  const owned = useStore((s) => s.owned.includes(reward.id))
  const equipped = useStore((s) => s.equipped[reward.kind] === reward.id)
  const equipReward = useStore((s) => s.equipReward)
  const name = tr('reward.' + reward.id + '.name')
  return (
    <div className="adv-prize" data-advent-prize={reward.id}>
      <div className="adv-rev-hero">
        <span className={`adv-rev-medal adv-medal-${reward.rarity} ${isNew ? 'is-new' : ''}`} aria-hidden>
          <span className="adv-medal-thumb">
            <RewardThumb reward={reward} />
          </span>
        </span>
        <div className="min-w-0">
          <div className="adv-rev-kicker">
            {kicker} · {t(('kind.' + reward.kind) as 'kind.title')}
          </div>
          {reward.kind === 'title' ? (
            <div className="adv-title-chip">{name}</div>
          ) : (
            <div className="adv-rev-name">{name}</div>
          )}
          <p className="adv-rev-note">{tr('reward.' + reward.id + '.hint')}</p>
          <span className={`adv-rarity adv-rarity-${reward.rarity}`}>{tr('rarity.' + reward.rarity)}</span>
        </div>
      </div>
      {children}
      {owned &&
        (equipped ? (
          <div className="adv-worn">
            <Check size={16} strokeWidth={2.8} className="pop" /> {t('sheet.worn')}
          </div>
        ) : (
          <button
            type="button"
            data-advent-wear
            onClick={() => {
              hapticTap()
              equipReward(reward.kind, reward.id)
            }}
            className="adv-btn mt-3 w-full"
          >
            {t('gift.wear_' + reward.kind as 'gift.wear_title')}
          </button>
        ))}
    </div>
  )
}

function Head({ label, onClose }: { label: string; onClose: () => void }) {
  const t = useAdventT()
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="adv-rev-date">{label}</span>
      <button type="button" onClick={onClose} aria-label={t('rev.close')} className="adv-icon-btn press-icon">
        <ChevronUp size={18} strokeWidth={2.6} />
      </button>
    </div>
  )
}

/** Вещь из окошка: миниатюра, название, редкость и «Надеть» — без перехода в Магазин. */
function ItemRow({ reward }: { reward: RewardDef }) {
  const t = useAdventT()
  const tr = useT()
  const owned = useStore((s) => s.owned.includes(reward.id))
  const equipped = useStore((s) => s.equipped[reward.kind] === reward.id)
  const equipReward = useStore((s) => s.equipReward)
  return (
    <div className="adv-rev-item">
      <span className="shrink-0">
        <RewardThumb reward={reward} dim={!owned} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-bold text-white">{tr('reward.' + reward.id + '.name')}</span>
        <span className={`adv-rarity adv-rarity-${reward.rarity}`}>{tr('rarity.' + reward.rarity)}</span>
      </span>
      {owned ? (
        equipped ? (
          <span className="flex shrink-0 items-center gap-1 text-[13px] font-semibold text-white/70">
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
            className="adv-btn adv-btn-sm shrink-0"
          >
            {t('sheet.wear')}
          </button>
        )
      ) : (
        <Lock size={16} strokeWidth={2.4} className="shrink-0 text-white/50" aria-hidden />
      )}
    </div>
  )
}

function Chips({
  coins,
  xp,
  lang,
  streak,
  freeze,
}: {
  coins: number
  xp: number
  lang: 'ru' | 'en'
  streak?: { n: number; word: string }
  freeze?: boolean
}) {
  const t = useAdventT()
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {coins > 0 && (
        <span className="adv-chip adv-chip-coin">
          <Coins size={15} strokeWidth={2.4} />
          {t('sheet.coins', { n: coins, word: coinsWord(lang, coins) })}
        </span>
      )}
      {xp > 0 && (
        <span className="adv-chip adv-chip-xp">
          <Sparkles size={15} strokeWidth={2.4} />
          {t('sheet.xp', { n: xp })}
        </span>
      )}
      {streak && (
        <span className="adv-chip adv-chip-streak">
          <Flame size={15} strokeWidth={2.4} />
          {t('sheet.streak', streak)}
        </span>
      )}
      {freeze && (
        <span className="adv-chip adv-chip-freeze">
          <Snowflake size={15} strokeWidth={2.4} />
          {t('gift.freeze')}
        </span>
      )}
    </div>
  )
}

function Note({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mt-2.5 flex items-center gap-2 text-[13px] leading-snug text-white/75">
      {icon}
      <span>{children}</span>
    </div>
  )
}

function Tip({ text, children }: { text: string; children?: ReactNode }) {
  const t = useAdventT()
  return (
    <div className="adv-rev-tip">
      <div className="flex items-center gap-1.5 text-[12px] font-bold text-white/60">
        <Lightbulb size={14} strokeWidth={2.4} />
        {t('sheet.tip')}
      </div>
      <p className="mt-1.5 text-[14px] leading-snug text-white/90 [text-wrap:pretty]">{text}</p>
      {children}
    </div>
  )
}
