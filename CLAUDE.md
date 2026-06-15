# Кошель — контекст проекта для Claude

Телеграм Mini App для учёта личных финансов. Клиентское приложение (данные в браузере,
с облачной синхронизацией за TG-аккаунтом) + маленький бэкенд на Cloudflare Worker
(отзывы, рефералы, лидерборд и облачное хранилище данных пользователя).

- **Бот:** @TrueManiManager_Bot
- **Репозиторий/деплой:** GitHub Pages → https://karateka004.github.io/ManiManagerTrue/
- **Worker:** https://koshel-worker.karateka004.workers.dev
- **Владелец/получатель отзывов:** chat_id `439944083` (Святослав, @flagman_crypto)
- **Язык:** UI и комментарии в коде — русские. Отвечай пользователю по-русски.

## Стек
React 18.3 + TypeScript 5.6 + Vite 5.4 + Tailwind 3.4 (`darkMode: 'class'`) +
Zustand 5 (persist + migrate) + framer-motion 11 (LazyMotion) + dayjs (ru locale).
Бэкенд: Cloudflare Workers + Wrangler 3.

## Команды
Фронтенд (из корня):
- `npm run dev` — Vite dev-сервер на :5173
- `npm run lint` — `tsc --noEmit` (проверка типов, без сборки)
- `npm run build` — `tsc -b && vite build` в `dist/`
- `npm run deploy` — сборка + `gh-pages -d dist` (публикация на GitHub Pages)

Worker (из папки `worker/`):
- `npx wrangler deploy` — задеплоить воркер
- `npx wrangler tail` — живые логи
- Секрет токена бота: создать `worker/_secrets.json` `{ "BOT_TOKEN": "..." }`,
  `npx wrangler secret bulk _secrets.json`, **сразу удалить файл**.

## Рабочее окружение и отладка
- **Dev-серверы:** конфиги в `.claude/launch.json` (в корне проекта) И в `C:\Users\User\.claude\launch.json`
  (preview-инструменты читают именно home-уровень, т.к. workspace root = домашняя папка, НЕ подпапка проекта).
  Два сервиса: `frontend (vite)` (порт 5173) и `worker (wrangler)` (порт 8787). На home-уровне у vite
  абсолютный `--prefix C:/Users/User/Desktop/FinApp run dev`.
- **Preview-инструменты** (`mcp__Claude_Preview__*`, грузятся через ToolSearch): `preview_list`
  (узнать serverId), `preview_eval` (выполнить JS на странице — главный инструмент отладки: читать DOM,
  стор через `localStorage['finance-mini-app:v1']`, кликать кнопки), `preview_console_logs`, `preview_screenshot`.
- **ГРАБЛЯ preview:** окно превью фоновое → `requestAnimationFrame` ПРИОСТАНОВЛЕН. Любые framer-анимации
  (`m.*`) НЕ стартуют и висят на `initial`. Поэтому `preview_screenshot` иногда таймаутит («renderer busy»),
  а `getComputedStyle(el).opacity` у `m.div initial:{opacity:0}` показывает 0, хотя в реальном Telegram
  анимация бы отыграла. Не путай этот артефакт с реальным багом. `innerText` отдаёт текст независимо от opacity.
- **Деплой-флоу (проверено):** `npm run lint && npm run build` → `npx gh-pages -d dist` → дождаться выкатки
  опросом (фоном, без долгого sleep):
  `until curl.exe -s https://karateka004.github.io/ManiManagerTrue/ | grep -o "<новый-хэш>"; do sleep 5; done`.
  Хэш бандла виден в выводе `vite build` (`dist/assets/index-XXXX.js`). PowerShell 5.1 — TLS 1.0, поэтому `curl.exe`, не `Invoke-WebRequest`.

## Карта файлов
**Стор (источник правды):** `src/store/transactions.ts` — Zustand persist
(`name: 'finance-mini-app:v1'`, **`version: 11`**). Поля: `transactions`, `period`, `currency`,
`chartStyle`, `budgets`, `themeMode`, `customCategories`, `bonusXp`, `coins`, `claimedQuests`,
`questClaims` (таймстемпы получения наград — для цепочки/ротации квестов), `streak`, `equipped`,
`owned`, `demoMode`, `lang` ('ru'/'en'), `monthlyBudget` (общий месячный бюджет), `goals`
(накопительные цели), `homeHeaderMode` ('date'|'goal'), `homeHeaderGoalId`, `events`
(`Record<string, number>` — счётчики действий-вовлечения для заданий, см. ниже),
`lastTxCurrency` (валюта последней записанной операции — открывается по умолчанию в форме).
`Transaction` имеет опциональное поле `currency?: Currency` — per-transaction валюта;
если не задана, используется `s.currency` при отображении (обратная совместимость).
Действие `track(event)` инкрементит `events[event]`. Селекторы мемоизированы через WeakMap
(`memo1`/`memo2`). Категории: `src/store/categories.ts`.
Финансовые селекторы читают данные через `activeTransactions(s)` (демо или реальные);
профиль/уровень/задания читают `s.transactions` напрямую — демо их НЕ затрагивает.
**Миграции идут лесенкой `if (version < N)`** — при новом поле бампай `version` и добавляй ветку.

**Страницы:** `src/pages/` — Home, Analytics, Charts, **Rewards**, **Profile**, Settings. Роутинг
табами в `src/App.tsx`. **Нижняя панель — 5 вкладок:** Главная · Аналитика · Графики · **Награды** ·
Профиль (`TabBar.ITEMS`). **Настройки убраны из панели** — открываются из шапки Профиля
(иконка-шестерёнка → `changeTab('settings')`); `SettingsPage` принимает `onBack` (кнопка ←).
`'settings'` остаётся валидным значением `Tab`, но его нет в `ITEMS`; на «Настройках» в панели
подсвечивается Профиль. Аватар в шапке Home → `onOpenProfile` → вкладка профиля.
В `App.tsx` смонтирован `DemoBanner`.

**Вкладка «Награды» (`src/pages/Rewards.tsx`) — хаб геймификации (с 1.15):** уровень/XP-герой
(брендовый градиент) + бенто-плитки «Достижения» (→ `RoadpassSheet`) и «Лидеры» (→ `LeaderboardSheet`) +
список заданий (`QuestCard`) + рефералы (`ReferralBlock`). Сюда переехали из Профиля: сборка `metrics`,
`now`-тикер, `claimQuest`, `getReferralStats`, сабмит в лидерборд, монтирование Roadpass/Leaderboard.
**track-события сохранены:** `open_achievements`/`open_leaderboard` (плитки Наград), `open_planning`
(Планирование осталось в Профиле). `QuestCard`/`ReferralBlock` вынесены в `src/components/rewards/`.

**Профиль (`src/pages/Profile.tsx`) после редизайна:** только личное/финансы — аватар+титул, компактная
строка уровня (→ ведёт на «Награды»), статистика (доходы/расходы/баланс/операции), топ-категория,
**Планирование** (`PlanningSheet`, финансы — осталось здесь), «с нами с …», отзыв, шестерёнка настроек.
Геймификации в Профиле больше НЕТ.

