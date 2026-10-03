/* Lets the app open fast on a weak connection.
   App files: network first, so an update you upload shows up right away.
   Firebase SDK and fonts: saved copy first -- those never change.
   Everything else (the database) goes straight to the network. */
const APP_CACHE = 'ff-app-v2';
const APP_FILES = [
  './', 'index.html', 'styles.css', 'app.js', 'data.js', 'store.js', 'demo.js', 'import.js',
  'firebase-config.js', 'manifest.json', 'icon-192.png', 'apple-touch-icon.png',
];
const HOME = new URL('./', self.location).href;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(APP_CACHE)
    .then(cache => Promise.allSettled(APP_FILES.map(url => cache.add(url))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== APP_CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = req.url;
  const forever = url.startsWith('https://www.gstatic.com/firebasejs/') || url.startsWith('https://fonts.g');
  if (forever) {
    event.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(APP_CACHE).then(c => c.put(req, copy));
      return res;
    })));
    return;
  }
  if (url.startsWith(HOME)) {
    event.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(APP_CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('./'))));
  }
});
