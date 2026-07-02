// Телеграм-слой: дайджест вакансий (одно сообщение за прогон, сгруппировано по
// категориям, с выжимкой и нумерованными кнопками) и команды бота
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

// ── Форматирование дайджеста ──────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const VERDICT_SHORT: Record<ScoredVacancy['verdict'], string> = {
  both: '👫 подходит обоим',
  him: `👤 только ${CONFIG.people.him.name} (возраст)`,
  her: `👤 только ${CONFIG.people.her.name} (возраст)`,
  none: '',
};

// Строка с деньгами: «€14,50–16/час» / «≈€15/час (из месячной)» / «ставка не указана».
function moneyLine(v: ScoredVacancy): string {
  if (v.hourlyEur === undefined) return '💶 ставка не указана — спросить при отклике';
  const range = v.hourlyMaxEur && v.hourlyMaxEur > v.hourlyEur ? `–${fmt(v.hourlyMaxEur)}` : '';
  return `💶 €${fmt(v.hourlyEur)}${range}/час брутто`;
}

function fmt(n: number): string {
  return String(Math.round(n * 10) / 10).replace('.', ',');
}

// Компактная строка условий: часы, смены, старт, опыт, язык, проезд, выплаты.
function condLine(v: ScoredVacancy): string {
  const f = v.facts;
  const parts: string[] = [];
  parts.push(f.hoursPerWeek ? `${f.hoursPerWeek} ч/нед` : 'fulltime');
  if (f.night) parts.push('ночные смены');
  else if (f.shifts) parts.push('смены');
  if (f.startDirect) parts.push('старт сразу');
  if (f.noExperience) parts.push('без опыта');
  if (f.englishOk) parts.push('англ. ок');
  if (f.travelAllowance) parts.push('проезд оплачивают');
  if (f.weeklyPay) parts.push('выплата раз в неделю');
  if (f.needsTransport) parts.push('нужны права (есть ✓)');
  return parts.join(' · ');
}

// Номер-эмодзи для списка и кнопок.
function num(i: number): string {
  const digits = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
  return i <= 9 ? digits[i] : `${i}.`;
}

// Одна запись дайджеста (3–4 строки).
function entry(v: ScoredVacancy, i: number): string {
  const lines: string[] = [];
  const hot = v.score >= 85 ? ' 🔥' : '';
  lines.push(`${num(i)} <b>${esc(v.title)}</b>${hot}`);
  const where: string[] = [];
  if (v.company) where.push(esc(v.company));
  if (v.location) where.push(esc(v.location) + (v.distanceKm !== undefined ? ` · ~${v.distanceKm} км` : ''));
  if (where.length) lines.push(`🏢 ${where.join(' — ')}`);
  lines.push(moneyLine(v));
  lines.push(`🕐 ${condLine(v)}`);
  if (v.facts.duties.length) lines.push(`📝 ${v.facts.duties.join(', ')}`);
  const verdict = VERDICT_SHORT[v.verdict];
  if (v.verdict !== 'both' && verdict) lines.push(verdict);
  return lines.join('\n');
}

// Дайджест: заголовок с датой и разбивкой по категориям, записи по категориям,
// нумерованные кнопки-ссылки.
export function formatDigest(list: ScoredVacancy[], hiddenCount: number, now: Date): {
  text: string;
  keyboard: Array<Array<{ text: string; url: string }>>;
} {
  // Группировка по категориям с сохранением порядка по score.
  const byCat = new Map<string, ScoredVacancy[]>();
  for (const v of list) {
    const key = v.facts.category.id;
    if (!byCat.has(key)) byCat.set(key, []);
    byCat.get(key)!.push(v);
  }

  const date = now.toLocaleString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Amsterdam' });
  const counts = [...byCat.values()]
    .map((vs) => `${vs[0].facts.category.emoji} ${vs.length}`)
    .join(' · ');
  const parts: string[] = [`🔔 <b>Новые вакансии — ${date}</b>\n${counts}`];

  const keyboard: Array<Array<{ text: string; url: string }>> = [];
  let i = 0;
  for (const vs of byCat.values()) {
    const cat = vs[0].facts.category;
    parts.push(`\n${cat.emoji} <b>${cat.label.toUpperCase()}</b>`);
    for (const v of vs) {
      i++;
      parts.push(entry(v, i));
      const price = v.hourlyEur !== undefined ? ` · €${fmt(v.hourlyEur)}` : '';
      keyboard.push([{ text: `${num(i)} ${v.title.slice(0, 32)}${price}`, url: v.url }]);
    }
  }
  if (hiddenCount > 0) {
    parts.push(`\n…и ещё ${hiddenCount} — пришлю в следующих подборках.`);
  }
  parts.push(`\n<i>👫 = обоим · 🔥 = топ · кнопки ниже открывают вакансии</i>`);
  return { text: parts.join('\n'), keyboard };
}

