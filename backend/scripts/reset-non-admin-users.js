#!/usr/bin/env node
/**
 * ============================================================
 * DESTRUCTIVE — resets Job Rush by deleting every non-admin user
 * and all data that belongs to them, while preserving admin
 * account(s), admin_users, admin_audit_logs, and all platform/
 * reference configuration untouched.
 *
 * "Admin" is defined exactly the way the application itself
 * defines it (see src/middleware/authorize.js requireAdmin):
 *   EXISTS (SELECT 1 FROM admin_users WHERE user_id = X AND revoked_at IS NULL)
 *
 * SAFETY:
 *   - Defaults to a read-only DRY RUN. No row is touched, no file
 *     is deleted, unless BOTH flags below are given.
 *   - --execute alone does nothing but print a refusal — it also
 *     requires --confirm set to the EXACT phrase below.
 *   - This file is a standalone script, not wired into any HTTP
 *     route, cron job, or app startup path — it only runs when a
 *     human explicitly invokes it from a terminal with `node`.
 *
 * Usage:
 *   node scripts/reset-non-admin-users.js
 *     -> DRY RUN. Prints exactly what would be deleted. Nothing changes.
 *
 *   node scripts/reset-non-admin-users.js --execute --confirm="DELETE NON-ADMIN USERS"
 *     -> Actually deletes. Irreversible.
 * ============================================================
 */
const { query, withTransaction, pool } = require('../src/config/db');
const { getSupabaseClient } = require('../src/config/supabase');

const CONFIRM_PHRASE = 'DELETE NON-ADMIN USERS';
const STORAGE_BUCKETS = ['portfolio-media', 'profile-pictures', 'verification-documents', 'chat-media', 'dispute-evidence', 'cv-documents'];

async function getNonAdminUsers() {
  const { rows } = await query(`
    SELECT u.id, u.email, u.role, u.account_status
    FROM users u
    LEFT JOIN admin_users au ON au.user_id = u.id AND au.revoked_at IS NULL
    WHERE au.user_id IS NULL
    ORDER BY u.created_at
  `);
  return rows;
}

async function getAdminUsers() {
  const { rows } = await query(`
    SELECT u.id, u.email, au.admin_role
    FROM admin_users au JOIN users u ON u.id = au.user_id
    WHERE au.revoked_at IS NULL
  `);
  return rows;
}

