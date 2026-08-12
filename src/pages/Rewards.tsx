import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { m } from 'framer-motion'
import { ShoppingBag, Medal, Crown } from 'lucide-react'
import { useStore } from '../store/transactions'
import { tg, hapticNotify, openTelegramLink } from '../lib/telegram'
import { getReferralStats, submitProfile, isBackendConfigured, checkSubscription, type ReferralFriend } from '../lib/api'
import { useLevel } from '../components/LevelBar'
import { LEVELS } from '../lib/levels'
import { allQuestProgress, type QuestProgress } from '../lib/quests'
import { useT } from '../lib/i18n'
import { Tile } from '../components/ui/Tile'
import { StreakTile } from '../components/rewards/StreakTile'
import { QuestCard } from '../components/rewards/QuestCard'
import { ReferralBlock } from '../components/rewards/ReferralBlock'
import { ShopScreen } from './Shop'
import { LevelRewardsScreen } from './LevelRewards'
import { LEVEL_REWARDS } from '../lib/rewards'
import { RewardBadge } from '../components/rewards/RewardBadge'

// Таблица лидеров — отдельным чанком, грузится по первому открытию.
const LeaderboardSheet = lazy(() => import('../components/LeaderboardSheet').then((m) => ({ default: m.LeaderboardSheet })))

