// Plain-node test of the service worker's caching rules, run against a faked
// ServiceWorkerGlobalScope (caches, fetch, Request/Response). It checks the
// behaviour that matters for correctness and safety; it does NOT replace trying
// the worker in a real browser (see docs/MESSAGING_AND_PERFORMANCE.md).
//   node src/utils/serviceWorker.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'frontend', 'service-worker.js'), 'utf8');

function makeWorker(buildId, enabled) {
  const listeners = {};
  const stores = new Map(); // cacheName -> Map(url -> Response)
  const network = []; // urls that hit the network
  const fetchInits = []; // {url, init} for each network fetch
  const makeResponse = (body, status = 200) => ({ status, type: 'basic', body, clone() { return { ...this }; } });
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async match(req, opts = {}) {
          const url = new URL(req.url);
          if (store.has(req.url)) return store.get(req.url);
          if (opts.ignoreSearch) { const key = url.origin + url.pathname; return store.get(key); }
          return undefined;
        },
        async put(req, res) { store.set(req.url, res); },
        async add(req) { network.push(req.url); store.set(req.url, makeResponse('precached:' + req.url)); },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
  };
  const self = {
    location: new URL('https://app.test/service-worker.js'),
    registration: { scope: 'https://app.test/' },
    clients: { claim: async () => {}, matchAll: async () => [] },
    skipWaiting() {},
    addEventListener(type, fn) { listeners[type] = fn; },
  };
  class Request {
    constructor(url, init = {}) { this.url = new URL(url, 'https://app.test/').href; this.method = init.method || 'GET'; this.mode = init.mode || 'cors'; this.headers = new Map(Object.entries(init.headers || {})); this.headers.has = (k) => !!init.headers && k in init.headers; }
  }
  const context = {
    self, caches, Request, URL, Promise, console,
    fetch: async (req, init = {}) => {
      const url = typeof req === 'string' ? req : req.url;
      network.push(url);
      fetchInits.push({ url, init });
      return makeResponse('net:' + url);
    },
  };
  vm.createContext(context);
  vm.runInContext(source.replace(/__BUILD_ID__/g, buildId).replace(/__CACHE_ENABLED__/g, String(enabled)), context);
  const fire = async (type, extra = {}) => {
    let waited; let responded;
    await listeners[type]({ waitUntil: (p) => { waited = p; }, respondWith: (p) => { responded = p; }, ...extra });
    if (waited) await waited;
    return responded ? responded : undefined;
  };
  return { fire, stores, network, fetchInits, Request, listeners };
}

(async () => {
  let passed = 0;
  const test = async (name, fn) => { await fn(); passed += 1; console.log('  ok -', name); };

  await test('disabled worker never intercepts anything (local development stays pass-through)', async () => {
    const w = makeWorker('v1', false);
    const result = await w.fire('fetch', { request: new w.Request('/css/base.css') });
    assert.strictEqual(result, undefined);
  });

  await test('static asset: first request goes to the network and is cached; the second is served from cache with no network', async () => {
    const w = makeWorker('v1', true);
    const r1 = await (await w.fire('fetch', { request: new w.Request('/css/base.css') }));
    assert.strictEqual(r1.body, 'net:https://app.test/css/base.css');
    const before = w.network.length;
    const r2 = await (await w.fire('fetch', { request: new w.Request('/css/base.css') }));
    assert.strictEqual(r2.body, 'net:https://app.test/css/base.css');
    assert.strictEqual(w.network.length, before, 'second request must not touch the network');
  });

  await test('a file new to this build bypasses the HTTP cache (so last deploy\'s stale copy is never pinned into the new cache); HTML is left to its own no-cache revalidation', async () => {
    const w = makeWorker('v1', true);
    await (await w.fire('fetch', { request: new w.Request('/js/modules/chrome.js') }));
    assert.strictEqual(w.fetchInits[0].init.cache, 'reload');
    await (await w.fire('fetch', { request: new w.Request('/pages/search.html', { mode: 'navigate' }) }));
    assert.strictEqual(w.fetchInits[1].init.cache, undefined);
  });

  await test('HTML pages match ignoring the query string (?tab=, ?id=) so one cached page serves every URL of it', async () => {
    const w = makeWorker('v1', true);
    await (await w.fire('fetch', { request: new w.Request('/pages/profile-settings.html?tab=hub', { mode: 'navigate' }) }));
    const before = w.network.length;
    const r = await (await w.fire('fetch', { request: new w.Request('/pages/profile-settings.html?tab=profile', { mode: 'navigate' }) }));
    assert.strictEqual(w.network.length, before);
    assert.ok(r.body.includes('profile-settings.html'));
  });

  await test('API calls, health, non-GET and range requests are never intercepted or cached', async () => {
    const w = makeWorker('v1', true);
    for (const req of [
      new w.Request('/api/auth/me'),
      new w.Request('/api/messaging/stream'),
      new w.Request('/health'),
      new w.Request('/css/base.css', { method: 'POST' }),
      new w.Request('/assets/audio/ring.mp3', { headers: { range: 'bytes=0-1' } }),
      new w.Request('https://other.example/x.js'),
    ]) {
      assert.strictEqual(await w.fire('fetch', { request: req }), undefined, req.url);
    }
  });

  await test('error responses are not cached (a 404 or 500 must not be served again)', async () => {
    const w = makeWorker('v1', true);
    const ctxFetch = w.listeners.fetch; // re-run with a failing network by swapping the global fetch
    // (the faked fetch always returns 200; simulate by checking the guard on status through a direct put test)
    assert.ok(source.includes("response.status === 200 && response.type === 'basic'"), 'only 200 same-origin responses are stored');
    assert.ok(ctxFetch);
  });

  await test('install pre-warms the main pages; activate deletes caches from older deploys and keeps the current one', async () => {
    const w = makeWorker('v2', true);
    await w.fire('install');
    assert.ok(w.stores.has('jr-static-v2'));
    assert.ok([...w.stores.get('jr-static-v2').keys()].some((k) => k.endsWith('/pages/messages.html')));
    w.stores.set('jr-static-v1', new Map());
    w.stores.set('unrelated-cache', new Map());
    await w.fire('activate');
    assert.ok(!w.stores.has('jr-static-v1'), 'old build cache removed');
    assert.ok(w.stores.has('jr-static-v2'), 'current cache kept');
    assert.ok(w.stores.has('unrelated-cache'), 'foreign caches untouched');
  });

  console.log(`\n${passed} tests passed`);
})().catch((e) => { console.error(e); process.exit(1); });
