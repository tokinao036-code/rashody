// Офлайн-режим. При изменении файлов увеличьте номер версии.
// Расходы хранятся отдельно (localStorage) — обновление их не трогает.
const VERSION = 'rashody-v3';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const offline = () => new Response('Нет соединения', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== location.origin && !isFont) return;

  // Страница: есть интернет — берём свежую (так обновления приходят сразу),
  // нет интернета или он медленный (>3 с) — открываем сохранённую.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const net = fetch(url.href.split('#')[0], { cache: 'no-cache', credentials: 'same-origin' })
        .then(res => { if (res.ok) cache.put('./index.html', res.clone()); return res; });
      try {
        const res = await Promise.race([net, new Promise((_, rej) => setTimeout(() => rej(0), 3000))]);
        if (res.ok) return res;
        throw 0;
      } catch (_) {
        e.waitUntil(net.catch(() => {}));
        return (await cache.match('./index.html')) || net.catch(offline);
      }
    })());
    return;
  }

  // Остальное (иконки, шрифты): сразу из кэша, в фоне обновляем
  e.respondWith(
    caches.open(VERSION).then(async cache => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then(res => {
          if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);
      if (cached) { e.waitUntil(network); return cached; }
      return (await network) || offline();
    })
  );
});
