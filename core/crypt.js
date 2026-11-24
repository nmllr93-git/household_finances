// Encryption at rest for the host's database (optional, off by default).
//
// One random data key (DEK, 32 bytes) encrypts financial content with AES-256-GCM: documents, receipt photos,
// Google Sheets history and the activity log. The DEK itself is stored twice, each copy wrapped (encrypted) with a
// key derived from a secret the user holds:
//   - the password (scrypt), and
//   - a recovery key shown once when encryption is turned on.
// Changing the password re-wraps the DEK; nothing else is re-encrypted. Without either secret the data can't be read.
//
// Encrypted text is stored as "enc1:" + base64(iv | tag | ciphertext); encrypted bytes start with the 4 bytes "LNE1".
'use strict';
const crypto = require('node:crypto');

const PFX = 'enc1:', MAGIC = Buffer.from('LNE1');
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

const kdf = (secret, salt) => crypto.scryptSync(String(secret).normalize('NFKC'), Buffer.from(salt, 'base64'), 32, SCRYPT);
function seal(key, buf) { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv); const ct = Buffer.concat([c.update(buf), c.final()]); return Buffer.concat([iv, c.getAuthTag(), ct]); }
function open(key, blob) { const iv = blob.subarray(0, 12), tag = blob.subarray(12, 28), d = crypto.createDecipheriv('aes-256-gcm', key, iv); d.setAuthTag(tag); return Buffer.concat([d.update(blob.subarray(28)), d.final()]); }

// Recovery key: 24 base32 characters in groups of four, easy to print or type (120 bits).
const B32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newRecoveryKey() { const b = crypto.randomBytes(15); let bits = '', out = ''; for (const x of b) bits += x.toString(2).padStart(8, '0'); for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)]; return out.match(/.{4}/g).join('-'); }
const normRecovery = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// Build the stored record for a new DEK (or re-wrap an existing one).
function wrapAll(dek, password, recovery, keep) {
  const r = keep || {};
  const out = { v: 1, since: r.since || new Date().toISOString() };
  out.pwSalt = crypto.randomBytes(16).toString('base64'); out.pw = seal(kdf(password, out.pwSalt), dek).toString('base64');
  if (recovery) { out.recSalt = crypto.randomBytes(16).toString('base64'); out.rec = seal(kdf(normRecovery(recovery), out.recSalt), dek).toString('base64'); }
  else { out.recSalt = r.recSalt; out.rec = r.rec; }
  if (r.auto) out.auto = r.auto;
  return out;
}
// Returns the DEK, or null if the secret is wrong.
function unwrap(rec, { password, recovery }) {
  try { if (password != null) return open(kdf(password, rec.pwSalt), Buffer.from(rec.pw, 'base64')); } catch { /* wrong password */ }
  try { if (recovery != null) return open(kdf(normRecovery(recovery), rec.recSalt), Buffer.from(rec.rec, 'base64')); } catch { /* wrong key */ }
  return null;
}
// "Unlock automatically on this computer": the DEK wrapped with a random key kept in a file outside the data folder.
function autoWrap(dek, keyfileKey) { return seal(keyfileKey, dek).toString('base64'); }
function autoUnwrap(blob, keyfileKey) { try { return open(keyfileKey, Buffer.from(blob, 'base64')); } catch { return null; } }

const isEncStr = (v) => typeof v === 'string' && v.startsWith(PFX);
const isEncBuf = (v) => (v instanceof Uint8Array) && v.length > 4 && Buffer.from(v.buffer, v.byteOffset, 4).equals(MAGIC);
const encStr = (dek, s) => (s == null || isEncStr(s) ? s : PFX + seal(dek, Buffer.from(String(s), 'utf8')).toString('base64'));
const decStr = (dek, s) => (isEncStr(s) ? open(dek, Buffer.from(s.slice(PFX.length), 'base64')).toString('utf8') : s);
const encBuf = (dek, b) => (b == null || isEncBuf(b) ? b : Buffer.concat([MAGIC, seal(dek, Buffer.from(b))]));
const decBuf = (dek, b) => (isEncBuf(b) ? open(dek, Buffer.from(b).subarray(4)) : b);

module.exports = { newDek: () => crypto.randomBytes(32), newRecoveryKey, wrapAll, unwrap, autoWrap, autoUnwrap, encStr, decStr, encBuf, decBuf, isEncStr, isEncBuf };
