import {
  Component,
  Suspense,
  lazy,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { flushSync } from 'react-dom'
import { TabBar, type Tab } from './components/TabBar'
import { HomePage } from './pages/Home'
import { useStore, type Transaction } from './store/transactions'
import { useTheme, useAccent } from './lib/useTheme'
import { useFormatLocale, useT } from './lib/i18n'
import { tg, hapticSelect, hapticTap, lockVerticalSwipes } from './lib/telegram'
import { isBackendConfigured, notifyGift, parseRefParam, registerReferral, submitProfile } from './lib/api'
import { initCloudSync } from './lib/cloud'
import { computeXp, levelFor } from './lib/levels'
import { giftsFor } from './lib/rewards'
import { lazyRetry } from './lib/lazyRetry'
import { useBackButton } from './lib/useBackButton'
import { resetRewardsNav, rewardsNav } from './lib/rewardsNav'
import { useSwipeNav, type SwipeDir, type SwipeHost } from './lib/useSwipeNav'
import { TabActiveContext } from './lib/tabActive'
import { Toaster } from './components/ui/Toaster'
import { LevelUpWatcher } from './components/LevelUp'
import type { CategoryKind } from './store/categories'

/**
 * Порядок вкладок в панели — по нему выбирается направление перехода: вкладка
 * правее приезжает справа, левее — слева. Настройки — «вглубь» Профиля.
 */
const TAB_ORDER: Record<Tab, number> = { home: 0, analytics: 1, rewards: 2, profile: 3, settings: 4 }
/** Вкладки панели по порядку — их листает свайп. */
const SWIPE_ORDER: Tab[] = ['home', 'analytics', 'rewards', 'profile']
/** Все экраны верхнего уровня — порядок панелей в DOM (ключи стабильны). */
const ALL_TABS: Tab[] = ['home', 'analytics', 'rewards', 'profile', 'settings']
/** `swipe` — экран приехал за пальцем и уже стоит на месте: своей анимации нет. */
type NavDir = 'init' | 'r' | 'l' | 'deep' | 'back' | 'swipe'
const ENTER_CLASS: Record<NavDir, string> = {
  init: 'tab-enter',
  r: 'tab-in-r',
  l: 'tab-in-l',
  deep: 'tab-in-deep',
  back: 'tab-in-back',
  swipe: '',
}

/** Соседи экрана для свайпа: prev — палец вправо, next — влево. У Настроек — только Профиль. */
function swipeNeighbors(tab: Tab): Record<SwipeDir, Tab | null> {
  if (tab === 'settings') return { prev: 'profile', next: null }
  const i = SWIPE_ORDER.indexOf(tab)
  return { prev: SWIPE_ORDER[i - 1] ?? null, next: SWIPE_ORDER[i + 1] ?? null }
}

/** Какие экраны держать отрисованными: открытый и его соседей. */
function keptFor(tab: Tab): Tab[] {
  const n = swipeNeighbors(tab)
  return ALL_TABS.filter((t) => t === tab || t === n.prev || t === n.next)
}

/** Сделать в простое; возвращает отмену. На iOS requestIdleCallback нет — таймер. */
function whenIdle(fn: () => void): () => void {
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number
    cancelIdleCallback?: (id: number) => void
  }
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(fn, { timeout: 1000 })
    return () => w.cancelIdleCallback?.(id)
  }
  const id = setTimeout(fn, 400)
  return () => clearTimeout(id)
}

// Лениво грузим вкладки кроме главной — каждая едет отдельным чанком.
// Импорты вынесены в функции, чтобы их же переиспользовать для префетча (прогрева).
const importAnalytics = () => import('./pages/Analytics')
const importRewards = () => import('./pages/Rewards')
const importProfile = () => import('./pages/Profile')
const importSettings = () => import('./pages/Settings')
// Шторка операции — теперь главное действие приложения («+» есть на каждой вкладке),
// поэтому её чанк греем вместе со вкладками: первое открытие иначе стоит заметную паузу.
const importAddSheet = () => import('./components/AddTransactionSheet')

