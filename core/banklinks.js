// Larenest: bank sync with your OWN Teller or Plaid developer keys (server only: both need a secret or a
// client certificate that must not live in a browser). Each provider turns its API's data into SimpleFIN's
// account format, so core/simplefin.js's sync (duplicate checks, account mapping, imports) is shared.
//
// Teller (teller.io): free "development" environment, up to 100 bank logins, real banks. Needs an application id
//   plus the client certificate and private key from the Teller dashboard (mutual TLS).
// Plaid (plaid.com): needs a client id and secret; real banks need Plaid's production approval.
//
// env.request(method, url, headers, body, tls) → { status, text }   (tls = { cert, key } for Teller)
// env.keys() → { teller: { appId, env, cert, key }, plaid: { clientId, secret, env } }
'use strict';
const { err, clean } = require('./simplefin.js');

const unix = (ymd) => Math.floor(Date.parse(String(ymd).slice(0, 10) + 'T12:00:00') / 1000); // noon, so the day never shifts
const ymd = (d) => new Date(d).toISOString().slice(0, 10);
const parse = (r, who) => { try { return JSON.parse(r.text); } catch { throw err(502, `${who} sent back something unexpected (HTTP ${r.status}).`); } };

function createTeller(env) {
  const BASE = 'https://api.teller.io';
  const cfg = () => { const k = (env.keys() || {}).teller || {}; if (!k.appId) throw err(400, 'Add your Teller application ID in Settings → Your own bank-sync keys first.'); return k; };
  async function get(token, path) {
    const k = cfg();
    if (k.env !== 'sandbox' && !(k.cert && k.key)) throw err(400, 'Teller needs your certificate and private key (from the Teller dashboard) for real banks. Add them in Settings → Your own bank-sync keys.');
    const auth = 'Basic ' + Buffer.from(token + ':').toString('base64');
    const r = await env.request('GET', BASE + path, { Authorization: auth, Accept: 'application/json' }, null, k.env === 'sandbox' ? null : { cert: k.cert, key: k.key });
    if (r.status >= 400) {
      let j = {}; try { j = JSON.parse(r.text); } catch {}
      const code = (j.error && j.error.code) || '', m = (j.error && j.error.message) || '';
      if (/enrollment\.disconnected/.test(code)) throw err(409, 'disconnected');
      if (r.status === 401) throw err(401, 'Teller didn’t accept this bank connection. Remove it and connect the bank again.');
      throw err(502, `Teller returned an error (HTTP ${r.status})${m ? ': ' + m.slice(0, 160) : '.'}`);
    }
    return parse(r, 'Teller');
  }
  return {
    id: 'teller', label: 'Teller', multi: true, autoGap: 6 * 3600e3, manualGap: 5 * 60e3,
    async start() { const k = cfg(); return { kind: 'teller', applicationId: k.appId, environment: k.env || 'development' }; },
    // b.connect = what Teller Connect's onSuccess gave the page: { accessToken, enrollment: { id, institution: { name } } }
    async connect(b, prev) {
      const c = b.connect || {}, token = String(c.accessToken || '').trim();
      if (!/^[\w-]{6,200}$/.test(token)) throw err(400, 'Teller didn’t send back a connection. Try again.');
      const enr = String((c.enrollment && c.enrollment.id) || '').slice(0, 80), inst = clean((c.enrollment && c.enrollment.institution && c.enrollment.institution.name) || 'Bank').slice(0, 60);
      await get(token, '/accounts'); // check it works before saving
      return [...(Array.isArray(prev) ? prev : []).filter((x) => !enr || x.enrollment !== enr), { token, enrollment: enr, institution: inst }];
    },
    async pull(list, startUnix) {
      const accounts = [], errors = [], from = ymd(startUnix * 1000);
      for (const it of Array.isArray(list) ? list : []) {
        let accts; try { accts = await get(it.token, '/accounts'); } catch (e) { errors.push(e.message === 'disconnected' ? `${it.institution} needs you to sign in again: remove it and connect it again.` : `${it.institution}: ${e.message}`); continue; }
        for (const a of Array.isArray(accts) ? accts : []) {
          if (a.status && a.status !== 'open') continue;
          let bal = null, tx = [];
          try { const b = await get(it.token, `/accounts/${encodeURIComponent(a.id)}/balances`); bal = Number(b.ledger != null ? b.ledger : b.available); } catch (e) { errors.push(`${it.institution} ${a.name}: balance unavailable`); }
          try { tx = await get(it.token, `/accounts/${encodeURIComponent(a.id)}/transactions`); } catch (e) { errors.push(`${it.institution} ${a.name}: transactions unavailable`); }
          accounts.push({ id: 'tl_' + a.id, name: `${a.name || 'Account'}${a.last_four ? ' …' + a.last_four : ''}`, org: { name: (a.institution && a.institution.name) || it.institution }, currency: a.currency || 'USD',
            balance: isFinite(bal) ? bal : null, 'balance-date': Math.floor(Date.now() / 1000),
            // Teller: negative amounts are money out, the same as SimpleFIN (use "Flip signs" on an account if a bank reports it the other way)
            transactions: (Array.isArray(tx) ? tx : []).filter((t) => String(t.date) >= from).map((t) => ({ id: 'tl_' + t.id, posted: unix(t.date), amount: Number(t.amount), pending: t.status === 'pending',
              description: (t.details && t.details.counterparty && t.details.counterparty.name) || t.description || '' })) });
        }
      }
      if (!accounts.length && errors.length) throw err(502, errors[0]);
      return { accounts, errors: errors.slice(0, 5) };
    },
    emptyNote: 'Connected, but Teller didn’t list any open accounts for this bank yet. Press Sync now in a few minutes.',
  };
}

