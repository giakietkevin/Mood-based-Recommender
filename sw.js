// KietStation service worker.
// - App shell and static assets work offline.
// - API calls, audio/video streams and range requests always go to the network.
// - Pages are fetched network-first so a deploy shows up immediately; scripts and styles are served from
//   the cache and refreshed in the background (stale-while-revalidate).
const CACHE_NAME = 'kietstation-pwa-v3';

const SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/app.css',
  '/css/facebook_layout.css',
  '/css/glassmorphism.css',
  '/css/station.css',
  '/js/app.js',
  '/js/auth-mongodb.js',
  '/js/discover.js',
  '/js/focus-mode.js',
  '/js/social.js',
  '/js/study-room.js',
  '/js/queue.js',
  '/js/listening.js',
  '/js/now-playing.js',
  '/js/i18n.js',
  '/favicon-32x32.png',
  '/android-chrome-192x192.png',
];

const NETWORK_ONLY_PREFIXES = [
  '/api/',
  '/search',
  '/recommend',
  '/generate-music',
  '/my-songs',
  '/generated_music',
  '/favorites',
  '/playlists',
  '/films',
  '/trending-songs',
  '/track-play',
  '/study-rooms',
  '/auth',
];

function isNetworkOnly(pathname) {
  return NETWORK_ONLY_PREFIXES.some((p) => pathname.startsWith(p));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    // addAll fails the whole install if one file 404s; add individually so one miss does not block the app
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(SHELL.map((u) => cache.add(u).catch(() => null)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  // media seeking uses Range: never answer those from a cache
  if (request.headers.has('range')) return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isNetworkOnly(url.pathname)) return;

  // page loads: network first, fall back to the cached shell when offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((c) => c.put('/index.html', clone));
          return response;
        })
        .catch(() => caches.match('/index.html').then((r) => r || caches.match('/')))
    );
    return;
  }

  // static assets: serve the cached copy, refresh it in the background
  event.respondWith(
    caches.match(request).then((cached) => {
      const refresh = fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || refresh;
    })
  );
});