**Общие UI-примитивы (`src/components/ui/`):** `BottomSheet` (общий оверлей+выезжающий лист с «ручкой»,
заменил дубль в `RoadpassSheet`; `Planning`/`Leaderboard` оставлены на своём flex-col layout — у них
фиксированная шапка+вкладки и внутренний скролл), `Tile` (квадратная бенто-плитка), `MenuRow` (строка-ряд),
`accent.ts` (`ACCENT_CHIP` — словарь тинтов brand/amber/yellow/emerald/rose для светлой+тёмной темы).

**Шапка Главной (строгая, без геймификации):** в `Home.tsx` шапка = «Кошель» + настраиваемый
подзаголовок + аватар. Шкалы уровня (`LevelBar`) на Главной НЕТ — вся гейм-часть в профиле.
Подзаголовок задаётся стором `homeHeaderMode` ('date' | 'goal') + `homeHeaderGoalId`:
**Дата** (`DateHeader`, «Среда, 21 мая») или **Прогресс к цели** (`GoalHeader` — иконка+название
накопительной цели из `goals` + прогресс-бар «накоплено/сумма»). Переключатель — в Settings
(секция «Шапка Главной»): кнопки Дата/Цель + список целей. Если цель не выбрана — берётся первая;
если целей нет — показывается дата (фолбэк). При удалении выбранной цели `homeHeaderGoalId` сбрасывается.

**Аналитика:** `src/pages/Analytics.tsx` + `src/components/AnalyticsTabs.tsx` (3 вкладки:
Расходы / Доходы / **Календарь**, grid-cols-3). Календарь — `src/components/MonthCalendar.tsx`:
своя навигация по месяцам, фильтр (Чистый итог / Доходы / Расходы), под числом дня —
итог (для «Чистый итог» = доход−расход), внизу сумма за месяц. Читает `activeTransactions`.
Формат суммы в ячейке (`compact()`): до 5 знаков (< 100 000) — число как есть, без «к» и
без округления (4050 → «4050», НЕ «4,1к» — округление вверх искажало дневной итог); от
100 000 — «к» (150 000 → «150к»). Итог месяца внизу — полный `formatMoney`.
Обёртки секций (диаграмма / календарь) в `Analytics.tsx` — обычные `<div className="tab-enter">`,
НЕ `m.div initial:opacity` (см. «Грабли» про скрытый контент). `MonthCalendar` сам по себе
без анимаций-обёрток — суммы статичны и видны всегда.

**Демо-режим:** `src/lib/demo.ts` — детерминированный (mulberry32) набор за ~24 мес.,
ленивый модульный кэш (стабильная ссылка). Включается тумблером в Settings → «Данные»
или из пустого состояния (`CategoryList`). Не пишет в `transactions` — только флаг `demoMode`.

**Операции задним числом:** `AddTransactionSheet.submit` после `addTransaction` проверяет,
попадает ли дата в текущий `periodBounds`; если нет — вызывает `focusPeriodOn(iso)`
(наводит период на дату операции), иначе запись «пропала бы» из видимого периода.

**Профиль/геймификация:** `src/pages/Profile.tsx` (`ProfilePage` + ReferralBlock +
FeedbackBlock + QuestCard), аватар вынесен в `src/components/Avatar.tsx` (рисует надетую
рамку), `src/components/LevelBar.tsx`, `src/lib/levels.ts`, `src/lib/quests.ts`. Кнопки
профиля: «Достижения», «Таблица лидеров», «Планирование», «Задания». Профиль тикает
`now` раз в минуту, чтобы таймеры разблокировки квестов обновлялись.

**i18n:** `src/lib/i18n.ts` — словарь RU/EN + `translate(lang, key, vars)` + хук `useT()`
(подписан на `s.lang`). Подстановка `{var}`. Дефолт языка — из `tg.user.language_code`.
Переключатель — Settings → «Язык». Переведены: навигация (TabBar), Settings, Profile,
LeaderboardSheet, PlanningSheet, квесты. Главная/Аналитика/Графики пока в основном на RU.

**Планирование (`src/components/PlanningSheet.tsx`):** открывается кнопкой «Планирование»
в профиле. 3 вкладки: **Бюджет** (общий `monthlyBudget` + прогресс по расходу текущего
календарного месяца через `selectCurrentMonthExpense`), **Лимиты** (per-category `budgets`,
тот же `setBudget`, что в Settings), **Цели** (`goals`: addGoal/contributeGoal/removeGoal,
прогресс-бар «накоплено из цели»). Цели — чисто игровой трекер, на финансы не влияют.

**Достижения / магазин (`src/components/RoadpassSheet.tsx`):** открывается кнопкой
«Достижения» в профиле. Внутри: карточка ежедневной серии (`src/lib/streak.ts`,
«Забрать» → `claimDailyStreak`) + магазин надеваемой косметики (`src/lib/rewards.ts`):
«Купить» → `buyReward(id)`, затем «Надеть» → `equipReward`.

**Иконки:** UI и категории — `lucide-react` (named imports, `size`/`strokeWidth`).
Категории: `src/components/icons/CategoryIcon.tsx` (REGISTRY ключ→lucide, 4 кастомных
inline-SVG где lucide не хватает). Чарты (`DonutChart*`) рисуют data-viz SVG — не иконки.

**Бэкенд-клиент:** `src/lib/api.ts` — `WORKER_URL`, `sendFeedback`, `registerReferral`,
`getReferralStats`, `buildReferralLink`. Telegram-обёртка: `src/lib/telegram.ts`
(`tg.initData`, `tg.startParam`, хаптика). Валюты: `src/lib/currencies.ts`
(порядок: USD первый = дефолт). Формат денег/дат: `src/lib/format.ts`.

**Worker:** `worker/src/index.ts` — роуты `/feedback`, `/referral`, `/stats`, `/profile`,
`/leaderboard`, `/health`. Конфиг: `worker/wrangler.toml` (vars: ALLOWED_ORIGINS,
OWNER_CHAT_ID; KV `REFERRALS`).

**Таблица лидеров:** клиент `submitProfile`/`getLeaderboard` (`src/lib/api.ts`), UI —
`src/components/LeaderboardSheet.tsx` (открывается кнопкой «Таблица лидеров» в профиле).
`ProfilePage` пушит статистику (`xp/level/ops/coins/streakBest`) при заходе, привязывая её
к Telegram-аккаунту. Воркер хранит карточки в одном KV-ключе `leaderboard` (map by id,
кап `LB_MAX=500`, прунинг по XP), в `handleProfile` дополняет карточку авторитетным
`refs` из KV `count:<id>`. `/leaderboard` отдаёт **две доски**: `{ ok, total, xp:{top,me},
refs:{top,me} }` (топ-50 + позиция). UI — переключатель «По XP / По рефералам».
**Приватность:** в рейтинг уходит ТОЛЬКО геймификация — суммы доходов/расходов не шлются.

