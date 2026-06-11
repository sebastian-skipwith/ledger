// Transactional email via Resend (https://resend.com — free tier is plenty).
// Dormant until RESEND_API_KEY is set in Railway. Until the persistence.finance
// domain is verified in Resend, the sender must stay onboarding@resend.dev.
const FROM = process.env.EMAIL_FROM || 'Persistence <onboarding@resend.dev>';
const SUPPORT = 'support@persistence.finance';

async function send({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY) return false;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, to, subject, html, reply_to: SUPPORT }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend ${res.status}: ${body.slice(0, 200)}`);
  }
  return true;
}

function welcomeHtml(firstName) {
  return `
<div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#14141f;">
  <p style="font-size:22px;font-style:italic;margin:0 0 24px;">Persistence</p>
  <p style="font-size:15px;line-height:1.7;">Hi ${firstName || 'there'},</p>
  <p style="font-size:15px;line-height:1.7;">Welcome to Persistence — your money, always in plain sight.</p>
  <p style="font-size:15px;line-height:1.7;">Three things to do in your first five minutes:</p>
  <ol style="font-size:15px;line-height:1.9;padding-left:20px;">
    <li><strong>Link a bank</strong> — click "+ Link Account" on your dashboard. Connections are read-only and handled by Plaid; we never see your bank login.</li>
    <li><strong>Install the desktop HUD</strong> — the always-on-top bar that keeps your net worth, safe-to-spend, and upcoming bills on screen while you work. Grab it from the dashboard.</li>
    <li><strong>Ask the AI anything</strong> — "can I afford a $400 flight this month?" gets a real answer grounded in your actual numbers.</li>
  </ol>
  <p style="font-size:15px;line-height:1.7;">Questions, ideas, problems? Just reply to this email — it goes straight to a human.</p>
  <p style="font-size:15px;line-height:1.7;">— Sebastian, founder</p>
  <hr style="border:none;border-top:1px solid #e5e5e5;margin:28px 0 14px;">
  <p style="font-size:11px;color:#888;line-height:1.6;">You're receiving this because an account was created with this address. Read how we protect your data: https://ledger-theta-puce.vercel.app/security.html</p>
</div>`;
}

async function sendWelcomeEmail(email, fullName) {
  const first = (fullName || '').split(' ')[0];
  return send({ to: email, subject: 'Welcome to Persistence', html: welcomeHtml(first) });
}

module.exports = { send, sendWelcomeEmail, SUPPORT };
