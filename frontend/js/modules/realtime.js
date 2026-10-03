/**
 * JOB RUSH — realtime client (Server-Sent Events).
 *
 * One EventSource per page to GET /api/messaging/stream. The server pushes
 * small JSON events the moment something happens (see
 * backend/src/services/realtimeHub.js); pages subscribe with Realtime.on().
 *
 *   const off = Realtime.on('message.new', ({ conversationId, message }) => { ... });
 *   off();                         // unsubscribe (do this when a screen is destroyed)
 *   Realtime.isConnected();        // true while the stream is alive
 *
 * Reliability:
 *  - EventSource reconnects by itself; every reconnect emits 'connected' so
 *    a screen can catch up on anything missed while the stream was down.
 *  - The server sends a 'ping' every 20s. If none arrives for 50s the stream
 *    is considered dead (a proxy silently dropped it) and is reopened.
 *  - Events are a fast path, not the only path: screens keep a slow polling
 *    safety net, and fall back to fast polling while isConnected() is false.
 *  - Exactly one connection per page, however many modules subscribe, and it
 *    is closed on logout.
 */
const Realtime = (function () {
  const EVENTS = [
    'message.new', 'message.updated', 'message.deleted', 'message.hidden', 'message.pinned',
    'conversation.read', 'call.incoming', 'call.updated',
  ];
  const STALE_AFTER_MS = 50000;

  let source = null;
  let connected = false;
  let lastSignalAt = 0;
  let watchdog = null;
  let retryTimer = null;
  let started = false;
  const listeners = new Map(); // event -> Set<fn>

  function emit(event, data) {
    const set = listeners.get(event);
    if (!set) return;
    for (const fn of Array.from(set)) {
      try { fn(data); } catch (err) { console.error('[realtime] listener failed', event, err); }
    }
  }

  function setConnected(value) {
    if (connected === value) return;
    connected = value;
    emit(value ? 'connected' : 'disconnected', {});
  }

  function open() {
    if (source || typeof EventSource === 'undefined') return;
    source = new EventSource(`${API.baseUrl}/messaging/stream`, { withCredentials: true });
    lastSignalAt = Date.now();

    source.addEventListener('ready', () => { lastSignalAt = Date.now(); setConnected(true); });
    source.addEventListener('ping', () => { lastSignalAt = Date.now(); });
    EVENTS.forEach((name) => {
      source.addEventListener(name, (e) => {
        lastSignalAt = Date.now();
        let data = null;
        try { data = JSON.parse(e.data); } catch { return; }
        emit(name, data);
      });
    });
    source.onerror = () => {
      setConnected(false);
      // readyState CLOSED = the browser gave up (for example a 401 because the
      // session ended). Try again later instead of hammering the server.
      if (source && source.readyState === EventSource.CLOSED) {
        close();
        clearTimeout(retryTimer);
        retryTimer = setTimeout(() => { if (started) open(); }, 30000);
      }
    };
  }

  function close() {
    if (source) { source.close(); source = null; }
    setConnected(false);
  }

  function start() {
    if (started) return;
    started = true;
    open();
    watchdog = setInterval(() => {
      if (source && connected && Date.now() - lastSignalAt > STALE_AFTER_MS) { close(); open(); }
    }, 15000);
    // Returning to the tab / regaining network: make sure the stream is alive.
    document.addEventListener('visibilitychange', () => { if (!document.hidden && started && !source) open(); });
    window.addEventListener('online', () => { if (started && !source) open(); });
    document.addEventListener('jr:auth-logout', stop);
  }

  function stop() {
    started = false;
    clearInterval(watchdog);
    clearTimeout(retryTimer);
    close();
  }

  function on(event, fn) {
    let set = listeners.get(event);
    if (!set) { set = new Set(); listeners.set(event, set); }
    set.add(fn);
    return () => set.delete(fn);
  }

  return { start, stop, on, isConnected: () => connected };
})();
