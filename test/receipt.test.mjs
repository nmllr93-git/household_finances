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
