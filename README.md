# 💚 Кошель — Telegram Mini App для финансов

Стартер для Telegram Mini App в стиле **Monefy**: учёт доходов/расходов,
аналитика, графики. Готов к запуску локально и деплою на Vercel.

![Stack](https://img.shields.io/badge/Vite-React-blue) ![TS](https://img.shields.io/badge/TypeScript-5.6-blue) ![TG](https://img.shields.io/badge/Telegram-MiniApp-2CA5E0)

## Что внутри

- ⚛️ React 18 + TypeScript + Vite
- 🎨 Tailwind CSS с готовой Monefy-палитрой
- 🗄️ Zustand store + localStorage (persist)
- 📊 Кастомный донат-чарт + бары на SVG
- ✨ Анимации через framer-motion
- 📱 Интеграция с Telegram WebApp: тема, haptic feedback, MainButton
- 💾 Демо-данные одной кнопкой

## Быстрый старт

```bash
# 1. Установить зависимости
npm install

# 2. Запустить dev-сервер
npm run dev
```

Откроется на `http://localhost:5173`. В обычном браузере приложение работает
полностью — Telegram SDK gracefully фолбэчится.

## Деплой и привязка к Telegram

### Шаг 1. Создать бота

1. Открой [@BotFather](https://t.me/BotFather) в Telegram
2. `/newbot` → задай имя и username
3. Сохрани токен (понадобится позже, если будешь делать бэкенд)

### Шаг 2. Привязать Mini App

Пока приложение запущено локально, нужен HTTPS-туннель:

```bash
# Если у тебя есть ngrok
ngrok http 5173
```

Получишь URL вида `https://abc123.ngrok-free.app`.

В @BotFather:
1. `/newapp` → выбери бота
2. Введи название, описание, картинку 640×360
3. Вставь ngrok URL
4. Готово — открой бота в Telegram, увидишь кнопку запуска

### Шаг 3. Прод-деплой на Vercel

```bash
git init && git add . && git commit -m "init"
# создай репо на github.com и:
git remote add origin <твой-репо>
git push -u origin main
```

На [vercel.com](https://vercel.com):
1. **Import Project** → выбери репо
2. Framework: Vite (определится автоматически)
3. **Deploy** → получишь URL `https://your-app.vercel.app`
4. В @BotFather: `/myapps` → твой app → **Edit Web App URL** → вставь Vercel URL

## Структура

```
src/
├── lib/
│   ├── telegram.ts        # SDK wrapper, haptic, theme
│   └── format.ts          # Money & date formatters (ru-RU)
├── store/
│   ├── categories.ts      # Категории с цветами и эмодзи
│   └── transactions.ts    # Zustand store + селекторы
├── components/
│   ├── BalanceCard.tsx       # Зелёная карточка баланса
│   ├── MonthSwitcher.tsx     # Переключатель месяцев
│   ├── CategoryList.tsx      # Список с раскрытием
│   ├── FabButtons.tsx        # Кнопки + / −
│   ├── DonutChart.tsx        # Кольцевая диаграмма
│   ├── AnalyticsTabs.tsx     # Расходы / Доходы
│   ├── AddTransactionSheet.tsx # BottomSheet с numpad
│   └── TabBar.tsx            # Нижняя навигация
└── pages/
    ├── Home.tsx
    ├── Analytics.tsx
    └── Settings.tsx
```

## Дизайн-токены (в `tailwind.config.js`)

| Token              | Hex       | Использование                |
| ------------------ | --------- | ---------------------------- |
| `brand.500`        | `#3CA37B` | Основной зелёный             |
| `brand.100`        | `#DCF2E5` | Светло-зелёный фон           |
| `expense.DEFAULT`  | `#E97373` | Красный для расходов         |
| `income.DEFAULT`   | `#3CA37B` | Зелёный для доходов          |
| `surface.raised`   | `#FFFFFF` | Карточки                     |
| `ink.DEFAULT`      | `#0F1A14` | Основной текст               |
| `ink.subtle`       | `#8A968F` | Подписи                      |

Шрифт: **Manrope** (Google Fonts).

## Что дальше

Открой `PROMPTS.md` — там готовые промты для Claude Code, чтобы:
- заменить эмодзи на кастомные SVG-иконки в стиле Monefy
- добавить экспорт в CSV
- подключить бэкенд (Supabase) для синхронизации между устройствами
- добавить бюджеты и цели
- сделать диаграмму с иконками вокруг (как на твоём референсе)

## Поддержка тёмной темы

Telegram передаёт `colorScheme` и `themeParams`. Сейчас приложение использует
свою фирменную светлую палитру независимо от темы пользователя. Если хочешь
поддержать тёмный режим — попроси Claude Code:

> Добавь dark mode через Tailwind `dark:` классы. Слушай tg.colorScheme
> и применяй класс `dark` к html. Сохрани зелёный как акцент, тёмные surface
> сделай в гамме `#0F1A14` → `#1D2924`.

---

Сделано с 💚 для Telegram. Кастомизируй смело — это твой стартер.
