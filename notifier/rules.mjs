// Règles des rappels : fonction pure, testable sans base ni réseau.
export const TZ = 'Europe/Zurich';
export const DEFAULT_NOTIF = {mine:true, mineHour:'18:00', mineFreq:'jour', monday:true, midweek:true, midDay:'mercredi', stolen:true, open:true};
const DAYS = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'];
const WINDOW_MIN = 180; // un rappel prévu à 18h peut partir jusqu'à 21h si GitHub est en retard

// Date et heure à Zurich : { date:'2026-10-12', dayIndex:0 (lundi), minutes:1095, weekStart:'2026-10-12' }
export function zurich(d = new Date()){
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {timeZone:TZ, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23'})
    .formatToParts(d).map(x => [x.type, x.value]));
  const date = `${p.year}-${p.month}-${p.day}`;
  const utcDay = new Date(`${date}T00:00:00Z`);
  const dayIndex = (utcDay.getUTCDay() + 6) % 7;
  const ws = new Date(utcDay.getTime() - dayIndex * 864e5).toISOString().slice(0, 10);
  return { date, dayIndex, minutes: +p.hour * 60 + +p.minute, weekStart: ws };
}

const inWindow = (z, hhmm) => { const [h, m] = hhmm.split(':').map(Number); const t = h * 60 + (m || 0); return z.minutes >= t && z.minutes < t + WINDOW_MIN; };
const list = names => names.length <= 1 ? names.join('') : names.slice(0, -1).join(', ') + ' et ' + names.at(-1);

// members : [{id, name, notif}] actifs ; week : [{name, members:[ids], done_at}] de la semaine courante
export function computeMessages(z, members, week){
  const out = [];
  const todo = week.filter(w => !w.done_at);
  const free = todo.filter(w => !(w.members || []).length);
  for (const m of members){
    const n = { ...DEFAULT_NOTIF, ...(m.notif || {}) };
    const mine = todo.filter(w => (w.members || []).includes(m.id));
    const mineText = mine.length === 1 ? `${mine[0].name} t'attend encore cette semaine.` : `Il te reste ${mine.length} tâches cette semaine : ${list(mine.map(w => w.name))}.`;

    if (z.dayIndex === 6 && mine.length && inWindow(z, '19:00')){
      out.push({ member: m.id, key: `sunday:${z.date}:${m.id}`, title: 'Dernier soir de la semaine',
        body: `${mineText.replace(' cette semaine', '')} Sinon elle${mine.length > 1 ? 's passent' : ' passe'} à la semaine prochaine.` });
    }
    const freqOk = n.mineFreq === 'dim' ? z.dayIndex === 6 : n.mineFreq === '2j' ? z.dayIndex % 2 === 0 : true;
    if (n.mine && mine.length && freqOk && z.dayIndex !== 6 && inWindow(z, n.mineHour || '18:00')){
      out.push({ member: m.id, key: `mine:${z.date}:${m.id}`, title: 'Ta tâche de la semaine', body: mineText });
    }
    if (n.monday && z.dayIndex === 0 && inWindow(z, '09:00')){
      out.push({ member: m.id, key: `monday:${z.date}:${m.id}`, title: 'Nouvelle semaine',
        body: week.length ? `${week.length} grosse${week.length > 1 ? 's' : ''} tâche${week.length > 1 ? 's' : ''} cette semaine, choisis les tiennes.` : 'La liste de la semaine est vide. Ajoute les tâches à faire.' });
    }
    if (n.midweek && free.length && z.dayIndex === DAYS.indexOf(n.midDay || 'mercredi') && inWindow(z, '18:00')){
      out.push({ member: m.id, key: `midweek:${z.date}:${m.id}`, title: 'Tâches sans personne',
        body: `${list(free.map(w => w.name))} ${free.length > 1 ? "n'ont" : "n'a"} encore personne.` });
    }
  }
  return out;
}
