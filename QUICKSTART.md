# 🚀 Быстрый запуск «Кошеля»

Гид от полной чистого Windows до открытия Mini App внутри Telegram.

---

## Часть 1. Локальный запуск (5 минут)

### Шаг 1. Установить Node.js (один раз на компьютер)

На этом компьютере **Node.js пока не установлен** (проверено).

1. Зайди на <https://nodejs.org/> → скачай кнопку **LTS** (зелёная, слева).
2. Запусти установщик. На шаге *Custom Setup* убедись, что галочка **«Add to PATH»** включена (по умолчанию так и есть).
3. Дойди до конца → *Finish*.
4. **Закрой и снова открой PowerShell** (иначе он не увидит обновлённый PATH).
5. Проверь:
   ```powershell
   node --version
   npm --version
   ```
   Должны напечатать версии (например, `v20.18.0`).

### Шаг 2. Запустить проект

В PowerShell перейди в папку проекта и запусти скрипт:

```powershell
cd "C:\Users\User\Desktop\finance-mini-app"
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

Скрипт сам:
- проверит Node,
- поставит зависимости (`npm install`) при первом запуске,
- запустит Vite dev-сервер,
- откроет <http://localhost:5173> в браузере.

> Альтернатива без скрипта — вручную:
> ```powershell
> npm install
> npm run dev
> ```

В браузере приложение работает «как есть» — Telegram SDK gracefully фолбэчится.
Тёмная тема следует за `prefers-color-scheme` системы. Переключатель — в Настройках.

**Остановить:** `Ctrl+C` в окне PowerShell.

---

## Часть 2. Открыть Mini App внутри Telegram

Telegram требует **HTTPS-URL**, у `localhost` его нет. Нужен туннель.

### Вариант A. Cloudflare Tunnel (рекомендую — бесплатно, без регистрации)

1. Скачай `cloudflared.exe` для Windows:
   <https://github.com/cloudflare/cloudflared/releases/latest>
   Файл называется `cloudflared-windows-amd64.exe`. Положи рядом с проектом
   и переименуй в `cloudflared.exe`.

2. В **отдельном** окне PowerShell (пока `start.ps1` работает):

   ```powershell
   cd "C:\Users\User\Desktop\finance-mini-app"
   .\cloudflared.exe tunnel --url http://localhost:5173
   ```

3. В выводе появится строка вида:

   ```
   https://something-random-words.trycloudflare.com
   ```

   Это твой временный публичный HTTPS-адрес. Скопируй.

### Вариант B. ngrok

1. Зарегистрируйся на <https://ngrok.com/>, поставь клиент, добавь токен.
2. Запусти: `ngrok http 5173` → получишь URL `https://xxxx.ngrok-free.app`.

### Вариант C. Деплой на Vercel (постоянный URL)

1. `git init`, закоммить, запушь в GitHub.
2. На <https://vercel.com> → *Import Project* → выбери репозиторий →
   Framework Vite определится автоматически → *Deploy*.
3. Получишь постоянный URL `https://your-app.vercel.app`.

### Шаг 3. Привязать к боту через BotFather

1. Открой <https://t.me/BotFather>.
2. Если бота ещё нет:
   - `/newbot`
   - Введи имя (например: «Кошель Тест»).
   - Введи username, заканчивающийся на `_bot` (например: `koshel_test_bot`).
   - Сохрани токен — пока он не нужен.
3. Создай Mini App:
   - `/newapp` → выбери бота из списка.
   - Title: `Кошель`.
   - Description: «Учёт расходов и доходов».
   - Photo: 640×360 PNG (любая, потом заменишь).
   - Demo GIF: можно пропустить (отправь `/empty`).
   - **Web App URL:** вставь HTTPS-URL из туннеля или Vercel.
   - Short name: `koshel` (латиница, попадёт в ссылку).
4. BotFather выдаст ссылку вида `t.me/koshel_test_bot/koshel`.
5. Открой её в Telegram — увидишь Mini App.

### Сделать кнопку Mini App в чате бота

Чтобы пользователи нажимали «Открыть приложение» прямо в чате:

1. У BotFather: `/mybots` → выбери бота → **Bot Settings** → **Menu Button**.
2. **Configure Menu Button** → введи название кнопки («Открыть Кошель»)
   и URL Mini App (тот же HTTPS).

---

## Что обновлять, когда URL туннеля меняется

Cloudflare и ngrok выдают **новый** URL при каждом перезапуске.
Каждый раз нужно у BotFather:

- `/myapps` → выбери приложение → **Edit Web App URL** → вставь новый.

Для постоянного адреса — Vercel.

---

## Траблшутинг

| Симптом                                                    | Что делать                                                              |
| ---------------------------------------------------------- | ----------------------------------------------------------------------- |
| `node : The term 'node' is not recognized…`                | Не перезапустил PowerShell после установки Node.                        |
| `npm install` падает с ETIMEDOUT                           | Проверь интернет / прокси. Запусти ещё раз: `npm install`.              |
| Telegram открывает белый экран                             | HTTPS-URL у BotFather неактуален. Поменяй на новый из cloudflared.      |
| Тёмная тема не подхватывается из Telegram                  | Проверь, что в Settings выбрано «Авто». В iOS Telegram — закрой и снова открой Mini App. |
| Хочу остановить тоннель                                    | `Ctrl+C` в окне `cloudflared`.                                          |
| Хочу остановить dev-сервер                                 | `Ctrl+C` в окне PowerShell со `start.ps1`.                              |

---

## Что внутри

- React 18 + TypeScript + Vite (см. [README.md](README.md)).
- Кастомные SVG-иконки категорий, бюджеты, светлая/тёмная тема, donut-чарт
  с иконками вокруг (стиль Monefy).
- Данные хранятся локально (`localStorage`). Между устройствами не синхронизируются —
  это можно прикрутить через Supabase, шаблон промта есть в [PROMPTS.md](PROMPTS.md).

Удачи! 💚
