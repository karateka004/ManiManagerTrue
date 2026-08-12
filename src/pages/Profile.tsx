import { lazy, Suspense, useMemo, useRef, useState } from 'react'
import { m } from 'framer-motion'
import { Settings, Target, Check, ChevronRight, Sparkles } from 'lucide-react'
import { useStore, selectAllCategories, getCategory } from '../store/transactions'
import { formatMoney, dayjs } from '../lib/format'
import { Avatar } from '../components/Avatar'
import { openTelegramLink, hapticTap, hapticNotify } from '../lib/telegram'
import { tg } from '../lib/telegram'
import { sendFeedback, isBackendConfigured, BOT_USERNAME } from '../lib/api'
import { useLevel } from '../components/LevelBar'
import { LEVELS } from '../lib/levels'
import { getReward } from '../lib/rewards'
import { useT, type TFunc } from '../lib/i18n'
import { MenuRow } from '../components/ui/MenuRow'
import { RewardBadge } from '../components/rewards/RewardBadge'

import { APP_VERSION, VERSION_KEY, newReleasesSince } from '../lib/whatsnew'

// Планирование (финансы) — ленивая шторка, грузится по первому открытию.
const PlanningSheet = lazy(() => import('../components/PlanningSheet').then((m) => ({ default: m.PlanningSheet })))
// История обновлений — тоже лениво, открывается из строки «Обновления».
const ChangelogSheet = lazy(() => import('../components/ChangelogSheet').then((m) => ({ default: m.ChangelogSheet })))

/** Версия, до которой пользователь уже видел изменения (из localStorage). */
function readSeenVersion(): string {
  try {
    return localStorage.getItem(VERSION_KEY) ?? '0.0.0'
  } catch {
    return APP_VERSION
  }
}

/** Запасной чат, если бэкенд не настроен. */
const FEEDBACK_FALLBACK_URL = `https://t.me/${BOT_USERNAME}`

interface Props {
  onOpenSettings: () => void
  onOpenRewards: () => void
}

