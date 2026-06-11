import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { m } from 'framer-motion'
import { ClipboardCheck, Send, Check, ChevronRight, Trophy, Medal, Target, Hourglass } from 'lucide-react'
import {
  useStore,
  selectAllCategories,
  getCategory,
  selectCategoriesUsed,
  selectLogDayStreak,
  selectGoalsReached,
  selectBudgetMonthKept,
} from '../store/transactions'
import { formatMoney, dayjs } from '../lib/format'
import { Avatar } from '../components/Avatar'
import { openTelegramLink, hapticTap, hapticSelect, hapticNotify, tg } from '../lib/telegram'
import {
  sendFeedback,
  buildReferralLink,
  getReferralStats,
  submitProfile,
  isBackendConfigured,
  BOT_USERNAME,
  type ReferralFriend,
} from '../lib/api'
import { useLevel } from '../components/LevelBar'
import { LEVELS } from '../lib/levels'
import { allQuestProgress, type QuestProgress } from '../lib/quests'
import { getReward } from '../lib/rewards'
import { useT, type TFunc } from '../lib/i18n'

// Шторки профиля — отдельными чанками, грузятся по первому открытию.
const RoadpassSheet = lazy(() => import('../components/RoadpassSheet').then((m) => ({ default: m.RoadpassSheet })))
const LeaderboardSheet = lazy(() => import('../components/LeaderboardSheet').then((m) => ({ default: m.LeaderboardSheet })))
const PlanningSheet = lazy(() => import('../components/PlanningSheet').then((m) => ({ default: m.PlanningSheet })))

/** Человекочитаемая длительность остатка («2 ч 14 мин»). */
function formatDuration(ms: number, t: TFunc): string {
  const totalMin = Math.max(1, Math.ceil(ms / 60000))
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `${h} ${t('unit.h')} ${m} ${t('unit.m')}` : `${m} ${t('unit.m')}`
}

/** Запасной чат, если бэкенд не настроен. */
const FEEDBACK_FALLBACK_URL = `https://t.me/${BOT_USERNAME}`

