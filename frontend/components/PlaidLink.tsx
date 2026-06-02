'use client';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function PlaidLinkButton({ token, onSuccess }: { token: string; onSuccess: () => void }) {
  async function openPlaid() {
    const res = await fetch(`${API}/api/plaid/create-link-token`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    // In production: initialize Plaid Link with data.link_token via react-plaid-link
    console.log('Plaid link token:', data.link_token);
    alert(`Link token ready: ${data.link_token}\n\nIn production this opens Plaid Link.`);
  }

  return (
    <button onClick={openPlaid} style={{
      background: '#3b7dff', color: 'white', border: 'none', borderRadius: 8,
      padding: '10px 20px', fontSize: 13, fontWeight: 600,
      fontFamily: 'var(--font-syne)', cursor: 'pointer',
    }}>
      Connect Bank Account (via Plaid)
    </button>
  );
}
