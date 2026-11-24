import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createBankSync } = require('../core/simplefin.js');
const { createTeller, createPlaid } = require('../core/banklinks.js');

const recent = (d) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
function harness(make, keys, respond) {
  const state = {}, docs = { imports: [], accounts: [] }, calls = [];
  const provider = make({ keys: () => keys, request: async (method, url, headers, body, tls) => { calls.push({ method, url, headers, body: body ? JSON.parse(body) : null, tls }); return respond(method, url, body ? JSON.parse(body) : null); } });
  const eng = createBankSync({ provider, load: (id) => state[id] || null, save: (id, st) => { if (st) state[id] = JSON.parse(JSON.stringify(st)); else delete state[id]; }, bookData: () => docs, addDoc: (id, coll, doc) => { docs[coll].push(doc); } });
  return { eng, state, docs, calls };
}
const body = (o) => async () => o;
const ok = (j) => ({ status: 200, text: JSON.stringify(j) });

const TELLER_KEYS = { teller: { appId: 'app_x', env: 'development', cert: '-----BEGIN CERTIFICATE-----\nx', key: '-----BEGIN PRIVATE KEY-----\nx' } };
const teller = (method, url) => {
  if (url.endsWith('/accounts')) return ok([{ id: 'acc_1', name: 'Checking', last_four: '1234', status: 'open', currency: 'USD', institution: { name: 'Test Bank' } }]);
  if (url.endsWith('/balances')) return ok({ ledger: '1500.25', available: '1400.00' });
  if (url.endsWith('/transactions')) return ok([
    { id: 'txn_1', date: recent(2), amount: '-42.10', description: 'GROCERY 123', status: 'posted', details: { counterparty: { name: 'Hy-Vee' } } },
    { id: 'txn_2', date: recent(3), amount: '2000.00', description: 'PAYROLL', status: 'posted', details: {} },
    { id: 'txn_3', date: recent(1), amount: '-5.00', description: 'PENDING', status: 'pending', details: {} },
    { id: 'txn_4', date: recent(400), amount: '-1.00', description: 'TOO OLD', status: 'posted', details: {} }]);
  return { status: 404, text: '{}' };
};

test('Teller: start gives the app id; connect saves the bank and lists accounts', async () => {
  const h = harness(createTeller, TELLER_KEYS, teller);
  const s = await h.eng.handle('POST', ['start'], 'b1', body({})); assert.equal(s.body.applicationId, 'app_x'); assert.equal(s.body.environment, 'development');
  const c = await h.eng.handle('POST', [], 'b1', body({ connect: { accessToken: 'token_abc', enrollment: { id: 'enr_1', institution: { name: 'Test Bank' } } } }));
  assert.equal(c.status, 200); assert.equal(c.body.connected, true); assert.deepEqual(c.body.banks, ['Test Bank']);
  assert.equal(c.body.accounts.length, 1); assert.match(c.body.accounts[0].name, /Checking …1234/);
  assert.ok(h.calls.every((x) => x.tls && x.tls.cert), 'real banks use the client certificate');
  assert.match(h.calls[0].headers.Authorization, /^Basic /);
});

test('Teller: sync imports posted transactions with spending positive, skips pending and old ones', async () => {
  const h = harness(createTeller, TELLER_KEYS, teller);
  const c = await h.eng.handle('POST', [], 'b1', body({ connect: { accessToken: 'token_abc', enrollment: { id: 'enr_1', institution: { name: 'Test Bank' } } } }));
  await h.eng.handle('POST', [], 'b1', body({ accounts: Object.fromEntries(c.body.accounts.map((a) => [a.id, {}])) }));
  const r = await h.eng.handle('POST', ['sync'], 'b1', body({}));
  assert.equal(r.status, 200); assert.equal(r.body.added, 2);
  const t = h.docs.imports[0].txns; assert.equal(h.docs.imports[0].fileName, 'Teller sync'); assert.equal(h.docs.imports[0].balance, 1500.25);
  assert.deepEqual(t.map((x) => [x.description, x.amount]).sort(), [['Hy-Vee', 42.1], ['PAYROLL', -2000]]);
  assert.equal(h.docs.accounts[0].note, 'Synced from Teller');
});

test('Teller: "Flip signs" reverses a bank that reports the other way', async () => {
  const h = harness(createTeller, TELLER_KEYS, teller);
  const c = await h.eng.handle('POST', [], 'b1', body({ connect: { accessToken: 'token_abc', enrollment: { id: 'enr_1', institution: { name: 'Test Bank' } } } }));
  await h.eng.handle('POST', [], 'b1', body({ accounts: { [c.body.accounts[0].id]: { flip: true } } }));
  await h.eng.handle('POST', ['sync'], 'b1', body({}));
  assert.ok(h.docs.imports[0].txns.some((x) => x.description === 'Hy-Vee' && x.amount === -42.1));
});

test('Teller: plain-language errors (no keys, no certificate, rejected login)', async () => {
  let h = harness(createTeller, {}, teller); let r = await h.eng.handle('POST', ['start'], 'b1', body({})); assert.equal(r.status, 400); assert.match(r.body.error, /application ID/);
  h = harness(createTeller, { teller: { appId: 'app_x', env: 'development' } }, teller);
  r = await h.eng.handle('POST', [], 'b1', body({ connect: { accessToken: 'token_abc' } })); assert.equal(r.status, 400); assert.match(r.body.error, /certificate/);
  h = harness(createTeller, { teller: { appId: 'app_x', env: 'sandbox' } }, () => ({ status: 401, text: '{}' }));
  r = await h.eng.handle('POST', [], 'b1', body({ connect: { accessToken: 'token_abc' } })); assert.equal(r.status, 401); assert.match(r.body.error, /connect the bank again/);
});

