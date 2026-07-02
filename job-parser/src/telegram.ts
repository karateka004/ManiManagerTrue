// Телеграм-слой: отправка карточек вакансий и обработка команд бота
// (/start — подписка, /stop — отписка, /status — диагностика).
// Подписчики хранятся одним KV-ключом `chats` (map chat_id → имя).

import { CONFIG } from './config';
import type { ScoredVacancy } from './types';

export interface TgEnv {
  JOBS: KVNamespace;
  BOT_TOKEN: string;
  OWNER_CHAT_ID: string;
}

const CHATS_KEY = 'chats';

export async function tgApi(env: TgEnv, method: string, payload: Record<string, unknown>): Promise<Response> {
  return fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// ── Подписчики ────────────────────────────────────────────────────────────────

export async function getChats(env: TgEnv): Promise<Record<string, string>> {
  try {
    const raw = await env.JOBS.get(CHATS_KEY);
    if (raw) {
      const m = JSON.parse(raw) as Record<string, string>;
      if (Object.keys(m).length > 0) return m;
    }
  } catch {
    // битое значение — фолбэк ниже
  }
  // пока никто не написал /start — шлём владельцу
  return { [env.OWNER_CHAT_ID]: 'owner' };
}

async function setChats(env: TgEnv, chats: Record<string, string>): Promise<void> {
  await env.JOBS.put(CHATS_KEY, JSON.stringify(chats));
}

// ── Форматирование ────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const VERDICT_LABEL: Record<ScoredVacancy['verdict'], string> = {
  both: '👫 Подходит обоим',
  him: `👤 Подходит только: ${CONFIG.people.him.name}`,
  her: `👤 Подходит только: ${CONFIG.people.her.name}`,
  none: '—',
};

export function formatVacancy(v: ScoredVacancy): string {
  const lines: string[] = [];
  lines.push(`<b>${esc(v.title)}</b> · 🔥 ${v.score}/100`);
  if (v.company) lines.push(esc(v.company));
  const loc = v.location ? `📍 ${esc(v.location)}${v.distanceKm !== undefined ? ` · ~${v.distanceKm} км` : ''}` : '';
  if (loc) lines.push(loc);
  lines.push('');
  lines.push(`<b>${VERDICT_LABEL[v.verdict]}</b>`);
  for (const r of v.reasons) lines.push(esc(r));
  lines.push('');
  lines.push(`<i>Источник: ${v.source}</i>`);
  return lines.join('\n');
}

export async function sendVacancy(env: TgEnv, chatId: string, v: ScoredVacancy): Promise<void> {
  await tgApi(env, 'sendMessage', {
    chat_id: chatId,
    text: formatVacancy(v),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: [[{ text: '🔗 Открыть вакансию', url: v.url }]] },
  });
}

export async function sendText(env: TgEnv, chatId: string, text: string): Promise<void> {
  await tgApi(env, 'sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true });
}

// ── Команды бота (вебхук) ─────────────────────────────────────────────────────

interface TgUpdate {
  message?: {
    text?: string;
    chat?: { id: number; first_name?: string; username?: string };
  };
}

export async function handleUpdate(env: TgEnv, update: TgUpdate): Promise<void> {
  const msg = update.message;
  const chatId = msg?.chat?.id;
  const text = (msg?.text ?? '').trim().toLowerCase();
  if (!chatId || !text.startsWith('/')) return;
  const id = String(chatId);

  if (text.startsWith('/start')) {
    // фолбэк-мапа {owner} из getChats не сохранена в KV — читаем реальное состояние
    const raw = await env.JOBS.get(CHATS_KEY);
    const real = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    real[id] = msg?.chat?.first_name ?? msg?.chat?.username ?? 'user';
    await setChats(env, real);
    await sendText(
      env,
      id,
      `Привет, ${esc(real[id])}! 👋\n\nЯ присылаю свежие вакансии вокруг Роттердама (${CONFIG.radiusKm} км), ` +
        `fulltime, от €${CONFIG.minHourlyEur}/час, без требования нидерландского.\n` +
        `Проверяю источники каждые 3 часа.\n\n` +
        `Команды:\n/status — когда был последний прогон\n/stop — отписаться\n\n` +
        `(твой chat_id: <code>${id}</code>)`
    );
    return;
  }

  if (text.startsWith('/stop')) {
    const raw = await env.JOBS.get(CHATS_KEY);
    const real = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    delete real[id];
    await setChats(env, real);
    await sendText(env, id, 'Отписал. Вернуться — /start');
    return;
  }

  if (text.startsWith('/status')) {
    const last = await env.JOBS.get('lastRun');
    await sendText(
      env,
      id,
      last ? `Последний прогон:\n<pre>${esc(last)}</pre>` : 'Прогонов ещё не было — жди ближайший cron или дёрни /run.'
    );
    return;
  }
}
