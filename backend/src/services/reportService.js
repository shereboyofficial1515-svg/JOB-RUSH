const { query } = require('../config/db');
const conversationService = require('./conversationService');
const AppError = require('../utils/AppError');

/** Reporting requires the reporter to actually be a participant in the message's conversation. */
async function reportMessage(reporterUserId, messageId, reason) {
  const { rows } = await query('SELECT * FROM messages WHERE id = $1', [messageId]);
  const message = rows[0];
  if (!message) throw new AppError('Message not found.', 404, 'NOT_FOUND');

  await conversationService.assertParticipant(message.conversation_id, reporterUserId);

  const { rows: inserted } = await query(
    `INSERT INTO message_reports (message_id, reporter_user_id, reason) VALUES ($1, $2, $3) RETURNING *`,
    [messageId, reporterUserId, reason]
  );
  return inserted[0];
}

async function listReports() {
  const { rows } = await query(
    `SELECT mr.*, m.content, m.conversation_id, m.sender_id
       FROM message_reports mr JOIN messages m ON m.id = mr.message_id
      ORDER BY mr.created_at DESC`
  );
  return rows;
}

module.exports = { reportMessage, listReports };
