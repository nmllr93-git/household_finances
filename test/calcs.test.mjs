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

// ---- review R3: duplicates are judged per account, with the bank's own ids when there are any ----
const spend = (get) => get('txns').filter((x) => x.type === 'expense').reduce((s, x) => s + x.amount, 0);
test('identical purchases in two different accounts both count', () => {
  const get = engine({ imports: [imp('a', 'Checking', 'deposit', [tx('2026-10-03', 'COFFEE SHOP', 4.5)]), imp('b', 'Visa', 'credit', [tx('2026-10-03', 'COFFEE SHOP', 4.5)])] });
  assert.equal(spend(get), 9);
});
test('two genuine identical purchases on one statement both count', () => {
  const get = engine({ imports: [imp('a', 'Checking', 'deposit', [tx('2026-10-03', 'COFFEE SHOP', 4.5), tx('2026-10-03', 'COFFEE SHOP', 4.5)])] });
  assert.equal(spend(get), 9);
});
test('importing the same statement again adds nothing; an overlapping one adds only what is new', () => {
  const rows = [tx('2026-10-03', 'COFFEE SHOP', 4.5), tx('2026-10-03', 'COFFEE SHOP', 4.5), tx('2026-10-05', 'GROCER', 60)];
  assert.equal(spend(engine({ imports: [imp('a', 'Checking', 'deposit', rows), imp('b', 'Checking', 'deposit', rows)] })), 69);
  assert.equal(spend(engine({ imports: [imp('a', 'Checking', 'deposit', rows), imp('b', 'Checking', 'deposit', [...rows, tx('2026-10-03', 'COFFEE SHOP', 4.5), tx('2026-10-09', 'GAS', 30)])] })), 103.5);
});
test('overlapping OFX exports: the same FITID counts once, different FITIDs count separately', () => {
  const a = [{ ...tx('2026-10-03', 'COFFEE SHOP', 4.5), id: 'F1' }, { ...tx('2026-10-04', 'GROCER', 60), id: 'F2' }];
  const b = [{ ...tx('2026-10-04', 'GROCER', 60), id: 'F2' }, { ...tx('2026-10-04', 'GROCER', 60), id: 'F3' }];
  assert.equal(spend(engine({ imports: [imp('a', 'Checking', 'deposit', a), imp('b', 'Checking', 'deposit', b)] })), 124.5);
});
test('a statement without ids and bank sync with ids for the same purchases count once', () => {
  const st = [tx('2026-10-03', 'COFFEE SHOP', 4.5), tx('2026-10-03', 'COFFEE SHOP', 4.5)];
  const sync = [{ ...tx('2026-10-03', 'COFFEE SHOP', 4.5), id: 'S1' }, { ...tx('2026-10-03', 'COFFEE SHOP', 4.5), id: 'S2' }, { ...tx('2026-10-04', 'GAS', 30), id: 'S3' }];
  assert.equal(spend(engine({ imports: [imp('a', 'Checking', 'deposit', st), imp('b', 'Checking', 'deposit', sync)] })), 39);
});