## Архитектура / ключевые факты
- **Облачная синхронизация (с 1.13.0):** данные стора привязаны к TG-аккаунту. Источник правды —
  по-прежнему localStorage; при запуске `initCloudSync` (`src/lib/cloud.ts`) тянет облачную копию,
  и если она новее локальной (`updatedAt`) — принимает её (`useStore.persist.rehydrate()`), иначе
  заливает локальные данные. На любое изменение стора — debounced-пуш (1.5 c) + сброс при сворачивании
  (`visibilitychange`/`pagehide`). Стратегия — **last-write-wins** по времени (без пооперационного мёржа):
  сценарий «одно устройство за раз» работает идеально, одновременное редактирование с двух устройств —
  победит последнее изменение. Локальная метка времени — `localStorage 'koshel:cloudMeta'` (вне синкаемого
  блоба). Вне Telegram синк — no-op. Воркер: `POST /data/get` и `POST /data/put` (только по проверенной
  подписи initData), хранит сериализованный persist-блоб в KV `REFERRALS` под ключом `data:<userId>`
  вместе с `updatedAt`; сервер не затирает более свежую версию более старой (защита от гонок). Клиент:
  `pullCloud`/`pushCloud` в `src/lib/api.ts`. **Приватность изменилась:** транзакции теперь покидают
  устройство и лежат в KV воркера (данные самого пользователя, привязаны к его TG-id). В лидерборд
  по-прежнему уходит ТОЛЬКО геймификация — суммы туда не шлются.
- Воркер также нужен, чтобы (1) отзыв дошёл владельцу в ЛС, (2) посчитать рефералов в KV, (3) лидерборд.
- **Безопасность Mini App:** каждый запрос к воркеру несёт `initData` — подписанную строку
  Telegram. Воркер проверяет HMAC ботовым токеном (`secret = HMAC("WebAppData", token)`,
  `hash = HMAC(secret, data_check_string)`), плюс `auth_date < 24ч`. Подделать нельзя.
- **Рефералы (важно про BotFather):** ссылка `t.me/<bot>?startapp=ref<id>` доставляет
  `start_param` ТОЛЬКО если у бота включено **Main Mini App** (BotFather → Bot Settings →
  Configure Mini App). Бот лишь с кнопкой-меню `start_param` не получает — рефералка
  молчит. Альтернатива: задать `APP_SHORT_NAME` в `api.ts` → ссылка `t.me/<bot>/<short>?startapp=`.
- **Рефералы:** deep link `?startapp=ref<id>` → `tg.startParam`. Захват один раз
  (флаг `localStorage 'koshel:refDone'`). В KV: `claimed:<userId>` (идемпотентность),
  `count:<refId>` (счётчик), `refs:<refId>` (JSON-список приглашённых: id, name,
  username, at). `/stats` возвращает `{ referrals, friends[] }`; в профиле список
  «Кто присоединился» с относительной датой (`dayjs().fromNow()`).
- **Уровни:** XP = `кол-во операций * 12 + bonusXp`. 7 уровней в `LEVELS` (у каждого
  `badge`-эмодзи). Считается из примитивов (длина массива + bonusXp), чтобы не ловить
  варнинги мемоизации Zustand. Уровень → только косметика (титул + бейдж).
- **Задания (квесты):** `src/lib/quests.ts` — метрики `transactions`/`referrals`/`streak`
  (стрик = `streak.best`) **и `event`** (прогресс = `events[def.event]` из стора, см. ниже).
  Кнопка **Claim** → `claimQuest(id, xp, coins)` (идемпотентно, пишет `claimedQuests` + таймстемп
  в `questClaims`). `allQuestProgress(metrics, claimedQuests, questClaims, now)`, где `metrics`
  включает `events`. `QuestProgress` несёт `expiresAt`/`hasSuccessor`.
- **Задания за использование приложения + ротация (1.10.0):** основная цепочка построена на
  событиях-вовлечениях, а не на числе операций: first_tx → see_analytics → see_charts →
  try_period → make_category → personalize → open_planning → set_budget → set_goal →
  see_leaderboard → tx_10 → streak_3. Реферальные invite_3/invite_5 — отдельная ветка.
  Счётчики `events` инкрементятся через `track(event)`: inline в действиях стора
  (`setPeriodMode`→`use_period`, `addCategory`→`add_category`, `setBudget`/`setMonthlyBudget`→`set_budget`,
  `addGoal`→`add_goal`, `setThemeMode`/`equipReward`→`customize`) и из компонентов
  (`App.tsx`: `changeTab`→`visit_analytics`/`visit_charts`; `Profile.tsx`: открытие шторок →
  `open_achievements`/`open_leaderboard`/`open_planning`). **Ротация
  (`UNLOCK_DELAY_MS = HIDE_AFTER_CLAIM_MS = 3 ч`):** забранное задание ещё 3 ч висит с таймером
  («✓ Получено · новое через …» / «исчезнет через …»), потом ИСЧЕЗАЕТ, и в этот момент
  открывается его преемник (`unlockAfter`). Нет состояния «locked»: задание либо активно, либо
  скрыто. `Profile.tsx` тикает `now` раз в минуту, чтобы таймеры двигались; пустое состояние —
  `quest.empty`.
- **Монеты (`coins`):** игровая валюта. Источники: ежедневная серия + задания.
  Сток: магазин наград (`buyReward` списывает монеты). На учёт финансов не влияет.
- **Экономика наград:** цена = рарность (`RARITY_PRICE` в `rewards.ts`): common 0 /
  rare 100 / epic 250 / legendary 600. Уровень больше НЕ гейтит награды — гейт = цена.
  `owned: string[]` — что куплено (дефолт `DEFAULT_OWNED` = бесплатные common, плюс
  миграция v6 добавляет в owned всё уже надетое). Купленное надевается сразу.
- **Ежедневная серия (`streak`):** `src/lib/streak.ts` — `{ count, best, lastClaim }`.
  `claimDailyStreak()` идемпотентен за день: продолжает серию если вчера забирал, иначе
  стартует с 1; даёт базовую награду (5 монет / 2 XP) + бонусы на рубежах 3/7/14/30.
  `effectiveStreak` визуально гасит серию если пропущен день.
- **Награды роудпасса (`equipped`):** `src/lib/rewards.ts` — 3 вида косметики (accent/title/frame)
  с рарностью (common/rare/epic/legendary) и `unlockLevel` (открытие зависит от уровня).
  `equipped: { accent, title, frame }`, дефолт `DEFAULT_EQUIPPED`. Надетое применяется:
  титул — чип в профиле, рамка — ободок аватара, акцент — палитра приложения.
- **Акцент через CSS-переменные:** `brand-50..900` в `tailwind.config.js` = `rgb(var(--brand-NN))`.
  Дефолт (мятный) задан в `index.css`. Хук `useAccent()` (`src/lib/useTheme.ts`) при смене
  `equipped.accent` переопределяет/снимает `--brand-*` на `<html>` из `ACCENT_PALETTES`.
- **Валюта по умолчанию — USD** (RUB убрали из дефолта; миграция v3 переносит старый RUB→USD).
  В настройках 3 основные валюты (USD/EUR/UAH) + раскрывающееся «Ещё валюты».
