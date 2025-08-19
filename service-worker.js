const CACHE = 'acc-pwa-v1';
const APP_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  // External libs to precache (best effort; they’ll also be cached on first use)
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/dayjs@1/dayjs.min.js',
  'https://cdn.jsdelivr.net/npm/dayjs@1/plugin/utc.js',
  'https://cdn.jsdelivr.net/npm/dayjs@1/plugin/timezone.js',
  'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
  'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/gh/tailwindlabs/heroicons@v2.1.5/24/solid/currency-rupee.svg',
  'https://cdn.jsdelivr.net/gh/tailwindlabs/heroicons@v2.1.5/24/solid/cash.svg'
];

// Install: cache core assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(APP_ASSETS)).then(()=>self.skipWaiting())
  );
});

// Activate: remove old caches
self.addEventListener('activate', event => {
  event.waitUntil((async ()=>{
    const keys = await caches.keys();
    await Promise.all(keys.map(k=> k!==CACHE ? caches.delete(k) : null));
    await self.clients.claim();
  })());
});

// Fetch: cache-first, then network; put successful responses in cache
self.addEventListener('fetch', event => {
  const req = event.request;
  if(req.method !== 'GET') return;

  event.respondWith((async ()=>{
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    if(cached) return cached;
    try{
      const res = await fetch(req);
      // Only cache basic/cors 200 responses
      if(res && res.status===200 && (res.type==='basic' || res.type==='cors')){
        cache.put(req, res.clone());
      }
      return res;
    } catch(err){
      // Fallback: if requesting our root/html, return cached index
      if(req.mode==='navigate'){
        const shell = await cache.match('./index.html');
        if(shell) return shell;
      }
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    }
  })());
});
