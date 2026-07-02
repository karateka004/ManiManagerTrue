// Источник №4: tempo-team.nl — крупное uitzend-агентство (Randstad Group),
// много склада/производства/логистики, часто без требования нидерландского.
// ВНИМАНИЕ: разметка сайта не проверялась из среды разработки (сеть закрыта) —
// после деплоя проверь отчёт /run; если found=0 с ошибкой, поправь listingUrls/linkRe.

import type { RawVacancy } from '../types';
import { fetchHtmlSource } from './htmlSource';

export async function fetchTempoTeam(isNew: (url: string) => Promise<boolean>): Promise<RawVacancy[]> {
  return fetchHtmlSource({
    source: 'tempoteam',
    listingUrls: [
      'https://www.tempo-team.nl/vacatures/rotterdam',
      'https://www.tempo-team.nl/vacatures/zoeken/?location=Rotterdam',
      'https://www.tempo-team.nl/werk-zoeken/rotterdam',
    ],
    // детальные страницы вида /vacatures/<id>-<slug>; страницы поиска (/zoeken) исключаем
    linkRe: /href="((?:https?:\/\/www\.tempo-team\.nl)?\/vacatures\/(?!zoeken)[^"?]*\d[^"?]*)"/gi,
    origin: 'https://www.tempo-team.nl',
    isNew,
    maxDetails: 6,
  });
}
