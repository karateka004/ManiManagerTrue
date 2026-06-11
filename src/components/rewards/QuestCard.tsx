import { m } from 'framer-motion'
import { Hourglass } from 'lucide-react'
import type { QuestProgress } from '../../lib/quests'
import type { TFunc } from '../../lib/i18n'

/** Человекочитаемая длительность остатка («2 ч 14 мин»). */
function formatDuration(ms: number, t: TFunc): string {
  const totalMin = Math.max(1, Math.ceil(ms / 60000))
  const h = Math.floor(totalMin / 60)
  const mins = totalMin % 60
  return h > 0 ? `${h} ${t('unit.h')} ${mins} ${t('unit.m')}` : `${mins} ${t('unit.m')}`
}

/** Карточка задания: иконка, прогресс, кнопка Claim, награды XP/монеты. */
export function QuestCard({ q, onClaim, t, now }: { q: QuestProgress; onClaim: () => void; t: TFunc; now: number }) {
  const { def, current, ratio, claimed, claimable, expiresAt, hasSuccessor } = q
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
