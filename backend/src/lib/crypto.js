const crypto = require('crypto');

// Application-level encryption for secrets stored in Postgres (Plaid access
// tokens). AES-256-GCM with a key from the DATA_ENCRYPTION_KEY env var
// (64 hex chars = 32 bytes). Values are stored as
//   enc:v1:<iv b64>:<auth tag b64>:<ciphertext b64>
// Plaintext legacy values (no prefix) pass through decryptSecret unchanged and
// are migrated at boot (see src/index.js).
const PREFIX = 'enc:v1:';

function getKey() {
  const hex = process.env.DATA_ENCRYPTION_KEY;
  if (!hex) return null;
  const key = Buffer.from(hex.trim(), 'hex');
  if (key.length !== 32) throw new Error('DATA_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  return key;
}

function isConfigured() {
  return !!getKey();
}

function encryptSecret(plain) {
  const key = getKey();
  if (!key) return plain; // not configured — stored as-is (boot logs a warning)
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv, tag, ct].map(b => b.toString('base64')).join(':');
}

function decryptSecret(stored) {
  if (stored == null || !String(stored).startsWith(PREFIX)) return stored; // legacy plaintext
  const key = getKey();
  if (!key) throw new Error('Encrypted value present but DATA_ENCRYPTION_KEY is not set');
  const [ivB64, tagB64, ctB64] = String(stored).slice(PREFIX.length).split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
}

module.exports = { encryptSecret, decryptSecret, isConfigured, PREFIX };
