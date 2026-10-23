import { useEffect, useRef, useState } from 'react'
import { Clock3 } from 'lucide-react'
import type { QuestProgress } from '../../lib/quests'
import type { TFunc } from '../../lib/i18n'
import { QuestIcon } from './QuestIcon'
import { formatLeft } from './QuestRow'

/**
 * Особое задание на время — своей карточкой над бордом: светящаяся рамка
 * (.quest-glow), таймер в углу, награда — XP и титул. Время вышло — карточка
 * уходит (`onExpire`), забрал — тоже: её больше нет в limitedQuest().
 */
export function LimitedQuestCard({
  q,
  t,
  onAction,
  onClaim,
  onExpire,
}: {
  q: QuestProgress
  t: TFunc
  onAction: () => void
  /** `from` — кнопка, из которой всплывает «+XP». */
  onClaim: (from: Element | null) => void
  onExpire: () => void
}) {
  const { def, claimable } = q
  return (
    <section className="quest-glow tab-enter mx-4 mt-6">
      <div className="quest-glow-body p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="kicker text-brand-600 dark:text-brand-300">{t('quest.limited')}</span>
          {def.until && <Countdown until={def.until} t={t} onEnd={onExpire} />}
        </div>
        <div className="mt-3 flex items-start gap-3">
          <span className="mt-0.5 flex w-5 shrink-0 justify-center text-brand-600 dark:text-brand-300">
            <QuestIcon id={def.id} size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-extrabold leading-snug text-ink">{t('quest.' + def.id + '.title')}</div>
            <div className="caption mt-0.5 leading-snug text-ink-subtle">{t('quest.' + def.id + '.desc')}</div>
            <div className="caption mt-1.5 font-semibold tabular-nums text-ink-muted">
              {t('quest.limited_reward', { xp: def.xp })}{' '}
              <span className="plus-gold-ink font-bold">«{t('reward.' + def.reward + '.name')}»</span>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => (claimable ? onClaim(e.currentTarget) : onAction())}
          className="press sheen mt-3.5 w-full rounded-full bg-brand-500 py-3 text-[15px] font-bold text-white"
        >
          {claimable ? t('quest.claim') : t('quest.subscribe')}
        </button>
      </div>
    </section>
  )
}

/**
 * Таймер в углу: свой тик раз в 30 с — перерисовывается только он, не вся
 * вкладка. Меньше суток — красный: задание вот-вот уйдёт.
 */
function Countdown({ until, t, onEnd }: { until: number; t: TFunc; onEnd: () => void }) {
  const [now, setNow] = useState(() => Date.now())
  const end = useRef(onEnd)
  end.current = onEnd
  useEffect(() => {
    if (Date.now() >= until) {
      end.current()
      return
    }
    const id = setInterval(() => {
      const n = Date.now()
      setNow(n)
      if (n >= until) end.current()
    }, 30_000)
    return () => clearInterval(id)
  }, [until])

  const left = until - now
  const time = formatLeft(left, t)
  return (
    <span
      className={`caption-sm inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-semibold tabular-nums ${
        left < 86_400_000 ? 'bg-expense/[.12] text-expense-deep dark:text-expense' : 'bg-surface-sunken text-ink-muted'
      }`}
      aria-label={t('quest.limited_left', { time })}
    >
      <Clock3 size={12} strokeWidth={2.4} />
      {time}
    </span>
  )
}
