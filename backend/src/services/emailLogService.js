const { query } = require('../config/db');

/**
 * Records one send attempt. Deliberately never stores the rendered
 * HTML/text body — only metadata (who, what type, subject, provider
 * ID, outcome) — so this table can be shown to admins without ever
 * exposing message contents, OTP codes, or reset links.
 */
async function logEmail({
  userId = null,
  recipient,
  emailType,
  subject,
  providerMessageId = null,
  status,
  errorMessage = null,
  relatedEntityType = null,
  relatedEntityId = null,
}) {
  await query(
    `INSERT INTO email_logs
       (user_id, recipient, email_type, subject, provider_message_id, status, error_message, related_entity_type, related_entity_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [userId, recipient, emailType, subject, providerMessageId, status, errorMessage, relatedEntityType, relatedEntityId]
  ).catch(() => {
    // Logging must never be the reason an email send (or the action
    // that triggered it) fails.
  });
}

async function listRecent({ status, emailType, page = 1, pageSize = 50 } = {}) {
  const conditions = [];
  const params = [];
  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }
  if (emailType) {
    params.push(emailType);
    conditions.push(`email_type = $${params.length}`);
  }
  const limit = Math.min(Math.max(parseInt(pageSize, 10) || 50, 1), 200);
  const offset = (Math.max(parseInt(page, 10) || 1, 1) - 1) * limit;
  params.push(limit, offset);

  const { rows } = await query(
    `SELECT id, user_id, recipient, email_type, subject, status, error_message, related_entity_type, related_entity_id, sent_at
       FROM email_logs
       ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
      ORDER BY sent_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

module.exports = { logEmail, listRecent };
