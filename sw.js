// 小野字幕君 PWA Service Worker —— 離線快取（同源資源）
const CACHE = 'xiaoye-pwa-v1';
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.addAll(PRECACHE);
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 不快取跨域資源（如 kuromoji 詞典）
  if (req.mode === 'navigate') {
    // 導覽請求：先給快取（瞬開），背景靜默更新；離線則回退快取
    e.respondWith((async function () {
      var cache = await caches.open(CACHE);
      var cached = await cache.match('./index.html');
      var network = fetch(req).then(function (res) {
        if (res && res.status === 200) cache.put(req, res.clone());
        return res;
      }).catch(function () { return null; });
      return cached || (await network) || cached;
    })());
    return;
  }
  // 靜態資源：快取優先，未命中再走網路並回填
  e.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (res) {
        if (res && res.status === 200) {
          caches.open(CACHE).then(function (c) { c.put(req, res.clone()); });
        }
        return res;
      }).catch(function () { return cached; });
    })
  );
});
