// Larenest: automatic bank sync through SimpleFIN Bridge (https://beta-bridge.simplefin.org).
// The user pays SimpleFIN directly (about $15/year) and links their banks on SimpleFIN's site; this app only
// holds the read-only access URL SimpleFIN gives back, and pulls balances and posted transactions with it.
// Used by BOTH the PC server and the phone's phone-only mode.
//
// createSimpleFin(env) where env provides (each may return a Promise):
//   request(method, url, headers) → { status, text }       plain HTTPS request
//   load(bookId) / save(bookId, state)                     connection state per dashboard (kept OUT of backups)
//   bookData(bookId) → { imports: [...], accounts: [...] } the dashboard's statements and account list (duplicate checks)
//   addDoc(bookId, coll, doc)                              save a document the same way the app does
//   provider (optional)                                    another aggregator (Plaid: core/banklinks.js) with the
//                                                          same shape as the SimpleFIN one below: { id, label, multi, connect,
//                                                          pull, start?, disconnect?, autoGap?, manualGap?, emptyNote? }.
//                                                          pull() returns accounts in SimpleFIN's format, so the import logic is shared.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FDSimpleFin = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const MANUAL_GAP = 15 * 60e3, AUTO_GAP = 6 * 3600e3, FIRST_DAYS = 90, OVERLAP_DAYS = 5, SEEN_MAX = 4000;
  const KINDS = ['deposit:checking', 'deposit:savings', 'deposit:hysa', 'deposit:money_market', 'deposit:cd', 'deposit:cash_mgmt', 'credit:card', 'credit:loc',
    'mortgage:mortgage', 'loan:heloc', 'loan:auto', 'loan:student', 'loan:personal', 'loan:other', 'investment:brokerage', 'investment:401k', 'investment:403b',
    'investment:457b', 'investment:roth_ira', 'investment:trad_ira', 'investment:rollover_ira', 'investment:sep_ira', 'investment:hsa', 'investment:529',
    'investment:pension', 'investment:crypto', 'investment:other', 'investment:roth_401k', 'investment:solo_401k', 'investment:tsp', 'investment:esa', 'investment:utma', 'investment:able', 'investment:annuity', 'investment:treasury', 'deposit:fsa'];
  const OWED = /^(credit|mortgage|loan):/;
  const b64 = (s) => (typeof Buffer !== 'undefined' ? Buffer.from(s, 'utf8').toString('base64') : btoa(unescape(encodeURIComponent(s))));
  const unb64 = (s) => (typeof Buffer !== 'undefined' ? Buffer.from(s, 'base64').toString('utf8') : decodeURIComponent(escape(atob(s))));
  const day = (unix) => { const d = new Date(Number(unix) * 1000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  // banks sometimes send symbols like (R) as broken bytes; drop them
  const clean = (v) => String(v == null ? '' : v).replace(/[\uFFFD\u0000-\u001f]+/g, '').replace(/\s+/g, ' ').trim();
  function guessKind(name) {
    const n = String(name || '').toLowerCase();
    if (/credit|card|visa|mastercard|amex|discover/.test(n)) return 'credit:card';
    if (/mortgage/.test(n)) return 'mortgage:mortgage';
    if (/heloc|home equity/.test(n)) return 'loan:heloc';
    if (/auto|car loan|vehicle/.test(n)) return 'loan:auto';
    if (/student/.test(n)) return 'loan:student';
    if (/loan/.test(n)) return 'loan:personal';
    if (/roth/.test(n)) return 'investment:roth_ira';
    if (/401/.test(n)) return 'investment:401k';
    if (/\bira\b/.test(n)) return 'investment:trad_ira';
    if (/hsa/.test(n)) return 'investment:hsa';
    if (/brokerage|invest|individual|trust/.test(n)) return 'investment:brokerage';
    if (/money market/.test(n)) return 'deposit:money_market';
    if (/high.?yield/.test(n)) return 'deposit:hysa';
    if (/saving/.test(n)) return 'deposit:savings';
    return 'deposit:checking';
  }
  // "https://user:pass@host/path" → { base: "https://host/path", auth: "Basic …" } (browsers refuse credentials in URLs)
  function splitAccess(access) {
    const u = new URL(access); const auth = 'Basic ' + b64(decodeURIComponent(u.username) + ':' + decodeURIComponent(u.password));
    u.username = ''; u.password = ''; return { base: u.toString().replace(/\/$/, ''), auth };
  }
  function err(code, message) { const e = new Error(message); e.code = code; return e; }

  function createSimpleFin(env) {
    const busy = new Set();
    const P = env.provider || { id: 'simplefin', label: 'SimpleFIN', multi: false, connect: (b) => claim(b.token), pull: (access, start) => pull(access, start),
      emptyNote: 'Connected, but no bank accounts yet. Add your banks in SimpleFIN Bridge (New connection), then press Sync now here.' };
    const AUTO = P.autoGap || AUTO_GAP, MANUAL = P.manualGap || MANUAL_GAP;
    async function claim(token) {
      let url; try { url = unb64(String(token || '').trim()); new URL(url); } catch { throw err(400, 'That doesn’t look like a SimpleFIN setup token. Copy the whole token from SimpleFIN Bridge and paste it here.'); }
      if (!/^https:\/\//i.test(url)) throw err(400, 'That setup token doesn’t point to a secure (https) address.');
      const r = await env.request('POST', url, { 'Content-Length': '0' });
      if (r.status === 403) throw err(400, 'SimpleFIN says this setup token was already used or has expired. Make a new one in SimpleFIN Bridge and paste that.');
      if (r.status >= 400) throw err(502, 'SimpleFIN returned an error (HTTP ' + r.status + '). Try again in a few minutes.');
      const access = String(r.text || '').trim(); try { splitAccess(access); } catch { throw err(502, 'SimpleFIN sent back something unexpected. Try a new setup token.'); }
      return access;
    }
    async function pull(access, startUnix) {
      const { base, auth } = splitAccess(access);
      const r = await env.request('GET', `${base}/accounts?start-date=${Math.floor(startUnix)}&pending=1`, { Authorization: auth }); // pending ones are shown, never saved
      if (r.status === 402) throw err(402, 'Your SimpleFIN subscription needs attention (payment required). Check your SimpleFIN Bridge account.');
      if (r.status === 403) throw err(403, 'SimpleFIN refused this connection. It may have been revoked; disconnect and connect again with a new setup token.');
      if (r.status >= 400) throw err(502, 'SimpleFIN returned an error (HTTP ' + r.status + ')' + (String(r.text || '').trim() ? ': ' + String(r.text).trim().slice(0, 160) : '.'));
      let j; try { j = JSON.parse(r.text); } catch { throw err(502, 'SimpleFIN sent back something unexpected.'); }
      return { accounts: Array.isArray(j.accounts) ? j.accounts : [], errors: (Array.isArray(j.errors) ? j.errors : []).map(String).slice(0, 5) };
    }
    function refreshList(st, accounts) {
      st.accounts = st.accounts || {};
      for (const a of accounts) {
        const id = String(a.id || ''); if (!id) continue;
        const org = clean((a.org && (a.org.name || a.org.domain)) || '').slice(0, 60), name = (clean(a.name) || 'Account').slice(0, 60);
        // a newly found account waits (review) until it's saved, so you can untick it before anything is brought in
        const cur = st.accounts[id] || { map: name.slice(0, 60), kind: guessKind(name), skip: false, review: true, seen: [], lastBal: null };
        if (/\uFFFD/.test(cur.map)) cur.map = clean(cur.map);
        st.accounts[id] = { ...cur, name, org, currency: String(a.currency || 'USD').slice(0, 10) };
      }
    }
    const view = (st) => ({
      provider: P.id, label: P.label, multi: !!P.multi, banks: P.multi && st && Array.isArray(st.access) ? st.access.map((x) => x.institution || 'Bank') : [],
      connected: !!(st && st.access && (!Array.isArray(st.access) || st.access.length)), lastSync: (st && st.lastSync) || null, lastError: (st && st.lastError) || '', notes: (st && st.notes) || [], kinds: KINDS,
      pending: (st && st.pending) || [], flags: (st && st.flags) || [],
      accounts: Object.entries((st && st.accounts) || {}).map(([id, a]) => ({ id, name: a.name, org: a.org, map: a.map, kind: a.kind, skip: !!a.skip, review: !!a.review, flip: !!a.flip, synced: (a.seen || []).length })),
    });

    async function sync(bookId, auto) {
      if (busy.has(bookId)) return { added: 0, busy: true };
      const st = (await env.load(bookId)) || {}; if (!st.access) throw err(400, `Not connected to ${P.label}.`);
      const now = Date.now();
      if (st.lastTry && now - st.lastTry < (auto ? AUTO : MANUAL)) {
        if (auto) return { added: 0, skipped: true };
        throw err(429, `Synced recently. To stay within ${P.label}’s limits, wait ${Math.ceil((MANUAL - (now - st.lastTry)) / 60e3)} more minute(s).`);
      }
      busy.add(bookId);
      try {
        st.lastTry = now;
        const start = (st.lastSync ? st.lastSync - OVERLAP_DAYS * 864e5 : now - FIRST_DAYS * 864e5) / 1000;
        let res; try { res = await P.pull(st.access, start); } catch (e) { st.lastError = e.message; await env.save(bookId, st); throw e; }
        refreshList(st, res.accounts);
        // What's already in each account, by the same rule the dashboard uses (public/calcs.js makeDupeChecker): a synced
        // transaction is skipped if its id is already there, or if it matches a row from a statement without ids that
        // hasn't been matched yet. Two genuine identical purchases stay two.
        const data = (await env.bookData(bookId)) || {}, known = [...(data.accounts || [])], have = new Map();
        const acctOf = (name) => { const k = String(name || '').toLowerCase(); if (!have.has(k)) have.set(k, { ids: new Set(), fp: new Map() }); return have.get(k); };
        for (const imp of data.imports || []) { let l = imp.txns; if (typeof l === 'string') { try { l = JSON.parse(l); } catch { l = []; } }
          const A = acctOf(imp.accountName || imp.fileName), per = new Map();
          for (const t of l || []) { if (t.id) { A.ids.add(String(t.id)); continue; } const f = `${t.date}|${Number(t.amount)}|${String(t.description || '').trim()}`; per.set(f, (per.get(f) || 0) + 1); }
          for (const [f, n] of per) A.fp.set(f, Math.max(A.fp.get(f) || 0, n)); }
        let added = 0, docs = 0;
        // Pending transactions are shown (Transactions, Accounts) but never saved: the whole list is replaced on every sync,
        // so when a charge posts (often with a new id and a slightly different amount) its pending copy just disappears.
        const pendNow = [], prevPend = Array.isArray(st.pending) ? st.pending : [], newPosted = [];
        for (const a of res.accounts) {
          const m = st.accounts[String(a.id)]; if (!m || m.skip || m.review) continue;
          const seen = new Set(m.seen || []), A = acctOf(m.map), txns = [];
          for (const t of Array.isArray(a.transactions) ? a.transactions : []) {
            if (t.pending || !t.posted) {
              const amt = Math.round((m.flip ? 1 : -1) * Number(t.amount) * 100) / 100;
              if (isFinite(amt) && amt && pendNow.length < 300) pendNow.push({ account: m.map, date: day(t.transacted_at || t.posted || now / 1000), description: String(t.description || t.payee || '').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Transaction', amount: amt, id: String(t.id || '') });
              continue; // only posted transactions are saved, so nothing counts twice when a pending charge settles
            }
            const id = String(t.id || ''); if (id && seen.has(id)) continue;
            const amount = Math.round((m.flip ? 1 : -1) * Number(t.amount) * 100) / 100; if (!isFinite(amount) || !amount) { if (id) seen.add(id); continue; }
            const sid = id ? (P.id || 'sync') + ':' + String(a.id) + ':' + id : ''; // the provider's id, scoped to provider and account
            const row = { date: day(t.posted), description: String(t.description || t.payee || '').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Transaction', amount, ...(sid ? { id: sid } : {}) };
            if (id) seen.add(id);
            if (sid && A.ids.has(sid)) continue;
            const f = `${row.date}|${row.amount}|${row.description}`, left = A.fp.get(f) || 0; if (left > 0) { A.fp.set(f, left - 1); continue; } // already imported from a statement
            txns.push(row); newPosted.push({ ...row, account: m.map });
          }
          const rawBal = Number(a.balance), bal = isFinite(rawBal) ? Math.round((OWED.test(m.kind) ? Math.abs(rawBal) : rawBal) * 100) / 100 : null;
          m.seen = [...seen].slice(-SEEN_MAX);
          if (!txns.length && (bal === null || bal === m.lastBal)) continue;
          txns.sort((x, y) => (x.date < y.date ? -1 : 1));
          const asOf = a['balance-date'] ? day(a['balance-date']) : new Date().toISOString().slice(0, 10), [kind, type] = m.kind.split(':');
          for (let i = 0; i < Math.max(1, txns.length); i += 2000) {
            const part = txns.slice(i, i + 2000), last = i + 2000 >= txns.length;
            await env.addDoc(bookId, 'imports', { accountKind: kind, accountType: type || '', accountName: m.map, owner: '', fileName: P.label + ' sync', source: 'sync', importedAt: new Date().toISOString(),
              rowCount: part.length, dateFrom: part.length ? part[0].date : asOf, dateTo: part.length ? part[part.length - 1].date : asOf,
              balance: last ? bal : null, balanceMonth: asOf.slice(0, 7), asOf, txns: part });
            docs++;
          }
          const nk = (x) => String(x || '').trim().toLowerCase().replace(/^[^\u2013]+ \u2013 /, '');
          if (!known.some((r) => [r.match, r.name, ...(r.aliases || [])].some((x) => x && nk(x) === nk(m.map)))) {
            await env.addDoc(bookId, 'accounts', { name: m.map, match: m.map, kind, type: type || '', rate: null, owner: '', note: 'Synced from ' + P.label, createdAt: new Date().toISOString() });
            known.push({ name: m.map, match: m.map });
          }
          m.lastBal = bal; added += txns.length;
        }
        // A charge that posted for noticeably more than it was pending (a big tip, a gas station or hotel hold that grew):
        // same account and store, a pending copy that's now gone, within a week, posted 30%+ (and $2+) higher.
        const word = (d) => String(d || '').toLowerCase().replace(/^(sq|tst|pos|purchase|debit|card|pp|paypal)\b[\s*#:]*/g, '').replace(/[^a-z]+/g, ' ').trim().split(' ').filter((w) => w.length > 2).slice(0, 2).join(' ');
        const gone = prevPend.filter((p) => !pendNow.some((q) => (p.id && q.id === p.id) || (q.account === p.account && q.amount === p.amount && q.description === p.description)));
        const used = new Set(), flags = Array.isArray(st.flags) ? st.flags : [];
        for (const r of newPosted) {
          if (r.amount <= 0) continue;
          const i = gone.findIndex((p, k) => !used.has(k) && p.account === r.account && p.amount > 0 && word(p.description) && word(p.description) === word(r.description) && Math.abs(Date.parse(p.date) - Date.parse(r.date)) <= 7 * 864e5 && r.amount >= p.amount);
          if (i < 0) continue; used.add(i); const p = gone[i];
          if (r.amount - p.amount >= 2 && r.amount > p.amount * 1.3) flags.push({ key: (r.id || `${r.account}|${r.date}|${r.amount}`), account: r.account, description: r.description, date: r.date, pending: p.amount, posted: r.amount, at: new Date(now).toISOString() });
        }
        st.flags = flags.slice(-50); st.pending = pendNow;
        st.lastSync = now; st.lastError = ''; st.notes = res.errors;
        await env.save(bookId, st);
        return { added, statements: docs, notes: res.errors };
      } finally { busy.delete(bookId); }
    }

    // /api/books/:id/simplefin[/sync]  GET status · POST {token} connect · POST {accounts:{id:{map,kind,skip}}} save · POST sync · DELETE disconnect
    async function handle(method, rest, bookId, getBody) {
      const st = (await env.load(bookId)) || {};
      if (method === 'GET') return { status: 200, body: view(st) };
      if (method === 'DELETE') { if (P.disconnect && st.access) { try { await P.disconnect(st.access); } catch {} } await env.save(bookId, null); return { status: 200, body: { ok: true } }; }
      if (method !== 'POST') return { status: 405, body: { error: 'Not allowed' } };
      try {
        if (rest[0] === 'start') { if (!P.start) return { status: 400, body: { error: 'Nothing to start.' } }; return { status: 200, body: await P.start(bookId) }; }
        if (rest[0] === 'sync') return { status: 200, body: { ...(await sync(bookId, false)), ...view(await env.load(bookId)) } };
        const b = (await getBody()) || {};
        if (b.token || b.connect) {
          // Save the connection as soon as SimpleFIN hands it over: a setup token works only once, so a problem
          // fetching accounts afterwards (no banks linked yet, subscription not active) must not lose it.
          // (Plaid adds one bank login at a time, so those keep a list and keep the accounts already set up.)
          const access = await P.connect(b, P.multi ? st.access : null), next = P.multi ? { ...st, access, accounts: st.accounts || {} } : { access, accounts: {} };
          await env.save(bookId, next);
          try { const res = await P.pull(access, Date.now() / 1000 - 86400); refreshList(next, res.accounts); next.notes = res.errors; next.lastError = ''; }
          catch (e) { next.lastError = e.message; }
          if (!Object.keys(next.accounts).length && !next.lastError && P.emptyNote) next.notes = [...(next.notes || []), P.emptyNote];
          await env.save(bookId, next); return { status: 200, body: view(next) };
        }
        if (b.dismiss) { st.flags = (st.flags || []).filter((f) => f.key !== String(b.dismiss)); await env.save(bookId, st); return { status: 200, body: view(st) }; }
        if (b.accounts && typeof b.accounts === 'object') {
          for (const [id, v] of Object.entries(b.accounts)) { const a = (st.accounts || {})[id]; if (!a || !v) continue;
            if (typeof v.map === 'string' && v.map.trim()) a.map = v.map.trim().slice(0, 60); if (KINDS.includes(v.kind)) a.kind = v.kind; a.skip = !!v.skip; delete a.review; if ('flip' in v) a.flip = !!v.flip; }
          await env.save(bookId, st); return { status: 200, body: view(st) };
        }
        return { status: 400, body: { error: 'Nothing to do.' } };
      } catch (e) { return { status: e.code >= 400 && e.code < 600 ? e.code : 502, body: { error: e.message || P.label + ' error' } }; }
    }
    // Background sync for every connected dashboard (each at most every 6 hours).
    async function syncAll(bookIds) { const out = {}; for (const id of bookIds) { try { const st = await env.load(id); if (st && st.access) out[id] = await sync(id, true); } catch (e) { out[id] = { error: e.message }; } } return out; }
    return { handle, sync, syncAll, claim, guessKind };
  }
  return { createSimpleFin, createBankSync: createSimpleFin, guessKind, splitAccess, clean, err };
});
