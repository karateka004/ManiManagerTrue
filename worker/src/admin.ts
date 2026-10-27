/**
 * HTML админ-дашборда «Кошель · Аналитика» (2.0).
 *
 * Самодостаточная страница: графики — ручной SVG/HTML, внешних библиотек нет.
 * Вход двумя путями: открыта кнопкой из бота — по подписи Telegram владельца
 * (initData берём из адресной строки, куда его кладёт Telegram); открыта в
 * браузере — по паролю (секрет ADMIN_KEY).
 *
 * Оформление — язык приложения 2.0: графитовые поверхности, блоки разделяют
 * контраст и воздух, а не рамки; подписи строчными, один акцент. Цвета
 * графиков проверены валидатором палитр (dataviz): категориальные ряды —
 * зелёный/синий/розовый, удержание — последовательная шкала одной гаммы для
 * ненулевых значений (ноль — серая клетка). Значения в подписях и подсказках —
 * цветом текста, а не цветом ряда.
 *
 * ВАЖНО: внутренний <script> написан на строковой конкатенации — без обратных
 * кавычек, ${…} и обратных слэшей: всё это внутри шаблонной строки TypeScript
 * либо закрыло бы её, либо молча превратилось бы в другой символ. Сторожит
 * scripts/check-admin-js.mjs (в npm run lint), который проверяет именно ту
 * строку, что уходит в браузер.
 */
