import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useLevel } from './LevelBar'
import { useStore } from '../store/transactions'
import { computeXp, levelFor } from '../lib/levels'

// Сам праздничный экран — ленивый чанк: нужен раз в несколько недель.
const LevelUpOverlay = lazy(() => import('./LevelUpOverlay').then((m) => ({ default: m.LevelUpOverlay })))

/** До какого уровня уже праздновали — отдельный ключ, не в синкаемом блобе. */
const KEY = 'koshel:celebratedLevel'

/**
 * Стор перечитан целиком (приняли облачную копию, откат после сбоя) — это
 * загрузка, а не рост: уровень запоминается без праздника. Иначе уровень,
 * взятый вчера на другом телефоне, праздновался бы здесь как только что
 * заработанный. Слушатель срабатывает до того, как React перерисует экран
 * с новыми данными, поэтому наблюдатель ниже видит уже запомненный уровень.
 */
useStore.persist.onFinishHydration((s) => {
  const level = levelFor(computeXp(s.transactions.length, s.bonusXp)).level
  try {
    const stored = Number(localStorage.getItem(KEY)) || 0
    if (level > stored) localStorage.setItem(KEY, String(level))
  } catch {
    /* приватный режим */
  }
})

/**
 * Следит за уровнем и празднует переход на новый — один раз на уровень.
 *
 * Первый запуск после обновления только запоминает текущий уровень: иначе
 * каждый, кто обновился, увидел бы праздник за уровень, взятый месяц назад.
 * Скачок сразу на несколько уровней (импорт файла) тоже не празднуем — это не
 * момент роста, а загрузка; облачную копию отсекает слушатель выше. Уровень,
 * потерянный удалением операций, «отпраздновать заново» нельзя: запоминаем
 * максимум. Записи из бота, слитые при запуске, празднуются: этот уровень
 * человек заработал сам и ещё не видел.
 */
export function LevelUpWatcher() {
  const { level } = useLevel()
  const [shown, setShown] = useState<number | null>(null)
  // Уровень, который ждёт показа: запись в localStorage уже сделана, а сам
  // экран откладывается — ref переживает повторный запуск эффекта.
  const pending = useRef<number | null>(null)

  useEffect(() => {
    let stored = 0
    try {
      stored = Number(localStorage.getItem(KEY)) || 0
    } catch {
      return
    }
    if (!stored) {
      try { localStorage.setItem(KEY, String(level)) } catch { /* приватный режим */ }
      return
    }
    if (level > stored) {
      try { localStorage.setItem(KEY, String(level)) } catch { /* приватный режим */ }
      if (level - stored === 1 && document.visibilityState === 'visible') pending.current = level
    }
    if (pending.current === null) return
    // Уровень обычно приходит вместе с наградой (монетки летят к счётчику,
    // закрывается шторка операции) — даём им доиграть, потом праздник.
    const id = setTimeout(() => {
      setShown(pending.current)
      pending.current = null
    }, 900)
    return () => clearTimeout(id)
  }, [level])

  if (shown === null) return null
  return (
    <Suspense fallback={null}>
      <LevelUpOverlay level={shown} onClose={() => setShown(null)} />
    </Suspense>
  )
}
