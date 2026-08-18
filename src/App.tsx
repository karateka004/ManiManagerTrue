import { Component, Suspense, lazy, useCallback, useEffect, useState, type ReactNode } from 'react'
import { TabBar, type Tab } from './components/TabBar'
import { HomePage } from './pages/Home'
import { useStore, type Transaction } from './store/transactions'
import { useTheme, useAccent } from './lib/useTheme'
import { useFormatLocale, useT } from './lib/i18n'
import { tg, hapticTap } from './lib/telegram'
import { isBackendConfigured, notifyGift, parseRefParam, registerReferral, submitProfile } from './lib/api'
import { initCloudSync } from './lib/cloud'
import { computeXp, levelFor } from './lib/levels'
import { giftsFor } from './lib/rewards'
import { lazyRetry } from './lib/lazyRetry'
import type { CategoryKind } from './store/categories'

// Лениво грузим вкладки кроме главной — каждая едет отдельным чанком.
// Импорты вынесены в функции, чтобы их же переиспользовать для префетча (прогрева).
const importAnalytics = () => import('./pages/Analytics')
const importRewards = () => import('./pages/Rewards')
const importProfile = () => import('./pages/Profile')
const importSettings = () => import('./pages/Settings')
// Шторка операции — теперь главное действие приложения («+» есть на каждой вкладке),
// поэтому её чанк греем вместе со вкладками: первое открытие иначе стоит заметную паузу.
const importAddSheet = () => import('./components/AddTransactionSheet')

const AnalyticsPage = lazyRetry(() => importAnalytics().then((m) => ({ default: m.AnalyticsPage })))
const RewardsPage = lazyRetry(() => importRewards().then((m) => ({ default: m.RewardsPage })))
const ProfilePage = lazyRetry(() => importProfile().then((m) => ({ default: m.ProfilePage })))
const SettingsPage = lazyRetry(() => importSettings().then((m) => ({ default: m.SettingsPage })))
const IntroOverlay = lazyRetry(() => import('./components/Intro').then((m) => ({ default: m.IntroOverlay })))
// Шторка операции живёт на уровне App, а не Главной: «плюс» в нижней панели
// доступен с любой вкладки. Отдельный чанк, грузится по первому открытию.
const AddTransactionSheet = lazy(() => importAddSheet().then((m) => ({ default: m.AddTransactionSheet })))

/**
 * Прогрев чанков вкладок в простое: качаем их заранее, чтобы первый переход
 * был мгновенным (без спиннера-фолбэка и «западания»). Запускаем после первой
 * отрисовки, когда главная уже на экране.
 */
