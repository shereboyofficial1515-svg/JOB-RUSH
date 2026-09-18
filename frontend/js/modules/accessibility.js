/**
 * JOB RUSH — Accessibility + chat appearance settings bootstrap.
 * Included on every page (see chrome.js / each page's script list) so
 * text size / high contrast / reduced motion apply everywhere, not
 * just on the Settings page itself. Applies a cached copy from
 * localStorage immediately (works even logged out, and avoids
 * waiting on a network round trip), then reconciles with the
 * server-side value — which is the one that actually persists across
 * devices and survives logging out and back in — as soon as it's
 * available.
 *
 * Chat theme/wallpaper live in this same module (not a separate one)
 * because they come from the exact same GET /api/settings row as the
 * accessibility fields — a second module would just be a second fetch
 * of the same data. They're applied as html[data-chat-theme]/
 * [data-chat-wallpaper]; see dashboard-pages.css for the actual
 * chat-scoped styling those attributes drive. Being on <html> rather
 * than the chat container means messages.html rebuilding the thread
 * panel's innerHTML on every conversation switch never resets them —
 * the CSS descendant selectors just keep matching.
 */
const Accessibility = (function () {
  const CACHE_KEY = 'jr_accessibility_cache';
  let currentPrefs = {};

  function apply(prefs) {
    const { textSize, highContrast, reducedMotion, chatTheme, chatWallpaper } = prefs;
    currentPrefs = prefs;
    const root = document.documentElement;
    if (textSize) root.setAttribute('data-text-size', textSize);
    root.setAttribute('data-high-contrast', String(!!highContrast));
    root.setAttribute('data-reduced-motion', String(!!reducedMotion));
    if (chatTheme) root.setAttribute('data-chat-theme', chatTheme);
    if (chatWallpaper) root.setAttribute('data-chat-wallpaper', chatWallpaper);
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

  function prefsFromSettings(settings) {
    return {
      textSize: settings.text_size,
      highContrast: settings.high_contrast,
      reducedMotion: settings.reduced_motion,
      chatTheme: settings.chat_theme,
      chatWallpaper: settings.chat_wallpaper,
      // Not a DOM attribute -- apply() ignores this, it just rides
      // along in the cached/synced prefs object so other modules
      // (incomingCallWatcher.js) can read it via getPrefs() instead
      // of fetching /settings a second time.
      callRingtoneEnabled: settings.call_ringtone_enabled,
    };
  }

  /**
   * Applies + caches a raw GET/PATCH /api/settings response directly —
   * exported so a page that just PATCHed a setting (e.g. Chat Settings
   * changing chatTheme/chatWallpaper) can re-apply the fresh value
   * immediately instead of waiting for the next page load's
   * syncWithServer() call, without duplicating this mapping.
   */
  function applyFromSettings(settings) {
    const prefs = prefsFromSettings(settings);
    apply(prefs);
    writeCache(prefs);
  }

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
      applyFromSettings(settings);
    } catch {
      // Not logged in, or offline — the cached/default appearance
      // already applied above stands.
    }
  }

  syncWithServer();

  /** Last-known prefs (cached or server-synced) — undefined fields mean "not yet known", not "off". */
  function getPrefs() {
    return currentPrefs;
  }

  return { apply, applyFromSettings, writeCache, getPrefs };
})();
