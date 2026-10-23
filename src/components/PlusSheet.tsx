import { Mic, ScanLine, MessageSquareText, Star } from 'lucide-react'
import { BottomSheet, SheetHeader } from './ui/BottomSheet'
import { Group, Row } from './ui/Group'
import { usePlusT } from '../lib/plus'
import { BOT_USERNAME } from '../lib/api'
import { hapticTap, openTelegramLink } from '../lib/telegram'

interface Props {
  open: boolean
  onClose: () => void
}

/**
 * Кошель+ (Профиль): что входит в премиум. Пока закрытое тестирование —
 * шторку открывают только тестеры (lib/plus), и пробуют функции в боте.
 * Подключение за звёзды Telegram — следующим шагом, кнопки покупки ещё нет.
 */
export function PlusSheet({ open, onClose }: Props) {
  const t = usePlusT()
  const openBot = () => {
    hapticTap()
    openTelegramLink(`https://t.me/${BOT_USERNAME}`)
  }

  return (
    <BottomSheet open={open} onClose={onClose} layout="flex" maxHeight="92vh" padBottom={null}>
      <SheetHeader title={t('name')} subtitle={t('sheet_sub')} onClose={onClose} />

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
        <p className="px-1 text-[15px] leading-snug text-ink-muted">{t('intro')}</p>
        <Group className="mt-4">
          <Row icon={<Mic size={18} strokeWidth={2} />} title={t('f_voice')} subtitle={t('f_voice_sub')} wrap />
          <Row icon={<ScanLine size={18} strokeWidth={2} />} title={t('f_photo')} subtitle={t('f_photo_sub')} wrap />
          <Row
            icon={<MessageSquareText size={18} strokeWidth={2} />}
            title={t('f_text')}
            subtitle={t('f_text_sub')}
            wrap
          />
        </Group>
      </div>

      {/* Низ закреплён: попробовать сейчас — в боте; покупка — позже. */}
      <div
        className="shrink-0 border-t border-hairline px-4 pt-3"
        style={{ paddingBottom: 'calc(var(--safe-bottom, 0px) + 12px)' }}
      >
        <button
          onClick={openBot}
          className="press-soft w-full rounded-full bg-brand-500 py-3.5 text-base font-bold text-white"
        >
          {t('try_bot')}
        </button>
        <div className="caption mt-2.5 flex items-center justify-center gap-1.5 text-ink-subtle">
          <Star size={13} strokeWidth={2.2} className="plus-gold-ink" />
          {t('stars_soon')}
        </div>
      </div>
    </BottomSheet>
  )
}
