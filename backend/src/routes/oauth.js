const router = require('express').Router();
const express = require('express');
const crypto = require('crypto');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { ISSUER, MCP_RESOURCE, APP_URL, SCOPE } = require('../lib/oauth-config');

// ── OAuth 2.1 Authorization Server for the Persistence MCP endpoint ──────────
// The backend is both the AS and the Resource Server. Consent reuses the
// existing web login on app.persistence.finance. Public PKCE clients only;
// all secrets (codes, tokens) are stored as SHA-256 hashes; everything is
// short-lived and revocable. Implements RFC 9728 / 8414 / 7591 + OAuth 2.1.

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const rand = (prefix) => prefix + crypto.randomBytes(32).toString('hex');
const pkceChallenge = (verifier) =>
  crypto.createHash('sha256').update(verifier).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const ACCESS_TTL_S = 30 * 60;          // 30 minutes
const REFRESH_TTL_S = 30 * 24 * 3600;  // 30 days
const CODE_TTL_S = 60;                  // 1 minute
const PENDING_TTL_S = 10 * 60;          // 10 minutes

function isAllowedRedirect(u) {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' || url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch { return false; }
}

// ── Discovery: Protected Resource Metadata (RFC 9728) ───────────────────────
function protectedResourceMetadata(req, res) {
  res.json({
    resource: MCP_RESOURCE,
    authorization_servers: [ISSUER],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ['header'],
    resource_name: 'Persistence',
    resource_documentation: 'https://persistence.finance/developers',
  });
}
router.get('/.well-known/oauth-protected-resource', protectedResourceMetadata);
router.get('/.well-known/oauth-protected-resource/api/mcp', protectedResourceMetadata);

// ── Discovery: Authorization Server Metadata (RFC 8414) ─────────────────────
router.get('/.well-known/oauth-authorization-server', (req, res) => {
  res.json({
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/oauth/authorize`,
    token_endpoint: `${ISSUER}/oauth/token`,
    registration_endpoint: `${ISSUER}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [SCOPE],
  });
});

// ── Dynamic Client Registration (RFC 7591) — public PKCE clients ────────────
router.post('/oauth/register', async (req, res) => {
  const body = req.body || {};
  const uris = body.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || !uris.every(isAllowedRedirect)) {
    return res.status(400).json({ error: 'invalid_redirect_uri' });
  }
  const clientId = rand('client_');
  await query(
    'INSERT INTO oauth_clients (client_id, redirect_uris, client_name, scope) VALUES ($1,$2,$3,$4)',
    [clientId, uris, String(body.client_name || 'MCP Client').slice(0, 120), SCOPE]
  );
  res.status(201).json({
    client_id: clientId,
    redirect_uris: uris,
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    scope: SCOPE,
  });
});

// ── Authorization endpoint → hands off to the consent page on the web app ───
router.get('/oauth/authorize', async (req, res) => {
  const { client_id, redirect_uri, response_type, code_challenge, code_challenge_method, state, resource } = req.query;
  const { rows } = await query('SELECT client_id, redirect_uris FROM oauth_clients WHERE client_id=$1', [client_id]);
  const client = rows[0];
  // Validate client + redirect BEFORE any redirect, so we never bounce to an unvetted URI.
  if (!client) return res.status(400).send('Unknown client_id');
  if (!client.redirect_uris.includes(redirect_uri)) return res.status(400).send('redirect_uri not registered for this client');

  const back = (err) => res.redirect(`${redirect_uri}?error=${err}${state ? `&state=${encodeURIComponent(state)}` : ''}`);
  if (response_type !== 'code') return back('unsupported_response_type');
  if (!code_challenge || code_challenge_method !== 'S256') return back('invalid_request');

  const requestId = rand('req_');
  await query(
    `INSERT INTO oauth_pending_authorizations
       (request_id, client_id, redirect_uri, scope, resource, code_challenge, code_challenge_method, state, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,'S256',$7, NOW() + INTERVAL '${PENDING_TTL_S} seconds')`,
    [requestId, client_id, redirect_uri, SCOPE, resource || MCP_RESOURCE, code_challenge, state || null]
  );
  return res.redirect(`${APP_URL}/oauth/consent?request=${encodeURIComponent(requestId)}`);
});

// ── Public: details for the consent UI to display ───────────────────────────
router.get('/oauth/authorization/:requestId', async (req, res) => {
  const { rows } = await query(
    `SELECT p.scope, p.consumed, p.expires_at, c.client_name
     FROM oauth_pending_authorizations p JOIN oauth_clients c ON c.client_id = p.client_id
     WHERE p.request_id = $1`,
    [req.params.requestId]
  );
  const p = rows[0];
  if (!p || p.consumed || new Date(p.expires_at) < new Date()) return res.status(404).json({ error: 'expired or invalid request' });
  res.json({ client_name: p.client_name || 'An AI assistant', scope: p.scope });
});

