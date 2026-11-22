// Weekly email digest (self-hosted server and desktop host only).
// - buildDigest(): runs the same calculations as the dashboard (public/calcs.js) on one dashboard's data
//   and writes a short summary: last week's spending, top categories, the month's budget, bills due in the
//   next 7 days, cash on hand and anything that needs a category.
// - sendMail(): a small SMTP client using only Node built-ins (implicit TLS on 465, STARTTLS on 587).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const net = require('node:net');
const tls = require('node:tls');
const os = require('node:os');

const CALCS = fs.readFileSync(path.join(__dirname, 'public', 'calcs.js'), 'utf8');

// Run the dashboard calculations on one dashboard's data (same code the pages use).
function engine(data, params = { range: '12m' }) {
  const calcs = {};
  const dash = { calc: (name, def) => { calcs[name] = def; }, params: () => params };
  vm.runInNewContext(CALCS, { dash, console, Date, Math, JSON, Intl });
  const cache = {};
  const get = (name) => {
    if (name in cache) return cache[name];
    if (calcs[name]) return (cache[name] = calcs[name].fn(...calcs[name].inputs.map(get)));
    return (cache[name] = data[name] ?? []);
  };
  return get;
}

const money = (v) => (v < 0 ? '−' : '') + '$' + Math.abs(Math.round(v)).toLocaleString('en-US');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ymd = (d) => d.toISOString().slice(0, 10);

function nextDue(x, today) {
  if (!x.lastDate) return null;
  const monthly = Math.abs(x.yearly - x.lastCharge * 12) < 1, n = new Date(String(x.lastDate).slice(0, 10) + 'T00:00:00Z');
  if (isNaN(n)) return null; let g = 0; do { n.setUTCMonth(n.getUTCMonth() + (monthly ? 1 : 12)); } while (n < today && ++g < 60);
  return n;
}

// book: { id, name, label }, data: what /api/books/<id>/data returns
function buildDigest(book, data, now = new Date()) {
  const get = engine(data), label = book.label;
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const wkStart = new Date(today - 7 * 864e5), txns = get('txns').filter((t) => t.book === label);
  const spendIn = (from, to) => txns.filter((t) => t.type === 'expense' && !t.oneTime && t.date >= ymd(from) && t.date < ymd(to));
  const week = spendIn(wkStart, today), weekTotal = week.reduce((s, t) => s + t.amount, 0);
  let prior = 0; for (let k = 1; k <= 8; k++) prior += spendIn(new Date(wkStart - k * 7 * 864e5), new Date(today - k * 7 * 864e5)).reduce((s, t) => s + t.amount, 0);
  const avgWeek = prior / 8;
  const cats = {}; week.forEach((t) => { cats[t.category] = (cats[t.category] || 0) + t.amount; });
  const topCats = Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const bud = get('budget_totals').find((r) => r.book === label);
  const bills = get('subs').filter((x) => x.book === label).map((x) => ({ x, due: nextDue(x, today) })).filter((o) => o.due && o.due - today <= 7 * 864e5).sort((a, b) => a.due - b.due);
  const cash = get('balance_totals').find((r) => r.book === label && r.kind === 'deposit' && r.latest);
  const needs = txns.filter((t) => /^(uncategorized|other)?$/i.test(t.category || '')).length;
  const lines = [], html = [];
  const range = `${wkStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })} – ${new Date(today - 864e5).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`;
  const sec = (title, items) => { if (!items.length) return; lines.push('', title.toUpperCase(), ...items.map((i) => '  • ' + i)); html.push(`<h3 style="margin:18px 0 6px;font-size:15px">${esc(title)}</h3><ul style="margin:0;padding-left:18px">${items.map((i) => `<li style="margin:3px 0">${esc(i)}</li>`).join('')}</ul>`); };
  const vs = avgWeek > 0 ? ` (${weekTotal > avgWeek ? 'more' : 'less'} than your usual ${money(avgWeek)} a week)` : '';
  sec('Last 7 days', [`Spent ${money(weekTotal)} across ${week.length} purchase${week.length === 1 ? '' : 's'}${vs}`, ...topCats.map(([c, v]) => `${c}: ${money(v)}`)]);
  if (bud && bud.available > 0) sec(`Budget · ${bud.label}`, [`${money(bud.spent)} of ${money(bud.available)} spent (${Math.round((bud.spent / bud.available) * 100)}%)` + (bud.projected != null ? ` · on pace for ${money(bud.projected)}` : '')]);
  sec('Bills in the next 7 days', bills.map((o) => `${o.due.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}: ${o.x.vendor} about ${money(o.x.lastCharge)}`));
  const more = []; if (cash) more.push(`Checking & savings: ${money(cash.total)} (as of ${cash.label})`); if (needs) more.push(`${needs} transaction${needs === 1 ? '' : 's'} still need a category`);
  sec('Also', more);
  const subject = `${book.name}: ${money(weekTotal)} spent this week${bills.length ? ` · ${bills.length} bill${bills.length === 1 ? '' : 's'} coming up` : ''}`;
  const text = `Larenest · ${book.name} · ${range}\n${lines.join('\n')}\n`;
  const body = `<div style="font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#1f2a37;max-width:560px"><h2 style="margin:0 0 4px;font-size:18px">${esc(book.name)}</h2><div style="color:#5b6675">Week of ${esc(range)}</div>${html.join('')}</div>`;
  return { subject, text, html: body, empty: !txns.length };
}

