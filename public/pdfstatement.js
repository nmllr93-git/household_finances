// Reads a bank or investment statement PDF in the browser (with the bundled pdf.js) and pulls out
// the transactions table, if there is one, and the balances it mentions. Nothing leaves the device.
(function (root) {
  const MONEY = /^\(?-?\$?\s?-?\d{1,3}(?:,\d{3})*\.\d{2}\)?(?:\s?(?:CR|DR|-))?$/;
  const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
  const pad = (n) => String(n).padStart(2, '0');
  const num = (s) => {
    s = String(s || '').trim(); const neg = /^\(.*\)$/.test(s) || /^-|^\$\s?-|-$|\bDR\b/i.test(s);
    const v = parseFloat(s.replace(/[^0-9.]/g, '')); return isNaN(v) ? null : neg ? -v : v;
  };
  // Every full date in a string: 9/30/2026, 2026-09-30, Sep 30, 2026, September 30 2026
  const fullDates = (s) => {
    const out = []; let m;
    const r1 = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g; while ((m = r1.exec(s))) out.push(`${m[3].length === 2 ? '20' + m[3] : m[3]}-${pad(m[1])}-${pad(m[2])}`);
    const r2 = /\b(\d{4})-(\d{2})-(\d{2})\b/g; while ((m = r2.exec(s))) out.push(`${m[1]}-${m[2]}-${m[3]}`);
    const r3 = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/gi;
    while ((m = r3.exec(s))) out.push(`${m[3]}-${pad(MON[m[1].toLowerCase().slice(0, m[1].toLowerCase() === 'sept' ? 4 : 3)] || MON[m[1].toLowerCase().slice(0, 3)])}-${pad(m[2])}`);
    return out.filter((d) => /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(d));
  };
  // A date at the start of a transaction row; short dates (10/3, Oct 3) take their year from the statement end.
  const rowDate = (s, end) => {
    s = String(s || '').trim(); let m;
    const f = fullDates(s); if (f.length && s.indexOf(s.match(/\d|[A-Z]/i)[0]) === 0 && fullDates(s.slice(0, 14)).length) return f[0];
    const ey = +end.slice(0, 4), em = +end.slice(5, 7);
    const year = (mo) => (mo > em ? ey - 1 : ey);
    if ((m = s.match(/^(\d{1,2})\/(\d{1,2})$/))) return `${year(+m[1])}-${pad(m[1])}-${pad(m[2])}`;
    if ((m = s.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})$/i))) { const mo = MON[m[1].toLowerCase().slice(0, 3)]; return `${year(mo)}-${pad(mo)}-${pad(m[2])}`; }
    return null;
  };

  // Turns the PDF into lines of positioned text items.
  async function readLines(buffer) {
    await import('/vendor/pdfjs/compat.mjs'); // Safari (iPhone) stand-ins for newer features pdf.js uses
    const pdfjs = await import('/vendor/pdfjs/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.compat.mjs';
    const doc = await pdfjs.getDocument({ data: buffer, isEvalSupported: false }).promise;
    return linesFrom(doc);
  }
  async function linesFrom(doc) {
    const lines = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const tc = await (await doc.getPage(p)).getTextContent();
      const items = tc.items.filter((i) => i.str && i.str.trim()).map((i) => ({ s: i.str.trim(), x: i.transform[4], y: i.transform[5], w: i.width || 0 }));
      items.sort((a, b) => b.y - a.y || a.x - b.x);
      const pl = [];
      for (const it of items) { let l = pl.find((q) => Math.abs(q.y - it.y) <= 2.5); if (!l) { l = { page: p, y: it.y, items: [] }; pl.push(l); } l.items.push(it); }
      pl.sort((a, b) => b.y - a.y);
      for (const l of pl) { l.items.sort((a, b) => a.x - b.x); l.text = l.items.map((i) => i.s).join(' ').replace(/\s+/g, ' '); lines.push(l); }
    }
    return lines;
  }

  // Section titles such as "Checking Account - 7902", "Savings Account - 3904" or "House Vault", so one PDF with several accounts can be split.
  const isTitle = (l) => l.text.length <= 45 && l.text.split(' ').length <= 6 && !l.items.some((it) => MONEY.test(it.s))
    && /\b(account|vault)\s*([-–#]\s*\d{3,6})?$/i.test(l.text.trim()) && !/your|this|the|terms|primary|number|statement/i.test(l.text);
  function analyze(lines, kind) {
    const all = lines.map((l) => l.text).join('\n');
    let sec = ''; const secOf = new Map();
    for (const l of lines) { if (isTitle(l)) sec = l.text.replace(/\s+/g, ' ').trim(); secOf.set(l, sec); }
    const thisYear = new Date().getFullYear() + 1;
    const dates = fullDates(all).filter((d) => +d.slice(0, 4) <= thisYear && +d.slice(0, 4) >= 2000).sort();

    // ---- balances: labelled amounts, with the date they're "as of" ----
    const LABEL = /(ending|closing|new|current|available|statement)\s+(daily\s+)?balance|ending\s+value|total\s+(account\s+)?value|value\s+as\s+of|balance\s+as\s+of|account\s+value|market\s+value|total\s+balance|vested\s+balance/i;
    const PRI = [/ending|closing/i, /current/i, /total (account )?value|ending value|account value/i, /balance as of|value as of/i, /./];
    const cands = [];
    lines.forEach((l, i) => {
      if (!LABEL.test(l.text) || /beginning|previous|opening|minimum|average|daily balance\b(?! on)|fee/i.test(l.text.replace(/ending daily balance/i, ''))) return;
      let amts = l.items.filter((it) => MONEY.test(it.s));
      let at = l;
      if (!amts.length) { // amount printed under the label (e.g. a summary box)
        const lab = l.items.find((it) => LABEL.test(it.s)) || l.items[0];
        for (const nx of lines.slice(i + 1, i + 3)) {
          const a = nx.items.filter((it) => MONEY.test(it.s)).sort((p, q) => Math.abs(p.x - lab.x) - Math.abs(q.x - lab.x));
          if (a.length) { amts = [a[0]]; at = nx; break; }
        }
      }
      if (!amts.length) return;
      const near = [l.text, at.text, ...(lines.slice(i + 1, i + 4).map((x) => x.text))].join(' ');
      const ok = (x) => +x.slice(0, 4) <= thisYear;
      // The date on the label's own line wins ("Balance as of Sep 30, 2026"); otherwise the latest date printed nearby.
      const d = fullDates(l.text).filter(ok).sort().pop() || fullDates(near).filter(ok).sort().pop() || null;
      const v = num(amts[amts.length - 1].s); if (v === null) return;
      const label = l.text.replace(MONEY, '').replace(/\s+\$?[\d,]+\.\d{2}.*$/, '').trim().slice(0, 70);
      cands.push({ label, amount: Math.abs(v), date: d, page: l.page, section: secOf.get(l) || '', pri: PRI.findIndex((r) => r.test(label)) });
    });
    const seen = new Set();
    const balances = cands.sort((a, b) => a.pri - b.pri || String(b.date || '').localeCompare(String(a.date || '')) || a.page - b.page)
      .filter((c) => { const k = c.section + '|' + c.amount.toFixed(2); if (seen.has(k)) return false; seen.add(k); return true; });
    const today = new Date().toISOString().slice(0, 10);
    const end = balances.map((b) => b.date).filter((d) => d && d <= today).sort().pop() || dates.filter((d) => d <= today).pop() || today;

    // ---- transactions: rows under a header that has a date column and money columns ----
    const txns = [];
    let cols = null, last = null;
    const colOf = (l, re) => { const it = l.items.find((x) => re.test(x.s)); return it ? it.x + it.w / 2 : null; };
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i], prev = lines[i - 1];
      const head = prev && prev.page === l.page ? { items: [...prev.items, ...l.items] } : l;
      if (/\bdate\b/i.test(l.text) && /(deposit|addition|credit|withdraw|subtraction|debit|amount|payment)/i.test(head.items.map((x) => x.s).join(' '))) {
        cols = { page: l.page, in: colOf(head, /deposit|addition|credit/i), out: colOf(head, /withdraw|subtraction|debit|payment/i), amt: colOf(head, /^amount$|amount/i), bal: colOf(head, /balance/i) };
        if (cols.in == null && cols.out == null && cols.amt == null) cols = null;
        last = null; continue;
      }
      if (!cols || l.page !== cols.page && !/\bdate\b/i.test(l.text)) { if (cols && l.page !== cols.page) cols = { ...cols, page: l.page }; }
      if (!cols) continue;
      if (/^(total|ending balance|beginning balance|totals)\b/i.test(l.text)) { last = null; continue; }
      const first = l.items[0]; const d = first && (rowDate(first.s, end) || rowDate(l.items.slice(0, 2).map((x) => x.s).join(' '), end));
      const money = l.items.filter((it) => MONEY.test(it.s));
      if (!d) { if (last && !money.length && l.text.length < 90) last.description = (last.description + ' ' + l.text).slice(0, 120); continue; }
      if (!money.length) continue;
      const dateItems = rowDate(first.s, end) ? 1 : 2;
      const desc = l.items.slice(dateItems).filter((it) => !MONEY.test(it.s) && it.x < money[0].x).map((it) => it.s).join(' ').replace(/^\d{3,6}\s+(?=\D)/, '').trim();
      let out = 0, inn = 0;
      for (const m of money) {
        const cx = m.x + m.w / 2, v = num(m.s);
        const opts = [['in', cols.in], ['out', cols.out], ['amt', cols.amt], ['bal', cols.bal]].filter(([, x]) => x != null).sort((a, b) => Math.abs(a[1] - cx) - Math.abs(b[1] - cx));
        const c = opts[0] && opts[0][0];
        if (c === 'in') inn += Math.abs(v); else if (c === 'out') out += Math.abs(v);
        else if (c === 'amt') { const outflow = kind === 'credit' ? v > 0 : v < 0; if (outflow) out += Math.abs(v); else inn += Math.abs(v); }
      }
      if (!out && !inn) continue;
      last = { date: d, description: desc || 'Transaction', out: Math.round(out * 100) / 100, in: Math.round(inn * 100) / 100, section: secOf.get(l) || '' };
      txns.push(last);
    }
    const sections = [...new Set([...balances.map((b) => b.section), ...txns.map((t) => t.section)])];
    return { txns, balances, end, sections };
  }

  root.FDPdf = { readLines, linesFrom, analyze };
})(typeof window !== 'undefined' ? window : globalThis);
