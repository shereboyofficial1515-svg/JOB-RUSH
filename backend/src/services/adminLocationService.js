const { query } = require('../config/db');
const AppError = require('../utils/AppError');
const { recordAuditEvent } = require('../security/auditLogger');

async function listAllStates() {
  const { rows } = await query('SELECT * FROM states ORDER BY name');
  return rows;
}

/**
 * Enables or disables a state for the platform. This is the entire
 * mechanism behind expanding JOB RUSH beyond Delta State (business
 * rules #1/#2, spec section 47) — a data change, not a code change.
 */
async function setStateActive(stateId, isActive, adminUserId) {
  const { rows } = await query('UPDATE states SET is_active = $2 WHERE id = $1 RETURNING *', [stateId, isActive]);
  if (rows.length === 0) throw new AppError('State not found.', 404, 'NOT_FOUND');

  await recordAuditEvent({
    actorUserId: adminUserId,
    action: isActive ? 'STATE_ENABLED' : 'STATE_DISABLED',
    resourceType: 'state',
    resourceId: stateId,
    result: 'success',
  });

  return rows[0];
}

async function createLga(stateId, name) {
  try {
    const { rows } = await query('INSERT INTO lgas (state_id, name) VALUES ($1, $2) RETURNING *', [stateId, name]);
    return rows[0];
  } catch (err) {
    if (err.code === '23505') throw new AppError('This LGA already exists for that state.', 409, 'LGA_EXISTS');
    if (err.code === '23503') throw new AppError('State not found.', 404, 'NOT_FOUND');
    throw err;
  }
}

async function createArea(lgaId, name) {
  try {
    const { rows } = await query('INSERT INTO areas (lga_id, name) VALUES ($1, $2) RETURNING *', [lgaId, name]);
    return rows[0];
  } catch (err) {
    if (err.code === '23505') throw new AppError('This area already exists for that LGA.', 409, 'AREA_EXISTS');
    if (err.code === '23503') throw new AppError('LGA not found.', 404, 'NOT_FOUND');
    throw err;
  }
}

module.exports = { listAllStates, setStateActive, createLga, createArea };
