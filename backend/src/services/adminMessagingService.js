const { query } = require('../config/db');
const AppError = require('../utils/AppError');
const reportService = require('./reportService');
const { recordAuditEvent } = require('../security/auditLogger');

/**
 * Reported-message queue. This is the one place an admin can read
 * private message content, so the read itself is audited, not just
 * the eventual moderation action — "admin accessed reported
 * conversation" needs to show up in the trail even if the admin
 * decides no action is warranted.
 */
async function listReportedMessagesForAdmin(adminUserId) {
  const reports = await reportService.listReports();

  await recordAuditEvent({
    actorUserId: adminUserId,
    action: 'ADMIN_VIEWED_REPORTED_MESSAGES',
    resourceType: 'message_report',
    result: 'success',
    metadata: { count: reports.length },
  });

  if (reports.length === 0) return [];

  const senderIds = [...new Set(reports.map((r) => r.sender_id))];
  const { rows: senders } = await query('SELECT id, full_name FROM users WHERE id = ANY($1::uuid[])', [senderIds]);
  const nameById = Object.fromEntries(senders.map((s) => [s.id, s.full_name]));

  return reports.map((r) => ({ ...r, sender_name: nameById[r.sender_id] || null }));
}

/** Removes a reported message — reuses the same soft-delete + content wipe a sender's own delete uses, minus the ownership check. */
async function adminRemoveMessage(messageId, adminUserId, reason) {
  const { rows } = await query(
    `UPDATE messages SET deleted_at = now(), content = NULL WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
    [messageId]
  );
  if (rows.length === 0) throw new AppError('Message not found or already removed.', 404, 'NOT_FOUND');

  await recordAuditEvent({
    actorUserId: adminUserId,
    action: 'ADMIN_REMOVED_MESSAGE',
    resourceType: 'message',
    resourceId: messageId,
    result: 'success',
    metadata: { reason },
  });
  return rows[0];
}

module.exports = { listReportedMessagesForAdmin, adminRemoveMessage };
