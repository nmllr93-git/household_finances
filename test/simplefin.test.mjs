import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { createSimpleFin, guessKind, splitAccess } = createRequire(import.meta.url)('../core/simplefin.js');

const ACCESS = 'https://u1:p%402@bridge.example/simplefin';
function fake() {
  const state = {}, docs = { imports: [], accounts: [] }, calls = [];
  let txns = [
    { id: 't1', posted: 1767268800, amount: '-12.50', description: 'COFFEE SHOP' },
    { id: 't2', posted: 1767355200, amount: '1500.00', description: 'PAYROLL' },
    { id: 't3', posted: 0, amount: '-9.99', description: 'PENDING THING', pending: true },
  ];
  const sf = createSimpleFin({
    request: async (method, url, headers) => {
      calls.push({ method, url, headers });
      if (url.startsWith('https://claim.example/')) return { status: 200, text: ACCESS };
      return { status: 200, text: JSON.stringify({ errors: [], accounts: [
        { id: 'a1', name: 'Everyday Checking', org: { name: 'Hills Bank' }, currency: 'USD', balance: '2100.25', 'balance-date': 1767355200, transactions: txns },
        { id: 'a2', name: 'Rewards Visa', org: { name: 'Card Co' }, currency: 'USD', balance: '-340.10', 'balance-date': 1767355200, transactions: [] } ] }) };
    },
    load: (id) => state[id] || null, save: (id, st) => { if (st) state[id] = JSON.parse(JSON.stringify(st)); else delete state[id]; },
    bookData: () => docs, addDoc: (id, coll, doc) => { docs[coll].push(doc); },
  });
  return { sf, state, docs, calls, setTxns: (t) => { txns = t; } };
}
const body = (o) => async () => o;
const token = Buffer.from('https://claim.example/abc').toString('base64');

test('splitAccess moves credentials into a Basic header', () => {
  const { base, auth } = splitAccess(ACCESS);
  assert.equal(base, 'https://bridge.example/simplefin');
  assert.equal(auth, 'Basic ' + Buffer.from('u1:p@2').toString('base64'));
});

test('guessKind', () => { assert.equal(guessKind('Rewards Visa'), 'credit:card'); assert.equal(guessKind('Roth IRA'), 'investment:roth_ira'); assert.equal(guessKind('Checking'), 'deposit:checking'); });

test('connect, sync posted only, no duplicates, owed balances positive', async () => {
  const f = fake();
  const c = await f.sf.handle('POST', [], 'b1', body({ token }));
  assert.equal(c.status, 200); assert.equal(c.body.connected, true); assert.equal(c.body.accounts.length, 2);
  assert.ok(!JSON.stringify(c.body).includes('p%402'), 'access URL is never sent to the page');
  const s = await f.sf.handle('POST', ['sync'], 'b1', body({}));
  assert.equal(s.status, 200); assert.equal(s.body.added, 2);
  const chk = f.docs.imports.find((d) => d.accountName === 'Everyday Checking');
  assert.deepEqual(chk.txns.map((t) => t.amount), [12.5, -1500]);
  assert.equal(chk.balance, 2100.25);
  assert.equal(f.docs.imports.find((d) => d.accountName === 'Rewards Visa').balance, 340.1);
  assert.equal(f.docs.accounts.length, 2);
  // too soon for another manual sync
  assert.equal((await f.sf.handle('POST', ['sync'], 'b1', body({}))).status, 429);
  f.state.b1.lastTry = 0;
  const again = await f.sf.handle('POST', ['sync'], 'b1', body({}));
  assert.equal(again.body.added, 0); assert.equal(f.docs.imports.length, 2);
});

test('skip and rename accounts; disconnect forgets the access URL', async () => {
  const f = fake();
  await f.sf.handle('POST', [], 'b1', body({ token }));
  await f.sf.handle('POST', [], 'b1', body({ accounts: { a1: { map: 'Joint Checking', kind: 'deposit:checking' }, a2: { skip: true } } }));
  await f.sf.handle('POST', ['sync'], 'b1', body({}));
  assert.deepEqual(f.docs.imports.map((d) => d.accountName), ['Joint Checking']);
  await f.sf.handle('DELETE', [], 'b1', body({}));
  assert.equal(f.state.b1, undefined);
});

test('bad token gives a friendly error', async () => {
  const f = fake();
  const r = await f.sf.handle('POST', [], 'b1', body({ token: 'nope' }));
  assert.equal(r.status, 400); assert.match(r.body.error, /setup token/);
});

test('a problem right after connecting keeps the connection (setup tokens work only once)', async () => {
  const state = {};
  const sf = createSimpleFin({
    request: async (m, url) => (url.startsWith('https://claim.example/') ? { status: 200, text: ACCESS } : { status: 402, text: 'Payment required' }),
    load: (id) => state[id] || null, save: (id, st) => { state[id] = st ? JSON.parse(JSON.stringify(st)) : undefined; }, bookData: () => ({}), addDoc: () => {},
  });
  const r = await sf.handle('POST', [], 'b1', async () => ({ token }));
  assert.equal(r.status, 200); assert.equal(r.body.connected, true); assert.match(r.body.lastError, /payment required/i);
});
