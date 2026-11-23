// Starts the app: who's signed in, which budgets they can see, and switching between them.
(function () {
  const $ = (s) => document.querySelector(s);
  let books = [];

  function pick(id) {
    const b = books.find((x) => x.id === id) || books[0];
    if (!b) return;
    try { localStorage.setItem('hf-book', b.id); } catch {}
    window.FD_BOOK = b.label;
    document.title = `${b.name} · Larenest`;
    $('#fd-title').textContent = b.name;
    // view-only logins: say so, and hide the controls that change things (the server refuses changes anyway)
    document.body.classList.toggle('fd-readonly', !!b.readOnly);
    if (b.readOnly) { const t = document.createElement('span'); t.className = 'fd-viewonly'; t.textContent = 'View only'; t.title = 'This login can see this dashboard but not change it'; $('#fd-title').append(' ', t); }
    document.querySelectorAll('input[name=book]').forEach((i) => { i.value = b.label; });
    document.querySelectorAll('#fd-books .hf-tab').forEach((btn) => {
      const on = btn.dataset.id === b.id;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    $('#fd-export').href = FDStore.url(`/api/books/${encodeURIComponent(b.id)}/export`);
    dash.setParams({ cat: null, bmonth: null });
    window.HF.load(b.id);
  }

  async function boot() {
    let me;
    try { me = await window.HF.api('GET', '/api/me'); } catch { return; }
    books = me.books;
    $('#fd-user').textContent = me.username;
    const nav = $('#fd-books');
    nav.replaceChildren(...books.map((b) => {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'hf-tab'; btn.role = 'tab'; btn.dataset.id = b.id; btn.textContent = b.name;
      btn.addEventListener('click', () => pick(b.id));
      return btn;
    }));
    nav.hidden = books.length < 2;
    if (!books.length) { $('#fd-title').textContent = 'No budgets yet'; return; }
    let saved = null; try { saved = localStorage.getItem('hf-book'); } catch {}
    pick(saved);
  }

  $('#fd-export').addEventListener('click', () => { try { localStorage.setItem('fd-gs-backup', '1'); } catch {} });
  $('#fd-logout').addEventListener('click', async () => {
    try { await FDStore.fetch('/api/logout', { method: 'POST' }); } finally { location.href = '/login.html'; }
  });

  // Phone-only mode: the app ships its own files, so no offline cache (it could serve old files after an app update).
  if (window.FD_LOCAL) { try { navigator.serviceWorker && navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())); } catch (e) {}
    $('#fd-logout').hidden = true;
    const sw = document.createElement('button'); sw.type = 'button'; sw.className = 'fd-link'; sw.textContent = 'Connect to a server instead';
    sw.title = 'Your data stays on this phone; you can come back to it any time';
    sw.addEventListener('click', () => { try { localStorage.setItem('fd-mode', ''); } catch (e) {} location.href = 'start.html?pick=1'; });
    $('.fd-account').append(sw);
  } else if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  boot();
})();

// Inside the desktop or phone app: a "Switch server" link back to the connect screen.
(function () {
  try {
    const q = new URLSearchParams(location.search);
    if (q.get('app') === 'phone') { localStorage.setItem('fd-inapp', 'phone'); history.replaceState(null, '', location.pathname + location.hash); }
    const phone = localStorage.getItem('fd-inapp') === 'phone', desk = !!(window.FDApp && window.FDApp.setupAgain);
    if (!phone && !desk) return;
    const box = document.querySelector('.fd-account'); if (!box) return;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'fd-link fd-switch'; b.textContent = 'Switch server';
    b.addEventListener('click', () => { if (desk) window.FDApp.setupAgain(); else location.href = 'https://localhost/?pick=1'; });
    box.append(' · ', b);
  } catch (e) {}
})();


// "Refresh": throw away cached page files and reload everything from the server (fixes a half-updated page).
(function () {
  const box = document.querySelector('.fd-account'); if (!box) return;
  const b = document.createElement('button'); b.type = 'button'; b.className = 'fd-link'; b.innerHTML = '⟳<span class="fd-reflbl"> Refresh</span>'; b.setAttribute('aria-label', 'Refresh'); b.title = 'Reload the newest version of every page and all data from the server';
  b.addEventListener('click', async () => {
    b.disabled = true; b.textContent = 'Refreshing…';
    try { if (window.caches) for (const k of await caches.keys()) await caches.delete(k); } catch (e) {}
    try { if (navigator.serviceWorker) for (const r of await navigator.serviceWorker.getRegistrations()) await r.update(); } catch (e) {}
    location.reload();
  });
  box.prepend(b, ' · ');
})();

// Phones: the logo row keeps ⟳ and a ☰ menu; the account links (who's signed in, Backup, Sign out, Switch server) move into the menu.
(function () {
  const box = document.querySelector('.fd-account'); if (!box) return;
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'fd-link fd-menubtn'; btn.textContent = '☰'; btn.setAttribute('aria-label', 'Account menu'); btn.setAttribute('aria-expanded', 'false');
  const menu = document.createElement('div'); menu.className = 'fd-acctmenu'; menu.hidden = true; menu.setAttribute('role', 'menu');
  const close = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  const build = () => {
    menu.textContent = '';
    const who = document.getElementById('fd-user'); if (who && who.textContent.trim()) { const h = document.createElement('div'); h.className = 'fd-acctwho'; h.textContent = 'Signed in as ' + who.textContent.trim(); menu.append(h); }
    const item = (label, orig) => { if (!orig) return; const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.textContent = label; b.addEventListener('click', () => { close(); orig.click(); }); menu.append(b); };
    item('Download backup', document.getElementById('fd-export')); item('Sign out', document.getElementById('fd-logout')); item('Switch server', box.querySelector('.fd-switch'));
  };
  btn.addEventListener('click', (e) => { e.stopPropagation(); if (menu.hidden) { build(); menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); } else close(); });
  document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target)) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  box.append(btn, menu);
})();
