// Persistence HUD - login overlay + token bootstrap.
// Exposes window.ensureAuth(): resolves once a valid session token is stored.
(() => {
  const core = window.__TAURI__?.core;
  const invoke = core?.invoke || (() => Promise.reject('no tauri'));
  const TW = window.__TAURI__?.window;
  const shell = window.__TAURI__?.shell;
  const DESKTOP_URL = 'https://ledger-theta-puce.vercel.app/desktop';

  async function sizeForLogin() {
    try {
      const win = TW.getCurrentWindow();
      const W = 400, H = 540;
      const sw = window.screen.availWidth || 1280;
      const sh = window.screen.availHeight || 800;
      await win.setSize(new TW.LogicalSize(W, H));
      await win.setPosition(new TW.LogicalPosition(Math.round((sw - W) / 2), Math.round((sh - H) / 2)));
    } catch (e) { console.error('sizeForLogin', e); }
  }

  async function restoreBar() {
    try {
      const win = TW.getCurrentWindow();
      const sw = window.screen.availWidth || 1280;
      await win.setSize(new TW.LogicalSize(sw, 52));
      await win.setPosition(new TW.LogicalPosition(0, 0));
    } catch (e) { console.error('restoreBar', e); }
  }

  function showOverlay() {
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.id = 'persistence-login';
      wrap.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#ffffff;color:#000;overflow:auto;display:flex;align-items:center;justify-content:center;-webkit-app-region:no-drag;font-family:Georgia, serif;';
      wrap.innerHTML = '<div style="width:320px;display:flex;flex-direction:column;gap:13px;padding:28px 0;text-align:center;">' +
        '<div style="font-family:Georgia,serif;font-weight:700;font-size:52px;line-height:1;">P</div>' +
        '<div style="font-size:12px;letter-spacing:4px;text-transform:uppercase;margin-bottom:6px;">Persistence</div>' +
        '<button id="lg-google" style="padding:12px;border:1px solid #000;background:#000;color:#fff;font-size:11px;letter-spacing:1px;text-transform:uppercase;cursor:pointer;font-family:inherit;">Sign in with Google</button>' +
        '<div style="font-size:11px;color:#555;line-height:1.5;margin-top:2px;">A browser window opens. Sign in, copy the code shown, paste it below.</div>' +
        '<input id="lg-code" type="text" placeholder="Paste code" style="padding:11px;border:1px solid #000;background:#fff;color:#000;font-size:12px;outline:none;font-family:monospace;text-align:center;" />' +
        '<button id="lg-connect" style="padding:12px;border:1px solid #000;background:#fff;color:#000;font-size:11px;letter-spacing:1px;text-transform:uppercase;cursor:pointer;font-family:inherit;">Connect</button>' +
        '<div id="lg-err" style="color:#000;font-size:11px;min-height:14px;"></div>' +
        '</div>';
      document.body.appendChild(wrap);
      const code = wrap.querySelector('#lg-code');
      const gbtn = wrap.querySelector('#lg-google');
      const cbtn = wrap.querySelector('#lg-connect');
      const err = wrap.querySelector('#lg-err');
      gbtn.addEventListener('click', () => { try { shell.open(DESKTOP_URL); } catch (e) { err.textContent = 'Could not open browser'; } });
      async function connect() {
        const v = code.value.trim();
        if (!v) { err.textContent = 'Paste the code first'; return; }
        err.textContent = '';
        cbtn.disabled = true; cbtn.textContent = 'CONNECTING...';
        try {
          await invoke('set_session', { refresh: v });
          wrap.remove();
          resolve();
        } catch (e) {
          err.textContent = (e && e.toString) ? e.toString() : 'Could not connect';
          cbtn.disabled = false; cbtn.textContent = 'Connect';
        }
      }
      cbtn.addEventListener('click', connect);
      code.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') connect(); });
    });
  }

  window.ensureAuth = async function ensureAuth() {
    let authed = false;
    try { authed = await invoke('is_authenticated'); } catch (e) { authed = false; }
    if (!authed) {
      await sizeForLogin();
      await showOverlay();
      await restoreBar();
    }
    setInterval(() => { invoke('refresh').catch(() => {}); }, 12 * 60 * 1000);
  };
})();
