// Vehicle value without a paid data service:
//  - a depreciation curve by age (steep early, easing to a few % a year after ~7 years, nearly flat past 12),
//  - a small, capped mileage adjustment (more than ~12,000 miles a year lowers it, fewer raises it),
//  - anchored to the last real value you entered (from KBB, Edmunds, VinAudit…), continuing the curve from there.
// Odometer: your readings over time; between readings, an estimate from your own pace (or a monthly estimate you set).
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.FDVehicle = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const DAY = 864e5, YEAR = 365.25 * DAY, MONTH = YEAR / 12;
  const ts = (d) => { const t = Date.parse(String(d || '').slice(0, 10) + 'T12:00:00'); return isFinite(t) ? t : NaN; };
  const num = (v) => { const n = Number(String(v ?? '').replace(/[^0-9.]/g, '')); return isFinite(n) ? n : 0; };
  // how it loses value: typical, holds value well (trucks, many Toyotas/Hondas), loses value fast (luxury, many EVs)
  const STYLE = { typical: 1, well: 0.7, fast: 1.35 };
  // yearly loss by age in years (age 0 = its first year)
  const rateAt = (age) => (age < 1 ? 0.20 : age < 2 ? 0.15 : age < 3 ? 0.12 : age < 5 ? 0.10 : age < 7 ? 0.08 : age < 10 ? 0.06 : age < 12 ? 0.04 : 0.02);

  const yearOf = (a) => { const y = Number(a.year) || Number((String(a.name || '').match(/\b(19[5-9]\d|20\d\d)\b/) || [])[1]); return y >= 1950 && y <= new Date().getFullYear() + 1 ? y : 0; };
  // model-year cars go on sale around the previous October; age is measured from then
  const ageAt = (y, t) => (t - Date.UTC(y - 1, 9, 1)) / YEAR;

  // value factor between two ages along the curve (e.g. 0.82 = keeps 82%)
  function keep(age0, age1, style) {
    const s = STYLE[style] || 1; let a = Math.max(0, age0), f = 1;
    const end = Math.max(a, age1);
    while (a < end - 1e-9) { const step = Math.min(end, Math.floor(a) + 1) - a; f *= Math.pow(1 - Math.min(0.6, rateAt(a) * s), step); a += step; }
    return f;
  }

  const readings = (a) => (Array.isArray(a.odo) ? a.odo : []).map((r) => ({ d: String(r.d || '').slice(0, 10), mi: num(r.mi) })).filter((r) => r.mi > 0 && isFinite(ts(r.d))).sort((x, y) => ts(x.d) - ts(y.d));
  // miles per month: from your readings over the last year (when they span at least a month), else your estimate, else ~1,000
  function pace(a, now = Date.now()) {
    const r = readings(a); const last = r[r.length - 1];
    if (r.length >= 2) {
      const recent = r.filter((x) => ts(x.d) >= ts(last.d) - 400 * DAY); let first = recent[0];
      if (ts(last.d) - ts(first.d) < 30 * DAY) first = r[0];
      const days = (ts(last.d) - ts(first.d)) / DAY;
      if (days >= 30 && last.mi >= first.mi) return { perMonth: Math.round(((last.mi - first.mi) / days) * (MONTH / DAY)), from: 'readings' };
    }
    const est = num(a.mpm); return { perMonth: est > 0 ? Math.round(est) : 1000, from: est > 0 ? 'estimate' : 'default' };
  }
  // odometer on a date: the last reading plus your pace since then (estimated = true between readings)
  function milesAt(a, t = Date.now()) {
    const r = readings(a); if (!r.length) return null;
    const before = r.filter((x) => ts(x.d) <= t), base = before.length ? before[before.length - 1] : r[0];
    const days = (t - ts(base.d)) / DAY; const p = pace(a, t).perMonth;
    const mi = days < 1 ? base.mi : Math.max(base.mi, Math.round(base.mi + days * (p / (MONTH / DAY))));
    return { mi, estimated: days > 1, base };
  }

  // value now. Old entries without a model year (or set to “fixed”) keep the plain yearly %.
  function valueNow(a, now = Date.now()) {
    const v = num(a.value), t0 = ts(a.asOf); if (!(v > 0)) return 0;
    if (!isFinite(t0) || now - t0 < DAY) return v; // same day: exactly what you entered
    const y = yearOf(a);
    if (a.type !== 'vehicle' || a.mode === 'fixed' || !y) return Math.max(0, v * Math.pow(1 - (Number(a.depr) || 0) / 100, (now - t0) / YEAR));
    let f = keep(ageAt(y, t0), ageAt(y, now), a.mode);
    // mileage: compare miles driven since the value was set with ~1,000 a month; 0.25% per 1,000 miles, at most ±10%
    const m0 = milesAt(a, t0), m1 = milesAt(a, now);
    if (m0 && m1) { const extra = (m1.mi - m0.mi) - ((now - t0) / MONTH) * 1000; f *= 1 - Math.max(-0.10, Math.min(0.10, (extra / 1000) * 0.0025)); }
    return Math.max(0, Math.round(v * f));
  }
  // what “typical” means in words, for the editor
  const describe = (a, now = Date.now()) => { const y = yearOf(a); if (!y) return ''; const age = ageAt(y, now); return `About ${Math.round(rateAt(age) * (STYLE[a.mode] || 1) * 100)}% a year at its age (${Math.max(0, Math.floor(age))} yr old)`; };
  // links to free value lookups (you type what they say back in)
  const lookups = () => [['Kelley Blue Book', 'https://www.kbb.com/whats-my-car-worth/'], ['Edmunds', 'https://www.edmunds.com/appraisal/'], ['VinAudit (by VIN)', 'https://www.vinaudit.com/car-value-calculator']];

  return { valueNow, milesAt, pace, readings, yearOf, keep, rateAt, describe, lookups, STYLE };
});
