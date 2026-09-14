const { query, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');

const MAX_MEDIA_PER_PORTFOLIO = 20;
const ALLOWED_MEDIA_TYPES = ['image', 'video', 'document'];

async function listPortfoliosForWorker(workerUserId) {
  const { rows: portfolios } = await query(
    `SELECT * FROM portfolios WHERE worker_user_id = $1 ORDER BY is_featured DESC, created_at DESC`,
    [workerUserId]
  );

  if (portfolios.length === 0) return [];

  const ids = portfolios.map((p) => p.id);
  const { rows: media } = await query(
    `SELECT * FROM portfolio_media WHERE portfolio_id = ANY($1::uuid[]) ORDER BY sort_order`,
    [ids]
  );

  const mediaByPortfolio = media.reduce((acc, m) => {
    (acc[m.portfolio_id] ||= []).push(m);
    return acc;
  }, {});

  return portfolios.map((p) => ({ ...p, media: mediaByPortfolio[p.id] || [] }));
}

async function getOwnedPortfolio(portfolioId, workerUserId) {
  const { rows } = await query(
    `SELECT * FROM portfolios WHERE id = $1 AND worker_user_id = $2`,
    [portfolioId, workerUserId]
  );
  if (rows.length === 0) {
    // Same error whether it doesn't exist or belongs to someone else —
    // don't confirm existence of another worker's portfolio ID.
    throw new AppError('Portfolio project not found.', 404, 'NOT_FOUND');
  }
  return rows[0];
}

async function createPortfolio(workerUserId, { title, description, categoryId, projectType, externalLink }) {
  const { rows } = await query(
    `INSERT INTO portfolios (worker_user_id, title, description, category_id, project_type, external_link)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [workerUserId, title, description || null, categoryId || null, projectType || null, externalLink || null]
  );
  return rows[0];
}

async function updatePortfolio(portfolioId, workerUserId, { title, description, categoryId, projectType, externalLink }) {
  await getOwnedPortfolio(portfolioId, workerUserId); // throws if not owned

  const { rows } = await query(
    `UPDATE portfolios
        SET title = COALESCE($3, title),
            description = COALESCE($4, description),
            category_id = COALESCE($5, category_id),
            project_type = COALESCE($6, project_type),
            external_link = COALESCE($7, external_link)
      WHERE id = $1 AND worker_user_id = $2
      RETURNING *`,
    [portfolioId, workerUserId, title, description, categoryId, projectType, externalLink]
  );
  return rows[0];
}

async function deletePortfolio(portfolioId, workerUserId) {
  await getOwnedPortfolio(portfolioId, workerUserId);
  await query('DELETE FROM portfolios WHERE id = $1 AND worker_user_id = $2', [portfolioId, workerUserId]);
}

/**
 * Attaches a media record to a portfolio. `storagePath` must already
 * point to a file the storage layer has validated (MIME, size,
 * extension, signature) and uploaded on this user's behalf — this
 * service does not itself touch Supabase Storage; that belongs to the
 * dedicated storage module referenced in the JOB RUSH spec section 5/22.
 */
async function addPortfolioMedia(portfolioId, workerUserId, { mediaType, storagePath, isPrimary = false, fileSize }) {
  await getOwnedPortfolio(portfolioId, workerUserId);

  if (!ALLOWED_MEDIA_TYPES.includes(mediaType)) {
    throw new AppError('Invalid media type.', 400, 'INVALID_MEDIA_TYPE');
  }

  const { rows: countRows } = await query(
    'SELECT COUNT(*)::int AS count FROM portfolio_media WHERE portfolio_id = $1',
    [portfolioId]
  );
  if (countRows[0].count >= MAX_MEDIA_PER_PORTFOLIO) {
    throw new AppError(`A portfolio project can have at most ${MAX_MEDIA_PER_PORTFOLIO} media items.`, 400, 'MEDIA_LIMIT_REACHED');
  }

  return withTransaction(async (client) => {
    if (isPrimary) {
      await client.query('UPDATE portfolio_media SET is_primary = false WHERE portfolio_id = $1', [portfolioId]);
    }
    const { rows } = await client.query(
      `INSERT INTO portfolio_media (portfolio_id, media_type, storage_path, is_primary, file_size)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [portfolioId, mediaType, storagePath, isPrimary, fileSize || null]
    );
    return rows[0];
  });
}

async function removePortfolioMedia(portfolioId, mediaId, workerUserId) {
  await getOwnedPortfolio(portfolioId, workerUserId);
  await query('DELETE FROM portfolio_media WHERE id = $1 AND portfolio_id = $2', [mediaId, portfolioId]);
  // Note: the actual object in Supabase Storage should also be deleted
  // here via the storage module — left as a hook point for that module.
}

module.exports = {
  listPortfoliosForWorker,
  getOwnedPortfolio,
  createPortfolio,
  updatePortfolio,
  deletePortfolio,
  addPortfolioMedia,
  removePortfolioMedia,
};
