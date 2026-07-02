// Общие типы парсера вакансий.

export type SourceId = 'adzuna' | 'uitzendbureau' | 'youngcapital';

// «Сырая» вакансия, как её отдал источник (до анализа).
export interface RawVacancy {
  source: SourceId;
  id: string; // стабильный id внутри источника (обычно URL)
  url: string;
  title: string;
  company?: string;
  location?: string; // город строкой, как на сайте
  lat?: number; // координаты, если источник их отдаёт (Adzuna отдаёт)
  lon?: number;
  description: string; // текст описания (HTML уже очищен источником)
  // Структурированная зарплата, если источник отдаёт её отдельно от текста.
  salaryMin?: number;
  salaryMax?: number;
  salaryPeriod?: 'hour' | 'month' | 'year';
  contractTime?: 'full_time' | 'part_time';
  postedAt?: string; // ISO-дата публикации, если известна
}

// Кому подходит вакансия (по возрастным и прочим требованиям).
export type Verdict = 'both' | 'him' | 'her' | 'none';

// Вакансия после анализа: балл + вердикт + причины по-русски.
export interface ScoredVacancy extends RawVacancy {
  score: number; // 0..100
  hourlyEur?: number; // нормализованная часовая ставка брутто, если удалось извлечь
  hourlyMaxEur?: number; // верх вилки, если была вилка
  distanceKm?: number; // расстояние от дома, если город известен
  verdict: Verdict;
  reasons: string[]; // человекочитаемые пояснения («✅ ставка €15/час», «⚠️ …»)
}

// Итог прогона одного источника — для диагностики через /run.
export interface SourceReport {
  source: SourceId;
  found: number; // сколько вакансий вернул источник
  error?: string; // текст ошибки, если источник упал
}
