import { useEffect, useState } from 'react'
import { m, AnimatePresence } from 'framer-motion'
import { Flame, X } from 'lucide-react'
import { getLeaderboard, type LeaderBoard, type LeaderEntry } from '../lib/api'
import { LEVELS } from '../lib/levels'
import { getReward, RARITY } from '../lib/rewards'
import { RewardBadge } from './rewards/RewardBadge'
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

/**
 * Уровень из карточки лидерборда — недоверенное число (старые клиенты, битые
 * данные): зажимаем в диапазон существующих уровней, чтобы бейдж и титул
 * всегда находились.
 */
const levelMeta = (level: number): { lvl: number } => ({
  lvl: Math.min(Math.max(1, Math.floor(level) || 1), LEVELS.length),
})

/**
 * Призовые места — медальоны из «металла» с номером места вместо эмодзи-медалей.
 * Число остаётся числом: столбец мест ровный, а первое место читается так же,
 * как двадцатое, только с отливом. Эмодзи-медаль рисует шрифт системы — на
 * каждом телефоне своя, и рядом с линейными иконками выглядит игрушкой.
 */
const RANK_METAL: Record<number, string> = {
  1: 'bg-gradient-to-b from-[#F7DC8A] to-[#C99A35] text-[#4A3505]',
  2: 'bg-gradient-to-b from-[#EEF1F4] to-[#A8B0B9] text-[#2C3238]',
  3: 'bg-gradient-to-b from-[#EDC09A] to-[#A86C3F] text-[#3D2310]',
}

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

            {/* 2.0: шапка как у остальных шторок — без значка в цветном квадрате. */}
            <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-1">
              <div className="min-w-0 leading-tight">
                <div className="text-[17px] font-extrabold text-ink">{t('lb.title')}</div>
                <div className="caption mt-0.5 text-ink-subtle">
                  {state.status === 'ok' ? t('lb.participants', { n: state.total }) : t('lb.subtitle')}
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label={t('common.close')}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-ink-muted transition-transform active:scale-95"
              >
                <X size={18} strokeWidth={2.4} />
              </button>
            </div>

            {/* Переключатель досок */}
            <div className="px-4 pb-3">
              <div className="seg-track">
                <TabButton active={tab === 'xp'} onClick={() => { setTab('xp'); hapticSelect() }}>
                  {t('lb.by_xp')}
                </TabButton>
                <TabButton active={tab === 'refs'} onClick={() => { setTab('refs'); hapticSelect() }}>
                  {t('lb.by_refs')}
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
                <div className="card grouped overflow-hidden">
                  {board.top.map((e, i) => (
                    <Row key={e.id} entry={e} rank={i + 1} isMe={e.id === myId} tab={tab} t={t} />
                  ))}

                  {meOutsideTop && (
                    <>
                      <div className="row">
                        <div className="row-main caption justify-center text-ink-subtle">· · ·</div>
                      </div>
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
      aria-pressed={active}
      className={`seg-item py-1.5 ${active ? 'seg-on' : ''}`}
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
  const metal = RANK_METAL[rank]
  const initial = (entry.name?.[0] ?? '?').toUpperCase()
  const { lvl } = levelMeta(entry.level)
  // Надетый титул игрока — «флекс» рейтинга. Валидируем id по каталогу
  // (недоверенные данные с сервера); дефолтный «Новенький» не показываем.
  const titleReward = entry.title && entry.title !== 'title_newbie' ? getReward(entry.title) : undefined
  const flexTitle = titleReward?.kind === 'title' ? titleReward : undefined

  // Кастомизация кружка игрока: надетая рамка (градиентный ободок), а без неё —
  // тонкий ободок цвета надетого акцента. Дефолты (без рамки / мятный) — без декора.
  const frameDef = getReward(entry.frame)?.frame
  const hasFrame = !!frameDef && frameDef.ring !== 'transparent'
  const accentPalette =
    !hasFrame && entry.accent && entry.accent !== 'accent_mint' ? getReward(entry.accent)?.palette : undefined
  const ringStyle = hasFrame
    ? { padding: 3, background: frameDef!.ring, boxShadow: frameDef!.glow }
    : accentPalette
      ? { padding: 2, background: `rgb(${accentPalette[500]})` }
      : undefined
  return (
    // 2.0: строка группы. Себя видно по тихой подложке и пометке «· ты», а не по
    // брендовой рамке вокруг отдельной карточки.
    <div className={`row ${isMe ? 'bg-brand-500/10' : ''}`}>
      <div className="row-main gap-3">
      <div className="-ml-1 flex w-7 shrink-0 items-center justify-center">
        {metal ? (
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-bold tabular-nums shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] ${metal}`}
          >
            {rank}
          </span>
        ) : (
          <span className="text-sm font-semibold tabular-nums text-ink-subtle">{rank}</span>
        )}
      </div>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={ringStyle}>
        <div
          className={`flex h-full w-full items-center justify-center rounded-full text-sm font-bold ${
            ringStyle
              ? 'bg-surface-raised text-brand-600 dark:text-brand-300'
              : 'bg-surface-sunken text-ink-muted'
          }`}
        >
          {initial}
        </div>
      </div>
      {/* Жетон уровня — заметнее эмодзи и сразу читается «насколько игрок прокачан» */}
      <RewardBadge level={lvl} size={26} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 truncate text-sm font-semibold text-ink">
          <span className="truncate">{entry.name}</span>
          {isMe && <span className="shrink-0 text-[10px] font-bold text-brand-600 dark:text-brand-300">· {t('lb.me')}</span>}
        </div>
        <div className="flex items-center gap-1.5 truncate text-[11px] text-ink-subtle">
          <span className="truncate">
            {t('lb.level_short')} {lvl} ·{' '}
            {flexTitle ? (
              <span className="font-semibold" style={{ color: RARITY[flexTitle.rarity].color }}>
                «{t('reward.' + flexTitle.id + '.name')}»
              </span>
            ) : (
              t('level.t' + lvl)
            )}
          </span>
          {entry.streakBest > 0 && (
            <span className="flex shrink-0 items-center gap-0.5">
              ·<Flame size={11} strokeWidth={2.4} fill="currentColor" />
              {entry.streakBest}
            </span>
          )}
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
    </div>
  )
}
