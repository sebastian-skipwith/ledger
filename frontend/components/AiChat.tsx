'use client';
import { useState, useRef, useEffect } from 'react';
import { formatCurrency } from '@/lib/store';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Message { role: 'user' | 'assistant'; content: string; streaming?: boolean; }

const QUICK_PROMPTS = [
  'Analyze my spending this month',
  'What\'s my fastest debt payoff plan?',
  'How much should I move to HYSA?',
  'Am I on track for retirement?',
];

export default function AiChat({ token, summary }: { token: string; summary: any }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Load initial AI greeting
    if (summary && messages.length === 0) {
      loadInsights();
    }
  }, [summary]);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [messages]);

  async function loadInsights() {
    try {
      const res = await fetch(`${API}/api/ai/insights`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const ctx = data.context;
      const greeting = `Hey there 👋 Your net worth is **${formatCurrency(ctx.net_worth || 0)}** — here's what caught my attention:\n\n` +
        (data.insights || []).map((ins: any, i: number) => `${i + 1}. **${ins.title}** — ${ins.body}`).join('\n\n');
      setMessages([{ role: 'assistant', content: greeting }]);
    } catch {}
  }

  async function sendMessage(text: string) {
    if (!text.trim() || streaming) return;
    const userMsg = text.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setStreaming(true);

    // Add empty assistant message that we'll stream into
    setMessages(prev => [...prev, { role: 'assistant', content: '', streaming: true }]);

    try {
      const res = await fetch(`${API}/api/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: userMsg, session_id: sessionId }),
      });

      const sid = res.headers.get('X-Session-Id');
      if (sid) setSessionId(sid);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = JSON.parse(line.slice(6));
          if (payload.done) continue;
          if (payload.text) {
            setMessages(prev => {
              const msgs = [...prev];
              const last = msgs[msgs.length - 1];
              if (last?.role === 'assistant') {
                msgs[msgs.length - 1] = { ...last, content: last.content + payload.text };
              }
              return msgs;
            });
          }
        }
      }
    } catch (err) {
      setMessages(prev => {
        const msgs = [...prev];
        msgs[msgs.length - 1] = { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' };
        return msgs;
      });
    } finally {
      setStreaming(false);
      setMessages(prev => {
        const msgs = [...prev];
        if (msgs[msgs.length - 1]?.streaming) {
          msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], streaming: false };
        }
        return msgs;
      });
    }
  }

  function renderContent(text: string) {
    // Simple markdown-like rendering
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#f0f0f8">$1</strong>')
      .replace(/\n\n/g, '<br/><br/>')
      .replace(/\n/g, '<br/>');
  }

  return (
    <div style={{
      width: 320, flexShrink: 0,
      borderLeft: '1px solid rgba(255,255,255,0.07)',
      display: 'flex', flexDirection: 'column',
      background: 'rgba(255,255,255,0.012)',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 18px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 9,
          background: 'linear-gradient(135deg, #d4af37, #f5a623)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-serif)', fontSize: 15, color: '#0a0a0f', fontWeight: 700,
          fontStyle: 'italic',
        }}>L</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--white)' }}>Ledger AI</div>
          <div style={{ fontSize: 10, color: '#16c784' }}>
            {streaming ? '⊙ Thinking…' : '● Online'}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={bodyRef} style={{
        flex: 1, overflow: 'auto', padding: '14px 16px',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4,
            alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)' }}>
              {msg.role === 'user' ? 'You' : 'Ledger AI'}
            </div>
            <div style={{
              padding: '9px 13px',
              borderRadius: msg.role === 'user' ? '10px 4px 10px 10px' : '4px 10px 10px 10px',
              background: msg.role === 'user'
                ? 'rgba(212,175,55,0.12)'
                : 'rgba(255,255,255,0.05)',
              border: `1px solid ${msg.role === 'user' ? 'rgba(212,175,55,0.2)' : 'rgba(255,255,255,0.07)'}`,
              fontSize: 12, lineHeight: 1.65,
              color: msg.role === 'user' ? 'var(--white)' : 'rgba(200,200,220,0.9)',
              maxWidth: '90%',
            }}
            className={msg.streaming ? 'cursor' : ''}
            dangerouslySetInnerHTML={{ __html: renderContent(msg.content) }}
            />
          </div>
        ))}

        {/* Quick prompts when empty */}
        {messages.length <= 1 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
            {QUICK_PROMPTS.map(p => (
              <button key={p} onClick={() => sendMessage(p)} style={{
                fontSize: 11, padding: '5px 10px', borderRadius: 6,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(200,200,220,0.8)', cursor: 'pointer',
                fontFamily: 'var(--font-syne)', fontWeight: 500,
                transition: 'all 0.12s', textAlign: 'left',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(212,175,55,0.1)';
                e.currentTarget.style.borderColor = 'rgba(212,175,55,0.3)';
                e.currentTarget.style.color = '#d4af37';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                e.currentTarget.style.color = 'rgba(200,200,220,0.8)';
              }}
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{
        padding: '10px 14px',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', gap: 8, flexShrink: 0,
      }}>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage(input)}
          placeholder="Ask about your money…"
          disabled={streaming}
          style={{
            flex: 1,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8, padding: '8px 12px',
            color: 'var(--white)', fontSize: 12,
            fontFamily: 'var(--font-syne)', outline: 'none',
          }}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={streaming || !input.trim()}
          style={{
            width: 34, height: 34, borderRadius: 8,
            background: input.trim() ? '#d4af37' : 'rgba(255,255,255,0.08)',
            border: 'none', cursor: input.trim() ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: input.trim() ? '#0a0a0f' : 'rgba(255,255,255,0.2)',
            transition: 'all 0.15s', flexShrink: 0,
          }}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M2 6.5h9M8 3l3 3.5L8 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
