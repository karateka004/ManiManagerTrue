import { useState } from 'react'
import type { ReactNode } from 'react'
import { m, AnimatePresence } from 'framer-motion'
import {
  X,
  BookOpen,
  Home,
  PlusCircle,
  LayoutGrid,
  PieChart,
  Target,
  Trophy,
  CheckCircle2,
  Users,
  Link2,
  Settings as SettingsIcon,
  Lock,
} from 'lucide-react'
import { hapticSelect } from '../lib/telegram'
import { useStore } from '../store/transactions'
import type { Lang } from '../lib/i18n'

interface Props {
  open: boolean
  onClose: () => void
}

interface GuideSection {
  id: string
  icon: ReactNode
  title: string
  items: string[]
}

const GUIDE: Record<Lang, { title: string; subtitle: string; sections: GuideSection[] }> = {
  ru: {
    title: 'Гайд по приложению',
    subtitle: 'Все функции и как ими пользоваться',
    sections: [
      {
        id: 'home',
        icon: <Home size={18} strokeWidth={2.2} />,
        title: 'Главная',
        items: [
          'Карточка баланса показывает доходы, расходы и итог за выбранный период.',
          'Переключатель периода сверху: день, неделя, месяц, год, всё время.',
          'Если операции в разных валютах — баланс автоматически разбивается по валютам.',
          'Кнопки «+» и «−» внизу справа — добавить доход или расход.',
          'Аватар в правом верхнем углу открывает профиль.',
          'В шапке можно показывать дату или прогресс к накопительной цели (выбор — в Настройках). Если целей несколько, листай их свайпом.',
        ],
      },
      {
        id: 'add',
        icon: <PlusCircle size={18} strokeWidth={2.2} />,
        title: 'Добавление операции',
        items: [
          'Нажми «+» (доход) или «−» (расход) на Главной.',
          'Введи сумму и выбери категорию.',
          'Чип валюты рядом с суммой — каждая операция хранит свою валюту (₴, €, $ …).',
          'Можно указать дату задним числом — приложение само наведёт период на эту дату, чтобы запись не «пропала».',
        ],
      },
      {
        id: 'cats',
        icon: <LayoutGrid size={18} strokeWidth={2.2} />,
        title: 'Категории и счета',
        items: [
          'Список категорий на Главной — сумма по каждой за период, в валюте операций.',
          'Тап по категории раскрывает её операции.',
          'Счёт = валюта. Если есть операции в нескольких валютах, вверху появляется переключатель «Все / валюты».',
          'Выбор счёта фильтрует баланс, категории, бюджеты и диаграммы — показывает одну валюту.',
          'Свои категории добавляются и редактируются в Настройках.',
        ],
      },
      {
        id: 'analytics',
        icon: <PieChart size={18} strokeWidth={2.2} />,
        title: 'Аналитика и графики',
        items: [
          'Три вкладки: Расходы, Доходы, Календарь.',
          'Диаграмма-пончик показывает доли категорий. Стиль (компактный / с иконками) настраивается.',
          'Календарь: под каждым днём — итог, с фильтром доход / расход / чистый итог, внизу — сумма за месяц.',
          'Отдельная вкладка «Графики» — динамика по периодам.',
        ],
      },
      {
        id: 'planning',
        icon: <Target size={18} strokeWidth={2.2} />,
        title: 'Планирование',
        items: [
          'Открывается кнопкой «Планирование» в профиле.',
          'Бюджет — общий месячный лимит и прогресс расхода за текущий месяц.',
          'Лимиты — лимит на каждую категорию, с предупреждением при превышении.',
          'Цели — накопительные цели со своей валютой и иконкой.',
          'Цель можно синхронизировать с балансом: тогда «накоплено» считается автоматически из доходов/расходов.',
        ],
      },
      {
        id: 'profile',
        icon: <Trophy size={18} strokeWidth={2.2} />,
        title: 'Профиль и достижения',
        items: [
          'Уровень и XP растут за добавленные операции.',
          'Монеты зарабатываются за ежедневную серию и задания, тратятся в магазине наград.',
          'Ежедневная серия: заходи каждый день, держи стрик и забирай награду.',
          'Достижения — магазин косметики: палитры (перекрашивают приложение), титулы и рамки аватара.',
        ],
      },
      {
        id: 'quests',
        icon: <CheckCircle2 size={18} strokeWidth={2.2} />,
        title: 'Задания',
        items: [
          'Задания про само приложение: загляни в Аналитику, переключи период, создай категорию, поставь цель.',
          'За выполнение — XP и монеты, награда забирается кнопкой.',
          'Через 3 часа после получения задание исчезает, и открывается новое — список всегда свежий.',
        ],
      },
      {
        id: 'leaderboard',
        icon: <Users size={18} strokeWidth={2.2} />,
        title: 'Таблица лидеров',
        items: [
          'Рейтинг участников: по XP и по числу приглашённых друзей (переключатель).',
          'Статистика привязана к твоему Telegram-аккаунту.',
          'В рейтинг уходит только геймификация — суммы доходов и расходов остаются приватными.',
        ],
      },
      {
        id: 'referrals',
        icon: <Link2 size={18} strokeWidth={2.2} />,
        title: 'Рефералы',
        items: [
          'В профиле есть реферальная ссылка-приглашение.',
          'За друзей, присоединившихся по ссылке, начисляются награды.',
          'Там же виден список тех, кто уже присоединился.',
        ],
      },
      {
        id: 'settings',
        icon: <SettingsIcon size={18} strokeWidth={2.2} />,
        title: 'Настройки',
        items: [
          'Язык (русский / английский) и валюта по умолчанию.',
          'Тема: авто, светлая или тёмная.',
          'Стиль диаграммы, шапка Главной (дата / цель), лимиты по категориям, свои категории.',
          'Демо-режим: пример данных за 2 года — твои реальные операции при этом не меняются.',
          '«Очистить всё» удаляет все данные — действие необратимо.',
        ],
      },
      {
        id: 'privacy',
        icon: <Lock size={18} strokeWidth={2.2} />,
        title: 'Приватность',
        items: [
          'Все операции хранятся только в твоём браузере на устройстве.',
          'Сервер их не видит — он нужен лишь для отзывов, рефералов и таблицы лидеров.',
        ],
      },
    ],
  },
  en: {
    title: 'App guide',
    subtitle: 'All features and how to use them',
    sections: [
      {
        id: 'home',
        icon: <Home size={18} strokeWidth={2.2} />,
        title: 'Home',
        items: [
          'The balance card shows income, expenses and the total for the selected period.',
          'Period switcher on top: day, week, month, year, all time.',
          'If operations use different currencies, the balance is split by currency automatically.',
          'The “+” and “−” buttons (bottom right) add an income or an expense.',
          'The avatar in the top right opens your profile.',
          'The header can show the date or progress towards a savings goal (set in Settings). Swipe to switch between several goals.',
        ],
      },
      {
        id: 'add',
        icon: <PlusCircle size={18} strokeWidth={2.2} />,
        title: 'Adding an operation',
        items: [
          'Tap “+” (income) or “−” (expense) on Home.',
          'Enter the amount and pick a category.',
          'The currency chip next to the amount — each operation keeps its own currency (₴, €, $ …).',
          'You can set a past date — the app focuses the period on that date so the entry doesn’t disappear.',
        ],
      },
      {
        id: 'cats',
        icon: <LayoutGrid size={18} strokeWidth={2.2} />,
        title: 'Categories & accounts',
        items: [
          'The category list on Home shows the total per category for the period, in the operation’s currency.',
          'Tap a category to expand its operations.',
          'An account = a currency. If you have operations in several currencies, an “All / currencies” switcher appears on top.',
          'Selecting an account filters the balance, categories, budgets and charts to a single currency.',
          'Custom categories are added and edited in Settings.',
        ],
      },
      {
        id: 'analytics',
        icon: <PieChart size={18} strokeWidth={2.2} />,
        title: 'Analytics & charts',
        items: [
          'Three tabs: Expenses, Income, Calendar.',
          'The donut chart shows category shares. The style (compact / with icons) is configurable.',
          'Calendar: each day shows its total, with an income / expense / net filter, and the monthly sum at the bottom.',
          'A separate “Charts” tab shows trends across periods.',
        ],
      },
      {
        id: 'planning',
        icon: <Target size={18} strokeWidth={2.2} />,
        title: 'Planning',
        items: [
          'Opened with the “Planning” button in the profile.',
          'Budget — a total monthly limit and this month’s spending progress.',
          'Limits — a limit per category, with a warning when exceeded.',
          'Goals — savings goals with their own currency and icon.',
          'A goal can be synced with the balance: then “saved” is calculated automatically from income/expenses.',
        ],
      },
      {
        id: 'profile',
        icon: <Trophy size={18} strokeWidth={2.2} />,
        title: 'Profile & achievements',
        items: [
          'Level and XP grow with the operations you add.',
          'Coins are earned via the daily streak and quests, and spent in the rewards shop.',
          'Daily streak: open the app every day, keep the streak and claim the reward.',
          'Achievements — a cosmetics shop: palettes (recolor the app), titles and avatar frames.',
        ],
      },
      {
        id: 'quests',
        icon: <CheckCircle2 size={18} strokeWidth={2.2} />,
        title: 'Quests',
        items: [
          'Quests are about the app itself: open Analytics, switch the period, create a category, set a goal.',
          'Completing them gives XP and coins, claimed with a button.',
          '3 hours after claiming, a quest disappears and a new one opens — the list always stays fresh.',
        ],
      },
      {
        id: 'leaderboard',
        icon: <Users size={18} strokeWidth={2.2} />,
        title: 'Leaderboard',
        items: [
          'A ranking of members: by XP and by the number of invited friends (toggle).',
          'Stats are tied to your Telegram account.',
          'Only gamification goes into the ranking — income and expense amounts stay private.',
        ],
      },
      {
        id: 'referrals',
        icon: <Link2 size={18} strokeWidth={2.2} />,
        title: 'Referrals',
        items: [
          'Your profile has a referral invite link.',
          'You get rewards for friends who join via your link.',
          'The list of people who already joined is shown there too.',
        ],
      },
      {
        id: 'settings',
        icon: <SettingsIcon size={18} strokeWidth={2.2} />,
        title: 'Settings',
        items: [
          'Language (Russian / English) and the default currency.',
          'Theme: auto, light or dark.',
          'Chart style, Home header (date / goal), per-category limits, custom categories.',
          'Demo mode: sample data for 2 years — your real operations are not affected.',
          '“Clear all” deletes all data — this cannot be undone.',
        ],
      },
      {
        id: 'privacy',
        icon: <Lock size={18} strokeWidth={2.2} />,
        title: 'Privacy',
        items: [
          'All operations are stored only in your browser on your device.',
          'The server never sees them — it is used only for feedback, referrals and the leaderboard.',
        ],
      },
    ],
  },
}

