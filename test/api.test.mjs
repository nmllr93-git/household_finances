// End-to-end tests of the server's data API: sign-in, loading, saving, deleting, export/restore and access rules.
// They pin down today's behaviour so the shared core (used by the PC server and the phone) can't change it by accident.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';

const require = createRequire(import.meta.url);
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'fd-api-'));
process.env.DATA_DIR = DIR;
const srv = require('../server.js');
let base = '', cookieA = '', cookieB = '', cookieC = '';
const books = () => srv.books().map((b) => b.id);

async function req(method, p, body, cookie = cookieA) {
  const r = await fetch(base + p, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
  return { status: r.status, json: j, headers: r.headers };
}
async function login(u, pw) { const r = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: pw }) }); return { status: r.status, cookie: (r.headers.get('set-cookie') || '').split(';')[0] }; }

before(async () => {
  const [b1, b2] = books();
  srv.addUser('alice', 'password123', [b1, b2]);
  srv.addUser('bob', 'password456', [b2]);
  srv.addUser('carol', 'password789', [b2 + ':view']);
  const i = await srv.start({ mode: 'local', port: 0, quiet: true });
  base = `http://127.0.0.1:${i.port}`;
  cookieA = (await login('alice', 'password123')).cookie; cookieB = (await login('bob', 'password456')).cookie; cookieC = (await login('carol', 'password789')).cookie;
});
after(async () => { await srv.stop(); try { fs.rmSync(DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {} });

test('ping needs no login', async () => { const r = await req('GET', '/api/ping', null, ''); assert.equal(r.status, 200); assert.equal(r.json.app, 'household-finances'); });
test('wrong password is refused', async () => { assert.equal((await login('alice', 'nope')).status, 401); });
test('data needs a session', async () => { assert.equal((await req('GET', `/api/books/${books()[0]}/data`, null, '')).status, 401); });
test('me lists only allowed books', async () => { const r = await req('GET', '/api/me', null, cookieB); assert.deepEqual(r.json.books.map((b) => b.id), [books()[1]]); });
test('no access to another person\'s book', async () => { assert.equal((await req('GET', `/api/books/${books()[0]}/data`, null, cookieB)).status, 403); });

test('data has every collection and the seed datasets', async () => {
  const r = await req('GET', `/api/books/${books()[0]}/data`);
  assert.equal(r.status, 200);
  for (const c of ['imports', 'manual', 'edits', 'rules', 'budgets', 'accounts', 'goals', 'holdings', 'prefs', 'shares']) assert.ok(Array.isArray(r.json[c]), c);
  for (const s of ['sheet_history', 'sheet_balances', 'sheet_budgets']) assert.ok(Array.isArray(r.json[s]), s);
});

test('save, load and delete a document (validated)', async () => {
  const b = books()[0];
  const add = await req('POST', `/api/books/${b}/budgets`, { category: 'Groceries', amount: -5, from: 'bad', rollover: 1, extra: 'ignored' });
  assert.equal(add.status, 201); assert.ok(add.json.id);
  let d = (await req('GET', `/api/books/${b}/data`)).json.budgets.find((x) => x.id === add.json.id);
  assert.equal(d.category, 'Groceries'); assert.equal(d.amount, 0); assert.match(d.from, /^\d{4}-\d{2}$/); assert.equal(d.rollover, true); assert.equal(d.extra, undefined);
  assert.equal((await req('DELETE', `/api/books/${b}/budgets/${add.json.id}`)).status, 200);
  d = (await req('GET', `/api/books/${b}/data`)).json.budgets.find((x) => x.id === add.json.id);
  assert.equal(d, undefined);
});

test('prefs and holdings keep their shapes', async () => {
  const b = books()[0];
  await req('POST', `/api/books/${b}/prefs`, { key: 'planExtra', value: '250' });
  await req('POST', `/api/books/${b}/holdings`, { symbol: 'vti!', kind: 'etf', lots: [{ date: '2026-01-02', qty: 3, price: 200 }, { qty: 0 }] });
  const j = (await req('GET', `/api/books/${b}/data`)).json;
  assert.ok(j.prefs.some((p) => p.key === 'planExtra'));
  const h = j.holdings.find((x) => x.symbol === 'VTI'); assert.ok(h); assert.equal(h.lots.length, 1); assert.equal(h.kind, 'etf');
});

test('unknown collection is 404', async () => { assert.equal((await req('POST', `/api/books/${books()[0]}/bogus`, {})).status, 404); });

test('export then restore round-trips a book', async () => {
  const b = books()[0];
  await req('POST', `/api/books/${b}/rules`, { match: 'COFFEE', category: 'Dining' });
  const ex = await req('GET', `/api/books/${b}/export`);
  assert.equal(ex.status, 200); assert.ok(ex.json.docs.rules.some((r) => r.match === 'COFFEE'));
  await req('POST', `/api/books/${b}/rules`, { match: 'TEMP', category: 'X' });
  const rs = await req('POST', `/api/books/${b}/restore`, ex.json);
  assert.equal(rs.status, 200); assert.ok(rs.json.restored >= 1);
  const j = (await req('GET', `/api/books/${b}/data`)).json;
  assert.ok(j.rules.some((r) => r.match === 'COFFEE')); assert.ok(!j.rules.some((r) => r.match === 'TEMP'));
});

test('restore rejects a non-backup file', async () => { assert.equal((await req('POST', `/api/books/${books()[0]}/restore`, { hello: 1 })).status, 400); });

test('shares are listed for the target book', async () => {
  const b = books()[1];
  const a = await req('POST', `/api/books/${b}/shares`, { key: 'x|acct|visa', name: 'Visa', kind: 'credit', balance: 100 });
  assert.equal(a.status, 201);
  const l = await req('GET', `/api/books/${b}/shares-list`); assert.ok(l.json.some((x) => x.id === a.json.id));
});

test('weekly email: only the owner sets the mail account; a user can send themselves a test', async () => {
  const net = await import('node:net'); const got = [];
  const smtp = net.createServer((s) => { let data = false, buf = ''; s.write('220 x\r\n'); s.on('data', (d) => { buf += d.toString(); if (data) { if (buf.includes('\r\n.\r\n')) { got.push(buf); data = false; buf = ''; s.write('250 ok\r\n'); } return; }
    let k; while ((k = buf.indexOf('\r\n')) >= 0) { const l = buf.slice(0, k); buf = buf.slice(k + 2); if (/^EHLO/.test(l)) s.write('250 x\r\n'); else if (/^DATA/.test(l)) { data = true; s.write('354 go\r\n'); } else if (/^QUIT/.test(l)) { s.end(); } else s.write('250 ok\r\n'); } }); });
  await new Promise((r) => smtp.listen(0, '127.0.0.1', r));
  const b = books()[0];
  await req('POST', `/api/books/${b}/imports`, { accountKind: 'credit', accountName: 'Visa', txns: [{ date: new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10), description: 'GROCERY', amount: 40 }] });
  assert.equal((await req('POST', '/api/digest', { smtp: { host: '127.0.0.1', port: smtp.address().port } }, cookieB)).status, 403);
  assert.equal((await req('POST', '/api/digest', { smtp: { host: '127.0.0.1', port: smtp.address().port, from: 'hf@example.com' } })).status, 200);
  assert.equal((await req('POST', '/api/digest', { me: { email: 'not-an-email' } })).status, 400);
  assert.equal((await req('POST', '/api/digest', { me: { email: 'alice@example.com', on: true, day: 1, hour: 7 } })).status, 200);
  const g = await req('GET', '/api/digest'); assert.equal(g.json.me.email, 'alice@example.com'); assert.equal(g.json.canEditSmtp, true); assert.equal(g.json.smtp.passSet, false);
  const t = await req('POST', '/api/digest/test'); assert.equal(t.status, 200, JSON.stringify(t.json));
  assert.equal(got.length, 1); assert.match(got[0], /To: alice@example.com/);
  smtp.close();
});

test('view-only login can read but not change a dashboard', async () => {
  const b = books()[1];
  const me = await req('GET', '/api/me', null, cookieC); assert.equal(me.json.books[0].readOnly, true);
  assert.equal((await req('GET', `/api/books/${b}/data`, null, cookieC)).status, 200);
  const w = await req('POST', `/api/books/${b}/budgets`, { category: 'X', amount: 1 }, cookieC); assert.equal(w.status, 403); assert.match(w.json.error, /view/);
  assert.equal((await req('POST', `/api/books/${b}/restore`, { docs: {} }, cookieC)).status, 403);
});

test('activity log records who added and removed what', async () => {
  const b = books()[1];
  const a = await req('POST', `/api/books/${b}/goals`, { name: 'Vacation', target: 3000 }, cookieB);
  await req('DELETE', `/api/books/${b}/goals/${a.json.id}`, null, cookieB);
  await req('POST', `/api/books/${b}/prefs`, { key: 'x', value: '1' }, cookieB);
  const log = (await req('GET', `/api/books/${b}/activity`, null, cookieC)).json;
  assert.equal(log[0].username, 'bob'); assert.equal(log[0].action, 'removed a savings goal'); assert.match(log[0].summary, /Vacation \$3,000/);
  assert.equal(log[1].action, 'added a savings goal');
  assert.ok(!log.some((x) => x.coll === 'prefs'), 'settings changes are not logged');
});

test('SimpleFIN: status, access rules and friendly token errors', async () => {
  const b2 = books()[1];
  const g = await req('GET', `/api/books/${b2}/simplefin`); assert.equal(g.status, 200); assert.equal(g.json.connected, false);
  assert.equal((await req('POST', `/api/books/${b2}/simplefin`, { token: 'x' }, cookieC)).status, 403, 'view-only login cannot connect');
  assert.equal((await req('GET', `/api/books/${books()[0]}/simplefin`, null, cookieB)).status, 403, 'other people\'s dashboards stay private');
  const bad = await req('POST', `/api/books/${b2}/simplefin`, { token: 'not-a-token' }); assert.equal(bad.status, 400); assert.match(bad.json.error, /setup token/);
});

test('invites: owner makes a one-time link; the new person picks a login and gets the right dashboards', async () => {
  assert.equal((await req('POST', '/api/invites', { books: [{ id: books()[1] }] }, cookieB)).status, 403, 'only the owner can invite');
  const mk = await req('POST', '/api/invites', { name: 'Sam', books: [{ id: books()[1], role: 'view' }], newBook: { name: 'Sam – Personal' } });
  assert.equal(mk.status, 200); const t = mk.json.token;
  const g = await req('GET', `/api/join/${t}`, null, ''); assert.equal(g.status, 200); assert.equal(g.json.newBook, 'Sam – Personal'); assert.equal(g.json.books[0].role, 'view');
  assert.equal((await req('POST', `/api/join/${t}`, { username: 'sam', password: 'short' }, '')).status, 400);
  const j = await req('POST', `/api/join/${t}`, { username: 'sam', password: 'longenough1' }, ''); assert.equal(j.status, 200);
  const ck = String(j.headers.get('set-cookie') || '').split(';')[0];
  const me = await req('GET', '/api/me', null, ck); assert.equal(me.status, 200);
  assert.deepEqual(me.json.books.map((b) => b.name).sort(), ['Sam – Personal', me.json.books.find((b) => b.readOnly).name].sort());
  assert.equal((await req('GET', `/api/join/${t}`, null, '')).status, 404, 'links work once');
});

// ---- restore integrity (review R1 + R2): references survive, photos too, and a failure changes nothing ----
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
test('waiting receipt edits reject stale data and discard preserves shared files', async () => {
  const b = books()[0], file = (await req('POST', `/api/books/${b}/files`, { mime: 'image/png', data: PNG })).json.id;
  const a = (await req('POST', `/api/books/${b}/receipts`, { fileId: file, vendor: 'Cafe', date: '2026-11-01', total: 10, tip: 2, tipIncluded: false })).json.id;
  const other = (await req('POST', `/api/books/${b}/receipts`, { fileId: file, txKey: 'm:other' })).json.id;
  const old = (await req('GET', `/api/books/${b}/data`)).json.receipts.find((r) => r.id === a);
  assert.equal((await req('POST', `/api/books/${b}/receipts/${a}`, { expected: old, changes: { vendor: 'Cafe Updated' } })).status, 200);
  assert.equal((await req('POST', `/api/books/${b}/receipts/${a}`, { expected: old, discard: true })).status, 409);
  const current = (await req('GET', `/api/books/${b}/data`)).json.receipts.find((r) => r.id === a);
  assert.equal((await req('POST', `/api/books/${b}/receipts/${a}`, { expected: current, discard: true })).status, 200);
  assert.equal((await req('GET', `/api/books/${b}/files/${file}`)).status, 200);
  await req('DELETE', `/api/books/${b}/receipts/${other}`);
  await req('DELETE', `/api/books/${b}/files/${file}`);
});
async function fixture(b) {
  const imp = await req('POST', `/api/books/${b}/imports`, { accountName: 'Checking', accountKind: 'deposit', txns: [{ date: '2026-03-01', description: 'COFFEE', amount: 4.5 }, { date: '2026-03-02', description: 'GROCER', amount: 60 }] });
  const man = await req('POST', `/api/books/${b}/manual`, { type: 'expense', date: '2026-03-03', amount: 20, vendor: 'Cash lunch', category: 'Dining' });
  await req('POST', `/api/books/${b}/edits`, { txKey: `i:${imp.json.id}:1`, category: 'Groceries', split: [] });
  await req('POST', `/api/books/${b}/edits`, { txKey: `m:${man.json.id}`, category: 'Work' });
  const f = await req('POST', `/api/books/${b}/files`, { mime: 'image/png', data: PNG });
  await req('POST', `/api/books/${b}/receipts`, { txKey: `i:${imp.json.id}:0`, fileId: f.json.id, name: 'r.png', mime: 'image/png', size: 70 });
}
// every edit/receipt points at a transaction that exists, and every receipt's photo can be opened
async function checkRefs(b) {
  const j = (await req('GET', `/api/books/${b}/data`)).json;
  const keys = new Set([...j.imports.flatMap((x) => (Array.isArray(x.txns) ? x.txns : JSON.parse(x.txns || '[]')).map((_, k) => `i:${x.id}:${k}`)), ...j.manual.map((m) => `m:${m.id}`)]);
  for (const e of j.edits) assert.ok(keys.has(e.txKey), 'edit points at a real transaction: ' + e.txKey);
  for (const r of j.receipts) { assert.ok(keys.has(r.txKey), 'receipt points at a real transaction'); assert.equal((await req('GET', `/api/books/${b}/files/${r.fileId}`)).status, 200); }
  return j;
}
test('restore keeps edits, splits and receipts attached (same and another dashboard)', async () => {
  const [b1, b2] = books();
  await fixture(b1); await checkRefs(b1);
  const ex = (await req('GET', `/api/books/${b1}/export`)).json;
  const r1 = await req('POST', `/api/books/${b1}/restore`, ex); assert.equal(r1.status, 200); assert.equal(r1.json.unresolved, 0); assert.equal(r1.json.missingPhotos, 0);
  const j1 = await checkRefs(b1); assert.equal(j1.edits.filter((e) => /^[im]:/.test(e.txKey)).length, 2); assert.equal(j1.receipts.length, 1);
  const r2 = await req('POST', `/api/books/${b2}/restore`, ex); assert.equal(r2.status, 200);
  await checkRefs(b2); await checkRefs(b1); // the source dashboard is untouched
});
test('a failure while replacing photos leaves documents and photos unchanged', async () => {
  const b = books()[0]; const before = (await req('GET', `/api/books/${b}/export`)).json;
  const ex = JSON.parse(JSON.stringify(before)); ex.docs.rules = [{ match: 'NEW-RULE', category: 'X' }];
  srv._store._failAfterDocs = true;
  try { const r = await req('POST', `/api/books/${b}/restore`, ex); assert.equal(r.status, 500); } finally { srv._store._failAfterDocs = false; }
  const after = (await req('GET', `/api/books/${b}/export`)).json;
  assert.deepEqual(after.docs.rules.map((x) => x.match).sort(), before.docs.rules.map((x) => x.match).sort());
  assert.equal(after.files.length, before.files.length); await checkRefs(b);
});
test('an older backup without photos keeps the dashboard\'s existing photos', async () => {
  const b = books()[0]; const ex = (await req('GET', `/api/books/${b}/export`)).json; delete ex.files;
  const r = await req('POST', `/api/books/${b}/restore`, ex); assert.equal(r.status, 200); assert.equal(r.json.legacy, true); assert.equal(r.json.missingPhotos, 0);
  await checkRefs(b);
});

// ---- review R4: a statement is saved whole or not at all ----
test('imports: the largest allowed statement saves every row; one more row is refused and nothing is saved', async () => {
  const b = books()[0]; const n0 = (await req('GET', `/api/books/${b}/data`)).json.imports.length;
  const rows = (n) => Array.from({ length: n }, (_, i) => ({ date: '2025-01-' + String(1 + (i % 28)).padStart(2, '0'), description: 'STORE PURCHASE NUMBER ' + i + ' WITH A LONGISH DESCRIPTION', amount: (i % 97) + 0.25 }));
  const ok = await req('POST', `/api/books/${b}/imports`, { accountName: 'Big', txns: rows(5000) }); assert.equal(ok.status, 201);
  const saved = (await req('GET', `/api/books/${b}/data`)).json.imports.find((x) => x.id === ok.json.id); assert.equal((Array.isArray(saved.txns) ? saved.txns : JSON.parse(saved.txns)).length, 5000);
  const big = await req('POST', `/api/books/${b}/imports`, { accountName: 'Big', txns: rows(5001) }); assert.equal(big.status, 413); assert.match(big.json.error, /5,001 transactions/);
  assert.equal((await req('GET', `/api/books/${b}/data`)).json.imports.length, n0 + 1);
});

// ---- import history and undo: preview the dependents, remove only what's confirmed, all or nothing ----
async function undoFixture(b) {
  const imp = await req('POST', `/api/books/${b}/imports`, { accountName: 'Undo checking', accountKind: 'deposit', source: 'csv', fileRows: 3, skipped: 1,
    reconcile: { opening: 100, closing: 35.5, expected: 35.5, diff: 0, from: '2026-04-01', to: '2026-04-30' }, txns: [{ date: '2026-04-01', description: 'A', amount: 4.5 }, { date: '2026-04-02', description: 'B', amount: 60 }] });
  const e = await req('POST', `/api/books/${b}/edits`, { txKey: `i:${imp.json.id}:1`, category: 'Groceries' });
  const f = await req('POST', `/api/books/${b}/files`, { mime: 'image/png', data: PNG });
  const r = await req('POST', `/api/books/${b}/receipts`, { txKey: `i:${imp.json.id}:0`, fileId: f.json.id, name: 'r.png', mime: 'image/png', size: 70 });
  return { id: imp.json.id, edit: e.json.id, receipt: r.json.id, file: f.json.id };
}
test('imports keep their history details (source, counts, statement check)', async () => {
  const b = books()[0]; const x = await undoFixture(b);
  const d = (await req('GET', `/api/books/${b}/data`)).json.imports.find((i) => i.id === x.id);
  assert.equal(d.source, 'csv'); assert.equal(d.fileRows, 3); assert.equal(d.skipped, 1); assert.equal(d.reconcile.diff, 0); assert.equal(d.reconcile.from, '2026-04-01');
});
test('undo removes the import and only the edits and receipts you confirm', async () => {
  const b = books()[0]; const x = await undoFixture(b);
  const r = await req('POST', `/api/books/${b}/undo-import`, { importId: x.id, edits: [x.edit], receipts: [] });
  assert.equal(r.status, 200); assert.equal(r.json.removed.edits, 1); assert.equal(r.json.keptReceipts, 1);
  const j = (await req('GET', `/api/books/${b}/data`)).json;
  assert.ok(!j.imports.some((i) => i.id === x.id)); assert.ok(!j.edits.some((e) => e.id === x.edit)); assert.ok(j.receipts.some((e) => e.id === x.receipt));
  assert.equal((await req('GET', `/api/books/${b}/files/${x.file}`)).status, 200);
  // importing the same rows again works after undo
  const again = await req('POST', `/api/books/${b}/imports`, { accountName: 'Undo checking', txns: [{ date: '2026-04-01', description: 'A', amount: 4.5 }] }); assert.equal(again.status, 201);
});
test('undo with a receipt removes its photo; a failure changes nothing; a stale list is refused', async () => {
  const b = books()[0]; const x = await undoFixture(b);
  srv._store._failRemove = true;
  try { assert.equal((await req('POST', `/api/books/${b}/undo-import`, { importId: x.id, edits: [x.edit], receipts: [x.receipt] })).status, 500); } finally { srv._store._failRemove = false; }
  let j = (await req('GET', `/api/books/${b}/data`)).json; assert.ok(j.imports.some((i) => i.id === x.id)); assert.ok(j.edits.some((e) => e.id === x.edit));
  assert.equal((await req('POST', `/api/books/${b}/undo-import`, { importId: x.id, edits: ['nope'] })).status, 409);
  const r = await req('POST', `/api/books/${b}/undo-import`, { importId: x.id, edits: [x.edit], receipts: [x.receipt] }); assert.equal(r.status, 200); assert.equal(r.json.removed.photos, 1);
  assert.equal((await req('GET', `/api/books/${b}/files/${x.file}`)).status, 404);
  assert.equal((await req('POST', `/api/books/${books()[1]}/undo-import`, { importId: 'x' }, cookieC)).status, 403); // view-only login
});

// ---- backup health: check a backup without restoring it ----
test('verify-backup checks a backup and changes nothing', async () => {
  const b = books()[1]; // restored earlier from a clean fixture (the first dashboard now holds receipts left on purpose by the undo test)
  const ex = (await req('GET', `/api/books/${b}/export`)).json; const before = JSON.stringify((await req('GET', `/api/books/${b}/export`)).json.docs);
  const v = await req('POST', `/api/books/${b}/verify-backup`, ex); assert.equal(v.status, 200); assert.equal(v.json.ok, true); assert.equal(v.json.legacy, false);
  assert.equal(v.json.documents, v.json.declared); assert.equal(v.json.photos, ex.files.length);
  const broken = JSON.parse(JSON.stringify(ex)); broken.files = []; const v2 = await req('POST', `/api/books/${b}/verify-backup`, broken);
  assert.equal(v2.json.ok, false); assert.ok(v2.json.missingPhotos >= 1);
  assert.equal((await req('POST', `/api/books/${b}/verify-backup`, { nope: 1 })).status, 400);
  assert.equal(JSON.stringify((await req('GET', `/api/books/${b}/export`)).json.docs), before);
});

test('business marks on edits and rules are kept (and cleaned)', async () => {
  const b = books()[0];
  await req('POST', `/api/books/${b}/edits`, { txKey: 'zz:1', vendor: 'Adobe', category: 'Software', type: 'expense', biz: 'Photo', bizPct: 250, schedC: '18<x>' });
  await req('POST', `/api/books/${b}/rules`, { match: 'STRIPE', biz: 'Photo', bizPct: 30, schedC: '24b' });
  await req('POST', `/api/books/${b}/edits`, { txKey: 'zz:2', vendor: 'X', category: 'Y', type: 'expense' });
  const d = (await req('GET', `/api/books/${b}/data`)).json;
  const e1 = d.edits.find((x) => x.txKey === 'zz:1'), e2 = d.edits.find((x) => x.txKey === 'zz:2'), r = d.rules.find((x) => x.match === 'STRIPE');
  assert.equal(e1.biz, 'Photo'); assert.equal(e1.bizPct, 100); assert.equal(e1.schedC, '18x');
  assert.equal(e2.biz, undefined); // not touched: no business fields at all
  assert.equal(r.biz, 'Photo'); assert.equal(r.bizPct, 30); assert.equal(r.schedC, '24b');
});

test('transaction notes are kept and trimmed to 500 characters', async () => {
  const b = books()[0];
  await req('POST', `/api/books/${b}/edits`, { txKey: 'zz:n', vendor: 'V', category: 'C', type: 'expense', note: 'x'.repeat(600) });
  const e = (await req('GET', `/api/books/${b}/data`)).json.edits.find((x) => x.txKey === 'zz:n'); assert.equal(e.note.length, 500);
});
