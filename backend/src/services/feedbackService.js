const { query } = require('../config/db');
const { forwardFeedback } = require('./companyFeedbackForwarder');

async function submitFeedback(userId, { type, message }) {
  const { rows } = await query(
    `INSERT INTO feedback_submissions (user_id, type, message) VALUES ($1, $2, $3) RETURNING *`,
    [userId, type, message]
  );
  // Also show it in the SHEREBOY TECH LTD Reviews & Feedback dashboard (never blocks the user)
  forwardFeedback(rows[0]);
  return rows[0];
}

async function listOwnFeedback(userId) {
  const { rows } = await query(
    'SELECT * FROM feedback_submissions WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );
  return rows;
}

module.exports = { submitFeedback, listOwnFeedback };
