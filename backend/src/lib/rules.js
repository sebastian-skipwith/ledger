const { query } = require('../db');
const { CATS } = require('./categories');

// Apply a user's active transaction_rules. Set-based + idempotent so it's safe
// to run on every sync and on demand. set_category never clobbers a category a
// user/AI already chose (category_custom IS NULL guard).
async function applyRules(userId) {
  const { rows: rules } = await query(
    `SELECT * FROM transaction_rules WHERE user_id=$1 AND active=true ORDER BY created_at`,
    [userId]
  );

  for (const r of rules) {
    const field =
      r.match_field === 'merchant'
        ? 'COALESCE(merchant_name_clean, merchant_name, name)'
        : r.match_field === 'name'
          ? 'name'
          : 'amount';

    let cond, params;
    if (r.match_op === 'contains') { cond = `${field} ILIKE $2`; params = [userId, `%${r.match_value}%`]; }
    else if (r.match_op === 'equals') { cond = r.match_field === 'amount' ? 'amount = $2::numeric' : `${field} = $2`; params = [userId, r.match_value]; }
    else if (r.match_op === 'gt') { cond = 'amount > $2::numeric'; params = [userId, r.match_value]; }
    else if (r.match_op === 'lt') { cond = 'amount < $2::numeric'; params = [userId, r.match_value]; }
    else continue;

    if (r.action === 'set_category') {
      if (!CATS.includes(r.action_value)) continue;
      await query(
        `UPDATE transactions SET category_custom=$3 WHERE user_id=$1 AND ${cond} AND category_custom IS NULL`,
        [...params, r.action_value]
      );
    } else if (r.action === 'set_tag') {
      await query(
        `UPDATE transactions SET tags = ARRAY(SELECT DISTINCT unnest(COALESCE(tags,'{}'::text[]) || $3::text))
         WHERE user_id=$1 AND ${cond} AND NOT ($3 = ANY(COALESCE(tags,'{}'::text[])))`,
        [...params, r.action_value]
      );
    }
  }
  return rules.length;
}

module.exports = { applyRules };