function usePrefetchTabs() {
  useEffect(() => {
    const prefetch = () => {
      // fire-and-forget; сбой префетча неважен — реальная загрузка идёт через lazyRetry
      const swallow = () => {}
      importAnalytics().catch(swallow)
      importRewards().catch(swallow)
      importProfile().catch(swallow)
      importSettings().catch(swallow)
      importAddSheet().catch(swallow)
    }
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback
    if (ric) {
      const id = ric(prefetch)
      return () => (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(id)
    }
    const t = setTimeout(prefetch, 1500)
    return () => clearTimeout(t)
  }, [])
}

/** Один раз регистрируем реферала, если зашли по ссылке (?startapp=refNNN). */
function useReferralCapture() {
  useEffect(() => {
    if (!isBackendConfigured()) return
    const ref = parseRefParam(tg.startParam)
    if (!ref) return
    const KEY = 'koshel:refDone'
    if (localStorage.getItem(KEY)) return
    registerReferral(ref)
      .then(() => localStorage.setItem(KEY, '1'))
      .catch(() => {})
  }, [])
}

/**
 * Регистрируем профиль в таблице лидеров уже при запуске приложения, а не только
 * при заходе на вкладку «Профиль». Иначе в рейтинге появлялись лишь те, кто хоть
 * раз открыл профиль — отсюда «всего 4 человека». Теперь попадают все, кто открыл
 * приложение в Telegram.
 */
function useRegisterOnLaunch() {
  useEffect(() => {
    if (!isBackendConfigured() || !tg.isInTelegram) return
    const s = useStore.getState()
    const xp = computeXp(s.transactions.length, s.bonusXp)
    submitProfile({
      xp,
      level: levelFor(xp).level,
      ops: s.transactions.length,
      coins: s.coins,
      streakBest: s.streak.best,
      title: s.equipped.title,
      frame: s.equipped.frame,
      accent: s.equipped.accent,
    }).catch(() => {})
  }, [])
}

/**
 * Персональные подарки от команды (PERSONAL_GIFTS в rewards.ts): при запуске
 * в Telegram выдаём адресату его награды. grantReward идемпотентен, поэтому
 * повторные запуски безопасны.
 */
function useGrantPersonalGifts() {
  useEffect(() => {
    const u = tg.user
    if (!u) return
    const gifts = giftsFor(u.id, u.username)
    if (gifts.length === 0) return
    const grant = useStore.getState().grantReward
    for (const rewardId of gifts) grant(rewardId)

    // Поздравление от бота в ЛС — один раз (сервер дедупит по KV, локальный флаг
    // просто экономит запрос при следующих запусках).
    const KEY = 'koshel:giftNotified'
    if (localStorage.getItem(KEY) === gifts.join(',')) return
    notifyGift(gifts).then((ok) => {
      if (ok) localStorage.setItem(KEY, gifts.join(','))
    }).catch(() => {})
  }, [])
}

/**
 * Облачная синхронизация данных за TG-аккаунтом: при запуске подтягиваем данные
 * пользователя из облака (если они новее локальных) и подписываемся на изменения
 * для отправки обратно. Вне Telegram — no-op. См. `lib/cloud.ts`.
 */
function useCloudSync() {
  useEffect(() => {
    void initCloudSync()
  }, [])
}

export default function App() {
  useTheme()
  useAccent()
  useFormatLocale()
  useReferralCapture()
  useRegisterOnLaunch()
  useGrantPersonalGifts()
  useCloudSync()
  usePrefetchTabs()
  const [tab, setTab] = useState<Tab>('home')
  const track = useStore((s) => s.track)

  // Шторка операции: «+» в панели создаёт новую, тап по строке на Главной —
  // правит существующую. Монтируем только после первого открытия и больше не
  // размонтируем, чтобы отыграла анимация закрытия.
  const [sheet, setSheet] = useState<{ open: boolean; kind: CategoryKind }>({ open: false, kind: 'expense' })
  const [sheetMounted, setSheetMounted] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)

  const openAdd = useCallback(() => {
    setSheetMounted(true)
    setEditing(null)
    setSheet({ open: true, kind: 'expense' })
  }, [])

  const openEdit = useCallback((t: Transaction) => {
    setSheetMounted(true)
    setEditing(t)
    setSheet({ open: true, kind: t.type })
  }, [])

  const closeSheet = useCallback(() => {
    setSheet((s) => ({ ...s, open: false }))
    setEditing(null)
  }, [])

  // Переход на вкладку с отметкой действия-вовлечения (для заданий «за использование»).
  const changeTab = useCallback(
    (next: Tab) => {
      if (next === 'analytics') track('visit_analytics')
      setTab(next)
    },
    [track],
  )

  const openProfile = useCallback(() => changeTab('profile'), [changeTab])
  const openSettings = useCallback(() => changeTab('settings'), [changeTab])
  const openRewards = useCallback(() => changeTab('rewards'), [changeTab])

  return (
    <div className="min-h-screen" style={{ paddingTop: 'var(--safe-top)' }}>
      <DemoBanner />
      {/*
        Контейнер активной вкладки. Намеренно НЕ используем framer-motion
        `AnimatePresence mode="wait"`: он (а) монтировал новую вкладку только
        после завершения exit-анимации старой — если анимация не завершалась
        (rAF приостановлен в свёрнутом webview), новая вкладка не появлялась;
        (б) держал контент на `initial:opacity 0`, и при незапустившейся
        entrance-анимации вся вкладка (включая суммы в Аналитике/Календаре)
        оставалась невидимой. `key={tab}` ремонтирует поддерево при смене
        вкладки и перезапускает CSS-анимацию `.tab-enter`, у которой базовая
        непрозрачность — 1: контент виден всегда.
      */}
      <div key={tab} className="tab-enter">
        <ChunkErrorBoundary>
          <Suspense fallback={<PageFallback />}>
            {tab === 'home' && <HomePage onOpenProfile={openProfile} onEditTx={openEdit} />}
            {tab === 'analytics' && <AnalyticsPage />}
            {tab === 'rewards' && <RewardsPage />}
            {tab === 'profile' && (
              <ProfilePage onOpenSettings={openSettings} onOpenRewards={openRewards} />
            )}
            {tab === 'settings' && <SettingsPage onBack={openProfile} />}
          </Suspense>
        </ChunkErrorBoundary>
      </div>

      {/* На «Настройках» подсвечиваем Профиль (у настроек нет своей вкладки). */}
      <TabBar value={tab === 'settings' ? 'profile' : tab} onChange={changeTab} onAdd={openAdd} />

      {sheetMounted && (
        <Suspense fallback={null}>
          <AddTransactionSheet
            open={sheet.open}
            kind={sheet.kind}
            editing={editing}
            onClose={closeSheet}
          />
        </Suspense>
      )}

      <Suspense fallback={null}>
        <IntroOverlay />
      </Suspense>
    </div>
  )
}

/**
 * Крайний предохранитель: если чанк всё-таки не загрузился (и авто-reload из
 * lazyRetry уже отработал), показываем понятный экран с кнопкой «Обновить»
 * вместо застрявшего спиннера или белого экрана.
 */
class ChunkErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-8 text-center">
        <div className="text-sm font-semibold text-ink-muted">
          Не удалось загрузить раздел. Проверьте соединение и попробуйте ещё раз.
        </div>
        <button
          onClick={() => window.location.reload()}
          className="rounded-full bg-brand-500 px-5 py-2.5 text-sm font-bold text-white active:scale-95"
        >
          Обновить
        </button>
      </div>
    )
  }
}

/** Заглушка под ленивые вкладки: лёгкий спиннер по центру. */
function PageFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-brand-500/30 border-t-brand-500" />
    </div>
  )
}

/** Плашка-напоминание, что показаны демо-данные (а не реальные операции). */
function DemoBanner() {
  const demoMode = useStore((s) => s.demoMode)
  const setDemoMode = useStore((s) => s.setDemoMode)
  const t = useT()
  if (!demoMode) return null
  return (
    <div className="mx-4 mb-1 mt-2 flex items-center justify-between gap-3 rounded-2xl bg-brand-500/15 px-4 py-2.5 text-brand-700 dark:text-brand-200">
      <span className="text-xs font-semibold">{t('demo.banner')}</span>
      <button
        onClick={() => { hapticTap(); setDemoMode(false) }}
        className="shrink-0 rounded-full bg-brand-500 px-3 py-1 text-xs font-bold text-white active:scale-95"
      >
        {t('common.exit')}
      </button>
    </div>
  )
}
