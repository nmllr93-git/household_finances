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
    const out = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
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
    m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
    if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`; }
    const t = Date.parse(s);
    if (!isNaN(t) && /[a-z]{3}/i.test(s)) { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
    return null;
  }
  function toNum(s) {
    s = String(s ?? '').trim(); if (!s) return null;
    let neg = /^\(.*\)$/.test(s) || /-$/.test(s) || /^-/.test(s.replace(/[$\s]/g, '')) || /\bDR\b/i.test(s);
    const v = parseFloat(s.replace(/[^0-9.]/g, ''));
    if (isNaN(v)) return null;
    if (/\bCR\b/i.test(s)) neg = false;
    return neg ? -v : v;
  }
  function detect() {
    const g = S.grid;
    let hr = -1;
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
      amount: find(/^amount|amount/), debit: find(/debit|withdraw|charge/), credit: find(/credit(?!.*card)|deposit/), balance: find(/balance/) };
    if (hr < 0) { // no header: guess from the cells
      const sample = body.slice(0, 20);
      const score = (i, f) => sample.filter((r) => f(r[i])).length;
      for (let i = 0; i < width; i++) {
        if (c.date < 0 && score(i, (v) => toDate(v)) > sample.length * 0.7) c.date = i;
        else if (c.amount < 0 && score(i, (v) => toNum(v) !== null && /\d/.test(v || '')) > sample.length * 0.7) c.amount = i;
      }
      let best = -1, bl = 0;
      for (let i = 0; i < width; i++) { if (i === c.date || i === c.amount) continue; const l = sample.reduce((s, r) => s + String(r[i] || '').length, 0); if (l > bl) { bl = l; best = i; } }
      c.desc = best;
    }
    if (c.amount >= 0) { c.debit = -1; c.credit = -1; }
    S.cols = c;
  }
  function parseRows() {
    const c = S.cols, body = S.grid.slice(S.hdrRow + 1);
    const raw = [];
    for (const r of body) {
      const date = toDate(r[c.date]);
      if (!date) continue;
      let v;
      if (c.amount >= 0) v = toNum(r[c.amount]);
      else { const d = toNum(r[c.debit]), cr = toNum(r[c.credit]); if (d === null && cr === null) continue; v = Math.abs(d || 0) - Math.abs(cr || 0); }
      if (v === null || v === 0) continue;
      raw.push({ date, description: String(r[c.desc] ?? '').replace(/\s+/g, ' ').slice(0, 120), v, bal: c.balance >= 0 ? toNum(r[c.balance]) : null });
    }
    // Amount sign: stored as positive = money out
    let flip = false;
    if (c.amount >= 0) {
      if (S.sign === 'neg') flip = true;
      else if (S.sign === 'auto') flip = raw.filter((x) => x.v < 0).length > raw.length / 2;
    }
    S.parsed = raw.map((x) => ({ date: x.date, description: x.description, amount: Math.round((flip ? -x.v : x.v) * 100) / 100, bal: x.bal }));
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
    dash.draw('importPreview');
  };

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
    if (p.length) {
      const fm = document.querySelector('#fd-import-form');
      const bk = fm ? new FormData(fm).get('book') : '', seen = new Set();
      const imp = dash.data('imports').status === 'ok' ? dash.data('imports').data || [] : [];
      for (const b of imp) { if (b.book !== bk) continue; let l = b.txns; if (typeof l === 'string') { try { l = JSON.parse(l); } catch { l = []; } } for (const t of l || []) seen.add(`${t.date}|${Number(t.amount)}|${t.description}`); }
      const dup = p.filter((x) => seen.has(`${x.date}|${Number(x.amount)}|${x.description}`)).length;
      const n = document.createElement('p'); n.className = 'fd-note' + (dup ? ' fd-warn' : '');
      n.textContent = dup ? `${dup} of ${p.length} rows are already in the dashboard and will be skipped.` : `All ${p.length} rows are new.`;
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
      S.grid = parseCSV(S.text); S.sign = 'auto';
      detect(); refresh(); fillBalance();
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
      rows.push([date, desc || tag(b, 'TRNTYPE') || 'Transaction', amt < 0 ? String(-amt) : '', amt > 0 ? String(amt) : '']);
    }
    S.pdf = null; dash.draw('pdfPick');
    S.grid = rows.length ? [['Date', 'Description', 'Debit', 'Credit'], ...rows] : []; S.sign = 'auto';
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
    const txns = S.parsed.map((x) => ({ date: x.date, description: x.description, amount: x.amount }));
    const dates = txns.map((x) => x.date).sort();
    const doc = { book: fd.get('book'), accountKind: String(fd.get('kind')).split(':')[0], accountType: String(fd.get('kind')).split(':')[1] || '', accountName: String(fd.get('account') || S.fileName).slice(0, 60), owner: '',
      fileName: S.fileName.slice(0, 80), importedAt: new Date().toISOString(), rowCount: txns.length, dateFrom: dates[0] || S.asOf || null, dateTo: dates[dates.length - 1] || S.asOf || null,
      balance: bal === '' ? null : Number(bal), balanceMonth: String(fd.get('bmonth') || '') || (dates[dates.length - 1] || S.asOf || '').slice(0, 7), ...(S.pdf && S.asOf ? { asOf: S.asOf } : {}), txns };
    if (JSON.stringify(doc).length > 1500000) { show(IMP, 'fd-imp-big'); return; }
    const btn = form.querySelector('#fd-import-save'); if (btn) btn.disabled = true;
    try {
      const db = await claude.use('db');
      if (!db) throw new Error('no db');
      await db.collection('data/household/imports').add(doc);
      await regAcct(db, doc);
      show(IMP, 'fd-imp-ok');
      S.grid = []; S.parsed = []; S.pdf = null; form.reset(); dash.draw('importPreview'); dash.draw('pdfPick');
      if (window.__fdQueueSaved) window.__fdQueueSaved();
    } catch (e) { show(IMP, 'fd-imp-err'); if (btn) btn.disabled = false; impMsg = 'Save error: ' + String((e && e.message) || e); dash.draw('impDebug'); }
  }));

  const MAN = ['fd-man-ok', 'fd-man-err', 'fd-man-miss'];
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
      await db.collection('data/household/manual').add(doc);
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
