const { addKeywordConditions } = require('../utils/searchTerms');
const { query, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const locationService = require('./locationService');
const storageService = require('./storageService');
const referralService = require('./referralService');

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
  'cover_photo_url',
  'starting_price',
  'price_currency',
  'working_days_structured',
  'working_hours_start',
  'working_hours_end',
  'working_hours_ends_next_day',
  'gender',
  'gender_custom',
  'gender_visibility',
];

const HIRER_EDITABLE_FIELDS = [
  'display_name',
  'is_company',
  'bio',
  'state_id',
  'lga_id',
  'area_id',
  'profile_picture_url',
  'gender',
  'gender_custom',
  'gender_visibility',
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

/**
 * Image URL fields must point at a file this user uploaded to the matching
 * bucket. A value that is unchanged is accepted as is, so profiles saved before
 * this check existed can still be edited without re-uploading.
 */
async function assertOwnImages(userId, table, updates, bucketByField) {
  const fields = Object.keys(bucketByField).filter((f) => updates[f]);
  if (fields.length === 0) return;
  const { rows } = await query(`SELECT ${fields.join(', ')} FROM ${table} WHERE user_id = $1`, [userId]);
  const current = rows[0] || {};
  for (const f of fields) {
    if (updates[f] !== current[f]) storageService.assertOwnedPublicUrl(bucketByField[f], userId, updates[f], 'photo');
  }
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
            u.email_verified_at, u.phone_verified_at,
            COALESCE(us.profile_visibility, 'public') AS profile_visibility,
            st.name AS state_name, l.name AS lga_name, a.name AS area_name
       FROM worker_profiles wp
       JOIN users u ON u.id = wp.user_id
       LEFT JOIN user_settings us ON us.user_id = wp.user_id
       LEFT JOIN states st ON st.id = wp.state_id
       LEFT JOIN lgas l ON l.id = wp.lga_id
       LEFT JOIN areas a ON a.id = wp.area_id
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
  await assertOwnImages(userId, 'worker_profiles', updates, { profile_picture_url: 'PROFILE_PICTURES', cover_photo_url: 'PROFILE_COVERS' });

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

  // Referral qualifying activity (Part 5/13): a substantially complete
  // professional profile is real, meaningful Job Rush usage -- not
  // "opened the dashboard" or "changed a theme". 80% requires at least
  // 5 of the 6 completion checks (title, bio, experience, location,
  // photo, a skill), not just creating an empty profile row.
  if (completion >= 80) {
    referralService.markActivityCompleted(userId, 'profile_completed').catch(() => {});
  }

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
  minRating,
  maxPrice,
  availabilityStatus,
  hasVideo,
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
  if (verifiedOnly === true || verifiedOnly === 'true') {
    conditions.push(`wp.verification_status = 'approved'`);
  }
  const minRatingNum = Number(minRating);
  if (minRating && Number.isFinite(minRatingNum)) {
    params.push(minRatingNum);
    conditions.push(`wp.rating_avg >= $${params.length}`);
  }
  const maxPriceNum = Number(maxPrice);
  if (maxPrice && Number.isFinite(maxPriceNum)) {
    params.push(maxPriceNum);
    conditions.push(`wp.starting_price IS NOT NULL AND wp.starting_price <= $${params.length}`);
  }
  if (availabilityStatus) {
    params.push(availabilityStatus);
    conditions.push(`wp.availability_status = $${params.length}`);
  }
  if (hasVideo === true || hasVideo === 'true') {
    conditions.push(`EXISTS (
      SELECT 1 FROM portfolios p JOIN portfolio_media pm ON pm.portfolio_id = p.id
       WHERE p.worker_user_id = wp.user_id AND pm.media_type = 'video'
    )`);
  }
  // Every word must match something about the person: their title, bio, name,
  // location, a skill, an active service, or their business name.
  const firstTerm = addKeywordConditions(keyword, params, conditions, (p) => `
        wp.professional_title ILIKE ${p} OR wp.bio ILIKE ${p} OR u.full_name ILIKE ${p}
        OR st.name ILIKE ${p} OR l.name ILIKE ${p}
        OR EXISTS (SELECT 1 FROM worker_profile_skills wps JOIN skills sk ON sk.id = wps.skill_id
                    WHERE wps.worker_user_id = wp.user_id AND sk.name ILIKE ${p})
        OR EXISTS (SELECT 1 FROM professional_services ps
                    WHERE ps.worker_user_id = wp.user_id AND ps.is_active = true
                      AND (ps.name ILIKE ${p} OR ps.description ILIKE ${p}))
        OR EXISTS (SELECT 1 FROM business_profiles bp
                    WHERE bp.worker_user_id = wp.user_id AND bp.is_enabled = true AND bp.business_name ILIKE ${p})`);
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
            wp.completed_jobs_count, wp.availability_status, wp.starting_price,
            wp.price_currency, u.full_name, st.name AS state_name, l.name AS lga_name,
            bz.business_name, bz.storefront_photo_url AS business_photo_url,
            EXISTS (
              SELECT 1 FROM portfolios p JOIN portfolio_media pm ON pm.portfolio_id = p.id
               WHERE p.worker_user_id = wp.user_id AND pm.media_type = 'video'
            ) AS has_video
       FROM worker_profiles wp
       JOIN users u ON u.id = wp.user_id
       LEFT JOIN user_settings us ON us.user_id = wp.user_id
       LEFT JOIN states st ON st.id = wp.state_id
       LEFT JOIN lgas l ON l.id = wp.lga_id
       LEFT JOIN business_profiles bz ON bz.worker_user_id = wp.user_id AND bz.is_enabled = true
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${firstTerm ? `(wp.professional_title ILIKE ${firstTerm}) DESC, ` : ''}wp.is_pro DESC, wp.rating_avg DESC, wp.profile_completion_percent DESC
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
  await assertOwnImages(userId, 'hirer_profiles', updates, { profile_picture_url: 'PROFILE_PICTURES' });

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