const COUNT_QUERIES = {
  worker_profiles: `SELECT COUNT(*)::int c FROM worker_profiles WHERE user_id = ANY($1)`,
  hirer_profiles: `SELECT COUNT(*)::int c FROM hirer_profiles WHERE user_id = ANY($1)`,
  worker_profile_skills: `SELECT COUNT(*)::int c FROM worker_profile_skills WHERE worker_user_id = ANY($1)`,
  work_experience: `SELECT COUNT(*)::int c FROM work_experience WHERE worker_user_id = ANY($1)`,
  worker_education: `SELECT COUNT(*)::int c FROM worker_education WHERE worker_user_id = ANY($1)`,
  worker_cv: `SELECT COUNT(*)::int c FROM worker_cv WHERE worker_user_id = ANY($1)`,
  business_profiles: `SELECT COUNT(*)::int c FROM business_profiles WHERE worker_user_id = ANY($1)`,
  professional_services: `SELECT COUNT(*)::int c FROM professional_services WHERE worker_user_id = ANY($1)`,
  portfolios: `SELECT COUNT(*)::int c FROM portfolios WHERE worker_user_id = ANY($1)`,
  portfolio_media: `SELECT COUNT(*)::int c FROM portfolio_media pm JOIN portfolios p ON p.id=pm.portfolio_id WHERE p.worker_user_id = ANY($1)`,
  jobs: `SELECT COUNT(*)::int c FROM jobs WHERE hirer_user_id = ANY($1)`,
  applications: `SELECT COUNT(*)::int c FROM applications WHERE worker_user_id = ANY($1) OR job_id IN (SELECT id FROM jobs WHERE hirer_user_id = ANY($1))`,
  interviews: `SELECT COUNT(*)::int c FROM interviews WHERE worker_user_id = ANY($1) OR hirer_user_id = ANY($1)`,
  contracts: `SELECT COUNT(*)::int c FROM contracts WHERE worker_user_id = ANY($1) OR hirer_user_id = ANY($1)`,
  escrow_transactions: `SELECT COUNT(*)::int c FROM escrow_transactions WHERE worker_user_id = ANY($1) OR hirer_user_id = ANY($1)`,
  payments: `SELECT COUNT(*)::int c FROM payments WHERE payer_user_id = ANY($1)`,
  withdrawals: `SELECT COUNT(*)::int c FROM withdrawals WHERE worker_user_id = ANY($1)`,
  wallets: `SELECT COUNT(*)::int c FROM wallets WHERE user_id = ANY($1)`,
  subscriptions: `SELECT COUNT(*)::int c FROM subscriptions WHERE worker_user_id = ANY($1)`,
  reviews: `SELECT COUNT(*)::int c FROM reviews WHERE reviewer_user_id = ANY($1) OR reviewee_user_id = ANY($1)`,
  saved_jobs: `SELECT COUNT(*)::int c FROM saved_jobs WHERE worker_user_id = ANY($1)`,
  saved_profiles: `SELECT COUNT(*)::int c FROM saved_profiles WHERE hirer_user_id = ANY($1) OR worker_user_id = ANY($1)`,
  conversation_participants: `SELECT COUNT(*)::int c FROM conversation_participants WHERE user_id = ANY($1)`,
  conversations_touched: `SELECT COUNT(DISTINCT conversation_id)::int c FROM conversation_participants WHERE user_id = ANY($1)`,
  messages: `SELECT COUNT(*)::int c FROM messages WHERE conversation_id IN (SELECT conversation_id FROM conversation_participants WHERE user_id = ANY($1))`,
  calls: `SELECT COUNT(*)::int c FROM calls WHERE caller_user_id = ANY($1) OR callee_user_id = ANY($1)`,
  notifications: `SELECT COUNT(*)::int c FROM notifications WHERE user_id = ANY($1)`,
  notification_preferences: `SELECT COUNT(*)::int c FROM notification_preferences WHERE user_id = ANY($1)`,
  disputes: `SELECT COUNT(*)::int c FROM disputes WHERE opened_by_user_id = ANY($1) OR against_user_id = ANY($1)`,
  dispute_evidence: `SELECT COUNT(*)::int c FROM dispute_evidence WHERE uploaded_by = ANY($1)`,
  verification_requests: `SELECT COUNT(*)::int c FROM verification_requests WHERE worker_user_id = ANY($1)`,
  referrals: `SELECT COUNT(*)::int c FROM referrals WHERE referrer_user_id = ANY($1) OR referred_user_id = ANY($1)`,
  referral_rewards: `SELECT COUNT(*)::int c FROM referral_rewards WHERE referrer_user_id = ANY($1)`,
  sessions: `SELECT COUNT(*)::int c FROM sessions WHERE user_id = ANY($1)`,
  user_settings: `SELECT COUNT(*)::int c FROM user_settings WHERE user_id = ANY($1)`,
  user_two_factor: `SELECT COUNT(*)::int c FROM user_two_factor WHERE user_id = ANY($1)`,
  two_factor_challenges: `SELECT COUNT(*)::int c FROM two_factor_challenges WHERE user_id = ANY($1)`,
  known_devices: `SELECT COUNT(*)::int c FROM known_devices WHERE user_id = ANY($1)`,
  device_push_tokens: `SELECT COUNT(*)::int c FROM device_push_tokens WHERE user_id = ANY($1)`,
  push_subscriptions: `SELECT COUNT(*)::int c FROM push_subscriptions WHERE user_id = ANY($1)`,
  oauth_mobile_handoffs: `SELECT COUNT(*)::int c FROM oauth_mobile_handoffs WHERE user_id = ANY($1)`,
  otp_codes: `SELECT COUNT(*)::int c FROM otp_codes WHERE user_id = ANY($1)`,
  password_reset_tokens: `SELECT COUNT(*)::int c FROM password_reset_tokens WHERE user_id = ANY($1)`,
  blocked_users: `SELECT COUNT(*)::int c FROM blocked_users WHERE blocker_user_id = ANY($1) OR blocked_user_id = ANY($1)`,
  feedback_submissions: `SELECT COUNT(*)::int c FROM feedback_submissions WHERE user_id = ANY($1)`,
  support_tickets: `SELECT COUNT(*)::int c FROM support_tickets WHERE user_id = ANY($1)`,
  job_reports: `SELECT COUNT(*)::int c FROM job_reports WHERE reporter_user_id = ANY($1)`,
  message_reports: `SELECT COUNT(*)::int c FROM message_reports WHERE reporter_user_id = ANY($1)`,
  portfolio_reports: `SELECT COUNT(*)::int c FROM portfolio_reports WHERE reporter_user_id = ANY($1)`,
  review_reports: `SELECT COUNT(*)::int c FROM review_reports WHERE reporter_user_id = ANY($1)`,
  profile_reports: `SELECT COUNT(*)::int c FROM profile_reports WHERE reporter_user_id = ANY($1) OR reported_user_id = ANY($1)`,
  featured_placements: `SELECT COUNT(*)::int c FROM featured_placements WHERE worker_user_id = ANY($1) OR created_by = ANY($1)`,
  email_logs: `SELECT COUNT(*)::int c FROM email_logs WHERE user_id = ANY($1)`,
  facebook_deletion_requests: `SELECT COUNT(*)::int c FROM facebook_deletion_requests WHERE job_rush_user_id = ANY($1)`,
  admin_audit_logs_actor_to_be_nulled: `SELECT COUNT(*)::int c FROM admin_audit_logs WHERE actor_user_id = ANY($1)`,
};

