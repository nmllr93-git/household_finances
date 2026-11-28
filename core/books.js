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
//   removeMany(bookId, [{coll,id}], fileIds) → delete those docs and photos in one transaction (undo an import)
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FDCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const MAX_IMPORT_ROWS = 5000; // per statement import; bigger files are refused with a clear message, never trimmed
  const COLLECTIONS = ['imports', 'manual', 'edits', 'rules', 'budgets', 'accounts', 'goals', 'holdings', 'prefs', 'shares', 'receipts'];
  const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']; // receipts: photos, or a PDF (e-receipts, invoices)
  const MAX_FILE = 3 * 1024 * 1024; // bytes after decoding
  const SEED_SETS = ['sheet_history', 'sheet_balances', 'sheet_budgets'];
  const str = (v, n) => String(v ?? '').slice(0, n);
  const num = (v) => (v === null || v === undefined || v === '' || !isFinite(Number(v)) ? null : Number(v));
  const TYPES_OK = ['expense', 'income', 'transfer'];
  const DAY = /^\d{4}-\d{2}-\d{2}$/;
  const sameReceiptEdits = (rows, key, expected) => {
    const sort = (items) => items.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const actual = rows.map((r) => ({ id: r.id, ...JSON.parse(r.json) })).filter((e) => e.txKey === key);
    return JSON.stringify(sort(actual)) === JSON.stringify(sort(expected));
  };
  const RECEIPT_INPUTS = ['imports', 'manual', 'rules', 'prefs'];
  const sameReceiptInputs = (rows, expected) => RECEIPT_INPUTS.every((coll) =>
    Array.isArray(expected[coll]) && JSON.stringify(rows[coll].map((r) => r.id).sort()) === JSON.stringify(expected[coll].slice().sort()));
  const orderTransactionEdit = (rows, doc) => {
    const latest = rows.map((r) => JSON.parse(r.json)).filter((e) => e.txKey === doc.txKey)
      .reduce((n, e) => Math.max(n, Date.parse(e.createdAt) || 0), 0);
    if (Date.parse(doc.createdAt) <= latest) doc.createdAt = new Date(latest + 1).toISOString();
    return doc;
  };
  function cleanRecon(r) { // the statement check saved with an import (see reconcileStatement in calcs.js); a record, never applied to the ledger
    if (!r || typeof r !== 'object' || num(r.opening) === null || num(r.closing) === null) return null;
    return { opening: num(r.opening), closing: num(r.closing), expected: num(r.expected), diff: num(r.diff), from: DAY.test(r.from || '') ? r.from : null, to: DAY.test(r.to || '') ? r.to : null, checkedAt: str(r.checkedAt, 30) };
  }
  // Business marking on an edit or rule: biz = business name ('' = explicitly personal, absent = leave as is),
  // bizPct = business share of the amount (1–100), schedC = IRS Schedule C line code (see SCHED_C in calcs.js).
  function bizOf(d) {
    if (d.biz === undefined || d.biz === null) return {};
    const pct = num(d.bizPct);
    return { biz: str(d.biz, 40), bizPct: pct === null ? 100 : Math.min(100, Math.max(1, Math.round(pct))), schedC: str(d.schedC, 8).replace(/[^0-9a-z]/gi, '') };
  }
  function cleanDoc(coll, d, label) {
    const now = new Date().toISOString();
    if (coll === 'edits') {
      if (d.receiptPatch && typeof d.receiptPatch === 'object') {
        const p = d.receiptPatch, patch = {};
        if (p.category) patch.category = str(p.category, 40);
        if (p.biz) { patch.biz = str(p.biz, 40); patch.bizPct = Math.min(100, Math.max(1, Math.round(num(p.bizPct) || 100))); }
        return { book: label, txKey: str(d.txKey, 80), receiptPatch: patch, createdAt: now };
      }
      const splits = Array.isArray(d.splits) ? d.splits.slice(0, 6).map((s) => ({ category: str(s.category, 40), amount: num(s.amount) })).filter((s) => s.category && s.amount !== null) : null;
      return { book: label, txKey: str(d.txKey, 80), vendor: str(d.vendor, 40), category: str(d.category, 40), type: TYPES_OK.includes(d.type) ? d.type : '',
        oneTime: !!d.oneTime, splits: splits && splits.length >= 2 ? splits : null, ignored: !!d.ignored, tags: Array.isArray(d.tags) ? d.tags.slice(0, 5).map((x) => str(x, 30)).filter(Boolean) : null, ...bizOf(d), ...(d.note != null ? { note: str(d.note, 500) } : {}), createdAt: now };
    }
    if (coll === 'rules') {
      const cc = (arr) => (Array.isArray(arr) ? arr.slice(0, 8).map((c) => ({ field: ['description', 'vendor', 'category', 'type', 'amount'].includes(c && c.field) ? c.field : 'description', op: ['is', 'lt', 'gt', 'gte', 'eq'].includes(c && c.op) ? c.op : 'contains', value: str(c && c.value, 60) })).filter((c) => c.value) : []);
      const groups = Array.isArray(d.groups) ? d.groups.slice(0, 6).map(cc).filter((g) => g.length) : [];
      return { book: label, match: str(d.match, 60), ifVendor: str(d.ifVendor, 40), logic: groups.length > 1 ? 'or' : 'and', conds: cc(d.conds), groups, vendor: str(d.vendor, 40), category: str(d.category, 40), type: TYPES_OK.includes(d.type) ? d.type : '',
        oneTime: !!d.oneTime, ignore: !!d.ignore, tag: str(d.tag, 30), order: num(d.order), ...bizOf(d), createdAt: now };
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
      const review = d.review && typeof d.review === 'object' ? {
        category: !!d.review.category, business: !!d.review.business, split: !!d.review.split,
        previousCategory: str(d.review.previousCategory, 80), previousBusiness: str(d.review.previousBusiness, 40),
        previousBusinessPct: num(d.review.previousBusinessPct)
      } : null;
      return { book: label, txKey: str(d.txKey, 80), fileId: str(d.fileId, 40), name: str(d.name, 80), mime: IMAGE_TYPES.includes(d.mime) ? d.mime : 'image/jpeg', size: Math.max(0, num(d.size) || 0),
        vendor: str(d.vendor, 80), total: num(d.total), tip: num(d.tip), tipIncluded: typeof d.tipIncluded === 'boolean' ? d.tipIncluded : null, date: DAY.test(d.date || '') ? d.date : '',
        category: str(d.category, 40), biz: str(d.biz, 40), bizPct: Math.min(100, Math.max(1, Math.round(num(d.bizPct) || 100))), review, createdAt: now };
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
    // never cut a statement short: too many rows is refused (before anything is saved) with the count, see MAX_IMPORT_ROWS
    if (Array.isArray(d.txns) && d.txns.length > MAX_IMPORT_ROWS) throw Object.assign(new Error(`This statement has ${d.txns.length.toLocaleString('en-US')} transactions; one import can hold up to ${MAX_IMPORT_ROWS.toLocaleString('en-US')}. Download a shorter date range (a year at a time, say) and import each one.`), { status: 413, rows: d.txns.length });
    const txns = Array.isArray(d.txns) ? d.txns.map((t) => ({ date: str(t.date, 10), description: str(t.description, 120), amount: num(t.amount), ...(t && t.id ? { id: str(t.id, 80) } : {}), ...(t && t.category ? { category: str(t.category, 40) } : {}), ...(t && Array.isArray(t.tags) && t.tags.length ? { tags: t.tags.slice(0, 5).map((x) => str(x, 30)).filter(Boolean) } : {}), ...(t && t.note ? { note: str(t.note, 200) } : {}) })) : []; // id: the bank's own transaction id, when the file or sync has one
    return { book: label, accountKind: ['deposit', 'credit', 'investment', 'mortgage', 'loan'].includes(d.accountKind) ? d.accountKind : 'deposit',
      accountName: str(d.accountName, 60), owner: str(d.owner, 30), fileName: str(d.fileName, 80), importedAt: new Date().toISOString(),
      rowCount: txns.length, dateFrom: str(d.dateFrom, 10), dateTo: str(d.dateTo, 10), balance: num(d.balance), balanceMonth: str(d.balanceMonth, 7), asOf: str(d.asOf, 10), accountType: str(d.accountType, 20), txns,
      source: (['csv', 'ofx', 'pdf', 'sync', 'manual'].includes(d.source) || /^app:(mint|monarch|ynab|empower)$/.test(d.source)) ? d.source : '', fileRows: num(d.fileRows), skipped: num(d.skipped), reconcile: cleanRecon(d.reconcile) };
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
    async function restore(book, body, user) { return stageRestore(book, body, user, false); }
    // Check a backup without changing anything: the same staging as a restore, then stop. Used by Backup health.
    async function verify(book, body, user) { return stageRestore(book, body, user, true); }
    async function stageRestore(book, body, user, dryRun) {
      if (!body || typeof body.docs !== 'object' || !body.docs) return reply(400, { error: 'That doesn\u2019t look like a backup file from this app.' });
      const now = new Date().toISOString(), idMap = new Map(), staged = [];
      for (const [c, list] of Object.entries(body.docs)) {
        if (!COLLECTIONS.includes(c) || !Array.isArray(list)) continue;
        for (const d of list) { const { id, created, createdBy, ...rest } = d || {}; let doc; try { doc = cleanDoc(c, rest, book.label); } catch (e) { if (e.status) return reply(400, { error: 'This backup can\u2019t be restored as it is: ' + e.message }); throw e; } if (rest.createdAt) doc.createdAt = String(rest.createdAt).slice(0, 40);
          if (c === 'imports' && rest.importedAt && !isNaN(Date.parse(rest.importedAt))) doc.importedAt = String(rest.importedAt).slice(0, 30); // import history keeps when it really happened
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
      if (dryRun) { const counts = {}; for (const x of staged) counts[x.c] = (counts[x.c] || 0) + 1;
        const declared = Object.values(body.docs).reduce((n, l) => n + (Array.isArray(l) ? l.length : 0), 0);
        return reply(200, { ok: unresolved === 0 && missingPhotos === 0 && rows.length === declared, documents: rows.length, declared, counts, photos: files ? files.length : null, photosDeclared: hasFiles ? body.files.length : null,
          unresolved, missingPhotos, legacy: !hasFiles, exportedAt: str(body.exportedAt, 30), book: body.book && body.book.name ? str(body.book.name, 60) : '', checkedAt: now }); }
      let safety = '';
      if (store.backup) { try { safety = await store.backup(); } catch (e) { return reply(500, { error: 'Restore stopped before changing anything: the safety copy of your current data couldn\u2019t be made. ' + e.message }); } }
      try {
        if (store.replaceBook) await store.replaceBook(book.id, rows, files); // documents and photos together; files null = keep the current photos
        else { await store.replaceBookDocs(book.id, rows); if (files && store.replaceBookFiles) await store.replaceBookFiles(book.id, files); }
      } catch (e) { return reply(500, { error: 'Restore failed; nothing was changed. ' + e.message }); }
      return reply(200, { ok: true, restored: rows.length, photos: files ? files.length : null, unresolved, missingPhotos, legacy: !hasFiles,
        safetyBackup: safety ? String(safety).split(/[\\/]/).pop() : '' });
    }
    // Undo an import: the statement, plus the edits and receipts on its transactions only when the request lists them
    // (the app shows them first and asks). One transaction (store.removeMany), so it's all or nothing.
    async function undoImport(book, body) {
      const id = str(body && body.importId, 40); if (!id) return reply(400, { error: 'Which import?' });
      const imps = (await store.listDocs(book.id, 'imports')).map(parse); const batch = imps.find((x) => x.id === id);
      if (!batch) return reply(404, { error: 'That import isn\u2019t in this dashboard any more.' });
      const pre = `i:${id}:`, deps = async (c) => (await store.listDocs(book.id, c)).map(parse).filter((x) => String(x.txKey || '').startsWith(pre));
      const edits = await deps('edits'), receipts = await deps('receipts');
      const want = (k) => new Set(Array.isArray(body[k]) ? body[k].map((x) => String(x)) : []);
      const wE = want('edits'), wR = want('receipts');
      if ([...wE].some((x) => !edits.some((e) => e.id === x)) || [...wR].some((x) => !receipts.some((r) => r.id === x))) return reply(409, { error: 'The list of edits and receipts changed since you looked. Open Undo again to see the current list.' });
      const docs = [{ coll: 'imports', id }, ...edits.filter((e) => wE.has(e.id)).map((e) => ({ coll: 'edits', id: e.id })), ...receipts.filter((r) => wR.has(r.id)).map((r) => ({ coll: 'receipts', id: r.id }))];
      const fileIds = receipts.filter((r) => wR.has(r.id) && r.fileId).map((r) => r.fileId);
      try { await store.removeMany(book.id, docs, fileIds); } catch (e) { return reply(500, { error: 'Undo failed; nothing was changed. ' + e.message }); }
      return reply(200, { ok: true, removed: { imports: 1, edits: wE.size, receipts: wR.size, photos: fileIds.length }, keptEdits: edits.length - wE.size, keptReceipts: receipts.length - wR.size, rows: (batch.txns || []).length });
    }
    async function addDoc(book, coll, body, user) {
      let doc; try { doc = cleanDoc(coll, body || {}, book.label); } catch (e) { if (e.status) return reply(e.status, { error: e.message, rows: e.rows, maxRows: MAX_IMPORT_ROWS }); throw e; }
      const json = JSON.stringify(doc);
      if (json.length > (coll === 'imports' ? 1500000 : 400000)) return reply(413, { error: coll === 'imports' ? 'This statement is too large to save in one go. Download a shorter date range and import each one.' : 'Too large' });
      const id = store.newId();
      await store.insertDoc({ id, bookId: book.id, coll, json, created: new Date().toISOString(), createdBy: user });
      return reply(201, { id });
    }
    async function updateReceipt(book, id, body, user) {
      if (!body || !body.expected || typeof body.expected !== 'object' || (!body.discard && (!body.changes || typeof body.changes !== 'object'))) return reply(400, { error: 'Receipt and changes are required.' });
      const current = (await store.listDocs(book.id, 'receipts')).find((r) => r.id === id);
      if (!current) return reply(404, { error: 'This receipt no longer exists.' });
      const old = JSON.parse(current.json), { id: expectedId, ...expected } = body.expected;
      if (expectedId !== id || JSON.stringify(old) !== JSON.stringify(expected)) return reply(409, { error: 'This receipt changed. Refresh and try again.' });
      if (body.discard) {
        if (old.txKey) return reply(409, { error: 'This receipt is already attached.' });
        if (!await store.discardReceipt(book.id, id, current.json, old.fileId)) return reply(409, { error: 'This receipt changed. Refresh and try again.' });
        return reply(200, { ok: true });
      }
      const changes = body.changes;
      const next = cleanDoc('receipts', { ...old, ...Object.fromEntries(['txKey', 'vendor', 'total', 'tip', 'tipIncluded', 'date', 'category', 'biz', 'bizPct', 'review'].filter((k) => Object.prototype.hasOwnProperty.call(changes, k)).map((k) => [k, changes[k]])) }, book.label);
      next.createdAt = old.createdAt;
      if (body.attachment) {
        const a = body.attachment;
        const moving = !!old.txKey;
        if (!next.txKey || next.txKey === old.txKey || (moving && (a.fromKey !== old.txKey || !Array.isArray(a.sourceEdits))) || !Array.isArray(a.expectedEdits) || !a.expectedInputs || typeof a.expectedInputs !== 'object' || !store.attachReceipt) return reply(400, { error: 'Invalid receipt attachment.' });
        const patch = {};
        if (next.category && !a.preserveSplit && (!moving || a.applyCategory)) patch.category = next.category;
        if (next.biz && (!moving || a.applyBusiness)) { patch.biz = next.biz; patch.bizPct = next.bizPct; }
        let edit = null;
        if (Object.keys(patch).length) {
          const doc = cleanDoc('edits', { txKey: next.txKey, receiptPatch: patch }, book.label);
          orderTransactionEdit(a.expectedEdits.map((e) => ({ json: JSON.stringify(e) })), doc);
          edit = { id: store.newId(), bookId: book.id, coll: 'edits', json: JSON.stringify(doc), created: doc.createdAt, createdBy: user };
        }
        if (!await store.attachReceipt(book.id, id, current.json, JSON.stringify(next), next.txKey, a.expectedEdits, a.expectedInputs, edit, moving ? { key: old.txKey, edits: a.sourceEdits } : null)) return reply(409, { error: 'The receipt or transaction changed. Refresh and try again.' });
        return reply(200, { ok: true });
      }
      if (!await store.compareAndSetDoc(book.id, 'receipts', id, current.json, JSON.stringify(next))) return reply(409, { error: 'This receipt changed. Refresh and try again.' });
      return reply(200, { ok: true });
    }
    // Route a request below /api/books/<id>/ : rest = ['data'] | ['export'] | ['restore'] | ['shares-list'] | [coll] | [coll, docId]
    // getBody() reads the JSON body only when needed (so a large restore can use its own size limit).
    async function handle(method, rest, book, getBody, user) {
      const [a, b] = rest;
      if (a === 'shares-list' && method === 'GET') return reply(200, (await store.listDocs(book.id, 'shares')).map(parse));
      if (a === 'data' && method === 'GET') return reply(200, await data(book.id));
      if (a === 'export' && method === 'GET') return reply(200, await exportBook(book), { download: `${book.id}-${new Date().toISOString().slice(0, 10)}.json` });
      if (a === 'restore' && method === 'POST') return restore(book, await getBody(60 * 1024 * 1024), user);
      if (a === 'verify-backup' && method === 'POST') return verify(book, await getBody(60 * 1024 * 1024), user);
      if (a === 'undo-import' && method === 'POST' && store.removeMany) return undoImport(book, await getBody());
      if (a === 'receipts' && b && method === 'POST' && store.compareAndSetDoc) return updateReceipt(book, b, await getBody(), user);
      if (a === 'files' && store.putFile) {
        if (method === 'POST' && !b) { const f = await getBody(5 * 1024 * 1024); const mime = String(f && f.mime || ''), data = String(f && f.data || '').replace(/^data:[^,]*,/, '');
          if (!IMAGE_TYPES.includes(mime)) return reply(400, { error: 'Receipts must be a photo (JPEG, PNG or WebP) or a PDF.' });
          if (!/^[A-Za-z0-9+/=]+$/.test(data) || data.length * 0.75 > MAX_FILE) return reply(413, { error: 'That file is too large (3 MB max).' });
          const id = store.newId(); await store.putFile({ id, bookId: book.id, mime, data, created: new Date().toISOString(), createdBy: user }); return reply(201, { id }); }
        if (method === 'GET' && b) { const f = await store.getFile(book.id, b); return f ? reply(200, f, { file: true }) : reply(404, { error: 'Not found' }); }
        if (method === 'DELETE' && b) { await store.deleteFile(book.id, b); return reply(200, { ok: true }); }
      }
      if (COLLECTIONS.includes(a) && method === 'POST' && !b) return addDoc(book, a, await getBody(), user);
      if (COLLECTIONS.includes(a) && method === 'DELETE' && b) { await store.deleteDoc(book.id, a, b); return reply(200, { ok: true }); }
      return reply(404, { error: 'Not found' });
    }
    return { data, exportBook, restore, verify, undoImport, addDoc, handle };
  }

  return { COLLECTIONS, SEED_SETS, RECEIPT_INPUTS, MAX_IMPORT_ROWS, cleanDoc, sameReceiptEdits, sameReceiptInputs, orderTransactionEdit, createBookApi };
});
