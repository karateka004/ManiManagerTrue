import { useEffect } from 'react'
import { hapticSelect } from '../lib/telegram'
import { useT } from '../lib/i18n'
import { useSegPill } from './ui/SegTrack'

const TABS = [
  { id: 'overview', label: 'ov.tab' },
  { id: 'expense', label: 'common.expense' },
  { id: 'income',  label: 'common.income' },
  { id: 'dynamics', label: 'analytics.dynamics' },
  { id: 'calendar', label: 'cal.tab' },
] as const

export type AnalyticsTab = typeof TABS[number]['id']

/** Порядок сегментов — по нему выбирается направление перехода. */
export const ANALYTICS_TABS: AnalyticsTab[] = TABS.map((t) => t.id)

interface Props {
  value: AnalyticsTab
  onChange: (t: AnalyticsTab) => void
}

export function AnalyticsTabs({ value, onChange }: Props) {
  const t = useT()
  // Плашка выбранного сегмента одна и ездит (как у остальных сегментов).
  const { trackRef, pillRef } = useSegPill<HTMLDivElement>(value)

  // На узком экране выбранный сегмент может оказаться за краем прокрутки —
  // подвозим его в видимую часть.
  useEffect(() => {
    const on = trackRef.current?.querySelector<HTMLElement>(':scope > .seg-on')
    on?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }, [value, trackRef])

  // Пять сегментов в Manrope на экране 320 px не влезали: «Календарь» уезжал за
  // край и оставался доступен только прокруткой, о которой ничто не намекает.
  // Ниже 360 px ужимаем шрифт и поля — от 360 px всё помещается и так.
  return (
    <div
      ref={trackRef}
      className="relative mx-4 mt-4 flex overflow-x-auto rounded-full bg-surface-sunken p-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <span ref={pillRef} className="seg-pill" aria-hidden />
      {TABS.map((tab) => {
        const active = value === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => {
              hapticSelect()
              onChange(tab.id)
            }}
            aria-pressed={active}
            className={`seg-slot shrink-0 grow basis-0 whitespace-nowrap rounded-full px-1.5 py-2 text-[12px] font-semibold transition-colors duration-200 max-[359px]:px-1 max-[359px]:text-[11px] ${
              active ? 'seg-on text-ink' : 'text-ink-muted'
            }`}
          >
            {t(tab.label)}
          </button>
        )
      })}
    </div>
  )
}