async function computeCounts(ids) {
  const counts = {};
  for (const [label, sql] of Object.entries(COUNT_QUERIES)) {
    const { rows } = await query(sql, [ids]);
    counts[label] = rows[0].c;
  }
  return counts;
}

async function listStorageFiles(ids) {
  const supabase = getSupabaseClient();
  const files = [];
  for (const bucket of STORAGE_BUCKETS) {
    for (const id of ids) {
      const { data, error } = await supabase.storage.from(bucket).list(id);
      if (error || !data) continue;
      for (const f of data) files.push({ bucket, path: `${id}/${f.name}` });
    }
  }
  return files;
}

async function main() {
  const execute = process.argv.includes('--execute');
  const confirmArg = process.argv.find((a) => a.startsWith('--confirm='));
  const confirmValue = confirmArg ? confirmArg.slice('--confirm='.length).replace(/^"|"$/g, '') : null;

  let dbHost = 'unknown';
  try { dbHost = new URL(process.env.DATABASE_URL).host; } catch {}
  console.log(`Database host: ${dbHost}`);
  console.log(`Mode: ${execute ? 'EXECUTE (destructive)' : 'DRY RUN (read-only)'}\n`);

  const admins = await getAdminUsers();
  const nonAdmins = await getNonAdminUsers();
  const ids = nonAdmins.map((r) => r.id);

  console.log(`ADMIN ACCOUNTS TO PRESERVE: ${admins.length}`);
  admins.forEach((a) => console.log(`  - ${a.email} (${a.admin_role})`));
  console.log(`\nNON-ADMIN USERS TO DELETE: ${ids.length}`);
  nonAdmins.forEach((u) => console.log(`  - ${u.email} (${u.role}, ${u.account_status})`));

  const counts = await computeCounts(ids);
  console.log('\nRECORDS THAT WILL BE AFFECTED:');
  console.log(JSON.stringify(counts, null, 2));

  const files = await listStorageFiles(ids);
  console.log(`\nSTORAGE FILES TO DELETE: ${files.length}`);

  if (!execute) {
    console.log(`\nDRY RUN ONLY — nothing was changed.`);
    console.log(`To actually delete, re-run with:\n  node scripts/reset-non-admin-users.js --execute --confirm="${CONFIRM_PHRASE}"`);
    await pool.end();
    return;
  }

  if (confirmValue !== CONFIRM_PHRASE) {
    console.error(`\nREFUSING TO EXECUTE: --confirm must exactly equal "${CONFIRM_PHRASE}". Nothing was deleted.`);
    await pool.end();
    process.exitCode = 1;
    return;
  }

  console.log(`\n*** EXECUTING DESTRUCTIVE DELETION of ${ids.length} non-admin users and ~${Object.values(counts).reduce((a, b) => a + b, 0)} associated records ***`);

  const deletedUserCount = await withTransaction(async (client) => {
    // 1) Null nullable, non-cascading references on rows that survive
    //    (system/audit rows, not user-owned data).
    await client.query('UPDATE admin_audit_logs SET actor_user_id = NULL WHERE actor_user_id = ANY($1)', [ids]);
    await client.query('UPDATE admin_users SET created_by = NULL WHERE created_by = ANY($1)', [ids]);
    await client.query('UPDATE platform_settings SET updated_by = NULL WHERE updated_by = ANY($1)', [ids]);
    await client.query('UPDATE jobs SET hidden_by = NULL WHERE hidden_by = ANY($1)', [ids]);
    await client.query('UPDATE portfolios SET hidden_by = NULL WHERE hidden_by = ANY($1)', [ids]);
    await client.query('UPDATE reviews SET hidden_by = NULL WHERE hidden_by = ANY($1)', [ids]);
    await client.query('UPDATE verification_requests SET reviewed_by = NULL WHERE reviewed_by = ANY($1)', [ids]);
    await client.query('UPDATE support_tickets SET handled_by = NULL WHERE handled_by = ANY($1)', [ids]);
    await client.query('UPDATE support_tickets SET reported_user_id = NULL WHERE reported_user_id = ANY($1)', [ids]);
    await client.query('UPDATE withdrawals SET processed_by = NULL WHERE processed_by = ANY($1)', [ids]);
    await client.query('UPDATE disputes SET resolved_by = NULL WHERE resolved_by = ANY($1)', [ids]);
    await client.query('UPDATE facebook_deletion_requests SET job_rush_user_id = NULL WHERE job_rush_user_id = ANY($1)', [ids]);

    // 2) Delete NOT NULL / NO ACTION rows that cannot cascade automatically.
    //    Confirmed policy: conversations/calls involving the admin AND a
    //    deleted non-admin are deleted too, since the schema has no way
    //    to keep a message/call row with only one valid participant.
    await client.query('DELETE FROM messages WHERE conversation_id IN (SELECT conversation_id FROM conversation_participants WHERE user_id = ANY($1))', [ids]);
    await client.query('DELETE FROM conversations WHERE id IN (SELECT conversation_id FROM conversation_participants WHERE user_id = ANY($1))', [ids]);
    await client.query('DELETE FROM calls WHERE caller_user_id = ANY($1) OR callee_user_id = ANY($1)', [ids]);
    await client.query('DELETE FROM reviews WHERE reviewer_user_id = ANY($1) OR reviewee_user_id = ANY($1)', [ids]);
    await client.query('DELETE FROM payments WHERE payer_user_id = ANY($1)', [ids]);
    await client.query('DELETE FROM escrow_transactions WHERE hirer_user_id = ANY($1) OR worker_user_id = ANY($1)', [ids]);
    await client.query('DELETE FROM dispute_evidence WHERE uploaded_by = ANY($1)', [ids]);
    await client.query('DELETE FROM disputes WHERE opened_by_user_id = ANY($1) OR against_user_id = ANY($1)', [ids]);
    await client.query('DELETE FROM job_reports WHERE reporter_user_id = ANY($1)', [ids]);
    await client.query('DELETE FROM message_reports WHERE reporter_user_id = ANY($1)', [ids]);
    await client.query('DELETE FROM portfolio_reports WHERE reporter_user_id = ANY($1)', [ids]);
    await client.query('DELETE FROM review_reports WHERE reporter_user_id = ANY($1)', [ids]);
    await client.query('DELETE FROM featured_placements WHERE created_by = ANY($1) OR worker_user_id = ANY($1)', [ids]);

    // 3) The core delete — worker_profiles, hirer_profiles, and every
    //    other CASCADE-linked table (sessions, user_settings, wallets,
    //    portfolios, notifications, education, cv, work_experience,
    //    verification_requests, subscriptions, referrals, etc.) all
    //    cascade automatically from this single statement.
    const result = await client.query('DELETE FROM users WHERE id = ANY($1)', [ids]);
    return result.rowCount;
  });

  console.log(`Deleted ${deletedUserCount} user rows (cascaded through profiles and all linked tables).`);

  // 4) Storage cleanup — not part of the DB transaction (Supabase
  //    Storage operations don't participate in Postgres transactions).
  //    Run only after the DB commit above has succeeded.
  console.log(`\nDeleting ${files.length} storage files...`);
  const supabase = getSupabaseClient();
  let deletedFiles = 0;
  const failedFiles = [];
  for (const bucket of STORAGE_BUCKETS) {
    const bucketFiles = files.filter((f) => f.bucket === bucket).map((f) => f.path);
    if (bucketFiles.length === 0) continue;
    const { error } = await supabase.storage.from(bucket).remove(bucketFiles);
    if (error) {
      bucketFiles.forEach((path) => failedFiles.push({ bucket, path, error: error.message }));
    } else {
      deletedFiles += bucketFiles.length;
    }
  }
  console.log(`Storage: ${deletedFiles}/${files.length} deleted.`);
  if (failedFiles.length > 0) {
    console.error(`FAILED TO DELETE ${failedFiles.length} FILES (reported, not silently ignored):`);
    console.error(JSON.stringify(failedFiles, null, 2));
  }

  // 5) Post-deletion verification
  const remainingAdmins = await getAdminUsers();
  const remainingNonAdmins = await getNonAdminUsers();
  console.log(`\nPOST-DELETION VERIFICATION:`);
  console.log(`  Admin users remaining: ${remainingAdmins.length} (expected ${admins.length})`);
  console.log(`  Non-admin users remaining: ${remainingNonAdmins.length} (expected 0)`);

  await pool.end();
}

main().catch(async (e) => {
  console.error('FATAL ERROR — transaction rolled back, no partial deletion occurred:', e);
  try { await pool.end(); } catch {}
  process.exitCode = 1;
});
