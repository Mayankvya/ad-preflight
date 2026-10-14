// Offline support. App files are fetched from the network first, so fixes reach
// returning visitors, and kept in a cache for when there is no connection.
// The 27 MB model runtime in vendor/ is not precached: it is cached the first
// time someone actually asks for a rewrite. Model weights live on OPFS.
const CACHE = 'ad-preflight-v2';
const SHELL = [
  './', './index.html', './css/app.css', './icons/icon.svg',
  './js/app.js', './js/rules.js', './js/policies.js', './js/highlight.js', './js/rewrite.js',
  './js/ai-client.js', './js/ai-worker.js', './js/opfs-cache.js', './js/progress.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('ad-preflight-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(fetch(e.request)
    .then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
