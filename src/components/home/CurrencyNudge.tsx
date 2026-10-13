import { useEffect, useState } from 'react'
import { useStore } from '../../store/transactions'
import { getCurrency } from '../../lib/currencies'
import { currencyNameInText } from '../../lib/currencyInfo'
import { detectCurrency } from '../../lib/currencyDetect'
import { useT } from '../../lib/i18n'
import { hapticNotify, hapticSelect } from '../../lib/telegram'
import { showToast } from '../../lib/toast'
import { CurrencyFlag } from '../ui/CurrencyFlag'
import { RelabelPrompt, countInCurrency } from '../RelabelPrompt'
import { CURRENCY_ASKED_KEY } from '../../lib/currencyAsked'

/**
 * «Твоя валюта — украинская гривна?» — для тех, кто уже ведёт учёт на долларе
 * по умолчанию, хотя живёт там, где платят другой валютой.
 *
 * До 2.2 быстрый старт открывался на долларе, и многие так его и проходили.
 * Быстрый старт теперь подставляет валюту региона сам, а тем, кто прошёл его
 * раньше, один раз задаём вопрос здесь. «Да» меняет основную валюту и сразу
 * предлагает перенести старые записи (суммы не пересчитываются — валюта была
 * выбрана по ошибке, а не обменяна). «Оставить» — больше не спрашиваем.
 *
 * Чанк ленивый: таблица часовых поясов и названия валют нужны только тем, у
 * кого основная — доллар и вопрос ещё не задавали (см. Home → CurrencyNudgeGate).
 */
export default function CurrencyNudge({ onFlow }: { onFlow: (active: boolean) => void }) {
  const t = useT()
  const lang = useStore((s) => s.lang)
  const current = useStore((s) => s.currency)
  const setCurrency = useStore((s) => s.setCurrency)
  const [detected] = useState(() => detectCurrency())
  const [stage, setStage] = useState<'ask' | 'relabel' | 'done'>('ask')
  const target = detected.currency

  // Спросить не о чем: регион не определился или это и есть доллар. Помечаем,
  // чтобы чанк не грузился при каждом запуске.
  const nothingToAsk = detected.source === 'default' || target === 'USD'
  useEffect(() => {
    if (nothingToAsk) markAsked()
  }, [nothingToAsk])

  if (nothingToAsk || stage === 'done') return null

  if (stage === 'relabel') {
    return (
      <RelabelPrompt
        className="mx-4 mb-3"
        from="USD"
        to={target}
        onDone={() => {
          setStage('done')
          onFlow(false)
        }}
      />
    )
  }

  // Пока вопрос висит, человек мог сам сменить валюту в Настройках.
  if (current !== 'USD') return null

  const yes = () => {
    hapticNotify('success')
    markAsked()
    const inUsd = countInCurrency(useStore.getState(), 'USD')
    // Держим карточку на экране: после смены валюты условие показа (доллар)
    // перестанет выполняться, а вопрос о переносе ещё впереди.
    onFlow(inUsd > 0)
    setCurrency(target)
    if (inUsd > 0) setStage('relabel')
    else {
      setStage('done')
      showToast({ icon: 'check', text: t('cur.switched', { name: currencyNameInText(target, lang) }) })
    }
  }

  const no = () => {
    hapticSelect()
    markAsked()
    setStage('done')
  }

  const usd = getCurrency('USD')
  return (
    <div className="card tab-enter mx-4 mb-3 p-4">
      <div className="flex items-start gap-3">
        <CurrencyFlag code={target} size={36} />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold leading-snug text-ink">
            {t('cur.nudge_title', { name: currencyNameInText(target, lang) })}
          </div>
          <p className="mt-1 text-[13px] leading-snug text-ink-muted">
            {t('cur.nudge_text', { symbol: usd.symbol, current: currencyNameInText('USD', lang) })}
          </p>
        </div>
      </div>
      <div className="mt-3.5 flex gap-2">
        <button
          type="button"
          onClick={yes}
          className="press flex-1 rounded-full bg-brand-500 px-3 py-2.5 text-[14px] font-bold text-white"
        >
          {t('cur.nudge_yes')}
        </button>
        <button
          type="button"
          onClick={no}
          className="press flex-1 rounded-full bg-surface-sunken px-3 py-2.5 text-[14px] font-bold text-ink"
        >
          {t('cur.nudge_no', { symbol: usd.symbol })}
        </button>
      </div>
    </div>
  )
}

function markAsked() {
  try {
    localStorage.setItem(CURRENCY_ASKED_KEY, '1')
  } catch {
    /* приватный режим: спросим ещё раз в следующий запуск — не страшно */
  }
}
