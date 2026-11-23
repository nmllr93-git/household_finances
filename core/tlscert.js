// HTTPS for the home network at no cost.
//  1. A certificate this computer makes for itself (no outside authority, no fee). The Larenest phone and PC apps
//     trust it because they learn its fingerprint when you scan the QR code (or the first time they connect).
//     Ordinary browsers on other computers show a one-time "not secure" warning, because nobody vouched for it.
//  2. A real certificate from Tailscale for this computer's *.ts.net name, when Tailscale is installed and
//     HTTPS certificates are turned on for your tailnet (free). Browsers trust that one with no warning.
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

// ---- a tiny DER encoder: just what an X.509 certificate needs ----
const len = (n) => (n < 128 ? Buffer.from([n]) : n < 256 ? Buffer.from([0x81, n]) : Buffer.from([0x82, n >> 8, n & 255]));
const tlv = (tag, body) => Buffer.concat([Buffer.from([tag]), len(body.length), body]);
const seq = (...x) => tlv(0x30, Buffer.concat(x));
const set = (...x) => tlv(0x31, Buffer.concat(x));
const int = (buf) => { if (buf[0] & 0x80) buf = Buffer.concat([Buffer.from([0]), buf]); return tlv(0x02, buf); };
const oid = (s) => { const p = s.split('.').map(Number), out = [40 * p[0] + p[1]];
  for (const v of p.slice(2)) { const b = []; let n = v; do { b.unshift(n & 127); n = Math.floor(n / 128); } while (n); for (let i = 0; i < b.length - 1; i++) b[i] |= 128; out.push(...b); }
  return tlv(0x06, Buffer.from(out)); };
