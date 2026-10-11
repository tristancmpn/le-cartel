import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.1/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, VAPID_PUBLIC_KEY } from './config.js?v=2'; // incrémenter ?v= (ici et dans index.html) à chaque mise à jour

// ---------- Utilitaires de dates ----------
const DAY = 864e5;
const now = () => new Date();
function sod(d){const x=new Date(d);x.setHours(0,0,0,0);return x}
function sow(d){const x=sod(d);x.setDate(x.getDate()-((x.getDay()+6)%7));return x}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
const ymd = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const weekStart = () => ymd(sow(now()));
const fmtDay = d => d.toLocaleDateString('fr-FR',{weekday:'long', day:'numeric', month:'long'});
const fmtShort = d => d.toLocaleDateString('fr-FR',{day:'numeric', month:'short'});
const hm = d => d.toLocaleTimeString('fr-FR',{hour:'2-digit', minute:'2-digit'});
function ago(d){
  const n = now(), m = Math.round((n - d)/6e4);
  if(m < 1) return "à l'instant";
  if(m < 60) return `il y a ${m} min`;
  if(+sod(d) === +sod(n)) return `il y a ${Math.round(m/60)} h`;
  if(+sod(d) === +sod(addDays(n,-1))) return `hier à ${hm(d)}`;
  if(n - d < 6*DAY) return `${d.toLocaleDateString('fr-FR',{weekday:'long'})} à ${hm(d)}`;
  return fmtShort(d);
}
function isoWeek(d){const t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));const day=t.getUTCDay()||7;t.setUTCDate(t.getUTCDate()+4-day);const y=new Date(Date.UTC(t.getUTCFullYear(),0,1));return Math.ceil(((t-y)/DAY+1)/7)}
function weekLabel(s){const e=addDays(s,6);return `Semaine ${isoWeek(s)} · ${s.getDate()}${s.getMonth()!==e.getMonth()?' '+fmtShort(s).split(' ')[1]:''} – ${fmtShort(e)}`}
function range(p, off){
  const n=now(), y=n.getFullYear(), mo=n.getMonth();
  if(p==='jour'){const s=addDays(sod(n),off);return {s,e:addDays(s,1),label:off===0?"Aujourd'hui":off===-1?'Hier':fmtDay(s)}}
  if(p==='semaine'){const s=addDays(sow(n),7*off);return {s,e:addDays(s,7),label:weekLabel(s)}}
  if(p==='mois'){const s=new Date(y,mo+off,1);return {s,e:new Date(y,mo+off+1,1),label:s.toLocaleDateString('fr-FR',{month:'long',year:'numeric'})}}
  if(p==='annee'){const s=new Date(y+off,0,1);return {s,e:new Date(y+off+1,0,1),label:String(y+off)}}
  return {s:new Date(0), e:new Date(8.64e15), label:'Depuis le début'};
}
const inR = (ts, r) => ts >= r.s && ts < r.e;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uuid = () => crypto.randomUUID();
const ls = {
  get(k){try{return localStorage.getItem(k)}catch{return null}},
  set(k,v){try{v==null?localStorage.removeItem(k):localStorage.setItem(k,v)}catch{}},
};

// ---------- État ----------
const EMOJIS = ['🦊','🐢','🐙','🌵','🍋','🐝','🦉','🍄','🐻','🦁','🐸','🍕'];
const COLORS = ['--m1','--m2','--m3','--m4','--m5','--m6'];
const DEFAULT_NOTIF = {mine:true, mineHour:'18:00', mineFreq:'jour', monday:true, midweek:true, midDay:'mercredi', stolen:true, open:true};

const S = {
  me: ls.get('cartel.me'),
  tab: ls.get('cartel.tab') || 'home',
  period: 'semaine', off: 0,
  sheet: null, confirm: null, banner: true, ready: false,
  members: [], daily: [], catalogue: [], week: [], weekDone: [], logs: [],
  push: 'unknown',
};

const M = id => S.members.find(m => m.id === id) || {id, name:'Ancien coloc', emoji:'👻', color:'--m6'};
const T = id => S.daily.find(t => t.id === id);
const me = () => S.members.find(m => m.id === S.me && m.active);
const notif = () => ({...DEFAULT_NOTIF, ...(me()?.notif || {})});
const activeMembers = () => S.members.filter(m => m.active);
const activeDaily = () => S.daily.filter(t => !t.archived).sort((a,b)=>a.position-b.position);
const av = (id, sm) => {const m=M(id);return `<span class="av${sm?' sm':''}" style="--c:var(${m.color})" title="${esc(m.name)}" aria-hidden="true">${esc(m.emoji)}</span>`};
const names = ids => ids.map(i => M(i).name).join(' et ');

// ---------- Supabase ----------
// window.__cartelTestClient : fausse base utilisée uniquement par tools/dev.html
const configured = !!(window.__cartelTestClient || (SUPABASE_URL && SUPABASE_ANON_KEY));
const sb = window.__cartelTestClient || (configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null);

async function fetchAll(table, select, build){
  const out = [];
  for(let from=0;;from+=1000){
    let q = sb.from(table).select(select).range(from, from+999);
    if(build) q = build(q);
    const {data, error} = await q;
    if(error) throw error;
    out.push(...data);
    if(data.length < 1000) return out;
  }
}
const mapLog = r => ({id:r.id, task:r.task_id, by:r.member_id, ts:new Date(r.done_at)});
const mapWeek = r => ({id:r.id, name:r.name, members:r.members||[], late:r.late, done: r.done_at ? {by:r.done_by||[], ts:new Date(r.done_at)} : null});

