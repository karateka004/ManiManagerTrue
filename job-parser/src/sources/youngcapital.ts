// Источник №3: youngcapital.nl — агентство для молодых (18–25), много вакансий
// склад/производство/доставка в Роттердаме и окрестностях.
// Проверено по живому сайту: листинг fulltime-vacatures/rotterdam (уже отфильтрован
// по полной занятости), детальные /vacatures/<id>-<slug> с JSON-LD JobPosting.

import type { RawVacancy } from '../types';
import { fetchHtmlSource } from './htmlSource';

export async function fetchYoungCapital(isNew: (url: string) => Promise<boolean>): Promise<RawVacancy[]> {
  return fetchHtmlSource({
    source: 'youngcapital',
    listingUrls: [
      'https://www.youngcapital.nl/fulltime-vacatures/rotterdam',
      'https://www.youngcapital.nl/vacatures-in/rotterdam',
    ],
    // детальные страницы вида /vacatures/<id>-<slug>
    linkRe: /href="((?:https?:\/\/www\.youngcapital\.nl)?\/vacatures\/\d+[^"]*)"/gi,
    origin: 'https://www.youngcapital.nl',
    isNew,
    maxDetails: 8,
  });
}
