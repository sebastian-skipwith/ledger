// Deterministic merchant-name cleanup (no AI): turns raw POS strings like
// "SQ *BLUE BOTTLE COF" or "TST* CHIPOTLE 1234 CA" into readable names.
// Conservative — returns the original (trimmed) if cleaning would empty it.

const PROCESSOR_PREFIX = /^(SQ|TST|SP|PP|PAYPAL|POS|TPG|IC|CKE|DD|PY|GOOGLE|GOOGL|APLPAY|AMZN MKTP)\s*\*+\s*/i;
const NOISE = /\b(DEBIT|CREDIT|VISA|MASTERCARD|AMEX|PURCHASE|RECURRING|PAYMENT|PMT|ACH|POS|CARD)\b/gi;

function cleanMerchant(raw) {
  if (!raw) return raw;
  let s = String(raw).trim();

  s = s.replace(PROCESSOR_PREFIX, '');        // strip "SQ *", "TST* ", etc.
  s = s.replace(/\bAUTHORIZED ON\b.*$/i, ''); // strip "... AUTHORIZED ON 06/24 ..."
  s = s.replace(NOISE, ' ');                  // strip card-network noise words
  s = s.replace(/\b[A-Z]{2}\s+\d{5}(-\d{4})?\b\s*$/i, ''); // trailing "CA 90210"
  s = s.replace(/[#*]?\s*\d{3,}\s*$/, '');     // trailing store/location number
  s = s.replace(/\s{2,}/g, ' ').trim();

  if (!s) return String(raw).trim();

  // Title-case, but keep short all-caps tokens (e.g. "USA", "ATM") intact.
  return s
    .split(' ')
    .map((w) => (w.length <= 3 && w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');
}

module.exports = { cleanMerchant };