// ---- statement reconciliation ----
const RC = (() => { const ctx = { dash: { calc: () => {}, params: () => ({}) }, console, Date, Math, JSON, Intl }; vm.runInNewContext(SRC, ctx); return ctx.reconcileStatement; })();
const rows = [tx('2026-05-02', 'GROCER', 60.1), tx('2026-05-05', 'PAYROLL', -1000), tx('2026-05-09', 'GAS', 40.25)];
test('reconcile: a checking statement that adds up balances to the cent', () => {
  const r = RC({ kind: 'deposit', opening: 500, closing: 1399.65, rows });
  assert.equal(r.balanced, true); assert.equal(r.diff, 0); assert.equal(r.expected, 1399.65);
});
test('reconcile: an omitted row shows a discrepancy and points at it', () => {
  const r = RC({ kind: 'deposit', opening: 500, closing: 1399.65, rows: rows.filter((t) => t.description !== 'GAS') });
  assert.equal(r.balanced, false); assert.equal(r.diff, -40.25);
  const r2 = RC({ kind: 'deposit', opening: 500, closing: 1399.65, rows: [...rows, tx('2026-05-10', 'EXTRA', 40.25)] });
  assert.equal(r2.diff, 40.25); assert.ok(r2.candidates.some((t) => t.description === 'EXTRA'));
});
test('reconcile: a sign-flipped row shows twice its amount and is flagged', () => {
  const flipped = rows.map((t) => (t.description === 'GROCER' ? { ...t, amount: -60.1 } : t));
  const r = RC({ kind: 'deposit', opening: 500, closing: 1399.65, rows: flipped });
  assert.equal(r.diff, -120.2); assert.ok(r.candidates.some((t) => t.description === 'GROCER' && /sign/.test(t.why)));
});
test('reconcile: credit cards count purchases up and payments down; the period filters rows', () => {
  const cc = [tx('2026-05-01', 'STORE', 120), tx('2026-05-20', 'PAYMENT THANK YOU', -300), tx('2026-06-02', 'NEXT MONTH', 9)];
  const r = RC({ kind: 'credit', opening: 450, closing: 270, rows: cc, from: '2026-05-01', to: '2026-05-31' });
  assert.equal(r.balanced, true); assert.equal(r.count, 2);
  assert.equal(RC({ kind: 'investment', opening: 1, closing: 1, rows: cc }).ok, false);
  assert.equal(RC({ kind: 'deposit', opening: '', closing: 1, rows: cc }).reason, 'missing');
});
test('reconcile: cents add up exactly (no floating-point drift)', () => {
  const many = Array.from({ length: 1000 }, (_, i) => tx('2026-05-01', 'X' + i, 0.1));
  assert.equal(RC({ kind: 'deposit', opening: 100, closing: 0, rows: many }).balanced, true);
});

// ---- household settlements ----
const ST = (() => { const ctx = { dash: { calc: () => {}, params: () => ({}) }, console, Date, Math, JSON, Intl }; vm.runInNewContext(SRC, ctx); return { bal: ctx.settlementBalances, stm: ctx.settlementStatement }; })();
test('settlements: a closed period says who owes whom; a payment reduces it without touching spending', () => {
  const people = [{ name: 'Alex', pct: 50 }, { name: 'Sam', pct: 50 }];
  const p1 = ST.stm(people, { Alex: 700, Sam: 300 });
  assert.equal(p1.total, 1000); assert.equal(p1.net.Alex, 200); assert.equal(p1.net.Sam, -200);
  let b = ST.bal([p1], []); assert.deepEqual(JSON.parse(JSON.stringify(b.transfers)), [{ from: 'Sam', to: 'Alex', amount: 200 }]);
  b = ST.bal([p1], [{ from: 'Sam', to: 'Alex', amount: 150, date: '2026-06-01' }]); assert.equal(b.transfers[0].amount, 50);
  assert.equal(p1.total, 1000); // the saved statement (and spending) is unchanged by the payment
  b = ST.bal([p1], [{ from: 'Sam', to: 'Alex', amount: 200 }]); assert.equal(b.even, true);
});
test('settlements: uneven shares, several periods, cents and three people', () => {
  const p = ST.stm([{ name: 'A', pct: 60 }, { name: 'B', pct: 40 }], { A: 100, B: 100.01 });
  assert.equal(Math.round((p.net.A + p.net.B) * 100), 0); // shares always add back to the total
  const q = ST.stm([{ name: 'A', pct: 34 }, { name: 'B', pct: 33 }, { name: 'C', pct: 33 }], { A: 0, B: 0, C: 300 });
  const b = ST.bal([p, q], [{ from: 'A', to: 'A', amount: 5 }, { from: 'B', to: 'C', amount: -3 }]); // a payment to yourself or a negative one is ignored
  const owedToC = b.transfers.filter((t) => t.to === 'C').reduce((s, t) => s + t.amount, 0);
  assert.ok(Math.abs(owedToC - 201) < 0.01); // C's share is the remainder (99), so C paid 201 more than their share
});
test('settlements: a closed period keeps its recorded split even if the shares change later', () => {
  const people = [{ name: 'Alex', pct: 50 }, { name: 'Sam', pct: 50 }];
  const closed = ST.stm(people, { Alex: 600, Sam: 400 }); people[0].pct = 70; people[1].pct = 30;
  assert.equal(ST.bal([closed], []).net.Alex, 100);
});