export const ADMIN_HTML = `<!doctype html>
<html lang="ru" data-theme="dark">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="robots" content="noindex, nofollow" />
<meta name="color-scheme" content="light dark" />
<title>Кошель · Аналитика</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
<style>
  /* ---------- Токены ----------
     Графитовая шкала: страница → карточка → колодец (дорожки полос, нулевые
     ячейки, поля, неактивные переключатели). Блоки разделяют контраст и воздух,
     а не рамки: у карточки только едва заметная кромка. Зелёный — у данных и
     активного состояния; «лучше/хуже» — свои цвета и всегда со стрелкой или словом. */
  :root{
    --page:#F3F4F1; --card:#FFFFFF; --well:#EEEFEB; --raised:#FFFFFF;
    --ink:#121412; --ink-2:#4F534E; --ink-3:#6B706A; --ink-4:#A3A7A1;
    --hair:rgba(18,20,18,.08); --grid:#ECEDE8; --axis:#CFD0CA;
    --edge:0 0 0 1px rgba(18,20,18,.06),0 1px 2px rgba(18,20,18,.04);
    /* Метки одного ряда и акцент текста. Зелёный 600 — 4:1 к белому. */
    --mark:#2D8866; --mark-2:#9BD8B6; --mark-wash:rgba(45,136,102,.10); --brand-text:#246E54; --context:#C9CAC4;
    /* Категориальные ряды (проверены валидатором, светлая тема, к белому). */
    --s1:#2D8866; --s2:#2a78d6; --s3:#e87ba4;
    /* Статусы: только со значком и словом, не цветом в одиночку. */
    --good:#1F7A3D; --bad:#C2312F; --warn:#9A6400;
    --good-bg:rgba(31,122,61,.10); --bad-bg:rgba(194,49,47,.09); --loss:rgba(194,49,47,.18);
    --good-dot:#0ca30c; --warn-dot:#fab219; --bad-dot:#d03b3b;
    --seg-on:#FFFFFF; --seg-sh:0 1px 2px rgba(0,0,0,.08),0 0 0 1px rgba(18,20,18,.06);
    --tip-sh:0 0 0 1px rgba(18,20,18,.08),0 12px 28px rgba(18,20,18,.16);
    color-scheme:light;
  }
  html[data-theme="dark"]{
    --page:#0C0D0C; --card:#151715; --well:#1F211F; --raised:#222422;
    --ink:#EDEFEB; --ink-2:#A9ADA7; --ink-3:#83877F; --ink-4:#575B55;
    --hair:rgba(255,255,255,.07); --grid:rgba(255,255,255,.055); --axis:rgba(255,255,255,.15);
    --edge:inset 0 0 0 1px rgba(255,255,255,.045);
    --mark:#3CA37B; --mark-2:#2D6B51; --mark-wash:rgba(60,163,123,.14); --brand-text:#8FD3AC; --context:#3F423E;
    --s1:#3CA37B; --s2:#3987e5; --s3:#d55181;
    --good:#4CC27A; --bad:#F07C7A; --warn:#F2B544;
    --good-bg:rgba(76,194,122,.12); --bad-bg:rgba(240,124,122,.12); --loss:rgba(240,124,122,.22);
    --seg-on:#2E302D; --seg-sh:0 1px 2px rgba(0,0,0,.35);
    --tip-sh:0 0 0 1px rgba(255,255,255,.08),0 14px 30px rgba(0,0,0,.5);
    color-scheme:dark;
  }

  *{box-sizing:border-box}
  html,body{margin:0;background:var(--page);color:var(--ink);overflow-x:hidden}
  /* Страница не имеет права ехать вбок: на iPhone это выглядело обрезанными
     краями — подсказка графика вылезала за правый край и расширяла документ. */
  @supports (overflow:clip){html,body{overflow-x:clip}}
  body{
    font:14px/1.45 Manrope,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
    -webkit-font-smoothing:antialiased;-webkit-tap-highlight-color:transparent;
    min-height:100vh;
  }
  button{font:inherit;color:inherit;cursor:pointer}
  button:disabled{opacity:.5;cursor:default}
  a{color:var(--brand-text);text-decoration:none}
  :focus{outline:none}
  :focus-visible{outline:2px solid var(--mark);outline-offset:2px}
  /* Цифры, стоящие столбцом, — моноширинные; крупные одиночные — пропорциональные. */
  .tnum{font-variant-numeric:tabular-nums}
  .muted{color:var(--ink-3)}
  .wrap{max-width:1080px;margin:0 auto;padding:0 16px 64px}
  [hidden]{display:none !important}
  .ic{width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:none}

  /* ---------- Шапка ----------
     Марка с кнопками уезжает вместе со страницей, липнут только вкладки: под
     шапкой Telegram две липкие полосы занимали треть экрана. */
  .appbar{max-width:1080px;margin:0 auto;padding:calc(10px + env(safe-area-inset-top,0px)) 16px 4px;display:flex;align-items:center;gap:8px}
  .brand{display:flex;align-items:center;gap:8px;font-weight:800;font-size:18px;letter-spacing:-.022em;white-space:nowrap;min-width:0}
  .brand .dot{width:8px;height:8px;border-radius:99px;background:var(--mark);flex:none}
  .brand .sub{font-weight:600;color:var(--ink-3)}
  .spacer{flex:1;min-width:0}
  .status{display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 12px;border-radius:99px;border:0;background:var(--well);font-size:12.5px;font-weight:600;color:var(--ink-2);white-space:nowrap;min-width:0}
  .status i{width:7px;height:7px;border-radius:99px;flex:none}
  .icon{width:34px;height:34px;border-radius:99px;border:0;background:var(--well);display:grid;place-items:center;color:var(--ink-2);flex:none}
  .icon svg{width:17px;height:17px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  .tabbar{position:sticky;top:0;z-index:30;background:var(--page);box-shadow:0 1px 0 var(--hair)}
  @supports (backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px)){
    .tabbar{background:color-mix(in srgb,var(--page) 84%,transparent);backdrop-filter:saturate(1.4) blur(16px);-webkit-backdrop-filter:saturate(1.4) blur(16px)}
  }
  /* Вкладки — текст с чертой снизу: навигация не должна весить как кнопка.
     Ряд делится по длине слов; на совсем узком экране едет вбок сам. */
  .tabs{max-width:1080px;margin:0 auto;padding:0 8px;display:flex;overflow-x:auto;scrollbar-width:none}
  .tabs::-webkit-scrollbar{display:none}
  .tabs button{flex:1 0 auto;display:flex;justify-content:center;height:44px;padding:0 6px;border:0;background:none;font-size:14px;font-weight:650;color:var(--ink-3);white-space:nowrap;transition:color .15s}
  .tabs button span{position:relative;display:flex;align-items:center}
  .tabs button.on{color:var(--ink)}
  .tabs button.on span::after{content:"";position:absolute;left:-3px;right:-3px;bottom:0;height:2px;border-radius:2px 2px 0 0;background:var(--mark)}
  @media(hover:hover){.tabs button:hover{color:var(--ink)}}
  /* На широком экране вкладки и переключатели — по длине слов, а не на всю ширину. */
  @media(min-width:640px){.tabs button{flex:0 0 auto;padding:0 12px}}

  /* ---------- Переключатели и фильтры ---------- */
  .seg{display:inline-flex;align-items:center;padding:2px;border-radius:99px;background:var(--well);gap:2px;min-width:0;max-width:100%;flex:none}
  .seg button{flex:0 0 auto;border:0;background:none;height:30px;padding:0 11px;border-radius:99px;font-size:12.5px;font-weight:650;color:var(--ink-3);white-space:nowrap;transition:background .15s,color .15s}
  .seg button.on{background:var(--seg-on);color:var(--ink);box-shadow:var(--seg-sh)}
  .seg.full{display:flex;width:100%}
  .seg.full button{flex:1 1 0;min-width:0;padding:0 6px}
  @media(min-width:640px){
    .seg.full{display:inline-flex;width:auto}
    .seg.full button{flex:0 0 auto;padding:0 14px}
  }
  @media(hover:hover){.seg button:not(.on):hover{color:var(--ink)}}
  .filters{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 10px}
  .select{
    flex:1 1 140px;min-width:0;max-width:260px;height:34px;padding:0 30px 0 13px;border-radius:99px;border:0;background-color:var(--well);color:var(--ink);
    font:650 12.5px Manrope,sans-serif;appearance:none;-webkit-appearance:none;text-overflow:ellipsis;
    background-image:linear-gradient(45deg,transparent 50%,var(--ink-3) 50%),linear-gradient(135deg,var(--ink-3) 50%,transparent 50%);
    background-position:calc(100% - 17px) 15px,calc(100% - 12px) 15px;background-size:5px 5px;background-repeat:no-repeat;
  }
  /* Фильтры списка — чипы с переносом: спрятанный за прокруткой фильтр всё
     равно что отсутствует, а шесть сегментов в ряд на телефон не влезают. */
  .chipbar{display:flex;flex-wrap:wrap;gap:6px}
  .chipbar button{border:0;background:var(--well);border-radius:99px;height:32px;padding:0 12px;font-weight:650;font-size:12.5px;color:var(--ink-2)}
  .chipbar button.on{background:var(--ink);color:var(--page)}

  /* ---------- Разделы и поверхности ---------- */
  .sec{margin:26px 2px 10px;display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:30px}
  #view > :first-child{margin-top:14px}
  .sec h2{margin:0;font-size:17px;font-weight:800;letter-spacing:-.022em;white-space:nowrap}
  .sec .aside{font-size:12.5px;color:var(--ink-3);font-weight:500;text-align:right;line-height:1.35;min-width:0}
  /* Срез (источник, период) — справа от заголовка: он задаёт весь блок под ним. */
  .sec .seg button{padding:0 10px}
  .sec .select{flex:0 1 auto;max-width:58%;height:32px;background-position:calc(100% - 17px) 14px,calc(100% - 12px) 14px}
  .card > .seg.full{margin-bottom:4px}
  .card > .seg.full + .fn{margin-top:14px}
  .card > .seg.full + .heat{margin-top:10px}
  .comp-head{margin:0 0 10px;font-size:12.5px;color:var(--ink-3)}
  .comp-head b{color:var(--ink);font-weight:750;font-size:14px}
  .card{background:var(--card);border-radius:20px;box-shadow:var(--edge);padding:16px;min-width:0}
  .grid{display:grid;gap:12px}
  .grid > *{min-width:0}
  .g2{grid-template-columns:repeat(2,minmax(0,1fr))}
  .start{align-items:start}
  @media(max-width:720px){.g2{grid-template-columns:minmax(0,1fr)}}
  .cardhead{display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:6px}
  .cardhead h3{margin:0;font-size:14.5px;font-weight:750;letter-spacing:-.01em}
  .subhead{margin:16px 0 2px;font-size:12px;font-weight:700;color:var(--ink-3)}
  .note{font-size:12px;line-height:1.5;color:var(--ink-3)}
  .note b{color:var(--ink-2);font-weight:700}
  .cap{margin:8px 4px 0}
  .empty{color:var(--ink-3);font-size:13px;text-align:center;padding:24px 8px}
  /* Сноска внутри карточки: отделена линией, со значком — не спорит с цифрами. */
  .foot-note{display:flex;gap:9px;align-items:flex-start;margin-top:12px;padding-top:12px;border-top:1px solid var(--hair);font-size:12.5px;line-height:1.45;color:var(--ink-3)}
  .foot-note .ic{width:16px;height:16px;margin-top:1px;color:var(--ink-3)}
  .foot-note b{color:var(--ink);font-weight:700}
  .facts{display:flex;flex-wrap:wrap;gap:4px 18px;margin-top:14px;padding-top:12px;border-top:1px solid var(--hair);font-size:12.5px;color:var(--ink-3)}
  .facts b{color:var(--ink);font-weight:750;font-variant-numeric:tabular-nums}

  /* ---------- Панель показателей ----------
     Одна поверхность, ячейки делит волосяная линия: четыре отдельные карточки
     весили как четыре равных блока и съедали высоту зазорами. */
  .panel{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1px;background:var(--hair);border-radius:20px;overflow:hidden;box-shadow:var(--edge)}
  @media(max-width:880px){.panel{grid-template-columns:repeat(2,minmax(0,1fr))}}
  .panel > div{background:var(--card);padding:14px 16px 13px;min-width:0;display:flex;flex-direction:column}
  .panel .lb{font-size:12.5px;font-weight:600;color:var(--ink-2);line-height:1.3}
  .panel .val{font-size:28px;font-weight:800;letter-spacing:-.035em;line-height:1;margin-top:9px}
  .panel .val small{font-size:13px;font-weight:650;color:var(--ink-3);letter-spacing:0;margin-left:4px}
  .panel .meta{display:flex;align-items:center;gap:4px 6px;flex-wrap:wrap;margin-top:8px;font-size:12px;color:var(--ink-3);line-height:1.35}
  .panel .spark{margin-top:auto;padding-top:10px}
  .spark svg{display:block;width:100%;height:28px;overflow:visible}

  /* ---------- Плашки ---------- */
  .chip{display:inline-flex;align-items:center;gap:2px;height:20px;padding:0 7px 0 4px;border-radius:99px;font-size:11.5px;font-weight:700;white-space:nowrap;background:var(--well);color:var(--ink-2);font-variant-numeric:tabular-nums}
  .chip svg{width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
  .chip.good{background:var(--good-bg);color:var(--good)} .chip.bad{background:var(--bad-bg);color:var(--bad)} .chip.flat{color:var(--ink-3);padding:0 8px}
  /* Отметка «главная потеря» — та же плашка, что у изменений: часть системы, а не сирена. */
  .flag{display:inline-flex;align-items:center;height:20px;padding:0 8px;border-radius:99px;background:var(--bad-bg);color:var(--bad);font-size:11px;font-weight:700;white-space:nowrap;flex:none}
  .tag{display:inline-flex;align-items:center;height:19px;padding:0 7px;border-radius:99px;font-size:11px;font-weight:650;background:var(--well);color:var(--ink-2);white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
  .tag.src{color:var(--brand-text)}
  .tag.blk{color:var(--bad)}

  /* ---------- Герой «Сегодня» ----------
     Глубокая поверхность, как у главных карточек приложения: тёмная зелень к
     почти чёрному, светится только пятно акцента. Столбики сегодняшнего дня —
     мятные, вчерашний день — риска на своей высоте: это контекст, а не второй ряд. */
  .hero{
    position:relative;overflow:hidden;border-radius:22px;padding:16px 16px 14px;color:#fff;
    background-image:
      url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .6 0'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='.2'/></svg>"),
      radial-gradient(70% 90% at 100% 0%,rgba(93,185,150,.34),transparent 62%),
      radial-gradient(60% 70% at 0% 100%,rgba(60,163,123,.10),transparent 70%),
      linear-gradient(160deg,#133B2D 0%,#0B0E0C 80%);
    background-blend-mode:overlay,normal,normal,normal;
    box-shadow:inset 0 1px 0 rgba(255,255,255,.09),inset 0 0 0 1px rgba(255,255,255,.05);
  }
  .hero .k{font-size:12.5px;font-weight:600;color:rgba(255,255,255,.7);display:flex;align-items:center;gap:8px}
  .live{width:7px;height:7px;border-radius:99px;background:#8FD3AC;box-shadow:0 0 0 0 rgba(143,211,172,.6);animation:pulse 2s infinite}
  @keyframes pulse{0%{box-shadow:0 0 0 0 rgba(143,211,172,.55)}70%{box-shadow:0 0 0 7px rgba(143,211,172,0)}100%{box-shadow:0 0 0 0 rgba(143,211,172,0)}}
  @media (prefers-reduced-motion:reduce){.live{animation:none}}
  .hero-top{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-top:8px;flex-wrap:wrap}
  .hero-num{font-size:52px;font-weight:800;letter-spacing:-.04em;line-height:.92}
  .hero-num small{font-size:15px;font-weight:650;letter-spacing:0;color:rgba(255,255,255,.7);margin-left:8px}
  .hero-side{text-align:right;font-size:12.5px;color:rgba(255,255,255,.66);line-height:1.55}
  .hero-side b{color:#fff;font-weight:700}
  .hours{position:relative;display:flex;align-items:flex-end;gap:2px;height:76px;margin-top:16px;box-shadow:0 1px 0 rgba(255,255,255,.12)}
  .hcol{position:relative;flex:1 1 0;min-width:0;height:100%;display:flex;align-items:flex-end;justify-content:center}
  .hcol .b{position:relative;width:min(100%,12px);border-radius:3px 3px 0 0;background:#8FD3AC}
  .hcol .y{position:absolute;left:50%;transform:translate(-50%,1px);width:min(100%,12px);height:2px;border-radius:2px;background:rgba(255,255,255,.5)}
  .hcol.now .b{background:#B8E5CC}
  .hcol:hover .b,.hcol.hot .b{background:#DCF2E5}
  .hcol.hot .y{background:#fff}
  .haxis{display:flex;justify-content:space-between;margin-top:6px;font-size:10.5px;font-weight:600;color:rgba(255,255,255,.5);font-variant-numeric:tabular-nums}
  .hlegend{display:flex;gap:14px;margin-top:8px;font-size:11.5px;color:rgba(255,255,255,.66)}
  .hlegend span{display:inline-flex;align-items:center;gap:6px}
  .hlegend i{display:inline-block;width:9px;height:9px;border-radius:2px;background:#8FD3AC}
  .hlegend i.tick{width:12px;height:2px;background:rgba(255,255,255,.55)}
  .hero-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,.10)}
  .hero-stats div{font-size:11.5px;color:rgba(255,255,255,.62);line-height:1.35;min-width:0}
  .hero-stats b{display:block;font-size:19px;color:#fff;font-weight:750;letter-spacing:-.015em;margin-bottom:2px}

  /* ---------- Выводы ---------- */
  .ins{display:flex;gap:11px;align-items:flex-start;padding:11px 0;border-top:1px solid var(--hair)}
  .ins:first-child{border-top:0;padding-top:0}
  .ins:last-child{padding-bottom:0}
  .ins .ic{margin-top:1px;width:17px;height:17px}
  .ins.good .ic{color:var(--good)} .ins.bad .ic{color:var(--bad)} .ins.info .ic{color:var(--ink-3)}
  .ins p{margin:0;font-size:13.5px;line-height:1.5}

  /* ---------- Воронка ----------
     Ступени — число и доля от входа; между ступенями — переход: сколько дошли
     и сколько отвалились. Потерянная часть видна на самой полосе приглушённым
     красным, главная потеря отмечена плашкой. */
  .fn-head{display:flex;align-items:baseline;gap:10px}
  .fn-lb{flex:1;min-width:0;font-size:14px;font-weight:650;line-height:1.3}
  .fn-n{font-size:18px;font-weight:800;letter-spacing:-.025em;line-height:1;font-variant-numeric:tabular-nums}
  .fn-pc{width:38px;text-align:right;font-size:12px;font-weight:650;color:var(--ink-3);font-variant-numeric:tabular-nums}
  .fn-bar{position:relative;height:10px;border-radius:99px;background:var(--well);margin-top:8px;overflow:hidden}
  .fn-bar i{position:absolute;left:0;top:0;bottom:0;border-radius:99px}
  .fn-bar .lose{background:var(--loss)}
  .fn-bar .fill{background:var(--mark);box-shadow:2px 0 0 var(--card)}
  .fn-gap{display:flex;align-items:center;gap:7px;min-height:36px;padding:3px 0 3px 1px;font-size:12px;color:var(--ink-3);line-height:1.35}
  .fn-gap .ic{width:15px;height:15px;color:var(--ink-4)}
  .fn-gap b{color:var(--ink-2);font-weight:700;font-variant-numeric:tabular-nums}
  .fn-gap .flag{margin-left:auto}
  .fn-gap.worst .ic{color:var(--bad)}
  .fn-gap.worst b.lost{color:var(--bad)}

  /* ---------- График ---------- */
  .ch-head{margin:14px 0 2px}
  .ch-val{font-size:30px;font-weight:800;letter-spacing:-.035em;line-height:1}
  .ch-cap{display:flex;align-items:center;flex-wrap:wrap;gap:4px 8px;margin-top:7px;font-size:12.5px;color:var(--ink-3);min-height:20px}
  .chart{position:relative;margin-top:8px;touch-action:pan-y;-webkit-user-select:none;user-select:none}
  .chart svg{display:block;width:100%;overflow:visible}
  .chart svg.scrub .bm{opacity:.35}
  .chart svg.scrub .bm.on{opacity:1}
  .legend{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:10px;font-size:12.5px;color:var(--ink-2)}
  .legend span{display:inline-flex;align-items:center;gap:6px}
  .legend i{display:inline-block;width:12px;height:3px;border-radius:2px}
  .legend b{color:var(--ink);font-weight:750;font-variant-numeric:tabular-nums}
  .ch-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:12px;padding-top:8px;border-top:1px solid var(--hair)}
  .tablev{margin-top:12px}
  table{width:100%;border-collapse:collapse;font-size:12.5px}
  th{text-align:left;color:var(--ink-3);font-weight:650;font-size:11.5px;padding:8px 6px;white-space:nowrap}
  td{padding:7px 6px;border-top:1px solid var(--hair);vertical-align:middle}
  td.r,th.r{text-align:right}
  .linkbtn{border:0;background:none;color:var(--brand-text);font-weight:650;font-size:12.5px;padding:6px 0}

  /* ---------- Удержание ----------
     Тепловая карта: зелёный только у ненулевого; ноль — серая клетка, срок ещё
     не наступил — пустое место, данных нет — тире. Даты и размер когорты —
     своими столбцами, проценты крупно, «вернулись/из скольких» — мелко. */
  .heat{width:calc(100% + 6px);margin:-3px;border-collapse:separate;border-spacing:3px;table-layout:fixed}
  .heat th{font-size:11.5px;font-weight:700;color:var(--ink-3);padding:0 0 4px;text-align:center}
  .heat th.c0{text-align:left;padding-left:2px}
  .heat th.cn,.heat td.cn{text-align:right;padding-right:7px}
  .heat td{height:40px;padding:0;border:0;border-radius:8px;text-align:center;font-size:13px;font-weight:750;line-height:1.05;font-variant-numeric:tabular-nums}
  .heat td small{display:block;font-size:10px;font-weight:600;opacity:.75;margin-top:3px}
  .heat td.c0{text-align:left;padding-left:2px;font-size:13px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .heat td.c0 small{font-size:10.5px;font-weight:500;color:var(--ink-3);opacity:1;margin-top:3px}
  .heat td.cn{color:var(--ink-3);font-weight:650;font-size:12px}
  .heat td.zero{background:var(--well);color:var(--ink-3);font-weight:650}
  .heat td.na{color:var(--ink-4);font-weight:500}
  .heat tr.nobody td.c0,.heat tr.nobody td.cn{color:var(--ink-4)}
  .heat tr.avg td{height:42px}
  .heat tr.avg td.c0{font-weight:800}
  .heat tr.gap td{height:7px;padding:0;border-radius:0;background:linear-gradient(var(--hair),var(--hair)) center/100% 1px no-repeat}
  .heat td.hot{box-shadow:inset 0 0 0 2px var(--ink-2)}
  @media(hover:hover){.heat td[data-tipcell]:hover{box-shadow:inset 0 0 0 2px var(--ink-3)}}
  .hkey{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;margin-top:14px;font-size:11.5px;color:var(--ink-3)}
  .hkey > span{display:inline-flex;align-items:center;gap:6px}
  .ramp{display:inline-flex;gap:2px}
  .ramp i{width:11px;height:9px;border-radius:2px}

  /* ---------- Состав: доли целого ---------- */
  .stack{display:flex;gap:2px;height:10px;border-radius:99px;overflow:hidden}
  .stack i{display:block;height:100%;min-width:3px}
  .lgl{margin-top:10px}
  .lgl > div{display:flex;align-items:center;gap:9px;min-height:36px;padding:5px 0;border-top:1px solid var(--hair)}
  .lgl > div:first-child{border-top:0}
  .lgl .dt{width:9px;height:9px;border-radius:3px;flex:none}
  .lgl .lb{flex:1;min-width:0;font-size:13px;color:var(--ink-2);line-height:1.3}
  .lgl b{font-size:14.5px;font-weight:750;font-variant-numeric:tabular-nums}
  .lgl small{width:38px;text-align:right;font-size:12px;font-weight:650;color:var(--ink-3);font-variant-numeric:tabular-nums;flex:none}

  /* ---------- Полосы (распределения) ----------
     На телефоне подпись и число — одной строкой, полоса под ними: числа
     стоят столбцом у правого края, как в воронке. */
  .bar{display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"l n" "t t";align-items:baseline;column-gap:12px;row-gap:6px;padding:7px 0}
  .bar .bl{grid-area:l;min-width:0;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .bar .bt{grid-area:t;height:6px;border-radius:99px;background:var(--well);position:relative;overflow:hidden}
  .bar .bf{position:absolute;left:0;top:0;height:100%;border-radius:99px}
  .bar .bn{grid-area:n;font-size:13px;font-weight:750;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
  .bar .bn small{font-weight:600;color:var(--ink-3);margin-left:3px}
  @media(min-width:640px){
    .bar{grid-template-columns:minmax(0,170px) minmax(0,1fr) 92px;grid-template-areas:"l t n";align-items:center;row-gap:0}
    .bar .bt{height:8px}
  }
  .lgd{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:10px;font-size:12px;color:var(--ink-3)}
  .lgd span{display:inline-flex;align-items:center;gap:6px}
  .lgd i{width:9px;height:9px;border-radius:3px}

  /* ---------- Списки ---------- */
  .group{background:var(--card);border-radius:20px;box-shadow:var(--edge);overflow:hidden}
  .row{display:flex;align-items:center;gap:12px;width:100%;padding:0 0 0 16px;border:0;background:none;text-align:left;min-width:0}
  .row-main{display:flex;align-items:center;gap:12px;flex:1;min-width:0;min-height:56px;padding:10px 14px 10px 0}
  .group > .row + .row .row-main,.group > .row + * .row-main{border-top:1px solid var(--hair)}
  button.row,button.src-r{transition:background .12s}
  button.row:active,button.src-r:active{background:var(--well)}
  @media(hover:hover){button.row:hover,button.src-r:hover{background:color-mix(in srgb,var(--well) 60%,transparent)}}
  .row .t{font-weight:600;font-size:14px;min-width:0}
  .row .s{font-size:12px;color:var(--ink-3);margin-top:2px;overflow-wrap:anywhere}
  .row .v{margin-left:auto;text-align:right;font-weight:750;font-size:14px;white-space:nowrap;flex:none;font-variant-numeric:tabular-nums}
  .row .v small{display:block;font-weight:500;font-size:11.5px;color:var(--ink-3)}
  .chev{color:var(--ink-4);width:16px;height:16px}

  /* ---------- Источники: таблица — сравнивать столбцом ---------- */
  .src-h,.src-r{display:grid;grid-template-columns:minmax(0,1fr) 40px 52px 60px 34px;column-gap:6px}
  .src-h{align-items:end;padding:12px 14px 8px 16px;font-size:10.5px;font-weight:700;color:var(--ink-3);border-bottom:1px solid var(--hair)}
  .src-h span:not(:first-child),.src-r .num{text-align:right}
  /* Строка: имя и числа — в ряд, пояснение — под ними во всю ширину. */
  .src-r{grid-template-areas:"nm a b c d" "mt mt mt mt mt";align-items:baseline;row-gap:3px;width:100%;padding:11px 14px 11px 16px;border:0;border-top:1px solid var(--hair);background:none;text-align:left}
  .src-h + .src-r{border-top:0}
  .src-nm{grid-area:nm;min-width:0;font-weight:700;font-size:13.5px;overflow-wrap:anywhere}
  .src-nm.tagged{color:var(--brand-text)}
  .src-r .num{font-size:13.5px;font-weight:750;font-variant-numeric:tabular-nums}
  .src-r .num.dim{color:var(--ink-4);font-weight:600}
  .src-mt{grid-area:mt;font-size:11.5px;color:var(--ink-3);line-height:1.4}

  /* ---------- Люди ---------- */
  .search{
    flex:1 1 220px;min-width:0;height:36px;padding:0 14px;border-radius:99px;border:0;background:var(--well);
    color:var(--ink);font:500 14px Manrope,sans-serif;outline:none;
  }
  .search:focus{box-shadow:0 0 0 2px var(--mark-wash),0 0 0 1px var(--mark)}
  .ava{width:36px;height:36px;border-radius:99px;flex:none;display:grid;place-items:center;font-weight:800;font-size:14px;color:var(--ink-2);background:var(--well)}
  .ava.on{color:#fff;background:var(--mark)}
  .who{min-width:0;flex:1}
  .who .l1{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}
  .who .nm{font-weight:700;font-size:14px;overflow-wrap:anywhere}
  .who .un{font-size:12px;color:var(--ink-3)}
  .who .l2{font-size:12px;color:var(--ink-3);margin-top:2px}
  .who .l2 b{color:var(--ink);font-weight:700}
  .sdot{display:inline-block;width:7px;height:7px;border-radius:99px;margin-right:6px;vertical-align:1px}
  .more{display:block;margin:12px auto 0;height:36px;padding:0 18px;border-radius:99px;border:0;background:var(--well);font-weight:650;font-size:13px;color:var(--ink-2)}

  /* ---------- Ссылки для рекламы ---------- */
  .field{width:100%;height:42px;padding:0 14px;border-radius:14px;border:0;background:var(--well);color:var(--ink);font:600 15px Manrope,sans-serif;outline:none}
  .field:focus{box-shadow:0 0 0 2px var(--mark-wash),0 0 0 1px var(--mark)}
  .linkrow{display:flex;align-items:center;gap:10px;padding:12px 0;border-top:1px solid var(--hair)}
  .linkrow:first-of-type{border-top:0}
  .linkrow .u{flex:1;min-width:0;font-size:12.5px;color:var(--ink-3);overflow-wrap:anywhere}
  .linkrow .u b{display:block;color:var(--ink);font-size:14px;margin-bottom:2px}
  .btn{height:36px;padding:0 14px;border-radius:99px;border:0;background:var(--mark);color:#fff;font-weight:700;font-size:13px;white-space:nowrap;flex:none}
  .btn.ghost{background:var(--well);color:var(--ink)}

  /* ---------- Подсказка, тост, шторка ---------- */
  .tip{
    position:fixed;z-index:60;pointer-events:none;opacity:0;transition:opacity .12s;max-width:240px;
    background:var(--raised);border-radius:12px;padding:9px 11px;font-size:12px;line-height:1.4;box-shadow:var(--tip-sh);
  }
  .tip.on{opacity:1}
  .tip .d{color:var(--ink-3);font-size:11.5px;margin-bottom:4px}
  .tip .r{display:flex;align-items:center;gap:7px;color:var(--ink-2)}
  .tip .r b{color:var(--ink);font-weight:800;min-width:22px;font-variant-numeric:tabular-nums}
  .tip .r i{display:inline-block;width:10px;height:3px;border-radius:2px}
  .toast{
    position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom,0px));z-index:70;transform:translate(-50%,20px);
    opacity:0;transition:opacity .2s,transform .2s;pointer-events:none;
    background:var(--ink);color:var(--page);border-radius:99px;padding:10px 16px;font-size:13px;font-weight:650;max-width:calc(100% - 32px);
  }
  .toast.on{opacity:1;transform:translate(-50%,0)}
  .sheet{position:fixed;inset:0;z-index:50}
  .sheet-bg{position:absolute;inset:0;background:rgba(0,0,0,.5)}
  .sheet-card{
    position:absolute;left:0;right:0;bottom:0;max-height:88vh;overflow:auto;background:var(--page);
    border-radius:24px 24px 0 0;padding:8px 16px calc(24px + env(safe-area-inset-bottom,0px));
    max-width:640px;margin:0 auto;box-shadow:0 0 0 1px var(--hair);
    animation:up .25s cubic-bezier(.16,1,.3,1);
  }
  @keyframes up{from{transform:translateY(30px)}to{transform:translateY(0)}}
  .grab{width:40px;height:5px;border-radius:99px;background:var(--well);margin:4px auto 12px}
  .ph{display:flex;align-items:center;gap:12px}
  .ph .ava{width:52px;height:52px;font-size:20px}
  .ph h3{margin:0;font-size:18px;font-weight:800;letter-spacing:-.02em;overflow-wrap:anywhere}
  .chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
  .kv{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:12px;font-size:12.5px;color:var(--ink-3)}
  .kv b{color:var(--ink)}
  .dotkey{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:6px;vertical-align:-1px}
  .cal{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;margin-top:8px}
  .cal span{aspect-ratio:1;border-radius:6px;background:var(--well)}
  .cal span.y{background:var(--mark)}
  .cal span.u{background:none;box-shadow:inset 0 0 0 1px var(--hair)}
  .cal span.x{background:none}
  .cal span.t{box-shadow:0 0 0 2px var(--ink-3)}

  /* ---------- Вход ---------- */
  #login{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
  .loginbox{background:var(--card);border-radius:24px;padding:28px 22px;width:min(380px,100%);box-shadow:var(--edge)}
  .loginbox h1{font-size:20px;margin:12px 0 6px;letter-spacing:-.02em}
  .loginbox p{color:var(--ink-2);font-size:14px;margin:0 0 18px}
  .loginbox .btn{width:100%;height:46px;margin-top:12px;font-size:15px;border-radius:14px}
  .check{display:flex;align-items:center;gap:8px;margin-top:12px;font-size:13.5px;color:var(--ink-2)}
  .check input{width:18px;height:18px;accent-color:var(--mark)}
  .err{color:var(--bad);font-size:13px;min-height:18px;margin-top:10px;font-weight:600}
  .banner{display:flex;align-items:center;gap:10px;margin-top:12px;padding:11px 14px;border-radius:14px;background:var(--well);font-size:12.5px;color:var(--ink-2)}
  .spin{width:14px;height:14px;border-radius:99px;border:2px solid var(--hair);border-top-color:var(--mark);animation:sp .7s linear infinite;flex:none}
  @keyframes sp{to{transform:rotate(360deg)}}
  .loading #view{opacity:.55;transition:opacity .2s}
  .foot{display:flex;align-items:center;justify-content:space-between;gap:4px 12px;flex-wrap:wrap;margin-top:28px;padding-top:14px;border-top:1px solid var(--hair);font-size:12px;color:var(--ink-3)}

  @media(max-width:520px){
    .brand .sub{display:none}
    .card{padding:14px}
    .panel > div{padding:13px 14px 12px}
  }
  @media(max-width:389px){
    .tabs button{font-size:13.5px;padding:0 5px}
  }
  @media(max-width:370px){
    .hero-num{font-size:46px}
    .panel .val{font-size:25px}
  }
  @media(max-width:359px){
    .tabs{padding:0 4px}
    .tabs button{font-size:13px;padding:0 4px}
  }
  @media(max-width:339px){.tabs button{font-size:12.5px;padding:0 3px}}
</style>
</head>
<body>
  <div id="login" hidden>
    <div class="loginbox">
      <span class="brand"><span class="dot"></span>Кошель</span>
      <h1>Аналитика</h1>
      <p id="login-text">Введите пароль администратора. Из бота дашборд открывается без пароля — команда /admin.</p>
      <div id="login-form">
        <input class="field" id="login-pass" type="password" autocomplete="current-password" placeholder="Пароль" />
        <label class="check"><input type="checkbox" id="login-remember" checked /> Запомнить на этом устройстве</label>
        <button class="btn" id="login-btn">Войти</button>
      </div>
      <div class="err" id="login-err"></div>
    </div>
  </div>

  <div id="app" hidden>
    <header class="appbar">
      <div class="brand"><span class="dot"></span>Кошель <span class="sub">аналитика</span></div>
      <div class="spacer"></div>
      <button class="status" id="status" hidden><i></i><span></span></button>
      <button class="icon" id="refresh" aria-label="Обновить"><svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg></button>
      <button class="icon" id="theme" aria-label="Тема"><svg viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg></button>
      <button class="icon" id="logout" aria-label="Выйти"><svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg></button>
    </header>
    <nav class="tabbar" aria-label="Разделы"><div class="tabs" id="tabs"></div></nav>
    <main class="wrap">
      <div id="banner"></div>
      <div id="view"></div>
      <div class="foot"><span id="updated"></span><button class="linkbtn" data-act="digest">Прислать сводку в Telegram</button></div>
    </main>
  </div>

  <div class="sheet" id="sheet" hidden><div class="sheet-bg" data-act="close"></div><div class="sheet-card" id="sheet-card"></div></div>
  <div class="tip" id="tip"></div>
  <div class="toast" id="toast"></div>

<script>
(function(){
  'use strict';
  var KEY='koshel_admin_key', THEME='koshel_admin_theme', BOT='TrueManiManager_Bot';
  /* Проект Microsoft Clarity — тот же номер, что CLARITY_ID в src/lib/clarity.ts
     приложения. Пусто — кнопки «Записи в Clarity» нет. */
  var CLARITY_PROJECT='';
  var D=null;
  var S={ tab:'overview', win:'7', src:'all', chart:'growth', range:30, table:false,
          retMode:'d', retSrc:'all', pq:'', pf:'all', ps:'ls', pcap:30, tag:'' };
  var TG=null, tgInit='', busy=false, lastLoad=0, sheetOpen=false;
  var DAY=86400000;

  function $(id){ return document.getElementById(id); }
  function esc(s){ s=String(s==null?'':s); return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  function nf(n){ return (Number(n)||0).toLocaleString('ru-RU'); }
  function pcn(part,whole){ return whole>0 ? Math.round(part/whole*100) : 0; }
  function pct(part,whole){ return whole>0 ? pcn(part,whole)+'%' : '—'; }
  function cssVar(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function isDark(){ return document.documentElement.getAttribute('data-theme')==='dark'; }

  var MON=['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
  var MON_EN=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  var MONF=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  /** «5 окт» из строки YYYY-MM-DD — без часовых поясов браузера. */
  function dshort(s){ var p=String(s).split('-'); return Number(p[2])+' '+MON[Number(p[1])-1]; }
  function mskParts(ms){ var d=new Date(ms+3*3600000); return { y:d.getUTCFullYear(), m:d.getUTCMonth(), d:d.getUTCDate(), h:d.getUTCHours(), mi:d.getUTCMinutes() }; }
  function two(n){ return (n<10?'0':'')+n; }
  function tmsk(ms){ var p=mskParts(ms); return two(p.h)+':'+two(p.mi); }
  function dmsk(ms){ var p=mskParts(ms); return p.d+' '+MON[p.m]; }
  function dtmsk(ms){ var p=mskParts(ms); return p.d+' '+MONF[p.m]+', '+two(p.h)+':'+two(p.mi); }
  function ago(ms){
    if(!ms) return '—';
    var m=Math.floor((Date.now()-ms)/60000);
    if(m<1) return 'только что';
    if(m<60) return m+' мин назад';
    var h=Math.floor(m/60); if(h<24) return h+' ч назад';
    var d=Math.floor(h/24); if(d===1) return 'вчера';
    if(d<7) return d+' дн. назад';
    if(d<30) return Math.floor(d/7)+' нед. назад';
    if(d<365) return Math.floor(d/30)+' мес. назад';
    return Math.floor(d/365)+' г. назад';
  }

  /* ---------- Иконки (линейные, как в приложении) ---------- */
  var IC={
    up:'<svg viewBox="0 0 24 24"><path d="M7 17 17 7"/><path d="M8 7h9v9"/></svg>',
    down:'<svg viewBox="0 0 24 24"><path d="M7 7l10 10"/><path d="M17 8v9H8"/></svg>',
    good:'<svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/></svg>',
    bad:'<svg class="ic" viewBox="0 0 24 24"><path d="M10.3 3.9 2.6 17.4A2 2 0 0 0 4.3 20.4h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
    info:'<svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></svg>',
    chev:'<svg class="ic chev" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>',
    close:'<svg class="ic" viewBox="0 0 24 24"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
    flow:'<svg class="ic" viewBox="0 0 24 24"><path d="m15 10 5 5-5 5"/><path d="M4 4v7a4 4 0 0 0 4 4h12"/></svg>',
    bellOff:'<svg class="ic" viewBox="0 0 24 24"><path d="M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5"/><path d="M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="m2 2 20 20"/></svg>'
  };

  /** Честное изменение: на маленькой базе проценты врут («+1000%»), поэтому
      при прошлом значении меньше десяти показываем само прошлое значение. */
  function delta(cur,prev,upGood,word){
    if(prev==null) return '';
    cur=Number(cur)||0; prev=Number(prev)||0;
    if(cur===prev) return '<span class="chip flat">'+esc(word)+' столько же</span>';
    var up=cur>prev, good=(up===upGood);
    // Скачок в разы (после рекламы) в процентах тоже бессмыслен: «+820%» не
    // читается, «неделей раньше 10» — читается.
    var plain=prev<10 || Math.abs(cur-prev)/prev>3;
    var txt=plain ? (word+' '+nf(prev)) : ((up?'+':'−')+Math.abs(Math.round((cur-prev)/prev*100))+'%');
    return '<span class="chip '+(good?'good':'bad')+'">'+(up?IC.up:IC.down)+esc(txt)+'</span>';
  }

  /* ---------- Тема ---------- */
  function applyTheme(t,save){
    document.documentElement.setAttribute('data-theme',t);
    if(save){ try{ localStorage.setItem(THEME,t); }catch(e){} }
    if(TG){
      var bg=t==='dark'?'#0C0D0C':'#F3F4F1';
      try{ if(TG.setHeaderColor) TG.setHeaderColor(bg); if(TG.setBackgroundColor) TG.setBackgroundColor(bg); }catch(e){}
    }
  }
  function initTheme(){
    var t=null;
    try{ t=localStorage.getItem(THEME); }catch(e){}
    if(!t) t=(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
    applyTheme(t,false);
  }

  /* ---------- Подсказка ---------- */
  var tipEl=null, tipHideT=null;
  /** Показать подсказку у точки; не даём ей выйти за край экрана. */
  function showTip(html,x,y){
    tipEl.innerHTML=html; tipEl.className='tip on';
    var w=tipEl.offsetWidth, h=tipEl.offsetHeight, vw=document.documentElement.clientWidth;
    var left=Math.min(Math.max(8,x-w/2),vw-w-8);
    var top=y-h-12; if(top<8) top=y+16;
    tipEl.style.left=left+'px'; tipEl.style.top=top+'px';
    clearTimeout(tipHideT);
  }
  function hideTip(){
    tipEl.className='tip';
    var h=document.querySelector('.heat td.hot'); if(h) h.classList.remove('hot');
  }

  /* ---------- Тост ---------- */
  var toastT=null;
  function toast(msg){
    var t=$('toast'); t.textContent=msg; t.className='toast on';
    clearTimeout(toastT); toastT=setTimeout(function(){ t.className='toast'; },2400);
  }

  /* ---------- Доступ ---------- */
  function savedKey(){
    try{ return localStorage.getItem(KEY) || sessionStorage.getItem(KEY); }catch(e){ return null; }
  }
  function headers(){
    var h={'Content-Type':'application/json'};
    if(tgInit) h['X-Tg-Init-Data']=tgInit; else h['X-Admin-Key']=savedKey()||'';
    return h;
  }
  function api(path,body){
    return fetch(path,{method:'POST',headers:headers(),body:JSON.stringify(body||{})}).then(function(r){
      if(r.status===403){ var e=new Error('forbidden'); e.code=403; throw e; }
      if(r.status===429){ var e2=new Error('slow'); e2.code=429; throw e2; }
      return r.json();
    });
  }
  function showLogin(msg){
    $('app').hidden=true; $('login').hidden=false;
    if(tgInit){
      $('login-form').hidden=true;
      $('login-text').textContent='Эта страница — только для владельца Кошеля. Ваш аккаунт Telegram не подходит.';
    } else {
      $('login-err').textContent=msg||'';
      setTimeout(function(){ try{ $('login-pass').focus(); }catch(e){} },50);
    }
  }
  function showApp(){ $('login').hidden=true; $('app').hidden=false; $('logout').hidden=!!tgInit; }

  /* ---------- Загрузка ---------- */
  function load(opts){
    opts=opts||{};
    if(busy) return;
    if(!tgInit && !savedKey()){ showLogin(); return; }
    busy=true; if(D) document.body.classList.add('loading');
    api('/admin/stats',{fresh:!!opts.fresh, backfill:!!opts.backfill}).then(function(d){
      busy=false; document.body.classList.remove('loading');
      if(!d || !d.ok){ toast('Не удалось загрузить данные'); return; }
      D=d; lastLoad=Date.now(); showApp(); render(); paintBanner();
      if(!opts.backfill) autoBackfill();
    }).catch(function(e){
      busy=false; document.body.classList.remove('loading');
      if(e && e.code===403){ try{ localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); }catch(x){} showLogin(D?'Сессия закончилась — войдите снова':'Неверный пароль'); return; }
      if(e && e.code===429){ toast('Слишком часто — подождите минуту'); return; }
      toast('Нет связи с сервером');
    });
  }

  /* Дозаполнение карточек — порциями, сами, пока база не пройдена. */
  var bfBusy=false, bfDone=false;
  function autoBackfill(){
    if(bfBusy||bfDone||!D) return;
    var cov=D.coverage||{};
    if(((cov.cloudKeys||0)-(cov.withCard||0))<=0){ bfDone=true; return; }
    bfBusy=true; paintBanner();
    var rounds=0;
    (function step(){
      rounds++;
      api('/admin/stats',{backfill:true}).then(function(d){
        if(!d||!d.ok){ bfBusy=false; bfDone=true; paintBanner(); return; }
        D=d; var bf=d.backfill||{};
        if(bf.done||!bf.scanned||rounds>=40){ bfBusy=false; bfDone=true; render(); paintBanner(); return; }
        paintBanner(); step();
      }).catch(function(){ bfBusy=false; bfDone=true; paintBanner(); });
    })();
  }
  function paintBanner(){
    var host=$('banner'); if(!host||!D) return;
    var cov=D.coverage||{}, miss=(cov.cloudKeys||0)-(cov.withCard||0);
    if(miss<=0 && !bfBusy){ host.innerHTML=''; return; }
    host.innerHTML='<div class="banner">'+(bfBusy?'<span class="spin"></span>':'')
      +'<span>Собраны данные по '+nf(cov.withCard)+' из '+nf(cov.cloudKeys)+' человек — пока идёт сбор, разделы и настройки занижены.</span></div>';
  }

  /* ---------- Вкладки ---------- */
  var TABS=[['overview','Сводка'],['retention','Удержание'],['sources','Источники'],['people','Люди'],['product','Продукт']];
  function renderTabs(){
    $('tabs').innerHTML=TABS.map(function(t){
      return '<button data-act="tab" data-v="'+t[0]+'"'+(S.tab===t[0]?' class="on" aria-current="page"':'')+'><span>'+t[1]+'</span></button>';
    }).join('');
  }
  function render(){
    if(!D) return;
    renderTabs(); renderStatus();
    var html='';
    if(S.tab==='overview') html=viewOverview();
    else if(S.tab==='retention') html=viewRetention();
    else if(S.tab==='sources') html=viewSources();
    else if(S.tab==='people') html=viewPeople();
    else html=viewProduct();
    $('view').innerHTML=html;
    afterRender();
    tickUpdated();
  }
  function tickUpdated(){
    if(!D) return;
    $('updated').textContent='Обновлено '+tmsk(D.generatedAt)+' МСК · само раз в минуту';
  }

  /* ---------- Шапка: состояние бота ---------- */
  function renderStatus(){
    var w=D.webhook, el=$('status');
    if(!w){ el.hidden=true; return; }
    el.hidden=false;
    var color, text;
    if(!w.registered){ color='var(--bad-dot)'; text='Бот не принимает'; }
    else if(!w.ok){ color=w.pending>0?'var(--warn-dot)':'var(--bad-dot)'; text=w.pending>0?('Очередь '+nf(w.pending)):'Бот: ошибка'; }
    else { color='var(--good-dot)'; text='Бот на связи'; }
    el.querySelector('i').style.background=color;
    el.querySelector('span').textContent=text;
  }

  /* ================================================================== */
  /* Сводка                                                              */
  /* ================================================================== */
  function viewOverview(){
    return heroToday()+kpis()+insightsBlock()+funnelBlock()+growthBlock();
  }

  function heroToday(){
    var t=D.today, k=D.kpi, hours=t.hours, hy=t.hoursY, i;
    // Шкала не мельче четырёх человек в час: иначе один человек — столбик во всю высоту.
    var max=4;
    for(i=0;i<24;i++){ if((hours[i]||0)>max) max=hours[i]; if((hy[i]||0)>max) max=hy[i]; }
    var cols='';
    for(i=0;i<24;i++){
      var v=i<hours.length?hours[i]:null, yv=hy[i]||0;
      var h=v==null?0:Math.round(v/max*100), hyp=Math.min(98,Math.round(yv/max*100));
      cols+='<div class="hcol'+(i===t.hourNow?' now':'')+'" data-hour="'+i+'">'
        +(v?'<div class="b" style="height:'+Math.max(4,h)+'%"></div>':'')
        +(yv?'<div class="y" style="bottom:'+hyp+'%"></div>':'')+'</div>';
    }
    var act=t.act||0, viaBot=t.bot||0;
    var side='за последний час <b>'+nf(k.lastHour)+'</b><br>обычно <b>'+nf(k.usual)+'</b> в день';
    return '<section class="hero">'
      +'<div class="k"><span class="live"></span>Сегодня до '+tmsk(D.generatedAt)+' МСК</div>'
      +'<div class="hero-top"><div class="hero-num">'+nf(k.newToday)+'<small>новых</small></div><div class="hero-side">'+side+'</div></div>'
      +'<div class="hours" id="hours">'+cols+'</div>'
      +'<div class="haxis"><span>0</span><span>6</span><span>12</span><span>18</span><span>23 ч</span></div>'
      +'<div class="hlegend"><span><i></i>сегодня</span><span><i class="tick"></i>вчера в тот же час</span></div>'
      +'<div class="hero-stats">'
      +'<div><b>'+nf(act)+'</b>записали операцию'+(k.newToday?' · '+pct(act,k.newToday):'')+'</div>'
      +'<div><b>'+nf(viaBot)+'</b>пишут боту</div>'
      +'<div><b>'+nf(k.dau)+'</b>заходили · '+nf(k.dauBack)+' вернулись</div>'
      +'</div></section>';
  }

  /** Заголовок раздела; справа — подпись или переключатель (готовый HTML). */
  function sec(title,aside){
    return '<div class="sec"><h2>'+esc(title)+'</h2>'+(aside?(aside.charAt(0)==='<'?aside:'<span class="aside">'+aside+'</span>'):'')+'</div>';
  }
  /** Ячейка панели показателей: подпись, число, пояснение, спарклайн по ключу. */
  function cell(label,value,meta,sparkKey){
    return '<div><div class="lb">'+esc(label)+'</div>'
      +'<div class="val">'+value+'</div>'
      +(meta?'<div class="meta">'+meta+'</div>':'')
      +(sparkKey?'<div class="spark" data-spark="'+sparkKey+'"></div>':'')+'</div>';
  }
  function panel(cells){ return '<div class="panel">'+cells.join('')+'</div>'; }
  /** Сутки idx строкой YYYY-MM-DD (МСК) — ключ строки ночного снимка. */
  function dayStr(idx){ var d=new Date(idx*DAY); return d.getUTCFullYear()+'-'+two(d.getUTCMonth()+1)+'-'+two(d.getUTCDate()); }
  /** Ночной снимок на конец суток ago дней назад: с ним сравниваем «за 7/30 дней». */
  function histAgo(ago){
    var key=dayStr(todayIdx()-ago), h=D.history||[];
    for(var i=h.length-1;i>=0;i--) if(h[i].date===key) return h[i];
    return null;
  }
  /** Спарклайны под период: 14 дней — посуточные ряды, 30 дней и «Все» — ночные снимки. */
  var SPARK={};
  function sparkFor(win){
    var sp=D.spark, k=D.kpi, h=D.history||[];
    if(win==='30'){
      var t=h.slice(-30);
      return {
        fresh:t.map(function(r){ return r.new; }).concat([k.newToday]),
        active:t.map(function(r){ return r.dau; }).concat([k.dau]),
        writers:t.map(function(r){ return r.writers==null?null:r.writers; }).concat([k.writers7])
      };
    }
    if(win==='all') return { total:h.map(function(r){ return r.total; }).concat([k.total]) };
    return { fresh:sp.fresh, active:sp.active, writers:sp.writers };
  }
  /** «Главное» — за период сводки (тот же, что у воронки ниже): каждое число
      за выбранный срок и в сравнении с таким же сроком до него. */
  function kpis(){
    var k=D.kpi, sp=D.spark, n=sp.days.length, w=S.win, cells;
    SPARK=sparkFor(w);
    var dw=k.d1w?k.d1w[w]:null, d1c;
    if(w==='1'){
      d1c=dw&&dw.base ? cell('Вчерашние новички сегодня',nf(dw.n),'<span>из '+nf(dw.base)+' пришедших вчера</span>',null)
        : cell('Вчерашние новички сегодня','—','<span>вчера никто не пришёл</span>',null);
    } else {
      var d=dw||k.d1||{base:0,n:0}, per=!dw?'за две недели':(w==='7'?'за неделю':(w==='30'?'за 30 дней':(D.trackFrom?'с '+dshort(D.trackFrom):'за всё время')));
      d1c=cell('Вернулись на 2-й день',d.base>=5?pcn(d.n,d.base)+'%':'—',
        '<span>'+(d.base>=5?nf(d.n)+' из '+nf(d.base)+' '+per:'копится: нужно хотя бы 5 новичков с прожитым вторым днём')+'</span>',null);
    }
    if(w==='1'){
      var t=D.today, yBy=0;
      for(var i=0;i<=t.hourNow && i<24;i++) yBy+=t.hoursY[i]||0;
      cells=[
        cell('Новые сегодня',nf(k.newToday),delta(k.newToday,yBy,true,'вчера к этому часу'),'fresh'),
        cell('Заходили сегодня',nf(k.dau),'<span>новых '+nf(k.dauNew)+' · вернулись '+nf(k.dauBack)+'</span>','active'),
        cell('Пишут сегодня',nf(k.writersToday||0),'<span>за 7 дней '+nf(k.writers7)+'</span>','writers'),
        d1c
      ];
    } else if(w==='30'){
      var ma=histAgo(30);
      cells=[
        cell('Новые за 30 дней',nf(k.new30),k.newPrev30!=null?delta(k.new30,k.newPrev30,true,'30 дней до этого'):'','fresh'),
        cell('Заходили за 30 дней',nf(k.mau),ma?delta(k.mau,ma.mau,true,'месяц назад'):'','active'),
        cell('Пишут за 30 дней',nf(k.writers30),'<span>за 7 дней '+nf(k.writers7)+'</span>','writers'),
        d1c
      ];
    } else if(w==='all'){
      cells=[
        cell('Всего людей',nf(k.total),'<span>сами '+nf(k.organic)+' · по ссылкам друзей '+nf(k.fromRef)+' · реклама '+nf(k.campaign)+'</span>','total'),
        cell('Открывали приложение',nf(k.inApp),'<span>'+pct(k.inApp,k.total)+' всех</span>',null),
        cell('С операциями',nf(k.withOps),'<span>'+pct(k.withOps,k.total)+' всех</span>',null),
        d1c
      ];
    } else {
      var wa=histAgo(7), wPrev=sp.writers[n-8];
      cells=[
        cell('Новые за 7 дней',nf(k.new7),delta(k.new7,k.newPrev7,true,'неделей раньше'),'fresh'),
        cell('Заходили за 7 дней',nf(k.wau),wa?delta(k.wau,wa.wau,true,'неделей раньше'):'','active'),
        cell('Пишут за 7 дней',nf(k.writers7),(wPrev!=null?delta(k.writers7,wPrev,true,'неделей раньше'):'')+'<span>из них боту '+nf(D.bot.writers7)+'</span>','writers'),
        d1c
      ];
    }
    return sec('Главное',segButtons('win',WIN_SEGS,S.win))+panel(cells);
  }

  function insightsBlock(){
    var list=D.insights||[];
    if(!list.length) return '';
    return sec('Что важно','')+'<div class="card">'
      +list.map(function(x){
        var icon=x.tone==='good'?IC.good:(x.tone==='bad'?IC.bad:IC.info);
        var word=x.tone==='good'?'Хорошо: ':(x.tone==='bad'?'Внимание: ':'');
        return '<div class="ins '+x.tone+'">'+icon+'<p><span class="muted">'+word+'</span>'+esc(x.text)+'</p></div>';
      }).join('')+'</div>';
  }

  var WIN_SEGS=[['all','Все'],['30','30 дн'],['7','7 дн'],['1','Сегодня']];
  var FUNNEL_LABELS=['Пришли','Записали операцию','Вернулись в другой день','Набрали 5 операций','Пишут сейчас'];
  function segSelect(act,value){
    var opts=(D.segments||[]).map(function(s){
      return '<option value="'+esc(s.key)+'"'+(s.key===value?' selected':'')+'>'+esc(s.key==='all'?'Все источники':s.label)+'</option>';
    }).join('');
    return '<select class="select" data-act="'+act+'">'+opts+'</select>';
  }
  function segButtons(act,items,value,cls){
    return '<div class="seg'+(cls?' '+cls:'')+'">'+items.map(function(it){
      return '<button data-act="'+act+'" data-v="'+it[0]+'"'+(String(value)===String(it[0])?' class="on"':'')+'>'+it[1]+'</button>';
    }).join('')+'</div>';
  }
  /** Воронка одной композицией: ступень — число и доля от входа, между
      ступенями — переход (дошли / не дошли). Отвалившиеся видны на полосе
      приглушённым красным, самая большая потеря — плашкой. */
  function funnelHtml(steps,labels,empty){
    var base=steps[0]||0, worst=-1, worstLoss=0, i;
    if(!base) return '<div class="empty">'+esc(empty||'В этом срезе пока никого нет')+'</div>';
    for(i=1;i<steps.length;i++){ var l=steps[i-1]-steps[i]; if(steps[i-1]>0 && l>0 && l/steps[i-1]>worstLoss){ worstLoss=l/steps[i-1]; worst=i; } }
    var html='<div class="fn">';
    for(i=0;i<steps.length;i++){
      if(i>0){
        var prev=steps[i-1], dropped=prev-steps[i], isWorst=i===worst && base>=5;
        html+='<div class="fn-gap'+(isWorst?' worst':'')+'">'+IC.flow
          +(prev>0?'<span><b>'+pct(steps[i],prev)+'</b> дошли'+(dropped>0?' · <b class="lost">'+nf(dropped)+'</b> не дошли':'')+'</span>':'')
          +(isWorst?'<span class="flag">главная потеря</span>':'')+'</div>';
      }
      var share=steps[i]/base*100, before=i>0?steps[i-1]/base*100:0;
      html+='<div class="fn-step"><div class="fn-head"><span class="fn-lb">'+esc(labels[i])+'</span>'
        +'<span class="fn-n">'+nf(steps[i])+'</span><span class="fn-pc">'+Math.round(share)+'%</span></div>'
        +'<div class="fn-bar">'
        +(before>share?'<i class="lose" style="width:'+Math.max(1.5,before).toFixed(1)+'%"></i>':'')
        +(steps[i]?'<i class="fill" style="width:'+Math.max(1.5,share).toFixed(1)+'%"></i>':'')
        +'</div></div>';
    }
    return html+'</div>';
  }
  function funnelBlock(){
    var bySrc=D.funnels[S.src]||D.funnels.all, f=bySrc[S.win]||bySrc.all, steps=f.steps, base=steps[0]||0;
    return sec('Путь до привычки',segSelect('src',S.src))
      +'<div class="card">'+segButtons('win',WIN_SEGS,S.win,'full')+funnelHtml(steps,FUNNEL_LABELS)
      +(base?'<div class="facts"><span>открыли приложение <b>'+nf(f.app)+'</b></span><span>писали боту <b>'+nf(f.bot)+'</b></span></div>':'')
      +'</div><p class="note cap">Каждая ступень — часть предыдущей; проценты справа — от пришедших. Окно — когда человек пришёл.</p>';
  }

  /* ---------- График динамики ---------- */
  var METRICS={
    growth:{ title:'Всего людей', type:'area', series:[{key:'total',label:'Всего людей',c:'--s1'},{key:'withData',label:'С операциями',c:'--s2'}] },
    active:{ title:'Активность', type:'line', series:[{key:'wau',label:'Заходили за 7 дней',c:'--s1'},{key:'writers',label:'Писали за 7 дней',c:'--s2'},{key:'dau',label:'Заходили за день',c:'--s3'}] },
    inflow:{ title:'Новые за день', type:'bars', series:[{key:'new',label:'Новые за день',c:'--s1'}] }
  };
  var CHART_SEGS=[['growth','Рост'],['active','Активность'],['inflow','Приток']];
  var RANGE_SEGS=[[14,'14 дн'],[30,'30 дн'],[60,'60 дн']];
  function histRows(){
    var h=(D.history||[]).slice(-S.range);
    return h;
  }
  /** Период — у заголовка раздела, показатель — первым в карточке; под ним
      текущее значение и изменение за период: заголовок, число и график читаются
      одним взглядом. Палец на графике показывает в этой же шапке значения дня. */
  function growthBlock(){
    var conf=METRICS[S.chart], rows=histRows();
    var body;
    if(rows.length<2) body='<div class="empty">История копится со дня первых ночных снимков — нужно хотя бы двое суток.</div>';
    else body='<div class="ch-head"><div class="ch-val" id="chv"></div><div class="ch-cap" id="chc"></div></div>'
      +'<div class="chart" id="chart"></div>'
      +(conf.series.length>1?'<div class="legend" id="legend"></div>':'')
      +(S.table?'<div class="tablev">'+historyTable(conf,rows)+'</div>':'')
      +'<div class="ch-foot"><span class="note">на конец суток</span><button class="linkbtn" data-act="table">'+(S.table?'Скрыть таблицу':'Показать таблицей')+'</button></div>';
    return sec('Динамика',segButtons('range',RANGE_SEGS,S.range))
      +'<div class="card">'+segButtons('chart',CHART_SEGS,S.chart,'full')+body+'</div>';
  }
  /** Знаковое изменение плашкой: «+57 с 26 сен». */
  function changeChip(d,since){
    if(!d) return '<span class="chip flat">без изменений '+esc(since)+'</span>';
    return '<span class="chip '+(d>0?'good':'bad')+'">'+(d>0?IC.up:IC.down)+(d>0?'+':'−')+nf(Math.abs(d))+' '+esc(since)+'</span>';
  }
  function avg1(x){ return (Math.round(x*10)/10).toLocaleString('ru-RU'); }
  /** Шапка графика: последнее значение (или дня под пальцем) и легенда со значениями. */
  function readout(idx){
    var vEl=$('chv'), cEl=$('chc'); if(!vEl) return;
    var conf=METRICS[S.chart], rows=histRows(), n=rows.length, p=conf.series[0];
    var at=idx==null?n-1:idx, k;
    if(conf.type==='bars'){
      if(idx==null){
        var sum=0; for(k=0;k<n;k++) sum+=Number(rows[k][p.key])||0;
        vEl.textContent=nf(sum);
        cEl.innerHTML='<span>новых за '+n+' дн · в среднем '+avg1(sum/n)+' в день</span>';
      } else {
        vEl.textContent=nf(rows[at][p.key]||0);
        cEl.innerHTML='<span>новых '+dshort(rows[at].date)+'</span>';
      }
    } else {
      var last=at; while(last>=0 && rows[last][p.key]==null) last--;
      var v=last>=0?rows[last][p.key]:null;
      vEl.textContent=v==null?'—':nf(v);
      var what='<span>'+esc(p.label.toLowerCase())+'</span>';
      if(idx!=null) cEl.innerHTML='<span>'+esc(p.label.toLowerCase())+' на '+dshort(rows[at].date)+'</span>';
      else {
        var first=0; while(first<n && rows[first][p.key]==null) first++;
        cEl.innerHTML=what+(v!=null && first<last ? changeChip(v-rows[first][p.key],'с '+dshort(rows[first].date)) : '');
      }
    }
    var lg=$('legend');
    if(lg) lg.innerHTML=conf.series.map(function(s){
      var sv=rows[at][s.key];
      return '<span><i style="background:'+cssVar(s.c)+'"></i>'+esc(s.label)+' <b>'+(sv==null?'—':nf(sv))+'</b></span>';
    }).join('');
  }
  var chartReset=null;
  function historyTable(conf,rows){
    var html='<table><thead><tr><th>Дата</th>'+conf.series.map(function(s){ return '<th class="r">'+esc(s.label)+'</th>'; }).join('')+'</tr></thead><tbody>';
    for(var i=rows.length-1;i>=0;i--){
      html+='<tr><td>'+dshort(rows[i].date)+'</td>'+conf.series.map(function(s){
        var v=rows[i][s.key]; return '<td class="r tnum">'+(v==null?'—':nf(v))+'</td>';
      }).join('')+'</tr>';
    }
    return html+'</tbody></table>';
  }

  /** Ось с круглым ШАГОМ: круглый максимум, делённый на четыре, даёт 0·6·13·19·25. */
  function axisFor(v){
    if(v<=4) return { step:1, max:Math.max(1,Math.ceil(v)) };
    var target=v/4, pow=Math.pow(10,Math.floor(Math.log(target)/Math.LN10));
    var steps=[1,1.5,2,2.5,3,4,5,7.5,10];
    for(var i=0;i<steps.length;i++){ var st=steps[i]*pow; if(st>=target) return { step:st, max:st*4 }; }
    return { step:pow*10, max:pow*40 };
  }

  function drawChart(){
    var host=$('chart'); if(!host) return;
    var conf=METRICS[S.chart], rows=histRows(), n=rows.length, bars=conf.type==='bars';
    var W=Math.max(260,host.clientWidth||600), narrow=W<520;
    var H=narrow?176:216, padT=10, padB=24, padR=bars?0:6;
    var max=1,i,j;
    for(i=0;i<n;i++) for(j=0;j<conf.series.length;j++){ var v=Number(rows[i][conf.series[j].key]); if(v>max) max=v; }
    var ax=axisFor(max); max=ax.max;
    // Ось слева — ровно по ширине самой длинной подписи, остальное отдаём графику.
    var padL=Math.round(12+nf(max).length*6.4), plotR=W-padR;
    // Столбики стоят в своих полосах, линии — от края до края.
    var step=bars?(plotR-padL)/n:(n>1?(plotR-padL)/(n-1):0);
    var X=bars?function(k){ return padL+step*(k+0.5); }:function(k){ return padL+step*k; };
    var Y=function(v){ return H-padB-((Number(v)||0)/max)*(H-padT-padB); };
    var col=function(s){ return cssVar(s.c); };
    var svg='<svg viewBox="0 0 '+W+' '+H+'" height="'+H+'" role="img" aria-label="'+esc(conf.title)+'">';
    // Сетка тише данных: на телефоне — через линию, ноль — чуть темнее.
    for(var g=0; g*ax.step<=max+0.001; g++){
      if(narrow && ax.max>4 && g%2) continue;
      var gy=Y(ax.step*g).toFixed(1);
      svg+='<line x1="'+padL+'" y1="'+gy+'" x2="'+plotR+'" y2="'+gy+'" stroke="'+(g===0?'var(--axis)':'var(--grid)')+'" stroke-width="1"/>';
      svg+='<text x="'+(padL-8)+'" y="'+(Number(gy)+3.5)+'" fill="var(--ink-3)" font-size="10.5" font-weight="600" text-anchor="end" font-family="Manrope" style="font-variant-numeric:tabular-nums">'+nf(Math.round(ax.step*g))+'</text>';
    }
    if(bars){
      var bw=Math.max(2,Math.min(16,step*0.62));
      for(i=0;i<n;i++){
        var bv=Number(rows[i][conf.series[0].key])||0; if(bv<=0) continue;
        var by=Y(bv), x0=X(i)-bw/2, r=Math.min(3,bw/2,(H-padB)-by);
        svg+='<path class="bm" data-i="'+i+'" d="M'+x0.toFixed(1)+' '+(H-padB)+'V'+(by+r).toFixed(1)+'Q'+x0.toFixed(1)+' '+by.toFixed(1)+' '+(x0+r).toFixed(1)+' '+by.toFixed(1)
          +'H'+(x0+bw-r).toFixed(1)+'Q'+(x0+bw).toFixed(1)+' '+by.toFixed(1)+' '+(x0+bw).toFixed(1)+' '+(by+r).toFixed(1)+'V'+(H-padB)+'Z" fill="'+col(conf.series[0])+'"/>';
      }
    } else {
      for(j=conf.series.length-1;j>=0;j--){
        var s=conf.series[j], d='', started=false, last=null;
        for(i=0;i<n;i++){
          var val=rows[i][s.key];
          if(val==null){ started=false; continue; }
          d+=(started?' L':'M')+X(i).toFixed(1)+' '+Y(val).toFixed(1); started=true; last=i;
        }
        if(!d) continue;
        if(conf.type==='area' && j===0){
          var firstI=0; while(firstI<n && rows[firstI][s.key]==null) firstI++;
          svg+='<path d="'+d+' L'+X(last).toFixed(1)+' '+(H-padB)+' L'+X(firstI).toFixed(1)+' '+(H-padB)+' Z" fill="'+col(s)+'" opacity=".1"/>';
        }
        svg+='<path d="'+d+'" fill="none" stroke="'+col(s)+'" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
        if(last!=null) svg+='<circle cx="'+X(last).toFixed(1)+'" cy="'+Y(rows[last][s.key]).toFixed(1)+'" r="4" fill="'+col(s)+'" stroke="var(--card)" stroke-width="2"/>';
      }
    }
    // Даты: края и середина; у края подпись прижата к нему, а не обрезана.
    var marks=n<3?[0,n-1]:[0,Math.floor((n-1)/2),n-1];
    for(i=0;i<marks.length;i++){
      var edge=i===0?'start':(i===marks.length-1?'end':'middle');
      var tx=bars?(edge==='start'?padL:(edge==='end'?plotR:X(marks[i]))):X(marks[i]);
      svg+='<text x="'+tx.toFixed(1)+'" y="'+(H-6)+'" fill="var(--ink-3)" font-size="10.5" font-weight="600" font-family="Manrope" text-anchor="'+edge+'">'+dshort(rows[marks[i]].date)+'</text>';
    }
    svg+='<line id="cross" x1="0" y1="'+padT+'" x2="0" y2="'+(H-padB)+'" stroke="var(--axis)" stroke-width="1" opacity="0"/><g id="hov"></g>';
    svg+='</svg>';
    host.innerHTML=svg;

    // Палец или курсор ведёт по дням: перекрестие, точки рядов и шапка с цифрами дня.
    var svgEl=host.querySelector('svg'), cross=svgEl.querySelector('#cross'), hov=svgEl.querySelector('#hov');
    function at(clientX){
      var r=svgEl.getBoundingClientRect(), rel=(clientX-r.left)/r.width*W;
      var idx=bars?Math.floor((rel-padL)/(step||1)):Math.round((rel-padL)/(step||1));
      if(idx<0) idx=0; if(idx>n-1) idx=n-1;
      var x=X(idx).toFixed(1), dots='';
      cross.setAttribute('x1',x); cross.setAttribute('x2',x); cross.setAttribute('opacity','1');
      if(bars){
        svgEl.classList.add('scrub');
        var was=svgEl.querySelector('.bm.on'); if(was) was.classList.remove('on');
        var bar=svgEl.querySelector('.bm[data-i="'+idx+'"]'); if(bar) bar.classList.add('on');
      } else for(var k=0;k<conf.series.length;k++){
        var hv=rows[idx][conf.series[k].key];
        if(hv!=null) dots+='<circle cx="'+x+'" cy="'+Y(hv).toFixed(1)+'" r="4" fill="'+col(conf.series[k])+'" stroke="var(--card)" stroke-width="2"/>';
      }
      hov.innerHTML=dots;
      readout(idx);
    }
    chartReset=function(){ cross.setAttribute('opacity','0'); hov.innerHTML=''; svgEl.classList.remove('scrub'); readout(null); };
    host.onpointermove=function(e){ at(e.clientX); };
    host.onpointerdown=function(e){ at(e.clientX); };
    // Мышь ушла — назад к последнему дню; палец поднят — день остаётся, пока не нажать мимо.
    host.onpointerleave=function(e){ if(e.pointerType==='mouse') chartReset(); };
    readout(null);
  }

  /** Спарклайн: ряд — нейтральный, последняя точка — акцент. Пустые дни — разрыв. */
  function drawSparks(){
    var els=document.querySelectorAll('[data-spark]');
    for(var e=0;e<els.length;e++){
      var el=els[e], vals=SPARK[el.getAttribute('data-spark')]||[];
      var W=Math.max(80,el.clientWidth||160), H=28, n=vals.length, max=1, min=Infinity, i;
      for(i=0;i<n;i++) if(vals[i]!=null){ if(vals[i]>max) max=vals[i]; if(vals[i]<min) min=vals[i]; }
      if(min===Infinity){ el.innerHTML=''; continue; }
      min=Math.min(min,0);
      var X=function(k){ return 4+(W-8)*(n>1?k/(n-1):0); };
      var Y=function(v){ return H-4-((v-min)/((max-min)||1))*(H-8); };
      var d='', on=false, last=-1;
      for(i=0;i<n;i++){ if(vals[i]==null){ on=false; continue; } d+=(on?' L':'M')+X(i).toFixed(1)+' '+Y(vals[i]).toFixed(1); on=true; last=i; }
      el.innerHTML='<svg viewBox="0 0 '+W+' '+H+'"><path d="'+d+'" fill="none" stroke="var(--context)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>'
        +(last>=0?'<circle cx="'+X(last).toFixed(1)+'" cy="'+Y(vals[last]).toFixed(1)+'" r="4" fill="var(--mark)" stroke="var(--card)" stroke-width="2"/>':'')+'</svg>';
      el.setAttribute('title','по дням');
    }
  }

  function bindHours(){
    var host=$('hours'); if(!host) return;
    function pick(target){
      var c=target && target.closest ? target.closest('.hcol') : null; if(!c) return;
      var h=Number(c.getAttribute('data-hour')), t=D.today;
      var v=h<t.hours.length?t.hours[h]:null;
      var prev=host.querySelector('.hot'); if(prev) prev.classList.remove('hot'); c.classList.add('hot');
      var r=c.getBoundingClientRect();
      showTip('<div class="d">'+two(h)+':00–'+two(h)+':59 МСК</div>'
        +'<div class="r"><i style="background:var(--mark)"></i><b>'+(v==null?'—':nf(v))+'</b>сегодня</div>'
        +'<div class="r"><i style="background:var(--context)"></i><b>'+nf(t.hoursY[h]||0)+'</b>вчера</div>', r.left+r.width/2, r.top);
    }
    host.onpointermove=function(e){ pick(e.target); };
    host.onpointerdown=function(e){ pick(e.target); };
    host.onpointerleave=function(){ hideTip(); var p=host.querySelector('.hot'); if(p) p.classList.remove('hot'); };
  }

  /* ================================================================== */
  /* Удержание                                                           */
  /* ================================================================== */
  /* Последовательная шкала одной гаммы — только для ненулевых значений: ноль —
     серая клетка, чтобы редкие возвраты не тонули в бледно-зелёном. Сжатие
     корнем — удержание обычно маленькое, и линейная шкала красила бы почти всё
     в один тон. Обе шкалы проверены валидатором (порядковые, к карточке). */
  var HEAT_LIGHT=['#78C59D','#58AF87','#3C9871','#2A7C5C','#1F6248','#164B37'];
  var HEAT_DARK=['#255840','#2C6E52','#388A66','#3FA077','#6CC39E','#B8E5CC'];
  function heatStep(p){ return Math.max(0,Math.min(5,Math.floor(Math.sqrt(p)*6))); }
  function heatColor(p){ var i=heatStep(p); return isDark()?HEAT_DARK[i]:HEAT_LIGHT[i]; }
  function heatInk(p){ var i=heatStep(p); if(isDark()) return i>=2?'#0E0F0E':'#EDEFEB'; return i>=3?'#FFFFFF':'#121412'; }

  /** Сегодня по МСК — номер суток, как на сервере. */
  function todayIdx(){ return Math.floor(((D?D.generatedAt:Date.now())+3*3600000)/DAY); }
  function dayIdx(dateStr){ var p=String(dateStr).split('-'); return Math.floor(Date.UTC(Number(p[0]),Number(p[1])-1,Number(p[2]))/DAY); }
  /** Ячейка ещё в будущем: этот день (или неделя) после прихода не прожит. */
  function cellFuture(row,c,daily){
    if(daily) return dayIdx(row.date)+D.retDays[c]>=todayIdx();
    return dayIdx(row.week)+7*D.retWeeks[c]>=todayIdx();
  }
  /** «В среднем» по столбцу: все измеренные ячейки вместе — вернулись из скольких. */
  function colAvg(rows,c){
    var b=0, n=0;
    for(var i=0;i<rows.length;i++){ var x=rows[i].cells[c]; if(x){ b+=x[0]; n+=x[1]; } }
    return b?[b,n]:null;
  }
  function heatTd(cell,tip){
    if(!cell[1]) return '<td class="zero" data-tipcell="'+tip+'">0%<small>0/'+cell[0]+'</small></td>';
    var p=cell[1]/cell[0];
    return '<td data-tipcell="'+tip+'" style="background:'+heatColor(p)+';color:'+heatInk(p)+'">'+Math.round(p*100)+'%<small>'+cell[1]+'/'+cell[0]+'</small></td>';
  }
  function retView(){
    var r=D.retention[S.retSrc]||D.retention.all, daily=S.retMode==='d';
    return { daily:daily, keys:daily?D.retDays:D.retWeeks, rows:daily?r.daily:r.weekly };
  }
  /** Где теряются новички: чем кончился их первый день (firstDayOutcome). */
  function firstDayBlock(){
    var fd=D.firstDay;
    if(!fd||!fd.size) return '';
    var loss=isDark()?['rgba(240,124,122,.9)','rgba(240,124,122,.55)','rgba(240,124,122,.3)']:['rgba(194,49,47,.85)','rgba(194,49,47,.5)','rgba(194,49,47,.25)'];
    var parts=[
      {lb:'Ничего не записали и ушли',n:fd.gone0,c:loss[0]},
      {lb:'1–2 записи и ушли',n:fd.gone12,c:loss[1]},
      {lb:'3+ записи и ушли',n:fd.gone3,c:loss[2]},
      {lb:'Вернулись после первого дня',n:fd.back,c:'var(--mark)'}
    ];
    var top=-1;
    for(var k=0;k<3;k++) if(parts[k].n>0 && (top<0||parts[k].n>parts[top].n)) top=k;
    return sec('Где теряются новички','')
      +'<div class="card"><div class="comp-head"><b>'+nf(fd.size)+'</b> чел. пришли 2–30 дней назад</div>'+stackBar(parts)+legendList(parts,fd.size,fd.size>=5?top:-1)
      +'<div class="foot-note">'+IC.bellOff+'<span>Из ушедших бот не смог написать <b>'+nf(fd.goneNoBot)+' из '+nf(fd.goneTotal)
      +'</b> — не нажимали Start или заблокировали; напоминание им не дошло бы.</span></div></div>';
  }
  /** Доли целого одной полосой; сегменты делит зазор цвета карточки. */
  function stackBar(parts){
    return '<div class="stack">'+parts.filter(function(p){ return p.n>0; }).map(function(p){
      return '<i style="flex:'+p.n+' 1 0;background:'+p.c+'"></i>';
    }).join('')+'</div>';
  }
  /** Легенда-таблица: подпись слева, число и доля — столбцами справа. */
  function legendList(parts,total,flag){
    return '<div class="lgl">'+parts.map(function(p,k){
      return '<div><i class="dt" style="background:'+p.c+'"></i><span class="lb">'+esc(p.lb)+'</span>'
        +(k===flag?'<span class="flag">главная потеря</span>':'')
        +'<b>'+nf(p.n)+'</b><small>'+pct(p.n,total)+'</small></div>';
    }).join('')+'</div>';
  }
  function viewRetention(){
    var v=retView(), daily=v.daily, keys=v.keys, rows=v.rows, i, k, c;
    // Столбец, где срок не наступил ни у одной строки, пуст по построению: у
    // когорт последних двух недель D14 и D30 не бывает. Его не рисуем.
    var vis=[], gone=[];
    for(c=0;c<keys.length;c++){
      var live=false; for(i=0;i<rows.length;i++) if(!cellFuture(rows[i],c,daily)){ live=true; break; }
      if(live) vis.push(c); else gone.push(daily?'D'+keys[c]:keys[c]+'-я нед');
    }
    var html='<table class="heat"><colgroup><col style="width:'+(daily?62:92)+'px"><col style="width:40px">'
      +vis.map(function(){ return '<col>'; }).join('')+'</colgroup>'
      +'<thead><tr><th class="c0">'+(daily?'Пришли':'Неделя')+'</th><th class="cn">чел.</th>'
      +vis.map(function(c){ return '<th>'+(daily?'D'+keys[c]:keys[c]+'-я нед')+'</th>'; }).join('')+'</tr></thead><tbody>';
    var avg=vis.map(function(c){ return colAvg(rows,c); }), any=false;
    for(k=0;k<avg.length;k++) if(avg[k]) any=true;
    if(any){
      html+='<tr class="avg"><td class="c0" colspan="2">В среднем</td>'
        +avg.map(function(x,k){ return x?heatTd(x,'a-'+vis[k]):'<td class="future"></td>'; }).join('')+'</tr>'
        +'<tr class="gap"><td colspan="'+(2+vis.length)+'"></td></tr>';
    }
    for(i=0;i<rows.length;i++){
      var row=rows[i];
      var label=daily?dshort(row.date):('с '+dshort(row.week));
      var sub=!daily && row.size?'<small>записали '+pct(row.act,row.size)+'</small>':'';
      html+='<tr'+(row.size?'':' class="nobody"')+'><td class="c0">'+label+sub+'</td><td class="cn">'+(row.size?nf(row.size):'—')+'</td>';
      for(k=0;k<vis.length;k++){
        c=vis[k]; var cell=row.cells[c];
        if(!row.size){ html+='<td class="future"></td>'; continue; }
        if(!cell){
          html+=cellFuture(row,c,daily) ? '<td class="future" data-tipcell="'+i+'-'+c+'"></td>' : '<td class="na" data-tipcell="'+i+'-'+c+'">—</td>';
          continue;
        }
        html+=heatTd(cell,i+'-'+c);
      }
      html+='</tr>';
    }
    html+='</tbody></table>';
    var ramp=isDark()?HEAT_DARK:HEAT_LIGHT;
    var key='<div class="hkey"><span>0%<span class="ramp"><i style="background:var(--well)"></i>'
      +ramp.map(function(x){ return '<i style="background:'+x+'"></i>'; }).join('')+'</span>100% пришедших</span>'
      +'<span>пусто — срок не наступил · прочерк — нет данных</span></div>';
    var since=D.trackFrom?('Посуточная активность записывается с '+dshort(D.trackFrom)+'. Раньше этого дня ячейки пустые — данных нет, а не «никто не вернулся».'):'Посуточная активность начала записываться только что — первые ячейки появятся завтра.';
    var hiddenNote=gone.length?(' '+gone.join(' и ')+' у когорт последних двух недель ещё не наступили — дальние сроки видно по неделям.'):'';
    var lc=D.lifecycle, total=D.kpi.total||1;
    var lcParts=[
      {lb:'Заходили за неделю',n:lc.active,c:'var(--mark)'},
      {lb:'Последний раз 7–30 дней назад',n:lc.sleeping,c:'var(--mark-2)'},
      {lb:'Больше месяца не заходили',n:lc.gone,c:'var(--context)'}
    ];
    return firstDayBlock()
      +sec('Возвращаются ли люди',segSelect('retsrc',S.retSrc))
      +'<div class="card">'+segButtons('ret',[['d','По дням'],['w','По неделям']],S.retMode,'full')+html+key+'<p class="note" style="margin:10px 0 0">'+esc(since+hiddenNote)+'</p></div>'
      +sec('Что с базой сейчас',nf(D.kpi.total)+' чел.')
      +'<div class="card">'+stackBar(lcParts)+legendList(lcParts,total,-1)
      +'<div class="facts"><span>ни одной операции <b>'+nf(lc.zero)+'</b></span><span>заблокировали бота <b>'+nf(D.kpi.blocked)+'</b></span><span>выключили напоминания <b>'+nf(D.kpi.remindersOff)+'</b></span></div>'
      +'</div>';
  }
  function bindHeat(){
    var cells=document.querySelectorAll('[data-tipcell]');
    var v=retView(), daily=v.daily, rows=v.rows;
    function show(el){
      var p=el.getAttribute('data-tipcell').split('-'), c=Number(p[1]), avg=p[0]==='a';
      var row=avg?null:rows[Number(p[0])], cell=avg?colAvg(rows,c):row.cells[c];
      var head=avg?'Все когорты в таблице':(daily?('Пришли '+dshort(row.date)+' · '+nf(row.size)+' чел.'):('Неделя с '+dshort(row.week)+' · '+nf(row.size)+' чел.'));
      var what=daily?('на '+D.retDays[c]+'-й день после прихода'):('на '+D.retWeeks[c]+'-й неделе после прихода');
      var body=cell?('<div class="r"><b>'+Math.round(cell[1]/cell[0]*100)+'%</b>вернулись '+what+'</div><div class="r">'+cell[1]+' из '+cell[0]+'</div>')
        :(cellFuture(row,c,daily)?'<div class="r">'+what+' — этот день ещё не прожит</div>':'<div class="r">'+what+' — данных нет: это было до начала записи</div>');
      var was=document.querySelector('.heat td.hot'); if(was) was.classList.remove('hot');
      el.classList.add('hot');
      var b=el.getBoundingClientRect();
      showTip('<div class="d">'+head+'</div>'+body, b.left+b.width/2, b.top);
    }
    for(var i=0;i<cells.length;i++){
      cells[i].onpointerenter=function(e){ if(e.pointerType==='mouse') show(this); };
      cells[i].onpointerdown=function(){ show(this); };
      cells[i].onpointerleave=function(e){ if(e.pointerType==='mouse') hideTip(); };
    }
  }

  /* ================================================================== */
  /* Источники                                                           */
  /* ================================================================== */
  function cleanTag(v){ return String(v||'').toLowerCase().replace(/[^a-z0-9_-]/g,'').slice(0,32); }
  function viewSources(){
    if(!S.tag) S.tag='ads_'+MON_EN[mskParts(Date.now()).m];
    var tag=S.tag;
    var botUrl='https://t.me/'+BOT+'?start='+tag, appUrl='https://t.me/'+BOT+'?startapp='+tag;
    var builder=sec('Ссылка для рекламы','')
      +'<div class="card"><label class="note" for="tagin">Метка: латиница, цифры, «_» и «-»</label>'
      +'<input class="field" id="tagin" data-act="tag" value="'+esc(tag)+'" autocomplete="off" autocapitalize="off" spellcheck="false" style="margin-top:6px" />'
      +'<div style="margin-top:6px">'
      +'<div class="linkrow"><div class="u"><b>Через бота — рекомендуем</b><span id="u-bot">'+esc(botUrl)+'</span></div><button class="btn" data-act="copy" data-v="bot">Копировать</button></div>'
      +'<div class="linkrow"><div class="u"><b>Сразу в приложение</b><span id="u-app">'+esc(appUrl)+'</span></div><button class="btn ghost" data-act="copy" data-v="app">Копировать</button></div>'
      +'</div><p class="note" style="margin:6px 0 0">Через бота человек нажимает «Старт» и попадает в чат: там работают запись трат сообщением и напоминания. '
      +'Сразу в приложение — на один шаг короче. Метка запоминается один раз — за первым касанием, поэтому старые пользователи в улов рекламы не попадут.</p></div>';

    // Источники — таблицей: доли стоят столбцами, и источники сравниваются взглядом сверху вниз.
    var list=D.sources||[];
    var rows=list.map(function(s){
      var d1=s.d1&&s.d1[0]>=3?pct(s.d1[1],s.d1[0]):'—';
      var since=s.first?(dmsk(s.first)+(s.last&&dmsk(s.last)!==dmsk(s.first)?' — '+dmsk(s.last):'')):'';
      var tagged=s.key.indexOf('src:')===0, meta=tagged?['метка']:[];
      if(s.fresh7&&s.fresh7!==s.n) meta.push('за неделю '+nf(s.fresh7));
      if(since) meta.push(esc(since));
      if(s.bot) meta.push('боту '+nf(s.bot));
      return '<button class="src-r" data-act="srcfunnel" data-v="'+esc(s.key)+'">'
        +'<span class="src-nm'+(tagged?' tagged':'')+'">'+esc(s.label)+'</span>'
        +'<span class="num">'+nf(s.n)+'</span><span class="num">'+pct(s.act,s.n)+'</span><span class="num">'+pct(s.back,s.n)+'</span>'
        +'<span class="num'+(d1==='—'?' dim':'')+'">'+d1+'</span>'
        +(meta.length?'<span class="src-mt">'+meta.join(' · ')+'</span>':'')+'</button>';
    }).join('');
    return builder
      +sec('Откуда люди','нажмите — воронка')
      +(rows?'<div class="group"><div class="src-h"><span>Источник</span><span>Пришли</span><span>Записали</span><span>Вернулись</span><span>D1</span></div>'+rows+'</div>':'<div class="card empty">Пока нет ни одного человека</div>')
      +'<p class="note cap">Записали — хоть одна операция в приложении или боту. Вернулись — заходили ещё в какой-то день после прихода. D1 — вернулись ровно на следующий день (по когортам последних двух недель).</p>';
  }
  function updateLinks(){
    var tag=cleanTag(S.tag);
    var b=$('u-bot'), a=$('u-app');
    if(b) b.textContent='https://t.me/'+BOT+'?start='+tag;
    if(a) a.textContent='https://t.me/'+BOT+'?startapp='+tag;
  }
  function copy(text){
    function fallback(){
      var ta=document.createElement('textarea'); ta.value=text; ta.setAttribute('readonly',''); ta.style.position='fixed'; ta.style.opacity='0';
      document.body.appendChild(ta); ta.select();
      try{ document.execCommand('copy'); toast('Скопировано'); }catch(e){ toast('Не получилось — выделите ссылку вручную'); }
      document.body.removeChild(ta);
    }
    if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function(){ toast('Скопировано'); },fallback);
    else fallback();
  }

  /* ================================================================== */
  /* Люди                                                                */
  /* ================================================================== */
  var PF=[['all','Все'],['new','Новые'],['ops','С операциями'],['zero','Без операций'],['bot','Бот'],['ad','По рекламе']];
  var PSORT=[['ls','По последнему визиту'],['fs','По дате прихода'],['ops','По операциям'],['w','По последней записи'],['xp','По опыту']];
  function opsOf(p){ return Math.max(p.o||0,p.b||0); }
  function statusDot(p){
    var d=(Date.now()-p.ls)/DAY;
    return d<=7?'var(--mark)':(d<=30?(isDark()?'#2D7A5A':'#9BD8B6'):'var(--context)');
  }
  function personRow(p){
    var initial=esc((p.n||'?').trim().charAt(0).toUpperCase()||'?');
    var tags=(p.s?'<span class="tag src">'+esc(p.s)+'</span>':'')+(p.r?'<span class="tag">по приглашению</span>':'')
      +(p.b?'<span class="tag">бот</span>':'')+(p.a?'':'<span class="tag">без приложения</span>')+(p.x?'<span class="tag blk">заблокировал</span>':'');
    var ops=opsOf(p);
    var l2=ops?('<b>'+nf(ops)+'</b> оп.'+(p.w?' · последняя '+ago(p.w):'')+(p.d?' · дней активности '+nf(p.d):'')):'операций нет';
    return '<button class="row" data-act="person" data-v="'+esc(p.i)+'"><div class="ava'+(ops?' on':'')+'">'+initial+'</div><div class="row-main">'
      +'<div class="who"><div class="l1"><span class="nm">'+esc(p.n)+'</span>'+(p.u?'<span class="un">@'+esc(p.u)+'</span>':'')+tags+'</div>'
      +'<div class="l2">'+l2+'</div>'
      +'<div class="l2"><span class="sdot" style="background:'+statusDot(p)+'"></span>был '+ago(p.ls)+' · пришёл '+(p.e?'≈':'')+dmsk(p.fs)+'</div></div>'
      +IC.chev+'</div></button>';
  }
  function filteredPeople(){
    var all=D.people||[], q=S.pq.trim().toLowerCase(), weekAgo=Date.now()-7*DAY;
    var list=all.filter(function(p){
      if(S.pf==='new' && p.fs<weekAgo) return false;
      if(S.pf==='ops' && !opsOf(p)) return false;
      if(S.pf==='zero' && opsOf(p)) return false;
      if(S.pf==='bot' && !p.b) return false;
      if(S.pf==='ad' && !p.s) return false;
      if(q){ var hay=(p.n+' '+(p.u||'')+' '+(p.s||'')+' '+p.i).toLowerCase(); if(hay.indexOf(q)<0) return false; }
      return true;
    });
    var key=S.ps;
    list.sort(function(a,b){
      var av=key==='ops'?opsOf(a):(a[key]||0), bv=key==='ops'?opsOf(b):(b[key]||0);
      return bv-av;
    });
    return list;
  }
  function plistInner(shown){ return shown.length ? shown.map(personRow).join('') : '<div class="empty">Никого не нашлось</div>'; }
  function moreBtn(shown,total){ return shown<total ? '<button class="more" data-act="more">Показать ещё '+nf(Math.min(30,total-shown))+'</button>' : ''; }
  function countText(n){ return nf(n)+(n!==D.peopleTotal?' из '+nf(D.peopleTotal):''); }
  function viewPeople(){
    var t=D.today, today='';
    if(t.newcomers.length){
      today='<div class="sec"><h2>Пришли сегодня</h2><span class="aside">'+nf(D.kpi.newToday)+' чел.</span></div><div class="group">'
        +t.newcomers.slice(0,8).map(function(x){
          var st=x.act?'записал(а) операцию':(x.app?'открыл(а) приложение':'нажал(а) «Старт»');
          return '<button class="row" data-act="person" data-v="'+esc(x.i)+'"><div class="ava'+(x.act?' on':'')+'">'+esc((x.n||'?').charAt(0).toUpperCase())+'</div><div class="row-main">'
            +'<div class="who"><div class="l1"><span class="nm">'+esc(x.n)+'</span>'+(x.s?'<span class="tag src">'+esc(x.s)+'</span>':'')+(x.r?'<span class="tag">по приглашению</span>':'')+(x.bot?'<span class="tag">бот</span>':'')+'</div>'
            +'<div class="l2">'+tmsk(x.at)+' · '+st+'</div></div>'+IC.chev+'</div></button>';
        }).join('')+'</div>';
    }
    var list=filteredPeople(), shown=list.slice(0,S.pcap);
    var sortOpts=PSORT.map(function(o){ return '<option value="'+o[0]+'"'+(S.ps===o[0]?' selected':'')+'>'+o[1]+'</option>'; }).join('');
    return today
      +'<div class="sec"><h2>Все люди</h2><span class="aside" id="pcount">'+countText(list.length)+'</span></div>'
      +'<div class="filters"><input class="search" id="pq" data-act="pq" placeholder="Имя, @ник, метка или id" value="'+esc(S.pq)+'" autocomplete="off" /><select class="select" data-act="psort">'+sortOpts+'</select></div>'
      +'<div class="filters"><div class="chipbar">'+PF.map(function(f){ return '<button data-act="pf" data-v="'+f[0]+'"'+(S.pf===f[0]?' class="on"':'')+'>'+f[1]+'</button>'; }).join('')+'</div></div>'
      +'<div class="group" id="plist">'+plistInner(shown)+'</div>'
      +'<div id="pmore">'+moreBtn(shown.length,list.length)+'</div>'
      +(D.peopleTotal>(D.people||[]).length?'<p class="note" style="margin:10px 4px 0">В списке '+nf(D.people.length)+' самых свежих из '+nf(D.peopleTotal)+'.</p>':'');
  }

  /* ---------- Карточка человека ---------- */
  function openPerson(id){
    hideTip();
    sheetOpen=true; $('sheet').hidden=false; document.body.style.overflow='hidden';
    $('sheet-card').innerHTML='<div class="grab"></div><div class="empty"><span class="spin" style="display:inline-block"></span></div>';
    if(TG && TG.BackButton){ try{ TG.BackButton.show(); }catch(e){} }
    api('/admin/person',{id:id}).then(function(p){
      if(!sheetOpen) return;
      if(!p||!p.ok){ $('sheet-card').innerHTML='<div class="grab"></div><div class="empty">Не нашёл этого человека</div>'; return; }
      $('sheet-card').innerHTML=personSheet(p);
    }).catch(function(){ if(sheetOpen) $('sheet-card').innerHTML='<div class="grab"></div><div class="empty">Нет связи с сервером</div>'; });
  }
  function closeSheet(){
    sheetOpen=false; $('sheet').hidden=true; document.body.style.overflow='';
    if(TG && TG.BackButton){ try{ TG.BackButton.hide(); }catch(e){} }
  }
  var LANG={ru:'русский',en:'английский'}, THEMES={auto:'как в системе',light:'светлая',dark:'тёмная'};
  function personSheet(p){
    var c=p.card||{}, g=p.game||{};
    var chips=(p.src?'<span class="tag src">пришёл по метке '+esc(p.src)+'</span>':'')+(p.fromRef?'<span class="tag">по приглашению</span>':'')
      +(!p.src&&!p.fromRef?'<span class="tag">пришёл сам</span>':'')+(p.botOps?'<span class="tag">пишет боту</span>':'')
      +(p.inApp?'':'<span class="tag">приложение не открывал</span>')+(p.blocked?'<span class="tag blk">заблокировал бота</span>':'')
      +(p.remindersOff?'<span class="tag">напоминания выключены</span>':'')+(p.approx?'<span class="tag">дата прихода оценочная</span>':'');
    // Полоса активности: 5 недель по 7 дней, последний — сегодня.
    var cells=[], i;
    for(i=0;i<p.strip.length;i++){
      var v=p.strip[i], cls=v===1?'y':(v===0?'':'u');
      if(v===null && p.firstSeen>p.stripFrom+(i+1)*DAY) cls='x';
      cells.push('<span class="'+cls+(i===p.strip.length-1?' t':'')+'"></span>');
    }
    // Недели целиком до прихода не рисуем: у новичка это четыре пустые строки.
    var firstReal=0; while(firstReal<p.strip.length && p.firstSeen>p.stripFrom+(firstReal+1)*DAY) firstReal++;
    // Дни с прихода, слева направо: так у новичка видно «три дня — был, не был,
    // был», а не одинокий хвост в конце пустой сетки.
    var cal=cells.slice(firstReal).join('');
    var weeks=Math.ceil((p.strip.length-firstReal)/7);
    var rows=[];
    function row(t,v,s){ rows.push('<div class="row"><div class="row-main"><div class="who"><div class="t">'+esc(t)+'</div>'+(s?'<div class="s">'+s+'</div>':'')+'</div><div class="v">'+v+'</div></div></div>'); }
    row('Пришёл',esc(dtmsk(p.firstSeen)));
    row('Был последний раз',esc(ago(p.lastSeen)),esc(dtmsk(p.lastSeen))+' МСК');
    row('Операций в приложении',nf(p.ops),c.dd?('дней с записями: '+nf(c.dd)):'');
    if(p.botOps||p.botLast) row('Записей через бота',nf(p.botOps),p.botLast?('последняя '+esc(ago(p.botLast))):'');
    if(p.lastWrite) row('Последняя запись',esc(dmsk(p.lastWrite)));
    row('Уровень и опыт',nf(g.level)+' · '+nf(g.xp)+' XP',g.streakBest?('рекорд серии '+nf(g.streakBest)+' дн.'):'');
    if(g.refs) row('Привёл друзей',nf(g.refs));
    var plan=[]; if(c.bud) plan.push('бюджет'); if(c.lim) plan.push('лимиты: '+c.lim); if(c.gl) plan.push('цели: '+c.gl); if(c.iv) plan.push('активы'); if(c.cat) plan.push('свои категории: '+c.cat);
    if(plan.length) row('Планирование','',esc(plan.join(', ')));
    var setup=[]; if(c.cur) setup.push(c.cur); if(c.lang) setup.push(LANG[c.lang]||c.lang); if(c.th) setup.push(THEMES[c.th]||c.th);
    if(setup.length) row('Настройки','',esc(setup.join(' · '))+(c.cc>1?(' · валют в операциях: '+nf(c.cc)):''));
    var secs=(p.sections||[]).map(function(s){ return '<span class="tag">'+esc(s.label)+' · '+nf(s.n)+'</span>'; }).join('');
    var tgLink=p.username?('<a href="https://t.me/'+esc(p.username)+'" data-act="tglink" data-v="'+esc(p.username)+'">@'+esc(p.username)+'</a> · '):'';
    return '<div class="grab"></div>'
      +'<div class="ph"><div class="ava'+(p.ops||p.botOps?' on':'')+'">'+esc((p.name||'?').charAt(0).toUpperCase())+'</div>'
      +'<div style="min-width:0;flex:1"><h3>'+esc(p.name)+'</h3><div class="note">'+tgLink+'id '+esc(p.id)+'</div></div>'
      +'<button class="icon" data-act="close" aria-label="Закрыть">'+IC.close+'</button></div>'
      +'<div class="chips">'+chips+'</div>'
      +(CLARITY_PROJECT?'<button class="btn ghost" data-act="clarity" data-v="'+esc(p.id)+'" style="margin-top:12px">Записи в Clarity</button>':'')
      +'<div class="sec" style="margin-top:18px"><h2>Активность</h2><span class="aside">'+(weeks>=5?'за 5 недель':'с прихода')+'</span></div>'
      +'<div class="cal">'+cal+'</div>'
      +'<div class="kv" style="margin-top:8px"><span><i class="dotkey" style="background:var(--mark)"></i>был</span><span><i class="dotkey" style="background:var(--well)"></i>не был</span><span><i class="dotkey" style="box-shadow:inset 0 0 0 1px var(--hair)"></i>неизвестно</span></div>'
      +'<div class="group" style="margin-top:16px">'+rows.join('')+'</div>'
      +(secs?'<div class="sec"><h2>Что открывал</h2></div><div class="chips" style="margin-top:0">'+secs+'</div>':'');
  }

  /* ================================================================== */
  /* Продукт                                                             */
  /* ================================================================== */
  function bars(items,opts){
    opts=opts||{};
    // Шкала — по большему из двух слоёв: подложка «открывали когда-либо» шире
    // активных, и без неё обрезалась бы на краю, искажая длину.
    var max=1,i; for(i=0;i<items.length;i++){ var m=opts.max!=null?opts.max:Math.max(items[i].n,items[i].under||0); if(m>max) max=m; }
    return items.map(function(it,idx){
      var w=it.n/max*100, c=opts.colors?opts.colors[idx]:(opts.color||'var(--mark)');
      var under=it.under!=null?'<div class="bf" style="width:'+(it.under/max*100).toFixed(1)+'%;background:var(--context)"></div>':'';
      return '<div class="bar"><div class="bl">'+esc(it.label)+'</div><div class="bt">'+under
        +'<div class="bf" style="width:'+(it.n?Math.max(1.5,w):0).toFixed(1)+'%;background:'+c+'"></div></div>'
        +'<div class="bn tnum">'+nf(it.n)+(it.sub?' <small>'+esc(it.sub)+'</small>':'')+'</div></div>';
    }).join('');
  }
  function viewProduct(){
    var b=D.bot, w=D.webhook, k=D.kpi, pr=D.product, total=k.total||1;
    var wh='';
    if(w){
      var tone=!w.registered||!w.ok?(w.pending>0&&w.registered?'warn':'bad'):'good';
      var icon=tone==='good'?IC.good:IC.bad;
      var txt=!w.registered?'Вебхук не зарегистрирован — бот не получает сообщений'
        :(w.ok?'Вебхук в порядке, очередь пуста':('В очереди '+nf(w.pending)+' сообщений'+(w.lastError?' · последняя ошибка: '+w.lastError:'')));
      wh='<div class="ins '+(tone==='warn'?'bad':tone)+'">'+icon+'<p>'+esc(txt)+'</p></div>';
    }
    var botBlock=sec('Бот','запись сообщением')
      +panel([
        cell('Пишут боту за неделю',nf(b.users7),'<span>всего писали '+nf(b.users)+'</span>'),
        cell('Записей через бота',nf(b.ops),'<span>за всё время</span>'),
        cell('Только бот',nf(b.onlyBot),'<span>пишут, но приложение не открывали</span>'),
        cell('Нажали «Старт» и ушли',nf(b.startOnly),'<span>ни записи, ни приложения</span>')
      ])+(wh?'<div class="card" style="margin-top:10px;padding:13px 16px">'+wh+'</div>':'');

    var secs=pr.sections.map(function(s){ return { label:s.label, n:s.active, under:s.users, sub:'из '+nf(s.users) }; });
    var sectionBlock=sec('Разделы','кто открывал')+'<div class="card">'
      +(secs.length?bars(secs)+'<div class="lgd"><span><i style="background:var(--context)"></i>открывали когда-либо</span><span><i style="background:var(--mark)"></i>из них заходили за 30 дней</span></div>':'<div class="empty">данные ещё собираются</div>')+'</div>';

    var pl=pr.planning, base=pl.cards||1;
    var planBlock='<div class="card"><div class="cardhead"><h3>Настроили планирование</h3><span class="note">из '+nf(pl.cards)+' с данными</span></div>'
      +bars([{label:'Бюджет месяца',n:pl.budget,sub:pct(pl.budget,base)},{label:'Лимиты категорий',n:pl.limits,sub:pct(pl.limits,base)},{label:'Цели',n:pl.goals,sub:pct(pl.goals,base)},{label:'Активы',n:pl.invest,sub:pct(pl.invest,base)},{label:'Свои категории',n:pl.cats,sub:pct(pl.cats,base)}],{max:base})
      +'</div>';
    // Корзины упорядочены — одна гамма по порядку (те же проверенные ступени, что у удержания).
    var ob=pr.opsBuckets, rampL=['var(--context)','#78C59D','#3C9871','#1F6248','#164B37'], rampD=['var(--context)','#2C6E52','#3FA077','#6CC39E','#B8E5CC'];
    var opsBlock='<div class="card"><div class="cardhead"><h3>Сколько у людей операций</h3></div>'
      +bars([{label:'Ни одной',n:ob[0]},{label:'1–4',n:ob[1]},{label:'5–19',n:ob[2]},{label:'20–99',n:ob[3]},{label:'100 и больше',n:ob[4]}],{colors:isDark()?rampD:rampL})
      +'</div>';
    var db=pr.daysBuckets;
    var daysBlock='<div class="card"><div class="cardhead"><h3>В скольких днях есть записи</h3><span class="note">глубина привычки</span></div>'
      +bars([{label:'1 день',n:db[0]},{label:'2–3 дня',n:db[1]},{label:'4–7 дней',n:db[2]},{label:'8–30 дней',n:db[3]},{label:'больше 30',n:db[4]}],{colors:isDark()?['#255840','#2C6E52','#3FA077','#6CC39E','#B8E5CC']:['#78C59D','#58AF87','#3C9871','#1F6248','#164B37']})
      +'</div>';
    var st=pr.settings;
    function dist(title,items,map){
      if(!items||!items.length) return '';
      // Хвост сворачиваем в «Другие»: восемь полос валют на телефоне — экран прокрутки.
      var head=items.slice(0,4), rest=items.slice(4).reduce(function(a,x){ return a+x.n; },0);
      var rowsD=head.map(function(x){ return { label:(map&&map[x.key])||x.key, n:x.n }; });
      if(rest) rowsD.push({ label:'Другие', n:rest });
      return '<div class="subhead">'+esc(title)+'</div>'+bars(rowsD);
    }
    var setBlock='<div class="card"><div class="cardhead"><h3>Как настроено</h3></div>'
      +dist('Валюта',st.currency)+dist('Язык',st.lang,{ru:'Русский',en:'English'})+dist('Тема',st.theme,{auto:'Как в системе',light:'Светлая',dark:'Тёмная'})+dist('Версия хранилища',st.version)+'</div>';
    var g=D.game;
    function top(list,val,unit){
      if(!list.length) return '<div class="empty">пока пусто</div>';
      return '<div class="group">'+list.map(function(e,i){
        return '<button class="row" data-act="person" data-v="'+esc(e.i)+'"><div class="ava">'+(i+1)+'</div><div class="row-main"><div class="who"><div class="nm">'+esc(e.n)+'</div>'
          +(e.u?'<div class="l2">@'+esc(e.u)+'</div>':'')+'</div><div class="v">'+nf(e[val])+'<small>'+unit+'</small></div></div></button>';
      }).join('')+'</div>';
    }
    // Особое задание «подпишись на канал»: воронка по людям (fan:<id>, см. channel.ts).
    var f=D.fan, fanBlock='';
    if(f){
      var seen=f.saw+f.click+f.joined+(f.self||0), tapped=f.click+f.joined;
      fanBlock=sec('Канал обновлений','особое задание')
        +'<div class="card">'+funnelHtml([seen,tapped,f.joined],['Видели задание','Нажали «Подписаться»','Подписались по кнопке'],'Задание пока никто не видел')
        +'<div class="facts"><span>по кнопке за неделю <b>'+nf(f.joined7)+'</b></span><span>подписались сами <b>'+nf(f.self||0)+'</b></span><span>уже были подписаны <b>'+nf(f.had)+'</b></span></div>'
        +'</div><p class="note cap">Видели — не будучи подписанными; кто уже был в канале, считается отдельно: задание у него сразу готово.</p>';
    }
    return fanBlock+botBlock+sectionBlock
      +sec('Глубина использования','')+'<div class="grid g2 start">'+planBlock+opsBlock+daysBlock+setBlock+'</div>'
      +sec('Игра','средний уровень '+esc(String(g.avgLevel)))
      +'<p class="note" style="margin:-4px 4px 10px">Опыта у всех <b>'+nf(g.sumXp)+'</b> · монет <b>'+nf(g.sumCoins)+'</b></p>'
      +'<div class="grid g2 start"><div><div class="subhead" style="margin:0 4px 8px">По опыту</div>'+top(D.topXp,'xp','XP')+'</div>'
      +'<div><div class="subhead" style="margin:0 4px 8px">По приглашениям</div>'+top(D.topRefs,'refs','друзей')+'</div></div>';
  }

  /* ---------- После отрисовки ---------- */
  function afterRender(){
    chartReset=null;
    if(S.tab==='overview'){ drawSparks(); drawChart(); bindHours(); }
    if(S.tab==='product') drawSparks();
    if(S.tab==='retention') bindHeat();
  }

  /* ---------- Действия ---------- */
  function haptic(){ try{ if(TG && TG.HapticFeedback) TG.HapticFeedback.selectionChanged(); }catch(e){} }
  document.addEventListener('click',function(e){
    var el=e.target.closest ? e.target.closest('[data-act]') : null;
    if(!el) {
      var inside=e.target.closest ? e.target.closest('.hours,.chart,.heat') : null;
      if(!inside) hideTip();
      if(chartReset && !(inside && inside.classList.contains('chart'))) chartReset();
      return;
    }
    var act=el.getAttribute('data-act'), v=el.getAttribute('data-v');
    if(el.tagName==='SELECT'||el.tagName==='INPUT') return;
    if(act==='tab'){ S.tab=v; haptic(); render(); window.scrollTo(0,0); }
    else if(act==='win'){ S.win=v; haptic(); render(); }
    else if(act==='chart'){ S.chart=v; haptic(); render(); }
    else if(act==='range'){ S.range=Number(v); haptic(); render(); }
    else if(act==='table'){ S.table=!S.table; render(); }
    else if(act==='ret'){ S.retMode=v; haptic(); render(); }
    else if(act==='pf'){ S.pf=v; S.pcap=30; haptic(); render(); }
    else if(act==='more'){ S.pcap+=30; render(); }
    else if(act==='person'){ openPerson(v); }
    else if(act==='close'){ closeSheet(); }
    else if(act==='srcfunnel'){ S.src=v; S.tab='overview'; haptic(); render(); var f=document.querySelector('.fn'); if(f) f.scrollIntoView({block:'center'}); }
    else if(act==='copy'){ var t=cleanTag(S.tag); if(!t){ toast('Сначала придумайте метку'); return; } copy('https://t.me/'+BOT+(v==='bot'?'?start=':'?startapp=')+t); }
    else if(act==='tglink'){ if(TG && TG.openTelegramLink){ e.preventDefault(); TG.openTelegramLink('https://t.me/'+v); } }
    else if(act==='clarity'){
      // Ссылки на запись человека Clarity не даёт — копируем его id для фильтра
      // «Custom user ID» и открываем записи проекта.
      var curl='https://clarity.microsoft.com/projects/view/'+CLARITY_PROJECT+'/impressions';
      copy(v);
      setTimeout(function(){ toast('id '+v+' скопирован — вставь в фильтр Custom user ID'); },300);
      if(TG && TG.openLink) TG.openLink(curl); else window.open(curl,'_blank');
    }
    else if(act==='digest'){
      el.disabled=true;
      api('/admin/digest',{}).then(function(r){ el.disabled=false; toast(r&&r.ok?'Сводка отправлена в Telegram':'Не удалось отправить'); })
        .catch(function(){ el.disabled=false; toast('Не удалось отправить'); });
    }
  });
  document.addEventListener('change',function(e){
    var el=e.target, act=el.getAttribute && el.getAttribute('data-act');
    if(act==='src'){ S.src=el.value; render(); }
    else if(act==='retsrc'){ S.retSrc=el.value; render(); }
    else if(act==='psort'){ S.ps=el.value; render(); }
  });
  document.addEventListener('input',function(e){
    var el=e.target, act=el.getAttribute && el.getAttribute('data-act');
    if(act==='pq'){
      S.pq=el.value; S.pcap=30;
      // Перерисовываем только список, чтобы поле поиска не теряло фокус.
      var list=filteredPeople(), shown=list.slice(0,S.pcap), host=$('plist');
      if(host){
        host.innerHTML=plistInner(shown);
        $('pmore').innerHTML=moreBtn(shown.length,list.length);
        $('pcount').textContent=countText(list.length);
      } else render();
    } else if(act==='tag'){
      var clean=cleanTag(el.value);
      if(clean!==el.value) el.value=clean;
      S.tag=clean; updateLinks();
    }
  });
  document.addEventListener('keydown',function(e){ if(e.key==='Escape' && sheetOpen) closeSheet(); });
  window.addEventListener('scroll',hideTip,{passive:true});

  /* ---------- Старт ---------- */
  function doLogin(){
    var v=$('login-pass').value.trim();
    if(!v){ $('login-err').textContent='Введите пароль'; return; }
    try{
      if($('login-remember').checked) localStorage.setItem(KEY,v); else sessionStorage.setItem(KEY,v);
    }catch(e){}
    $('login-err').textContent='';
    load({fresh:true});
  }

  /** initData из адресной строки: так его передаёт Telegram, открывая страницу кнопкой. */
  function readTgInit(){
    try{
      var h=location.hash ? location.hash.slice(1) : '';
      var v=new URLSearchParams(h).get('tgWebAppData');
      return v || '';
    }catch(e){ return ''; }
  }
  function loadTgSdk(){
    var s=document.createElement('script');
    s.src='https://telegram.org/js/telegram-web-app.js';
    s.onload=function(){
      TG=window.Telegram && window.Telegram.WebApp;
      if(!TG) return;
      try{ TG.ready(); TG.expand(); }catch(e){}
      var saved=null; try{ saved=localStorage.getItem(THEME); }catch(e){}
      applyTheme(saved || (TG.colorScheme==='light'?'light':'dark'),false);
      if(D) render();
      try{ TG.BackButton.onClick(closeSheet); }catch(e){}
    };
    document.head.appendChild(s);
  }

  tipEl=$('tip');
  initTheme();
  tgInit=readTgInit();
  if(tgInit) loadTgSdk();
  $('theme').onclick=function(){ applyTheme(isDark()?'light':'dark',true); if(D) render(); };
  $('refresh').onclick=function(){ load({fresh:true}); };
  $('logout').onclick=function(){ try{ localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); }catch(e){} D=null; showLogin(); };
  $('login-btn').onclick=doLogin;
  $('login-pass').addEventListener('keydown',function(e){ if(e.key==='Enter') doLogin(); });
  $('status').onclick=function(){
    var w=D&&D.webhook; if(!w) return;
    toast(!w.registered?'Вебхук не зарегистрирован':(w.ok?'Бот получает сообщения, очередь пуста':('В очереди '+w.pending+(w.lastError?': '+w.lastError:''))));
  };

  // Поворот телефона и смена ширины меняют геометрию графиков — перерисовываем.
  var rt=null, lastW=window.innerWidth;
  window.addEventListener('resize',function(){
    if(window.innerWidth===lastW) return; lastW=window.innerWidth;
    clearTimeout(rt); rt=setTimeout(function(){ if(D) render(); },180);
  });
  // Сами обновляемся раз в минуту, пока страница на экране и человек ничего не вводит.
  setInterval(function(){
    if(!D || document.visibilityState!=='visible' || sheetOpen) return;
    var a=document.activeElement; if(a && (a.tagName==='INPUT'||a.tagName==='SELECT')) return;
    load();
  },60000);
  document.addEventListener('visibilitychange',function(){
    if(document.visibilityState==='visible' && D && Date.now()-lastLoad>60000) load();
  });

  if(tgInit || savedKey()) load({fresh:true}); else showLogin();
})();
</script>
</body>
</html>`
