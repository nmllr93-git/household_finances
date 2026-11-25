// Receipt scanning: read the store, date and total from a receipt photo, on the phone itself.
// The text recognition is the phone's own (Android: ML Kit, iPhone: Apple's Vision). Nothing is uploaded anywhere.
//   FDReceipt.available()        → true where this device can read text from photos
//   FDReceipt.read(base64Jpeg)   → { text, vendor, date: 'YYYY-MM-DD' | '', total: number | null }
//   FDReceipt.parse(text)        → the same from text already read (used by the tests too)
(function (root) {
  'use strict';
  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
    ene: 1, abr: 4, ago: 8, dic: 12 };
  const pad = (n) => String(n).padStart(2, '0');
  const okDate = (y, m, d) => { if (y < 100) y += 2000; if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return ''; const dt = new Date(Date.UTC(y, m - 1, d)); if (dt.getUTCMonth() !== m - 1) return ''; return `${y}-${pad(m)}-${pad(d)}`; };
  const money = (s) => { const m = String(s).replace(/[Oo](?=\d)|(?<=\d)[Oo]/g, '0').match(/-?\$?\s?(\d{1,3}(?:,\d{3})+|\d+)[.,](\d{2})(?!\d)/); return m ? Number(m[1].replace(/,/g, '') + '.' + m[2]) : null; };
  const allMoney = (s) => { const out = []; const re = /\$?\s?(\d{1,3}(?:,\d{3})+|\d+)[.,](\d{2})(?!\d)/g; let m; while ((m = re.exec(s))) out.push(Number(m[1].replace(/,/g, '') + '.' + m[2])); return out; };

  function findDate(text) {
    const t = String(text);
    let m;
    const iso = /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/.exec(t); if (iso && (m = okDate(+iso[1], +iso[2], +iso[3]))) return m;
    const us = /\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/g; let u; while ((u = us.exec(t))) { if ((m = okDate(+u[3], +u[1], +u[2]))) return m; }
    const named = /\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec|ene|abr|ago|dic)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{2,4})\b/i.exec(t);
    if (named && (m = okDate(+named[3], MONTHS[named[1].toLowerCase()], +named[2]))) return m;
    const named2 = /\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec|ene|abr|ago|dic)[a-z]*\.?,?\s+(\d{2,4})\b/i.exec(t);
    if (named2 && (m = okDate(+named2[3], MONTHS[named2[2].toLowerCase()], +named2[1]))) return m;
    return '';
  }

  function findTotal(lines) {
    // the line that says TOTAL (not subtotal, total savings, tax or items), preferring the last such line with an amount
    const L = lines.map((l) => l.trim()).filter(Boolean);
    const isTotal = (l) => /\b(grand\s*total|total\s*(due|amount|sale|charged|paid)?|amount\s*(due|paid)|balance\s*due|total\s*a\s*pagar|importe)\b/i.test(l) && !/sub\s*-?\s*total|total\s*(savings|saved|discount|items?|qty|tax)|you\s*saved|items?\s*sold|#\s*of\s*items/i.test(l);
    for (let i = L.length - 1; i >= 0; i--) {
      if (!isTotal(L[i])) continue;
      const here = allMoney(L[i]); if (here.length) return here[here.length - 1];
      for (let j = i + 1; j <= Math.min(L.length - 1, i + 2); j++) { const nx = allMoney(L[j]); if (nx.length) return nx[0]; } // amount printed on the next line
    }
    // no TOTAL line: card receipts often print the charged amount next to the card type
    for (let i = L.length - 1; i >= 0; i--) if (/\b(visa|mastercard|amex|discover|debit|credit|card|charge)\b/i.test(L[i])) { const a = allMoney(L[i]); if (a.length) return a[a.length - 1]; }
    // last resort: the largest amount on the receipt
    const all = L.flatMap((l) => allMoney(l)).filter((x) => x > 0 && x < 100000);
    return all.length ? Math.max(...all) : null;
  }

  function findVendor(lines) {
    const skip = /^(welcome|thank|receipt|store\s*#|st#|tel|phone|www\.|http|\d|#|order|server|table|guest|cashier|date|time|invoice|ticket|terminal|merchant|sale|copy|customer)/i;
    for (const raw of lines.slice(0, 8)) {
      const l = raw.replace(/[^A-Za-z0-9&'.\- ]+/g, ' ').replace(/\s+/g, ' ').trim();
      if (l.length < 3 || skip.test(l) || /\d{3}[-. ]\d{3,4}/.test(l) || /\b(st|street|ave|avenue|rd|road|blvd|dr|hwy|suite|ste)\b\.?/i.test(l) && /\d/.test(l)) continue;
      if (!/[A-Za-z]{3}/.test(l)) continue;
      const v = l.length > 32 ? l.slice(0, 32).trim() : l;
      return v === v.toUpperCase() ? v.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()).replace(/\b(Llc|Inc)\b/g, (x) => x.toUpperCase()) : v;
    }
    return '';
  }

  function parse(text) {
    const lines = String(text || '').split(/\r?\n/);
    return { text: String(text || ''), vendor: findVendor(lines), date: findDate(text), total: findTotal(lines) };
  }

  // the phone's own text recognition: the app plugin (phone-only mode), or the Android app's bridge (pages from your computer)
  const plugin = () => (root.Capacitor && root.Capacitor.Plugins && root.Capacitor.Plugins.Ocr) || null;
  const bridge = () => (root.LarenestWidgetNative && typeof root.LarenestWidgetNative.ocr === 'function' ? root.LarenestWidgetNative : null);
  async function read(b64) {
    let text = '';
    if (plugin()) { const r = await plugin().read({ data: b64 }); text = (r && r.text) || ''; }
    else if (bridge()) text = bridge().ocr(b64) || '';
    else throw new Error('This device can’t read receipts.');
    return parse(text);
  }
  // a PDF receipt (an e-receipt or invoice): its text is already in the file, so any device can read it (pdf.js, bundled)
  async function readPdf(buffer) {
    if (!root.FDPdf) throw new Error('This device can’t read PDFs.');
    const lines = await root.FDPdf.readLines(buffer);
    return parse(lines.map((l) => l.text).join('\n'));
  }
  const FDReceipt = { available: () => !!(plugin() || bridge()), read, readPdf, parse };
  if (typeof module !== 'undefined' && module.exports) module.exports = FDReceipt; else root.FDReceipt = FDReceipt;
})(typeof window !== 'undefined' ? window : globalThis);
