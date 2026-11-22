// Phone-only ("local") mode: the dashboard runs entirely on this device with no server.
// Only active when the phone app has set localStorage 'fd-mode' = 'local'; on a server it does nothing.
// Data lives in this app's own IndexedDB database. The dashboard rules come from the same shared core
// the PC server uses (core-books.js), so validation, export and restore behave identically, and a backup
// made here restores on a PC (and the other way round).
(function () {
  let mode = ''; try { mode = localStorage.getItem('fd-mode') || ''; } catch (e) {}
  if (mode !== 'local') return;
  window.FD_LOCAL = true;

  // ---------- IndexedDB storage ----------
  const DBNAME = 'household-finances', VER = 2;
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DBNAME, VER);
    r.onupgradeneeded = () => { const d = r.result;
      if (!d.objectStoreNames.contains('books')) d.createObjectStore('books', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('docs')) d.createObjectStore('docs', { keyPath: 'id' }).createIndex('bookColl', ['bookId', 'coll']);
      if (!d.objectStoreNames.contains('seed')) d.createObjectStore('seed', { keyPath: ['bookId', 'dataset'] });
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
      if (!d.objectStoreNames.contains('backups')) d.createObjectStore('backups', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('files')) d.createObjectStore('files', { keyPath: 'id' }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = async (stores, mode, fn) => { const d = await open(); return new Promise((res, rej) => { const t = d.transaction(stores, mode); let out; Promise.resolve(fn(t)).then((v) => { out = v; }); t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('aborted')); }); };
  const req2p = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const all = (store, idx, key) => tx([store], 'readonly', (t) => { const s = t.objectStore(store); return req2p(idx ? s.index(idx).getAll(key) : s.getAll()); });
  const kvGet = (k) => tx(['kv'], 'readonly', (t) => req2p(t.objectStore('kv').get(k)));
  const kvSet = (k, v) => tx(['kv'], 'readwrite', (t) => { t.objectStore('kv').put(v, k); });
  const newId = () => { const a = new Uint8Array(10); crypto.getRandomValues(a); return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };

  const store = {
    seedRows: async (bookId) => (await all('seed')).filter((r) => r.bookId === bookId).map((r) => ({ dataset: r.dataset, json: r.json })),
    listDocs: async (bookId, coll) => (await all('docs', 'bookColl', [bookId, coll])).sort((a, b) => String(a.created).localeCompare(String(b.created))).map((r) => ({ id: r.id, json: r.json, created: r.created, created_by: r.createdBy })),
    insertDoc: (r) => tx(['docs'], 'readwrite', (t) => { t.objectStore('docs').put(r); }),
    deleteDoc: (bookId, coll, id) => tx(['docs'], 'readwrite', async (t) => { const s = t.objectStore('docs'); const d = await req2p(s.get(id)); if (d && d.bookId === bookId && d.coll === coll) s.delete(id); }),
    replaceBookDocs: (bookId, rows) => tx(['docs'], 'readwrite', async (t) => { const s = t.objectStore('docs'); const keys = (await req2p(s.getAll())).filter((d) => d.bookId === bookId).map((d) => d.id); keys.forEach((k) => s.delete(k)); rows.forEach((r) => s.put({ ...r, bookId })); }),
    newId,
    backup: () => snapshot('before-restore'),
    putFile: (f) => tx(['files'], 'readwrite', (t) => { t.objectStore('files').put(f); }),
    getFile: async (bookId, id) => { const f = await tx(['files'], 'readonly', (t) => req2p(t.objectStore('files').get(id))); return f && f.bookId === bookId ? { mime: f.mime, data: f.data } : null; },
    deleteFile: (bookId, id) => tx(['files'], 'readwrite', async (t) => { const s2 = t.objectStore('files'); const f = await req2p(s2.get(id)); if (f && f.bookId === bookId) s2.delete(id); }),
    listFiles: async (bookId) => (await all('files')).filter((f) => f.bookId === bookId).map(({ id, mime, data }) => ({ id, mime, data })),
    replaceBookFiles: (bookId, files) => tx(['files'], 'readwrite', async (t) => { const s2 = t.objectStore('files'); (await req2p(s2.getAll())).filter((f) => f.bookId === bookId).forEach((f) => s2.delete(f.id)); files.forEach((f) => s2.put({ ...f, bookId, created: new Date().toISOString() })); }),
  };

  // ---------- dashboards on this phone ----------
  const books = async () => { let b = await all('books'); if (!b.length) { b = [{ id: 'personal', name: 'Personal', label: 'Personal', sort: 0 }]; await tx(['books'], 'readwrite', (t) => { b.forEach((x) => t.objectStore('books').put(x)); }); } return b.sort((x, y) => x.sort - y.sort); };

  // ---------- automatic backups: one snapshot a day, keep the last 14 (inside the app) ----------
  async function snapshot(why) {
    const core = await coreReady, api = core.createBookApi(store), list = [];
    for (const b of await books()) { const x = await api.exportBook(b); delete x.files; list.push(x); } // photos stay out of the in-app snapshots (backup files include them)
    const id = new Date().toISOString().replace(/[:.]/g, '-') + (why ? '-' + why : '');
    await tx(['backups'], 'readwrite', (t) => { t.objectStore('backups').put({ id, at: Date.now(), why: why || 'daily', books: list }); });
    const old = (await all('backups')).sort((a, b) => b.at - a.at).slice(14);
    if (old.length) await tx(['backups'], 'readwrite', (t) => old.forEach((o) => t.objectStore('backups').delete(o.id)));
    return id;
  }
  async function dailyBackup() { const last = (await all('backups')).filter((b) => b.why === 'daily').sort((a, b) => b.at - a.at)[0]; if (!last || Date.now() - last.at > 864e5) await snapshot(''); }

  // ---------- the shared core ----------
  const coreReady = new Promise((res, rej) => {
    if (window.FDCore) return res(window.FDCore);
    const s = document.createElement('script'); s.src = 'core-books.js'; s.onload = () => res(window.FDCore); s.onerror = () => rej(new Error('core-books.js is missing')); document.head.append(s);
  });

  // ---------- API keys (kept on this phone only) ----------
  const KEYS = ['finnhub', 'fmp', 'fred', 'bls', 'eia'];
  let KEYMEM = {}; const keysReady = kvGet('apikeys').then((k) => { KEYMEM = k || {}; }).catch(() => {});

  // ---------- market, economy, price and vehicle data: same shared code and pacing as the PC server ----------
  // In the phone app requests go through Capacitor's native HTTP (several services don't allow in-page requests).
  const http = async (method, url, body, text) => {
    const P = window.Capacitor && window.Capacitor.Plugins, H = P && P.CapacitorHttp;
    if (H) { const r = await H.request({ method, url, headers: body ? { 'Content-Type': 'application/json' } : {}, data: body, responseType: text ? 'text' : 'json', connectTimeout: 10000, readTimeout: 15000 });
      if (r.status >= 400) throw new Error('HTTP ' + r.status); return typeof r.data === 'string' && !text ? JSON.parse(r.data) : r.data; }
    const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) throw new Error('HTTP ' + r.status); return text ? r.text() : r.json();
  };
  const marketReady = new Promise((res, rej) => {
    if (window.FDMarket) return res(window.FDMarket);
    const s = document.createElement('script'); s.src = 'core-market.js'; s.onload = () => res(window.FDMarket); s.onerror = () => rej(new Error('core-market.js is missing')); document.head.append(s);
  }).then(async (M) => { await keysReady; return M.createMarketData({
    getJson: (u) => http('GET', u), getText: (u) => http('GET', u, null, true), postJson: (u, b) => http('POST', u, b),
    keys: () => ({ finnhub: KEYMEM.finnhub || '', fmp: KEYMEM.fmp || '', fred: KEYMEM.fred || '', bls: KEYMEM.bls || '', eia: KEYMEM.eia || '' }),
    keyNote: () => 'Add keys under \u2699 Settings \u2192 Data sources.',
    load: (name) => kvGet('mc-' + name), save: (name, o) => kvSet('mc-' + name, o) }); });
  // ---------- SimpleFIN bank sync: same shared code as the PC server; the connection stays on this phone (not in backups) ----------
  const rawHttp = async (method, url, headers) => {
    const P = window.Capacitor && window.Capacitor.Plugins, H = P && P.CapacitorHttp;
    if (H) { const r = await H.request({ method, url, headers, responseType: 'text', connectTimeout: 15000, readTimeout: 60000 }); return { status: r.status, text: typeof r.data === 'string' ? r.data : JSON.stringify(r.data) }; }
    const r = await fetch(url, { method, headers }); return { status: r.status, text: await r.text() };
  };
  const sfReady = new Promise((res, rej) => {
    if (window.FDSimpleFin) return res(window.FDSimpleFin);
    const s = document.createElement('script'); s.src = 'core-simplefin.js'; s.onload = () => res(window.FDSimpleFin); s.onerror = () => rej(new Error('core-simplefin.js is missing')); document.head.append(s);
  }).then(async (SF) => { const core = await coreReady, api = core.createBookApi(store), parse = (r) => { try { return JSON.parse(r.json); } catch { return {}; } };
    return SF.createSimpleFin({ request: rawHttp, load: async (id) => (await kvGet('sf-' + id)) || null, save: (id, st) => kvSet('sf-' + id, st || null),
      bookData: async (id) => ({ imports: (await store.listDocs(id, 'imports')).map(parse), accounts: (await store.listDocs(id, 'accounts')).map(parse) }),
      addDoc: async (id, coll, doc) => { const b = (await books()).find((x) => x.id === id); if (b) await api.handle('POST', [coll], b, async () => doc, 'SimpleFIN'); } }); });
  setTimeout(() => { sfReady.then(async (sf) => sf.syncAll((await books()).map((b) => b.id))).catch(() => {}); }, 5000);
  const SYM = /^[A-Z0-9.\-^]{1,12}$/;
  const symList = (url, max) => [...new Set(String(url.searchParams.get('s') || '').toUpperCase().split(',').map((x) => x.trim()).filter((x) => SYM.test(x)))].slice(0, max);
  const mask = (v) => (v ? '••••' + String(v).slice(-4) : '');

  // ---------- answer the same /api/... requests the server does ----------
  const json = (status, body, headers) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...(headers || {}) } });
  async function handle(path, opts) {
    const o = opts || {}, method = (o.method || 'GET').toUpperCase(), url = new URL(path, 'https://local.app'), parts = url.pathname.split('/').filter(Boolean);
    const body = async () => { try { return o.body ? JSON.parse(o.body) : {}; } catch (e) { const err = new Error('Bad request'); err.code = 400; throw err; } };
    if (parts[0] !== 'api') return json(404, { error: 'Not found' });
    switch (parts[1]) {
      case 'ping': return json(200, { app: 'household-finances', local: true });
      case 'login': case 'logout': return json(200, { ok: true });
      case 'me': return json(200, { username: 'On this phone', books: (await books()).map(({ id, name, label }) => ({ id, name, label })), local: true });
      case 'keys': {
        const cur = (await kvGet('apikeys')) || {};
        if (method === 'GET') return json(200, { canEdit: true, owner: 'you', set: Object.fromEntries(KEYS.map((k) => [k, mask(cur[k])])), fromEnv: {} });
        const b = await body(); for (const k of KEYS) if (typeof b[k] === 'string') { const v = b[k].trim().replace(/[^\w\-.]/g, '').slice(0, 120); if (v) cur[k] = v; else delete cur[k]; }
        await kvSet('apikeys', cur); KEYMEM = cur; (await marketReady).resetKeys(); return json(200, { ok: true });
      }
      case 'quotes': { const m = await marketReady; return json(200, { sources: m.sources(), quotes: await m.quotes(symList(url, 60)) }); }
      case 'dividends': return json(200, { dividends: await (await marketReady).dividends(symList(url, 40)) });
      case 'stock': { const sym = symList(url, 1)[0]; if (!sym) return json(400, { error: 'symbol?' }); return json(200, await (await marketReady).stock(sym)); }
      case 'screener': { const sp = url.searchParams; return json(200, await (await marketReady).screener({ sector: String(sp.get('sector') || '').slice(0, 40), cap: Number(sp.get('cap')) || 0, yield: Number(sp.get('yield')) || 0, maxPrice: Number(sp.get('maxPrice')) || 0 })); }
      case 'econ': return json(200, await (await marketReady).econ(url.searchParams.get('refresh') === '1'));
      case 'vehicle': try { return json(200, await (await marketReady).vehicle(url.searchParams.get('vin'))); } catch (e) { return json(502, { error: 'Couldn\u2019t reach NHTSA: ' + e.message }); }
      case 'markets': { const m = await marketReady, d = await m.markets(url.searchParams.get('refresh') === '1'), open = m.marketOpen(); return json(200, { ...d, hist: undefined, open, nextRefresh: open ? d.at + 3600e3 : null }); }
      case 'books': {
        const book = (await books()).find((b) => b.id === parts[2]);
        if (!book) return json(403, { error: 'No such budget on this phone' });
        if (parts[3] === 'shares-list') return json(200, []);
        if (parts[3] === 'simplefin') { const r = await (await sfReady).handle(method, parts.slice(4), book.id, body); return json(r.status, r.body); }
        const core = await coreReady, api = core.createBookApi(store);
        const r = await api.handle(method, parts.slice(3), book, body, 'me');
        if (parts[3] === 'data' && r.status === 200) dailyBackup().catch(() => {});
        if (r.headers && r.headers.file) { const bin = atob(r.body.data), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return new Response(new Blob([u8], { type: r.body.mime }), { status: 200, headers: { 'Content-Type': r.body.mime } }); }
        return json(r.status, r.body);
      }
    }
    return json(404, { error: 'Not found' });
  }
  const backend = { name: 'local', fetch: (path, opts) => handle(path, opts).catch((e) => json(e.code || 500, { error: e.message || 'Error' })) };
  if (window.FDStore) window.FDStore.use(backend); else document.addEventListener('DOMContentLoaded', () => window.FDStore && window.FDStore.use(backend));

  // ---------- backup files: save/share a JSON file that also restores on a PC ----------
  async function exportFile(bookId) {
    const core = await coreReady, b = (await books()).find((x) => x.id === bookId) || (await books())[0];
    const data = JSON.stringify(await core.createBookApi(store).exportBook(b), null, 1), name = `${b.id}-${new Date().toISOString().slice(0, 10)}.json`;
    return saveText(name, data, 'application/json', 'Save or send your backup');
  }
  // save a file the phone way (share sheet) or the browser way (download)
  async function saveText(name, data, mime, title) {
    const P = window.Capacitor && window.Capacitor.Plugins;
    if (P && P.Filesystem && P.Share) { // phone app: write to the app's cache folder, then open the share sheet (Drive, email, Files…)
      const w = await P.Filesystem.writeFile({ path: name, data, directory: 'CACHE', encoding: 'utf8' });
      await P.Share.share({ title: name, url: w.uri, dialogTitle: title || 'Save or send' }); return;
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: mime || 'text/plain' })); a.download = name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  // ---------- dashboards on this phone ----------
  const slug = (name) => String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'dashboard';
  async function saveBook({ id, name, shared }) {
    name = String(name || '').trim().slice(0, 40); if (!name) throw new Error('Give the dashboard a name.');
    const list = await books();
    if (id) { const b = list.find((x) => x.id === id); if (!b) throw new Error('Not found'); b.name = name; await tx(['books'], 'readwrite', (t) => { t.objectStore('books').put(b); }); return b; }
    let nid = slug(name), i = 2; while (list.some((x) => x.id === nid)) nid = slug(name) + '-' + i++;
    const b = { id: nid, name, label: shared ? 'Shared' : 'Personal', sort: list.length }; await tx(['books'], 'readwrite', (t) => { t.objectStore('books').put(b); }); return b;
  }
  async function deleteBook(id) {
    const list = await books(); if (list.length < 2) throw new Error('Keep at least one dashboard.');
    await snapshot('before-delete');
    await tx(['books', 'docs', 'files'], 'readwrite', async (t) => { t.objectStore('books').delete(id); for (const n of ['docs', 'files']) { const s2 = t.objectStore(n); (await req2p(s2.getAll())).filter((d) => d.bookId === id).forEach((d) => s2.delete(d.id)); } });
  }

  // ---------- bill reminders: local notifications on this phone (nothing leaves the device) ----------
  const NOTIF = () => window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications;
  async function notifyPermission() { const N = NOTIF(); if (!N) return 'unsupported'; let p = await N.checkPermissions(); if (p.display === 'prompt' || p.display === 'prompt-with-rationale') p = await N.requestPermissions(); return p.display; }
  // bills: [{ name, amount, due (Date) }]; opts: { on, daysBefore, hour }
  async function scheduleBills(bills, opts) {
    const N = NOTIF(); if (!N) return { scheduled: 0, supported: false };
    const pend = await N.getPending(); const mine = (pend.notifications || []).filter((n) => n.id >= 7000 && n.id < 7100);
    if (mine.length) await N.cancel({ notifications: mine.map((n) => ({ id: n.id })) });
    if (!opts || !opts.on) return { scheduled: 0, supported: true };
    if ((await notifyPermission()) !== 'granted') return { scheduled: 0, supported: true, denied: true };
    const now = Date.now(), out = [];
    bills.forEach((b) => { const at = new Date(b.due); at.setDate(at.getDate() - (Number(opts.daysBefore) || 0)); at.setHours(Number(opts.hour) || 9, 0, 0, 0);
      if (at.getTime() > now + 60e3 && out.length < 60) out.push({ id: 7000 + out.length, title: `${b.name} is due ${opts.daysBefore > 0 ? (opts.daysBefore === 1 ? 'tomorrow' : `in ${opts.daysBefore} days`) : 'today'}`, body: `About ${b.amount} · Household Finances`, schedule: { at, allowWhileIdle: true } }); });
    if (out.length) await N.schedule({ notifications: out });
    return { scheduled: out.length, supported: true };
  }
  const markExported = () => kvSet('lastExport', Date.now()).catch(() => {});
  window.FDLocal = { exportFile: async (id) => { await exportFile(id); await markExported(); }, snapshot, backups: async () => (await all('backups')).sort((a, b) => b.at - a.at).map(({ id, at, why }) => ({ id, at, why })),
    saveText, books, saveBook, deleteBook, getKV: kvGet, setKV: kvSet, scheduleBills, notifyPermission, notificationsSupported: () => !!NOTIF() };
  // "Download backup" links point at /api/.../export, which a phone can't open directly: handle them here.
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href*="/api/books/"][href$="/export"]'); if (!a) return;
    e.preventDefault(); const id = decodeURIComponent(a.getAttribute('href').split('/api/books/')[1].split('/')[0]);
    window.FDLocal.exportFile(id).catch((err) => alert('Backup failed: ' + err.message));
  }, true);
})();
