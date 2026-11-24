/**
 * JOB RUSH — share a link: one implementation for every Share button.
 *
 * Order of preference:
 *   1. Inside the Android app: the native share sheet via Capacitor's Share
 *      plugin. Android's WebView has no navigator.share, so without this the
 *      app could only ever copy the link. (An installed app built before the
 *      plugin was added simply skips this step.)
 *   2. In a browser: the Web Share API (navigator.share), when the browser
 *      supports sharing this data.
 *   3. Otherwise, or when the share sheet refuses (anything but the person
 *      cancelling): copy the link to the clipboard and say so.
 *
 * Closing the share sheet without choosing an app is the person's decision, so
 * it does nothing further -- no surprise copy, no error.
 *
 *   await Share.link({ title, text, url, copiedMessage })
 *   → 'shared' | 'cancelled' | 'copied' | 'failed'
 */
const Share = (function () {
  function nativeSharePlugin() {
    const cap = window.Capacitor;
    if (!cap || typeof cap.isNativePlatform !== 'function' || !cap.isNativePlatform()) return null;
    const plugin = cap.Plugins && cap.Plugins.Share;
    return plugin && typeof plugin.share === 'function' ? plugin : null;
  }

  const isCancel = (err) => !!err && (err.name === 'AbortError' || /cancel/i.test(String(err.message || err)));

  async function copy(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch { /* fall through to the older copy path */ }
    // Older WebViews / non-secure contexts: a hidden textarea and execCommand.
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }

  async function link({ title, text, url, copiedMessage = 'Link copied to clipboard!' }) {
    const data = { title, text, url };

    const plugin = nativeSharePlugin();
    if (plugin) {
      try {
        await plugin.share({ ...data, dialogTitle: title });
        return 'shared';
      } catch (err) {
        if (isCancel(err)) return 'cancelled';
        // Any other failure: fall back to copying below.
      }
    } else if (typeof navigator.share === 'function' && (typeof navigator.canShare !== 'function' || navigator.canShare(data))) {
      try {
        await navigator.share(data);
        return 'shared';
      } catch (err) {
        if (isCancel(err)) return 'cancelled';
        // NotAllowedError, DataError, ... : the sheet couldn't open, so copy instead.
      }
    }

    if (await copy(url)) {
      if (typeof Toast !== 'undefined') Toast.success(copiedMessage);
      return 'copied';
    }
    if (typeof Toast !== 'undefined') Toast.error('Couldn’t share or copy the link. Copy it from the address bar instead.');
    return 'failed';
  }

  return { link, copy };
})();
