// Источник №2: uitzendbureau.nl — агрегатор вакансий uitzend-агентств
// (типичный канал работы без нидерландского). Парсим JSON-LD с детальных страниц.
// ВНИМАНИЕ: разметка сайта не проверялась из среды разработки (сеть закрыта) —
// после деплоя проверь отчёт /run; если found=0 с ошибкой, поправь listingUrls/linkRe.

import type { RawVacancy } from '../types';
import { fetchHtmlSource } from './htmlSource';

export async function fetchUitzendbureau(isNew: (url: string) => Promise<boolean>): Promise<RawVacancy[]> {
  return fetchHtmlSource({
    source: 'uitzendbureau',
    listingUrls: [
      'https://www.uitzendbureau.nl/vacatures/fulltime/rotterdam',
      'https://www.uitzendbureau.nl/vacatures/rotterdam',
    ],
    // детальные страницы вида /vacature/<slug> или /vacatures/<slug> с цифрами
    linkRe: /href="((?:https?:\/\/www\.uitzendbureau\.nl)?\/vacatures?\/[a-z0-9][^"]*\d[^"]*)"/gi,
    origin: 'https://www.uitzendbureau.nl',
    isNew,
    maxDetails: 8,
  });
}
