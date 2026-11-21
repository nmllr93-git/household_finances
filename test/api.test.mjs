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
let base = '', cookieA = '', cookieB = '';
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
  const i = await srv.start({ mode: 'local', port: 0, quiet: true });
  base = `http://127.0.0.1:${i.port}`;
  cookieA = (await login('alice', 'password123')).cookie; cookieB = (await login('bob', 'password456')).cookie;
});
after(async () => { await srv.stop(); fs.rmSync(DIR, { recursive: true, force: true }); });

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
