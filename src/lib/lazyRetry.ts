import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

/**
 * Надёжная ленивая загрузка чанка.
 *
 * Зачем: при code-splitting динамический import() может упасть —
 *  - сетевой сбой / медленный канал в Telegram WebView;
 *  - чаще: открыт СТАРЫЙ index.html (закешированный), который ссылается на старые
 *    хэши чанков; после нового деплоя их уже нет на Pages → 404 → экран «висит».
 *
 * Что делаем:
 *  1) одна повторная попытка через короткую паузу (лечит разовый сетевой сбой);
 *  2) если опять мимо — разовая перезагрузка страницы (флаг в sessionStorage от
 *     зацикливания), чтобы подтянуть свежий index с актуальными хэшами.
 *  Флаг снимается в main.tsx по событию `load` (значит, перезагрузка удалась).
 */
const RELOAD_FLAG = 'koshel:chunkReload'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await factory()
    } catch {
      await new Promise((r) => setTimeout(r, 400))
      try {
        return await factory()
      } catch (err) {
        if (!sessionStorage.getItem(RELOAD_FLAG)) {
          sessionStorage.setItem(RELOAD_FLAG, '1')
          window.location.reload()
          // Держим Suspense в ожидании, пока идёт перезагрузка.
          return new Promise<{ default: T }>(() => {})
        }
        throw err
      }
    }
  })
}

/** Снять флаг перезагрузки — вызывается, когда страница успешно загрузилась. */
export function clearChunkReloadFlag() {
  try {
    sessionStorage.removeItem(RELOAD_FLAG)
  } catch {
    /* sessionStorage может быть недоступен — не критично */
  }
}
