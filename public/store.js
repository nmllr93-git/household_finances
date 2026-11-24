// FDStore: the single door between the pages and wherever the data lives.
// Every page call goes through FDStore.fetch(path, options) using the same /api/... paths the server has.
// Today the only backend is "server" (this host, or a remote host for the desktop/phone apps).
// A future "local" backend (on-device SQLite) registers with FDStore.use({ name, fetch }) and answers the
// same paths with Response objects, so the pages never need to know which one is in use.
(function () {
  const get = (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
  const server = {
    name: 'server',
    fetch(path, opts = {}) {
      const base = FDStore.base;
      return fetch(base + path, { ...opts, credentials: base ? 'include' : 'same-origin' });
    },
  };
  const FDStore = {
    base: (window.FD_HOST || get('fd-host')).replace(/\/+$/, ''), // '' = same server that served the page
    backend: server,
    use(b) { if (b && typeof b.fetch === 'function') FDStore.backend = b; },
    setHost(url) { FDStore.base = String(url || '').replace(/\/+$/, ''); try { localStorage.setItem('fd-host', FDStore.base); } catch {} },
    fetch(path, opts) { return FDStore.backend.fetch(path, opts); },
    url(path) { return FDStore.base + path; }, // for links/downloads that the browser opens directly
    async json(method, path, body) {
      const r = await FDStore.fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
      if (r.status === 401) { location.href = 'login.html'; throw new Error('Signed out'); }
      if (r.status === 423) { location.href = 'unlock.html'; throw new Error('Locked'); }
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
      return r.json();
    },
  };
  window.FDStore = FDStore;
})();
