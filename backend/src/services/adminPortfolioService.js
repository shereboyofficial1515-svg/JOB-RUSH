const { query } = require('../config/db');
const AppError = require('../utils/AppError');
const { getPublicUrlForPath } = require('./storageService');
const { recordAuditEvent } = require('../security/auditLogger');

function attachPublicUrl(media) {
  return { ...media, url: getPublicUrlForPath('PORTFOLIO_MEDIA', media.storage_path) };
}

/** Reports a portfolio project — any authenticated user, mirroring job_reports/review_reports. */
async function reportPortfolio(reporterUserId, portfolioId, reason) {
  const { rows: exists } = await query('SELECT id FROM portfolios WHERE id = $1', [portfolioId]);
  if (exists.length === 0) throw new AppError('Portfolio project not found.', 404, 'NOT_FOUND');

  const { rows } = await query(
    `INSERT INTO portfolio_reports (portfolio_id, reporter_user_id, reason) VALUES ($1, $2, $3) RETURNING *`,
    [portfolioId, reporterUserId, reason]
  );
  return rows[0];
}

/**
 * Admin browse/search across every portfolio project regardless of
 * privacy or hidden state — the user-facing listPortfoliosForWorker
 * only ever shows one worker's own projects.
 */
async function listPortfoliosForAdmin({ keyword, workerUserId, categoryId, page = 1, pageSize = 25 }) {
  const conditions = [];
  const params = [];

  if (keyword) {
    params.push(`%${keyword}%`);
    conditions.push(`p.title ILIKE $${params.length}`);
  }
  if (workerUserId) {
    params.push(workerUserId);
    conditions.push(`p.worker_user_id = $${params.length}`);
  }
  if (categoryId) {
    params.push(categoryId);
    conditions.push(`p.category_id = $${params.length}`);
  }

  const limit = Math.min(Math.max(parseInt(pageSize, 10) || 25, 1), 100);
  const offset = (Math.max(parseInt(page, 10) || 1, 1) - 1) * limit;
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const listParams = [...params, limit, offset];

  const { rows } = await query(
    `SELECT p.id, p.title, p.worker_user_id, p.category_id, p.hidden, p.is_featured, p.created_at,
            u.full_name AS worker_full_name, cat.name AS category_name
       FROM portfolios p
       JOIN users u ON u.id = p.worker_user_id
       LEFT JOIN categories cat ON cat.id = p.category_id
       ${whereClause}
      ORDER BY p.created_at DESC
      LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );
  return rows;
}

/** Full admin detail — bypasses the privacy/visibility gate getPortfolioDetails applies to public viewers. */
async function getPortfolioForAdmin(portfolioId) {
  const { rows } = await query(
    `SELECT p.*, cat.name AS category_name, u.full_name AS worker_full_name
       FROM portfolios p
       JOIN users u ON u.id = p.worker_user_id
       LEFT JOIN categories cat ON cat.id = p.category_id
      WHERE p.id = $1`,
    [portfolioId]
  );
  if (rows.length === 0) throw new AppError('Portfolio project not found.', 404, 'NOT_FOUND');

  const { rows: media } = await query(
    'SELECT * FROM portfolio_media WHERE portfolio_id = $1 ORDER BY sort_order',
    [portfolioId]
  );

  return { ...rows[0], media: media.map(attachPublicUrl) };
}

async function listReportedPortfolios() {
  const { rows } = await query(
    `SELECT p.id AS portfolio_id, p.title, p.hidden, COUNT(pr.id)::int AS report_count,
            MAX(pr.created_at) AS last_reported_at
       FROM portfolio_reports pr JOIN portfolios p ON p.id = pr.portfolio_id
      GROUP BY p.id, p.title, p.hidden
      ORDER BY last_reported_at DESC`
  );
  return rows;
}

async function getReportsForPortfolio(portfolioId) {
  const { rows } = await query(
    `SELECT pr.*, u.full_name AS reporter_name FROM portfolio_reports pr
       JOIN users u ON u.id = pr.reporter_user_id
      WHERE pr.portfolio_id = $1 ORDER BY pr.created_at DESC`,
    [portfolioId]
  );
  return rows;
}

async function hidePortfolio(portfolioId, adminUserId, reason) {
  const { rows } = await query(
    `UPDATE portfolios SET hidden = true, hidden_reason = $2, hidden_by = $3, hidden_at = now()
      WHERE id = $1 RETURNING *`,
    [portfolioId, reason || null, adminUserId]
  );
  if (rows.length === 0) throw new AppError('Portfolio project not found.', 404, 'NOT_FOUND');

  await recordAuditEvent({
    actorUserId: adminUserId,
    action: 'PORTFOLIO_HIDDEN',
    resourceType: 'portfolio',
    resourceId: portfolioId,
    result: 'success',
    metadata: { reason },
  });
  return rows[0];
}

async function restorePortfolio(portfolioId, adminUserId) {
  const { rows } = await query(
    `UPDATE portfolios SET hidden = false, hidden_reason = NULL, hidden_by = NULL, hidden_at = NULL
      WHERE id = $1 RETURNING *`,
    [portfolioId]
  );
  if (rows.length === 0) throw new AppError('Portfolio project not found.', 404, 'NOT_FOUND');

  await recordAuditEvent({
    actorUserId: adminUserId,
    action: 'PORTFOLIO_RESTORED',
    resourceType: 'portfolio',
    resourceId: portfolioId,
    result: 'success',
  });
  return rows[0];
}

module.exports = {
  reportPortfolio,
  listPortfoliosForAdmin,
  getPortfolioForAdmin,
  listReportedPortfolios,
  getReportsForPortfolio,
  hidePortfolio,
  restorePortfolio,
};
