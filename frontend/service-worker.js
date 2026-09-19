/**
 * JOB RUSH — Service worker.
 * Exists solely to receive Web Push events and route notification
 * clicks back into the app; this is not an offline/asset-caching
 * worker (no fetch handler, no cache — every request still goes to
 * the network exactly as it does today). Scope is the whole origin so
 * it can receive push events regardless of which page registered it.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
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
