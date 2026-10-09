import { tg } from './telegram'

/**
 * Флаги производительности на <html>:
 *   perf-low    — слабое Android-устройство: Telegram пишет класс устройства
 *                 в User-Agent («…; SDK 34; LOW)»). Без живых обложек, вечных
 *                 анимаций и частиц — только статичная картинка;
 *   anim-paused — мини-апп свёрнут (событие deactivated, Bot API 8.0) или
 *                 вкладка скрыта: бесконечные украшения ставятся на паузу,
 *                 чтобы не жечь батарею в фоне.
 * Правила — в styles/skins.css.
 */
export function initPerfFlags() {
  const root = document.documentElement
  const m = /Telegram-Android\/[\d.]+ \([^)]*;\s*(LOW|AVERAGE|HIGH)\)/i.exec(navigator.userAgent)
  if (m && m[1].toUpperCase() === 'LOW') root.classList.add('perf-low')

  const setPaused = (paused: boolean) => root.classList.toggle('anim-paused', paused)
  document.addEventListener('visibilitychange', () => setPaused(document.hidden))
  try {
    tg.webApp?.onEvent('deactivated', () => setPaused(true))
    tg.webApp?.onEvent('activated', () => setPaused(document.hidden))
  } catch {
    /* старый клиент без этих событий */
  }
}

/** Слабое устройство — частицы и живые слои не рисуем. */
export function isLowEnd(): boolean {
  return document.documentElement.classList.contains('perf-low')
}
