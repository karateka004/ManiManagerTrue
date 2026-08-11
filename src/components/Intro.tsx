import { lazy, Suspense, useEffect, useState } from 'react'
import { AnimatePresence, m } from 'framer-motion'
import { hapticSelect } from '../lib/telegram'
import { useT } from '../lib/i18n'
import { useStore } from '../store/transactions'
import {
  APP_VERSION,
  ONBOARDED_KEY,
  VERSION_KEY,
  newReleasesSince,
  type ReleaseNote,
} from '../lib/whatsnew'

// Полный гайд — отдельным чанком (общий с кнопкой в Настройках).
const GuideSheet = lazy(() => import('./GuideSheet').then((m) => ({ default: m.GuideSheet })))
// Быстрый старт новичка — отдельным чанком, нужен только при первом входе.
const QuickStart = lazy(() => import('./onboarding/QuickStart').then((m) => ({ default: m.QuickStart })))

type IntroMode = 'onboarding' | 'whatsnew' | 'guide' | null

/** Ключ persist-стора (см. store/transactions.ts) — признак, что приложением уже пользовались. */
const STORE_KEY = 'finance-mini-app:v1'

/**
 * Решает, что показать при загрузке: онбординг (первый вход) или
 * «Что нового» (версия выросла). Возвращает режим и обработчики закрытия.
 */
function useIntro() {
  const [mode, setMode] = useState<IntroMode>(null)
  const [releases, setReleases] = useState<ReleaseNote[]>([])

  useEffect(() => {
    const onboarded = localStorage.getItem(ONBOARDED_KEY)
    const lastVersion = localStorage.getItem(VERSION_KEY)
    // Уже пользовался приложением? (есть сохранённый стор) → не новичок.
    const hasUsedApp = !!localStorage.getItem(STORE_KEY)

    // Совсем новый пользователь — показываем онбординг.
    if (!onboarded && !hasUsedApp) {
      setMode('onboarding')
      return
    }

    // Существующий пользователь (или уже онбордился): сверяем версию.
    const baseVersion = lastVersion ?? '0.0.0'
    if (baseVersion !== APP_VERSION) {
      const fresh = newReleasesSince(baseVersion)
      if (fresh.length) {
        setReleases(fresh)
        setMode('whatsnew')
        return
      }
    }
    // Показывать нечего — просто синхронизируем флаги.
    localStorage.setItem(VERSION_KEY, APP_VERSION)
    localStorage.setItem(ONBOARDED_KEY, '1')
  }, [])

  const closeOnboarding = () => {
    hapticSelect()
    localStorage.setItem(ONBOARDED_KEY, '1')
    localStorage.setItem(VERSION_KEY, APP_VERSION) // новичку changelog не показываем
    // После быстрого старта у человека уже есть данные и первый вывод — гайд
    // сразу следом был бы перегрузом. Он остаётся доступен в Настройках.
    setMode(null)
  }
  const closeGuide = () => {
    hapticSelect()
    setMode(null)
  }
  const closeWhatsNew = () => {
    hapticSelect()
    localStorage.setItem(VERSION_KEY, APP_VERSION)
    localStorage.setItem(ONBOARDED_KEY, '1')
    setMode(null)
  }

  return { mode, releases, closeOnboarding, closeWhatsNew, closeGuide }
}

/* ------------------------------------------------------------------ */

const FEATURES: { icon: string; titleKey: string; descKey: string }[] = [
  { icon: '🏠', titleKey: 'nav.home', descKey: 'intro.f_home_d' },
  { icon: '📊', titleKey: 'nav.analytics', descKey: 'intro.f_analytics_d' },
  { icon: '📈', titleKey: 'nav.charts', descKey: 'intro.f_charts_d' },
  { icon: '⚙️', titleKey: 'nav.settings', descKey: 'intro.f_settings_d' },
  { icon: '👤', titleKey: 'nav.profile', descKey: 'intro.f_profile_d' },
]

