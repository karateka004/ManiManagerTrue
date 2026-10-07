/**
 * HTML админ-дашборда «Кошель · Аналитика» (2.0).
 *
 * Самодостаточная страница: графики — ручной SVG/HTML, внешних библиотек нет.
 * Вход двумя путями: открыта кнопкой из бота — по подписи Telegram владельца
 * (initData берём из адресной строки, куда его кладёт Telegram); открыта в
 * браузере — по паролю (секрет ADMIN_KEY).
 *
 * Оформление — язык приложения 2.0: нейтральные поверхности, обводка в 1 px
 * вместо теней, подписи строчными, один акцент. Цвета графиков проверены
 * валидатором палитр (dataviz): категориальные ряды — зелёный/синий/розовый,
 * ступени воронки — одна гамма по порядку, удержание — последовательная шкала.
 * Значения в подписях и подсказках — цветом текста, а не цветом ряда.
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
  /* ---------- Токены: те же поверхности и чернила, что в приложении 2.0 ---------- */
  :root{
    --page:#F6F6F3; --card:#FFFFFF; --sunken:#EFEFEB;
    --ink:#141614; --ink-2:#5A5E59; --ink-3:#6E726C;
    --hair:rgba(20,22,20,.08); --grid:#E7E7E2; --axis:#CDCDC6;
    /* Метки одного ряда и акцент текста. Зелёный 600 — 4:1 к белому. */
    --mark:#2D8866; --mark-wash:rgba(45,136,102,.10); --brand-text:#246E54; --context:#C4C5BF;
    /* Категориальные ряды (проверены валидатором, светлая тема, к белому). */
    --s1:#2D8866; --s2:#2a78d6; --s3:#e87ba4;
    /* Статусы: только со значком и словом, не цветом в одиночку. */
    --good:#1F7A3D; --bad:#C2312F; --warn:#9A6400;
    --good-dot:#0ca30c; --warn-dot:#fab219; --bad-dot:#d03b3b;
    --seg-on:#FFFFFF;
    color-scheme:light;
  }
  html[data-theme="dark"]{
    --page:#0E0F0E; --card:#1B1C1A; --sunken:#272826;
    --ink:#ECEEEA; --ink-2:#A8ACA6; --ink-3:#8A8E88;
    --hair:rgba(255,255,255,.08); --grid:#2A2B29; --axis:#3B3C39;
    --mark:#3CA37B; --mark-wash:rgba(60,163,123,.14); --brand-text:#8FD3AC; --context:#4A4C48;
    --s1:#3CA37B; --s2:#3987e5; --s3:#d55181;
    --good:#4CC27A; --bad:#F07C7A; --warn:#F2B544;
    --seg-on:#40423E;
    color-scheme:dark;
  }

  *{box-sizing:border-box}
  html,body{margin:0;background:var(--page);color:var(--ink);overflow-x:hidden}
  /* Страница не имеет права ехать вбок: на iPhone это выглядело обрезанными
     краями — подсказка графика вылезала за правый край и расширяла документ. */
  @supports (overflow:clip){html,body{overflow-x:clip}}
  body{
    font:15px/1.45 Manrope,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
    -webkit-font-smoothing:antialiased;-webkit-tap-highlight-color:transparent;
    min-height:100vh;
  }
  button{font:inherit;color:inherit;cursor:pointer}
  a{color:var(--brand-text);text-decoration:none}
  /* Цифры, стоящие столбцом, — моноширинные; крупные одиночные — пропорциональные. */
  .tnum{font-variant-numeric:tabular-nums}
  .muted{color:var(--ink-3)}
  .wrap{max-width:1080px;margin:0 auto;padding:4px 16px 96px}
  [hidden]{display:none !important}

  /* ---------- Шапка и вкладки ---------- */
  .top{
    position:sticky;top:0;z-index:30;background:var(--page);
    padding-top:env(safe-area-inset-top,0px);
  }
  @supports (backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px)){
    .top{background:color-mix(in srgb,var(--page) 84%,transparent);backdrop-filter:saturate(1.3) blur(16px);-webkit-backdrop-filter:saturate(1.3) blur(16px)}
  }
  .top-in{max-width:1080px;margin:0 auto;padding:12px 16px 10px;display:flex;align-items:center;gap:8px}
  .brand{display:flex;align-items:center;gap:8px;font-weight:800;font-size:17px;letter-spacing:-.015em;white-space:nowrap;min-width:0}
  .brand .dot{width:9px;height:9px;border-radius:99px;background:var(--mark);flex:none}
  .brand .sub{font-weight:600;color:var(--ink-3)}
  .spacer{flex:1;min-width:0}
  .status{
    display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 11px;border-radius:99px;border:0;
    background:var(--sunken);font-size:12.5px;font-weight:600;color:var(--ink-2);white-space:nowrap;
  }
  .status i{width:8px;height:8px;border-radius:99px;flex:none}
  .icon{width:36px;height:36px;border-radius:99px;border:0;background:var(--sunken);display:grid;place-items:center;color:var(--ink-2);flex:none}
  .icon svg,.ic{width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:none}
  .tabs{max-width:1080px;margin:0 auto;padding:0 16px 10px}
  /* Пять вкладок делят ряд по длине слов, а не поровну: поровну «Удержание»
     и «Источники» не влезали и резались многоточием. */
  #tabs button{flex:1 1 auto;padding:8px 4px}

  .seg{display:flex;padding:3px;border-radius:99px;background:var(--sunken);gap:2px;min-width:0}
  .seg button{
    flex:1 1 0;min-width:0;border:0;background:none;padding:8px 6px;border-radius:99px;
    font-size:13px;font-weight:600;color:var(--ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
    transition:background .15s,color .15s;
  }
  .seg button.on{background:var(--seg-on);color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.08),0 0 0 1px var(--hair)}
  .seg.sm button{padding:6px 10px;font-size:12.5px}
  .seg.fit{display:inline-flex}
  .seg.fit button{flex:0 0 auto}
  /* Фильтры списка — чипы с переносом: спрятанный за прокруткой фильтр всё
     равно что отсутствует, а шесть сегментов в ряд на телефон не влезают. */
  .chipbar{display:flex;flex-wrap:wrap;gap:6px}
  .chipbar button{border:0;background:var(--sunken);border-radius:99px;padding:7px 12px;font-weight:600;font-size:13px;color:var(--ink-2)}
  .chipbar button.on{background:var(--ink);color:var(--page)}

  /* ---------- Карточки и группы ---------- */
  .card{background:var(--card);border-radius:22px;box-shadow:0 0 0 1px var(--hair);padding:16px;min-width:0}
  .grid{display:grid;gap:12px}
  .grid > *{min-width:0}
  .g2{grid-template-columns:repeat(2,minmax(0,1fr))}
  .g4{grid-template-columns:repeat(4,minmax(0,1fr))}
  .start{align-items:start}
  @media(max-width:880px){.g4{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media(max-width:720px){.g2{grid-template-columns:minmax(0,1fr)}}
  .sec{margin:28px 4px 10px;display:flex;align-items:baseline;justify-content:space-between;gap:12px}
  .sec h2{margin:0;font-size:16px;font-weight:700;letter-spacing:-.012em;white-space:nowrap}
  .sec .aside{font-size:13px;color:var(--ink-3);font-weight:500;text-align:right}
  .cardhead{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:12px}
  .cardhead h3{margin:0;font-size:15px;font-weight:700;letter-spacing:-.01em}
  .filters{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 12px}
  .select{
    height:36px;max-width:100%;padding:0 30px 0 12px;border-radius:99px;border:0;background:var(--sunken);color:var(--ink);
    font:600 13px Manrope,sans-serif;appearance:none;-webkit-appearance:none;
    background-image:linear-gradient(45deg,transparent 50%,var(--ink-3) 50%),linear-gradient(135deg,var(--ink-3) 50%,transparent 50%);
    background-position:calc(100% - 16px) 15px,calc(100% - 11px) 15px;background-size:5px 5px;background-repeat:no-repeat;
  }
  .note{font-size:12.5px;line-height:1.5;color:var(--ink-3)}
  .empty{color:var(--ink-3);font-size:13.5px;text-align:center;padding:28px 8px}

  /* Сгруппированный список: строки в одной карточке, линия начинается от текста. */
  .group{background:var(--card);border-radius:22px;box-shadow:0 0 0 1px var(--hair);overflow:hidden}
  .row{display:flex;align-items:center;gap:12px;width:100%;padding:0 0 0 16px;border:0;background:none;text-align:left;min-width:0}
  .row-main{display:flex;align-items:center;gap:12px;flex:1;min-width:0;min-height:52px;padding:11px 16px 11px 0}
  .group > .row + .row .row-main,.group > .row + * .row-main{border-top:1px solid var(--hair)}
  button.row:active{background:var(--sunken)}
  .row .t{font-weight:600;font-size:14.5px;min-width:0}
  .row .s{font-size:12.5px;color:var(--ink-3);margin-top:2px;overflow-wrap:anywhere}
  .row .v{margin-left:auto;text-align:right;font-weight:700;font-size:14.5px;white-space:nowrap;flex:none}
  .row .v small{display:block;font-weight:500;font-size:12px;color:var(--ink-3)}
  .chev{color:var(--ink-3);width:16px;height:16px}

  /* ---------- Плашки ---------- */
  .chip{display:inline-flex;align-items:center;gap:4px;padding:2px 8px 2px 6px;border-radius:99px;font-size:12px;font-weight:600;white-space:nowrap;box-shadow:inset 0 0 0 1px var(--hair)}
  .chip svg{width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
  .chip.good{color:var(--good)} .chip.bad{color:var(--bad)} .chip.flat{color:var(--ink-3)}
  .tag{display:inline-flex;align-items:center;padding:1px 7px;border-radius:99px;font-size:11.5px;font-weight:600;background:var(--sunken);color:var(--ink-2);white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
  .tag.src{color:var(--brand-text)}
  .tag.blk{color:var(--bad)}

  /* ---------- Герой «Сегодня» ----------
     Глубокая поверхность, как у главных карточек приложения: тёмная зелень к
     почти чёрному, светится только пятно акцента. Числа на ней белые, столбики
     сегодняшнего дня — мятные, вчерашние — призрачные: это контекст. */
  .hero{
    position:relative;overflow:hidden;border-radius:26px;padding:18px 18px 14px;color:#fff;
    background-image:
      url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .6 0'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='.2'/></svg>"),
      radial-gradient(70% 90% at 100% 0%,rgba(93,185,150,.38),transparent 62%),
      radial-gradient(60% 70% at 0% 100%,rgba(60,163,123,.12),transparent 70%),
      linear-gradient(160deg,#143F30 0%,#0B0E0C 80%);
    background-blend-mode:overlay,normal,normal,normal;
    box-shadow:inset 0 1px 0 rgba(255,255,255,.10),inset 0 0 0 1px rgba(255,255,255,.05);
  }
  .hero .k{font-size:13px;font-weight:500;color:rgba(255,255,255,.72);display:flex;align-items:center;gap:8px}
  .live{width:7px;height:7px;border-radius:99px;background:#8FD3AC;box-shadow:0 0 0 0 rgba(143,211,172,.6);animation:pulse 2s infinite}
  @keyframes pulse{0%{box-shadow:0 0 0 0 rgba(143,211,172,.55)}70%{box-shadow:0 0 0 7px rgba(143,211,172,0)}100%{box-shadow:0 0 0 0 rgba(143,211,172,0)}}
  @media (prefers-reduced-motion:reduce){.live{animation:none}}
  .hero-top{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-top:6px;flex-wrap:wrap}
  .hero-num{font-size:56px;font-weight:800;letter-spacing:-.035em;line-height:.95}
  .hero-num small{font-size:16px;font-weight:600;letter-spacing:0;color:rgba(255,255,255,.72);margin-left:8px}
  .hero-side{text-align:right;font-size:13px;color:rgba(255,255,255,.72);line-height:1.5}
  .hero-side b{color:#fff;font-weight:700}
  .hours{position:relative;display:flex;align-items:flex-end;gap:2px;height:96px;margin-top:16px}
  .hcol{position:relative;flex:1 1 0;min-width:0;height:100%;display:flex;align-items:flex-end;justify-content:center}
  .hcol .y{position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:min(100%,12px);border-radius:4px 4px 0 0;background:rgba(255,255,255,.16)}
  .hcol .b{position:relative;width:min(100%,12px);border-radius:4px 4px 0 0;background:#8FD3AC}
  .hcol.now .b{background:#B8E5CC}
  .hcol:hover .b,.hcol.hot .b{background:#DCF2E5}
  .haxis{display:flex;justify-content:space-between;margin-top:6px;font-size:11px;color:rgba(255,255,255,.55)}
  .hlegend{display:flex;gap:14px;margin-top:10px;font-size:12px;color:rgba(255,255,255,.72)}
  .hlegend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px}
  .hero-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,.10)}
  .hero-stats div{font-size:12px;color:rgba(255,255,255,.65);line-height:1.35;min-width:0}
  .hero-stats b{display:block;font-size:18px;color:#fff;font-weight:700;letter-spacing:-.01em}

  /* ---------- Плитки показателей ---------- */
  .stat .lb{font-size:13px;font-weight:500;color:var(--ink-3)}
  .stat .val{font-size:32px;font-weight:800;letter-spacing:-.03em;line-height:1.05;margin-top:6px}
  .stat .val small{font-size:14px;font-weight:600;color:var(--ink-3);letter-spacing:0;margin-left:4px}
  .stat .meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:6px;font-size:12.5px;color:var(--ink-2)}
  .spark{height:34px;margin-top:10px}
  .spark svg{display:block;width:100%;height:34px;overflow:visible}

  /* ---------- Выводы ---------- */
  .ins{display:flex;gap:12px;align-items:flex-start;padding:12px 0;border-top:1px solid var(--hair)}
  .ins:first-child{border-top:0;padding-top:2px}
  .ins:last-child{padding-bottom:2px}
  .ins .ic{margin-top:1px;width:18px;height:18px}
  .ins.good .ic{color:var(--good)} .ins.bad .ic{color:var(--bad)} .ins.info .ic{color:var(--ink-3)}
  .ins p{margin:0;font-size:14px;line-height:1.5}

  /* ---------- Воронка ---------- */
  .step{padding:11px 0;border-top:1px solid var(--hair)}
  .step:first-child{border-top:0;padding-top:0}
  .step .top{display:flex;align-items:baseline;gap:10px}
  .step .lb{font-size:14px;font-weight:600;min-width:0}
  .step .nm{margin-left:auto;font-size:16px;font-weight:800;letter-spacing:-.02em}
  .step .pc{font-size:12.5px;color:var(--ink-3);font-weight:600;min-width:42px;text-align:right}
  .track{height:10px;border-radius:99px;background:var(--sunken);overflow:hidden;margin-top:7px}
  .fill{height:100%;border-radius:0 4px 4px 0}
  .lost{display:flex;align-items:center;gap:6px;margin-top:6px;font-size:12.5px;color:var(--ink-3)}
  .lost .chip{font-size:11.5px}

  /* ---------- График ---------- */
  .chartwrap{position:relative}
  .chart svg{display:block;width:100%;overflow:visible}
  .legend{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:10px;font-size:12.5px;color:var(--ink-2)}
  .legend i{display:inline-block;width:14px;height:2px;border-radius:2px;margin-right:6px;vertical-align:4px}
  .legend i.box{width:10px;height:10px;border-radius:3px;vertical-align:-1px}
  .tablev{margin-top:12px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{text-align:left;color:var(--ink-3);font-weight:600;font-size:12px;padding:6px 8px;white-space:nowrap}
  td{padding:8px;border-top:1px solid var(--hair);vertical-align:middle}
  td.r,th.r{text-align:right}
  .linkbtn{border:0;background:none;color:var(--brand-text);font-weight:600;font-size:13px;padding:4px 0}

  /* ---------- Удержание ---------- */
  .heat{width:100%;border-collapse:separate;border-spacing:3px;table-layout:fixed}
  .heat th{font-size:12px;padding:2px 2px 6px;text-align:center}
  .heat th.c0{text-align:left;width:34%}
  .heat td{padding:0;border:0;height:42px;text-align:center;border-radius:9px;font-size:13px;font-weight:700}
  .heat td.c0{text-align:left;padding:0 4px;font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .heat td.c0 small{display:block;font-weight:500;font-size:11.5px;color:var(--ink-3)}
  .heat td.cell small{display:block;font-size:10.5px;font-weight:600;opacity:.75;margin-top:-1px}
  .heat td.na{background:var(--sunken);color:var(--ink-3);font-weight:500}
  .heat td.future{background:none;box-shadow:inset 0 0 0 1px var(--hair)}
  .scale{display:flex;align-items:center;gap:8px;margin-top:12px;font-size:12px;color:var(--ink-3)}
  .scale .bar{flex:1;max-width:220px;height:8px;border-radius:99px}
  .stack{display:flex;gap:2px;height:14px;margin-top:4px}
  .stack div{height:100%;min-width:3px}
  .stack div:first-child{border-radius:7px 0 0 7px} .stack div:last-child{border-radius:0 7px 7px 0}
  .kv{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:12px;font-size:13px;color:var(--ink-2)}
  .kv b{color:var(--ink)}
  .dotkey{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:6px;vertical-align:-1px}

  /* ---------- Полосы (распределения) ---------- */
  .bar{display:grid;grid-template-columns:minmax(0,170px) minmax(0,1fr) auto;align-items:center;gap:12px;padding:7px 0;font-size:13.5px}
  .bar .bl{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600}
  .bar .bt{height:8px;border-radius:99px;background:var(--sunken);position:relative;overflow:hidden}
  .bar .bf{position:absolute;left:0;top:0;height:100%;border-radius:0 4px 4px 0}
  .bar .bn{font-weight:700;min-width:54px;text-align:right;font-size:13px}
  .bar .bn small{font-weight:500;color:var(--ink-3)}
  @media(max-width:560px){
    .bar{grid-template-columns:minmax(0,1fr) auto;row-gap:5px}
    .bar .bl{grid-column:1/-1;white-space:normal}
  }

  /* ---------- Люди ---------- */
  .search{
    flex:1 1 220px;min-width:0;height:38px;padding:0 14px;border-radius:99px;border:0;background:var(--sunken);
    color:var(--ink);font:500 14px Manrope,sans-serif;outline:none;
  }
  .search:focus{box-shadow:0 0 0 2px var(--mark-wash),0 0 0 1px var(--mark)}
  .ava{width:36px;height:36px;border-radius:99px;flex:none;display:grid;place-items:center;font-weight:800;font-size:14px;color:var(--ink-2);background:var(--sunken)}
  .ava.on{color:#fff;background:var(--mark)}
  .who{min-width:0;flex:1}
  .who .l1{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}
  .who .nm{font-weight:700;font-size:14.5px;overflow-wrap:anywhere}
  .who .un{font-size:12.5px;color:var(--ink-3)}
  .who .l2{font-size:12.5px;color:var(--ink-2);margin-top:2px}
  .who .l2 b{color:var(--ink);font-weight:700}
  .sdot{display:inline-block;width:7px;height:7px;border-radius:99px;margin-right:6px;vertical-align:1px}
  .more{display:block;margin:12px auto 0;height:38px;padding:0 18px;border-radius:99px;border:0;background:var(--sunken);font-weight:600;font-size:13px;color:var(--ink-2)}

  /* ---------- Ссылки для рекламы ---------- */
  .field{width:100%;height:42px;padding:0 14px;border-radius:14px;border:0;background:var(--sunken);color:var(--ink);font:600 15px Manrope,sans-serif;outline:none}
  .field:focus{box-shadow:0 0 0 2px var(--mark-wash),0 0 0 1px var(--mark)}
  .linkrow{display:flex;align-items:center;gap:10px;padding:12px 0;border-top:1px solid var(--hair)}
  .linkrow:first-of-type{border-top:0}
  .linkrow .u{flex:1;min-width:0;font-size:13px;color:var(--ink-2);overflow-wrap:anywhere}
  .linkrow .u b{display:block;color:var(--ink);font-size:14px;margin-bottom:2px}
  .btn{height:36px;padding:0 14px;border-radius:99px;border:0;background:var(--mark);color:#fff;font-weight:700;font-size:13px;white-space:nowrap;flex:none}
  .btn.ghost{background:var(--sunken);color:var(--ink)}

  /* ---------- Подсказка, тост, шторка ---------- */
  .tip{
    position:fixed;z-index:60;pointer-events:none;opacity:0;transition:opacity .12s;max-width:240px;
    background:var(--card);border-radius:14px;padding:9px 11px;font-size:12.5px;line-height:1.4;
    box-shadow:0 0 0 1px var(--hair),0 12px 28px rgba(0,0,0,.18);
  }
  .tip.on{opacity:1}
  .tip .d{color:var(--ink-3);font-size:12px;margin-bottom:4px}
  .tip .r{display:flex;align-items:center;gap:7px;color:var(--ink-2)}
  .tip .r b{color:var(--ink);font-weight:800;min-width:22px}
  .tip .r i{display:inline-block;width:12px;height:2px;border-radius:2px}
  .toast{
    position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom,0px));z-index:70;transform:translate(-50%,20px);
    opacity:0;transition:opacity .2s,transform .2s;pointer-events:none;
    background:var(--ink);color:var(--page);border-radius:99px;padding:10px 16px;font-size:13.5px;font-weight:600;max-width:calc(100% - 32px);
  }
  .toast.on{opacity:1;transform:translate(-50%,0)}
  .sheet{position:fixed;inset:0;z-index:50}
  .sheet-bg{position:absolute;inset:0;background:rgba(0,0,0,.45)}
  .sheet-card{
    position:absolute;left:0;right:0;bottom:0;max-height:88vh;overflow:auto;background:var(--card);
    border-radius:26px 26px 0 0;padding:8px 16px calc(24px + env(safe-area-inset-bottom,0px));
    max-width:640px;margin:0 auto;box-shadow:0 0 0 1px var(--hair);
    animation:up .25s cubic-bezier(.16,1,.3,1);
  }
  @keyframes up{from{transform:translateY(30px)}to{transform:translateY(0)}}
  .grab{width:40px;height:5px;border-radius:99px;background:var(--sunken);margin:4px auto 12px}
  .ph{display:flex;align-items:center;gap:12px}
  .ph .ava{width:52px;height:52px;font-size:20px}
  .ph h3{margin:0;font-size:19px;letter-spacing:-.015em;overflow-wrap:anywhere}
  .chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
  .cal{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;margin-top:8px}
  .cal span{aspect-ratio:1;border-radius:6px;background:var(--sunken)}
  .cal span.y{background:var(--mark)}
  .cal span.u{background:none;box-shadow:inset 0 0 0 1px var(--hair)}
  .cal span.x{background:none}
  .cal span.t{box-shadow:0 0 0 2px var(--ink-3)}

  /* ---------- Вход ---------- */
  #login{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
  .loginbox{background:var(--card);border-radius:26px;padding:28px 22px;width:min(380px,100%);box-shadow:0 0 0 1px var(--hair)}
  .loginbox h1{font-size:20px;margin:12px 0 6px;letter-spacing:-.02em}
  .loginbox p{color:var(--ink-2);font-size:14px;margin:0 0 18px}
  .loginbox .field{text-align:left}
  .loginbox .btn{width:100%;height:46px;margin-top:12px;font-size:15px;border-radius:14px}
  .check{display:flex;align-items:center;gap:8px;margin-top:12px;font-size:13.5px;color:var(--ink-2)}
  .check input{width:18px;height:18px;accent-color:var(--mark)}
  .err{color:var(--bad);font-size:13px;min-height:18px;margin-top:10px;font-weight:600}
  .banner{display:flex;align-items:center;gap:10px;margin-top:12px;padding:12px 14px;border-radius:16px;background:var(--sunken);font-size:13px;color:var(--ink-2)}
  .spin{width:14px;height:14px;border-radius:99px;border:2px solid var(--hair);border-top-color:var(--mark);animation:sp .7s linear infinite;flex:none}
  @keyframes sp{to{transform:rotate(360deg)}}
  .loading #view{opacity:.55;transition:opacity .2s}
  .foot{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:30px;padding-top:16px;border-top:1px solid var(--hair);font-size:12.5px;color:var(--ink-3)}

  @media(max-width:520px){
    .brand .sub{display:none}
    .hero-num{font-size:52px}
    .stat .val{font-size:28px}
    .card{padding:14px}
  }
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
    <header class="top">
      <div class="top-in">
        <div class="brand"><span class="dot"></span>Кошель <span class="sub">аналитика</span></div>
        <div class="spacer"></div>
        <button class="status" id="status" hidden><i></i><span></span></button>
        <button class="icon" id="refresh" aria-label="Обновить"><svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg></button>
        <button class="icon" id="theme" aria-label="Тема"><svg viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg></button>
        <button class="icon" id="logout" aria-label="Выйти"><svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg></button>
      </div>
      <nav class="tabs"><div class="seg" id="tabs"></div></nav>
    </header>
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
    close:'<svg class="ic" viewBox="0 0 24 24"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>'
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
      var bg=t==='dark'?'#0E0F0E':'#F6F6F3';
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
  function hideTip(){ tipEl.className='tip'; }

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
      return '<button data-act="tab" data-v="'+t[0]+'"'+(S.tab===t[0]?' class="on"':'')+'>'+t[1]+'</button>';
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
    var t=D.today, k=D.kpi, hours=t.hours, hy=t.hoursY, max=1, i;
    for(i=0;i<24;i++){ if((hours[i]||0)>max) max=hours[i]; if((hy[i]||0)>max) max=hy[i]; }
    var cols='';
    for(i=0;i<24;i++){
      var v=i<hours.length?hours[i]:null, yv=hy[i]||0;
      var h=v==null?0:Math.round(v/max*100), hyp=Math.round(yv/max*100);
      cols+='<div class="hcol'+(i===t.hourNow?' now':'')+'" data-hour="'+i+'">'
        +(yv?'<div class="y" style="height:'+Math.max(2,hyp)+'%"></div>':'')
        +(v?'<div class="b" style="height:'+Math.max(3,h)+'%"></div>':'')+'</div>';
    }
    var act=t.act||0, viaBot=t.bot||0;
    var side='за последний час <b>'+nf(k.lastHour)+'</b><br>обычно <b>'+nf(k.usual)+'</b> в день';
    return '<section class="hero" style="margin-top:6px">'
      +'<div class="k"><span class="live"></span>Сегодня до '+tmsk(D.generatedAt)+' МСК</div>'
      +'<div class="hero-top"><div class="hero-num">'+nf(k.newToday)+'<small>новых</small></div><div class="hero-side">'+side+'</div></div>'
      +'<div class="hours" id="hours">'+cols+'</div>'
      +'<div class="haxis"><span>0</span><span>6</span><span>12</span><span>18</span><span>23 ч</span></div>'
      +'<div class="hlegend"><span><i style="background:#8FD3AC"></i>Сегодня</span><span><i style="background:rgba(255,255,255,.22)"></i>Вчера</span></div>'
      +'<div class="hero-stats">'
      +'<div><b>'+nf(act)+'</b>записали операцию'+(k.newToday?' · '+pct(act,k.newToday):'')+'</div>'
      +'<div><b>'+nf(viaBot)+'</b>пишут боту</div>'
      +'<div><b>'+nf(k.dau)+'</b>заходили · '+nf(k.dauBack)+' вернулись</div>'
      +'</div></section>';
  }

  function tile(label,value,unit,meta,sparkKey,sparkVals){
    return '<div class="card stat"><div class="lb">'+esc(label)+'</div>'
      +'<div class="val">'+value+(unit?'<small>'+esc(unit)+'</small>':'')+'</div>'
      +'<div class="meta">'+meta+'</div>'
      +(sparkVals?'<div class="spark" data-spark="'+sparkKey+'"></div>':'')+'</div>';
  }
  function kpis(){
    var k=D.kpi, sp=D.spark, n=sp.days.length;
    var wPrev=sp.writers[n-8], aPrev=sp.active[n-2];
    var d1=k.d1||{base:0,n:0};
    var d1v=d1.base>=5 ? pcn(d1.n,d1.base)+'%' : '—';
    var d1meta=d1.base>=5 ? (nf(d1.n)+' из '+nf(d1.base)+' за две недели') : 'копится: нужно хотя бы 5 новичков с прожитым вторым днём';
    return '<div class="sec"><h2>Главное</h2><span class="aside">'+nf(k.total)+' человек всего</span></div>'
      +'<div class="grid g4">'
      +tile('Новые за неделю',nf(k.new7),'',delta(k.new7,k.newPrev7,true,'неделей раньше'),'fresh',sp.fresh)
      +tile('Пишут за неделю',nf(k.writers7),'',(wPrev!=null?delta(k.writers7,wPrev,true,'неделей раньше'):'')+'<span>из них боту '+nf(D.bot.writers7)+'</span>','writers',sp.writers)
      +tile('Заходили сегодня',nf(k.dau),'',(aPrev!=null?delta(k.dau,aPrev,true,'вчера'):'')+'<span>новых '+nf(k.dauNew)+'</span>','active',sp.active)
      +tile('Вернулись на 2-й день',d1v,'','<span>'+esc(d1meta)+'</span>',null,null)
      +'</div>';
  }

  function insightsBlock(){
    var list=D.insights||[];
    if(!list.length) return '';
    return '<div class="sec"><h2>Что важно</h2></div><div class="card">'
      +list.map(function(x){
        var icon=x.tone==='good'?IC.good:(x.tone==='bad'?IC.bad:IC.info);
        var word=x.tone==='good'?'Хорошо: ':(x.tone==='bad'?'Внимание: ':'');
        return '<div class="ins '+x.tone+'">'+icon+'<p><span class="muted">'+word+'</span>'+esc(x.text)+'</p></div>';
      }).join('')+'</div>';
  }

  var WIN_SEGS=[['all','Все'],['30','30 дн'],['7','7 дн'],['1','Сегодня']];
  var FUNNEL_LABELS=['Пришли','Записали операцию','Вернулись в другой день','Набрали 5 операций','Пишут сейчас'];
  /* Ступени воронки — одна гамма по порядку (проверена как порядковая шкала). */
  var FUNNEL_LIGHT=['#1D5743','#246E54','#2D8866','#3CA37B','#5DB996'];
  var FUNNEL_DARK=['#B8E5CC','#8FD3AC','#5DB996','#3CA37B','#2D8866'];
  function segSelect(act,value){
    var opts=(D.segments||[]).map(function(s){
      return '<option value="'+esc(s.key)+'"'+(s.key===value?' selected':'')+'>'+esc(s.key==='all'?'Все источники':s.label)+'</option>';
    }).join('');
    return '<select class="select" data-act="'+act+'">'+opts+'</select>';
  }
  function segButtons(act,items,value,cls){
    return '<div class="seg sm '+(cls||'fit')+'">'+items.map(function(it){
      return '<button data-act="'+act+'" data-v="'+it[0]+'"'+(String(value)===String(it[0])?' class="on"':'')+'>'+it[1]+'</button>';
    }).join('')+'</div>';
  }
  function funnelBlock(){
    var bySrc=D.funnels[S.src]||D.funnels.all, f=bySrc[S.win]||bySrc.all, steps=f.steps, base=steps[0]||0;
    var ramp=isDark()?FUNNEL_DARK:FUNNEL_LIGHT;
    // Самая большая потеря между ступенями — её и подсвечиваем.
    var worst=-1, worstLoss=0, i;
    for(i=1;i<steps.length;i++){ var l=steps[i-1]-steps[i]; if(steps[i-1]>0 && l/steps[i-1]>worstLoss && l>0){ worstLoss=l/steps[i-1]; worst=i; } }
    var html='';
    for(i=0;i<steps.length;i++){
      var share=base?steps[i]/base*100:0;
      var lost='';
      if(i>0 && steps[i-1]>0){
        var dropped=steps[i-1]-steps[i];
        lost='<div class="lost">'+(dropped>0?'не дошли '+nf(dropped)+' · ':'')+'дошли '+pct(steps[i],steps[i-1])+' от прошлой ступени'
          +(i===worst && base>=5?' <span class="chip bad">'+IC.down+'главная потеря</span>':'')+'</div>';
      }
      html+='<div class="step"><div class="top"><span class="lb">'+FUNNEL_LABELS[i]+'</span>'
        +'<span class="nm">'+nf(steps[i])+'</span><span class="pc tnum">'+(base?Math.round(share)+'%':'—')+'</span></div>'
        +'<div class="track"><div class="fill" style="width:'+(steps[i]?Math.max(1.5,share).toFixed(1):0)+'%;background:'+ramp[i]+'"></div></div>'+lost+'</div>';
    }
    if(!base) html='<div class="empty">В этом срезе пока никого нет</div>';
    return '<div class="sec"><h2>Путь до привычки</h2></div>'
      +'<div class="filters">'+segButtons('win',WIN_SEGS,S.win)+segSelect('src',S.src)+'</div>'
      +'<div class="card">'+html
      +(base?'<div class="kv"><span>открыли приложение <b>'+nf(f.app)+'</b></span><span>писали боту <b>'+nf(f.bot)+'</b></span></div>':'')
      +'</div><p class="note" style="margin:8px 4px 0">Каждая ступень — часть предыдущей. Окно — когда человек пришёл.</p>';
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
  function growthBlock(){
    var conf=METRICS[S.chart], rows=histRows();
    var body;
    if(rows.length<2) body='<div class="empty">История копится со дня первых ночных снимков — нужно хотя бы двое суток.</div>';
    else body='<div class="chartwrap"><div class="chart" id="chart"></div></div><div class="legend" id="legend"></div>'
      +(S.table?'<div class="tablev">'+historyTable(conf,rows)+'</div>':'');
    return '<div class="sec"><h2>Динамика</h2><span class="aside">на конец суток</span></div>'
      +'<div class="filters">'+segButtons('chart',CHART_SEGS,S.chart)+segButtons('range',RANGE_SEGS,S.range)+'</div>'
      +'<div class="card">'+body
      +(rows.length>=2?'<div style="margin-top:8px"><button class="linkbtn" data-act="table">'+(S.table?'Скрыть таблицу':'Показать таблицей')+'</button></div>':'')
      +'</div>';
  }
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
    var conf=METRICS[S.chart], rows=histRows(), n=rows.length;
    var W=Math.max(260,host.clientWidth||600), narrow=W<520;
    var H=narrow?200:220, padL=30, padR=narrow?8:12, padT=12, padB=26;
    var labelSpace=conf.type==='bars'?0:(narrow?0:96);
    var plotR=W-padR-labelSpace;
    var max=1,i,j;
    for(i=0;i<n;i++) for(j=0;j<conf.series.length;j++){ var v=Number(rows[i][conf.series[j].key]); if(v>max) max=v; }
    var ax=axisFor(max); max=ax.max;
    var step=n>1?(plotR-padL)/(n-1):0;
    var X=function(k){ return padL+step*k; };
    var Y=function(v){ return H-padB-((Number(v)||0)/max)*(H-padT-padB); };
    var col=function(s){ return cssVar(s.c); };
    var svg='<svg viewBox="0 0 '+W+' '+H+'" height="'+H+'" role="img" aria-label="'+esc(conf.title)+'">';
    for(var g=0; g*ax.step<=max+0.001; g++){
      var gy=Y(ax.step*g).toFixed(1);
      svg+='<line x1="'+padL+'" y1="'+gy+'" x2="'+plotR+'" y2="'+gy+'" stroke="var(--grid)" stroke-width="1"/>';
      if(!narrow || g%2===0 || ax.max<=4) svg+='<text x="'+(padL-6)+'" y="'+(Number(gy)+4)+'" fill="var(--ink-3)" font-size="11" text-anchor="end" font-family="Manrope" style="font-variant-numeric:tabular-nums">'+nf(Math.round(ax.step*g))+'</text>';
    }
    if(conf.type==='bars'){
      var bw=Math.max(2,Math.min(14,step*0.62));
      for(i=0;i<n;i++){
        var bv=Number(rows[i][conf.series[0].key])||0; if(bv<=0) continue;
        var by=Y(bv), bh=(H-padB)-by, r=Math.min(4,bw/2);
        var x0=X(i)-bw/2;
        svg+='<path d="M'+x0.toFixed(1)+' '+(H-padB)+'V'+(by+r).toFixed(1)+'Q'+x0.toFixed(1)+' '+by.toFixed(1)+' '+(x0+r).toFixed(1)+' '+by.toFixed(1)
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
          svg+='<path d="'+d+' L'+X(last).toFixed(1)+' '+(H-padB)+' L'+X(firstI).toFixed(1)+' '+(H-padB)+' Z" fill="'+col(s)+'" opacity=".10"/>';
        }
        svg+='<path d="'+d+'" fill="none" stroke="'+col(s)+'" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
        if(last!=null){
          svg+='<circle cx="'+X(last).toFixed(1)+'" cy="'+Y(rows[last][s.key]).toFixed(1)+'" r="4" fill="'+col(s)+'" stroke="var(--card)" stroke-width="2"/>';
        }
      }
      // Подписи у конца линий — только на широком экране, где им есть место.
      if(!narrow){
        var ends=[];
        for(j=0;j<conf.series.length;j++){
          var lj=n-1; while(lj>=0 && rows[lj][conf.series[j].key]==null) lj--;
          if(lj>=0) ends.push({ y:Y(rows[lj][conf.series[j].key]), v:rows[lj][conf.series[j].key], s:conf.series[j] });
        }
        ends.sort(function(a,b){ return a.y-b.y; });
        for(j=1;j<ends.length;j++) if(ends[j].y-ends[j-1].y<15) ends[j].y=ends[j-1].y+15;
        for(j=0;j<ends.length;j++){
          svg+='<text x="'+(plotR+8)+'" y="'+(ends[j].y+4).toFixed(1)+'" font-size="12" font-family="Manrope" fill="var(--ink-2)"><tspan font-weight="700" fill="var(--ink)">'+nf(ends[j].v)+'</tspan> '+esc(ends[j].s.label.split(' ')[0])+'</text>';
        }
      }
    }
    var marks=narrow?[0,n-1]:[0,Math.floor((n-1)/2),n-1];
    for(i=0;i<marks.length;i++){
      var anchor=i===0?'start':(i===marks.length-1?'end':'middle');
      svg+='<text x="'+X(marks[i]).toFixed(1)+'" y="'+(H-6)+'" fill="var(--ink-3)" font-size="11" font-family="Manrope" text-anchor="'+anchor+'">'+dshort(rows[marks[i]].date)+'</text>';
    }
    svg+='<line id="cross" x1="0" y1="'+padT+'" x2="0" y2="'+(H-padB)+'" stroke="var(--axis)" stroke-width="1" opacity="0"/>';
    svg+='</svg>';
    host.innerHTML=svg;
    var lg=$('legend');
    if(lg) lg.innerHTML=conf.series.length<2 ? '' : conf.series.map(function(s2){
      return '<span><i'+(conf.type==='bars'?' class="box"':'')+' style="background:'+col(s2)+'"></i>'+esc(s2.label)+'</span>';
    }).join('');

    // Подсказка по всему ряду в точке: перекрестие находит дату само.
    var svgEl=host.querySelector('svg'), cross=host.querySelector('#cross');
    function at(clientX){
      var r=svgEl.getBoundingClientRect(), rel=(clientX-r.left)/r.width*W;
      var idx=Math.round((rel-padL)/(step||1)); if(idx<0) idx=0; if(idx>n-1) idx=n-1;
      var row=rows[idx];
      cross.setAttribute('x1',X(idx)); cross.setAttribute('x2',X(idx)); cross.setAttribute('opacity','1');
      var html='<div class="d">'+dshort(row.date)+'</div>'+conf.series.map(function(s3){
        return '<div class="r"><i style="background:'+col(s3)+'"></i><b>'+(row[s3.key]==null?'—':nf(row[s3.key]))+'</b>'+esc(s3.label)+'</div>';
      }).join('');
      showTip(html, r.left+X(idx)/W*r.width, r.top+12);
    }
    host.onpointermove=function(e){ at(e.clientX); };
    host.onpointerdown=function(e){ at(e.clientX); };
    host.onpointerleave=function(){ hideTip(); cross.setAttribute('opacity','0'); };
  }

  /** Спарклайн: ряд — нейтральный, последняя точка — акцент. Пустые дни — разрыв. */
  function drawSparks(){
    var els=document.querySelectorAll('[data-spark]');
    for(var e=0;e<els.length;e++){
      var el=els[e], vals=D.spark[el.getAttribute('data-spark')]||[];
      var W=Math.max(80,el.clientWidth||160), H=34, n=vals.length, max=1, min=Infinity, i;
      for(i=0;i<n;i++) if(vals[i]!=null){ if(vals[i]>max) max=vals[i]; if(vals[i]<min) min=vals[i]; }
      if(min===Infinity){ el.innerHTML=''; continue; }
      min=Math.min(min,0);
      var X=function(k){ return 4+(W-8)*(n>1?k/(n-1):0); };
      var Y=function(v){ return H-4-((v-min)/((max-min)||1))*(H-8); };
      var d='', on=false, last=-1;
      for(i=0;i<n;i++){ if(vals[i]==null){ on=false; continue; } d+=(on?' L':'M')+X(i).toFixed(1)+' '+Y(vals[i]).toFixed(1); on=true; last=i; }
      el.innerHTML='<svg viewBox="0 0 '+W+' '+H+'"><path d="'+d+'" fill="none" stroke="var(--context)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>'
        +(last>=0?'<circle cx="'+X(last).toFixed(1)+'" cy="'+Y(vals[last]).toFixed(1)+'" r="4" fill="var(--mark)" stroke="var(--card)" stroke-width="2"/>':'')+'</svg>';
      el.setAttribute('title','последние '+n+' дней');
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
  /* Последовательная шкала одной гаммы; сжатие корнем — удержание обычно
     маленькое, и линейная шкала красила бы почти всё в один бледный тон. */
  var HEAT_LIGHT=['#E5F4EB','#C6E8D4','#9BD8B6','#62BC97','#2D8866','#246E54','#1D5743'];
  var HEAT_DARK=['#1E2C25','#21402F','#25573F','#2D7A5A','#3CA37B','#6CC39E','#B8E5CC'];
  function heatStep(p){ return Math.max(0,Math.min(6,Math.floor(Math.sqrt(p)*7))); }
  function heatColor(p){ var i=heatStep(p); return isDark()?HEAT_DARK[i]:HEAT_LIGHT[i]; }
  function heatInk(p){ var i=heatStep(p); if(isDark()) return i>=4?'#0E0F0E':'#ECEEEA'; return i>=4?'#FFFFFF':'#141614'; }

  /** Сегодня по МСК — номер суток, как на сервере. */
  function todayIdx(){ return Math.floor(((D?D.generatedAt:Date.now())+3*3600000)/DAY); }
  function dayIdx(dateStr){ var p=String(dateStr).split('-'); return Math.floor(Date.UTC(Number(p[0]),Number(p[1])-1,Number(p[2]))/DAY); }
  /** Ячейка ещё в будущем: этот день (или неделя) после прихода не прожит. */
  function cellFuture(row,c,daily){
    if(daily) return dayIdx(row.date)+D.retDays[c]>=todayIdx();
    return dayIdx(row.week)+7*D.retWeeks[c]>=todayIdx();
  }
  function viewRetention(){
    var r=D.retention[S.retSrc]||D.retention.all, daily=S.retMode==='d';
    var cols=daily?D.retDays.map(function(k){ return 'D'+k; }):D.retWeeks.map(function(k){ return k+'-я нед'; });
    var rows=daily?r.daily:r.weekly;
    var html='<table class="heat"><thead><tr><th class="c0">'+(daily?'Пришли':'Неделя')+'</th>'
      +cols.map(function(c){ return '<th>'+c+'</th>'; }).join('')+'</tr></thead><tbody>';
    var any=false;
    for(var i=0;i<rows.length;i++){
      var row=rows[i];
      var label=daily?dshort(row.date):('с '+dshort(row.week));
      var sub=row.size?nf(row.size)+' чел.':'никого';
      if(!daily && row.size) sub+=' · записали '+pct(row.act,row.size);
      html+='<tr><td class="c0">'+label+'<small>'+sub+'</small></td>';
      for(var c=0;c<row.cells.length;c++){
        var cell=row.cells[c];
        if(!row.size){ html+='<td class="future"></td>'; continue; }
        if(!cell){
          html+=cellFuture(row,c,daily) ? '<td class="future" data-tipcell="'+i+'-'+c+'"></td>' : '<td class="na" data-tipcell="'+i+'-'+c+'">—</td>';
          continue;
        }
        any=true;
        var p=cell[1]/cell[0];
        html+='<td class="cell" data-tipcell="'+i+'-'+c+'" style="background:'+heatColor(p)+';color:'+heatInk(p)+'">'+Math.round(p*100)+'%<small>'+cell[1]+'/'+cell[0]+'</small></td>';
      }
      html+='</tr>';
    }
    html+='</tbody></table>';
    var keyRow='<div class="kv" style="margin-top:10px"><span><i class="dotkey" style="box-shadow:inset 0 0 0 1px var(--hair)"></i>ещё не наступило</span><span><i class="dotkey" style="background:var(--sunken)"></i>нет данных</span></div>';
    var scale='<div class="scale"><span>0%</span><span class="bar" style="background:linear-gradient(90deg,'+(isDark()?HEAT_DARK:HEAT_LIGHT).join(',')+')"></span><span>100%</span></div>';
    var since=D.trackFrom?('Посуточная активность записывается с '+dshort(D.trackFrom)+'. Раньше этого дня ячейки пустые — данных нет, а не «никто не вернулся».'):'Посуточная активность начала записываться только что — первые ячейки появятся завтра.';
    var lc=D.lifecycle, total=D.kpi.total||1;
    var stack='<div class="stack">'
      +'<div style="width:'+(lc.active/total*100)+'%;background:'+(isDark()?'#5DB996':'#2D8866')+'"></div>'
      +'<div style="width:'+(lc.sleeping/total*100)+'%;background:'+(isDark()?'#2D7A5A':'#9BD8B6')+'"></div>'
      +'<div style="width:'+(lc.gone/total*100)+'%;background:var(--context)"></div></div>';
    return '<div class="sec"><h2>Возвращаются ли люди</h2><span class="aside">доля пришедших</span></div>'
      +'<div class="filters">'+segButtons('ret',[['d','По дням'],['w','По неделям']],S.retMode)+segSelect('retsrc',S.retSrc)+'</div>'
      +'<div class="card">'+html+(any?scale:'')+keyRow+'<p class="note" style="margin:10px 0 0">'+esc(since)+'</p></div>'
      +'<div class="sec"><h2>Что с базой сейчас</h2></div>'
      +'<div class="card">'+stack
      +'<div class="kv">'
      +'<span><i class="dotkey" style="background:'+(isDark()?'#5DB996':'#2D8866')+'"></i>заходили за неделю <b>'+nf(lc.active)+'</b></span>'
      +'<span><i class="dotkey" style="background:'+(isDark()?'#2D7A5A':'#9BD8B6')+'"></i>7–30 дней назад <b>'+nf(lc.sleeping)+'</b></span>'
      +'<span><i class="dotkey" style="background:var(--context)"></i>больше месяца <b>'+nf(lc.gone)+'</b></span></div>'
      +'<div class="kv"><span>ни одной операции <b>'+nf(lc.zero)+'</b></span><span>заблокировали бота <b>'+nf(D.kpi.blocked)+'</b></span><span>выключили напоминания <b>'+nf(D.kpi.remindersOff)+'</b></span></div>'
      +'</div>';
  }
  function bindHeat(){
    var cells=document.querySelectorAll('[data-tipcell]');
    var r=D.retention[S.retSrc]||D.retention.all, daily=S.retMode==='d', rows=daily?r.daily:r.weekly;
    function show(el){
      var p=el.getAttribute('data-tipcell').split('-'), row=rows[Number(p[0])], c=Number(p[1]), cell=row.cells[c];
      var head=daily?('Пришли '+dshort(row.date)+' · '+nf(row.size)+' чел.'):('Неделя с '+dshort(row.week)+' · '+nf(row.size)+' чел.');
      var what=daily?('на '+D.retDays[c]+'-й день после прихода'):('на '+D.retWeeks[c]+'-й неделе после прихода');
      var body=cell?('<div class="r"><b>'+Math.round(cell[1]/cell[0]*100)+'%</b>вернулись '+what+'</div><div class="r">'+cell[1]+' из '+cell[0]+'</div>')
        :(cellFuture(row,c,daily)?'<div class="r">'+what+' — этот день ещё не прожит</div>':'<div class="r">'+what+' — данных нет: это было до начала записи</div>');
      var b=el.getBoundingClientRect();
      showTip('<div class="d">'+head+'</div>'+body, b.left+b.width/2, b.top);
    }
    for(var i=0;i<cells.length;i++){
      cells[i].onpointerenter=function(){ show(this); };
      cells[i].onpointerdown=function(){ show(this); };
      cells[i].onpointerleave=hideTip;
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
    var builder='<div class="sec"><h2>Ссылка для рекламы</h2></div>'
      +'<div class="card"><label class="note" for="tagin">Метка: латиница, цифры, «_» и «-»</label>'
      +'<input class="field" id="tagin" data-act="tag" value="'+esc(tag)+'" autocomplete="off" autocapitalize="off" spellcheck="false" style="margin-top:6px" />'
      +'<div style="margin-top:6px">'
      +'<div class="linkrow"><div class="u"><b>Через бота — рекомендуем</b><span id="u-bot">'+esc(botUrl)+'</span></div><button class="btn" data-act="copy" data-v="bot">Копировать</button></div>'
      +'<div class="linkrow"><div class="u"><b>Сразу в приложение</b><span id="u-app">'+esc(appUrl)+'</span></div><button class="btn ghost" data-act="copy" data-v="app">Копировать</button></div>'
      +'</div><p class="note" style="margin:6px 0 0">Через бота человек нажимает «Старт» и попадает в чат: там работают запись трат сообщением и напоминания. '
      +'Сразу в приложение — на один шаг короче. Метка запоминается один раз — за первым касанием, поэтому старые пользователи в улов рекламы не попадут.</p></div>';

    var list=D.sources||[];
    var rows=list.map(function(s){
      var d1=s.d1&&s.d1[0]>=3?pct(s.d1[1],s.d1[0]):'—';
      var since=s.first?(dmsk(s.first)+(s.last&&dmsk(s.last)!==dmsk(s.first)?' — '+dmsk(s.last):'')):'';
      return '<button class="row" data-act="srcfunnel" data-v="'+esc(s.key)+'"><div class="row-main">'
        +'<div class="who"><div class="l1"><span class="nm">'+esc(s.label)+'</span>'+(s.key.indexOf('src:')===0?'<span class="tag src">метка</span>':'')+'</div>'
        +'<div class="l2">пришло <b>'+nf(s.n)+'</b>'+(s.fresh7&&s.fresh7!==s.n?' · за неделю '+nf(s.fresh7):'')+(since?' · '+esc(since):'')+'</div>'
        +'<div class="l2">записали <b>'+pct(s.act,s.n)+'</b> · вернулись <b>'+pct(s.back,s.n)+'</b> · D1 <b>'+d1+'</b>'+(s.bot?' · боту '+nf(s.bot):'')+'</div></div>'
        +IC.chev+'</div></button>';
    }).join('');
    return builder
      +'<div class="sec"><h2>Откуда люди</h2><span class="aside">нажмите — воронка</span></div>'
      +(rows?'<div class="group">'+rows+'</div>':'<div class="card empty">Пока нет ни одного человека</div>')
      +'<p class="note" style="margin:10px 4px 0">Записали — хоть одна операция в приложении или боту. Вернулись — заходили ещё в какой-то день после прихода. D1 — вернулись ровно на следующий день (по когортам последних двух недель).</p>';
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
      +'<div class="sec" style="margin-top:18px"><h2>Активность</h2><span class="aside">'+(weeks>=5?'за 5 недель':'с прихода')+'</span></div>'
      +'<div class="cal">'+cal+'</div>'
      +'<div class="kv" style="margin-top:8px"><span><i class="dotkey" style="background:var(--mark)"></i>был</span><span><i class="dotkey" style="background:var(--sunken)"></i>не был</span><span><i class="dotkey" style="box-shadow:inset 0 0 0 1px var(--hair)"></i>неизвестно</span></div>'
      +'<div class="group" style="margin-top:16px">'+rows.join('')+'</div>'
      +(secs?'<div class="sec"><h2>Что открывал</h2></div><div class="chips" style="margin-top:0">'+secs+'</div>':'');
  }

  /* ================================================================== */
  /* Продукт                                                             */
  /* ================================================================== */
  function bars(items,opts){
    opts=opts||{};
    var max=1,i; for(i=0;i<items.length;i++){ var m=opts.max!=null?opts.max:items[i].n; if(m>max) max=m; }
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
      wh='<div class="ins '+(tone==='warn'?'bad':tone)+'" style="padding-top:12px;border-top:1px solid var(--hair);margin-top:12px">'+icon+'<p>'+esc(txt)+'</p></div>';
    }
    var botBlock='<div class="sec"><h2>Бот</h2><span class="aside">запись сообщением</span></div>'
      +'<div class="grid g4">'
      +tile('Пишут боту за неделю',nf(b.users7),'','<span>всего писали '+nf(b.users)+'</span>')
      +tile('Записей через бота',nf(b.ops),'','<span>за всё время</span>')
      +tile('Только бот',nf(b.onlyBot),'','<span>пишут, но приложение не открывали</span>')
      +tile('Нажали «Старт» и ушли',nf(b.startOnly),'','<span>ни записи, ни приложения</span>')
      +'</div>'+(wh?'<div class="card" style="margin-top:12px;padding-top:4px">'+wh+'</div>':'');

    var secs=pr.sections.map(function(s){ return { label:s.label, n:s.active, under:s.users, sub:'из '+nf(s.users) }; });
    var sectionBlock='<div class="sec"><h2>Разделы</h2><span class="aside">кто открывал</span></div><div class="card">'
      +(secs.length?bars(secs)+'<div class="legend"><span><i class="box" style="background:var(--context)"></i>открывали когда-либо</span><span><i class="box" style="background:var(--mark)"></i>из них заходили за 30 дней</span></div>':'<div class="empty">данные ещё собираются</div>')+'</div>';

    var pl=pr.planning, base=pl.cards||1;
    var planBlock='<div class="card"><div class="cardhead"><h3>Настроили планирование</h3><span class="note">из '+nf(pl.cards)+' с данными</span></div>'
      +bars([{label:'Бюджет месяца',n:pl.budget,sub:pct(pl.budget,base)},{label:'Лимиты категорий',n:pl.limits,sub:pct(pl.limits,base)},{label:'Цели',n:pl.goals,sub:pct(pl.goals,base)},{label:'Активы',n:pl.invest,sub:pct(pl.invest,base)},{label:'Свои категории',n:pl.cats,sub:pct(pl.cats,base)}],{max:base})
      +'</div>';
    var ob=pr.opsBuckets, rampL=['var(--context)','#9BD8B6','#5DB996','#2D8866','#1D5743'], rampD=['var(--context)','#2D7A5A','#3CA37B','#6CC39E','#B8E5CC'];
    var opsBlock='<div class="card"><div class="cardhead"><h3>Сколько у людей операций</h3></div>'
      +bars([{label:'Ни одной',n:ob[0]},{label:'1–4',n:ob[1]},{label:'5–19',n:ob[2]},{label:'20–99',n:ob[3]},{label:'100 и больше',n:ob[4]}],{colors:isDark()?rampD:rampL})
      +'</div>';
    var db=pr.daysBuckets;
    var daysBlock='<div class="card"><div class="cardhead"><h3>В скольких днях есть записи</h3><span class="note">глубина привычки</span></div>'
      +bars([{label:'1 день',n:db[0]},{label:'2–3 дня',n:db[1]},{label:'4–7 дней',n:db[2]},{label:'8–30 дней',n:db[3]},{label:'больше 30',n:db[4]}],{colors:(isDark()?rampD:rampL).slice(0).map(function(c,i){ return i===0?(isDark()?'#25573F':'#C6E8D4'):c; })})
      +'</div>';
    var st=pr.settings;
    function dist(title,items,map){
      if(!items||!items.length) return '';
      // Хвост сворачиваем в «Другие»: восемь полос валют на телефоне — экран прокрутки.
      var head=items.slice(0,4), rest=items.slice(4).reduce(function(a,x){ return a+x.n; },0);
      var rowsD=head.map(function(x){ return { label:(map&&map[x.key])||x.key, n:x.n }; });
      if(rest) rowsD.push({ label:'Другие', n:rest });
      return '<div class="note" style="margin:14px 0 4px;font-weight:600">'+esc(title)+'</div>'+bars(rowsD);
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
    return botBlock+sectionBlock
      +'<div class="sec"><h2>Глубина использования</h2></div><div class="grid g2 start">'+planBlock+opsBlock+daysBlock+setBlock+'</div>'
      +'<div class="sec"><h2>Игра</h2></div><p class="note" style="margin:-4px 4px 10px">Опыта у всех '+nf(g.sumXp)+' · монет '+nf(g.sumCoins)+' · средний уровень '+g.avgLevel+'</p>'
      +'<div class="grid g2 start"><div><div class="note" style="margin:0 4px 8px;font-weight:600">По опыту</div>'+top(D.topXp,'xp','XP')+'</div>'
      +'<div><div class="note" style="margin:0 4px 8px;font-weight:600">По приглашениям</div>'+top(D.topRefs,'refs','друзей')+'</div></div>';
  }

  /* ---------- После отрисовки ---------- */
  function afterRender(){
    if(S.tab==='overview'){ drawSparks(); drawChart(); bindHours(); }
    if(S.tab==='product') drawSparks();
    if(S.tab==='retention') bindHeat();
  }

  /* ---------- Действия ---------- */
  function haptic(){ try{ if(TG && TG.HapticFeedback) TG.HapticFeedback.selectionChanged(); }catch(e){} }
  document.addEventListener('click',function(e){
    var el=e.target.closest ? e.target.closest('[data-act]') : null;
    if(!el) { if(!e.target.closest || !e.target.closest('.hours,.chart,.heat')) hideTip(); return; }
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
    else if(act==='srcfunnel'){ S.src=v; S.tab='overview'; haptic(); render(); var f=document.querySelector('.step'); if(f) f.scrollIntoView({block:'center'}); }
    else if(act==='copy'){ var t=cleanTag(S.tag); if(!t){ toast('Сначала придумайте метку'); return; } copy('https://t.me/'+BOT+(v==='bot'?'?start=':'?startapp=')+t); }
    else if(act==='tglink'){ if(TG && TG.openTelegramLink){ e.preventDefault(); TG.openTelegramLink('https://t.me/'+v); } }
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
