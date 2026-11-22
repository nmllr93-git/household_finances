// Tests for the calculations behind the dashboard numbers. Run with:  npm test   (or: node --test test/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const SRC = fs.readFileSync(new URL('../public/calcs.js', import.meta.url), 'utf8');
function engine(data, params = { range: 'all' }) {
  const calcs = {};
  const dash = { calc: (name, def) => { calcs[name] = def; }, params: () => params };
  vm.runInNewContext(SRC, { dash, console, Date, Math, JSON, Intl });
  const cache = {};
  const get = (name) => {
    if (name in cache) return cache[name];
    if (calcs[name]) return (cache[name] = calcs[name].fn(...calcs[name].inputs.map(get)));
    return (cache[name] = data[name] ?? []);
  };
  return get;
}
const imp = (id, account, kind, txns, extra = {}) => ({ id, book: 'Personal', accountName: account, accountKind: kind, accountType: '', owner: '', fileName: '', importedAt: '2026-11-01T00:00:00Z', rowCount: txns.length, txns, ...extra });
const tx = (date, description, amount) => ({ date, description, amount });

test('imported expenses and income are typed and totalled', () => {
  const get = engine({ imports: [imp('a', 'Checking', 'deposit', [tx('2026-10-03', 'GROCERY STORE', 54.21), tx('2026-10-15', 'PAYROLL ACME', -2000)])] });
  const t = get('txns');
  assert.equal(t.length, 2);
  assert.equal(t.find((x) => x.type === 'expense').amount, 54.21);
  assert.equal(t.find((x) => x.type === 'income').amount, 2000);
  const s = get('summary').find((r) => r.book === 'Personal');
  assert.equal(s.spend, 54.21); assert.equal(s.income, 2000);
});

test('AND rule sets category only when every condition matches', () => {
  const rules = [{ book: 'Personal', conds: [{ field: 'description', op: 'contains', value: 'paypal' }, { field: 'vendor', op: 'contains', value: 'steam' }], category: 'Gaming', createdAt: '2026-01-01' }];
  const get = engine({ rules, imports: [imp('a', 'Card', 'credit', [tx('2026-10-03', 'PAYPAL *STEAM GAMES', 20), tx('2026-10-04', 'PAYPAL *EBAY', 30)])] });
  const t = get('txns');
  assert.equal(t.find((x) => /STEAM/.test(x.description)).category, 'Gaming');
  assert.notEqual(t.find((x) => /EBAY/.test(x.description)).category, 'Gaming');
});

test('OR groups match any group', () => {
  const rules = [{ book: 'Personal', groups: [[{ field: 'description', op: 'contains', value: 'steam' }], [{ field: 'description', op: 'contains', value: 'epic games' }]], category: 'Gaming', createdAt: '2026-01-01' }];
  const get = engine({ rules, imports: [imp('a', 'Card', 'credit', [tx('2026-10-03', 'STEAM PURCHASE', 20), tx('2026-10-04', 'EPIC GAMES STORE', 15), tx('2026-10-05', 'TARGET', 40)])] });
  const t = get('txns');
  assert.equal(JSON.stringify(t.filter((x) => x.category === 'Gaming').map((x) => x.amount).sort()), '[15,20]');
  assert.ok(t.find((x) => x.description === 'STEAM PURCHASE').rule, 'matched rule is recorded');
});

test('amount conditions and ignore rules', () => {
  const rules = [{ book: 'Personal', conds: [{ field: 'description', op: 'contains', value: 'venmo' }, { field: 'amount', op: 'lt', value: '10' }], ignore: true, createdAt: '2026-01-01' }];
  const get = engine({ rules, imports: [imp('a', 'Checking', 'deposit', [tx('2026-10-03', 'VENMO SMALL', 5), tx('2026-10-04', 'VENMO BIG', 50)])] });
  assert.equal(get('txns').length, 1);
  assert.equal(get('ignored_txns').length, 1);
});

test('single-transaction edits beat rules', () => {
  const rules = [{ book: 'Personal', conds: [{ field: 'description', op: 'contains', value: 'target' }], category: 'Shopping', createdAt: '2026-01-01' }];
  const edits = [{ book: 'Personal', txKey: 'i:a:0', category: 'Gifts', createdAt: '2026-11-02' }];
  const get = engine({ rules, edits, imports: [imp('a', 'Card', 'credit', [tx('2026-10-03', 'TARGET', 40)])] });
  assert.equal(get('txns')[0].category, 'Gifts');
});

