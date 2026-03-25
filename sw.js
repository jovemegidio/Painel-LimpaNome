/* ═══════════════════════════════════════════
   Credbusiness — Service Worker (PWA)
   Cache-first para assets, Network-first para API
   ═══════════════════════════════════════════ */

const CACHE_NAME = 'credbusiness-v3';
const OFFLINE_URL = '/offline.html';

// Assets essenciais para cache inicial
const PRECACHE_ASSETS = [
  '/',
  '/login.html',
  '/register.html',
  '/offline.html',
  '/css/style.css',
  '/js/components.js',
  '/js/data.js',
  '/js/pwa.js',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/icon-maskable-192x192.png',
  '/icons/icon-maskable-512x512.png',
  // Páginas principais do app
  '/pages/dashboard.html',
  '/pages/limpa-nome-dashboard.html',
  '/pages/consultas.html',
  '/pages/financeiro.html',
  '/pages/configuracoes.html'
];

// ── Install: pré-cachear assets essenciais (individual para não falhar tudo) ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all(
        PRECACHE_ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] Falha ao cachear:', url, err);
          })
        )
      );
    })
  );
  self.skipWaiting();
});

// ── Activate: limpar caches antigos ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all([
        ...keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
        self.clients.claim()
      ])
    )
  );
});

// ── Fetch: estratégia por tipo de request ──
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorar requests não-GET
  if (request.method !== 'GET') return;

  // Ignorar requests para outros domínios (CDNs de fonts, FontAwesome, etc.)
  if (url.origin !== self.location.origin) return;

  // API calls → Network-first (tentar rede, fallback cache)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // SSE (Server-Sent Events) → ignorar
  if (url.pathname.startsWith('/events')) return;

  // Assets estáticos → Cache-first (cache, fallback rede)
  event.respondWith(cacheFirst(request));
});

// ── Estratégia Cache-first ──
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Se for navegação HTML, mostrar página offline
    if (request.mode === 'navigate') {
      const offlinePage = await caches.match(OFFLINE_URL);
      if (offlinePage) return offlinePage;
    }
    return new Response('Offline', { status: 503, statusText: 'Sem conexão' });
  }
}

// ── Estratégia Network-first ──
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;

    return new Response(
      JSON.stringify({ error: 'Sem conexão com o servidor' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ── Push notifications (preparado para uso futuro) ──
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    vibrate: [100, 50, 100],
    data: { url: data.url || '/' },
    actions: data.actions || []
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Credbusiness', options)
  );
});

// ── Clique na notificação ──
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
