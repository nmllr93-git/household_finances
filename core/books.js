// Larenest shared core: the dashboard data rules used by BOTH the PC server (server.js)
// and the phone's on-device mode. No Node or browser APIs here: storage is passed in.
//
//   const core = require('./core/books.js')        // Node
//   window.FDCore                                  // browser / phone app (load core/books.js with a <script>)
//
// Storage interface (each method may return a value or a Promise):
//   seedRows(bookId)                     → [{ dataset, json }]
//   listDocs(bookId, coll)               → [{ id, json, created, created_by }]  (oldest first)
//   insertDoc({ id, bookId, coll, json, created, createdBy })
//   deleteDoc(bookId, coll, id)
//   replaceBookDocs(bookId, rows)        → atomically delete all of the book's docs and insert rows (same shape as insertDoc)
//   newId()                              → short random id
//   backup()                             → optional; returns a name/path of a full safety copy (taken before restore)
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FDCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const COLLECTIONS = ['imports', 'manual', 'edits', 'rules', 'budgets', 'accounts', 'goals', 'holdings', 'prefs', 'shares', 'receipts'];
  const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const MAX_FILE = 3 * 1024 * 1024; // bytes after decoding
  const SEED_SETS = ['sheet_history', 'sheet_balances', 'sheet_budgets'];
  const str = (v, n) => String(v ?? '').slice(0, n);
  const num = (v) => (v === null || v === undefined || v === '' || !isFinite(Number(v)) ? null : Number(v));
  const TYPES_OK = ['expense', 'income', 'transfer'];
  function cleanDoc(coll, d, label) {
    const now = new Date().toISOString();
    if (coll === 'edits') {
      const splits = Array.isArray(d.splits) ? d.splits.slice(0, 6).map((s) => ({ category: str(s.category, 40), amount: num(s.amount) })).filter((s) => s.category && s.amount !== null) : null;
      return { book: label, txKey: str(d.txKey, 80), vendor: str(d.vendor, 40), category: str(d.category, 40), type: TYPES_OK.includes(d.type) ? d.type : '',
        oneTime: !!d.oneTime, splits: splits && splits.length >= 2 ? splits : null, ignored: !!d.ignored, tags: Array.isArray(d.tags) ? d.tags.slice(0, 5).map((x) => str(x, 30)).filter(Boolean) : null, createdAt: now };
    }
    if (coll === 'rules') {
      const cc = (arr) => (Array.isArray(arr) ? arr.slice(0, 8).map((c) => ({ field: ['description', 'vendor', 'category', 'type', 'amount'].includes(c && c.field) ? c.field : 'description', op: ['is', 'lt', 'gt', 'gte', 'eq'].includes(c && c.op) ? c.op : 'contains', value: str(c && c.value, 60) })).filter((c) => c.value) : []);
      const groups = Array.isArray(d.groups) ? d.groups.slice(0, 6).map(cc).filter((g) => g.length) : [];
      return { book: label, match: str(d.match, 60), ifVendor: str(d.ifVendor, 40), logic: groups.length > 1 ? 'or' : 'and', conds: cc(d.conds), groups, vendor: str(d.vendor, 40), category: str(d.category, 40), type: TYPES_OK.includes(d.type) ? d.type : '',
        oneTime: !!d.oneTime, ignore: !!d.ignore, tag: str(d.tag, 30), order: num(d.order), createdAt: now };
    }
    if (coll === 'accounts') {
      const KINDS = ['deposit', 'credit', 'investment', 'mortgage', 'loan'];
      return { book: label, shareTo: Array.isArray(d.shareTo) ? d.shareTo.slice(0, 6).map((x) => str(x, 40)).filter(Boolean) : [], shareHist: !!d.shareHist, name: str(d.name, 60), match: str(d.match || d.name, 60), kind: KINDS.includes(d.kind) ? d.kind : 'deposit', type: str(d.type, 20),
        rate: num(d.rate), owner: str(d.owner, 30), note: str(d.note, 120), rateEnds: str(d.rateEnds, 10), aliases: Array.isArray(d.aliases) ? d.aliases.slice(0, 10).map((x) => str(x, 60)).filter(Boolean) : [], limit: num(d.limit), removed: !!d.removed, payment: num(d.payment), escrow: num(d.escrow), extra: num(d.extra), active: d.active !== false, createdAt: now };
    }
    if (coll === 'shares') {
      const hist = Array.isArray(d.history) ? d.history.slice(-72).filter((x) => Array.isArray(x) && /^\d{4}-\d{2}$/.test(x[0]) && isFinite(Number(x[1]))).map((x) => [x[0], Math.round(Number(x[1]) * 100) / 100]) : null;
      return { book: label, src: str(d.src, 40), srcLabel: str(d.srcLabel, 40), key: str(d.key, 140), owner: str(d.owner, 30), name: str(d.name, 60),
        kind: ['deposit', 'investment', 'credit', 'mortgage', 'loan', 'asset'].includes(d.kind) ? d.kind : 'deposit', type: str(d.type, 20), balance: num(d.balance) || 0, asOf: str(d.asOf, 10), history: hist && hist.length ? hist : null, createdAt: now };
    }
    if (coll === 'prefs') {
      return { book: label, key: str(d.key, 30).replace(/[^a-z0-9_-]/gi, ''), value: String(d.value == null ? '' : d.value).slice(0, 60000), createdAt: now };
    }
    if (coll === 'holdings') {
      const lot = (x) => ({ date: /^\d{4}-\d{2}-\d{2}$/.test(x && x.date || '') ? x.date : '', qty: Math.max(0, num(x && x.qty) || 0), price: Math.max(0, num(x && x.price) || 0) });
      const lots = (a) => (Array.isArray(a) ? a.slice(0, 200).map(lot).filter((x) => x.qty > 0) : []);
      return { book: label, symbol: str(d.symbol, 12).toUpperCase().replace(/[^A-Z0-9.\-^]/g, ''), name: str(d.name, 60), account: str(d.account, 60),
        kind: ['stock', 'etf', 'fund', 'crypto', 'bond', 'other'].includes(d.kind) ? d.kind : 'stock', sector: str(d.sector, 40),
        lots: lots(d.lots), sales: lots(d.sales), divs: Array.isArray(d.divs) ? d.divs.slice(0, 400).map((x) => ({ date: /^\d{4}-\d{2}-\d{2}$/.test(x && x.date || '') ? x.date : '', amount: Math.max(0, num(x && x.amount) || 0) })).filter((x) => x.amount > 0) : [], manualPrice: num(d.manualPrice), manualAsOf: str(d.manualAsOf, 10), createdAt: now };
    }
    if (coll === 'receipts') {
      return { book: label, txKey: str(d.txKey, 80), fileId: str(d.fileId, 40), name: str(d.name, 80), mime: IMAGE_TYPES.includes(d.mime) ? d.mime : 'image/jpeg', size: Math.max(0, num(d.size) || 0), createdAt: now };
    }
    if (coll === 'goals') {
      return { book: label, name: str(d.name, 60), target: num(d.target), by: str(d.by, 10), account: str(d.account, 60), saved: num(d.saved), createdAt: now };
    }
    if (coll === 'budgets') {
      return { book: label, category: str(d.category, 40), amount: Math.max(0, num(d.amount) || 0), from: /^\d{4}-\d{2}$/.test(d.from || '') ? d.from : now.slice(0, 7),
        rollover: !!d.rollover, createdAt: now };
    }
    if (coll === 'manual') {
      return { book: label, type: d.type === 'income' ? 'income' : 'expense', date: str(d.date, 10), amount: num(d.amount),
        vendor: str(d.vendor, 40), category: str(d.category, 40), note: str(d.note, 120), createdAt: new Date().toISOString() };
    }
    const txns = Array.isArray(d.txns) ? d.txns.slice(0, 2500).map((t) => ({ date: str(t.date, 10), description: str(t.description, 120), amount: num(t.amount) })) : [];
    return { book: label, accountKind: ['deposit', 'credit', 'investment', 'mortgage', 'loan'].includes(d.accountKind) ? d.accountKind : 'deposit',
      accountName: str(d.accountName, 60), owner: str(d.owner, 30), fileName: str(d.fileName, 80), importedAt: new Date().toISOString(),
      rowCount: txns.length, dateFrom: str(d.dateFrom, 10), dateTo: str(d.dateTo, 10), balance: num(d.balance), balanceMonth: str(d.balanceMonth, 7), asOf: str(d.asOf, 10), accountType: str(d.accountType, 20), txns };
  }

  const parse = (r) => { let j = {}; try { j = JSON.parse(r.json); } catch (e) {} return { id: r.id, ...j }; };
  const reply = (status, body, headers) => ({ status, body, headers });

  function createBookApi(store) {
    async function data(bookId) {
      const out = {};
      for (const r of await store.seedRows(bookId)) { try { out[r.dataset] = JSON.parse(r.json); } catch (e) { out[r.dataset] = []; } }
      for (const s of SEED_SETS) if (!out[s]) out[s] = [];
      for (const c of COLLECTIONS) out[c] = (await store.listDocs(bookId, c)).map(parse);
      return out;
    }
    async function exportBook(book) {
      const out = { book, exportedAt: new Date().toISOString(), seed: {}, docs: {} };
      for (const r of await store.seedRows(book.id)) { try { out.seed[r.dataset] = JSON.parse(r.json); } catch (e) {} }
      for (const c of COLLECTIONS) out.docs[c] = (await store.listDocs(book.id, c)).map((r) => ({ id: r.id, created: r.created, createdBy: r.created_by, ...parse(r) }));
      if (store.listFiles) out.files = await store.listFiles(book.id); // receipt photos: [{ id, mime, data (base64) }]
      return out;
    }
    // Restore a backup into a book, all or nothing.
    //  1. Check and prepare everything first: new ids for every document and photo, and an old→new map.
    //  2. Rewrite what points at those ids: edits and receipts refer to transactions by key ("i:<import id>:<row>",
    //     "m:<manual id>") and receipts to their photo ("fileId"), so they keep working after the ids change.
    //  3. A safety copy of the current data (photos included) must succeed first, or nothing is touched.
    //  4. Replace documents and photos together in one transaction (store.replaceBook), so a failure changes nothing.
    // Backups without a "files" list (older ones) keep this book's existing photos where receipts still match them.
    async function restore(book, body, user) {
      if (!body || typeof body.docs !== 'object' || !body.docs) return reply(400, { error: 'That doesn\u2019t look like a backup file from this app.' });
      const now = new Date().toISOString(), idMap = new Map(), staged = [];
      for (const [c, list] of Object.entries(body.docs)) {
        if (!COLLECTIONS.includes(c) || !Array.isArray(list)) continue;
        for (const d of list) { const { id, created, createdBy, ...rest } = d || {}; const doc = cleanDoc(c, rest, book.label); if (rest.createdAt) doc.createdAt = String(rest.createdAt).slice(0, 40);
          const nid = store.newId(); if (id) idMap.set(c + ':' + String(id), nid);
          staged.push({ c, nid, doc, created: created || now, createdBy: createdBy || user }); }
      }
      // photos: new ids (a backup may be restored into another dashboard on the same computer, where the old ids are taken)
      const hasFiles = Array.isArray(body.files), fileMap = new Map();
      const files = hasFiles ? body.files.filter((f) => f && typeof f.id === 'string' && IMAGE_TYPES.includes(f.mime) && typeof f.data === 'string')
        .map((f) => { const nid = store.newId(); fileMap.set(f.id.slice(0, 40), nid); return { id: nid, mime: f.mime, data: f.data }; }) : null;
      const keepIds = !hasFiles && store.listFiles ? new Set((await store.listFiles(book.id)).map((f) => f.id)) : null;
      let unresolved = 0, missingPhotos = 0;
      const remapKey = (k) => { k = String(k || ''); let m = k.match(/^i:(.+):(\d+)$/); if (m) { const n = idMap.get('imports:' + m[1]); if (n) return `i:${n}:${m[2]}`; unresolved++; return k; }
        m = k.match(/^m:(.+)$/); if (m) { const n = idMap.get('manual:' + m[1]); if (n) return `m:${n}`; unresolved++; return k; } return k; }; // other key kinds (sheet rows) don't change
      for (const x of staged) {
        if ((x.c === 'edits' || x.c === 'receipts') && x.doc.txKey) x.doc.txKey = remapKey(x.doc.txKey);
        if (x.c === 'receipts' && x.doc.fileId) { if (hasFiles) { const n = fileMap.get(x.doc.fileId); if (n) x.doc.fileId = n; else missingPhotos++; } else if (!keepIds.has(x.doc.fileId)) missingPhotos++; }
      }
      const rows = staged.map((x) => ({ id: x.nid, bookId: book.id, coll: x.c, json: JSON.stringify(x.doc), created: x.created, createdBy: x.createdBy }));
      let safety = '';
      if (store.backup) { try { safety = await store.backup(); } catch (e) { return reply(500, { error: 'Restore stopped before changing anything: the safety copy of your current data couldn\u2019t be made. ' + e.message }); } }
      try {
        if (store.replaceBook) await store.replaceBook(book.id, rows, files); // documents and photos together; files null = keep the current photos
        else { await store.replaceBookDocs(book.id, rows); if (files && store.replaceBookFiles) await store.replaceBookFiles(book.id, files); }
      } catch (e) { return reply(500, { error: 'Restore failed; nothing was changed. ' + e.message }); }
      return reply(200, { ok: true, restored: rows.length, photos: files ? files.length : null, unresolved, missingPhotos, legacy: !hasFiles,
        safetyBackup: safety ? String(safety).split(/[\\/]/).pop() : '' });
    }
    async function addDoc(book, coll, body, user) {
      const json = JSON.stringify(cleanDoc(coll, body || {}, book.label));
      if (json.length > 400000) return reply(413, { error: 'Too large' });
      const id = store.newId();
      await store.insertDoc({ id, bookId: book.id, coll, json, created: new Date().toISOString(), createdBy: user });
      return reply(201, { id });
    }
    // Route a request below /api/books/<id>/ : rest = ['data'] | ['export'] | ['restore'] | ['shares-list'] | [coll] | [coll, docId]
    // getBody() reads the JSON body only when needed (so a large restore can use its own size limit).
    async function handle(method, rest, book, getBody, user) {
      const [a, b] = rest;
      if (a === 'shares-list' && method === 'GET') return reply(200, (await store.listDocs(book.id, 'shares')).map(parse));
      if (a === 'data' && method === 'GET') return reply(200, await data(book.id));
      if (a === 'export' && method === 'GET') return reply(200, await exportBook(book), { download: `${book.id}-${new Date().toISOString().slice(0, 10)}.json` });
      if (a === 'restore' && method === 'POST') return restore(book, await getBody(60 * 1024 * 1024), user);
      if (a === 'files' && store.putFile) {
        if (method === 'POST' && !b) { const f = await getBody(5 * 1024 * 1024); const mime = String(f && f.mime || ''), data = String(f && f.data || '').replace(/^data:[^,]*,/, '');
          if (!IMAGE_TYPES.includes(mime)) return reply(400, { error: 'Receipts must be a JPEG, PNG or WebP photo.' });
          if (!/^[A-Za-z0-9+/=]+$/.test(data) || data.length * 0.75 > MAX_FILE) return reply(413, { error: 'That photo is too large (3 MB max).' });
          const id = store.newId(); await store.putFile({ id, bookId: book.id, mime, data, created: new Date().toISOString(), createdBy: user }); return reply(201, { id }); }
        if (method === 'GET' && b) { const f = await store.getFile(book.id, b); return f ? reply(200, f, { file: true }) : reply(404, { error: 'Not found' }); }
        if (method === 'DELETE' && b) { await store.deleteFile(book.id, b); return reply(200, { ok: true }); }
      }
      if (COLLECTIONS.includes(a) && method === 'POST' && !b) return addDoc(book, a, await getBody(), user);
      if (COLLECTIONS.includes(a) && method === 'DELETE' && b) { await store.deleteDoc(book.id, a, b); return reply(200, { ok: true }); }
      return reply(404, { error: 'Not found' });
    }
    return { data, exportBook, restore, addDoc, handle };
  }

  return { COLLECTIONS, SEED_SETS, cleanDoc, createBookApi };
});
