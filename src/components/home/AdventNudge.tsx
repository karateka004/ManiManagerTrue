import { ChevronRight, Gift } from 'lucide-react'
import { useStore } from '../../store/transactions'
import { hapticTap } from '../../lib/telegram'
import { season } from '../../lib/season'

/** Тексты карточки — здесь же (ленивый чанк), не в общем словаре. */
const TEXT = {
  ru: { title: 'Окошко адвента ждёт', sub: (d: number) => `${d} декабря — открой подарок на «Прогрессе»` },
  en: { title: 'An advent window is waiting', sub: (d: number) => `December ${d} — open your gift on Progress` },
}

/**
 * Декабрь, окошко дня ещё не открыто — карточка на Главной: «Прогресс» с
 * адвентом открывают реже, а окошко дня засчитывает и серию. Тап — сразу на
 * экран адвента. Открыл окошко — карточка уходит сама (её гейт в Home.tsx).
 */
export default function AdventNudge({ onOpen }: { onOpen: () => void }) {
  const lang = useStore((s) => s.lang)
  const x = lang === 'en' ? TEXT.en : TEXT.ru
  const day = season().day
  return (
    <button
      type="button"
      data-advent-nudge
      onClick={() => {
        hapticTap()
        onOpen()
      }}
      className="card press-soft tab-enter mx-4 mb-3 flex w-[calc(100%-2rem)] items-center gap-3 p-3.5 text-left"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#e9504f] to-[#a51a30] text-white">
        <Gift size={22} strokeWidth={2.2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold leading-snug text-ink">{x.title}</span>
        <span className="mt-0.5 block text-[13px] leading-snug text-ink-muted">{x.sub(day)}</span>
      </span>
      <ChevronRight size={18} strokeWidth={2.4} className="shrink-0 text-ink-subtle" aria-hidden />
    </button>
  )
}
