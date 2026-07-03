// Воркер парсера вакансий: cron-прогон источников → анализ → отправка в Telegram.
// Роуты: POST /webhook (команды бота), GET /run?key=… (ручной прогон с отчётом),
// GET /health.
//
// Бюджет подзапросов (лимит 50 на бесплатном плане, KV-операции тоже считаются):
// Adzuna ≤2 + списки ≤5 + детальные ≤12 + KV ≤10 + Telegram ≤ подписчики×(maxPerRun+1).

import { APP_HTML } from './app';
import { verifyInitData } from './auth';
import { CONFIG } from './config';
import { SeenStore } from './dedup';
import { scoreVacancy } from './match';
import { pushFeed, readFavs, readFeed, readSettings, setFav, toFeedItem, writeSettings } from './store';
import { HTML_GROUPS, pickGroupIndex } from './rotation';
import { fetchAdzuna } from './sources/adzuna';
import { fetchRandstad } from './sources/randstad';
import { fetchTempoTeam } from './sources/tempoteam';
import { fetchOlympia } from './sources/olympia';
import { fetchUitzendbureau } from './sources/uitzendbureau';
import { fetchYoungCapital } from './sources/youngcapital';
import { getChats, handleUpdate, sendDigest } from './telegram';
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
  group: number; // какая группа HTML-источников работала в этом прогоне
  sources: SourceReport[];
  fetched: number; // всего вернули источники
  fresh: number; // из них новых (не виденных раньше)
  matched: number; // прошли фильтры и порог балла
  sent: number; // отправлено сообщений-карточек (на одного подписчика)
  subscribers: number;
}

// ── Прогон ────────────────────────────────────────────────────────────────────

// Фабрики HTML-источников: каждому передаётся колбэк «эта ссылка ещё не виделась?».
const HTML_FETCHERS: Record<Exclude<SourceId, 'adzuna'>, (isNew: (u: string) => Promise<boolean>) => Promise<RawVacancy[]>> = {
  uitzendbureau: fetchUitzendbureau,
  youngcapital: fetchYoungCapital,
  olympia: fetchOlympia,
  randstad: fetchRandstad,
  tempoteam: fetchTempoTeam,
};

