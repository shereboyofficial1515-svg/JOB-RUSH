const { query, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const contractService = require('./contractService');
const notificationService = require('./notificationService');

/**
 * Recomputes and writes worker_profiles.rating_avg/rating_count. This
 * is the ONE place in the codebase allowed to write those columns —
 * profileService's editable-field whitelist structurally excludes
 * them from any worker-initiated profile update, by design.
 */
async function recalculateWorkerRating(workerUserId, client) {
  const runner = client || { query };
  const { rows } = await runner.query(
    `SELECT COUNT(*)::int AS count, COALESCE(AVG(rating), 0) AS avg
       FROM reviews WHERE reviewee_user_id = $1 AND hidden = false`,
    [workerUserId]
  );
  const { count, avg } = rows[0];
  await runner.query(
    'UPDATE worker_profiles SET rating_count = $2, rating_avg = $3 WHERE user_id = $1',
    [workerUserId, count, Math.round(Number(avg) * 100) / 100]
  );
}

/**
 * Creates a review. Requires the contract to actually be completed
 * and the caller to be its hirer — a hirer can't review a worker
 * they never actually contracted with, and can't review before the
 * work is marked done.
 */
async function createReview(hirerUserId, { contractId, rating, reviewText }) {
  const contract = await contractService.getOwnedContract(contractId, hirerUserId);
  if (contract.hirer_user_id !== hirerUserId) {
    throw new AppError('Only the hirer on this contract can leave a review.', 403, 'FORBIDDEN');
  }
  if (contract.status !== 'completed') {
    throw new AppError('A review can only be left after the contract is completed.', 400, 'CONTRACT_NOT_COMPLETED');
  }

  return withTransaction(async (client) => {
    let review;
    try {
      const { rows } = await client.query(
        `INSERT INTO reviews (contract_id, reviewer_user_id, reviewee_user_id, rating, review_text)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [contractId, hirerUserId, contract.worker_user_id, rating, reviewText || null]
      );
      review = rows[0];
    } catch (err) {
      if (err.code === '23505') {
        throw new AppError('A review already exists for this contract.', 409, 'REVIEW_EXISTS');
      }
      throw err;
    }

    await recalculateWorkerRating(contract.worker_user_id, client);

    notificationService.notifyUser(contract.worker_user_id, 'review_received', {
      title: 'You received a review',
      body: `You were rated ${rating} out of 5.`,
      data: { contractId, reviewId: review.id },
    }).catch(() => {});

    return review;
  });
}

async function listReviewsForWorker(workerUserId) {
  const { rows } = await query(
    `SELECT r.id, r.rating, r.review_text, r.created_at, hp.display_name AS reviewer_display_name
       FROM reviews r JOIN hirer_profiles hp ON hp.user_id = r.reviewer_user_id
      WHERE r.reviewee_user_id = $1 AND r.hidden = false
      ORDER BY r.created_at DESC`,
    [workerUserId]
  );
  return rows;
}

async function reportReview(reporterUserId, reviewId, reason) {
  const { rows } = await query('SELECT id FROM reviews WHERE id = $1', [reviewId]);
  if (rows.length === 0) throw new AppError('Review not found.', 404, 'NOT_FOUND');

  const { rows: inserted } = await query(
    `INSERT INTO review_reports (review_id, reporter_user_id, reason) VALUES ($1, $2, $3) RETURNING *`,
    [reviewId, reporterUserId, reason]
  );
  return inserted[0];
}

async function listReportedReviews() {
  const { rows } = await query(
    `SELECT DISTINCT r.* FROM reviews r JOIN review_reports rr ON rr.review_id = r.id
      WHERE r.hidden = false ORDER BY r.created_at DESC`
  );
  return rows;
}

/** Admin-only (moderation_admin/content_admin). Suppresses a review from public listing without deleting it. */
async function hideReview(reviewId, adminUserId, reason) {
  const { rows } = await query('SELECT * FROM reviews WHERE id = $1', [reviewId]);
  const review = rows[0];
  if (!review) throw new AppError('Review not found.', 404, 'NOT_FOUND');

  return withTransaction(async (client) => {
    await client.query(
      `UPDATE reviews SET hidden = true, hidden_reason = $2, hidden_by = $3 WHERE id = $1`,
      [reviewId, reason || null, adminUserId]
    );
    await recalculateWorkerRating(review.reviewee_user_id, client);
  });
}

module.exports = { createReview, listReviewsForWorker, reportReview, listReportedReviews, hideReview };
