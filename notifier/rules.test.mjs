// Tests des règles de rappel : npm test (dans notifier/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { zurich, computeMessages } from './rules.mjs';

const at = (iso) => zurich(new Date(iso));
const A = { id: 'a', name: 'Tristan', notif: {} };
const B = { id: 'b', name: 'Hugo', notif: { mineHour: '20:00', midDay: 'jeudi' } };
const week = [
  { name: 'Four', members: ['a'], done_at: null },
  { name: 'Frigo', members: [], done_at: null },
  { name: 'WC', members: ['b'], done_at: '2026-10-13T10:00:00Z' },
];
const keys = (z, ms = [A, B], w = week) => computeMessages(z, ms, w).map(m => m.key.split(':')[0] + ':' + m.member).sort();

test('heure de Zurich et lundi de la semaine', () => {
  const z = at('2026-10-14T16:30:00Z'); // mercredi 18:30 à Zurich (UTC+2)
  assert.equal(z.date, '2026-10-14'); assert.equal(z.dayIndex, 2); assert.equal(z.weekStart, '2026-10-12'); assert.equal(z.minutes, 18 * 60 + 30);
  assert.equal(at('2026-10-11T22:30:00Z').weekStart, '2026-10-12'); // lundi 00:30 à Zurich
});

test('mercredi 18h30 : ma tâche (Tristan) et tâches sans personne', () => {
  assert.deepEqual(keys(at('2026-10-14T16:30:00Z')), ['midweek:a', 'mine:a']);
});

test('jeudi 20h : Hugo n\'a pas de tâche en cours mais voit les tâches libres', () => {
  assert.deepEqual(keys(at('2026-10-15T18:10:00Z')), ['midweek:b', 'mine:a']);
});

test('dimanche 19h : rappel de fin de semaine, pas de rappel quotidien en double', () => {
  const msgs = computeMessages(at('2026-10-18T17:05:00Z'), [A, B], week);
  assert.deepEqual(msgs.map(m => m.key.split(':')[0]), ['sunday']);
  assert.match(msgs[0].body, /Four t'attend encore\. Sinon elle passe/);
});

test('lundi 9h : annonce de la semaine à tout le monde', () => {
  assert.deepEqual(keys(at('2026-10-12T07:15:00Z')), ['monday:a', 'monday:b']);
});

test('rappels désactivés et hors fenêtre', () => {
  const off = { ...A, notif: { mine: false, midweek: false } };
  assert.deepEqual(keys(at('2026-10-14T16:30:00Z'), [off]), []);
  assert.deepEqual(keys(at('2026-10-14T10:00:00Z')), []); // midi : rien
});
