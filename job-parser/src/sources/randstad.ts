// Источник №5: randstad.nl — крупнейшее uitzend-агентство Нидерландов.
// ВНИМАНИЕ: разметка сайта не проверялась из среды разработки (сеть закрыта) —
// после деплоя проверь отчёт /run; если found=0 с ошибкой, поправь listingUrls/linkRe.

import type { RawVacancy } from '../types';
import { fetchHtmlSource } from './htmlSource';

export async function fetchRandstad(isNew: (url: string) => Promise<boolean>): Promise<RawVacancy[]> {
  return fetchHtmlSource({
    source: 'randstad',
    listingUrls: [
      'https://www.randstad.nl/vacatures/rotterdam',
      'https://www.randstad.nl/werk-zoeken/rotterdam',
      'https://www.randstad.nl/vacatures?location=rotterdam',
    ],
    // детальные страницы вида /vacatures/<id>-<slug>; страницы поиска исключаем
    linkRe: /href="((?:https?:\/\/www\.randstad\.nl)?\/(?:vacatures|banen)\/(?!zoeken)[^"?]*\d[^"?]*)"/gi,
    origin: 'https://www.randstad.nl',
    isNew,
    maxDetails: 6,
  });
}
