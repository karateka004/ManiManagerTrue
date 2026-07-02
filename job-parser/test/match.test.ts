// Тесты матчера на синтетических вакансиях (NL/EN). Запуск: npm test (tsx).

import { detectEmployment, detectLanguage, detectMinAge, extractSalary, scoreVacancy } from '../src/match';
import { distanceKm, normalizeCity } from '../src/geo';
import { extractJsonLd, findJobPostings, jobPostingToVacancy } from '../src/sources/jsonld';
import type { RawVacancy } from '../src/types';

// Мини-assert без node-типов (tsconfig собран под workers-types).
const assert = {
  ok(cond: unknown, msg?: string): void {
    if (!cond) throw new Error(msg ?? 'assertion failed');
  },
  equal(a: unknown, b: unknown): void {
    if (a !== b) throw new Error(`expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  },
};

let passed = 0;
function ok(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const base = (over: Partial<RawVacancy>): RawVacancy => ({
  source: 'adzuna',
  id: 'x',
  url: 'https://example.com/v/1',
  title: 'Orderpicker',
  description: '',
  ...over,
});

console.log('extractSalary:');
ok('часовая NL с запятой', () => {
  assert.equal(extractSalary('je verdient € 14,50 per uur plus toeslagen').hourly, 14.5);
});
ok('часовая вилка', () => {
  const s = extractSalary('salaris: €14 - €16,25 per uur');
  assert.equal(s.hourly, 14);
  assert.equal(s.hourlyMax, 16.25);
});
ok('сокращение p/u', () => {
  assert.equal(extractSalary('15,04 p/u bruto').hourly, 15.04);
});
ok('месячная с точкой тысяч', () => {
  const s = extractSalary('salaris € 2.600 bruto per maand');
  assert.ok(s.fromMonthly);
  assert.ok(s.hourly! > 14.9 && s.hourly! < 15.1, `got ${s.hourly}`);
});
ok('английская per hour', () => {
  assert.equal(extractSalary('you earn €15.50 per hour').hourly, 15.5);
});
ok('нет зарплаты — пусто', () => {
  assert.equal(extractSalary('leuke baan in een magazijn').hourly, undefined);
});
ok('uurloon van €X (обратный порядок)', () => {
  assert.equal(extractSalary('uurloon van € 16').hourly, 16);
});

console.log('detectEmployment:');
ok('fulltime NL', () => assert.equal(detectEmployment('wij zoeken fulltime medewerkers'), 'fulltime'));
ok('часы 36-40', () => assert.equal(detectEmployment('werkweek van 36 tot 40 uur'), 'fulltime'));
ok('parttime', () => assert.equal(detectEmployment('leuke parttime bijbaan'), 'parttime'));
ok('неизвестно', () => assert.equal(detectEmployment('werk in de haven'), 'unknown'));

console.log('detectLanguage:');
ok('nederlands vereist', () =>
  assert.equal(detectLanguage('goede beheersing van de nederlandse taal is vereist'), 'dutch_required'));
ok('english ok', () => assert.equal(detectLanguage('english speaking colleagues, geen nederlands nodig'), 'english_ok'));
ok('нет требований', () => assert.equal(detectLanguage('magazijnwerk in rotterdam'), 'none'));

console.log('detectMinAge:');
ok('minimaal 21 jaar', () => assert.equal(detectMinAge('je bent minimaal 21 jaar oud'), 21));
ok('18+', () => assert.equal(detectMinAge('ben je 18+ en gemotiveerd?'), 18));
ok('нет требования', () => assert.equal(detectMinAge('iedereen is welkom'), undefined));

console.log('geo:');
ok('город из таблицы', () => assert.equal(distanceKm({ location: 'Schiedam' }), 6));
ok('город с областью', () => assert.equal(distanceKm({ location: 'Barendrecht, Zuid-Holland' }), 11));
ok('координаты (haversine)', () => {
  const d = distanceKm({ lat: 52.0907, lon: 5.1214 }); // Утрехт, ~50+ км
  assert.ok(d! > 40, `got ${d}`);
});
ok('неизвестный город', () => assert.equal(distanceKm({ location: 'Groningen' }), undefined));
ok('normalizeCity', () => assert.equal(normalizeCity('  Capelle aan den IJssel, ZH '), 'capelle aan den ijssel zh'));

console.log('scoreVacancy:');
ok('хорошая вакансия — проходит, подходит обоим', () => {
  const s = scoreVacancy(
    base({
      title: 'Orderpicker magazijn Rotterdam',
      location: 'Rotterdam',
      description: 'Fulltime werk, € 15,50 per uur, geen ervaring nodig, engels is voldoende. Ploegendienst met toeslagen.',
    })
  );
  assert.equal(s.verdict, 'both');
  assert.ok(s.score >= 90, `score ${s.score}`);
  assert.equal(s.hourlyEur, 15.5);
});
ok('parttime — отсев', () => {
  const s = scoreVacancy(base({ description: 'gezellige parttime bijbaan, €16 per uur' }));
  assert.equal(s.verdict, 'none');
});
ok('нидерландский обязателен — отсев', () => {
  const s = scoreVacancy(base({ description: 'fulltime, nederlands in woord en geschrift vereist' }));
  assert.equal(s.verdict, 'none');
});
ok('ставка ниже порога — отсев', () => {
  const s = scoreVacancy(base({ description: 'fulltime magazijnwerk, € 12,00 per uur' }));
  assert.equal(s.verdict, 'none');
});
ok('21+ — только ему', () => {
  const s = scoreVacancy(
    base({ description: 'fulltime bezorger, €15 per uur, rijbewijs b vereist, minimaal 21 jaar' })
  );
  assert.equal(s.verdict, 'him');
});
ok('далёкий город по координатам — отсев', () => {
  const s = scoreVacancy(base({ lat: 52.3702, lon: 4.8952, description: 'fulltime, €16 per uur' })); // Амстердам
  assert.equal(s.verdict, 'none');
});
ok('без зарплаты — проходит с пометкой', () => {
  const s = scoreVacancy(
    base({ location: 'Rotterdam', description: 'fulltime productiemedewerker, wij leren je alles' })
  );
  assert.ok(s.verdict === 'both' && s.score >= 60, `score ${s.score} verdict ${s.verdict}`);
  assert.ok(s.reasons.some((r) => r.includes('не указана')));
});
ok('структурированная годовая зарплата (Adzuna)', () => {
  const s = scoreVacancy(
    base({ location: 'Rotterdam', description: 'fulltime werk in het magazijn', salaryMin: 32000, salaryPeriod: 'year' })
  );
  assert.ok(s.hourlyEur! > 15 && s.hourlyEur! < 16, `hourly ${s.hourlyEur}`);
});

console.log('json-ld:');
ok('JobPosting из HTML', () => {
  const html = `<html><head><script type="application/ld+json">
    {"@context":"https://schema.org","@type":"JobPosting","title":"Productiemedewerker",
     "description":"&lt;p&gt;Fulltime, € 15 per uur&lt;/p&gt;",
     "hiringOrganization":{"@type":"Organization","name":"ACME Uitzend"},
     "jobLocation":{"@type":"Place","address":{"addressLocality":"Rotterdam"}},
     "baseSalary":{"@type":"MonetaryAmount","value":{"@type":"QuantitativeValue","value":15,"unitText":"HOUR"}},
     "employmentType":"FULL_TIME","url":"https://site.nl/vac/1"}
  </script></head></html>`;
  const jp = findJobPostings(extractJsonLd(html));
  assert.equal(jp.length, 1);
  const v = jobPostingToVacancy(jp[0], 'uitzendbureau', 'https://site.nl/vac/1')!;
  assert.equal(v.title, 'Productiemedewerker');
  assert.equal(v.company, 'ACME Uitzend');
  assert.equal(v.location, 'Rotterdam');
  assert.equal(v.salaryMin, 15);
  assert.equal(v.salaryPeriod, 'hour');
  assert.equal(v.contractTime, 'full_time');
  const s = scoreVacancy(v);
  assert.equal(s.verdict, 'both');
  assert.ok(s.score >= 80, `score ${s.score}`);
});
ok('@graph и массивы', () => {
  const html = `<script type="application/ld+json">{"@graph":[{"@type":"WebSite"},{"@type":"JobPosting","title":"X","url":"u"}]}</script>`;
  assert.equal(findJobPostings(extractJsonLd(html)).length, 1);
});

console.log(`\nВсе тесты прошли: ${passed}`);
