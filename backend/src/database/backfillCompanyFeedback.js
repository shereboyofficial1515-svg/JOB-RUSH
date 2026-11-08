/**
 * One-time (idempotent) copy of existing in-app Help & Feedback submissions to the
 * SHEREBOY TECH LTD Reviews & Feedback dashboard. New submissions are forwarded
 * automatically (services/companyFeedbackForwarder.js); this covers the ones sent
 * before that existed.
 *
 * Safety rules:
 *  - DRY RUN by default: prints how many would be sent. Pass --apply to send.
 *  - Reads feedback_submissions only; changes nothing in the JOB RUSH database.
 *  - Each row's id is its externalId, so running it again never creates duplicates
 *    (the dashboard answers "duplicate" for rows it already has).
 *  - Sends only type, message and time — no names, emails or user ids.
 *
 * Usage (needs DATABASE_URL, COMPANY_FEEDBACK_URL, FEEDBACK_INGEST_SECRET):
 *   npm run backfill:company-feedback            # dry run
 *   npm run backfill:company-feedback -- --apply
 */
require('../config/env');
const { pool } = require('../config/db');
const { forwardWithRetries, settings } = require('../services/companyFeedbackForwarder');

const APPLY = process.argv.includes('--apply');

async function main() {
  if (!settings()) throw new Error('Set COMPANY_FEEDBACK_URL and FEEDBACK_INGEST_SECRET first.');
  const { rows } = await pool.query('SELECT id, type, message, created_at FROM feedback_submissions ORDER BY created_at');
  console.log(`${rows.length} feedback submission(s) found.`);
  if (!APPLY) {
    console.log('Dry run — nothing sent. Run again with --apply to send them.');
    return;
  }
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    // Each attempt is signed afresh; one-second spacing keeps signatures unique and the rate gentle
    const result = await forwardWithRetries(row, { delays: [2000, 5000] });
    if (result.ok) sent += 1; else failed += 1;
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.log(`Done: ${sent} delivered (new or already there), ${failed} failed.`);
  if (failed) process.exitCode = 1;
}

main()
  .catch((err) => { console.error(err.message); process.exitCode = 1; })
  .finally(() => pool.end());
