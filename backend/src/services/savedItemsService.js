const { query } = require('../config/db');

async function saveJob(workerUserId, jobId) {
  await query(
    `INSERT INTO saved_jobs (worker_user_id, job_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [workerUserId, jobId]
  );
}

async function unsaveJob(workerUserId, jobId) {
  await query('DELETE FROM saved_jobs WHERE worker_user_id = $1 AND job_id = $2', [workerUserId, jobId]);
}

async function listSavedJobs(workerUserId) {
  const { rows } = await query(
    `SELECT j.* FROM saved_jobs sj JOIN jobs j ON j.id = sj.job_id
      WHERE sj.worker_user_id = $1 ORDER BY sj.created_at DESC`,
    [workerUserId]
  );
  return rows;
}

async function saveProfile(hirerUserId, workerUserId) {
  await query(
    `INSERT INTO saved_profiles (hirer_user_id, worker_user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [hirerUserId, workerUserId]
  );
}

async function unsaveProfile(hirerUserId, workerUserId) {
  await query('DELETE FROM saved_profiles WHERE hirer_user_id = $1 AND worker_user_id = $2', [hirerUserId, workerUserId]);
}

async function listSavedProfiles(hirerUserId) {
  const { rows } = await query(
    `SELECT wp.* FROM saved_profiles sp JOIN worker_profiles wp ON wp.user_id = sp.worker_user_id
      WHERE sp.hirer_user_id = $1 ORDER BY sp.created_at DESC`,
    [hirerUserId]
  );
  return rows;
}

module.exports = { saveJob, unsaveJob, listSavedJobs, saveProfile, unsaveProfile, listSavedProfiles };
