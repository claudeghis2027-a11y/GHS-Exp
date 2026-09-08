/* ============================================================================
   GHIS EXP — Service Worker  (S7)
   Deliberately conservative. It caches ONLY the static application shell.

   BUSINESS DATA IS NEVER CACHED.
   data.js and fixtures.js carry the actual budgets, items, prices and limits.
   Serving a stale copy of either would silently show outdated financial data,
   so they are always fetched from the network and never written to the cache.
   Everything else that is not explicitly listed is passed straight through.
   ========================================================================== */
var CACHE_VERSION = 'ghis-exp-v1';
var CACHE_NAME = CACHE_VERSION;

/* Static shell only — relative to the service worker scope (/GHS-Exp/). */
var SHELL = [
  './',
  './index.html',
  './engine.js',
  './manifest.json',
  './icons/ghis-exp-192.png',
  './icons/ghis-exp-512.png',
  './icons/ghis-exp-maskable-512.png'
];

/* Never cached — business data and test tooling. */
var NEVER_CACHE = ['data.js', 'fixtures.js', 'engine.tests.js', 'smoketest.js'];

function isBusinessData(url) {
  var path = url.pathname;
  for (var i = 0; i < NEVER_CACHE.length; i++) {
    if (path.indexOf('/' + NEVER_CACHE[i]) === path.length - NEVER_CACHE[i].length - 1) return true;
  }
  return false;
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) { return cache.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
      .catch(function () { /* a failed pre-cache must never block installation */ })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.map(function (n) {
        if (n !== CACHE_NAME) return caches.delete(n);   /* old cache cleanup */
        return null;
      }));
    }).then(function () { return self.clients.claim(); })
     .catch(function () { })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;                       /* never touch non-GET */

  var url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;        /* never touch cross-origin */
  if (isBusinessData(url)) return;                        /* business data: network only */

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        /* cache only successful same-origin shell responses */
        if (res && res.status === 200 && res.type === 'basic' && !isBusinessData(url)) {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function (c) { c.put(req, copy); }).catch(function () { });
        }
        return res;
      }).catch(function () {
        /* offline and not in cache: fall back to the shell for navigations only */
        if (req.mode === 'navigate') return caches.match('./index.html', { ignoreSearch: true });
        return Response.error();
      });
    })
  );
});
