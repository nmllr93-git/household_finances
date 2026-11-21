#!/usr/bin/env node
// Household Finances — self-hosted server.
// No npm packages needed: uses Node's built-in http, crypto and sqlite (Node 22.13+).
//
//   node server.js                         start the server
//   node server.js add-user <name> <books> add a login, e.g. add-user nate nate,shared
//   node server.js passwd <name>           change a password
//   node server.js users                   list logins and their budgets
//   node server.js backup                  write a backup copy of the database now
//   node server.js budgets                 list budgets (dashboards)
//   node server.js add-budget <id> <name>  create (or rename) a budget
//   node server.js where                   show where the data, settings and keys are
//   node server.js mode local|host         only this computer, or other devices too
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const os = require('node:os');
// Where data lives, first match wins:
//   1. DATA_DIR environment variable, or --data <folder> on the command line
//   2. "dataDir" in a config.json next to server.js (handy for a portable install)
//   3. the desktop/phone apps set FD_APPMODE, which uses the per-user folder:
//        Windows %APPDATA%\HouseholdFinances · macOS ~/Library/Application Support/HouseholdFinances · Linux ~/.local/share/household-finances
//   4. otherwise ./data next to server.js (how the self-hosted install has always worked)
const argOf = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : ''; };
const readCfg = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '')) || {}; } catch { return {}; } };
function userDataDir() {
  const h = os.homedir();
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(h, 'AppData', 'Roaming'), 'HouseholdFinances');
  if (process.platform === 'darwin') return path.join(h, 'Library', 'Application Support', 'HouseholdFinances');
  return path.join(process.env.XDG_DATA_HOME || path.join(h, '.local', 'share'), 'household-finances');
}
const APP_CFG = readCfg(path.join(ROOT, 'config.json'));
const DATA_DIR = path.resolve(process.env.DATA_DIR || argOf('--data') || APP_CFG.dataDir || (process.env.FD_APPMODE ? userDataDir() : path.join(ROOT, 'data')));
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
fs.mkdirSync(DATA_DIR, { recursive: true });
// Per-install settings live in <data>/config.json: { "mode": "local" | "host", "port": 8080 }
//   local = only this computer can open it (127.0.0.1); host = other devices on your network or Tailscale can too.
// Environment variables PORT and HOST still win, so existing setups keep working unchanged.
const CFG_FILE = path.join(DATA_DIR, 'config.json');
const CFG = { mode: 'host', port: 8080, ...readCfg(CFG_FILE) };
const PORT = Number(process.env.PORT || argOf('--port') || CFG.port || 8080);
const HOST = process.env.HOST || (CFG.mode === 'local' ? '127.0.0.1' : '0.0.0.0');
const saveCfg = (patch) => { Object.assign(CFG, patch); fs.writeFileSync(CFG_FILE, JSON.stringify(CFG, null, 2)); };
const SESSION_DAYS = 60;
const MAX_BODY = 1024 * 1024; // 1 MB

try { fs.mkdirSync(BACKUP_DIR, { recursive: true }); } catch (e) { console.error(`Can't create ${BACKUP_DIR}: ${e.code || e.message}`); }
// "attempt to write a readonly database" means Windows won't let this user change the database files:
// usually a Read-only flag (from copying/restoring) or the folder being created by another account / as Administrator.
// Clear the Read-only flag where we're allowed to, then check that writing works and explain if not.
const DB_FILE = path.join(DATA_DIR, 'finance.db');
for (const f of [DB_FILE, DB_FILE + '-wal', DB_FILE + '-shm']) {
  try { if (fs.existsSync(f)) { try { fs.accessSync(f, fs.constants.W_OK); } catch { fs.chmodSync(f, 0o666); } } } catch {}
}
const WRITE_HELP = `The server can't save to ${DATA_DIR}. Windows is blocking changes to the database files. Fix: in File Explorer right-click that folder → Properties → untick "Read-only" → Apply to all files; then Security tab → make sure your Windows user has "Modify". If the folder was made by an Administrator terminal or another account, either fix the permissions there or copy the folder to a new one you create (e.g. in Documents) and choose that folder instead.`;
let DB_WRITABLE = true;
try { fs.accessSync(DATA_DIR, fs.constants.W_OK); } catch { DB_WRITABLE = false; }
const db = new DatabaseSync(DB_FILE);
const SCHEMA = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS books (id TEXT PRIMARY KEY, name TEXT NOT NULL, label TEXT NOT NULL, sort INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, salt TEXT NOT NULL, hash TEXT NOT NULL, created TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS members (username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE, PRIMARY KEY (username, book_id));
  CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE, expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS seed (book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE, dataset TEXT NOT NULL, json TEXT NOT NULL,
    PRIMARY KEY (book_id, dataset));
  CREATE TABLE IF NOT EXISTS docs (id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    coll TEXT NOT NULL, json TEXT NOT NULL, created TEXT NOT NULL, created_by TEXT);
  CREATE INDEX IF NOT EXISTS docs_book ON docs (book_id, coll);
  CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE, mime TEXT NOT NULL, data BLOB NOT NULL, created TEXT NOT NULL, created_by TEXT);
  CREATE TABLE IF NOT EXISTS activity (at TEXT NOT NULL, username TEXT, book_id TEXT NOT NULL, action TEXT NOT NULL, coll TEXT, summary TEXT);
  CREATE INDEX IF NOT EXISTS activity_book ON activity (book_id, at);
