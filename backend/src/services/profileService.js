const { query, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const locationService = require('./locationService');

// Fields a user may set on their own worker profile. Trust/visibility
// fields (verification_status, is_pro, ratings, counts) are
// deliberately absent — they can only ever be written by the systems
// that own them (verification review, subscriptions, reviews, jobs).
const WORKER_EDITABLE_FIELDS = [
  'professional_title',
  'bio',
  'experience_years',
  'availability_status',
  'languages',
  'state_id',
  'lga_id',
  'area_id',
  'street_address',
  'landmark',
  'service_radius_km',
  'profile_picture_url',
];

const HIRER_EDITABLE_FIELDS = [
  'display_name',
  'is_company',
  'bio',
  'state_id',
  'lga_id',
  'area_id',
  'profile_picture_url',
];

function pickAllowed(input, allowedFields) {
  const out = {};
  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      out[field] = input[field];
    }
  }
  return out;
}

function computeWorkerCompletionPercent(profile, skillCount) {
  const checks = [
    !!profile.professional_title,
    !!profile.bio && profile.bio.length >= 40,
    profile.experience_years !== null && profile.experience_years !== undefined,
    !!profile.state_id,
    !!profile.profile_picture_url,
    skillCount > 0,
  ];
  const completed = checks.filter(Boolean).length;
  return Math.round((completed / checks.length) * 100);
}

