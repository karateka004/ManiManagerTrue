/**
 * Ограничители частоты на счётчиках в KV.
 *
 * Вынесено из index.ts, потому что теперь этим пользуется и бот: у него ещё и
 * платный разбор за спиной, и одному человеку с залипшей клавиатурой нельзя
 * позволить оплатить нам счёт.
 */
import type { Env } from './env'

/**
 * true, если лимит уже превышен. Ключ живёт `ttlSec` (минимум KV — 60 с), то
 * есть окно примерно фиксированной длины. Атомарности нет, но для анти-спама
 * достаточно (Worker per-isolate однопоточен). Считаем по проверенному id.
 */
export async function isRateLimited(
  env: Env,
  scope: string,
  id: string | number,
  limit: number,
  ttlSec: number,
): Promise<boolean> {
  const key = `rl:${scope}:${id}`
  const cur = Number((await env.REFERRALS.get(key)) ?? '0')
  if (cur >= limit) return true
  await env.REFERRALS.put(key, String(cur + 1), { expirationTtl: ttlSec })
  return false
}
