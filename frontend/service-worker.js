/**
 * JOB RUSH — Service worker.
 *
 * Two jobs:
 *  1. Web Push: receive push events and route notification clicks back into
 *     the app (unchanged).
 *  2. App-shell cache: serve the site's static files (HTML, CSS, JS, images,
 *     fonts) from a local cache so tapping a navigation item does not wait
 *     for ~15 network round trips before anything can render. On the live
 *     service a single static file costs about a second of latency, and a
 *     revalidation (304) costs just as much, so this is the difference
 *     between an instant tap and a multi-second one.
 *
 * Safety properties:
 *  - The server stamps __BUILD_ID__ per deploy (see server.js). A new deploy
 *    gets a new cache name and the old caches are deleted on activate, so a
 *    user is never stuck on old files; within one version every file in the
 *    cache comes from the same deploy.
 *  - /api/* (and anything not a plain same-origin GET) is NEVER cached or
 *    intercepted: data always comes fresh from the server, authentication is
 *    unaffected, and realtime streams are untouched.
 *  - Disabled (pure pass-through) in local development unless the server
 *    reports caching enabled, so edits show up immediately.
 */
const BUILD_ID = '__BUILD_ID__';
const CACHE_ENABLED = '__CACHE_ENABLED__' === 'true';
const CACHE_PREFIX = 'jr-static-';
const CACHE_NAME = `${CACHE_PREFIX}${BUILD_ID}`;

// Warmed at install so the very first tap on a bottom-nav item after a
// deploy is already local. Missing files must never fail the install.
const PRECACHE = [
  'pages/dashboard.html',
  'pages/profile-settings.html',
  'pages/messages.html',
  'pages/notifications.html',
  'css/tokens.css',
  'css/base.css',
  'css/components.css',
  'css/animations.css',
  'css/dashboard-pages.css',
  'js/config/assets.js',
  'js/config/env.js',
  'js/config/api.js',
  'js/modules/auth.js',
  'js/modules/sidebarNav.js',
  'js/modules/notificationBell.js',
  'js/utils/modal.js',
  'js/utils/toast.js',
  'assets/images/logo-48.png',
  'assets/images/logo-96.png',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  if (!CACHE_ENABLED) return;
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(PRECACHE.map((path) => cache.add(new Request(path, { cache: 'reload' })).catch(() => {})))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith(CACHE_PREFIX) && n !== CACHE_NAME).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

function isCacheable(request, url) {
  if (!CACHE_ENABLED) return false;
  if (request.method !== 'GET') return false;
  if (url.origin !== self.location.origin) return false;
  if (request.headers.has('range')) return false; // audio/video seeking
  const p = url.pathname;
  if (p.startsWith('/api/') || p === '/health' || p.startsWith('/.well-known/') || p === '/service-worker.js') return false;
  return true;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (!isCacheable(request, url)) return; // default network behaviour

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // HTML pages are identical regardless of ?query (tab=…, id=…), which the
      // page's own script reads, so match them ignoring the query string.
      const isHtml = request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/';
      const cached = await cache.match(request, { ignoreSearch: isHtml });
      if (cached) return cached;

      try {
        const response = await fetch(request);
        // Only complete, successful, same-origin responses are stored.
        if (response && response.status === 200 && response.type === 'basic') {
          cache.put(isHtml ? new Request(url.origin + url.pathname) : request, response.clone()).catch(() => {});
        }
        return response;
      } catch (err) {
        // Offline with nothing cached: let the browser show its normal error.
        throw err;
      }
    })()
  );
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'JOB RUSH', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'JOB RUSH';
  const options = {
    body: payload.body || '',
    icon: 'assets/images/logo-160.png',
    badge: 'assets/images/logo-96.png',
    tag: payload.tag || undefined,
    requireInteraction: !!payload.requireInteraction,
    data: payload.data || {},
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/**
 * Routes a click on the OS-level notification to the right in-app
 * screen: an incoming call goes to the dashboard (where
 * IncomingCallWatcher is already running and will surface the
 * answer/reject modal within its next 3s poll), a new message goes
 * straight to that conversation. If a Job Rush tab is already open,
 * it's focused and navigated in place rather than opening a duplicate
 * tab.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};

  let targetPath = 'pages/dashboard.html';
  if (data.type === 'incoming_call') {
    targetPath = 'pages/dashboard.html';
  } else if (data.conversationId) {
    targetPath = `pages/messages.html?conversation=${encodeURIComponent(data.conversationId)}`;
  }

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const targetUrl = new URL(targetPath, self.registration.scope).href;

      for (const client of allClients) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) await client.navigate(targetUrl);
          return;
        }
      }
      await self.clients.openWindow(targetUrl);
    })()
  );
});
