// Источник №4: olympia.nl — крупное uitzend-агентство (склад/логистика/производство).
// Проверено по живому сайту: листинг с фильтром locatie, детальные страницы
// /vacatures/<id>/<slug>/ с JSON-LD JobPosting (зарплата в MONTH).
// (Tempo-Team напрямую спарсить нельзя — их список рисуется скриптом в браузере;
// вакансии Tempo-Team приходят через Adzuna.)

import type { RawVacancy } from '../types';
import { fetchHtmlSource } from './htmlSource';

export async function fetchOlympia(isNew: (url: string) => Promise<boolean>): Promise<RawVacancy[]> {
  return fetchHtmlSource({
    source: 'olympia',
    // Кандидаты по очереди: сайт изредка отдаёт 404 на запрос с параметрами.
    listingUrls: [
      'https://www.olympia.nl/vacatures/?zoekterm=&locatie=Rotterdam',
      'https://www.olympia.nl/vacatures/?locatie=Rotterdam',
    ],
    linkRe: /href="((?:https?:\/\/www\.olympia\.nl)?\/vacatures\/\d+\/[^"?]+)"/gi,
    origin: 'https://www.olympia.nl',
    isNew,
    maxDetails: 6,
  });
}
