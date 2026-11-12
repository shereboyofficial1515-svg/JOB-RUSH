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

// The database is loaded lazily so the signing logic can be tested without one
const db = () => require('../config/db');
const MISSING_COLUMN = '42703';

/**
 * Records that the dashboard has the item (migration 069). Without that column the
 * sync below still works, it just re-sends after a restart and the dashboard skips duplicates.
 */
async function markForwarded(id, { query = db().query } = {}) {
  try {
    await query('UPDATE feedback_submissions SET forwarded_at = now() WHERE id = $1', [id]);
    return true;
  } catch (err) {
    if (err.code !== MISSING_COLUMN) logger.error('Could not record a forwarded feedback item', { feedbackId: id, error: err.message });
    return false;
  }
}

/** Fire-and-forget: call after the feedback row is saved. */
function forwardFeedback(row) {
  if (!settings()) return;
  forwardWithRetries(row)
    .then((r) => (r.ok ? markForwarded(row.id) : null))
    .catch((err) => logger.error('Feedback forwarding crashed', { feedbackId: row.id, error: err.message }));
}

/**
 * Sends every in-app feedback item the dashboard does not have yet: items sent while
 * forwarding was off or failing, and everything from before forwarding existed.
 * So nothing depends on a one-off manual backfill or on the process staying up.
 */
let fullResendDone = false;
async function syncPending({ query = db().query, send = forwardWithRetries, pause = 300 } = {}) {
  if (!settings()) return { sent: 0, failed: 0, skipped: true };
  let rows;
  let tracked = true;
  try {
    ({ rows } = await query('SELECT id, type, message, created_at FROM feedback_submissions WHERE forwarded_at IS NULL ORDER BY created_at LIMIT 100'));
  } catch (err) {
    if (err.code !== MISSING_COLUMN) throw err;
    // Before migration 069: send everything once per start; the dashboard ignores ones it has
    tracked = false;
    if (fullResendDone) return { sent: 0, failed: 0, untracked: true };
    ({ rows } = await query('SELECT id, type, message, created_at FROM feedback_submissions ORDER BY created_at'));
  }
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const r = await send(row, { delays: [2000] });
    if (r.ok) { sent += 1; if (tracked) await markForwarded(row.id, { query }); } else failed += 1;
    if (pause) await new Promise((res) => setTimeout(res, pause));
  }
  if (!tracked && !failed) fullResendDone = true;
  if (rows.length) logger.info('Feedback sync with the SHEREBOY TECH LTD dashboard', { sent, failed, tracked });
  return { sent, failed, tracked };
}

/** Starts the background sync, and says plainly in the logs when forwarding is off. */
function startFeedbackSync({ firstRunMs = 20000, everyMs = 10 * 60 * 1000 } = {}) {
  if (!settings()) {
    logger.warn('In-app feedback is NOT being sent to the SHEREBOY TECH LTD dashboard: set COMPANY_FEEDBACK_URL and FEEDBACK_INGEST_SECRET (the same secret as on the company site).');
    return;
  }
  const run = () => syncPending().catch((err) => logger.error('Feedback sync failed', { error: err.message }));
  const first = setTimeout(run, firstRunMs);
  const timer = setInterval(run, everyMs);
  if (first.unref) first.unref();
  if (timer.unref) timer.unref();
}

module.exports = { forwardFeedback, forwardWithRetries, deliver, payloadFor, sign, settings, markForwarded, syncPending, startFeedbackSync };
