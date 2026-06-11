import { useEffect, useState } from 'react'
import { m, AnimatePresence } from 'framer-motion'
import { Trophy, Users, X } from 'lucide-react'
import { getLeaderboard, type LeaderBoard, type LeaderEntry } from '../lib/api'
import { LEVELS } from '../lib/levels'
import { tg, hapticSelect } from '../lib/telegram'
import { useT, type TFunc } from '../lib/i18n'

interface Props {
  open: boolean
  onClose: () => void
}

type Tab = 'xp' | 'refs'

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ok'; total: number; xp: LeaderBoard; refs: LeaderBoard }

const badgeForLevel = (level: number): string =>
  LEVELS.find((l) => l.level === level)?.badge ?? LEVELS[0].badge

const RANK_MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

export function LeaderboardSheet({ open, onClose }: Props) {
  const t = useT()
  const [state, setState] = useState<State>({ status: 'loading' })
  const [tab, setTab] = useState<Tab>('xp')

  const myId = tg.user?.id

  useEffect(() => {
    if (!open) return
    let alive = true
    setState({ status: 'loading' })
    setTab('xp')
    getLeaderboard()
      .then((r) => {
        if (!alive) return
        if (r.ok) setState({ status: 'ok', total: r.total, xp: r.xp, refs: r.refs })
        else setState({ status: 'error' })
      })
      .catch(() => alive && setState({ status: 'error' }))
    return () => {
      alive = false
    }
  }, [open])

  const board = state.status === 'ok' ? (tab === 'xp' ? state.xp : state.refs) : null

  // Показываем свою строку отдельно, если не попал в выведенный топ.
  const meOutsideTop =
    board && board.me && !board.top.some((e) => e.id === board.me!.id) ? board.me : null

  return (
    <AnimatePresence>
      {open && (
        <>
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          />
          <m.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92vh] flex-col rounded-t-5xl bg-surface-raised shadow-raised"
            style={{ paddingBottom: 'var(--safe-bottom)' }}
          >
            <div className="flex justify-center pb-1 pt-3">
              <div className="h-1.5 w-12 rounded-full bg-surface-sunken" />
            </div>

            <div className="flex items-center justify-between px-6 pb-2 pt-1">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300">
                  <Trophy size={20} strokeWidth={2} />
                </span>
                <div className="leading-tight">
                  <div className="text-base font-bold text-ink">{t('lb.title')}</div>
                  <div className="text-[11px] text-ink-subtle">
                    {state.status === 'ok' ? t('lb.participants', { n: state.total }) : t('lb.subtitle')}
                  </div>
                </div>
              </div>
              <button onClick={onClose} className="text-ink-subtle active:text-ink-muted" aria-label={t('common.close')}>
                <X size={22} />
              </button>
            </div>

            {/* Переключатель досок */}
            <div className="px-4 pb-2">
              <div className="flex rounded-2xl bg-surface-sunken/60 p-1">
                <TabButton active={tab === 'xp'} onClick={() => { setTab('xp'); hapticSelect() }}>
                  <Trophy size={15} strokeWidth={2.4} /> {t('lb.by_xp')}
                </TabButton>
                <TabButton active={tab === 'refs'} onClick={() => { setTab('refs'); hapticSelect() }}>
                  <Users size={15} strokeWidth={2.4} /> {t('lb.by_refs')}
                </TabButton>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
              {state.status === 'loading' && (
                <div className="py-12 text-center text-sm text-ink-subtle">{t('lb.loading')}</div>
              )}

              {state.status === 'error' && (
                <div className="py-12 text-center text-sm text-ink-subtle">
                  {tg.isInTelegram ? t('lb.error') : t('lb.error_tg')}
                </div>
              )}

              {board && board.top.length === 0 && (
                <div className="py-12 text-center text-sm text-ink-subtle">
                  {tab === 'refs' ? t('lb.empty_refs') : t('lb.empty_xp')}
                </div>
              )}

              {board && board.top.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {board.top.map((e, i) => (
                    <Row key={e.id} entry={e} rank={i + 1} isMe={e.id === myId} tab={tab} t={t} />
                  ))}

                  {meOutsideTop && (
                    <>
                      <div className="my-1 text-center text-[11px] text-ink-subtle">· · ·</div>
                      <Row entry={meOutsideTop} rank={meOutsideTop.rank} isMe tab={tab} t={t} />
                    </>
                  )}
                </div>
              )}

              <p className="mt-4 px-2 text-center text-[11px] leading-relaxed text-ink-subtle">
                {t('lb.privacy')}
              </p>
            </div>
          </m.div>
        </>
      )}
    </AnimatePresence>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold transition-colors ${
        active ? 'bg-surface-raised text-ink shadow-sm' : 'text-ink-subtle active:text-ink-muted'
      }`}
    >
      {children}
    </button>
  )
}

function Row({
  entry,
  rank,
  isMe,
  tab,
  t,
}: {
  entry: LeaderEntry
  rank: number
  isMe: boolean
  tab: Tab
  t: TFunc
}) {
  const medal = RANK_MEDAL[rank]
  const initial = (entry.name?.[0] ?? '?').toUpperCase()
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${
        isMe ? 'bg-brand-500/15 ring-1 ring-brand-500/40' : 'bg-surface-sunken/50'
      }`}
    >
      <div className="flex w-7 shrink-0 items-center justify-center text-sm font-extrabold tabular text-ink-muted">
        {medal ?? rank}
      </div>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
        {initial}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 truncate text-sm font-semibold text-ink">
          <span className="truncate">{entry.name}</span>
          {isMe && <span className="shrink-0 text-[10px] font-bold text-brand-600 dark:text-brand-300">· {t('lb.me')}</span>}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-ink-subtle">
          <span>{badgeForLevel(entry.level)} {t('lb.level_short')} {entry.level}</span>
          {entry.streakBest > 0 && <span>· 🔥 {entry.streakBest}</span>}
        </div>
      </div>
      <div className="text-right">
        {tab === 'xp' ? (
          <>
            <div className="tabular text-sm font-extrabold text-ink">{entry.xp.toLocaleString('ru-RU')}</div>
            <div className="text-[10px] text-ink-subtle">XP</div>
          </>
        ) : (
          <>
            <div className="tabular text-sm font-extrabold text-ink">{(entry.refs ?? 0).toLocaleString('ru-RU')}</div>
            <div className="text-[10px] text-ink-subtle">{t('lb.friends')}</div>
          </>
        )}
      </div>
    </div>
  )
}