/** Вкладка «Профиль»: аватар, уровень, достижения-магазин, статистика, задания. */
export function ProfilePage() {
  const t = useT()
  const transactions = useStore((s) => s.transactions)
  const cats = useStore(selectAllCategories)
  const currency = useStore((s) => s.currency)
  const coins = useStore((s) => s.coins)
  const claimedQuests = useStore((s) => s.claimedQuests)
  const questClaims = useStore((s) => s.questClaims)
  const events = useStore((s) => s.events)
  const claimQuest = useStore((s) => s.claimQuest)
  const track = useStore((s) => s.track)
  const equippedTitleId = useStore((s) => s.equipped.title)
  const streak = useStore((s) => s.streak)
  // Метрики финансовых заданий (по реальным данным).
  const categoriesUsed = useStore(selectCategoriesUsed)
  const logDays = useStore(selectLogDayStreak)
  const goalsReached = useStore(selectGoalsReached)
  const budgetMonth = useStore(selectBudgetMonthKept)
  const user = tg.user
  const lvl = useLevel()
  const eqTitleReward = getReward(equippedTitleId)
  const equippedTitle = eqTitleReward ? t('reward.' + eqTitleReward.id + '.name') : undefined

  const [referral, setReferral] = useState<{ count: number; friends: ReferralFriend[] } | null>(null)
  const [roadpassOpen, setRoadpassOpen] = useState(false)
  const [leaderboardOpen, setLeaderboardOpen] = useState(false)
  const [planningOpen, setPlanningOpen] = useState(false)
  // Монтируем шторку только после первого открытия (держим смонтированной — чтобы отыграла анимация закрытия).
  const seenRoadpass = useRef(false)
  const seenLeaderboard = useRef(false)
  const seenPlanning = useRef(false)
  if (roadpassOpen) seenRoadpass.current = true
  if (leaderboardOpen) seenLeaderboard.current = true
  if (planningOpen) seenPlanning.current = true
  const questsRef = useRef<HTMLDivElement>(null)

  // Тик раз в минуту — чтобы таймеры разблокировки квестов обновлялись и новые
  // задания «появлялись» без перезагрузки.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  const openRoadpass = () => {
    hapticTap()
    track('open_achievements')
    setRoadpassOpen(true)
  }

  useEffect(() => {
    if (!isBackendConfigured()) return
    let alive = true
    getReferralStats()
      .then((r) => { if (alive && r.ok) setReferral({ count: r.referrals, friends: r.friends ?? [] }) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  // Закрепляем статистику участника на сервере (для таблицы лидеров).
  // Финансовые суммы не отправляем — только геймификация.
  useEffect(() => {
    if (!isBackendConfigured() || !tg.isInTelegram) return
    submitProfile({
      xp: lvl.xp,
      level: lvl.level,
      ops: transactions.length,
      coins,
      streakBest: streak.best,
    }).catch(() => {})
  }, [lvl.xp, lvl.level, transactions.length, coins, streak.best])

  const metrics = {
    transactions: transactions.length,
    referrals: referral?.count ?? 0,
    streak: streak.best,
    events,
    categories: categoriesUsed,
    logDays,
    goalsReached,
    budgetMonth,
  }
  const quests = allQuestProgress(metrics, claimedQuests, questClaims, now)
  const claimable = quests.filter((q) => q.claimable).length

  const scrollToQuests = () => {
    hapticTap()
    questsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const onClaim = (q: QuestProgress) => {
    if (!q.claimable) return
    hapticNotify('success')
    claimQuest(q.def.id, q.def.xp, q.def.coins)
  }

  const name = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || t('profile.guest')
  const username = user?.username

  const stats = useMemo(() => {
    let income = 0
    let expense = 0
    const byCat = new Map<string, number>()
    let firstDate: string | null = null
    for (const t of transactions) {
      if (t.type === 'income') income += t.amount
      else {
        expense += t.amount
        byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) + t.amount)
      }
      if (!firstDate || t.date < firstDate) firstDate = t.date
    }
    let topCat: { name: string; color: string; icon: string; amount: number } | null = null
    for (const [id, amount] of byCat) {
      if (!topCat || amount > topCat.amount) {
        const c = getCategory(id, cats)
        topCat = { name: c.name, color: c.color, icon: c.icon, amount }
      }
    }
    return { income, expense, balance: income - expense, count: transactions.length, topCat, firstDate }
  }, [transactions, cats])

  return (
    <div className="pb-24">
      <div className="px-6 pt-6 pb-1">
        <div className="text-xs font-semibold uppercase tracking-widest text-ink-subtle">{t('profile.kicker')}</div>
        <div className="mt-0.5 text-base font-bold text-ink">{t('profile.title')}</div>
      </div>

      {/* User card */}
      <div className="flex flex-col items-center gap-2 px-6 pb-2 pt-2">
        <Avatar size={84} />
        <div className="text-center">
          <div className="text-lg font-bold text-ink">{name}</div>
          {username && <div className="text-sm text-ink-subtle">@{username}</div>}
          {equippedTitle && (
            <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-brand-100 px-2.5 py-0.5 text-[11px] font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
              {equippedTitle}
            </div>
          )}
          {!tg.isInTelegram && (
            <div className="mt-1 text-[11px] text-ink-subtle">{t('profile.open_in_tg')}</div>
          )}
        </div>
      </div>

      {/* Level card */}
      <div className="mx-4 mt-3 rounded-3xl bg-gradient-to-br from-brand-500 to-brand-700 p-4 text-white shadow-soft">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white/20 text-lg">
              {lvl.badge}
            </span>
            <div className="leading-tight">
              <div className="text-sm font-bold">{t('level.t' + lvl.level)}</div>
              <div className="text-[11px] text-white/70">{t('profile.level', { level: lvl.level, max: LEVELS.length })}</div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-baseline gap-1">
              <span className="text-base font-extrabold tabular">{lvl.xp}</span>
              <span className="text-[10px] text-white/70">XP</span>
            </div>
            <div className="flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5">
              <span className="text-[11px]">🪙</span>
              <span className="text-[11px] font-bold tabular">{coins.toLocaleString('ru-RU')}</span>
            </div>
          </div>
        </div>

        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/20">
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

      {/* Достижения → магазин наград + ежедневная серия */}
      <button
        onClick={openRoadpass}
        className="mx-4 mt-2 flex w-[calc(100%-2rem)] items-center gap-3 rounded-3xl bg-surface-sunken/60 p-3 text-left active:scale-[0.99]"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300">
          <Trophy size={20} strokeWidth={2} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            {t('profile.achievements')}
            {streak.count > 0 && <span className="text-[11px] font-bold text-amber-500">🔥 {streak.count}</span>}
          </div>
          <div className="text-[11px] text-ink-subtle">{t('profile.achievements_hint')}</div>
        </div>
        <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[11px] font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
          🪙 {coins.toLocaleString('ru-RU')}
        </span>
        <ChevronRight size={18} className="text-ink-subtle" />
      </button>

      {/* Таблица лидеров */}
      <button
        onClick={() => { hapticTap(); track('open_leaderboard'); setLeaderboardOpen(true) }}
        className="mx-4 mt-2 flex w-[calc(100%-2rem)] items-center gap-3 rounded-3xl bg-surface-sunken/60 p-3 text-left active:scale-[0.99]"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-yellow-100 text-yellow-600 dark:bg-yellow-500/15 dark:text-yellow-300">
          <Medal size={20} strokeWidth={2} />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-ink">{t('profile.leaderboard')}</div>
          <div className="text-[11px] text-ink-subtle">{t('profile.leaderboard_hint')}</div>
        </div>
        <span className="rounded-full bg-yellow-100 px-2 py-1 text-[11px] font-bold text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300">
          {lvl.badge} {lvl.xp.toLocaleString('ru-RU')} XP
        </span>
        <ChevronRight size={18} className="text-ink-subtle" />
      </button>

      {/* Планирование: бюджет / лимиты / цели */}
      <button
        onClick={() => { hapticTap(); track('open_planning'); setPlanningOpen(true) }}
        className="mx-4 mt-2 flex w-[calc(100%-2rem)] items-center gap-3 rounded-3xl bg-surface-sunken/60 p-3 text-left active:scale-[0.99]"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
          <Target size={20} strokeWidth={2} />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-ink">{t('profile.planning')}</div>
          <div className="text-[11px] text-ink-subtle">{t('profile.planning_hint')}</div>
        </div>
        <ChevronRight size={18} className="text-ink-subtle" />
      </button>

      {/* Quests summary row → скроллит к списку заданий */}
      <button
        onClick={scrollToQuests}
        className="mx-4 mt-2 flex w-[calc(100%-2rem)] items-center gap-3 rounded-3xl bg-surface-sunken/60 p-3 text-left active:scale-[0.99]"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
          <ClipboardCheck size={20} strokeWidth={2} />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-ink">{t('profile.quests')}</div>
          <div className="text-[11px] text-ink-subtle">{t('profile.quests_hint')}</div>
        </div>
        {claimable > 0 ? (
          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-brand-500 px-1.5 text-[11px] font-bold text-white">
            {claimable}
          </span>
        ) : (
          <ChevronRight size={18} className="text-ink-subtle" />
        )}
      </button>

      {/* Stats grid */}
      <div className="mx-4 mt-3 grid grid-cols-2 gap-2">
        <StatBox label={t('profile.income_total')} value={formatMoney(stats.income, currency, { compact: true })} tone="income" />
        <StatBox label={t('profile.expense_total')} value={formatMoney(stats.expense, currency, { compact: true })} tone="expense" />
        <StatBox label={t('profile.balance')} value={formatMoney(stats.balance, currency, { compact: true })} tone={stats.balance >= 0 ? 'income' : 'expense'} />
        <StatBox label={t('profile.ops')} value={String(stats.count)} tone="neutral" />
      </div>

      {stats.topCat && (
        <div className="mx-4 mt-2 flex items-center gap-3 rounded-3xl bg-surface-sunken/60 p-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-bold text-white"
            style={{ background: stats.topCat.color }}
          >
            №1
          </div>
          <div className="flex-1">
            <div className="text-[11px] font-bold uppercase tracking-wider text-ink-subtle">{t('profile.top_expense')}</div>
            <div className="font-semibold text-ink">{stats.topCat.name}</div>
          </div>
          <div className="tabular text-sm font-bold text-expense-deep">
            {formatMoney(stats.topCat.amount, currency, { compact: true })}
          </div>
        </div>
      )}

      {stats.firstDate && (
        <div className="mt-2 text-center text-[11px] text-ink-subtle">
          {t('profile.with_us_since', { date: dayjs(stats.firstDate).format('D MMMM YYYY') })}
        </div>
      )}

      {/* Quests list (цель прокрутки) */}
      <div ref={questsRef} className="mx-4 mt-5 scroll-mt-3">
        <div className="mb-2 flex items-center justify-between px-2">
          <span className="text-xs font-bold uppercase tracking-wider text-ink-subtle">{t('profile.quests')}</span>
          {claimable > 0 && (
            <span className="text-[11px] font-semibold text-brand-600 dark:text-brand-300">
              {t('profile.claimable', { n: claimable })}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          {quests.length === 0 ? (
            <div className="card flex items-center gap-3 p-4 text-[12px] text-ink-subtle">
              <Hourglass size={16} className="shrink-0 text-brand-500" />
              {t('quest.empty')}
            </div>
          ) : (
            quests.map((q) => (
              <QuestCard key={q.def.id} q={q} onClaim={() => onClaim(q)} t={t} now={now} />
            ))
          )}
        </div>
      </div>

      {/* Referral */}
      <ReferralBlock count={referral?.count ?? null} friends={referral?.friends ?? []} t={t} />

      {/* Feedback */}
      <FeedbackBlock t={t} />

      <Suspense fallback={null}>
        {seenRoadpass.current && <RoadpassSheet open={roadpassOpen} onClose={() => setRoadpassOpen(false)} />}
        {seenLeaderboard.current && <LeaderboardSheet open={leaderboardOpen} onClose={() => setLeaderboardOpen(false)} />}
        {seenPlanning.current && <PlanningSheet open={planningOpen} onClose={() => setPlanningOpen(false)} />}
      </Suspense>
    </div>
  )
}

/* ---------- Реферальный блок ---------- */

function ReferralBlock({ count, friends, t }: { count: number | null; friends: ReferralFriend[]; t: TFunc }) {
  const [copied, setCopied] = useState(false)
  const link = buildReferralLink()

  const share = () => {
    hapticTap()
    const text = t('share.text')
    openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`)
  }

  const copy = async () => {
    hapticSelect()
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard недоступен */
    }
  }

  return (
    <div className="mx-4 mt-4">
      <div className="mb-2 flex items-center justify-between px-2">
        <span className="text-xs font-bold uppercase tracking-wider text-ink-subtle">{t('profile.invite_friends')}</span>
        {count !== null && (
          <span className="text-[11px] font-semibold text-brand-600 dark:text-brand-300">{t('profile.invited', { n: count })}</span>
        )}
      </div>
      <div className="card p-3">
        <p className="px-1 text-[12px] leading-relaxed text-ink-muted">
          {t('profile.invite_text')}
        </p>
        <div className="mt-2 flex gap-2">
          <button
            onClick={share}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-brand-500 px-4 py-3 text-sm font-bold text-white active:scale-[0.99]"
          >
            <Send size={18} strokeWidth={2} />
            {t('profile.share')}
          </button>
          <button
            onClick={copy}
            className="rounded-2xl bg-surface-sunken px-4 py-3 text-sm font-bold text-ink-muted active:scale-[0.99]"
          >
            {copied ? t('profile.copied') : t('profile.copy')}
          </button>
        </div>

        {friends.length > 0 && (
          <div className="mt-3 border-t border-surface-sunken pt-3">
            <div className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wider text-ink-subtle">
              {t('profile.who_joined')}
            </div>
            <div className="flex flex-col gap-1.5">
              {friends.map((f) => (
                <div key={f.id} className="flex items-center gap-2.5 rounded-2xl bg-surface-sunken/50 px-2.5 py-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                    {(f.name?.[0] ?? '?').toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ink">{f.name}</div>
                    {f.username && <div className="truncate text-[11px] text-ink-subtle">@{f.username}</div>}
                  </div>
                  <div className="shrink-0 text-[10px] text-ink-subtle">{dayjs(f.at).fromNow()}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ---------- Блок отзыва ---------- */

type SendState = 'idle' | 'sending' | 'sent' | 'error'

function FeedbackBlock({ t }: { t: TFunc }) {
  const [text, setText] = useState('')
  const [state, setState] = useState<SendState>('idle')

  const submit = async () => {
    const trimmed = text.trim()
    if (!trimmed || state === 'sending') return
    hapticTap()

    if (!isBackendConfigured()) {
      openTelegramLink(FEEDBACK_FALLBACK_URL)
      return
    }

    setState('sending')
    try {
      const r = await sendFeedback(trimmed)
      if (r.ok) {
        setState('sent')
        setText('')
        hapticNotify('success')
      } else {
        setState('error')
        hapticNotify('error')
      }
    } catch {
      setState('error')
      hapticNotify('error')
    }
  }

  return (
    <div className="mx-4 mt-4">
      <div className="mb-2 px-2 text-xs font-bold uppercase tracking-wider text-ink-subtle">{t('profile.feedback')}</div>
      <div className="card p-3">
        {state === 'sent' ? (
          <div className="flex items-center gap-2 px-1 py-2 text-sm font-medium text-income-deep">
            <Check size={18} strokeWidth={2.5} />
            {t('profile.feedback_thanks')}
          </div>
        ) : (
          <>
            <textarea
              value={text}
              onChange={(e) => { setText(e.target.value); if (state === 'error') setState('idle') }}
              rows={3}
              maxLength={1000}
              placeholder={t('profile.feedback_placeholder')}
              className="w-full resize-none rounded-2xl bg-surface-sunken/60 px-3 py-2.5 text-sm text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-brand-300"
            />
            {state === 'error' && (
              <div className="mt-1 px-1 text-[11px] text-expense-deep">{t('profile.feedback_error')}</div>
            )}
            <button
              onClick={submit}
              disabled={!text.trim() || state === 'sending'}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 px-4 py-3 text-sm font-bold text-white transition active:scale-[0.99] disabled:opacity-40"
            >
              {state === 'sending' ? t('profile.feedback_sending') : isBackendConfigured() ? t('profile.feedback_send') : t('profile.feedback_chat')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/* ---------- Карточка задания ---------- */

function QuestCard({ q, onClaim, t, now }: { q: QuestProgress; onClaim: () => void; t: TFunc; now: number }) {
  const { def, current, ratio, claimed, claimable, expiresAt, hasSuccessor } = q
  // У забранного задания — таймер до исчезновения; если есть преемник, он
  // откроется в этот же момент, поэтому подпись «Новое задание через …».
  const time = claimed && expiresAt ? formatDuration(expiresAt - now, t) : ''
  const subline = claimed
    ? hasSuccessor
      ? t('quest.next_in', { time })
      : t('quest.expires_in', { time })
    : t('quest.' + def.id + '.desc')
  return (
    <div className={`card p-3 transition-opacity ${claimed ? 'opacity-70' : ''}`}>
      <div className="flex items-center gap-3">
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-surface-sunken text-xl">
          {def.icon}
          {claimed && (
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-white">
              <Hourglass size={11} strokeWidth={2.6} />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-ink">{t('quest.' + def.id + '.title')}</div>
          <div className="truncate text-[11px] text-ink-subtle">{subline}</div>
        </div>
        <button
          onClick={onClaim}
          disabled={!claimable}
          className={`shrink-0 rounded-2xl px-3 py-2 text-xs font-bold transition active:scale-95 ${
            claimable ? 'bg-brand-500 text-white' : 'bg-surface-sunken text-ink-subtle'
          }`}
        >
          {claimed ? t('quest.received') : claimable ? t('quest.claim') : `${current}/${def.goal}`}
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
          +{def.xp} XP
        </span>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
          🪙 {def.coins.toLocaleString('ru-RU')}
        </span>
        <div className="ml-auto h-1.5 w-24 overflow-hidden rounded-full bg-surface-sunken">
          <m.div
            className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600"
            initial={{ width: 0 }}
            animate={{ width: `${Math.round(ratio * 100)}%` }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
      </div>
    </div>
  )
}

function StatBox({ label, value, tone }: { label: string; value: string; tone: 'income' | 'expense' | 'neutral' }) {
  const color = tone === 'income' ? 'text-income-deep' : tone === 'expense' ? 'text-expense-deep' : 'text-ink'
  return (
    <div className="card flex flex-col gap-0.5 p-3">
      <span className="text-[10px] font-bold uppercase tracking-wider text-ink-subtle">{label}</span>
      <span className={`tabular text-base font-bold ${color}`}>{value}</span>
    </div>
  )
}
