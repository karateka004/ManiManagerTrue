/**
 * Канал обновлений @koshel_update — самые крупные обновления: анимация с
 * настоящим приложением в телефоне (promo/capture.cjs → promo/channel.html →
 * render.cjs --scene channel) и подпись.
 *
 * Пишет бот — он админ канала, — но только по кнопке владельца: /post присылает
 * владельцу пост ровно таким, каким он уйдёт, а под ним «Опубликовать в канал».
 * Один пост — одна публикация (метка `channel:<id>` в KV). Ролик берётся по
 * адресу, закреплённому за коммитом, — как у промо (promo.ts).
 *
 * Новый пост: собрать ролик в promo/media/, закоммитить, вписать коммит, файл,
 * подпись и новый id в POST.
 */
import type { Env } from './env'
import { answerCallback, editMessageReplyMarkup, sendAnimation, sendMessage, type TgCallbackQuery } from './tg'

export const CHANNEL = '@koshel_update'
/** Коммит, в котором лежит ролик поста. */
const MEDIA_COMMIT = 'c7946cfefb9804d72f075260c44013a4bb8cc5b8'
const MEDIA_BASE = `https://raw.githubusercontent.com/karateka004/ManiManagerTrue/${MEDIA_COMMIT}/promo/media/`
/** Приложение из канала: метка `channel` — заходы видны в аналитике отдельным источником. */
export const APP_URL = 'https://t.me/TrueManiManager_Bot?startapp=channel'

export const POST = {
  id: '2.7.1',
  media: 'koshel-post-2.7.1-1080.mp4',
  caption: [
    '⚡️ <b>Кошель стал плавнее и быстрее</b>',
    '',
    'Вкладки переключаются мгновенно: где уже был — открывается сразу, а свайп идёт ровно за пальцем.',
    '',
    '<b>Записать трату — пара касаний:</b> «+», сумма, категория. Шторка закрывается сразу, без подвисаний.',
    '',
    '<b>Тёмная тема — с первого кадра:</b> при запуске Кошель больше не вспыхивает светлым.',
    '',
    '<b>Скоро — Кошель+:</b> записи голосовым и по фото чека. Сейчас тестируем.',
  ].join('\n'),
}

const keyOf = (id: string) => `channel:${id}`
const postLink = (messageId: string | number) => `https://t.me/${CHANNEL.slice(1)}/${messageId}`
const openRow = [{ text: 'Открыть Кошель', url: APP_URL }]
const isOwner = (env: Env, userId: number) => String(userId) === String(env.OWNER_CHAT_ID ?? '').trim()

async function downloadMedia(): Promise<Blob | null> {
  try {
    const res = await fetch(MEDIA_BASE + POST.media)
    if (!res.ok) throw new Error(`${res.status}`)
    return new Blob([await res.arrayBuffer()], { type: 'video/mp4' })
  } catch (e) {
    console.error(`[channel] ${POST.media} не скачан`, e)
    return null
  }
}

/** /post — владельцу: пост, каким он уйдёт в канал, и кнопка публикации под ним. */
export async function sendPostPreview(env: Env, chatId: number): Promise<void> {
  const published = await env.REFERRALS.get(keyOf(POST.id))
  const media = await downloadMedia()
  if (!media) {
    await sendMessage(env, chatId, 'Не скачал ролик поста — попробуй /post ещё раз чуть позже.')
    return
  }
  await sendMessage(
    env,
    chatId,
    published && published !== 'sending'
      ? `Этот пост уже в канале ${CHANNEL}. Ниже — как он выглядит.`
      : `Так пост будет выглядеть в канале ${CHANNEL}. Опубликую по кнопке под ним.`,
  )
  const control =
    published && published !== 'sending'
      ? [{ text: 'Уже в канале — открыть', url: postLink(published) }]
      : [{ text: 'Опубликовать в канал', callback_data: `n:${POST.id}` }]
  const r = await sendAnimation(env, chatId, media, POST.caption, { inline_keyboard: [openRow, control] })
  if (!r.ok) await sendMessage(env, chatId, `Предпросмотр не отправился: ${r.description ?? 'ошибка Telegram'}.`)
}

/**
 * «Опубликовать в канал» под предпросмотром. Метка ставится до отправки (со
 * сроком — на случай сбоя посреди): двойное нажатие не даст двух постов.
 */
export async function publishPostButton(q: TgCallbackQuery, env: Env, userId: number, id: string): Promise<void> {
  if (!isOwner(env, userId) || !q.message) {
    await answerCallback(env, q.id)
    return
  }
  if (id !== POST.id) {
    await answerCallback(env, q.id, 'Этот предпросмотр устарел — пришли /post заново.', true)
    return
  }
  const key = keyOf(POST.id)
  const state = await env.REFERRALS.get(key)
  if (state === 'sending') {
    await answerCallback(env, q.id, 'Уже публикую…')
    return
  }
  if (state) {
    await answerCallback(env, q.id, 'Этот пост уже в канале.')
    await editMessageReplyMarkup(env, q.message.chat.id, q.message.message_id, {
      inline_keyboard: [openRow, [{ text: 'Уже в канале — открыть', url: postLink(state) }]],
    })
    return
  }
  await env.REFERRALS.put(key, 'sending', { expirationTtl: 120 })

  // Ролик уже у Telegram — тот, что в предпросмотре; иначе качаем заново.
  const fileId = q.message.animation?.file_id ?? q.message.document?.file_id
  const media = fileId ?? (await downloadMedia())
  const r = media ? await sendAnimation(env, CHANNEL, media, POST.caption, { inline_keyboard: [openRow] }) : { ok: false as const }
  if (!r.ok || !('messageId' in r) || !r.messageId) {
    await env.REFERRALS.delete(key)
    const why = 'description' in r && r.description ? r.description : 'ошибка Telegram'
    await answerCallback(env, q.id, `Не опубликовал: ${why}. Проверь, что бот — админ канала с правом публикации.`, true)
    return
  }
  await env.REFERRALS.put(key, String(r.messageId))
  await answerCallback(env, q.id, 'Опубликовано в канале.')
  await editMessageReplyMarkup(env, q.message.chat.id, q.message.message_id, {
    inline_keyboard: [openRow, [{ text: 'Опубликовано — открыть пост', url: postLink(r.messageId) }]],
  })
}
