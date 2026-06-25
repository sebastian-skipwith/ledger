const router = require('express').Router();
const { query } = require('../db');

const num = (v) => parseFloat(v) || 0;
const isRetirement = (a) => ['401k', 'ira', 'roth'].some((k) => (a.subtype || '').toLowerCase().includes(k));

// The requester's ACTIVE membership row for a household, or null. This is the
// single authorization gate: a user can only see a household's data if this
// returns a row (i.e. they are an active member).
async function membership(userId, householdId) {
  const { rows } = await query(
    `SELECT * FROM household_members WHERE household_id=$1 AND user_id=$2 AND status='active'`,
    [householdId, userId]
  );
  return rows[0] || null;
}

function computeNetWorth(accounts) {
  const cash = accounts.filter((a) => a.type === 'depository').reduce((t, a) => t + num(a.current_balance), 0);
  const investments = accounts.filter((a) => a.type === 'investment' && !isRetirement(a)).reduce((t, a) => t + num(a.current_balance), 0);
  const retirement = accounts.filter((a) => a.type === 'investment' && isRetirement(a)).reduce((t, a) => t + num(a.current_balance), 0);
  const debt = accounts.filter((a) => ['credit', 'loan'].includes(a.type)).reduce((t, a) => t + Math.abs(num(a.current_balance)), 0);
  return {
    net_worth: Math.round(cash + investments + retirement - debt),
    cash: Math.round(cash), investments: Math.round(investments),
    retirement: Math.round(retirement), total_debt: Math.round(debt),
  };
}

// Combined household view. Throws a {status:403} error if the requester is not
// an active member. ONLY active members' NON-HIDDEN accounts are exposed.
async function getHouseholdView(userId, householdId) {
  const me = await membership(userId, householdId);
  if (!me) { const e = new Error('Not a member of this household'); e.status = 403; throw e; }

  const [hRes, membersRes, acctRes] = await Promise.all([
    query('SELECT id, name FROM households WHERE id=$1', [householdId]),
    query(
      `SELECT hm.user_id, hm.role, u.full_name, u.email
       FROM household_members hm JOIN users u ON u.id=hm.user_id
       WHERE hm.household_id=$1 AND hm.status='active' ORDER BY hm.role DESC, u.full_name`,
      [householdId]
    ),
    query(
      `SELECT a.user_id, a.id, a.name, a.type, a.subtype, a.current_balance, a.institution_name, a.mask
       FROM accounts a
       WHERE a.is_hidden=false AND a.user_id IN (
         SELECT user_id FROM household_members WHERE household_id=$1 AND status='active' AND user_id IS NOT NULL
       )
       ORDER BY a.type, a.current_balance DESC`,
      [householdId]
    ),
  ]);
  if (!hRes.rows.length) { const e = new Error('Household not found'); e.status = 404; throw e; }

  const accounts = acctRes.rows;
  const perMember = {};
  for (const m of membersRes.rows) perMember[m.user_id] = 0;
  for (const a of accounts) {
    if (perMember[a.user_id] === undefined) continue;
    const v = num(a.current_balance);
    perMember[a.user_id] += ['credit', 'loan'].includes(a.type) ? -Math.abs(v) : v;
  }

  return {
    id: hRes.rows[0].id,
    name: hRes.rows[0].name,
    my_role: me.role,
    ...computeNetWorth(accounts),
    members: membersRes.rows.map((m) => ({
      user_id: m.user_id, name: m.full_name, email: m.email, role: m.role,
      net_worth: Math.round(perMember[m.user_id] || 0),
      is_you: m.user_id === userId,
    })),
    accounts: accounts.map((a) => ({
      user_id: a.user_id, name: a.name, type: a.type, subtype: a.subtype,
      current_balance: num(a.current_balance), institution_name: a.institution_name, mask: a.mask,
    })),
  };
}

// Reject non-UUID path params with 404 instead of a Postgres 22P02 → generic 500.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
router.param('id', (req, res, next, val) => (UUID_RE.test(val) ? next() : res.status(404).json({ error: 'Not found' })));
router.param('userId', (req, res, next, val) => (UUID_RE.test(val) ? next() : res.status(404).json({ error: 'Not found' })));

