import { useState } from 'react'
import { BellRing } from 'lucide-react'
import { useStore } from '../../store/transactions'
import { BOT_USERNAME, setReminders } from '../../lib/api'
import { useT } from '../../lib/i18n'
import { canRequestBotWrite, hapticNotify, hapticSelect, openTelegramLink, requestBotWrite } from '../../lib/telegram'
import { showToast } from '../../lib/toast'
import { markRemindAsked } from '../../lib/remindAsked'

/**
 * «Напоминать вечером?» — для тех, кому бот не может написать.
 *
 * Кто открыл Кошель по ссылке и ни разу не нажимал Start в чате с ботом, не
 * получает ни одного напоминания: Telegram отвечает боту отказом. Напоминания у
 * такого человека «включены», а на деле молчат — и на второй день его никто не
 * зовёт обратно. Спрашиваем один раз, когда записи уже есть: человек видел, что
 * учёт работает, и понятно, о чём напоминать.
 *
 * «Разрешить» — родное окно Telegram (Bot API 6.9+), в старых клиентах — чат с
 * ботом, где разрешение даёт кнопка Start. «Не нужно» выключает напоминания:
 * это и есть ответ человека.
 */
export default function RemindNudge() {
  const t = useT()
  const setRemindersEnabled = useStore((s) => s.setRemindersEnabled)
  const [done, setDone] = useState(false)
  if (done) return null

  const yes = async () => {
    hapticSelect()
    if (!canRequestBotWrite()) {
      // Старый Telegram сам спросить не умеет: разрешение даёт Start в чате.
      markRemindAsked()
      setDone(true)
      showToast({ text: t('remind.open_chat') })
      openTelegramLink(`https://t.me/${BOT_USERNAME}`)
      return
    }
    const granted = await requestBotWrite()
    markRemindAsked()
    setDone(true)
    if (granted) {
      hapticNotify('success')
      setRemindersEnabled(true)
      void setReminders(true)
      showToast({ icon: 'check', text: t('remind.granted'), sub: t('remind.granted_sub') })
    } else {
      // Без разрешения напоминания не дойдут — тумблер честно выключаем. На
      // сервер не пишем: нажмёт Start в боте — напоминания оживут сами.
      setRemindersEnabled(false)
      showToast({ text: t('remind.denied'), sub: t('remind.denied_sub') })
    }
  }

  const no = () => {
    hapticSelect()
    markRemindAsked()
    setDone(true)
    setRemindersEnabled(false)
    void setReminders(false)
    // Выключение навсегда — с возможностью передумать сразу.
    showToast({ text: t('remind.off'), action: { label: t('remind.undo'), run: () => void yes() } })
  }

  return (
    <div className="card tab-enter mx-4 mb-3 p-4">
      <div className="flex items-start gap-3">
        <BellRing size={22} strokeWidth={2} className="mt-0.5 shrink-0 text-ink-subtle" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold leading-snug text-ink">{t('remind.nudge_title')}</div>
          <p className="mt-1 text-[13px] leading-snug text-ink-muted">{t('remind.nudge_text')}</p>
        </div>
      </div>
      <div className="mt-3.5 flex gap-2">
        <button
          type="button"
          onClick={() => void yes()}
          className="press flex-1 rounded-full bg-brand-500 px-3 py-2.5 text-[14px] font-bold text-white"
        >
          {t('remind.nudge_yes')}
        </button>
        <button
          type="button"
          onClick={no}
          className="press flex-1 rounded-full bg-surface-sunken px-3 py-2.5 text-[14px] font-bold text-ink"
        >
          {t('remind.nudge_no')}
        </button>
      </div>
    </div>
  )
}
