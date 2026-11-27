// Receipt scanning: store, date and total read from receipt text (the text itself comes from the phone).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const R = createRequire(import.meta.url)('../public/receipt.js');

test('grocery receipt: TOTAL line wins over subtotal and tax', () => {
  const r = R.parse('HY-VEE\n1720 WATERFRONT DR\n(319) 555-0100\nMILK 3.49\nSUBTOTAL 4.78\nTAX 0.29\nTOTAL 5.07\nVISA ****1234 5.07\n11/22/26 14:03');
  assert.equal(r.vendor, 'Hy-Vee'); assert.equal(r.date, '2026-11-22'); assert.equal(r.total, 5.07);
});
test('total printed on the next line, named month date', () => {
  const r = R.parse('Corner Cafe\nOrder #42\nLatte 5.50\nSubtotal 8.75\nTip 2.00\nTotal\n$10.75\nNov 3, 2026 8:15 AM');
  assert.equal(r.vendor, 'Corner Cafe'); assert.equal(r.date, '2026-11-03'); assert.equal(r.total, 10.75);
});
test('total savings and items sold are not the total', () => {
  const r = R.parse('TARGET\nITEMS SOLD 3\nSUBTOTAL $41.20\nTOTAL SAVINGS 4.00\nTOTAL $1,043.67\n2026-10-09');
  assert.equal(r.total, 1043.67); assert.equal(r.date, '2026-10-09');
});
test('comma decimals and no total line: falls back to the largest amount', () => {
  const r = R.parse('Main Street Diner\nBurger 12,99\nFries 3,50\nSum 16,49');
  assert.equal(r.total, 16.49); assert.equal(r.date, '');
});
test('impossible dates are ignored', () => { assert.equal(R.parse('Shop\n13/45/26\nTOTAL 2.00').date, ''); });
test('reads actual tip amounts without mistaking suggestions or blank lines for a tip', () => {
  assert.equal(R.parse('Cafe\nTip: $2.50\nTotal 12.50').tip, 2.5);
  assert.equal(R.parse('Cafe\nGratuity\n$3.25\nTotal 13.25').tip, 3.25);
  assert.equal(R.parse('Cafe\nTip: ______\nTotal 12.50\nSuggested tip 20% 2.50').tip, null);
});
test('matches only a unique expense within three days using the chosen tip treatment', () => {
  const r = { id: 'r', book: 'Personal', vendor: 'Corner Cafe', date: '2026-11-01', total: 10, tip: 2, tipIncluded: false };
  const t = { key: 'i:a:0', book: 'Personal', vendor: 'Corner Cafe', date: '2026-11-04', amount: 12, type: 'expense' };
  assert.equal(R.matches([r], [t])[0].transaction.key, t.key);
  assert.equal(R.matches([{ ...r, tipIncluded: true }], [t]).length, 0);
  assert.equal(R.matches([{ ...r, tipIncluded: true, total: 12 }], [t]).length, 1);
  assert.equal(R.matches([{ ...r, tipIncluded: null }], [t]).length, 0);
  assert.equal(R.matches([r], [{ ...t, date: '2026-11-05' }]).length, 0);
  assert.equal(R.matches([r], [{ ...t, date: '2026-10-31' }]).length, 0);
  assert.equal(R.matches([r], [{ ...t, vendor: 'Other Cafe' }]).length, 0);
  assert.equal(R.matches([r], [{ ...t, vendor: 'Corner Cafeteria' }]).length, 0);
  assert.equal(R.matches([r], [t, { ...t, key: 'i:a:1' }]).length, 0);
  assert.equal(R.matches([r, { ...r, id: 'r2' }], [t]).length, 0);
  assert.equal(R.matches([r, { ...r, id: 'attached', txKey: t.key }], [t]).length, 0);
  assert.equal(R.matches([r], [{ ...t, type: 'income' }]).length, 0);
});
test('waiting reminder appears exactly two weeks after saving', () => {
  const r = { createdAt: '2026-11-01T00:00:00.000Z' }, now = Date.parse(r.createdAt);
  assert.equal(R.isAged(r, now + 14 * 864e5 - 1), false);
  assert.equal(R.isAged(r, now + 14 * 864e5), true);
  assert.equal(R.isAged({ createdAt: 'invalid' }, now), false);
});
test('matches a split transaction by its complete amount', () => {
  const r = { book: 'Personal', vendor: 'Market', date: '2026-11-01', total: 12, tip: null };
  const t = { key: 'i:a:0#1', splitOf: 'i:a:0', book: 'Personal', vendor: 'Market', date: '2026-11-01', amount: 5, type: 'expense' };
  assert.equal(R.matches([r], [t, { ...t, key: 'i:a:0#2', amount: 7 }])[0].transaction.key, 'i:a:0');
});
