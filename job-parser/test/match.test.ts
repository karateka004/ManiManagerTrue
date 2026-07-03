// Тесты матчера на синтетических вакансиях (NL/EN). Запуск: npm test (tsx).

import { detectEmployment, detectLanguage, detectMinAge, extractSalary, scoreVacancy } from '../src/match';
import { distanceKm, normalizeCity } from '../src/geo';
import { extractJsonLd, findJobPostings, jobPostingToVacancy } from '../src/sources/jsonld';
import { HTML_GROUPS, pickGroupIndex } from '../src/rotation';
import { formatDigest } from '../src/telegram';
import { mergeFeed, toFeedItem, writeSettings, type FeedItem } from '../src/store';
import { parseSitemapFresh } from '../src/sources/tempoteam';
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
function ok(name: string, fn: () => void | Promise<void>): void | Promise<void> {
  const r = fn();
  if (r instanceof Promise) {
    return r.then(() => {
      passed++;
      console.log(`  ✓ ${name}`);
    });
  }
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
ok('неизвестный город (вне агломерации) — отсев', () => {
  const s = scoreVacancy(base({ location: 'Helmond', description: 'fulltime magazijnwerk, €15 per uur' }));
  assert.equal(s.verdict, 'none');
});
ok('без города вообще — не отсев (уточнит матчер по другим полям)', () => {
  const s = scoreVacancy(base({ description: 'fulltime magazijnwerk in rotterdam, €15 per uur' }));
  assert.ok(s.verdict === 'both', s.reasons.join(' | '));
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

console.log('facts / категории:');
ok('категория склада + задачи', () => {
  const s = scoreVacancy(
    base({
      title: 'Orderpicker magazijn',
      location: 'Rotterdam',
      description:
        'Fulltime 32-40 uur, €15 per uur, orderpicken en inpakken, per direct starten, geen ervaring nodig, reiskostenvergoeding, wekelijks uitbetaald',
    })
  );
  assert.equal(s.facts.category.id, 'warehouse');
  assert.ok(s.facts.duties.includes('сборка заказов'), s.facts.duties.join(','));
  assert.equal(s.facts.hoursPerWeek, '32–40');
  assert.ok(s.facts.startDirect === true);
  assert.ok(s.facts.noExperience === true);
  assert.ok(s.facts.travelAllowance === true);
  assert.ok(s.facts.weeklyPay === true);
});
ok('категория доставки из названия', () => {
  const s = scoreVacancy(base({ title: 'Pakketbezorger', description: 'fulltime, €16 per uur, rijbewijs b' }));
  assert.equal(s.facts.category.id, 'delivery');
  assert.ok(s.facts.needsTransport === true);
});

console.log('digest:');
ok('дайджест группирует по категориям и нумерует кнопки', () => {
  const a = scoreVacancy(
    base({ title: 'Orderpicker', location: 'Rotterdam', description: 'fulltime, €15 per uur, orderpicken' })
  );
  const b = scoreVacancy(
    base({ title: 'Pakketbezorger', location: 'Schiedam', description: 'fulltime, €16 per uur, bezorgen' })
  );
  const c = scoreVacancy(
    base({ title: 'Inpakker', location: 'Rotterdam', description: 'fulltime, €14,50 per uur, inpakken' })
  );
  const { text, keyboard } = formatDigest([a, b, c], 5, new Date('2026-07-02T18:00:00Z'));
  assert.equal(keyboard.length, 3);
  assert.ok(text.includes('СКЛАД'), 'нет секции склада');
  assert.ok(text.includes('ДОСТАВКА'), 'нет секции доставки');
  assert.ok(text.includes('и ещё 5'), 'нет хвоста');
  assert.ok(keyboard[0][0].url.startsWith('https://'), 'кнопка без url');
});

console.log('квалификация (кейс «глупый парсер»):');
ok('требование MBO-диплома — отсев', () => {
  const s = scoreVacancy(
    base({
      title: 'Medewerker financiele administratie',
      description: 'fulltime, €21 per uur, je hebt minimaal een mbo-diploma richting financien',
    })
  );
  assert.equal(s.verdict, 'none');
});
ok('HBO/WO — отсев', () => {
  const s = scoreVacancy(base({ title: 'Magazijn planner', description: 'fulltime, hbo werk- en denkniveau, €20 per uur' }));
  assert.equal(s.verdict, 'none');
});
ok('квалифицированный титул (developer/adviseur/pensioen) — отсев', () => {
  for (const title of [
    'Back-end Developer',
    'Pensioen medewerker',
    'Financieel adviseur',
    'Managementassistent Services',
    'Global Tax Compliance Expert',
    'Begeleider flexpool',
    'Coördinator Logistiek',
  ]) {
    assert.equal(scoreVacancy(base({ title, description: 'fulltime, €25 per uur, english ok' })).verdict, 'none');
  }
});
ok('офисная категория — отсев', () => {
  const s = scoreVacancy(base({ title: 'Medewerker klantcontact', description: 'fulltime, €19 per uur' }));
  assert.equal(s.verdict, 'none');
});
ok('«geen diploma nodig» — НЕ отсев', () => {
  const s = scoreVacancy(
    base({ title: 'Orderpicker', location: 'Rotterdam', description: 'fulltime, €15 per uur, geen diploma nodig' })
  );
  assert.equal(s.verdict, 'both');
});

console.log('mini app store:');
ok('toFeedItem собирает карточку', () => {
  const s = scoreVacancy(
    base({
      title: 'Orderpicker',
      location: 'Rotterdam',
      description: 'fulltime 32-40 uur, €15 per uur, orderpicken, geen ervaring, per direct',
    })
  );
  const it = toFeedItem(s, '2026-07-03T10:00:00Z');
  assert.equal(it.cat.id, 'warehouse');
  assert.equal(it.hourly, 15);
  assert.ok(it.cond.includes('32–40 ч/нед'), it.cond.join(','));
  assert.ok(it.cond.includes('старт сразу'));
});
ok('mergeFeed: свежие сверху, дедуп, кап 120', () => {
  const mk = (id: string): FeedItem => ({
    id, at: 'x', title: id, cat: { id: 'other', emoji: '📋', label: 'Разное' },
    verdict: 'both', score: 70, url: 'u', cond: [], duties: [], source: 'adzuna',
  });
  const old = Array.from({ length: 119 }, (_, i) => mk('old' + i));
  const merged = mergeFeed([mk('dup'), ...old], [mk('new1'), mk('dup')]);
  assert.equal(merged.length, 120);
  assert.equal(merged[0].id, 'new1');
  assert.equal(merged[1].id, 'dup');
  assert.equal(merged.filter((i) => i.id === 'dup').length, 1);
});
await ok('writeSettings: mutedCats валидируется, числа зажимаются', async () => {
  const mem = new Map<string, string>();
  const kv = { get: async (k: string) => mem.get(k) ?? null, put: async (k: string, v: string) => void mem.set(k, v) } as unknown as KVNamespace;
  const s = await writeSettings(kv, {
    minHourlyEur: 99, radiusKm: 2, maxPerRun: 100,
    mutedCats: ['horeca', 'мусор', 'office', 'office'],
  });
  assert.equal(s.minHourlyEur, 40); // зажато сверху
  assert.equal(s.radiusKm, 5); // зажато снизу
  assert.equal(s.maxPerRun, 10);
  assert.ok(s.mutedCats.includes('horeca') && s.mutedCats.includes('office'));
  assert.ok(!s.mutedCats.includes('мусор'));
});
ok('scoreVacancy с override-порогом ставки', () => {
  const v = base({ location: 'Rotterdam', description: 'fulltime magazijnwerk, € 15 per uur' });
  assert.equal(scoreVacancy(v).verdict, 'both'); // дефолт 14 — проходит
  assert.equal(scoreVacancy(v, { minHourlyEur: 16, radiusKm: 30 }).verdict, 'none'); // подняли порог — отсев
});

console.log('эталонная вакансия (Tempo-Team productiemedewerker):');
ok('проходит с высоким баллом, подходит ОБОИМ, опыт помечен', () => {
  const s = scoreVacancy(
    base({
      title: 'Productiemedewerker',
      location: 'Rotterdam',
      description:
        'Wat bieden wij jou € 15,32 bruto per uur (vanaf 21 jaar e.o.). Een baan voor langere tijd. ' +
        'Toeslagen in de avonden en nacht a 34%-37%. Een baan van 5 dagen per week. Reiskostenvergoeding. ' +
        'Wekelijks je salaris uitbetaald. Je hebt minimaal 6 maanden als orderpicker gewerkt. ' +
        'Je spreekt Nederlands of Engels. Je bent beschikbaar in de avonduren en nachten.',
    })
  );
  assert.equal(s.verdict, 'both'); // «vanaf 21 jaar» у ставки — НЕ возрастной допуск
  assert.ok(s.hourlyEur! > 15 && s.hourlyEur! < 16, `hourly ${s.hourlyEur}`);
  assert.ok(s.score >= 85, `score ${s.score}`);
  assert.ok(s.facts.experience === true, 'опыт не помечен');
  assert.ok(s.reasons.some((r) => r.includes('молодёжную')), s.reasons.join(' | '));
  assert.ok(s.reasons.some((r) => r.includes('просят опыт')));
});
ok('«geen ervaring nodig» не считается требованием опыта', () => {
  const s = scoreVacancy(base({ title: 'Inpakker', description: 'fulltime €15 per uur, geen ervaring nodig' }));
  assert.ok(!s.facts.experience);
  assert.ok(s.facts.noExperience === true);
});
ok('жёсткий возраст без контекста ставки — по-прежнему только ему', () => {
  const s = scoreVacancy(base({ description: 'fulltime bezorger €15 per uur, je bent minimaal 21 jaar oud' }));
  assert.equal(s.verdict, 'him');
});

console.log('🇺🇦 вакансии для украинцев:');
ok('детект + бонус + гео-послабление для неизвестного города', () => {
  const s = scoreVacancy(
    base({
      title: 'Inpakmedewerker glas',
      location: 'Gorinchem', // нет в geo-таблице — но 🇺🇦 не отсеиваем
      description: 'Fulltime, €15 per uur, wij verwelkomen ook Oekraïense medewerkers, engels is voldoende',
    })
  );
  assert.equal(s.verdict, 'both');
  assert.ok(s.facts.ukrainian === true);
  assert.ok(s.score >= 85, `score ${s.score}`);
  assert.ok(s.reasons.some((r) => r.includes('🇺🇦')));
  assert.ok(s.reasons.some((r) => r.includes('уточнить')));
});
ok('английская формулировка ukrainian speaking', () => {
  const s = scoreVacancy(base({ description: 'fulltime €15 per uur, ukrainian speaking people are welcome' }));
  assert.ok(s.facts.ukrainian === true);
});
ok('без 🇺🇦 неизвестный город по-прежнему отсев', () => {
  const s = scoreVacancy(base({ location: 'Waalwijk', description: 'fulltime magazijnwerk €15 per uur' }));
  assert.equal(s.verdict, 'none');
});
ok('соцработа «Oekraïne Opvang» всё равно отсев (begeleider/manager)', () => {
  const s = scoreVacancy(
    base({ title: 'Afdelingsmanager Oekraïne Opvang', location: 'Den Haag', description: 'fulltime, hbo werk- en denkniveau' })
  );
  assert.equal(s.verdict, 'none');
});

console.log('tempo-team sitemap:');
ok('parseSitemapFresh: свежие URL вакансий, старые и не-вакансии мимо', () => {
  const now = new Date('2026-07-03T12:00:00Z').getTime();
  const xml = [
    '<url><loc>https://www.tempo-team.nl/vacatures/740482/productiemedewerker</loc><lastmod>2026-07-02</lastmod></url>',
    '<url><loc>https://www.tempo-team.nl/vacatures/111/oud</loc><lastmod>2026-06-01</lastmod></url>',
    '<url><loc>https://www.tempo-team.nl/werkgevers/pagina</loc><lastmod>2026-07-03</lastmod></url>',
  ].join('\n');
  const urls = parseSitemapFresh(xml, now);
  assert.equal(urls.length, 1);
  assert.ok(urls[0].includes('740482'));
});

console.log('rotation:');
ok('за 3 подряд cron-прогона (раз в 3 ч) отрабатывают все 3 группы', () => {
  const slot = 3 * 3_600_000;
  const t0 = new Date('2026-07-03T06:00:00Z').getTime();
  const runs = [0, 1, 2].map((i) => pickGroupIndex(t0 + i * slot));
  assert.equal(new Set(runs).size, HTML_GROUPS.length);
});
ok('группы покрывают все 5 HTML-источников без повторов', () => {
  const all = HTML_GROUPS.flat();
  assert.equal(all.length, 5);
  assert.equal(new Set(all).size, 5);
  assert.ok(!all.includes('adzuna' as never));
});

console.log(`\nВсе тесты прошли: ${passed}`);