/** Вкладка «Профиль»: личность + финансовая статистика + планирование + отзыв. */
export function ProfilePage({ onOpenSettings, onOpenRewards }: Props) {
  const t = useT()
  const transactions = useStore((s) => s.transactions)
  const cats = useStore(selectAllCategories)
  const currency = useStore((s) => s.currency)
  const track = useStore((s) => s.track)
  const equippedTitleId = useStore((s) => s.equipped.title)
  const user = tg.user
  const lvl = useLevel()
  const eqTitleReward = getReward(equippedTitleId)
  const equippedTitle = eqTitleReward ? t('reward.' + eqTitleReward.id + '.name') : undefined

  const [planningOpen, setPlanningOpen] = useState(false)
  const seenPlanning = useRef(false)
  if (planningOpen) seenPlanning.current = true

  const openPlanning = () => {
    track('open_planning')
    setPlanningOpen(true)
  }

  // История обновлений: версия, до которой человек уже всё видел, и счётчик новых.
  const [seenVersion, setSeenVersion] = useState(readSeenVersion)
  const [changelogOpen, setChangelogOpen] = useState(false)
  const seenChangelog = useRef(false)
  if (changelogOpen) seenChangelog.current = true
  const unseenCount = useMemo(() => newReleasesSince(seenVersion).length, [seenVersion])

  const closeChangelog = () => {
    // Открыл раздел — значит изменения просмотрены, счётчик гаснет.
    try {
      localStorage.setItem(VERSION_KEY, APP_VERSION)
    } catch {
      /* приватный режим — переживём, счётчик просто появится снова */
    }
    setSeenVersion(APP_VERSION)
    setChangelogOpen(false)
  }

  const name = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || t('profile.guest')
  const username = user?.username

  const stats = useMemo(() => {
    let income = 0
    let expense = 0
    const byCat = new Map<string, number>()
    let firstDate: string | null = null
    for (const tx of transactions) {
      if (tx.type === 'income') income += tx.amount
      else {
        expense += tx.amount
        byCat.set(tx.categoryId, (byCat.get(tx.categoryId) ?? 0) + tx.amount)
      }
      if (!firstDate || tx.date < firstDate) firstDate = tx.date
    }
    let topCat: { name: string; color: string; amount: number } | null = null
    for (const [id, amount] of byCat) {
      if (!topCat || amount > topCat.amount) {
        const c = getCategory(id, cats)
        topCat = { name: c.name, color: c.color, amount }
      }
    }
    return { income, expense, balance: income - expense, count: transactions.length, topCat, firstDate }
  }, [transactions, cats])

  return (
    <div className="pb-24">
      {/* Шапка с шестерёнкой настроек */}
      <div className="flex items-start justify-between px-6 pt-6 pb-1">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-ink-subtle">{t('profile.kicker')}</div>
          <div className="mt-0.5 text-2xl font-bold tracking-tight text-ink">{t('profile.title')}</div>
        </div>
        <button
          onClick={() => { hapticTap(); onOpenSettings() }}
          aria-label={t('nav.settings')}
          className="flex h-10 w-10 items-center justify-center rounded-2xl bg-surface-sunken/60 text-ink-muted active:scale-95"
        >
          <Settings size={20} strokeWidth={2} />
        </button>
      </div>

      {/* Карточка пользователя */}
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

      {/* Компактная строка уровня → ведёт во вкладку «Награды» */}
      <button
        onClick={() => { hapticTap(); onOpenRewards() }}
        className="mx-4 mt-3 flex w-[calc(100%-2rem)] items-center gap-3 rounded-3xl bg-gradient-to-br from-brand-500 to-brand-700 p-4 text-left text-white shadow-soft active:scale-[0.99]"
      >
        <RewardBadge level={lvl.level} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-bold">{t('level.t' + lvl.level)}</span>
            <span className="text-[11px] font-bold tabular text-white/90">{lvl.xp.toLocaleString('ru-RU')} XP</span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/20">
            <m.div
              className="h-full rounded-full bg-white"
              initial={{ width: 0 }}
              animate={{ width: `${Math.round(lvl.ratio * 100)}%` }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
          <div className="mt-1 text-[11px] text-white/70">{t('profile.level', { level: lvl.level, max: LEVELS.length })}</div>
        </div>
        <ChevronRight size={18} className="shrink-0 text-white/70" />
      </button>

      {/* Финансовая статистика */}
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

      {/* Планирование (финансы) */}
      <div className="mx-4 mt-3 flex flex-col gap-2">
        <MenuRow
          icon={<Target size={20} strokeWidth={2} />}
          title={t('profile.planning')}
          hint={t('profile.planning_hint')}
          accent="emerald"
          onClick={openPlanning}
        />
        {/* История обновлений — вместо всплывающей шторки при запуске */}
        <MenuRow
          icon={<Sparkles size={20} strokeWidth={2} />}
          title={t('changelog.title')}
          hint={t('changelog.hint', { v: APP_VERSION })}
          accent="brand"
          trailing={
            unseenCount > 0 ? (
              <span className="flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-brand-500 px-1.5 text-[11px] font-bold tabular text-white">
                {unseenCount}
              </span>
            ) : undefined
          }
          onClick={() => setChangelogOpen(true)}
        />
      </div>

      {stats.firstDate && (
        <div className="mt-3 text-center text-[11px] text-ink-subtle">
          {t('profile.with_us_since', { date: dayjs(stats.firstDate).format('D MMMM YYYY') })}
        </div>
      )}

      {/* Отзыв */}
      <FeedbackBlock t={t} />

      <Suspense fallback={null}>
        {seenPlanning.current && <PlanningSheet open={planningOpen} onClose={() => setPlanningOpen(false)} />}
      </Suspense>

      <Suspense fallback={null}>
        {seenChangelog.current && (
          <ChangelogSheet open={changelogOpen} onClose={closeChangelog} seenVersion={seenVersion} />
        )}
      </Suspense>
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

function StatBox({ label, value, tone }: { label: string; value: string; tone: 'income' | 'expense' | 'neutral' }) {
  const color = tone === 'income' ? 'text-income-deep' : tone === 'expense' ? 'text-expense-deep' : 'text-ink'
  return (
    <div className="card flex flex-col gap-0.5 p-3">
      <span className="text-[10px] font-bold uppercase tracking-wider text-ink-subtle">{label}</span>
      <span className={`tabular text-base font-bold ${color}`}>{value}</span>
    </div>
  )
}
