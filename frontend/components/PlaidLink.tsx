'use client';

import { useState, useCallback, useEffect, type CSSProperties } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { apiCall } from '@/lib/store';

export default function PlaidLinkButton({ token, onSuccess, label, style }: { token: string; onSuccess: () => void; label?: string; style?: CSSProperties }) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1: ask the backend for a Plaid link_token
  const startLink = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const data = await apiCall('/api/plaid/create-link-token', { method: 'POST', token });
      setLinkToken(data.link_token);
    } catch (e: any) {
      setError(e?.message || 'Could not start Plaid Link.');
      setLoading(false);
    }
  }, [token]);

  // Step 3: after the user finishes Plaid Link, exchange the public_token
  const handleSuccess = useCallback(
    async (public_token: string, metadata: any) => {
      try {
        await apiCall('/api/plaid/exchange-token', {
          method: 'POST',
          token,
          body: JSON.stringify({ public_token, institution: metadata?.institution }),
        });
        onSuccess();
      } catch (e: any) {
        setError(e?.message || 'Could not link your account.');
      } finally {
        setLoading(false);
        setLinkToken(null);
      }
    },
    [token, onSuccess]
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: handleSuccess,
    onExit: (err: any, metadata: any) => {
      if (err) {
        console.error('Plaid Link exit error:', err, metadata);
        setError(`Plaid [${err.error_code || err.error_type || 'error'}]: ${err.display_message || err.error_message || 'Something went wrong.'}`);
      }
      setLoading(false);
      setLinkToken(null);
    },
  });

  // Step 2: once we have a token and Plaid is ready, open the modal
  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  return (
    <div>
      <button
        onClick={startLink}
        disabled={loading}
        style={style ?? {
          background: '#3b7dff',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          padding: '10px 20px',
          fontSize: 13,
          fontWeight: 600,
          fontFamily: 'var(--font-syne)',
          cursor: loading ? 'wait' : 'pointer',
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? 'Connecting…' : (label ?? 'Connect Bank Account (via Plaid)')}
      </button>
      {error && (
        <p style={{ color: '#ff6b6b', marginTop: 8, fontSize: 12 }}>{error}</p>
      )}
    </div>
  );
}
