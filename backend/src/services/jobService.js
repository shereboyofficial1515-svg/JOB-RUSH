const { query, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const locationService = require('./locationService');
const { ensureHirerProfileRow } = require('./profileService');

async function getSkillsForJob(jobId) {
  const { rows } = await query(
    `SELECT s.id, s.name FROM job_skills js JOIN skills s ON s.id = js.skill_id WHERE js.job_id = $1`,
    [jobId]
  );
  return rows;
}

async function assertSkillIdsValid(skillIds) {
  if (!skillIds || skillIds.length === 0) return;
  const unique = [...new Set(skillIds)];
  const { rows } = await query('SELECT id FROM skills WHERE id = ANY($1::uuid[]) AND is_active = true', [unique]);
  if (rows.length !== unique.length) {
    throw new AppError('One or more selected skills are invalid.', 400, 'INVALID_SKILL');
  }
}

async function setJobSkills(jobId, skillIds, client) {
  const runner = client || { query };
  await runner.query('DELETE FROM job_skills WHERE job_id = $1', [jobId]);
  for (const skillId of new Set(skillIds || [])) {
    await runner.query('INSERT INTO job_skills (job_id, skill_id) VALUES ($1, $2)', [jobId, skillId]);
  }
}

/**
 * Creates a job. `hirerUserId` always comes from the authenticated
 * session — a hirer can only ever create jobs owned by themselves.
 */
async function createJob(hirerUserId, input) {
  // jobs.hirer_user_id references hirer_profiles(user_id), which
  // otherwise only gets created the first time a hirer saves a field
  // on Profile Settings — without this, posting a job before ever
  // touching their profile hits a foreign-key violation instead of
  // the job actually being created.
  await ensureHirerProfileRow(hirerUserId);

  await locationService.assertLocationAllowed({
    stateId: input.state_id,
    lgaId: input.lga_id,
    areaId: input.area_id,
  });
  await assertSkillIdsValid(input.skillIds);

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO jobs (
         hirer_user_id, title, description, category_id, employment_type,
         experience_level, budget_type, budget_min, budget_max,
         state_id, lga_id, area_id, deadline, additional_requirements
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        hirerUserId,
        input.title,
        input.description,
        input.category_id || null,
        input.employment_type || 'one_time',
        input.experience_level || 'entry',
        input.budget_type || 'fixed',
        input.budget_min ?? null,
        input.budget_max ?? null,
        input.state_id || null,
        input.lga_id || null,
        input.area_id || null,
        input.deadline || null,
        input.additional_requirements || null,
      ]
    );
    const job = rows[0];
    await setJobSkills(job.id, input.skillIds, client);
    return job;
  });
}

/**
 * Loads a job the caller must own, or throws. Used before every
 * mutating operation (update/close/cancel/view applications) so
 * ownership is enforced in one place regardless of which endpoint
 * calls it — the route/role check alone is not sufficient because a
 * hirer role doesn't imply ownership of *this* job.
 */
async function getOwnedJob(jobId, hirerUserId) {
  const { rows } = await query('SELECT * FROM jobs WHERE id = $1 AND hirer_user_id = $2', [jobId, hirerUserId]);
  if (rows.length === 0) {
    throw new AppError('Job not found.', 404, 'NOT_FOUND');
  }
  return rows[0];
}

async function getJobById(jobId) {
  const { rows } = await query(
    `SELECT j.*, hp.display_name AS hirer_display_name
       FROM jobs j
       JOIN hirer_profiles hp ON hp.user_id = j.hirer_user_id
      WHERE j.id = $1`,
    [jobId]
  );
  if (rows.length === 0) return null;
  const skills = await getSkillsForJob(jobId);
  return { ...rows[0], skills };
}

const EDITABLE_FIELDS = [
  'title',
  'description',
  'category_id',
  'employment_type',
  'experience_level',
  'budget_type',
  'budget_min',
  'budget_max',
  'state_id',
  'lga_id',
  'area_id',
  'deadline',
  'additional_requirements',
];

async function updateJob(jobId, hirerUserId, input) {
  await getOwnedJob(jobId, hirerUserId); // throws if not owned

  await locationService.assertLocationAllowed({
    stateId: input.state_id,
    lgaId: input.lga_id,
    areaId: input.area_id,
  });
  if (input.skillIds) await assertSkillIdsValid(input.skillIds);

  const updates = {};
  for (const field of EDITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(input, field)) updates[field] = input[field];
  }

  return withTransaction(async (client) => {
    if (Object.keys(updates).length > 0) {
      const setClauses = Object.keys(updates).map((f, i) => `${f} = $${i + 3}`);
      await client.query(
        `UPDATE jobs SET ${setClauses.join(', ')} WHERE id = $1 AND hirer_user_id = $2`,
        [jobId, hirerUserId, ...Object.values(updates)]
      );
    }
    if (input.skillIds) {
      await setJobSkills(jobId, input.skillIds, client);
    }
    const { rows } = await client.query('SELECT * FROM jobs WHERE id = $1', [jobId]);
    return rows[0];
  });
}

