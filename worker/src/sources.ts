/**
 * Откуда пришёл человек — метка рекламной ссылки.
 *
 * Без метки после рассылки видно только, что людей стало больше, но не видно,
 * какая реклама их привела и дошли ли они до первой операции. С меткой каждая
 * ссылка считается отдельно: пришло, записали, вернулись.
 *
 * Метку несут два вида ссылок:
 *   t.me/<бот>?start=<метка>     — открывает чат с ботом, человек жмёт «Старт»;
 *   t.me/<бот>?startapp=<метка>  — открывает приложение сразу (нужно включённое
 *                                  Main Mini App в BotFather).
 * Первая доходит до нас текстом «/start <метка>», вторая — полем start_param в
 * подписанном initData. Учитываем ПЕРВОЕ касание: метка ставится один раз, и
 * старый пользователь, нажавший на рекламу, не записывается в её улов.
 *
 * Приглашения друзей (`ref<id>`) метками не считаются — у них свой учёт
 * (`claimed:<id>`), и в дашборде они идут отдельной строкой.
 */
import type { Env } from './env'

export const SRC_PREFIX = 'src:'

/** Метаданные ключа `src:<id>` — их отдаёт `list`, значение не читаем. */
export interface SourceMeta {
  /** Метка. */
  s: string
  /** Когда нажал «Старт», epoch ms. */
  at: number
  /** Имя и ник из Telegram — чтобы человека было видно в дашборде до первого входа в приложение. */
  n?: string
  u?: string
}

/**
 * Метка из start-параметра или null, если это не рекламная метка.
 * Разрешены латиница, цифры, «_» и «-» — ровно то, что Telegram пропускает в
 * start-параметре; регистр сводим к нижнему, чтобы «Ads1» и «ads1» не стали
 * двумя источниками.
 */
export function campaignTag(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim()
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(v)) return null
  if (/^ref\d+$/i.test(v)) return null
  return v.toLowerCase()
}

/** start_param из подписанной строки initData (подпись проверяется отдельно). */
export function startParamOf(initData: string): string | null {
  try {
    return new URLSearchParams(initData).get('start_param')
  } catch {
    return null
  }
}

/**
 * Запомнить метку человека, пришедшего через «/start <метка>».
 *
 * Пишем только если метки ещё нет: первое касание важнее последнего. Это одно
 * чтение и не больше одной записи на человека за всё время — «/start» с меткой
 * нажимают однажды.
 */
export async function rememberSource(
  env: Env,
  user: { id: number; first_name?: string; last_name?: string; username?: string },
  tag: string,
  now: number,
): Promise<void> {
  const key = `${SRC_PREFIX}${user.id}`
  if ((await env.REFERRALS.get(key)) !== null) return
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ').slice(0, 64)
  const meta: SourceMeta = { s: tag, at: now }
  if (name) meta.n = name
  if (user.username) meta.u = user.username.slice(0, 32)
  await env.REFERRALS.put(key, tag, { metadata: meta })
}