export function GuideSheet({ open, onClose }: Props) {
  const lang = useStore((s) => s.lang)
  const guide = GUIDE[lang] ?? GUIDE.ru
  // По умолчанию открыта первая секция.
  const [openId, setOpenId] = useState<string | null>(guide.sections[0]?.id ?? null)

  const toggle = (id: string) => {
    hapticSelect()
    setOpenId((cur) => (cur === id ? null : id))
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          />
          <m.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92vh] flex-col rounded-t-5xl bg-surface-raised shadow-raised"
            style={{ paddingBottom: 'var(--safe-bottom)' }}
          >
            <div className="flex justify-center pb-1 pt-3">
              <div className="h-1.5 w-12 rounded-full bg-surface-sunken" />
            </div>

            <div className="flex items-center justify-between px-6 pb-3 pt-1">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                  <BookOpen size={20} strokeWidth={2} />
                </span>
                <div className="leading-tight">
                  <div className="text-base font-bold text-ink">{guide.title}</div>
                  <div className="text-[11px] text-ink-subtle">{guide.subtitle}</div>
                </div>
              </div>
              <button onClick={onClose} className="text-ink-subtle active:text-ink-muted" aria-label="✕">
                <X size={22} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
              <div className="flex flex-col gap-2">
                {guide.sections.map((s) => {
                  const isOpen = openId === s.id
                  return (
                    <div key={s.id} className="card overflow-hidden">
                      <button
                        onClick={() => toggle(s.id)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-sunken/40"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-300">
                          {s.icon}
                        </span>
                        <span className="flex-1 text-sm font-bold text-ink">{s.title}</span>
                        <m.span animate={{ rotate: isOpen ? 180 : 0 }} className="shrink-0 text-ink-subtle">
                          ⌄
                        </m.span>
                      </button>

                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <m.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                            className="overflow-hidden"
                          >
                            <ul className="flex flex-col gap-2 px-4 pb-4 pt-1">
                              {s.items.map((item, i) => (
                                <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-ink-muted">
                                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500/60" />
                                  <span>{item}</span>
                                </li>
                              ))}
                            </ul>
                          </m.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )
                })}
              </div>
            </div>
          </m.div>
        </>
      )}
    </AnimatePresence>
  )
}
