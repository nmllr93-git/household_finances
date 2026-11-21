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
const COLLECTIONS = new Set(['imports', 'manual', 'edits', 'rules', 'budgets', 'accounts', 'goals', 'holdings', 'prefs', 'shares']);

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
const userBooks = (u) => db.prepare(`SELECT b.id, b.name, b.label FROM books b JOIN members m ON m.book_id = b.id
  WHERE m.username = ? ORDER BY b.label = 'Shared', b.sort`).all(u);
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
const str = (v, n) => String(v ?? '').slice(0, n);
const num = (v) => (v === null || v === undefined || v === '' || !isFinite(Number(v)) ? null : Number(v));
const TYPES_OK = ['expense', 'income', 'transfer'];
function cleanDoc(coll, d, label) {
  const now = new Date().toISOString();
  if (coll === 'edits') {
    const splits = Array.isArray(d.splits) ? d.splits.slice(0, 6).map((s) => ({ category: str(s.category, 40), amount: num(s.amount) })).filter((s) => s.category && s.amount !== null) : null;
    return { book: label, txKey: str(d.txKey, 80), vendor: str(d.vendor, 40), category: str(d.category, 40), type: TYPES_OK.includes(d.type) ? d.type : '',
      oneTime: !!d.oneTime, splits: splits && splits.length >= 2 ? splits : null, ignored: !!d.ignored, tags: Array.isArray(d.tags) ? d.tags.slice(0, 5).map((x) => str(x, 30)).filter(Boolean) : null, createdAt: now };
  }
  if (coll === 'rules') {
    const cc = (arr) => (Array.isArray(arr) ? arr.slice(0, 8).map((c) => ({ field: ['description', 'vendor', 'category', 'type', 'amount'].includes(c && c.field) ? c.field : 'description', op: ['is', 'lt', 'gt', 'gte', 'eq'].includes(c && c.op) ? c.op : 'contains', value: str(c && c.value, 60) })).filter((c) => c.value) : []);
    const groups = Array.isArray(d.groups) ? d.groups.slice(0, 6).map(cc).filter((g) => g.length) : [];
    return { book: label, match: str(d.match, 60), ifVendor: str(d.ifVendor, 40), logic: groups.length > 1 ? 'or' : 'and', conds: cc(d.conds), groups, vendor: str(d.vendor, 40), category: str(d.category, 40), type: TYPES_OK.includes(d.type) ? d.type : '',
      oneTime: !!d.oneTime, ignore: !!d.ignore, tag: str(d.tag, 30), order: num(d.order), createdAt: now };
  }
  if (coll === 'accounts') {
    const KINDS = ['deposit', 'credit', 'investment', 'mortgage', 'loan'];
    return { book: label, shareTo: Array.isArray(d.shareTo) ? d.shareTo.slice(0, 6).map((x) => str(x, 40)).filter(Boolean) : [], shareHist: !!d.shareHist, name: str(d.name, 60), match: str(d.match || d.name, 60), kind: KINDS.includes(d.kind) ? d.kind : 'deposit', type: str(d.type, 20),
      rate: num(d.rate), owner: str(d.owner, 30), note: str(d.note, 120), rateEnds: str(d.rateEnds, 10), aliases: Array.isArray(d.aliases) ? d.aliases.slice(0, 10).map((x) => str(x, 60)).filter(Boolean) : [], limit: num(d.limit), payment: num(d.payment), escrow: num(d.escrow), extra: num(d.extra), active: d.active !== false, createdAt: now };
  }
  if (coll === 'shares') {
    const hist = Array.isArray(d.history) ? d.history.slice(-72).filter((x) => Array.isArray(x) && /^\d{4}-\d{2}$/.test(x[0]) && isFinite(Number(x[1]))).map((x) => [x[0], Math.round(Number(x[1]) * 100) / 100]) : null;
    return { book: label, src: str(d.src, 40), srcLabel: str(d.srcLabel, 40), key: str(d.key, 140), owner: str(d.owner, 30), name: str(d.name, 60),
      kind: ['deposit', 'investment', 'credit', 'mortgage', 'loan', 'asset'].includes(d.kind) ? d.kind : 'deposit', type: str(d.type, 20), balance: num(d.balance) || 0, asOf: str(d.asOf, 10), history: hist && hist.length ? hist : null, createdAt: now };
  }
  if (coll === 'prefs') {
    return { book: label, key: str(d.key, 30).replace(/[^a-z0-9_-]/gi, ''), value: String(d.value == null ? '' : d.value).slice(0, 60000), createdAt: now };
  }
  if (coll === 'holdings') {
    const lot = (x) => ({ date: /^\d{4}-\d{2}-\d{2}$/.test(x && x.date || '') ? x.date : '', qty: Math.max(0, num(x && x.qty) || 0), price: Math.max(0, num(x && x.price) || 0) });
    const lots = (a) => (Array.isArray(a) ? a.slice(0, 200).map(lot).filter((x) => x.qty > 0) : []);
    return { book: label, symbol: str(d.symbol, 12).toUpperCase().replace(/[^A-Z0-9.\-^]/g, ''), name: str(d.name, 60), account: str(d.account, 60),
      kind: ['stock', 'etf', 'fund', 'crypto', 'bond', 'other'].includes(d.kind) ? d.kind : 'stock', sector: str(d.sector, 40),
      lots: lots(d.lots), sales: lots(d.sales), divs: Array.isArray(d.divs) ? d.divs.slice(0, 400).map((x) => ({ date: /^\d{4}-\d{2}-\d{2}$/.test(x && x.date || '') ? x.date : '', amount: Math.max(0, num(x && x.amount) || 0) })).filter((x) => x.amount > 0) : [], manualPrice: num(d.manualPrice), manualAsOf: str(d.manualAsOf, 10), createdAt: now };
  }
  if (coll === 'goals') {
    return { book: label, name: str(d.name, 60), target: num(d.target), by: str(d.by, 10), account: str(d.account, 60), saved: num(d.saved), createdAt: now };
  }
  if (coll === 'budgets') {
    return { book: label, category: str(d.category, 40), amount: Math.max(0, num(d.amount) || 0), from: /^\d{4}-\d{2}$/.test(d.from || '') ? d.from : now.slice(0, 7),
      rollover: !!d.rollover, createdAt: now };
  }
  if (coll === 'manual') {
    return { book: label, type: d.type === 'income' ? 'income' : 'expense', date: str(d.date, 10), amount: num(d.amount),
      vendor: str(d.vendor, 40), category: str(d.category, 40), note: str(d.note, 120), createdAt: new Date().toISOString() };
  }
  const txns = Array.isArray(d.txns) ? d.txns.slice(0, 2500).map((t) => ({ date: str(t.date, 10), description: str(t.description, 120), amount: num(t.amount) })) : [];
  return { book: label, accountKind: ['deposit', 'credit', 'investment', 'mortgage', 'loan'].includes(d.accountKind) ? d.accountKind : 'deposit',
    accountName: str(d.accountName, 60), owner: str(d.owner, 30), fileName: str(d.fileName, 80), importedAt: new Date().toISOString(),
    rowCount: txns.length, dateFrom: str(d.dateFrom, 10), dateTo: str(d.dateTo, 10), balance: num(d.balance), balanceMonth: str(d.balanceMonth, 7), asOf: str(d.asOf, 10), accountType: str(d.accountType, 20), txns };
}

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
const keySig = () => { const k = apiKeys(); return (k.finnhub ? 'F' : '') + (k.fmp ? 'M' : ''); };
function quoteSources() { const k = apiKeys(); return [k.finnhub && 'Finnhub', k.fmp && 'Financial Modeling Prep', 'Stooq'].filter(Boolean); }
const QCACHE = new Map(), PCACHE = new Map(), QTTL = 60 * 60 * 1000, PTTL = 7 * 86400 * 1000;
async function getJson(u) { const r = await fetch(u, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'household-finance' } }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }
async function oneQuote(sym, k) {
  if (k.finnhub) {
    try { const j = await getJson(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${k.finnhub}`); if (j && j.c > 0) return { price: j.c, prevClose: j.pc || null, asOf: new Date((j.t || Date.now() / 1000) * 1000).toISOString(), source: 'Finnhub' }; } catch {}
  }
  if (k.fmp) {
    try { const j = await getJson(`https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(sym)}&apikey=${k.fmp}`); const x = Array.isArray(j) ? j[0] : null; if (x && x.price > 0) return { price: x.price, prevClose: x.previousClose || null, name: x.name || '', asOf: new Date((x.timestamp || Date.now() / 1000) * 1000).toISOString(), source: 'Financial Modeling Prep' }; } catch {}
  }
  try {
    const r = await fetch(`https://stooq.com/q/l/?s=${encodeURIComponent(sym.toLowerCase())}${sym.includes('.') ? '' : '.us'}&f=sd2t2ohlcvn&h&e=csv`, { signal: AbortSignal.timeout(8000) });
    const line = (await r.text()).trim().split(/\r?\n/)[1] || '', c = line.split(',');
    const close = Number(c[6]), open = Number(c[3]);
    if (close > 0) return { price: close, prevClose: null, open: open > 0 ? open : null, name: (c[8] || '').replace(/"/g, ''), asOf: c[1] && c[1] !== 'N/D' ? c[1] : new Date().toISOString().slice(0, 10), source: 'Stooq' };
  } catch {}
  return null;
}
async function oneProfile(sym, k) {
  if (k.fmp) { try { const j = await getJson(`https://financialmodelingprep.com/stable/profile?symbol=${encodeURIComponent(sym)}&apikey=${k.fmp}`); const x = Array.isArray(j) ? j[0] : null; if (x) return { name: x.companyName || '', sector: x.sector || '', industry: x.industry || '' }; } catch {} }
  if (k.finnhub) { try { const j = await getJson(`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(sym)}&token=${k.finnhub}`); if (j && j.name) return { name: j.name, sector: j.finnhubIndustry || '', industry: j.finnhubIndustry || '' }; } catch {} }
  return null;
}
async function getQuotes(syms) {
  const k = apiKeys(), out = {}, nowT = Date.now();
  await Promise.all(syms.map(async (s) => {
    let q = QCACHE.get(s);
    if (!q || nowT - q.at > QTTL) { const v = await oneQuote(s, k); if (v) { q = { at: nowT, v }; QCACHE.set(s, q); } }
    let p = PCACHE.get(s);
    if ((k.fmp || k.finnhub) && (!p || nowT - p.at > PTTL)) { const v = await oneProfile(s, k); p = { at: nowT, v }; PCACHE.set(s, p); }
    if (q) out[s] = { ...q.v, ...(p && p.v ? { name: p.v.name || q.v.name, sector: p.v.sector, industry: p.v.industry } : {}) };
  }));
  return out;
}

// dividend history per share (FMP), cached a day per symbol: [{ date: ex-date, amount per share }]
const DCACHE = new Map();
async function getDividends(syms) {
  const k = apiKeys(), out = {};
  if (!k.fmp) return out;
  for (const s of syms) {
    let c = DCACHE.get(s);
    if (!c || Date.now() - c.at > 86400e3) {
      try { const j = await getJson(`https://financialmodelingprep.com/stable/dividends?symbol=${encodeURIComponent(s)}&apikey=${k.fmp}`); const arr = Array.isArray(j) ? j : (j && j.historical) || []; c = { at: Date.now(), v: arr.slice(0, 60).map((x) => ({ date: x.date, amount: Number(x.adjDividend ?? x.dividend) || 0 })).filter((x) => x.amount > 0 && x.date) }; }
      catch { c = { at: Date.now(), v: [] }; }
      DCACHE.set(s, c);
    }
    out[s] = c.v;
  }
  return out;
}

// ---- per-holding detail (Finnhub + FMP), cached 6 hours: news, earnings, 52-week range, analyst view, ETF sectors ----
const SCACHE = new Map();
async function stockDetail(sym) {
  const c = SCACHE.get(sym); if (c && Date.now() - c.at < 6 * 3600e3) return c.v;
  const k = apiKeys(), v = { symbol: sym, news: [], earnings: null, range: null, rec: null, target: null, sectors: [], errors: [] };
  const d0 = new Date(), iso = (d) => d.toISOString().slice(0, 10), back = new Date(Date.now() - 10 * 864e5), fwd = new Date(Date.now() + 120 * 864e5);
  const fh = async (p, what) => { if (!k.finnhub) return null; try { return await getJson(`https://finnhub.io/api/v1/${p}${p.includes('?') ? '&' : '?'}token=${k.finnhub}`); } catch (e) { v.errors.push(`${what}: ${e.message}`); return null; } };
  const fm = async (p, what) => { if (!k.fmp) return null; try { return await getJson(`https://financialmodelingprep.com/stable/${p}${p.includes('?') ? '&' : '?'}apikey=${k.fmp}`); } catch (e) { v.errors.push(`${what}: ${e.message}`); return null; } };
  const news = await fh(`company-news?symbol=${sym}&from=${iso(back)}&to=${iso(d0)}`, 'News');
  if (Array.isArray(news)) v.news = news.slice(0, 5).map((n) => ({ headline: String(n.headline || '').slice(0, 200), source: n.source || '', url: /^https?:\/\//.test(n.url || '') ? n.url : '', at: n.datetime ? new Date(n.datetime * 1000).toISOString().slice(0, 10) : '' }));
  const met = await fh(`stock/metric?symbol=${sym}&metric=all`, '52-week range');
  if (met && met.metric) v.range = { hi: met.metric['52WeekHigh'] ?? null, lo: met.metric['52WeekLow'] ?? null, ytd: met.metric.yearToDatePriceReturnDaily ?? null };
  const rec = await fh(`stock/recommendation?symbol=${sym}`, 'Analyst ratings');
  if (Array.isArray(rec) && rec[0]) v.rec = { buy: (rec[0].strongBuy || 0) + (rec[0].buy || 0), hold: rec[0].hold || 0, sell: (rec[0].sell || 0) + (rec[0].strongSell || 0), period: rec[0].period };
  const ern = await fh(`calendar/earnings?symbol=${sym}&from=${iso(d0)}&to=${iso(fwd)}`, 'Earnings date');
  if (ern && Array.isArray(ern.earningsCalendar) && ern.earningsCalendar.length) { const e = ern.earningsCalendar.sort((a, b) => a.date.localeCompare(b.date))[0]; v.earnings = { date: e.date, when: e.hour || '', eps: e.epsEstimate ?? null }; }
  const tg = await fm(`price-target-consensus?symbol=${sym}`, 'Price target');
  if (Array.isArray(tg) && tg[0]) v.target = { mean: tg[0].targetConsensus ?? tg[0].targetMedian ?? null, hi: tg[0].targetHigh ?? null, lo: tg[0].targetLow ?? null };
  const sw = await fm(`etf/sector-weightings?symbol=${sym}`, 'ETF sectors');
  if (Array.isArray(sw)) v.sectors = sw.map((x) => ({ sector: x.sector, pct: Number(String(x.weightPercentage ?? x.weight ?? '').replace('%', '')) })).filter((x) => x.sector && x.pct > 0);
  SCACHE.set(sym, { at: Date.now(), v }); return v;
}

// ---- economy & household data: FRED, BLS, EIA (keys) and a few keyless sources; refreshed once a day, saved to a file ----
const ECON_FILE = () => path.join(DATA_DIR, 'econ-cache.json');
let ECON = null; try { ECON = JSON.parse(fs.readFileSync(ECON_FILE(), 'utf8')); } catch {}
const FRED_SERIES = {
  mort30: ['MORTGAGE30US', '30-year mortgage rate', '%'], mort15: ['MORTGAGE15US', '15-year mortgage rate', '%'],
  tbill3: ['DTB3', '3-month Treasury bill', '%'], t10: ['DGS10', '10-year Treasury', '%'], fedfunds: ['FEDFUNDS', 'Fed funds rate', '%'],
  cpi: ['CPIAUCSL', 'Consumer prices (CPI, US)', 'index'], hpiIC: ['ATNHPIUS26980Q', 'Iowa City home price index (FHFA)', 'index'], hpiUS: ['USSTHPI', 'US home price index (FHFA)', 'index'],
};
const BLS_SERIES = { cpiMW: ['CUUR0200SA0', 'Midwest: all items'], foodHomeMW: ['CUUR0200SAF11', 'Midwest: groceries'], energyMW: ['CUUR0200SA0E', 'Midwest: energy'], gasMW: ['CUUR0200SETB01', 'Midwest: gasoline'], shelterMW: ['CUUR0200SAH1', 'Midwest: shelter'], diningMW: ['CUUR0200SEFV', 'Midwest: restaurants'] };
async function buildEcon() {
  const k = apiKeys(), out = { at: Date.now(), fred: {}, bls: {}, eia: {}, holidays: [], errors: [] };
  const err = (w, e) => out.errors.push(`${w}: ${e && e.message ? e.message : e}`);
  if (k.fred) for (const [id, [sid, label, unit]] of Object.entries(FRED_SERIES)) {
    try { const j = await getJson(`https://api.stlouisfed.org/fred/series/observations?series_id=${sid}&api_key=${k.fred}&file_type=json&sort_order=desc&limit=60&observation_start=2015-01-01`);
      const obs = (j.observations || []).filter((o) => o.value !== '.' && isFinite(Number(o.value))).map((o) => [o.date, Number(o.value)]).sort((a, b) => a[0].localeCompare(b[0]));
      out.fred[id] = { label, unit, sid, obs }; } catch (e) { err('FRED ' + sid, e); }
  } else out.errors.push('No FRED key: mortgage/Treasury rates, inflation and home prices are off.');
  if (k.bls) {
    try { const y = new Date().getFullYear(); const r = await fetch('https://api.bls.gov/publicAPI/v2/timeseries/data/', { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seriesid: Object.values(BLS_SERIES).map((x) => x[0]), startyear: String(y - 2), endyear: String(y), registrationkey: k.bls }) });
      const j = await r.json(); for (const sr of (j.Results && j.Results.series) || []) { const id = Object.keys(BLS_SERIES).find((x) => BLS_SERIES[x][0] === sr.seriesID); if (!id) continue;
        out.bls[id] = { label: BLS_SERIES[id][1], obs: (sr.data || []).filter((d) => /^M\d\d$/.test(d.period) && d.period !== 'M13').map((d) => [`${d.year}-${d.period.slice(1)}`, Number(d.value)]).sort((a, b) => a[0].localeCompare(b[0])) }; }
      if (j.status && j.status !== 'REQUEST_SUCCEEDED') err('BLS', (j.message || []).join(' ') || j.status);
    } catch (e) { err('BLS', e); }
  } else out.errors.push('No BLS key: Midwest category inflation is off.');
  if (k.eia) {
    try { const j = await getJson(`https://api.eia.gov/v2/petroleum/pri/gnd/data/?api_key=${k.eia}&frequency=weekly&data[0]=value&facets[duoarea][]=R20&facets[product][]=EPMR&sort[0][column]=period&sort[0][direction]=desc&length=60`);
      out.eia.gas = { label: 'Midwest regular gasoline ($/gal)', obs: ((j.response && j.response.data) || []).map((d) => [d.period, Number(d.value)]).sort((a, b) => a[0].localeCompare(b[0])) }; } catch (e) { err('EIA gas', e); }
    try { const j = await getJson(`https://api.eia.gov/v2/electricity/retail-sales/data/?api_key=${k.eia}&frequency=monthly&data[0]=price&facets[stateid][]=IA&facets[sectorid][]=RES&sort[0][column]=period&sort[0][direction]=desc&length=36`);
      out.eia.elec = { label: 'Iowa home electricity (¢/kWh)', obs: ((j.response && j.response.data) || []).map((d) => [d.period, Number(d.price)]).sort((a, b) => a[0].localeCompare(b[0])) }; } catch (e) { err('EIA electricity', e); }
  } else out.errors.push('No EIA key: gas and electricity prices are off.');
  try { const y = new Date().getFullYear(); for (const yr of [y, y + 1]) { const j = await getJson(`https://date.nager.at/api/v3/PublicHolidays/${yr}/US`); out.holidays.push(...(j || []).filter((h) => !h.counties).map((h) => [h.date, h.name])); } } catch (e) { err('Holidays', e); }
  ECON = out; try { fs.writeFileSync(ECON_FILE(), JSON.stringify(out)); } catch {}
  return out;
}
let econBusy = null;
async function getEcon(force) {
  const keysig = (() => { const k = apiKeys(); return [k.fred, k.bls, k.eia].map((x) => (x ? 1 : 0)).join(''); })();
  const stale = !ECON || ECON.keysig !== keysig || Date.now() - ECON.at > 20 * 3600e3 || (force && Date.now() - ECON.at > 10 * 60e3);
  if (!stale) return ECON;
  if (!econBusy) econBusy = buildEcon().then((o) => { o.keysig = keysig; ECON = o; try { fs.writeFileSync(ECON_FILE(), JSON.stringify(o)); } catch {} return o; }).finally(() => { econBusy = null; });
  return econBusy;
}
// vehicles (NHTSA, no key): decode a VIN; open recalls for a make/model/year. Cached a week.
const VCACHE = new Map();
async function vehicleInfo(vin) {
  vin = String(vin || '').toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, ''); if (vin.length !== 17) return { error: 'A VIN has 17 characters.' };
  const c = VCACHE.get(vin); if (c && Date.now() - c.at < 7 * 864e5) return c.v;
  const d = await getJson(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`); const r = (d.Results || [])[0] || {};
  const v = { year: r.ModelYear || '', make: r.Make || '', model: r.Model || '', trim: r.Trim || '', body: r.BodyClass || '', recalls: [] };
  if (v.make && v.model && v.year) { try { const j = await getJson(`https://api.nhtsa.gov/recalls/recallsByVehicle?make=${encodeURIComponent(v.make)}&model=${encodeURIComponent(v.model)}&modelYear=${encodeURIComponent(v.year)}`);
    v.recalls = (j.results || []).slice(0, 20).map((x) => ({ id: x.NHTSACampaignNumber, date: x.ReportReceivedDate, component: x.Component, summary: String(x.Summary || '').slice(0, 300) })); } catch {} }
  VCACHE.set(vin, { at: Date.now(), v }); return v;
}

// ---- markets overview: indexes, commodities, sectors and top movers, paced to stay inside free-tier limits ----
// Refreshes at most once an hour while US markets are open; outside trading hours the last result is kept.
const MKT_FILE = () => path.join(DATA_DIR, 'market-cache.json');
let MKT = null;
try { MKT = JSON.parse(fs.readFileSync(MKT_FILE(), 'utf8')); } catch {}
function etNow() { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map((x) => [x.type, x.value])); return { day: p.weekday, mins: (Number(p.hour) % 24) * 60 + Number(p.minute), date: `${p.year}-${p.month}-${p.day}` }; }
function marketOpen() { const e = etNow(); return !['Sat', 'Sun'].includes(e.day) && e.mins >= 570 && e.mins < 960; }
function mktStale() {
  if (!MKT || MKT.keySig !== keySig()) return true; // keys added or changed: fetch again right away
  const e = etNow(), weekday = !['Sat', 'Sun'].includes(e.day);
  if (marketOpen()) return Date.now() - MKT.at > 60 * 60 * 1000;
  return weekday && e.mins >= 960 && MKT.closedFor !== e.date; // one refresh after the close for closing numbers
}
const INDEX_ETFS = [['SPY', 'S&P 500'], ['QQQ', 'Nasdaq 100'], ['DIA', 'Dow Jones'], ['IWM', 'Russell 2000']];
const COMMOD = [['GCUSD', 'GLD', 'Gold'], ['SIUSD', 'SLV', 'Silver'], ['CLUSD', 'USO', 'Crude oil'], ['NGUSD', 'UNG', 'Natural gas']];
let mktBusy = null;
async function buildMarkets() {
  const k = apiKeys(), errors = [], e0 = etNow(), out = { at: Date.now(), tradeDate: e0.date, closedFor: !marketOpen() && e0.mins >= 960 ? e0.date : '', open: marketOpen(), sources: quoteSources().filter((x) => x !== 'Stooq'), indexes: [], commodities: [], sectors: [], gainers: [], losers: [], errors };
  const fmp = async (pathq, label) => { if (!k.fmp) return null; try { return await getJson(`https://financialmodelingprep.com/stable/${pathq}${pathq.includes('?') ? '&' : '?'}apikey=${k.fmp}`); } catch (e) { errors.push(`${label}: ${e.message}`); return null; } };
  const fh = async (sym) => { if (!k.finnhub) return null; try { const j = await getJson(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${k.finnhub}`); return j && j.c > 0 ? j : null; } catch (e) { errors.push(`Finnhub ${sym}: ${e.message}`); return null; } };
  // indexes via the funds that track them (Finnhub quote; FMP as backup)
  for (const [sym, name] of INDEX_ETFS) {
    let q = await fh(sym), row = null;
    if (q) row = { symbol: sym, name, price: q.c, change: q.pc ? ((q.c - q.pc) / q.pc) * 100 : null, source: 'Finnhub' };
    else { const j = await fmp(`quote?symbol=${sym}`, `FMP ${sym}`); const x = Array.isArray(j) ? j[0] : null; if (x) row = { symbol: sym, name, price: x.price, change: x.changePercentage ?? x.changesPercentage ?? null, source: 'FMP' }; }
    if (row) out.indexes.push(row);
  }
  // trend: once a day, a year of closes for SPY/QQQ/DIA/IWM from FMP (4 calls a day)
  const prevHist = MKT && MKT.hist && MKT.histDate === out.tradeDate ? MKT.hist : null;
  out.hist = prevHist || {}; out.histDate = prevHist ? MKT.histDate : out.tradeDate;
  if (!prevHist) for (const [sym] of INDEX_ETFS) { const j = await fmp(`historical-price-eod/light?symbol=${sym}`, `FMP history ${sym}`); const arr = Array.isArray(j) ? j : j && j.historical; if (Array.isArray(arr)) out.hist[sym] = arr.slice(0, 300).map((x) => [x.date, x.price ?? x.close]).filter((x) => x[1] > 0).reverse(); }
  for (const r of out.indexes) { const h = out.hist[r.symbol] || []; const at = (d) => { const x = h.filter((p) => p[0] <= d).pop(); return x ? x[1] : null; }; const d = new Date(); const m1 = new Date(d - 30 * 864e5).toISOString().slice(0, 10), ytd = `${d.getFullYear() - 1}-12-31`; const a = at(m1), b = at(ytd); r.m1 = a ? ((r.price - a) / a) * 100 : null; r.ytd = b ? ((r.price - b) / b) * 100 : null; r.spark = h.slice(-66).map((p) => p[1]); }
  // commodities: FMP commodity quotes, Finnhub fund prices as backup
  for (const [fsym, etf, name] of COMMOD) {
    const j = await fmp(`quote?symbol=${fsym}`, `FMP ${name}`); const x = Array.isArray(j) ? j[0] : null;
    if (x && x.price > 0) { out.commodities.push({ name, symbol: fsym, price: x.price, change: x.changePercentage ?? x.changesPercentage ?? null, unit: 'futures', source: 'FMP' }); continue; }
    const q = await fh(etf); if (q) out.commodities.push({ name, symbol: etf, price: q.c, change: q.pc ? ((q.c - q.pc) / q.pc) * 100 : null, unit: `${etf} fund`, source: 'Finnhub' });
  }
  // sectors and movers (FMP)
  let sec = await fmp(`sector-performance-snapshot?date=${out.tradeDate}`, 'FMP sectors');
  if (!Array.isArray(sec) || !sec.length) { const y = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10); sec = await fmp(`sector-performance-snapshot?date=${y}`, 'FMP sectors (earlier)'); }
  if (Array.isArray(sec)) { const by = {}; sec.forEach((x) => { const n = x.sector; const v = Number(x.averageChange ?? x.changesPercentage); if (n && isFinite(v)) { (by[n] = by[n] || []).push(v); } }); out.sectors = Object.entries(by).map(([name, v]) => ({ name, change: v.reduce((t, x) => t + x, 0) / v.length })).sort((a, b) => b.change - a.change); }
  const mov = (j) => (Array.isArray(j) ? j.slice(0, 25).map((x) => ({ symbol: x.symbol, name: x.name || '', price: x.price, change: x.changesPercentage ?? x.changePercentage ?? null, sector: '' })) : []);
  out.gainers = mov(await fmp('biggest-gainers', 'FMP gainers')); out.losers = mov(await fmp('biggest-losers', 'FMP losers'));
  await tagSectors([...out.gainers, ...out.losers], k);
  if (!k.fmp || !k.finnhub) errors.push((!k.fmp && !k.finnhub ? 'No API keys found. ' : `Only the ${k.fmp ? 'FMP' : 'Finnhub'} key was found. `) + KEYNOTE);
  out.keySig = keySig();
  MKT = out; try { fs.writeFileSync(MKT_FILE(), JSON.stringify(out)); } catch {}
  return out;
}
// mover sectors: Finnhub industry mapped to the sector names FMP uses; cached on disk forever, at most 20 new lookups per refresh
const SEC_FILE = () => path.join(DATA_DIR, 'sector-cache.json');
let SECC = null;
const SECMAP = [[/semicond|tech|software|internet|electronic|computer|communications equip/i, 'Technology'], [/bank|financ|insur|capital market|asset manage/i, 'Financial Services'], [/pharma|biotech|health|medical|life science/i, 'Healthcare'], [/oil|gas|energy|coal/i, 'Energy'], [/utilit/i, 'Utilities'], [/real estate|reit/i, 'Real Estate'], [/media|telecom|entertain|commun/i, 'Communication Services'], [/retail|auto|hotel|restaurant|leisure|textile|apparel|consumer prod|home|distributor/i, 'Consumer Cyclical'], [/food|beverage|tobacco|household/i, 'Consumer Defensive'], [/metal|mining|chemical|material|paper|forest/i, 'Basic Materials'], [/aerospace|defense|machinery|industrial|transport|airline|logistic|construct|building|electrical equip|commercial serv|marine|road|rail/i, 'Industrials']];
async function tagSectors(list, k) {
  if (!SECC) { try { SECC = JSON.parse(fs.readFileSync(SEC_FILE(), 'utf8')); } catch { SECC = {}; } }
  let n = 0, dirty = false;
  for (const x of list) {
    if (!x.symbol) continue;
    if (!(x.symbol in SECC) && k.finnhub && n < 20) { n++; dirty = true;
      try { const j = await getJson(`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(x.symbol)}&token=${k.finnhub}`); const ind = (j && j.finnhubIndustry) || ''; SECC[x.symbol] = (SECMAP.find(([re]) => re.test(ind)) || [0, ind])[1] || ''; } catch { SECC[x.symbol] = ''; } }
    x.sector = SECC[x.symbol] || '';
  }
  if (dirty) { try { fs.writeFileSync(SEC_FILE(), JSON.stringify(SECC)); } catch {} }
}
async function getMarkets(force) {
  if (force && MKT && Date.now() - MKT.at < 10 * 60 * 1000) force = false; // even a manual refresh waits 10 minutes
  if (!force && !mktStale()) return MKT;
  if (!mktBusy) mktBusy = buildMarkets().finally(() => { mktBusy = null; });
  return mktBusy;
}

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
    return send(res, 200, { dividends: await getDividends(syms) });
  }
  if (parts[1] === 'quotes' && req.method === 'GET') {
    const syms = [...new Set(String(url.searchParams.get('s') || '').toUpperCase().split(',').map((x) => x.trim()).filter((x) => /^[A-Z0-9.\-^]{1,12}$/.test(x)))].slice(0, 60);
    return send(res, 200, { sources: quoteSources(), quotes: await getQuotes(syms) });
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
      fs.writeFileSync(file, JSON.stringify(cur, null, 2)); MKT = null; ECON = null; QCACHE.clear(); PCACHE.clear();
      return send(res, 200, { ok: true });
    }
  }
  if (parts[1] === 'stock' && req.method === 'GET') {
    const sym = String(url.searchParams.get('s') || '').toUpperCase().replace(/[^A-Z0-9.\-^]/g, '').slice(0, 12);
    if (!sym) return send(res, 400, { error: 'symbol?' });
    return send(res, 200, await stockDetail(sym));
  }
  if (parts[1] === 'econ' && req.method === 'GET') return send(res, 200, await getEcon(url.searchParams.get('refresh') === '1'));
  if (parts[1] === 'vehicle' && req.method === 'GET') { try { return send(res, 200, await vehicleInfo(url.searchParams.get('vin'))); } catch (e) { return send(res, 502, { error: 'Couldn’t reach NHTSA: ' + e.message }); } }
  if (parts[1] === 'markets' && req.method === 'GET') {
    const m = await getMarkets(url.searchParams.get('refresh') === '1');
    return send(res, 200, { ...m, hist: undefined, open: marketOpen(), nextRefresh: marketOpen() ? m.at + 3600e3 : null });
  }
  if (parts[1] === 'me' && req.method === 'GET') return send(res, 200, { username: user, books: userBooks(user) });

  if (parts[1] === 'books' && parts[2]) {
    const bookId = parts[2];
    if (!canUse(user, bookId)) return send(res, 403, { error: 'No access to this budget' });
    const book = db.prepare('SELECT id, name, label FROM books WHERE id = ?').get(bookId);

    if (parts[3] === 'shares-list' && req.method === 'GET') {
      return send(res, 200, db.prepare('SELECT id, json FROM docs WHERE book_id = ? AND coll = ?').all(bookId, 'shares').map((r) => ({ id: r.id, ...JSON.parse(r.json) })));
    }
    if (parts[3] === 'data' && req.method === 'GET') {
      const out = {};
      for (const r of db.prepare('SELECT dataset, json FROM seed WHERE book_id = ?').all(bookId)) out[r.dataset] = JSON.parse(r.json);
      for (const coll of COLLECTIONS) {
        out[coll] = db.prepare('SELECT id, json FROM docs WHERE book_id = ? AND coll = ? ORDER BY created').all(bookId, coll)
          .map((r) => ({ id: r.id, ...JSON.parse(r.json) }));
      }
      return send(res, 200, out);
    }
    if (parts[3] === 'export' && req.method === 'GET') {
      const out = { book, exportedAt: new Date().toISOString(), seed: {}, docs: {} };
      for (const r of db.prepare('SELECT dataset, json FROM seed WHERE book_id = ?').all(bookId)) out.seed[r.dataset] = JSON.parse(r.json);
      for (const coll of COLLECTIONS) out.docs[coll] = db.prepare('SELECT id, json, created, created_by FROM docs WHERE book_id = ? AND coll = ?').all(bookId, coll)
        .map((r) => ({ id: r.id, created: r.created, createdBy: r.created_by, ...JSON.parse(r.json) }));
      return send(res, 200, JSON.stringify(out, null, 1), { 'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${bookId}-${new Date().toISOString().slice(0, 10)}.json"` });
    }
    if (parts[3] === 'restore' && req.method === 'POST') {
      // Replace this dashboard's saved data with a backup file made by Export. A full database backup is taken first.
      let body; try { body = await readJson(req, 60 * 1024 * 1024); } catch (e) { return send(res, e.code || 400, { error: e.message }); }
      if (!body || typeof body.docs !== 'object') return send(res, 400, { error: 'That doesn’t look like a backup file from this app.' });
      const safety = backup();
      let n = 0;
      db.exec('BEGIN');
      try {
        db.prepare('DELETE FROM docs WHERE book_id = ?').run(bookId);
        const ins = db.prepare('INSERT INTO docs (id, book_id, coll, json, created, created_by) VALUES (?, ?, ?, ?, ?, ?)');
        for (const [c, list] of Object.entries(body.docs)) {
          if (!COLLECTIONS.has(c) || !Array.isArray(list)) continue;
          for (const d of list) { const { id, created, createdBy, ...rest } = d || {}; const doc = cleanDoc(c, rest, book.label); if (rest.createdAt) doc.createdAt = String(rest.createdAt).slice(0, 40);
            ins.run(crypto.randomBytes(10).toString('base64url'), bookId, c, JSON.stringify(doc), created || new Date().toISOString(), createdBy || user); n++; }
        }
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); return send(res, 500, { error: 'Restore failed; nothing was changed. ' + e.message }); }
      return send(res, 200, { ok: true, restored: n, safetyBackup: path.basename(safety) });
    }
    const coll = parts[3];
    if (COLLECTIONS.has(coll) && req.method === 'POST' && !parts[4]) {
      const doc = cleanDoc(coll, await readJson(req), book.label);
      const json = JSON.stringify(doc);
      if (json.length > 400000) return send(res, 413, { error: 'Too large' });
      const id = crypto.randomBytes(10).toString('base64url');
      db.prepare('INSERT INTO docs (id, book_id, coll, json, created, created_by) VALUES (?, ?, ?, ?, ?, ?)').run(id, bookId, coll, json, new Date().toISOString(), user);
      return send(res, 201, { id });
    }
    if (COLLECTIONS.has(coll) && req.method === 'DELETE' && parts[4]) {
      db.prepare('DELETE FROM docs WHERE id = ? AND book_id = ? AND coll = ?').run(parts[4], bookId, coll);
      return send(res, 200, { ok: true });
    }
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

