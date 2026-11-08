// Plain-node tests:  node src/services/companyFeedbackForwarder.test.js
// In-app feedback is forwarded, correctly signed, to the SHEREBOY TECH LTD dashboard,
// carries no personal data, retries only when worth it, and never runs unconfigured.
const assert = require('assert');
const crypto = require('crypto');

process.env.COMPANY_FEEDBACK_URL = 'https://company.example/';
process.env.FEEDBACK_INGEST_SECRET = 'test-secret';
const { deliver, forwardWithRetries, payloadFor } = require('./companyFeedbackForwarder');

const row = { id: '7b4f0c1e-0000-4000-8000-000000000001', user_id: 'u-1', type: 'bug_report', message: 'Map does not load', created_at: '2026-10-01T09:00:00.000Z' };
const answer = (status) => async () => ({ ok: status < 300, status });

let passed = 0;
const test = async (name, fn) => { await fn(); passed += 1; console.log('  ok -', name); };

(async () => {
  await test('sends a signed request the company site can verify', async () => {
    let seen;
    const r = await deliver(row, { now: () => 1790000000000, fetchImpl: async (url, init) => { seen = { url, init }; return { ok: true, status: 201 }; } });
    assert.equal(r.ok, true);
    assert.equal(seen.url, 'https://company.example/api/feedback/ingest');
    const ts = seen.init.headers['X-Feedback-Timestamp'];
    assert.equal(ts, '1790000000');
    const expected = 'sha256=' + crypto.createHmac('sha256', 'test-secret').update(`${ts}.${seen.init.body}`).digest('hex');
    assert.equal(seen.init.headers['X-Feedback-Signature'], expected);
  });

  await test('carries the feedback only — no user id, name or email', async () => {
    const p = payloadFor(row);
    assert.deepEqual(Object.keys(p).sort(), ['externalId', 'message', 'product', 'source', 'submittedAt', 'type']);
    assert.equal(p.externalId, row.id);
    assert.equal(p.product, 'job-rush');
    assert.equal(p.submittedAt, row.created_at);
  });

  await test('server errors and network failures are retried, then given up', async () => {
    let calls = 0;
    const r = await forwardWithRetries(row, { delays: [0, 0], wait: async () => {}, fetchImpl: async () => { calls += 1; if (calls === 1) throw new Error('ECONNRESET'); return { ok: false, status: 503 }; } });
    assert.equal(r.ok, false);
    assert.equal(calls, 3);
  });

  await test('a refusal (bad signature, unknown product) is not retried', async () => {
    let calls = 0;
    const r = await forwardWithRetries(row, { delays: [0, 0], wait: async () => {}, fetchImpl: async () => { calls += 1; return { ok: false, status: 401 }; } });
    assert.equal(r.ok, false);
    assert.equal(calls, 1);
  });

  await test('an already-delivered item counts as delivered', async () => {
    assert.equal((await deliver(row, { fetchImpl: answer(409) })).ok, true);
    assert.equal((await deliver(row, { fetchImpl: answer(200) })).ok, true);
  });

  await test('does nothing when not configured', async () => {
    delete process.env.FEEDBACK_INGEST_SECRET;
    let called = false;
    const r = await deliver(row, { fetchImpl: async () => { called = true; return { ok: true, status: 201 }; } });
    assert.equal(r.skipped, true);
    assert.equal(called, false);
  });

  console.log(`companyFeedbackForwarder: ${passed} passed`);
})().catch((err) => { console.error(err); process.exit(1); });
