const CACHE_NAME = 'inpamind-v4';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.svg',
  '/icon-512.svg',
  '/logo-inpamind.png'
];

// Install — cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — network first for everything, fallback to cache
self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  // API calls: network only
  if (request.url.includes('/api/')) {
    event.respondWith(fetch(request).catch(() => new Response(JSON.stringify({ error: 'Sin conexión' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    })));
    return;
  }

  // Static assets: network first, fallback to cache
  event.respondWith(
    fetch(request).then((response) => {
      if (response.status === 200) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
      }
      return response;
    }).catch(() => caches.match(request).then(cached => cached || caches.match('/index.html')))
  );
});
