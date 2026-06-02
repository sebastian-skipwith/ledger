// networth.js
const nwRouter = require('express').Router();
const { query } = require('../db');

nwRouter.get('/', async (req, res, next) => {
  try {
    const { days = 180 } = req.query;
    const { rows } = await query(
      `SELECT snapshot_date, net_worth, total_assets, total_liabilities, breakdown
       FROM net_worth_snapshots
       WHERE user_id=$1 AND snapshot_date >= CURRENT_DATE - $2::int * INTERVAL '1 day'
       ORDER BY snapshot_date ASC`,
      [req.user.id, parseInt(days)]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = nwRouter;

// ─────────────────────────────────────────────
// bills.js is in separate file per Express convention
// (shown inline here for brevity — split in real project)
