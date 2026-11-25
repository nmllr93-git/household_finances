// App lock for phone-only mode: a PIN (and fingerprint / Face ID where the phone has it) before the dashboard shows.
// It's a privacy screen: the data on the phone isn't encrypted with the PIN, so it keeps out someone picking up the
// phone, not someone with the phone's storage. Settings live in this app's localStorage ('fd-lock'):
//   { salt, hash, iter, bio: true|false, after: minutes in the background before locking again (0 = right away) }
(function () {
  'use strict';
  if (!window.FD_LOCAL) return;
  const T = (x) => (window.FDI18n ? window.FDI18n.tr(x) : x);
  const KEY = 'fd-lock';
  const cfg = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };
  const save = (c) => { try { if (c) localStorage.setItem(KEY, JSON.stringify(c)); else localStorage.removeItem(KEY); } catch (e) {} };
  const bio = () => (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Biometric) || null;
  const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
  async function hashPin(pin, salt, iter) {
    const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
    return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: iter }, k, 256));
  }
  async function bioAvailable() { const B = bio(); if (!B) return false; try { const r = await B.available(); return !!(r && r.available); } catch (e) { return false; } }
  async function bioVerify() { const B = bio(); if (!B) return false; try { const r = await B.verify({ reason: T('Unlock Larenest') }); return !!(r && r.ok); } catch (e) { return false; } }

  // ---------- the lock screen ----------
  let shown = null, fails = 0, waitUntil = 0;
  function lock() {
    const c = cfg(); if (!c || shown) return;
    const o = document.createElement('div'); o.className = 'fd-lock'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true');
    const card = document.createElement('div'); card.className = 'fd-lock-card';
    const logo = document.createElement('div'); logo.className = 'fd-lock-logo'; logo.textContent = '🔒';
    const h = document.createElement('h2'); h.textContent = T('Larenest is locked');
    const inp = document.createElement('input'); inp.type = 'password'; inp.inputMode = 'numeric'; inp.autocomplete = 'off'; inp.maxLength = 8; inp.placeholder = T('PIN'); inp.className = 'fd-lock-pin'; inp.setAttribute('aria-label', T('PIN'));
    const msg = document.createElement('p'); msg.className = 'fd-lock-msg';
    const go = document.createElement('button'); go.type = 'button'; go.className = 'fd-btn'; go.textContent = T('Unlock');
    const bb = document.createElement('button'); bb.type = 'button'; bb.className = 'fd-btn fd-quiet'; bb.textContent = T('Use fingerprint or Face ID'); bb.hidden = true;
    const forgot = document.createElement('p'); forgot.className = 'fd-lock-forgot'; forgot.textContent = T('Forgot the PIN? Use fingerprint or Face ID if it’s on. Otherwise the only way in is to clear the app’s data, which deletes what’s on this phone, so restore a backup file afterwards.');
    const unlock = () => { o.remove(); shown = null; fails = 0; document.documentElement.classList.remove('fd-locked'); };
    const tryPin = async () => {
      if (Date.now() < waitUntil) { msg.textContent = T('Too many tries. Wait {0} seconds.').replace('{0}', Math.ceil((waitUntil - Date.now()) / 1000)); return; }
      const v = inp.value.trim(); if (!v) return;
      if ((await hashPin(v, c.salt, c.iter)) === c.hash) return unlock();
      fails++; inp.value = ''; inp.focus();
      if (fails >= 5) { waitUntil = Date.now() + Math.min(300, 30 * 2 ** (fails - 5)) * 1000; msg.textContent = T('Too many tries. Wait {0} seconds.').replace('{0}', Math.ceil((waitUntil - Date.now()) / 1000)); }
      else msg.textContent = T('That PIN isn’t right.');
    };
    go.addEventListener('click', tryPin); inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryPin(); });
    const tryBio = async () => { if (await bioVerify()) unlock(); };
    bb.addEventListener('click', tryBio);
    card.append(logo, h, inp, msg, go, bb, forgot); o.append(card);
    document.documentElement.classList.add('fd-locked');
    (document.body || document.documentElement).append(o); shown = o;
    if (c.bio) bioAvailable().then((ok) => { if (!ok || !shown) return; bb.hidden = false; tryBio(); });
    setTimeout(() => inp.focus(), 50);
  }
  // lock on start, and again after the app has been in the background long enough
  let hiddenAt = 0;
  const start = () => { if (cfg()) lock(); };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  document.addEventListener('visibilitychange', () => {
    const c = cfg(); if (!c) return;
    if (document.hidden) hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt >= (Number(c.after) || 0) * 60e3) lock();
  });

  // ---------- settings (⚙ Settings → On this phone → App lock) ----------
  window.FDAppLock = {
    on: () => !!cfg(), config: () => { const c = cfg(); return c ? { bio: !!c.bio, after: Number(c.after) || 0 } : null; },
    bioAvailable,
    async setPin(pin, opts = {}) {
      if (!/^\d{4,8}$/.test(String(pin || ''))) throw new Error(T('Use 4 to 8 digits.'));
      const salt = hex(crypto.getRandomValues(new Uint8Array(16))), iter = 150000;
      const old = cfg() || {};
      save({ salt, iter, hash: await hashPin(String(pin), salt, iter), bio: opts.bio != null ? !!opts.bio : !!old.bio, after: opts.after != null ? Number(opts.after) : (old.after != null ? old.after : 1) });
    },
    async check(pin) { const c = cfg(); return !!c && (await hashPin(String(pin || ''), c.salt, c.iter)) === c.hash; },
    set(opts) { const c = cfg(); if (!c) return; if (opts.bio != null) c.bio = !!opts.bio; if (opts.after != null) c.after = Number(opts.after) || 0; save(c); },
    off() { save(null); },
    lockNow: lock,
  };
})();