export async function runParse(env: Env, groupOverride?: number): Promise<RunReport> {
  // Группа HTML-источников этого прогона (чередуются, см. rotation.ts).
  const group = groupOverride ?? pickGroupIndex(Date.now());
  const htmlSources = HTML_GROUPS[group % HTML_GROUPS.length] as Exclude<SourceId, 'adzuna'>[];

  const report: RunReport = {
    at: new Date().toISOString(),
    group,
    sources: [],
    fetched: 0,
    fresh: 0,
    matched: 0,
    sent: 0,
    subscribers: 0,
  };

  // Память «что уже видели» — по одному KV-ключу на источник; грузим только активные.
  const active: SourceId[] = ['adzuna', ...htmlSources];
  const seen = {} as Record<SourceId, SeenStore>;
  for (const s of active) seen[s] = new SeenStore(env.JOBS, s);
  await Promise.all(active.map((s) => seen[s].load()));

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
    ...htmlSources.map((s) => ({
      source: s,
      run: () => HTML_FETCHERS[s]((url) => seen[s].has(url).then((h) => !h)),
    })),
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

  // Настройки из Mini App (KV `cfg`) поверх дефолтов CONFIG.
  const settings = await readSettings(env.JOBS);

  // Новые → скоринг. Виденное пропускаем; всё обработанное помечаем виденным
  // (в том числе отбракованное — чтобы не пережёвывать каждый прогон).
  const scored: ScoredVacancy[] = [];
  for (const v of raw) {
    if (await seen[v.source].has(v.id)) continue;
    await seen[v.source].add(v.id);
    report.fresh++;
    const s = scoreVacancy(v, settings);
    if (s.verdict !== 'none' && s.score >= CONFIG.minScore) scored.push(s);
  }
  scored.sort((a, b) => b.score - a.score);
  report.matched = scored.length;

  // Лента Mini App: копим ВСЁ подходящее (не только топ подборки).
  const at = report.at;
  await pushFeed(env.JOBS, scored.map((s) => toFeedItem(s, at))).catch((e) => console.log(`feed put failed: ${e}`));

  // Отправка: ОДИН дайджест за прогон каждому подписчику (топ maxPerRun,
  // сгруппировано по категориям, кнопки-ссылки внутри).
  // Заглушённые категории (настройка из Mini App) в подборку не идут — но в ленте есть.
  const chats = await getChats(env);
  report.subscribers = Object.keys(chats).length;
  const forDigest = scored.filter((s) => !settings.mutedCats.includes(s.facts.category.id));
  const top = forDigest.slice(0, settings.maxPerRun);
  const rest = forDigest.length - top.length;
  if (top.length > 0) {
    for (const chatId of Object.keys(chats)) {
      try {
        await sendDigest(env, chatId, top, rest, new Date());
        report.sent = top.length;
      } catch (e) {
        console.log(`send to ${chatId} failed: ${e}`);
      }
    }
  }

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

  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === '/health') {
      return new Response('ok');
    }

    // Mini App: страница приложения.
    if (url.pathname === '/app') {
      return new Response(APP_HTML, {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'content-security-policy':
            "default-src 'none'; script-src 'unsafe-inline' https://telegram.org; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'; img-src data:;",
        },
      });
    }

    // API Mini App. Все запросы — POST c JSON {initData, ...}; подпись Telegram обязательна.
    if (url.pathname.startsWith('/api/') && req.method === 'POST') {
      let body: { initData?: string; id?: string; status?: string | null; settings?: Record<string, unknown> };
      try {
        body = (await req.json()) as typeof body;
      } catch {
        return Response.json({ error: 'bad_json' }, { status: 400 });
      }
      const user = await verifyInitData(body.initData ?? '', env.BOT_TOKEN);
      if (!user) return Response.json({ error: 'unauthorized' }, { status: 403 });

      try {
        if (url.pathname === '/api/feed') {
          const [feed, favs, settings, lastRun] = await Promise.all([
            readFeed(env.JOBS),
            readFavs(env.JOBS),
            readSettings(env.JOBS),
            env.JOBS.get('lastRun'),
          ]);
          return Response.json({ feed, favs, settings, lastRun: lastRun ? JSON.parse(lastRun) : null });
        }

        if (url.pathname === '/api/refresh') {
          // Тот же глобальный кулдаун, что у /now — бережём лимиты воркера и источников.
          const lastNow = await env.JOBS.get('rl:now');
          if (lastNow) {
            const waitS = Math.max(30, 600 - Math.floor((Date.now() - Number(lastNow)) / 1000));
            return Response.json({ error: 'cooldown', waitS }, { status: 429 });
          }
          await env.JOBS.put('rl:now', String(Date.now()), { expirationTtl: 600 });
          const r = await runParse(env);
          return Response.json({ fresh: r.fresh, matched: r.matched, sent: r.sent });
        }

        if (url.pathname === '/api/favs') {
          if (!body.id || typeof body.id !== 'string') return Response.json({ error: 'no_id' }, { status: 400 });
          const status =
            body.status === 'fav' || body.status === 'applied' || body.status === 'hidden' ? body.status : null;
          const favs = await setFav(env.JOBS, body.id.slice(0, 300), status, user.first_name ?? user.username ?? 'user');
          return Response.json({ favs });
        }

        if (url.pathname === '/api/settings') {
          const settings = body.settings
            ? await writeSettings(env.JOBS, body.settings)
            : await readSettings(env.JOBS);
          return Response.json({ settings });
        }
      } catch (e) {
        console.log(`api failed ${url.pathname}: ${e}`);
        return Response.json({ error: 'internal' }, { status: 500 });
      }
      return Response.json({ error: 'not_found' }, { status: 404 });
    }

    // Ручной прогон: GET /run?key=<RUN_KEY>[&group=0|1] — вернёт JSON-отчёт по
    // источникам. group позволяет проверить обе группы HTML-источников подряд.
    if (url.pathname === '/run') {
      if (!env.RUN_KEY || url.searchParams.get('key') !== env.RUN_KEY) {
        return new Response('forbidden', { status: 403 });
      }
      try {
        const g = url.searchParams.get('group');
        const report = await runParse(env, g === null ? undefined : Math.max(0, parseInt(g, 10) || 0));
        return Response.json(report);
      } catch (e) {
        return Response.json({ error: String(e) }, { status: 500 });
      }
    }

    // Вебхук Telegram. Секрет задаётся при setWebhook (secret_token=RUN_KEY).
    // Отвечаем 200 сразу, обработку (в т.ч. долгий /now) доделываем в waitUntil —
    // иначе Telegram по таймауту пришлёт апдейт повторно.
    if (url.pathname === '/webhook' && req.method === 'POST') {
      if (env.RUN_KEY && req.headers.get('x-telegram-bot-api-secret-token') !== env.RUN_KEY) {
        return new Response('forbidden', { status: 403 });
      }
      try {
        const update = (await req.json()) as Parameters<typeof handleUpdate>[1];
        ctx.waitUntil(
          handleUpdate(env, update, () => runParse(env)).catch((e) => {
            console.log(`webhook failed: ${e}`);
          })
        );
      } catch (e) {
        console.log(`webhook parse failed: ${e}`);
      }
      return new Response('ok'); // Telegram важен только 200
    }

    return new Response('not found', { status: 404 });
  },
};
