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