function createPlaid(env) {
  const cfg = () => { const k = (env.keys() || {}).plaid || {}; if (!k.clientId || !k.secret) throw err(400, 'Add your Plaid client ID and secret in Settings → Your own bank-sync keys first.'); return k; };
  async function post(path, body) {
    const k = cfg(), base = k.env === 'sandbox' ? 'https://sandbox.plaid.com' : 'https://production.plaid.com';
    const r = await env.request('POST', base + path, { 'Content-Type': 'application/json' }, JSON.stringify({ client_id: k.clientId, secret: k.secret, ...body }));
    const j = parse(r, 'Plaid');
    if (r.status >= 400) {
      const code = j.error_code || '', e = err(r.status === 400 ? 400 : 502, `Plaid: ${j.display_message || j.error_message || 'error ' + r.status}`); e.plaid = code;
      if (code === 'ITEM_LOGIN_REQUIRED') e.message = 'needs you to sign in again: remove it and connect it again.';
      if (code === 'PRODUCT_NOT_READY') e.message = 'is still gathering your transactions. Press Sync now in a few minutes.';
      if (code === 'INVALID_API_KEYS') e.message = 'Plaid didn’t accept your client ID or secret (check which environment they’re for).';
      throw e;
    }
    return j;
  }
  return {
    id: 'plaid', label: 'Plaid', multi: true, autoGap: 6 * 3600e3, manualGap: 5 * 60e3,
    async start(bookId) {
      const j = await post('/link/token/create', { client_name: 'Larenest', user: { client_user_id: String(bookId).slice(0, 60) }, products: ['transactions'], country_codes: ['US'], language: 'en', transactions: { days_requested: 730 } });
      return { kind: 'plaid', linkToken: j.link_token, environment: cfg().env || 'production' };
    },
    // b.connect = { publicToken, institution } from Plaid Link's onSuccess
    async connect(b, prev) {
      const c = b.connect || {}, pub = String(c.publicToken || '').trim(); if (!/^public-[\w-]+$/.test(pub)) throw err(400, 'Plaid didn’t send back a connection. Try again.');
      const j = await post('/item/public_token/exchange', { public_token: pub });
      return [...(Array.isArray(prev) ? prev : []).filter((x) => x.item !== j.item_id), { token: j.access_token, item: j.item_id, institution: clean(c.institution || 'Bank').slice(0, 60) }];
    },
    async pull(list, startUnix) {
      const accounts = [], errors = [], start = ymd(startUnix * 1000), end = ymd(Date.now());
      for (const it of Array.isArray(list) ? list : []) {
        let accts = [], txns = [], total = 1;
        try {
          for (let off = 0; off < total && off < 20000; off += 500) { const j = await post('/transactions/get', { access_token: it.token, start_date: start, end_date: end, options: { count: 500, offset: off } }); accts = j.accounts || accts; txns.push(...(j.transactions || [])); total = j.total_transactions || 0; }
        } catch (e) {
          if (e.plaid === 'PRODUCT_NOT_READY') { try { accts = (await post('/accounts/get', { access_token: it.token })).accounts || []; } catch {} errors.push(`${it.institution} ${e.message}`); }
          else { errors.push(`${it.institution} ${e.message}`); continue; }
        }
        for (const a of accts) {
          const bal = a.balances ? Number(a.balances.current != null ? a.balances.current : a.balances.available) : NaN;
          accounts.push({ id: 'pl_' + a.account_id, name: `${a.official_name || a.name || 'Account'}${a.mask ? ' …' + a.mask : ''}`, org: { name: it.institution }, currency: (a.balances && a.balances.iso_currency_code) || 'USD',
            balance: isFinite(bal) ? bal : null, 'balance-date': Math.floor(Date.now() / 1000),
            // Plaid: positive amounts are money out, the opposite of SimpleFIN, so flip them here
            transactions: txns.filter((t) => t.account_id === a.account_id).map((t) => ({ id: 'pl_' + t.transaction_id, posted: unix(t.date), amount: -Number(t.amount), pending: !!t.pending, description: t.merchant_name || t.name || '' })) });
        }
      }
      if (!accounts.length && errors.length) throw err(502, errors[0]);
      return { accounts, errors: errors.slice(0, 5) };
    },
    async disconnect(list) { for (const it of Array.isArray(list) ? list : []) { try { await post('/item/remove', { access_token: it.token }); } catch {} } },
    emptyNote: 'Connected. Plaid can take a few minutes to gather transactions; press Sync now shortly.',
  };
}

module.exports = { createTeller, createPlaid };
