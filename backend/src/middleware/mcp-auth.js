const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query } = require('../db');
const { MCP_RESOURCE, PRM_URL, SCOPE } = require('../lib/oauth-config');

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// RFC 9728 / RFC 6750: a 401 from the protected resource MUST advertise where
// to discover the authorization server, so MCP clients (Claude) can start the
// OAuth dance. The resource_metadata URL points at our Protected Resource
// Metadata document.
function challenge(res, invalid) {
  let h = `Bearer resource_metadata="${PRM_URL}", scope="${SCOPE}"`;
  if (invalid) h += `, error="invalid_token"`;
  res.set('WWW-Authenticate', h);
  return res.status(401).json({ error: invalid || 'authentication required' });
}

// Auth for the MCP endpoint. Accepts, in order: an OAuth access token (pat_,
// issued by /oauth/token), a developer API key (sk_/pk_), or a legacy JWT — so
// existing key-based integrations keep working while Claude uses OAuth.
async function mcpAuthenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers['x-api-key'];
  const raw = apiKeyHeader || (authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null);
  if (!raw) return challenge(res);

  try {
    // 1) OAuth access token issued by our authorization server.
    if (raw.startsWith('pat_')) {
      const { rows } = await query(
        `SELECT t.user_id, t.scope, t.resource, t.expires_at, t.revoked,
                u.email, u.full_name, u.tier
         FROM oauth_access_tokens t JOIN users u ON u.id = t.user_id
         WHERE t.token_hash = $1`,
        [sha256(raw)]
      );
      const t = rows[0];
      if (!t || t.revoked || new Date(t.expires_at) < new Date()) return challenge(res, 'invalid or expired token');
      // Audience binding (RFC 8707): the token must have been issued for THIS
      // MCP resource, never accepted on behalf of another.
      if (t.resource && t.resource !== MCP_RESOURCE) return challenge(res, 'token audience mismatch');
      if (!String(t.scope || '').split(' ').includes(SCOPE)) {
        res.set('WWW-Authenticate', `Bearer resource_metadata="${PRM_URL}", error="insufficient_scope", scope="${SCOPE}"`);
        return res.status(403).json({ error: 'insufficient scope' });
      }
      req.user = { id: t.user_id, email: t.email, full_name: t.full_name, tier: t.tier };
      query('UPDATE oauth_access_tokens SET last_used_at = NOW() WHERE token_hash = $1', [sha256(raw)]).catch(() => {});
      return next();
    }

    // 2) Developer API key (existing config-file integrations).
    if (raw.startsWith('sk_') || raw.startsWith('pk_')) {
      const { rows } = await query(
        `SELECT u.id, u.email, u.full_name, u.tier, k.id AS key_id, k.scopes
         FROM api_keys k JOIN users u ON u.id = k.user_id
         WHERE k.key_hash = $1 AND k.revoked = false`,
        [sha256(raw)]
      );
      if (!rows.length) return challenge(res, 'invalid api key');
      req.user = rows[0];
      query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [rows[0].key_id]).catch(() => {});
      return next();
    }

    // 3) Legacy JWT (web/desktop session token).
    const payload = jwt.verify(raw, process.env.JWT_SECRET);
    const { rows } = await query('SELECT id, email, full_name, tier FROM users WHERE id = $1', [payload.userId]);
    if (!rows.length) return challenge(res, 'user not found');
    req.user = rows[0];
    return next();
  } catch (err) {
    return challenge(res, 'invalid or expired token');
  }
}

module.exports = { mcpAuthenticate };
