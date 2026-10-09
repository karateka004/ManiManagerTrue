import { BottomSheet, SheetHeader } from './ui/BottomSheet'
import { useStore } from '../store/transactions'
import { useT } from '../lib/i18n'
import { RELEASES, cmpVersion, APP_VERSION } from '../lib/whatsnew'

interface Props {
  open: boolean
  onClose: () => void
  /**
   * Версия, до которой пользователь уже видел изменения. Всё, что новее,
   * помечается плашкой «новое».
   */
  seenVersion: string
}

/**
 * История обновлений отдельным разделом в Профиле. Заменила всплывающую на
 * весь экран шторку «Что нового» при запуске: человек читает изменения сам,
 * когда захочет, а о новых узнаёт по счётчику на строке в Профиле.
 */
export function ChangelogSheet({ open, onClose, seenVersion }: Props) {
  const t = useT()
  const lang = useStore((s) => s.lang)

  return (
    <BottomSheet open={open} onClose={onClose} layout="flex" maxHeight="92vh" padBottom={0}>
      <SheetHeader title={t('changelog.title')} subtitle={t('changelog.current', { v: APP_VERSION })} onClose={onClose} />

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6">
        <div className="flex flex-col gap-3">
          {RELEASES.map((r) => {
            const isNew = cmpVersion(r.version, seenVersion) > 0
            return (
              <div key={r.version} className="rounded-3xl bg-surface-sunken/60 p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-bold text-ink">{r.title[lang]}</span>
                    {isNew && (
                      <span className="shrink-0 rounded-full bg-brand-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                        {t('changelog.new')}
                      </span>
                    )}
                  </div>
                  <span className="shrink-0 text-[11px] tabular text-ink-subtle">v{r.version}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {r.items.map((it, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      {/* Точка вместо эмодзи у каждого пункта: 150 разных пиктограмм
                          в одном списке читались как рябь, а не как перечень. */}
                      <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-ink-subtle" aria-hidden />
                      <span className="text-[13px] leading-snug text-ink-muted">{it.text[lang]}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </BottomSheet>
  )
}
