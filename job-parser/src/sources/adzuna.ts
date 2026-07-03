// Источник №1 (основной): Adzuna API — бесплатный агрегатор вакансий (Indeed,
// агентства и т.д.) с фильтром по расстоянию. https://developer.adzuna.com
// Ключи (app_id/app_key) — секреты воркера ADZUNA_APP_ID / ADZUNA_APP_KEY.

import { CONFIG } from '../config';
import { cleanText } from '../match';
import type { RawVacancy } from '../types';

interface AdzunaItem {
  id: string | number;
  title?: string;
  description?: string;
  redirect_url?: string;
  created?: string;
  latitude?: number;
  longitude?: number;
  salary_min?: number; // ГОДОВАЯ зарплата (Adzuna всегда нормализует к году)
  salary_max?: number;
  salary_is_predicted?: string; // "1" = оценка Adzuna, не из текста вакансии
  contract_time?: 'full_time' | 'part_time';
  company?: { display_name?: string };
  location?: { display_name?: string; area?: string[] };
}

const PAGES = 2; // 2 × 50 = до 100 свежих вакансий за прогон

// Ключи «вакансий для украинцев» — отдельный запрос с расширенным радиусом:
// такие вакансии редки и адресованы лично ребятам.
const UA_KEYWORDS = 'oekraiens oekraiense ukrainian ukrainians';
const UA_DISTANCE = 45;

async function fetchPage(appId: string, appKey: string, page: number, opts?: { whatOr?: string; distance?: number; maxDays?: number }): Promise<AdzunaItem[]> {
  const url = new URL(`https://api.adzuna.com/v1/api/jobs/nl/search/${page}`);
  url.searchParams.set('app_id', appId);
  url.searchParams.set('app_key', appKey);
  url.searchParams.set('results_per_page', '50');
  url.searchParams.set('where', CONFIG.home.city);
  url.searchParams.set('distance', String(opts?.distance ?? CONFIG.radiusKm));
  url.searchParams.set('max_days_old', String(opts?.maxDays ?? CONFIG.maxDaysOld));
  url.searchParams.set('sort_by', 'date');
  if (opts?.whatOr) url.searchParams.set('what_or', opts.whatOr);
  // full_time=1 НЕ ставим: часть fulltime-вакансий не размечена и пропала бы —
  // занятость надёжнее определяет наш матчер по тексту.
  const res = await fetch(url.toString(), { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`adzuna http ${res.status}`);
  const data = (await res.json()) as { results?: AdzunaItem[] };
  return data.results ?? [];
}

export async function fetchAdzuna(appId: string, appKey: string): Promise<RawVacancy[]> {
  const out: RawVacancy[] = [];
  const seenIds = new Set<string>();
  const batches: AdzunaItem[][] = [];
  for (let page = 1; page <= PAGES; page++) {
    const items = await fetchPage(appId, appKey, page);
    batches.push(items);
    if (items.length < 50) break;
  }
  // Спец-запрос «для украинцев»: шире радиус, дольше свежесть (их мало).
  try {
    batches.push(await fetchPage(appId, appKey, 1, { whatOr: UA_KEYWORDS, distance: UA_DISTANCE, maxDays: 14 }));
  } catch (e) {
    console.log(`adzuna ua-query failed: ${e}`);
  }
  for (const items of batches) {
    for (const it of items) {
      const key = String(it.id ?? it.redirect_url);
      if (seenIds.has(key)) continue;
      seenIds.add(key);
      if (!it.redirect_url || !it.title) continue;
      const predicted = it.salary_is_predicted === '1';
      out.push({
        source: 'adzuna',
        id: String(it.id ?? it.redirect_url),
        url: it.redirect_url,
        title: cleanText(it.title),
        company: it.company?.display_name,
        location: it.location?.display_name ?? it.location?.area?.slice(-1)[0],
        lat: it.latitude,
        lon: it.longitude,
        description: cleanText(it.description ?? ''),
        // предсказанную Adzuna зарплату не берём как факт — пусть матчер ищет её в тексте
        salaryMin: predicted ? undefined : it.salary_min,
        salaryMax: predicted ? undefined : it.salary_max,
        salaryPeriod: predicted || !it.salary_min ? undefined : 'year',
        contractTime: it.contract_time,
        postedAt: it.created,
      });
    }
  }
  return out;
}