const LOADERS = {
  members:     async () => { S.members   = await fetchAll('members','*', q=>q.order('created_at')); },
  daily_tasks: async () => { S.daily     = await fetchAll('daily_tasks','*'); },
  catalogue:   async () => { S.catalogue = await fetchAll('catalogue','*', q=>q.order('position').order('created_at')); },
  daily_logs:  async () => { S.logs      = (await fetchAll('daily_logs','id,task_id,member_id,done_at', q=>q.order('done_at'))).map(mapLog); },
  week_tasks:  async () => {
    const ws = weekStart();
    const [cur, done] = await Promise.all([
      fetchAll('week_tasks','*', q=>q.eq('week_start', ws).order('created_at')),
      fetchAll('week_tasks','name,done_by,done_at', q=>q.not('done_at','is',null)),
    ]);
    S.week = cur.map(mapWeek);
    S.weekDone = done.map(r => ({name:r.name, by:r.done_by||[], ts:new Date(r.done_at)}));
  },
};
let loadedWeek = null;
async function loadAll(){
  loadedWeek = weekStart();
  await sb.rpc('rollover_week', {p_week: loadedWeek});
  await Promise.all(Object.values(LOADERS).map(f => f()));
}

// Rafraîchissement en direct quand un autre téléphone modifie quelque chose
const pending = new Set(); let reloadTimer;
function scheduleReload(table){
  pending.add(table); clearTimeout(reloadTimer);
  reloadTimer = setTimeout(async () => {
    const tables = [...pending]; pending.clear();
    try { await Promise.all(tables.map(t => LOADERS[t]?.())); render(); } catch(e){ console.error(e) }
  }, 400);
}
function subscribeRealtime(){
  sb.channel('cartel').on('postgres_changes', {event:'*', schema:'public'}, p => scheduleReload(p.table)).subscribe();
}

// Exécute une écriture ; en cas d'échec, prévient et recharge l'état réel.
async function db(promise){
  const {error} = await promise;
  if(error){
    console.error(error);
    toast("Ça n'a pas été enregistré. Vérifie ta connexion et réessaie.");
    try{ await loadAll(); }catch{}
    render();
    return false;
  }
  return true;
}

// ---------- Logo ----------
const LOGO = (()=>{
  const bottle = cx => h => `<path d="M${cx-5} 163V${163-h+10}q0-5 3-7V${163-h}h4v3q3 2 3 7V163z" fill="currentColor"/>`;
  return `<svg viewBox="0 0 200 170" role="img" aria-label="Le Cartel, 10|04">
    <path d="M100 5L195 165H5Z" fill="none" stroke="currentColor" stroke-width="3"/>
    <line x1="88" y1="47" x2="112" y2="47" stroke="currentColor" stroke-width="1.2"/>
    <text x="100" y="67" text-anchor="middle" font-family="Bodoni Moda, Didot, Georgia, serif" font-size="19" letter-spacing="5" fill="currentColor">LE</text>
    <rect x="8" y="73" width="184" height="34" style="fill:var(--bg)"/>
    <text x="100" y="102" text-anchor="middle" font-family="Bodoni Moda, Didot, Georgia, serif" font-weight="500" fill="currentColor" textLength="180" lengthAdjust="spacingAndGlyphs"><tspan font-size="40">C</tspan><tspan font-size="31">ARTE</tspan><tspan font-size="40">L</tspan></text>
    <line x1="58" y1="113" x2="94" y2="113" stroke="currentColor" stroke-width="1.2"/><line x1="106" y1="113" x2="142" y2="113" stroke="currentColor" stroke-width="1.2"/>
    <path d="M100 109l4 4-4 4-4-4z" fill="currentColor"/>
    <text x="100" y="133" text-anchor="middle" font-family="Bodoni Moda, Didot, Georgia, serif" font-size="13" letter-spacing="2" fill="currentColor">10|04</text>
    ${bottle(87)(22)}${bottle(100)(27)}${bottle(113)(22)}
  </svg>`;
})();

const IC = {
  home:'<svg viewBox="0 0 24 24"><path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z"/></svg>',
  daily:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/></svg>',
  week:'<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4M8.5 14.5l2 2 4-4"/></svg>',
  stats:'<svg viewBox="0 0 24 24"><path d="M4 5h16M4 10h16M4 15h16M4 20h16M10 5v15"/></svg>',
  set:'<svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
};
const TABS = [['home','Accueil'],['daily','Quotidien'],['week','Semaine'],['stats','Stats'],['set','Réglages']];

