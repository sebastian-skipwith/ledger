const { query } = require('../db');
const { cleanMerchant } = require('./merchant');
const { applyRules } = require('./rules');

// Compute cleaned merchant names for rows that don't have one yet (recent
// window only, bounded). Keeps raw merchant_name intact.
async function applyMerchantCleanup(userId) {
  const { rows } = await query(
    `SELECT id, COALESCE(merchant_name, name) AS raw FROM transactions
     WHERE user_id=$1 AND merchant_name_clean IS NULL AND date >= CURRENT_DATE - 120
     LIMIT 2000`,
    [userId]
  );
  for (const r of rows) {
    await query('UPDATE transactions SET merchant_name_clean=$1 WHERE id=$2', [cleanMerchant(r.raw), r.id]);
  }
  return rows.length;
}

// Runs after a Plaid sync: clean merchant names, then apply categorization
// rules. Each step is error-swallowed so a failure here can NEVER break sync.
async function applyPostSync(userId) {
  try {
    await applyMerchantCleanup(userId);
  } catch (e) {
    console.error('merchant cleanup failed:', e.message);
  }
  try {
    await applyRules(userId);
  } catch (e) {
    console.error('applyRules failed:', e.message);
  }
}

module.exports = { applyPostSync, applyMerchantCleanup };
