import { m } from 'framer-motion'
import type { QuestProgress } from '../../lib/quests'
import type { TFunc } from '../../lib/i18n'
import { QuestIcon } from './QuestIcon'
import { CoinAmount } from './CoinAmount'

/**
 * Карточка задания: иконка, заголовок/описание, кнопка действия и награды.
 * Кнопка: «Подписаться» (для задания с actionUrl, пока не выполнено) либо
 * «Забрать» / текущий прогресс.
 *
 * Состояния «получено» здесь нет намеренно: забранные задания уходят с борда
 * (см. questBoard), так что такая карточка просто не может отрисоваться.
 */
export function QuestCard({
  q,
  onClaim,
  onAction,
  t,
}: {
  q: QuestProgress
  onClaim: () => void
  onAction?: () => void
  t: TFunc
}) {
  const { def, current, ratio, done, claimable } = q
  // Действие-кнопка (открыть канал) показывается, пока подписка не подтверждена.
  const showAction = !!def.actionUrl && !done

  return (
    <div className="card p-3">
      <div className="flex items-center gap-3">
        <QuestIcon id={def.id} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-ink">{t('quest.' + def.id + '.title')}</div>
          <div className="truncate text-[11px] text-ink-subtle">{t('quest.' + def.id + '.desc')}</div>
        </div>
        {showAction ? (
          <button
            onClick={onAction}
            className="shrink-0 rounded-2xl bg-brand-500 px-3 py-2 text-xs font-bold text-white transition active:scale-95"
          >
            {t('quest.subscribe')}
          </button>
        ) : (
          <button
            onClick={onClaim}
            disabled={!claimable}
            className={`shrink-0 rounded-2xl px-3 py-2 text-xs font-bold transition active:scale-95 ${
              claimable ? 'bg-brand-500 text-white' : 'bg-surface-sunken text-ink-subtle'
            }`}
          >
            {claimable ? t('quest.claim') : `${current}/${def.goal}`}
          </button>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
          +{def.xp} XP
        </span>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
          <CoinAmount value={def.coins} />
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
