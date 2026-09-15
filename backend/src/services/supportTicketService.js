const { query } = require('../config/db');
const AppError = require('../utils/AppError');
const notificationService = require('./notificationService');
const { recordAuditEvent } = require('../security/auditLogger');

/** "TCK-" + the first 8 hex characters of the ticket's UUID — a friendlier reference than the raw ID. */
function ticketNumberFor(ticket) {
  return `TCK-${ticket.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

async function createTicket(userId, { subject, description, category, attachmentPath, reportedUserId }) {
  const { rows } = await query(
    `INSERT INTO support_tickets (user_id, subject, description, category, attachment_path, reported_user_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [userId, subject, description, category || null, attachmentPath || null, reportedUserId || null]
  );
  const ticket = rows[0];

  notificationService.notifyUser(userId, 'support_ticket_created', {
    title: 'Support request received',
    body: `Your support request "${subject}" has been received.`,
    data: { ticketNumber: ticketNumberFor(ticket), subject },
  }).catch(() => {});

  return ticket;
}

async function listOwnTickets(userId) {
  const { rows } = await query('SELECT * FROM support_tickets WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
  return rows;
}

async function getOwnedTicket(ticketId, userId) {
  const { rows } = await query('SELECT * FROM support_tickets WHERE id = $1 AND user_id = $2', [ticketId, userId]);
  if (rows.length === 0) throw new AppError('Ticket not found.', 404, 'NOT_FOUND');
  return rows[0];
}

async function listTicketsForAdmin(statusFilter) {
  const params = [];
  let sql = `SELECT st.*, u.full_name, u.email FROM support_tickets st JOIN users u ON u.id = st.user_id`;
  if (statusFilter) {
    params.push(statusFilter);
    sql += ` WHERE st.status = $1`;
  }
  sql += ' ORDER BY st.created_at ASC';
  const { rows } = await query(sql, params);
  return rows;
}

async function getTicketForAdmin(ticketId) {
  const { rows } = await query('SELECT * FROM support_tickets WHERE id = $1', [ticketId]);
  if (rows.length === 0) throw new AppError('Ticket not found.', 404, 'NOT_FOUND');
  return rows[0];
}

async function respondToTicket(ticketId, adminUserId, { response, status }) {
  const newStatus = status || 'resolved';
  const { rows } = await query(
    `UPDATE support_tickets
        SET admin_response = $2, handled_by = $3, status = $4,
            resolved_at = CASE WHEN $4 IN ('resolved', 'closed') THEN now() ELSE resolved_at END
      WHERE id = $1 RETURNING *`,
    [ticketId, response, adminUserId, newStatus]
  );
  if (rows.length === 0) throw new AppError('Ticket not found.', 404, 'NOT_FOUND');

  await recordAuditEvent({
    actorUserId: adminUserId,
    action: 'SUPPORT_TICKET_RESPONDED',
    resourceType: 'support_ticket',
    resourceId: ticketId,
    result: 'success',
    metadata: { status: newStatus },
  });

  notificationService.notifyUser(rows[0].user_id, 'support_ticket_updated', {
    title: 'Update on your support ticket',
    body: response,
    data: { ticketNumber: ticketNumberFor(rows[0]), status: newStatus, response },
  }).catch(() => {});

  return rows[0];
}

module.exports = {
  createTicket,
  listOwnTickets,
  getOwnedTicket,
  listTicketsForAdmin,
  getTicketForAdmin,
  respondToTicket,
};
