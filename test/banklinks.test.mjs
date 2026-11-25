import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createBankSync } = require('../core/simplefin.js');
const { createPlaid } = require('../core/banklinks.js');

const recent = (d) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
function harness(make, keys, respond) {
  const state = {}, docs = { imports: [], accounts: [] }, calls = [];
  const provider = make({ keys: () => keys, request: async (method, url, headers, body, tls) => { calls.push({ method, url, headers, body: body ? JSON.parse(body) : null, tls }); return respond(method, url, body ? JSON.parse(body) : null); } });
  const eng = createBankSync({ provider, load: (id) => state[id] || null, save: (id, st) => { if (st) state[id] = JSON.parse(JSON.stringify(st)); else delete state[id]; }, bookData: () => docs, addDoc: (id, coll, doc) => { docs[coll].push(doc); } });
  return { eng, state, docs, calls };
}
const body = (o) => async () => o;
const ok = (j) => ({ status: 200, text: JSON.stringify(j) });

const PLAID_KEYS = { plaid: { clientId: 'cid', secret: 'sec', env: 'sandbox' } };
const plaid = (method, url, b) => {
  if (url.endsWith('/link/token/create')) return ok({ link_token: 'link-sandbox-1' });
  if (url.endsWith('/item/public_token/exchange')) return ok({ access_token: 'access-' + b.public_token, item_id: 'item-' + b.public_token });
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
  let h = harness(createPlaid, PLAID_KEYS, (m, url, b) => (url.endsWith('/transactions/get') ? { status: 400, text: JSON.stringify({ error_code: 'PRODUCT_NOT_READY' }) } : url.endsWith('/accounts/get') ? ok({ accounts: [{ account_id: 'p1', name: 'Chk', balances: { current: 5 } }] }) : plaid(m, url, b)));
  const c = await h.eng.handle('POST', [], 'b1', body({ connect: { publicToken: 'public-sandbox-1', institution: 'Bank' } }));
  assert.equal(c.body.accounts.length, 1); assert.ok(c.body.notes.some((n) => /still gathering/.test(n)));
  h = harness(createPlaid, PLAID_KEYS, () => ({ status: 400, text: JSON.stringify({ error_code: 'INVALID_API_KEYS' }) }));
  const s = await h.eng.handle('POST', ['start'], 'b1', body({})); assert.equal(s.status, 400); assert.match(s.body.error, /client ID or secret/);
});

test('Plaid: "Flip signs" reverses a bank that reports the other way', async () => {
  const h = harness(createPlaid, PLAID_KEYS, plaid);
  const c = await h.eng.handle('POST', [], 'b1', body({ connect: { publicToken: 'public-sandbox-1', institution: 'Bank' } }));
  await h.eng.handle('POST', [], 'b1', body({ accounts: { [c.body.accounts[0].id]: { flip: true } } }));
  await h.eng.handle('POST', ['sync'], 'b1', body({}));
  assert.ok(h.docs.imports[0].txns.some((x) => x.description === 'Uber' && x.amount === -12.5));
});

test('Plaid: a second bank is added alongside the first; connecting the same bank again replaces it', async () => {
  const h = harness(createPlaid, PLAID_KEYS, plaid);
  await h.eng.handle('POST', [], 'b1', body({ connect: { publicToken: 'public-a', institution: 'Bank A' } }));
  await h.eng.handle('POST', [], 'b1', body({ connect: { publicToken: 'public-b', institution: 'Bank B' } }));
  const r = await h.eng.handle('POST', [], 'b1', body({ connect: { publicToken: 'public-a', institution: 'Bank A' } }));
  assert.deepEqual(r.body.banks, ['Bank B', 'Bank A']);
});

test('SimpleFIN: pending charges are shown but not saved, and a tip that grows 30%+ is flagged', async () => {
  const ts = (d) => Math.floor((Date.now() - d * 864e5) / 1000);
  let round = 1;
  const state = {}, docs = { imports: [], accounts: [] }, urls = [];
  const access = 'https://u:p@bridge.example/simplefin';
  const eng = createBankSync({ request: async (m, url) => { urls.push(url);
      const txns = round === 1
        ? [{ id: 'p1', amount: '-40.00', description: 'SQ *CORNER DINER', transacted_at: ts(1), pending: true }, { id: 'p2', amount: '-20.00', description: 'GAS STATION 12', transacted_at: ts(1), pending: true }, { id: 'a', amount: '-9.99', description: 'STREAMING', posted: ts(3) }]
        : [{ id: 'q1', amount: '-55.00', description: 'SQ *CORNER DINER', posted: ts(0) }, { id: 'q2', amount: '-21.00', description: 'GAS STATION 12', posted: ts(0) }, { id: 'a', amount: '-9.99', description: 'STREAMING', posted: ts(3) }];
      return ok({ accounts: [{ id: 'acc', name: 'Checking', org: { name: 'Bank' }, currency: 'USD', balance: '100', transactions: txns }] }); },
    load: (id) => state[id] || null, save: (id, st) => { if (st) state[id] = JSON.parse(JSON.stringify(st)); else delete state[id]; }, bookData: () => docs, addDoc: (id, coll, doc) => { docs[coll].push(doc); } });
  state.b = { access, accounts: { acc: { name: 'Checking', map: 'Checking', kind: 'deposit:checking', skip: false, seen: [], lastBal: null } } };
  const r1 = await eng.handle('POST', ['sync'], 'b', body({}));
  assert.ok(urls[0].includes('pending=1'));
  assert.equal(r1.body.added, 1); assert.equal(r1.body.pending.length, 2); assert.deepEqual(r1.body.pending.map((p) => p.amount).sort(), [20, 40]);
  round = 2; state.b.lastTry = 0;
  const r2 = await eng.handle('POST', ['sync'], 'b', body({}));
  assert.equal(r2.body.added, 2); assert.equal(r2.body.pending.length, 0, 'posted charges replace their pending copies');
  assert.equal(r2.body.flags.length, 1, 'the diner went from 40 to 55 (+37%); the gas station only +5%');
  assert.equal(r2.body.flags[0].pending, 40); assert.equal(r2.body.flags[0].posted, 55);
  const d = await eng.handle('POST', [], 'b', body({ dismiss: r2.body.flags[0].key })); assert.equal(d.body.flags.length, 0);
});
