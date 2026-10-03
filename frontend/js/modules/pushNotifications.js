/**
 * JOB RUSH — Web Push client.
 * Wraps service worker registration + the browser's PushManager so
 * callers (the Chat Settings toggle) only deal with three actions:
 * isSupported, subscribe, unsubscribe. Never auto-prompts for
 * permission on page load — a cold permission prompt the user didn't
 * ask for gets auto-denied by most browsers and can never be asked
 * again, so this only runs from an explicit "Enable notifications"
 * click.
 */
const PushNotifications = (function () {
  const SW_PATH = '/service-worker.js';

  function isSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }

  function getPermissionState() {
    return isSupported() ? Notification.permission : 'unsupported';
  }

  // The browser's PushManager wants the VAPID public key as a raw
  // Uint8Array, but it's handed out as a base64url string — this is
  // the standard conversion, not app-specific logic.
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
  }

  async function registerServiceWorker() {
    if (!isSupported()) return null;
    return navigator.serviceWorker.register(SW_PATH, { scope: '/' });
  }

  /** Registers the service worker if push was already granted+subscribed in an earlier visit — safe/cheap to call on every page load, does not prompt. */
  // The subscription only needs re-syncing to the server now and then (it is
  // an upsert, for the rare case the server lost its copy). Doing it on every
  // page load meant a write request on every navigation.
  const RESYNC_KEY = 'jr.push.synced';
  const RESYNC_EVERY_MS = 12 * 60 * 60 * 1000;
  function resyncDue() {
    try { return Date.now() - Number(localStorage.getItem(RESYNC_KEY) || 0) > RESYNC_EVERY_MS; } catch { return true; }
  }

  async function registerIfAlreadySubscribed() {
    if (!isSupported() || Notification.permission !== 'granted') return;
    if (!resyncDue()) return;
    try {
      const registration = await registerServiceWorker();
      const existing = await registration.pushManager.getSubscription();
      if (!existing) return;
      // Re-sync in case the backend's copy was lost (e.g. DB restore)
      // without the browser knowing — cheap no-op otherwise since the
      // subscribe endpoint upserts by endpoint URL.
      await API.post('/notifications/push/subscribe', { subscription: existing.toJSON() });
      try { localStorage.setItem(RESYNC_KEY, String(Date.now())); } catch { /* ignore */ }
    } catch {
      // Best-effort only — never blocks page load.
    }
  }

  /** Explicit opt-in: requests permission, subscribes, and tells the backend. Returns true on success. */
  async function subscribe() {
    if (!isSupported()) throw new Error('This browser does not support push notifications.');

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error(permission === 'denied' ? 'Notification permission was denied.' : 'Notification permission was not granted.');
    }

    const { publicKey, configured } = await API.get('/notifications/push/public-key');
    if (!configured || !publicKey) {
      throw new Error('Push notifications are not configured on the server yet.');
    }

    const registration = await registerServiceWorker();
    await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    await API.post('/notifications/push/subscribe', { subscription: subscription.toJSON() });
    return true;
  }

  async function unsubscribe() {
    if (!isSupported()) return;
    const registration = await navigator.serviceWorker.getRegistration(SW_PATH);
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    await API.post('/notifications/push/unsubscribe', { endpoint }).catch(() => {});
  }

  return { isSupported, getPermissionState, registerIfAlreadySubscribed, subscribe, unsubscribe };
})();