let SERVER = null, BTIMER = null, RUN = null;
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
  return ready;
}

// stop() → Promise. Closes open connections so the port frees right away (tray "Stop hosting").
function stop() {
  if (!SERVER) return Promise.resolve();
  const s = SERVER; SERVER = null; RUN = null;
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
  const books = db.prepare('SELECT id FROM books').all().map((b) => b.id), list = (ids || []).filter((id) => books.includes(id));
  if (!list.length) throw new Error('Choose at least one budget.');
  setPassword(u, pw); db.prepare('DELETE FROM members WHERE username = ?').run(u);
  for (const id of list) db.prepare('INSERT INTO members (username, book_id) VALUES (?, ?)').run(u, id);
  return { user: u, books: list };
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
    const ids = String(list || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!/^[a-z0-9_.-]{2,32}$/i.test(name || '') || !ids.length) {
      console.log(`Usage: node server.js add-user <name> <budgets>\nBudgets: ${books.map((b) => `${b.id} (${b.name})`).join(', ')}`); return;
    }
    const bad = ids.filter((id) => !books.some((b) => b.id === id));
    if (bad.length) { console.log(`Unknown budget: ${bad.join(', ')}. Choose from ${books.map((b) => b.id).join(', ')}`); return; }
    const u = name.toLowerCase();
    setPassword(u, await askPassword());
    db.prepare('DELETE FROM members WHERE username = ?').run(u);
    for (const id of ids) db.prepare('INSERT INTO members (username, book_id) VALUES (?, ?)').run(u, id);
    console.log(`Login "${u}" can now see: ${ids.join(', ')}`);
  } else if (cmd === 'passwd') {
    const u = String(args[0] || '').toLowerCase();
    if (!db.prepare('SELECT 1 FROM users WHERE username = ?').get(u)) { console.log('No such login.'); return; }
    setPassword(u, await askPassword());
    console.log('Password changed. That login was signed out everywhere.');
  } else if (cmd === 'users') {
    for (const u of db.prepare('SELECT username FROM users ORDER BY username').all()) console.log(`${u.username}: ${userBooks(u.username).map((b) => b.id).join(', ')}`);
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
