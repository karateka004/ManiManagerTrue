// Источник №2: uitzendbureau.nl — агрегатор вакансий uitzend-агентств
// (типичный канал работы без нидерландского). Парсим JSON-LD с детальных страниц.
// Проверено по живому сайту: детальные страницы /vacature/<id>-<slug>.

import type { RawVacancy } from '../types';
import { fetchHtmlSource } from './htmlSource';

export async function fetchUitzendbureau(isNew: (url: string) => Promise<boolean>): Promise<RawVacancy[]> {
  return fetchHtmlSource({
    source: 'uitzendbureau',
    listingUrls: ['https://www.uitzendbureau.nl/vacatures/rotterdam'],
    // детальные страницы вида /vacature/<id>-<slug>
    linkRe: /href="((?:https?:\/\/www\.uitzendbureau\.nl)?\/vacature\/\d+-[^"?]+)"/gi,
    origin: 'https://www.uitzendbureau.nl',
    isNew,
    maxDetails: 8,
  });
}
