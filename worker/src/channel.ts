/**
 * Канал обновлений @koshel_update — самые крупные обновления: анимация с
 * настоящим приложением в телефоне (promo/capture.cjs → promo/channel.html →
 * render.cjs --scene channel) и подпись.
 *
 * Пишет бот — он админ канала, — по кнопке владельца: /post присылает владельцу
 * пост ровно таким, каким он уйдёт, а под ним «Опубликовать в канал». Первый пост
 * и аватарки бот выставил сам, разово после выката (launchOnce). Один пост — одна
 * публикация (метка `channel:<id>` в KV). Файлы берутся по адресу, закреплённому
 * за коммитом, — как у промо (promo.ts).
 *
 * Новый пост: собрать ролик в promo/media/, закоммитить, вписать коммит, файл,
 * подпись и новый id в POST.
 */
import type { Env } from './env'
import {
  answerCallback,
  editMessageReplyMarkup,
  escapeHtml,
  sendAnimation,
  sendMessage,
  setChatPhoto,
  setMyProfilePhoto,
  type TgCallbackQuery,
} from './tg'

export const CHANNEL = '@koshel_update'
const RAW = 'https://raw.githubusercontent.com/karateka004/ManiManagerTrue/'
/** Коммит, в котором лежит ролик поста. */
const MEDIA_COMMIT = 'c7946cfefb9804d72f075260c44013a4bb8cc5b8'
/** Аватарки (promo/avatar.html → promo/avatar.cjs): светлая — боту, тёмная — каналу. */
const AVATAR_COMMIT = '7831f64c167f2b445becb065b77ed83d99e13037'
export const AVATARS = { bot: 'koshel-bot-avatar.jpg', channel: 'koshel-channel-avatar.jpg' }
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
const downloadMedia = () => download(MEDIA_COMMIT, POST.media, 'video/mp4')

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
  const r = media ? await sendAnimation(env, CHANNEL, media, POST.caption, { inline_keyboard: [openRow] }) : null
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
  const r = await sendAnimation(env, chatId, media, POST.caption, { inline_keyboard: [openRow, control] })
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
  const { chat, message_id } = q.message
  const r = await publishPost(env, q.message.animation?.file_id ?? q.message.document?.file_id)
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

/** Разовый запуск после выката: новый — новый id (как PROMO_ID). */
export const LAUNCH_ID = '2.7.1'
const LAUNCH_KEY = 'channel:launch'

/**
 * Разово после выката (крон раз в 5 минут): аватарки бота и канала, затем пост —
 * владелец попросил выложить самому. Аватарка канала — раньше поста. Метка
 * ставится до работы, как у промо: сбой не обернётся повторами; что вышло и что
 * нет — владельцу одним сообщением (пост можно выложить и кнопкой из /post).
 */
export async function launchOnce(env: Env): Promise<void> {
  const owner = String(env.OWNER_CHAT_ID ?? '').trim()
  if (!owner || (await env.REFERRALS.get(LAUNCH_KEY)) === LAUNCH_ID) return
  await env.REFERRALS.put(LAUNCH_KEY, LAUNCH_ID)

  const report: string[] = []
  const line = (what: string, r: { ok: boolean; description?: string } | null) =>
    report.push(r?.ok ? `— ${what}: готово` : `— ${what}: не вышло (${escapeHtml(r?.description ?? 'файл не скачан')})`)
  const [botJpg, channelJpg] = await Promise.all([
    download(AVATAR_COMMIT, AVATARS.bot, 'image/jpeg'),
    download(AVATAR_COMMIT, AVATARS.channel, 'image/jpeg'),
  ])
  line('аватарка бота', botJpg && (await setMyProfilePhoto(env, botJpg)))
  line(`аватарка канала ${CHANNEL}`, channelJpg && (await setChatPhoto(env, CHANNEL, channelJpg)))
  const post = await publishPost(env)
  report.push(
    post.ok
      ? `— пост: ${postLink(post.messageId)}`
      : post.state
        ? '— пост уже был в канале'
        : `— пост: не вышло (${escapeHtml(post.why ?? 'ошибка')}) — выложи кнопкой из /post`,
  )
  await sendMessage(env, owner, ['Канал обновлений:', ...report].join('\n'))
}