- **Vite `base: './'`** (относительные пути) — поэтому работает на GitHub Pages в подкаталоге.
- **Онбординг + «Что нового»:** `src/components/Intro.tsx` (`IntroOverlay` смонтирован в
  `App.tsx`) + `src/lib/whatsnew.ts`. Новичку (нет данных стора) → онбординг; существующему
  при росте версии → changelog. **При каждом заметном релизе:** подними `APP_VERSION`
  (semver) и добавь запись в начало `RELEASES` в `whatsnew.ts`. Флаги:
  `localStorage 'koshel:onboarded'`, `'koshel:lastVersion'`.

## Производительность (как устроено ускорение)
- **Сплит страниц:** в `App.tsx` главная (`HomePage`) грузится сразу, остальные вкладки
  (Analytics/Charts/Profile/Settings) и `IntroOverlay` — через `React.lazy` + `Suspense`
  (фолбэк — спиннер `PageFallback`). Каждая вкладка едет отдельным чанком по требованию.
- **Ленивые шторки:** модалки (`AddTransactionSheet`, `RoadpassSheet`, `LeaderboardSheet`,
  `PlanningSheet`, `CategoryEditor`) грузятся по первому открытию. Паттерн «смонтировать
  один раз»: `seenX = useRef(false); if (open) seenX.current = true` и рендер
  `{seenX.current && <Suspense fallback={null}><Sheet open=.../></Suspense>}` — так шторка
  остаётся смонтированной после закрытия, чтобы отыграла exit-анимация. `CategoryEditor`
  лениво импортируется и в Settings, и в AddTransactionSheet → общий чанк (без дублей).
- **LazyMotion:** все framer-анимации используют `m.*` (не `motion.*`). В `main.tsx` приложение
  обёрнуто в `<LazyMotion features={loadMotionFeatures} strict>`, где
  `loadMotionFeatures = () => import('./lib/motionFeatures').then((m) => m.default)` грузит
  `domMax` отдельным async-чанком ПОСЛЕ первого рендера (`motionFeatures.ts`:
  `export { domMax as default } from 'framer-motion'`). `domMax` (не `domAnimation`!) обязателен
  из-за `layoutId` (PeriodSwitcher, Charts). `strict` запрещает `motion.*` — иначе рантайм-ошибка.
  **ВАЖНО (с 1.10.1):** переходы вкладок (`App.tsx`) и появление секций Аналитики — НЕ на framer,
  а на CSS-классе `.tab-enter`. framer `m.*` оставлен только для эффектов, где «не отыграло» = просто
  нет эффекта (рост баров, отрисовка сегментов диаграммы). Не оборачивай контент с данными в
  `m.div initial:{opacity:0}` — см. «Грабли».
- **Vite manualChunks** (`vite.config.ts`): `react` (react+react-dom), `vendor`
  (dayjs/zustand/clsx/lucide-react). framer-motion НЕ в manualChunks — иначе async-сплит фич
  сломался бы (чанк подтянулся бы сразу). Стартовый критический JS ≈ 88 kB gzip
  (react+vendor+index), движок анимаций (~31 kB gzip) и страницы — после первой отрисовки.
- **Мёртвые зависимости удалены:** `recharts` и `@telegram-apps/sdk-react` (не использовались).

## Грабли (на чём уже обжигались)
- **framer-motion = только `m.*`** (см. выше про LazyMotion `strict`). `motion.*` упадёт в рантайме.
- **PowerShell ломает секреты через пайп.** `"token" | wrangler secret put` обрезал токен
  до 1 символа. ВСЕГДА заливать секреты через `wrangler secret bulk файл.json`.
- **PowerShell 5.1 = TLS 1.0** → `Invoke-WebRequest` к воркеру падает по SSL. Использовать `curl.exe`.
- **Zustand-селекторы, возвращающие новый массив/объект**, должны быть мемоизированы
  (см. `memo1`/`memo2`), иначе ререндер-варнинг. Либо селектить примитивы.
- **Не коммитить без явной просьбы.** Пользователь это уже один раз отклонял.
- **Никогда не прячь контент за entrance-анимацией framer (`initial:{opacity:0}`).**
  framer-motion крутит анимации через `requestAnimationFrame`. Если rAF приостановлен
  (свёрнутый/неактивный Telegram-webview, бэкграунд-вкладка, медленное устройство) —
  анимация не стартует, и `m.*` зависает на `initial` = контент НЕВИДИМ (opacity:0).
  Так словили баг «в Аналитике/Календаре не видно сумм» (1.10.1): вся вкладка сидела на
  `initial:opacity 0`. Хуже того, `AnimatePresence mode="wait"` монтировал новую вкладку
  только ПОСЛЕ завершения exit-анимации старой — при зависшем rAF новая вкладка вообще не
  появлялась (стор-переключение вкладки добавило лишний ре-рендер в `changeTab` через
  `track()`, что добивало tracking exit). **Правило:** для появления вкладок/секций
  используем CSS-класс `.tab-enter` (`index.css`) — базовая непрозрачность 1, анимация
  только украшает; если не отыграет — контент всё равно виден. framer `m.*` оставляем
  лишь для декоративных эффектов (рост бара по ширине/высоте, рисование сегментов диаграммы),
  где «не отыграло» = просто нет эффекта, а не спрятанные данные.

## Текущее состояние
**Хэндофф:** проект в чистом состоянии, лежит в `C:\Users\User\Desktop\FinApp`. Фронт — бандл
`index-CyJtSRR-.js` (`APP_VERSION` = `1.20.0`). **Воркер новее фронта** (добавлена админ-аналитика, фронт НЕ
менялся — фича целиком в воркере). Открытых багов нет.

**Админ-панель аналитики (воркер, фронт не трогали — НЕ показываем в «что нового»):**
- Веб-дашборд `GET /admin` (HTML в `worker/src/admin.ts`, тёмная тема, без внешних либ, ручной SVG-график) +
  `POST /admin/stats` (JSON). Защита — заголовок `X-Admin-Key` == секрет **`ADMIN_KEY`** + IP-rate-limit.
  Вход по паролю (= значение `ADMIN_KEY`), хранится в sessionStorage. URL:
  `https://koshel-worker.karateka004.workers.dev/admin`.
- Метрики (БЕЗ денег — приватность): всего юзеров (+`blocked:*`), новые сегодня/7д/30д (по `firstSeen`),
  DAU/WAU/MAU+липкость (по `updatedAt`), с операциями (лидерборд ops>0), D1-ретеншн, рефералы (Σ refs),
  геймификация (Σ XP/монет, ср. уровень), топы по XP/рефералам, графики новые/день и DAU/день.
- Сбор данных: `handleDataPut` пишет `firstSeen` в метаданные `data:<id>` (старым — прошлый `updatedAt`, не
  «новые»); при 403 рассылки ставится `blocked:<id>`. Снимок `recordDailySnapshot` по cron **`0 21 * * *`**
  (00:00 МСК) пишет `metrics:<YYYY-MM-DD>` (строка и в значении, и в metadata; TTL ~65 дней = авто-прунинг).
  **История графиков копится со дня деплоя** — первые дни короткие.
