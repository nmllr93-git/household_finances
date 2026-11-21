// Starts the app: who's signed in, which budgets they can see, and switching between them.
(function () {
  const $ = (s) => document.querySelector(s);
  let books = [];

  function pick(id) {
    const b = books.find((x) => x.id === id) || books[0];
    if (!b) return;
    try { localStorage.setItem('hf-book', b.id); } catch {}
    window.FD_BOOK = b.label;
    document.title = `${b.name} · Household Finances`;
    $('#fd-title').textContent = b.name;
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

  $('#fd-logout').addEventListener('click', async () => {
    try { await FDStore.fetch('/api/logout', { method: 'POST' }); } finally { location.href = '/login.html'; }
  });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
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
    const b = document.createElement('button'); b.type = 'button'; b.className = 'fd-link'; b.textContent = 'Switch server';
    b.addEventListener('click', () => { if (desk) window.FDApp.setupAgain(); else location.href = 'https://localhost/?pick=1'; });
    box.append(' · ', b);
  } catch (e) {}
})();