// memo: страницы живут скрытыми рядом с открытой (свайп), и смена открытой
// вкладки не должна перерисовывать их целиком — пропсы у них не меняются.
const AnalyticsPage = memo(lazyRetry(() => importAnalytics().then((m) => ({ default: m.AnalyticsPage }))))
const RewardsPage = memo(lazyRetry(() => importRewards().then((m) => ({ default: m.RewardsPage }))))
const ProfilePage = memo(lazyRetry(() => importProfile().then((m) => ({ default: m.ProfilePage }))))
const SettingsPage = memo(lazyRetry(() => importSettings().then((m) => ({ default: m.SettingsPage }))))
const IntroOverlay = lazyRetry(() => import('./components/Intro').then((m) => ({ default: m.IntroOverlay })))
// Шторка операции живёт на уровне App, а не Главной: «плюс» в нижней панели
// доступен с любой вкладки. Отдельный чанк, грузится по первому открытию.
const AddTransactionSheet = lazy(() => importAddSheet().then((m) => ({ default: m.AddTransactionSheet })))
// Поиск — отдельный чанк: нужен не каждому запуску, греть его заранее незачем.
const SearchSheet = lazy(() => import('./components/SearchSheet').then((m) => ({ default: m.SearchSheet })))
// Ассистент — отдельный чанк: экран нужен не каждому и не в первую секунду.
const AssistantSheet = lazy(() => import('./components/AssistantSheet').then((m) => ({ default: m.AssistantSheet })))

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
  // Вкладка и направление, откуда она приехала (класс анимации появления).
  const [nav, setNav] = useState<{ tab: Tab; dir: NavDir }>({ tab: 'home', dir: 'init' })
  const tab = nav.tab
  const navRef = useRef(nav)
  navRef.current = nav
  // Прокрутка каждой вкладки: вернулся на Главную — она там же, где была.
  const scrollMemory = useRef<Partial<Record<Tab, number>>>({})
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

  // Поиск по всей истории. Монтируем только после первого открытия.
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchMounted, setSearchMounted] = useState(false)
  const openSearch = useCallback(() => {
    setSearchMounted(true)
    setSearchOpen(true)
  }, [])
  const closeSearch = useCallback(() => setSearchOpen(false), [])

  // Ассистент: вопросы про свои деньги. Монтируем так же — по первому открытию.
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [assistantMounted, setAssistantMounted] = useState(false)
  const openAssistant = useCallback(() => {
    setAssistantMounted(true)
    setAssistantOpen(true)
  }, [])
  const closeAssistant = useCallback(() => setAssistantOpen(false), [])

  const closeSheet = useCallback(() => {
    setSheet((s) => ({ ...s, open: false }))
    setEditing(null)
  }, [])

  // Переход на вкладку с отметкой действия-вовлечения (для заданий «за использование»).
  // Тап по уже открытой вкладке — плавно наверх, как в нативных приложениях.
  // `via: 'swipe'` — экран уже приехал за пальцем, своя анимация появления не нужна.
  const changeTab = useCallback(
    (next: Tab, via?: 'swipe') => {
      const cur = navRef.current.tab
      if (cur === next) {
        // Внутри «Прогресса» открыт Магазин или Титулы — сначала назад на
        // хаб (туда, где его оставили), а уже следующий тап — наверх.
        if (next === 'rewards' && rewardsNav.screen !== 'hub') {
          resetRewardsNav(false)
          return
        }
        window.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }
      if (next === 'analytics') track('visit_analytics')
      scrollMemory.current[cur] = window.scrollY
      const dir: NavDir =
        via === 'swipe'
          ? 'swipe'
          : next === 'settings'
            ? 'deep'
            : cur === 'settings' && next === 'profile'
              ? 'back'
              : TAB_ORDER[next] > TAB_ORDER[cur]
                ? 'r'
                : 'l'
      setNav({ tab: next, dir })
    },
    [track],
  )

  // Окно прокрутки у всех вкладок общее, поэтому позицию каждой помним сами:
  // вкладка открывается там, где её оставили (первый раз — с начала). До
  // отрисовки — чтобы въезжающий экран не дёрнулся посреди анимации. Ленивая
  // вкладка может дорисоваться чуть позже; тогда дожидаемся, пока страница
  // станет достаточно длинной, и ставим позицию один раз.
  useLayoutEffect(() => {
    const target = scrollMemory.current[tab] ?? 0
    window.scrollTo(0, target)
    if (target === 0 || window.scrollY >= target - 1) return
    let tries = 0
    const id = setInterval(() => {
      const room = document.documentElement.scrollHeight - window.innerHeight
      if (room >= target) window.scrollTo(0, target)
      if (room >= target || ++tries > 12) clearInterval(id)
    }, 40)
    return () => clearInterval(id)
  }, [tab])

  const openProfile = useCallback(() => changeTab('profile'), [changeTab])
  const openSettings = useCallback(() => changeTab('settings'), [changeTab])
  // Строка «Уровень» в Профиле: человек идёт смотреть уровень — открываем хаб
  // с начала, даже если в прошлый раз ушёл с «Прогресса» из Магазина.
  const openRewards = useCallback(() => {
    resetRewardsNav(true)
    scrollMemory.current.rewards = 0
    changeTab('rewards')
  }, [changeTab])

  // Настройки — вложенный экран: системная «Назад» Telegram возвращает в Профиль.
  useBackButton(tab === 'settings', openProfile)

  // Сворачивание мини-аппа вертикальным свайпом выключено на всё время работы.
  // На iPhone Telegram забирал себе косой свайп вбок, и приложение уезжало вниз
  // карточкой. Выключать его только на время жеста поздно: свой жест Telegram опознаёт
  // раньше, чем мы поймём, что жест горизонтальный. Свернуть и закрыть
  // приложение по-прежнему можно, потянув за шапку Telegram. Шторки берут ту же
  // блокировку со счётчиком — их закрытие её не снимет.
  useEffect(() => lockVerticalSwipes(), [])

  // Какие экраны держим отрисованными, кроме открытого: соседей по свайпу.
  // Дорисовываем в простое после переключения — сам переход их не ждёт.
  const [kept, setKept] = useState<Tab[]>([])
  useEffect(() => {
    const want = keptFor(tab)
    return whenIdle(() => setKept((k) => (sameTabs(k, want) ? k : want)))
  }, [tab])
  const panelRefs = useRef<Partial<Record<Tab, HTMLDivElement | null>>>({})
  const setPanelRef = useCallback((t: Tab, el: HTMLDivElement | null) => {
    panelRefs.current[t] = el
  }, [])

  // Свайп вправо-влево — соседняя вкладка в порядке панели, как карусель (lib/useSwipeNav).
  // На вложенных экранах свайп вправо — «назад», как в iOS: с Настроек под
  // пальцем уже виден Профиль; из Магазина и Титулов — хаб «Прогресса».
  const pagerRef = useRef<HTMLDivElement>(null)
  const swipeHost = useMemo<SwipeHost>(
    () => ({
      current: () => panelRefs.current[navRef.current.tab] ?? null,
      target: (dir) => {
        const cur = navRef.current.tab
        if (cur === 'rewards' && rewardsNav.screen !== 'hub') return dir === 'prev' ? { kind: 'back' } : null
        const next = swipeNeighbors(cur)[dir]
        if (!next) return null
        return { kind: 'panel', panel: panelRefs.current[next] ?? null, scroll: scrollMemory.current[next] ?? 0 }
      },
      begin: () => {
        const want = keptFor(navRef.current.tab)
        setKept((k) => (want.every((t) => k.includes(t)) ? k : [...new Set([...k, ...want])]))
      },
      progress: (p, follow) => {
        // Капсула нижней панели едет вместе с экранами. С Настроек — нет: там
        // подсвечен Профиль, и «назад» в него капсулу не двигает. Переменная —
        // на самой капсуле: на <html> её наследовал бы весь документ, и браузер
        // пересчитывал бы стили всех трёх страниц на каждом кадре жеста.
        const capsule = document.querySelector<HTMLElement>('.tab-capsule')
        if (!capsule) return
        const value = navRef.current.tab === 'settings' ? 0 : p
        capsule.style.setProperty('--tab-swipe', value ? value.toFixed(4) : '0')
        capsule.style.transition = follow ? 'none' : ''
      },
      commit: (dir) => {
        const cur = navRef.current.tab
        hapticSelect()
        if (cur === 'rewards' && rewardsNav.screen !== 'hub') {
          flushSync(() => resetRewardsNav(false))
          return
        }
        const next = swipeNeighbors(cur)[dir]
        if (!next) return
        // Соседа не успели отрисовать — пусть появится обычной анимацией.
        const ready = Boolean(panelRefs.current[next])
        flushSync(() => changeTab(next, ready ? 'swipe' : undefined))
      },
    }),
    [changeTab],
  )
  useSwipeNav(pagerRef, swipeHost)

  const pageProps = useMemo<PageProps>(
    () => ({ openProfile, openEdit, openSearch, openAssistant, openSettings, openRewards }),
    [openProfile, openEdit, openSearch, openAssistant, openSettings, openRewards],
  )

  return (
    <div className="min-h-screen" style={{ paddingTop: 'var(--safe-top)' }}>
      <DemoBanner />
      {/*
        Вкладки. Открытая — в потоке документа, её прокручивает окно. Соседние
        отрисованы рядом, но скрыты и вне потока (.tab-panel[data-off]): свайп
        показывает их сразу. Появление — CSS-класс на .tab-host, а не framer
        `AnimatePresence`: тот монтировал новую вкладку только после exit-анимации
        старой и держал её на `initial:opacity 0`, и при остановленном rAF
        (свёрнутый webview) вкладка не появлялась. У CSS-классов базовая
        непрозрачность 1: контент виден всегда.
      */}
      <div ref={pagerRef} className="tab-pager" style={{ touchAction: 'pan-y pinch-zoom' }}>
        {ALL_TABS.filter((t) => t === tab || kept.includes(t)).map((t) => (
          <TabPanel
            key={t}
            tab={t}
            active={t === tab}
            enter={t === tab ? ENTER_CLASS[nav.dir] : ''}
            setRef={setPanelRef}
            pages={pageProps}
          />
        ))}
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

      {assistantMounted && (
        <Suspense fallback={null}>
          <AssistantSheet open={assistantOpen} onClose={closeAssistant} />
        </Suspense>
      )}

      {searchMounted && (
        <Suspense fallback={null}>
          <SearchSheet open={searchOpen} onClose={closeSearch} onEditTx={openEdit} />
        </Suspense>
      )}

      <Suspense fallback={null}>
        <IntroOverlay />
      </Suspense>

      <LevelUpWatcher />
      <Toaster />
    </div>
  )
}