// ---- confirmed bills and paydays in forecasts ----
const J = (x) => JSON.parse(JSON.stringify(x));
const FC = (() => { const ctx = { dash: { calc: () => {}, params: () => ({}) }, console, Date, Math, JSON, Intl }; vm.runInNewContext(SRC, ctx); return { occ: ctx.scheduleOccurrences, merge: ctx.mergeForecast }; })();
test('schedules: monthly, biweekly and one-time occurrences inside the window', () => {
  const s = [{ id: 'r', kind: 'bill', label: 'Rent', amount: 1500, every: 'monthly', start: '2026-01-01' },
    { id: 'p', kind: 'pay', label: 'Paycheck', amount: 2100, every: 'biweekly', start: '2026-11-06' },
    { id: 'o', kind: 'bill', label: 'Tuition', amount: 900, every: 'once', start: '2027-01-10' }];
  const ev = FC.occ(s, '2026-11-23', 60);
  assert.deepEqual(J(ev.filter((e) => e.id === 'r').map((e) => e.date)), ['2026-12-01', '2027-01-01']);
  assert.deepEqual(J(ev.filter((e) => e.id === 'p').map((e) => e.date)), ['2026-12-04', '2026-12-18', '2027-01-01', '2027-01-15']);
  assert.equal(ev.find((e) => e.id === 'o').amt, -900); assert.ok(ev.filter((e) => e.id === 'p').every((e) => e.amt === 2100));
});
test('schedules: the 31st stays at month end; skip and reschedule change one occurrence only', () => {
  const ev = FC.occ([{ id: 'c', kind: 'bill', label: 'Card', amount: 50, every: 'monthly', start: '2026-10-31', overrides: { '2026-12-31': { skip: true }, '2027-01-31': { date: '2027-02-03', amount: 75 } } }], '2026-11-01', 120);
  assert.deepEqual(J(ev.map((e) => [e.date, e.amt])), [['2026-11-30', -50], ['2027-02-03', -75], ['2027-02-28', -50]]);
  assert.ok(ev[1].moved && ev[1].changed);
});
test('forecast: a confirmed bill replaces its estimate instead of adding to it', () => {
  const est = [{ day: 3, label: 'Electric Co', amt: -120 }, { day: 5, label: 'Netflix', amt: -15 }, { day: 7, label: 'Acme Payroll', amt: 2000 }];
  const conf = FC.occ([{ id: 'e', kind: 'bill', label: 'Electric (confirmed)', amount: 143.2, every: 'monthly', start: '2026-12-04', replaces: 'Electric Co' }], '2026-12-01', 30);
  const m = FC.merge(est, conf);
  assert.equal(m.filter((e) => /Electric/.test(e.label)).length, 1); assert.equal(m.find((e) => /Electric/.test(e.label)).amt, -143.2);
  assert.equal(m.length, 3); assert.equal(m.reduce((s, e) => s + e.amt, 0), 2000 - 15 - 143.2);
});
test('schedules never become transactions', () => {
  const get = engine({ prefs: [{ book: 'Personal', key: 'schedules', value: JSON.stringify([{ id: 'r', kind: 'bill', label: 'Rent', amount: 1500, every: 'monthly', start: '2026-01-01' }]) }] });
  assert.equal(get('txns').length, 0);
});