- `ADMIN_KEY` сейчас временный (ставил для проверки). **Владельцу:** задать свой пароль
  `cd worker && npx wrangler secret put ADMIN_KEY`. Тем же значением — вход в дашборд.
- Проверено на проде: `/admin` отдаёт HTML; `/admin/stats` без ключа 403, с ключом — корректный JSON
  (на момент выката: total 25, withData 8, DAU 5, refs 34).

**1.20.0 (ежедневные напоминания от бота):**
- **Воркер** (`worker/src/index.ts` + `wrangler.toml`): `scheduled`-хендлер + cron **`0 12-17 * * *`**
  (почасово 15:00–20:00 МСК). `runDailyReminders(env, nowMs)` шлёт тем, кто **в этот день не заходил**
  (по `updatedAt`), разнося по **часам-слотам**: `slotForId(id, REM_SLOTS=6)` = час окна, в каждый прогон
  отправляем только «свою» 1/6 базы (слот-чек ДО KV-чтений → дёшево). Текст — **ротация 7 фраз по дню**
  (`pickReminderText`), кнопка web_app «Открыть Кошель». Дедуп `notified:<id>` (TTL 20ч), авто-отписка при
  403 (`remind:<id>='0'`). Рубильник `REMINDERS_MODE` (`off`/`owner`/`all`, сейчас **`all`**). Эндпоинт
  `/reminders` (тумблер из приложения пишет `remind:<id>`). Owner-only тест-триггер `/admin/test`
  (секрет `ADMIN_KEY` в заголовке `X-Admin-Key`, шлёт только владельцу). В `handleDataPut` добавлены
  KV-метаданные `{updatedAt}` (чтобы cron-перебор не читал каждое значение).
- **Клиент:** поле `remindersEnabled` (дефолт вкл) + persist **миграция v12→v13**; `setReminders` в `api.ts`
  (POST `/reminders`); тумблер «Напоминания записывать траты» в Settings → секция «Уведомления»
  (`setRemindersEnabled` + `setReminders` при переключении). Едет в облачном блобе.
- **Деплой:** воркер `wrangler deploy` (cron + секрет `ADMIN_KEY`). NB: смена `REMINDERS_MODE` = правка
  `wrangler.toml` + повторный `wrangler deploy`.
- **Бэклог:** админ-панель с аналитикой для владельца (отдельная задача, ещё не начата).
**1.19.0 (кольцо аналитики с нуля — чистое кольцо + легенда-чипы):**
- **`DonutChartWithIcons` переписан с нуля.** Корень прошлой проблемы: иконки вокруг кольца НАЛЕЗАЛИ на ободок
  (ICON_R 122 < внешний край кольца 110 + полразмера иконки) — на 320px впихнуть 11 иконок вокруг без наезда/
  вылета нельзя в принципе. Решение (выбор пользователя): **«Кольцо + легенда»** — кольцо чистое (track +
  сегменты `m.circle` + сумма в центре, SIZE 220, как у `DonutChart`), **иконок на ободке НЕТ вообще** →
  наезжать/вылетать нечему по построению. Категории — легендой-чипами под кольцом (тинт-иконка цвета сегмента +
  название + сумма + %, `grid grid-cols-2`, все категории).
- **`Analytics.tsx`:** старый «детальный список» теперь под `{chartStyle === 'compact' && …}` — у стиля `icons`
  своя легенда (без дубля), у `compact` (простой `DonutChart`) — прежний список. `DonutChart` не трогали.
- **Бонус-фикс:** `DailyBars` («по дням») распирал страницу на 320px (14 подписей «DD.MM» → scrollW 387).
  Колонки `min-w-0`, подпись = число дня (`slice(0,2)`) + `truncate`. Теперь страница ровно 320px.
- Проверено в превью (320px, светлая+тёмная, Расходы+Доходы, оба стиля): 0 иконок на ободке, кольцо в боксе,
  легенда 11 чипов, 0 горизонтального скролла; compact — детальный список на месте, дублей нет.
**1.18.1 (чистое кольцо — фикс «паутины»):**
- **Кольцо** (`DonutChartWithIcons`): УДАЛЕНЫ соединительные линии (leader lines) от иконок к серединам
  долек — именно они (а не позиции иконок!) собирались «паутиной» в центре. Иконки и так стояли равномерно
  по кругу (`*360/n`) и не вылезали — диагностика по задеплоенному бандлу это подтвердила; прошлые 4 правки
  чинили не то (двигали иконки). Связь иконки с долькой теперь по цвету чипа. Заодно убраны осиротевшие
  `LEADER_END`/`RING_OUTER`/`midAngleRad`/`midAngleDeg` и мёртвый div-ограничитель. Проверено в превью на
  320/375px, светлая+тёмная: 0 leader-`<path>`, 0 вылетов, 0 наездов (мин. дистанция между центрами 68px).
**1.18.0 (Аналитика+Графики, фикс кольца, календарь «Оба», период «⋯», плитки Наград):**
- **Аналитика и Графики объединены** в одну вкладку: сегменты Расходы/Доходы/**Динамика**/Календарь
  (`AnalyticsTabs` grid-cols-4). Тело графиков → `src/components/analytics/TrendChart.tsx`; `pages/Charts.tsx`
  удалён; вкладка Charts убрана из TabBar/App. **Нав = 4 вкладки** (Главная·Аналитика·Награды·Профиль).
  `visit_charts` теперь шлётся при открытии сегмента «Динамика» (квест see_charts сохранён).
- **Кольцо** (`DonutChartWithIcons`): иконки распределены РАВНОМЕРНО по кругу на фикс-радиусе
  (`ICON_R = CHART_R + 26`), убрана радиальная «ступенька»/релаксация — на 320px ничего не вылезает/не наезжает.
- **Календарь** (`MonthCalendar`): 4-й фильтр **«Оба»** — в ячейке `+доход` и `−расход` без вычета; итог месяца — обе суммы.
- **Период** (`PeriodSwitcher`): **3 чипа** (День/Неделя/Месяц) + **«⋯»**-меню (Год/Всё время/Период). Режим `all`
  даёт быстрый общий баланс на Главной.
- **Награды**: плитки **2×2** (Магазин · Лидеры · `StreakTile` Серия · De-Fi «Скоро»-заглушка). Большая
  оранжевая карта серии убрана; `StreakCard.tsx` удалён. `ui/Tile` украшен (атмосферная подсветка + крупный чип),
  `ui/accent` получил `ACCENT_GLOW` + акцент `violet`. Стор/persist/воркер — без изменений.

### История (до 1.18.0)
**1.17.0 (магазин-экран + витрина дня + награда за рефералов):**
- Магазин кастомизации вынесен из шторки в **полноэкранный** `src/pages/Shop.tsx` (под-вид вкладки
  «Награды», `shopOpen` в `Rewards.tsx`, кнопка ←). `RoadpassSheet.tsx` **удалён**; `StreakCard` (серия дня)
  и `RewardRow` вынесены в `src/components/rewards/`; серия дня теперь карта на хабе «Награды».
