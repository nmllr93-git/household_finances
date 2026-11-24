// The tiny ZIP writer used for the tax packet makes archives standard tools can open.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import vm from 'node:vm'; import { execFileSync } from 'node:child_process';
const ctx = { window: {}, TextEncoder, Uint8Array, Uint32Array, DataView, ArrayBuffer, Date };
vm.runInNewContext(fs.readFileSync(new URL('../public/zip.js', import.meta.url), 'utf8'), ctx);
test('zip: text and bytes, folders and unicode names, CRC checked by unzip', () => {
  const bytes = new Uint8Array(3000).map((_, i) => (i * 7) & 255);
  const z = ctx.window.FDZip([{ name: 'README.txt', data: 'Hello, café ✓' }, { name: 'receipts/2026-01-02_Shell_40.00.jpg', data: bytes }, { name: 'empty.csv', data: '' }]);
  assert.equal(ctx.window.FDZip.crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'zip-')), 't.zip'); fs.writeFileSync(f, z);
  const out = execFileSync('python3', ['-c', 'import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print("|".join(z.namelist())); print(z.read("README.txt").decode()); print(len(z.read(z.namelist()[1])))', f], { env: { ...process.env, PYTHONIOENCODING: 'utf-8' } }).toString().trim().split(/\r?\n/);
  assert.equal(out[0], 'README.txt|receipts/2026-01-02_Shell_40.00.jpg|empty.csv'); assert.equal(out[1], 'Hello, café ✓'); assert.equal(out[2], '3000');
});
