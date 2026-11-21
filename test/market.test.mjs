// Shared market/economy data (core/market.js) with fake data services: answers, caching, pacing and persistence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { createMarketData } = createRequire(import.meta.url)('../core/market.js');

function fakeEnv(keys, saved = {}) {
  const calls = [];
  const fh = (u) => {
    if (u.includes('/quote?')) return { c: 100, pc: 98, t: 1700000000 };
    if (u.includes('profile2')) return { name: 'Thing Inc', finnhubIndustry: 'Semiconductors' };
    if (u.includes('company-news')) return [{ headline: 'News', source: 'X', url: 'https://x', datetime: 1700000000 }];
    if (u.includes('stock/metric')) return { metric: { '52WeekHigh': 120, '52WeekLow': 80 } };
    return [];
  };
  const fmp = (u) => {
    if (u.includes('biggest-gainers')) return [{ symbol: 'ZZZ', name: 'Zed', price: 5, changesPercentage: 40 }];
    if (u.includes('biggest-losers')) return [];
    if (u.includes('sector-performance')) return [{ sector: 'Technology', averageChange: 1.2 }, { sector: 'Energy', averageChange: -0.5 }];
    if (u.includes('historical-price-eod')) return [{ date: '2026-11-20', price: 100 }, { date: '2025-12-31', price: 80 }];
    if (u.includes('dividends')) return [{ date: '2026-09-01', dividend: 0.5 }];
    if (u.includes('quote?')) return [{ price: 2000, changePercentage: 0.3 }];
    return [];
  };
  return { calls, saved,
    getJson: async (u) => { calls.push(u); if (u.includes('finnhub')) return fh(u); if (u.includes('financialmodelingprep')) return fmp(u);
      if (u.includes('stlouisfed')) return { observations: [{ date: '2026-11-13', value: '6.5' }, { date: '2026-11-06', value: '6.6' }, { date: '2026-10-30', value: '.' }] };
      if (u.includes('nager')) return [{ date: '2026-12-25', name: 'Christmas' }]; throw new Error('HTTP 404'); },
    getText: async (u) => { calls.push(u); return 'Symbol,Date,Time,Open,High,Low,Close,Volume,Name\nAAPL.US,2026-11-20,22:00,1,1,1,230,1,"APPLE"'; },
    postJson: async (u) => { calls.push(u); return { status: 'REQUEST_SUCCEEDED', Results: { series: [] } }; },
    keys: () => keys, keyNote: () => '',
    load: async (n) => saved[n] || null, save: async (n, o) => { saved[n] = JSON.parse(JSON.stringify(o)); } };
}

test('quotes: Finnhub price plus profile sector, then served from cache', async () => {
  const env = fakeEnv({ finnhub: 'k' }), m = createMarketData(env);
  const q = await m.quotes(['NVDA']); assert.equal(q.NVDA.price, 100); assert.equal(q.NVDA.source, 'Finnhub'); assert.equal(q.NVDA.sector, 'Semiconductors');
  const n = env.calls.length; await m.quotes(['NVDA']); assert.equal(env.calls.length, n, 'no new calls within the hour');
});
test('quotes: no keys falls back to Stooq', async () => {
  const env = fakeEnv({}), q = await createMarketData(env).quotes(['AAPL']);
  assert.equal(q.AAPL.price, 230); assert.equal(q.AAPL.source, 'Stooq');
});
test('markets: builds once, saves, and a new instance reuses the saved copy', async () => {
  const env = fakeEnv({ finnhub: 'k', fmp: 'k' }), m = createMarketData(env);
  const a = await m.markets(false);
  assert.equal(a.indexes.length, 4); assert.equal(a.sectors[0].name, 'Technology'); assert.equal(a.gainers[0].symbol, 'ZZZ'); assert.equal(a.gainers[0].sector, 'Technology');
  const n = env.calls.length; await m.markets(false); assert.equal(env.calls.length, n, 'second call is paced');
  assert.ok(env.saved.market && env.saved.sectors);
  const env2 = fakeEnv({ finnhub: 'k', fmp: 'k' }, env.saved), b = await createMarketData(env2).markets(false);
  if (!createMarketData(env2).marketOpen()) assert.equal(env2.calls.length, 0, 'restart outside trading hours costs no calls');
  assert.equal(b.indexes.length, 4);
});
test('manual refresh within 10 minutes is ignored', async () => {
  const env = fakeEnv({ finnhub: 'k', fmp: 'k' }), m = createMarketData(env);
  await m.markets(false); const n = env.calls.length; await m.markets(true); assert.equal(env.calls.length, n);
});
test('economy: FRED observations sorted and blanks dropped, holidays loaded', async () => {
  const e = await createMarketData(fakeEnv({ fred: 'k' })).econ(false);
  assert.deepEqual(e.fred.mort30.obs.map((o) => o[0]), ['2026-11-06', '2026-11-13']); assert.equal(e.holidays[0][1], 'Christmas');
  assert.ok(e.errors.some((x) => /No BLS key/.test(x)));
});
test('dividends and holding details', async () => {
  const m = createMarketData(fakeEnv({ finnhub: 'k', fmp: 'k' }));
  assert.equal((await m.dividends(['VTI'])).VTI[0].amount, 0.5);
  const d = await m.stock('NVDA'); assert.equal(d.range.hi, 120); assert.equal(d.news.length, 1);
});
