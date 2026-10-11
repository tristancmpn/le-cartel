// Envoie les rappels de la coloc. Lancé toutes les 15 minutes par GitHub Actions (.github/workflows/notify.yml).
import { readFileSync } from 'node:fs';
import webpush from 'web-push';
import { zurich, computeMessages, DEFAULT_NOTIF } from './rules.mjs';

// L'URL et la clé publique Supabase sont lues dans config.js, comme le fait l'app.
const cfg = readFileSync(new URL('../config.js', import.meta.url), 'utf8');
const read = name => cfg.match(new RegExp(`${name}\\s*=\\s*'([^']*)'`))?.[1] || '';
const URL_ = read('SUPABASE_URL'), KEY = read('SUPABASE_ANON_KEY'), VAPID_PUBLIC = read('VAPID_PUBLIC_KEY');
const { VAPID_PRIVATE_KEY, VAPID_SUBJECT = 'https://github.com/tristancmpn/le-cartel' } = process.env;

if (!URL_ || !KEY){ console.log('config.js pas encore rempli : rien à faire.'); process.exit(0); }
if (!VAPID_PRIVATE_KEY){ console.error('Secret VAPID_PRIVATE_KEY manquant.'); process.exit(1); }
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE_KEY);

async function rest(path, { method = 'GET', body, prefer } = {}){
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    method,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Réserve une clé de rappel ; renvoie false si ce rappel est déjà parti.
async function claim(key){
  const rows = await rest('notif_sent?on_conflict=key', { method: 'POST', body: { key }, prefer: 'resolution=ignore-duplicates,return=representation' });
  return rows.length > 0;
}

async function push(subs, memberId, msg){
  let sent = 0;
  for (const s of subs.filter(s => s.member_id === memberId)){
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title: msg.title, body: msg.body, tag: msg.tag }), { TTL: 12 * 3600 });
      sent++;
    } catch (e){
      if (e.statusCode === 404 || e.statusCode === 410){
        await rest(`push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: 'DELETE' });
        console.log('Abonnement expiré supprimé');
      } else console.error('Échec d\'envoi', e.statusCode, e.body || e.message);
    }
  }
  return sent;
}

const z = zurich();
console.log('Zurich', z);
await rest('rpc/rollover_week', { method: 'POST', body: { p_week: z.weekStart } });

const [members, subs, week, queue] = await Promise.all([
  rest('members?select=id,name,notif&active=eq.true'),
  rest('push_subscriptions?select=*'),
  rest(`week_tasks?select=name,members,done_at&week_start=eq.${z.weekStart}`),
  rest('notify_queue?select=*&sent_at=is.null&order=id'),
]);
const byId = Object.fromEntries(members.map(m => [m.id, m]));

// 1. Messages immédiats (tâche reprise, test)
for (const q of queue){
  const n = { ...DEFAULT_NOTIF, ...(byId[q.member_id]?.notif || {}) };
  const wanted = q.kind !== 'stolen' || n.stolen;
  const sent = wanted ? await push(subs, q.member_id, { title: q.title, body: q.body, tag: `q${q.id}` }) : 0;
  await rest(`notify_queue?id=eq.${q.id}`, { method: 'PATCH', body: { sent_at: new Date().toISOString() } });
  console.log(`file ${q.id} (${q.kind}) → ${sent} appareil(s)`);
}

// 2. Rappels programmés
for (const msg of computeMessages(z, members, week)){
  if (!subs.some(s => s.member_id === msg.member)) continue;
  if (!(await claim(msg.key))) continue;
  const sent = await push(subs, msg.member, { ...msg, tag: msg.key.split(':')[0] });
  console.log(`${msg.key} → ${sent} appareil(s)`);
}
console.log('Terminé');