// ---------- minimal SMTP client ----------
function sendMail(cfg, { to, subject, text, html }) {
  return new Promise((resolve, reject) => {
    const port = Number(cfg.port) || 587, implicit = port === 465 || cfg.secure === true;
    let sock = implicit ? tls.connect({ host: cfg.host, port, servername: cfg.host }) : net.connect({ host: cfg.host, port });
    let buf = '', waiter = null, done = false;
    const fail = (e) => { if (done) return; done = true; try { sock.destroy(); } catch {} reject(e instanceof Error ? e : new Error(String(e))); };
    const onData = (d) => { buf += d.toString('utf8'); const m = buf.match(/(?:^|\r\n)(\d{3}) [^\r\n]*\r\n$/); if (m && waiter) { const w = waiter, all = buf; waiter = null; buf = ''; w(Number(m[1]), all); } };
    const attach = (s) => { s.setTimeout(20000, () => fail(new Error('Mail server timed out'))); s.on('data', onData); s.on('error', fail); };
    attach(sock);
    const read = () => new Promise((r) => { waiter = (code, txt) => r({ code, txt }); });
    const cmd = async (line, ok) => { if (line != null) sock.write(line + '\r\n'); const r = await read(); if (!ok.includes(r.code)) throw new Error(`Mail server said: ${r.txt.trim().split('\r\n').pop()}`); return r; };
    const b64 = (s) => Buffer.from(String(s), 'utf8').toString('base64');
    const hdr = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);
    (async () => {
      await cmd(null, [220]);
      let e = await cmd(`EHLO ${os.hostname().replace(/[^\w.-]/g, '') || 'localhost'}`, [250]);
      if (!implicit && /STARTTLS/i.test(e.txt)) {
        await cmd('STARTTLS', [220]);
        sock.removeListener('data', onData);
        sock = tls.connect({ socket: sock, servername: cfg.host }); attach(sock);
        await new Promise((r, j) => { sock.once('secureConnect', r); sock.once('error', j); });
        e = await cmd(`EHLO ${os.hostname().replace(/[^\w.-]/g, '') || 'localhost'}`, [250]);
      } else if (!implicit && cfg.user && !cfg.allowPlain) throw new Error('The mail server doesn’t offer encryption (STARTTLS); not sending the password unencrypted. Use port 465 or 587.');
      if (cfg.user) { await cmd('AUTH LOGIN', [334]); await cmd(b64(cfg.user), [334]); await cmd(b64(cfg.pass || ''), [235]); }
      const from = cfg.from || cfg.user;
      await cmd(`MAIL FROM:<${from}>`, [250]);
      for (const r of [].concat(to)) await cmd(`RCPT TO:<${r}>`, [250, 251]);
      await cmd('DATA', [354]);
      const bnd = 'hf' + Date.now().toString(36);
      const msg = [`From: Larenest <${from}>`, `To: ${[].concat(to).join(', ')}`, `Subject: ${hdr(subject)}`, `Date: ${new Date().toUTCString()}`, 'MIME-Version: 1.0',
        `Content-Type: multipart/alternative; boundary="${bnd}"`, '', `--${bnd}`, 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '', b64(text).replace(/.{76}/g, '$&\r\n'),
        `--${bnd}`, 'Content-Type: text/html; charset=utf-8', 'Content-Transfer-Encoding: base64', '', b64(html).replace(/.{76}/g, '$&\r\n'), `--${bnd}--`, ''].join('\r\n');
      await cmd(msg.replace(/^\./gm, '..') + '\r\n.', [250]);
      try { sock.write('QUIT\r\n'); } catch {}
      done = true; sock.end(); resolve(true);
    })().catch(fail);
  });
}

module.exports = { buildDigest, sendMail };
