/**
 * Канал обновлений @koshel_update — самые крупные обновления: ролик (анимация с
 * настоящим приложением в телефоне — promo/capture.cjs → promo/channel.html →
 * render.cjs --scene channel, или промо со звуком) и подпись.
 *
 * Пишет бот — он админ канала, — по кнопке владельца: /post присылает владельцу
 * пост ровно таким, каким он уйдёт, а под ним «Опубликовать в канал». Если
 * владелец просит выложить самому — разово после выката (launchOnce). Один пост —
 * одна публикация (метка `channel:<id>` в KV). Ролик берётся по адресу,
 * закреплённому за коммитом, — как у промо (promo.ts).
 *
 * Новый пост: собрать ролик в promo/media/, закоммитить, вписать коммит, файл,
 * подпись и новый id в POST (выложить самому — ещё и новый LAUNCH_ID).
 */
import type { Env } from './env'
import {
  answerCallback,
  editMessageReplyMarkup,
  escapeHtml,
  sendMedia,
  sendMessage,
  type TgCallbackQuery,
} from './tg'

export const CHANNEL = '@koshel_update'
const RAW = 'https://raw.githubusercontent.com/karateka004/ManiManagerTrue/'
/** Приложение из канала: метка `channel` — заходы видны в аналитике отдельным источником. */
export const APP_URL = 'https://t.me/TrueManiManager_Bot?startapp=channel'

export const POST = {
  id: '2.7.0',
  /** Коммит, в котором лежит ролик: промо 2.7 — квадрат со звуком и цветом эпизодов. */
  commit: 'eecddb7e97125fcdb007dc54eeb07467ed58b262',
  media: 'koshel-2.7-square-sound.mp4',
  /** Со звуком — видео; немой ролик, крутящийся как гиф, — 'animation'. */
  kind: 'video' as 'animation' | 'video',
  // Голос и фото пока у тестеров Кошель+ — пост их не обещает сейчас.
  caption: [
    '🎙 <b>Скоро в Кошель+: траты голосом и по фото чека</b>',
    '',
    'Трату можно будет надиктовать или сфотографировать — бот сам разберёт сумму, категорию и дату.',
    '',
    '<b>Голосовое:</b> говори своими словами, хоть несколько трат подряд — каждая станет отдельной записью.',
    '',
    '<b>Фото чека:</b> итог, магазин и дата прямо с чека. Скриншот из банка — до 15 операций за раз.',
    '',
    '<b>Вопрос голосом:</b> «сколько ушло на кафе в этом месяце?» — бот ответит.',
    '',
    'Сейчас идёт закрытый тест. Как откроем — расскажем здесь первыми.',
  ].join('\n'),
}

const keyOf = (id: string) => `channel:${id}`
const postLink = (messageId: string | number) => `https://t.me/${CHANNEL.slice(1)}/${messageId}`
const openRow = [{ text: 'Открыть Кошель', url: APP_URL }]
const isOwner = (env: Env, userId: number) => String(userId) === String(env.OWNER_CHAT_ID ?? '').trim()

async function download(commit: string, file: string, type: string): Promise<Blob | null> {
  try {
    const res = await fetch(`${RAW}${commit}/promo/media/${file}`)
    if (!res.ok) throw new Error(`${res.status}`)
    return new Blob([await res.arrayBuffer()], { type })
  } catch (e) {
    console.error(`[channel] ${file} не скачан`, e)
    return null
  }
}
const downloadMedia = () => download(POST.commit, POST.media, 'video/mp4')

/**
 * Пост в канал — один раз. Метка ставится до отправки (со сроком — на случай
 * сбоя посреди): двойное нажатие и запуск после выката не дадут двух постов.
 * `state` — пост уже публикуется ('sending') или вышел (id сообщения).
 */
async function publishPost(
  env: Env,
  fileId?: string,
): Promise<{ ok: true; messageId: number } | { ok: false; state?: string; why?: string }> {
  const key = keyOf(POST.id)
  const state = await env.REFERRALS.get(key)
  if (state) return { ok: false, state }
  await env.REFERRALS.put(key, 'sending', { expirationTtl: 120 })
  // Ролик уже у Telegram (предпросмотр) — без загрузки; иначе качаем заново.
  const media = fileId ?? (await downloadMedia())
  const r = media ? await sendMedia(env, CHANNEL, POST.kind, media, POST.caption, { inline_keyboard: [openRow] }) : null
  if (!r?.ok || !r.messageId) {
    await env.REFERRALS.delete(key)
    return { ok: false, why: r ? (r.description ?? 'ошибка Telegram') : 'ролик не скачан' }
  }
  await env.REFERRALS.put(key, String(r.messageId))
  return { ok: true, messageId: r.messageId }
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
  const r = await sendMedia(env, chatId, POST.kind, media, POST.caption, { inline_keyboard: [openRow, control] })
  if (!r.ok) await sendMessage(env, chatId, `Предпросмотр не отправился: ${r.description ?? 'ошибка Telegram'}.`)
}

/** «Опубликовать в канал» под предпросмотром — только владельцу. */
export async function publishPostButton(q: TgCallbackQuery, env: Env, userId: number, id: string): Promise<void> {
  if (!isOwner(env, userId) || !q.message) {
    await answerCallback(env, q.id)
    return
  }
  if (id !== POST.id) {
    await answerCallback(env, q.id, 'Этот предпросмотр устарел — пришли /post заново.', true)
    return
  }
  const { chat, message_id, video, animation, document } = q.message
  const r = await publishPost(env, (video ?? animation ?? document)?.file_id)
  if (r.ok) {
    await answerCallback(env, q.id, 'Опубликовано в канале.')
    await editMessageReplyMarkup(env, chat.id, message_id, {
      inline_keyboard: [openRow, [{ text: 'Опубликовано — открыть пост', url: postLink(r.messageId) }]],
    })
  } else if (r.state === 'sending') {
    await answerCallback(env, q.id, 'Уже публикую…')
  } else if (r.state) {
    await answerCallback(env, q.id, 'Этот пост уже в канале.')
    await editMessageReplyMarkup(env, chat.id, message_id, {
      inline_keyboard: [openRow, [{ text: 'Уже в канале — открыть', url: postLink(r.state) }]],
    })
  } else {
    await answerCallback(env, q.id, `Не опубликовал: ${r.why}. Проверь, что бот — админ канала с правом публикации.`, true)
  }
}

/** Выложить самому после выката: новый пост — новый id (как PROMO_ID). */
export const LAUNCH_ID = '2.7.0'
const LAUNCH_KEY = 'channel:launch'

/**
 * Разово после выката (крон раз в 5 минут) — пост в канал, когда владелец
 * попросил выложить самому. Метка ставится до работы, как у промо: сбой не
 * обернётся повторами; итог — владельцу (не вышло — есть кнопка из /post).
 */
export async function launchOnce(env: Env): Promise<void> {
  const owner = String(env.OWNER_CHAT_ID ?? '').trim()
  if (!owner || (await env.REFERRALS.get(LAUNCH_KEY)) === LAUNCH_ID) return
  await env.REFERRALS.put(LAUNCH_KEY, LAUNCH_ID)
  const post = await publishPost(env)
  await sendMessage(
    env,
    owner,
    post.ok
      ? `Пост ${POST.id} в канале: ${postLink(post.messageId)}`
      : post.state
        ? `Пост ${POST.id} уже был в канале.`
        : `Пост ${POST.id} не вышел: ${escapeHtml(post.why ?? 'ошибка')}. Выложи кнопкой из /post.`,
  )
}