interface PageProps {
  openProfile: () => void
  openEdit: (t: Transaction) => void
  openSearch: () => void
  openAssistant: () => void
  openSettings: () => void
  openRewards: () => void
}

function sameTabs(a: Tab[], b: Tab[]): boolean {
  return a.length === b.length && a.every((t, i) => t === b[i])
}

/**
 * Панель одного экрана. memo: App перерисовывается на каждую шторку и поиск,
 * а скрытым соседям это незачем — у них меняются только свои данные из стора.
 *
 * Скрытая панель — `inert` и `aria-hidden`: ни фокуса, ни озвучки, ни нажатий.
 * Своим эффектам она сообщает это через TabActiveContext.
 */
const TabPanel = memo(function TabPanel({
  tab,
  active,
  enter,
  setRef,
  pages,
}: {
  tab: Tab
  active: boolean
  enter: string
  setRef: (t: Tab, el: HTMLDivElement | null) => void
  pages: PageProps
}) {
  const ref = useCallback((el: HTMLDivElement | null) => setRef(tab, el), [setRef, tab])
  return (
    <div
      ref={ref}
      className="tab-panel"
      data-off={active ? undefined : ''}
      aria-hidden={active ? undefined : true}
      // `inert` React 18 не знает — передаём строкой, как обычный атрибут.
      {...(active ? null : ({ inert: '' } as Record<string, string>))}
    >
      <div className={`tab-host ${enter}`}>
        <TabActiveContext.Provider value={active}>
          <ChunkErrorBoundary>
            <Suspense fallback={active ? <PageFallback /> : null}>
              {tab === 'home' && (
                <HomePage
                  onOpenProfile={pages.openProfile}
                  onEditTx={pages.openEdit}
                  onOpenSearch={pages.openSearch}
                  onOpenAssistant={pages.openAssistant}
                />
              )}
              {tab === 'analytics' && <AnalyticsPage onEditTx={pages.openEdit} />}
              {tab === 'rewards' && <RewardsPage />}
              {tab === 'profile' && <ProfilePage onOpenSettings={pages.openSettings} onOpenRewards={pages.openRewards} />}
              {tab === 'settings' && <SettingsPage onBack={pages.openProfile} />}
            </Suspense>
          </ChunkErrorBoundary>
        </TabActiveContext.Provider>
      </div>
    </div>
  )
})

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
          Не удалось загрузить раздел. Проверь соединение и попробуй ещё раз.
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
    <div className="card mx-4 mb-1 mt-2 flex items-center justify-between gap-3 px-4 py-2.5">
      <span className="caption text-ink-muted">{t('demo.banner')}</span>
      <button
        onClick={() => { hapticTap(); setDemoMode(false) }}
        className="shrink-0 rounded-full bg-surface-sunken px-3 py-1.5 text-xs font-semibold text-ink active:scale-95"
      >
        {t('common.exit')}
      </button>
    </div>
  )
}
