// Ротация HTML-источников по прогонам: все 4 за один прогон не влезают в лимит
// 50 подзапросов воркера (бесплатный план), поэтому чередуем группы по 2.
// Adzuna в ротации не участвует — он дешёвый (2 запроса) и работает каждый прогон.

import type { SourceId } from './types';

export const HTML_GROUPS: readonly SourceId[][] = [
  ['uitzendbureau', 'youngcapital'],
  ['olympia', 'randstad'],
];

// Индекс группы для момента времени: чередуется каждый час, а так как cron ходит
// раз в 3 часа — фактически каждый прогон берёт другую группу.
export function pickGroupIndex(nowMs: number): number {
  return Math.floor(nowMs / 3_600_000) % HTML_GROUPS.length;
}
