/**
 * JOB RUSH — shell status (one poller for the app chrome).
 *
 * The notification bell and the bottom-nav message badge used to run their
 * own pollers (two requests on every page load and every 30s, plus a push
 * re-subscribe call). This is a single GET /api/notifications/summary that
 * returns both counts, shared by every subscriber, de-duplicated while in
 * flight, refreshed on a slow timer, on return to the tab, and instantly when
 * the realtime stream reports message activity.
 *
 *   ShellStatus.subscribe(({ notifications, messages }) => { ... })
 */
const ShellStatus = (function () {
  const POLL_MS = 30000;
  const subscribers = new Set();
  let last = null;
  let inflight = null;
  let started = false;
  let debounce = null;

  function publish(data) {
    last = data;
    subscribers.forEach((fn) => { try { fn(data); } catch (err) { console.error('[shellStatus]', err); } });
  }

  let lastFetchAt = 0;
  function refresh(force = false) {
    if (inflight) return inflight;
    // Several modules ask on page load; one answer from the last 2s is enough.
    if (!force && last && Date.now() - lastFetchAt < 2000) return Promise.resolve(last);
    lastFetchAt = Date.now();
    inflight = API.get('/notifications/summary')
      .then((data) => { publish(data); return data; })
      .catch(() => last) // non-critical: badges just keep their last value
      .finally(() => { inflight = null; });
    return inflight;
  }

  function subscribe(fn) {
    subscribers.add(fn);
    if (last) fn(last);
    return () => subscribers.delete(fn);
  }

  function refreshSoon() {
    clearTimeout(debounce);
    debounce = setTimeout(() => refresh(true), 250);
  }

  function start() {
    if (started) return;
    started = true;
    refresh(true);
    setInterval(() => { if (!document.hidden) refresh(true); }, POLL_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    if (typeof Realtime !== 'undefined') {
      ['message.new', 'message.deleted', 'message.hidden', 'conversation.read'].forEach((name) => Realtime.on(name, refreshSoon));
    }
  }

  return { start, refresh, subscribe, isStarted: () => started };
})();