test('Teller: a second bank is added alongside the first; connecting the same bank again replaces it', async () => {
  const h = harness(createTeller, TELLER_KEYS, teller);
  await h.eng.handle('POST', [], 'b1', body({ connect: { accessToken: 'token_a', enrollment: { id: 'enr_1', institution: { name: 'Bank A' } } } }));
  await h.eng.handle('POST', [], 'b1', body({ connect: { accessToken: 'token_b', enrollment: { id: 'enr_2', institution: { name: 'Bank B' } } } }));
  const r = await h.eng.handle('POST', [], 'b1', body({ connect: { accessToken: 'token_c', enrollment: { id: 'enr_1', institution: { name: 'Bank A' } } } }));
  assert.deepEqual(r.body.banks, ['Bank B', 'Bank A']);
});

const PLAID_KEYS = { plaid: { clientId: 'cid', secret: 'sec', env: 'sandbox' } };
const plaid = (method, url, b) => {
  if (url.endsWith('/link/token/create')) return ok({ link_token: 'link-sandbox-1' });
  if (url.endsWith('/item/public_token/exchange')) return ok({ access_token: 'access-sandbox-1', item_id: 'item1' });
  if (url.endsWith('/transactions/get')) return ok({ total_transactions: 2, accounts: [{ account_id: 'p1', name: 'Plaid Checking', mask: '0000', balances: { current: 110, iso_currency_code: 'USD' } }],
    transactions: [{ transaction_id: 'x1', account_id: 'p1', date: recent(2), amount: 12.5, name: 'UBER 123', merchant_name: 'Uber', pending: false },
      { transaction_id: 'x2', account_id: 'p1', date: recent(2), amount: -500, name: 'DEPOSIT', pending: false }] });
  if (url.endsWith('/item/remove')) return ok({});
  return { status: 400, text: JSON.stringify({ error_code: 'X', error_message: 'unknown' }) };
};

test('Plaid: link token, exchange, sync with Plaid’s opposite sign convention', async () => {
  const h = harness(createPlaid, PLAID_KEYS, plaid);
  const s = await h.eng.handle('POST', ['start'], 'b1', body({})); assert.equal(s.body.linkToken, 'link-sandbox-1');
  assert.ok(h.calls[0].url.startsWith('https://sandbox.plaid.com/')); assert.equal(h.calls[0].body.secret, 'sec');
  const c = await h.eng.handle('POST', [], 'b1', body({ connect: { publicToken: 'public-sandbox-1', institution: 'First Plaidypus' } }));
  assert.equal(c.status, 200); assert.deepEqual(c.body.banks, ['First Plaidypus']);
  await h.eng.handle('POST', [], 'b1', body({ accounts: Object.fromEntries(c.body.accounts.map((a) => [a.id, {}])) }));
  const r = await h.eng.handle('POST', ['sync'], 'b1', body({})); assert.equal(r.body.added, 2);
  assert.deepEqual(h.docs.imports[0].txns.map((x) => [x.description, x.amount]).sort(), [['DEPOSIT', -500], ['Uber', 12.5]]);
  await h.eng.handle('DELETE', [], 'b1', body({})); assert.ok(h.calls.some((x) => x.url.endsWith('/item/remove')));
});

test('Plaid: "still gathering" and bad keys come back in plain words', async () => {
  let h = harness(createPlaid, PLAID_KEYS, (m, url) => (url.endsWith('/transactions/get') ? { status: 400, text: JSON.stringify({ error_code: 'PRODUCT_NOT_READY' }) } : url.endsWith('/accounts/get') ? ok({ accounts: [{ account_id: 'p1', name: 'Chk', balances: { current: 5 } }] }) : plaid(m, url)));
  const c = await h.eng.handle('POST', [], 'b1', body({ connect: { publicToken: 'public-sandbox-1', institution: 'Bank' } }));
  assert.equal(c.body.accounts.length, 1); assert.ok(c.body.notes.some((n) => /still gathering/.test(n)));
  h = harness(createPlaid, PLAID_KEYS, () => ({ status: 400, text: JSON.stringify({ error_code: 'INVALID_API_KEYS' }) }));
  const s = await h.eng.handle('POST', ['start'], 'b1', body({})); assert.equal(s.status, 400); assert.match(s.body.error, /client ID or secret/);
});

test('Teller: a disconnected bank is listed for Reconnect, and start reopens that enrollment', async () => {
  let down = false;
  const h = harness(createTeller, TELLER_KEYS, (m, u) => (down && u.endsWith('/accounts') ? { status: 400, text: JSON.stringify({ error: { code: 'enrollment.disconnected.credentials_invalid', message: 'x' } }) } : teller(m, u)));
  const c = await h.eng.handle('POST', [], 'b1', body({ connect: { accessToken: 'token_abc', enrollment: { id: 'enr_1', institution: { name: 'Test Bank' } } } }));
  await h.eng.handle('POST', [], 'b1', body({ accounts: Object.fromEntries(c.body.accounts.map((a) => [a.id, {}])) }));
  down = true; const r = await h.eng.handle('POST', ['sync'], 'b1', body({}));
  assert.deepEqual(r.body.repair, [{ enrollment: 'enr_1', institution: 'Test Bank' }]);
  const s = await h.eng.handle('POST', ['start'], 'b1', body({ enrollment: 'enr_1' })); assert.equal(s.body.enrollmentId, 'enr_1');
  down = false; const fixed = await h.eng.handle('POST', [], 'b1', body({ connect: { accessToken: 'token_abc', enrollment: { id: 'enr_1', institution: { name: 'Test Bank' } } } }));
  assert.deepEqual(fixed.body.repair, []); assert.equal(fixed.body.banks.length, 1); assert.equal(fixed.body.accounts.length, 1);
});
