/**
 * JOB RUSH — Accessibility settings bootstrap.
 * Included on every page (see chrome.js / each page's script list) so
 * text size / high contrast / reduced motion apply everywhere, not
 * just on the Settings page itself. Applies a cached copy from
 * localStorage immediately (works even logged out, and avoids
 * waiting on a network round trip), then reconciles with the
 * server-side value — which is the one that actually persists across
 * devices and survives logging out and back in — as soon as it's
 * available.
 */
const Accessibility = (function () {
  const CACHE_KEY = 'jr_accessibility_cache';

  function apply({ textSize, highContrast, reducedMotion }) {
    const root = document.documentElement;
    if (textSize) root.setAttribute('data-text-size', textSize);
    root.setAttribute('data-high-contrast', String(!!highContrast));
    root.setAttribute('data-reduced-motion', String(!!reducedMotion));
  }

  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writeCache(prefs) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(prefs));
    } catch {
      // Private browsing / storage disabled — the in-memory apply()
      // above still worked for this page load, just won't persist
      // across a reload without the server round trip below.
    }
  }

  const cached = readCache();
  if (cached) apply(cached);

  /**
   * Call once per page, after API is available, to sync with the
   * authoritative server value. Silently does nothing when logged
   * out — accessibility prefs are only ever fetched for an
   * authenticated user, and the cached copy (or defaults) covers
   * logged-out pages.
   */
  async function syncWithServer() {
    if (typeof API === 'undefined') return;
    try {
      const { settings } = await API.get('/settings');
      const prefs = {
        textSize: settings.text_size,
        highContrast: settings.high_contrast,
        reducedMotion: settings.reduced_motion,
      };
      apply(prefs);
      writeCache(prefs);
    } catch {
      // Not logged in, or offline — the cached/default appearance
      // already applied above stands.
    }
  }

  syncWithServer();

  return { apply, writeCache };
})();
