/**
 * Простая i18n: словарь RU/EN + хук useT().
 *
 * Язык хранится в сторе (`lang`), переключается в Настройках. Дефолт — по языку
 * Telegram (ru → русский, иначе английский).
 *
 * Использование:
 *   const t = useT()
 *   <span>{t('nav.home')}</span>
 *   t('quest.progress', { current: 2, goal: 5 })  // подстановка {current}/{goal}
 */
import { useEffect } from 'react'
import { useStore } from '../store/transactions'
import { setFormatLocale } from './format'
import { tg } from './telegram'

export type Lang = 'ru' | 'en'

/** Язык по умолчанию: из Telegram, иначе русский. */
export function defaultLang(): Lang {
  const code = tg.user?.language_code ?? ''
  return code.startsWith('ru') ? 'ru' : code ? 'en' : 'ru'
}

type Dict = Record<string, { ru: string; en: string }>

const DICT: Dict = {
  /* Навигация / вкладки */
  'nav.home': { ru: 'Главная', en: 'Home' },
  'nav.analytics': { ru: 'Аналитика', en: 'Analytics' },
  'nav.charts': { ru: 'Графики', en: 'Charts' },
  'nav.settings': { ru: 'Настройки', en: 'Settings' },
  'nav.profile': { ru: 'Профиль', en: 'Profile' },
  'nav.rewards': { ru: 'Награды', en: 'Rewards' },
  'rewards.kicker': { ru: 'Прогресс и награды', en: 'Progress & rewards' },
  'shop.kicker': { ru: 'Кастомизация', en: 'Customization' },
  'shop.title': { ru: 'Магазин', en: 'Shop' },
  'shop.subtitle': { ru: 'Палитры, титулы, рамки', en: 'Palettes, titles, frames' },
  'shop.featured': { ru: 'Витрина дня', en: 'Deal of the day' },

  /* Общие */
  'app.name': { ru: 'Кошель', en: 'Koshel' },
  'common.income': { ru: 'Доходы', en: 'Income' },
  'common.expense': { ru: 'Расходы', en: 'Expenses' },
  'common.balance': { ru: 'Баланс', en: 'Balance' },
  'common.cancel': { ru: 'Отмена', en: 'Cancel' },
  'common.save': { ru: 'Сохранить', en: 'Save' },
  'common.add': { ru: 'Добавить', en: 'Add' },
  'common.delete': { ru: 'Удалить', en: 'Delete' },
  'common.edit': { ru: 'Изменить', en: 'Edit' },
  'common.close': { ru: 'Закрыть', en: 'Close' },
  'common.done': { ru: 'Готово', en: 'Done' },
  'common.back': { ru: 'Назад', en: 'Back' },
  'common.all_time': { ru: 'За всё время', en: 'All time' },

  /* Настройки */
  'settings.kicker': { ru: 'Настройки', en: 'Settings' },
  'settings.title': { ru: 'Тонкая настройка', en: 'Fine-tuning' },
  'settings.currency': { ru: 'Валюта', en: 'Currency' },
  'settings.more_currencies': { ru: 'Ещё валюты', en: 'More currencies' },
  'settings.hide': { ru: 'Скрыть', en: 'Hide' },
  'settings.language': { ru: 'Язык', en: 'Language' },
  'settings.chart_style': { ru: 'Стиль графика', en: 'Chart style' },
  'settings.chart_compact': { ru: 'Компактный', en: 'Compact' },
  'settings.chart_icons': { ru: 'С иконками', en: 'With icons' },
  'settings.home_header': { ru: 'Шапка Главной', en: 'Home header' },
  'settings.hh_date': { ru: 'Дата', en: 'Date' },
  'settings.hh_goal': { ru: 'Прогресс к цели', en: 'Goal progress' },
  'settings.hh_pick_goal': { ru: 'Какую цель показывать', en: 'Which goal to show' },
  'settings.hh_no_goals': { ru: 'Сначала добавьте цель в Планировании (в профиле)', en: 'Add a goal first in Planning (in profile)' },
  'settings.theme': { ru: 'Тема', en: 'Theme' },
  'settings.theme_auto': { ru: 'Авто', en: 'Auto' },
  'settings.theme_light': { ru: 'Светлая', en: 'Light' },
  'settings.theme_dark': { ru: 'Тёмная', en: 'Dark' },
  'settings.budgets': { ru: 'Бюджеты', en: 'Budgets' },
  'settings.budgets_active': { ru: '{n} активн.', en: '{n} active' },
  'settings.budgets_none': { ru: 'не заданы', en: 'not set' },
  'settings.budget_hint': {
    ru: 'Лимит — это месячный ориентир расхода на категорию. При расходе ≥80% появляется жёлтая полоса, при 100%+ — красная и тревожная плашка на главной.',
    en: 'A limit is a monthly spending target per category. At ≥80% a yellow bar appears, at 100%+ a red one plus an alert on Home.',
  },
  'settings.custom_categories': { ru: 'Свои категории', en: 'Custom categories' },
  'settings.cats_count': { ru: '{n} шт.', en: '{n} pcs' },
  'settings.cats_none': { ru: 'нет', en: 'none' },
  'settings.add_category': { ru: 'Добавить категорию', en: 'Add category' },
  'settings.data': { ru: 'Данные', en: 'Data' },
  'settings.total_ops': { ru: 'Всего операций', en: 'Total operations' },
  'settings.demo': { ru: 'Демо-режим', en: 'Demo mode' },
  'settings.demo_hint': {
    ru: 'Показывает пример данных за 2 года. Ваши операции не меняются.',
    en: 'Shows 2 years of sample data. Your operations stay unchanged.',
  },
  'settings.clear_all': { ru: 'Очистить всё', en: 'Clear everything' },
  'settings.clear_confirm': {
    ru: 'Удалить все операции? Это действие необратимо.',
    en: 'Delete all operations? This cannot be undone.',
  },
  'settings.guide': { ru: 'Гайд по приложению', en: 'App guide' },
  'settings.guide_hint': { ru: 'Все функции и как ими пользоваться', en: 'All features and how to use them' },
  'settings.about': { ru: 'О приложении', en: 'About' },
  'settings.about_text': {
    ru: 'Кошель — это простой трекер расходов и доходов в Telegram. Данные хранятся локально на устройстве.',
    en: 'Koshel is a simple income & expense tracker inside Telegram. Data is stored locally on your device.',
  },
  'settings.in_telegram': { ru: 'Запущено внутри Telegram:', en: 'Running inside Telegram:' },
  'settings.income_cats': { ru: 'доход', en: 'income' },
  'settings.expense_cats': { ru: 'расход', en: 'expense' },
  'settings.active_limits_sum': { ru: 'Сумма активных лимитов:', en: 'Total active limits:' },

  /* Профиль */
  'profile.kicker': { ru: 'Кошель', en: 'Koshel' },
  'profile.title': { ru: 'Профиль', en: 'Profile' },
  'profile.guest': { ru: 'Гость', en: 'Guest' },
  'profile.open_in_tg': {
    ru: 'Откройте в Telegram, чтобы увидеть профиль',
    en: 'Open in Telegram to see your profile',
  },
  'profile.level': { ru: 'Уровень {level} из {max}', en: 'Level {level} of {max}' },
  'profile.max_level': { ru: 'Максимальный уровень — ты легенда 🏆', en: 'Max level — you are a legend 🏆' },
  'profile.xp_progress': { ru: '{into} / {need} XP · до след. {toNext}', en: '{into} / {need} XP · {toNext} to next' },
  'profile.achievements': { ru: 'Достижения', en: 'Achievements' },
  'profile.achievements_hint': {
    ru: 'Серия дня и магазин: палитры, титулы, рамки',
    en: 'Daily streak and shop: palettes, titles, frames',
  },
  'profile.leaderboard': { ru: 'Таблица лидеров', en: 'Leaderboard' },
  'profile.leaderboard_hint': { ru: 'Рейтинг по XP среди всех участников', en: 'XP ranking across all players' },
  'profile.planning': { ru: 'Планирование', en: 'Planning' },
  'profile.planning_hint': { ru: 'Бюджет, лимиты и накопительные цели', en: 'Budget, limits and savings goals' },
  'profile.quests': { ru: 'Задания', en: 'Quests' },
  'profile.quests_hint': { ru: 'Выполняй задания — получай XP и монеты', en: 'Complete quests for XP and coins' },
  'profile.income_total': { ru: 'Доходы всего', en: 'Total income' },
  'profile.expense_total': { ru: 'Расходы всего', en: 'Total expenses' },
  'profile.balance': { ru: 'Баланс', en: 'Balance' },
  'profile.ops': { ru: 'Операций', en: 'Operations' },
  'profile.top_expense': { ru: 'Главная статья расходов', en: 'Top expense category' },
  'profile.with_us_since': { ru: 'С нами с {date}', en: 'With us since {date}' },
  'profile.claimable': { ru: 'к получению: {n}', en: 'to claim: {n}' },
  'profile.invite_friends': { ru: 'Пригласить друзей', en: 'Invite friends' },
  'profile.invited': { ru: 'приглашено: {n}', en: 'invited: {n}' },
  'profile.invite_text': {
    ru: 'Делись ссылкой — за приглашённых друзей будешь получать XP и бонусы.',
    en: 'Share your link — earn XP and bonuses for invited friends.',
  },
  'profile.share': { ru: 'Поделиться', en: 'Share' },
  'profile.copy': { ru: 'Копировать', en: 'Copy' },
  'profile.copied': { ru: 'Скопировано', en: 'Copied' },
  'profile.who_joined': { ru: 'Кто присоединился', en: 'Who joined' },
  'profile.feedback': { ru: 'Оставить отзыв', en: 'Send feedback' },
  'profile.feedback_thanks': { ru: 'Спасибо! Отзыв отправлен.', en: 'Thanks! Feedback sent.' },
  'profile.feedback_placeholder': {
    ru: 'Что улучшить? Что нравится? Пиши без стеснения…',
    en: 'What to improve? What do you like? Write freely…',
  },
  'profile.feedback_error': { ru: 'Не удалось отправить. Попробуй ещё раз.', en: 'Could not send. Try again.' },
  'profile.feedback_sending': { ru: 'Отправляю…', en: 'Sending…' },
  'profile.feedback_send': { ru: 'Отправить отзыв', en: 'Send feedback' },
  'profile.feedback_chat': { ru: 'Написать в чат бота', en: 'Message the bot' },

  /* Квесты */
  'quest.received': { ru: '✓ Получено', en: '✓ Claimed' },
  'quest.claim': { ru: 'Забрать', en: 'Claim' },
  'quest.locked_in': { ru: 'через {time}', en: 'in {time}' },
  'quest.locked': { ru: 'Скоро', en: 'Soon' },
  'quest.next_in': { ru: '✓ Получено · новое через {time}', en: '✓ Claimed · next in {time}' },
  'quest.expires_in': { ru: '✓ Получено · исчезнет через {time}', en: '✓ Claimed · disappears in {time}' },
  'quest.empty': { ru: 'Все задания выполнены — новые появятся совсем скоро. Загляни позже!', en: 'All quests done — new ones appear soon. Check back later!' },
  'unit.h': { ru: 'ч', en: 'h' },
  'unit.m': { ru: 'мин', en: 'm' },

  /* Планирование (бюджет/лимиты/цели) */
  'plan.title': { ru: 'Планирование', en: 'Planning' },
  'plan.subtitle': { ru: 'Бюджет, лимиты и цели', en: 'Budget, limits and goals' },
  'plan.tab_budget': { ru: 'Бюджет', en: 'Budget' },
  'plan.tab_limits': { ru: 'Лимиты', en: 'Limits' },
  'plan.tab_goals': { ru: 'Цели', en: 'Goals' },
  'plan.budget_title': { ru: 'Общий месячный бюджет', en: 'Overall monthly budget' },
  'plan.budget_hint': {
    ru: 'Задай, сколько хочешь тратить в месяц. Прогресс считается по расходам текущего месяца.',
    en: 'Set how much you want to spend per month. Progress tracks this month’s expenses.',
  },
  'plan.budget_spent': { ru: 'Потрачено в этом месяце', en: 'Spent this month' },
  'plan.budget_left': { ru: 'Осталось', en: 'Left' },
  'plan.budget_over': { ru: 'Превышение', en: 'Over budget' },
  'plan.budget_none': { ru: 'Бюджет не задан', en: 'No budget set' },
  'plan.budget_placeholder': { ru: 'Сумма в месяц', en: 'Amount per month' },
  'plan.limits_hint': {
    ru: 'Лимиты по категориям. Жёлтый — ≥80%, красный — превышение.',
    en: 'Per-category limits. Yellow at ≥80%, red when exceeded.',
  },
  'plan.limits_empty': { ru: 'Категории расходов появятся здесь', en: 'Expense categories will appear here' },
  'plan.goals_hint': {
    ru: 'Копи на крупные покупки. Добавляй взносы вручную — приложение покажет прогресс.',
    en: 'Save up for big purchases. Add contributions manually and watch the progress.',
  },
  'plan.goals_empty': { ru: 'Пока нет целей. Создай первую!', en: 'No goals yet. Create your first!' },
  'plan.goal_new': { ru: 'Новая цель', en: 'New goal' },
  'plan.goal_name': { ru: 'Название', en: 'Name' },
  'plan.goal_name_ph': { ru: 'Напр. Отпуск, MacBook…', en: 'e.g. Vacation, MacBook…' },
  'plan.goal_target': { ru: 'Сколько накопить', en: 'Target amount' },
  'plan.goal_add': { ru: 'Создать цель', en: 'Create goal' },
  'plan.goal_contribute': { ru: 'Внести', en: 'Add' },
  'plan.goal_contribute_ph': { ru: 'Сумма взноса', en: 'Contribution' },
  'plan.goal_done': { ru: 'Цель достигнута! 🎉', en: 'Goal reached! 🎉' },
  'plan.goal_delete_confirm': { ru: 'Удалить цель?', en: 'Delete this goal?' },
  'plan.goal_of': { ru: 'из', en: 'of' },
  'plan.goal_sync': { ru: 'Синхронизировать с балансом', en: 'Sync with balance' },
  'plan.goal_sync_hint': {
    ru: 'Накоплено = общий баланс (доходы − расходы). Обновляется само при операциях, без ручных взносов.',
    en: 'Saved = overall balance (income − expenses). Updates automatically with your transactions, no manual contributions.',
  },
  'plan.goal_synced': { ru: 'Синхронизирована с балансом', en: 'Synced with balance' },

  /* Лидерборд */
  'lb.title': { ru: 'Таблица лидеров', en: 'Leaderboard' },
  'lb.participants': { ru: 'Участников: {n}', en: 'Players: {n}' },
  'lb.subtitle': { ru: 'Рейтинг участников', en: 'Players ranking' },
  'lb.by_xp': { ru: 'По XP', en: 'By XP' },
  'lb.by_refs': { ru: 'По рефералам', en: 'By referrals' },
  'lb.loading': { ru: 'Загружаем рейтинг…', en: 'Loading ranking…' },
  'lb.error': { ru: 'Не удалось загрузить рейтинг. Попробуйте позже.', en: 'Could not load ranking. Try later.' },
  'lb.error_tg': { ru: 'Откройте приложение в Telegram, чтобы попасть в рейтинг.', en: 'Open the app in Telegram to join the ranking.' },
  'lb.empty_xp': { ru: 'Пока пусто — стань первым в рейтинге!', en: 'Empty so far — be the first!' },
  'lb.empty_refs': { ru: 'Пока никто не приглашал друзей — стань первым!', en: 'Nobody invited friends yet — be the first!' },
  'lb.me': { ru: 'ты', en: 'you' },
  'lb.level_short': { ru: 'ур.', en: 'lvl' },
  'lb.friends': { ru: 'друзей', en: 'friends' },
  'lb.privacy': {
    ru: 'В рейтинге — только XP, уровень, монеты и число приглашённых. Суммы доходов и расходов остаются приватными и никуда не отправляются.',
    en: 'Only XP, level, coins and invite count are ranked. Your income and expense amounts stay private and are never sent.',
  },

  /* Доход/расход в единственном числе (вкладки, кнопки) */
  'common.income_one': { ru: 'Доход', en: 'Income' },
  'common.expense_one': { ru: 'Расход', en: 'Expense' },
  'common.apply': { ru: 'Применить', en: 'Apply' },

  /* Аналитика */
  'analytics.subtitle': { ru: 'Куда уходят деньги', en: 'Where the money goes' },
  'analytics.by_days': { ru: 'По дням', en: 'By days' },
  'analytics.max_per_day': { ru: 'Максимум за день:', en: 'Max per day:' },

  /* Графики */
  'charts.subtitle': { ru: 'Динамика', en: 'Dynamics' },
  'charts.gran_day': { ru: 'Дни', en: 'Days' },
  'charts.gran_week': { ru: 'Недели', en: 'Weeks' },
  'charts.gran_month': { ru: 'Месяцы', en: 'Months' },
  'charts.gran_year': { ru: 'Годы', en: 'Years' },
  'charts.series_both': { ru: 'Вместе', en: 'Both' },
  'charts.avg_expense': { ru: 'Средний расход за период:', en: 'Average expense per period:' },
  'charts.no_data': { ru: 'Нет данных за период', en: 'No data for this period' },

  /* Добавление операции */
  'add.more': { ru: 'Ещё', en: 'More' },
  'add.note_ph': { ru: 'Заметка (необязательно)', en: 'Note (optional)' },
  'add.today': { ru: 'Сегодня', en: 'Today' },
  'add.yesterday': { ru: 'Вчера', en: 'Yesterday' },
  'add.pick_date': { ru: 'Выбрать дату', en: 'Pick date' },
  'add.tag_ph': { ru: '+ тег', en: '+ tag' },
  'add.tag_add': { ru: '+ добавить тег', en: '+ add tag' },
  'add.create': { ru: 'Создать', en: 'Create' },
  'add.save_expense': { ru: 'Записать расход', en: 'Save expense' },
  'add.save_income': { ru: 'Записать доход', en: 'Save income' },

  /* Редактор категорий */
  'cat.edit': { ru: 'Категория', en: 'Category' },
  'cat.new': { ru: 'Новая категория', en: 'New category' },
  'cat.untitled': { ru: 'Без названия', en: 'Untitled' },
  'cat.name_ph': { ru: 'Название категории', en: 'Category name' },
  'cat.color': { ru: 'Цвет', en: 'Color' },
  'cat.icon': { ru: 'Иконка', en: 'Icon' },
  'cat.create': { ru: 'Создать категорию', en: 'Create category' },
  'cat.delete': { ru: 'Удалить категорию', en: 'Delete category' },
  'cat.delete_confirm': {
    ru: 'Удалить категорию «{name}»? Операции в ней останутся.',
    en: 'Delete category “{name}”? Its operations will remain.',
  },
  'cat.of_limit': { ru: 'из лимита', en: 'of limit' },

  /* Календарь */
  'cal.tab': { ru: 'Календарь', en: 'Calendar' },
  'cal.net': { ru: 'Чистый итог', en: 'Net' },
  'cal.prev_month': { ru: 'Предыдущий месяц', en: 'Previous month' },
  'cal.next_month': { ru: 'Следующий месяц', en: 'Next month' },
  'cal.income_month': { ru: 'Доходы за месяц', en: 'Income this month' },
  'cal.expense_month': { ru: 'Расходы за месяц', en: 'Expenses this month' },
  'cal.net_month': { ru: 'Чистый итог за месяц', en: 'Net this month' },

  /* Подпись баланса по периоду */
  'balance.day': { ru: 'Баланс за день', en: 'Daily balance' },
  'balance.week': { ru: 'Баланс за неделю', en: 'Weekly balance' },
  'balance.month': { ru: 'Баланс за месяц', en: 'Monthly balance' },
  'balance.year': { ru: 'Баланс за год', en: 'Yearly balance' },
  'balance.all': { ru: 'Баланс за всё время', en: 'All-time balance' },
  'balance.custom': { ru: 'Баланс за период', en: 'Period balance' },

  /* Бюджет-плашка */
  'budget.exceeded': { ru: 'Бюджет превышен', en: 'Budget exceeded' },
  'budget.near': { ru: 'Бюджет на пределе', en: 'Budget near limit' },
  'budget.and_more': { ru: 'и ещё {n}', en: 'and {n} more' },

  /* Переключатель периода */
  'period.day': { ru: 'День', en: 'Day' },
  'period.week': { ru: 'Неделя', en: 'Week' },
  'period.month': { ru: 'Месяц', en: 'Month' },
  'period.year': { ru: 'Год', en: 'Year' },
  'period.custom': { ru: 'Период', en: 'Period' },
  'period.prev': { ru: 'Назад', en: 'Back' },
  'period.next': { ru: 'Вперёд', en: 'Forward' },
  'period.pick': { ru: 'Выбор периода', en: 'Select period' },
  'period.pick_end': { ru: 'С {date} — выберите конец', en: 'From {date} — pick the end' },
  'period.pick_start': { ru: 'Выберите начало периода', en: 'Pick the start of the period' },
  'period.reset': { ru: 'Сбросить выбор', en: 'Reset selection' },

  /* Счета */
  'account.all': { ru: 'Все', en: 'All' },

  /* Пустое состояние списка */
  'empty.title': { ru: 'Пусто, но это поправимо', en: 'Empty — but fixable' },
  'empty.text': {
    ru: 'Добавь первую операцию кнопкой + или − внизу — и здесь появится разбивка по категориям.',
    en: 'Add your first operation with the + or − button below — a category breakdown will appear here.',
  },
  'empty.enable_demo': { ru: 'Включить демо-режим', en: 'Enable demo mode' },

  /* FAB */
  'fab.add_expense': { ru: 'Добавить расход', en: 'Add expense' },
  'fab.add_income': { ru: 'Добавить доход', en: 'Add income' },

  /* Уровень */
  'level.aria': { ru: 'Уровень и прогресс', en: 'Level and progress' },
  'level.max_short': { ru: 'макс.', en: 'max' },

  /* Прочее */
  'chart.no_data': { ru: 'Нет данных', en: 'No data' },
  'share.text': {
    ru: 'Веду финансы в «Кошель» — попробуй, удобно 👇',
    en: 'I track my finances with Koshel — give it a try 👇',
  },

  /* Названия уровней (levels.ts) */
  'level.t1': { ru: 'Новичок', en: 'Novice' },
  'level.t2': { ru: 'Счетовод', en: 'Bookkeeper' },
  'level.t3': { ru: 'Бережливый', en: 'Saver' },
  'level.t4': { ru: 'Финансист', en: 'Financier' },
  'level.t5': { ru: 'Капиталист', en: 'Capitalist' },
  'level.t6': { ru: 'Магнат', en: 'Magnate' },
  'level.t7': { ru: 'Легенда', en: 'Legend' },

  /* Рарность наград (rewards.ts) */
  'rarity.common': { ru: 'Обычная', en: 'Common' },
  'rarity.rare': { ru: 'Редкая', en: 'Rare' },
  'rarity.epic': { ru: 'Эпическая', en: 'Epic' },
  'rarity.legendary': { ru: 'Легендарная', en: 'Legendary' },

  /* Награды: акценты */
  'reward.accent_mint.name': { ru: 'Мятный', en: 'Mint' },
  'reward.accent_mint.hint': { ru: 'Классический зелёный акцент', en: 'Classic green accent' },
  'reward.accent_ocean.name': { ru: 'Океан', en: 'Ocean' },
  'reward.accent_ocean.hint': { ru: 'Спокойный синий', en: 'Calm blue' },
  'reward.accent_grape.name': { ru: 'Виноград', en: 'Grape' },
  'reward.accent_grape.hint': { ru: 'Глубокий фиолетовый', en: 'Deep purple' },
  'reward.accent_sunset.name': { ru: 'Закат', en: 'Sunset' },
  'reward.accent_sunset.hint': { ru: 'Тёплый оранжевый', en: 'Warm orange' },
  'reward.accent_rose.name': { ru: 'Роза', en: 'Rose' },
  'reward.accent_rose.hint': { ru: 'Яркий розовый', en: 'Vivid pink' },

  /* Награды: титулы */
  'reward.title_newbie.name': { ru: 'Новенький', en: 'Newbie' },
  'reward.title_newbie.hint': { ru: 'Все с чего-то начинают', en: 'Everyone starts somewhere' },
  'reward.title_saver.name': { ru: 'Хранитель монет', en: 'Coin Keeper' },
  'reward.title_saver.hint': { ru: 'Бережёшь каждую копейку', en: 'You save every penny' },
  'reward.title_budget.name': { ru: 'Магистр бюджета', en: 'Budget Master' },
  'reward.title_budget.hint': { ru: 'Бюджет под контролем', en: 'Budget under control' },
  'reward.title_guru.name': { ru: 'Гуру финансов', en: 'Finance Guru' },
  'reward.title_guru.hint': { ru: 'Деньги слушаются тебя', en: 'Money obeys you' },
  'reward.title_lord.name': { ru: 'Властелин кошелька', en: 'Wallet Lord' },
  'reward.title_lord.hint': { ru: 'Вершина мастерства', en: 'Peak of mastery' },

  /* Награды: рамки */
  'reward.frame_none.name': { ru: 'Без рамки', en: 'No frame' },
  'reward.frame_none.hint': { ru: 'Простой вид', en: 'Plain look' },
  'reward.frame_bronze.name': { ru: 'Бронза', en: 'Bronze' },
  'reward.frame_bronze.hint': { ru: 'Тёплый бронзовый ободок', en: 'Warm bronze ring' },
  'reward.frame_silver.name': { ru: 'Серебро', en: 'Silver' },
  'reward.frame_silver.hint': { ru: 'Холодный серебряный блеск', en: 'Cool silver shine' },
  'reward.frame_gold.name': { ru: 'Золото', en: 'Gold' },
  'reward.frame_gold.hint': { ru: 'Статусное золото', en: 'Prestigious gold' },
  'reward.frame_rainbow.name': { ru: 'Радуга', en: 'Rainbow' },
  'reward.frame_rainbow.hint': { ru: 'Переливается всеми цветами', en: 'Shimmers all colors' },

  /* Задания (quests.ts) */
  'quest.first_tx.title': { ru: 'Первая операция', en: 'First operation' },
  'quest.first_tx.desc': { ru: 'Добавь первый доход или расход', en: 'Add your first income or expense' },
  'quest.see_analytics.title': { ru: 'Загляни в Аналитику', en: 'Check Analytics' },
  'quest.see_analytics.desc': { ru: 'Открой вкладку «Аналитика» внизу', en: 'Open the Analytics tab below' },
  'quest.see_charts.title': { ru: 'Посмотри Графики', en: 'View Charts' },
  'quest.see_charts.desc': { ru: 'Зайди во вкладку «Графики» — оцени динамику', en: 'Open the Charts tab — see the dynamics' },
  'quest.try_period.title': { ru: 'Переключи период', en: 'Switch period' },
  'quest.try_period.desc': { ru: 'Смени период — день / неделя / месяц', en: 'Change the period — day / week / month' },
  'quest.make_category.title': { ru: 'Своя категория', en: 'Own category' },
  'quest.make_category.desc': { ru: 'Создай категорию под свои траты', en: 'Create a category for your spending' },
  'quest.personalize.title': { ru: 'Настрой под себя', en: 'Make it yours' },
  'quest.personalize.desc': { ru: 'Поменяй тему или акцентную палитру', en: 'Change the theme or accent palette' },
  'quest.open_planning.title': { ru: 'Открой Планирование', en: 'Open Planning' },
  'quest.open_planning.desc': { ru: 'Загляни в «Планирование» в профиле', en: 'Check Planning in your profile' },
  'quest.set_budget.title': { ru: 'Задай бюджет', en: 'Set a budget' },
  'quest.set_budget.desc': { ru: 'Поставь общий бюджет или лимит категории', en: 'Set an overall budget or a category limit' },
  'quest.set_goal.title': { ru: 'Поставь цель', en: 'Set a goal' },
  'quest.set_goal.desc': { ru: 'Создай накопительную цель', en: 'Create a savings goal' },
  'quest.see_leaderboard.title': { ru: 'Сравни с другими', en: 'Compare with others' },
  'quest.see_leaderboard.desc': { ru: 'Открой «Таблицу лидеров» в профиле', en: 'Open the Leaderboard in your profile' },
  'quest.tx_10.title': { ru: 'Входим в ритм', en: 'Getting in rhythm' },
  'quest.tx_10.desc': { ru: 'Доведи число операций до 10', en: 'Reach 10 operations' },
  'quest.streak_3.title': { ru: 'Три дня подряд', en: 'Three days in a row' },
  'quest.streak_3.desc': { ru: 'Забери ежедневную серию три дня кряду', en: 'Claim the daily streak three days straight' },
  'quest.diversify_5.title': { ru: 'Пять категорий', en: 'Five categories' },
  'quest.diversify_5.desc': { ru: 'Используй 5 разных категорий', en: 'Use 5 different categories' },
  'quest.log_7.title': { ru: 'Неделя учёта', en: 'A week of tracking' },
  'quest.log_7.desc': { ru: 'Записывай операции 7 дней подряд', en: 'Log for 7 days in a row' },
  'quest.goal_reached.title': { ru: 'Цель достигнута', en: 'Goal reached' },
  'quest.goal_reached.desc': { ru: 'Накопи первую цель полностью', en: 'Fully fund your first goal' },
  'quest.under_budget.title': { ru: 'В рамках бюджета', en: 'Within budget' },
  'quest.under_budget.desc': { ru: 'Удержи месяц в пределах бюджета', en: 'Keep the month within budget' },
  'quest.invite_3.title': { ru: 'Пригласи 3 друзей', en: 'Invite 3 friends' },
  'quest.invite_3.desc': { ru: 'Позови троих по своей ссылке', en: 'Bring three people via your link' },
  'quest.invite_5.title': { ru: 'Пригласи 5 друзей', en: 'Invite 5 friends' },
  'quest.invite_5.desc': { ru: 'Позови пятерых по своей ссылке', en: 'Bring five people via your link' },

  /* Шторка «Достижения» (RoadpassSheet) */
  'roadpass.intro': {
    ru: 'Заходи каждый день за монетами и трать их на косметику. Чем выше рарность — тем дороже. Что купил — можно надеть в любой момент.',
    en: 'Come back daily for coins and spend them on cosmetics. The rarer the item, the pricier. Anything you buy can be equipped anytime.',
  },
  'roadpass.owned_count': { ru: 'Куплено {n} из {total} наград', en: 'Owned {n} of {total} rewards' },
  'roadpass.days_short': { ru: 'дн.', en: 'd' },
  'roadpass.streak_record': { ru: 'Серия · рекорд {best}', en: 'Streak · best {best}' },
  'roadpass.claimed_today': { ru: 'Сегодня ✓', en: 'Today ✓' },
  'roadpass.to_milestone': { ru: 'До рубежа {n} дн.', en: 'To milestone: {n}d' },
  'roadpass.milestone_hit': { ru: 'рубеж {n} дн.!', en: 'milestone {n}d!' },
  'roadpass.today_reward': { ru: 'Сегодняшняя награда: +{xp} XP · 🪙 {coins}', en: 'Today’s reward: +{xp} XP · 🪙 {coins}' },
  'roadpass.milestone_suffix': { ru: ' · рубеж {n} дн.', en: ' · milestone {n}d' },
  'roadpass.equipped': { ru: 'Надето', en: 'Equipped' },
  'roadpass.equip': { ru: 'Надеть', en: 'Equip' },
  'roadpass.kind_accent': { ru: 'Акцентные палитры', en: 'Accent palettes' },
  'roadpass.kind_title': { ru: 'Титулы', en: 'Titles' },
  'roadpass.kind_frame': { ru: 'Рамки аватара', en: 'Avatar frames' },
  'roadpass.kind_accent_hint': { ru: 'Перекрашивают всё приложение', en: 'Recolor the whole app' },
  'roadpass.kind_title_hint': { ru: 'Подпись под именем в профиле', en: 'A label under your profile name' },
  'roadpass.kind_frame_hint': { ru: 'Ободок вокруг аватара', en: 'A ring around your avatar' },

  /* Онбординг / Что нового (Intro) */
  'intro.welcome': { ru: 'Добро пожаловать в Кошель', en: 'Welcome to Koshel' },
  'intro.welcome_sub': { ru: 'Простой трекер финансов в Telegram. Вот что где находится:', en: 'A simple finance tracker in Telegram. Here’s what’s where:' },
  'intro.privacy': {
    ru: 'Данные хранятся локально на твоём устройстве. Приглашай друзей и выполняй задания — за них дают XP и монеты.',
    en: 'Data is stored locally on your device. Invite friends and complete quests — they grant XP and coins.',
  },
  'intro.start': { ru: 'Начать', en: 'Get started' },
  'intro.whatsnew': { ru: 'Что нового', en: 'What’s new' },
  'intro.whatsnew_sub': { ru: 'Мы обновили приложение — вот изменения', en: 'We’ve updated the app — here’s what changed' },
  'intro.got_it': { ru: 'Понятно', en: 'Got it' },
  'intro.f_home_d': { ru: 'Добавляй доход и расход кнопками + и −, смотри баланс за период', en: 'Add income and expenses with the + and − buttons, see the balance for a period' },
  'intro.f_analytics_d': { ru: 'Разбивка по категориям, бюджеты и лимиты', en: 'Category breakdown, budgets and limits' },
  'intro.f_charts_d': { ru: 'Динамика доходов и расходов во времени', en: 'Income and expense dynamics over time' },
  'intro.f_settings_d': { ru: 'Валюта, темы, бюджеты, свои категории', en: 'Currency, themes, budgets, custom categories' },
  'intro.f_profile_d': { ru: 'Аватар вверху: уровень, задания, монеты, приглашения, отзыв', en: 'Avatar on top: level, quests, coins, invites, feedback' },

  /* Подпись шапки Главной */
  'home.cap_goal': { ru: 'Цель', en: 'Goal' },
  'home.cap_date': { ru: 'Дата', en: 'Date' },

  /* Плашка демо-режима */
  'demo.banner': { ru: 'Демо-режим: показаны примерные данные', en: 'Demo mode: sample data shown' },
  'common.exit': { ru: 'Выйти', en: 'Exit' },
}

