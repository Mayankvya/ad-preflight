const CACHE = 'ad-preflight-v1';
const ASSETS = [
  './', './index.html', './css/app.css', './icons/icon.svg',
  './js/app.js', './js/rules.js', './js/policies.js', './js/highlight.js', './js/rewrite.js',
  './js/ai-client.js', './js/ai-worker.js', './js/opfs-cache.js', './js/progress.js',
  './vendor/transformers.min.js', './vendor/ort/ort-wasm-simd-threaded.asyncify.mjs', './vendor/ort/ort-wasm-simd-threaded.asyncify.wasm',
];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('ad-preflight-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// App files: cache first. Model files from huggingface.co are left to the OPFS cache.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit ?? fetch(e.request)));
});