async function ensureWorkerProfileRow(userId) {
  await query(
    `INSERT INTO worker_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
}

async function ensureHirerProfileRow(userId) {
  await query(
    `INSERT INTO hirer_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
}

async function getWorkerProfile(userId) {
  const { rows } = await query(
    `SELECT wp.*, u.full_name, u.email, u.phone, u.account_status, u.deactivated_at,
            COALESCE(us.profile_visibility, 'public') AS profile_visibility
       FROM worker_profiles wp
       JOIN users u ON u.id = wp.user_id
       LEFT JOIN user_settings us ON us.user_id = wp.user_id
      WHERE wp.user_id = $1`,
    [userId]
  );
  if (rows.length === 0) return null;

  const { rows: skillRows } = await query(
    `SELECT s.id, s.name FROM worker_profile_skills wps
       JOIN skills s ON s.id = wps.skill_id
      WHERE wps.worker_user_id = $1
      ORDER BY s.name`,
    [userId]
  );

  return { ...rows[0], skills: skillRows };
}

/**
 * Updates the caller's own worker profile. `userId` must come from
 * the authenticated session (req.user.id) — never from the request
 * body — so this function signature deliberately takes it separately
 * from `input`.
 */
async function updateWorkerProfile(userId, input) {
  await ensureWorkerProfileRow(userId);

  const updates = pickAllowed(input, WORKER_EDITABLE_FIELDS);

  await locationService.assertLocationAllowed({
    stateId: updates.state_id,
    lgaId: updates.lga_id,
    areaId: updates.area_id,
  });

  if (Object.keys(updates).length > 0) {
    const setClauses = Object.keys(updates).map((field, i) => `${field} = $${i + 2}`);
    await query(
      `UPDATE worker_profiles SET ${setClauses.join(', ')} WHERE user_id = $1`,
      [userId, ...Object.values(updates)]
    );
  }

  if (Array.isArray(input.skillIds)) {
    await setWorkerSkills(userId, input.skillIds);
  }

  const profile = await getWorkerProfile(userId);
  const completion = computeWorkerCompletionPercent(profile, profile.skills.length);
  await query('UPDATE worker_profiles SET profile_completion_percent = $2 WHERE user_id = $1', [
    userId,
    completion,
  ]);

  return getWorkerProfile(userId);
}

/**
 * Replaces a worker's skill set. Validates every skill ID actually
 * exists and is active — never trusts arbitrary IDs from the client.
 */
async function setWorkerSkills(userId, skillIds) {
  const uniqueIds = [...new Set(skillIds)];

  if (uniqueIds.length > 0) {
    const { rows: validSkills } = await query(
      `SELECT id FROM skills WHERE id = ANY($1::uuid[]) AND is_active = true`,
      [uniqueIds]
    );
    if (validSkills.length !== uniqueIds.length) {
      throw new AppError('One or more selected skills are invalid.', 400, 'INVALID_SKILL');
    }
  }

  await withTransaction(async (client) => {
    await client.query('DELETE FROM worker_profile_skills WHERE worker_user_id = $1', [userId]);
    for (const skillId of uniqueIds) {
      await client.query(
        'INSERT INTO worker_profile_skills (worker_user_id, skill_id) VALUES ($1, $2)',
        [userId, skillId]
      );
    }
  });
}

/**
 * Public worker search/browse. PRO status gives a legitimate ranking
 * boost (spec section 26) but never overrides relevance — PRO workers
 * are only boosted among results that already match the filters, and
 * the ordering still falls through to rating/completeness beneath that.
 */
async function searchWorkers({
  skillId,
  categoryId,
  stateId,
  lgaId,
  keyword,
  verifiedOnly,
  page = 1,
  pageSize = 20,
}) {
  const conditions = [
    `wp.availability_status != 'unavailable'`,
    `u.account_status = 'active'`,
    `u.deactivated_at IS NULL`,
    `COALESCE(us.profile_visibility, 'public') = 'public'`,
  ];
  const params = [];

  if (stateId) {
    params.push(stateId);
    conditions.push(`wp.state_id = $${params.length}`);
  }
  if (lgaId) {
    params.push(lgaId);
    conditions.push(`wp.lga_id = $${params.length}`);
  }
  if (verifiedOnly) {
    conditions.push(`wp.verification_status = 'approved'`);
  }
  if (keyword) {
    params.push(`%${keyword}%`);
    conditions.push(`(wp.professional_title ILIKE $${params.length} OR wp.bio ILIKE $${params.length})`);
  }
  if (skillId) {
    params.push(skillId);
    conditions.push(`EXISTS (SELECT 1 FROM worker_profile_skills wps WHERE wps.worker_user_id = wp.user_id AND wps.skill_id = $${params.length})`);
  }
  if (categoryId) {
    params.push(categoryId);
    conditions.push(`EXISTS (
      SELECT 1 FROM worker_profile_skills wps JOIN skills s ON s.id = wps.skill_id
       WHERE wps.worker_user_id = wp.user_id AND s.category_id = $${params.length}
    )`);
  }

  const limit = Math.min(Math.max(parseInt(pageSize, 10) || 20, 1), 50);
  const offset = (Math.max(parseInt(page, 10) || 1, 1) - 1) * limit;
  params.push(limit, offset);

  const { rows } = await query(
    `SELECT wp.user_id, wp.professional_title, wp.bio, wp.profile_picture_url,
            wp.verification_status, wp.is_pro, wp.rating_avg, wp.rating_count,
            wp.completed_jobs_count, wp.availability_status, u.full_name
       FROM worker_profiles wp
       JOIN users u ON u.id = wp.user_id
       LEFT JOIN user_settings us ON us.user_id = wp.user_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY wp.is_pro DESC, wp.rating_avg DESC, wp.profile_completion_percent DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

async function getHirerProfile(userId) {
  const { rows } = await query(
    `SELECT hp.*, u.full_name, u.email, u.phone
       FROM hirer_profiles hp
       JOIN users u ON u.id = hp.user_id
      WHERE hp.user_id = $1`,
    [userId]
  );
  return rows[0] || null;
}

async function updateHirerProfile(userId, input) {
  await ensureHirerProfileRow(userId);

  const updates = pickAllowed(input, HIRER_EDITABLE_FIELDS);

  await locationService.assertLocationAllowed({
    stateId: updates.state_id,
    lgaId: updates.lga_id,
    areaId: updates.area_id,
  });

  if (Object.keys(updates).length > 0) {
    const setClauses = Object.keys(updates).map((field, i) => `${field} = $${i + 2}`);
    await query(
      `UPDATE hirer_profiles SET ${setClauses.join(', ')} WHERE user_id = $1`,
      [userId, ...Object.values(updates)]
    );
  }

  return getHirerProfile(userId);
}

module.exports = {
  getWorkerProfile,
  updateWorkerProfile,
  setWorkerSkills,
  searchWorkers,
  getHirerProfile,
  updateHirerProfile,
  ensureWorkerProfileRow,
  ensureHirerProfileRow,
};
