// Хранилище Mini App в KV: лента вакансий (feed), избранное (favs),
// настройки (cfg). Всё общее на двоих — семейный инструмент.

import { CONFIG } from './config';
import type { ScoredVacancy } from './types';

const FEED_KEY = 'feed';
const FAVS_KEY = 'favs';
const CFG_KEY = 'cfg';
const FEED_CAP = 120;

// Обрезанная запись ленты — только то, что нужно карточке в приложении.
export interface FeedItem {
  id: string;
  at: string; // когда попала в ленту (ISO)
  title: string;
  company?: string;
  location?: string;
  distanceKm?: number;
  hourly?: number;
  hourlyMax?: number;
  cat: { id: string; emoji: string; label: string };
  verdict: 'both' | 'him' | 'her';
  score: number;
  url: string;
  cond: string[]; // условия-чипы («32–40 ч/нед», «без опыта», …)
  duties: string[];
  source: string;
}

export function toFeedItem(v: ScoredVacancy, at: string): FeedItem {
  const f = v.facts;
  const cond: string[] = [];
  cond.push(f.hoursPerWeek ? `${f.hoursPerWeek} ч/нед` : 'fulltime');
  if (f.night) cond.push('ночные');
  else if (f.shifts) cond.push('смены');
  if (f.startDirect) cond.push('старт сразу');
  if (f.noExperience) cond.push('без опыта');
  if (f.englishOk) cond.push('англ. ок');
  if (f.travelAllowance) cond.push('проезд оплачивают');
  if (f.weeklyPay) cond.push('выплата/нед');
  if (f.experience) cond.push('⚠️ просят опыт');
  if (f.ukrainian) cond.unshift('🇺🇦 украинцы ок');
  return {
    id: v.id,
    at,
    title: v.title.slice(0, 120),
    company: v.company?.slice(0, 60),
    location: v.location?.slice(0, 60),
    distanceKm: v.distanceKm,
    hourly: v.hourlyEur,
    hourlyMax: v.hourlyMaxEur,
    cat: v.facts.category,
    verdict: v.verdict === 'none' ? 'both' : v.verdict,
    score: v.score,
    url: v.url,
    cond,
    duties: f.duties,
    source: v.source,
  };
}

export async function readFeed(kv: KVNamespace): Promise<FeedItem[]> {
  try {
    const raw = await kv.get(FEED_KEY);
    return raw ? (JSON.parse(raw) as FeedItem[]) : [];
  } catch {
    return [];
  }
}

// Добавить новые записи в начало ленты (дедуп по id, кап FEED_CAP).
export function mergeFeed(existing: FeedItem[], fresh: FeedItem[]): FeedItem[] {
  const seen = new Set(fresh.map((i) => i.id));
  const kept = existing.filter((i) => !seen.has(i.id));
  return [...fresh, ...kept].slice(0, FEED_CAP);
}

export async function pushFeed(kv: KVNamespace, fresh: FeedItem[]): Promise<void> {
  if (fresh.length === 0) return;
  const merged = mergeFeed(await readFeed(kv), fresh);
  await kv.put(FEED_KEY, JSON.stringify(merged));
}

// ── Избранное ─────────────────────────────────────────────────────────────────

export type FavStatus = 'fav' | 'applied' | 'hidden';
export interface FavEntry {
  status: FavStatus;
  by: string; // имя того, кто отметил
  at: string;
}
export type Favs = Record<string, FavEntry>;

export async function readFavs(kv: KVNamespace): Promise<Favs> {
  try {
    const raw = await kv.get(FAVS_KEY);
    return raw ? (JSON.parse(raw) as Favs) : {};
  } catch {
    return {};
  }
}

// status=null — снять отметку. Кап 300 записей (старейшие вылетают).
export async function setFav(kv: KVNamespace, id: string, status: FavStatus | null, by: string): Promise<Favs> {
  const favs = await readFavs(kv);
  if (status === null) delete favs[id];
  else favs[id] = { status, by: by.slice(0, 30), at: new Date().toISOString() };
  const entries = Object.entries(favs);
  const capped = entries.length > 300 ? Object.fromEntries(entries.slice(entries.length - 300)) : favs;
  await kv.put(FAVS_KEY, JSON.stringify(capped));
  return capped;
}

// ── Настройки ─────────────────────────────────────────────────────────────────

// Что можно менять из приложения (поверх дефолтов CONFIG).
export interface Settings {
  minHourlyEur: number;
  radiusKm: number;
  maxPerRun: number;
  // Категории, которые НЕ присылать в подборки Telegram (лента показывает всё).
  mutedCats: string[];
}

// Известные id категорий (см. facts.ts) — для валидации mutedCats.
export const CAT_IDS = [
  'warehouse',
  'delivery',
  'production',
  'cleaning',
  'horeca',
  'retail',
  'construction',
  'office',
  'other',
] as const;

export const DEFAULT_SETTINGS: Settings = {
  minHourlyEur: CONFIG.minHourlyEur,
  radiusKm: CONFIG.radiusKm,
  maxPerRun: CONFIG.maxPerRun,
  mutedCats: [],
};

// Зажимаем в разумные рамки — и от опечаток, и от выхода за лимиты воркера.
function clampSettings(s: Partial<Settings>): Settings {
  const clamp = (n: unknown, lo: number, hi: number, dflt: number) => {
    const x = Number(n);
    return Number.isFinite(x) ? Math.min(hi, Math.max(lo, Math.round(x))) : dflt;
  };
  // mutedCats: только известные id; максимум 8 из 9 — хотя бы одна категория остаётся живой
  const muted = Array.isArray(s.mutedCats)
    ? s.mutedCats.filter((c): c is string => typeof c === 'string' && (CAT_IDS as readonly string[]).includes(c)).slice(0, 8)
    : DEFAULT_SETTINGS.mutedCats;
  return {
    minHourlyEur: clamp(s.minHourlyEur, 5, 40, DEFAULT_SETTINGS.minHourlyEur),
    radiusKm: clamp(s.radiusKm, 5, 60, DEFAULT_SETTINGS.radiusKm),
    maxPerRun: clamp(s.maxPerRun, 3, 10, DEFAULT_SETTINGS.maxPerRun),
    mutedCats: muted,
  };
}

export async function readSettings(kv: KVNamespace): Promise<Settings> {
  try {
    const raw = await kv.get(CFG_KEY);
    return raw ? clampSettings(JSON.parse(raw) as Partial<Settings>) : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function writeSettings(kv: KVNamespace, s: Partial<Settings>): Promise<Settings> {
  const clamped = clampSettings(s);
  await kv.put(CFG_KEY, JSON.stringify(clamped));
  return clamped;
}
