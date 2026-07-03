// Анализ вакансии: извлечение зарплаты/часов/языка/возраста из текста (NL/EN),
// скоринг 0..100 и вердикт «кому подходит» — обоим / только ему (21) / только ей (19) / никому.

import { CONFIG } from './config';
import { extractFacts } from './facts';
import { distanceKm } from './geo';
import type { RawVacancy, ScoredVacancy, Verdict } from './types';

// ── Утилиты текста ─────────────────────────────────────────────────────────────

// Убрать HTML-теги и сущности, схлопнуть пробелы. Источники зовут это сами,
// но перестраховываемся и здесь.
export function cleanText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&euro;/gi, '€')
    .replace(/&#?\w+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Число из строки вида "14", "14,50", "2.400", "2.400,50" (голландский формат).
function parseNum(s: string): number {
  let t = s.trim();
  if (/,\d{1,2}$/.test(t)) {
    // запятая — десятичный разделитель, точки — тысячи
    t = t.replace(/\./g, '').replace(',', '.');
  } else {
    // "2.400" — точка как разделитель тысяч; "14.50" — как десятичный
    t = /\.\d{3}(\D|$)/.test(t + ' ') ? t.replace(/\./g, '') : t;
    t = t.replace(/,/g, '');
  }
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : NaN;
}

const NUM = String.raw`(\d{1,2}(?:[.,]\d{1,2})?|\d{1,3}(?:\.\d{3})+(?:,\d{2})?|\d{3,5}(?:,\d{2})?)`;

// ── Зарплата ───────────────────────────────────────────────────────────────────

export interface SalaryInfo {
  hourly?: number; // низ вилки, приведённый к €/час
  hourlyMax?: number; // верх вилки, если была
  fromMonthly?: boolean; // ставка получена пересчётом из месячной
}

// Часов в месяце при fulltime ≈ 173 (40 ч × 52 нед / 12 мес).
const HOURS_PER_MONTH = 173;

// Извлечь ставку из текста. Понимает: "€14,50 per uur", "14 - 16 euro p/u",
// "€ 2.400 per maand", "€2400 bruto p/m", "per hour", "hourly".
export function extractSalary(text: string): SalaryInfo {
  const t = text.toLowerCase();

  // Вилка или одно число ПЕРЕД указанием периода: "€14,50 (– €16) per uur"
  const hourRe = new RegExp(
    String.raw`(?:€|eur[o]?\s?)?\s*${NUM}(?:\s*(?:-|–|tot|to)\s*(?:€|euro?\s?)?\s*${NUM})?\s*(?:euro\s*)?(?:bruto\s*)?(?:per\s*uur|p\/?u\.?|\/\s*uur|per\s*hour|an?\s*hour|hourly|\/\s*hour|uurloon)`,
    'g'
  );
  const monthRe = new RegExp(
    String.raw`(?:€|eur[o]?\s?)?\s*${NUM}(?:\s*(?:-|–|tot|to)\s*(?:€|euro?\s?)?\s*${NUM})?\s*(?:euro\s*)?(?:bruto\s*)?(?:per\s*maand|p\/?m\.?|\/\s*maand|per\s*month|monthly|maandsalaris)`,
    'g'
  );

  // Также обратный порядок: "uurloon van €14" / "salaris: € 2.600"
  const hourRe2 = /(?:uurloon|per uur|hourly rate)\D{0,12}€?\s*(\d{1,2}(?:[.,]\d{1,2})?)/;

  for (const m of t.matchAll(hourRe)) {
    const lo = parseNum(m[1]);
    const hi = m[2] ? parseNum(m[2]) : undefined;
    // защита от мусора: часовая ставка в NL реалистична в диапазоне 5..80
    if (lo >= 5 && lo <= 80) return { hourly: lo, hourlyMax: hi && hi <= 100 ? hi : undefined };
  }
  const m2 = t.match(hourRe2);
  if (m2) {
    const lo = parseNum(m2[1]);
    if (lo >= 5 && lo <= 80) return { hourly: lo };
  }
  for (const m of t.matchAll(monthRe)) {
    const lo = parseNum(m[1]);
    const hi = m[2] ? parseNum(m[2]) : undefined;
    if (lo >= 800 && lo <= 10000) {
      return {
        hourly: Math.round((lo / HOURS_PER_MONTH) * 10) / 10,
        hourlyMax: hi && hi <= 15000 ? Math.round((hi / HOURS_PER_MONTH) * 10) / 10 : undefined,
        fromMonthly: true,
      };
    }
  }
  return {};
}

// Нормализовать структурированную зарплату источника (Adzuna отдаёт годовую).
export function structuredHourly(v: RawVacancy): SalaryInfo {
  if (!v.salaryMin || !v.salaryPeriod) return {};
  const conv = (n: number) =>
    v.salaryPeriod === 'hour' ? n : v.salaryPeriod === 'month' ? n / HOURS_PER_MONTH : n / 12 / HOURS_PER_MONTH;
  const lo = Math.round(conv(v.salaryMin) * 10) / 10;
  const hi = v.salaryMax ? Math.round(conv(v.salaryMax) * 10) / 10 : undefined;
  if (lo < 3 || lo > 150) return {}; // мусорные данные
  return { hourly: lo, hourlyMax: hi, fromMonthly: v.salaryPeriod !== 'hour' };
}

// ── Занятость ─────────────────────────────────────────────────────────────────

export type Employment = 'fulltime' | 'parttime' | 'unknown';

export function detectEmployment(text: string, contractTime?: RawVacancy['contractTime']): Employment {
  if (contractTime === 'full_time') return 'fulltime';
  if (contractTime === 'part_time') return 'parttime';
  const t = text.toLowerCase();
  const full =
    /full[\s-]?time|fulltime|voltijd|\b(3[2-9]|40)\s*(?:-|–|tot|a|à)?\s*(3[2-9]|40)?\s*uur\b|\b40\s*uur|38\s*uur|36\s*uur/.test(
      t
    );
  const part = /part[\s-]?time|parttime|deeltijd|bijbaan|weekendbaan|vakantiewerk|zaterdagbaan/.test(t);
  if (full && !part) return 'fulltime';
  if (part && !full) return 'parttime';
  if (full && part) return 'fulltime'; // «fulltime of parttime» — нам ок
  return 'unknown';
}

// ── Язык ──────────────────────────────────────────────────────────────────────

export type LangRequirement = 'dutch_required' | 'english_ok' | 'none';

export function detectLanguage(text: string): LangRequirement {
  const t = text.toLowerCase();
  // Явные признаки, что нидерландский НЕ нужен / хватит английского.
  const noDutch =
    /geen nederlands|zonder nederlands|engels is voldoende|english is sufficient|english[- ]speaking|no dutch|dutch (?:is )?not required|geen taaleis|ook zonder nederlands/.test(
      t
    );
  if (noDutch) return 'english_ok';
  const englishOk = /\bengels\b|\benglish\b/.test(t);
  // Жёсткое требование нидерландского.
  const dutchRequired =
    /nederlands (?:is )?(?:vereist|verplicht|noodzakelijk)|goede beheersing van de nederlandse|nederlands in woord en geschrift|je spreekt (?:vloeiend |goed )?nederlands|nederlandse taal (?:is )?(?:een )?(?:vereiste|must)|nederlandstalig/.test(
      t
    );
  if (dutchRequired && !englishOk) return 'dutch_required';
  if (englishOk) return 'english_ok';
  return 'none';
}

// ── Образование / квалификация ───────────────────────────────────────────────
// У ребят нет нидерландских дипломов и «белого» опыта — вакансии, где просят
// образование или квалифицированную профессию, в теории не подходят вовсе.

export type Education = 'none' | 'mbo' | 'higher';

export function detectEducation(text: string): Education {
  const t = text.toLowerCase();
  if (/geen diploma|zonder diploma|geen opleiding (?:nodig|vereist)|no diploma|no degree/.test(t)) return 'none';
  if (
    /\b(?:hbo|wo)\b[^.]{0,25}(?:diploma|opleiding|niveau|werk|geschoold)|universitair|bachelor|master(?:diploma| degree)|\bdegree\b/.test(
      t
    )
  ) {
    return 'higher';
  }
  if (
    /mbo[- ]?(?:\d|niveau|diploma|opleiding|werk)|afgeronde (?:mbo|hbo|relevante)? ?opleiding|diploma (?:is )?(?:vereist|verplicht|noodzakelijk)/.test(
      t
    )
  ) {
    return 'mbo';
  }
  return 'none';
}

// Квалифицированные профессии (по названию) — требуют диплом/опыт/свободный NL.
const SKILLED_TITLE_RE =
  /developer|programmeur|software|engineer|consultant|analist|analyst|accountant|boekhouder|jurist|advocaat|adviseur|controller|recruiter|marketeer|pensioen|hypothe[ek]|verzekering|verpleeg|verzorgende|docent|leraar|stagiair|\bstage\b|trainee|financieel|administrat|beleidsmedewerker|projectleider|architect|management|co[öo]rdinator|begeleider|\btax\b|compliance|\bexpert\b|legal|lawyer|\bhr\b|human resources|specialist/i;

export function isSkilledTitle(title: string): boolean {
  return SKILLED_TITLE_RE.test(title);
}

// ── Возраст ───────────────────────────────────────────────────────────────────

// Минимальный возраст из текста: "21 jaar of ouder", "minimaal 18 jaar", "18+".
export function detectMinAge(text: string): number | undefined {
  const t = text.toLowerCase();
  const patterns = [
    /(?:minimaal|minstens|vanaf|min\.?)\s*(1[6-9]|2[0-5])\s*jaar/,
    /(1[6-9]|2[0-5])\s*jaar of ouder/,
    /(1[6-9]|2[0-5])\s*\+\s*(?:jaar)?/,
    /(?:at least|minimum age(?: of)?)\s*(1[6-9]|2[0-5])/,
    /ben je\s*(1[6-9]|2[0-5])\s*jaar/,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m) return parseInt(m[1], 10);
  }
  return undefined;
}

