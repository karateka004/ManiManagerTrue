/**
 * Промо-ролик обновления — владельцу в личку, чтобы переслать или поставить на
 * стартовый экран бота. Ролик собирается в promo/ (render.cjs) и лежит в
 * репозитории; бот берёт его по публичному адресу, закреплённому за коммитом.
 *
 * Уходит сам один раз после выката (крон рейтинга сверяет PROMO_ID с KV) и по
 * команде /promo — когда он снова нужен.
 */
import type { Env } from './env'
import { sendFile } from './tg'

/** Новый ролик — новый id: тогда крон отправит его владельцу ещё раз. */
export const PROMO_ID = '2.7'
/** Коммит, в котором лежат файлы ролика. */
const PROMO_COMMIT = '7fe92e46ba2af75cd3a639934b6c2dbb79c0227e'
const BASE = `https://raw.githubusercontent.com/karateka004/ManiManagerTrue/${PROMO_COMMIT}/promo/media/`
const SENT_KEY = 'promo:sent'

const FILES: { name: string; kind: 'animation' | 'document'; caption: string }[] = [
  {
    name: 'koshel-2.7-1080.mp4',
    kind: 'animation',
    caption: '<b>Кошель 2.7</b> — текст, голос и фото чека. Квадрат для постов и пересылки.',
  },
  {
    name: 'koshel-2.7-start-960x540.mp4',
    kind: 'animation',
    caption:
      'Для стартового экрана бота: @BotFather → /mybots → Кошель → Edit Bot → Edit Description Picture → перешли туда эту анимацию.',
  },
  {
    name: 'koshel-2.7-600.gif',
    kind: 'document',
    caption: 'То же файлом .gif — для мест, где нужен именно гиф.',
  },
]

/** Отправить ролик в чат. false — хотя бы один файл не дошёл. */
export async function sendPromo(env: Env, chatId: string | number): Promise<boolean> {
  let ok = true
  for (const f of FILES) {
    try {
      const res = await fetch(BASE + f.name)
      if (!res.ok) throw new Error(`${res.status}`)
      const blob = new Blob([await res.arrayBuffer()], { type: f.name.endsWith('.gif') ? 'image/gif' : 'video/mp4' })
      ok = (await sendFile(env, chatId, f.kind, blob, f.name, f.caption, f.kind === 'document')) && ok
    } catch (e) {
      console.error(`[promo] ${f.name} не скачан`, e)
      ok = false
    }
  }
  return ok
}

/**
 * Один раз после выката — владельцу. Метка ставится до отправки: крон идёт раз
 * в пять минут, и сбой посреди отправки не должен обернуться потоком одинаковых
 * сообщений. Не дошло — есть /promo.
 */
export async function sendPromoOnce(env: Env): Promise<void> {
  const owner = String(env.OWNER_CHAT_ID ?? '').trim()
  if (!owner || (await env.REFERRALS.get(SENT_KEY)) === PROMO_ID) return
  await env.REFERRALS.put(SENT_KEY, PROMO_ID)
  await sendPromo(env, owner)
}
