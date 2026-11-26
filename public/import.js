// Statement import: reads a bank/credit-card CSV in the browser, previews it, and saves it on a button press.
(function () {
  const S = (window.FDImport = { text: null, fileName: '', grid: [], header: [], hdrRow: -1, cols: {}, sign: 'auto', parsed: [] });
  const { money2 } = window.FD;

  // Broker positions export (Fidelity, Vanguard, Schwab, E*TRADE, etc.): find the header row and read symbol, shares and cost.
  function parsePositions(text) {
    const g = parseCSV(String(text || '').replace(/^\uFEFF/, ''));
    const norm = (x) => String(x || '').toLowerCase().replace(/[^a-z/]/g, '');
    const hi = g.findIndex((r) => r.some((c) => /^(symbol|ticker)$/.test(norm(c))) && r.some((c) => /^(quantity|shares|qty)/.test(norm(c))));
    if (hi < 0) return { error: 'Couldn\u2019t find Symbol and Quantity columns. Export \u201cPositions\u201d as CSV from your brokerage.', rows: [] };
    const h = g[hi].map(norm), col = (...re) => h.findIndex((c) => re.some((r) => r.test(c)));
    const cSym = col(/^(symbol|ticker)$/), cQty = col(/^(quantity|shares|qty)/), cName = col(/^description$/, /^(security)?name$/, /^investmentname$/, /^securitydescription$/);
    const cTot = col(/^costbasistotal$/, /^costbasis$/, /^totalcost(basis)?$/, /^cost$/), cAvg = col(/^(average|avg)cost(basis)?(\/share|pershare)?$/, /^costpershare$/, /^costbasispershare$/, /^pricepaid$/);
    const cPx = col(/^(shareprice|lastprice|price|currentprice)$/), cAcct = col(/^accountname$/, /^account$/), cType = col(/^(security|investment|asset)type$/);
    const n = (x) => { const v = Number(String(x || '').replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1')); return isFinite(v) ? v : null; };
    const rows = [];
    for (const r of g.slice(hi + 1)) {
      const sym = String(r[cSym] || '').trim().toUpperCase().replace(/\*+$/, '');
      if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(sym) || /^(TOTAL|CASH|PENDING|ACCOUNT)/.test(sym)) continue;
      const qty = n(r[cQty]); if (!(qty > 0)) continue;
      const name = cName >= 0 ? r[cName] || '' : '';
      if (/money market|cash (reserves|investments)|core position|sweep/i.test(name)) continue;
      let price = null; const tot = cTot >= 0 ? n(r[cTot]) : null, avg = cAvg >= 0 ? n(r[cAvg]) : null;
      let noCost = false; if (avg > 0) price = avg; else if (tot > 0) price = tot / qty; else if (cPx >= 0 && n(r[cPx]) > 0) { price = n(r[cPx]); noCost = true; }
      const t = (cType >= 0 ? r[cType] : '') + ' ' + name;
      const kind = /\betf\b|exchange.traded|ishares|spdr|vanguard .* etf/i.test(t) ? 'etf' : /mutual fund|\bfund\b|\bfd\b|index|admiral|investor sh/i.test(t) ? 'fund' : /bond|treasury|note/i.test(t) ? 'bond' : 'stock';
      rows.push({ symbol: sym, name: name.slice(0, 60), qty: Math.round(qty * 10000) / 10000, price: price != null ? Math.round(price * 10000) / 10000 : null, kind, noCost, account: cAcct >= 0 ? (r[cAcct] || '').slice(0, 60) : '' });
    }
    return { rows, error: rows.length ? '' : 'No positions found in that file.' };
  }
  S.parsePositions = (t) => parsePositions(t);

  function parseCSV(text) {
    // separator: comma, semicolon or tab, whichever the first lines use most (semicolons are common in files with comma decimals)
    const head = String(text).split(/\r?\n/).slice(0, 15).join('\n').replace(/"[^"]*"/g, ''), cnt = (ch) => head.split(ch).length - 1;
    const sep = [',', ';', '\t'].reduce((b, ch) => (cnt(ch) > cnt(b) ? ch : b), ',');
    const out = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true;
      else if (c === sep) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); out.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); out.push(row); }
    return out.map((r) => r.map((x) => x.trim())).filter((r) => r.some((x) => x !== ''));
  }
  function toDate(s) {
    s = String(s || '').trim();
    let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
    if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; let mo = m[1], d = m[2];
      if (S.dates === 'dmy' || (S.dates !== 'mdy' && (S.autoDmy || (+mo > 12 && +d <= 12)))) [mo, d] = [d, mo]; // day first (31/10/2026), chosen or obvious
      if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31) return null;
      return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`; }
    const t = Date.parse(s);
    if (!isNaN(t) && /[a-z]{3}/i.test(s)) { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
    return null;
  }
  function toNum(s) {
    s = String(s ?? '').trim(); if (!s) return null;
    let neg = /^\(.*\)$/.test(s) || /-$/.test(s) || /^-/.test(s.replace(/[$\s]/g, '')) || /\bDR\b/i.test(s);
    if (/,\d{1,2}\)?\s*(CR|DR)?$/i.test(s) && !/\.\d{1,2}\)?\s*(CR|DR)?$/i.test(s)) s = s.replace(/\./g, '').replace(',', '.'); // comma decimals: 1.234,56 or -4,50
    const v = parseFloat(s.replace(/[^0-9.]/g, ''));
    if (isNaN(v)) return null;
    if (/\bCR\b/i.test(s)) neg = false;
    return neg ? -v : v;
  }
  function detect(forceHr) {
    const g = S.grid;
    let hr = -1;
    if (forceHr != null) hr = forceHr; else
    for (let i = 0; i < Math.min(15, g.length); i++) {
      const r = g[i].map((x) => x.toLowerCase());
      if (r.some((x) => /date/.test(x)) && r.some((x) => /amount|debit|credit|withdraw|deposit/.test(x))) { hr = i; break; }
    }
    S.hdrRow = hr;
    const width = Math.max(...g.map((r) => r.length));
    S.header = hr >= 0 ? g[hr].map((h, i) => h || `Column ${i + 1}`) : Array.from({ length: width }, (_, i) => `Column ${i + 1}`);
    const body = g.slice(hr + 1);
    const find = (re) => S.header.findIndex((h) => re.test(h.toLowerCase()));
    const c = { date: find(/trans.*date|^date$|posted|post date|date/), desc: find(/desc|payee|merchant|name|memo|details|transaction$/),
      amount: find(/^amount|amount/), debit: find(/debit|withdraw|charge/), credit: find(/credit(?!.*card)|deposit/), balance: find(/balance/),
      id: find(/^fitid$|^transaction id$|^transaction number$|^reference( number| no\.?| #)?$|^ref(erence)? ?(no|#)$/) }; // the bank's own transaction id, when the file has one
    if (hr < 0 && forceHr == null) { // no header row found: skip title lines above the table (rows much shorter than the table)
      let k = 0; while (k < Math.min(10, g.length - 1) && g[k].filter((x) => x !== '').length < Math.max(2, width - 1)) k++;
      // the first full row is the column names when none of its cells is a date or a number
      if (forceHr == null && k < g.length && g[k].every((x) => !toDate(x) && toNum(x) === null)) return detect(k);
      else if (k > 0) { hr = k - 1; S.hdrRow = hr; S.header = Array.from({ length: width }, (_, i) => `Column ${i + 1}`); }
    }
    if (c.date < 0 || (c.amount < 0 && c.debit < 0 && c.credit < 0) || c.desc < 0) { // columns the names didn't give away: guess from the cells
      const sample = g.slice(hr + 1).slice(0, 20);
      const score = (i, f) => sample.filter((r) => f(r[i])).length;
      for (let i = 0; i < width; i++) {
        if (c.date < 0 && score(i, (v) => toDate(v)) > sample.length * 0.7) c.date = i;
        else if (c.amount < 0 && c.debit < 0 && c.credit < 0 && score(i, (v) => toNum(v) !== null && /\d/.test(v || '')) > sample.length * 0.7) c.amount = i;
      }
      if (c.desc < 0) { let best = -1, bl = 0;
        for (let i = 0; i < width; i++) { if (i === c.date || i === c.amount) continue; const l = sample.reduce((s, r) => s + String(r[i] || '').length, 0); if (l > bl) { bl = l; best = i; } }
        c.desc = best; }
    }
    if (c.amount >= 0) { c.debit = -1; c.credit = -1; }
    S.cols = c;
  }
  // Rows of this file that aren't already in the chosen account, by the same rule the dashboard uses (calcs.js makeDupeChecker).
  // Saving keeps only these, so what the preview says is exactly what's added.
  function newRows(rows) {
    const fm = document.querySelector('#fd-import-form'), f = fm ? new FormData(fm) : null, book = f ? f.get('book') : '', acct = f ? String(f.get('account') || '') : '';
    if (!acct || !window.FDDupeChecker) return rows;
    const isDup = window.FDDupeChecker(), imp = dash.data('imports').status === 'ok' ? dash.data('imports').data || [] : [];
    for (const b of imp) { if (String(b.accountName || b.fileName || '').toLowerCase() !== acct.toLowerCase()) continue; if (book && b.book !== book) continue;
      let l = b.txns; if (typeof l === 'string') { try { l = JSON.parse(l); } catch { l = []; } }
      for (const t of l || []) { const a = Number(t.amount); if (t.date && isFinite(a) && a) isDup({ ...b, book: 'x' }, t, a); } }
    const me = { id: '__new__', book: 'x', accountName: acct };
    return rows.filter((t) => !isDup(me, t, Number(t.amount)));
  }
  function parseRows() {
    const c = S.cols, body = S.grid.slice(S.hdrRow + 1);
    // a file is day-first if any of its dates can only be read that way (31/10/2026); then all of its dates are read day-first
    S.autoDmy = c.date >= 0 && body.some((r) => { const m = String(r[c.date] || '').trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}/); return m && +m[1] > 12 && +m[2] <= 12; });
    const raw = [];
    for (const r of body) {
      const date = toDate(r[c.date]);
      if (!date) continue;
      let v;
      if (c.amount >= 0) v = toNum(r[c.amount]);
      else { const d = toNum(r[c.debit]), cr = toNum(r[c.credit]); if (d === null && cr === null) continue; v = Math.abs(d || 0) - Math.abs(cr || 0); }
      if (v === null || v === 0) continue;
      raw.push({ date, description: String(r[c.desc] ?? '').replace(/\s+/g, ' ').slice(0, 120), v, bal: c.balance >= 0 ? toNum(r[c.balance]) : null, id: c.id >= 0 ? String(r[c.id] ?? '').trim().slice(0, 80) : '' });
    }
    // Amount sign: stored as positive = money out
    let flip = false;
    if (c.amount >= 0) {
      if (S.sign === 'neg') flip = true;
      else if (S.sign === 'auto') flip = raw.filter((x) => x.v < 0).length > raw.length / 2;
    }
    S.parsed = raw.map((x) => ({ date: x.date, description: x.description, amount: Math.round((flip ? -x.v : x.v) * 100) / 100, bal: x.bal, ...(x.id ? { id: x.id } : {}) }));
    S.flip = flip;
  }
  function fillBalance() {
    const p = S.parsed; if (!p.length) return;
    const maxD = p.reduce((m, x) => (x.date > m ? x.date : m), '');
    document.querySelectorAll('#fd-import-form input[name=bmonth]').forEach((i) => { i.value = maxD.slice(0, 7); });
    const withBal = p.filter((x) => x.date === maxD && x.bal !== null);
    if (withBal.length) {
      const desc = p.length > 1 && p[0].date >= p[p.length - 1].date;
      const b = desc ? withBal[0].bal : withBal[withBal.length - 1].bal;
      document.querySelectorAll('#fd-import-form input[name=balance]').forEach((i) => { i.value = String(b); });
    }
  }
  const refresh = () => {
    parseRows();
    document.querySelectorAll('#fd-import-save').forEach((b) => { b.disabled = !S.grid.length && !S.pdf; });
    dash.draw('importPreview'); dash.draw('impRecon');
  };
  // ---- saved column choices, per account (this device only): reused when the same bank's file layout comes back ----
  const mapKey = (book, acct) => 'fd-impmap:' + book + '|' + String(acct || '').trim().toLowerCase();
  const sig = () => S.header.map((h) => String(h).trim().toLowerCase()).join('|');
  const curAcct = () => { const fm = document.querySelector('#fd-import-form'); const f = fm ? new FormData(fm) : null; return f ? [String(f.get('book') || ''), String(f.get('account') || '')] : ['', '']; };
  function saveMap(book, acct) { if (S.pdf || S.ofx || !S.header.length) return; try { localStorage.setItem(mapKey(book, acct), JSON.stringify({ sig: sig(), cols: S.cols, sign: S.sign, dates: S.dates || 'auto', savedAt: new Date().toISOString() })); } catch {} }
  function applyMap() {
    S.mapUsed = false; if (S.pdf || S.ofx || !S.header.length) return false;
    const [book, acct] = curAcct(); if (!acct) return false;
    let m = null; try { m = JSON.parse(localStorage.getItem(mapKey(book, acct)) || 'null'); } catch {}
    if (!m || m.sig !== sig() || !m.cols) return false;
    const w = S.header.length, ok = (i) => Number.isInteger(i) && i >= -1 && i < w;
    if (!Object.values(m.cols).every(ok)) return false;
    S.cols = { ...S.cols, ...m.cols }; S.sign = ['auto', 'neg', 'pos'].includes(m.sign) ? m.sign : 'auto'; S.dates = ['auto', 'mdy', 'dmy'].includes(m.dates) ? m.dates : 'auto'; S.mapUsed = true; return true;
  }
  S.saveMap = saveMap; S.applyMap = applyMap;
  document.querySelectorAll('#fd-import-form input[name=account]').forEach((i) => i.addEventListener('change', () => { if (S.grid.length && applyMap()) { refresh(); fillBalance(); } else dash.draw('importPreview'); }));

  // ---- reconciliation (optional): opening + activity vs the ending balance ----
  const reconNow = () => {
    const fm = document.querySelector('#fd-import-form'); if (!fm || !window.FDReconcile) return null;
    const f = new FormData(fm), kind = String(f.get('kind') || '').split(':')[0];
    const op = String(f.get('opening') || '').trim(), cl = String(f.get('balance') || '').trim();
    if (op === '' && cl === '') return null;
    return window.FDReconcile({ kind, opening: op, closing: cl, rows: S.parsed, from: String(f.get('pfrom') || ''), to: String(f.get('pto') || '') });
  };
  S.reconNow = reconNow;
  dash.draw('impRecon', (el) => {
    el.replaceChildren(); const r = reconNow(); if (!r) return;
    const p = document.createElement('p'); p.className = 'fd-msg';
    if (!r.ok) { p.classList.add('fd-note'); p.textContent = r.reason === 'kind' ? 'Checking a statement works for checking, savings and credit card accounts.' : 'Type both the opening and the ending balance to check the statement.'; el.append(p); return; }
    if (r.balanced) { p.classList.add('ok'); p.textContent = `Adds up: ${money2(r.opening)} opening and ${r.count} transactions gives ${money2(r.expected)}, the same as the ending balance.`; el.append(p); return; }
    p.classList.add('err'); p.textContent = `Off by ${money2(Math.abs(r.diff))}: ${money2(r.opening)} opening and ${r.count} transactions gives ${money2(r.expected)}, but the statement ends at ${money2(r.closing)}. Nothing has been changed.`;
    el.append(p);
    if (r.candidates.length) { const h = document.createElement('p'); h.className = 'fd-note'; h.textContent = 'Rows worth checking:'; const ul = document.createElement('ul'); ul.className = 'fd-list';
      for (const t of r.candidates) { const li = document.createElement('li'); li.textContent = `${t.date} · ${t.description} · ${money2(Math.abs(t.amount))} ${t.amount > 0 ? 'out' : 'in'}: ${t.why}`; ul.append(li); } el.append(h, ul); }
    else { const h = document.createElement('p'); h.className = 'fd-note'; h.textContent = 'No single row explains the gap. Check the column choices, the “Purchases appear as” setting, the period dates, or whether rows are missing from the file.'; el.append(h); }
  });
  document.querySelectorAll('#fd-import-form input[name=opening], #fd-import-form input[name=pfrom], #fd-import-form input[name=pto], #fd-import-form input[name=balance], #fd-import-form select[name=kind]').forEach((i) => i.addEventListener('input', () => dash.draw('impRecon')));

  // ---- preview drawing ----
  dash.draw('importPreview', (el) => {
    el.replaceChildren();
    if (!S.grid.length) return;
    const wrap = document.createElement('div'); wrap.className = 'fd-row';
    const pick = (label, key, allowNone) => {
      const l = document.createElement('label'); l.className = 'fd-field'; l.append(label);
      const sel = document.createElement('select'); sel.className = 'dash-select';
      if (allowNone) sel.append(new Option('— none —', '-1'));
      S.header.forEach((h, i) => sel.append(new Option(h, String(i))));
      sel.value = String(S.cols[key]);
      sel.onchange = () => { S.cols[key] = Number(sel.value); if (key === 'amount' && S.cols.amount >= 0) { S.cols.debit = -1; S.cols.credit = -1; } refresh(); fillBalance(); };
      l.append(sel); wrap.append(l);
    };
    { // the header row (when it wasn't found) and the date order (for day-first files)
      const l = document.createElement('label'); l.className = 'fd-field'; l.append('Column names are in');
      const sel = document.createElement('select'); sel.className = 'dash-select'; sel.append(new Option('No header row', '-1'));
      S.grid.slice(0, 10).forEach((r, i) => sel.append(new Option(`Row ${i + 1}: ${r.filter(Boolean).slice(0, 3).join(', ').slice(0, 40)}`, String(i))));
      sel.value = String(S.hdrRow); sel.onchange = () => { detect(Number(sel.value)); refresh(); fillBalance(); dash.draw('importPreview'); };
      l.append(sel); wrap.append(l);
      const l2 = document.createElement('label'); l2.className = 'fd-field'; l2.append('Dates are');
      const s2 = document.createElement('select'); s2.className = 'dash-select';
      s2.append(new Option('Detect automatically', 'auto'), new Option('Month first (10/31/2026)', 'mdy'), new Option('Day first (31/10/2026)', 'dmy'));
      s2.value = S.dates || 'auto'; s2.onchange = () => { S.dates = s2.value; refresh(); fillBalance(); };
      l2.append(s2); wrap.append(l2);
    }
    pick('Date column', 'date');
    pick('Description column', 'desc');
    pick('Amount column', 'amount', true);
    if (S.cols.amount < 0) { pick('Debit (money out)', 'debit', true); pick('Credit (money in)', 'credit', true); }
    pick('Balance column', 'balance', true);
    if (S.cols.amount >= 0) {
      const l = document.createElement('label'); l.className = 'fd-field'; l.append('Purchases appear as');
      const sel = document.createElement('select'); sel.className = 'dash-select';
      sel.append(new Option('Detect automatically', 'auto'), new Option('Negative amounts', 'neg'), new Option('Positive amounts', 'pos'));
      sel.value = S.sign; sel.onchange = () => { S.sign = sel.value; refresh(); };
      l.append(sel); wrap.append(l);
    }
    el.append(wrap);
    const p = S.parsed;
    const sum = document.createElement('p'); sum.className = 'fd-note';
    if (!p.length) sum.textContent = 'No rows with a date and an amount were found with these columns.';
    else {
      const dates = p.map((x) => x.date).sort();
      const out = p.filter((x) => x.amount > 0).reduce((s, x) => s + x.amount, 0);
      const inn = p.filter((x) => x.amount < 0).reduce((s, x) => s - x.amount, 0);
      sum.textContent = `${p.length} transactions from ${dates[0]} to ${dates[dates.length - 1]}: ${money2(out)} out, ${money2(inn)} in${S.flip ? ' (amounts flipped so purchases count as money out)' : ''}. Check that a purchase shows as “out” below.`;
    }
    el.append(sum);
    if (S.mapUsed) { const m = document.createElement('p'); m.className = 'fd-note'; m.textContent = 'Using the column choices you saved last time for this account.'; el.append(m); }
    if (p.length) {
      const fm = document.querySelector('#fd-import-form');
      const acct = fm ? String(new FormData(fm).get('account') || '') : '';
      const dup = p.length - newRows(p).length;
      const n = document.createElement('p'); n.className = 'fd-note' + (dup ? ' fd-warn' : '');
      n.textContent = !acct ? `${p.length} rows. Choose the account above to check them against what’s already there.` : dup ? `${dup} of ${p.length} rows are already in ${acct} and won’t be added again.` : `All ${p.length} rows are new for ${acct}.`;
      el.append(n);
    }
    if (p.length) {
      const sc = document.createElement('div'); sc.className = 'fd-scroll';
      const t = document.createElement('table'); t.className = 'fd-table';
      const hr = document.createElement('tr');
      for (const h of ['Date', 'Description', 'Out', 'In']) { const th = document.createElement('th'); th.textContent = h; hr.append(th); }
      const th0 = document.createElement('thead'); th0.append(hr); t.append(th0);
      const tb = document.createElement('tbody');
      for (const x of p.slice(0, 6)) {
        const tr = document.createElement('tr');
        for (const v of [x.date, x.description, x.amount > 0 ? money2(x.amount) : '', x.amount < 0 ? money2(-x.amount) : '']) { const c = document.createElement('td'); c.textContent = v; tr.append(c); }
        tb.append(tr);
      }
      t.append(tb); sc.append(t); el.append(sc);
    }
  });

  // ---- listeners ----
  // Account register: remember each account's type the first time it's imported (see "Your accounts").
  const normA = (s) => String(s || '').trim().toLowerCase();
  const keyN = (s) => normA(s).replace(/^[^–]+ – /, ''); // ignore an "Owner – " prefix when matching names
  const regAcct = async (db, doc) => {
    try {
      const reg = (dash.data('accounts').status === 'ok' ? dash.data('accounts').data || [] : []).filter((a) => !a.removed);
      if (reg.some((a) => a.book === doc.book && [a.match, a.name, ...(a.aliases || [])].some((x) => x && keyN(x) === keyN(doc.accountName)))) return;
      await db.collection('data/household/accounts').add({ book: doc.book, name: doc.accountName, match: doc.accountName, kind: doc.accountKind, type: doc.accountType || '', rate: null, owner: doc.owner || '', note: '', createdAt: new Date().toISOString() });
    } catch {}
  };
  // Picking a known account name fills in its type.
  document.querySelectorAll('#fd-import-form input[name=account], #fd-balance-form input[name=account]').forEach((i) => i.addEventListener('change', () => {
    const reg = (dash.data('accounts').status === 'ok' ? dash.data('accounts').data || [] : []).filter((a) => !a.removed);
    const a = reg.find((x) => [x.name, x.match, ...(x.aliases || [])].some((n) => n && keyN(n) === keyN(i.value))); if (!a) return;
    const sel = i.form && i.form.elements.kind, v = `${a.kind}:${a.type || ''}`;
    if (sel && a.type && [...sel.options].some((o) => o.value === v)) sel.value = v; // only when the account's exact type is known
  }));
  // ---- PDF statements ----
  const isPdf = (f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
  const kindNow = () => String((document.querySelector('#fd-import-form select[name=kind]') || {}).value || '').split(':')[0];
  const pdfSecs = () => (S.pdf ? S.pdf.res.sections.filter((s) => s) : []);
  const inSec = (x) => pdfSecs().length < 2 || x.section === S.pdf.section;
  const applyPdf = () => {
    const P = S.pdf; if (!P) return;
    const useTx = ['deposit', 'credit'].includes(kindNow()); // investment, loan and mortgage statements: balance only
    const tx = useTx ? P.res.txns.filter(inSec) : [];
    S.grid = tx.length ? [['Date', 'Description', 'Debit', 'Credit'], ...tx.map((t) => [t.date, t.description, t.out ? String(t.out) : '', t.in ? String(t.in) : ''])] : [];
    S.sign = 'auto'; if (S.grid.length) detect(); refresh();
    const bals = P.res.balances.filter(inSec), b = bals[P.bal] || bals[0];
    S.asOf = (b && b.date) || P.res.end;
    document.querySelectorAll('#fd-import-form input[name=balance]').forEach((i) => { i.value = b ? String(b.amount) : ''; });
    document.querySelectorAll('#fd-import-form input[name=bmonth]').forEach((i) => { i.value = S.asOf.slice(0, 7); });
    dash.draw('pdfPick');
  };
  document.querySelectorAll('#fd-import-form select[name=kind]').forEach((s) => s.addEventListener('change', () => { if (S.pdf) { S.pdf.res = window.FDPdf.analyze(S.pdf.lines, kindNow()); applyPdf(); } }));
  dash.draw('pdfPick', (el) => {
    el.replaceChildren(); const P = S.pdf; if (!P) return;
    const box = document.createElement('div'); box.className = 'fd-rb';
    const useTx = ['deposit', 'credit'].includes(kindNow());
    const h = document.createElement('p'); h.className = 'fd-rb-h';
    h.textContent = `From the PDF: ${useTx ? S.parsed.length + ' transaction' + (S.parsed.length === 1 ? '' : 's') : 'balance only (no transactions are imported for this account type)'} · statement ends ${P.res.end}`;
    box.append(h);
    const secs = pdfSecs();
    if (secs.length > 1) {
      const r = document.createElement('div'); r.className = 'fd-rb-row'; const l = document.createElement('span'); l.textContent = 'This statement has several accounts. Import:';
      const s = document.createElement('select'); s.className = 'dash-select'; secs.forEach((x) => s.append(new Option(x, x))); s.value = P.section;
      s.addEventListener('change', () => { P.section = s.value; P.bal = 0; applyPdf(); }); r.append(l, s); box.append(r);
    }
    const bals = P.res.balances.filter(inSec);
    const q2 = document.createElement('p'); q2.className = 'fd-note'; q2.textContent = bals.length ? 'Ending balance (pick the one for this account):' : 'No balance found in the PDF; type it below if you have it.'; box.append(q2);
    bals.slice(0, 8).forEach((b, i) => {
      const lab = document.createElement('label'); lab.className = 'fd-check';
      const rb = document.createElement('input'); rb.type = 'radio'; rb.name = 'pdfbal'; rb.checked = i === (P.bal || 0);
      rb.addEventListener('change', () => { P.bal = i; applyPdf(); });
      lab.append(rb, ` ${money2(b.amount)} · ${b.label}${b.date ? ' (' + b.date + ')' : ''}`); box.append(lab);
    });
    el.append(box);
  });
  const show = (ids, on) => ids.forEach((id) => document.querySelectorAll('#' + id).forEach((p) => { p.hidden = id !== on; }));
  const IMP = ['fd-imp-ok', 'fd-imp-err', 'fd-imp-big', 'fd-imp-none'];
  const BAL = ['fd-bal-ok', 'fd-bal-err', 'fd-bal-miss'];

  // ---- several statements at once: a queue, one file at a time through the normal preview, with the account guessed for each ----
  const Q = { files: [], i: 0, saved: 0, loading: false, note: '' };
  const qForm = () => document.getElementById('fd-import-form');
  const guessAccount = (name, text) => {
    const form = qForm(); if (!form) return null; const bk = form.elements.book.value;
    const reg = (dash.data('accounts').status === 'ok' ? dash.data('accounts').data || [] : []).filter((a) => !a.removed).filter((a) => a.book === bk);
    const hay = (String(name) + ' ' + String(text || '').slice(0, 6000)).toLowerCase();
    const digits = new Set((hay.match(/(?:^|[^0-9])(\d{4})(?=[^0-9]|$)/g) || []).map((x) => x.replace(/\D/g, '')));
    let best = null, score = 0;
    for (const a of reg) {
      let sc = 0; const nm = String(a.name || '').toLowerCase();
      for (const d of (nm.match(/\d{4}/g) || [])) if (digits.has(d)) sc += 5;
      for (const w of nm.split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !['the', 'and', 'account', 'card'].includes(w))) if (hay.includes(w)) sc += 1;
      if (sc > score) { score = sc; best = a; }
    }
    return score >= 2 ? best : null;
  };
  const qLoad = (i) => {
    const form = qForm(), inp = form && form.elements.file; if (!inp || !Q.files[i]) return;
    Q.i = i; Q.loading = true;
    try { const dt = new DataTransfer(); dt.items.add(Q.files[i]); inp.files = dt.files; } catch (e) {}
    inp.dispatchEvent(new Event('change')); Q.loading = false;
    Q.files[i].text().then((t) => {
      const a = guessAccount(Q.files[i].name, String(t).startsWith('%PDF') ? '' : t);
      const pick = document.getElementById('fd-imp-pick');
      if (a && pick && [...pick.options].some((o) => o.value === a.name)) { pick.value = a.name; pick.dispatchEvent(new Event('change')); Q.note = `Matched to “${a.name}”. Change the account above if that’s wrong.`; }
      else Q.note = 'Choose which account this file is for.';
      dash.draw('impQueue');
    }).catch(() => {});
    dash.draw('impQueue');
  };
  const qNext = () => { if (Q.i + 1 < Q.files.length) qLoad(Q.i + 1); else { const n = Q.saved, tot = Q.files.length; Q.files = []; Q.note = `Done: saved ${n} of ${tot} files.`; dash.draw('impQueue'); } };
  window.__fdQueueSaved = () => { if (!Q.files.length) return; Q.saved++; setTimeout(qNext, 600); };
  dash.draw('impQueue', (el) => {
    el.replaceChildren(); if (!Q.files.length && !Q.note) return;
    const box = document.createElement('div'); box.className = 'fd-queue';
    if (Q.files.length) {
      const t = document.createElement('b'); t.textContent = `File ${Q.i + 1} of ${Q.files.length}: ${Q.files[Q.i].name}`; box.append(t);
      const ul = document.createElement('ol'); Q.files.forEach((f, k) => { const li = document.createElement('li'); li.textContent = f.name; if (k < Q.i) li.className = 'is-done'; if (k === Q.i) li.className = 'is-on'; ul.append(li); }); box.append(ul);
    }
    if (Q.note) { const p = document.createElement('p'); p.className = 'fd-note'; p.textContent = Q.note; box.append(p); }
    if (Q.files.length) { const sk = document.createElement('button'); sk.type = 'button'; sk.className = 'fd-btn fd-sm fd-quiet'; sk.textContent = Q.i + 1 < Q.files.length ? 'Skip this file' : 'Skip and finish'; sk.addEventListener('click', qNext);
      const st = document.createElement('button'); st.type = 'button'; st.className = 'fd-btn fd-sm fd-quiet'; st.textContent = 'Stop'; st.addEventListener('click', () => { Q.files = []; Q.note = ''; dash.draw('impQueue'); }); box.append(sk, ' ', st); }
    el.append(box);
  });
  // drag and drop onto the import form
  { const form = qForm(); if (form) {
    ['dragenter', 'dragover'].forEach((ev) => form.addEventListener(ev, (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); form.classList.add('fd-drop'); } }));
    ['dragleave', 'drop'].forEach((ev) => form.addEventListener(ev, () => form.classList.remove('fd-drop')));
    form.addEventListener('drop', (e) => { e.preventDefault(); const fs = [...((e.dataTransfer && e.dataTransfer.files) || [])]; if (!fs.length) return;
      if (fs.length === 1) { try { const dt = new DataTransfer(); dt.items.add(fs[0]); form.elements.file.files = dt.files; } catch (err) {} Q.files = []; Q.note = ''; form.elements.file.dispatchEvent(new Event('change')); dash.draw('impQueue'); return; }
      Q.files = fs; Q.saved = 0; qLoad(0); });
  } }
  document.querySelectorAll('#fd-import-form input[name=file]').forEach((inp) => inp.addEventListener('change', () => {
    if (!Q.loading && inp.files && inp.files.length > 1) { Q.files = [...inp.files]; Q.saved = 0; qLoad(0); return; }
    if (!Q.loading && Q.files.length && inp.files && inp.files.length === 1 && inp.files[0] !== Q.files[Q.i]) { Q.files = []; Q.note = ''; dash.draw('impQueue'); }
    const f = inp.files && inp.files[0];
    show(IMP, null);
    if (!f) return;
    if (isPdf(f)) { readPdf(f); return; }
    S.pdf = null; dash.draw('pdfPick');
    const rd = new FileReader();
    rd.onload = () => {
      if (String(rd.result || '').startsWith('%PDF')) { readPdf(f); return; } // a PDF without a .pdf name or type (some phones)
      S.text = String(rd.result || ''); S.fileName = f.name;
      if (/<OFX>|OFXHEADER/i.test(S.text.slice(0, 4000))) { readOfx(S.text); return; }
      S.grid = parseCSV(S.text); S.sign = 'auto'; S.ofx = false;
      S.dates = 'auto'; detect(); applyMap(); refresh(); fillBalance(); detectApp(); dash.draw('appImport');
    };
    rd.readAsText(f);
  }));
  // OFX / QFX (Quicken, Money, most banks' "download for Quicken"): SGML or XML; read each <STMTTRN> and the ledger balance
  function readOfx(text) {
    const tag = (blk, t) => { const m = blk.match(new RegExp('<' + t + '>([^<\\r\\n]*)', 'i')); return m ? m[1].trim() : ''; };
    const dt = (v) => (/^\d{8}/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : '');
    const rows = [];
    for (const m of text.matchAll(/<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi)) {
      const b = m[1], amt = Number(tag(b, 'TRNAMT').replace(/,/g, '')), date = dt(tag(b, 'DTPOSTED'));
      if (!date || !isFinite(amt) || !amt) continue;
      const desc = [tag(b, 'NAME'), tag(b, 'MEMO')].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(' ').replace(/&amp;/g, '&').slice(0, 120);
      rows.push([date, desc || tag(b, 'TRNTYPE') || 'Transaction', amt < 0 ? String(-amt) : '', amt > 0 ? String(amt) : '', tag(b, 'FITID')]); // FITID: the bank's id, so overlapping downloads aren't counted twice
    }
    S.pdf = null; S.ofx = true; dash.draw('pdfPick');
    S.grid = rows.length ? [['Date', 'Description', 'Debit', 'Credit', 'FITID'], ...rows] : []; S.sign = 'auto';
    if (S.grid.length) detect(); refresh();
    const lb = text.match(/<LEDGERBAL>([\s\S]*?)(?:<\/LEDGERBAL>|<AVAILBAL>|<\/STMTRS>|<\/CCSTMTRS>)/i);
    if (lb) { const bal = Number(tag(lb[1], 'BALAMT').replace(/,/g, '')), d = dt(tag(lb[1], 'DTASOF'));
      if (isFinite(bal)) { S.asOf = d || ''; document.querySelectorAll('#fd-import-form input[name=balance]').forEach((i) => { i.value = String(Math.abs(bal)); }); if (d) document.querySelectorAll('#fd-import-form input[name=bmonth]').forEach((i) => { i.value = d.slice(0, 7); }); } }
    impMsg = rows.length ? '' : 'No transactions found in this OFX/QFX file.'; dash.draw('impDebug');
  }
  function readPdf(f) { // PDF statement: read it here in the browser, then use the same preview and save as a CSV
    {
      S.fileName = f.name; S.pdf = null; S.grid = []; S.parsed = []; impMsg = 'Reading PDF…'; dash.draw('impDebug'); dash.draw('pdfPick');
      f.arrayBuffer().then((buf) => window.FDPdf.readLines(buf)).then((lines) => {
        const res = window.FDPdf.analyze(lines, kindNow());
        S.pdf = { lines, res, section: (res.balances[0] && res.balances[0].section) || res.sections[0] || '', bal: 0 };
        impMsg = ''; dash.draw('impDebug'); applyPdf();
      }).catch((e) => { impMsg = 'Couldn’t read this PDF here (' + ((e && e.message) || e) + '). PDFs work in the self-hosted app; you can also type the balance under “Record a statement balance”.'; dash.draw('impDebug'); });
    }
  }

  let impMsg = '';
  // Exports from other budgeting apps hold every account in one file, with categories, so they get their own path.
  const APPS = [
    { id: 'mint', name: 'Mint', need: ['date', 'description', 'amount', 'transaction type', 'account name'], acct: 'account name', desc: 'description', cat: 'category', tags: 'labels', note: 'notes',
      amt: (r, g) => { const a = num(g(r, 'amount')); return /credit/i.test(g(r, 'transaction type')) ? -Math.abs(a) : Math.abs(a); } },
    { id: 'monarch', name: 'Monarch', need: ['date', 'merchant', 'account', 'amount', 'original statement'], acct: 'account', desc: 'merchant', cat: 'category', tags: 'tags', note: 'notes', amt: (r, g) => -num(g(r, 'amount')) },
    { id: 'ynab', name: 'YNAB', need: ['account', 'date', 'payee', 'outflow', 'inflow'], acct: 'account', desc: 'payee', cat: 'category', tags: 'flag', note: 'memo', amt: (r, g) => num(g(r, 'outflow')) - num(g(r, 'inflow')) },
    { id: 'empower', name: 'Empower', need: ['date', 'account', 'description', 'category', 'amount'], acct: 'account', desc: 'description', cat: 'category', tags: 'tags', note: '', amt: (r, g) => -num(g(r, 'amount')) },
  ];
  function num(x) { const t = String(x || '').replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1'); const v = parseFloat(t); return isFinite(v) ? v : 0; }
  let APP = null, APPMSG = '';
  function detectApp() {
    APP = null; APPMSG = ''; if (S.pdf || S.ofx || !S.grid.length) return;
    const hr = S.grid[0].map((h) => String(h).toLowerCase().replace(/^﻿/, '').trim());
    const app = APPS.find((a) => a.need.every((n) => hr.includes(n))); if (!app) return;
    const ix = (n) => hr.indexOf(n), g = (r, n) => (n && ix(n) >= 0 ? String(r[ix(n)] || '').trim() : '');
    const byAcct = new Map();
    for (const r of S.grid.slice(1)) {
      const date = toDate(g(r, 'date')), amount = Math.round(app.amt(r, g) * 100) / 100; if (!date || !amount) continue;
      const acct = (g(r, app.acct) || 'Imported').slice(0, 60);
      const tags = g(r, app.tags).split(/[,|;]/).map((x) => x.trim()).filter(Boolean);
      const t = { date, description: g(r, app.desc) || g(r, 'original description') || g(r, 'original statement'), amount };
      const cat = g(r, app.cat); if (cat) t.category = cat.slice(0, 40);
      if (tags.length) t.tags = tags.slice(0, 5); const note = g(r, app.note); if (note) t.note = note.slice(0, 200);
      if (!byAcct.has(acct)) byAcct.set(acct, []); byAcct.get(acct).push(t);
    }
    if (byAcct.size) APP = { app, byAcct };
  }
  const kindOf = (name) => /card|credit|visa|amex|mastercard|discover/i.test(name) ? 'credit:' : /loan|auto/i.test(name) ? 'loan:' : /mortgage/i.test(name) ? 'mortgage:' : /401k|ira\b|roth|brokerage|invest|hsa/i.test(name) ? 'investment:' : 'deposit:checking';
  dash.draw('appImport', (el) => {
    el.replaceChildren(); if (!APP) { if (APPMSG) { const m = document.createElement('p'); m.className = 'fd-msg ok'; m.textContent = APPMSG; el.append(m); } return; }
    const n = [...APP.byAcct.values()].reduce((a, l) => a + l.length, 0);
    const box = document.createElement('div'); box.className = 'fd-card fd-appimp';
    const h = document.createElement('p'); h.innerHTML = `<b>This looks like a ${APP.app.name} export.</b> ${n.toLocaleString()} transactions across ${APP.byAcct.size} account${APP.byAcct.size === 1 ? '' : 's'}, with their categories${APP.app.tags ? ' and tags' : ''}. Each account is saved separately; rows already in that account are skipped.`;
    const ul = document.createElement('ul'); ul.className = 'fd-appimp-list';
    for (const [a, l] of APP.byAcct) { const li = document.createElement('li'); li.textContent = `${a}: ${l.length.toLocaleString()}`; ul.append(li); }
    const b = document.createElement('button'); b.type = 'button'; b.className = 'fd-btn'; b.textContent = `Import all ${APP.byAcct.size} accounts`;
    const msg = document.createElement('p'); msg.className = 'fd-note';
    b.addEventListener('click', async () => {
      b.disabled = true; const form = document.querySelector('#fd-import-form'), book = new FormData(form).get('book');
      try {
        const db = await claude.use('db'); if (!db) throw new Error('no db');
        const isDup = window.FDDupeChecker ? window.FDDupeChecker() : null, imp = dash.data('imports').status === 'ok' ? dash.data('imports').data || [] : [];
        let saved = 0, skipped = 0;
        for (const [acct, list] of APP.byAcct) {
          let fresh = list;
          if (isDup) { for (const bt of imp) { if (bt.book !== book || keyN(bt.accountName || '') !== keyN(acct)) continue; let l = bt.txns; if (typeof l === 'string') { try { l = JSON.parse(l); } catch { l = []; } } for (const t of l || []) isDup({ ...bt, book: 'x' }, t, Number(t.amount)); }
            const me = { id: '__new__' + acct, book: 'x', accountName: acct }; fresh = list.filter((t) => !isDup(me, t, t.amount)); }
          skipped += list.length - fresh.length;
          for (let i = 0; i < fresh.length; i += 4000) {
            const txns = fresh.slice(i, i + 4000), dates = txns.map((x) => x.date).sort(), k = kindOf(acct);
            const doc = { book, accountKind: k.split(':')[0], accountType: k.split(':')[1] || '', accountName: acct, owner: '', fileName: S.fileName.slice(0, 80), importedAt: new Date().toISOString(),
              rowCount: txns.length, dateFrom: dates[0], dateTo: dates[dates.length - 1], balance: null, balanceMonth: dates[dates.length - 1].slice(0, 7), txns, source: 'app:' + APP.app.id, fileRows: list.length, skipped: 0 };
            await db.collection('data/household/imports').add(doc); await regAcct(db, doc); saved += txns.length;
            msg.textContent = `Saving… ${saved.toLocaleString()} so far`;
          }
        }
        APPMSG = msg.textContent = `✓ Saved ${saved.toLocaleString()} transactions${skipped ? ` (${skipped.toLocaleString()} already here were skipped)` : ''}. Check account types under Accounts: names with “card” were set as credit cards, the rest as checking.`;
        APP = null; S.grid = []; S.parsed = []; form.reset(); dash.draw('importPreview');
        if (window.__fdQueueSaved) window.__fdQueueSaved();
      } catch (e) { msg.textContent = 'Save error: ' + String((e && e.message) || e); b.disabled = false; }
    });
    box.append(h, ul, b, msg); el.append(box);
  });
  dash.draw('impDebug', (el) => { el.textContent = impMsg; });
  document.querySelectorAll('#fd-import-form').forEach((form) => form.addEventListener('submit', (ev) => ev.preventDefault()));
  document.querySelectorAll('#fd-import-form').forEach((form) => form.querySelector('#fd-import-save').addEventListener('click', async (ev) => {
    ev.preventDefault();
    if (!S.parsed.length && !(S.pdf && String(new FormData(form).get('balance') || '').trim())) { show(IMP, 'fd-imp-none'); return; }
    const fd = new FormData(form);
    if (!String(fd.get('account') || '').trim()) { impMsg = 'Choose an account above (or add one with +) before saving.'; dash.draw('impDebug'); return; }
    impMsg = ''; dash.draw('impDebug');
    const bal = String(fd.get('balance') || '').trim();
    // refuse a too-large statement up front (with the count) rather than saving part of it
    const MAXR = 5000; if (S.parsed.length > MAXR) { impMsg = `This file has ${S.parsed.length.toLocaleString()} transactions; one import can hold up to ${MAXR.toLocaleString()}. Nothing was saved. Download a shorter date range (a year at a time, say) and import each one.`; dash.draw('impDebug'); return; }
    const fresh = newRows(S.parsed), skipped = S.parsed.length - fresh.length;
    if (!fresh.length && bal === '') { impMsg = `Nothing new: all ${S.parsed.length} rows are already in this account.`; dash.draw('impDebug'); return; }
    const txns = fresh.map((x) => ({ date: x.date, description: x.description, amount: x.amount, ...(x.id ? { id: x.id } : {}) }));
    const dates = txns.map((x) => x.date).sort();
    const doc = { book: fd.get('book'), accountKind: String(fd.get('kind')).split(':')[0], accountType: String(fd.get('kind')).split(':')[1] || '', accountName: String(fd.get('account') || S.fileName).slice(0, 60), owner: '',
      fileName: S.fileName.slice(0, 80), importedAt: new Date().toISOString(), rowCount: txns.length, dateFrom: dates[0] || S.asOf || null, dateTo: dates[dates.length - 1] || S.asOf || null,
      balance: bal === '' ? null : Number(bal), balanceMonth: String(fd.get('bmonth') || '') || (dates[dates.length - 1] || S.asOf || '').slice(0, 7), ...(S.pdf && S.asOf ? { asOf: S.asOf } : {}), txns,
      source: S.pdf ? 'pdf' : S.ofx ? 'ofx' : 'csv', fileRows: S.parsed.length, skipped };
    const rc = reconNow(); if (rc && rc.ok) doc.reconcile = { opening: rc.opening, closing: rc.closing, expected: rc.expected, diff: rc.diff, from: String(fd.get('pfrom') || '') || null, to: String(fd.get('pto') || '') || null, checkedAt: doc.importedAt };
    if (JSON.stringify(doc).length > 1500000) { show(IMP, 'fd-imp-big'); return; }
    const btn = form.querySelector('#fd-import-save'); if (btn) btn.disabled = true;
    try {
      const db = await claude.use('db');
      if (!db) throw new Error('no db');
      await db.collection('data/household/imports').add(doc);
      await regAcct(db, doc);
      saveMap(doc.book, doc.accountName);
      show(IMP, 'fd-imp-ok'); document.querySelectorAll('#fd-imp-ok').forEach((el) => { el.textContent = `Saved ${txns.length} transaction${txns.length === 1 ? '' : 's'}${skipped ? ` (${skipped} already in this account were skipped)` : ''}${doc.reconcile ? (doc.reconcile.diff ? `; the statement is off by ${money2(Math.abs(doc.reconcile.diff))}` : '; the statement adds up') : ''}. The dashboard now includes this statement. You can undo it under Import history.`; });
      S.grid = []; S.parsed = []; S.pdf = null; form.reset(); dash.draw('importPreview'); dash.draw('pdfPick');
      if (window.__fdQueueSaved) window.__fdQueueSaved();
    } catch (e) { show(IMP, 'fd-imp-err'); if (btn) btn.disabled = false; impMsg = 'Save error: ' + String((e && e.message) || e); dash.draw('impDebug'); }
  }));

  const MAN = ['fd-man-ok', 'fd-man-err', 'fd-man-miss'];
  // Scan a receipt (manual entry form): fill in the store, date and total from a photo, and keep the photo with the entry.
  // Reading the text needs the phone app; elsewhere the button just attaches the photo.
  const shrinkPhoto = (file) => new Promise((res, rej) => { const img = new Image(), u = URL.createObjectURL(file); img.onload = () => { const k = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u); res(c.toDataURL('image/jpeg', 0.85)); }; img.onerror = () => { URL.revokeObjectURL(u); rej(new Error(T('That file isn’t a photo this device can read.'))); }; img.src = u; });
  const T = (x) => (window.FDI18n ? window.FDI18n.tr(x) : x);
  document.querySelectorAll('#fd-manual-form').forEach((form) => {
    const fi = form.querySelector('input[data-receipt]'), msg = form.querySelector('.fd-scanmsg'), lab = form.querySelector('.fd-scan-l'); if (!fi) return;
    const canRead = () => !!(window.FDReceipt && window.FDReceipt.available());
    const setLabel = () => { if (lab) lab.textContent = canRead() ? T('📷 Scan a receipt (photo or PDF)') : T('📎 Add a receipt (photo or PDF)'); };
    setLabel(); setTimeout(setLabel, 1500);
    fi.addEventListener('change', async () => {
      const file = fi.files[0]; fi.value = ''; if (!file) return;
      msg.className = 'fd-note fd-scanmsg'; msg.textContent = T('Reading the receipt…');
      try {
        const pdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
        let r;
        if (pdf) {
          if (file.size > 3 * 1024 * 1024) throw new Error(T('That file is too large (3 MB max).'));
          const buf = await file.arrayBuffer(); let bin = ''; const u8 = new Uint8Array(buf); for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
          form.__receipt = 'data:application/pdf;base64,' + btoa(bin); form.__receiptMime = 'application/pdf'; form.__receiptName = file.name || 'Receipt.pdf';
          r = await window.FDReceipt.readPdf(buf);
        } else {
          const url = await shrinkPhoto(file); form.__receipt = url; form.__receiptMime = 'image/jpeg'; form.__receiptName = 'Receipt';
          if (!canRead()) { msg.textContent = T('Photo attached. It’s saved with this entry. (Reading the text of a photo needs the phone app; PDFs are read anywhere.)'); return; }
          r = await window.FDReceipt.read(url.split(',')[1]);
        }
        const got = [];
        if (r.total != null) { form.elements.amount.value = r.total.toFixed(2); got.push(T('total')); }
        if (r.date) { form.elements.date.value = r.date; got.push(T('date')); }
        if (r.vendor && !form.elements.vendor.value) { form.elements.vendor.value = r.vendor; got.push(T('store')); }
        form.elements.type.value = 'expense';
        msg.textContent = got.length ? T('Filled in the {0} from the receipt. Check them before saving; the receipt is saved with the entry.').replace('{0}', got.join(', ')) : T('Couldn’t read this receipt. Fill it in by hand; it’s still saved with the entry.');
      } catch (e) { msg.className = 'fd-note fd-scanmsg fd-bad'; msg.textContent = e.message; }
    });
  });

  document.querySelectorAll('#fd-manual-form').forEach((form) => form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = new FormData(form);
    const date = String(fd.get('date') || ''), amt = Number(fd.get('amount')), vendor = String(fd.get('vendor') || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isFinite(amt) || amt <= 0 || !vendor) { show(MAN, 'fd-man-miss'); return; }
    const doc = { book: fd.get('book'), type: fd.get('type') === 'income' ? 'income' : 'expense', date, amount: Math.round(amt * 100) / 100,
      vendor: vendor.slice(0, 40), category: String(fd.get('category') || '').trim().slice(0, 40), note: String(fd.get('note') || '').trim().slice(0, 120),
      createdAt: new Date().toISOString() };
    try {
      const db = await claude.use('db');
      if (!db) throw new Error('no db');
      const added = await db.collection('data/household/manual').add(doc);
      const photo = form.__receipt; form.__receipt = null; const pmime = form.__receiptMime, pname = form.__receiptName;
      if (photo && added && added.id) { try { // keep the receipt photo with the new entry
        const r = await FDStore.fetch(`/api/books/${encodeURIComponent(window.HF.state.bookId)}/files`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mime: pmime || 'image/jpeg', data: photo.split(',')[1] }) });
        const j = await r.json().catch(() => ({})); if (r.ok && j.id) await db.collection('data/household/receipts').add({ book: doc.book, txKey: 'm:' + added.id, fileId: j.id, name: pname || 'Receipt', mime: pmime || 'image/jpeg', size: Math.round(photo.length * 0.75) });
      } catch (e) {} }
      const sm = form.querySelector('.fd-scanmsg'); if (sm) sm.textContent = '';
      show(MAN, 'fd-man-ok'); form.reset();
    } catch { show(MAN, 'fd-man-err'); }
  }));

  document.querySelectorAll('#fd-balance-form').forEach((form) => form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = new FormData(form);
    const acct = String(fd.get('account') || '').trim(), asOf = String(fd.get('asof') || '') || new Date().toISOString().slice(0, 10), b = String(fd.get('balance') || '').trim();
    if (!acct || !/^\d{4}-\d{2}-\d{2}$/.test(asOf) || b === '' || !isFinite(Number(b))) { show(BAL, 'fd-bal-miss'); return; }
    const doc = { book: fd.get('book'), accountKind: String(fd.get('kind')).split(':')[0], accountType: String(fd.get('kind')).split(':')[1] || '', accountName: acct.slice(0, 60), owner: String(fd.get('owner') || '').trim().slice(0, 30),
      fileName: '', importedAt: new Date().toISOString(), rowCount: 0, balance: Number(b), balanceMonth: asOf.slice(0, 7), asOf, txns: [] };
    try {
      const db = await claude.use('db');
      if (!db) throw new Error('no db');
      await db.collection('data/household/imports').add(doc);
      await regAcct(db, doc);
      show(BAL, 'fd-bal-ok'); form.reset();
    } catch { show(BAL, 'fd-bal-err'); }
  }));
})();
