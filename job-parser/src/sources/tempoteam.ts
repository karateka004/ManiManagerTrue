// Источник: tempo-team.nl. Листинг у них — SPA (не парсится), но есть
// job-sitemap.xml (~3000 вакансий, lastmod, город в слаге), а детальные страницы
// содержат JSON-LD JobPosting — берём вакансии через сайтмап.

import type { RawVacancy } from '../types';
import { extractJsonLd, fetchHtml, findJobPostings, jobPostingToVacancy } from './jsonld';

const SITEMAP = 'https://www.tempo-team.nl/job-sitemap.xml';
const MAX_DETAILS = 6;
const FRESH_DAYS = 3;

// Города зоны поиска в slug-форме (встречаются в URL вакансии).
const CITY_SLUGS = [
  'rotterdam', 'schiedam', 'vlaardingen', 'spijkenisse', 'barendrecht', 'ridderkerk',
  'capelle', 'delft', 'dordrecht', 'gouda', 'zoetermeer', 'den-haag', 'rijswijk',
  'maassluis', 'zwijndrecht', 'papendrecht', 'alblasserdam', 'naaldwijk', 'wateringen',
  'berkel', 'bergschenhoek', 'bleiswijk', 'pijnacker', 'nieuwerkerk', 'krimpen',
  'hoogvliet', 'brielle', 'hellevoetsluis', 'oud-beijerland', 'hendrik-ido-ambacht',
];

export async function fetchTempoTeam(isNew: (url: string) => Promise<boolean>): Promise<RawVacancy[]> {
  const xml = await fetchHtml(SITEMAP);

  // Пары <loc>…</loc> + <lastmod>…</lastmod> внутри <url>.
  const fresh: string[] = [];
  const cutoff = Date.now() - FRESH_DAYS * 24 * 3600e3;
  for (const m of xml.matchAll(/<url>\s*(?:<changefreq>[^<]*<\/changefreq>\s*)?<loc>([^<]+)<\/loc>[\s\S]*?<lastmod>([^<]+)<\/lastmod>[\s\S]*?<\/url>/g)) {
    const url = m[1].trim();
    if (!/\/vacatures\/\d+\//.test(url)) continue;
    if (new Date(m[2].trim()).getTime() < cutoff) continue;
    fresh.push(url);
  }

  // Сначала — вакансии с городом зоны в слаге, потом остальные свежие
  // (у части слагов города нет — их локацию проверит матчер по JSON-LD).
  const inZone = fresh.filter((u) => CITY_SLUGS.some((c) => u.includes(c)));
  const rest = fresh.filter((u) => !inZone.includes(u));
  const candidates = [...inZone, ...rest];

  const out: RawVacancy[] = [];
  for (const url of candidates) {
    if (out.length >= MAX_DETAILS) break;
    if (!(await isNew(url))) continue;
    try {
      const html = await fetchHtml(url);
      const jp = findJobPostings(extractJsonLd(html))[0];
      if (!jp) continue;
      const v = jobPostingToVacancy(jp, 'tempoteam', url);
      if (v) {
        v.id = url;
        v.url = url;
        out.push(v);
      }
    } catch (e) {
      console.log(`tempoteam: detail failed ${url}: ${e}`);
    }
  }
  return out;
}

// Для юнит-теста: выбор свежих URL из XML без сети.
export function parseSitemapFresh(xml: string, nowMs: number, freshDays = FRESH_DAYS): string[] {
  const out: string[] = [];
  const cutoff = nowMs - freshDays * 24 * 3600e3;
  for (const m of xml.matchAll(/<url>\s*(?:<changefreq>[^<]*<\/changefreq>\s*)?<loc>([^<]+)<\/loc>[\s\S]*?<lastmod>([^<]+)<\/lastmod>[\s\S]*?<\/url>/g)) {
    const url = m[1].trim();
    if (!/\/vacatures\/\d+\//.test(url)) continue;
    if (new Date(m[2].trim()).getTime() < cutoff) continue;
    out.push(url);
  }
  return out;
}
