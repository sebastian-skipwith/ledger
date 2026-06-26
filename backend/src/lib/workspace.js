const { query } = require('../db');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Active workspace for READS, from the X-Workspace-Id header. null = Personal.
// No ownership check is needed for reads: every scoped query ALSO filters
// user_id, so a foreign/invalid workspace id simply matches zero rows.
function activeWorkspaceId(req) {
  const h = req.headers['x-workspace-id'];
  if (!h || h === 'personal') return null;
  return UUID.test(String(h)) ? String(h) : null;
}

// Workspace for WRITES — validated to belong to the user, else falls back to
// Personal (null). Prevents tagging a row into someone else's workspace.
async function resolveWriteWorkspace(req) {
  const ws = activeWorkspaceId(req);
  if (!ws) return null;
  const { rows } = await query('SELECT 1 FROM workspaces WHERE id=$1 AND user_id=$2', [ws, req.user.id]);
  return rows.length ? ws : null;
}

module.exports = { activeWorkspaceId, resolveWriteWorkspace };
