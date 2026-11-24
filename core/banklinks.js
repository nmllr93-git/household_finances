// Larenest: bank sync with your OWN Plaid developer keys (server only: both need a secret or a
// client certificate that must not live in a browser). Each provider turns its API's data into SimpleFIN's
// account format, so core/simplefin.js's sync (duplicate checks, account mapping, imports) is shared.
//
// Plaid (plaid.com): needs a client id and secret; real banks need Plaid's production approval.
//
// env.request(method, url, headers, body, tls) → { status, text }
// env.keys() → { plaid: { clientId, secret, env } }
'use strict';
const { err, clean } = require('./simplefin.js');

const unix = (ymd) => Math.floor(Date.parse(String(ymd).slice(0, 10) + 'T12:00:00') / 1000); // noon, so the day never shifts
const ymd = (d) => new Date(d).toISOString().slice(0, 10);
const parse = (r, who) => { try { return JSON.parse(r.text); } catch { throw err(502, `${who} sent back something unexpected (HTTP ${r.status}).`); } };

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

module.exports = { createPlaid };
