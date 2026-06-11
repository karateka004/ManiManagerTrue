/**
 * Версия приложения и список обновлений («Что нового»).
 *
 * При заметном релизе:
 *   1. подними APP_VERSION (semver);
 *   2. добавь запись в начало RELEASES (двуязычно — ru/en).
 *
 * Логика показа (см. useIntro в components/Intro.tsx):
 *   - первый запуск  → онбординг, changelog НЕ показываем (всё и так новое);
 *   - версия выросла → показываем релизы новее, чем сохранённый lastVersion.
 *
 * Заголовок и тексты пунктов — пары { ru, en }; язык выбирается при рендере
 * (WhatsNew в Intro.tsx по s.lang).
 */

export const APP_VERSION = '1.13.0'

/** Ключи localStorage. */
export const ONBOARDED_KEY = 'koshel:onboarded'
export const VERSION_KEY = 'koshel:lastVersion'

/** Локализованная строка. */
export interface L10n {
  ru: string
  en: string
}

export interface ReleaseNote {
  version: string
  date: string
  title: L10n
  items: { icon: string; text: L10n }[]
}

/** Новые записи — сверху. */
export const RELEASES: ReleaseNote[] = [
  {
    version: '1.13.0',
    date: '2026-06-02',
    title: { ru: 'Данные на всех устройствах', en: 'Your data on every device' },
    items: [
      {
        icon: '☁️',
        text: {
          ru: 'Ваши операции и настройки теперь привязаны к Telegram-аккаунту — заходите с любого устройства и видите свои деньги',
          en: 'Your transactions and settings are now tied to your Telegram account — open from any device and your money is there',
        },
      },
      {
        icon: '🔄',
        text: {
          ru: 'Синхронизация идёт автоматически в фоне; последнее изменение выигрывает',
          en: 'Sync runs automatically in the background; the latest change wins',
        },
      },
      {
        icon: '📊',
        text: {
          ru: 'На «Динамике» появился выбор счёта — суммы считаются по выбранной валюте, а не сваливаются в кучу',
          en: 'Charts now has an account switcher — amounts are computed per selected currency instead of being mixed',
        },
      },
    ],
  },
  {
    version: '1.12.0',
    date: '2026-06-02',
    title: { ru: 'Полный перевод на английский', en: 'Full English translation' },
    items: [
      {
        icon: '🌍',
        text: {
          ru: 'Всё приложение теперь переключается на английский — геймификация, достижения, задания и онбординг тоже',
          en: 'The whole app now switches to English — gamification, achievements, quests and onboarding included',
        },
      },
      {
        icon: '🏆',
        text: {
          ru: 'Названия уровней, наград и тексты заданий теперь локализованы',
          en: 'Level names, reward names and quest texts are now localized',
        },
      },
      {
        icon: '📅',
        text: {
          ru: 'Даты, дни недели и формат чисел подстраиваются под выбранный язык',
          en: 'Dates, weekdays and number formats follow the chosen language',
        },
      },
    ],
  },
  {
    version: '1.11.1',
    date: '2026-06-01',
    title: { ru: 'Валюта целей и точные суммы', en: 'Goal currency and exact amounts' },
    items: [
      {
        icon: '🎯',
        text: {
          ru: 'У накопительной цели теперь своя валюта — выбираете при создании (€, ₴, $ …)',
          en: 'A savings goal now has its own currency — pick it when creating (€, ₴, $ …)',
        },
      },
      {
        icon: '🔢',
        text: {
          ru: 'В списке категорий сумма показывается в валюте операции: 80 € вместо 80 ₴',
          en: 'The category list shows the amount in the operation’s currency: 80 € instead of 80 ₴',
        },
      },
      {
        icon: '🧮',
        text: {
          ru: 'Итоги «Доходы/Расходы» на Главной разбиваются по валютам, а не складываются вперемешку',
          en: 'Income/Expense totals on Home are split by currency instead of mixed together',
        },
      },
      {
        icon: '⬆️',
        text: {
          ru: 'Кнопки «+ / −» приподняли, чтобы не цеплялись за нижний край экрана',
          en: 'The + / − buttons were raised so they don’t catch the bottom edge',
        },
      },
    ],
  },
  {
    version: '1.11.0',
    date: '2026-06-01',
    title: { ru: 'Мультивалютность', en: 'Multi-currency' },
    items: [
      {
        icon: '💱',
        text: {
          ru: 'Выбирайте валюту прямо при добавлении операции — чип рядом с суммой',
          en: 'Pick a currency right when adding an operation — a chip next to the amount',
        },
      },
      {
        icon: '🇺🇦',
        text: {
          ru: 'Гривна, евро, доллар и другие — каждая запись хранит свою валюту',
          en: 'Hryvnia, euro, dollar and more — each entry keeps its own currency',
        },
      },
      {
        icon: '📊',
        text: {
          ru: 'Баланс автоматически разбивается по валютам, если они разные',
          en: 'The balance is automatically split by currency when they differ',
        },
      },
      {
        icon: '🗂️',
        text: {
          ru: 'Выбор счёта на Главной и в Аналитике: баланс, категории, бюджеты и диаграммы — по одной валюте',
          en: 'Account picker on Home and Analytics: balance, categories, budgets and charts in a single currency',
        },
      },
    ],
  },
  {
    version: '1.10.1',
    date: '2026-06-01',
    title: { ru: 'Аналитика и календарь снова показывают суммы', en: 'Analytics and calendar show amounts again' },
    items: [
      {
        icon: '🐞',
        text: {
          ru: 'Исправили баг: при переключении на Аналитику или Календарь раздел иногда оставался пустым — суммы не показывались',
          en: 'Fixed a bug: switching to Analytics or Calendar sometimes left the section empty — amounts didn’t show',
        },
      },
      {
        icon: '⚡',
        text: {
          ru: 'Переключение вкладок стало надёжнее: контент больше не «прячется» за анимацией, если она не успела отыграть',
          en: 'Tab switching is more reliable: content no longer hides behind an animation that didn’t get to play',
        },
      },
    ],
  },
  {
    version: '1.10.0',
    date: '2026-06-01',
    title: { ru: 'Живые задания за использование приложения', en: 'Live quests for using the app' },
    items: [
      {
        icon: '🎮',
        text: {
          ru: 'Задания теперь про само приложение: загляни в Аналитику, переключи период, создай категорию, поставь цель — и получай награду',
          en: 'Quests are now about the app itself: check Analytics, switch the period, create a category, set a goal — and get rewarded',
        },
      },
      {
        icon: '⏳',
        text: {
          ru: 'Выполненное задание показывается с таймером и через 3 часа исчезает — на его месте открывается новое',
          en: 'A completed quest shows a timer and disappears after 3 hours — a new one opens in its place',
        },
      },
      {
        icon: '🔄',
        text: {
          ru: 'Список заданий больше не копит «Получено» — всегда есть свежее действие на день',
          en: 'The quest list no longer piles up “Claimed” — there’s always a fresh action for the day',
        },
      },
    ],
  },
  {
    version: '1.9.2',
    date: '2026-06-01',
    title: { ru: 'Диаграмма: иконки больше не наезжают', en: 'Chart: icons no longer overlap' },
    items: [
      {
        icon: '🎯',
        text: {
          ru: 'Мелкие доли (3%, 1%) на диаграмме доходов/расходов больше не слипаются вверху — иконки с процентами разнесены по углу',
          en: 'Small slices (3%, 1%) on the income/expense chart no longer clump at the top — percentage icons are spread by angle',
        },
      },
      {
        icon: '📐',
        text: {
          ru: 'В плотном кластере каждая вторая иконка уходит на отдельный радиус — кружки гарантированно не пересекаются',
          en: 'In a dense cluster every other icon moves to a separate radius — the badges never intersect',
        },
      },
      {
        icon: '👥',
        text: {
          ru: 'В таблице лидеров теперь попадают все, кто открыл приложение, а не только заходившие в профиль',
          en: 'The leaderboard now includes everyone who opened the app, not only those who visited the profile',
        },
      },
    ],
  },
  {
    version: '1.9.0',
    date: '2026-05-31',
    title: { ru: 'Цели на связи с балансом и листание на Главной', en: 'Goals linked to balance and swiping on Home' },
    items: [
      {
        icon: '🔗',
        text: {
          ru: 'Цель можно синхронизировать с балансом: добавил расход — в цели сразу убавилось, без ручных взносов',
          en: 'A goal can sync with your balance: add an expense and the goal drops right away, no manual contributions',
        },
      },
      {
        icon: '👆',
        text: {
          ru: 'Если целей несколько — листай их свайпом прямо в шапке Главной (точки-индикатор снизу)',
          en: 'With several goals — swipe between them right in the Home header (dots indicator below)',
        },
      },
      {
        icon: '🏷️',
        text: {
          ru: 'В шапке Главной подпись теперь «Цель» или «Дата» — по тому, что показано',
          en: 'The Home header caption now reads “Goal” or “Date” depending on what’s shown',
        },
      },
      {
        icon: '🎯',
        text: {
          ru: 'Диаграмма доходов/расходов: иконки ближе к кругу и больше не налезают на список',
          en: 'Income/expense chart: icons sit closer to the ring and no longer overlap the list',
        },
      },
    ],
  },
  {
    version: '1.8.2',
    date: '2026-05-31',
    title: { ru: 'Надёжная загрузка, точная подпись баланса и плавные вкладки', en: 'Reliable loading, precise balance label and smooth tabs' },
    items: [
      {
        icon: '🛡️',
        text: {
          ru: 'Приложение больше не «зависает» при загрузке: если раздел не догрузился — авто-восстановление без ручного обновления',
          en: 'The app no longer hangs on load: if a section fails to load, it auto-recovers without a manual refresh',
        },
      },
      {
        icon: '🏷️',
        text: {
          ru: 'Карточка баланса теперь подписана под выбранный период: «за день», «за неделю», «за год»',
          en: 'The balance card is now labeled by the chosen period: daily, weekly, yearly',
        },
      },
      {
        icon: '⚡',
        text: {
          ru: 'Вкладки переключаются плавнее — экраны прогреваются заранее, без подвисаний при первом заходе',
          en: 'Tabs switch more smoothly — screens are warmed up in advance, no stutter on first open',
        },
      },
    ],
  },
  {
    version: '1.8.1',
    date: '2026-05-31',
    title: { ru: 'Точные суммы в календаре', en: 'Exact amounts in the calendar' },
    items: [
      {
        icon: '🔢',
        text: {
          ru: 'Календарь больше не округляет: 4050 показывается как «+4050», а не «+4,1к»',
          en: 'The calendar no longer rounds: 4050 shows as “+4050”, not “+4.1k”',
        },
      },
      {
        icon: '📐',
        text: {
          ru: '«к» включается только для крупных сумм (от 100 000)',
          en: 'The “k” suffix kicks in only for large amounts (from 100,000)',
        },
      },
    ],
  },
  {
    version: '1.8.0',
    date: '2026-05-31',
    title: { ru: 'Чистая Главная и настраиваемая шапка', en: 'Clean Home and a customizable header' },
    items: [
      {
        icon: '📅',
        text: {
          ru: 'Шапка Главной показывает дату — строго и по делу',
          en: 'The Home header shows the date — clean and to the point',
        },
      },
      {
        icon: '🎯',
        text: {
          ru: 'Или прогресс к накопительной цели — выбор в Настройках',
          en: 'Or progress toward a savings goal — choose in Settings',
        },
      },
      {
        icon: '🧹',
        text: {
          ru: 'Убрали шкалу уровня с Главной — вся геймификация теперь в профиле',
          en: 'Removed the level bar from Home — all gamification now lives in the profile',
        },
      },
    ],
  },
  {
    version: '1.7.0',
    date: '2026-05-31',
    title: { ru: 'Быстрее запускается', en: 'Faster startup' },
    items: [
      {
        icon: '⚡',
        text: {
          ru: 'Ускорили запуск: тяжёлые экраны и анимации грузятся по мере надобности',
          en: 'Sped up startup: heavy screens and animations load on demand',
        },
      },
      {
        icon: '📦',
        text: {
          ru: 'Стартовый объём приложения заметно меньше — открывается шустрее',
          en: 'The initial app size is noticeably smaller — it opens quicker',
        },
      },
      {
        icon: '🧹',
        text: {
          ru: 'Убрали неиспользуемые библиотеки под капотом',
          en: 'Removed unused libraries under the hood',
        },
      },
    ],
  },
  {
    version: '1.6.0',
    date: '2026-05-31',
    title: { ru: 'Английский, планирование и новые задания', en: 'English, planning and new quests' },
    items: [
      {
        icon: '🌍',
        text: {
          ru: 'Английский язык — переключатель в Настройках (Язык)',
          en: 'English language — a switch in Settings (Language)',
        },
      },
      {
        icon: '🎯',
        text: {
          ru: 'Планирование в профиле: общий бюджет, лимиты по категориям и накопительные цели',
          en: 'Planning in the profile: overall budget, per-category limits and savings goals',
        },
      },
      {
        icon: '🧩',
        text: {
          ru: 'Новые задания-цепочки: следующее открывается через 3 часа после прошлого',
          en: 'New quest chains: the next one opens 3 hours after the previous',
        },
      },
      {
        icon: '👥',
        text: {
          ru: 'Таблица лидеров теперь с отдельным рейтингом по приглашённым друзьям',
          en: 'The leaderboard now has a separate ranking by invited friends',
        },
      },
    ],
  },
  {
    version: '1.5.0',
    date: '2026-05-31',
    title: { ru: 'Таблица лидеров', en: 'Leaderboard' },
    items: [
      {
        icon: '🏆',
        text: {
          ru: 'Рейтинг участников по XP — соревнуйся со всеми в приложении',
          en: 'XP ranking of players — compete with everyone in the app',
        },
      },
      {
        icon: '📌',
        text: {
          ru: 'Твоя статистика теперь закреплена за аккаунтом Telegram',
          en: 'Your stats are now tied to your Telegram account',
        },
      },
      {
        icon: '🔒',
        text: {
          ru: 'В рейтинге только XP и уровень — суммы доходов и расходов остаются приватными',
          en: 'Only XP and level are ranked — your income and expense amounts stay private',
        },
      },
    ],
  },
  {
    version: '1.4.0',
    date: '2026-05-31',
    title: { ru: 'Календарь, демо-режим и операции задним числом', en: 'Calendar, demo mode and backdated operations' },
    items: [
      {
        icon: '📅',
        text: {
          ru: 'Календарь в аналитике: под каждым днём — итог, с фильтром доход/расход/чистый итог',
          en: 'Calendar in analytics: a total under each day, with an income/expense/net filter',
        },
      },
      {
        icon: '🧪',
        text: {
          ru: 'Демо-режим: пример данных за 2 года, ваши реальные операции не меняются',
          en: 'Demo mode: 2 years of sample data, your real operations stay unchanged',
        },
      },
      {
        icon: '🕔',
        text: {
          ru: 'Операция задним числом теперь сразу видна — период сам наводится на её дату',
          en: 'A backdated operation is now visible right away — the period snaps to its date',
        },
      },
      {
        icon: '🔗',
        text: {
          ru: 'Починили реферальные ссылки-приглашения',
          en: 'Fixed referral invite links',
        },
      },
    ],
  },
  {
    version: '1.3.0',
    date: '2026-05-31',
    title: { ru: 'Профиль и магазин наград', en: 'Profile and reward shop' },
    items: [
      {
        icon: '👤',
        text: {
          ru: 'Профиль теперь — отдельная вкладка внизу',
          en: 'The profile is now a separate tab at the bottom',
        },
      },
      {
        icon: '🏆',
        text: {
          ru: 'Достижения: ежедневная серия и магазин косметики в одном месте',
          en: 'Achievements: daily streak and cosmetics shop in one place',
        },
      },
      {
        icon: '🪙',
        text: {
          ru: 'Палитры, титулы и рамки покупаются за монеты — копи на сериях и заданиях',
          en: 'Palettes, titles and frames are bought with coins — earn them from streaks and quests',
        },
      },
      {
        icon: '💎',
        text: {
          ru: 'Чем выше рарность награды, тем выше цена',
          en: 'The rarer the reward, the higher the price',
        },
      },
    ],
  },
  {
    version: '1.2.0',
    date: '2026-05-31',
    title: { ru: 'Дорога достижений', en: 'Achievements road' },
    items: [
      {
        icon: '🔥',
        text: {
          ru: 'Ежедневная серия: заходи каждый день за XP и монетами, держи стрик',
          en: 'Daily streak: come back every day for XP and coins, keep the streak',
        },
      },
      {
        icon: '🛣️',
        text: {
          ru: 'Дорога достижений — открой её тапом по уровню в профиле',
          en: 'Achievements road — open it by tapping your level in the profile',
        },
      },
      {
        icon: '🎨',
        text: {
          ru: 'Акцентные палитры: перекрась всё приложение под себя',
          en: 'Accent palettes: recolor the whole app to your taste',
        },
      },
      {
        icon: '🏷️',
        text: {
          ru: 'Титулы и рамки аватара с рарностью — открываются с ростом уровня',
          en: 'Titles and avatar frames with rarity — unlocked as your level grows',
        },
      },
      {
        icon: '✨',
        text: {
          ru: 'Новые иконки по всему приложению (lucide)',
          en: 'New icons across the whole app (lucide)',
        },
      },
    ],
  },
  {
    version: '1.1.0',
    date: '2026-05-31',
    title: { ru: 'Геймификация и рефералы', en: 'Gamification and referrals' },
    items: [
      {
        icon: '🎯',
        text: {
          ru: 'Задания: первая операция и приглашения друзей — за них XP и монеты',
          en: 'Quests: first operation and inviting friends — earn XP and coins',
        },
      },
      {
        icon: '🏅',
        text: {
          ru: 'Бейджи уровней и монеты в профиле',
          en: 'Level badges and coins in the profile',
        },
      },
      {
        icon: '👥',
        text: {
          ru: 'В рефералах виден список тех, кто присоединился по ссылке',
          en: 'Referrals show a list of those who joined via your link',
        },
      },
      {
        icon: '💱',
        text: {
          ru: 'Быстрый выбор валют: USD, EUR, UAH, остальные — в «Ещё»',
          en: 'Quick currency picker: USD, EUR, UAH, the rest under “More”',
        },
      },
      {
        icon: '✍️',
        text: {
          ru: 'Отзыв прямо из профиля — приходит разработчику',
          en: 'Feedback right from the profile — goes to the developer',
        },
      },
    ],
  },
]

/** Сравнение версий semver: -1 / 0 / 1. */
function cmpVersion(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d) return d > 0 ? 1 : -1
  }
  return 0
}

/** Релизы новее, чем сохранённая версия. */
export function newReleasesSince(lastVersion: string): ReleaseNote[] {
  return RELEASES.filter((r) => cmpVersion(r.version, lastVersion) > 0)
}
