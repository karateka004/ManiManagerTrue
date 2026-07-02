// Общий помощник HTML-источников: извлечение вакансий из микроразметки
// schema.org JobPosting (<script type="application/ld+json">). Сайты вакансий
// встраивают её для Google Jobs, поэтому она куда стабильнее CSS-классов.

import { cleanText } from '../match';
import type { RawVacancy, SourceId } from '../types';

// Все JSON-объекты из <script type="application/ld+json"> на странице.
export function extractJsonLd(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(re)) {
    try {
      out.push(JSON.parse(m[1].trim()));
    } catch {
      // битый JSON — пропускаем блок
    }
  }
  return out;
}

// Развернуть массивы и @graph, отобрать объекты с @type JobPosting.
export function findJobPostings(blocks: unknown[]): Record<string, any>[] {
  const flat: unknown[] = [];
  const walk = (x: unknown) => {
    if (Array.isArray(x)) return x.forEach(walk);
    if (x && typeof x === 'object') {
      const o = x as Record<string, any>;
      if (Array.isArray(o['@graph'])) o['@graph'].forEach(walk);
      flat.push(o);
    }
  };
  blocks.forEach(walk);
  return flat.filter((o): o is Record<string, any> => {
    const t = (o as Record<string, any>)['@type'];
    return t === 'JobPosting' || (Array.isArray(t) && t.includes('JobPosting'));
  });
}

// JobPosting (schema.org) → RawVacancy. url — фолбэк, если в разметке его нет.
export function jobPostingToVacancy(jp: Record<string, any>, source: SourceId, url: string): RawVacancy | null {
  const title = jp.title ? cleanText(String(jp.title)) : '';
  if (!title) return null;

  // Зарплата: baseSalary.value = MonetaryAmount { value | minValue/maxValue, unitText }
  let salaryMin: number | undefined;
  let salaryMax: number | undefined;
  let salaryPeriod: RawVacancy['salaryPeriod'];
  const ms = jp.baseSalary?.value ?? jp.baseSalary;
  if (ms && typeof ms === 'object') {
    const lo = Number(ms.minValue ?? ms.value);
    const hi = Number(ms.maxValue ?? ms.value);
    const unit = String(ms.unitText ?? '').toUpperCase();
    if (Number.isFinite(lo) && lo > 0) {
      salaryMin = lo;
      salaryMax = Number.isFinite(hi) && hi >= lo ? hi : undefined;
      salaryPeriod = unit === 'HOUR' ? 'hour' : unit === 'MONTH' ? 'month' : unit === 'YEAR' ? 'year' : undefined;
      if (!salaryPeriod) {
        salaryMin = salaryMax = undefined; // непонятный период — пусть матчер ищет в тексте
      }
    }
  }

  // Локация: jobLocation может быть объектом или массивом.
  const locs = Array.isArray(jp.jobLocation) ? jp.jobLocation : jp.jobLocation ? [jp.jobLocation] : [];
  const locality = locs.map((l: any) => l?.address?.addressLocality).find(Boolean);

  const empRaw = String(Array.isArray(jp.employmentType) ? jp.employmentType[0] : jp.employmentType ?? '').toUpperCase();

  return {
    source,
    id: String(jp.url ?? url),
    url: String(jp.url ?? url),
    title,
    company: jp.hiringOrganization?.name ? cleanText(String(jp.hiringOrganization.name)) : undefined,
    location: locality ? cleanText(String(locality)) : undefined,
    description: cleanText(String(jp.description ?? '')),
    salaryMin,
    salaryMax,
    salaryPeriod,
    contractTime: empRaw.includes('FULL') ? 'full_time' : empRaw.includes('PART') ? 'part_time' : undefined,
    postedAt: jp.datePosted ? String(jp.datePosted) : undefined,
  };
}

// Обычный fetch с браузерным UA (иначе часть сайтов отдаёт 403).
export async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      accept: 'text/html,application/xhtml+xml',
      'accept-language': 'nl,en;q=0.8',
    },
  });
  if (!res.ok) throw new Error(`http ${res.status} ${url}`);
  return await res.text();
}
