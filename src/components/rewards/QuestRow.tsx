import { Lock } from 'lucide-react'
import { useStore } from '../../store/transactions'
import type { QuestProgress, QuestSlot } from '../../lib/quests'
import { coinsWord, type TFunc } from '../../lib/i18n'
import { Row } from '../ui/Group'
import { QuestIcon } from './QuestIcon'

/**
 * Строки заданий для группы на «Прогрессе»: задания и перезаряжающиеся слоты.
 *
 * 2.0: раньше каждое задание было отдельной карточкой с цветной иконкой, двумя
 * пилюлями наград и полосой прогресса — шесть одинаковых коробок, в которых
 * готовое к получению ничем не отличалось от несделанного. Теперь это строки
 * одной группы: награда — текстом, прогресс — числом справа, а кнопка есть
 * только у того, что можно забрать прямо сейчас.
 *
 * Без framer: забранная строка просто уходит, новая появляется с CSS-классом
 * `.tab-enter`. Внутри данные, а entrance-анимация framer при приостановленном
 * rAF оставила бы строку невидимой (см. «Грабли» в CLAUDE.md).
 */
export function QuestRows({
  slots,
  now,
  t,
  onClaim,
  onAction,
}: {
  slots: QuestSlot[]
  now: number
  t: TFunc
  onClaim: (q: QuestProgress) => void
  onAction?: (q: QuestProgress) => void
}) {
  if (slots.length === 0) {
    return (
      <div className="row">
        <div className="row-main caption text-ink-subtle">{t('quest.empty')}</div>
      </div>
    )
  }

  return (
    <>
      {slots.map((slot) =>
        slot.kind === 'quest' ? (
          <QuestRow
            key={slot.quest.def.id}
            q={slot.quest}
            t={t}
            onClaim={() => onClaim(slot.quest)}
            onAction={onAction ? () => onAction(slot.quest) : undefined}
          />
        ) : (
          <Row
            key={`locked-${slot.unlockAt}`}
            className="tab-enter"
            icon={<Lock size={18} strokeWidth={2} />}
            title={<span className="text-ink-muted">{t('quest.locked_title')}</span>}
            subtitle={t('quest.locked_desc', { time: formatLeft(slot.unlockAt - now, t) })}
          />
        ),
      )}
    </>
  )
}

function QuestRow({
  q,
  t,
  onClaim,
  onAction,
}: {
  q: QuestProgress
  t: TFunc
  onClaim: () => void
  onAction?: () => void
}) {
  const lang = useStore((s) => s.lang)
  const { def, current, claimable, done } = q
  // Подписка на канал: пока не подтверждена, нужна кнопка, ведущая в канал.
  const showAction = !!def.actionUrl && !done && !!onAction

  return (
    <Row
      className="tab-enter"
      icon={<QuestIcon id={def.id} size={18} />}
      title={t('quest.' + def.id + '.title')}
      subtitle={t('quest.' + def.id + '.desc')}
      value={
        claimable || showAction ? undefined : (
          <span className="text-ink-muted">
            {current}/{def.goal}
          </span>
        )
      }
      trailing={
        claimable ? (
          <button
            type="button"
            onClick={onClaim}
            className="shrink-0 rounded-full bg-brand-500 px-3.5 py-1.5 text-[13px] font-bold text-white transition-transform active:scale-95"
          >
            {t('quest.claim')}
          </button>
        ) : showAction ? (
          <button
            type="button"
            onClick={onAction}
            className="shrink-0 rounded-full bg-surface-sunken px-3.5 py-1.5 text-[13px] font-bold text-ink transition-transform active:scale-95"
          >
            {t('quest.subscribe')}
          </button>
        ) : undefined
      }
    >
      <span className="caption-sm mt-1 block tabular-nums text-ink-muted">
        +{def.xp} XP · {def.coins} {coinsWord(lang, def.coins)}
      </span>
    </Row>
  )
}

/** Остаток времени словами: «7 ч 42 мин» / «42 мин» / «меньше минуты». */
function formatLeft(ms: number, t: TFunc): string {
  const minutes = Math.ceil(ms / 60_000)
  if (minutes <= 0) return t('time.soon')
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? t('time.hm', { h, m }) : t('time.m', { m })
}
