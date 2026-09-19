const { query } = require('../config/db');
const AppError = require('../utils/AppError');

const VALID_CATEGORIES = ['fake_profile', 'fraud_scam', 'inappropriate_content', 'false_information', 'harassment', 'spam', 'other'];

/** Reports a profile/user -- any authenticated user, mirroring job_reports/review_reports/portfolio_reports. */
async function reportProfile(reporterUserId, reportedUserId, { category, reason }) {
  if (reporterUserId === reportedUserId) {
    throw new AppError('You cannot report your own profile.', 400, 'CANNOT_REPORT_SELF');
  }
  if (!VALID_CATEGORIES.includes(category)) {
    throw new AppError('Invalid report category.', 400, 'INVALID_CATEGORY');
  }

  const { rows: userExists } = await query('SELECT id FROM users WHERE id = $1', [reportedUserId]);
  if (userExists.length === 0) throw new AppError('User not found.', 404, 'NOT_FOUND');

  const { rows } = await query(
    `INSERT INTO profile_reports (reported_user_id, reporter_user_id, category, reason) VALUES ($1, $2, $3, $4) RETURNING *`,
    [reportedUserId, reporterUserId, category, reason]
  );
  return rows[0];
}

/** Admin: profiles grouped by report count, most-reported first -- same shape as adminPortfolioService.listReportedPortfolios. */
async function listReportedProfiles() {
  const { rows } = await query(
    `SELECT pr.reported_user_id, u.full_name, u.role, u.account_status, COUNT(pr.id)::int AS report_count,
            MAX(pr.created_at) AS last_reported_at
       FROM profile_reports pr JOIN users u ON u.id = pr.reported_user_id
      GROUP BY pr.reported_user_id, u.full_name, u.role, u.account_status
      ORDER BY last_reported_at DESC`
  );
  return rows;
}

async function getReportsForUser(reportedUserId) {
  const { rows } = await query(
    `SELECT pr.*, u.full_name AS reporter_name FROM profile_reports pr
       JOIN users u ON u.id = pr.reporter_user_id
      WHERE pr.reported_user_id = $1 ORDER BY pr.created_at DESC`,
    [reportedUserId]
  );
  return rows;
}

module.exports = { VALID_CATEGORIES, reportProfile, listReportedProfiles, getReportsForUser };
