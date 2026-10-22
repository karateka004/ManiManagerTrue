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
  /** Язык Telegram — запасной язык ответа, если приложение ни разу не открывали. */
  language_code?: string
}

/** Файл в сообщении: голос, фото, документ. */
export interface TgFile {
  file_id?: string
  file_size?: number
  mime_type?: string
}

export interface TgMessage {
  message_id: number
  chat: TgChat
  from?: TgFrom
  text?: string
  /** Разметка текста — нужна только ради кастомных эмодзи в команде /icons. */
  entities?: { type: string; offset: number; length: number; custom_emoji_id?: string }[]
  /**
   * Клавиатура под сообщением бота — приходит вместе с нажатием кнопки. Из неё
   * берём текст кнопки-продолжения: хранить вопросы у себя не нужно.
   */
  reply_markup?: { inline_keyboard?: { text?: string; callback_data?: string }[][] }
  /** Непустое поле = сообщение не текстовое (голос, фото, документ и т.п.). */
  voice?: TgFile & { duration?: number }
  audio?: TgFile & { duration?: number }
  photo?: (TgFile & { width?: number; height?: number })[]
  document?: TgFile & { file_name?: string }
  video_note?: TgFile & { duration?: number }
  /** Подпись к фото или файлу. */
  caption?: string
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

/** Скачать присланный файл (до `maxBytes`). `null` — не вышло или файл больше. */
export async function downloadFile(env: Env, fileId: string, maxBytes: number): Promise<ArrayBuffer | null> {
  const r = await call(env, 'getFile', { file_id: fileId })
  const path = (r.body as { result?: { file_path?: string; file_size?: number } } | null)?.result
  if (!r.ok || !path?.file_path || (path.file_size ?? 0) > maxBytes) return null
  try {
    const res = await fetch(`https://api.telegram.org/file/bot${env.BOT_TOKEN.trim()}/${path.file_path}`)
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    return buf.byteLength > maxBytes ? null : buf
  } catch {
    return null
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
  /** Без звука: сообщение придёт, но телефон не зазвенит (ночная сводка). */
  silent?: boolean,
): Promise<{ ok: boolean; status: number; description?: string }> {
  const r = await call(env, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    ...(silent ? { disable_notification: true } : {}),
  })
  // Причина отказа: 403 бывает и «заблокировал», и «не нажимал Start».
  const description = (r.body as { description?: unknown } | null)?.description
  return { ok: r.ok, status: r.status, ...(typeof description === 'string' ? { description } : {}) }
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
 * Сменить только клавиатуру под сообщением. Выбор категории раньше шёл через
 * editMessageText с простым текстом сообщения — и жирный заголовок записи на
 * это время пропадал.
 */
export async function editMessageReplyMarkup(
  env: Env,
  chatId: string | number,
  messageId: number,
  replyMarkup: unknown,
): Promise<boolean> {
  const r = await call(env, 'editMessageReplyMarkup', { chat_id: chatId, message_id: messageId, reply_markup: replyMarkup })
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
 * Отправить файл байтами (multipart): анимацию или документ. По ссылке Telegram
 * берёт файл не всегда — тип он смотрит по заголовкам чужого хранилища.
 * `asIs` — документ остаётся файлом: иначе .gif Telegram сам превратит в анимацию.
 */
export async function sendFile(
  env: Env,
  chatId: string | number,
  kind: 'animation' | 'document',
  file: Blob,
  filename: string,
  caption?: string,
  asIs = false,
): Promise<boolean> {
  const form = new FormData()
  form.append('chat_id', String(chatId))
  form.append(kind, file, filename)
  if (caption) {
    form.append('caption', caption)
    form.append('parse_mode', 'HTML')
  }
  if (asIs) form.append('disable_content_type_detection', 'true')
  try {
    const method = kind === 'animation' ? 'sendAnimation' : 'sendDocument'
    const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN.trim()}/${method}`, { method: 'POST', body: form })
    if (!res.ok) console.error(`[tg] ${method} ${res.status} ${(await res.text()).slice(0, 200)}`)
    return res.ok
  } catch (e) {
    console.error('[tg] файл не отправлен', e)
    return false
  }
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

/**
 * Черновик ответа: с пустым текстом Telegram показывает в чате пузырь «Думает…»
 * (Bot API 10.0+). Живёт до 30 секунд или до нашего следующего сообщения.
 * Старые версии Telegram его просто не покажут — поэтому рядом всё равно
 * ставится «печатает…».
 */
export function sendMessageDraft(env: Env, chatId: number, draftId: number, text = ''): Promise<unknown> {
  return call(env, 'sendMessageDraft', { chat_id: chatId, draft_id: draftId, text })
}

/**
 * «Печатает…» на всё время ожидания. Статус держится пять секунд, а ответ на
 * вопрос может идти дольше — продлеваем каждые 4,5 с, пока не позовут stop().
 */
export function keepTyping(env: Env, chatId: number): () => void {
  void sendTyping(env, chatId)
  const timer = setInterval(() => void sendTyping(env, chatId), 4500)
  return () => clearInterval(timer)
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

/**
 * Описание бота — текст на пустом экране чата («Что умеет этот бот?»), который
 * человек видит ДО кнопки «Начать». Для пришедшего по рекламной ссылке это
 * первое, что он читает о Кошеле. До 512 символов, без разметки.
 */
export async function setMyDescription(env: Env, description: string): Promise<boolean> {
  const r = await call(env, 'setMyDescription', { description })
  return r.ok
}

/** Короткое описание — в профиле бота и в превью пересланной ссылки. До 120 символов. */
export async function setMyShortDescription(env: Env, shortDescription: string): Promise<boolean> {
  const r = await call(env, 'setMyShortDescription', { short_description: shortDescription })
  return r.ok
}

/** Экранирование для parse_mode: 'HTML'. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
