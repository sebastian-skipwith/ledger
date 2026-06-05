// Ledger HUD — login overlay + token-refresh bootstrap.
// Exposes window.ensureAuth(): resolves once a valid session token is stored.
(() => {
  const invoke = window.__TAURI__?.core?.invoke || (() => Promise.reject('no tauri'));

  function showOverlay() {
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.id = 'ledger-login';
      wrap.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:99999',
        'background:rgba(8,8,14,0.97)', 'backdrop-filter:blur(20px)',
        'display:flex', 'align-items:center', 'justify-content:center',
        '-webkit-app-region:no-drag', 'font-family:SF Mono, Consolas, monospace',
      ].join(';');
      wrap.innerHTML = `
        <div style="width:280px;display:flex;flex-direction:column;gap:10px;">
          <div style="font-family:Georgia,serif;font-style:italic;color:#d4af37;font-size:20px;text-align:center;margin-bottom:4px;">ledger</div>
          <input id="lg-email" type="email" placeholder="Email" autocomplete="username"
            style="padding:9px 11px;border-radius:7px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.05);color:#fff;font-size:13px;outline:none;" />
          <input id="lg-pass" type="password" placeholder="Password" autocomplete="current-password"
            style="padding:9px 11px;border-radius:7px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.05);color:#fff;font-size:13px;outline:none;" />
          <button id="lg-btn"
            style="margin-top:2px;padding:9px;border:none;border-radius:7px;background:#d4af37;color:#0b0b12;font-weight:700;font-size:13px;cursor:pointer;">Sign In</button>
          <div id="lg-err" style="color:#f04f54;font-size:11px;min-height:14px;text-align:center;"></div>
        </div>`;
      document.body.appendChild(wrap);

      const email = wrap.querySelector('#lg-email');
      const pass = wrap.querySelector('#lg-pass');
      const btn = wrap.querySelector('#lg-btn');
      const err = wrap.querySelector('#lg-err');

      async function submit() {
        err.textContent = '';
        btn.disabled = true;
        btn.textContent = 'Signing in...';
        try {
          await invoke('login', { email: email.value.trim(), password: pass.value });
          wrap.remove();
          resolve();
        } catch (e) {
          err.textContent = (e && e.toString) ? e.toString() : 'Login failed';
          btn.disabled = false;
          btn.textContent = 'Sign In';
        }
      }
      btn.addEventListener('click', submit);
      pass.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') submit(); });
      setTimeout(() => email.focus(), 50);
    });
  }

  window.ensureAuth = async function ensureAuth() {
    let authed = false;
    try { authed = await invoke('is_authenticated'); } catch (e) { authed = false; }
    if (!authed) {
      await showOverlay();
    }
    // Proactively refresh the 15-minute access token before it expires.
    setInterval(() => { invoke('refresh').catch(() => {}); }, 12 * 60 * 1000);
  };
})();
