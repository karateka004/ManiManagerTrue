import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Crown, ShoppingBag, Trophy } from 'lucide-react'
import {
  useStore,
  selectCategoriesUsed,
  selectLogDayStreak,
  selectGoalsReached,
  selectBudgetMonthKept,
} from '../store/transactions'
import { tg, hapticNotify, openTelegramLink } from '../lib/telegram'
import {
  getLeaderboard,
  getReferralStats,
  submitProfile,
  isBackendConfigured,
  checkSubscription,
  type ReferralFriend,
} from '../lib/api'
import { useLevel } from '../components/LevelBar'
import { LEVELS } from '../lib/levels'
import { questBoard, questsLeft, BOARD_SIZE, QUEST_COOLDOWN_MS, type QuestProgress } from '../lib/quests'
import { coinsWord, useT } from '../lib/i18n'
import { Group, Row } from '../components/ui/Group'
import { StreakRow } from '../components/rewards/StreakRow'
import { QuestRows } from '../components/rewards/QuestRow'
import { ReferralBlock } from '../components/rewards/ReferralBlock'
import { ShopScreen } from './Shop'
import { LevelRewardsScreen } from './LevelRewards'
import { LEVEL_REWARDS } from '../lib/rewards'
import { RewardBadge } from '../components/rewards/RewardBadge'
import { Odometer } from '../components/ui/Odometer'
import { flyCoins, floatText } from '../lib/fx'
import { useBackButton } from '../lib/useBackButton'
import { useHeroSkin } from '../lib/useHeroSkin'

// Таблица лидеров — отдельным чанком, грузится по первому открытию.
const LeaderboardSheet = lazy(() => import('../components/LeaderboardSheet').then((m) => ({ default: m.LeaderboardSheet })))

/**
 * Вкладка «Прогресс» — хаб геймификации: уровень, серия, магазин, рейтинг,
 * задания, друзья.
 *
 * 2.0: вместо бенто-плиток 2×2 с нарисованными обложками — одна группа строк, и
 * у каждой строки справа данные: сколько монет, какое место, сколько титулов.
 * Картинка на плитке ничего не сообщала, а за цифрой приходили — и её как раз
 * не было видно.
 */
