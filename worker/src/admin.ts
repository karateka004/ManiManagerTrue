/**
 * HTML админ-дашборда «Кошель · Аналитика».
 *
 * Самодостаточная страница (без внешних библиотек — CSP-чисто): вход по паролю
 * (значение секрета ADMIN_KEY), затем POST /admin/stats с заголовком X-Admin-Key
 * и отрисовка карточек/графиков/топов. Графики — ручной inline-SVG.
 *
 * ВАЖНО: внутренний <script> написан на строковой конкатенации (без обратных
 * кавычек и ${}), чтобы не конфликтовать с этой шаблонной строкой.
 */
export const ADMIN_HTML = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>Кошель · Аналитика</title>
<style>
  :root{
    --bg:#0b0f1a; --panel:#121829; --panel2:#0f1422; --line:#1e2740;
    --ink:#e8edf7; --muted:#8a95ad; --sub:#5d6885;
    --cyan:#22d3ee; --violet:#a78bfa; --green:#34d399; --amber:#fbbf24; --rose:#fb7185;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
  a{color:inherit}
  .wrap{max-width:1120px;margin:0 auto;padding:20px 18px 60px}
  header{display:flex;align-items:center;justify-content:space-between;margin-bottom:22px}
  .brand{font-weight:800;font-size:18px;letter-spacing:.2px}
  .brand b{color:var(--cyan)}
  .logout{color:var(--muted);font-size:13px;background:none;border:0;cursor:pointer;padding:6px 8px;border-radius:8px}
  .logout:hover{color:var(--ink);background:var(--panel)}
  .section{font-size:11px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:var(--sub);margin:26px 4px 12px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(168px,1fr));gap:12px}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:16px 16px 14px}
  .card .k{font-size:10px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--sub)}
  .card .v{font-size:30px;font-weight:800;margin-top:8px;letter-spacing:-.5px}
  .card .s{font-size:11px;color:var(--muted);margin-top:8px}
  .v.cyan{color:var(--cyan)} .v.violet{color:var(--violet)} .v.green{color:var(--green)} .v.amber{color:var(--amber)}
  .charts{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  @media(max-width:720px){.charts{grid-template-columns:1fr}}
  .chartbox{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:16px}
  .chartbox h3{margin:0 0 12px;font-size:12px;font-weight:700;color:var(--muted)}
  .chart{width:100%;height:170px;display:block}
  .empty{color:var(--sub);font-size:13px;text-align:center;padding:60px 0}
  .subnote{color:var(--sub);font-size:11px;margin:-4px 0 12px}
  .bars{display:flex;flex-direction:column;gap:9px}
  .bar{display:grid;grid-template-columns:150px 1fr 44px;align-items:center;gap:10px;font-size:13px}
  .bar .bl{color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .bar .bt{height:10px;border-radius:6px;background:var(--panel2)}
  .bar .bf{height:100%;border-radius:6px;background:linear-gradient(90deg,#22d3ee,#a78bfa)}
  .bar .bn{text-align:right;color:var(--muted);font-variant-numeric:tabular-nums}
  @media(max-width:520px){.bar{grid-template-columns:110px 1fr 38px}}
  .tables{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  @media(max-width:720px){.tables{grid-template-columns:1fr}}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{text-align:left;color:var(--sub);font-weight:700;font-size:10px;letter-spacing:.8px;text-transform:uppercase;padding:6px 8px}
  td{padding:8px;border-top:1px solid var(--line)}
  td.r,th.r{text-align:right}
  .name{font-weight:600}
  .uname{color:var(--sub);font-size:11px}
  /* login */
  #login{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:var(--bg)}
  .loginbox{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:28px;width:min(360px,90vw);text-align:center}
  .loginbox h1{font-size:18px;margin:0 0 4px}
  .loginbox p{color:var(--muted);font-size:13px;margin:0 0 18px}
  .loginbox input{width:100%;padding:12px 14px;border-radius:12px;border:1px solid var(--line);background:var(--panel2);color:var(--ink);font-size:15px;outline:none}
  .loginbox input:focus{border-color:var(--cyan)}
  .loginbox button{width:100%;margin-top:12px;padding:12px;border-radius:12px;border:0;background:var(--cyan);color:#04222a;font-weight:800;font-size:15px;cursor:pointer}
  .err{color:var(--rose);font-size:12px;min-height:16px;margin-top:10px}
  #dash{display:none}
  .updated{color:var(--sub);font-size:11px;margin-top:18px;text-align:right}
</style>
</head>
<body>
  <div id="login">
    <div class="loginbox">
      <h1>Кошель · Аналитика</h1>
      <p>Введите пароль администратора</p>
      <input id="login-pass" type="password" autocomplete="current-password" placeholder="Пароль" />
      <button id="login-btn">Войти</button>
      <div class="err" id="login-err"></div>
    </div>
  </div>

  <div id="dash" class="wrap">
    <header>
      <div class="brand"><b>Кошель</b> · Аналитика</div>
      <button class="logout" id="logout">Выйти →</button>
    </header>

    <div class="grid">
      <div class="card"><div class="k">Всего пользователей</div><div class="v" id="m-total">—</div><div class="s" id="m-blocked"></div></div>
      <div class="card"><div class="k">Новые сегодня</div><div class="v cyan" id="m-new">—</div><div class="s" id="m-new-sub"></div></div>
      <div class="card"><div class="k">DAU</div><div class="v" id="m-dau">—</div><div class="s">активны сегодня</div></div>
      <div class="card"><div class="k">WAU / MAU</div><div class="v violet" id="m-wamau">—</div><div class="s" id="m-stick"></div></div>
      <div class="card"><div class="k">С операциями</div><div class="v green" id="m-withdata">—</div><div class="s" id="m-withdata-sub"></div></div>
      <div class="card"><div class="k">D1-ретеншн</div><div class="v amber" id="m-ret">—</div><div class="s" id="m-ret-sub"></div></div>
      <div class="card"><div class="k">Рефералы</div><div class="v" id="m-refs">—</div><div class="s">всего приглашений</div></div>
      <div class="card"><div class="k">Геймификация</div><div class="v violet" id="m-xp">—</div><div class="s" id="m-game-sub"></div></div>
    </div>

    <div class="section">Динамика (30 дней)</div>
    <div class="charts">
      <div class="chartbox"><h3>Новые пользователи / день</h3><div id="chart-new"></div></div>
      <div class="chartbox"><h3>DAU / день</h3><div id="chart-dau"></div></div>
    </div>

    <div class="section">Топы</div>
    <div class="tables">
      <div class="chartbox">
        <h3>По XP</h3>
        <table><thead><tr><th>Пользователь</th><th class="r">Ур.</th><th class="r">XP</th><th class="r">Опер.</th></tr></thead><tbody id="top-xp"></tbody></table>
      </div>
      <div class="chartbox">
        <h3>По рефералам</h3>
        <table><thead><tr><th>Пользователь</th><th class="r">Приглашено</th></tr></thead><tbody id="top-refs"></tbody></table>
      </div>
    </div>

    <div class="section">Использование разделов</div>
    <div class="chartbox">
      <div class="subnote">сколько пользователей открывали раздел (охват)</div>
      <div id="sections"></div>
    </div>

    <div class="updated" id="updated"></div>
  </div>

<script>
(function(){
  var KEY='koshel_admin_key';
  var loginEl=document.getElementById('login');
  var dashEl=document.getElementById('dash');
  var errEl=document.getElementById('login-err');
  var passEl=document.getElementById('login-pass');

  function esc(s){ s=String(s==null?'':s); return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function fmt(n){ n=Number(n)||0; return n>=1000 ? (Math.round(n/100)/10)+'к' : String(n); }

  function showLogin(msg){
    loginEl.style.display='flex'; dashEl.style.display='none';
    errEl.textContent=msg||''; passEl.value=''; passEl.focus();
  }
  function showDash(){ loginEl.style.display='none'; dashEl.style.display='block'; }

  function lineChart(values, color){
    if(!values || !values.length) return '<div class="empty">история ещё копится</div>';
    var W=560, H=170, pad=22;
    var max=1, i;
    for(i=0;i<values.length;i++){ if(values[i]>max) max=values[i]; }
    var n=values.length;
    var step = n>1 ? (W-pad*2)/(n-1) : 0;
    var pts='';
    for(i=0;i<n;i++){
      var x=pad+step*i;
      var y=H-pad-(values[i]/max)*(H-pad*2);
      pts+=x.toFixed(1)+','+y.toFixed(1)+' ';
    }
    var dots='';
    for(i=0;i<n;i++){
      var dx=pad+step*i, dy=H-pad-(values[i]/max)*(H-pad*2);
      dots+='<circle cx="'+dx.toFixed(1)+'" cy="'+dy.toFixed(1)+'" r="2" fill="'+color+'"/>';
    }
    return '<svg class="chart" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none">'
      +'<polyline fill="none" stroke="'+color+'" stroke-width="2" stroke-linejoin="round" points="'+pts+'"/>'
      +dots
      +'<text x="'+pad+'" y="14" fill="#5d6885" font-size="11">макс '+max+'</text>'
      +'</svg>';
  }

  function setText(id,v){ var el=document.getElementById(id); if(el) el.textContent=v; }

  function render(d){
    var u=d.users||{}, nu=d.newUsers||{}, ac=d.active||{}, g=d.game||{}, rf=d.referrals||{};
    setText('m-total', u.total);
    setText('m-blocked', 'заблокировали бота: '+(u.blocked||0));
    setText('m-new', nu.today);
    setText('m-new-sub', '7д '+(nu.d7||0)+' · 30д '+(nu.d30||0));
    setText('m-dau', ac.dau);
    setText('m-wamau', (ac.wau||0)+' / '+(ac.mau||0));
    setText('m-stick', 'липкость DAU/MAU: '+(ac.stickiness||0)+'%');
    setText('m-withdata', u.withData);
    setText('m-withdata-sub', (u.withDataPct||0)+'% от всех');
    if(d.retentionD1){ setText('m-ret', d.retentionD1.pct+'%'); setText('m-ret-sub','вернулось '+d.retentionD1.returned+' из '+d.retentionD1.base); }
    else { setText('m-ret','—'); setText('m-ret-sub','мало данных'); }
    setText('m-refs', rf.total);
    setText('m-xp', fmt(g.sumXp)+' XP');
    setText('m-game-sub', 'монет '+fmt(g.sumCoins)+' · ср. ур. '+(g.avgLevel||0));

    var hist=d.history||[];
    var newV=[], dauV=[], i;
    for(i=0;i<hist.length;i++){ newV.push(hist[i]['new']||0); dauV.push(hist[i].dau||0); }
    document.getElementById('chart-new').innerHTML=lineChart(newV,'#22d3ee');
    document.getElementById('chart-dau').innerHTML=lineChart(dauV,'#a78bfa');

    var xp=d.topXp||[], html='';
    for(i=0;i<xp.length;i++){
      var e=xp[i];
      var uname=e.username?'<div class="uname">@'+esc(e.username)+'</div>':'';
      html+='<tr><td><div class="name">'+esc(e.name)+'</div>'+uname+'</td><td class="r">'+(e.level||0)+'</td><td class="r">'+fmt(e.xp)+'</td><td class="r">'+(e.ops||0)+'</td></tr>';
    }
    document.getElementById('top-xp').innerHTML=html||'<tr><td colspan="4" class="empty">нет данных</td></tr>';

    var rfs=d.topRefs||[]; html='';
    for(i=0;i<rfs.length;i++){
      var r=rfs[i];
      var un=r.username?'<div class="uname">@'+esc(r.username)+'</div>':'';
      html+='<tr><td><div class="name">'+esc(r.name)+'</div>'+un+'</td><td class="r">'+(r.refs||0)+'</td></tr>';
    }
    document.getElementById('top-refs').innerHTML=html||'<tr><td colspan="2" class="empty">пока никто не приглашал</td></tr>';

    var secs=d.sections||[], maxU=1;
    for(i=0;i<secs.length;i++){ if(secs[i].users>maxU) maxU=secs[i].users; }
    html='';
    for(i=0;i<secs.length;i++){
      var s=secs[i];
      var w=Math.round((s.users/maxU)*100);
      html+='<div class="bar"><div class="bl">'+esc(s.label)+'</div><div class="bt"><div class="bf" style="width:'+w+'%"></div></div><div class="bn">'+s.users+'</div></div>';
    }
    document.getElementById('sections').innerHTML = secs.length ? '<div class="bars">'+html+'</div>' : '<div class="empty">нет данных</div>';

    var dt=new Date(d.generatedAt||Date.now());
    setText('updated','обновлено '+dt.toLocaleString('ru-RU'));
  }

  function load(){
    var key=sessionStorage.getItem(KEY);
    if(!key){ showLogin(); return; }
    fetch('/admin/stats',{method:'POST',headers:{'X-Admin-Key':key,'Content-Type':'application/json'},body:'{}'})
      .then(function(res){
        if(res.status===403){ sessionStorage.removeItem(KEY); showLogin('Неверный пароль'); return null; }
        if(res.status===429){ showLogin('Слишком много попыток, подождите минуту'); return null; }
        return res.json();
      })
      .then(function(d){ if(d && d.ok){ showDash(); render(d); } })
      .catch(function(){ showLogin('Ошибка сети'); });
  }

  function doLogin(){
    var v=passEl.value.trim();
    if(!v){ errEl.textContent='Введите пароль'; return; }
    sessionStorage.setItem(KEY,v);
    load();
  }

  document.getElementById('login-btn').addEventListener('click',doLogin);
  passEl.addEventListener('keydown',function(e){ if(e.key==='Enter') doLogin(); });
  document.getElementById('logout').addEventListener('click',function(){ sessionStorage.removeItem(KEY); showLogin(); });

  load();
})();
</script>
</body>
</html>`
