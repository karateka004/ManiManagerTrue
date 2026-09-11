/**
 * Окружение воркера: биндинги и секреты.
 *
 * Вынесено из index.ts отдельным модулем, потому что типом теперь пользуются
 * несколько файлов (бот, входящие, разбор сообщений). Импортировать тип из
 * точки входа значило бы завернуть зависимости в кольцо: index → bot → index.
 */
export interface Env {
  BOT_TOKEN: string
  OWNER_CHAT_ID: string
  REFERRALS: KVNamespace
  /** Через запятую: разрешённые Origin (по умолчанию *). */
  ALLOWED_ORIGINS?: string
  /** Режим ежедневной рассылки напоминаний: 'off' | 'owner' | 'all' (по умолчанию 'off'). */
  REMINDERS_MODE?: string
  /** Секрет для owner-only ручных ручек (/admin/test, /admin/webhook). */
  ADMIN_KEY?: string
  /**
   * Секрет вебхука. Telegram присылает его в заголовке
   * `X-Telegram-Bot-Api-Secret-Token`, если он был передан в setWebhook.
   * Пусто — вебхук закрыт наглухо: принимать сообщения «от кого угодно» нельзя.
   */
  TG_WEBHOOK_SECRET?: string
  /**
   * Ключ Gemini. Пусто — сообщения разбираются правилами (src/entry.ts).
   * Это не аварийный режим, а рабочий: правила понимают типовые формулировки
   * и не стоят ни денег, ни задержки на поход в чужую сеть.
   */
  GEMINI_API_KEY?: string
  /** Модель Gemini. Пусто — DEFAULT_MODEL из src/gemini.ts. */
  GEMINI_MODEL?: string
}
