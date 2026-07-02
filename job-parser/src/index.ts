// Воркер парсера вакансий: cron-прогон источников → анализ → отправка в Telegram.
// Роуты: POST /webhook (команды бота), GET /run?key=… (ручной прогон с отчётом),
// GET /health.
//
// Бюджет подзапросов (лимит 50 на бесплатном плане, KV-операции тоже считаются):
// Adzuna ≤2 + списки ≤5 + детальные ≤12 + KV ≤10 + Telegram ≤ подписчики×(maxPerRun+1).

import { CONFIG } from './config';
import { SeenStore } from './dedup';
import { scoreVacancy } from './match';
import { fetchAdzuna } from './sources/adzuna';
import { fetchUitzendbureau } from './sources/uitzendbureau';
import { fetchYoungCapital } from './sources/youngcapital';
import { getChats, handleUpdate, sendText, sendVacancy } from './telegram';
import type { RawVacancy, ScoredVacancy, SourceId, SourceReport } from './types';

export interface Env {
  JOBS: KVNamespace;
  OWNER_CHAT_ID: string;
  BOT_TOKEN: string;
  ADZUNA_APP_ID?: string;
  ADZUNA_APP_KEY?: string;
  RUN_KEY?: string;
}

interface RunReport {
  at: string;
  sources: SourceReport[];
  fetched: number; // всего вернули источники
  fresh: number; // из них новых (не виденных раньше)
  matched: number; // прошли фильтры и порог балла
  sent: number; // отправлено сообщений-карточек (на одного подписчика)
  subscribers: number;
}

// ── Прогон ────────────────────────────────────────────────────────────────────

async function runParse(env: Env): Promise<RunReport> {
  const report: RunReport = {
    at: new Date().toISOString(),
    sources: [],
    fetched: 0,
    fresh: 0,
    matched: 0,
    sent: 0,
    subscribers: 0,
  };

  // Память «что уже видели» — по одному KV-ключу на источник.
  const seen: Record<SourceId, SeenStore> = {
    adzuna: new SeenStore(env.JOBS, 'adzuna'),
    uitzendbureau: new SeenStore(env.JOBS, 'uitzendbureau'),
    youngcapital: new SeenStore(env.JOBS, 'youngcapital'),
  };
  await Promise.all(Object.values(seen).map((s) => s.load()));

  // Источники независимы: сбой одного не валит прогон.
  const jobs: Array<{ source: SourceId; run: () => Promise<RawVacancy[]> }> = [
    {
      source: 'adzuna',
      run: () => {
        if (!env.ADZUNA_APP_ID || !env.ADZUNA_APP_KEY) {
          throw new Error('нет секретов ADZUNA_APP_ID/ADZUNA_APP_KEY');
        }
        return fetchAdzuna(env.ADZUNA_APP_ID, env.ADZUNA_APP_KEY);
      },
    },
    { source: 'uitzendbureau', run: () => fetchUitzendbureau((url) => seen.uitzendbureau.has(url).then((h) => !h)) },
    { source: 'youngcapital', run: () => fetchYoungCapital((url) => seen.youngcapital.has(url).then((h) => !h)) },
  ];

  const settled = await Promise.allSettled(jobs.map((j) => j.run()));
  const raw: RawVacancy[] = [];
  settled.forEach((res, i) => {
    if (res.status === 'fulfilled') {
      report.sources.push({ source: jobs[i].source, found: res.value.length });
      raw.push(...res.value);
    } else {
      report.sources.push({ source: jobs[i].source, found: 0, error: String(res.reason) });
      console.log(`source ${jobs[i].source} failed: ${res.reason}`);
    }
  });
  report.fetched = raw.length;

  // Новые → скоринг. Виденное пропускаем; всё обработанное помечаем виденным
  // (в том числе отбракованное — чтобы не пережёвывать каждый прогон).
  const scored: ScoredVacancy[] = [];
  for (const v of raw) {
    if (await seen[v.source].has(v.id)) continue;
    await seen[v.source].add(v.id);
    report.fresh++;
    const s = scoreVacancy(v);
    if (s.verdict !== 'none' && s.score >= CONFIG.minScore) scored.push(s);
  }
  scored.sort((a, b) => b.score - a.score);
  report.matched = scored.length;

  // Отправка: топ maxPerRun каждому подписчику + строка «и ещё N».
  const chats = await getChats(env);
  report.subscribers = Object.keys(chats).length;
  const top = scored.slice(0, CONFIG.maxPerRun);
  const rest = scored.length - top.length;
  for (const chatId of Object.keys(chats)) {
    for (const v of top) {
      try {
        await sendVacancy(env, chatId, v);
        report.sent++;
      } catch (e) {
        console.log(`send to ${chatId} failed: ${e}`);
      }
    }
    if (rest > 0) {
      await sendText(env, chatId, `…и ещё ${rest} подходящих — пришлю в следующие прогоны.`).catch(() => {});
    }
  }
  // report.sent — карточек на ОДНОГО подписчика (для читаемости /status)
  if (report.subscribers > 0) report.sent = Math.round(report.sent / report.subscribers);

  await Promise.all(Object.values(seen).map((s) => s.save()));
  await env.JOBS.put('lastRun', JSON.stringify(report, null, 1));
  return report;
}

// ── Хендлеры воркера ──────────────────────────────────────────────────────────

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runParse(env).catch((e) => {
        console.log(`runParse failed: ${e}`);
      })
    );
  },

  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === '/health') {
      return new Response('ok');
    }

    // Ручной прогон: GET /run?key=<RUN_KEY> — вернёт JSON-отчёт по источникам.
    if (url.pathname === '/run') {
      if (!env.RUN_KEY || url.searchParams.get('key') !== env.RUN_KEY) {
        return new Response('forbidden', { status: 403 });
      }
      try {
        const report = await runParse(env);
        return Response.json(report);
      } catch (e) {
        return Response.json({ error: String(e) }, { status: 500 });
      }
    }

    // Вебхук Telegram. Секрет задаётся при setWebhook (secret_token=RUN_KEY).
    if (url.pathname === '/webhook' && req.method === 'POST') {
      if (env.RUN_KEY && req.headers.get('x-telegram-bot-api-secret-token') !== env.RUN_KEY) {
        return new Response('forbidden', { status: 403 });
      }
      try {
        await handleUpdate(env, await req.json());
      } catch (e) {
        console.log(`webhook failed: ${e}`);
      }
      return new Response('ok'); // Telegram важен только 200
    }

    return new Response('not found', { status: 404 });
  },
};
