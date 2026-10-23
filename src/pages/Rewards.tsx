import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Coins } from 'lucide-react'
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
  NO_SUB,
  type SubStatus,
  type ReferralFriend,
} from '../lib/api'
import { useLevel } from '../components/LevelBar'
import { LEVELS } from '../lib/levels'
import {
  questBoard,
  questsLeft,
  limitedQuest,
  openLimited,
  boardCooling,
  BOARD_SIZE,
  type QuestProgress,
} from '../lib/quests'
import { useT } from '../lib/i18n'
import { Group } from '../components/ui/Group'
import { StreakTile } from '../components/rewards/StreakTile'
import { Tile, TileBadge } from '../components/ui/Tile'
import { QuestRows } from '../components/rewards/QuestRow'
import { LimitedQuestCard } from '../components/rewards/LimitedQuest'
import { showToast } from '../lib/toast'
import { ReferralBlock } from '../components/rewards/ReferralBlock'
import { ShopScreen } from './Shop'
import { LevelRewardsScreen } from './LevelRewards'
import { DAILY_DISCOUNT_PCT, LEVEL_REWARDS } from '../lib/rewards'
import { RewardBadge } from '../components/rewards/RewardBadge'
import { Odometer } from '../components/ui/Odometer'
import { flyCoins, floatText, replay } from '../lib/fx'
import { useBackButton } from '../lib/useBackButton'
import { onRewardsReset, rewardsNav, type RewardsScreen } from '../lib/rewardsNav'
import { useHeroSkin } from '../lib/useHeroSkin'
import { useTabActive } from '../lib/tabActive'

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

  // Вкладка может быть отрисована скрытой рядом с открытой (свайп, см. App):
  // тогда она не ходит в сеть «при открытии», не трогает прокрутку и «Назад».
  const active = useTabActive()
  const [referral, setReferral] = useState<{ count: number; friends: ReferralFriend[] } | null>(null)
  // Вложенный экран вкладки: Магазин или Титулы. `enter` — как он появился:
  // вглубь (справа), назад на хаб (слева, как в нативной навигации) или без
  // своей анимации — когда вкладка просто открылась заново.
  // Открытый под-экран переживает уход с вкладки (см. lib/rewardsNav).
  const [view, setView] = useState<{ screen: RewardsScreen; enter: 'none' | 'deep' | 'back' }>(() => ({
    screen: rewardsNav.screen,
    enter: 'none',
  }))
  useEffect(() => {
    rewardsNav.screen = view.screen
  }, [view.screen])
  // Повторный тап по вкладке «Прогресс» из Магазина — назад на хаб (как в iOS).
  useEffect(
    () => onRewardsReset(() => setView((v) => (v.screen === 'hub' ? v : { screen: 'hub', enter: 'back' }))),
    [],
  )
  const shopOpen = view.screen === 'shop'
  const levelRewardsOpen = view.screen === 'titles'
  const goTo = (screen: RewardsScreen) => setView({ screen, enter: screen === 'hub' ? 'back' : 'deep' })
  const [leaderboardOpen, setLeaderboardOpen] = useState(false)
  const seenLeaderboard = useRef(false)
  if (leaderboardOpen) seenLeaderboard.current = true
  const rank = useMyRank()

  // Подписки на каналы (subscribe_channel и особое fan_channel) — проверяет бот
  // через getChatMember. Пока особое задание на экране, проверка — ещё и шаг его
  // воронки для аналитики ('saw'; нажатие «Подписаться» — 'click').
  const [sub, setSub] = useState<SubStatus>(NO_SUB)
  const recheckSub = (fan?: 'click') => {
    const shown = openLimited(useStore.getState().claimedQuests)
    checkSubscription(shown ? (fan ?? 'saw') : undefined).then(setSub).catch(() => {})
  }
  useEffect(() => {
    if (!active) return
    recheckSub()
    // Вернулись из канала во вкладку — перепроверяем подписку.
    const onVis = () => { if (document.visibilityState === 'visible') recheckSub() }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [active])

  useEffect(() => {
    if (!active || !isBackendConfigured()) return
    let alive = true
    getReferralStats()
      .then((r) => {
        if (!alive || !r.ok) return
        setReferral({ count: r.referrals, friends: r.friends ?? [] })
        reconcileReferralRewards(r.referrals) // фикс-награда за каждого нового друга
      })
      .catch(() => {})
    return () => { alive = false }
  }, [active, reconcileReferralRewards])

  // Закрепляем статистику участника в таблице лидеров (только геймификация, без сумм).
  const equipped = useStore((s) => s.equipped)
  useEffect(() => {
    if (!active || !isBackendConfigured() || !tg.isInTelegram) return
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
  }, [active, lvl.xp, lvl.level, transactions.length, coins, streak.best, equipped.title, equipped.frame, equipped.accent])

  const metrics = {
    transactions: transactions.length,
    referrals: referral?.count ?? 0,
    subscribed: sub.subscribed,
    subscribedUpdates: sub.updates,
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
  // Опыт вырос (забрал задание или серию) — жетон уровня подпрыгивает.
  const badgeRef = useRef<HTMLDivElement>(null)
  const prevXp = useRef(lvl.xp)
  useEffect(() => {
    if (lvl.xp > prevXp.current) replay(badgeRef.current, 'badge-bump')
    prevXp.current = lvl.xp
  }, [lvl.xp])

  const celebrate = (from: Element | null, xp: number, coins: number) => {
    if (!from) return
    floatText(from, `+${xp} XP`)
    if (coins > 0) flyCoins(from, Math.min(9, 3 + Math.round(coins / 5)))
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

  // Особое задание: своя карточка над бордом, пока идёт его время. Таймер
  // карточки по окончании перерисовывает вкладку — и карточка уходит.
  const [, setLimitedEnded] = useState(0)
  const fanQuest = limitedQuest(metrics, claimedQuests)
  const equipReward = useStore((s) => s.equipReward)
  // Канал — по ссылке «из приложения» (Telegram считает вступивших по ней).
  const onFanSubscribe = (q: QuestProgress) => {
    const url = sub.link ?? q.def.actionUrl
    if (url) openTelegramLink(url)
    recheckSub('click')
    setTimeout(recheckSub, 1500)
  }
  const onFanClaim = (q: QuestProgress, from: Element | null) => {
    if (!q.claimable) return
    hapticNotify('success')
    celebrate(from, q.def.xp, q.def.coins)
    claimQuest(q.def.id, q.def.xp, q.def.coins, q.def.reward)
    const reward = q.def.reward
    if (reward)
      showToast({
        icon: 'gift',
        text: t('quest.fan_toast'),
        action: { label: t('quest.fan_wear'), run: () => equipReward('title', reward) },
      })
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
    rewardsNav.hubScroll = window.scrollY
    goTo('shop')
  }
  const openTitles = () => {
    rewardsNav.hubScroll = window.scrollY
    goTo('titles')
  }

  // Вложенный экран открывается с начала, хаб — там, где его оставили. Только
  // при переходе внутри вкладки: при открытии самой вкладки прокрутку ставит
  // App, и этот эффект (он срабатывает раньше App) её бы сбил.
  const shownScreen = useRef(view.screen)
  useLayoutEffect(() => {
    if (shownScreen.current === view.screen) return
    shownScreen.current = view.screen
    if (active) window.scrollTo(0, view.screen === 'hub' ? rewardsNav.hubScroll : 0)
  }, [view.screen, active])

  // Системная «Назад» Telegram возвращает из Магазина и Титулов на хаб.
  useBackButton(active && view.screen !== 'hub', () => goTo('hub'))
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
  const deep = view.enter === 'deep' ? 'tab-in-deep' : ''
  if (shopOpen)
    return (
      <div className={deep}>
        <ShopScreen onBack={() => goTo('hub')} />
      </div>
    )
  if (levelRewardsOpen)
    return (
      <div className={deep}>
        <LevelRewardsScreen onBack={() => goTo('hub')} />
      </div>
    )

  return (
    <div className={`pb-28 ${view.enter === 'back' ? 'tab-in-back' : ''}`}>
      <div className="px-5 pb-1 pt-6">
        <div className="kicker">{t('rewards.kicker')}</div>
        <div className="mt-0.5 text-2xl font-bold tracking-tight text-ink">{t('nav.rewards')}</div>
      </div>

      {/* Уровень. Монеты и серия отсюда ушли в строки ниже — там у них есть
          действие, а в герое они были третьим и четвёртым числом на плашке. */}
      <div className={`hero-surface mx-4 mt-3 overflow-hidden rounded-4xl p-5 ${skin}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {/* Жетон цветной (как в 2.0 — «стеклянный» из первой сборки 2.1 читался
                как выключенный). При открытии «приземляется», при начислении опыта
                подпрыгивает, и по нему пробегает блик (перемонтаж по key). */}
            <div ref={badgeRef} className="badge-land shrink-0">
              <RewardBadge key={lvl.xp} level={lvl.level} size={44} shine />
            </div>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-lg font-extrabold">{t('level.t' + lvl.level)}</div>
              <div className="caption mt-0.5 whitespace-nowrap text-white/60">
                {t('profile.level', { level: lvl.level, max: LEVELS.length })}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-baseline gap-1">
            <span className="text-[28px] font-extrabold leading-none tabular-nums max-[359px]:text-[24px]">
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

      {/* Плитки 2×2: Магазин · Рейтинг · Серия · Титулы. В 2.0 их заменили
          строками, в 2.1 вернули — с живыми сценами и с данными на каждой. */}
      <div className="stagger mx-4 mt-4 grid grid-cols-2 gap-3">
        <Tile
          scene="coins"
          accent="amber"
          title={t('shop.title')}
          // Неразрывные пробелы: на 320 px «−30%» не отрывается от «Витрина дня».
          subtitle={t('shop.featured') + '\u00a0·\u00a0−' + DAILY_DISCOUNT_PCT + '%'}
          badge={
            <TileBadge>
              {/* Сюда прилетают монетки после «Забрать» (data-coin-target). */}
              <span data-coin-target className="inline-flex items-center gap-1">
                <Coins size={12} strokeWidth={2.6} />
                <Odometer text={coins.toLocaleString('ru-RU')} />
              </span>
            </TileBadge>
          }
          onClick={openShop}
        />
        <Tile
          scene="podium"
          accent="sky"
          title={t('profile.leaderboard')}
          subtitle={
            rank
              ? rank.total >= rank.rank
                ? t('progress.rank', { rank: rank.rank, total: rank.total })
                : t('progress.rank_only', { rank: rank.rank })
              : undefined
          }
          onClick={openLeaderboard}
        />
        <StreakTile />
        <Tile
          scene="crown"
          accent="violet"
          title={t('lvlrew.title')}
          subtitle={t('progress.of', { n: titlesOwned, total: LEVEL_REWARDS.length })}
          badge={
            titlesReady > 0 ? (
              <TileBadge className="text-brand-600 dark:text-brand-300">+{titlesReady}</TileBadge>
            ) : undefined
          }
          onClick={openTitles}
        />
      </div>

      {fanQuest && (
        <LimitedQuestCard
          q={fanQuest}
          t={t}
          onAction={() => onFanSubscribe(fanQuest)}
          onClaim={(from) => onFanClaim(fanQuest, from)}
          onExpire={() => setLimitedEnded((n) => n + 1)}
        />
      )}

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
  const cooling = boardCooling(questClaims, now)

  useEffect(() => {
    // Сразу подтягиваем время: страница могла провисеть открытой несколько часов.
    setNow(Date.now())
    if (!cooling) return
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [cooling, questClaims])

  return now
}