- **Витрина дня:** `featuredToday(date)` в `lib/rewards.ts` (сид-PRNG по дате) — 3 предмета −30% ежедневно;
  `buyReward(id, priceOverride?)` зажимает скидку в `[discountedPrice, full]`.
- **Реф-награда:** persist **v11→v12**, `rewardedReferrals` + `REF_REWARD = +25 XP/🪙10` +
  `reconcileReferralRewards(count)` (идемпотентно, едет в облачном блобе), чип на каждом друге в `ReferralBlock`.
  Реально виден только в Telegram (список друзей с воркера). Квесты invite_3/5 остались сверху.

### История (до 1.17.0)
**1.16.0 (усиление безопасности):**
- **Воркер** (`worker/src/index.ts`): rate limiting на KV-счётчиках (`isRateLimited`, ключи `rl:<scope>:<id>`)
  на `/feedback` (5/час), `/data/put` (20/мин), `/referral`+`/profile` (10/мин) → 429. `/stats` и
  `/leaderboard` принимают `initData` в **теле POST** (хелпер `readInitData`) — GET с `?initData=` оставлен
  для обратной совместимости. Глобальный catch → generic `internal_error` (без `String(e)`). CORS не
  отражает произвольный origin. Cap длины `ref`/поля `user`.
- **Клиент:** `api.ts` — `getReferralStats`/`getLeaderboard` теперь POST (токен не в URL). `cloud.ts` —
  `isValidBlob` (размер/JSON/`version`) + откат на локальные данные при сбое применения облака.
  `parseRefParam` лимит длины. `index.html` — **CSP meta** (script self+telegram.org, connect self+воркер).
  `.gitignore` — паттерны секретов. **Прод-сборка без inline-скриптов** (CSP `script-src 'self'` не ломает).
- **Не сделано:** мажор-апгрейд wrangler 3→4 (5 vuln в dev-зависимости `ws`, не прод-рантайм — отдельно).
  Ручной чек-лист владельцу: 2FA на Cloudflare/Telegram/GitHub + WAF-rate-limit правило на маршрут воркера.

### История (до 1.16.0)
**1.15.0 (вкладка «Награды» + редизайн Профиля + UI-примитивы):**
- Геймификация вынесена в новую нижнюю вкладку **«Награды»** (`src/pages/Rewards.tsx`): уровень/XP-герой,
  бенто-плитки Достижения/Лидеры, список заданий, рефералы. Настройки убраны из панели → шестерёнка в
  шапке Профиля (`SettingsPage` принимает `onBack`). Профиль очищен до финансов/личного. Новые примитивы
  `src/components/ui/` (BottomSheet/Tile/MenuRow/accent), `QuestCard`/`ReferralBlock` → `components/rewards/`.
  Чанк Профиля 21→7.8 kB. Подробности — в разделе «Карта файлов → Страницы». Стор/persist НЕ менялись.
**1.14.0 (финансовые задания):**
- Задания за реальное поведение, а не за навигацию. Хвост цепочки после `streak_3`:
  `diversify_5` (5 категорий) → `log_7` (7 дней учёта подряд) → `goal_reached` (цель достигнута) →
  `under_budget` (месяц в рамках бюджета). Метрики считаются по РЕАЛЬНЫМ данным (`s.transactions`,
  не демо): новые селекторы `selectCategoriesUsed` / `selectLogDayStreak` / `selectGoalsReached` /
  `selectBudgetMonthKept` (`store/transactions.ts`). В `quests.ts` расширены `QuestMetric`/`QuestMetrics`
  (новые поля опциональны) + 4 `QuestDef`; в `Profile.tsx` метрики прокинуты в `allQuestProgress`;
  i18n-ключи `quest.<id>.*` добавлены. Persist version НЕ менялся (=11) — всё производно.
**1.13.0 (облачная синхронизация за TG-аккаунтом + фикс валюты на «Динамике»):**
- **Облачный синк:** данные стора привязаны к Telegram-аккаунту — с любого устройства видны свои
  операции и деньги. Реализация: `src/lib/cloud.ts` (`initCloudSync`), `pullCloud`/`pushCloud`
  в `src/lib/api.ts`, хук `useCloudSync` в `App.tsx`. Воркер: `POST /data/get` / `POST /data/put`
  (KV `REFERRALS`, ключ `data:<userId>`, по подписи initData; сервер не затирает свежее старым).
  Last-write-wins по `updatedAt`. Подробности — в разделе «Архитектура → Облачная синхронизация».
  Persist version НЕ менялся (=11): синкается тот же блоб, что и в localStorage.
- **Фикс «Динамики»:** `selectTrend` стал account-aware (фильтр по валюте выбранного счёта), на
  страницу Charts добавлен `<AccountSwitcher />`, суммы форматируются через `selectAnalyticsCurrency`
  вместо глобальной `s.currency`. Лечит «сменил валюту — поменялся только значок, суммы те же».

### История (до 1.13.0)
Бандл `index-CyzpROKf.js` — полный перевод на английский + двуязычный changelog (`APP_VERSION` = `1.12.0`).
Воркер тогда был без изменений с 1.6.0.
**1.12.0 (полный перевод на английский):**
- Переведено всё, включая геймификацию: названия уровней (`level.t1..t7`), рарность
  (`rarity.*`), названия+подсказки наград (`reward.<id>.name/.hint`), заголовки+описания
  заданий (`quest.<id>.title/.desc`), достижения/роудпасс (`roadpass.*`), онбординг
  (`intro.*`), шапка Главной (`home.cap_*`), демо-плашка (`demo.banner`), `common.exit`.
  Все новые ключи добавлены в `DICT` (`src/lib/i18n.ts`).
- **Паттерн для данных-строк:** дата-файлы (`levels.ts`/`rewards.ts`/`quests.ts`) НЕ импортируют
  i18n; их RU-строки больше не используются для показа — все места рендера берут ключ из
  стабильного id: `t('level.t' + lvl.level)`, `t('reward.' + id + '.name')`, `t('quest.' + id + '.desc')`,
  `t('rarity.' + rarity)`. Затронуты: `LevelBar.tsx`, `Profile.tsx` (титул/уровень/QuestCard),
  `RoadpassSheet.tsx` (название/подсказка/рарность/секции/стрик), `Intro.tsx`, `Home.tsx`, `Avatar.tsx`.
- **Двуязычный changelog:** в `whatsnew.ts` `ReleaseNote.title` и `item.text` стали `L10n {ru,en}`;
  `WhatsNew` (`Intro.tsx`) рендерит `r.title[lang]`/`it.text[lang]` (`lang` из стора). Все 17 записей
  переведены. `GuideSheet.tsx` уже был двуязычным.
- Намеренно НЕ переведено: комментарии в коде (правило проекта — RU); `Settings.tsx` 'Русский'
  (имя языка показывается на самом языке).

