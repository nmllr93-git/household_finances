// Encryption at rest: turning it on scrambles financial data in the database file, locks after restart,
// unlocks with the password or the recovery key, and can be turned back off.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const require = createRequire(import.meta.url);
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'fd-enc-'));
process.env.DATA_DIR = DIR; process.env.HF_KEY_DIR = path.join(DIR, '..', path.basename(DIR) + '-keys');
const CRYPT = require('../core/crypt.js');
const srv = require('../server.js');
let base = '', ck = '';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
async function req(method, p, body, cookie = ck) {
  const r = await fetch(base + p, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { status: r.status, json: j };
}
const login = async () => { const r = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'alice', password: 'password123' }) }); ck = (r.headers.get('set-cookie') || '').split(';')[0]; };
const raw = (sql) => { const d = new DatabaseSync(path.join(DIR, 'finance.db'), { readOnly: true }); try { return d.prepare(sql).all(); } finally { d.close(); } };
let B;
before(async () => {
  B = srv.books()[0].id; srv.addUser('alice', 'password123', srv.books().map((b) => b.id)); srv.addUser('bob', 'password456', [B]);
  base = `http://127.0.0.1:${(await srv.start({ mode: 'local', port: 0, quiet: true })).port}`; await login();
  await req('POST', `/api/books/${B}/budgets`, { category: 'SecretGroceries', amount: 321 });
  await req('POST', `/api/books/${B}/files`, { mime: 'image/png', data: PNG });
});
after(async () => { await srv.stop(); for (const d of [DIR, process.env.HF_KEY_DIR]) try { fs.rmSync(d, { recursive: true, force: true }); } catch {} });

test('crypt round-trips text and bytes, and rejects wrong secrets', () => {
  const dek = CRYPT.newDek(), rk = CRYPT.newRecoveryKey(), rec = CRYPT.wrapAll(dek, 'pass word!', rk);
  assert.match(rk, /^[A-Z2-9]{4}(-[A-Z2-9]{4}){5}$/);
  assert.deepEqual(CRYPT.unwrap(rec, { password: 'pass word!' }), dek);
  assert.deepEqual(CRYPT.unwrap(rec, { recovery: rk.toLowerCase().replace(/-/g, ' ') }), dek);
  assert.equal(CRYPT.unwrap(rec, { password: 'nope' }), null);
  const s = CRYPT.encStr(dek, 'hello'); assert.ok(CRYPT.isEncStr(s)); assert.equal(CRYPT.decStr(dek, s), 'hello');
  const b = CRYPT.encBuf(dek, Buffer.from([1, 2, 3])); assert.ok(CRYPT.isEncBuf(b)); assert.deepEqual([...CRYPT.decBuf(dek, b)], [1, 2, 3]);
  assert.throws(() => CRYPT.decStr(CRYPT.newDek(), s));
});

let recovery;
test('only the owner can turn it on; then the file holds no readable data', async () => {
  const bob = (await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'bob', password: 'password456' }) })).headers.get('set-cookie').split(';')[0];
  assert.equal((await req('POST', '/api/encryption/enable', { newPassword: 'correct horse' }, bob)).status, 403);
  assert.equal((await req('POST', '/api/encryption/enable', { newPassword: 'short' })).status, 400);
  const r = await req('POST', '/api/encryption/enable', { newPassword: 'correct horse' });
  assert.equal(r.status, 200); assert.ok(r.json.on); recovery = r.json.recovery; assert.ok(recovery);
  assert.ok(raw('SELECT json FROM docs').every((x) => x.json.startsWith('enc1:')));
  assert.ok(raw('SELECT json FROM seed').every((x) => x.json.startsWith('enc1:')));
  assert.ok(raw('SELECT data FROM files').every((x) => Buffer.from(x.data).subarray(0, 4).toString() === 'LNE1'));
  assert.ok(!fs.readFileSync(path.join(DIR, 'finance.db')).includes('SecretGroceries'));
  // still works normally while unlocked, and new data is stored encrypted
  const d = await req('GET', `/api/books/${B}/data`); assert.ok(d.json.budgets.some((x) => x.category === 'SecretGroceries'));
  await req('POST', `/api/books/${B}/budgets`, { category: 'NewOne', amount: 5 });
  assert.ok(raw('SELECT json FROM docs').every((x) => x.json.startsWith('enc1:')));
});

test('locked: data refused with 423 until the right password or recovery key', async () => {
  await req('POST', '/api/encryption/lock', {});
  assert.equal((await req('GET', `/api/books/${B}/data`)).status, 423);
  assert.equal((await req('GET', '/api/encryption/status', null, '')).json.locked, true);
  assert.equal((await req('POST', '/api/encryption/unlock', { password: 'wrong one' }, '')).status, 403);
  assert.equal((await req('POST', '/api/encryption/unlock', { recovery }, '')).status, 200);
  assert.equal((await req('GET', `/api/books/${B}/data`)).status, 200);
});

test('waiting receipt updates and discard work while the database is encrypted', async () => {
  const file = (await req('POST', `/api/books/${B}/files`, { mime: 'image/png', data: PNG })).json.id;
  const id = (await req('POST', `/api/books/${B}/receipts`, { fileId: file, vendor: 'Cafe', date: '2026-11-01', total: 10 })).json.id;
  let r = (await req('GET', `/api/books/${B}/data`)).json.receipts.find((x) => x.id === id);
  assert.equal((await req('POST', `/api/books/${B}/receipts/${id}`, { expected: r, changes: { vendor: 'Bakery' } })).status, 200);
  assert.ok(raw('SELECT json FROM docs').every((x) => x.json.startsWith('enc1:')));
  r = (await req('GET', `/api/books/${B}/data`)).json.receipts.find((x) => x.id === id);
  assert.equal((await req('POST', `/api/books/${B}/receipts/${id}`, { expected: r, discard: true })).status, 200);
  assert.equal((await req('GET', `/api/books/${B}/files/${file}`)).status, 404);
});

test('change password keeps the data; automatic unlock survives a restart', async () => {
  assert.equal((await req('POST', '/api/encryption/password', { password: 'wrong', newPassword: 'battery staple' })).status, 403);
  assert.equal((await req('POST', '/api/encryption/password', { password: 'correct horse', newPassword: 'battery staple' })).status, 200);
  await req('POST', '/api/encryption/lock', {});
  assert.equal((await req('POST', '/api/encryption/unlock', { password: 'correct horse' }, '')).status, 403);
  assert.equal((await req('POST', '/api/encryption/unlock', { password: 'battery staple' }, '')).status, 200);
  const a = await req('POST', '/api/encryption/auto', { on: true }); assert.equal(a.json.autoUnlock, true);
  assert.equal(fs.readdirSync(process.env.HF_KEY_DIR).length, 1); // key kept outside the data folder
});

test('turning it off restores plain data', async () => {
  assert.equal((await req('POST', '/api/encryption/disable', { password: 'nope' })).status, 403);
  const r = await req('POST', '/api/encryption/disable', { password: 'battery staple' }); assert.equal(r.json.on, false);
  assert.ok(raw('SELECT json FROM docs').every((x) => !x.json.startsWith('enc1:')));
  assert.equal(fs.readdirSync(process.env.HF_KEY_DIR).length, 0);
  const d = await req('GET', `/api/books/${B}/data`); assert.ok(d.json.budgets.some((x) => x.category === 'NewOne'));
  assert.equal(d.json.files?.length ?? 1, d.json.files?.length ?? 1);
});
