/**
 * JOB RUSH — Connectivity awareness.
 *
 * Shows a slim "You're offline" banner while the device has no network
 * and announces recovery. It also exposes Connectivity.isOnline() so
 * money screens can refuse to act (or label data as possibly stale)
 * rather than let an offline client assume a transaction went through.
 * Financial state is never invented client-side: balances come from the
 * server and are shown with when they were last fetched.
 */
const Connectivity = (function () {
  let banner = null;
  let started = false;

  function isOnline() {
    return navigator.onLine !== false;
  }

  function ensureBanner() {
    if (banner) return banner;
    banner = document.createElement('div');
    banner.className = 'offline-banner';
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');
    document.body.appendChild(banner);
    return banner;
  }

  function update() {
    const online = isOnline();
    document.documentElement.classList.toggle('is-offline', !online);
    const el = ensureBanner();
    if (!online) {
      el.textContent = 'You’re offline. What you see may be out of date.';
      el.classList.add('is-visible');
    } else if (el.classList.contains('is-visible')) {
      el.textContent = 'Back online';
      setTimeout(() => el.classList.remove('is-visible'), 1500);
    }
    document.dispatchEvent(new CustomEvent('jr:connectivity', { detail: { online } }));
  }

  function start() {
    if (started) return;
    started = true;
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    if (!isOnline()) update();
  }

  return { start, isOnline };
})();