test('card payment and checking withdrawal are matched as one transfer', () => {
  const get = engine({ imports: [
    imp('c', 'Checking', 'deposit', [tx('2026-10-10', 'ONLINE PMT CAPITAL ONE', 512.34), tx('2026-10-11', 'COFFEE', 4.5)]),
    imp('k', 'Capital One', 'credit', [tx('2026-10-12', 'PAYMENT RECEIVED', -512.34), tx('2026-10-05', 'GAS STATION', 40)]) ] });
  const t = get('all_txns');
  const pair = t.filter((x) => Math.abs(Math.abs(x.amount) - 512.34) < 0.01);
  assert.equal(pair.length, 2);
  assert.ok(pair.every((x) => x.type === 'transfer' && x.matched), 'both sides are transfers');
  assert.equal(get('summary').find((r) => r.book === 'Personal').spend, 44.5, 'only real purchases count as spending');
});

test('payments more than 5 days apart are not matched', () => {
  const get = engine({ imports: [
    imp('c', 'Checking', 'deposit', [tx('2026-10-01', 'BILL PAY XYZ', 100)]),
    imp('k', 'Card', 'credit', [tx('2026-10-20', 'CREDIT ADJ', -100)]) ] });
  assert.ok(!get('all_txns').some((x) => x.matched));
});

test('recorded balances roll forward with later imported transactions', () => {
  const get = engine({ imports: [
    imp('b', 'Checking', 'deposit', [], { balance: 1000, balanceMonth: '2026-09', asOf: '2026-09-30', rowCount: 0 }),
    imp('t', 'Checking', 'deposit', [tx('2026-10-05', 'RENT', 600), tx('2026-10-15', 'PAYROLL', -2000)]) ] });
  const oct = get('balances').find((r) => r.kind === 'deposit' && r.month === '2026-10');
  assert.ok(oct, 'October balance exists');
  assert.equal(Math.round(oct.balance), 2400);
});

test('balance totals add up accounts of one kind', () => {
  const get = engine({ imports: [
    imp('x', 'Empower 401k', 'investment', [], { balance: 50000, balanceMonth: '2026-10', asOf: '2026-10-31', rowCount: 0 }),
    imp('y', 'Roth IRA', 'investment', [], { balance: 20000, balanceMonth: '2026-10', asOf: '2026-10-31', rowCount: 0 }),
    imp('z', 'Checking', 'deposit', [tx('2026-10-02', 'X', 1)]) ] });
  const inv = get('balance_totals').find((r) => r.kind === 'investment' && r.month === '2026-10');
  assert.equal(inv.total, 70000);
});

test('a vendor marked "Not recurring" drops out of subscriptions and recurring bills', () => {
  const t = ['2026-07-03', '2026-08-03', '2026-09-03', '2026-10-03'].map((d) => tx(d, 'VENMO PAYMENT', 40));
  const base = { imports: [imp('a', 'Checking', 'deposit', t)] };
  assert.ok(engine(base)('subs').some((x) => /venmo/i.test(x.vendor)));
  const hidden = engine({ ...base, prefs: [{ book: 'Personal', key: 'notRecurring', value: JSON.stringify(['Venmo Payment']), createdAt: '2026-11-01' }] })('subs');
  assert.ok(!hidden.some((x) => /venmo/i.test(x.vendor)));
});

test('mortgage payments count in budgets once, and the setting can leave them out', () => {
  const data = { imports: [imp('c', 'Checking', 'deposit', [tx('2026-10-01', 'ONLINE PAYMENT', 1850)]), imp('m', 'Home loan', 'mortgage', [tx('2026-10-02', 'PAYMENT RECEIVED', -1850)])] };
  const mtg = (get) => get('categories').filter((r) => r.category === 'Mortgage' && r.month === '2026-10').reduce((s, r) => s + r.actual, 0);
  assert.equal(mtg(engine(data)), 1850);
  const off = { ...data, prefs: [{ book: 'Personal', key: 'settings', value: JSON.stringify({ hideParts: ['b-mtg'] }), createdAt: '2026-11-01' }] };
  assert.equal(mtg(engine(off)), 0);
  const bank = { imports: [imp('c', 'Checking', 'deposit', [tx('2026-10-01', 'ONLINE TRANSFER TO MORTGAGE', 1850)]), imp('m', 'Home loan', 'mortgage', [tx('2026-10-02', 'PAYMENT RECEIVED', -1850)])] };
  assert.equal(mtg(engine(bank)), 1850);
});