// ---------- Vues ----------
function vHome(){
  const mine = S.week.filter(w => !w.done && w.members.includes(S.me));
  const free = S.week.filter(w => !w.done && !w.members.length);
  const done = S.week.filter(w => w.done).length;
  const recent = [...S.logs].sort((a,b)=>b.ts-a.ts).slice(0,6);
  const showBanner = notif().open && S.banner && mine.length;
  return `
  <header class="brand">${LOGO}<div class="grow"><p class="eyebrow">${esc(fmtDay(now()))}</p><h1>Salut ${esc(me().name)}</h1></div>
    <button data-a="sheet:who" aria-label="Changer d'utilisateur">${av(S.me)}</button></header>

  ${showBanner?`<div class="banner"><span class="grow">Tu as ${mine.length} tâche${mine.length>1?'s':''} à faire cette semaine.</span><button data-a="hideBanner" aria-label="Masquer">×</button></div>`:''}

  <section class="sec">
    <div class="sec-h"><h2>Mes tâches de la semaine</h2><button class="link" data-a="tab:week">Tout voir</button></div>
    <div class="list">${mine.length ? mine.map(w=>`
      <div class="row"><div class="grow"><div class="title">${esc(w.name)}</div>
        <div class="sub">${w.late?'<span class="chip late">En retard</span> ':''}${w.members.length>1?'Avec '+esc(names(w.members.filter(x=>x!==S.me))):'Seul'}</div></div>
        <button class="btn pri" data-a="wDone:${w.id}">C'est fait</button></div>`).join('')
      : `<div class="empty">Rien de prévu pour toi.${free.length?' Il reste des tâches à prendre.':''}</div>`}
    </div>
  </section>

  <div class="summary">
    <div><b>${free.length}</b><span>pas encore prises</span></div>
    <div><b>${S.week.length-done-free.length}</b><span>en cours</span></div>
    <div><b>${done}/${S.week.length}</b><span>faites</span></div>
  </div>

  <section class="sec">
    <div class="sec-h"><h2>Quotidien</h2><button class="link" data-a="tab:daily">Détails</button></div>
    <div class="list">${activeDaily().map(rowDaily).join('') || '<div class="empty">Aucune tâche quotidienne. Ajoute-en dans Réglages.</div>'}</div>
  </section>

  <section class="sec feed">
    <div class="sec-h"><h2>Activité récente</h2></div>
    <div class="list">${recent.map(l=>`
      <div class="row">${av(l.by,1)}<div class="grow small"><b>${esc(M(l.by).name)}</b> · ${esc(T(l.task)?.name||'Tâche supprimée')}</div><span class="small muted">${ago(l.ts)}</span></div>`).join('') || '<div class="empty">Rien pour l\'instant.</div>'}
    </div>
  </section>`;
}

function rowDaily(t){
  const logs = S.logs.filter(l=>l.task===t.id);
  const last = logs.length ? logs.reduce((a,b)=>b.ts>a.ts?b:a) : null;
  const wk = range('semaine',0);
  const mine = logs.filter(l=>l.by===S.me && inR(l.ts,wk)).length;
  return `<div class="row">
    <button class="grow tap" data-a="openTask:${t.id}">
      <div class="title">${esc(t.name)}</div>
      <div class="sub">${last?`${esc(M(last.by).name)}, ${ago(last.ts)}`:'Jamais faite'} · moi <span class="num">${mine}</span> cette sem.</div>
    </button>
    <button class="plus" data-a="plus:${t.id}" aria-label="J'ai fait : ${esc(t.name)}">Fait</button>
  </div>`;
}

function vDaily(){
  return `
  <header class="top"><div><p class="eyebrow">Chacun note ce qu'il fait</p><h1>Quotidien</h1></div></header>
  <section class="sec">
    <div class="list">${activeDaily().map(rowDaily).join('') || '<div class="empty">Aucune tâche quotidienne.</div>'}</div>
    <p class="small muted">Touche le nom d'une tâche pour voir qui l'a faite et corriger un oubli.</p>
  </section>
  <section class="sec">
    <div class="sec-h"><h2>Cette semaine</h2></div>
    ${tableDaily(range('semaine',0))}
  </section>
  <button class="btn full" data-a="sheet:manageDaily">Ajouter ou supprimer des tâches</button>`;
}

function wCard(w){
  const inMe = w.members.includes(S.me);
  let status, acts = '';
  if(w.done){
    status = `<span class="chip ok">Faite par ${esc(names(w.done.by))} · ${w.done.ts.toLocaleDateString('fr-FR',{weekday:'short'})}</span>`;
    if(w.done.by.includes(S.me)) acts = `<button class="btn ghost" data-a="wUndo:${w.id}">Annuler</button>`;
  } else if(!w.members.length){
    status = `<span class="chip free">Personne</span>`;
    acts = `<button class="btn pri" data-a="wTake:${w.id}">Je prends</button>`
      + (S.confirm===`wDel:${w.id}`
        ? `<span class="confirm">Retirer de la semaine ?<button class="btn danger" data-a="wDelete:${w.id}">Retirer</button><button class="btn ghost" data-a="confirm:">Non</button></span>`
        : `<button class="btn ghost" data-a="confirm:wDel:${w.id}">Retirer</button>`);
  } else if(inMe){
    status = `<span class="chip">${w.members.length>1?'Toi et '+esc(names(w.members.filter(x=>x!==S.me))):'Toi'}</span>`;
    acts = `<button class="btn pri" data-a="wDone:${w.id}">C'est fait</button><button class="btn" data-a="wLeave:${w.id}">Me retirer</button>`;
  } else {
    status = `<span class="chip">${esc(names(w.members))}</span>`;
    acts = `<button class="btn" data-a="wJoin:${w.id}">Rejoindre</button><button class="btn" data-a="wSteal:${w.id}">Reprendre</button><button class="btn" data-a="wSteal2:${w.id}">Je l'ai faite</button>`;
  }
  const people = w.done ? w.done.by : w.members;
  return `<div class="wcard${w.done?' done':''}">
    <div class="head"><div style="flex:1;min-width:0">
      <div class="title">${esc(w.name)}</div>
      <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:6px">${w.late?'<span class="chip late">Reportée</span>':''}${status}</div>
    </div>${people.length?`<div class="stack">${people.map(p=>av(p)).join('')}</div>`:''}</div>
    ${acts?`<div class="actions">${acts}</div>`:''}
  </div>`;
}

function vWeek(){
  const order = w => w.done ? 3 : !w.members.length ? 0 : w.members.includes(S.me) ? 1 : 2;
  const sorted = [...S.week].sort((a,b)=>order(a)-order(b));
  return `
  <header class="top"><div><p class="eyebrow">${esc(weekLabel(sow(now())))}</p><h1>Grosses tâches</h1></div></header>
  <section class="sec"><div class="list">${sorted.map(wCard).join('') || '<div class="empty">Aucune tâche cette semaine. Ajoute celles à faire.</div>'}</div></section>
  <button class="btn full pri" data-a="sheet:addWeek">Ajouter des tâches à la semaine</button>
  <p class="note">Les tâches pas faites dimanche soir passent à la semaine suivante avec la mention « reportée ».</p>`;
}

function seg(){
  const P = [['jour','Jour'],['semaine','Semaine'],['last','Sem. passée'],['mois','Mois'],['annee','Année'],['tout','Tout']];
  const cur = S.period==='semaine' && S.off===-1 ? 'last' : S.period;
  const r = range(S.period, S.off);
  return `<div class="seg" role="group" aria-label="Période">${P.map(([k,l])=>`<button aria-pressed="${cur===k}" data-a="period:${k}">${l}</button>`).join('')}</div>
  ${S.period!=='tout'?`<div class="pager"><button data-a="off:-1" aria-label="Période précédente">‹</button><span class="lbl">${esc(r.label)}</span><button data-a="off:1" aria-label="Période suivante" ${S.off>=0?'disabled':''}>›</button></div>`:''}`;
}

