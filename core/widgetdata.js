// Larenest: what the phone's home-screen widgets show, built from the same numbers as the dashboard.
//   runCalcs(calcsSource, data, params)  runs public/calcs.js (the dashboard's own calculations) outside the browser
//   build(input)                         turns those results, holdings, quotes and price history into one small summary
// The PC server uses both (GET /api/widgets); the phone's widget fetches that summary to refresh itself.
// The browser only uses build(): there the dashboard has already run the calculations.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FDWidgetData = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Run calcs.js against one dashboard's data. `data` = the raw datasets (what /api/books/:id/data returns).
  function runCalcs(calcsSource, data, params) {
    const defs = {}, memo = {};
    const dash = { calc: (id, def) => { defs[id] = def; }, params: () => ({ ...(params || {}) }) };
    if (typeof window === 'undefined') require('node:vm').runInNewContext(calcsSource, { dash, console: { log() {}, warn() {}, error() {} }, Date, Math, JSON, Intl, Number, String, Array, Object, Set, Map, RegExp, isFinite, parseFloat, parseInt }, { timeout: 20000 });
    else new Function('dash', calcsSource)(dash); // phone-only mode: the same file the dashboard already runs
    const get = (id) => {
      if (id in memo) return memo[id];
      const d = defs[id];
      memo[id] = d ? d.fn(...d.inputs.map(get)) : (data && data[id]) || [];
      return memo[id];
    };
    return get;
  }

  const r2 = (x) => Math.round(x * 100) / 100;
  const num = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
  const DAY = 864e5;

  // when a recurring charge comes next (same rule as the dashboard's bills list)
  function nextDue(x, today) {
    if (!x.lastDate) return null;
    const monthly = Math.abs(x.yearly - x.lastCharge * 12) < 1;
    const n = new Date(String(x.lastDate).slice(0, 10) + 'T00:00:00Z'); if (isNaN(n)) return null;
    let guard = 0; do { n.setUTCMonth(n.getUTCMonth() + (monthly ? 1 : 12)); } while (n < today && ++guard < 60);
    return { date: n, monthly };
  }

  // shares still held after sales (first bought, first sold)
  function sharesHeld(h) {
    const lots = (h.lots || []).filter((l) => num(l.qty) > 0).map((l) => ({ ...l, left: num(l.qty) })).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    for (const s of (h.sales || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
      let q = num(s.qty);
      for (const l of lots) { if (q <= 0) break; const take = Math.min(l.left, q); l.left -= take; q -= take; }
    }
    return lots.reduce((t, l) => t + l.left, 0);
  }

  // input: { name, label, budget (a budget_totals row), subs (subs rows for this dashboard), holdings, quotes, history,
  //          watch ([{symbol}]), sectors ([{name, change}] from markets), follow ([sector names]), marketOpen, now }
  function build(i) {
    const now = i.now ? new Date(i.now) : new Date(), today = new Date(now); today.setUTCHours(0, 0, 0, 0);
    const out = { v: 1, at: now.toISOString(), name: i.name || i.label || '' };

    // budget
    const b = i.budget;
    out.budget = b && b.categories ? { has: true, month: b.label || '', spent: r2(b.spent), available: r2(b.available), usedPct: b.usedPct == null ? null : Math.round(b.usedPct),
      monthPct: b.elapsed == null ? null : Math.round(b.elapsed * 100), projected: b.projected == null ? null : r2(b.projected) } : { has: false, month: (b && b.label) || '' };

    // bills and subscriptions in the next 30 days
    const end = today.getTime() + 30 * DAY;
    const subs = (i.subs || []).filter((x) => x.lastCharge > 0);
    out.bills = subs.map((x) => ({ x, due: nextDue(x, today) })).filter((o) => o.due && o.due.date.getTime() <= end).sort((a, b) => a.due.date - b.due.date).slice(0, 8)
      .map((o) => ({ name: String(o.x.vendor || '').slice(0, 40), amount: r2(o.x.lastCharge), date: o.due.date.toISOString().slice(0, 10), days: Math.round((o.due.date - today) / DAY) }));
    out.monthlySubs = r2(subs.reduce((t, x) => t + num(x.yearly) / 12, 0));

    // investments: today's value, and how it moved over 1, 7 and 30 days (from daily closes)
    const held = (i.holdings || []).map((h) => ({ sym: String(h.symbol || '').toUpperCase(), qty: sharesHeld(h), manual: num(h.manualPrice) })).filter((h) => h.sym && h.qty > 0);
    const q = i.quotes || {}, hist = i.history || {};
    if (held.length) {
      const price = (h) => (q[h.sym] && q[h.sym].price > 0 ? q[h.sym].price : h.manual || 0);
      const value = held.reduce((t, h) => t + h.qty * price(h), 0);
      const prev = held.reduce((t, h) => t + h.qty * (q[h.sym] && q[h.sym].prevClose > 0 ? q[h.sym].prevClose : price(h)), 0);
      // a value for each of the last 30 calendar days, using each stock's latest close on or before that day
      const series = [];
      for (let d = 30; d >= 0; d--) {
        const day = new Date(today.getTime() - d * DAY).toISOString().slice(0, 10);
        let v = 0, ok = true;
        for (const h of held) { const hs = hist[h.sym] || []; let c = null; for (const [dt, cl] of hs) { if (dt <= day) c = cl; else break; } if (c == null) { if (h.manual) c = h.manual; else { ok = false; break; } } v += h.qty * c; }
        series.push(ok ? r2(v) : null);
      }
      series[series.length - 1] = r2(value); // today = live price
      const back = (n) => { const v = series[series.length - 1 - n]; return v == null || !v ? null : { chg: r2(value - v), pct: Math.round(((value - v) / v) * 1000) / 10 }; };
      out.invest = { has: true, value: r2(value), d1: prev ? { chg: r2(value - prev), pct: Math.round(((value - prev) / prev) * 1000) / 10 } : null, d7: back(7), d30: back(30), series };
    } else out.invest = { has: false };

    // markets: followed sectors first (then the rest), and the watchlist
    const fol = new Set(i.follow || []);
    const secs = (i.sectors || []).filter((s) => s && s.name && isFinite(Number(s.change)));
    out.markets = { open: !!i.marketOpen,
      sectors: [...secs.filter((s) => fol.has(s.name)), ...secs.filter((s) => !fol.has(s.name))].slice(0, 6).map((s) => ({ name: s.name, pct: Math.round(Number(s.change) * 100) / 100, followed: fol.has(s.name) })),
      watch: (i.watch || []).map((w) => String(w.symbol || '').toUpperCase()).filter(Boolean).slice(0, 8).map((sym) => {
        const x = q[sym] || {}; return { sym, price: x.price > 0 ? r2(x.price) : null, pct: x.price > 0 && x.prevClose > 0 ? Math.round(((x.price - x.prevClose) / x.prevClose) * 1000) / 10 : null }; }) };
    // today's biggest gainers and losers (top 5 each)
    const mv = (l) => (Array.isArray(l) ? l : []).filter((x) => x && x.symbol && isFinite(Number(x.change))).slice(0, 5)
      .map((x) => ({ sym: String(x.symbol).toUpperCase().slice(0, 8), name: String(x.name || '').slice(0, 40), mine: fol.has(x.sector), price: Number(x.price) > 0 ? r2(Number(x.price)) : null, pct: Math.round(Number(x.change) * 10) / 10 }));
    // when you follow sectors, movers from those sectors come first (others fill in if there are too few)
    const mvs = i.movers || {}, pick = (l) => { l = Array.isArray(l) ? l : []; if (!fol.size) return l; const inF = l.filter((x) => x && fol.has(x.sector)); return [...inF, ...l.filter((x) => !inF.includes(x))]; };
    out.markets.gainers = mv(pick(mvs.gainers)); out.markets.losers = mv(pick(mvs.losers)); out.markets.followed = fol.size > 0;
    return out;
  }

  return { runCalcs, build, nextDue, sharesHeld };
});
