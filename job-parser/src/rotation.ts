// Ротация HTML-источников по прогонам: все 4 за один прогон не влезают в лимит
// 50 подзапросов воркера (бесплатный план), поэтому чередуем группы по 2.
// Adzuna в ротации не участвует — он дешёвый (2 запроса) и работает каждый прогон.

import type { SourceId } from './types';

export const HTML_GROUPS: readonly SourceId[][] = [
  ['uitzendbureau', 'youngcapital'],
  ['olympia', 'randstad'],
  ['tempoteam'], // сайтмап 550 КБ + детальные — группа-одиночка
];

// Индекс группы = номер 3-часового слота: каждый cron-прогон (раз в 3 ч)
// сдвигается на следующую группу и за сутки все группы отрабатывают несколько раз.
// (Раньше было hourIndex % len — при len=3 и шаге 3 часа выпадала одна и та же группа.)
export function pickGroupIndex(nowMs: number): number {
  return Math.floor(nowMs / (3 * 3_600_000)) % HTML_GROUPS.length;
}