function tableDaily(r){
  const logs = S.logs.filter(l=>inR(l.ts,r));
  const used = new Set(logs.map(l=>l.task));
  const cols = [...activeDaily(), ...S.daily.filter(t=>t.archived && used.has(t.id))];
  const people = new Set([...activeMembers().map(m=>m.id), ...logs.map(l=>l.by)]);
  const rows = [...people].map(id=>{
    const c = cols.map(t=>logs.filter(l=>l.by===id && l.task===t.id).length);
    return {id, c, tot:c.reduce((a,b)=>a+b,0)};
  }).sort((a,b)=>b.tot-a.tot);
  return `<div class="tbl-wrap"><table>
    <thead><tr><th>Coloc</th>${cols.map(t=>`<th>${esc(t.short)}</th>`).join('')}<th>Total</th></tr></thead>
    <tbody>${rows.map(x=>`<tr${x.id===S.me?' class="me"':''}><td><span class="who">${av(x.id,1)}${esc(M(x.id).name)}</span></td>${x.c.map(v=>`<td class="n${v?'':' zero'}">${v}</td>`).join('')}<td class="n tot">${x.tot}</td></tr>`).join('')}</tbody>
  </table></div>`;
}

function tableWeekly(r){
  const all = S.weekDone.filter(h=>inR(h.ts,r));
  const people = new Set([...activeMembers().map(m=>m.id), ...all.flatMap(h=>h.by)]);
  const rows = [...people].map(id=>{
    const mine = all.filter(h=>h.by.includes(id));
    const top = Object.entries(mine.reduce((o,h)=>(o[h.name]=(o[h.name]||0)+1,o),{})).sort((a,b)=>b[1]-a[1])[0];
    return {id, n:mine.length, top: top ? top[0] : '–'};
  }).sort((a,b)=>b.n-a.n);
  return `<div class="tbl-wrap"><table>
    <thead><tr><th>Coloc</th><th>Faites</th><th>La plus faite</th></tr></thead>
    <tbody>${rows.map(x=>`<tr${x.id===S.me?' class="me"':''}><td><span class="who">${av(x.id,1)}${esc(M(x.id).name)}</span></td><td class="n tot${x.n?'':' zero'}">${x.n}</td><td>${esc(x.top)}</td></tr>`).join('')}</tbody>
  </table></div>`;
}

function vStats(){
  const r = range(S.period, S.off);
  return `
  <header class="top"><div><p class="eyebrow">Trié par celui qui en a fait le plus</p><h1>Stats</h1></div></header>
  <div class="sec">${seg()}</div>
  <section class="sec"><div class="sec-h"><h2>Tâches quotidiennes</h2></div>${tableDaily(r)}</section>
  <section class="sec"><div class="sec-h"><h2>Grosses tâches</h2></div>${tableWeekly(r)}</section>`;
}

function tog(key, label, ex){
  const n = notif();
  return `<div class="row" style="align-items:flex-start"><div class="grow"><div class="title">${label}</div>${ex?`<div class="ex">${ex}</div>`:''}</div>
    <button class="tog" role="switch" aria-checked="${!!n[key]}" aria-label="${esc(label)}" data-a="tog:${key}"></button></div>`;
}

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
const isStandalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const pushSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function pushBlock(){
  if(isIOS && !isStandalone) return `<p class="note">Pour recevoir les rappels sur iPhone, ouvre ce site dans Safari, touche le bouton Partager puis « Sur l'écran d'accueil ». Ouvre ensuite l'app depuis l'icône et reviens ici.</p>`;
  if(!pushSupported) return `<p class="note">Ce navigateur ne gère pas les notifications.</p>`;
  if(S.push === 'on') return `<div class="row"><div class="grow"><div class="title">Notifications activées</div><div class="sub">Sur ce téléphone</div></div><button class="btn" data-a="pushTest">Tester</button></div>`;
  if(S.push === 'denied') return `<p class="note">Les notifications sont bloquées. Autorise-les dans Réglages iPhone › Notifications › Le Cartel.</p>`;
  return `<div class="row"><div class="grow"><div class="title">Notifications</div><div class="sub">Pas encore activées sur ce téléphone</div></div><button class="btn pri" data-a="pushOn">Activer</button></div>`;
}

