import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import https from 'node:https';
import crypto from 'node:crypto';
const T = createRequire(import.meta.url)('../core/tlscert.js');

test('self-signed certificate works for HTTPS and its fingerprint matches', async () => {
  const c = T.makeSelfSigned({ names: ['localhost'], ips: ['127.0.0.1', '192.168.1.20'] });
  assert.match(c.fp, /^[0-9A-F]{64}$/);
  assert.equal(new crypto.X509Certificate(c.cert).fingerprint256.replace(/:/g, ''), c.fp);
  const srv = https.createServer({ cert: c.cert, key: c.key }, (q, r) => r.end('ok'));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const body = await new Promise((res, rej) => https.get({ host: '127.0.0.1', port: srv.address().port, ca: c.cert, servername: 'localhost' }, (r) => { let d = ''; r.on('data', (x) => (d += x)); r.on('end', () => res(d)); }).on('error', rej));
  srv.close(); assert.equal(body, 'ok');
  assert.ok(new crypto.X509Certificate(c.cert).checkIP('192.168.1.20'));
});
