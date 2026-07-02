// География: расстояние от дома (3015 BA Rotterdam) до города вакансии.
// Приоритет: координаты источника (haversine) → таблица городов агломерации → неизвестно.

import { CONFIG } from './config';

// Расстояние по прямой между координатами, км.
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

// Таблица городов вокруг Роттердама: примерное расстояние по дороге от 3015 BA, км.
// Ключи — в нижнем регистре без диакритики (см. normalizeCity).
const CITY_KM: Record<string, number> = {
  rotterdam: 0,
  schiedam: 6,
  pernis: 8,
  'capelle aan den ijssel': 9,
  capelle: 9,
  bergschenhoek: 10,
  rhoon: 10,
  barendrecht: 11,
  'berkel en rodenrijs': 12,
  hoogvliet: 12,
  poortugaal: 12,
  vlaardingen: 12,
  'krimpen aan den ijssel': 12,
  ridderkerk: 13,
  'nieuwerkerk aan den ijssel': 13,
  bleiswijk: 15,
  botlek: 15,
  delft: 16,
  spijkenisse: 16,
  pijnacker: 16,
  'hendrik-ido-ambacht': 18,
  maassluis: 18,
  rozenburg: 18,
  moordrecht: 18,
  alblasserdam: 19,
  zwijndrecht: 20,
  rijswijk: 20,
  'oud-beijerland': 21,
  waddinxveen: 22,
  naaldwijk: 22,
  maasdijk: 22,
  papendrecht: 22,
  dordrecht: 23,
  zoetermeer: 25,
  gouda: 25,
  'den haag': 25,
  'the hague': 25,
  "'s-gravenhage": 25,
  brielle: 25,
  'hoek van holland': 27,
  europoort: 28,
  sliedrecht: 28,
  hellevoetsluis: 30,
  maasvlakte: 38,
};

// Нормализация названия города: нижний регистр, без диакритики и лишнего.
export function normalizeCity(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[,.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Расстояние от дома до вакансии. undefined = город не распознан.
export function distanceKm(v: { lat?: number; lon?: number; location?: string }): number | undefined {
  if (typeof v.lat === 'number' && typeof v.lon === 'number' && (v.lat !== 0 || v.lon !== 0)) {
    return haversineKm(CONFIG.home.lat, CONFIG.home.lon, v.lat, v.lon);
  }
  if (!v.location) return undefined;
  const norm = normalizeCity(v.location);
  // Точное совпадение, затем вхождение (location бывает вида "Rotterdam, Zuid-Holland").
  if (norm in CITY_KM) return CITY_KM[norm];
  for (const [city, km] of Object.entries(CITY_KM)) {
    if (norm.includes(city)) return km;
  }
  return undefined;
}
