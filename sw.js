/* ==========================================================================
   Service worker — Briganti Nomogramı için çevrimdışı destek.
   Strateji: tüm uygulama kabuğu önbelleğe alınır, sonra önce-önbellek
   (uygulama tamamen statiktir ve sinyalsiz ortamda da çalışmalıdır); ağ
   varsa önbellek arka planda tazelenir.
   Her sürümde CACHE_VERSION değerini artırın; aksi halde istemciler eski
   dosyalarda kalır.
   ========================================================================== */

var CACHE_VERSION = 'briganti-v3.0.0';

var PRECACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(function (cache) { return cache.addAll(PRECACHE); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (key) {
          return key === CACHE_VERSION ? null : caches.delete(key);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;

  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(request).then(function (cached) {
      var network = fetch(request).then(function (response) {
        if (response && response.ok && response.type === 'basic') {
          var copy = response.clone();
          caches.open(CACHE_VERSION).then(function (cache) { cache.put(request, copy); });
        }
        return response;
      }).catch(function () {
        // Çevrimdışı: gezinme isteklerinde önbellekteki kabuğa dön.
        return cached || caches.match('./index.html');
      });

      return cached || network;
    })
  );
});
