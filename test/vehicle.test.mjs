import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const V = createRequire(import.meta.url)('../public/vehicle.js');
const T = (d) => Date.parse(d + 'T12:00:00');

test('curve slows with age: an 8-year-old car loses far less a year than a 1-year-old', () => {
  const young = V.valueNow({ type: 'vehicle', year: 2025, value: 30000, asOf: '2025-11-01' }, T('2026-11-01'));
  const old = V.valueNow({ type: 'vehicle', year: 2018, value: 15000, asOf: '2025-11-01' }, T('2026-11-01'));
  assert.ok(30000 - young > 4000 && 30000 - young < 6500, `young ${young}`);
  assert.ok(15000 - old > 600 && 15000 - old < 1300, `old ${old}`);
});

test('holds-value-well loses less than typical; fixed mode keeps the old yearly %', () => {
  const a = { type: 'vehicle', year: 2020, value: 20000, asOf: '2025-01-01' };
  assert.ok(V.valueNow({ ...a, mode: 'well' }, T('2026-01-01')) > V.valueNow(a, T('2026-01-01')));
  assert.ok(Math.abs(V.valueNow({ ...a, mode: 'fixed', depr: 10 }, T('2026-01-01')) - 18000) < 5);
  assert.equal(V.valueNow({ type: 'vehicle', name: 'My car', value: 1000, asOf: '2025-01-01', depr: 0 }, T('2026-01-01')), 1000); // no year: old behaviour
});

test('odometer: pace from readings, estimate between them, default 1,000/month', () => {
  const a = { odo: [{ d: '2026-01-01', mi: 40000 }, { d: '2026-07-01', mi: 46000 }] };
  assert.equal(V.pace(a).from, 'readings'); assert.ok(Math.abs(V.pace(a).perMonth - 1006) < 15);
  const m = V.milesAt(a, T('2026-08-01')); assert.ok(m.estimated && m.mi > 46900 && m.mi < 47100);
  assert.deepEqual(V.pace({ odo: [{ d: '2026-01-01', mi: 5 }] }), { perMonth: 1000, from: 'default' });
  assert.deepEqual(V.pace({ mpm: 700 }), { perMonth: 700, from: 'estimate' });
});

test('high mileage lowers the value a little (capped)', () => {
  const base = { type: 'vehicle', year: 2019, value: 18000, asOf: '2026-01-01' };
  const low = V.valueNow({ ...base, odo: [{ d: '2026-01-01', mi: 60000 }], mpm: 500 }, T('2027-01-01'));
  const high = V.valueNow({ ...base, odo: [{ d: '2026-01-01', mi: 60000 }], mpm: 3000 }, T('2027-01-01'));
  assert.ok(high < low && low - high < 18000 * 0.2);
});

test('model year from the name', () => { assert.equal(V.yearOf({ name: '2018 Honda Civic EX' }), 2018); });
