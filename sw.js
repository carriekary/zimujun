// 小野字幕君 PWA Service Worker —— 離線快取（同源資源）
// v2: 修正導覽請求 stale-while-revalidate 的 key 不一致 bug（舊版背景更新寫入 req.url、
//     讀取卻固定 './index.html'，導致新版 index.html 永遠無法覆寫預快取的那份，
//     手機持續吃到舊版）。版號一併 bump，安裝時會刪除 v1 舊快取並重新預快取最新檔案。
const CACHE = 'xiaoye-pwa-v2';
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
      // 逐個 add 並各自 catch：單一資源失敗（暫時 404／網路抖動）不可讓整個 install 失敗，
      // 否則 SW 永遠無法 activate，舊版會持續餵舊內容（手機卡舊版的頭號原因）。
      return Promise.all(PRECACHE.map(function (u) {
        return c.add(u).catch(function () {});
      }));
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
    // 導覽請求：快取先給（瞬開、離線可用），背景靜默更新。
    // 注意：更新必須同時寫入「實際請求 key」與 canonical './index.html'，
    // 否則讀取端（固定 ./index.html）永遠拿不到新版。
    e.respondWith((async function () {
      var cache = await caches.open(CACHE);
      var cached = (await cache.match(req)) || (await cache.match('./index.html'));
      var network = fetch(req).then(function (res) {
        if (res && res.status === 200) {
          cache.put(req, res.clone());
          cache.put('./index.html', res.clone()); // 同步覆寫 canonical key
        }
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
