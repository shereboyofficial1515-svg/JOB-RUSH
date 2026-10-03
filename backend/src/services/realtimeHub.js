/**
 * JOB RUSH -- realtime hub (Server-Sent Events).
 *
 * Messaging used to be polled (5s per open chat, 12s for the list, 3s for
 * incoming calls). This is the push channel that replaces most of that
 * traffic: one long-lived GET /api/messaging/stream per open page, over
 * which the server pushes small JSON events the moment something happens
 * (new / edited / deleted message, pin changes, read receipts, an
 * incoming call).
 *
 * Why SSE and not WebSockets/Supabase Realtime:
 *  - the backend is a single Express service on Render; SSE needs no new
 *    infrastructure, works through Cloudflare, uses the existing httpOnly
 *    session cookie for auth, and EventSource reconnects by itself;
 *  - Supabase Realtime would require exposing Postgres change feeds to the
 *    browser with RLS policies the app does not have (all authorization
 *    lives in this API), which would be a security regression.
 *
 * Limits worth knowing (also in the report): the registry is in process
 * memory, so with MORE THAN ONE backend instance an event would only reach
 * clients connected to the instance that produced it. Render runs this
 * service as a single instance today. The client therefore keeps a slow
 * polling safety net, so a missed event is repaired within seconds.
 */
const clients = new Map(); // userId -> Set<{ res, id }>
let nextClientId = 1;

const MAX_STREAMS_PER_USER = 6; // a user can have a few tabs / the app open at once
const HEARTBEAT_MS = 20000;

function write(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** Registers an open SSE response for `userId`; returns a function that unregisters it. */
function addClient(userId, res) {
  let set = clients.get(userId);
  if (!set) {
    set = new Set();
    clients.set(userId, set);
  }
  const client = { res, id: nextClientId++ };
  set.add(client);

  // Bound resource use: if one account opens too many streams, drop the oldest.
  while (set.size > MAX_STREAMS_PER_USER) {
    const oldest = set.values().next().value;
    set.delete(oldest);
    try { oldest.res.end(); } catch (_) { /* already closed */ }
  }

  return function remove() {
    const current = clients.get(userId);
    if (!current) return;
    current.delete(client);
    if (current.size === 0) clients.delete(userId);
  };
}

/** Sends one event to every open stream of each listed user. Never throws. */
function publish(userIds, event, data) {
  const unique = Array.from(new Set((Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean)));
  for (const userId of unique) {
    const set = clients.get(userId);
    if (!set) continue;
    for (const client of set) {
      try {
        write(client.res, event, data);
      } catch (_) {
        set.delete(client);
      }
    }
  }
}

function isOnline(userId) {
  const set = clients.get(userId);
  return !!set && set.size > 0;
}

function connectionCount() {
  let n = 0;
  for (const set of clients.values()) n += set.size;
  return n;
}

/** Express handler body for GET /stream (auth is applied by the route). */
function openStream(req, res) {
  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    // no-transform: stop intermediaries (Cloudflare) compressing/buffering the stream
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write('retry: 3000\n\n');
  write(res, 'ready', { at: new Date().toISOString() });

  const remove = addClient(req.user.id, res);
  const heartbeat = setInterval(() => {
    try { write(res, 'ping', { at: Date.now() }); } catch (_) { /* cleaned up on close */ }
  }, HEARTBEAT_MS);

  req.on('close', () => {
    clearInterval(heartbeat);
    remove();
  });
}

module.exports = { publish, isOnline, openStream, addClient, connectionCount };
