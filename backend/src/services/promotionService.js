const { query } = require('../config/db');
const AppError = require('../utils/AppError');
const { recordAuditEvent } = require('../security/auditLogger');

async function createPlacement(adminUserId, { placementType, workerUserId, categoryId, stateId, endsAt }) {
  if (placementType === 'category' && !categoryId) {
    throw new AppError('categoryId is required for a category placement.', 400, 'MISSING_CATEGORY');
  }
  if (placementType === 'location' && !stateId) {
    throw new AppError('stateId is required for a location placement.', 400, 'MISSING_STATE');
  }

  const { rows: workerRows } = await query('SELECT user_id FROM worker_profiles WHERE user_id = $1', [workerUserId]);
  if (workerRows.length === 0) throw new AppError('Worker profile not found.', 404, 'NOT_FOUND');

  const { rows } = await query(
    `INSERT INTO featured_placements (placement_type, worker_user_id, category_id, state_id, ends_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [placementType, workerUserId, categoryId || null, stateId || null, endsAt || null, adminUserId]
  );

  await recordAuditEvent({
    actorUserId: adminUserId,
    action: 'FEATURED_PLACEMENT_CREATED',
    resourceType: 'featured_placement',
    resourceId: rows[0].id,
    result: 'success',
    metadata: { placementType, workerUserId },
  });

  return rows[0];
}

async function removePlacement(placementId, adminUserId) {
  const { rows } = await query('UPDATE featured_placements SET ends_at = now() WHERE id = $1 AND ends_at IS NULL RETURNING *', [
    placementId,
  ]);
  if (rows.length === 0) throw new AppError('Placement not found or already ended.', 404, 'NOT_FOUND');

  await recordAuditEvent({
    actorUserId: adminUserId,
    action: 'FEATURED_PLACEMENT_REMOVED',
    resourceType: 'featured_placement',
    resourceId: placementId,
    result: 'success',
  });

  return rows[0];
}

async function listPlacementsForAdmin() {
  const { rows } = await query(
    `SELECT fp.*, u.full_name FROM featured_placements fp
       JOIN users u ON u.id = fp.worker_user_id
      ORDER BY fp.created_at DESC`
  );
  return rows;
}

/** Public read — active placements for a given section, used by the homepage/category/location pages. */
async function listActivePlacements(placementType, { categoryId, stateId } = {}) {
  const conditions = [`placement_type = $1`, `starts_at <= now()`, `(ends_at IS NULL OR ends_at > now())`];
  const params = [placementType];

  if (categoryId) {
    params.push(categoryId);
    conditions.push(`category_id = $${params.length}`);
  }
  if (stateId) {
    params.push(stateId);
    conditions.push(`state_id = $${params.length}`);
  }

  const { rows } = await query(
    `SELECT fp.worker_user_id, wp.professional_title, wp.rating_avg, wp.is_pro, wp.verification_status, u.full_name
       FROM featured_placements fp
       JOIN worker_profiles wp ON wp.user_id = fp.worker_user_id
       JOIN users u ON u.id = fp.worker_user_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY fp.created_at DESC
      LIMIT 20`,
    params
  );
  return rows;
}

module.exports = { createPlacement, removePlacement, listPlacementsForAdmin, listActivePlacements };
