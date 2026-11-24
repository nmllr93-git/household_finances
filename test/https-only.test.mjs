// Review R6: other devices must use HTTPS by default; the computer itself can still use http; a host setting allows http.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import https from 'node:https';
const require = createRequire(import.meta.url);
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'fd-tls-')); process.env.DATA_DIR = DIR;
const srv = require('../server.js');
const lanIp = Object.values(os.networkInterfaces()).flat().find((n) => n && n.family === 'IPv4' && !n.internal)?.address;
let port = 0;
before(async () => { srv.addUser('alice', 'password123', srv.books().map((b) => b.id)); port = (await srv.start({ mode: 'host', port: 0, quiet: true })).port; });
after(async () => { await srv.stop(); try { fs.rmSync(DIR, { recursive: true, force: true }); } catch {} });
const get = (url, opts = {}) => fetch(url, { redirect: 'manual', ...opts });
const httpsJson = (host, p, body) => new Promise((res, rej) => { const r = https.request({ host, port, path: p, method: body ? 'POST' : 'GET', rejectUnauthorized: false, headers: body ? { 'Content-Type': 'application/json' } : {} }, (x) => { let d = ''; x.on('data', (c) => (d += c)); x.on('end', () => res({ status: x.statusCode, body: d })); }); r.on('error', rej); if (body) r.write(JSON.stringify(body)); r.end(); });

test('other devices: http sign-in is refused and pages redirect to https; ping still answers', { skip: !lanIp }, async () => {
  assert.equal((await get(`http://${lanIp}:${port}/api/ping`)).status, 200);
  const l = await get(`http://${lanIp}:${port}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'alice', password: 'password123' }) });
  assert.equal(l.status, 403); assert.match((await l.json()).https, /^https:/);
  const pg = await get(`http://${lanIp}:${port}/`); assert.equal(pg.status, 307); assert.match(pg.headers.get('location'), /^https:\/\//);
  assert.equal((await httpsJson(lanIp, '/api/login', { username: 'alice', password: 'password123' })).status, 200);
});
test('the computer itself can still use http', async () => {
  const l = await get(`http://127.0.0.1:${port}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'alice', password: 'password123' }) });
  assert.equal(l.status, 200);
});
test('the host setting allows http from other devices again', { skip: !lanIp }, async () => {
  srv.setAllowHttp(true);
  try { const l = await get(`http://${lanIp}:${port}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'alice', password: 'password123' }) }); assert.equal(l.status, 200); }
  finally { srv.setAllowHttp(false); }
});
test('a forwarded-proto header is ignored unless a trusted proxy is configured', { skip: !lanIp }, async () => {
  const l = await get(`http://${lanIp}:${port}/api/me`, { headers: { 'X-Forwarded-Proto': 'https' } }); assert.equal(l.status, 403);
});
