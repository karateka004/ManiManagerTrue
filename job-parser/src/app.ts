// Mini App «Работа моя» — весь фронтенд одной строкой (паттерн admin.ts из koshel-worker).
// Vanilla JS + inline CSS, тема из Telegram.WebApp.themeParams, без внешних библиотек.
// API: POST /api/feed | /api/refresh | /api/favs | /api/settings (initData в теле).

export const APP_HTML = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Работа моя</title>
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<style>
  :root{
    --bg:#17212b; --card:#232e3c; --text:#f5f5f5; --hint:#708499;
    --accent:#6ab2f2; --ok:#4fae4e; --warn:#e5a941; --line:#101921;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--bg);color:var(--text);font:15px/1.45 -apple-system,system-ui,Segoe UI,Roboto,sans-serif;
       padding-bottom:calc(64px + env(safe-area-inset-bottom))}
  .top{position:sticky;top:0;z-index:5;background:var(--bg);padding:12px 14px 8px;border-bottom:1px solid var(--line)}
  .row{display:flex;align-items:center;gap:8px}
  h1{font-size:17px;flex:1}
  .sub{color:var(--hint);font-size:12px;margin-top:2px}
  button{font:inherit;border:0;border-radius:10px;cursor:pointer}
  .btn{background:var(--accent);color:#08222f;font-weight:600;padding:8px 14px}
  .btn[disabled]{opacity:.5}
  .chips{display:flex;gap:6px;overflow-x:auto;padding:8px 14px;scrollbar-width:none}
  .chips::-webkit-scrollbar{display:none}
  .chip{flex:0 0 auto;background:var(--card);color:var(--text);padding:6px 12px;border-radius:16px;font-size:13px}
  .chip.on{background:var(--accent);color:#08222f;font-weight:600}
  .search{margin:0 14px 6px;display:flex;gap:6px}
  .search input{flex:1;background:var(--card);border:0;border-radius:10px;padding:9px 12px;color:var(--text);font:inherit}
  .list{padding:6px 14px}
  .card{background:var(--card);border-radius:14px;padding:12px;margin-bottom:10px}
  .t{font-weight:600;font-size:15px}
  .hot{color:var(--warn)}
  .meta{color:var(--hint);font-size:13px;margin-top:2px}
  .money{margin-top:6px;font-weight:600}
  .money.na{color:var(--hint);font-weight:400}
  .tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:7px}
  .tag{background:rgba(255,255,255,.07);border-radius:8px;padding:3px 8px;font-size:12px;color:#cfd8e3}
  .tag.v{background:rgba(79,174,78,.18);color:#8fd58e}
  .duties{color:var(--hint);font-size:13px;margin-top:6px}
  .acts{display:flex;gap:8px;margin-top:10px}
  .acts .open{flex:1;background:var(--accent);color:#08222f;font-weight:600;padding:9px}
  .ico{background:rgba(255,255,255,.08);color:var(--text);padding:9px 12px;border-radius:10px;font-size:15px}
  .ico.on{background:var(--warn);color:#221a04}
  .ico.ap{background:var(--ok);color:#0b2a0b}
  .favby{font-size:12px;color:var(--hint);margin-top:6px}
  .tabs{position:fixed;left:0;right:0;bottom:0;display:flex;background:var(--bg);
        border-top:1px solid var(--line);padding-bottom:env(safe-area-inset-bottom)}
  .tab{flex:1;background:none;color:var(--hint);padding:10px 0 8px;font-size:12px}
  .tab.on{color:var(--accent)}
  .tab .e{display:block;font-size:19px;margin-bottom:2px}
  .empty{color:var(--hint);text-align:center;padding:44px 20px}
  .set{padding:14px}
  .set label{display:block;color:var(--hint);font-size:13px;margin:14px 0 4px}
  .set input{width:100%;background:var(--card);border:0;border-radius:10px;padding:11px 12px;color:var(--text);font:inherit}
  .note{color:var(--hint);font-size:12px;margin-top:14px}
  .toast{position:fixed;left:50%;bottom:76px;transform:translateX(-50%);background:#000c;color:#fff;
         padding:8px 16px;border-radius:12px;font-size:13px;opacity:0;transition:opacity .25s;pointer-events:none;z-index:9}
  .toast.show{opacity:1}
</style>
</head>
<body>
<div class="top">
  <div class="row">
    <h1>💼 Работа моя</h1>
    <button class="btn" id="refresh">Обновить</button>
  </div>
  <div class="sub" id="status">Загрузка…</div>
</div>
<div id="view"></div>
<div class="tabs">
  <button class="tab on" data-tab="feed"><span class="e">📋</span>Лента</button>
  <button class="tab" data-tab="favs"><span class="e">⭐</span>Избранное</button>
  <button class="tab" data-tab="set"><span class="e">⚙️</span>Настройки</button>
</div>
<div class="toast" id="toast"></div>
<script>
(function(){
"use strict";
var tg = window.Telegram && window.Telegram.WebApp;
if (tg) { tg.ready(); tg.expand(); }
var initData = tg ? tg.initData : '';
var S = { feed:[], favs:{}, settings:null, lastRun:null, tab:'feed', cat:'', both:false, q:'' };

function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function toast(m){ var t=document.getElementById('toast'); t.textContent=m; t.classList.add('show');
  setTimeout(function(){ t.classList.remove('show'); }, 2600); }
function api(path, extra){
  var body = Object.assign({ initData: initData }, extra || {});
  return fetch('/api/'+path, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) })
    .then(function(r){ return r.json().then(function(j){ return { ok:r.ok, code:r.status, j:j }; }); });
}
function fmtEur(n){ return String(Math.round(n*10)/10).replace('.',','); }
function ago(iso){
  var m = Math.round((Date.now()-new Date(iso).getTime())/60000);
  if (m<1) return 'только что'; if (m<60) return m+' мин назад';
  var h = Math.round(m/60); if (h<24) return h+' ч назад';
  return Math.round(h/24)+' дн назад';
}

function money(v){
  if (v.hourly==null) return '<div class="money na">💶 ставка не указана</div>';
  var r = v.hourlyMax && v.hourlyMax>v.hourly ? '–'+fmtEur(v.hourlyMax) : '';
  return '<div class="money">💶 €'+fmtEur(v.hourly)+r+'/час</div>';
}
function card(v){
  var fav = S.favs[v.id];
  var loc = [];
  if (v.company) loc.push(esc(v.company));
  if (v.location) loc.push(esc(v.location)+(v.distanceKm!=null?' · ~'+v.distanceKm+' км':''));
  var tags = v.cond.map(function(c){ return '<span class="tag">'+esc(c)+'</span>'; });
  if (v.verdict==='both') tags.unshift('<span class="tag v">👫 обоим</span>');
  else tags.unshift('<span class="tag">👤 '+(v.verdict==='him'?'только 21+':'только 19')+'</span>');
  return '<div class="card">'
    + '<div class="t">'+(v.score>=85?'<span class="hot">🔥</span> ':'')+v.cat.emoji+' '+esc(v.title)+'</div>'
    + (loc.length?'<div class="meta">'+loc.join(' — ')+'</div>':'')
    + '<div class="meta">'+esc(v.cat.label)+' · '+esc(v.source)+' · '+ago(v.at)+'</div>'
    + money(v)
    + '<div class="tags">'+tags.join('')+'</div>'
    + (v.duties.length?'<div class="duties">📝 '+esc(v.duties.join(', '))+'</div>':'')
    + (fav?'<div class="favby">'+(fav.status==='applied'?'✅ откликнулись':'⭐ в избранном')+' — '+esc(fav.by)+'</div>':'')
    + '<div class="acts">'
    +   '<button class="ico'+(fav&&fav.status==='fav'?' on':'')+'" data-fav="'+esc(v.id)+'">⭐</button>'
    +   '<button class="ico'+(fav&&fav.status==='applied'?' ap':'')+'" data-ap="'+esc(v.id)+'">✅</button>'
    +   '<button class="open" data-url="'+esc(v.url)+'">Открыть</button>'
    + '</div></div>';
}

function catChips(items){
  var seen = {}, cats = [];
  items.forEach(function(v){ if(!seen[v.cat.id]){ seen[v.cat.id]=1; cats.push(v.cat); } });
  var h = '<div class="chips">'
    + '<button class="chip'+(S.cat===''?' on':'')+'" data-cat="">Все</button>'
    + '<button class="chip'+(S.both?' on':'')+'" data-both="1">👫 обоим</button>';
  cats.forEach(function(c){ h += '<button class="chip'+(S.cat===c.id?' on':'')+'" data-cat="'+esc(c.id)+'">'+c.emoji+' '+esc(c.label)+'</button>'; });
  return h + '</div>';
}

function filtered(base){
  return base.filter(function(v){
    if (S.cat && v.cat.id!==S.cat) return false;
    if (S.both && v.verdict!=='both') return false;
    if (S.q){ var q=S.q.toLowerCase();
      if ((v.title+' '+(v.company||'')+' '+(v.location||'')).toLowerCase().indexOf(q)<0) return false; }
    return true;
  });
}

function render(){
  var el = document.getElementById('view');
  document.querySelectorAll('.tab').forEach(function(b){ b.classList.toggle('on', b.dataset.tab===S.tab); });
  if (S.tab==='set'){ return renderSettings(el); }
  var base = S.tab==='favs' ? S.feed.filter(function(v){ return S.favs[v.id]; }) : S.feed;
  var list = filtered(base);
  var h = catChips(base)
    + '<div class="search"><input id="q" placeholder="Поиск: слово, компания, город…" value="'+esc(S.q)+'"></div>'
    + '<div class="list">';
  if (!list.length) h += '<div class="empty">'+(S.tab==='favs'?'Пока ничего не сохранено.\\nЖми ⭐ на карточке.':'Пусто. Нажми «Обновить» или подожди автопроверку.')+'</div>';
  else h += list.map(card).join('');
  el.innerHTML = h + '</div>';
  var q = document.getElementById('q');
  q.oninput = function(){ S.q = q.value; renderKeepFocus(); };
}
function renderKeepFocus(){
  var pos = document.getElementById('q').selectionStart;
  render();
  var q = document.getElementById('q'); q.focus(); q.setSelectionRange(pos,pos);
}

function renderSettings(el){
  var s = S.settings || {};
  el.innerHTML = '<div class="set">'
    + '<label>Минимальная ставка, €/час брутто</label><input id="s-rate" type="number" value="'+esc(s.minHourlyEur)+'">'
    + '<label>Радиус от дома, км</label><input id="s-km" type="number" value="'+esc(s.radiusKm)+'">'
    + '<label>Вакансий в одной подборке (3–10)</label><input id="s-max" type="number" value="'+esc(s.maxPerRun)+'">'
    + '<div style="margin-top:18px"><button class="btn" id="s-save">Сохранить</button></div>'
    + '<div class="note">Настройки общие для вас двоих и применяются со следующей проверки. '
    + 'Язык (без нидерландского), полный день и возраст (21/19) заданы жёстко.</div>'
    + '</div>';
  document.getElementById('s-save').onclick = function(){
    var payload = { minHourlyEur:+document.getElementById('s-rate').value,
                    radiusKm:+document.getElementById('s-km').value,
                    maxPerRun:+document.getElementById('s-max').value };
    api('settings', { settings: payload }).then(function(r){
      if (r.ok){ S.settings=r.j.settings; toast('Сохранено ✓'); render(); }
      else toast('Не сохранилось, попробуй ещё раз');
    });
  };
}

function status(){
  var el = document.getElementById('status');
  if (!S.lastRun){ el.textContent = 'Прогонов ещё не было'; return; }
  el.textContent = 'Проверка '+ago(S.lastRun.at)+' · нашёл '+S.lastRun.fetched+' · подошло '+S.lastRun.matched
    + ' · авто раз в 3 ч';
}

function load(){
  return api('feed').then(function(r){
    if (!r.ok){ document.getElementById('status').textContent =
      r.code===403 ? 'Открой приложение через Telegram (кнопка «Меню» у бота)' : 'Ошибка загрузки'; return; }
    S.feed=r.j.feed||[]; S.favs=r.j.favs||{}; S.settings=r.j.settings; S.lastRun=r.j.lastRun;
    status(); render();
  });
}

document.addEventListener('click', function(e){
  var t = e.target.closest('button'); if (!t) return;
  if (t.dataset.tab){ S.tab=t.dataset.tab; render(); return; }
  if (t.dataset.cat!=null){ S.cat=t.dataset.cat===S.cat?'':t.dataset.cat; render(); return; }
  if (t.dataset.both){ S.both=!S.both; render(); return; }
  if (t.dataset.url){ if (tg && tg.openLink) tg.openLink(t.dataset.url); else window.open(t.dataset.url); return; }
  if (t.dataset.fav || t.dataset.ap){
    var id = t.dataset.fav || t.dataset.ap;
    var kind = t.dataset.fav ? 'fav' : 'applied';
    var cur = S.favs[id];
    var next = cur && cur.status===kind ? null : kind; // повторный тап снимает отметку
    api('favs', { id:id, status:next }).then(function(r){
      if (r.ok){ S.favs=r.j.favs; render(); if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light'); }
    });
    return;
  }
  if (t.id==='refresh'){
    t.disabled = true; t.textContent = 'Проверяю…';
    api('refresh').then(function(r){
      t.disabled=false; t.textContent='Обновить';
      if (r.code===429){ toast('⏳ Недавно проверял. Подожди ~'+Math.ceil((r.j.waitS||600)/60)+' мин'); return; }
      if (!r.ok){ toast('Не получилось, попробуй позже'); return; }
      toast(r.j.matched>0 ? 'Нашёл новых: '+r.j.matched+' ✓' : 'Нового ничего нет');
      load();
    });
  }
});

load();
})();
</script>
</body>
</html>`;
