// Проверка initData Telegram Mini App (адаптация проверенного кода koshel-worker).
// Алгоритм из доков Telegram: secret = HMAC("WebAppData", botToken),
// hash = HMAC(secret, data_check_string); плюс auth_date < 24 ч.

export interface TgUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

async function hmac(keyBytes: ArrayBuffer | Uint8Array, msg: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey('raw', keyBytes as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  return crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Возвращает пользователя, если подпись валидна, иначе null.
export async function verifyInitData(initData: string, botTokenRaw: string): Promise<TgUser | null> {
  if (!initData || initData.length > 4096) return null;
  const botToken = botTokenRaw.trim();
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');

  const secretKey = await hmac(new TextEncoder().encode('WebAppData'), botToken);
  const computed = toHex(await hmac(secretKey, dataCheckString));
  if (computed !== hash) return null;

  const authDate = Number(params.get('auth_date') ?? 0);
  if (authDate && Date.now() / 1000 - authDate > 86400) return null;

  try {
    const userRaw = params.get('user');
    if (!userRaw || userRaw.length > 1000) return null;
    return JSON.parse(userRaw) as TgUser;
  } catch {
    return null;
  }
}
