const { query } = require('../config/db');
const AppError = require('../utils/AppError');

/**
 * Returns every Nigerian state (not just the ones open for business),
 * each tagged with is_active, so the frontend can let a user select
 * any state and show a "not available here yet" message for whichever
 * ones Admin hasn't turned on -- rather than hiding them entirely,
 * which looked like the dropdown only had one option.
 */
async function listStates() {
  const { rows } = await query('SELECT id, name, is_active FROM states ORDER BY name');
  return rows;
}

async function listLgasForState(stateId) {
  const { rows } = await query('SELECT id, name FROM lgas WHERE state_id = $1 ORDER BY name', [stateId]);
  return rows;
}

async function listAreasForLga(lgaId) {
  const { rows } = await query('SELECT id, name FROM areas WHERE lga_id = $1 ORDER BY name', [lgaId]);
  return rows;
}

/**
 * Enforces the launch location restriction server-side (business rule
 * #16 / spec section 47): a profile can only be set to a state that
 * Admin has marked active, regardless of what the client sends. Also
 * verifies the lga/area actually belong to that state/lga, so a
 * client can't mix mismatched IDs.
 */
async function assertLocationAllowed({ stateId, lgaId, areaId }) {
  if (!stateId) return; // location is optional at this layer; required-ness is a profile-completion concern

  const { rows: stateRows } = await query('SELECT id, is_active FROM states WHERE id = $1', [stateId]);
  const state = stateRows[0];
  if (!state) {
    throw new AppError('Selected state does not exist.', 400, 'INVALID_LOCATION');
  }
  if (!state.is_active) {
    throw new AppError('JOB RUSH is not yet available in this state.', 403, 'LOCATION_NOT_ENABLED');
  }

  if (lgaId) {
    const { rows: lgaRows } = await query('SELECT id FROM lgas WHERE id = $1 AND state_id = $2', [lgaId, stateId]);
    if (lgaRows.length === 0) {
      throw new AppError('Selected LGA does not belong to the selected state.', 400, 'INVALID_LOCATION');
    }
  }

  if (areaId) {
    if (!lgaId) {
      throw new AppError('An LGA is required when specifying an area.', 400, 'INVALID_LOCATION');
    }
    const { rows: areaRows } = await query('SELECT id FROM areas WHERE id = $1 AND lga_id = $2', [areaId, lgaId]);
    if (areaRows.length === 0) {
      throw new AppError('Selected area does not belong to the selected LGA.', 400, 'INVALID_LOCATION');
    }
  }
}

module.exports = { listStates, listLgasForState, listAreasForLga, assertLocationAllowed };
