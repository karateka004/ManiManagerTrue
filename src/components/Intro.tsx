import { lazy, Suspense, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { hapticSelect } from '../lib/telegram'
import { APP_VERSION, ONBOARDED_KEY, VERSION_KEY, QS_KEY } from '../lib/introKeys'

// Полный гайд — отдельным чанком (общий с кнопкой в Настройках).
const GuideSheet = lazy(() => import('./GuideSheet').then((m) => ({ default: m.GuideSheet })))
// Быстрый старт новичка — отдельным чанком, нужен только при первом входе.
const QuickStart = lazy(() => import('./onboarding/QuickStart').then((m) => ({ default: m.QuickStart })))

type IntroMode = 'onboarding' | 'guide' | null

/**
 * Быстрый старт. Нужен ли он, решает App при запуске (lib/introGate) и грузит
 * этот чанк только тогда — поэтому здесь сразу быстрый старт. Заново не
 * проверяем: пока чанк грузился, стор мог успеть сохраниться, и новичок
 * выглядел бы «уже пользовавшимся». Список обновлений при запуске не
 * всплывает — он живёт отдельным разделом в Профиле.
 */
function useIntro() {
  const [mode, setMode] = useState<IntroMode>('onboarding')

  const closeOnboarding = () => {
    hapticSelect()
    localStorage.removeItem(QS_KEY)
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