function vSet(){
  const m = me(), n = notif();
  return `
  <header class="top"><div><p class="eyebrow">Sur ce téléphone</p><h1>Réglages</h1></div></header>

  <section class="sec"><div class="sec-h"><h2>Moi</h2></div>
    <div class="list">
      <div class="row">${av(S.me)}<div class="grow"><div class="title">${esc(m.name)}</div><div class="sub">Ce téléphone est celui de ${esc(m.name)}</div></div><button class="btn" data-a="sheet:who">Changer</button></div>
      <div class="row" style="flex-direction:column;align-items:stretch;gap:10px">
        <label class="small muted" for="myName">Prénom</label>
        <div class="field"><input id="myName" value="${esc(m.name)}" maxlength="24"><button class="btn" style="height:44px" data-a="rename">Enregistrer</button></div>
        <span class="small muted">Emoji</span>
        <div class="picks">${EMOJIS.map(e=>`<button aria-pressed="${m.emoji===e}" data-a="emoji:${e}">${e}</button>`).join('')}</div>
        <span class="small muted">Couleur</span>
        <div class="picks">${COLORS.map(c=>`<button class="swatch" style="--c:var(${c})" aria-label="Couleur" aria-pressed="${m.color===c}" data-a="color:${c}"></button>`).join('')}</div>
      </div>
    </div>
  </section>

  <section class="sec"><div class="sec-h"><h2>Rappels</h2></div>
    <div class="list">${pushBlock().startsWith('<p')?'':pushBlock()}
      <div class="row" style="flex-direction:column;align-items:stretch;gap:10px">
        <div style="display:flex;gap:12px;align-items:flex-start"><div style="flex:1"><div class="title">Ma tâche n'est pas encore faite</div></div>
          <button class="tog" role="switch" aria-checked="${!!n.mine}" aria-label="Ma tâche n'est pas encore faite" data-a="tog:mine"></button></div>
        ${n.mine?`<div style="display:flex;gap:8px;flex-wrap:wrap">
          <select id="mineFreq" data-c="mineFreq" aria-label="Fréquence">${[['jour','Tous les jours'],['2j','Tous les 2 jours'],['dim','Seulement le dimanche']].map(([v,l])=>`<option value="${v}"${n.mineFreq===v?' selected':''}>${l}</option>`).join('')}</select>
          <select id="mineHour" data-c="mineHour" aria-label="Heure">${['08:00','10:00','12:00','14:00','16:00','18:00','19:00','20:00','21:00'].map(h=>`<option${n.mineHour===h?' selected':''}>${h}</option>`).join('')}</select></div>
          <div class="ex">« Salle de bain t'attend encore cette semaine. »</div>`:''}
      </div>
      ${tog('monday','Lundi matin : la liste de la semaine','« 6 grosses tâches cette semaine, choisis les tiennes. »')}
      <div class="row" style="flex-direction:column;align-items:stretch;gap:10px">
        <div style="display:flex;gap:12px;align-items:flex-start"><div style="flex:1"><div class="title">Tâches que personne n'a prises</div></div>
          <button class="tog" role="switch" aria-checked="${!!n.midweek}" aria-label="Tâches que personne n'a prises" data-a="tog:midweek"></button></div>
        ${n.midweek?`<select id="midDay" data-c="midDay" aria-label="Jour">${['mardi','mercredi','jeudi','vendredi'].map(d=>`<option${n.midDay===d?' selected':''}>${d}</option>`).join('')}</select>
          <div class="ex">« Four et Frigo n'ont encore personne. » (18h)</div>`:''}
      </div>
      ${tog('stolen',"Quelqu'un reprend une de mes tâches",'« Hugo a repris Aspirateur appart. »')}
      ${tog('open',"À l'ouverture de l'app : mes tâches en attente",'Bandeau en haut de l\'accueil.')}
      <div class="row" style="align-items:flex-start"><div class="grow"><div class="title">Dimanche 19h : tâche pas faite</div><div class="ex">Toujours activé pour tout le monde.</div></div>
        <button class="tog" role="switch" aria-checked="true" aria-label="Dimanche 19h" disabled></button></div>
    </div>
    ${pushBlock().startsWith('<p')?pushBlock():''}
  </section>

  <section class="sec"><div class="sec-h"><h2>Coloc</h2></div>
    <div class="list">
      <button class="row tap" data-a="sheet:manageDaily"><div class="grow"><div class="title">Tâches quotidiennes</div><div class="sub">${activeDaily().length} tâches</div></div><span class="muted">›</span></button>
      <button class="row tap" data-a="sheet:manageCat"><div class="grow"><div class="title">Catalogue des grosses tâches</div><div class="sub">${S.catalogue.length} tâches</div></div><span class="muted">›</span></button>
      <button class="row tap" data-a="sheet:members"><div class="grow"><div class="title">Colocataires</div><div class="sub">${esc(activeMembers().map(x=>x.name).join(', '))}</div></div><div class="stack">${activeMembers().map(x=>av(x.id,1)).join('')}</div></button>
    </div>
  </section>`;
}

// ---------- Feuilles ----------
function shTask(id){
  const t = T(id); if(!t) return '';
  const r = range(S.period, S.off);
  const logs = S.logs.filter(l=>l.task===id && inR(l.ts,r)).sort((a,b)=>b.ts-a.ts);
  const people = new Set([...activeMembers().map(m=>m.id), ...logs.map(l=>l.by)]);
  const per = [...people].map(pid=>({id:pid, n:logs.filter(l=>l.by===pid).length})).sort((a,b)=>b.n-a.n);
  const today = ymd(now());
  return `<h3>${esc(t.name)}</h3>${seg()}
  <div class="tbl-wrap"><table><thead><tr><th>Coloc</th><th>Fois</th></tr></thead><tbody>
    ${per.map(x=>`<tr${x.id===S.me?' class="me"':''}><td><span class="who">${av(x.id,1)}${esc(M(x.id).name)}</span></td><td class="n tot${x.n?'':' zero'}">${x.n}</td></tr>`).join('')}
  </tbody></table></div>
  <section class="sec"><div class="sec-h"><h2>J'ai oublié de noter</h2></div>
    <div class="field"><input type="date" id="pastDate" value="${today}" max="${today}" aria-label="Date"><button class="btn pri" data-a="addPast:${id}" style="height:44px">Ajouter</button></div>
  </section>
  <section class="sec feed"><div class="sec-h"><h2>Journal</h2><span class="small muted">${logs.length} entrée${logs.length>1?'s':''}</span></div>
    <div class="list">${logs.slice(0,50).map(l=>`<div class="row">${av(l.by,1)}<div class="grow small"><b>${esc(M(l.by).name)}</b> · ${esc(l.ts.toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'}))} ${hm(l.ts)}</div>${l.by===S.me?`<button class="btn ghost" data-a="delLog:${l.id}">Supprimer</button>`:''}</div>`).join('') || '<div class="empty">Rien sur cette période.</div>'}
    ${logs.length>50?`<div class="row small muted">… et ${logs.length-50} de plus</div>`:''}</div>
  </section>`;
}
function shAddWeek(){
  const present = new Set(S.week.map(w=>w.name));
  const avail = S.catalogue.filter(c=>!present.has(c.name));
  return `<h3>Ajouter à la semaine</h3>
  <section class="sec"><div class="sec-h"><h2>Catalogue</h2></div>
    <div class="list">${avail.length?avail.map((c,i)=>`<label class="check"><input type="checkbox" id="cat${i}" value="${esc(c.name)}" data-cat>${esc(c.name)}</label>`).join(''):'<div class="empty">Tout le catalogue est déjà dans la semaine.</div>'}</div>
  </section>
  <section class="sec"><div class="sec-h"><h2>Autre tâche</h2></div>
    <input id="newW" placeholder="Ex. Laver les vitres" aria-label="Nouvelle tâche" maxlength="40">
    <label class="check" style="padding:4px 0;border:0"><input type="checkbox" id="saveCat"> L'ajouter aussi au catalogue</label>
  </section>
  <button class="btn pri full" data-a="addWeek">Ajouter</button>`;
}
function shManage(kind){
  const daily = kind==='daily';
  const items = daily ? activeDaily().map(t=>({k:t.id, n:t.name})) : S.catalogue.map(c=>({k:c.id, n:c.name}));
  const del = daily ? 'delDaily' : 'delCat';
  return `<h3>${daily?'Tâches quotidiennes':'Catalogue des grosses tâches'}</h3>
  <div class="list">${items.map(x=>`<div class="row"><div class="grow">${esc(x.n)}</div>${S.confirm===`${del}:${x.k}`
      ? `<span class="confirm"><button class="btn danger" data-a="${del}:${x.k}">Supprimer</button><button class="btn ghost" data-a="confirm:">Non</button></span>`
      : `<button class="btn ghost" data-a="confirm:${del}:${x.k}">Supprimer</button>`}</div>`).join('') || '<div class="empty">Aucune tâche.</div>'}</div>
  <div class="field"><input id="newItem" placeholder="${daily?'Ex. Essuyer la table':'Ex. Laver les vitres'}" aria-label="Nouvelle tâche" maxlength="40"><button class="btn pri" style="height:44px" data-a="${daily?'addDaily':'addCat'}">Ajouter</button></div>
  ${daily?'<p class="small muted">Supprimer une tâche garde son historique dans les stats.</p>':''}`;
}
function shMembers(){
  return `<h3>Colocataires</h3>
  <div class="list">${activeMembers().map(m=>`<div class="row">${av(m.id)}<div class="grow title">${esc(m.name)}</div>${m.id===S.me?'<span class="small muted">Toi</span>':S.confirm===`delMember:${m.id}`
      ? `<span class="confirm"><button class="btn danger" data-a="delMember:${m.id}">Retirer</button><button class="btn ghost" data-a="confirm:">Non</button></span>`
      : `<button class="btn ghost" data-a="confirm:delMember:${m.id}">Retirer</button>`}</div>`).join('')}</div>
  <p class="small muted">Un coloc retiré disparaît de la liste mais reste dans l'historique. Pour ajouter quelqu'un, il ouvre l'app sur son téléphone et ajoute son prénom.</p>`;
}
function shWho(){
  const list = activeMembers();
  return `<h3>Qui utilise ce téléphone ?</h3><p class="small muted" style="margin:-8px 0 0">On ne te le redemandera plus sur cet appareil.</p>
  ${list.length?`<div class="who-grid">${list.map(m=>`<button data-a="pick:${m.id}">${av(m.id)}${esc(m.name)}</button>`).join('')}</div>`:''}
  <section class="sec"><div class="sec-h"><h2>${list.length?'Je ne suis pas dans la liste':'Ajoute ton prénom'}</h2></div>
    <div class="field"><input id="newMember" placeholder="Ton prénom" aria-label="Ton prénom" maxlength="24"><button class="btn pri" style="height:44px" data-a="addMember">Ajouter</button></div>
  </section>`;
}