### История (до 1.12.0)
Бандл `index-8eX33pRw.js` (добавлен гайд по приложению; версия НЕ бампалась — осталась 1.11.1).
`APP_VERSION` тогда был `1.11.1`.
**Гайд по приложению (`src/components/GuideSheet.tsx`):** ленивая шторка-аккордеон, двуязычная (RU/EN по `s.lang`),
11 раскрывающихся секций по всем разделам (Главная, добавление операции, категории/счета, аналитика, планирование,
профиль, задания, лидерборд, рефералы, настройки, приватность). Контент — inline в компоненте (в i18n только лейбл
кнопки: `settings.guide`/`settings.guide_hint`). Открывается двумя путями: (1) кнопка «Гайд по приложению» вверху
Settings (`guideOpen`/`seenGuide`); (2) **новым пользователям показывается сразу** — `Intro.tsx` после онбординга
(`closeOnboarding`→`setMode('guide')`; новый режим `'guide'` в `IntroOverlay` рендерит `GuideSheet`); старым
авто-показа нет (только Settings). GuideSheet — общий ленивый чанк для Settings и Intro.
**1.11.1 (валюта целей + точные суммы по категориям):**
- `CategoryAggregate` получил поле `currency` — валюта категории (единая, если все операции в одной валюте; иначе
  fallback = валюта аналитики/счёта). `aggregateByCategory(all, txs, kind, fallback)`. Строки категорий
  (`CategoryList`, детальный список `Analytics`) и подзаголовки секций «Доходы/Расходы» (`SectionHeader` группирует
  суммы по валютам: «722 ₴ · 80 €») теперь в правильной валюте — лечит «80 ₴ вместо 80 €».
- `selectTransactionsByCategory` стал account-aware (через `selectAccountTransactions`) — раскрытие строки совпадает с агрегатом.
- **Валюта цели:** `Goal.currency?: Currency` (опционально; старые цели → глобальная `s.currency`). `addGoal`/`updateGoal`
  принимают `currency`. В форме создания цели (`PlanningSheet`→Цели) — чипы выбора валюты (по умолчанию = счёт/глобальная,
  список = основные + валюты из данных). `GoalCard` и шапка Главной (`GoalBody`) показывают сумму в валюте цели.
  Для синхронизированных целей баланс считается по валюте цели: новый селектор `selectNetBalanceByCurrency`
  (`Record<currency, net>`), `goalSavedAmount` обновлён. `selectNetBalance` (общая сумма) больше не используется, но оставлен.
  Миграция НЕ нужна (поле опциональное, persist остаётся **11**).
- FAB-кнопки (`FabButtons`) подняты: `bottom = safe + 84px` (было 64px) — не цепляются за таб-бар/нижний край.

Предыдущий шаг 1.11.0 (мультивалютность + выбор счёта) — бандл `index-DZsYAsy8.js`.
**Выбор счёта (Главная + Аналитика):** «счёт» = валюта. Стор: `account: Currency | null` (null = «Все», прежний
сводный вид) + `setAccount`. Селекторы: `selectAccounts` (валюты в данных), `selectAccountTransactions`
(транзакции периода по счёту), `selectAnalyticsCurrency` (= account ?? currency), плюс account-варианты
агрегатов `selectByCategoryAccount` / `selectAccountTotals` / `selectDailyExpenseAccount` (рядом с базовыми,
через общие хелперы `aggregateByCategory`/`sumIncomeExpense`/`dailyExpense`). `selectBudgetStatuses` тоже
account-aware (через `selectAccountTransactions`). `AccountSwitcher` (общий компонент
`src/components/AccountSwitcher.tsx` — чипы «Все» + валюты, прячется при <2 счетах; сброс на null если счёт
исчез из данных) смонтирован и в `Analytics.tsx`, и в `Home.tsx` (над PeriodSwitcher); состояние `account`
общее. На Главной по счёту фильтруются: `CategoryList` (категории+секции+бюджеты), `BalanceCard`
(одновалютный вид по выбранному счёту, иначе разбивка по валютам), `BudgetAlert`. Диаграммы (`DonutChart*`)
и `MonthCalendar` — по `account` и форматируют в его валюте. `account` не в миграции (view-поле, дефолт null
приходит из initialState при shallow-merge persist). Базовые `selectByCategory`/`selectTotals`/`selectDailyExpense`
сохранены (используются только как обёртки над общими хелперами).
**Коммит делать только по явной просьбе** (см. «Грабли»). `APP_VERSION` в `whatsnew.ts` = `1.11.0`.
Persist version = **11** (миграция добавляет `lastTxCurrency`).

Релиз **1.10.1** задеплоен (бандл `index-Bz1ks7qq.js`) — **фикс: в Аналитике и Календаре не показывались суммы**:
- **Причина:** переход вкладок жил на framer `AnimatePresence mode="wait"` + `m.div initial:{opacity:0}`.
  При зависшем `requestAnimationFrame` (свёрнутый webview и т.п.) entrance-анимация не стартовала и
  вкладка оставалась невидимой (opacity:0); `mode="wait"` к тому же не монтировал новую вкладку, пока не
  завершится exit старой. `track()` в `changeTab` (добавлен в 1.10.0) добавлял лишний ре-рендер и добивал
  отслеживание exit — отсюда регрессия «после последних обновлений».
- **Фикс:** контейнер активной вкладки в `App.tsx` — обычный `<div key={tab} className="tab-enter">`
  (без `AnimatePresence`/`m.div`). Внутренние обёртки секций в `Analytics.tsx` (диаграмма + календарь) —
  тоже `div.tab-enter` вместо `m.div initial:opacity`. CSS-класс `.tab-enter` (`index.css`) даёт fade+slide,
  но **базовая непрозрачность = 1** (нет `animation-fill-mode`) — контент виден всегда, даже если анимация
  не отыграет. См. новое правило в «Граблях». framer `m.*` остался только на декоративных эффектах (бары, сегменты).

Ранее релиз **1.10.0** задеплоен (бандл `index-dsc73l0e.js`) — **задания за использование приложения + ротация**:
- **Метрика `event`:** в `quests.ts` у `QuestMetric` добавлен тип `'event'` + поле `def.event`. Прогресс
  таких заданий = `events[def.event]` из стора. В стор добавлено поле `events: Record<string, number>`
  (persist **v10**, миграция инициализирует `{}`) и действие `track(event)`. Счётчики инкрементятся:
  inline в действиях стора (`setPeriodMode`→`use_period`, `addCategory`→`add_category`,
  `setBudget`/`setMonthlyBudget`→`set_budget`, `addGoal`→`add_goal`, `setThemeMode`/`equipReward`→`customize`)
  и через `track()` из компонентов: `App.tsx` (`changeTab`→`visit_analytics`/`visit_charts`), `Profile.tsx`
  (открытие шторок → `open_achievements`/`open_leaderboard`/`open_planning`).
- **Ротация заданий (`UNLOCK_DELAY_MS = HIDE_AFTER_CLAIM_MS = 3 ч`):** забранное задание показывается с
  таймером ещё 3 ч (подпись «✓ Получено · новое через …» или «исчезнет через …»), затем ИСЧЕЗАЕТ; его
  преемник из цепочки (`unlockAfter`) открывается ровно в этот момент. `allQuestProgress` скрывает забранное
  по истечении срока и держит преемника скрытым, пока не прошло 3 ч у предка (нет состояния «locked» — задание
  либо активно, либо скрыто). `QuestProgress` теперь несёт `expiresAt`/`hasSuccessor` вместо `locked`/`unlockAt`.