/** Общая обёртка-«шторка» снизу. */
function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm"
      />
      <m.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
        className="fixed inset-x-0 bottom-0 z-[80] max-h-[92vh] overflow-y-auto rounded-t-5xl bg-surface-raised shadow-raised"
        style={{ paddingBottom: 'calc(var(--safe-bottom, 0px) + 16px)' }}
      >
        <div className="flex justify-center pb-1 pt-3">
          <div className="h-1.5 w-12 rounded-full bg-surface-sunken" />
        </div>
        {children}
      </m.div>
    </>
  )
}

function Onboarding({ onClose }: { onClose: () => void }) {
  const t = useT()
  return (
    <Sheet onClose={onClose}>
      <div className="px-6 pb-3 pt-2 text-center">
        <div className="text-4xl">🌿</div>
        <div className="mt-1 text-xl font-bold text-ink">{t('intro.welcome')}</div>
        <div className="mt-1 text-sm text-ink-subtle">
          {t('intro.welcome_sub')}
        </div>
      </div>

      <div className="mx-4 flex flex-col gap-2">
        {FEATURES.map((f) => (
          <div key={f.titleKey} className="flex items-center gap-3 rounded-3xl bg-surface-sunken/60 p-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface-raised text-xl">
              {f.icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-ink">{t(f.titleKey)}</div>
              <div className="text-[12px] leading-snug text-ink-subtle">{t(f.descKey)}</div>
            </div>
          </div>
        ))}
      </div>

      <p className="mx-6 mt-3 text-center text-[11px] leading-relaxed text-ink-subtle">
        {t('intro.privacy')}
      </p>

      <button
        onClick={onClose}
        className="mx-4 mt-4 w-[calc(100%-2rem)] rounded-full bg-brand-500 py-3.5 text-sm font-bold text-white active:scale-[0.99]"
      >
        {t('intro.start')}
      </button>
    </Sheet>
  )
}

function WhatsNew({ releases, onClose }: { releases: ReleaseNote[]; onClose: () => void }) {
  const t = useT()
  const lang = useStore((s) => s.lang)
  return (
    <Sheet onClose={onClose}>
      <div className="px-6 pb-3 pt-2 text-center">
        <div className="text-4xl">✨</div>
        <div className="mt-1 text-xl font-bold text-ink">{t('intro.whatsnew')}</div>
        <div className="mt-1 text-sm text-ink-subtle">{t('intro.whatsnew_sub')}</div>
      </div>

      <div className="mx-4 flex flex-col gap-3">
        {releases.map((r) => (
          <div key={r.version} className="rounded-3xl bg-surface-sunken/60 p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-sm font-bold text-ink">{r.title[lang]}</span>
              <span className="text-[11px] text-ink-subtle">v{r.version}</span>
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
        ))}
      </div>

      <button
        onClick={onClose}
        className="mx-4 mt-4 w-[calc(100%-2rem)] rounded-full bg-brand-500 py-3.5 text-sm font-bold text-white active:scale-[0.99]"
      >
        {t('intro.got_it')}
      </button>
    </Sheet>
  )
}

/** Монтируется в App: сам решает, показывать ли онбординг или «Что нового». */
export function IntroOverlay() {
  const { mode, releases, closeOnboarding, closeWhatsNew, closeGuide } = useIntro()
  return (
    <>
      <AnimatePresence>
        {mode === 'onboarding' && (
          <Suspense fallback={null} key="onb">
            <QuickStart onDone={closeOnboarding} />
          </Suspense>
        )}
        {mode === 'whatsnew' && <WhatsNew key="new" releases={releases} onClose={closeWhatsNew} />}
      </AnimatePresence>
      {mode === 'guide' && (
        <Suspense fallback={null}>
          <GuideSheet open onClose={closeGuide} />
        </Suspense>
      )}
    </>
  )
}