// ---------- Rendu ----------
function vSetup(){
  return `<div class="setup">${LOGO.replace('<svg','<svg style="width:120px"')}
    <h1>Presque prêt</h1>
    <p>L'app n'est pas encore reliée à sa base de données. Il faut remplir <code>config.js</code> avec l'URL et la clé « anon » du projet Supabase, puis lancer <code>supabase/schema.sql</code> une fois dans l'éditeur SQL de Supabase.</p>
  </div>`;
}

function render(){
  const app = document.getElementById('app');
  const myName = document.getElementById('myName'); const myNameVal = myName && document.activeElement===myName ? myName.value : null;
  const nav = document.querySelector('.nav');
  if(!configured){ app.innerHTML = vSetup(); nav.hidden = true; return; }
  if(!S.ready) return;
  if(!me() && !S.sheet) S.sheet = ['who'];
  const V = {home:vHome, daily:vDaily, week:vWeek, stats:vStats, set:vSet}[S.tab] || vHome;
  app.innerHTML = me() ? V() : `<div class="loading">${LOGO.replace('<svg','<svg style="width:140px"')}</div>`;
  nav.hidden = !me();
  if(myNameVal!=null){ const i=document.getElementById('myName'); if(i){ i.value=myNameVal; i.focus(); } }
  const free = S.week.filter(w=>!w.done && !w.members.length).length;
  document.getElementById('nav').innerHTML = TABS.map(([k,l])=>`<button data-a="tab:${k}" ${S.tab===k?'aria-current="page"':''}><span class="badge"${k==='week'&&free?` data-n="${free}"`:''}>${IC[k]}</span>${l}</button>`).join('');
  const L = document.getElementById('layer');
  if(!S.sheet){L.innerHTML='';return}
  const [type,arg] = S.sheet;
  const body = {task:()=>shTask(arg), addWeek:shAddWeek, manageDaily:()=>shManage('daily'), manageCat:()=>shManage('cat'), members:shMembers, who:shWho}[type]?.() ?? '';
  const keep = L.querySelector('.sheet')?.scrollTop || 0;
  const focusId = document.activeElement?.id;
  const typed = {}; L.querySelectorAll('input[id]').forEach(i => typed[i.id] = i.type==='checkbox' ? i.checked : i.value);
  L.innerHTML = `<div class="scrim" ${me()?'data-a="close"':''}><div class="sheet" role="dialog" aria-modal="true"><div class="grip"></div>${body}</div></div>`;
  L.querySelector('.sheet').scrollTop = keep;
  for(const [id,v] of Object.entries(typed)){ const i=document.getElementById(id); if(i){ if(i.type==='checkbox') i.checked=v; else i.value=v; } }
  if(focusId) document.getElementById(focusId)?.focus();
}

