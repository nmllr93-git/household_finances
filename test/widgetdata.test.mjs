import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const W = require('../core/widgetdata.js');

const now = '2026-11-23T15:00:00Z';
const day = (n) => new Date(Date.parse('2026-11-23T00:00:00Z') - n * 864e5).toISOString().slice(0, 10);

test('investments: value, 1/7/30-day change and a 31-point line from daily closes', () => {
  const hist = []; for (let n = 40; n >= 1; n--) hist.push([day(n), 100 + (40 - n)]); // 100 … 139, rising $1 a day
  const out = W.build({ now, label: 'Personal', holdings: [{ symbol: 'abc', lots: [{ date: '2025-01-01', qty: 10, price: 50 }], sales: [{ date: '2025-06-01', qty: 2 }] }],
    quotes: { ABC: { price: 141, prevClose: 139 } }, history: { ABC: hist } });
  assert.equal(out.invest.has, true);
  assert.equal(out.invest.value, 8 * 141, '8 shares left after selling 2');
  assert.deepEqual(out.invest.d1, { chg: 16, pct: 1.4 });
  assert.equal(out.invest.series.length, 31);
  assert.equal(out.invest.d7.chg, 8 * 141 - 8 * 133, '7 days ago the close was 133');
  assert.ok(out.invest.d30.pct > 0);
});

test('bills: next 30 days, soonest first; monthly subscription total', () => {
  const subs = [{ vendor: 'Netflix', lastCharge: 15.49, yearly: 185.88, lastDate: '2026-11-01' }, { vendor: 'Insurance', lastCharge: 600, yearly: 600, lastDate: '2026-02-10' },
    { vendor: 'Spotify', lastCharge: 11.99, yearly: 143.88, lastDate: '2026-10-25' }];
  const out = W.build({ now, label: 'Personal', subs });
  assert.deepEqual(out.bills.map((b) => [b.name, b.date]), [['Spotify', '2026-11-25'], ['Netflix', '2026-12-01']]);
  assert.equal(out.bills[0].days, 2);
  assert.equal(out.monthlySubs, Math.round((185.88 + 600 + 143.88) / 12 * 100) / 100);
});

test('markets: followed sectors first, watchlist % change', () => {
  const out = W.build({ now, label: 'Personal', sectors: [{ name: 'Energy', change: 1.234 }, { name: 'Technology', change: -0.5 }], follow: ['Technology'],
    watch: [{ symbol: 'xyz' }], quotes: { XYZ: { price: 110, prevClose: 100 } } });
  assert.deepEqual(out.markets.sectors.map((s) => [s.name, s.followed]), [['Technology', true], ['Energy', false]]);
  assert.deepEqual(out.markets.watch, [{ sym: 'XYZ', price: 110, pct: 10 }]);
});

test('runCalcs: the dashboard’s own calcs.js runs outside the browser', () => {
  const src = fs.readFileSync(new URL('../public/calcs.js', import.meta.url), 'utf8');
  const get = W.runCalcs(src, { sheet_history: [], sheet_balances: [], sheet_budgets: [], imports: [], manual: [], edits: [], rules: [], budgets: [], accounts: [], prefs: [] }, { range: '6m' });
  assert.ok(Array.isArray(get('budget_totals')));
  assert.ok(Array.isArray(get('subs')));
});

test('markets: top gainers and losers, five each', async () => {
  const { createRequire } = await import('node:module'); const W = createRequire(import.meta.url)('../core/widgetdata.js');
  const g = Array.from({ length: 7 }, (_, n) => ({ symbol: 'g' + n, name: 'G', price: 10 + n, change: 20 - n }));
  const o = W.build({ name: 'X', movers: { gainers: g, losers: [{ symbol: 'ab', price: 0, change: -12.34 }] } });
  assert.equal(o.markets.gainers.length, 5); assert.equal(o.markets.gainers[0].sym, 'G0'); assert.equal(o.markets.losers[0].pct, -12.3); assert.equal(o.markets.losers[0].price, null);
});
