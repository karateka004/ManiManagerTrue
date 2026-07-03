// «Выжимка» вакансии: категория работы и структурированные факты из текста
// (NL/EN-словари → русские подписи). Используется в карточке Telegram, чтобы
// не открывать ссылку зря.

import type { Facts, JobCategory } from './types';

// Категории в порядке приоритета: первое совпадение побеждает
// (сначала ищем в названии, потом в описании).
const CATEGORIES: Array<{ cat: JobCategory; re: RegExp }> = [
  {
    cat: { id: 'delivery', emoji: '🚚', label: 'Доставка / водитель' },
    re: /bezorg|koerier|chauffeur|delivery|courier|pakket|rijder/i,
  },
  {
    cat: { id: 'warehouse', emoji: '📦', label: 'Склад / логистика' },
    re: /orderpick|orderverzamel|magazijn|warehouse|logistiek|logistics|heftruck|reachtruck|forklift|distributie|sorteer|inpak|verpak|expeditie|laden|lossen/i,
  },
  {
    cat: { id: 'production', emoji: '🏭', label: 'Производство' },
    re: /productie|production|fabriek|factory|operator|assemblage|assembly|montage|voedings|food|kwekerij|\bkas\b|greenhouse|machinaal/i,
  },
  {
    cat: { id: 'cleaning', emoji: '🧹', label: 'Клининг' },
    re: /schoonmaak|schoonmaker|cleaning|cleaner|housekeeping|glazenwasser/i,
  },
  {
    cat: { id: 'horeca', emoji: '🍽', label: 'Хорека / кухня' },
    re: /horeca|keuken|kok\b|restaurant|catering|afwas|barista|bediening|hotel/i,
  },
  {
    cat: { id: 'retail', emoji: '🛒', label: 'Магазины' },
    re: /winkel|supermarkt|vakkenvuller|retail|kassa|shopmedewerker/i,
  },
  {
    cat: { id: 'construction', emoji: '🔧', label: 'Стройка / техника' },
    re: /monteur|technicus|elektro|installatie|bouw\b|timmerman|schilder|lasser|constructie/i,
  },
  {
    cat: { id: 'office', emoji: '💼', label: 'Офис / сервис' },
    re: /administrat|klantenservice|klantcontact|klantadviseur|callcenter|customer service|office|backoffice|receptie|secretar|data[- ]entry/i,
  },
];

const OTHER: JobCategory = { id: 'other', emoji: '📋', label: 'Разное' };

export function detectCategory(title: string, description: string): JobCategory {
  for (const { cat, re } of CATEGORIES) if (re.test(title)) return cat;
  for (const { cat, re } of CATEGORIES) if (re.test(description)) return cat;
  return OTHER;
}

// Задачи: ключевое слово (NL/EN) → русская подпись. До 3 в карточке.
const DUTIES: Array<[RegExp, string]> = [
  [/orderpick|orderverzamel|order picking/i, 'сборка заказов'],
  [/inpak|verpak|packing/i, 'упаковка'],
  [/sorteer|sorting/i, 'сортировка'],
  [/heftruck|reachtruck|forklift/i, 'работа на погрузчике'],
  [/laden|lossen|loading|unloading/i, 'погрузка-разгрузка'],
  [/productielijn|lopende band|assemblage|montage|machine/i, 'работа на линии/сборка'],
  [/kwaliteitscontrole|quality check|controleren/i, 'контроль качества'],
  [/schoonmaak|cleaning|schoonhouden/i, 'уборка'],
  [/bezorg|deliver|koerier/i, 'доставка'],
  [/rijden|chauffeur|driving/i, 'вождение'],
  [/klanten|customer|gasten/i, 'работа с клиентами'],
  [/keuken|afwas|kok\b/i, 'работа на кухне'],
  [/kas\b|kwekerij|greenhouse|planten/i, 'работа в теплице'],
  [/magazijn|warehouse/i, 'работа на складе'],
];

export function detectDuties(text: string): string[] {
  const out: string[] = [];
  for (const [re, label] of DUTIES) {
    if (re.test(text) && !out.includes(label)) out.push(label);
    if (out.length >= 3) break;
  }
  return out;
}

// Часы в неделю: «32-40 uur», «40 uur per week», «38 hours».
export function detectHoursPerWeek(text: string): string | undefined {
  const m1 = text.match(/\b([1-4]\d)\s*(?:-|–|tot|a|à)\s*([1-4]\d)\s*(?:uur|hours?|u\b)/i);
  if (m1) return `${m1[1]}–${m1[2]}`;
  const m2 = text.match(/\b([1-4]\d)\s*(?:uur|hours?)\s*(?:per\s*week|p\/?w)?/i);
  if (m2) return m2[1];
  return undefined;
}

export function extractFacts(title: string, text: string): Facts {
  const t = text.toLowerCase();
  const noExp = /geen ervaring|zonder ervaring|no experience|iedereen kan|wij leren je/i.test(t);
  // Просят опыт — пометка, не отсев (на такие всё равно стоит откликаться).
  const exp =
    !noExp &&
    /minimaal\s+\d+\s+(?:maanden|jaar)[^.]{0,30}(?:ervaring|gewerkt)|ervaring\s+als\b|aantoonbare ervaring|\d+\s+(?:maanden|jaar)\s+(?:relevante\s+)?(?:werk)?ervaring|experience\s+(?:as|required|in)/i.test(
      t
    );
  return {
    experience: exp || undefined,
    category: detectCategory(title, text),
    hoursPerWeek: detectHoursPerWeek(text),
    shifts: /ploegen|ploegendienst|shift(?:s|en| work)|2-ploegen|3-ploegen|wisselende diensten/i.test(t) || undefined,
    night: /nacht|night/i.test(t) || undefined,
    weekend: /weekend|zaterdag|zondag/i.test(t) || undefined,
    startDirect: /per direct|direct starten|direct aan de slag|start immediately|vandaag nog|morgen (?:al )?beginnen/i.test(t) || undefined,
    englishOk: /geen nederlands|english|engels is voldoende|english[- ]speaking/i.test(t) || undefined,
    noExperience: (noExp || /geen diploma/i.test(t)) || undefined,
    travelAllowance: /reiskosten|reisvergoeding|travel allowance|travel costs/i.test(t) || undefined,
    weeklyPay: /wekelijks(?:e)? (?:uitbetaal|uitbetaling|betaald|salaris)|weekly pay|per week uitbetaald/i.test(t) || undefined,
    needsTransport: /rijbewijs\s*b\b|eigen vervoer|own transport|driving licen[cs]e/i.test(t) || undefined,
    duties: detectDuties(text),
  };
}
