// Canonical URLs for the MCP OAuth 2.1 flow. The backend is BOTH the OAuth
// Authorization Server and the Resource Server (the MCP endpoint), so the
// issuer, discovery docs, and protected resource all live on this origin.
const strip = (u) => (u || '').replace(/\/+$/, '');

const ISSUER = strip(process.env.OAUTH_ISSUER || process.env.API_URL || 'https://ledger-production-5649.up.railway.app');
const MCP_RESOURCE = ISSUER + '/api/mcp';
const PRM_URL = ISSUER + '/.well-known/oauth-protected-resource';
// Where the user logs in + consents (the web app).
const APP_URL = strip(process.env.APP_URL || 'https://app.persistence.finance');
const SCOPE = 'mcp:read';

module.exports = { ISSUER, MCP_RESOURCE, PRM_URL, APP_URL, SCOPE };
