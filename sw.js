/* ============================================================================
   GHIS EXP — Service Worker  (S7 · cache strategy v2)
   Deliberately conservative. It caches ONLY the static application shell.

   BUSINESS DATA IS NEVER CACHED.
   data.js and fixtures.js carry the actual budgets, items, prices and limits.
   Serving a stale copy of either would silently show outdated financial data,
   so they are always fetched from the network and never written to the cache.

   UPDATE STRATEGY
   index.html and every navigation request are NETWORK-FIRST: a fresh copy is
   fetched, returned and written back to the cache on every successful load, so
   a new GitHub Pages deployment appears on an ordinary Refresh. The cached copy
   is used only when the network fails, which keeps the offline shell working
   without ever pinning the application to an old build.
   Other shell assets stay cache-first for speed; the versioned cache name is
   what retires them.
   ========================================================================== */
var CACHE_VERSION = 'ghis-exp-v3';
var CACHE_NAME = CACHE_VERSION;
var CACHE_PREFIX = 'ghis-exp-';

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

/* index.html and the scope root must always be revalidated against the network */
function isShellDocument(req, url) {
  if (req.mode === 'navigate') return true;
  var path = url.pathname;
  if (path.indexOf('/index.html') === path.length - 11) return true;
  if (path === self.registration.scope.replace(self.location.origin, '')) return true;
  if (path.charAt(path.length - 1) === '/') return true;
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
        /* old cache cleanup — retire every previous GHIS EXP cache version */
        if (n !== CACHE_NAME && n.indexOf(CACHE_PREFIX) === 0) return caches.delete(n);
        if (n !== CACHE_NAME) return caches.delete(n);
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

  /* ---- NETWORK-FIRST: navigations and index.html ---- */
  if (isShellDocument(req, url)) {
    event.respondWith(
      fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();                          /* refresh the cached shell */
          caches.open(CACHE_NAME).then(function (c) { c.put(req, copy); }).catch(function () { });
        }
        return res;
      }).catch(function () {
        /* offline only: fall back to whatever shell copy we hold */
        return caches.match(req, { ignoreSearch: true }).then(function (hit) {
          return hit || caches.match('./index.html', { ignoreSearch: true });
        });
      })
    );
    return;
  }

  /* ---- CACHE-FIRST: the remaining static shell assets ---- */
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic' && !isBusinessData(url)) {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function (c) { c.put(req, copy); }).catch(function () { });
        }
        return res;
      }).catch(function () {
        if (req.mode === 'navigate') return caches.match('./index.html', { ignoreSearch: true });
        return Response.error();
      });
    })
  );
});
