// First-run tour: four short cards the first time this device opens a dashboard (all platforms use this page).
// Replay any time from ⚙ Settings → Help. Also: the "where your data lives" picture, shared with Settings.
(function () {
  const KEY = 'fd-tour-v1';
  // a small picture of where data lives and moves: used in the tour and in Settings
  window.FDDataMap = (local) => {
    const d = document.createElement('div'); d.className = 'fd-datamap';
    d.innerHTML = `<div class="fd-dm-home"><b>${local ? 'This phone' : 'Your computer'}</b><span>All your transactions, balances, budgets and backups. Nothing is copied anywhere else.</span></div>
      ${local ? '' : '<div class="fd-dm-arrow" aria-hidden="true">⇄</div><div class="fd-dm-box"><b>Your phones &amp; other PCs</b><span>Open the dashboard from your computer over your own network. Sign-in required.</span></div>'}
      <div class="fd-dm-row"><div class="fd-dm-box fd-dm-in"><b>Bank sync (optional)</b><span>Your bank data comes <i>in</i>. Nothing is sent back.</span></div>
      <div class="fd-dm-box fd-dm-out"><b>Market data (optional)</b><span>Only stock symbols or a VIN go out. Never your finances.</span></div></div>
      <div class="fd-dm-none"><b>No Larenest server.</b> No account, ads, analytics or tracking. The developer never sees your data.</div>`;
    return d;
  };
  const CARDS = [
    { t: 'Welcome to Larenest', b: 'One place for your budget, bills, accounts and investments: personal, shared with your household, or both. Here’s a one-minute look around.' },
    { t: 'Your data stays with you', b: '', map: true },
    { t: 'Find your way around', b: 'The tabs across the top group everything: Overview, Spending, Wealth and more. ⚙ Settings holds your dashboards, bank sync, backups and phone widgets. Use “Send feedback” there to tell us what to improve.' },
    { t: 'Get your bank data in', list: [
      ['Import statements', 'Download a statement from your bank’s website (PDF, CSV, OFX or QFX) and drop it on Import (+). Several files at once is fine; each is matched to the right account. Free, and nothing leaves your device.'],
      ['Or sync automatically with SimpleFIN', 'SimpleFIN Bridge is a separate read-only service (about $15 a year, paid to them). Link your banks there, paste a setup token in ⚙ Settings → Automatic bank sync, choose which accounts to bring in, and new transactions arrive about every 6 hours.']],
      b2: 'You can mix both: sync the accounts SimpleFIN supports and import the rest.', last: true },
  ];
  // shown only after “Show me advanced options”
  const ADV = [
    { t: 'Advanced: your own bank-sync keys', b: 'Instead of SimpleFIN, the person running Larenest on their computer can add their own free Teller or Plaid developer keys (⚙ Settings → Your own bank-sync keys). Teller’s free level works with real banks for personal use; Plaid needs Plaid to approve production access first. Keys stay on that computer.' },
    { t: 'Advanced: market & economy data', b: 'Free API keys turn on live prices and news (Finnhub), market overview, movers and dividends (Financial Modeling Prep), rates and home prices (FRED), inflation (BLS) and gas & electricity prices (EIA). Add them in ⚙ Settings → Data sources; each has a Test button. They only ever receive stock symbols or your key.' },
    { t: 'Advanced: sharing & reaching home', b: 'From the computer running Larenest you can invite someone with a one-time QR code, set up a weekly email summary, and use Tailscale (free) to open your dashboards securely when you’re away from home. ⚙ Settings → Where your data lives explains how each connection is protected.' },
  ];
  const show = () => {
    if (document.querySelector('.fd-tour')) return;
    let i = 0, adv = false; const n0 = CARDS.length; const wrap = document.createElement('div'); wrap.className = 'fd-tour'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-labelledby', 'fd-tour-t');
    const card = document.createElement('div'); card.className = 'fd-tour-card'; wrap.append(card);
    const close = () => { try { localStorage.setItem(KEY, '1'); } catch (e) {} CARDS.length = n0; wrap.remove(); document.removeEventListener('keydown', key); };
    const key = (e) => { if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight' && i < CARDS.length - 1) { i++; draw(); } else if (e.key === 'ArrowLeft' && i > 0) { i--; draw(); } };
    const btn = (t, cls, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = t; b.addEventListener('click', fn); return b; };
    const draw = () => {
      const c = CARDS[i]; card.replaceChildren();
      const dots = document.createElement('div'); dots.className = 'fd-tour-dots'; CARDS.forEach((_, n) => { const s = document.createElement('span'); if (n === i) s.className = 'on'; dots.append(s); });
      const h = document.createElement('h2'); h.id = 'fd-tour-t'; h.textContent = c.t; card.append(dots, h);
      if (c.b) { const p = document.createElement('p'); p.textContent = c.b; card.append(p); }
      if (c.map) card.append(window.FDDataMap(!!window.FD_LOCAL));
      if (c.list) { const ul = document.createElement('div'); ul.className = 'fd-tour-list'; c.list.forEach(([h, t]) => { const d = document.createElement('div'); const hb = document.createElement('b'); hb.textContent = h; const sp = document.createElement('span'); sp.textContent = t; d.append(hb, sp); ul.append(d); }); card.append(ul); }
      if (c.b2) { const p = document.createElement('p'); p.textContent = c.b2; card.append(p); }
      const row = document.createElement('div'); row.className = 'fd-tour-btns';
      row.append(btn('Skip', 'fd-link', close), document.createElement('span'));
      if (i > 0) row.append(btn('Back', 'fd-tour-back', () => { i--; draw(); }));
      if (c.last && !adv) row.append(btn('Show me advanced options', 'fd-tour-back', () => { adv = true; CARDS.push(...ADV); i++; draw(); }));
      row.append(btn(i < CARDS.length - 1 ? 'Next' : 'Get started', 'fd-tour-go', () => { if (i < CARDS.length - 1) { i++; draw(); } else close(); }));
      card.append(row); const nb = row.lastChild; if (nb) nb.focus();
    };
    document.addEventListener('keydown', key); document.body.append(wrap); draw();
  };
  window.FDTour = show;
  // first visit on this device, once a dashboard has loaded (not on top of the sign-in page or a phone widget jump)
  let seen = false; try { seen = localStorage.getItem(KEY) === '1'; } catch (e) { seen = true; }
  if (!seen) { const wait = () => { if (window.__fdGo) return; if (document.getElementById('fd-title') && window.HF && window.HF.state && window.HF.state.bookId) show(); else setTimeout(wait, 500); }; setTimeout(wait, 1200); }
})();

// Feedback: an email to the developer, with the app and device filled in (nothing is sent without you pressing Send)
window.FDFeedback = () => {
  const plat = window.FDApp ? 'PC app' : /Android/i.test(navigator.userAgent) ? (window.FD_LOCAL ? 'Android (phone-only)' : 'Android') : /iPhone|iPad/i.test(navigator.userAgent) ? 'iPhone' : 'Web browser';
  const body = `\n\n\n---\nLarenest on ${plat}\n${navigator.userAgent.slice(0, 160)}`;
  const url = 'mailto:contact@larenest.app?subject=' + encodeURIComponent('Larenest feedback (' + plat + ')') + '&body=' + encodeURIComponent(body);
  try { if (window.FDApp || window.FDInApp) window.open(url); else location.href = url; } catch (e) {}
};

// How the connection between your devices and the computer running Larenest is protected, in plain words,
// with which kind this device is using right now.
window.FDConnSecurity = () => {
  const w = document.createElement('div'); w.className = 'fd-connsec';
  const host = location.hostname, https = location.protocol === 'https:';
  const ts = /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host) || /\.ts\.net$/i.test(host);
  const now = window.FD_LOCAL ? ['ok', 'Phone-only mode: nothing travels over a network at all.']
    : /^(localhost|127\.0\.0\.1|\[?::1\]?)$/.test(host) ? ['ok', 'You’re on the computer that runs Larenest, so your data never leaves it.']
    : https ? ['ok', 'This connection is encrypted (HTTPS).']
    : ts ? ['ok', 'You’re connected through Tailscale, so this connection is encrypted from this device all the way to your computer.']
    : ['warn', 'This connection isn’t encrypted (http://). Use the https:// address or the Larenest app instead; see below.'];
  const h = document.createElement('div'); h.className = 'fd-connsec-now fd-cs-' + now[0]; h.textContent = (now[0] === 'ok' ? '🔒 ' : '⚠ ') + now[1]; w.append(h);
  const rows = [
    ['Larenest phone & PC apps', 'Encrypted (HTTPS)', 'The apps connect with HTTPS using your computer’s own certificate. Scanning the QR code tells the app exactly which certificate to trust, so it’s encrypted end to end, even on plain home Wi-Fi, at no cost.'],
    ['A web browser, https:// address', 'Encrypted, one-time warning', 'Also encrypted. The browser warns once (“not secure”) because the certificate is your computer’s own rather than from a public authority. With Tailscale HTTPS turned on, the Tailscale address has no warning at all.'],
    ['A web browser, http:// address', 'Not encrypted', 'Your Wi-Fi password encrypts what goes through the air, but anything already on your network (a guest’s phone, a compromised smart TV) could in principle read the traffic, including your sign-in. Use the https:// address instead.'],
    ['Tailscale (free)', 'Encrypted end to end', 'Each device talks to your computer through its own encrypted tunnel, at home or away. Nothing in between can read it, including Tailscale.'],
    ['WireGuard to your router', 'Tunnel to your home, then HTTPS', 'WireGuard encrypts the trip across the internet to your router. From there to your computer, the apps and https:// addresses are still encrypted; an http:// address would be plain on your home network.'],
    ['Phone-only mode, or the computer itself', 'Never leaves the device', 'Nothing travels over a network.']];
  const t = document.createElement('div'); t.className = 'fd-connsec-list';
  rows.forEach(([a, b, c]) => { const d = document.createElement('div'); const x = document.createElement('b'); x.textContent = a; const y = document.createElement('i'); y.textContent = b; const z = document.createElement('span'); z.textContent = c; d.append(x, y, z); t.append(d); });
  w.append(t);
  const p = document.createElement('p'); p.className = 'fd-note'; p.textContent = 'Your data stays on your computer in every case. Encryption is about who could see it while it travels between your own devices. Bank sync and market data always use HTTPS.'; w.append(p);
  return w;
};
