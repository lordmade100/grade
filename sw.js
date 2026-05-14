// ════════════════════════════════════════════════════════════
// STEWARD AI — SERVICE WORKER
// Rare Grade Tech — PWA Offline Support
// Version: 1.0.0
// ════════════════════════════════════════════════════════════

const CACHE_NAME = 'steward-ai-v1';
const STATIC_CACHE = 'steward-static-v1';
const IMAGE_CACHE = 'steward-images-v1';
const FONT_CACHE = 'steward-fonts-v1';

// Core app shell — must be cached for offline functionality
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

// External CDN assets that should be cached
const CDN_ASSETS = [
  'https://unpkg.com/feather-icons',
  'https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&display=swap'
];

// Image assets
const IMAGE_ASSETS = [
  'https://i.postimg.cc/tRMK3mNK/Steward-logo.png',
  'https://i.postimg.cc/Wz7yBXJQ/steward-icon.png',
  'https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg'
];

// ════════════════════════════════════════════════════════════
// INSTALL — Cache core assets
// ════════════════════════════════════════════════════════════
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Steward AI Service Worker...');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching core assets...');
        return cache.addAll(CORE_ASSETS);
      })
      .then(() => {
        // Cache CDN assets separately
        return caches.open(STATIC_CACHE);
      })
      .then((cache) => {
        console.log('[SW] Caching static CDN assets...');
        // Use addAll with no-cors for cross-origin CSS/JS
        const promises = CDN_ASSETS.map(url => 
          fetch(url, { mode: 'no-cors' })
            .then(response => cache.put(url, response))
            .catch(err => console.warn('[SW] Failed to cache:', url, err))
        );
        return Promise.all(promises);
      })
      .then(() => {
        return caches.open(IMAGE_CACHE);
      })
      .then((cache) => {
        console.log('[SW] Caching image assets...');
        const promises = IMAGE_ASSETS.map(url =>
          fetch(url, { mode: 'no-cors' })
            .then(response => cache.put(url, response))
            .catch(err => console.warn('[SW] Failed to cache image:', url, err))
        );
        return Promise.all(promises);
      })
      .then(() => {
        console.log('[SW] Core assets cached successfully');
        return self.skipWaiting();
      })
      .catch((err) => {
        console.error('[SW] Install failed:', err);
      })
  );
});

// ════════════════════════════════════════════════════════════
// ACTIVATE — Clean up old caches
// ════════════════════════════════════════════════════════════
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Steward AI Service Worker...');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            // Delete old versions of our caches
            if (
              cacheName !== CACHE_NAME &&
              cacheName !== STATIC_CACHE &&
              cacheName !== IMAGE_CACHE &&
              cacheName !== FONT_CACHE
            ) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] Claiming clients...');
        return self.clients.claim();
      })
      .catch((err) => {
        console.error('[SW] Activation failed:', err);
      })
  );
});

// ════════════════════════════════════════════════════════════
// FETCH — Network-first with cache fallback strategy
// ════════════════════════════════════════════════════════════
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip Firebase Realtime Database/WebSocket connections
  if (
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('googleapis.com') ||
    url.pathname.includes('fire-b-a8878') ||
    url.protocol === 'wss:' ||
    url.protocol === 'ws:'
  ) {
    return;
  }

  // Skip Chrome extension requests
  if (url.protocol === 'chrome-extension:') {
    return;
  }

  // ════════════════════════════════════════════════════════════
  // STRATEGY 1: HTML pages — Network first, cache fallback
  // ════════════════════════════════════════════════════════════
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful response
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          console.log('[SW] Serving cached page for:', request.url);
          return caches.match(request).then((cached) => {
            if (cached) return cached;
            // Fallback to root if specific page not cached
            return caches.match('./steward-ai-pwa.html') || caches.match('./');
          });
        })
    );
    return;
  }

  // ════════════════════════════════════════════════════════════
  // STRATEGY 2: Images — Cache first, network fallback
  // ════════════════════════════════════════════════════════════
  if (request.destination === 'image' || url.pathname.match(/\.(png|jpg|jpeg|gif|svg|webp|ico)$/i)) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then((cache) => {
        return cache.match(request).then((cached) => {
          if (cached) {
            // Refresh cache in background
            fetch(request, { mode: 'no-cors' })
              .then((response) => {
                if (response.status === 200 || response.type === 'opaque') {
                  cache.put(request, response);
                }
              })
              .catch(() => {});
            return cached;
          }

          return fetch(request, { mode: 'no-cors' })
            .then((response) => {
              if (response.status === 200 || response.type === 'opaque') {
                cache.put(request, response.clone());
              }
              return response;
            })
            .catch(() => {
              // Return a fallback if image fails
              return new Response('', { status: 404, statusText: 'Image not cached' });
            });
        });
      })
    );
    return;
  }

  // ════════════════════════════════════════════════════════════
  // STRATEGY 3: Fonts — Cache first, network fallback
  // ════════════════════════════════════════════════════════════
  if (request.destination === 'font' || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.open(FONT_CACHE).then((cache) => {
        return cache.match(request).then((cached) => {
          if (cached) return cached;

          return fetch(request)
            .then((response) => {
              if (response.status === 200) {
                cache.put(request, response.clone());
              }
              return response;
            });
        });
      })
    );
    return;
  }

  // ════════════════════════════════════════════════════════════
  // STRATEGY 4: CSS/JS/JSON — Stale-while-revalidate
  // ════════════════════════════════════════════════════════════
  if (
    request.destination === 'style' ||
    request.destination === 'script' ||
    request.destination === 'manifest' ||
    url.pathname.match(/\.(css|js|json)$/i)
  ) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) => {
        return cache.match(request).then((cached) => {
          const fetchPromise = fetch(request)
            .then((networkResponse) => {
              if (networkResponse.status === 200) {
                cache.put(request, networkResponse.clone());
              }
              return networkResponse;
            })
            .catch(() => cached);

          return cached || fetchPromise;
        });
      })
    );
    return;
  }

  // ════════════════════════════════════════════════════════════
  // STRATEGY 5: Everything else — Network with cache fallback
  // ════════════════════════════════════════════════════════════
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(request).then((cached) => {
          if (cached) return cached;
          return new Response('Offline — Content not available', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain' }
          });
        });
      })
  );
});

// ════════════════════════════════════════════════════════════
// BACKGROUND SYNC — Queue failed requests
// ════════════════════════════════════════════════════════════
self.addEventListener('sync', (event) => {
  if (event.tag === 'steward-sync') {
    console.log('[SW] Background sync triggered');
    event.waitUntil(
      // Re-attempt any queued operations
      Promise.resolve()
    );
  }
});

// ════════════════════════════════════════════════════════════
// PUSH NOTIFICATIONS — Support for future features
// ════════════════════════════════════════════════════════════
self.addEventListener('push', (event) => {
  console.log('[SW] Push received:', event);

  const options = {
    body: event.data ? event.data.text() : 'New message from Rare Grade Tech',
    icon: './icon-192x192.png',
    badge: './icon-72x72.png',
    tag: 'steward-notification',
    requireInteraction: true,
    actions: [
      { action: 'open', title: 'Open App' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('Steward AI', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'open' || !event.action) {
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then((clientList) => {
          if (clientList.length > 0) {
            return clientList[0].focus();
          }
          return clients.openWindow('./steward-ai-pwa.html');
        })
    );
  }
});

// ════════════════════════════════════════════════════════════
// MESSAGE HANDLER — Communication with main thread
// ════════════════════════════════════════════════════════════
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }
});

console.log('[SW] Steward AI Service Worker loaded');
