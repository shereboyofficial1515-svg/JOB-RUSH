const { query, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const { ensureWorkerProfileRow } = require('./profileService');
const { getPublicUrlForPath, deleteObject } = require('./storageService');

const MAX_MEDIA_PER_PORTFOLIO = 20;
const MAX_VIDEOS_PER_WORKER = 3;
const ALLOWED_MEDIA_TYPES = ['image', 'video', 'document'];

function attachPublicUrl(media) {
  return { ...media, url: getPublicUrlForPath('PORTFOLIO_MEDIA', media.storage_path) };
}

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
    (acc[m.portfolio_id] ||= []).push(attachPublicUrl(m));
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
  // portfolios.worker_user_id references worker_profiles(user_id),
  // which otherwise only gets created the first time someone saves a
  // field on Profile Settings — without this, a worker who tries to
  // add a portfolio project before ever touching their profile hits a
  // foreign-key violation instead of the project actually being created.
  await ensureWorkerProfileRow(workerUserId);

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
async function countWorkerVideos(workerUserId) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS count
       FROM portfolio_media pm
       JOIN portfolios p ON p.id = pm.portfolio_id
      WHERE p.worker_user_id = $1 AND pm.media_type = 'video'`,
    [workerUserId]
  );
  return rows[0].count;
}

async function addPortfolioMedia(
  portfolioId,
  workerUserId,
  { mediaType, storagePath, isPrimary = false, fileSize, durationSeconds, width, height }
) {
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

  if (mediaType === 'video') {
    const videoCount = await countWorkerVideos(workerUserId);
    if (videoCount >= MAX_VIDEOS_PER_WORKER) {
      throw new AppError(`You can upload at most ${MAX_VIDEOS_PER_WORKER} work videos in total.`, 400, 'VIDEO_LIMIT_REACHED');
    }
  }

  return withTransaction(async (client) => {
    if (isPrimary) {
      await client.query('UPDATE portfolio_media SET is_primary = false WHERE portfolio_id = $1', [portfolioId]);
    }
    const { rows } = await client.query(
      `INSERT INTO portfolio_media (portfolio_id, media_type, storage_path, is_primary, file_size, duration_seconds, width, height)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [portfolioId, mediaType, storagePath, isPrimary, fileSize || null, durationSeconds || null, width || null, height || null]
    );
    return attachPublicUrl(rows[0]);
  });
}

/**
 * Reassigns sort_order for a portfolio's media to match the order the
 * client supplied. `mediaIds` must be exactly the set of media IDs
 * already belonging to this (owned) portfolio — a partial or foreign
 * list is rejected rather than silently reordering a subset.
 */
async function reorderPortfolioMedia(portfolioId, workerUserId, mediaIds) {
  await getOwnedPortfolio(portfolioId, workerUserId);

  const { rows: existing } = await query('SELECT id FROM portfolio_media WHERE portfolio_id = $1', [portfolioId]);
  const existingIds = new Set(existing.map((r) => r.id));
  const uniqueRequested = new Set(mediaIds);

  if (existingIds.size !== uniqueRequested.size || [...existingIds].some((id) => !uniqueRequested.has(id))) {
    throw new AppError('mediaIds must match this project\'s existing media exactly.', 400, 'MEDIA_MISMATCH');
  }

  await withTransaction(async (client) => {
    for (let i = 0; i < mediaIds.length; i += 1) {
      await client.query('UPDATE portfolio_media SET sort_order = $3 WHERE id = $1 AND portfolio_id = $2', [
        mediaIds[i],
        portfolioId,
        i,
      ]);
    }
  });

  const { rows } = await query('SELECT * FROM portfolio_media WHERE portfolio_id = $1 ORDER BY sort_order', [portfolioId]);
  return rows.map(attachPublicUrl);
}

async function setPrimaryPortfolioMedia(portfolioId, mediaId, workerUserId) {
  await getOwnedPortfolio(portfolioId, workerUserId);

  return withTransaction(async (client) => {
    const { rows } = await client.query('SELECT id FROM portfolio_media WHERE id = $1 AND portfolio_id = $2', [
      mediaId,
      portfolioId,
    ]);
    if (rows.length === 0) throw new AppError('Media not found.', 404, 'NOT_FOUND');

    await client.query('UPDATE portfolio_media SET is_primary = false WHERE portfolio_id = $1', [portfolioId]);
    const { rows: updated } = await client.query(
      'UPDATE portfolio_media SET is_primary = true WHERE id = $1 RETURNING *',
      [mediaId]
    );
    return attachPublicUrl(updated[0]);
  });
}

async function removePortfolioMedia(portfolioId, mediaId, workerUserId) {
  await getOwnedPortfolio(portfolioId, workerUserId);
  const { rows } = await query('SELECT storage_path FROM portfolio_media WHERE id = $1 AND portfolio_id = $2', [
    mediaId,
    portfolioId,
  ]);
  await query('DELETE FROM portfolio_media WHERE id = $1 AND portfolio_id = $2', [mediaId, portfolioId]);

  if (rows.length > 0) {
    // Best-effort storage cleanup — the DB row is already gone (the
    // part the user actually sees), so a storage-side failure here
    // must not turn into a failed delete from the user's perspective.
    try {
      await deleteObject('PORTFOLIO_MEDIA', rows[0].storage_path);
    } catch (_err) {
      // Orphaned storage object — acceptable; not surfaced to the user.
    }
  }
}

module.exports = {
  listPortfoliosForWorker,
  getOwnedPortfolio,
  createPortfolio,
  updatePortfolio,
  deletePortfolio,
  addPortfolioMedia,
  reorderPortfolioMedia,
  setPrimaryPortfolioMedia,
  removePortfolioMedia,
};
