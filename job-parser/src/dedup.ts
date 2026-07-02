// Дедупликация. ВАЖНО: на бесплатном плане Workers KV-операции считаются в лимит
// подзапросов (50 на вызов), поэтому НЕ делаем ключ на каждую вакансию, а храним
// один ключ `seen:<source>` со списком хэшей: 1 чтение + 1 запись на источник за прогон.

const CAP = 3000; // сколько последних хэшей помним на источник (FIFO)

// SHA-1 от строки → hex. crypto.subtle есть и в Workers, и в Node 18+.
export async function sha1(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class SeenStore {
  private set = new Set<string>();
  private order: string[] = []; // порядок добавления для FIFO-прунинга
  private dirty = false;

  constructor(
    private kv: KVNamespace,
    private source: string
  ) {}

  private get key(): string {
    return `seen:${this.source}`;
  }

  async load(): Promise<void> {
    try {
      const raw = await this.kv.get(this.key);
      if (raw) {
        this.order = JSON.parse(raw) as string[];
        this.set = new Set(this.order);
      }
    } catch {
      // битое значение — начинаем с чистого листа
      this.order = [];
      this.set = new Set();
    }
  }

  async has(id: string): Promise<boolean> {
    return this.set.has(await sha1(id));
  }

  async add(id: string): Promise<void> {
    const h = await sha1(id);
    if (this.set.has(h)) return;
    this.set.add(h);
    this.order.push(h);
    this.dirty = true;
  }

  async save(): Promise<void> {
    if (!this.dirty) return;
    if (this.order.length > CAP) {
      const drop = this.order.length - CAP;
      for (const h of this.order.slice(0, drop)) this.set.delete(h);
      this.order = this.order.slice(drop);
    }
    await this.kv.put(this.key, JSON.stringify(this.order));
    this.dirty = false;
  }
}
