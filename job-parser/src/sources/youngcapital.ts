// Источник №3: youngcapital.nl — агентство для молодых (18–25), много вакансий
// склад/производство/доставка в Роттердаме и окрестностях.
// ВНИМАНИЕ: разметка сайта не проверялась из среды разработки (сеть закрыта) —
// после деплоя проверь отчёт /run; если found=0 с ошибкой, поправь listingUrls/linkRe.

import type { RawVacancy } from '../types';
import { fetchHtmlSource } from './htmlSource';

export async function fetchYoungCapital(isNew: (url: string) => Promise<boolean>): Promise<RawVacancy[]> {
  return fetchHtmlSource({
    source: 'youngcapital',
    listingUrls: [
      'https://www.youngcapital.nl/vacatures/zoeken?search%5Bkeywords%5D=&search%5Bcity%5D=Rotterdam&search%5Bdistance%5D=30',
      'https://www.youngcapital.nl/vacatures-in-rotterdam',
      'https://www.youngcapital.nl/vacatures/rotterdam',
    ],
    // детальные страницы вида /vacatures/<id>-<slug>
    linkRe: /href="((?:https?:\/\/www\.youngcapital\.nl)?\/vacatures\/\d+[^"]*)"/gi,
    origin: 'https://www.youngcapital.nl',
    isNew,
    maxDetails: 8,
  });
}
