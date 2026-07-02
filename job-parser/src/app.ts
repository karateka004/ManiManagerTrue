// Mini App «Работа моя» — весь фронтенд одной строкой (паттерн admin.ts из koshel-worker).
// Дизайн-язык «Кошеля»: мятный бренд --brand-*, поверхности light/dark, tinted-чипы,
// плитки с атмосферным glow, Manrope, tabular-nums. Правило «Граблей» Кошеля соблюдено:
// контент не прячется за entrance-анимацией (базовая opacity = 1).
// API: POST /api/feed | /api/refresh | /api/favs | /api/settings (initData в теле).

export const APP_HTML = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Работа моя</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap" rel="stylesheet">
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<style>
  :root{
    /* Кошель: light */
    --surface:#FAFBF9; --raised:#FFFFFF; --sunken:#F1F4F0;
    --ink:#0F1A14; --muted:#5E6B62; --subtle:#8A968F;
    --grad-top:#F1FAF5; --grad-bottom:#FAFBF9;
    --brand-100:#DCF2E5; --brand-300:#8FD3AC; --brand-500:#3CA37B; --brand-600:#2D8866; --brand-700:#246E54;
    --income:#3CA37B; --line:rgba(15,26,20,.06);
    --shadow:0 1px 2px rgba(15,26,20,.04), 0 4px 16px rgba(15,26,20,.06);
    --tabbar:rgba(250,251,249,.82);
    color-scheme:light;
  }
  .dark{
    --surface:#0F1A14; --raised:#1A2620; --sunken:#243029;
    --ink:#E8F0EB; --muted:#A8B5AE; --subtle:#7C8A82;
    --grad-top:#0F1A14; --grad-bottom:#0B1410;
    --brand-100:rgba(60,163,123,.16); --brand-300:#8FD3AC; --brand-500:#3CA37B; --brand-600:#2D8866; --brand-700:#246E54;
    --income:#5DB996; --line:rgba(232,240,235,.07);
    --shadow:0 1px 2px rgba(0,0,0,.25), 0 6px 20px rgba(0,0,0,.25);
    --tabbar:rgba(15,26,20,.82);
    color-scheme:dark;
  }
  *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
  html,body{min-height:100%}
  body{
    background:linear-gradient(180deg,var(--grad-top) 0%,var(--grad-bottom) 30%) fixed;
    color:var(--ink);
    font:15px/1.5 Manrope,-apple-system,system-ui,Segoe UI,Roboto,sans-serif;
    padding:calc(10px + env(safe-area-inset-top)) 0 calc(72px + env(safe-area-inset-bottom));
    user-select:none;
  }
  .tabular{font-variant-numeric:tabular-nums}
  button{font:inherit;border:0;cursor:pointer;background:none;color:inherit}
  .wrap{padding:0 14px}

  /* ── Hero (брендовая плитка с glow, как уровень в Кошеле) ── */
  .hero{
    position:relative;overflow:hidden;border-radius:20px;padding:16px;
    background:linear-gradient(135deg,var(--brand-500),var(--brand-700));
    color:#fff;box-shadow:var(--shadow);
  }
  .hero::after{content:'';position:absolute;right:-30px;top:-40px;width:140px;height:140px;
    border-radius:50%;background:rgba(255,255,255,.18);filter:blur(30px)}
  .hero .row{display:flex;align-items:center;gap:10px;position:relative;z-index:1}
  .hero h1{font-size:18px;font-weight:800;flex:1;letter-spacing:-.02em}
  .hero .st{position:relative;z-index:1;margin-top:6px;font-size:12.5px;color:rgba(255,255,255,.85);font-weight:600}
  .refresh{
    background:rgba(255,255,255,.92);color:var(--brand-700);font-weight:800;font-size:13.5px;
    padding:9px 15px;border-radius:999px;transition:transform .12s ease,opacity .2s;
  }
  .refresh:active{transform:scale(.95)}
  .refresh[disabled]{opacity:.6}

  /* ── Чипы ── */
  .chips{display:flex;gap:7px;overflow-x:auto;padding:12px 14px 4px;scrollbar-width:none}
  .chips::-webkit-scrollbar{display:none}
  .chip{
    flex:0 0 auto;padding:7px 13px;border-radius:999px;font-size:13px;font-weight:700;
    background:var(--raised);color:var(--muted);box-shadow:var(--shadow);
    transition:transform .12s ease,background .15s,color .15s;
  }
  .chip:active{transform:scale(.94)}
  /* tinted-акценты (ACCENT_CHIP Кошеля): пастель light / полупрозрачные dark */
  .tint-brand{background:var(--brand-100);color:var(--brand-600)} .dark .tint-brand{color:var(--brand-300)}
  .tint-amber{background:#FEF3C7;color:#D97706} .dark .tint-amber{background:rgba(245,158,11,.15);color:#FCD34D}
  .tint-yellow{background:#FEF9C3;color:#CA8A04} .dark .tint-yellow{background:rgba(234,179,8,.15);color:#FDE047}
  .tint-emerald{background:#D1FAE5;color:#059669} .dark .tint-emerald{background:rgba(16,185,129,.15);color:#6EE7B7}
  .tint-rose{background:#FFE4E6;color:#E11D48} .dark .tint-rose{background:rgba(244,63,94,.15);color:#FDA4AF}
  .tint-violet{background:#EDE9FE;color:#7C3AED} .dark .tint-violet{background:rgba(139,92,246,.15);color:#C4B5FD}
  .tint-orange{background:#FFEDD5;color:#EA580C} .dark .tint-orange{background:rgba(249,115,22,.15);color:#FDBA74}
  .tint-blue{background:#DBEAFE;color:#2563EB} .dark .tint-blue{background:rgba(59,130,246,.15);color:#93C5FD}
  .tint-slate{background:#E8ECE9;color:#5E6B62} .dark .tint-slate{background:rgba(148,163,184,.14);color:#CBD5E1}
  /* активный чип — заливка акцентом */
  .chip.on.tint-brand{background:var(--brand-500);color:#fff}
  .chip.on.tint-amber{background:#F59E0B;color:#221a04}
  .chip.on.tint-yellow{background:#EAB308;color:#221f04}
  .chip.on.tint-emerald{background:#10B981;color:#04231a}
  .chip.on.tint-rose{background:#F43F5E;color:#fff}
  .chip.on.tint-violet{background:#8B5CF6;color:#fff}
  .chip.on.tint-orange{background:#F97316;color:#fff}
  .chip.on.tint-blue{background:#3B82F6;color:#fff}
  .chip.on.tint-slate{background:#64748B;color:#fff}
  .chip.on{box-shadow:var(--shadow)}

  .search{margin:8px 14px 2px}
  .search input{
    width:100%;background:var(--sunken);border:0;border-radius:14px;padding:11px 14px;
    color:var(--ink);font:inherit;font-weight:600;outline:none;
  }
  .search input::placeholder{color:var(--subtle);font-weight:500}

  /* ── Карточки ── */
  .list{padding:10px 14px 4px}
  .card{
    background:var(--raised);border-radius:18px;padding:13px;margin-bottom:10px;
    box-shadow:var(--shadow);animation:enter .3s ease both;
  }
  @keyframes enter{from{transform:translateY(6px)}to{transform:translateY(0)}}
  .head{display:flex;gap:10px;align-items:flex-start}
  .cat{
    flex:0 0 40px;width:40px;height:40px;border-radius:13px;display:flex;align-items:center;
    justify-content:center;font-size:20px;
  }
  .tt{flex:1;min-width:0}
  .t{font-weight:800;font-size:15px;letter-spacing:-.01em}
  .hot{color:#F59E0B}
  .meta{color:var(--subtle);font-size:12.5px;margin-top:2px;font-weight:600}
  .money{margin-top:9px;font-weight:800;font-size:17px;color:var(--income);letter-spacing:-.01em}
  .money small{font-size:12.5px;font-weight:700;color:var(--muted)}
  .money.na{font-size:13px;color:var(--subtle);font-weight:600}
  .tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}
  .tag{background:var(--sunken);border-radius:9px;padding:3.5px 9px;font-size:12px;font-weight:600;color:var(--muted)}
  .tag.v{background:var(--brand-100);color:var(--brand-600)} .dark .tag.v{color:var(--brand-300)}
  .duties{color:var(--muted);font-size:13px;margin-top:7px}
  .favby{font-size:12px;color:var(--subtle);margin-top:7px;font-weight:600}
  .acts{display:flex;gap:8px;margin-top:11px}
  .open{
    flex:1;background:var(--brand-500);color:#fff;font-weight:800;padding:10px;border-radius:13px;
    font-size:14px;transition:transform .12s ease;
  }
  .open:active{transform:scale(.97)}
  .ico{
    width:44px;padding:10px 0;border-radius:13px;font-size:16px;text-align:center;
    transition:transform .12s ease;
  }
  .ico:active{transform:scale(.9)}
  .ico.fav{background:#FEF3C7;color:#D97706} .dark .ico.fav{background:rgba(245,158,11,.15)}
  .ico.fav.on{background:#F59E0B}
  .ico.ap{background:#D1FAE5} .dark .ico.ap{background:rgba(16,185,129,.15)}
  .ico.ap.on{background:#10B981}

  /* ── Пустое состояние / skeleton ── */
  .empty{color:var(--subtle);text-align:center;padding:48px 24px;font-weight:600}
  .empty .e{display:block;font-size:40px;margin-bottom:10px}
  .sk{height:118px;border-radius:18px;margin-bottom:10px;background:
    linear-gradient(100deg,var(--raised) 40%,var(--sunken) 50%,var(--raised) 60%);
    background-size:200% 100%;animation:sh 1.2s infinite}
  @keyframes sh{to{background-position:-200% 0}}

  /* ── Таб-бар (blur, как в Кошеле) ── */
  .tabs{
    position:fixed;left:0;right:0;bottom:0;display:flex;z-index:10;
    background:var(--tabbar);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);
    border-top:1px solid var(--line);padding-bottom:env(safe-area-inset-bottom);
  }
  .tab{flex:1;color:var(--subtle);padding:9px 0 7px;font-size:11.5px;font-weight:700;position:relative}
  .tab .e{display:block;font-size:20px;margin-bottom:1px;transition:transform .15s ease}
  .tab.on{color:var(--brand-600)} .dark .tab.on{color:var(--brand-300)}
  .tab.on .e{transform:translateY(-1px) scale(1.08)}
  .badge{
    position:absolute;top:4px;left:calc(50% + 8px);min-width:17px;height:17px;border-radius:9px;
    background:var(--brand-500);color:#fff;font-size:10.5px;font-weight:800;line-height:17px;padding:0 4px;
  }

  /* ── Настройки ── */
  .set{padding:14px}
  .srow{background:var(--raised);border-radius:16px;padding:13px 14px;margin-bottom:10px;box-shadow:var(--shadow)}
  .srow label{display:block;color:var(--muted);font-size:12.5px;font-weight:700;margin-bottom:7px}
  .srow input{
    width:100%;background:var(--sunken);border:0;border-radius:12px;padding:11px 12px;
    color:var(--ink);font:inherit;font-weight:700;outline:none;
  }
  .save{width:100%;background:var(--brand-500);color:#fff;font-weight:800;padding:13px;border-radius:14px;margin-top:6px}
  .save:active{transform:scale(.98)}
  .note{color:var(--subtle);font-size:12.5px;margin-top:14px;line-height:1.5}

  .toast{
    position:fixed;left:50%;bottom:calc(84px + env(safe-area-inset-bottom));transform:translateX(-50%);
    background:rgba(15,26,20,.88);backdrop-filter:blur(8px);color:#fff;padding:9px 18px;border-radius:999px;
    font-size:13px;font-weight:700;opacity:0;transition:opacity .25s;pointer-events:none;z-index:20;white-space:nowrap;
  }
  .toast.show{opacity:1}
</style>
</head>
<body>
<div class="wrap">
  <div class="hero">
    <div class="row">
      <h1>💼 Работа моя</h1>
      <button class="refresh" id="refresh">Обновить</button>
    </div>
    <div class="st" id="status">Загрузка…</div>
  </div>
</div>
<div id="view"></div>
<div class="tabs">
  <button class="tab on" data-tab="feed"><span class="e">📋</span>Лента</button>
  <button class="tab" data-tab="favs" id="tab-favs"><span class="e">⭐</span>Избранное</button>
  <button class="tab" data-tab="set"><span class="e">⚙️</span>Настройки</button>
</div>
<div class="toast" id="toast"></div>
<script>
(function(){
"use strict";
var tg = window.Telegram && window.Telegram.WebApp;
function applyTheme(){
  var dark = tg ? tg.colorScheme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', dark);
  if (tg && tg.setHeaderColor) try { tg.setHeaderColor(dark ? '#0F1A14' : '#F1FAF5'); } catch(e){}
}
if (tg) { tg.ready(); tg.expand(); tg.onEvent('themeChanged', applyTheme); }
applyTheme();
var initData = tg ? tg.initData : '';
var S = { feed:[], favs:{}, settings:null, lastRun:null, tab:'feed', cat:'', both:false, q:'', loading:true };

// Акцент категории (дизайн-словарь как ACCENT_CHIP Кошеля)
var ACC = { warehouse:'brand', delivery:'amber', production:'violet', cleaning:'emerald',
            horeca:'rose', retail:'yellow', construction:'orange', office:'blue', other:'slate' };
function acc(id){ return 'tint-' + (ACC[id] || 'slate'); }

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
  if (v.hourly==null) return '<div class="money na">💶 ставка не указана — спросить</div>';
  var r = v.hourlyMax && v.hourlyMax>v.hourly ? '–'+fmtEur(v.hourlyMax) : '';
  return '<div class="money tabular">€'+fmtEur(v.hourly)+r+' <small>/час брутто</small></div>';
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
    + '<div class="head">'
    +   '<div class="cat '+acc(v.cat.id)+'">'+v.cat.emoji+'</div>'
    +   '<div class="tt">'
    +     '<div class="t">'+(v.score>=85?'<span class="hot">🔥</span> ':'')+esc(v.title)+'</div>'
    +     (loc.length?'<div class="meta">'+loc.join(' — ')+'</div>':'')
    +     '<div class="meta">'+esc(v.cat.label)+' · '+esc(v.source)+' · '+ago(v.at)+'</div>'
    +   '</div>'
    + '</div>'
    + money(v)
    + '<div class="tags">'+tags.join('')+'</div>'
    + (v.duties.length?'<div class="duties">📝 '+esc(v.duties.join(', '))+'</div>':'')
    + (fav?'<div class="favby">'+(fav.status==='applied'?'✅ откликнулись':'⭐ в избранном')+' — '+esc(fav.by)+'</div>':'')
    + '<div class="acts">'
    +   '<button class="ico fav'+(fav&&fav.status==='fav'?' on':'')+'" data-fav="'+esc(v.id)+'">⭐</button>'
    +   '<button class="ico ap'+(fav&&fav.status==='applied'?' on':'')+'" data-ap="'+esc(v.id)+'">✅</button>'
    +   '<button class="open" data-url="'+esc(v.url)+'">Открыть</button>'
    + '</div></div>';
}

function catChips(items){
  var seen = {}, cats = [];
  items.forEach(function(v){ if(!seen[v.cat.id]){ seen[v.cat.id]=1; cats.push(v.cat); } });
  var h = '<div class="chips">'
    + '<button class="chip tint-slate'+(S.cat===''&&!S.both?' on':'')+'" data-cat="">Все</button>'
    + '<button class="chip tint-brand'+(S.both?' on':'')+'" data-both="1">👫 обоим</button>';
  cats.forEach(function(c){
    h += '<button class="chip '+acc(c.id)+(S.cat===c.id?' on':'')+'" data-cat="'+esc(c.id)+'">'+c.emoji+' '+esc(c.label)+'</button>';
  });
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

function favCount(){ return S.feed.filter(function(v){ return S.favs[v.id]; }).length; }
function badge(){
  var n = favCount();
  var el = document.getElementById('tab-favs');
  var b = el.querySelector('.badge');
  if (n>0){ if(!b){ b=document.createElement('span'); b.className='badge'; el.appendChild(b);} b.textContent=n; }
  else if (b) b.remove();
}

function render(){
  var el = document.getElementById('view');
  document.querySelectorAll('.tab').forEach(function(b){ b.classList.toggle('on', b.dataset.tab===S.tab); });
  badge();
  if (S.tab==='set'){ return renderSettings(el); }
  if (S.loading){
    el.innerHTML = '<div class="list"><div class="sk"></div><div class="sk"></div><div class="sk"></div></div>';
    return;
  }
  var base = S.tab==='favs' ? S.feed.filter(function(v){ return S.favs[v.id]; }) : S.feed;
  var list = filtered(base);
  var h = catChips(base)
    + '<div class="search"><input id="q" placeholder="Поиск: слово, компания, город…" value="'+esc(S.q)+'"></div>'
    + '<div class="list">';
  if (!list.length) h += '<div class="empty"><span class="e">'+(S.tab==='favs'?'⭐':'🌿')+'</span>'
    + (S.tab==='favs'?'Пока пусто.<br>Жми ⭐ на карточке — сохранится сюда для вас двоих.':'Ничего не нашлось.<br>Сбрось фильтры или нажми «Обновить».')+'</div>';
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
    + '<div class="srow"><label>💶 Минимальная ставка, €/час брутто</label><input id="s-rate" type="number" value="'+esc(s.minHourlyEur)+'"></div>'
    + '<div class="srow"><label>🚗 Радиус от дома, км</label><input id="s-km" type="number" value="'+esc(s.radiusKm)+'"></div>'
    + '<div class="srow"><label>📬 Вакансий в одной подборке (3–10)</label><input id="s-max" type="number" value="'+esc(s.maxPerRun)+'"></div>'
    + '<button class="save" id="s-save">Сохранить</button>'
    + '<div class="note">Настройки общие для вас двоих, применяются со следующей проверки. '
    + 'Полный день, «без нидерландского» и возраст (21/19) заданы жёстко.</div>'
    + '</div>';
  document.getElementById('s-save').onclick = function(){
    var payload = { minHourlyEur:+document.getElementById('s-rate').value,
                    radiusKm:+document.getElementById('s-km').value,
                    maxPerRun:+document.getElementById('s-max').value };
    api('settings', { settings: payload }).then(function(r){
      if (r.ok){ S.settings=r.j.settings; toast('Сохранено ✓'); render();
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success'); }
      else toast('Не сохранилось, попробуй ещё раз');
    });
  };
}

function status(){
  var el = document.getElementById('status');
  if (!S.lastRun){ el.textContent = 'Прогонов ещё не было'; return; }
  el.textContent = 'Проверка '+ago(S.lastRun.at)+' · нашёл '+S.lastRun.fetched+' · подошло '+S.lastRun.matched+' · авто раз в 3 ч';
}

function load(){
  return api('feed').then(function(r){
    S.loading = false;
    if (!r.ok){ document.getElementById('status').textContent =
      r.code===403 ? 'Открой через Telegram (кнопка у бота)' : 'Ошибка загрузки'; render(); return; }
    S.feed=r.j.feed||[]; S.favs=r.j.favs||{}; S.settings=r.j.settings; S.lastRun=r.j.lastRun;
    status(); render();
  });
}

document.addEventListener('click', function(e){
  var t = e.target.closest('button'); if (!t) return;
  if (t.dataset.tab){ S.tab=t.dataset.tab; render(); return; }
  if (t.dataset.both){ S.both=!S.both; render(); return; }
  if (t.dataset.cat!=null){ S.cat=t.dataset.cat===S.cat?'':t.dataset.cat; if(t.dataset.cat==='')S.both=false; render(); return; }
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
      toast(r.j.matched>0 ? '🌿 Нашёл новых: '+r.j.matched : 'Нового ничего нет');
      load();
    });
  }
});

load();
})();
</script>
</body>
</html>`;
