/**
 * Sends in-app Help & Feedback submissions to the SHEREBOY TECH LTD
 * Reviews & Feedback dashboard (POST <COMPANY_FEEDBACK_URL>/api/feedback/ingest),
 * so feedback about JOB RUSH is seen in one place alongside website feedback.
 *
 *  - Optional: does nothing unless COMPANY_FEEDBACK_URL and FEEDBACK_INGEST_SECRET are set.
 *  - Never blocks or fails the user's submission: forwarding runs after the row is
 *    saved here, and failures are retried a few times, then only logged.
 *  - Signed with HMAC-SHA256 over "<timestamp>.<body>"; the company site refuses
 *    anything unsigned, altered or older than 5 minutes.
 *  - Sends the feedback itself only — no name, email or user id leaves JOB RUSH.
 *  - The row id is sent as externalId, so a retry or the backfill never duplicates.
 */
const crypto = require('crypto');
const logger = require('../utils/logger');

const RETRY_DELAYS_MS = [2000, 10000, 60000];

function settings() {
  const url = (process.env.COMPANY_FEEDBACK_URL || '').trim().replace(/\/+$/, '');
  const secret = (process.env.FEEDBACK_INGEST_SECRET || '').trim();
  return url && secret ? { url, secret } : null;
}

function payloadFor(row) {
  return {
    product: 'job-rush',
    source: 'job-rush-app',
    externalId: String(row.id),
    type: row.type,
    message: row.message,
    submittedAt: new Date(row.created_at).toISOString(),
  };
}

function sign(secret, timestamp, raw) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex');
}

/**
 * One delivery attempt. Resolves to { ok, retry, status }.
 * 4xx answers (other than 408/429) are final: retrying would get the same answer.
 */
async function deliver(row, { fetchImpl = fetch, now = Date.now } = {}) {
  const cfg = settings();
  if (!cfg) return { ok: false, retry: false, status: 0, skipped: true };
  const raw = JSON.stringify(payloadFor(row));
  const timestamp = Math.floor(now() / 1000);
  try {
    const res = await fetchImpl(`${cfg.url}/api/feedback/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Feedback-Timestamp': String(timestamp),
        'X-Feedback-Signature': sign(cfg.secret, timestamp, raw),
      },
      body: raw,
      signal: AbortSignal.timeout(10000),
    });
    // 409 = this exact signed delivery already arrived
    if (res.ok || res.status === 409) return { ok: true, retry: false, status: res.status };
    const retry = res.status >= 500 || res.status === 408 || res.status === 429;
    return { ok: false, retry, status: res.status };
  } catch (err) {
    return { ok: false, retry: true, status: 0, error: err.message };
  }
}

async function forwardWithRetries(row, { delays = RETRY_DELAYS_MS, wait = (ms) => new Promise((r) => setTimeout(r, ms)), ...opts } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    const result = await deliver(row, opts);
    if (result.ok || result.skipped) return result;
    if (!result.retry || attempt >= delays.length) {
      logger.error('Could not forward feedback to the SHEREBOY TECH LTD dashboard', { feedbackId: row.id, status: result.status, error: result.error });
      return result;
    }
    await wait(delays[attempt]);
  }
}

/** Fire-and-forget: call after the feedback row is saved. */
function forwardFeedback(row) {
  if (!settings()) return;
  forwardWithRetries(row).catch((err) => logger.error('Feedback forwarding crashed', { feedbackId: row.id, error: err.message }));
}

module.exports = { forwardFeedback, forwardWithRetries, deliver, payloadFor, sign, settings };
