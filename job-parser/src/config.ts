// Единый конфиг парсера: профили, пороги, ключевые слова.
// Меняешь значения здесь → `npx wrangler deploy` → готово.

export const CONFIG = {
  // Дом: почтовый код 3015 BA, Роттердам (район Dijkzigt/Erasmus MC).
  home: { postcode: '3015 BA', city: 'Rotterdam', lat: 51.9114, lon: 4.4646 },

  // Максимальное расстояние до работы, км (на машине это ~30–40 минут).
  radiusKm: 30,

  // Кто ищет работу. Возраст важен: часть вакансий требует 21+ (например, аренда авто,
  // некоторые водительские и складские позиции из-за страховки).
  people: {
    him: { name: 'Святослав', age: 21 },
    her: { name: 'Подруга', age: 19 },
  },

  // Языки: нидерландского нет — вакансии с жёстким требованием NL отсеиваются.
  languages: { dutch: false, english: true },

  // Есть машина и права категории B — «rijbewijs B» в вакансии это плюс, а не стоп.
  hasCar: true,

  // Минимальная ставка брутто. Вакансии с зарплатой НИЖЕ порога отсеиваются;
  // вакансии БЕЗ указанной зарплаты не отсеиваются, а помечаются «ставка не указана».
  minHourlyEur: 14,
  minMonthlyEur: 2300,

  // Минимальный балл (0..100), с которого вакансия отправляется в Telegram.
  minScore: 60,

  // Сколько вакансий максимум слать за один прогон (остальное — строкой «и ещё N»).
  maxPerRun: 10,

  // Сколько дней «свежести» просить у Adzuna.
  maxDaysOld: 7,

  // Приоритетные типы работы — совпадение по ключевому слову даёт бонус к баллу.
  // Не жёсткий фильтр: хорошая вакансия другого типа тоже пройдёт.
  preferredKeywords: [
    // склад / логистика
    'orderpicker', 'order picker', 'magazijn', 'warehouse', 'logistiek', 'logistics',
    'inpakker', 'inpakken', 'packer', 'packing', 'sorteerder', 'sorting', 'reachtruck',
    'heftruck', 'forklift', 'distributiecentrum', 'distribution',
    // производство
    'productie', 'production', 'fabriek', 'factory', 'operator', 'assemblage', 'assembly',
    'voedingsindustrie', 'food production', 'kwekerij', 'kas ', 'greenhouse',
    // доставка / водитель
    'bezorger', 'bezorging', 'koerier', 'courier', 'chauffeur', 'driver', 'delivery',
    'pakketbezorger',
    // клининг (без языка, часто fulltime)
    'schoonmaak', 'schoonmaker', 'cleaning', 'cleaner', 'housekeeping',
  ],

  // Слова про «без опыта» — бонус.
  noExperienceKeywords: [
    'geen ervaring', 'zonder ervaring', 'no experience', 'geen diploma',
    'iedereen kan', 'wij leren je',
  ],

  // Слова про сменные/ночные надбавки — бонус (реальная ставка выше базовой).
  shiftBonusKeywords: [
    'toeslag', 'toeslagen', 'ploegendienst', 'nachtdienst', 'night shift',
    'shift allowance', 'avondtoeslag', 'weekendtoeslag',
  ],
} as const;
