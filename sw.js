// Keep this URL stable: earlier releases already registered ./sw.js.
const CACHE_PREFIX = 'kanban-app-shell-';
const CACHE_NAME = CACHE_PREFIX + '20261026';
const INDEX_URL = new URL('./index.html', self.registration.scope).href;
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || !request.url.startsWith(self.registration.scope)) return;
  const url = new URL(request.url);
  const isDocument = request.mode === 'navigate' || request.destination === 'document'
    || url.pathname === new URL(self.registration.scope).pathname || url.pathname === new URL(INDEX_URL).pathname;
  if (!isDocument) return;
  // Always ask the server for HTML; cache is only an offline fallback.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(request, { cache:'no-cache' });
      if (response.ok) event.waitUntil(cache.put(INDEX_URL, response.clone()));
      return response;
    } catch {
      return await cache.match(INDEX_URL) || new Response('离线：请联网后重新打开看板。', {
        status:503, headers:{ 'Content-Type':'text/plain; charset=utf-8' }
      });
    }
  })());
});
