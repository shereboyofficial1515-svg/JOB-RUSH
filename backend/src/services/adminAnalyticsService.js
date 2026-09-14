const { query } = require('../config/db');

/**
 * Single-call dashboard summary. Each metric is its own small query
 * rather than one giant joined query — easier to read, easier to
 * extend, and the individual queries are cheap enough (mostly COUNT)
 * that running them in parallel costs little.
 */
async function getDashboardSummary() {
  const queries = {
    totalUsers: `SELECT COUNT(*)::int AS n FROM users`,
    activeUsers: `SELECT COUNT(*)::int AS n FROM users WHERE account_status = 'active'`,
    workers: `SELECT COUNT(*)::int AS n FROM users WHERE role IN ('worker', 'both')`,
    hirers: `SELECT COUNT(*)::int AS n FROM users WHERE role IN ('hirer', 'both')`,
    verifiedProfessionals: `SELECT COUNT(*)::int AS n FROM worker_profiles WHERE verification_status = 'approved'`,
    proProfessionals: `SELECT COUNT(*)::int AS n FROM worker_profiles WHERE is_pro = true`,
    activeSubscriptions: `SELECT COUNT(*)::int AS n FROM subscriptions WHERE status = 'active'`,
    subscriptionRevenue: `SELECT COALESCE(SUM(amount), 0) AS n FROM subscription_payments WHERE status = 'success'`,
    totalJobPostings: `SELECT COUNT(*)::int AS n FROM jobs`,
    openJobPostings: `SELECT COUNT(*)::int AS n FROM jobs WHERE status = 'open'`,
    totalApplications: `SELECT COUNT(*)::int AS n FROM applications`,
    totalInterviews: `SELECT COUNT(*)::int AS n FROM interviews`,
    completedContracts: `SELECT COUNT(*)::int AS n FROM contracts WHERE status = 'completed'`,
    totalEscrowVolume: `SELECT COALESCE(SUM(amount), 0) AS n FROM escrow_transactions WHERE status = 'released'`,
    platformFeesCollected: `SELECT COALESCE(SUM(platform_fee_amount), 0) AS n FROM escrow_transactions WHERE status = 'released'`,
    pendingWithdrawals: `SELECT COUNT(*)::int AS n FROM withdrawals WHERE status = 'pending'`,
    openDisputes: `SELECT COUNT(*)::int AS n FROM disputes WHERE status IN ('open', 'under_review', 'awaiting_information')`,
    newUsersLast30Days: `SELECT COUNT(*)::int AS n FROM users WHERE created_at > now() - interval '30 days'`,
    newJobsLast30Days: `SELECT COUNT(*)::int AS n FROM jobs WHERE created_at > now() - interval '30 days'`,
  };

  const keys = Object.keys(queries);
  const results = await Promise.all(keys.map((key) => query(queries[key])));

  const summary = {};
  keys.forEach((key, i) => {
    summary[key] = results[i].rows[0].n;
  });
  return summary;
}

module.exports = { getDashboardSummary };
