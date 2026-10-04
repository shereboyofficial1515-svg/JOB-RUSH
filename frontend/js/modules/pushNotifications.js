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

  /**
   * Inside the Android app, push goes through Firebase (FCM), not the browser's
   * Web Push. The native side only reports a device token when Firebase first
   * creates or rotates it, which is typically before anyone has logged in, so
   * the server never learned the token. Here, once the person is signed in,
   * we ask for the Android notification permission (required on Android 13+,
   * and never requested anywhere else), fetch the token and register it with
   * the server. Safe to call on every page load: it only does work every 12h.
   */
  let nativeListenerBound = false;
  async function registerNative() {
    const cap = window.Capacitor;
    const plugin = cap && cap.Plugins && cap.Plugins.PushNotifications;
    if (!plugin) return;
    try {
      let perm = await plugin.checkPermissions();
      if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') perm = await plugin.requestPermissions();
      if (perm.receive !== 'granted') return;
      if (!resyncDue()) return;
      if (!nativeListenerBound) {
        nativeListenerBound = true;
        plugin.addListener('registration', (t) => {
          API.post('/notifications/push/fcm-token', { token: t.value })
            .then(() => { try { localStorage.setItem(RESYNC_KEY, String(Date.now())); } catch { /* ignore */ } })
            .catch(() => { /* retried on the next page load */ });
        });
        plugin.addListener('registrationError', (e) => console.warn('[push] FCM registration failed', e && e.error));
      }
      await plugin.register();
    } catch (err) {
      console.warn('[push] native registration skipped', err && err.message);
    }
  }

  async function registerIfAlreadySubscribed() {
    if (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) return registerNative();
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
