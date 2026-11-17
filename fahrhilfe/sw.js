// Service Worker der Fahrhilfe: zeigt Mitteilungen (= Vibration auf dem iPhone)
// und hält die App auch bei schlechtem Netz verfügbar.
const CACHE = 'fahrhilfe-v4';
const SHELL = ['./', 'index.html', 'core.js', 'data.json', 'manifest.webmanifest', 'icon-192.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('fahrhilfe-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return res; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
self.addEventListener('message', e => {
  const d = e.data || {};
  if (d.type === 'notify') {
    e.waitUntil(new Promise(r => setTimeout(r, d.delay || 0)).then(() => self.registration.showNotification(d.title, { body: d.body || 'Fahrhilfe', tag: 'fahrhilfe-' + Date.now(), silent: false, icon: 'icon-192.png' }))
      .then(() => new Promise(r => setTimeout(r, 4000)))
      .then(() => self.registration.getNotifications())
      .then(ns => ns.forEach(n => n.close())));
  }
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(cs => cs.length ? cs[0].focus() : self.clients.openWindow('./')));
});
