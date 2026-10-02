/**
 * JOB RUSH — Native (Capacitor) bridge helper.
 *
 * The Android app is a Capacitor shell that loads the live site; its
 * native bridge injects window.Capacitor, with each installed native
 * plugin reachable as window.Capacitor.Plugins.<PluginName>. This is the
 * ONE place the web code asks "am I inside the app?" and looks up a
 * plugin, so nothing else sprinkles `window.Capacitor` checks around and
 * the site works unchanged in a normal browser (where all of this is
 * inert).
 *
 * Loaded on demand by auth.js, only inside the native app.
 */
const Native = (function () {
  function cap() {
    return typeof window !== 'undefined' ? window.Capacitor : undefined;
  }

  function isNative() {
    try {
      const c = cap();
      return !!(c && typeof c.isNativePlatform === 'function' && c.isNativePlatform());
    } catch {
      return false;
    }
  }

  /** 'android' | 'ios' | 'web' */
  function platform() {
    try {
      const c = cap();
      return isNative() && typeof c.getPlatform === 'function' ? c.getPlatform() : 'web';
    } catch {
      return 'web';
    }
  }

  /** The bridged native plugin object, or null when it isn't in this build of the app. */
  function plugin(name) {
    const c = cap();
    return (c && c.Plugins && c.Plugins[name]) || null;
  }

  /**
   * Subtle haptic feedback via @capacitor/haptics when present.
   * kind: 'success' | 'warning' | 'error' | 'light' | 'selection'.
   * Best-effort and silent: never throws, does nothing on the web or on
   * an app build without the plugin. Used sparingly (biometric success,
   * a completed payment action, an error) — not on ordinary taps.
   */
  async function haptic(kind) {
    const h = plugin('Haptics');
    if (!h) return;
    try {
      if (kind === 'success') await h.notification({ type: 'SUCCESS' });
      else if (kind === 'warning') await h.notification({ type: 'WARNING' });
      else if (kind === 'error') await h.notification({ type: 'ERROR' });
      else if (kind === 'selection') await h.selectionChanged();
      else await h.impact({ style: 'LIGHT' });
    } catch {
      // Haptics are decoration; never let one break a flow.
    }
  }

  return { isNative, platform, plugin, haptic };
})();
