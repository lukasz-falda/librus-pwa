/**
 * LIBRUS SYNERGIA PWA - SERVICE WORKER
 * Obsługuje cache'owanie i tryb offline
 */

const CACHE_NAME = 'librus-pwa-v1';
const STATIC_CACHE = 'librus-static-v1';
const DYNAMIC_CACHE = 'librus-dynamic-v1';

// Pliki do cache'owania przy instalacji
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png'
];

// ============================================
// INSTALACJA SERVICE WORKERA
// ============================================

self.addEventListener('install', (event) => {
    console.log('[SW] Instalacja...');

    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => {
                console.log('[SW] Cache\'owanie statycznych zasobów');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                // Natychmiast aktywuj nowego SW
                return self.skipWaiting();
            })
    );
});

// ============================================
// AKTYWACJA SERVICE WORKERA
// ============================================

self.addEventListener('activate', (event) => {
    console.log('[SW] Aktywacja...');

    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => {
                            // Usuń stare cache'e
                            return name !== STATIC_CACHE && name !== DYNAMIC_CACHE;
                        })
                        .map((name) => {
                            console.log('[SW] Usuwanie starego cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => {
                // Przejmij kontrolę nad wszystkimi klientami
                return self.clients.claim();
            })
    );
});

// ============================================
// OBSŁUGA ŻĄDAŃ (FETCH)
// ============================================

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Ignoruj żądania do innych domen (API backend)
    if (!url.origin.includes(self.location.origin)) {
        // Dla API - network first, bez cache'owania
        event.respondWith(
            fetch(request)
                .catch(() => {
                    // Jeśli offline i to żądanie API, zwróć błąd
                    return new Response(
                        JSON.stringify({ error: 'Brak połączenia z internetem' }),
                        {
                            status: 503,
                            headers: { 'Content-Type': 'application/json' }
                        }
                    );
                })
        );
        return;
    }

    // Dla statycznych zasobów - cache first
    if (STATIC_ASSETS.some(asset => url.pathname.endsWith(asset) || url.pathname === asset)) {
        event.respondWith(
            caches.match(request)
                .then((cachedResponse) => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    return fetch(request);
                })
        );
        return;
    }

    // Dla pozostałych - stale while revalidate
    event.respondWith(
        caches.match(request)
            .then((cachedResponse) => {
                const fetchPromise = fetch(request)
                    .then((networkResponse) => {
                        // Cache'uj nową odpowiedź
                        if (networkResponse.ok) {
                            const responseClone = networkResponse.clone();
                            caches.open(DYNAMIC_CACHE)
                                .then((cache) => {
                                    cache.put(request, responseClone);
                                });
                        }
                        return networkResponse;
                    })
                    .catch(() => {
                        // Jeśli offline i brak w cache, zwróć stronę offline
                        if (request.headers.get('accept').includes('text/html')) {
                            return caches.match('/index.html');
                        }
                        return null;
                    });

                // Zwróć cache jeśli dostępny, w tle odśwież
                return cachedResponse || fetchPromise;
            })
    );
});

// ============================================
// OBSŁUGA PUSH NOTIFICATIONS (opcjonalnie)
// ============================================

self.addEventListener('push', (event) => {
    if (!event.data) return;

    const data = event.data.json();

    const options = {
        body: data.body || 'Nowa wiadomość',
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-72.png',
        vibrate: [100, 50, 100],
        data: {
            url: data.url || '/'
        },
        actions: [
            { action: 'open', title: 'Otwórz' },
            { action: 'close', title: 'Zamknij' }
        ]
    };

    event.waitUntil(
        self.registration.showNotification(data.title || 'Librus Wiadomości', options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    if (event.action === 'close') return;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                // Jeśli aplikacja jest otwarta, skup na niej
                for (const client of clientList) {
                    if (client.url.includes(self.location.origin) && 'focus' in client) {
                        return client.focus();
                    }
                }
                // W przeciwnym razie otwórz nowe okno
                if (clients.openWindow) {
                    return clients.openWindow(event.notification.data.url || '/');
                }
            })
    );
});

// ============================================
// BACKGROUND SYNC (opcjonalnie)
// ============================================

self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-messages') {
        event.waitUntil(
            // Tutaj można dodać logikę synchronizacji w tle
            console.log('[SW] Background sync: sync-messages')
        );
    }
});

console.log('[SW] Service Worker załadowany');