- **Цепочка вовлечения (основная):** first_tx → see_analytics → see_charts → try_period → make_category →
  personalize → open_planning → set_budget → set_goal → see_leaderboard → tx_10 → streak_3. Реферальные
  invite_3/invite_5 — отдельная ветка. Карточка задания (`Profile.tsx`): иконка ⏳ на забранном, пустое
  состояние «Все задания выполнены — новые скоро» (`quest.empty`). Тик `now` раз в минуту двигает таймеры.

Ранее релиз **1.9.2** (бандл `index-ZAj0Nf4_.js`) — **диаграмма без наезжающих иконок + полный лидерборд**:
- **Антиколлизия иконок (`DonutChartWithIcons`):** угловой развод усилен (MIN ≈ 22°, было 16° — на радиусе
  ICON_R это ≈54px между центрами при кружке 34px; для большого числа категорий MIN ужимается до `340/n`,
  итераций релаксации 160). Плюс **радиальная ступенька** `iconRadii`: если сосед всё ещё ближе 24°, каждая
  вторая тесная иконка уходит на `ICON_R + 28` — кружки с процентами гарантированно не пересекаются даже в
  плотном кластере мелких долей (3%/1% вверху). Leader-линии и позиции иконок используют per-icon `iconRadii[i]`.
  `marginBottom` контейнера поднят до 34 (вынесенные вниз иконки не налезают на список).
- **Лидерборд — регистрация при запуске:** в `App.tsx` добавлен хук `useRegisterOnLaunch()` — пушит профиль
  (`submitProfile`) сразу при открытии в Telegram, а не только при заходе на вкладку «Профиль». Это лечит
  «в рейтинге всего 4 человека»: теперь попадают все, кто открыл приложение. Считает `xp = computeXp(ops, bonusXp)`,
  `level = levelFor(xp).level`. Воркер без изменений.

Ранее релиз **1.9.0** (бандл `index-BnQj3u5p.js`) — **цели на связи с балансом + листание целей на Главной**:
- **Синхронизация цели с балансом:** у `Goal` появилось поле `syncBalance?: boolean`. Если включено,
  «накоплено» = `selectNetBalance` (доходы−расходы за всё время по `activeTransactions`, не уходит в
  минус) вместо ручных взносов — добавил расход, в цели убавилось. Тумблер — в форме создания цели
  (`PlanningSheet` → вкладка «Цели»). У синхронизированной цели в карточке скрыт ручной взнос и стоит
  бейдж «Синхронизирована с балансом». Хелпер `goalSavedAmount(s, g)` и селектор `selectNetBalance`
  в сторе. `addGoal`/`updateGoal` принимают `syncBalance`.
- **Шапка Главной — карусель целей:** если `homeHeaderMode==='goal'` и целей несколько, в шапке
  работает свайп влево/вправо (`GoalCarousel` в `Home.tsx`, touch-хендлеры + точки-индикатор);
  выбор сохраняется в `homeHeaderGoalId`. Мелкая подпись теперь «Цель»/«Дата» (а не «Кошель»).
  `GoalBody` учитывает `syncBalance` при показе «накоплено/цель».
- **Диаграмма (`DonutChartWithIcons`):** иконки ближе к кольцу (`ICON_R = CHART_R + 44`, было +56),
  у контейнера `marginBottom: 24` — иконка+процент снизу больше не налезают на список категорий.

Ранее релиз **1.8.2** (бандл `index-iNgWMn6Q.js`) — **надёжная загрузка + подпись баланса по периоду + плавные вкладки**:
- **Надёжная загрузка чанков (`src/lib/lazyRetry.ts`):** `lazyRetry()` оборачивает все
  `React.lazy` в `App.tsx`. При падении `import()` (сетевой сбой ИЛИ устаревший
  закешированный `index.html` со старыми хэшами чанков после деплоя → 404) делает повторную
  попытку через 400 мс, затем разовый `window.location.reload()` (флаг `koshel:chunkReload`
  в sessionStorage от зацикливания; снимается в `main.tsx` по событию `load`). Крайний
  предохранитель — `ChunkErrorBoundary` в `App.tsx` (экран «Не удалось загрузить · Обновить»).
  Это лечило симптом «сайт не догружается, после ручного refresh всё ок».
- **Подпись баланса по периоду:** `BalanceCard` теперь зависит от `period.mode` (`BALANCE_LABEL`:
  «за день/неделю/месяц/год/всё время/период»), а не всегда «Баланс месяца» (значение и раньше
  считалось по периоду).
- **Плавные вкладки:** `usePrefetchTabs()` в `App.tsx` — прогрев ленивых чанков вкладок
  (Analytics/Charts/Profile/Settings) в `requestIdleCallback` после первой отрисовки, чтобы
  первый переход был без спиннера и «западаний» (префетч fire-and-forget, ошибки глушатся).

Ранее релиз **1.8.1** (бандл `index-pYzSCWSA.js`) — **точные суммы в календаре**:
`compact()` в `MonthCalendar` больше не округляет суммы < 100 000 (4050 → «4050», не «4,1к»),
«к» только от 100 000. По отзыву пользователя.

Ранее релиз **1.8.0** (бандл `index-BJME2uU4.js`) — **чистая Главная**:
убрана шкалой уровня (`LevelBar`) с Главной, шапка настраивается в Settings
(дата / прогресс к цели) через `homeHeaderMode` + `homeHeaderGoalId`. Persist v9
(миграция добавляет дефолты шапки). Воркер без изменений.

Ранее релиз **1.7.0** (бандл `index-DasCkBt5.js`) — **оптимизация скорости**:
сплит страниц/шторок через `React.lazy`, LazyMotion (`m.*` + async `domMax`),
Vite `manualChunks`, удалены мёртвые зависимости. Стартовый JS ≈ 88 kB gzip
(было 134.84 kB одним чанком). См. раздел «Производительность» выше.

Ранее релиз **1.6.0** (бандл `index-Bugv-_He.js`, воркер обновлён):
- **i18n RU/EN** + переключатель языка в Settings (`src/lib/i18n.ts`, `useT()`).
- **Планирование** в профиле — вкладки Бюджет / Лимиты / Цели (`PlanningSheet.tsx`),
  стор: `monthlyBudget`, `goals`, селектор `selectCurrentMonthExpense`.
- **Цепочка квестов** с разблокировкой через 3 ч (`questClaims`, `unlockAfter`).
- **Лидерборд по рефералам** — вторая доска (`refs`) рядом с XP.
Persist v8 (миграция добавляет `lang`/`questClaims`/`monthlyBudget`/`goals`).
Ранее (1.5.0 и до): профиль/уровни/рефералы/отзывы/валюты, демо-режим, календарь,
XP-лидерборд. Бэкенд оттестирован end-to-end.