// POST /api/household — create a household (creator becomes the active owner)
router.post('/', async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim().slice(0, 80) || 'Household';
    const { rows } = await query('INSERT INTO households (name, created_by) VALUES ($1,$2) RETURNING *', [name, req.user.id]);
    await query(
      "INSERT INTO household_members (household_id, user_id, role, status) VALUES ($1,$2,'owner','active')",
      [rows[0].id, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// GET /api/household — households I'm an active member of
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT h.id, h.name, hm.role,
              (SELECT COUNT(*)::int FROM household_members m WHERE m.household_id=h.id AND m.status='active') AS member_count
       FROM households h
       JOIN household_members hm ON hm.household_id=h.id
       WHERE hm.user_id=$1 AND hm.status='active'
       ORDER BY h.created_at`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/household/invites — my pending invitations (defined before /:id)
router.get('/invites', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT hm.id, hm.household_id, h.name AS household_name, u.full_name AS invited_by
       FROM household_members hm
       JOIN households h ON h.id=hm.household_id
       LEFT JOIN users u ON u.id=h.created_by
       WHERE hm.status='invited' AND hm.user_id IS NULL AND LOWER(hm.invited_email)=LOWER($1)`,
      [req.user.email]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/household/invites/:id/accept — accept an invite addressed to my email
router.post('/invites/:id/accept', async (req, res, next) => {
  try {
    const { rows } = await query(
      `UPDATE household_members SET user_id=$1, status='active'
       WHERE id=$2 AND status='invited' AND user_id IS NULL AND LOWER(invited_email)=LOWER($3)
       RETURNING household_id`,
      [req.user.id, req.params.id, req.user.email]
    );
    if (!rows.length) return res.status(404).json({ error: 'Invitation not found' });
    res.json({ success: true, household_id: rows[0].household_id });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'You are already a member of this household' });
    next(err);
  }
});

// POST /api/household/invites/:id/decline
router.post('/invites/:id/decline', async (req, res, next) => {
  try {
    await query(
      "DELETE FROM household_members WHERE id=$1 AND status='invited' AND LOWER(invited_email)=LOWER($2)",
      [req.params.id, req.user.email]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /api/household/:id — combined view (403 unless an active member)
router.get('/:id', async (req, res, next) => {
  try {
    res.json(await getHouseholdView(req.user.id, req.params.id));
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// POST /api/household/:id/invite { email } — owner invites a member
router.post('/:id/invite', async (req, res, next) => {
  try {
    const me = await membership(req.user.id, req.params.id);
    if (!me || me.role !== 'owner') return res.status(403).json({ error: 'Only the household owner can invite' });
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) return res.status(400).json({ error: 'A valid email is required' });
    if (email === (req.user.email || '').toLowerCase()) return res.status(400).json({ error: "You're already in this household" });
    const existing = await query(
      `SELECT 1 FROM household_members hm LEFT JOIN users u ON u.id=hm.user_id
       WHERE hm.household_id=$1 AND (LOWER(hm.invited_email)=$2 OR LOWER(u.email)=$2)`,
      [req.params.id, email]
    );
    if (existing.rows.length) return res.status(409).json({ error: 'That person is already invited or a member' });
    const { rows } = await query(
      "INSERT INTO household_members (household_id, invited_email, role, status) VALUES ($1,$2,'member','invited') RETURNING id",
      [req.params.id, email]
    );
    res.status(201).json({ id: rows[0].id, invited_email: email });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'That person is already invited or a member' });
    next(err);
  }
});

// DELETE /api/household/:id/members/:userId — owner removes a member, or a member leaves
router.delete('/:id/members/:userId', async (req, res, next) => {
  try {
    const me = await membership(req.user.id, req.params.id);
    if (!me) return res.status(403).json({ error: 'Not a member of this household' });
    const tRes = await query('SELECT * FROM household_members WHERE household_id=$1 AND user_id=$2', [req.params.id, req.params.userId]);
    const target = tRes.rows[0];
    if (!target) return res.status(404).json({ error: 'Member not found' });
    const removingSelf = target.user_id === req.user.id;
    if (!removingSelf && me.role !== 'owner') return res.status(403).json({ error: 'Only the owner can remove other members' });
    if (target.role === 'owner') return res.status(400).json({ error: 'The owner cannot be removed — delete the household instead' });
    await query('DELETE FROM household_members WHERE household_id=$1 AND user_id=$2', [req.params.id, req.params.userId]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// DELETE /api/household/:id — owner deletes the household (CASCADE removes members)
router.delete('/:id', async (req, res, next) => {
  try {
    const me = await membership(req.user.id, req.params.id);
    if (!me || me.role !== 'owner') return res.status(403).json({ error: 'Only the household owner can delete it' });
    await query('DELETE FROM households WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
module.exports.getHouseholdView = getHouseholdView;