`;
try { db.exec(SCHEMA); } catch (e) { if (!/readonly/i.test(e.message)) throw e; DB_WRITABLE = false; try { db.exec('PRAGMA foreign_keys = ON;'); } catch {} }

// ---------- first run: create the three budgets and load the sheet history ----------
function seedIfEmpty() {
  if (db.prepare('SELECT COUNT(*) n FROM books').get().n > 0) return;
  // seed/books.json is optional (it holds your own sheet imports and is kept out of git); without it you get two empty budgets
  let cfg = { books: [{ id: 'personal', name: 'Personal', label: 'Personal' }, { id: 'shared', name: 'Shared household', label: 'Shared' }] };
  try { cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed', 'books.json'), 'utf8')); } catch {}
  const addBook = db.prepare('INSERT INTO books (id, name, label, sort) VALUES (?, ?, ?, ?)');
  const addSeed = db.prepare('INSERT INTO seed (book_id, dataset, json) VALUES (?, ?, ?)');
  cfg.books.forEach((b, i) => {
    addBook.run(b.id, b.name, b.label, i);
    for (const ds of ['sheet_history', 'sheet_balances', 'sheet_budgets']) {
      const file = b.seed && b.seed[ds] ? path.join(ROOT, 'seed', b.seed[ds]) : null;
      let rows = []; try { rows = file ? JSON.parse(fs.readFileSync(file, 'utf8')).rows || [] : []; } catch {}
      addSeed.run(b.id, ds, JSON.stringify(rows));
    }
  });
  console.log(`Created ${cfg.books.length} budgets: ${cfg.books.map((b) => b.name).join(', ')}`);
}
// read-only logins: members.role is 'edit' (default) or 'view' (added to databases made before this existed)
try { if (!db.prepare('PRAGMA table_info(members)').all().some((c) => c.name === 'role')) db.exec("ALTER TABLE members ADD COLUMN role TEXT NOT NULL DEFAULT 'edit'"); } catch {}
if (DB_WRITABLE) { try { db.exec('CREATE TABLE IF NOT EXISTS _write_check (x INTEGER); DELETE FROM _write_check;'); } catch (e) { DB_WRITABLE = false; } }
if (!DB_WRITABLE) console.error('\n*** ' + WRITE_HELP + '\n');
try { seedIfEmpty(); } catch (e) { if (!/readonly/i.test(e.message)) throw e; }

// ---------- passwords and sessions ----------
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');
function checkPw(username, pw) {
  const u = db.prepare('SELECT salt, hash FROM users WHERE username = ?').get(username);
  if (!u) { hashPw(pw, 'x'); return false; } // same work either way
  const a = Buffer.from(hashPw(pw, u.salt), 'hex'), b = Buffer.from(u.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function setPassword(username, pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  db.prepare(`INSERT INTO users (username, salt, hash, created) VALUES (?, ?, ?, ?)
    ON CONFLICT(username) DO UPDATE SET salt = excluded.salt, hash = excluded.hash`).run(username, salt, hashPw(pw, salt), new Date().toISOString());
  db.prepare('DELETE FROM sessions WHERE username = ?').run(username);
}
function newSession(username) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions (token, username, expires) VALUES (?, ?, ?)').run(token, username, Date.now() + SESSION_DAYS * 864e5);
  return token;
}
function sessionUser(req) {
  const m = /(?:^|;\s*)hf_session=([^;]+)/.exec(req.headers.cookie || '');
  if (!m) return null;
  const s = db.prepare('SELECT username, expires FROM sessions WHERE token = ?').get(m[1]);
  if (!s || s.expires < Date.now()) return null;
  return s.username;
}
const userBooks = (u) => db.prepare(`SELECT b.id, b.name, b.label, m.role FROM books b JOIN members m ON m.book_id = b.id
  WHERE m.username = ? ORDER BY b.label = 'Shared', b.sort`).all(u).map((b) => ({ ...b, readOnly: b.role === 'view' }));
const roleOf = (u, bookId) => (db.prepare('SELECT role FROM members WHERE username = ? AND book_id = ?').get(u, bookId) || {}).role;
const canUse = (u, bookId) => !!db.prepare('SELECT 1 FROM members WHERE username = ? AND book_id = ?').get(u, bookId);

// Slow down password guessing: 10 failures per address per 15 minutes.
const fails = new Map();
const tooMany = (ip) => { const f = fails.get(ip); return f && f.n >= 10 && Date.now() - f.t < 15 * 60e3; };
const noteFail = (ip) => { const f = fails.get(ip); fails.set(ip, f && Date.now() - f.t < 15 * 60e3 ? { n: f.n + 1, t: f.t } : { n: 1, t: Date.now() }); };

// ---------- HTTP helpers ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const SECURITY = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
};
function send(res, code, body, headers = {}) {
  const isObj = body !== null && typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(code, { ...SECURITY, 'Cache-Control': 'no-store', ...(isObj ? { 'Content-Type': 'application/json' } : {}), ...headers });
  res.end(isObj ? JSON.stringify(body) : body);
}
function readJson(req, max = MAX_BODY) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > max) { reject(Object.assign(new Error('Too large'), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(Object.assign(new Error('Bad JSON'), { code: 400 })); } });
    req.on('error', reject);
  });
}
function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath === '/' ? '/index.html' : urlPath);
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) return send(res, 404, 'Not found');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not found');
    const ext = path.extname(file);
    res.writeHead(200, { ...SECURITY, 'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache' }); // always check for a newer copy, so an update never mixes old and new files
    fs.createReadStream(file).pipe(res);
  });
}
const isHttps = (req) => req.headers['x-forwarded-proto'] === 'https';
const cookie = (req, v, maxAge) => `hf_session=${v}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${isHttps(req) ? '; Secure' : ''}`;

// ---------- clean up what the page sends before storing it ----------
// Dashboard data rules (validation, load, save, export, restore) live in core/books.js, shared with the phone app.
const CORE = require('./core/books.js');
const { cleanDoc } = CORE;
const BOOKS = CORE.createBookApi({
  seedRows: (bookId) => db.prepare('SELECT dataset, json FROM seed WHERE book_id = ?').all(bookId),
  listDocs: (bookId, coll) => db.prepare('SELECT id, json, created, created_by FROM docs WHERE book_id = ? AND coll = ? ORDER BY created').all(bookId, coll),
  insertDoc: (r) => db.prepare('INSERT INTO docs (id, book_id, coll, json, created, created_by) VALUES (?, ?, ?, ?, ?, ?)').run(r.id, r.bookId, r.coll, r.json, r.created, r.createdBy),
  deleteDoc: (bookId, coll, id) => db.prepare('DELETE FROM docs WHERE id = ? AND book_id = ? AND coll = ?').run(id, bookId, coll),
  replaceBookDocs: (bookId, rows) => {
    db.exec('BEGIN');
    try { db.prepare('DELETE FROM docs WHERE book_id = ?').run(bookId); const ins = db.prepare('INSERT INTO docs (id, book_id, coll, json, created, created_by) VALUES (?, ?, ?, ?, ?, ?)');
      for (const r of rows) ins.run(r.id, bookId, r.coll, r.json, r.created, r.createdBy); db.exec('COMMIT'); }
    catch (e) { db.exec('ROLLBACK'); throw e; }
  },
  newId: () => crypto.randomBytes(10).toString('base64url'),
  backup: () => backup(),
  putFile: (f) => db.prepare('INSERT INTO files (id, book_id, mime, data, created, created_by) VALUES (?, ?, ?, ?, ?, ?)').run(f.id, f.bookId, f.mime, Buffer.from(f.data, 'base64'), f.created, f.createdBy),
  getFile: (bookId, id) => { const r = db.prepare('SELECT mime, data FROM files WHERE id = ? AND book_id = ?').get(id, bookId); return r ? { mime: r.mime, data: Buffer.from(r.data).toString('base64') } : null; },
  deleteFile: (bookId, id) => db.prepare('DELETE FROM files WHERE id = ? AND book_id = ?').run(id, bookId),
  listFiles: (bookId) => db.prepare('SELECT id, mime, data FROM files WHERE book_id = ?').all(bookId).map((r) => ({ id: r.id, mime: r.mime, data: Buffer.from(r.data).toString('base64') })),
  replaceBookFiles: (bookId, files) => { db.exec('BEGIN'); try { db.prepare('DELETE FROM files WHERE book_id = ?').run(bookId); const ins = db.prepare('INSERT INTO files (id, book_id, mime, data, created, created_by) VALUES (?, ?, ?, ?, ?, ?)');
    for (const f of files) ins.run(f.id, bookId, f.mime, Buffer.from(f.data, 'base64'), new Date().toISOString(), ''); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } },
});

// ---------- API ----------
// ---- stock quotes: Finnhub and/or Financial Modeling Prep when keys are set, otherwise Stooq (no key) ----
// Keys come from FINNHUB_KEY / FMP_KEY or data/api-keys.json: { "finnhub": "...", "fmp": "..." }
let KEYNOTE = '';
function apiKeys() {
  let f = {}; KEYNOTE = '';
  const file = path.join(DATA_DIR, 'api-keys.json');
  if (fs.existsSync(file)) {
    try { f = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').replace(/[\u201C\u201D]/g, '"')) || {}; }
    catch (e) { KEYNOTE = `Found ${file} but couldn't read it (${e.message}). Check it looks exactly like the README example.`; }
  } else if (fs.existsSync(file + '.txt')) KEYNOTE = `Found ${file}.txt. Windows added a hidden .txt ending; rename it to api-keys.json.`;
  else KEYNOTE = `No key file at ${file}.`;
  const pick = (o, ...names) => { for (const n of names) { const k = Object.keys(o).find((x) => x.toLowerCase() === n); if (k && String(o[k]).trim()) return String(o[k]).trim(); } return ''; };
  return { finnhub: process.env.FINNHUB_KEY || pick(f, 'finnhub', 'finnhub_key', 'finnhubkey'), fmp: process.env.FMP_KEY || pick(f, 'fmp', 'fmp_key', 'fmpkey', 'financialmodelingprep'), fred: process.env.FRED_KEY || pick(f, 'fred', 'fred_key'), bls: process.env.BLS_KEY || pick(f, 'bls', 'bls_key'), eia: process.env.EIA_KEY || pick(f, 'eia', 'eia_key') };
}
// Market, economy, price and vehicle data (and their pacing/caching) live in core/market.js, shared with the phone app.
const CACHE_FILES = { market: 'market-cache.json', econ: 'econ-cache.json', sectors: 'sector-cache.json' };
const cacheFile = (name) => path.join(DATA_DIR, CACHE_FILES[name] || `cache-${name.replace(/[^a-z0-9-]/gi, '')}.json`);
const MARKET = require('./core/market.js').createMarketData({
  getJson: async (u) => { const r = await fetch(u, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'household-finance' } }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); },
  getText: async (u) => (await fetch(u, { signal: AbortSignal.timeout(8000) })).text(),
  postJson: async (u, body) => (await fetch(u, { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json(),
  keys: () => apiKeys(), keyNote: () => { apiKeys(); return KEYNOTE; },
  load: (name) => { try { return JSON.parse(fs.readFileSync(cacheFile(name), 'utf8')); } catch { return null; } },
  save: (name, obj) => { try { fs.writeFileSync(cacheFile(name), JSON.stringify(obj)); } catch {} },
});

// ---------- activity log: who changed what on each dashboard (settings, colors and shared balances aren't logged) ----------
const ACT_SKIP = new Set(['prefs', 'shares', 'files']);
const NOUN = { imports: 'statement', manual: 'manual entry', edits: 'transaction edit', rules: 'rule', budgets: 'budget', accounts: 'account', goals: 'savings goal', holdings: 'holding', receipts: 'receipt photo' };
function describeDoc(coll, d) {
  if (!d) return '';
  const m = (v) => (v == null || v === '' ? '' : '$' + Math.round(Number(v)).toLocaleString('en-US'));
  switch (coll) {
    case 'imports': return `${d.accountName || 'account'}${d.rowCount ? ` · ${d.rowCount} transactions` : ''}${d.balance != null ? ` · balance ${m(d.balance)}` : ''}`;
    case 'manual': return `${d.vendor || d.category || ''} ${m(d.amount)} on ${d.date || ''}`.trim();
    case 'edits': return d.ignored ? 'ignored a transaction' : [d.vendor, d.category, d.type].filter(Boolean).join(' · ') || 'edited a transaction';
    case 'rules': return d.ignore ? `ignore “${d.match || 'matching'}”` : `“${d.match || (d.conds && d.conds[0] && d.conds[0].value) || 'matching'}” → ${d.category || d.vendor || d.type || 'changes'}`;
    case 'budgets': return `${d.category} ${d.amount ? m(d.amount) + '/mo' : 'removed'} from ${d.from}`;
    case 'accounts': return d.name || '';
    case 'goals': return `${d.name || ''} ${m(d.target)}`.trim();
    case 'receipts': return d.name || '';
    case 'holdings': return `${d.symbol || ''}${d.lots && d.lots.length ? ` · ${d.lots.reduce((t, l) => t + l.qty, 0)} shares` : ''}`;
    default: return '';
  }
}
function logActivity(user, bookId, method, coll, r, before) {
  if (ACT_SKIP.has(coll)) return;
  let action = '', doc = null;
  if (coll === 'restore') { action = 'restored a backup'; }
  else if (method === 'POST') { const row = r.body && r.body.id && db.prepare('SELECT json FROM docs WHERE id = ?').get(r.body.id); doc = row ? JSON.parse(row.json) : null; action = `added ${/^[aeiou]/.test(NOUN[coll] || '') ? 'an' : 'a'} ${NOUN[coll] || coll}`; }
  else if (method === 'DELETE') { doc = before ? JSON.parse(before.json) : null; action = `removed ${/^[aeiou]/.test(NOUN[coll] || '') ? 'an' : 'a'} ${NOUN[coll] || coll}`; }
  if (!action) return;
  db.prepare('INSERT INTO activity (at, username, book_id, action, coll, summary) VALUES (?, ?, ?, ?, ?, ?)').run(new Date().toISOString(), user, bookId, action, coll, String(describeDoc(coll, doc)).slice(0, 200));
  db.prepare("DELETE FROM activity WHERE book_id = ? AND at < ?").run(bookId, new Date(Date.now() - 400 * 864e5).toISOString());
}

// ---------- weekly email digest (settings in <data>/digest.json; mail sent with the server owner's SMTP account) ----------
const DIGEST = require('./digest.js');
const DIGEST_FILE = () => path.join(DATA_DIR, 'digest.json');
const digestCfg = () => { try { return JSON.parse(fs.readFileSync(DIGEST_FILE(), 'utf8')) || {}; } catch { return {}; } };
const digestSave = (c) => fs.writeFileSync(DIGEST_FILE(), JSON.stringify(c, null, 2));
const ownerName = () => (db.prepare('SELECT username FROM users ORDER BY rowid LIMIT 1').get() || {}).username;
async function digestFor(username) {
  const parts = []; let total = '';
  for (const b of userBooks(username)) { const book = db.prepare('SELECT id, name, label FROM books WHERE id = ?').get(b.id); const d = DIGEST.buildDigest(book, await BOOKS.data(book.id)); if (!d.empty) parts.push(d); }
  if (!parts.length) return null;
  total = parts.map((p) => p.subject).join(' | ');
  return { subject: parts.length === 1 ? parts[0].subject : `Your week: ${total}`.slice(0, 180), text: parts.map((p) => p.text).join('\n\n'), html: parts.map((p) => p.html).join('<hr style="border:0;border-top:1px solid #e3e7eb;margin:22px 0">') + '<p style="font:12px sans-serif;color:#8a939d;margin-top:22px">Sent by your Household Finances server. Turn it off under ⚙ Settings → Weekly email.</p>' };
}
async function sendDigest(username) {
  const c = digestCfg(), u = (c.users || {})[username];
  if (!c.smtp || !c.smtp.host) throw new Error('The server owner hasn’t set up email sending yet.');
  if (!u || !u.email) throw new Error('Add your email address first.');
  const d = await digestFor(username); if (!d) throw new Error('Nothing to report yet: import some transactions first.');
  await DIGEST.sendMail(c.smtp, { to: u.email, ...d });
  const c2 = digestCfg(); ((c2.users = c2.users || {})[username] = { ...(c2.users[username] || {}), lastSent: Date.now() }); digestSave(c2);
}
let digestBusy = false;
async function checkDigests() {
  if (digestBusy) return; digestBusy = true;
  try { const c = digestCfg(), now = new Date();
    for (const [name, u] of Object.entries(c.users || {})) {
      if (!u.on || !u.email || Number(u.day) !== now.getDay() || Number(u.hour) !== now.getHours()) continue;
      if (u.lastSent && Date.now() - u.lastSent < 6 * 864e5) continue;
      try { await sendDigest(name); } catch (e) { console.error(`Weekly email to ${name} failed: ${e.message}`); }
    } } finally { digestBusy = false; }
}
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i;

async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
  const ip = req.socket.remoteAddress;

  // ping: lets the desktop/phone connect screen confirm an address really is this app (no login, no data)
  if (parts[1] === 'ping') { res.setHeader('Access-Control-Allow-Origin', '*'); return send(res, 200, { app: 'household-finances', version: require('./package.json').version }); }

  if (parts[1] === 'login' && req.method === 'POST') {
    if (tooMany(ip)) return send(res, 429, { error: 'Too many attempts. Try again in 15 minutes.' });
    const { username, password } = await readJson(req);
    const u = String(username || '').trim().toLowerCase();
    if (!u || !password || !checkPw(u, String(password))) { noteFail(ip); return send(res, 401, { error: 'Wrong username or password.' }); }
    fails.delete(ip);
    return send(res, 200, { ok: true }, { 'Set-Cookie': cookie(req, newSession(u), SESSION_DAYS * 86400) });
  }
  if (parts[1] === 'logout' && req.method === 'POST') {
    const m = /(?:^|;\s*)hf_session=([^;]+)/.exec(req.headers.cookie || '');
    if (m) db.prepare('DELETE FROM sessions WHERE token = ?').run(m[1]);
    return send(res, 200, { ok: true }, { 'Set-Cookie': cookie(req, '', 0) });
  }

  const user = sessionUser(req);
  if (!user) return send(res, 401, { error: 'Not signed in' });
  // Writes must come from this site's own pages.
  if (req.method !== 'GET' && req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return send(res, 403, { error: 'Bad origin' });

  if (parts[1] === 'dividends' && req.method === 'GET') {
    const syms = [...new Set(String(url.searchParams.get('s') || '').toUpperCase().split(',').map((x) => x.trim()).filter((x) => /^[A-Z0-9.\-^]{1,12}$/.test(x)))].slice(0, 40);
    return send(res, 200, { dividends: await MARKET.dividends(syms) });
  }
  if (parts[1] === 'quotes' && req.method === 'GET') {
    const syms = [...new Set(String(url.searchParams.get('s') || '').toUpperCase().split(',').map((x) => x.trim()).filter((x) => /^[A-Z0-9.\-^]{1,12}$/.test(x)))].slice(0, 60);
    return send(res, 200, { sources: MARKET.sources(), quotes: await MARKET.quotes(syms) });
  }
  if (parts[1] === 'keys') {
    // API keys page: which keys are set (never the keys themselves). Only the first account created (the server owner) can change them.
    const owner = (db.prepare('SELECT username FROM users ORDER BY rowid LIMIT 1').get() || {}).username;
    const file = path.join(DATA_DIR, 'api-keys.json'); let cur = {}; try { cur = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')) || {}; } catch {}
    if (req.method === 'GET') { const k = apiKeys(); return send(res, 200, { canEdit: user === owner, owner, set: Object.fromEntries(Object.entries(k).map(([n, v]) => [n, v ? '••••' + String(v).slice(-4) : ''])), fromEnv: Object.fromEntries(Object.keys(k).map((n) => [n, !!process.env[n.toUpperCase() + '_KEY']])) }); }
    if (req.method === 'POST') {
      if (user !== owner) return send(res, 403, { error: `Only ${owner} (who set up this server) can change API keys.` });
      const body = await readJson(req); const allowed = ['finnhub', 'fmp', 'fred', 'bls', 'eia'];
      for (const n of allowed) if (typeof body[n] === 'string') { const v = body[n].trim().replace(/[^\w\-.]/g, '').slice(0, 120); if (v) cur[n] = v; else delete cur[n]; }
      fs.writeFileSync(file, JSON.stringify(cur, null, 2)); await MARKET.resetKeys();
      return send(res, 200, { ok: true });
    }
  }
  if (parts[1] === 'stock' && req.method === 'GET') {
    const sym = String(url.searchParams.get('s') || '').toUpperCase().replace(/[^A-Z0-9.\-^]/g, '').slice(0, 12);
    if (!sym) return send(res, 400, { error: 'symbol?' });
    return send(res, 200, await MARKET.stock(sym));
  }
  if (parts[1] === 'econ' && req.method === 'GET') return send(res, 200, await MARKET.econ(url.searchParams.get('refresh') === '1'));
  if (parts[1] === 'vehicle' && req.method === 'GET') { try { return send(res, 200, await MARKET.vehicle(url.searchParams.get('vin'))); } catch (e) { return send(res, 502, { error: 'Couldn’t reach NHTSA: ' + e.message }); } }
  if (parts[1] === 'markets' && req.method === 'GET') {
    const m = await MARKET.markets(url.searchParams.get('refresh') === '1'), open = MARKET.marketOpen();
    return send(res, 200, { ...m, hist: undefined, open, nextRefresh: open ? m.at + 3600e3 : null });
  }
  if (parts[1] === 'digest') {
    const owner = ownerName(), c = digestCfg(); c.users = c.users || {};
    if (req.method === 'GET' && !parts[2]) { const sm = c.smtp || {}; return send(res, 200, { canEditSmtp: user === owner, owner, smtp: { host: sm.host || '', port: sm.port || 587, user: sm.user || '', from: sm.from || '', passSet: !!sm.pass }, me: { email: '', on: false, day: 1, hour: 7, ...(c.users[user] || {}) } }); }
    if (req.method === 'POST' && parts[2] === 'test') { try { await sendDigest(user); return send(res, 200, { ok: true }); } catch (e) { return send(res, 400, { error: e.message }); } }
    if (req.method === 'POST' && !parts[2]) {
      const b = await readJson(req);
      if (b.smtp) { if (user !== owner) return send(res, 403, { error: `Only ${owner} (who set up this server) can change the email account.` });
        const old = c.smtp || {}, sm = b.smtp; c.smtp = { host: String(sm.host || '').trim().slice(0, 120), port: Math.max(1, Math.min(65535, Number(sm.port) || 587)), user: String(sm.user || '').trim().slice(0, 120), from: String(sm.from || '').trim().slice(0, 120), pass: typeof sm.pass === 'string' && sm.pass ? sm.pass.slice(0, 200) : old.pass || '' }; }
      if (b.me) { const m = b.me, email = String(m.email || '').trim(); if (email && !EMAIL_RE.test(email)) return send(res, 400, { error: 'That email address doesn’t look right.' });
        c.users[user] = { ...(c.users[user] || {}), email, on: !!m.on && !!email, day: Math.max(0, Math.min(6, Number(m.day) || 0)), hour: Math.max(0, Math.min(23, Number(m.hour) || 0)) }; }
      digestSave(c); return send(res, 200, { ok: true });
    }
  }
  if (parts[1] === 'me' && req.method === 'GET') return send(res, 200, { username: user, books: userBooks(user) });

  if (parts[1] === 'books' && parts[2]) {
    const bookId = parts[2];
    if (!canUse(user, bookId)) return send(res, 403, { error: 'No access to this budget' });
    const book = db.prepare('SELECT id, name, label FROM books WHERE id = ?').get(bookId);
    const getBody = async (max) => readJson(req, max);
    if (parts[3] === 'activity' && req.method === 'GET') return send(res, 200, db.prepare('SELECT at, username, action, coll, summary FROM activity WHERE book_id = ? ORDER BY at DESC LIMIT 300').all(bookId));
    const writing = req.method !== 'GET';
    if (writing && roleOf(user, bookId) === 'view' && parts[3] !== 'shares') return send(res, 403, { error: 'This login can view this dashboard but not change it.' });
    const before = req.method === 'DELETE' && parts[4] ? db.prepare('SELECT json FROM docs WHERE id = ? AND book_id = ?').get(parts[4], bookId) : null;
    let r; try { r = await BOOKS.handle(req.method, parts.slice(3), book, getBody, user); } catch (e) { if (e.code >= 400 && e.code < 500) return send(res, e.code, { error: e.message }); throw e; }
    if (writing && r.status < 300) { try { logActivity(user, bookId, req.method, parts[3], r, before); } catch {} }
    if (r.headers && r.headers.file) return send(res, 200, Buffer.from(r.body.data, 'base64'), { 'Content-Type': r.body.mime, 'Cache-Control': 'private, max-age=86400' });
    if (r.headers && r.headers.download) return send(res, r.status, JSON.stringify(r.body, null, 1), { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="${r.headers.download}"` });
    return send(res, r.status, r.body);
  }
  return send(res, 404, { error: 'Not found' });
}

// ---------- backups: one copy a day, keep the last 30 ----------
function backup() {
  const stem = path.join(BACKUP_DIR, `finance-${new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16)}`);
  let file = stem + '.db';
  for (let i = 2; fs.existsSync(file); i++) file = `${stem}-${i}.db`;
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const all = fs.readdirSync(BACKUP_DIR).filter((f) => /^finance-.*\.db$/.test(f)).sort();
  for (const f of all.slice(0, Math.max(0, all.length - 30))) fs.unlinkSync(path.join(BACKUP_DIR, f));
  return file;
}

let SERVER = null, BTIMER = null, DTIMER = null, RUN = null;
const lanAddrs = () => Object.values(os.networkInterfaces()).flat().filter((n) => n && n.family === 'IPv4' && !n.internal).map((n) => n.address);
// start({ mode, port, quiet }) → Promise<info>. Used by `node server.js` and by the desktop app (require('./server.js')).
function start(opts = {}) {
  if (SERVER) return Promise.resolve(info());
  const mode = opts.mode || CFG.mode, port = Number(opts.port || PORT), host = opts.host || (process.env.HOST && !opts.mode ? process.env.HOST : mode === 'local' ? '127.0.0.1' : '0.0.0.0'), log = opts.quiet ? () => {} : console.log;
  let nUsers = 0; try { nUsers = db.prepare('SELECT COUNT(*) n FROM users').get().n; } catch (e) { if (/readonly/i.test(e.message)) return Promise.reject(new Error(WRITE_HELP)); throw e; }
  if (nUsers === 0) {
    log('\nNo logins yet. Stop the server and run setup first (see README):\n  node server.js add-user nate nate,shared\n  node server.js add-user mckenna mckenna,shared\n');
  }
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      if (url.pathname.startsWith('/api/')) return await api(req, res, url);
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
      return serveStatic(req, res, url.pathname);
    } catch (e) {
      const ro = /readonly database|SQLITE_READONLY|attempt to write/i.test(String(e && e.message));
      if (ro) console.error(WRITE_HELP);
      if (!res.headersSent) send(res, ro ? 503 : e.code >= 400 && e.code < 600 ? e.code : 500, { error: ro ? WRITE_HELP : e.code ? e.message : 'Server error' });
      if (!e.code) console.error(e);
    }
  });
  const ready = new Promise((resolve, reject) => {
    server.once('error', (e) => { SERVER = null; reject(e.code === 'EADDRINUSE' ? Object.assign(new Error(`Port ${port} is already in use. Close the other program or pick another port.`), { code: 'EADDRINUSE' }) : e); });
    server.listen(port, host, () => {
      RUN = { mode, port, host, since: Date.now() };
      log(`Household Finances is running on http://localhost:${port}`);
      if (host !== '127.0.0.1') for (const a of lanAddrs()) log(`  on your network: http://${a}:${port}`);
      else log('  local only: other devices cannot connect (node server.js mode host to change)');
      resolve(info());
    });
  });
  SERVER = server;
  try { db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now()); } catch {}
  try { const last = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.db')).sort().pop();
    if (!last || Date.now() - fs.statSync(path.join(BACKUP_DIR, last)).mtimeMs > 864e5) backup(); } catch (e) { console.error('Backup skipped:', e.code || e.message); }
  if (!BTIMER) BTIMER = setInterval(() => { try { backup(); } catch (e) { console.error('Backup failed', e); } }, 864e5);
  if (!DTIMER) { DTIMER = setInterval(() => { checkDigests().catch(() => {}); }, 15 * 60e3); if (DTIMER.unref) DTIMER.unref(); }
  return ready;
}