export function RewardsPage() {
  const t = useT()
  const lang = useStore((s) => s.lang)
  const transactions = useStore((s) => s.transactions)
  const coins = useStore((s) => s.coins)
  const claimedQuests = useStore((s) => s.claimedQuests)
  const claimQuest = useStore((s) => s.claimQuest)
  const track = useStore((s) => s.track)
  const streak = useStore((s) => s.streak)
  const questClaims = useStore((s) => s.questClaims)
  // Метрики заданий: счётчики действий и «поведенческие» показатели.
  const events = useStore((s) => s.events)
  const categoriesUsed = useStore(selectCategoriesUsed)
  const logDays = useStore(selectLogDayStreak)
  const goalsReached = useStore(selectGoalsReached)
  const budgetKept = useStore(selectBudgetMonthKept)
  const lvl = useLevel()
  const skin = useHeroSkin()
  const reconcileReferralRewards = useStore((s) => s.reconcileReferralRewards)

  const [referral, setReferral] = useState<{ count: number; friends: ReferralFriend[] } | null>(null)
  // Вложенный экран вкладки: Магазин или Титулы. `back` — вернулись на хаб
  // (он въезжает слева, как в нативной навигации).
  const [view, setView] = useState<{ screen: 'hub' | 'shop' | 'titles'; back: boolean }>({ screen: 'hub', back: false })
  const shopOpen = view.screen === 'shop'
  const levelRewardsOpen = view.screen === 'titles'
  const setShopOpen = (open: boolean) => setView({ screen: open ? 'shop' : 'hub', back: !open })
  const setLevelRewardsOpen = (open: boolean) => setView({ screen: open ? 'titles' : 'hub', back: !open })
  // Прокрутка хаба: вернулся из Магазина — хаб там же, где был.
  const hubScroll = useRef(0)
  const [leaderboardOpen, setLeaderboardOpen] = useState(false)
  const seenLeaderboard = useRef(false)
  if (leaderboardOpen) seenLeaderboard.current = true
  const rank = useMyRank()

  // Подписка на канал (задание subscribe_channel) — проверяет бот через getChatMember.
  const [subscribed, setSubscribed] = useState(false)
  const recheckSub = () => {
    checkSubscription().then(setSubscribed).catch(() => {})
  }
  useEffect(() => {
    recheckSub()
    // Вернулись из канала во вкладку — перепроверяем подписку.
    const onVis = () => { if (document.visibilityState === 'visible') recheckSub() }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  useEffect(() => {
    if (!isBackendConfigured()) return
    let alive = true
    getReferralStats()
      .then((r) => {
        if (!alive || !r.ok) return
        setReferral({ count: r.referrals, friends: r.friends ?? [] })
        reconcileReferralRewards(r.referrals) // фикс-награда за каждого нового друга
      })
      .catch(() => {})
    return () => { alive = false }
  }, [reconcileReferralRewards])

  // Закрепляем статистику участника в таблице лидеров (только геймификация, без сумм).
  const equipped = useStore((s) => s.equipped)
  useEffect(() => {
    if (!isBackendConfigured() || !tg.isInTelegram) return
    submitProfile({
      xp: lvl.xp,
      level: lvl.level,
      ops: transactions.length,
      coins,
      streakBest: streak.best,
      title: equipped.title,
      frame: equipped.frame,
      accent: equipped.accent,
    }).catch(() => {})
  }, [lvl.xp, lvl.level, transactions.length, coins, streak.best, equipped.title, equipped.frame, equipped.accent])

  const metrics = {
    transactions: transactions.length,
    referrals: referral?.count ?? 0,
    subscribed,
    events,
    streak: Math.max(streak.count, streak.best),
    categories: categoriesUsed,
    logDays,
    goalsReached,
    budgetKept,
  }
  // Борд-конвейер: показываем только ближайшие невыполненные задания, забранные
  // уходят и уступают место следующим (см. questBoard).
  // `now` тикает, только пока на борде есть перезаряжающийся слот — без этого
  // таймер замер бы до следующей перерисовки страницы.
  const now = useCountdownTick(questClaims)
  const mainSlots = questBoard(metrics, claimedQuests, questClaims, 'main', now)
  const specialSlots = questBoard(metrics, claimedQuests, questClaims, 'special', now)
  const mainLeft = questsLeft(claimedQuests, 'main')
  const claimable = mainSlots.filter((s) => s.kind === 'quest' && s.quest.claimable).length
  const claimableSpecial = specialSlots.filter((s) => s.kind === 'quest' && s.quest.claimable).length
  // Готовых два и больше — одна брендовая «Забрать всё», у строк кнопки тихие.
  const manyReady = claimable + claimableSpecial >= 2

  // Награда — с полётом монеток к счётчику «Магазина» и всплывающим «+XP».
  const celebrate = (from: Element | null, xp: number, coins: number) => {
    if (!from) return
    floatText(from, `+${xp} XP`)
    flyCoins(from, Math.min(9, 3 + Math.round(coins / 5)))
  }

  const onClaim = (q: QuestProgress, from: Element | null = null) => {
    if (!q.claimable) return
    hapticNotify('success')
    celebrate(from, q.def.xp, q.def.coins)
    claimQuest(q.def.id, q.def.xp, q.def.coins)
  }

  // Подписка: открыть канал и через момент перепроверить членство.
  const onSubscribe = (q: QuestProgress) => {
    if (q.def.actionUrl) openTelegramLink(q.def.actionUrl)
    setTimeout(recheckSub, 1500)
  }

  // Всё готовое к получению — одним нажатием: восемь одинаковых зелёных
  // «Забрать» подряд превращали список в стену кнопок.
  const claimAllRef = useRef<HTMLButtonElement>(null)
  const claimAll = () => {
    const ready = [...mainSlots, ...specialSlots]
      .filter((s): s is Extract<typeof s, { kind: 'quest' }> => s.kind === 'quest' && s.quest.claimable)
      .map((s) => s.quest)
    if (ready.length === 0) return
    hapticNotify('success')
    const xp = ready.reduce((sum, q) => sum + q.def.xp, 0)
    const coinsSum = ready.reduce((sum, q) => sum + q.def.coins, 0)
    celebrate(claimAllRef.current, xp, coinsSum)
    for (const q of ready) claimQuest(q.def.id, q.def.xp, q.def.coins)
  }

  const openShop = () => {
    track('open_achievements')
    hubScroll.current = window.scrollY
    setShopOpen(true)
  }
  const openTitles = () => {
    hubScroll.current = window.scrollY
    setLevelRewardsOpen(true)
  }

  // Вложенный экран открывается с начала, хаб — там, где его оставили.
  useLayoutEffect(() => {
    window.scrollTo(0, view.screen === 'hub' ? hubScroll.current : 0)
  }, [view.screen])

  // Системная «Назад» Telegram возвращает из Магазина и Титулов на хаб.
  useBackButton(view.screen !== 'hub', () => setView({ screen: 'hub', back: true }))
  const openLeaderboard = () => { track('open_leaderboard'); setLeaderboardOpen(true) }

  // Титулы уровня: сколько получено и сколько можно забрать прямо сейчас. Условий
  // два — уровень и рекорд серии; раньше счётчик смотрел только на уровень и
  // обещал новичку «+1», который на экране титулов оказывался закрытым.
  const owned = useStore((s) => s.owned)
  const titlesOwned = LEVEL_REWARDS.filter((r) => owned.includes(r.id)).length
  const titlesReady = LEVEL_REWARDS.filter(
    (r) => !owned.includes(r.id) && lvl.level >= r.unlockLevel && streak.best >= (r.unlockDays ?? 0),
  ).length

  // Магазин и Титулы уровня — полноэкранные под-виды этой же вкладки (TabBar
  // остаётся снизу). Въезжают «вглубь», хаб при возврате — слева.
  if (shopOpen)
    return (
      <div className="tab-in-deep">
        <ShopScreen onBack={() => setShopOpen(false)} />
      </div>
    )
  if (levelRewardsOpen)
    return (
      <div className="tab-in-deep">
        <LevelRewardsScreen onBack={() => setLevelRewardsOpen(false)} />
      </div>
    )

  return (
    <div className={`pb-28 ${view.back ? 'tab-in-back' : ''}`}>
      <div className="px-5 pb-1 pt-6">
        <div className="kicker">{t('rewards.kicker')}</div>
        <div className="mt-0.5 text-2xl font-bold tracking-tight text-ink">{t('nav.rewards')}</div>
      </div>

      {/* Уровень. Монеты и серия отсюда ушли в строки ниже — там у них есть
          действие, а в герое они были третьим и четвёртым числом на плашке. */}
      <div className={`hero-surface mx-4 mt-3 overflow-hidden rounded-4xl p-5 ${skin}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <RewardBadge level={lvl.level} size={44} glass />
            <div className="min-w-0 leading-tight">
              <div className="truncate text-lg font-extrabold">{t('level.t' + lvl.level)}</div>
              <div className="caption mt-0.5 text-white/60">
                {t('profile.level', { level: lvl.level, max: LEVELS.length })}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-baseline gap-1">
            <span className="text-[28px] font-extrabold leading-none tabular-nums">
              <Odometer text={lvl.xp.toLocaleString('ru-RU')} />
            </span>
            <span className="caption text-white/60">XP</span>
          </div>
        </div>

        {/* Полоса — обычный div с CSS-переходом: число на ней — данные, и
            застрять на нулевой ширине из-за остановленного rAF она не должна. */}
        <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-white/15">
          <div
            className="grow-x h-full rounded-full bg-white transition-[width] duration-700"
            style={{ width: `${Math.round(lvl.ratio * 100)}%` }}
          />
        </div>
        <div className="caption mt-2 tabular-nums text-white/70">
          {lvl.isMax
            ? t('profile.max_level')
            : t('profile.xp_progress', { into: lvl.xpIntoLevel, need: lvl.xpForLevel, toNext: lvl.toNext })}
        </div>
      </div>

      <Group className="mx-4 mt-4">
        <StreakRow />
        <Row
          icon={<ShoppingBag size={18} strokeWidth={2} />}
          title={t('shop.title')}
          value={
            // Сюда прилетают монетки после «Забрать» (data-coin-target).
            <span data-coin-target className="inline-block text-ink-muted">
              <Odometer text={coins.toLocaleString('ru-RU')} /> {coinsWord(lang, coins)}
            </span>
          }
          chevron
          onClick={openShop}
        />
        <Row
          icon={<Trophy size={18} strokeWidth={2} />}
          title={t('profile.leaderboard')}
          value={
            rank ? (
              <span className="text-ink-muted">
                {rank.total >= rank.rank
                  ? t('progress.rank', { rank: rank.rank, total: rank.total })
                  : t('progress.rank_only', { rank: rank.rank })}
              </span>
            ) : undefined
          }
          chevron
          onClick={openLeaderboard}
        />
        <Row
          icon={<Crown size={18} strokeWidth={2} />}
          title={t('lvlrew.title')}
          value={
            titlesReady > 0 ? (
              <span className="text-brand-600 dark:text-brand-300">{t('profile.claimable', { n: titlesReady })}</span>
            ) : (
              <span className="text-ink-muted">
                {t('progress.of', { n: titlesOwned, total: LEVEL_REWARDS.length })}
              </span>
            )
          }
          chevron
          onClick={openTitles}
        />
      </Group>

      <Group
        className="mx-4 mt-6"
        title={t('profile.quests')}
        action={
          manyReady ? (
            <button
              ref={claimAllRef}
              type="button"
              onClick={claimAll}
              className="press sheen -my-1 rounded-full bg-brand-500 px-3 py-1 text-[13px] font-bold text-white"
            >
              {t('quest.claim_all', { n: claimable + claimableSpecial })}
            </button>
          ) : claimable > 0 ? (
            <span className="font-semibold text-brand-600 dark:text-brand-300">
              {t('profile.claimable', { n: claimable })}
            </span>
          ) : mainLeft > BOARD_SIZE ? (
            t('quest.left', { n: Math.max(0, mainLeft - mainSlots.length) })
          ) : undefined
        }
      >
        <QuestRows slots={mainSlots} now={now} t={t} onClaim={onClaim} onAction={onSubscribe} quiet={manyReady} />
      </Group>

      {/* Друзья: задания за приглашения, ссылка и кто уже пришёл. Пустой борд
          приглашений не показываем — под заголовком «Друзья» фраза «все задания
          выполнены» читалась бы как ошибка. */}
      <ReferralBlock
        count={referral?.count ?? null}
        friends={referral?.friends ?? []}
        quests={specialSlots.length > 0 && <QuestRows slots={specialSlots} now={now} t={t} onClaim={onClaim} quiet={manyReady} />}
        t={t}
      />

      <Suspense fallback={null}>
        {seenLeaderboard.current && <LeaderboardSheet open={leaderboardOpen} onClose={() => setLeaderboardOpen(false)} />}
      </Suspense>
    </div>
  )
}

/**
 * Место в рейтинге по XP для строки «Таблица лидеров».
 *
 * Запрос один на сессию: место меняется медленно, а вкладку открывают много
 * раз — каждое открытие не должно стоить запроса к воркеру. Вне Telegram
 * рейтинга нет, и строка остаётся без значения.
 */
let rankRequest: Promise<{ rank: number; total: number } | null> | null = null

function useMyRank() {
  const [rank, setRank] = useState<{ rank: number; total: number } | null>(null)
  useEffect(() => {
    if (!isBackendConfigured() || !tg.isInTelegram) return
    let alive = true
    rankRequest ??= getLeaderboard()
      .then((r) => (r.ok && r.xp.me ? { rank: r.xp.me.rank, total: r.total } : null))
      .catch(() => {
        rankRequest = null // сбой сети — попробуем при следующем открытии
        return null
      })
    rankRequest.then((r) => { if (alive) setRank(r) })
    return () => { alive = false }
  }, [])
  return rank
}

/**
 * Тик раз в полминуты, пока на борде есть перезаряжающийся слот. Без него таймер
 * замер бы до следующей перерисовки страницы. Когда перезарядок нет, интервал не
 * заводится — лишних перерисовок вкладки не будет.
 */
function useCountdownTick(questClaims: Record<string, number>): number {
  const [now, setNow] = useState(() => Date.now())
  const cooling = Object.values(questClaims).some((at) => at + QUEST_COOLDOWN_MS > now)

  useEffect(() => {
    // Сразу подтягиваем время: страница могла провисеть открытой несколько часов.
    setNow(Date.now())
    if (!cooling) return
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [cooling, questClaims])

  return now
}
