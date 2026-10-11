// Fausse base Supabase en mémoire, pour tester l'interface en local sans vraie base (tools/dev.html).
const db = {
  members: [], daily_tasks: [], daily_logs: [], catalogue: [], week_tasks: [],
  push_subscriptions: [], notify_queue: [], notif_sent: [],
};
const id = () => crypto.randomUUID();
const monday = () => { const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - ((d.getDay()+6)%7)); return d; };
const ymd = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

// Données d'exemple
(() => {
  const names = [['Tristan','🦊','--m1'],['Hugo','🐢','--m2'],['Louis','🐙','--m3']];
  names.forEach(([name,emoji,color]) => db.members.push({id:id(), name, emoji, color, active:true, notif:{}, created_at:new Date().toISOString()}));
  [['Vider le lave-vaisselle','Lave-v.'],['Balai cuisine','Balai'],['Sortir les poubelles','Poubelles']].forEach(([name,short],i) => db.daily_tasks.push({id:id(), name, short, position:i+1, archived:false}));
  ['Aspirateur appart','Salle de bain','Serpillère','Four','Frigo','Plaques + hotte'].forEach((name,i) => db.catalogue.push({id:id(), name, position:i+1}));
  for(let d=0; d<60; d++) for(const t of db.daily_tasks) if(Math.random()<.6){
    const ts = new Date(Date.now() - d*864e5 - Math.random()*8*36e5);
    db.daily_logs.push({id:id(), task_id:t.id, member_id:db.members[Math.floor(Math.random()*3)].id, done_at:ts.toISOString()});
  }
  const last = new Date(monday()); last.setDate(last.getDate()-7);
  db.week_tasks.push({id:id(), week_start:ymd(last), name:'Four', members:[db.members[1].id], done_by:[], done_at:null, late:false, carried_from:null});
  db.week_tasks.push({id:id(), week_start:ymd(last), name:'Salle de bain', members:[db.members[0].id], done_by:[db.members[0].id], done_at:new Date(last.getTime()+2*864e5).toISOString(), late:false, carried_from:null});
  db.week_tasks.push({id:id(), week_start:ymd(monday()), name:'Aspirateur appart', members:[db.members[1].id], done_by:[], done_at:null, late:false, carried_from:null});
})();

class Query {
  constructor(t){ this.t=t; this.op='select'; this.filters=[]; this.ord=[]; this.rng=null; }
  select(){ return this; }
  range(a,b){ this.rng=[a,b]; return this; }
  order(c){ this.ord.push(c); return this; }
  eq(c,v){ this.filters.push(r => r[c]===v); return this; }
  not(c){ this.filters.push(r => r[c]!=null); return this; }
  insert(rows){ this.op='insert'; this.rows=[].concat(rows); return this; }
  upsert(rows){ this.op='upsert'; this.rows=[].concat(rows); return this; }
  update(p){ this.op='update'; this.patch=p; return this; }
  delete(){ this.op='delete'; return this; }
  then(res, rej){ return Promise.resolve().then(() => this.run()).then(res, rej); }
  run(){
    const T = db[this.t]; const match = r => this.filters.every(f => f(r));
    if(this.op==='insert'){ for(const r of this.rows) T.push({id:id(), created_at:new Date().toISOString(), ...structuredClone(r)}); return {data:null,error:null}; }
    if(this.op==='upsert'){ for(const r of this.rows){ const i=T.findIndex(x=>x.endpoint===r.endpoint); i>=0?T[i]={...T[i],...r}:T.push({...r}); } return {data:null,error:null}; }
    if(this.op==='update'){ T.filter(match).forEach(r=>Object.assign(r, structuredClone(this.patch))); return {data:null,error:null}; }
    if(this.op==='delete'){ db[this.t]=T.filter(r=>!match(r)); return {data:null,error:null}; }
    let out = T.filter(match);
    for(const c of this.ord.reverse()) out = [...out].sort((a,b)=>String(a[c]).localeCompare(String(b[c])));
    if(this.rng) out = out.slice(this.rng[0], this.rng[1]+1);
    return {data: structuredClone(out), error:null};
  }
}

window.__cartelTestClient = {
  from: t => new Query(t),
  rpc: async (name, {p_week}) => {
    const src = db.week_tasks.filter(w => w.week_start < p_week && !w.done_at && !db.week_tasks.some(c => c.carried_from===w.id));
    src.forEach(w => db.week_tasks.push({id:id(), week_start:p_week, name:w.name, members:[...w.members], done_by:[], done_at:null, late:true, carried_from:w.id}));
    return {data:src.length, error:null};
  },
  channel: () => ({ on(){ return this; }, subscribe(){ return this; } }),
  _db: db,
};