// ── Скоринг ───────────────────────────────────────────────────────────────────

// Пороги, которые можно переопределить настройками из Mini App (KV `cfg`).
export interface ScoreLimits {
  minHourlyEur: number;
  radiusKm: number;
}

export function scoreVacancy(v: RawVacancy, limits?: ScoreLimits): ScoredVacancy {
  const lim: ScoreLimits = limits ?? { minHourlyEur: CONFIG.minHourlyEur, radiusKm: CONFIG.radiusKm };
  const text = `${v.title} ${v.description}`;
  const t = cleanText(text).toLowerCase();
  const facts = extractFacts(v.title, t);
  const reasons: string[] = [];
  let score = 50;
  let verdict: Verdict = 'both';

  // 1. Язык — жёсткий фильтр.
  const lang = detectLanguage(t);
  if (lang === 'dutch_required' && !CONFIG.languages.dutch) {
    return { ...v, facts, score: 0, verdict: 'none', reasons: ['❌ требуется нидерландский язык'] };
  }

  // 1а. Квалификация — жёсткие фильтры: без NL-диплома и опыта такие вакансии
  // не подходят в принципе (см. кейс «medewerker administratie» с MBO-финансы).
  if (isSkilledTitle(v.title)) {
    return { ...v, facts, score: 0, verdict: 'none', reasons: ['❌ квалифицированная профессия — нужны диплом/опыт'] };
  }
  if (facts.category.id === 'office') {
    return { ...v, facts, score: 0, verdict: 'none', reasons: ['❌ офисная позиция — нужен свободный нидерландский'] };
  }
  const edu = detectEducation(t);
  if (edu !== 'none') {
    return {
      ...v,
      facts,
      score: 0,
      verdict: 'none',
      reasons: [`❌ требуется диплом (${edu === 'higher' ? 'HBO/WO' : 'MBO'}) — не подходит`],
    };
  }
  if (lang === 'english_ok') {
    score += 5;
    reasons.push('🗣 достаточно английского');
  }

  // 2. Занятость — parttime отсеиваем.
  const emp = detectEmployment(t, v.contractTime);
  if (emp === 'parttime') {
    return { ...v, facts, score: 0, verdict: 'none', reasons: ['❌ подработка (parttime), а нужен полный день'] };
  }
  if (emp === 'fulltime') {
    score += 10;
    reasons.push('🕐 полный день');
  } else {
    reasons.push('⚠️ график не указан — уточнить часы');
  }

  // 3. Зарплата: сначала структурированная (Adzuna), потом из текста.
  const sal = structuredHourly(v).hourly ? structuredHourly(v) : extractSalary(t);
  let hourly = sal.hourly;
  if (hourly !== undefined) {
    if (hourly < lim.minHourlyEur) {
      // ниже порога — отсев (даже верх вилки не спасает: низ = что реально предложат)
      return {
        ...v,
        facts,
        score: 0,
        verdict: 'none',
        hourlyEur: hourly,
        reasons: [`❌ ставка €${hourly}/час — ниже порога €${lim.minHourlyEur}`],
      };
    }
    const range = sal.hourlyMax && sal.hourlyMax > hourly ? `–${sal.hourlyMax}` : '';
    reasons.push(`💶 ставка €${hourly}${range}/час${sal.fromMonthly ? ' (пересчёт из месячной)' : ''}`);
    score += hourly >= 16 ? 25 : 20;
  } else {
    reasons.push('⚠️ ставка не указана — спросить при отклике');
  }

  // 4. Возраст: 21+ отсекает её (19), 20+ тоже; 18 и ниже — ок обоим.
  const minAge = detectMinAge(t);
  if (minAge !== undefined) {
    const him = CONFIG.people.him.age >= minAge;
    const her = CONFIG.people.her.age >= minAge;
    if (him && !her) {
      verdict = 'him';
      reasons.push(`👤 только ${CONFIG.people.him.name}: требуется ${minAge}+`);
    } else if (!him && her) {
      verdict = 'her';
      reasons.push(`👤 только ${CONFIG.people.her.name}: требуется ${minAge}+`);
    } else if (!him && !her) {
      return { ...v, facts, score: 0, verdict: 'none', reasons: [`❌ требуется возраст ${minAge}+`] };
    }
  }

  // 5. Расстояние.
  const dist = distanceKm(v);
  if (dist !== undefined) {
    if (dist > lim.radiusKm) {
      return {
        ...v,
        facts,
        score: 0,
        verdict: 'none',
        distanceKm: dist,
        reasons: [`❌ далеко: ~${dist} км от дома (лимит ${lim.radiusKm})`],
      };
    }
    score += 10;
    reasons.push(`🚗 ~${dist} км от дома`);
  } else if (v.location) {
    reasons.push(`📍 ${v.location} — расстояние уточнить`);
  }

  // 6. Бонусы.
  if (CONFIG.preferredKeywords.some((k) => t.includes(k))) {
    score += 10;
    reasons.push('⭐ приоритетный тип работы (склад/производство/доставка/клининг)');
  }
  if (CONFIG.noExperienceKeywords.some((k) => t.includes(k))) {
    score += 5;
    reasons.push('🆕 без опыта — ок');
  }
  if (CONFIG.shiftBonusKeywords.some((k) => t.includes(k))) {
    score += 5;
    reasons.push('🌙 есть сменные/ночные надбавки');
  }
  if (CONFIG.hasCar && /rijbewijs\s*b\b|driving licen[cs]e|eigen vervoer|own transport/.test(t)) {
    score += 5;
    reasons.push('🚙 нужны права/транспорт — у вас есть');
  }

  return {
    ...v,
    facts,
    score: Math.min(100, score),
    hourlyEur: hourly,
    hourlyMaxEur: sal.hourlyMax,
    distanceKm: dist,
    verdict,
    reasons,
  };
}
