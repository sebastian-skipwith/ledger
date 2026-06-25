// Pluggable investment strategies. A "strategy" is data the user configures;
// the code here is a set of PURE evaluators. evaluate(ctx) only RETURNS proposed
// orders — it never touches money or places an order. ctx = { positions:[{ticker,
// quantity, price, value}], cash, params }. Output: [{ ticker, side, notional?, reason }].

const round2 = (n) => Math.round(n * 100) / 100;

function holdingsValue(positions) {
  return positions.reduce((t, p) => t + (Number(p.value) || 0), 0);
}

// Dollar-Cost Averaging: buy a fixed amount split across target weights.
function dca(ctx) {
  const notional = Number(ctx.params.notional) || 0;
  const targets = ctx.params.targets || {};
  const orders = [];
  for (const [ticker, w] of Object.entries(targets)) {
    const amt = round2(notional * Number(w));
    if (amt > 0) orders.push({ ticker, side: 'buy', notional: amt, reason: `Scheduled DCA: buy $${amt} of ${ticker}` });
  }
  return orders;
}

// Target-allocation rebalance with a drift threshold. Generates buys/sells to
// move toward the target weights, but only if some position drifts past threshold.
function targetRebalance(ctx) {
  const targets = ctx.params.targets || {};
  const threshold = Number(ctx.params.threshold) || 0.05;
  const total = holdingsValue(ctx.positions);
  if (total <= 0) return [];

  const curValue = {};
  for (const p of ctx.positions) curValue[p.ticker] = (curValue[p.ticker] || 0) + (Number(p.value) || 0);

  let triggered = false;
  for (const [t, w] of Object.entries(targets)) {
    const cur = (curValue[t] || 0) / total;
    if (Math.abs(cur - Number(w)) > threshold) triggered = true;
  }
  if (!triggered) return [];

  const orders = [];
  for (const [t, w] of Object.entries(targets)) {
    const delta = round2(Number(w) * total - (curValue[t] || 0));
    if (delta > 1) orders.push({ ticker: t, side: 'buy', notional: delta, reason: `Rebalance: ${t} underweight, buy $${delta}` });
    else if (delta < -1) orders.push({ ticker: t, side: 'sell', notional: round2(Math.abs(delta)), reason: `Rebalance: ${t} overweight, sell $${round2(Math.abs(delta))}` });
  }
  return orders;
}

// Equal-weight: special case of target_rebalance with 1/N targets.
function equalWeight(ctx) {
  const tickers = ctx.params.tickers || [];
  if (!tickers.length) return [];
  const w = 1 / tickers.length;
  const targets = {};
  for (const t of tickers) targets[t] = w;
  return targetRebalance({ ...ctx, params: { targets, threshold: ctx.params.threshold } });
}

const STRATEGIES = {
  dca: {
    key: 'dca', label: 'Dollar-Cost Averaging', evaluate: dca,
    paramSchema: { notional: 'number (amount per run)', targets: 'object {TICKER: weight}' },
  },
  target_rebalance: {
    key: 'target_rebalance', label: 'Target-Allocation Rebalance', evaluate: targetRebalance,
    paramSchema: { targets: 'object {TICKER: weight}', threshold: 'number (e.g. 0.05)' },
  },
  equal_weight: {
    key: 'equal_weight', label: 'Equal Weight', evaluate: equalWeight,
    paramSchema: { tickers: 'string[]', threshold: 'number (e.g. 0.05)' },
  },
};

module.exports = { STRATEGIES };