let toastTimer;
function toast(msg, undo){
  const el = document.getElementById('toast');
  el.innerHTML = `<span class="grow">${msg}</span>${undo?'<button data-a="undo">Annuler</button>':''}`;
  el.hidden = false; S.undo = undo;
  clearTimeout(toastTimer); toastTimer = setTimeout(()=>{el.hidden=true; S.undo=null}, 5000);
}

// ---------- Notifications push ----------
function b64ToBytes(s){const p='='.repeat((4-s.length%4)%4);const b=atob((s+p).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(b,c=>c.charCodeAt(0))}
async function savePushSub(sub){
  const j = sub.toJSON();
  return db(sb.from('push_subscriptions').upsert({endpoint:j.endpoint, member_id:S.me, p256dh:j.keys.p256dh, auth:j.keys.auth}));
}
async function refreshPushState(){
  if(!pushSupported || !navigator.serviceWorker.controller && !(await navigator.serviceWorker.getRegistration())) { S.push='off'; return; }
  if(Notification.permission==='denied'){ S.push='denied'; return; }
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  S.push = sub && Notification.permission==='granted' ? 'on' : 'off';
  if(sub && S.me) savePushSub(sub); // garde l'abonnement lié au bon coloc
}
async function enablePush(){
  try{
    const perm = await Notification.requestPermission();
    if(perm !== 'granted'){ S.push = perm==='denied'?'denied':'off'; render(); return; }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:b64ToBytes(VAPID_PUBLIC_KEY)});
    if(await savePushSub(sub)){ S.push='on'; toast('Notifications activées'); }
  }catch(e){ console.error(e); toast("Impossible d'activer les notifications sur ce téléphone."); }
  render();
}

// ---------- Actions ----------
const notifyQueue = (ids, kind, title, body) => ids.length && db(sb.from('notify_queue').insert(ids.map(member_id=>({member_id, kind, title, body}))));
const weekRow = w => ({members:w.members, done_by:w.done?.by||[], done_at:w.done?.ts.toISOString()||null});
const saveWeek = w => db(sb.from('week_tasks').update(weekRow(w)).eq('id', w.id));
const saveMe = patch => { Object.assign(me(), patch); render(); return db(sb.from('members').update(patch).eq('id', S.me)); };
const val = id => document.getElementById(id)?.value.trim() || '';
const clear = (...ids) => ids.forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });

