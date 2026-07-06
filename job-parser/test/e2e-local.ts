// Локальный сквозной прогон парсера (для проверки без деплоя): реальные сайты,
// реальный Telegram, KV — в памяти. Запуск:
//   BOT_TOKEN=... ADZUNA_APP_ID=... ADZUNA_APP_KEY=... npx tsx test/e2e-local.ts [group]

import { runParse, type Env } from '../src/index';

// tsconfig собран под workers-types (без @types/node) — process объявляем сами.
declare const process: {
  env: Record<string, string | undefined>;
  argv: string[];
  exit: (code: number) => never;
};

// Минимальный KV в памяти — только то, что использует воркер.
function memoryKV(): KVNamespace {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
  } as unknown as KVNamespace;
}

async function main() {
  const env: Env = {
    JOBS: memoryKV(),
    OWNER_CHAT_ID: process.env.OWNER_CHAT_ID ?? '439944083',
    BOT_TOKEN: process.env.BOT_TOKEN ?? '',
    ADZUNA_APP_ID: process.env.ADZUNA_APP_ID,
    ADZUNA_APP_KEY: process.env.ADZUNA_APP_KEY,
    RUN_KEY: 'local',
  };
  if (!env.BOT_TOKEN) throw new Error('нужен BOT_TOKEN в переменных окружения');

  const groupArg = process.argv[2];
  const report = await runParse(env, groupArg === undefined ? undefined : parseInt(groupArg, 10));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