/** Вкладка «Награды» — хаб геймификации: уровень/XP, задания, достижения, лидеры, рефералы. */
export function RewardsPage() {
  const t = useT()
  const transactions = useStore((s) => s.transactions)
  const coins = useStore((s) => s.coins)
  const claimedQuests = useStore((s) => s.claimedQuests)
  const claimQuest = useStore((s) => s.claimQuest)
  const track = useStore((s) => s.track)
  const streak = useStore((s) => s.streak)
  const lvl = useLevel()
  const reconcileReferralRewards = useStore((s) => s.reconcileReferralRewards)

  const [referral, setReferral] = useState<{ count: number; friends: ReferralFriend[] } | null>(null)
  const [shopOpen, setShopOpen] = useState(false)
  const [levelRewardsOpen, setLevelRewardsOpen] = useState(false)
  const [leaderboardOpen, setLeaderboardOpen] = useState(false)
  const seenLeaderboard = useRef(false)
  if (leaderboardOpen) seenLeaderboard.current = true

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
  }, [lvl.xp, lvl.level, transactions.length, coins, streak.best, equipped])

  const metrics = {
    transactions: transactions.length,
    referrals: referral?.count ?? 0,
    subscribed,
  }
  const quests = allQuestProgress(metrics, claimedQuests)
  const mainQuests = quests.filter((q) => q.def.group === 'main')
  const specialQuests = quests.filter((q) => q.def.group === 'special')
  const claimable = quests.filter((q) => q.claimable).length

  const onClaim = (q: QuestProgress) => {
    if (!q.claimable) return
    hapticNotify('success')
    claimQuest(q.def.id, q.def.xp, q.def.coins)
  }

  // Подписка: открыть канал и через момент перепроверить членство.
  const onSubscribe = (q: QuestProgress) => {
    if (q.def.actionUrl) openTelegramLink(q.def.actionUrl)
    setTimeout(recheckSub, 1500)
  }

  const openShop = () => { track('open_achievements'); setShopOpen(true) }
  const openLeaderboard = () => { track('open_leaderboard'); setLeaderboardOpen(true) }

  // Титулы уровня, которые уже можно забрать (для бейджа плитки).
  const owned = useStore((s) => s.owned)
  const claimableTitles = LEVEL_REWARDS.filter(
    (r) => lvl.level >= r.unlockLevel && !owned.includes(r.id),
  ).length

  // Магазин и Титулы уровня — полноэкранные под-виды этой же вкладки (TabBar остаётся снизу).
  if (shopOpen) return <ShopScreen onBack={() => setShopOpen(false)} />
  if (levelRewardsOpen) return <LevelRewardsScreen onBack={() => setLevelRewardsOpen(false)} />

  return (
    <div className="pb-24">
      <div className="px-6 pt-6 pb-1">
        <div className="text-xs font-semibold uppercase tracking-widest text-ink-subtle">{t('rewards.kicker')}</div>
        <div className="mt-0.5 text-2xl font-bold tracking-tight text-ink">{t('nav.rewards')}</div>
      </div>

      {/* Level hero */}
      <div className="mx-4 mt-3 overflow-hidden rounded-4xl bg-gradient-to-br from-brand-500 to-brand-700 p-5 text-white shadow-soft">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <RewardBadge level={lvl.level} size={48} />
            <div className="leading-tight">
              <div className="text-lg font-extrabold">{t('level.t' + lvl.level)}</div>
              <div className="text-[11px] text-white/70">{t('profile.level', { level: lvl.level, max: LEVELS.length })}</div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-extrabold tabular">{lvl.xp.toLocaleString('ru-RU')}</span>
              <span className="text-[10px] text-white/70">XP</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-bold tabular">
                🪙 {coins.toLocaleString('ru-RU')}
              </span>
              {streak.count > 0 && (
                <span className="flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-bold tabular">
                  🔥 {streak.count}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/20">
          <m.div
            className="h-full rounded-full bg-white"
            initial={{ width: 0 }}
            animate={{ width: `${Math.round(lvl.ratio * 100)}%` }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
        <div className="mt-1.5 text-[11px] text-white/80">
          {lvl.isMax
            ? t('profile.max_level')
            : t('profile.xp_progress', { into: lvl.xpIntoLevel, need: lvl.xpForLevel, toNext: lvl.toNext })}
        </div>
      </div>

      {/* Бенто-плитки 2×2: Магазин · Лидеры · Серия · De-Fi */}
      <div className="mx-4 mt-3 grid grid-cols-2 gap-3">
        <Tile
          icon={<ShoppingBag size={26} strokeWidth={2} />}
          title={t('shop.title')}
          subtitle={t('shop.subtitle')}
          accent="amber"
          badge={
            <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[11px] font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
              🪙 {coins.toLocaleString('ru-RU')}
            </span>
          }
          onClick={openShop}
        />
        <Tile
          icon={<Medal size={26} strokeWidth={2} />}
          title={t('profile.leaderboard')}
          subtitle={t('profile.leaderboard_hint')}
          accent="yellow"
          badge={
            <span className="rounded-full bg-yellow-100 px-2 py-1 text-[11px] font-bold text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300">
              {lvl.badge}
            </span>
          }
          onClick={openLeaderboard}
        />
        <StreakTile />
        <Tile
          icon={<Crown size={26} strokeWidth={2} />}
          title={t('lvlrew.title')}
          subtitle={t('lvlrew.subtitle')}
          accent="violet"
          badge={
            claimableTitles > 0 ? (
              <span className="rounded-full bg-violet-100 px-2 py-1 text-[11px] font-bold text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                +{claimableTitles}
              </span>
            ) : (
              <span className="rounded-full bg-violet-100 px-2 py-1 text-[11px] font-bold text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                {lvl.badge}
              </span>
            )
          }
          onClick={() => setLevelRewardsOpen(true)}
        />
      </div>

      {/* Задания */}
      <div className="mx-4 mt-5">
        <div className="mb-2 flex items-center justify-between px-2">
          <span className="text-xs font-bold uppercase tracking-wider text-ink-subtle">{t('profile.quests')}</span>
          {claimable > 0 && (
            <span className="text-[11px] font-semibold text-brand-600 dark:text-brand-300">
              {t('profile.claimable', { n: claimable })}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          {mainQuests.map((q) => (
            <QuestCard key={q.def.id} q={q} onClaim={() => onClaim(q)} onAction={() => onSubscribe(q)} t={t} />
          ))}
        </div>
      </div>

      {/* Спешел — реферальные задания */}
      <div className="mx-4 mt-5">
        <div className="mb-2 px-2">
          <span className="text-xs font-bold uppercase tracking-wider text-ink-subtle">{t('rewards.special')}</span>
        </div>
        <div className="flex flex-col gap-2">
          {specialQuests.map((q) => (
            <QuestCard key={q.def.id} q={q} onClaim={() => onClaim(q)} t={t} />
          ))}
        </div>
      </div>

      {/* Рефералы — ссылка и список друзей */}
      <ReferralBlock count={referral?.count ?? null} friends={referral?.friends ?? []} t={t} />

      <Suspense fallback={null}>
        {seenLeaderboard.current && <LeaderboardSheet open={leaderboardOpen} onClose={() => setLeaderboardOpen(false)} />}
      </Suspense>
    </div>
  )
}
