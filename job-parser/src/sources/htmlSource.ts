// Каркас HTML-источника: страница списка → ссылки на вакансии → детальные
// страницы → JSON-LD JobPosting. Ссылки, которые уже видели (KV), не открываем —
// бережём лимит подзапросов воркера.

import type { RawVacancy, SourceId } from '../types';
import { extractJsonLd, fetchHtml, findJobPostings, jobPostingToVacancy } from './jsonld';

export interface HtmlSourceOpts {
  source: SourceId;
  listingUrls: string[]; // кандидаты страниц списка — используется первая отвечающая
  linkRe: RegExp; // регулярка ссылок на детальные страницы (глобальная, группа 1 = href)
  origin: string; // для достройки относительных ссылок
  isNew: (url: string) => Promise<boolean>; // false = уже видели, не открывать
  maxDetails: number; // сколько детальных страниц открыть за прогон
}

export async function fetchHtmlSource(opts: HtmlSourceOpts): Promise<RawVacancy[]> {
  // 1. Первая живая страница списка.
  let listingHtml: string | null = null;
  let lastErr: unknown;
  for (const url of opts.listingUrls) {
    try {
      listingHtml = await fetchHtml(url);
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (listingHtml === null) throw lastErr ?? new Error('listing unavailable');

  // 2. Вакансии могут лежать JSON-LD прямо на списке (редко, но дёшево проверить).
  const inline = findJobPostings(extractJsonLd(listingHtml))
    .map((jp) => jobPostingToVacancy(jp, opts.source, opts.listingUrls[0]))
    .filter((v): v is RawVacancy => v !== null && v.description.length > 40);
  if (inline.length > 3) return inline;

  // 3. Ссылки на детальные страницы.
  const links: string[] = [];
  for (const m of listingHtml.matchAll(opts.linkRe)) {
    let href = m[1];
    if (href.startsWith('/')) href = opts.origin + href;
    if (!href.startsWith('http')) continue;
    href = href.split('#')[0];
    if (!links.includes(href)) links.push(href);
  }

  // 4. Открываем только новые, с капом.
  const out: RawVacancy[] = [];
  for (const href of links) {
    if (out.length >= opts.maxDetails) break;
    if (!(await opts.isNew(href))) continue;
    try {
      const html = await fetchHtml(href);
      const jp = findJobPostings(extractJsonLd(html))[0];
      if (!jp) continue;
      const v = jobPostingToVacancy(jp, opts.source, href);
      if (v) {
        v.id = href; // дедуп по URL детальной страницы
        v.url = href;
        out.push(v);
      }
    } catch (e) {
      console.log(`${opts.source}: detail failed ${href}: ${e}`);
    }
  }
  return out;
}
