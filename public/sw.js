const CACHE_NAME = 'cutbind-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo.png',
  'https://fonts.googleapis.com/css2?family=Bangers&family=Permanent+Marker&family=Nunito:wght@400;600;700;900&display=swap'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request).catch(() => {
        // Fallback or ignore non-critical failures
      });
    })
  );
});