// stop() → Promise. Closes open connections so the port frees right away (tray "Stop hosting").
function stop() {
  if (!SERVER) return Promise.resolve();
  const s = SERVER; SERVER = null; RUN = null; if (BTIMER) { clearInterval(BTIMER); BTIMER = null; } if (DTIMER) { clearInterval(DTIMER); DTIMER = null; }
  return new Promise((r) => { s.close(() => r()); if (s.closeAllConnections) s.closeAllConnections(); });
}
// info(): what the tray/settings screen shows.
function info() {
  const lan = RUN && RUN.host !== '127.0.0.1' ? lanAddrs() : [];
  return { running: !!RUN, mode: RUN ? RUN.mode : CFG.mode, port: RUN ? RUN.port : PORT, url: RUN ? `http://localhost:${RUN.port}` : '', lan: lan.map((a) => `http://${a}:${RUN.port}`), dataDir: DATA_DIR, writable: DB_WRITABLE, writeHelp: DB_WRITABLE ? '' : WRITE_HELP, users: (() => { try { return db.prepare('SELECT COUNT(*) n FROM users').get().n; } catch { return 0; } })(), since: RUN ? RUN.since : null };
}
// setMode('local'|'host'): saves it and restarts if running, so the change takes effect immediately.
async function setMode(mode, port) {
  if (!['local', 'host'].includes(mode)) throw new Error('mode must be local or host');
  saveCfg({ mode, ...(port ? { port: Number(port) } : {}) });
  if (SERVER) { const was = RUN && RUN.port; await stop(); return start({ mode, port: port || was || CFG.port, quiet: true }); }
  return info();
}
// addUser(name, password, books): first-run setup screen in the apps (same rules as the add-user command).
function addUser(name, pw, ids) {
  const u = String(name || '').toLowerCase();
  if (!/^[a-z0-9_.-]{2,32}$/.test(u)) throw new Error('Login names are 2–32 letters, numbers, dots, dashes or underscores.');
  if (String(pw || '').length < 8) throw new Error('Passwords need at least 8 characters.');
  const books = db.prepare('SELECT id FROM books').all().map((b) => b.id), all2 = (ids || []).map((x) => String(x)), view = new Set(all2.filter((x) => /:view$/.test(x)).map((x) => x.split(':')[0])), list = all2.map((x) => x.split(':')[0]).filter((id) => books.includes(id));
  if (!list.length) throw new Error('Choose at least one budget.');
  setPassword(u, pw); db.prepare('DELETE FROM members WHERE username = ?').run(u);
  for (const id of list) db.prepare('INSERT INTO members (username, book_id, role) VALUES (?, ?, ?)').run(u, id, view.has(id) ? 'view' : 'edit');
  return { user: u, books: list, viewOnly: [...view] };
}