// ---- custom reports ----
const CR = (() => { const ctx = { dash: { calc: () => {}, params: () => ({}) }, console, Date, Math, JSON, Intl }; vm.runInNewContext(SRC, ctx); return (...a) => J(ctx.customReport(...a)); })();
const T0 = [
  { book: 'P', month: '2026-09', date: '2026-09-02', type: 'expense', amount: 60.1, category: 'Groceries', vendor: 'Grocer', source: 'Card', tags: ['trip'] },
  { book: 'P', month: '2026-09', date: '2026-09-05', type: 'expense', amount: 0.1, category: 'Groceries', vendor: 'Grocer', source: 'Checking' },
  { book: 'P', month: '2026-10', date: '2026-10-03', type: 'expense', amount: 0.2, category: 'Dining', vendor: 'Cafe', source: 'Card', tags: ['trip', 'work'] },
  { book: 'P', month: '2026-10', date: '2026-10-04', type: 'income', amount: 1000, category: 'Paycheck', vendor: 'Acme', source: 'Checking' },
  { book: 'P', month: '2026-10', date: '2026-10-06', type: 'transfer', amount: 500, category: 'Transfer', vendor: 'Savings', source: 'Checking' },
  { book: 'S', month: '2026-10', date: '2026-10-06', type: 'expense', amount: 99, category: 'Dining', vendor: 'Other book', source: 'Card' }];
const M2 = ['2026-09', '2026-10'];
test('custom report: spending by category, in cents, this dashboard only, transfers left out', () => {
  const r = CR({ measure: 'spend', by: 'category' }, T0, [], M2, 'P');
  assert.deepEqual(r.groups.map((g) => [g.key, g.value]), [['Groceries', 60.2], ['Dining', 0.2]]);
  assert.equal(r.total, 60.4); assert.equal(r.groups[0].byMonth['2026-09'], 60.2);
});
test('custom report: net by month, income, count, average, weekday and tags', () => {
  assert.deepEqual(CR({ measure: 'net', by: 'month' }, T0, [], M2, 'P').groups.map((g) => [g.key, g.value]), [['2026-09', -60.2], ['2026-10', 999.8]]);
  assert.equal(CR({ measure: 'income', by: 'none' }, T0, [], M2, 'P').total, 1000);
  assert.equal(CR({ measure: 'count', by: 'none' }, T0, [], M2, 'P').total, 3);
  assert.equal(CR({ measure: 'avg', by: 'none' }, T0, [], M2, 'P').total, 20.13);
  assert.equal(CR({ measure: 'spend', by: 'weekday' }, T0, [], M2, 'P').groups[0].key, 'Wednesday'); // 2026-09-02
  assert.deepEqual(CR({ measure: 'spend', by: 'tag' }, T0, [], M2, 'P').groups.map((g) => [g.key, g.value]), [['trip', 60.3], ['work', 0.2]]);
});
test('custom report: filters, top N with "everything else", and the month window', () => {
  assert.equal(CR({ measure: 'spend', by: 'none', filter: { categories: ['groceries'] } }, T0, [], M2, 'P').total, 60.2);
  assert.equal(CR({ measure: 'spend', by: 'none', filter: { accounts: ['card'] } }, T0, [], M2, 'P').total, 60.3);
  assert.equal(CR({ measure: 'spend', by: 'none', filter: { text: 'caf' } }, T0, [], M2, 'P').total, 0.2);
  assert.equal(CR({ measure: 'spend', by: 'none', filter: { min: 1 } }, T0, [], M2, 'P').total, 60.1);
  const t1 = CR({ measure: 'spend', by: 'vendor', top: 1 }, T0, [], M2, 'P'); assert.equal(t1.groups.length, 1); assert.equal(t1.other.value, 0.2);
  assert.equal(CR({ measure: 'spend', by: 'none' }, T0, [], ['2026-10'], 'P').total, 0.2);
});
test('custom report: balances use the latest month in the window, by account or as a monthly series', () => {
  const B = [{ book: 'P', month: '2026-09', label: 'Checking', kind: 'deposit', balance: 100 }, { book: 'P', month: '2026-10', label: 'Checking', kind: 'deposit', balance: 150 }, { book: 'P', month: '2026-10', label: 'Brokerage', kind: 'investment', balance: 1000.01 }];
  assert.deepEqual(CR({ measure: 'balance', by: 'account' }, [], B, M2, 'P').groups.map((g) => [g.key, g.value]), [['Brokerage', 1000.01], ['Checking', 150]]);
  const bm = CR({ measure: 'balance', by: 'month' }, [], B, M2, 'P'); assert.deepEqual(bm.groups.map((g) => g.value), [100, 1150.01]); assert.equal(bm.total, 1150.01);
});
