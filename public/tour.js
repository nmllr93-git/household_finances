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
    { t: 'Welcome to Larenest', b: 'One place for your budget, bills, accounts and investments: personal, shared with your household, or both. Here’s a 30-second look around.' },
    { t: 'Add your money', b: 'Import statements from your bank (CSV, OFX or QFX), or connect bank sync in ⚙ Settings so new transactions arrive on their own. Try the sample household first if you’d like to explore.' },
    { t: 'Your data stays with you', b: '', map: true },
    { t: 'Find your way around', b: 'The tabs across the top group everything: Overview, Spending, Wealth and more. ⚙ Settings holds your dashboards, bank sync, backups and phone widgets. Use “Send feedback” there to tell us what to improve.' },
  ];
  const show = () => {
    if (document.querySelector('.fd-tour')) return;
    let i = 0; const wrap = document.createElement('div'); wrap.className = 'fd-tour'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-labelledby', 'fd-tour-t');
    const card = document.createElement('div'); card.className = 'fd-tour-card'; wrap.append(card);
    const close = () => { try { localStorage.setItem(KEY, '1'); } catch (e) {} wrap.remove(); document.removeEventListener('keydown', key); };
    const key = (e) => { if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight' && i < CARDS.length - 1) { i++; draw(); } else if (e.key === 'ArrowLeft' && i > 0) { i--; draw(); } };
    const btn = (t, cls, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = t; b.addEventListener('click', fn); return b; };
    const draw = () => {
      const c = CARDS[i]; card.replaceChildren();
      const dots = document.createElement('div'); dots.className = 'fd-tour-dots'; CARDS.forEach((_, n) => { const s = document.createElement('span'); if (n === i) s.className = 'on'; dots.append(s); });
      const h = document.createElement('h2'); h.id = 'fd-tour-t'; h.textContent = c.t; card.append(dots, h);
      if (c.b) { const p = document.createElement('p'); p.textContent = c.b; card.append(p); }
      if (c.map) card.append(window.FDDataMap(!!window.FD_LOCAL));
      const row = document.createElement('div'); row.className = 'fd-tour-btns';
      row.append(btn('Skip', 'fd-link', close), document.createElement('span'));
      if (i > 0) row.append(btn('Back', 'fd-tour-back', () => { i--; draw(); }));
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
