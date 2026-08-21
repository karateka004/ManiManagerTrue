import { m, AnimatePresence } from 'framer-motion'
import { X, Sparkles } from 'lucide-react'
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
    <AnimatePresence>
      {open && (
        <>
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          />
          <m.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92vh] flex-col rounded-t-5xl bg-surface-raised shadow-raised"
            style={{ paddingBottom: 'var(--safe-bottom)' }}
          >
            <div className="flex justify-center pb-1 pt-3">
              <div className="h-1.5 w-12 rounded-full bg-surface-sunken" />
            </div>

            <div className="flex items-center justify-between px-6 pb-2 pt-1">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                  <Sparkles size={19} strokeWidth={2} />
                </span>
                <div className="leading-tight">
                  <div className="text-base font-bold text-ink">{t('changelog.title')}</div>
                  <div className="text-[11px] text-ink-subtle">
                    {t('changelog.current', { v: APP_VERSION })}
                  </div>
                </div>
              </div>
              <button onClick={onClose} className="text-ink-subtle active:text-ink-muted" aria-label={t('common.close')}>
                <X size={22} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
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
                            <span className="mt-0.5 text-base leading-none">{it.icon}</span>
                            <span className="text-[13px] leading-snug text-ink-muted">{it.text[lang]}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </m.div>
        </>
      )}
    </AnimatePresence>
  )
}