/** Подстановка переменных вида {name}. */
function interpolate(str: string, vars?: Record<string, string | number>): string {
  if (!vars) return str
  return str.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`))
}

/** Перевести ключ на указанный язык (вне React). */
export function translate(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  const entry = DICT[key]
  if (!entry) return key
  return interpolate(entry[lang], vars)
}

export type TFunc = (key: string, vars?: Record<string, string | number>) => string

/** Хук перевода: подписывается на язык из стора. */
export function useT(): TFunc {
  const lang = useStore((s) => s.lang)
  return (key, vars) => translate(lang, key, vars)
}

/** Слово «категория» с правильным склонением (RU) / числом (EN). */
export function categoriesWord(lang: Lang, n: number): string {
  if (lang === 'en') return n === 1 ? 'category' : 'categories'
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'категория'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'категории'
  return 'категорий'
}

/** Короткие названия дней недели (Пн…Вс / Mon…Sun). */
export function weekdaysShort(lang: Lang): string[] {
  return lang === 'ru'
    ? ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
}

/**
 * Синхронизирует локаль форматтера дат/денег (dayjs + суффикс «к»/«k») с
 * выбранным языком. Монтируется один раз в App рядом с useTheme/useAccent.
 */
export function useFormatLocale() {
  const lang = useStore((s) => s.lang)
  useEffect(() => {
    setFormatLocale(lang)
  }, [lang])
}
