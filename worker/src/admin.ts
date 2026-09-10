/**
 * HTML админ-дашборда «Кошель · Аналитика».
 *
 * Самодостаточная страница: вход по паролю (значение секрета ADMIN_KEY), затем
 * POST /admin/stats с заголовком X-Admin-Key и отрисовка. Графики — ручной
 * inline-SVG, внешних библиотек нет.
 *
 * Оформление намеренно повторяет само приложение: те же CSS-переменные
 * поверхностей и чернил, что в src/index.css, тот же мятный акцент, шрифт Manrope,
 * та же геометрия карточек. Светлая и тёмная темы — как в приложении.
 *
 * ВАЖНО: внутренний <script> написан на строковой конкатенации (без обратных
 * кавычек и ${}), чтобы не конфликтовать с этой шаблонной строкой.
 */
export const ADMIN_HTML = `<!doctype html>
<html lang="ru" data-theme="dark">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>Кошель · Аналитика</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
<style>
  /* Палитра — копия токенов приложения (src/index.css). */
  :root{
    --surface:#FAFBF9; --raised:#FFFFFF; --sunken:#F1F4F0;
    --ink:#0F1A14; --ink-muted:#5E6B62; --ink-subtle:#8A968F;
    --line:rgba(15,26,20,.08);
    --brand:#3CA37B; --brand-soft:#5DB996; --brand-deep:#246E54; --brand-tint:rgba(60,163,123,.12);
    --amber:#D9A038; --amber-tint:rgba(217,160,56,.14);
    --rose:#E97373; --rose-tint:rgba(233,115,115,.14);
    --shadow:0 2px 12px rgba(20,63,48,.06);
    --shadow-raised:0 8px 24px rgba(20,63,48,.10);
    --grad-top:#F1FAF5; --grad-bottom:#FAFBF9;
    color-scheme:light;
  }
  html[data-theme="dark"]{
    --surface:#0F1A14; --raised:#1A2620; --sunken:#243029;
    --ink:#E8F0EB; --ink-muted:#A8B5AE; --ink-subtle:#7C8A82;
    --line:rgba(232,240,235,.08);
    --brand:#5DB996; --brand-soft:#8FD3AC; --brand-deep:#3CA37B; --brand-tint:rgba(93,185,150,.14);
    --amber:#E8B04B; --amber-tint:rgba(232,176,75,.16);
    --rose:#E97373; --rose-tint:rgba(233,115,115,.16);
    --shadow:0 2px 10px rgba(0,0,0,.35);
    --shadow-raised:0 8px 24px rgba(0,0,0,.45);
    --grad-top:#0F1A14; --grad-bottom:#0B1410;
    color-scheme:dark;
  }
  *{box-sizing:border-box}
  body{
    margin:0;min-height:100vh;
    background:linear-gradient(180deg,var(--grad-top) 0%,var(--grad-bottom) 30%);
    color:var(--ink);
    font:15px/1.45 Manrope,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
    -webkit-font-smoothing:antialiased;
  }
  .tabular{font-variant-numeric:tabular-nums;font-feature-settings:'tnum'}
  .wrap{max-width:1180px;margin:0 auto;padding:22px 18px 72px}

  /* ---------- Шапка ---------- */
  header{display:flex;align-items:center;gap:12px;margin-bottom:20px}
  .brand{display:flex;align-items:center;gap:10px;font-weight:800;font-size:17px;letter-spacing:-.01em}
  .dot{width:10px;height:10px;border-radius:99px;background:var(--brand);box-shadow:0 0 0 4px var(--brand-tint)}
  .brand span{color:var(--ink-subtle);font-weight:600}
  .spacer{flex:1}
  .iconbtn{
    display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 14px;border-radius:99px;
    border:1px solid var(--line);background:var(--raised);color:var(--ink-muted);
    font:600 13px Manrope,sans-serif;cursor:pointer;transition:color .15s,border-color .15s;
  }
  .iconbtn:hover{color:var(--ink);border-color:var(--brand)}
  .iconbtn svg{width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}

  /* ---------- Секции и карточки ---------- */
  .section{
    display:flex;align-items:baseline;gap:10px;
    font-size:11px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;
    color:var(--ink-subtle);margin:30px 4px 12px;
  }
  .section i{font-style:normal;font-size:10px;font-weight:600;letter-spacing:0;text-transform:none;color:var(--ink-subtle);opacity:.8}
  .card{background:var(--raised);border:1px solid var(--line);border-radius:24px;padding:18px;box-shadow:var(--shadow)}
  .grid{display:grid;gap:12px}
  .g4{grid-template-columns:repeat(4,1fr)}
  .g3{grid-template-columns:repeat(3,1fr)}
  .g2{grid-template-columns:1fr 1fr}
  /* Пара карточек разной высоты: тянуть короткую до высокой — значит оставить
     внизу пустое поле. Выравниваем по верху там, где содержимое несопоставимо. */
  .grid.start{align-items:start}
  @media(max-width:900px){.g4{grid-template-columns:1fr 1fr}.g3,.g2{grid-template-columns:1fr}}
  @media(max-width:560px){.g4{grid-template-columns:1fr}}

  .stat .k{font-size:10px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-subtle)}
  .stat .v{font-size:34px;font-weight:800;letter-spacing:-.03em;line-height:1.05;margin-top:10px}
  .stat .s{font-size:12px;color:var(--ink-muted);margin-top:8px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
  .pill{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700}
  .pill.up{background:var(--brand-tint);color:var(--brand-deep)}
  .pill.down{background:var(--rose-tint);color:var(--rose)}
  .pill.flat{background:var(--sunken);color:var(--ink-subtle)}
  html[data-theme="dark"] .pill.up{color:var(--brand-soft)}
  .v.brand{color:var(--brand-deep)} html[data-theme="dark"] .v.brand{color:var(--brand-soft)}
  .v.amber{color:var(--amber)}

  /* ---------- Сегменты (как переключатель периода в приложении) ---------- */
  .segs{display:inline-flex;padding:3px;border-radius:99px;background:var(--sunken);gap:2px}
  .segs button{
    border:0;background:none;color:var(--ink-subtle);cursor:pointer;
    font:700 12px Manrope,sans-serif;padding:6px 13px;border-radius:99px;transition:all .18s;
  }
  .segs button.on{background:var(--raised);color:var(--ink);box-shadow:var(--shadow)}

  .cardhead{display:flex;align-items:center;gap:12px;margin-bottom:14px}
  .cardhead h3{margin:0;font-size:14px;font-weight:700;letter-spacing:-.01em}
  .cardhead .hint{font-size:11px;color:var(--ink-subtle);font-weight:500}

  /* ---------- График ---------- */
  .chartwrap{position:relative}
  .chart{width:100%;height:auto;display:block;overflow:visible}
  .legend{display:flex;gap:14px;margin-top:10px;font-size:11px;color:var(--ink-muted);font-weight:600}
  .legend b{display:inline-block;width:8px;height:8px;border-radius:3px;margin-right:6px;vertical-align:middle}
  .tip{
    position:absolute;pointer-events:none;opacity:0;transition:opacity .12s;
    background:var(--raised);border:1px solid var(--line);border-radius:14px;padding:8px 11px;
    box-shadow:var(--shadow-raised);font-size:12px;white-space:nowrap;z-index:5;
  }
  .tip .d{color:var(--ink-subtle);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px}
  .tip .r{display:flex;align-items:center;gap:6px;font-weight:600}

  /* ---------- Воронка ---------- */
  .step{display:grid;grid-template-columns:1fr;gap:6px;padding:10px 0;border-top:1px solid var(--line)}
  .step:first-child{border-top:0;padding-top:0}
  .step .top{display:flex;align-items:baseline;gap:10px}
  .step .lb{font-size:13px;font-weight:600}
  .step .nm{margin-left:auto;font-size:15px;font-weight:800;letter-spacing:-.02em}
  .step .pc{font-size:12px;color:var(--ink-subtle);font-weight:700;min-width:44px;text-align:right}
  .track{height:10px;border-radius:99px;background:var(--sunken);overflow:hidden}
  .fill{height:100%;border-radius:99px;background:linear-gradient(90deg,var(--brand-deep),var(--brand-soft));transition:width .5s cubic-bezier(.16,1,.3,1)}
  .drop{font-size:11px;color:var(--rose);font-weight:600}

  /* ---------- Полосы (разделы, распределения) ---------- */
  .bar{display:grid;grid-template-columns:178px 1fr auto;align-items:center;gap:12px;padding:7px 0;font-size:13px}
  .bar .bl{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600}
  .bar .bt{height:8px;border-radius:99px;background:var(--sunken);overflow:hidden;position:relative}
  .bar .bf{height:100%;border-radius:99px;background:var(--brand);opacity:.85}
  /* Двухслойная полоса: бледная — все за всё время, поверх сплошная — те, кто ещё
     заходит. Раньше слои различались только оттенком зелёного и не читались. */
  .bar .bf.pale{opacity:.3}
  .bar .bf2{position:absolute;left:0;top:0;height:100%;border-radius:99px;background:var(--brand)}
  .bar .bn{font-weight:700;min-width:60px;text-align:right;color:var(--ink-muted);font-size:12px}
  /* На узком экране подпись не влезает рядом с полосой и обрезается многоточием —
     кладём её отдельной строкой над полосой, а не режем. */
  @media(max-width:560px){
    .bar{grid-template-columns:1fr auto;row-gap:5px;padding:9px 0}
    .bar .bl{grid-column:1/-1;white-space:normal}
  }

  /* Узкий экран: дашборд смотрят и с телефона, поэтому подписи кнопок прячем,
     а ряды сегментов делаем прокручиваемыми — страница не должна ехать вбок. */
  .segs{max-width:100%;overflow-x:auto;scrollbar-width:none}
  .segs::-webkit-scrollbar{display:none}
  .segs button{flex:none}
  .brand{white-space:nowrap}
  .cardhead{flex-wrap:wrap}
  @media(max-width:640px){
    header{gap:8px}
    .iconbtn .lb{display:none}
    .iconbtn{padding:0 11px}
    .brand{font-size:15px}
    .wrap{padding:16px 12px 60px}
    .card{border-radius:20px;padding:14px}
    .stat .v{font-size:28px}
  }

  /* ---------- Таблицы ---------- */
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{
    text-align:left;color:var(--ink-subtle);font-weight:800;font-size:10px;
    letter-spacing:.08em;text-transform:uppercase;padding:8px 10px;white-space:nowrap;
  }
  th.sortable{cursor:pointer;user-select:none}
  th.sortable:hover{color:var(--ink)}
  th.on{color:var(--brand-deep)} html[data-theme="dark"] th.on{color:var(--brand-soft)}
  td{padding:9px 10px;border-top:1px solid var(--line);vertical-align:middle}
  td.r,th.r{text-align:right}
  tbody tr:hover{background:var(--sunken)}
  .who{display:flex;align-items:center;gap:10px;min-width:0}
  .ava{
    width:32px;height:32px;border-radius:99px;flex:none;display:grid;place-items:center;
    font-weight:800;font-size:13px;color:#fff;background:var(--brand-deep);
  }
  .ava.off{background:var(--ink-subtle)}
  .who .nm{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .who .un{color:var(--ink-subtle);font-size:11px;font-weight:500}
  .tag{display:inline-block;padding:1px 7px;border-radius:99px;font-size:10px;font-weight:800;letter-spacing:.02em}
  .tag.ref{background:var(--brand-tint);color:var(--brand-deep)}
  html[data-theme="dark"] .tag.ref{color:var(--brand-soft)}
  .tag.blk{background:var(--rose-tint);color:var(--rose)}
  .tag.est{background:var(--sunken);color:var(--ink-subtle)}
  .sdot{display:inline-block;width:7px;height:7px;border-radius:99px;margin-right:7px;vertical-align:middle}
  .sdot.a{background:var(--brand)} .sdot.s{background:var(--amber)} .sdot.c{background:var(--ink-subtle);opacity:.5}

  .toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}
  .search{
    flex:1;min-width:180px;height:38px;padding:0 14px;border-radius:99px;
    border:1px solid var(--line);background:var(--sunken);color:var(--ink);
    font:500 13px Manrope,sans-serif;outline:none;
  }
  .search:focus{border-color:var(--brand)}
  .scroll{overflow-x:auto;margin:0 -4px;padding:0 4px}

  .empty{color:var(--ink-subtle);font-size:13px;text-align:center;padding:44px 0}
  .note{color:var(--ink-subtle);font-size:11px;line-height:1.6}
  .foot{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-top:26px;padding-top:18px;border-top:1px solid var(--line)}

  /* Пока карточки не собраны, часть чисел на странице занижена. Говорить об этом
     сноской в самом низу — значит дать человеку сначала поверить в неверные цифры. */
  .banner{
    display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-top:12px;
    background:var(--amber-tint);border:1px solid var(--line);border-radius:20px;padding:14px 16px;
  }
  .banner .txt{flex:1;min-width:200px;font-size:13px;line-height:1.5}
  .banner b{color:var(--ink)}
  .banner button{
    height:38px;padding:0 16px;border-radius:99px;border:0;background:var(--brand);color:#fff;
    font:800 13px Manrope,sans-serif;cursor:pointer;white-space:nowrap;
  }
  .banner button:hover{background:var(--brand-deep)}
  .banner button[disabled]{opacity:.6;cursor:default}

  /* ---------- Вход ---------- */
  #login{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:20px;
    background:linear-gradient(180deg,var(--grad-top) 0%,var(--grad-bottom) 40%)}
  .loginbox{background:var(--raised);border:1px solid var(--line);border-radius:28px;padding:30px;width:min(370px,100%);
    text-align:center;box-shadow:var(--shadow-raised)}
  .loginbox .dot{margin:0 auto 14px}
  .loginbox h1{font-size:19px;margin:0 0 5px;letter-spacing:-.02em}
  .loginbox p{color:var(--ink-muted);font-size:13px;margin:0 0 20px}
  .loginbox input{width:100%;padding:13px 16px;border-radius:16px;border:1px solid var(--line);
    background:var(--sunken);color:var(--ink);font:500 15px Manrope,sans-serif;outline:none;text-align:center}
  .loginbox input:focus{border-color:var(--brand)}
  .loginbox button{width:100%;margin-top:12px;padding:13px;border-radius:16px;border:0;
    background:var(--brand);color:#fff;font:800 15px Manrope,sans-serif;cursor:pointer}
  .loginbox button:hover{background:var(--brand-deep)}
  .err{color:var(--rose);font-size:12px;min-height:17px;margin-top:11px;font-weight:600}
  #dash{display:none}
  .loading{opacity:.5;transition:opacity .2s}
</style>
</head>
<body>
  <div id="login">
    <div class="loginbox">
      <div class="dot"></div>
      <h1>Кошель · Аналитика</h1>
      <p>Внутренний дашборд. Введите пароль администратора.</p>
      <input id="login-pass" type="password" autocomplete="current-password" placeholder="Пароль" />
      <button id="login-btn">Войти</button>
      <div class="err" id="login-err"></div>
    </div>
  </div>

  <div id="dash" class="wrap">
    <header>
      <div class="brand"><span class="dot"></span>Кошель <span>· Аналитика</span></div>
      <div class="spacer"></div>
      <button class="iconbtn" id="theme-btn" title="Тема"><svg viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg><span class="lb" id="theme-lb">Тема</span></button>
      <button class="iconbtn" id="refresh"><svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/></svg><span class="lb">Обновить</span></button>
      <button class="iconbtn" id="logout"><svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg><span class="lb">Выйти</span></button>
    </header>

    <div class="grid g4" id="hero"></div>
    <div id="cov-banner"></div>

    <div class="section">Активация <i>сколько людей доходят до пользы</i></div>
    <div class="grid g2">
      <div class="card" id="funnel"></div>
      <div class="card" id="lifecycle"></div>
    </div>

    <div class="section">Динамика <i>по снимкам на конец суток МСК</i></div>
    <div class="card">
      <div class="cardhead">
        <h3 id="chart-title">Пользователи</h3>
        <div class="spacer"></div>
        <div class="segs" id="metric-segs"></div>
        <div class="segs" id="range-segs"></div>
      </div>
      <div class="chartwrap"><div id="chart"></div><div class="tip" id="tip"></div></div>
      <div class="legend" id="legend"></div>
      <div class="note" id="chart-note" style="margin-top:10px"></div>
    </div>

    <div class="section">Когорты <i>кто пришёл на неделе и что с ними стало</i></div>
    <div class="card"><div class="scroll" id="cohorts"></div></div>

    <div class="section">Кто эти люди <i>поимённо, с датами и активностью</i></div>
    <div class="card">
      <div class="toolbar">
        <input class="search" id="q" placeholder="Поиск по имени или @нику" />
        <div class="segs" id="people-segs"></div>
      </div>
      <div class="scroll"><table id="people-table"></table></div>
      <div class="note" id="people-note" style="margin-top:12px"></div>
    </div>

    <div class="section">Разделы <i>сколько людей открывали</i></div>
    <div class="card" id="sections"></div>

    <div class="section">Настройки и устройство базы</div>
    <div class="grid g2 start">
      <div class="card" id="settings"></div>
      <div class="card" id="ops"></div>
    </div>

    <div class="section">Топы</div>
    <div class="grid g2">
      <div class="card"><div class="cardhead"><h3>По XP</h3></div><div class="scroll"><table id="top-xp"></table></div></div>
      <div class="card"><div class="cardhead"><h3>По приглашениям</h3></div><div class="scroll"><table id="top-refs"></table></div></div>
    </div>

    <div class="foot">
      <div class="note" id="coverage"></div>
      <div class="spacer"></div>
      <button class="iconbtn" id="backfill"><svg viewBox="0 0 24 24"><path d="M12 3v12"/><path d="m8 11 4 4 4-4"/><path d="M4 21h16"/></svg>Дозаполнить карточки</button>
      <div class="note" id="updated"></div>
    </div>
  </div>

<script>
(function(){
  var KEY='koshel_admin_key', THEME='koshel_admin_theme';
  var D=null, range=30, metric='growth', pfilter='all', psort='lastSeen', pdir=-1;

  var $=function(id){ return document.getElementById(id); };
  function esc(s){ s=String(s==null?'':s); return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function nf(n){ return (Number(n)||0).toLocaleString('ru-RU'); }
  function kf(n){ n=Number(n)||0; return n>=10000 ? Math.round(n/1000)+'к' : nf(n); }
  function pc(n){ return (Math.round((Number(n)||0)*10)/10)+'%'; }

  var DAY=86400000;
  function dstr(ms){ return new Date(ms).toLocaleDateString('ru-RU',{day:'numeric',month:'short'}); }
  function ago(ms){
    if(!ms) return '—';
    var d=Math.floor((Date.now()-ms)/DAY);
    if(d<=0) return 'сегодня';
    if(d===1) return 'вчера';
    if(d<7) return d+' дн. назад';
    if(d<30) return Math.floor(d/7)+' нед. назад';
    if(d<365) return Math.floor(d/30)+' мес. назад';
    return Math.floor(d/365)+' г. назад';
  }
  function delta(cur,prev){
    cur=Number(cur)||0; prev=Number(prev)||0;
    if(prev===0 && cur===0) return '<span class="pill flat">без изменений</span>';
    if(prev===0) return '<span class="pill up">+'+cur+' к прошлой неделе</span>';
    var diff=cur-prev, p=Math.round((diff/prev)*100);
    if(diff===0) return '<span class="pill flat">как неделей раньше</span>';
    return '<span class="pill '+(diff>0?'up':'down')+'">'+(diff>0?'+':'')+p+'% к прошлой неделе</span>';
  }

  /* ---------- Тема ---------- */
  function applyTheme(t){
    document.documentElement.setAttribute('data-theme',t);
    $('theme-lb').textContent = t==='dark' ? 'Тёмная' : 'Светлая';
    try{ localStorage.setItem(THEME,t); }catch(e){}
  }
  function initTheme(){
    var t='dark';
    try{ t=localStorage.getItem(THEME)||'dark'; }catch(e){}
    applyTheme(t);
  }

  /* ---------- Экраны ---------- */
  function showLogin(msg){
    $('login').style.display='flex'; $('dash').style.display='none';
    $('login-err').textContent=msg||''; $('login-pass').value=''; $('login-pass').focus();
  }
  function showDash(){ $('login').style.display='none'; $('dash').style.display='block'; }

  /* ---------- Сегменты ---------- */
  function segs(host,items,active,onPick){
    var el=$(host); if(!el) return;
    el.innerHTML='';
    items.forEach(function(it){
      var b=document.createElement('button');
      b.textContent=it.label;
      if(it.key===active) b.className='on';
      b.onclick=function(){ onPick(it.key); };
      el.appendChild(b);
    });
  }

  /* ---------- Верхние карточки ---------- */
  function renderHero(){
    var u=D.users, a=D.active, n=D.newUsers, hasCards=((D.coverage||{}).withCard||0)>0;
    var cards=[
      { k:'Всего людей', v:nf(u.total), cls:'',
        s:'по приглашению '+nf(u.fromRef)+' · сами '+nf(u.organic) },
      // Число считается по карточкам. Пока их нет, честнее прочерк, чем ноль:
      // ноль читается как «никто не пишет», а это неправда.
      { k:'Записывают операции', v:hasCards?nf(a.writers7):'—', cls:'brand',
        s:hasCards
          ? 'за 30 дней '+nf(a.writers30)+' · всего с операциями '+nf(u.withOps)+' ('+pc(u.withOpsPct)+')'
          : 'нужны карточки · всего с операциями '+nf(u.withOps)+' ('+pc(u.withOpsPct)+')' },
      { k:'Заходили за 7 дней', v:nf(a.wau), cls:'',
        s:'сегодня '+nf(a.dau)+' · за 30 дней '+nf(a.mau)+' · липкость '+pc(a.stickiness) },
      { k:'Новых за 7 дней', v:nf(n.d7), cls:'amber', pill:delta(n.d7,n.prev7),
        s:'сегодня '+nf(n.today)+' · за 30 дней '+nf(n.d30) }
    ];
    $('hero').innerHTML=cards.map(function(c){
      return '<div class="card stat"><div class="k">'+esc(c.k)+'</div>'
        +'<div class="v '+c.cls+' tabular">'+c.v+'</div>'
        +'<div class="s">'+(c.pill||'')+'<span>'+esc(c.s)+'</span></div></div>';
    }).join('');
  }

  /* ---------- Воронка ---------- */
  function renderFunnel(){
    var f=D.funnel, base=f.length?f[0].users:0, html='';
    html+='<div class="cardhead"><h3>Путь до привычки</h3><div class="hint">каждый шаг — часть предыдущего</div></div>';
    for(var i=0;i<f.length;i++){
      var s=f[i], share=base?(s.users/base)*100:0;
      var lost='';
      if(i>0){
        var prev=f[i-1].users, d=prev-s.users;
        if(d>0 && prev>0) lost='<span class="drop">−'+nf(d)+' ('+pc((d/prev)*100)+')</span>';
      }
      html+='<div class="step"><div class="top"><span class="lb">'+esc(s.label)+'</span>'+lost
        +'<span class="nm tabular">'+nf(s.users)+'</span><span class="pc tabular">'+pc(share)+'</span></div>'
        +'<div class="track"><div class="fill" style="width:'+Math.max(1,share).toFixed(1)+'%"></div></div></div>';
    }
    $('funnel').innerHTML=html;
  }

  /* ---------- Жизненный цикл ---------- */
  function renderLifecycle(){
    var l=D.lifecycle, r=D.retention, u=D.users, total=u.total||1;
    var rows=[
      { lb:'Активные · 7 дней', n:l.active, c:'var(--brand)' },
      { lb:'Засыпают · 7–30 дней', n:l.sleeping, c:'var(--amber)' },
      { lb:'Ушли · больше 30', n:l.churned, c:'var(--ink-subtle)' },
      { lb:'Без единой операции', n:l.zeroOps, c:'var(--rose)' }
    ];
    var html='<div class="cardhead"><h3>Что с базой сейчас</h3></div>';
    rows.forEach(function(r2){
      var w=(r2.n/total)*100;
      html+='<div class="bar"><div class="bl">'+esc(r2.lb)+'</div>'
        +'<div class="bt"><div class="bf" style="width:'+Math.max(1,w).toFixed(1)+'%;background:'+r2.c+'"></div></div>'
        +'<div class="bn tabular">'+nf(r2.n)+' · '+pc(w)+'</div></div>';
    });
    html+='<div class="note" style="margin-top:14px">Вернулись хотя бы раз после дня регистрации: <b style="color:var(--ink)">'
      +pc(r.returnedPct)+'</b> ('+nf(r.returned)+' из '+nf(r.base)+'). '
      +'Это не D1: у нас есть только дата последнего визита, поэтому считаем «зашёл ещё в какой-то другой день», а не «на следующий».</div>';
    html+='<div class="note" style="margin-top:8px">Задали бюджет, лимит или цель: <b style="color:var(--ink)">'+nf(D.planned||0)
      +'</b> · заблокировали бота: <b style="color:var(--ink)">'+nf(u.blocked)
      +'</b> · выключили напоминания: <b style="color:var(--ink)">'+nf(u.remindersOff)+'</b></div>';
    $('lifecycle').innerHTML=html;
  }

  /* ---------- График ---------- */
  /* Ряды внутри одного графика обязаны быть сопоставимы по масштабу. Накопительное
     «всего» (сотни) и суточный приток (единицы) на одной оси означают, что второй
     ряд лежит на нуле и не читается вовсе, — поэтому потоки и накопления разведены
     по разным вкладкам, а приток нарисован столбиками: это событие дня, а не кривая. */
  var METRICS={
    growth:{ title:'Рост базы', type:'area', series:[
      {key:'total',label:'Всего людей',color:'var(--brand)'},
      {key:'withData',label:'С операциями',color:'var(--amber)'} ] },
    active:{ title:'Активность', type:'area', series:[
      {key:'wau',label:'Заходили за 7 дней',color:'var(--brand)'},
      {key:'writers',label:'Записывали за 7 дней',color:'var(--amber)'},
      {key:'dau',label:'Заходили за день',color:'var(--rose)'} ] },
    inflow:{ title:'Приток', type:'bars', series:[
      {key:'new',label:'Новые за день',color:'var(--brand)'} ] }
  };
  var METRIC_SEGS=[{key:'growth',label:'Рост'},{key:'active',label:'Активность'},{key:'inflow',label:'Приток'}];
  var RANGE_SEGS=[{key:7,label:'7 дн.'},{key:30,label:'30 дн.'},{key:60,label:'60 дн.'}];
  var PEOPLE_SEGS=[{key:'all',label:'Все'},{key:'ops',label:'С операциями'},{key:'zero',label:'Нулевые'},
    {key:'ref',label:'По ссылке'},{key:'alive',label:'Активные'}];

  /**
   * Ось: подбираем круглый ШАГ, а не круглый максимум. Круглый максимум, делённый
   * на четыре, даёт подписи вида 0·6·13·19·25 — читать такую шкалу невозможно.
   */
  function axisFor(v){
    if(v<=4) return { step:1, max:Math.max(1,Math.ceil(v)) };
    var target=v/4;
    var pow=Math.pow(10,Math.floor(Math.log(target)/Math.LN10));
    var steps=[1,1.5,2,2.5,3,4,5,7.5,10];
    for(var i=0;i<steps.length;i++){
      var st=steps[i]*pow;
      if(st>=target) return { step:st, max:st*4 };
    }
    return { step:pow*10, max:pow*40 };
  }

  function renderChart(){
    var conf=METRICS[metric];
    $('chart-title').textContent=conf.title;
    var hist=(D.history||[]).slice(-range);
    if(hist.length<2){
      $('chart').innerHTML='<div class="empty">История копится со дня установки снимков — нужно хотя бы двое суток.</div>';
      $('legend').innerHTML='';
      $('chart-note').innerHTML='';
      return;
    }
    var W=880,H=190,padL=34,padR=10,padT=14,padB=24;
    var max=1,i,j;
    for(i=0;i<hist.length;i++) for(j=0;j<conf.series.length;j++){
      var v=Number(hist[i][conf.series[j].key])||0; if(v>max) max=v;
    }
    var ax=axisFor(max);
    max=ax.max;
    var n=hist.length, step=n>1?(W-padL-padR)/(n-1):0;
    var X=function(i2){ return padL+step*i2; };
    var Y=function(v){ return H-padB-((Number(v)||0)/max)*(H-padT-padB); };

    // preserveAspectRatio по умолчанию: растягивать по X нельзя — обводки и цифры
    // осей поехали бы по горизонтали тем сильнее, чем шире окно.
    var svg='<svg class="chart" viewBox="0 0 '+W+' '+H+'">';
    svg+='<defs>';
    for(j=0;j<conf.series.length;j++){
      svg+='<linearGradient id="g'+j+'" x1="0" y1="0" x2="0" y2="1">'
        +'<stop offset="0%" stop-color="'+conf.series[j].color+'" stop-opacity="'+(j===0?0.28:0.14)+'"/>'
        +'<stop offset="100%" stop-color="'+conf.series[j].color+'" stop-opacity="0"/></linearGradient>';
    }
    svg+='</defs>';

    // сетка и подписи оси
    for(var gi=0;gi*ax.step<=max+0.001;gi++){
      var gv=Math.round(ax.step*gi), gy=Y(ax.step*gi);
      svg+='<line x1="'+padL+'" y1="'+gy+'" x2="'+(W-padR)+'" y2="'+gy+'" stroke="var(--line)" stroke-width="1"/>';
      svg+='<text x="4" y="'+(gy+4)+'" fill="var(--ink-subtle)" font-size="10" font-family="Manrope">'+gv+'</text>';
    }

    if(conf.type==='bars'){
      var bw=Math.max(2,Math.min(16,step*0.6));
      for(i=0;i<n;i++){
        var bv=Number(hist[i][conf.series[0].key])||0;
        var by=Y(bv), bh=Math.max(bv>0?2:0,(H-padB)-by);
        if(bh<=0) continue;
        svg+='<rect x="'+(X(i)-bw/2).toFixed(1)+'" y="'+(H-padB-bh).toFixed(1)+'" width="'+bw.toFixed(1)
          +'" height="'+bh.toFixed(1)+'" rx="'+Math.min(3,bw/2).toFixed(1)+'" fill="'+conf.series[0].color+'" opacity=".85"/>';
      }
    } else {
      for(j=conf.series.length-1;j>=0;j--){
        var s=conf.series[j], pts='', area='';
        for(i=0;i<n;i++){
          var x=X(i).toFixed(1), y=Y(hist[i][s.key]).toFixed(1);
          pts+=(i?' L':'M')+x+' '+y;
        }
        area=pts+' L'+X(n-1).toFixed(1)+' '+(H-padB)+' L'+X(0).toFixed(1)+' '+(H-padB)+' Z';
        svg+='<path d="'+area+'" fill="url(#g'+j+')"/>';
        svg+='<path d="'+pts+'" fill="none" stroke="'+s.color+'" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
      }
    }

    // подписи дат: первая, средняя, последняя
    var marks=[0,Math.floor((n-1)/2),n-1];
    for(i=0;i<marks.length;i++){
      var mi=marks[i], anchor=i===0?'start':(i===2?'end':'middle');
      svg+='<text x="'+X(mi).toFixed(1)+'" y="'+(H-6)+'" fill="var(--ink-subtle)" font-size="10" font-family="Manrope" text-anchor="'+anchor+'">'
        +esc(hist[mi].date.slice(5).split('-').reverse().join('.'))+'</text>';
    }
    svg+='<line id="cross" x1="0" y1="'+padT+'" x2="0" y2="'+(H-padB)+'" stroke="var(--ink-subtle)" stroke-width="1" opacity="0"/>';
    svg+='</svg>';
    $('chart').innerHTML=svg;

    $('legend').innerHTML=conf.series.map(function(s2){
      return '<span><b style="background:'+s2.color+'"></b>'+esc(s2.label)+'</span>';
    }).join('');

    /* Старые снимки делались по прежним определениям: «всего» считалось по одним
       только облачным ключам, а «записывали» не считалось вовсе. Молча показать
       ступеньку на стыке — значит заставить гадать, что случилось в тот день. */
    var legacy=null;
    for(i=0;i<hist.length;i++) if(hist[i].writers===undefined) legacy=hist[i].date;
    $('chart-note').innerHTML = legacy
      ? 'Снимки по '+esc(legacy.split('-').reverse().join('.'))+' включительно сделаны по прежним определениям '
        + '(«всего» — только синхронизированные, «записывали» не считалось). На стыке возможна ступенька.'
      : '';

    // подсказка по наведению
    var host=$('chart'), tip=$('tip'), svgEl=host.querySelector('svg'), cross=host.querySelector('#cross');
    host.onmousemove=function(e){
      var r=svgEl.getBoundingClientRect();
      var rel=(e.clientX-r.left)/r.width*W;
      var idx=Math.round((rel-padL)/(step||1));
      if(idx<0) idx=0; if(idx>n-1) idx=n-1;
      var row=hist[idx];
      cross.setAttribute('x1',X(idx)); cross.setAttribute('x2',X(idx)); cross.setAttribute('opacity','.35');
      var html='<div class="d">'+esc(row.date.split('-').reverse().join('.'))+'</div>';
      conf.series.forEach(function(s3){
        html+='<div class="r"><b style="display:inline-block;width:8px;height:8px;border-radius:3px;background:'+s3.color+'"></b>'
          +esc(s3.label)+': '+nf(row[s3.key]||0)+'</div>';
      });
      tip.innerHTML=html; tip.style.opacity='1';
      var px=(X(idx)/W)*r.width;
      tip.style.left=Math.min(Math.max(px-60,0),r.width-150)+'px';
      tip.style.top='6px';
    };
    host.onmouseleave=function(){ tip.style.opacity='0'; if(cross) cross.setAttribute('opacity','0'); };
  }

  /* ---------- Когорты ---------- */
  function renderCohorts(){
    var c=D.cohorts||[];
    if(!c.length){ $('cohorts').innerHTML='<div class="empty">нет данных</div>'; return; }
    var html='<table><thead><tr><th>Неделя</th><th class="r">Пришло</th><th class="r">Записали операцию</th>'
      +'<th class="r">Живы сейчас</th><th style="width:34%">Дошли до операции</th></tr></thead><tbody>';
    for(var i=c.length-1;i>=0;i--){
      var r=c[i], act=r.joined?(r.activated/r.joined)*100:0;
      var note=r.approx>0?' <span class="tag est" title="у стольких людей дата регистрации оценочная">≈'+r.approx+'</span>':'';
      html+='<tr><td><b>'+esc(r.week.split('-').reverse().join('.'))+'</b>'+note+'</td>'
        +'<td class="r tabular">'+nf(r.joined)+'</td>'
        +'<td class="r tabular">'+nf(r.activated)+'</td>'
        +'<td class="r tabular">'+nf(r.alive)+'</td>'
        +'<td><div class="track"><div class="fill" style="width:'+Math.max(1,act).toFixed(1)+'%"></div></div></td></tr>';
    }
    html+='</tbody></table>';
    html+='<div class="note" style="margin-top:12px">Последние 8 недель. «Живы сейчас» — заходили за последние 7 дней. '
      +'«≈» — столько человек в когорте с оценочной датой регистрации: они появились раньше, чем мы начали её записывать, '
      +'и попали в неделю по первому известному следу.</div>';
    $('cohorts').innerHTML=html;
  }

  /* ---------- Люди ---------- */
  var PCOLS=[
    { key:'name', label:'Пользователь' },
    { key:'firstSeen', label:'Пришёл', r:true },
    { key:'lastSeen', label:'Был', r:true },
    { key:'ops', label:'Операций', r:true },
    { key:'lastTx', label:'Последняя запись', r:true },
    { key:'xp', label:'XP', r:true },
    { key:'refs', label:'Привёл', r:true }
  ];
  function statusOf(p){
    var d=(Date.now()-p.lastSeen)/DAY;
    if(d<=7) return 'a'; if(d<=30) return 's'; return 'c';
  }
  function renderPeople(){
    var all=D.people||[], q=($('q').value||'').trim().toLowerCase();
    var list=all.filter(function(p){
      if(pfilter==='ops' && !(p.ops>0)) return false;
      if(pfilter==='zero' && p.ops>0) return false;
      if(pfilter==='ref' && !p.fromRef) return false;
      if(pfilter==='alive' && statusOf(p)!=='a') return false;
      if(q){
        var hay=(p.name+' '+(p.username||'')).toLowerCase();
        if(hay.indexOf(q)<0) return false;
      }
      return true;
    });
    list.sort(function(a,b){
      var av=a[psort], bv=b[psort];
      if(psort==='name'){ av=String(av||'').toLowerCase(); bv=String(bv||'').toLowerCase(); return av<bv?-pdir:(av>bv?pdir:0); }
      return ((Number(av)||0)-(Number(bv)||0))*pdir;
    });

    var head='<thead><tr>'+PCOLS.map(function(c){
      return '<th class="sortable '+(c.r?'r ':'')+(psort===c.key?'on':'')+'" data-k="'+c.key+'">'+esc(c.label)
        +(psort===c.key?(pdir<0?' ↓':' ↑'):'')+'</th>';
    }).join('')+'</tr></thead>';

    var rows=list.slice(0,200).map(function(p){
      var initial=esc((p.name||'?').trim().charAt(0).toUpperCase()||'?');
      var st=statusOf(p);
      var tags=(p.fromRef?' <span class="tag ref">по ссылке</span>':'')+(p.blocked?' <span class="tag blk">заблокировал</span>':'');
      var lastTx = p.lastTx===undefined || p.lastTx===null
        ? (p.hasCard?'нет операций':'—')
        : ago(p.lastTx*DAY);
      return '<tr><td><div class="who"><div class="ava'+(p.ops>0?'':' off')+'">'+initial+'</div>'
        +'<div style="min-width:0"><div class="nm">'+esc(p.name)+tags+'</div>'
        +(p.username?'<div class="un">@'+esc(p.username)+'</div>':'')+'</div></div></td>'
        +'<td class="r tabular" title="'+esc(new Date(p.firstSeen).toLocaleString('ru-RU'))+'">'+(p.approx?'≈ ':'')+dstr(p.firstSeen)+'</td>'
        +'<td class="r tabular"><span class="sdot '+st+'"></span>'+ago(p.lastSeen)+'</td>'
        +'<td class="r tabular"><b>'+nf(p.ops)+'</b></td>'
        +'<td class="r tabular">'+esc(lastTx)+'</td>'
        +'<td class="r tabular">'+kf(p.xp)+'</td>'
        +'<td class="r tabular">'+(p.refs?nf(p.refs):'—')+'</td></tr>';
    }).join('');

    $('people-table').innerHTML=head+'<tbody>'+(rows||'<tr><td colspan="7" class="empty">никого не нашлось</td></tr>')+'</tbody>';
    $('people-note').innerHTML='Показано '+nf(Math.min(list.length,200))+' из '+nf(list.length)
      +' (в базе '+nf(all.length)+'). «≈» у даты — регистрация оценочная: человек появился раньше, чем мы начали её записывать. '
      +'«Последняя запись» — дата последней операции, она честнее «был», потому что открыть приложение можно и не записав ничего.';

    var ths=$('people-table').querySelectorAll('th.sortable');
    for(var i=0;i<ths.length;i++){
      ths[i].onclick=function(){
        var k=this.getAttribute('data-k');
        if(psort===k) pdir=-pdir; else { psort=k; pdir=k==='name'?1:-1; }
        renderPeople();
      };
    }
  }

  /* ---------- Разделы ---------- */
  function renderSections(){
    var s=D.sections||[], total=D.users.total||1, max=1;
    for(var i=0;i<s.length;i++) if(s[i].users>max) max=s[i].users;
    if(!s.length){ $('sections').innerHTML='<div class="empty">карточки ещё не собраны — нажмите «Дозаполнить карточки» внизу</div>'; return; }
    var html='<div class="cardhead"><h3>Что открывают</h3><div class="hint">сплошная часть — те, кто заходил за 30 дней</div></div>';
    for(i=0;i<s.length;i++){
      var r=s[i], w=(r.users/max)*100, wa=(r.active/max)*100;
      html+='<div class="bar"><div class="bl">'+esc(r.label)+'</div>'
        +'<div class="bt"><div class="bf pale" style="width:'+Math.max(1,w).toFixed(1)+'%"></div>'
        +'<div class="bf2" style="width:'+Math.max(0,wa).toFixed(1)+'%"></div></div>'
        +'<div class="bn tabular">'+nf(r.users)+' · '+pc((r.users/total)*100)+'</div></div>';
    }
    $('sections').innerHTML=html;
  }

  /* ---------- Настройки и распределение операций ---------- */
  var LANG={ru:'Русский',en:'English'}, THEMES={auto:'Как в системе',light:'Светлая',dark:'Тёмная'};
  function distBlock(title,items,map){
    if(!items || !items.length) return '';
    var max=1,i; for(i=0;i<items.length;i++) if(items[i].n>max) max=items[i].n;
    var html='<div class="note" style="margin:14px 0 6px;font-weight:800;letter-spacing:.08em;text-transform:uppercase">'+esc(title)+'</div>';
    for(i=0;i<items.length;i++){
      var it=items[i], lb=(map&&map[it.key])||it.key;
      html+='<div class="bar"><div class="bl">'+esc(lb)+'</div>'
        +'<div class="bt"><div class="bf" style="width:'+Math.max(1,(it.n/max)*100).toFixed(1)+'%"></div></div>'
        +'<div class="bn tabular">'+nf(it.n)+'</div></div>';
    }
    return html;
  }
  function renderSettings(){
    var s=D.settings||{};
    var html='<div class="cardhead"><h3>Как настроено</h3><div class="hint">по собранным карточкам</div></div>';
    html+=distBlock('Валюта',s.currency);
    html+=distBlock('Язык',s.lang,LANG);
    html+=distBlock('Тема',s.theme,THEMES);
    html+=distBlock('Версия хранилища',s.version);
    $('settings').innerHTML=html;

    var b=D.opsBuckets||[0,0,0,0,0];
    var labels=['Ни одной','1–4','5–19','20–99','100 и больше'];
    var max=1,i; for(i=0;i<b.length;i++) if(b[i]>max) max=b[i];
    var h2='<div class="cardhead"><h3>Сколько у людей операций</h3></div>';
    for(i=0;i<b.length;i++){
      h2+='<div class="bar"><div class="bl">'+labels[i]+'</div>'
        +'<div class="bt"><div class="bf" style="width:'+Math.max(1,(b[i]/max)*100).toFixed(1)+'%;background:'+(i===0?'var(--rose)':'var(--brand)')+'"></div></div>'
        +'<div class="bn tabular">'+nf(b[i])+'</div></div>';
    }
    var g=D.game||{};
    h2+='<div class="note" style="margin-top:16px">Всего XP '+kf(g.sumXp)+' · монет '+kf(g.sumCoins)
      +' · средний уровень '+(g.avgLevel||0)+' · приглашений '+nf((D.referrals||{}).total||0)+'</div>';
    $('ops').innerHTML=h2;
  }

  /* ---------- Топы ---------- */
  function renderTops(){
    var xp=D.topXp||[], html='<thead><tr><th>Пользователь</th><th class="r">Ур.</th><th class="r">XP</th><th class="r">Опер.</th></tr></thead><tbody>';
    html+=xp.map(function(e){
      return '<tr><td><div class="who"><div class="ava">'+esc((e.name||'?').charAt(0).toUpperCase())+'</div><div style="min-width:0">'
        +'<div class="nm">'+esc(e.name)+'</div>'+(e.username?'<div class="un">@'+esc(e.username)+'</div>':'')+'</div></div></td>'
        +'<td class="r tabular">'+(e.level||0)+'</td><td class="r tabular">'+kf(e.xp)+'</td><td class="r tabular">'+nf(e.ops||0)+'</td></tr>';
    }).join('')||'<tr><td colspan="4" class="empty">нет данных</td></tr>';
    $('top-xp').innerHTML=html+'</tbody>';

    var rf=D.topRefs||[]; html='<thead><tr><th>Пользователь</th><th class="r">Привёл</th></tr></thead><tbody>';
    html+=rf.map(function(e){
      return '<tr><td><div class="who"><div class="ava">'+esc((e.name||'?').charAt(0).toUpperCase())+'</div><div style="min-width:0">'
        +'<div class="nm">'+esc(e.name)+'</div>'+(e.username?'<div class="un">@'+esc(e.username)+'</div>':'')+'</div></div></td>'
        +'<td class="r tabular"><b>'+nf(e.refs||0)+'</b></td></tr>';
    }).join('')||'<tr><td colspan="2" class="empty">пока никто не приглашал</td></tr>';
    $('top-refs').innerHTML=html+'</tbody>';
  }

  /* ---------- Сборка ---------- */
  function render(){
    renderHero(); renderFunnel(); renderLifecycle();
    segsAll();
    renderChart(); renderCohorts(); renderPeople(); renderSections(); renderSettings(); renderTops();
    paintBanner();

    var cov=D.coverage||{};
    var txt='Разрезы по разделам и настройкам считаются по карточкам: собраны у <b style="color:var(--ink)">'+nf(cov.withCard)
      +'</b> из '+nf(cov.cloudKeys)+' синхронизированных ('+pc(cov.pct)+').';
    if(cov.launchOnly>0) txt+=' Ещё '+nf(cov.launchOnly)+' чел. только запускали приложение и ни разу не синхронизировались — про них известны лишь запуск и XP.';
    txt+=' Карточка появляется сама при заходе в приложение; давно не заходивших дозаполняет кнопка (по 12 за нажатие).';
    if(D.backfill) txt+=' <b style="color:var(--ink)">Последний проход: заполнено '+nf(D.backfill.filled)+(D.backfill.done?', база пройдена целиком.':'.')+'</b>';
    $('coverage').innerHTML=txt;
    $('updated').textContent='обновлено '+new Date(D.generatedAt||Date.now()).toLocaleString('ru-RU');
  }
  function segsAll(){
    segs('metric-segs',METRIC_SEGS,metric,function(k){ metric=k; renderChart(); segsAll(); });
    segs('range-segs',RANGE_SEGS,range,function(k){ range=k; renderChart(); segsAll(); });
    segs('people-segs',PEOPLE_SEGS,pfilter,function(k){ pfilter=k; renderPeople(); segsAll(); });
  }

  /* ---------- Загрузка ---------- */
  /** Один запрос статистики. Возвращает данные или null, если показывать нечего. */
  function fetchStats(opts){
    var key=null;
    try{ key=sessionStorage.getItem(KEY); }catch(e){}
    if(!key){ showLogin(); return Promise.resolve(null); }
    return fetch('/admin/stats',{
      method:'POST',
      headers:{'X-Admin-Key':key,'Content-Type':'application/json'},
      body:JSON.stringify(opts||{})
    })
      .then(function(res){
        if(res.status===403){ try{ sessionStorage.removeItem(KEY); }catch(e){} showLogin('Неверный пароль'); return null; }
        if(res.status===429){ showLogin('Слишком много попыток, подождите минуту'); return null; }
        return res.json();
      })
      .then(function(d){ return (d && d.ok) ? d : null; })
      .catch(function(){ return null; });
  }

  function load(opts){
    $('dash').className='wrap loading';
    fetchStats(opts).then(function(d){
      $('dash').className='wrap';
      if(d){ D=d; showDash(); render(); }
    });
  }

  /*
   * Дозаполнение идёт порциями: за один запрос воркер обрабатывает столько ключей,
   * сколько помещается под потолок подзапросов. Заставлять человека нажимать кнопку
   * восемь раз подряд незачем — крутим порции сами, пока база не пройдена целиком.
   */
  var bfBusy=false, bfMsg='';
  function runBackfill(){
    if(bfBusy) return;
    bfBusy=true; bfMsg='Собираю карточки…'; paintBanner();
    var filled=0, rounds=0;
    function step(){
      rounds++;
      fetchStats({backfill:true}).then(function(d){
        if(!d){ bfBusy=false; bfMsg='Не получилось — попробуйте ещё раз'; paintBanner(); return }
        var bf=d.backfill||{};
        filled+=bf.filled||0;
        // Порция без единого просмотренного ключа означает, что двигаться дальше
        // некуда; потолок кругов — страховка от бесконечного цикла.
        if(bf.done || !bf.scanned || rounds>=40){
          bfBusy=false;
          bfMsg=filled>0 ? ('Готово: собрано карточек — '+filled) : 'Всё уже собрано';
          D=d; render(); return;
        }
        bfMsg='Собрано '+filled+'…';
        D=d; render();
        step();
      });
    }
    step();
  }

  function paintBanner(){
    var cov=(D&&D.coverage)||{}, host=$('cov-banner');
    if(!host) return;
    var missing=(cov.cloudKeys||0)-(cov.withCard||0);
    if(!missing && !bfMsg){ host.innerHTML=''; return; }
    var txt = missing
      ? 'Карточки собраны у <b>'+nf(cov.withCard)+'</b> из '+nf(cov.cloudKeys)+'. '
        + 'Пока их нет, занижены: «записывают операции», последний шаг воронки, разделы и настройки. '
        + 'Сбор идёт порциями и ничего не меняет в данных людей.'
      : 'Карточки собраны у всех, кто синхронизировался.';
    // Кнопка нужна только пока есть что собирать: предлагать действие, которое
    // ничего не сделает, — верный способ заставить человека жать её впустую.
    var btn = missing
      ? '<button id="bf-go"'+(bfBusy?' disabled':'')+'>'+(bfBusy?'Собираю…':'Собрать карточки')+'</button>'
      : '';
    host.innerHTML='<div class="banner"><div class="txt">'+txt
      +(bfMsg?' <b>'+esc(bfMsg)+'</b>':'')+'</div>'+btn+'</div>';
    var go=$('bf-go'); if(go) go.onclick=runBackfill;
  }

  function doLogin(){
    var v=$('login-pass').value.trim();
    if(!v){ $('login-err').textContent='Введите пароль'; return; }
    try{ sessionStorage.setItem(KEY,v); }catch(e){}
    load();
  }

  initTheme();
  $('theme-btn').onclick=function(){
    applyTheme(document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark');
    if(D) renderChart();
  };
  $('login-btn').onclick=doLogin;
  $('login-pass').addEventListener('keydown',function(e){ if(e.key==='Enter') doLogin(); });
  $('logout').onclick=function(){ try{ sessionStorage.removeItem(KEY); }catch(e){} showLogin(); };
  $('refresh').onclick=function(){ load(); };
  $('backfill').onclick=runBackfill;
  $('q').addEventListener('input',function(){ if(D) renderPeople(); });

  load();
})();
</script>
</body>
</html>`