const utf8 = (s) => tlv(0x0c, Buffer.from(s, 'utf8'));
const time = (d) => { const y = d.getUTCFullYear(), p = (n) => String(n).padStart(2, '0');
  const s = `${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
  return y < 2050 ? tlv(0x17, Buffer.from(String(y).slice(2) + s)) : tlv(0x18, Buffer.from(y + s)); };
const ctx = (n, body, constructed = true) => tlv((constructed ? 0xa0 : 0x80) | n, body);
const ipBytes = (ip) => { if (ip.includes(':')) { const full = ip.split('%')[0]; const parts = full.split('::'); const a = parts[0] ? parts[0].split(':') : [], b = parts[1] ? parts[1].split(':') : [];
  const all = [...a, ...Array(8 - a.length - b.length).fill('0'), ...b]; return Buffer.from(all.flatMap((h) => { const v = parseInt(h || '0', 16); return [v >> 8, v & 255]; })); }
  return Buffer.from(ip.split('.').map(Number)); };

// make a self-signed certificate (ECDSA P-256) for these names and IP addresses
function makeSelfSigned({ names = [], ips = [], cn = 'Larenest on this computer', years = 5 } = {}) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const spki = publicKey.export({ type: 'spki', format: 'der' });
  const alg = seq(oid('1.2.840.10045.4.3.2')); // ecdsa-with-SHA256
  const name = seq(set(seq(oid('2.5.4.3'), utf8(cn))), set(seq(oid('2.5.4.10'), utf8('Larenest'))));
  const now = new Date(Date.now() - 864e5), end = new Date(now.getTime() + years * 365 * 864e5);
  const san = seq(...[...new Set(names)].map((n) => ctx(2, Buffer.from(n), false)), ...[...new Set(ips)].map((ip) => ctx(7, ipBytes(ip), false)));
  const exts = ctx(3, seq(
    seq(oid('2.5.29.19'), tlv(0x04, seq())), // basic constraints: not a CA
    seq(oid('2.5.29.17'), tlv(0x04, san)), // subject alternative names
    seq(oid('2.5.29.37'), tlv(0x04, seq(oid('1.3.6.1.5.5.7.3.1')))))); // for TLS servers
  const serial = crypto.randomBytes(16); serial[0] &= 0x7f;
  const tbs = seq(ctx(0, int(Buffer.from([2]))), int(serial), alg, name, seq(time(now), time(end)), name, spki, exts);
  const sig = crypto.sign('sha256', tbs, privateKey);
  const der = seq(tbs, alg, tlv(0x03, Buffer.concat([Buffer.from([0]), sig])));
  const pem = (b, t) => `-----BEGIN ${t}-----\n${b.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END ${t}-----\n`;
  return { cert: pem(der, 'CERTIFICATE'), key: privateKey.export({ type: 'pkcs8', format: 'pem' }), fp: fingerprint(der) };
}
// SHA-256 of the certificate (hex, upper case, no separators): what the apps pin
const fingerprint = (der) => crypto.createHash('sha256').update(der).digest('hex').toUpperCase();
const derOf = (pem) => Buffer.from(String(pem).replace(/-----[^-]+-----|\s/g, ''), 'base64');

// this computer's own certificate: made once, kept in the data folder (private key readable only by this user)
function loadOrMake(dir, addrs) {
  const kf = path.join(dir, 'tls-self.key'), cf = path.join(dir, 'tls-self.crt');
  try { const cert = fs.readFileSync(cf, 'utf8'), key = fs.readFileSync(kf, 'utf8'); return { cert, key, fp: fingerprint(derOf(cert)) }; } catch (e) {}
  const c = makeSelfSigned({ names: ['localhost', os.hostname(), os.hostname() + '.local'], ips: ['127.0.0.1', ...(addrs || [])] });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(kf, c.key, { mode: 0o600 }); fs.writeFileSync(cf, c.cert);
  return c;
}

// ---- Tailscale's free certificate for this computer's *.ts.net name ----
const TS_BINS = process.platform === 'win32' ? ['C:\\Program Files\\Tailscale\\tailscale.exe', 'tailscale.exe', 'tailscale']
  : process.platform === 'darwin' ? ['/Applications/Tailscale.app/Contents/MacOS/Tailscale', '/usr/local/bin/tailscale', '/opt/homebrew/bin/tailscale', 'tailscale'] : ['tailscale', '/usr/bin/tailscale'];
const run = (bin, args, ms = 60000) => new Promise((res) => execFile(bin, args, { timeout: ms, windowsHide: true }, (err, out, errOut) => res({ err, out: String(out || ''), errOut: String(errOut || '') })));
async function tsBin() { for (const b of TS_BINS) { const r = await run(b, ['version'], 5000); if (!r.err) return b; } return null; }
// → { state: 'none'|'off'|'needs-https'|'ok'|'error', name, message, cert?, key? }
async function tailscaleCert(dir) {
  const bin = await tsBin(); if (!bin) return { state: 'none', message: 'Tailscale isn’t installed on this computer.' };
  const st = await run(bin, ['status', '--json'], 10000); let j = null; try { j = JSON.parse(st.out); } catch (e) {}
  const name = j && j.Self && String(j.Self.DNSName || '').replace(/\.$/, '');
  if (!j || j.BackendState !== 'Running' || !name) return { state: 'off', message: 'Tailscale is installed but not connected. Open Tailscale and sign in.' };
  const cf = path.join(dir, 'tls-ts.crt'), kf = path.join(dir, 'tls-ts.key');
  let fresh = false; try { const s = fs.statSync(cf); fresh = Date.now() - s.mtimeMs < 30 * 864e5 && fs.readFileSync(path.join(dir, 'tls-ts.name'), 'utf8') === name; } catch (e) {}
  if (!fresh) {
    fs.mkdirSync(dir, { recursive: true });
    const r = await run(bin, ['cert', '--cert-file', cf, '--key-file', kf, name], 120000);
    if (r.err) { const t = (r.errOut + r.out).trim();
      if (/https|not enabled|disabled|feature/i.test(t)) return { state: 'needs-https', name, message: 'Turn on HTTPS Certificates for your tailnet: Tailscale admin console → DNS → HTTPS Certificates → Enable. It’s free.' };
      return { state: 'error', name, message: 'Tailscale couldn’t make a certificate: ' + t.slice(0, 200) }; }
    try { fs.writeFileSync(path.join(dir, 'tls-ts.name'), name); fs.chmodSync(kf, 0o600); } catch (e) {}
  }
  try { return { state: 'ok', name, cert: fs.readFileSync(cf, 'utf8'), key: fs.readFileSync(kf, 'utf8') }; } catch (e) { return { state: 'error', name, message: 'Couldn’t read the Tailscale certificate.' }; }
}

module.exports = { makeSelfSigned, loadOrMake, tailscaleCert, fingerprint, derOf };