// ---------- command line ----------
// Reads answers one line at a time; typed passwords are not echoed in a terminal.
let rl = null, muted = false, prompt = '';
const lines = [], waiting = [];
function ask(q, hidden) {
  if (!rl) {
    rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
    rl._writeToOutput = (s) => { if (!muted) rl.output.write(s); else if (s.startsWith(prompt)) rl.output.write(prompt); };
    rl.on('line', (l) => { if (muted) process.stdout.write('\n'); muted = false; const w = waiting.shift(); if (w) w(l); else lines.push(l); });
    rl.on('close', () => { while (waiting.length) waiting.shift()(''); });
  }
  prompt = q; muted = !!hidden && !!process.stdin.isTTY;
  rl.setPrompt(q); rl.prompt();
  return new Promise((resolve) => { if (lines.length) { muted = false; resolve(lines.shift()); } else waiting.push(resolve); });
}
async function askPassword() {
  for (;;) {
    const a = await ask('Password (8+ characters): ', true);
    if (a.length < 8) { console.log('Too short.'); continue; }
    if ((await ask('Type it again: ', true)) === a) return a;
    console.log('They did not match. Try again.');
  }
}
async function cli(cmd, args) {
  const books = db.prepare('SELECT id, name FROM books ORDER BY sort').all();
  if (cmd === 'add-user') {
    const [name, list] = args;
    const items = String(list || '').split(',').map((s) => s.trim()).filter(Boolean), ids = items.map((x) => x.split(':')[0]), view = new Set(items.filter((x) => /:view$|:read$/i.test(x)).map((x) => x.split(':')[0]));
    if (!/^[a-z0-9_.-]{2,32}$/i.test(name || '') || !ids.length) {
      console.log(`Usage: node server.js add-user <name> <budgets>   (add :view for read-only, e.g. add-user sam shared:view)\nBudgets: ${books.map((b) => `${b.id} (${b.name})`).join(', ')}`); return;
    }
    const bad = ids.filter((id) => !books.some((b) => b.id === id));
    if (bad.length) { console.log(`Unknown budget: ${bad.join(', ')}. Choose from ${books.map((b) => b.id).join(', ')}`); return; }
    const u = name.toLowerCase();
    setPassword(u, await askPassword());
    db.prepare('DELETE FROM members WHERE username = ?').run(u);
    for (const id of ids) db.prepare('INSERT INTO members (username, book_id, role) VALUES (?, ?, ?)').run(u, id, view.has(id) ? 'view' : 'edit');
    console.log(`Login "${u}" can now see: ${ids.map((id) => id + (view.has(id) ? ' (view only)' : '')).join(', ')}`);
  } else if (cmd === 'passwd') {
    const u = String(args[0] || '').toLowerCase();
    if (!db.prepare('SELECT 1 FROM users WHERE username = ?').get(u)) { console.log('No such login.'); return; }
    setPassword(u, await askPassword());
    console.log('Password changed. That login was signed out everywhere.');
  } else if (cmd === 'users') {
    for (const u of db.prepare('SELECT username FROM users ORDER BY username').all()) console.log(`${u.username}: ${userBooks(u.username).map((b) => b.id + (b.readOnly ? ' (view only)' : '')).join(', ')}`);
  } else if (cmd === 'budgets') {
    for (const b of db.prepare('SELECT id, name FROM books ORDER BY sort').all()) console.log(`${b.id}  ${b.name}`);
  } else if (cmd === 'add-budget') {
    const id = String(args[0] || '').toLowerCase(), name = args.slice(1).join(' ').trim();
    if (!/^[a-z0-9_-]{2,24}$/.test(id) || !name) { console.log('Usage: node server.js add-budget <id> <name>   e.g. add-budget alex "Alex – Personal"'); return; }
    if (db.prepare('SELECT 1 FROM books WHERE id = ?').get(id)) { db.prepare('UPDATE books SET name = ? WHERE id = ?').run(name, id); console.log(`Renamed ${id} to "${name}".`); return; }
    const sort = db.prepare('SELECT COALESCE(MAX(sort), -1) + 1 n FROM books').get().n;
    db.prepare('INSERT INTO books (id, name, label, sort) VALUES (?, ?, ?, ?)').run(id, name, /shared/i.test(id + name) ? 'Shared' : 'Personal', sort);
    for (const ds of ['sheet_history', 'sheet_balances', 'sheet_budgets']) db.prepare('INSERT INTO seed (book_id, dataset, json) VALUES (?, ?, ?)').run(id, ds, '[]');
    console.log(`Created budget ${id} ("${name}"). Give a login access with: node server.js add-user <name> ${id},...`);
  } else if (cmd === 'where') {
    console.log(`Data folder:   ${DATA_DIR}\nDatabase:      ${path.join(DATA_DIR, 'finance.db')}\nSettings:      ${CFG_FILE}\nAPI keys:      ${path.join(DATA_DIR, 'api-keys.json')}\nBackups:       ${BACKUP_DIR}\nMode:          ${CFG.mode} (${HOST}:${PORT})`);
  } else if (cmd === 'mode') {
    const m = String(args[0] || '').toLowerCase(); if (!['local', 'host'].includes(m)) { console.log('Use: mode local   or   mode host'); return; }
    saveCfg({ mode: m }); console.log(`Saved. Next start: ${m === 'local' ? 'only this computer' : 'other devices too'}.`);
  } else if (cmd === 'backup') {
    console.log('Backup written to', backup());
  } else {
    console.log('Commands: add-user <name> <budgets> | passwd <name> | users | budgets | add-budget <id> <name> | backup | where | mode local|host   (no command = start the server)');
  }
}

const argv = process.argv.slice(2).filter((a, i, all) => !/^--(data|port)$/.test(a) && !/^--(data|port)$/.test(all[i - 1] || ''));
const [cmd, ...args] = argv;
if (require.main === module) {
  if (cmd) cli(cmd, args).then(() => process.exit(0));
  else start().catch((e) => { console.error(e.message); process.exit(1); });
  const quit = () => stop().then(() => { try { db.close(); } catch {} process.exit(0); });
  process.on('SIGINT', quit); process.on('SIGTERM', quit);
} else {
  module.exports = { start, stop, info, setMode, addUser, backup, dataDir: DATA_DIR, books: () => db.prepare('SELECT id, name FROM books ORDER BY sort').all() };
}
