/**
 * Тонкая обёртка над Telegram Bot API.
 *
 * Раньше жила прямо в index.ts, но с приёмом сообщений вызовов стало больше
 * (правка сообщения, ответ на нажатие кнопки, регистрация вебхука), и держать
 * их в файле с маршрутами больше нечестно.
 */
import type { Env } from './env'

/* ------------------------------------------------------------------ */
/* Типы входящих обновлений                                            */
/* ------------------------------------------------------------------ */
/*
 * Описаны только те поля, которые мы читаем. Всё остальное Telegram присылает
 * и дальше, но типизировать целиком его Update незачем: чем уже поверхность,
 * тем меньше поводов поверить полю, которое мы не проверяли.
 */

export interface TgChat {
  id: number
  /** 'private' | 'group' | 'supergroup' | 'channel' */
  type?: string
}

export interface TgFrom {
  id: number
  first_name?: string
  last_name?: string
  username?: string
  is_bot?: boolean
}

export interface TgMessage {
  message_id: number
  chat: TgChat
  from?: TgFrom
  text?: string
  /** Непустое поле = сообщение не текстовое (голос, фото, документ и т.п.). */
  voice?: unknown
  audio?: unknown
  photo?: unknown[]
  document?: unknown
  video_note?: unknown
}

export interface TgCallbackQuery {
  id: string
  from: TgFrom
  data?: string
  message?: TgMessage
}

export interface TgUpdate {
  update_id?: number
  message?: TgMessage
  callback_query?: TgCallbackQuery
}

/* ------------------------------------------------------------------ */
/* Вызовы                                                              */
/* ------------------------------------------------------------------ */

/** Сырой вызов метода Bot API. Сеть не бросает наружу: бот не должен падать из-за Telegram. */
async function call(env: Env, method: string, payload: unknown): Promise<{ ok: boolean; status: number; body: unknown }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN.trim()}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = await res.json().catch(() => null)
    return { ok: res.ok, status: res.status, body }
  } catch {
    return { ok: false, status: 0, body: null }
  }
}

/**
 * Шлёт сообщение от бота. `replyMarkup` — опциональная inline-клавиатура.
 * Возвращает `{ ok, status }`: status=403 означает, что бот заблокирован
 * пользователем (или аккаунт удалён) — вызывающий может отписать его.
 */
export async function sendMessage(
  env: Env,
  chatId: string | number,
  text: string,
  replyMarkup?: unknown,
): Promise<{ ok: boolean; status: number }> {
  const r = await call(env, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  })
  return { ok: r.ok, status: r.status }
}

/**
 * Переписать уже отправленное сообщение. Нужно для «Отменить»: вместо второго
 * сообщения «отменено» правим первое — в чате не остаётся следа от записи,
 * которой человек передумал.
 */
export async function editMessageText(
  env: Env,
  chatId: string | number,
  messageId: number,
  text: string,
  replyMarkup?: unknown,
): Promise<boolean> {
  const r = await call(env, 'editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    // Пустой reply_markup снимает клавиатуру: кнопку «Отменить» после отмены
    // нажимать уже не на что.
    reply_markup: replyMarkup ?? { inline_keyboard: [] },
  })
  return r.ok
}

/**
 * Ответ на нажатие inline-кнопки. Обязателен: пока он не пришёл, Telegram
 * крутит часики на кнопке до таймаута. `alert` — показать текст всплывашкой,
 * а не строкой вверху экрана.
 */
export async function answerCallback(env: Env, id: string, text?: string, alert = false): Promise<void> {
  await call(env, 'answerCallbackQuery', {
    callback_query_id: id,
    ...(text ? { text: text.slice(0, 200), show_alert: alert } : {}),
  })
}

/**
 * Показать «печатает…» в чате.
 *
 * Разбор сообщения занимает около секунды, а иногда до пяти. Без этой пометки
 * чат в это время выглядит мёртвым, и человек успевает написать второй раз.
 * Ответа не ждём: если не дойдёт — не страшно, это украшение, а не запись.
 */
export function sendTyping(env: Env, chatId: string | number): Promise<unknown> {
  return call(env, 'sendChatAction', { chat_id: chatId, action: 'typing' })
}

/** Зарегистрировать вебхук. `secret` придёт назад в заголовке каждого обновления. */
export async function setWebhook(
  env: Env,
  url: string,
  secret: string,
  dropPending: boolean,
): Promise<{ ok: boolean; body: unknown }> {
  const r = await call(env, 'setWebhook', {
    url,
    secret_token: secret,
    // Ничего, кроме сообщений и нажатий кнопок, нам не нужно: каждый лишний тип
    // обновления — это вызов воркера, за который мы платим впустую.
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: dropPending,
  })
  return { ok: r.ok, body: r.body }
}

/** Что Telegram думает про наш вебхук (адрес, очередь, последняя ошибка). */
export async function getWebhookInfo(env: Env): Promise<unknown> {
  const r = await call(env, 'getWebhookInfo', {})
  return r.body
}

/**
 * Список команд для синей кнопки «Меню» рядом с полем ввода.
 *
 * Без него человек должен догадаться, что боту можно писать «/help», — а
 * догадываться он не станет. Команд намеренно мало: главный способ говорить с
 * ботом — обычные слова, а не команды.
 */
export async function setMyCommands(env: Env, commands: { command: string; description: string }[]): Promise<boolean> {
  const r = await call(env, 'setMyCommands', { commands, scope: { type: 'all_private_chats' } })
  return r.ok
}

/**
 * Кнопка-меню слева от поля ввода. По умолчанию она показывает список команд;
 * делаем её входом в приложение — это единственное место в чате, где вход в
 * Кошель виден всегда, и не приходится вешать кнопку под каждым ответом.
 */
export async function setChatMenuButton(env: Env, text: string, url: string): Promise<boolean> {
  const r = await call(env, 'setChatMenuButton', {
    menu_button: { type: 'web_app', text, web_app: { url } },
  })
  return r.ok
}

/** Экранирование для parse_mode: 'HTML'. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
