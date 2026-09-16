const { query } = require('../config/db');

/**
 * Paginated, filterable view over admin_audit_logs, joined to the
 * actor's name/email for display — the raw table only stores
 * actor_user_id. Filters are all optional and ANDed together.
 */
async function listAuditLogs({ action, actorUserId, resourceType, page = 1, pageSize = 50 }) {
  const conditions = [];
  const params = [];

  if (action) {
    params.push(action);
    conditions.push(`al.action = $${params.length}`);
  }
  if (actorUserId) {
    params.push(actorUserId);
    conditions.push(`al.actor_user_id = $${params.length}`);
  }
  if (resourceType) {
    params.push(resourceType);
    conditions.push(`al.resource_type = $${params.length}`);
  }

  const limit = Math.min(Math.max(parseInt(pageSize, 10) || 50, 1), 100);
  const offset = (Math.max(parseInt(page, 10) || 1, 1) - 1) * limit;
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const listParams = [...params, limit, offset];

  const { rows } = await query(
    `SELECT al.id, al.actor_user_id, u.full_name AS actor_name, u.email AS actor_email,
            al.action, al.resource_type, al.resource_id, al.result, al.metadata, al.ip_address, al.created_at
       FROM admin_audit_logs al
       LEFT JOIN users u ON u.id = al.actor_user_id
       ${whereClause}
      ORDER BY al.created_at DESC
      LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );

  const { rows: countRows } = await query(
    `SELECT COUNT(*)::int AS n FROM admin_audit_logs al ${whereClause}`,
    params
  );

  return { logs: rows, total: countRows[0].n, page: Math.max(parseInt(page, 10) || 1, 1), pageSize: limit };
}

module.exports = { listAuditLogs };
