import { lazy, Suspense, useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { hapticSelect } from '../lib/telegram'
import { APP_VERSION, ONBOARDED_KEY, VERSION_KEY } from '../lib/whatsnew'

// Полный гайд — отдельным чанком (общий с кнопкой в Настройках).
const GuideSheet = lazy(() => import('./GuideSheet').then((m) => ({ default: m.GuideSheet })))
// Быстрый старт новичка — отдельным чанком, нужен только при первом входе.
const QuickStart = lazy(() => import('./onboarding/QuickStart').then((m) => ({ default: m.QuickStart })))

type IntroMode = 'onboarding' | 'guide' | null

/** Ключ persist-стора (см. store/transactions.ts) — признак, что приложением уже пользовались. */
const STORE_KEY = 'finance-mini-app:v1'

/**
 * Решает, показывать ли быстрый старт при загрузке. Список обновлений при
 * запуске больше не всплывает — он живёт отдельным разделом в Профиле.
 */
function useIntro() {
  const [mode, setMode] = useState<IntroMode>(null)

  useEffect(() => {
    const onboarded = localStorage.getItem(ONBOARDED_KEY)
    // Уже пользовался приложением? (есть сохранённый стор) → не новичок.
    const hasUsedApp = !!localStorage.getItem(STORE_KEY)

    // Совсем новый пользователь — показываем онбординг.
    if (!onboarded && !hasUsedApp) {
      setMode('onboarding')
      return
    }

    // Существующему пользователю changelog при запуске больше НЕ показываем:
    // список обновлений живёт в Профиле, а о новых говорит счётчик на строке.
    // Поэтому VERSION_KEY здесь не трогаем — иначе счётчик сразу бы погас.
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

  return { mode, closeOnboarding, closeGuide }
}

/* ------------------------------------------------------------------ */

/** Монтируется в App: показывает быстрый старт новичку (и гайд, если открыт). */
export function IntroOverlay() {
  const { mode, closeOnboarding, closeGuide } = useIntro()
  return (
    <>
      <AnimatePresence>
        {mode === 'onboarding' && (
          <Suspense fallback={null} key="onb">
            <QuickStart onDone={closeOnboarding} />
          </Suspense>
        )}
      </AnimatePresence>
      {mode === 'guide' && (
        <Suspense fallback={null}>
          <GuideSheet open onClose={closeGuide} />
        </Suspense>
      )}
    </>
  )
}
