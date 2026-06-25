// Pure portfolio math — reused by the investments API, the MCP read tools, and
// (later) the strategy engine + backtester. No DB, no side effects.
// Each `holding` row is a holdings⋈securities join: { quantity, institution_price,
// institution_value, cost_basis, ticker_symbol, name, type, close_price }.

const num = (v) => Number(v) || 0;

// Prefer live quantity × close price; fall back to the institution-reported value.
function marketValue(h) {
  const byQty = num(h.quantity) * num(h.close_price ?? h.institution_price);
  return byQty > 0 ? byQty : num(h.institution_value);
}

function totalValue(holdings) {
  return holdings.reduce((t, h) => t + marketValue(h), 0);
}

function normalize(sums, total) {
  const out = {};
  if (total <= 0) return out;
  for (const [k, v] of Object.entries(sums)) out[k] = v / total;
  return out;
}

// Allocation by asset type: { equity: 0.6, etf: 0.2, cash: 0.2 } (fractions).
function allocationByType(holdings) {
  const total = totalValue(holdings);
  const sums = {};
  for (const h of holdings) {
    const t = h.is_cash_equivalent ? 'cash' : (h.type || 'other');
    sums[t] = (sums[t] || 0) + marketValue(h);
  }
  return normalize(sums, total);
}

// Allocation by ticker (for drift vs ticker targets).
function allocationByTicker(holdings) {
  const total = totalValue(holdings);
  const sums = {};
  for (const h of holdings) {
    const k = h.ticker_symbol || h.name || 'CASH';
    sums[k] = (sums[k] || 0) + marketValue(h);
  }
  return normalize(sums, total);
}

// Per-position weight + unrealized gain, largest first.
function enrichPositions(holdings) {
  const total = totalValue(holdings);
  return holdings
    .map((h) => {
      const value = marketValue(h);
      const cost = h.cost_basis == null ? null : num(h.cost_basis);
      const gain = cost == null ? null : value - cost;
      return {
        ticker: h.ticker_symbol,
        name: h.name,
        type: h.type,
        account: h.account_name,
        quantity: num(h.quantity),
        price: num(h.close_price ?? h.institution_price),
        value: Math.round(value * 100) / 100,
        cost_basis: cost,
        unrealized_gain: gain == null ? null : Math.round(gain * 100) / 100,
        unrealized_gain_pct: gain == null || cost <= 0 ? null : Math.round((gain / cost) * 1000) / 10,
        weight_pct: total > 0 ? Math.round((value / total) * 1000) / 10 : 0,
      };
    })
    .sort((a, b) => b.value - a.value);
}

// Drift of current weights vs target weights (both fractions). targets: {KEY: w}.
// Returns [{ key, current_pct, target_pct, drift_pct, over_threshold }].
function drift(currentWeights, targets, threshold = 0.05) {
  const keys = new Set([...Object.keys(currentWeights || {}), ...Object.keys(targets || {})]);
  return [...keys]
    .map((k) => {
      const cur = num((currentWeights || {})[k]);
      const tgt = num((targets || {})[k]);
      const d = cur - tgt;
      return {
        key: k,
        current_pct: Math.round(cur * 1000) / 10,
        target_pct: Math.round(tgt * 1000) / 10,
        drift_pct: Math.round(d * 1000) / 10,
        over_threshold: Math.abs(d) > threshold,
      };
    })
    .sort((a, b) => Math.abs(b.drift_pct) - Math.abs(a.drift_pct));
}

module.exports = { marketValue, totalValue, allocationByType, allocationByTicker, enrichPositions, drift };
