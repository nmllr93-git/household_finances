// The shared core with a plain in-memory store, the way the phone's on-device mode will use it (no server, no Node APIs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const core = createRequire(import.meta.url)('../core/books.js');

function memStore() {
  const docs = [], seed = [{ book_id: 'p', dataset: 'sheet_history', json: '[]' }]; let n = 0;
  return { docs,
    seedRows: async (b) => seed.filter((r) => r.book_id === b),
    listDocs: async (b, c) => docs.filter((d) => d.bookId === b && d.coll === c).map((d) => ({ id: d.id, json: d.json, created: d.created, created_by: d.createdBy })),
    insertDoc: async (r) => { docs.push(r); },
    deleteDoc: async (b, c, id) => { const i = docs.findIndex((d) => d.id === id && d.bookId === b && d.coll === c); if (i >= 0) docs.splice(i, 1); },
    replaceBookDocs: async (b, rows) => { for (let i = docs.length - 1; i >= 0; i--) if (docs[i].bookId === b) docs.splice(i, 1); docs.push(...rows.map((r) => ({ ...r, bookId: b }))); },
    newId: () => 'id' + ++n };
}
const book = { id: 'p', name: 'Personal', label: 'Personal' };

test('add, load, delete through the router', async () => {
  const api = core.createBookApi(memStore());
  const a = await api.handle('POST', ['goals'], book, async () => ({ name: 'Trip', target: '1500' }), 'me');
  assert.equal(a.status, 201);
  let d = (await api.handle('GET', ['data'], book)).body;
  assert.equal(d.goals[0].name, 'Trip'); assert.equal(d.goals[0].target, 1500); assert.deepEqual(d.sheet_budgets, []);
  assert.equal((await api.handle('DELETE', ['goals', a.body.id], book)).status, 200);
  d = (await api.handle('GET', ['data'], book)).body; assert.equal(d.goals.length, 0);
});
test('export/restore round trip and bad files', async () => {
  const api = core.createBookApi(memStore());
  await api.handle('POST', ['rules'], book, async () => ({ match: 'GAS', category: 'Auto' }), 'me');
  const ex = (await api.handle('GET', ['export'], book)).body;
  assert.equal((await api.handle('POST', ['restore'], book, async () => ({ nope: 1 }), 'me')).status, 400);
  const r = await api.handle('POST', ['restore'], book, async () => ex, 'me'); assert.equal(r.body.restored, 1);
});
test('unknown routes are 404', async () => { assert.equal((await core.createBookApi(memStore()).handle('GET', ['bogus'], book)).status, 404); });
