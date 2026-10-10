import { useEffect, useLayoutEffect, useRef, type HTMLAttributes, type RefObject } from 'react'
import clsx from 'clsx'

/**
 * Скользящая плашка под выбранным пунктом сегмента.
 *
 * Плашка одна и ЕЗДИТ: позиция и ширина берутся из выбранного пункта
 * (`.seg-on`), переход — CSS transition (styles/motion.css). Пока плашка не
 * измерена или пункт не виден, работает обычная заливка `.seg-on` — сегмент
 * рабочий и без неё.
 *
 * `active` — что угодно, по чему видно смену выбора (id вкладки, режим).
 */
export function useSegPill<T extends HTMLElement = HTMLDivElement>(active: unknown) {
  const trackRef = useRef<T>(null)
  const pillRef = useRef<HTMLSpanElement>(null)
  const placed = useRef(false)

  const place = (animate: boolean) => {
    const track = trackRef.current
    const pill = pillRef.current
    if (!track || !pill) return
    const on = track.querySelector<HTMLElement>(':scope > .seg-on')
    if (!on || on.offsetWidth === 0) {
      delete track.dataset.pilled
      pill.style.opacity = '0'
      placed.current = false
      return
    }
    const instant = !animate || !placed.current
    if (instant) pill.style.transition = 'none'
    pill.style.width = `${on.offsetWidth}px`
    pill.style.height = `${on.offsetHeight}px`
    pill.style.transform = `translate3d(${on.offsetLeft}px, ${on.offsetTop}px, 0)`
    pill.style.opacity = '1'
    track.dataset.pilled = '1'
    if (instant) {
      void pill.offsetWidth // применить положение без перехода
      pill.style.transition = ''
    }
    placed.current = true
  }

  // До отрисовки: первый кадр уже с плашкой на месте. Только при смене выбора:
  // измерение после каждой перерисовки (шторка операции перерисовывается на
  // каждое нажатие клавиши) заставляло браузер пересчитывать раскладку всего
  // экрана посреди ввода — +50 мс на слабом телефоне.
  useLayoutEffect(() => {
    place(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  // Размеры поменялись (поворот экрана, догрузился шрифт, сменился язык и
  // подписи стали другой ширины) — переставить без анимации. Наблюдаем и
  // трек, и сами пункты. Первый вызов наблюдателя пропускаем: он приходит
  // сразу после подписки и сбил бы идущий переход.
  useEffect(() => {
    const track = trackRef.current
    if (!track || typeof ResizeObserver === 'undefined') return
    let first = true
    const ro = new ResizeObserver(() => {
      if (first) {
        first = false
        return
      }
      place(false)
    })
    ro.observe(track)
    for (const child of Array.from(track.children)) {
      if (child !== pillRef.current) ro.observe(child)
    }
    let alive = true
    document.fonts?.ready.then(() => {
      if (alive) place(false)
    })
    return () => {
      alive = false
      ro.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { trackRef, pillRef }
}

/**
 * Держит выбранный пункт в видимой части ряда, который прокручивается вбок
 * (вкладки Аналитики и виды Магазина на 320 px).
 *
 * Двигает только сам ряд: scrollIntoView прокручивал ещё и страницу — вкладка,
 * вернувшаяся на запомненное место, уезжала к ряду. Первый показ — без
 * анимации (и без движения вовсе, если пункт и так виден).
 */
export function useKeepSegVisible(trackRef: RefObject<HTMLElement>, active: unknown) {
  const first = useRef(true)
  useEffect(() => {
    const smooth = !first.current
    first.current = false
    const track = trackRef.current
    const on = track?.querySelector<HTMLElement>(':scope > .seg-on')
    if (!track || !on) return
    const max = track.scrollWidth - track.clientWidth
    if (max <= 1) return
    // Выбранный — по центру ряда: видно и соседей с обеих сторон, то есть
    // что ряд продолжается.
    const left = Math.max(0, Math.min(max, on.offsetLeft - (track.clientWidth - on.offsetWidth) / 2))
    if (Math.abs(left - track.scrollLeft) < 1) return
    if (smooth) track.scrollTo({ left, behavior: 'smooth' })
    else track.scrollLeft = left
  }, [active, trackRef])
}

/**
 * Трек сегмента с плашкой: `<SegTrack active={tab}>…кнопки .seg-item…</SegTrack>`.
 * Остальные атрибуты (role="radiogroup", aria-label) уходят на сам трек.
 */
export function SegTrack({
  active,
  className,
  children,
  ...rest
}: {
  active: unknown
} & HTMLAttributes<HTMLDivElement>) {
  const { trackRef, pillRef } = useSegPill<HTMLDivElement>(active)
  return (
    <div ref={trackRef} {...rest} className={clsx('seg-track', className)}>
      <span ref={pillRef} className="seg-pill" aria-hidden />
      {children}
    </div>
  )
}