// ── Consent: the logged-in user approves (mints a one-time code) ────────────
router.post('/oauth/consent/approve', authenticate, async (req, res) => {
  const requestId = (req.body || {}).request;
  const { rows } = await query(
    `UPDATE oauth_pending_authorizations SET consumed = true
     WHERE request_id = $1 AND consumed = false AND expires_at > NOW()
     RETURNING client_id, redirect_uri, scope, resource, code_challenge, code_challenge_method, state`,
    [requestId]
  );
  const p = rows[0];
  if (!p) return res.status(400).json({ error: 'invalid_or_expired_request' });
  const code = rand('code_');
  await query(
    `INSERT INTO oauth_authorization_codes
       (code_hash, client_id, user_id, redirect_uri, scope, resource, code_challenge, code_challenge_method, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, NOW() + INTERVAL '${CODE_TTL_S} seconds')`,
    [sha256(code), p.client_id, req.user.id, p.redirect_uri, p.scope, p.resource, p.code_challenge, p.code_challenge_method]
  );
  res.json({ redirect: `${p.redirect_uri}?code=${encodeURIComponent(code)}${p.state ? `&state=${encodeURIComponent(p.state)}` : ''}` });
});

// ── Consent: deny ───────────────────────────────────────────────────────────
router.post('/oauth/consent/deny', async (req, res) => {
  const requestId = (req.body || {}).request;
  const { rows } = await query(
    `UPDATE oauth_pending_authorizations SET consumed = true
     WHERE request_id = $1 AND consumed = false RETURNING redirect_uri, state`,
    [requestId]
  );
  const p = rows[0];
  res.json({ redirect: p ? `${p.redirect_uri}?error=access_denied${p.state ? `&state=${encodeURIComponent(p.state)}` : ''}` : null });
});

// ── Token endpoint (form-urlencoded, OAuth 2.1) ─────────────────────────────
async function issueTokens(clientId, userId, scope, resource) {
  const access = rand('pat_');
  const refresh = rand('prt_');
  await query(
    `INSERT INTO oauth_access_tokens (token_hash, client_id, user_id, scope, resource, expires_at)
     VALUES ($1,$2,$3,$4,$5, NOW() + INTERVAL '${ACCESS_TTL_S} seconds')`,
    [sha256(access), clientId, userId, scope, resource]
  );
  await query(
    `INSERT INTO oauth_refresh_tokens (token_hash, client_id, user_id, scope, resource, expires_at)
     VALUES ($1,$2,$3,$4,$5, NOW() + INTERVAL '${REFRESH_TTL_S} seconds')`,
    [sha256(refresh), clientId, userId, scope, resource]
  );
  return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL_S, refresh_token: refresh, scope };
}

router.post('/oauth/token', express.urlencoded({ extended: true }), async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const b = req.body || {};
  try {
    if (b.grant_type === 'authorization_code') {
      if (!b.code || !b.code_verifier) return res.status(400).json({ error: 'invalid_request' });
      const { rows } = await query(
        `UPDATE oauth_authorization_codes SET used = true
         WHERE code_hash = $1 AND used = false AND expires_at > NOW()
         RETURNING client_id, user_id, redirect_uri, scope, resource, code_challenge`,
        [sha256(b.code)]
      );
      const c = rows[0];
      if (!c) return res.status(400).json({ error: 'invalid_grant' });
      if (b.client_id && b.client_id !== c.client_id) return res.status(400).json({ error: 'invalid_grant' });
      if (b.redirect_uri && b.redirect_uri !== c.redirect_uri) return res.status(400).json({ error: 'invalid_grant' });
      if (pkceChallenge(b.code_verifier) !== c.code_challenge) {
        return res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE verification failed' });
      }
      return res.json(await issueTokens(c.client_id, c.user_id, c.scope, c.resource));
    }

    if (b.grant_type === 'refresh_token') {
      if (!b.refresh_token) return res.status(400).json({ error: 'invalid_request' });
      const { rows } = await query(
        'SELECT id, client_id, user_id, scope, resource, expires_at, revoked FROM oauth_refresh_tokens WHERE token_hash=$1',
        [sha256(b.refresh_token)]
      );
      const r = rows[0];
      if (!r) return res.status(400).json({ error: 'invalid_grant' });
      // Reuse detection: a revoked/expired refresh token => revoke the whole chain.
      if (r.revoked || new Date(r.expires_at) < new Date()) {
        await query('UPDATE oauth_refresh_tokens SET revoked=true WHERE user_id=$1 AND client_id=$2', [r.user_id, r.client_id]);
        await query('UPDATE oauth_access_tokens SET revoked=true WHERE user_id=$1 AND client_id=$2', [r.user_id, r.client_id]);
        return res.status(400).json({ error: 'invalid_grant' });
      }
      // Rotate (OAuth 2.1 requires refresh-token rotation for public clients).
      await query('UPDATE oauth_refresh_tokens SET revoked=true WHERE id=$1', [r.id]);
      return res.json(await issueTokens(r.client_id, r.user_id, r.scope, r.resource));
    }

    return res.status(400).json({ error: 'unsupported_grant_type' });
  } catch (err) {
    console.error('OAuth token error:', err.message);
    return res.status(500).json({ error: 'server_error' });
  }
});

module.exports = router;
