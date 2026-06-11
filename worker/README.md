# Кошель — Worker (бэкенд для бота)

Маленький бесплатный сервер на Cloudflare Workers. Нужен, чтобы:

- отзывы из приложения автоматически приходили тебе в ЛС бота;
- считались реферальные приглашения.

Токен бота хранится только здесь (в секретах Cloudflare), в само приложение он
не попадает.

## Что понадобится

1. Аккаунт на https://dash.cloudflare.com (бесплатный).
2. Токен бота `@TrueManiManager_Bot` из @BotFather.

> Твой `chat_id` (439944083) уже прописан в `wrangler.toml` → `OWNER_CHAT_ID`.
> Если меняешь получателя отзывов — поправь это значение там.

## Установка (один раз)

```bash
cd worker
npm install
npx wrangler login          # откроется браузер, авторизуйся в Cloudflare
```

### Создать KV для рефералов

```bash
npx wrangler kv namespace create REFERRALS
```

Команда выведет строку вида `id = "abcd1234..."`. Скопируй этот id в
`wrangler.toml` вместо `PUT_YOUR_KV_NAMESPACE_ID_HERE`.

### Заложить секрет (токен бота)

```bash
npx wrangler secret put BOT_TOKEN
# вставь токен бота из BotFather, Enter
```

(`OWNER_CHAT_ID` уже в `wrangler.toml` — отдельно задавать не нужно.)

## Деплой

```bash
npx wrangler deploy
```

В конце получишь URL вида:

```
https://koshel-worker.<твой-субдомен>.workers.dev
```

Скопируй его и вставь в приложении: файл `src/lib/api.ts`, константа
`WORKER_URL`. Затем пересобери и задеплой фронт (`npm run deploy` в корне).

## Проверка

Открой `https://koshel-worker.<...>.workers.dev/` в браузере — должно вернуться
`{"ok":true,"service":"koshel-worker"}`.

Логи в реальном времени: `npx wrangler tail`.

## Эндпоинты

| Метод | Путь        | Тело / параметры                  | Назначение                          |
|-------|-------------|-----------------------------------|-------------------------------------|
| POST  | `/feedback` | `{ initData, text }`              | Отзыв → тебе в ЛС                    |
| POST  | `/referral` | `{ initData, ref }`               | Засчитать приглашение               |
| GET   | `/stats`    | `?initData=...`                   | Сколько людей пригласил пользователь|

Все запросы проверяют подпись `initData` ботовым токеном — подделать нельзя.