const CLOSING_STATUSES = ['closed', 'filled', 'cancelled'];

async function setJobStatus(jobId, hirerUserId, newStatus) {
  await getOwnedJob(jobId, hirerUserId);
  if (!CLOSING_STATUSES.includes(newStatus) && newStatus !== 'open') {
    throw new AppError('Invalid job status.', 400, 'INVALID_STATUS');
  }
  const { rows } = await query(
    'UPDATE jobs SET status = $3 WHERE id = $1 AND hirer_user_id = $2 RETURNING *',
    [jobId, hirerUserId, newStatus]
  );
  return rows[0];
}

/**
 * Admin override — no ownership check, used only from the admin job
 * moderation queue (e.g. removing a reported/fraudulent job). Never
 * reachable from a hirer-facing route.
 */
async function adminSetJobStatus(jobId, newStatus) {
  const { rows } = await query('UPDATE jobs SET status = $2 WHERE id = $1 RETURNING *', [jobId, newStatus]);
  if (rows.length === 0) throw new AppError('Job not found.', 404, 'NOT_FOUND');
  return rows[0];
}

async function listJobsForHirer(hirerUserId, statusFilter) {
  const params = [hirerUserId];
  let sql = 'SELECT * FROM jobs WHERE hirer_user_id = $1';
  if (statusFilter) {
    params.push(statusFilter);
    sql += ` AND status = $${params.length}`;
  }
  sql += ' ORDER BY created_at DESC';
  const { rows } = await query(sql, params);
  return rows;
}

const SORTABLE_FIELDS = {
  newest: 'j.created_at DESC',
  budget_high: 'j.budget_max DESC NULLS LAST',
  deadline: 'j.deadline ASC NULLS LAST',
};

/**
 * Search/browse open jobs. Every filter is applied through
 * parameterized placeholders built from a fixed set of known columns
 * — filter *values* come from the client, filter *column names*
 * never do.
 */
async function searchJobs({
  categoryId,
  skillId,
  stateId,
  lgaId,
  employmentType,
  experienceLevel,
  minBudget,
  keyword,
  sort = 'newest',
  page = 1,
  pageSize = 20,
}) {
  const conditions = [`j.status = 'open'`, `j.hidden = false`];
  const params = [];

  if (categoryId) {
    params.push(categoryId);
    conditions.push(`j.category_id = $${params.length}`);
  }
  if (stateId) {
    params.push(stateId);
    conditions.push(`j.state_id = $${params.length}`);
  }
  if (lgaId) {
    params.push(lgaId);
    conditions.push(`j.lga_id = $${params.length}`);
  }
  if (employmentType) {
    params.push(employmentType);
    conditions.push(`j.employment_type = $${params.length}`);
  }
  if (experienceLevel) {
    params.push(experienceLevel);
    conditions.push(`j.experience_level = $${params.length}`);
  }
  if (minBudget) {
    params.push(minBudget);
    conditions.push(`(j.budget_max IS NULL OR j.budget_max >= $${params.length})`);
  }
  if (keyword) {
    params.push(`%${keyword}%`);
    conditions.push(`(j.title ILIKE $${params.length} OR j.description ILIKE $${params.length})`);
  }
  if (skillId) {
    params.push(skillId);
    conditions.push(`EXISTS (SELECT 1 FROM job_skills js WHERE js.job_id = j.id AND js.skill_id = $${params.length})`);
  }

  const orderBy = SORTABLE_FIELDS[sort] || SORTABLE_FIELDS.newest;
  const limit = Math.min(Math.max(parseInt(pageSize, 10) || 20, 1), 50);
  const offset = (Math.max(parseInt(page, 10) || 1, 1) - 1) * limit;

  params.push(limit, offset);
  // Card view only ever shows a ~140-char slice of description and
  // never touches additional_requirements/deadline/view_count/etc at
  // all — SELECT j.* was shipping the full (sometimes multi-KB)
  // description text and every other detail-only column to a list
  // that never renders them; getJobById (the actual detail-page
  // fetch) is a separate, unaffected query.
  const sql = `
    SELECT j.id, j.title, LEFT(j.description, 200) AS description, j.employment_type,
           j.budget_min, j.budget_max, j.created_at, hp.display_name AS hirer_display_name
      FROM jobs j
      JOIN hirer_profiles hp ON hp.user_id = j.hirer_user_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY ${orderBy}
     LIMIT $${params.length - 1} OFFSET $${params.length}
  `;
  const { rows } = await query(sql, params);
  return rows;
}

module.exports = {
  createJob,
  getOwnedJob,
  getJobById,
  updateJob,
  setJobStatus,
  adminSetJobStatus,
  listJobsForHirer,
  searchJobs,
};
