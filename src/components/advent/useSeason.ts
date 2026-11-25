import { useEffect, useState } from 'react'
import { season, type Season } from '../../lib/season'
import { msToMidnight } from '../../lib/rewards'

/**
 * Сезон на сегодня. В полночь (и при возврате в свёрнутое приложение, если
 * день сменился) — перерисовка: окошко дня меняется, а страница могла
 * провисеть открытой всю ночь.
 */
export function useSeason(): { s: Season; now: Date } {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setTimeout(() => setNow(new Date()), msToMidnight(now) + 500)
    const onVis = () => {
      if (document.visibilityState !== 'visible') return
      const d = new Date()
      if (d.toDateString() !== now.toDateString()) setNow(d)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearTimeout(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [now])
  return { s: season(now), now }
}