const ACTIONS = {
  tab(v){ S.tab=v; S.sheet=null; S.confirm=null; ls.set('cartel.tab', v); window.scrollTo(0,0); },
  close(){ S.sheet=null; S.confirm=null; },
  sheet(v){ S.sheet=[v]; S.confirm=null; },
  confirm(v){ S.confirm = v || null; },
  hideBanner(){ S.banner=false; },
  openTask(v){ S.sheet=['task',v]; },
  period(v){ if(v==='last'){S.period='semaine';S.off=-1}else{S.period=v;S.off=0} },
  off(v){ S.off=Math.min(0,S.off+(+v)); },

  pick(v){ S.me=v; ls.set('cartel.me', v); S.sheet=null; toast(`Ce téléphone est maintenant celui de ${esc(M(v).name)}`); refreshPushState().then(render); },
  async addMember(){
    const name = val('newMember'); if(!name) return; clear('newMember');
    const used = new Set(activeMembers().map(m=>m.color));
    const m = {id:uuid(), name, emoji:EMOJIS[Math.floor(Math.random()*EMOJIS.length)], color:COLORS.find(c=>!used.has(c))||COLORS[0], active:true, notif:DEFAULT_NOTIF};
    S.members.push(m); S.me=m.id; ls.set('cartel.me', m.id); S.sheet=null;
    render(); await db(sb.from('members').insert(m));
  },
  async delMember(v){ const m=M(v); m.active=false; S.confirm=null; render(); await db(sb.from('members').update({active:false}).eq('id',v)); },
  async rename(){ const name=val('myName'); if(!name) return; await saveMe({name}); toast('Prénom enregistré'); },
  async emoji(v){ await saveMe({emoji:v}); },
  async color(v){ await saveMe({color:v}); },
  async tog(v){ const n=notif(); n[v]=!n[v]; await saveMe({notif:n}); },

  async plus(v){
    const l={id:uuid(), task:v, by:S.me, ts:now()}; S.logs.push(l);
    toast(`Fait : ${esc(T(v).name)}`, async ()=>{ S.logs=S.logs.filter(x=>x!==l); render(); await db(sb.from('daily_logs').delete().eq('id', l.id)); });
    render(); await db(sb.from('daily_logs').insert({id:l.id, task_id:v, member_id:S.me, done_at:l.ts.toISOString()}));
  },
  undo(){ if(S.undo){ const u=S.undo; S.undo=null; document.getElementById('toast').hidden=true; u(); } },
  async delLog(v){ S.logs=S.logs.filter(l=>l.id!==v); toast('Entrée supprimée'); render(); await db(sb.from('daily_logs').delete().eq('id',v)); },
  async addPast(v){
    const d = val('pastDate'); if(!d) return;
    const ts = new Date(d+'T12:00'); if(ts>now()) ts.setTime(+now());
    const l={id:uuid(), task:v, by:S.me, ts}; S.logs.push(l);
    toast(`Ajouté le ${esc(fmtShort(ts))}`); render();
    await db(sb.from('daily_logs').insert({id:l.id, task_id:v, member_id:S.me, done_at:ts.toISOString()}));
  },

  async wTake(v){ const w=S.week.find(x=>x.id===v); w.members=[S.me]; toast(`Tu t'occupes de ${esc(w.name)}`); render(); await saveWeek(w); },
  async wJoin(v){ const w=S.week.find(x=>x.id===v); w.members=[...new Set([...w.members,S.me])]; toast(`Tu as rejoint ${esc(w.name)}`); render(); await saveWeek(w); },
  async wLeave(v){ const w=S.week.find(x=>x.id===v); w.members=w.members.filter(x=>x!==S.me); render(); await saveWeek(w); },
  async wSteal(v){
    const w=S.week.find(x=>x.id===v); const prev=w.members.filter(x=>x!==S.me); w.members=[S.me];
    toast(`${esc(names(prev))} ${prev.length>1?'ont':'a'} été prévenu${prev.length>1?'s':''}`); render();
    await saveWeek(w); await notifyQueue(prev, 'stolen', 'Tâche reprise', `${me().name} a repris ${w.name}.`);
  },
  async wSteal2(v){
    const w=S.week.find(x=>x.id===v); const prev=w.members.filter(x=>x!==S.me);
    w.members=[S.me]; w.done={by:[S.me], ts:now()};
    toast(`Validée à ton nom. ${esc(names(prev))} ${prev.length>1?'ont':'a'} été prévenu${prev.length>1?'s':''}`); render();
    await saveWeek(w); await notifyQueue(prev, 'stolen', 'Tâche faite à ta place', `${me().name} a fait ${w.name} à ta place.`);
    await LOADERS.week_tasks(); render();
  },
  async wDone(v){
    const w=S.week.find(x=>x.id===v); w.done={by:[...w.members], ts:now()};
    toast(`${esc(w.name)} : faite`, async ()=>{ w.done=null; render(); await saveWeek(w); await LOADERS.week_tasks(); render(); });
    render(); await saveWeek(w); await LOADERS.week_tasks(); render();
  },
  async wUndo(v){ const w=S.week.find(x=>x.id===v); w.done=null; render(); await saveWeek(w); await LOADERS.week_tasks(); render(); },
  async wDelete(v){ S.week=S.week.filter(w=>w.id!==v); S.confirm=null; render(); await db(sb.from('week_tasks').delete().eq('id',v)); },
  async addWeek(){
    const picked=[...document.querySelectorAll('[data-cat]:checked')].map(i=>i.value);
    const n=val('newW');
    const toCat = n && document.getElementById('saveCat').checked && !S.catalogue.some(c=>c.name===n);
    if(n && !picked.includes(n)) picked.push(n);
    if(!picked.length){ toast('Coche au moins une tâche'); return; }
    clear('newW');
    const rows = picked.map(name=>({id:uuid(), week_start:weekStart(), name}));
    S.week.push(...rows.map(r=>({id:r.id, name:r.name, members:[], late:false, done:null})));
    S.sheet=null; toast(`${picked.length} tâche${picked.length>1?'s':''} ajoutée${picked.length>1?'s':''}`); render();
    await db(sb.from('week_tasks').insert(rows));
    if(toCat){ await db(sb.from('catalogue').insert({name:n, position:S.catalogue.length+1})); await LOADERS.catalogue(); render(); }
  },

  async addDaily(){
    const name=val('newItem'); if(!name) return; clear('newItem');
    const t={id:uuid(), name, short:name.length>10?name.slice(0,9)+'.':name, position:Math.max(0,...S.daily.map(x=>x.position))+1, archived:false};
    S.daily.push(t); render(); await db(sb.from('daily_tasks').insert(t));
  },
  async delDaily(v){ T(v).archived=true; S.confirm=null; render(); await db(sb.from('daily_tasks').update({archived:true}).eq('id',v)); },
  async addCat(){
    const name=val('newItem'); if(!name || S.catalogue.some(c=>c.name===name)) return; clear('newItem');
    const c={id:uuid(), name, position:S.catalogue.length+1}; S.catalogue.push(c); render();
    await db(sb.from('catalogue').insert(c));
  },
  async delCat(v){ S.catalogue=S.catalogue.filter(c=>c.id!==v); S.confirm=null; render(); await db(sb.from('catalogue').delete().eq('id',v)); },

  pushOn(){ enablePush(); },
  async pushTest(){ await notifyQueue([S.me], 'test', 'Le Cartel', 'Les notifications marchent sur ce téléphone.'); toast('Notification de test envoyée. Elle arrive dans les 15 minutes.'); },
};

document.addEventListener('click', e=>{
  const el = e.target.closest('[data-a]'); if(!el) return;
  if(el.dataset.a==='close' && e.target!==el) return;
  const [a, v] = el.dataset.a.split(/:(.*)/s);
  const fn = ACTIONS[a]; if(!fn) return;
  const r = fn(v);
  if(!(r instanceof Promise)) render();
});
document.addEventListener('change', async e=>{
  const k = e.target.dataset?.c; if(!k || !me()) return;
  const n = notif(); n[k] = e.target.value; await saveMe({notif:n});
});
document.addEventListener('keydown', e=>{
  if(e.key==='Escape' && S.sheet && me()){ S.sheet=null; render(); }
  if(e.key==='Enter' && ['newMember','newItem','newW','myName'].includes(e.target.id)){
    const btn = e.target.closest('.field, .sec')?.querySelector('.btn.pri, .btn'); btn?.click();
  }
});
// Au retour dans l'app (iPhone la garde en mémoire), on recharge si la semaine ou les données ont changé.
document.addEventListener('visibilitychange', async ()=>{
  if(document.visibilityState!=='visible' || !configured || !S.ready) return;
  try{ await loadAll(); S.banner=true; render(); }catch(e){ console.error(e) }
});

// ---------- Démarrage ----------
async function start(){
  if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(console.error);
  if(!configured){ render(); return; }
  try{
    await loadAll();
    S.ready = true;
    if(S.me && !me()) { S.me=null; ls.set('cartel.me', null); }
    render();
    subscribeRealtime();
    await refreshPushState(); render();
  }catch(e){
    console.error(e);
    document.getElementById('app').innerHTML = `<div class="setup">${LOGO.replace('<svg','<svg style="width:120px"')}<h1>Connexion impossible</h1><p>La base de données ne répond pas. Vérifie ta connexion internet, puis recharge la page.</p><p class="err">${esc(e.message||e)}</p><button class="btn pri full" onclick="location.reload()">Recharger</button></div>`;
  }
}
start();