export async function sendDigest(
  env: TgEnv,
  chatId: string,
  list: ScoredVacancy[],
  hiddenCount: number,
  now: Date
): Promise<void> {
  const { text, keyboard } = formatDigest(list, hiddenCount, now);
  await tgApi(env, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: keyboard },
  });
}

export async function sendText(env: TgEnv, chatId: string, text: string): Promise<void> {
  await tgApi(env, 'sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true });
}

// ── Команды бота (вебхук) ─────────────────────────────────────────────────────

interface TgUpdate {
  message?: {
    text?: string;
    chat?: { id: number; type?: string; title?: string; first_name?: string; username?: string };
  };
}

// Колбэк «проверить вакансии сейчас» — прокидывается из index.ts (иначе цикл импортов).
export type RunNow = () => Promise<{ fresh: number; matched: number; sent: number }>;

const NOW_COOLDOWN_S = 600; // /now — не чаще раза в 10 минут (бережём лимиты)

export async function handleUpdate(env: TgEnv, update: TgUpdate, runNow?: RunNow): Promise<void> {
  const msg = update.message;
  const chatId = msg?.chat?.id;
  // В группах команды приходят как «/start@ИмяБота» — отрезаем хвост.
  const text = (msg?.text ?? '').trim().toLowerCase().split(/[@\s]/)[0];
  if (!chatId || !text.startsWith('/')) return;
  const id = String(chatId);
  // Имя: для группы — её название, для личного чата — имя человека.
  const name = msg?.chat?.title ?? msg?.chat?.first_name ?? msg?.chat?.username ?? 'user';
  const isGroup = msg?.chat?.type === 'group' || msg?.chat?.type === 'supergroup';

  if (text === '/start') {
    const raw = await env.JOBS.get(CHATS_KEY);
    const real = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    real[id] = name;
    await setChats(env, real);
    await sendText(
      env,
      id,
      `${isGroup ? `Подключил группу «${esc(name)}»` : `Привет, ${esc(name)}`}! 👋\n\n` +
        `Раз в 3 часа (07:00–22:00) я присылаю подборку свежих вакансий: ` +
        `Роттердам +${CONFIG.radiusKm} км, полный день, от €${CONFIG.minHourlyEur}/час, без нидерландского.\n` +
        `Все вакансии в одном сообщении, по категориям, с выжимкой.\n\n` +
        `Команды:\n/now — проверить вакансии прямо сейчас\n/status — последний прогон\n/stop — отписаться\n\n` +
        `📱 Кнопка «Меню» слева внизу открывает приложение: лента всех вакансий, фильтры, избранное, настройки.\n` +
        `💡 Добавь меня в общую группу и напиши там /start — подборки будут видны всем в одном месте.`
    );
    return;
  }

  if (text === '/stop') {
    const raw = await env.JOBS.get(CHATS_KEY);
    const real = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    delete real[id];
    await setChats(env, real);
    await sendText(env, id, 'Отписал. Вернуться — /start');
    return;
  }

  // Обновление по запросу: запускает полный прогон, подборка уходит ВСЕМ подписчикам.
  if (text === '/now' || text === '/jobs') {
    const chats = await getChats(env);
    if (!(id in chats)) {
      await sendText(env, id, 'Сначала подпишись: /start');
      return;
    }
    // Рейт-лимит: глобальный, чтобы не выжечь лимиты воркера и источников.
    const lastNow = await env.JOBS.get('rl:now');
    if (lastNow) {
      const waitMin = Math.max(1, Math.ceil((NOW_COOLDOWN_S - (Date.now() - Number(lastNow)) / 1000) / 60));
      await sendText(env, id, `⏳ Только что проверял. Следующая ручная проверка — через ~${waitMin} мин.`);
      return;
    }
    await env.JOBS.put('rl:now', String(Date.now()), { expirationTtl: NOW_COOLDOWN_S });
    if (!runNow) return;
    await sendText(env, id, '🔎 Проверяю источники…');
    try {
      const r = await runNow();
      // Если что-то нашлось — подборка уже ушла всем подписчикам (включая автора запроса).
      if (r.sent === 0) {
        await sendText(env, id, `Ничего нового: просмотрел ${r.fresh} свежих, подходящих нет. Следующая автопроверка — по расписанию.`);
      }
    } catch (e) {
      console.log(`runNow failed: ${e}`);
      await sendText(env, id, '⚠️ Не получилось проверить, попробуй позже.');
    }
    return;
  }

  if (text === '/status') {
    const last = await env.JOBS.get('lastRun');
    await sendText(
      env,
      id,
      last ? `Последний прогон:\n<pre>${esc(last)}</pre>` : 'Прогонов ещё не было — жди ближайший по расписанию.'
    );
    return;
  }
}
