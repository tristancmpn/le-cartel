// Service worker : reçoit les notifications et ouvre l'app quand on touche une notification.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { body: e.data?.text() }; }
  const title = data.title || 'Le Cartel';
  e.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: data.tag,
    data: { url: data.url || './' },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || './', self.registration.scope).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) { if (w.url.startsWith(self.registration.scope)) { await w.focus(); return w.navigate(url); } }
    return self.clients.openWindow(url);
  })());
});

// Requis par certains navigateurs pour proposer l'installation ; pas de cache hors-ligne (Wi-Fi supposé).
self.addEventListener('fetch', () => {});
