// Источник №5: randstad.nl — крупнейшее uitzend-агентство Нидерландов.
// Проверено по живому сайту: листинг /vacatures/rotterdam, детальные страницы
// /vacatures/<id>/<slug> с JSON-LD JobPosting.

import type { RawVacancy } from '../types';
import { fetchHtmlSource } from './htmlSource';

export async function fetchRandstad(isNew: (url: string) => Promise<boolean>): Promise<RawVacancy[]> {
  return fetchHtmlSource({
    source: 'randstad',
    listingUrls: ['https://www.randstad.nl/vacatures/rotterdam'],
    // детальные страницы вида /vacatures/<id>/<slug>
    linkRe: /href="((?:https?:\/\/www\.randstad\.nl)?\/vacatures\/\d+\/[^"?]+)"/gi,
    origin: 'https://www.randstad.nl',
    isNew,
    maxDetails: 6,
  });
}
