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

  const systemDarkQuery = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');

  /** 'light'/'dark' pass through; 'system' (or unset) follows the OS. */
  function resolveTheme(siteTheme) {
    if (siteTheme === 'light' || siteTheme === 'dark') return siteTheme;
    return systemDarkQuery && systemDarkQuery.matches ? 'dark' : 'light';
  }

  function apply(prefs) {
    const { textSize, highContrast, reducedMotion, chatTheme, chatWallpaper, siteTheme } = prefs;
    currentPrefs = prefs;
    const root = document.documentElement;
    if (textSize) root.setAttribute('data-text-size', textSize);
    root.setAttribute('data-high-contrast', String(!!highContrast));
    root.setAttribute('data-reduced-motion', String(!!reducedMotion));
    if (chatTheme) root.setAttribute('data-chat-theme', chatTheme);
    if (chatWallpaper) root.setAttribute('data-chat-wallpaper', chatWallpaper);
    root.setAttribute('data-theme', resolveTheme(siteTheme));
  }

  // A saved preference of 'system' (or no preference yet, e.g. a
  // logged-out visitor) should track OS changes live, without needing
  // a reload — re-resolve and re-apply whenever the OS scheme flips,
  // but only while the effective preference is still "system".
  if (systemDarkQuery) {
    const onSystemChange = () => {
      if (!currentPrefs.siteTheme || currentPrefs.siteTheme === 'system') {
        document.documentElement.setAttribute('data-theme', resolveTheme(currentPrefs.siteTheme));
      }
    };
    if (systemDarkQuery.addEventListener) systemDarkQuery.addEventListener('change', onSystemChange);
    else if (systemDarkQuery.addListener) systemDarkQuery.addListener(onSystemChange);
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

  // Apply immediately, even before any cache/server value is known, so
  // a first-time or logged-out visitor sees their OS's color scheme
  // right away instead of a flash of the light-mode default.
  const cached = readCache();
  apply(cached || { siteTheme: 'system' });

  function prefsFromSettings(settings) {
    return {
      textSize: settings.text_size,
      highContrast: settings.high_contrast,
      reducedMotion: settings.reduced_motion,
      siteTheme: settings.site_theme,
      chatTheme: settings.chat_theme,
      chatWallpaper: settings.chat_wallpaper,
      // Not a DOM attribute -- apply() ignores this, it just rides
      // along in the cached/synced prefs object so other modules
      // (incomingCallWatcher.js) can read it via getPrefs() instead
      // of fetching /settings a second time.
      callRingtoneEnabled: settings.call_ringtone_enabled,
      callRingtoneId: settings.call_ringtone_id,
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
  // GET /settings used to run on EVERY page load, including public pages for signed-out
  // visitors (a guaranteed 401) and every bottom-nav tap for signed-in users (a ~1s request
  // for data that almost never changes). Now: skipped while this tab knows the visitor is
  // signed out, and for 10 minutes after the last successful sync. Changes made on this
  // device are applied immediately (applyFromSettings), and a login forces a fresh sync.
  const SYNCED_AT_KEY = 'jr_accessibility_synced_at';
  const SYNCED_FOR_KEY = 'jr_accessibility_synced_for';
  const SYNC_EVERY_MS = 10 * 60 * 1000;
  function syncNeeded() {
    try {
      const anonAt = Number(sessionStorage.getItem('jr.anon.v1') || 0);
      if (anonAt && Date.now() - anonAt < 5 * 60 * 1000) return false; // known signed out
      // A different account than the one whose settings are cached (OAuth sign-in, account switch): sync now.
      const cachedUser = JSON.parse(sessionStorage.getItem('jr.user.v1') || 'null');
      if (cachedUser && localStorage.getItem(SYNCED_FOR_KEY) !== cachedUser.id) return true;
      return Date.now() - Number(localStorage.getItem(SYNCED_AT_KEY) || 0) > SYNC_EVERY_MS;
    } catch { return true; }
  }

  async function syncWithServer(force = false) {
    if (typeof API === 'undefined') return;
    if (!force && !syncNeeded()) return;
    try {
      const { settings } = await API.get('/settings');
      applyFromSettings(settings);
      try {
        localStorage.setItem(SYNCED_AT_KEY, String(Date.now()));
        const u = JSON.parse(sessionStorage.getItem('jr.user.v1') || 'null');
        if (u) localStorage.setItem(SYNCED_FOR_KEY, u.id);
      } catch { /* ignore */ }
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

  /**
   * Sets the site theme preference — usable by anyone, logged in or
   * not. Applies + caches immediately for instant feedback; if the
   * visitor is logged in, also persists to their account so it
   * follows them across devices. A logged-out choice still sticks on
   * this device via the cache, same as every other accessibility pref.
   */
  async function setSiteTheme(siteTheme) {
    const prefs = { ...currentPrefs, siteTheme };
    apply(prefs);
    writeCache(prefs);
    if (typeof API === 'undefined') return;
    try {
      await API.patch('/settings', { siteTheme });
    } catch {
      // Logged out, or offline — the local cache above already stands.
    }
  }

  return { apply, applyFromSettings, writeCache, getPrefs, setSiteTheme, resolveTheme, syncWithServer };
})();
