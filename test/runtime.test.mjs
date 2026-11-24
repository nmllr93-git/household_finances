// The dashboard loader (public/runtime.js): only the newest load may change what's shown (review R5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function setup() {
  const pending = [];
  const fake = { querySelectorAll: () => [], getElementById: () => null, createElement: () => ({ setAttribute() {}, append() {}, addEventListener() {}, style: {} }), body: { prepend() {} }, activeElement: null };
  const win = { innerWidth: 1000, addEventListener() {}, FDStore: { json: (m, u) => new Promise((res, rej) => pending.push({ u, res, rej })) } };
  const ctx = { window: win, document: fake, navigator: { onLine: true }, requestAnimationFrame: (f) => f(), setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, history: { replaceState() {} }, console };
  win.window = win; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(new URL('../public/runtime.js', import.meta.url), 'utf8'), ctx);
  return { HF: win.HF, dash: win.dash, pending };
}
const flush = () => new Promise((r) => setImmediate(r));

test('a late answer for an earlier load of the same dashboard is ignored', async () => {
  const { HF, dash, pending } = setup();
  HF.load('a'); HF.load('a');
  pending[1].res({ rules: [{ match: 'NEW' }] }); await flush();
  pending[0].res({ rules: [{ match: 'OLD' }] }); await flush();
  assert.equal(dash.data('rules').data[0].match, 'NEW');
});
test('a late failure after switching dashboards doesn\'t break the open one', async () => {
  const { HF, dash, pending } = setup();
  HF.load('a'); HF.load('b');
  pending[1].res({ rules: [{ match: 'B' }] }); await flush();
  pending[0].rej(new Error('boom')); await flush();
  assert.equal(dash.data('rules').status, 'ok'); assert.equal(dash.data('rules').data[0].match, 'B');
});
test('a failure of the current load still shows as an error', async () => {
  const { HF, dash, pending } = setup();
  HF.load('a'); pending[0].rej(new Error('offline')); await flush();
  assert.equal(dash.data('rules').status, 'error');
});
