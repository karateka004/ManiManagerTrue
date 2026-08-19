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

export const APP_VERSION = '1.32.0'

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
    version: '1.32.0',
    date: '2026-08-19',
    title: { ru: 'Задания теперь обновляются', en: 'Quests now refresh' },
    items: [
      {
        icon: '🎯',
        text: {
          ru: 'Забрал награду — задание уходит, а на его место встаёт новое. Всего в пуле больше двадцати заданий',
          en: 'Claim a reward and the quest leaves, with a new one taking its place. The pool holds over twenty quests',
        },
      },
      {
        icon: '⏳',
        text: {
          ru: 'После получения награды слот отдыхает восемь часов — на плашке виден таймер до следующего задания',
          en: 'After a claim the slot rests for eight hours — the card shows a timer until the next quest',
        },
      },
      {
        icon: '🧭',
        text: {
          ru: 'Новые задания знакомят с функциями, которые сами по себе не находятся: повтор трат, поиск и дневной лимит',
          en: 'New quests introduce features you would not stumble upon: repeat spending, search and the daily limit',
        },
      },
    ],
  },
  {
    version: '1.31.0',
    date: '2026-08-18',
    title: { ru: 'Поиск по операциям', en: 'Transaction search' },
    items: [
      {
        icon: '🔍',
        text: {
          ru: 'В шапке Главной появился поиск. Находит по заметке, названию категории, тегу и сумме',
          en: 'Search now lives in the Home header. It finds transactions by note, category name, tag or amount',
        },
      },
      {
        icon: '🗃',
        text: {
          ru: 'Ищет по всей истории, а не только за выбранный период — платёж годичной давности найдётся сразу',
          en: 'It searches your whole history, not just the selected period — a payment from a year ago shows up right away',
        },
      },
      {
        icon: '✏',
        text: {
          ru: 'Найденную операцию можно открыть на правку одним касанием',
          en: 'Tap a result to open it for editing',
        },
      },
    ],
  },
  {
    version: '1.30.0',
    date: '2026-08-18',
    title: { ru: 'Повтор трат и лимит на день', en: 'Repeat spending and a daily limit' },
    items: [
      {
        icon: '↻',
        text: {
          ru: 'В форме появились подсказки «Повторить»: привычные траты вроде кофе или метро записываются в два касания вместо шести',
          en: 'The form now suggests Repeat: habitual spending like coffee or transit takes two taps instead of six',
        },
      },
      {
        icon: '📅',
        text: {
          ru: 'На Главной видно, сколько можно потратить именно сегодня. Лимит пересчитывается каждый день: перерасход ужимает завтрашний, экономия расширяет',
          en: 'Home now shows how much you can spend today. The limit recalculates daily: overspending shrinks tomorrow, saving expands it',
        },
      },
      {
        icon: '⌨',
        text: {
          ru: 'Клавиатура суммы стала понятнее: у клавиш появились плашки, а калькулятор отделён от цифр',
          en: 'The amount keypad is clearer: keys now have surfaces and the calculator is visually separated from the digits',
        },
      },
    ],
  },
  {
    version: '1.29.0',
    date: '2026-08-18',
    title: { ru: 'Приложение стало заметно быстрее', en: 'Noticeably faster app' },
    items: [
      {
        icon: '⚡',
        text: {
          ru: 'Запись операций подряд больше не подтормаживает: десять записей подряд теперь идут в несколько раз легче, даже когда в истории уже тысячи операций',
          en: 'Recording transactions one after another no longer stutters — ten in a row are several times lighter, even with thousands already in your history',
        },
      },
      {
        icon: '🛡',
        text: {
          ru: 'Рейтинг защищён от накрутки: опыт теперь проверяется по реальным данным, а не принимается на веру',
          en: 'The leaderboard is protected from cheating: XP is now verified against real data instead of being taken on trust',
        },
      },
    ],
  },
  {
    version: '1.28.0',
    date: '2026-08-18',
    title: { ru: 'Новая нижняя панель', en: 'New bottom bar' },
    items: [
      {
        icon: '✨',
        text: {
          ru: 'Нижняя панель теперь парит над экраном: полупрозрачная, с размытием и плавно ездящей подсветкой активной вкладки',
          en: 'The bottom bar now floats above the screen: translucent, blurred, with a highlight that glides between tabs',
        },
      },
      {
        icon: '➕',
        text: {
          ru: 'Круглая кнопка «плюс» рядом с панелью — записать операцию можно с любой вкладки, а не только с Главной',
          en: 'A round plus button next to the bar — you can record a transaction from any tab, not just Home',
        },
      },
      {
        icon: '⇄',
        text: {
          ru: 'Расход и доход теперь переключаются прямо в форме записи — введённая сумма при этом сохраняется',
          en: 'Expense and income now switch right inside the form — the amount you typed is kept',
        },
      },
    ],
  },
  {
    version: '1.27.0',
    date: '2026-08-11',
    title: { ru: 'Новые иконки и жетоны наград', en: 'New icons and reward badges' },
    items: [
      {
        icon: '🎨',
        text: {
          ru: 'Иконок для категорий стало в четыре раза больше — 157 штук, разложенных по темам: еда, транспорт, дом, здоровье, досуг, семья, деньги',
          en: 'Four times more category icons — 157 of them, grouped by theme: food, transport, home, health, leisure, family, money',
        },
      },
      {
        icon: '🏅',
        text: {
          ru: 'Титулы и уровни получили настоящие жетоны с градиентом по редкости вместо букв и эмодзи',
          en: 'Titles and levels now have real badges with rarity gradients instead of letters and emoji',
        },
      },
      {
        icon: '🏆',
        text: {
          ru: 'В таблице лидеров у каждого игрока виден жетон его уровня',
          en: 'The leaderboard now shows each player’s level badge',
        },
      },
    ],
  },
  {
    version: '1.26.0',
    date: '2026-08-11',
    title: { ru: 'Быстрый старт для новичков', en: 'Quick start for newcomers' },
    items: [
      {
        icon: '🚀',
        text: {
          ru: 'Новый онбординг: три шага — доход, пара трат — и сразу прогноз, сколько останется к концу месяца',
          en: 'New onboarding: three steps — income, a couple of expenses — and an instant forecast of what’s left by month end',
        },
      },
      {
        icon: '💡',
        text: {
          ru: 'В конце приложение подсказывает дневную планку трат, чтобы месяц закончился в плюсе',
          en: 'At the end the app suggests a daily spending line to finish the month in the black',
        },
      },
    ],
  },
  {
    version: '1.25.0',
    date: '2026-08-10',
    title: { ru: 'Лимиты за один тап и раздел «Активы»', en: 'One-tap limits and the Assets tab' },
    items: [
      {
        icon: '🎚️',
        text: {
          ru: 'Лимиты теперь открываются первыми — это главное в планировании. И настраиваются одной кнопкой: приложение само расставит их по твоим средним тратам',
          en: 'Limits now open first — they’re the heart of planning. And one button sets them all up from your average spending',
        },
      },
      {
        icon: '💎',
        text: {
          ru: 'Новая вкладка «Активы»: вклады, акции, крипта и подушка в одном месте — видно, сколько накоплено и сколько это приносит за год',
          en: 'New “Assets” tab: deposits, stocks, crypto and your cash cushion in one place — see how much you’ve saved and what it earns per year',
        },
      },
      {
        icon: '🧮',
        text: {
          ru: 'Встроенный калькулятор доходности: считает сложный процент с ежемесячными пополнениями и показывает реальную ставку (APY)',
          en: 'Built-in yield calculator: compound interest with monthly top-ups and the real effective rate (APY)',
        },
      },
    ],
  },
  {
    version: '1.24.0',
    date: '2026-08-10',
    title: { ru: 'Умные лимиты и титулы за выдержку', en: 'Smart limits and titles for persistence' },
    items: [
      {
        icon: '🎚️',
        text: {
          ru: 'Лимиты стали живыми: прогресс расхода, остаток и сколько можно тратить в день до конца месяца',
          en: 'Limits came alive: spending progress, what’s left and how much you can spend per day until month end',
        },
      },
      {
        icon: '🪄',
        text: {
          ru: 'Не знаешь, какой лимит поставить? Приложение подскажет твой средний расход по категории — ставится в один тап',
          en: 'Not sure what limit to set? The app suggests your average spend per category — one tap to apply',
        },
      },
      {
        icon: '📈',
        text: {
          ru: 'В бюджете появились дневной лимит и прогноз: сколько выйдет к концу месяца при текущем темпе',
          en: 'Budget now shows a daily allowance and a forecast of where you’ll land at the current pace',
        },
      },
      {
        icon: '🔥',
        text: {
          ru: 'Титулы уровня теперь и за выдержку: нужен не только уровень, но и рекорд ежедневной серии — от 5 дней до 80',
          en: 'Level titles now reward persistence: you need both the level and your best daily streak — from 5 days up to 80',
        },
      },
    ],
  },
  {
    version: '1.23.0',
    date: '2026-08-10',
    title: { ru: 'Титулы уровня и обновлённый магазин', en: 'Level titles and a refreshed shop' },
    items: [
      {
        icon: '👑',
        text: {
          ru: 'Новый раздел «Титулы уровня»: за каждый из 10 уровней — уникальный титул. Надень его — и его увидят все в таблице лидеров',
          en: 'New “Level titles” section: each of the 10 levels unlocks a unique title. Equip it — and everyone will see it on the leaderboard',
        },
      },
      {
        icon: '🏆',
        text: {
          ru: 'В рейтинге теперь виден надетый титул каждого игрока — время флексить',
          en: 'The leaderboard now shows every player’s equipped title — time to flex',
        },
      },
      {
        icon: '🛍️',
        text: {
          ru: 'Магазин стал спокойнее и чище: меньше пёстрых бейджей, аккуратные цены и отметки «надето»',
          en: 'The shop is calmer and cleaner: fewer flashy badges, tidy prices and “equipped” marks',
        },
      },
    ],
  },
  {
    version: '1.22.0',
    date: '2026-08-10',
    title: { ru: 'Планирование под рукой и уровни до 10', en: 'Planning at hand and levels up to 10' },
    items: [
      {
        icon: '🎯',
        text: {
          ru: 'Планирование теперь прямо на Главной, под балансом: получил зарплату — сразу распредели бюджет, лимиты и цели',
          en: 'Planning is now right on Home, under the balance: got your salary — set your budget, limits and goals right away',
        },
      },
      {
        icon: '🎓',
        text: {
          ru: 'Три новых уровня: Магистр финансов, Олигарх и Император — прокачивайся до 10-го',
          en: 'Three new levels: Master of Finance, Oligarch and Emperor — level up to 10',
        },
      },
      {
        icon: '🏆',
        text: {
          ru: 'В таблице лидеров у каждого игрока виден его статус, а в топ теперь попадает до 100 человек',
          en: 'The leaderboard now shows each player’s status, and the top now fits up to 100 players',
        },
      },
      {
        icon: '🛍️',
        text: {
          ru: 'Магазин пополнился: акценты Лагуна, Золотой и Графит, титулы Инвестор, Акула бизнеса и Криптомагнат, рамки Изумруд и Неон',
          en: 'Shop restocked: Lagoon, Golden and Graphite accents, Investor, Business Shark and Crypto Tycoon titles, Emerald and Neon frames',
        },
      },
    ],
  },
  {
    version: '1.21.0',
    date: '2026-06-15',
    title: { ru: 'Новые задания', en: 'New quests' },
    items: [
      {
        icon: '🎯',
        text: {
          ru: 'Задания обновлены: подписка на канал, первая операция и 10 операций — за каждое XP и монеты',
          en: 'Quests refreshed: subscribe to the channel, first operation and 10 operations — XP and coins for each',
        },
      },
      {
        icon: '🚀',
        text: {
          ru: 'Новая секция «Спешел»: награды за приглашённых друзей — за 1, 3 и 5',
          en: 'New “Special” section: rewards for invited friends — for 1, 3 and 5',
        },
      },
    ],
  },
  {
    version: '1.20.0',
    date: '2026-06-14',
    title: { ru: 'Напоминания заходить', en: 'Daily reminders' },
    items: [
      {
        icon: '🔔',
        text: {
          ru: 'Бот раз в день вечером мягко напомнит записать траты — но только если ты в этот день не заходил',
          en: 'Once a day in the evening the bot gently reminds you to log expenses — only if you didn’t open the app that day',
        },
      },
      {
        icon: '⚙️',
        text: {
          ru: 'Напоминания можно отключить в Настройках → Уведомления',
          en: 'Reminders can be turned off in Settings → Notifications',
        },
      },
    ],
  },
  {
    version: '1.19.0',
    date: '2026-06-14',
    title: { ru: 'Новое кольцо аналитики', en: 'A brand-new analytics ring' },
    items: [
      {
        icon: '🍩',
        text: {
          ru: 'Кольцо категорий пересобрано с нуля: чистый круг с суммой в центре, без иконок на ободке — больше ничего не наезжает и не вылезает за край',
          en: 'The category ring was rebuilt from scratch: a clean circle with the total in the center, no icons on the rim — nothing overlaps or spills off-screen anymore',
        },
      },
      {
        icon: '🏷️',
        text: {
          ru: 'Категории теперь показаны аккуратной легендой-чипами под кольцом: иконка, название, сумма и процент',
          en: 'Categories now appear as a tidy chip legend under the ring: icon, name, amount and percentage',
        },
      },
    ],
  },
  {
    version: '1.18.1',
    date: '2026-06-14',
    title: { ru: 'Чистое кольцо категорий', en: 'A cleaner category ring' },
    items: [
      {
        icon: '🍩',
        text: {
          ru: 'Убрали соединительные линии в кольце аналитики — больше никакой «паутины» в центре, иконки стоят ровно по кругу',
          en: 'Removed the connector lines in the analytics ring — no more “web” in the center, icons sit evenly around the circle',
        },
      },
    ],
  },
  {
    version: '1.18.0',
    date: '2026-06-13',
    title: { ru: 'Аналитика в одном месте и чистое кольцо', en: 'Unified analytics & a cleaner chart' },
    items: [
      {
        icon: '📊',
        text: {
          ru: 'Аналитика и Графики объединены: расходы, доходы, динамика и календарь — в одной вкладке',
          en: 'Analytics and Charts merged: expenses, income, trends and calendar in one tab',
        },
      },
      {
        icon: '🍩',
        text: {
          ru: 'Кольцо категорий больше не наезжает на края, в календаре появился режим «Оба», а в периоде — «Всё время»',
          en: 'The category ring no longer spills off-screen, the calendar gained a “Both” mode, and the period picker got “All time”',
        },
      },
      {
        icon: '🎮',
        text: {
          ru: 'Награды стали плитками: серия, магазин, рейтинг и De-Fi (скоро)',
          en: 'Rewards are tiles now: streak, shop, leaderboard and De-Fi (soon)',
        },
      },
    ],
  },
  {
    version: '1.17.0',
    date: '2026-06-12',
    title: { ru: 'Магазин кастомизации и витрина дня', en: 'Customization shop & daily deals' },
    items: [
      {
        icon: '🛍️',
        text: {
          ru: 'Магазин переехал на отдельный экран: палитры, титулы и рамки — крупно и удобно',
          en: 'The shop moved to its own screen: palettes, titles and frames — big and convenient',
        },
      },
      {
        icon: '🔥',
        text: {
          ru: '«Витрина дня» — каждый день три предмета со скидкой −30%, обновляется автоматически',
          en: 'Daily deals — three items at −30% every day, refreshed automatically',
        },
      },
      {
        icon: '🤝',
        text: {
          ru: 'За каждого приглашённого друга — +25 XP и 🪙10, и теперь видно прямо в списке',
          en: 'Each invited friend now gives +25 XP and 🪙10, shown right in the list',
        },
      },
    ],
  },
  {
    version: '1.16.0',
    date: '2026-06-12',
    title: { ru: 'Безопасность и стабильность', en: 'Security & stability' },
    items: [
      {
        icon: '🛡️',
        text: {
          ru: 'Под капотом усилили защиту аккаунта и данных',
          en: 'Hardened account and data protection under the hood',
        },
      },
      {
        icon: '☁️',
        text: {
          ru: 'Синхронизация стала надёжнее и аккуратнее проверяет данные',
          en: 'Sync is more reliable and validates data more carefully',
        },
      },
    ],
  },
  {
    version: '1.15.0',
    date: '2026-06-11',
    title: { ru: 'Новая вкладка «Награды» и свежий профиль', en: 'New Rewards tab & a fresh profile' },
    items: [
      {
        icon: '🎁',
        text: {
          ru: 'Вся геймификация переехала в отдельную вкладку «Награды»: уровень, задания, достижения и рейтинг — крупными плитками',
          en: 'All gamification moved to a dedicated Rewards tab: level, quests, achievements and ranking — as big tiles',
        },
      },
      {
        icon: '👤',
        text: {
          ru: 'Профиль стал чище — только вы и ваши финансы; настройки теперь под шестерёнкой в шапке',
          en: 'Profile is cleaner now — just you and your finances; settings live under the gear in the header',
        },
      },
      {
        icon: '✨',
        text: {
          ru: 'Обновили внешний вид и ускорили загрузку',
          en: 'Refreshed the look and made it load faster',
        },
      },
    ],
  },
  {
    version: '1.14.0',
    date: '2026-06-11',
    title: { ru: 'Финансовые задания', en: 'Finance quests' },
    items: [
      {
        icon: '🎯',
        text: {
          ru: 'Новые задания за реальные привычки: 5 разных категорий, неделя учёта подряд, достигнутая цель, месяц в рамках бюджета',
          en: 'New quests for real habits: 5 different categories, a week of logging in a row, a reached goal, a month within budget',
        },
      },
      {
        icon: '🪙',
        text: {
          ru: 'За них дают больше XP и монет — на косметику в «Достижениях»',
          en: 'They reward more XP and coins to spend on cosmetics in Achievements',
        },
      },
    ],
  },
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
export function cmpVersion(a: string, b: string): number {
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
