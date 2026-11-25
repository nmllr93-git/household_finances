// Calculations behind every number on the page. Each one is shown in Sources.

// Duplicate rule shared by the dashboard, the import preview and saving (see where it's used in 'txns').
function makeDupeChecker() {
  const dupe = new Map(), ids = new Set();
  return (b, t, amt) => {
    const acct = `${b.book}|${String(b.accountName || b.fileName || '').toLowerCase()}`, fp = `${acct}|${t.date}|${amt}|${String(t.description || '').trim()}`;
    let r = dupe.get(fp); if (!r) dupe.set(fp, (r = { byBatch: new Map(), counted: 0, anon: 0 }));
    if (t.id) { const k = acct + '|id|' + t.id; if (ids.has(k)) return true; ids.add(k);
      if (r.anon > 0) { r.anon--; return true; } // the same transaction already came in from a statement without ids
      r.counted++; return false; }
    const c = (r.byBatch.get(b.id) || 0) + 1; r.byBatch.set(b.id, c);
    if (c <= r.counted) return true;
    r.counted++; r.anon++; return false;
  };
}
if (typeof window !== 'undefined') window.FDDupeChecker = makeDupeChecker;

// Statement reconciliation: does opening balance + this statement's activity land on the closing balance?
// Works in cents. Rows use the stored sign (positive = money out). Deposit accounts: money out lowers the balance.
// Credit accounts: balances are what you owe, so money out (purchases) raises it. Never changes any data; it only reports.
function reconcileStatement({ kind, opening, closing, rows, from, to }) {
  const c = (x) => Math.round(Number(x) * 100);
  if (!['deposit', 'credit'].includes(kind)) return { ok: false, reason: 'kind' };
  if (opening === '' || opening == null || closing === '' || closing == null || !isFinite(Number(opening)) || !isFinite(Number(closing))) return { ok: false, reason: 'missing' };
  const inP = (rows || []).filter((t) => t && t.date && (!from || t.date >= from) && (!to || t.date <= to) && isFinite(Number(t.amount)));
  const out = inP.reduce((s, t) => s + c(t.amount), 0);
  const sign = kind === 'credit' ? 1 : -1;
  const exp = c(opening) + sign * out, diff = c(closing) - exp; // positive diff: the statement says more than the rows explain
  // Rows that would explain the gap: one row missing (|amount| = |diff|) or entered with the wrong sign (2 × |amount| = |diff|).
  const cand = !diff ? [] : inP.filter((t) => { const a = Math.abs(c(t.amount)); return a === Math.abs(diff) || 2 * a === Math.abs(diff); })
    .map((t) => ({ ...t, why: Math.abs(c(t.amount)) === Math.abs(diff) ? 'same amount as the gap (missing or extra?)' : 'half the gap (sign flipped?)' }));
  return { ok: true, count: inP.length, expected: exp / 100, closing: c(closing) / 100, opening: c(opening) / 100, diff: diff / 100, balanced: diff === 0, candidates: cand.slice(0, 8) };
}
if (typeof window !== 'undefined') window.FDReconcile = reconcileStatement;

// Household settlements. A closed period is a saved statement: for each person, what they paid minus their share
// (positive = paid more than their share, so they're owed). Payments between people are kept apart from spending:
// "A paid B $x" moves A's balance up and B's down, so it settles what's owed and never touches spending totals.
// Returns each person's running balance (in cents, then dollars) and the fewest payments that would even everyone out.
function settlementBalances(periods, payments) {
  const c = (x) => Math.round(Number(x) * 100), net = {};
  const add = (n, v) => { if (!n) return; net[n] = (net[n] || 0) + v; };
  for (const p of periods || []) for (const [n, v] of Object.entries((p && p.net) || {})) if (isFinite(Number(v))) add(n, c(v));
  for (const x of payments || []) { const a = c(x && x.amount); if (!(a > 0) || !x.from || !x.to || x.from === x.to) continue; add(x.from, a); add(x.to, -a); }
  const owed = Object.entries(net).filter(([, v]) => v > 0).map(([n, v]) => [n, v]).sort((a, b) => b[1] - a[1]);
  const owes = Object.entries(net).filter(([, v]) => v < 0).map(([n, v]) => [n, -v]).sort((a, b) => b[1] - a[1]);
  const transfers = []; let i = 0, j = 0;
  while (i < owes.length && j < owed.length) { const m = Math.min(owes[i][1], owed[j][1]); if (m > 0) transfers.push({ from: owes[i][0], to: owed[j][0], amount: m / 100 }); owes[i][1] -= m; owed[j][1] -= m; if (!owes[i][1]) i++; if (!owed[j][1]) j++; }
  return { net: Object.fromEntries(Object.entries(net).map(([n, v]) => [n, v / 100])), transfers, even: transfers.every((t) => t.amount < 0.005) };
}
// A period's statement from who paid what: each person's paid minus (their % × the assigned total).
function settlementStatement(people, paid) {
  const c = (x) => Math.round(Number(x) * 100), tot = people.reduce((t, p) => t + c(paid[p.name] || 0), 0), net = {};
  let left = tot; people.forEach((p, k) => { const share = k === people.length - 1 ? left : Math.round(tot * (Number(p.pct) || 0) / 100); left -= share; net[p.name] = (c(paid[p.name] || 0) - share) / 100; });
  return { total: tot / 100, net, paid: Object.fromEntries(people.map((p) => [p.name, c(paid[p.name] || 0) / 100])), shares: people.map((p) => ({ name: p.name, pct: Number(p.pct) || 0 })) };
}
if (typeof window !== 'undefined') { window.FDSettle = settlementBalances; window.FDSettleStatement = settlementStatement; }

// Confirmed bills and paydays for the cash forecast. A schedule repeats from its start date; one occurrence can be
// skipped or moved (to another date and/or amount) without changing the rest. These are plans, not transactions:
// they appear only in the forecast and never in actual totals.
function scheduleOccurrences(schedules, todayIso, days) {
  const DAY = 864e5, t0 = Date.parse(todayIso + 'T00:00:00Z'), end = t0 + days * DAY, out = [];
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  const step = (ms, every, startDay) => { const d = new Date(ms);
    if (every === 'weekly') return ms + 7 * DAY; if (every === 'biweekly') return ms + 14 * DAY;
    if (every === 'monthly' || every === 'yearly') { const y = d.getUTCFullYear(), m = d.getUTCMonth() + (every === 'monthly' ? 1 : 12); const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); return Date.UTC(y, m, Math.min(startDay, last)); } // the 31st stays at month end
    return Infinity; };
  for (const s of schedules || []) {
    const amt = Math.abs(Number(s && s.amount)); if (!s || !(amt > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(s.start || '')) continue;
    const sign = s.kind === 'pay' ? 1 : -1, ov = s.overrides || {}, startDay = Number(s.start.slice(8, 10));
    let ms = Date.parse(s.start + 'T00:00:00Z'), guard = 0;
    while (ms < end + 62 * DAY && guard++ < 1200) { // look a little past the end: an occurrence can be moved into the window
      const key = iso(ms), o = ov[key];
      if (!(o && o.skip)) { const when = o && /^\d{4}-\d{2}-\d{2}$/.test(o.date || '') ? Date.parse(o.date + 'T00:00:00Z') : ms; const a = o && Number(o.amount) > 0 ? Number(o.amount) : amt;
        if (when >= t0 && when <= end) out.push({ id: s.id, key, date: iso(when), day: Math.round((when - t0) / DAY), label: s.label, amt: sign * a, confirmed: true, moved: when !== ms, changed: a !== amt, replaces: s.replaces || '' }); }
      const nx = step(ms, s.every, startDay); if (nx === Infinity || nx <= ms) break; ms = nx;
    }
  }
  return out.sort((a, b) => a.day - b.day);
}
// Put confirmed occurrences in place of the estimates they stand for (same name as the schedule's "replaces"), not alongside them.
function mergeForecast(estimates, confirmed) {
  const rep = new Set((confirmed || []).map((c) => String(c.replaces || '').trim().toLowerCase()).filter(Boolean));
  const repById = new Set((confirmed || []).map((c) => c.id));
  return [...(estimates || []).filter((e) => !rep.has(String(e.label || '').trim().toLowerCase())), ...(confirmed || [])].sort((a, b) => a.day - b.day || (repById.has(a.id) ? -1 : 1));
}
if (typeof window !== 'undefined') { window.FDSchedule = scheduleOccurrences; window.FDMergeForecast = mergeForecast; }

dash.calc('all_txns', {
  title: 'All transactions, cleaned (including ignored ones)',
  description: 'Sheet rows, imported statement rows and manual entries, each with a cleaned-up vendor name. For any book and month with imported statement transactions, the imports replace the sheet rows. Your rules are applied next, then your edits to single transactions (including splits). Transactions you ignored, or that an ignore rule matches, are marked as ignored.',
  inputs: ['sheet_history', 'imports', 'manual', 'edits', 'rules'],
  fn: (sheetRows, importBatches, manualRows, editRows, ruleRows) => {
    const RULES = [
      [/^office chair$/i, 'Amazon'],
      [/prime video/i, 'Prime Video'], [/youtube ?tv/i, 'YouTube TV'], [/hbo|max\.com/i, 'HBO Max'],
      [/spotify/i, 'Spotify'], [/netflix/i, 'Netflix'], [/paramount/i, 'Paramount+'],
      [/google ?tv/i, 'Google TV'], [/google ?pixel/i, 'Google Pixel'], [/league ?pass/i, 'NBA League Pass'],
      [/hulu/i, 'Hulu'], [/disney/i, 'Disney+'], [/peacock/i, 'Peacock'], [/apple\.com\/bill|itunes/i, 'Apple'],
      [/audible/i, 'Audible'], [/openai|chatgpt/i, 'ChatGPT'], [/anthropic|claude\.ai/i, 'Claude'],
      [/github/i, 'GitHub'], [/xbox|microsoft/i, 'Microsoft'], [/playstation|sony/i, 'PlayStation'],
      [/downpayment|down payment|closing/i, 'Home purchase & closing'], [/mortgage|mtg pmt|loan servic/i, 'Mortgage'],
      [/^rent$/i, 'Rent'], [/stud?ent loan|sudent loan|nelnet|mohela|navient/i, 'Student loans'],
      [/amazon|amzn/i, 'Amazon'], [/hy-?vee/i, 'Hy-Vee'], [/wal-?mart|wm supercenter/i, 'Walmart'],
      [/costco/i, 'Costco'], [/\baldi\b/i, 'Aldi'], [/chong/i, "Chong's Market"], [/fareway/i, 'Fareway'],
      [/target/i, 'Target'], [/kroger/i, 'Kroger'], [/farmer'?s market/i, 'Farmers Market'],
      [/casey/i, "Casey's"], [/maveri/i, 'Maverik'], [/kwik ?trip/i, 'Kwik Trip'], [/\bshell\b/i, 'Shell'],
      [/marathon/i, 'Marathon'], [/exxon/i, 'Exxon'], [/love'?s/i, "Love's"], [/circle k/i, 'Circle K'],
      [/\bqt \d|quiktrip/i, 'QuikTrip'], [/\bbp\b|^bp#/i, 'BP'],
      [/menards/i, 'Menards'], [/^ace\b|ace hardware/i, 'Ace Hardware'], [/lowe'?s/i, "Lowe's"],
      [/home depot/i, 'Home Depot'], [/steam|valve/i, 'Steam'], [/t-?mobile/i, 'T-Mobile'],
      [/midamerican/i, 'MidAmerican Energy'],
      [/animal clinic|^vet$/i, 'Animal Clinic'], [/petsmart/i, 'PetSmart'],
      [/doordash/i, 'DoorDash'], [/^atm\b/i, 'ATM cash'], [/golf/i, 'Golf'],
      [/dollar.?general/i, 'Dollar General'], [/paper ?statement fee/i, 'Bank fees'], [/overage fee/i, 'Overage fees'],
      [/1800flowers|flowerama/i, '1-800-Flowers'],
      [/vacation transfer|personal transfer|^transfer\b/i, 'Transfers'],
    ];
    const CITIES = /\s+[A-Za-z][A-Za-z .]{2,20}\s+(AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b.*$/;
    const clean = (d) => {
      let s = String(d || '').trim();
      for (const [re, name] of RULES) if (re.test(s)) return name;
      s = s.replace(/^(sq|tst|pp|paypal|sp|py)\s*\*\s*/i, '').replace(/\*.*$/, '').replace(/#.*$/, '')
        .replace(/\(.*?\)/g, '').replace(/\d{3}[-.]\d{3}[-.]\d{4}.*$/, '').replace(/\b[A-Z]{2}\s*$/, '')
        .replace(/\d{3,}/g, '').replace(CITIES, '').replace(/\s+[A-Z][a-z]+(\s+[A-Z][a-z]+)*\s*$/, (m, _g, off, str) => (str.slice(0, off) === str.slice(0, off).toUpperCase() && off > 3 ? '' : m))
        .replace(/\s+[A-Z]$/, '').replace(/[-–&]\s*$/, '').replace(/\s+/g, ' ').trim();
      if (s === s.toUpperCase()) s = s.toLowerCase().replace(/(^|[\s\-\/(])([a-z])/g, (m, a, c) => a + c.toUpperCase());
      return (s || 'Unknown').slice(0, 32).trim();
    };
    const TRANSFER = /payment.{0,3}thank|autopay|auto pay|e-?payment|epay|online (banking )?transfer|transfer (to|from)|card payment|crd pmt|cardmember serv|mobile pmt|internet payment|ach pmt.*(card|discover|chase|citi|capital one)|payment to (chase|discover|citi|capital one|amex)/i;
    const out = [];
    // Imported statements
    const imp = [];
    const importedMonths = new Map(); // book|month -> earliest imported date in that month
    // Duplicates (overlapping statements, a statement plus bank sync) are found per ACCOUNT, never across accounts:
    //  - rows with the bank's own id (OFX FITID, bank-sync ids) are the same only if the id matches;
    //  - rows without one: each statement counts its own identical rows (two $4.50 coffees on one day are two),
    //    and an overlapping statement for the same account only adds rows beyond what's already counted.
    const isDuplicate = makeDupeChecker();
    for (const b of importBatches || []) {
      let list = b.txns;
      if (typeof list === 'string') { try { list = JSON.parse(list); } catch { list = []; } }
      (list || []).forEach((t, j) => {
        const amt = Number(t.amount);
        if (!t.date || !isFinite(amt) || amt === 0) return;
        if (isDuplicate(b, t, amt)) return;
        const kindAcct = b.accountKind;
        let type;
        if (kindAcct === 'investment' || kindAcct === 'mortgage' || kindAcct === 'loan' || TRANSFER.test(t.description || '')) type = 'transfer';
        else if (amt > 0) type = 'expense';
        else type = kindAcct === 'credit' ? 'expense' : 'income';
        const month = String(t.date).slice(0, 7);
        if (type === 'expense' || type === 'income') { const km = `${b.book}|${month}`, d0 = importedMonths.get(km); if (!d0 || String(t.date) < d0) importedMonths.set(km, String(t.date)); }
        imp.push({ key: `i:${b.id}:${j}`, book: b.book, month, date: t.date, amount: type === 'income' ? -amt : amt, description: t.description || '',
          type, source: b.accountName || b.fileName || 'Statement', acctKind: kindAcct });
      });
    }
    // Vendor -> usual category, learned from the sheets
    const catVotes = {};
    for (const r of sheetRows || []) {
      if (r.type !== 'expense') continue;
      const v = clean(r.description);
      for (const k of [`${r.book}|${v}`, `*|${v}`]) {
        catVotes[k] = catVotes[k] || {};
        catVotes[k][r.category] = (catVotes[k][r.category] || 0) + 1;
      }
    }
    const top = (o) => o && Object.entries(o).sort((a, b) => b[1] - a[1])[0][0];
    const guess = (book, vendor, desc, type) => {
      if (type === 'transfer') return 'Transfer';
      if (type === 'income') return /payroll|direct dep|salary|paycheck|\bcsi\b/i.test(desc) ? 'Paycheck' : /interest/i.test(desc) ? 'Interest' : 'Other';
      const k = top(catVotes[`${book}|${vendor}`]) || top(catVotes[`*|${vendor}`]);
      if (k) return k;
      if (/grocer|market|foods?\b|supermarket/i.test(desc)) return 'Groceries';
      if (/fuel|gas|oil|petro|station|parking|airline|hotel|uber|lyft/i.test(desc)) return 'Travel';
      if (/cafe|coffee|pizza|brew|grill|taco|restaurant|kitchen|bar\b|pub\b|diner|burger/i.test(desc)) return 'Dining';
      if (/pharm|clinic|medical|hospital|dental|health/i.test(desc)) return 'Health/medical';
      return 'Uncategorized';
    };
    const sheetMonths = new Set((sheetRows || []).map((r) => `${r.book}|${r.month}`));
    // A month the sheets already cover switches to imported transactions only when the imports start by the 7th of it.
    // Otherwise (a statement that starts Oct 26, say) the sheet keeps that month and those few imported days are left out, so nothing counts twice.
    const replaced = new Set([...importedMonths].filter(([k, d]) => !sheetMonths.has(k) || Number(d.slice(8, 10)) <= 7).map(([k]) => k));
    (sheetRows || []).forEach((r, i) => {
      if (replaced.has(`${r.book}|${r.month}`)) return;
      const vendor = clean(r.description);
      out.push({ key: `s${i}`, book: r.book, month: r.month, date: r.date, vendor, category: r.category,
        type: r.type, amount: Number(r.amount), oneTime: vendor === 'Home purchase & closing',
        description: r.description, source: 'Google Sheets' });
    });
    for (const r of imp) {
      if (sheetMonths.has(`${r.book}|${r.month}`) && !replaced.has(`${r.book}|${r.month}`)) continue;
      const vendor = clean(r.description);
      out.push({ ...r, vendor, category: guess(r.book, vendor, r.description, r.type), oneTime: vendor === 'Home purchase & closing' });
    }
    for (const r of manualRows || []) {
      const amt = Number(r.amount);
      if (!r.date || !isFinite(amt) || amt <= 0) continue;
      const type = r.type === 'income' ? 'income' : 'expense';
      out.push({ key: `m:${r.id}`, book: r.book, month: String(r.date).slice(0, 7), date: r.date,
        vendor: String(r.vendor || 'Manual entry').trim().slice(0, 40), category: r.category || (type === 'income' ? 'Other' : 'Uncategorized'),
        type, amount: amt, oneTime: false, description: r.note || r.vendor || '', source: 'Manual entry' });
    }
    // Transfer matching: a payment out of checking/savings and the same amount arriving on a card or loan within 5 days are one transfer, not spending.
    {
      const day = (d) => Date.parse(String(d) + 'T00:00:00Z') / 864e5;
      const pays = out.filter((t) => ['credit', 'loan', 'mortgage'].includes(t.acctKind) && Number(t.amount) < 0);
      const outs = out.filter((t) => t.acctKind === 'deposit' && Number(t.amount) > 0);
      const used = new Set();
      for (const p of pays) {
        let best = null, bestGap = 99;
        for (const o of outs) {
          if (used.has(o.key) || o.book !== p.book || o.source === p.source || Math.abs(Math.abs(p.amount) - o.amount) > 0.005) continue;
          const gap = Math.abs(day(o.date) - day(p.date)); if (gap <= 5 && gap < bestGap) { best = o; bestGap = gap; }
        }
        if (!best) continue;
        used.add(best.key);
        for (const [a, b] of [[p, best], [best, p]]) { a.type = 'transfer'; a.category = 'Transfer'; a.matched = `${b.source} ${b.date}`; }
      }
    }
    // Your rules: "description contains X" -> vendor / category / type. Later rules win.
    // Rules: IF every condition matches (AND), SET the chosen fields. Older rules (match text, optional vendor) read as conditions too.
    // Conditions are checked against each transaction's values before any rule changed them. r.logic is kept for "or" groups later.
    const condsOf = (r) => (Array.isArray(r.conds) && r.conds.length ? r.conds
      : [...(r.match ? [{ field: 'description', op: 'contains', value: r.match }] : []), ...(r.ifVendor ? [{ field: 'vendor', op: 'contains', value: r.ifVendor }] : [])]);
    const ord = (r) => (r.order !== null && r.order !== undefined && r.order !== '' && isFinite(Number(r.order)) ? Number(r.order) : Date.parse(r.createdAt) || 0);
    const groupsOf = (r) => (Array.isArray(r.groups) && r.groups.some((g) => Array.isArray(g) && g.length) ? r.groups.filter((g) => Array.isArray(g) && g.length) : [condsOf(r)].filter((g) => g.length));
    const rules = (ruleRows || []).map((r) => ({ ...r, _g: groupsOf(r) })).filter((r) => r._g.length).sort((a, b) => ord(a) - ord(b));
    for (const t of out) {
      const base = { description: String(t.description || '').toLowerCase(), vendor: String(t.vendor || '').toLowerCase(), category: String(t.category || '').toLowerCase(), type: String(t.type || '').toLowerCase(), amount: Math.abs(Number(t.amount) || 0) };
      t.ov = t.vendor; t.oc = t.category; t.ot = t.type; // values before rules, for the rule preview
      for (const r of rules) {
        if (r.book && r.book !== t.book) continue;
        const test = (c) => { if (c.field === 'amount') { const v = Number(c.value), a = base.amount; return c.op === 'lt' ? a < v : c.op === 'gt' ? a > v : c.op === 'gte' ? a >= v : Math.abs(a - v) < 0.005; } const v = String(c.value || '').toLowerCase(), have = base[c.field] ?? ''; return c.op === 'is' ? have === v : have.includes(v); };
        if (!r._g.some((g) => g.every(test))) continue;
        if (r.vendor) t.vendor = r.vendor;
        if (r.category) t.category = r.category;
        if (r.type) t.type = r.type;
        if (r.oneTime !== undefined && r.oneTime !== null && r.oneTime !== '') t.oneTime = !!r.oneTime;
        if (r.ignore) t.ignored = true;
        if (r.tag) t.tags = [...new Set([...(t.tags || []), r.tag])];
        if (r.biz !== undefined && r.biz !== null) { t.biz = r.biz; t.bizPct = r.bizPct || 100; t.schedC = r.schedC || ''; }
        t.rule = (r._g.find((g) => g.every(test)) || r._g[0]).map((c) => `${c.field} ${({ is: 'is', lt: 'under', gt: 'over', gte: 'at least', eq: 'equals' })[c.op] || 'contains'} “${c.value}”`).join(' and ');
      }
    }
    // Your edits to single transactions: the newest edit for each one wins.
    const edits = {};
    for (const e of editRows || []) if (e.txKey && (!edits[e.txKey] || String(e.createdAt) > String(edits[e.txKey].createdAt))) edits[e.txKey] = e;
    const final = [];
    for (const t of out) {
      const e = edits[t.key];
      if (!e) { final.push(t); continue; }
      const base = { ...t, edited: true };
      if (e.ignored) { final.push({ ...t, edited: true, ignored: true }); continue; }
      base.ignored = false;
      if (e.vendor) base.vendor = e.vendor;
      if (e.category) base.category = e.category;
      if (e.type) base.type = e.type;
      if (Array.isArray(e.tags)) base.tags = e.tags.filter(Boolean);
      if (e.note != null) base.note = String(e.note);
      if (e.biz !== undefined && e.biz !== null) { base.biz = e.biz; base.bizPct = e.bizPct || 100; base.schedC = e.schedC || ''; }
      if (e.oneTime !== undefined && e.oneTime !== null) base.oneTime = !!e.oneTime;
      let splits = e.splits;
      if (typeof splits === 'string') { try { splits = JSON.parse(splits); } catch { splits = null; } }
      splits = (splits || []).filter((s) => s && s.category && isFinite(Number(s.amount)) && Number(s.amount) !== 0);
      if (splits.length >= 2) {
        splits.forEach((s, n) => final.push({ ...base, key: `${t.key}#${n + 1}`, splitOf: t.key, category: s.category, amount: Math.round(Number(s.amount) * 100) / 100 }));
      } else final.push(base);
    }
    return final;
  },
});

dash.calc('txns', {
  title: 'All transactions, cleaned',
  description: 'Every transaction from all_txns except the ones you ignored (one at a time or with an ignore rule). Every total on the page is built from this list.',
  inputs: ['all_txns'],
  fn: (all) => (all || []).filter((t) => !t.ignored),
});

dash.calc('ignored_txns', {
  title: 'Ignored transactions',
  description: 'Transactions you ignored, or that an ignore rule matches. They are left out of every total and can be restored.',
  inputs: ['all_txns'],
  fn: (all) => (all || []).filter((t) => t.ignored).sort((a, b) => String(b.date).localeCompare(String(a.date))),
});

dash.calc('period', {
  title: 'Months in the chosen range',
  description: 'The months covered by the range picked at the top of the page (for example the last 6 months, this year or a custom range), counted back from the latest month that has any transaction.',
  inputs: ['txns'],
  fn: (txns) => {
    const p = dash.params();
    const months = [...new Set((txns || []).map((r) => r.month).filter(Boolean))].sort();
    if (!months.length) return [];
    const last = months[months.length - 1], first = months[0];
    const add = (m, n) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 7); };
    const range = p.range || '6m';
    let from, to = last;
    if (/^\d+m$/.test(range)) from = add(last, 1 - parseInt(range, 10));
    else if (range === 'ytd') from = last.slice(0, 4) + '-01';
    else if (range === 'lastyear') { const y = Number(last.slice(0, 4)) - 1; from = `${y}-01`; to = `${y}-12`; }
    else if (range === 'all') from = first;
    else if (range === 'custom') {
      const ok = (m) => /^\d{4}-\d{2}$/.test(m || '');
      from = ok(p.from) ? p.from : add(last, -5); to = ok(p.to) ? p.to : last;
      if (from > to) [from, to] = [to, from];
    } else from = add(last, -5);
    const rows = [];
    for (let m = from, i = 0; m <= to && i < 240; m = add(m, 1), i++) rows.push({ i, month: m });
    const multiYear = rows.length && rows[0].month.slice(0, 4) !== rows[rows.length - 1].month.slice(0, 4);
    return rows.map((r) => {
      const d = new Date(r.month + '-01T00:00:00Z');
      const mon = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
      return { ...r, label: multiYear ? `${mon} '${r.month.slice(2, 4)}` : mon };
    });
  },
});

dash.calc('prev_period', {
  title: 'Months in the previous period',
  description: 'The same number of months immediately before the chosen range, used for “vs previous period” comparisons.',
  inputs: ['period'],
  fn: (period) => {
    if (!period || !period.length) return [];
    const add = (m, n) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 7); };
    const n = period.length;
    return period.map((r, i) => ({ i, month: add(r.month, -n) }));
  },
});

dash.calc('monthly', {
  title: 'Income and spending by month',
  description: 'Per book and month in the range: income, everyday spending (excluding one-time items such as the home purchase), the one-time amount and net.',
  inputs: ['txns', 'period'],
  fn: (txns, period) => {
    const rows = [];
    for (const book of ['Personal', 'Shared']) {
      for (const mo of period || []) {
        const t = (txns || []).filter((r) => r.book === book && r.month === mo.month);
        const sum = (f) => Math.round(t.filter(f).reduce((s, r) => s + r.amount, 0) * 100) / 100;
        const income = sum((r) => r.type === 'income');
        const spend = sum((r) => r.type === 'expense' && !r.oneTime);
        const oneTime = sum((r) => r.type === 'expense' && r.oneTime);
        rows.push({ key: `${book}|${mo.month}`, book, month: mo.month, label: mo.label, i: mo.i, income, spend, oneTime,
          net: Math.round((income - spend - oneTime) * 100) / 100 });
      }
    }
    return rows;
  },
});

dash.calc('summary', {
  title: 'Totals for the range vs the previous period',
  description: 'Per book: spending, income and net over the chosen range, the average per month, and the same totals for the previous period of equal length (blank where that period has no data).',
  inputs: ['txns', 'period', 'prev_period'],
  fn: (txns, period, prev) => {
    const cur = new Set((period || []).map((m) => m.month)), old = new Set((prev || []).map((m) => m.month));
    const r2 = (x) => Math.round(x * 100) / 100;
    const rows = [];
    for (const book of ['Personal', 'Shared']) {
      const t = (txns || []).filter((r) => r.book === book);
      const tot = (set, f) => r2(t.filter((r) => set.has(r.month) && f(r)).reduce((s, r) => s + r.amount, 0));
      const spend = tot(cur, (r) => r.type === 'expense' && !r.oneTime), income = tot(cur, (r) => r.type === 'income');
      const oneTime = tot(cur, (r) => r.type === 'expense' && r.oneTime);
      const hasPrev = t.some((r) => old.has(r.month));
      const prevSpend = hasPrev ? tot(old, (r) => r.type === 'expense' && !r.oneTime) : null;
      const prevIncome = hasPrev ? tot(old, (r) => r.type === 'income') : null;
      const n = (period || []).length || 1;
      rows.push({ key: book, book, months: n, spend, income, oneTime, net: r2(income - spend - oneTime), avgSpend: r2(spend / n), avgIncome: r2(income / n),
        prevSpend, prevIncome, spendChange: hasPrev ? r2(spend - prevSpend) : null, incomeChange: hasPrev ? r2(income - prevIncome) : null,
        spendChangePct: hasPrev && prevSpend ? Math.round(((spend - prevSpend) / prevSpend) * 1000) / 10 : null });
    }
    return rows;
  },
});

dash.calc('vendors', {
  title: 'Spending by vendor in the range',
  description: 'Spending per cleaned vendor name over the chosen range: total, average per month, share of the book’s vendor spending, a month-by-month series, and how much fell in each category. Mortgage, rent, loan payments, transfers and one-time items are left out so day-to-day vendors can be compared.',
  inputs: ['txns', 'period'],
  fn: (txns, period) => {
    const idx = Object.fromEntries((period || []).map((m) => [m.month, m.i]));
    const n = (period || []).length || 1;
    const SKIP = new Set(['Rent / Mortgage', 'Debt', 'Transfer']);
    const SKIP_VENDOR = new Set(['Transfers']);
    const by = {}, bookTotal = {};
    for (const r of txns || []) {
      if (r.type !== 'expense' || r.oneTime || SKIP.has(r.category) || SKIP_VENDOR.has(r.vendor) || !(r.month in idx)) continue;
      const k = `${r.book}|${r.vendor}`;
      const o = (by[k] = by[k] || { key: k, book: r.book, vendor: r.vendor, series: new Array(n).fill(0), total: 0, count: 0, cats: {} });
      o.series[idx[r.month]] += r.amount; o.total += r.amount; o.count += 1;
      o.cats[r.category] = (o.cats[r.category] || 0) + r.amount;
      bookTotal[r.book] = (bookTotal[r.book] || 0) + r.amount;
    }
    const r2 = (x) => Math.round(x * 100) / 100;
    const rows = Object.values(by).map((o) => ({ key: o.key, book: o.book, vendor: o.vendor, total: r2(o.total), avg: r2(o.total / n), count: o.count,
      share: bookTotal[o.book] ? Math.round((o.total / bookTotal[o.book]) * 1000) / 10 : 0, series: o.series.map(r2), categories: Object.keys(o.cats),
      byCategory: Object.fromEntries(Object.entries(o.cats).map(([c, v]) => [c, r2(v)])) }));
    rows.sort((a, b) => b.total - a.total);
    const rank = {};
    for (const r of rows) r.rank = rank[r.book] = (rank[r.book] || 0) + 1;
    return rows;
  },
});

dash.calc('cat_trend', {
  title: 'Spending by category in the range',
  description: 'Per book and category: total over the chosen range, the previous period’s total and the change, share of spending, and a month-by-month series. One-time items and transfers are left out.',
  inputs: ['txns', 'period', 'prev_period'],
  fn: (txns, period, prev) => {
    const idx = Object.fromEntries((period || []).map((m) => [m.month, m.i]));
    const old = new Set((prev || []).map((m) => m.month));
    const n = (period || []).length || 1;
    const by = {}, bookTotal = {}, hasPrev = {};
    for (const r of txns || []) {
      if (r.type !== 'expense' || r.oneTime) continue;
      const inCur = r.month in idx, inOld = old.has(r.month);
      if (!inCur && !inOld) continue;
      const k = `${r.book}|${r.category}`;
      const o = (by[k] = by[k] || { key: k, book: r.book, category: r.category, series: new Array(n).fill(0), total: 0, prevTotal: 0 });
      if (inCur) { o.series[idx[r.month]] += r.amount; o.total += r.amount; bookTotal[r.book] = (bookTotal[r.book] || 0) + r.amount; }
      else { o.prevTotal += r.amount; hasPrev[r.book] = true; }
    }
    const r2 = (x) => Math.round(x * 100) / 100;
    return Object.values(by).map((o) => ({ key: o.key, book: o.book, category: o.category, total: r2(o.total), avg: r2(o.total / n),
      prevTotal: hasPrev[o.book] ? r2(o.prevTotal) : null, change: hasPrev[o.book] ? r2(o.total - o.prevTotal) : null,
      share: bookTotal[o.book] ? Math.round((o.total / bookTotal[o.book]) * 1000) / 10 : 0, series: o.series.map(r2) }))
      .filter((o) => o.total || o.prevTotal).sort((a, b) => b.total - a.total);
  },
});

dash.calc('categories', {
  title: 'Budget vs actual by category',
  description: 'Per book, month and category: spending, the planned amount (your in-app budget where one is set for that month or earlier, otherwise the sheet’s plan), money rolled over from earlier months for categories set to roll over, and for the current month a projection from the pace so far.',
  inputs: ['txns', 'sheet_budgets', 'budgets', 'period', 'prefs'],
  fn: (txns, sheetBudgets, budgets, period, prefs) => {
    // Mortgage payments usually look like transfers (money moving to the loan), so they'd be left out of budgets.
    // Count them under "Mortgage" unless the dashboard's settings hide "b-mtg": payments from a bank account
    // categorized Mortgage first; if a month has none, the payments shown on an imported mortgage statement.
    const noMtg = {};
    for (const p of [...(prefs || [])].filter((p) => p.key === 'settings').sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))) { try { const v = JSON.parse(p.value) || {}; noMtg[p.book] = (v.hideParts || []).includes('b-mtg'); } catch (e) {} }
    const add = (m, n) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 7); };
    const r2 = (x) => Math.round(x * 100) / 100;
    const rows = [];
    const now = new Date();
    const thisMonth = now.toISOString().slice(0, 7);
    const dim = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
    const elapsed = Math.min(1, now.getUTCDate() / dim);
    for (const book of ['Personal', 'Shared']) {
      const sheetMonths = [...new Set((sheetBudgets || []).filter((b) => b.book === book).map((b) => b.month))].sort();
      const sheetPlan = (m) => {
        const pm = sheetMonths.filter((x) => x <= m).pop() || sheetMonths[sheetMonths.length - 1];
        const o = {};
        for (const b of sheetBudgets || []) if (b.book === book && b.month === pm) o[b.category] = Number(b.planned);
        return o;
      };
      const mine = (budgets || []).filter((b) => b.book === book && b.category && /^\d{4}-\d{2}$/.test(b.from || ''))
        .sort((a, b) => (a.from === b.from ? String(a.createdAt).localeCompare(String(b.createdAt)) : a.from.localeCompare(b.from)));
      const planFor = (m) => {
        const o = sheetPlan(m), roll = {}, since = {};
        for (const b of mine) if (b.from <= m) { o[b.category] = Number(b.amount) || 0; roll[b.category] = !!b.rollover; since[b.category] = b.from; }
        return { plan: o, roll, since };
      };
      const actualFor = (m) => {
        const a = {};
        const put = (c, v) => { a[c] = (a[c] || 0) + v; a['#' + c] = (a['#' + c] || 0) + 1; };
        let bankMtg = false; const stmtMtg = [];
        for (const r of txns || []) {
          if (r.book !== book || r.month !== m || r.oneTime) continue;
          if (r.type === 'expense') { put(r.category, r.amount); if (r.category === 'Mortgage') bankMtg = true; continue; }
          if (r.type !== 'transfer' || noMtg[book]) continue;
          if (r.acctKind === 'mortgage') { if (Number(r.amount) < 0) stmtMtg.push(-Number(r.amount)); }
          else if (r.acctKind !== 'credit' && Number(r.amount) > 0 && (r.category === 'Mortgage' || /mortgage|mtg pmt|loan servic/i.test(r.description || ''))) { put('Mortgage', r.amount); bankMtg = true; }
        }
        if (!bankMtg && !noMtg[book]) for (const v of stmtMtg) put('Mortgage', v);
        return a;
      };
      for (const mo of period || []) {
        const { plan, roll, since } = planFor(mo.month);
        const act = actualFor(mo.month);
        for (const c of new Set([...Object.keys(plan), ...Object.keys(act)])) {
          if (c === 'Transfer' || c[0] === '#') continue;
          let carry = 0;
          if (roll[c]) { // leftover (or overspend) from each earlier month since this budget started
            for (let m = since[c]; m < mo.month; m = add(m, 1)) { const p = planFor(m).plan[c] || 0; carry += p - (actualFor(m)[c] || 0); }
          }
          const actual = r2(act[c] || 0), planned = plan[c] || 0;
          const isNow = mo.month === thisMonth;
          rows.push({ key: `${book}|${mo.month}|${c}`, book, month: mo.month, category: c, actual, planned, rollover: !!roll[c], carry: r2(carry),
            available: r2(planned + carry), left: r2(planned + carry - actual),
            projected: isNow && elapsed > 0 ? r2((act['#' + c] || 0) <= 1 && actual >= planned * 0.5 && actual > 0 ? actual : actual / elapsed) : null, // a single bill that already covers most of its budget (mortgage, utilities) is treated as paid, not extrapolated
            elapsed: isNow ? Math.round(elapsed * 1000) / 1000 : null });
        }
      }
    }
    return rows;
  },
});

dash.calc('budget_totals', {
  title: 'Budget totals for the latest month',
  description: 'Per book, for the latest month in the range: total available across categories with a plan, total spent in those categories, the month-end projection at the current pace, and how far through the month it is.',
  inputs: ['categories', 'period'],
  fn: (cats, period) => {
    const last = (period || [])[period.length - 1];
    if (!last) return [];
    const r2 = (x) => Math.round(x * 100) / 100;
    return ['Personal', 'Shared'].map((book) => {
      const c = (cats || []).filter((r) => r.book === book && r.month === last.month && r.available > 0);
      const spent = r2(c.reduce((s, r) => s + r.actual, 0)), avail = r2(c.reduce((s, r) => s + r.available, 0));
      const proj = c.some((r) => r.projected !== null) ? r2(c.reduce((s, r) => s + (r.projected ?? r.actual), 0)) : null;
      return { key: book, book, month: last.month, label: last.label, available: avail, spent, projected: proj, categories: c.length,
        elapsed: c.length && c[0].elapsed !== null ? c[0].elapsed : null, usedPct: avail ? Math.round((spent / avail) * 1000) / 10 : null };
    });
  },
});

dash.calc('subs', {
  title: 'Subscriptions and recurring bills',
  description: 'Subscriptions: anything in the Subscriptions category or from a known streaming/software service. Recurring bills: any other vendor charged in at least 3 of the last 12 months at nearly the same amount (within 20% of its usual charge). Amounts are for the chosen range; the yearly cost is the latest charge × 12 for monthly charges.',
  inputs: ['txns', 'period', 'prefs'],
  fn: (txns, period, prefs) => {
    const add = (m, n) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 7); };
    // vendors the user marked "Not recurring" (per dashboard, saved setting 'notRecurring' = JSON list of vendor names)
    const notRec = {};
    for (const p of [...(prefs || [])].filter((p) => p.key === 'notRecurring').sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))) { try { notRec[p.book] = new Set((JSON.parse(p.value) || []).map((v) => String(v).toLowerCase())); } catch (e) {} }
    const KNOWN = /YouTube TV|HBO Max|Spotify|Netflix|Paramount\+|Google TV|Google Pixel|NBA League Pass|Prime Video|Hulu|Disney\+|Peacock|Apple|Audible|ChatGPT|Claude|GitHub|Microsoft|PlayStation/;
    const all = (txns || []).filter((r) => r.type === 'expense' && !r.oneTime);
    const lastAll = all.reduce((m, r) => (r.month > m ? r.month : m), '');
    if (!lastAll) return [];
    const yearAgo = add(lastAll, -11);
    const idx = Object.fromEntries((period || []).map((m) => [m.month, m.i]));
    const n = (period || []).length || 1;
    const by = {};
    for (const r of all) {
      const k = `${r.book}|${r.vendor}`;
      const o = (by[k] = by[k] || { book: r.book, vendor: r.vendor, sub: false, cat: r.category, recent: {}, series: new Array(n).fill(0), lastDate: '', last: 0 });
      if (r.month >= yearAgo) o.recent[r.month] = (o.recent[r.month] || 0) + r.amount;
      if (r.month in idx) o.series[idx[r.month]] += r.amount;
      if (String(r.date) >= o.lastDate) { o.lastDate = String(r.date); o.last = r.amount; }
      if (r.category === 'Subscriptions' || KNOWN.test(r.vendor)) o.sub = true;
    }
    const r2 = (x) => Math.round(x * 100) / 100;
    const rows = [];
    for (const o of Object.values(by)) {
      const paid = Object.values(o.recent).filter((x) => x > 0);
      let kind = null;
      if (o.sub) kind = 'Subscription';
      else if (paid.length >= 3 && !['Groceries', 'Dining', 'Travel', 'Hobbies', 'Gifts', 'Home Improvement'].includes(o.cat)) {
        const med = [...paid].sort((a, b) => a - b)[Math.floor(paid.length / 2)];
        if (paid.filter((x) => Math.abs(x - med) <= med * 0.2).length >= 3) kind = 'Recurring bill';
      }
      if (!kind || (notRec[o.book] && notRec[o.book].has(String(o.vendor).toLowerCase()))) continue;
      const total = o.series.reduce((s, x) => s + x, 0);
      if (!total && o.lastDate.slice(0, 7) < (period[0] || {}).month) continue;
      const monthly = paid.length >= 3;
      rows.push({ key: `${o.book}|${o.vendor}`, book: o.book, vendor: o.vendor, kind, total: r2(total), avg: r2(total / n), months: o.series.filter((x) => x > 0).length,
        lastCharge: r2(o.last), lastDate: o.lastDate, yearly: r2(monthly ? o.last * 12 : paid.reduce((s, x) => s + x, 0)), series: o.series.map(r2) });
    }
    rows.sort((a, b) => a.kind.localeCompare(b.kind) || b.yearly - a.yearly);
    return rows;
  },
});

dash.calc('subs_totals', {
  title: 'Subscription totals',
  description: 'Per book and kind: average per month over the chosen range, the estimated yearly cost, and how many were charged in the latest month of the range.',
  inputs: ['subs', 'period'],
  fn: (subs, period) => {
    const n = (period || []).length;
    const rows = [];
    for (const book of ['Personal', 'Shared']) for (const kind of ['Subscription', 'Recurring bill']) {
      const s = (subs || []).filter((r) => r.book === book && r.kind === kind);
      const t = (f) => Math.round(s.reduce((a, r) => a + r[f], 0) * 100) / 100;
      rows.push({ key: `${book}|${kind}`, book, kind, avg: t('avg'), yearly: t('yearly'), latest: Math.round(s.reduce((a, r) => a + (n ? r.series[n - 1] : 0), 0) * 100) / 100,
        countLatest: s.filter((r) => n && r.series[n - 1] > 0).length });
    }
    return rows;
  },
});

dash.calc('balances', {
  title: 'Account balances by month',
  description: 'Month-end balances from the sheets, plus statement balances recorded on this page, for the months in the chosen range. For a book, kind of account and month that has any recorded statement balance, the statements replace the sheet figure.',
  inputs: ['sheet_balances', 'imports', 'period', 'accounts'],
  fn: (sheet, importBatches, period, accts) => {
    // One identity per account: names match ignoring capitals and an "Owner – " prefix, and names merged into an account (aliases) count as it.
    const nk = (s) => String(s || '').trim().toLowerCase().replace(/^[^–]+ – /, '');
    // Looser key for "removed" markers: also ignores an owner in brackets at the end ("… (Nate)") and punctuation,
    // so a deleted account stays deleted whichever way its name was written in the sheet or a statement.
    const gk = (s) => nk(s).replace(/\s*\([^)]*\)\s*$/, '').replace(/[^a-z0-9]+/g, ' ').trim();
    const alias = {}, goneK = new Set(), live = new Set();
    for (const a of accts || []) for (const n of [a.name, a.match, ...(Array.isArray(a.aliases) ? a.aliases : [])]) if (n) { if (a.removed) goneK.add(`${a.book}|${gk(n)}`); else { alias[`${a.book}|${nk(n)}`] = a.name; live.add(`${a.book}|${gk(n)}`); } }
    // An account you add again under the same name wins over an old "removed" marker.
    const isGone = (book, n) => goneK.has(`${book}|${gk(n)}`) && !live.has(`${book}|${gk(n)}`);
    const canon = (book, n) => alias[`${book}|${nk(n)}`] || String(n || '').replace(/^[^–]+ – /, '') || 'Account';
    importBatches = (importBatches || []).filter((b) => !isGone(b.book, b.accountName)).map((b) => ({ ...b, accountName: canon(b.book, b.accountName) }));
    sheet = (sheet || []).filter((r) => !isGone(r.book, r.account)).map((r) => ({ ...r, account: canon(r.book, r.account) }));
    const inWin = new Set((period || []).map((m) => m.month));
    const latest = {};
    for (const b of importBatches || []) {
      const v = Number(b.balance);
      if (b.balance === null || b.balance === undefined || b.balance === '' || !isFinite(v) || !b.balanceMonth) continue;
      const kind = b.accountKind === 'credit' ? 'credit' : b.accountKind;
      const k = `${b.book}|${kind}|${nk(b.accountName)}|${b.balanceMonth}`;
      if (!latest[k] || String(b.importedAt) > String(latest[k].at)) latest[k] = { at: b.importedAt, row: { book: b.book, kind, account: b.accountName || 'Account', owner: b.owner || '', month: b.balanceMonth, balance: Math.abs(v), estimate: false, source: 'Statement' } };
    }
    const imp = Object.values(latest).map((x) => x.row);
    // Checking, savings and credit cards: roll the most recent recorded balance forward (and back) with the imported transactions.
    const norm = nk;
    const anchors = {};
    for (const b of importBatches || []) {
      const v = Number(b.balance);
      if (!['deposit', 'credit'].includes(b.accountKind) || b.balance === null || b.balance === undefined || b.balance === '' || !isFinite(v)) continue;
      const asOf = /^\d{4}-\d{2}-\d{2}$/.test(b.asOf || '') ? b.asOf : b.balanceMonth ? b.balanceMonth + '-31' : null;
      if (!asOf) continue;
      const k = `${b.book}|${b.accountKind}|${norm(b.accountName)}`;
      if (!anchors[k] || asOf > anchors[k].asOf || (asOf === anchors[k].asOf && String(b.importedAt) > String(anchors[k].at)))
        anchors[k] = { asOf, at: b.importedAt, bal: Math.abs(v), book: b.book, kind: b.accountKind, account: b.accountName || 'Account', owner: b.owner || '' };
    }
    const flows = {}; const seenT = new Set();
    for (const b of importBatches || []) {
      let l = b.txns; if (typeof l === 'string') { try { l = JSON.parse(l); } catch { l = []; } }
      const k = `${b.book}|${b.accountKind}|${norm(b.accountName)}`;
      for (const t of l || []) {
        const amt = Number(t.amount); if (!t.date || !isFinite(amt)) continue;
        const d = `${k}|${t.date}|${amt}|${t.description}`; if (seenT.has(d)) continue; seenT.add(d);
        (flows[k] = flows[k] || []).push({ date: String(t.date), amt });
      }
    }
    const today = new Date().toISOString().slice(0, 10);
    const calc = [];
    for (const [k, a] of Object.entries(anchors)) {
      const f = flows[k] || [];
      for (const mo of period || []) {
        if (mo.month < a.asOf.slice(0, 7)) continue; // earlier months keep their own figures
        const end = mo.month + '-31' < today ? mo.month + '-31' : today;
        // deposit: purchases (positive) lower the balance; card: purchases raise the amount owed
        const sign = a.kind === 'credit' ? 1 : -1;
        let bal = a.bal;
        for (const x of f) {
          if (end >= a.asOf && x.date > a.asOf && x.date <= end) bal += sign * x.amt;
          if (end < a.asOf && x.date > end && x.date <= a.asOf) bal -= sign * x.amt;
        }
        calc.push({ book: a.book, kind: a.kind, account: a.account, owner: a.owner, month: mo.month, balance: Math.round(bal * 100) / 100, estimate: false,
          source: end === a.asOf ? 'Recorded balance' : `Calculated from ${a.asOf} balance` });
      }
    }
    const calcKeys = new Set(calc.map((r) => `${r.book}|${r.kind}|${norm(r.account)}|${r.month}`));
    imp.splice(0, imp.length, ...imp.filter((r) => !calcKeys.has(`${r.book}|${r.kind}|${norm(r.account)}|${r.month}`)), ...calc);
    // A recorded balance replaces the sheet figure for the same account and month (for checking & savings, the sheet's one combined figure).
    const ck = (r) => (r.kind === 'deposit' ? `${r.book}|deposit|${r.month}` : `${r.book}|${r.kind}|${nk(r.account)}|${r.month}`);
    const covered = new Set(imp.map(ck));
    const rows = [];
    for (const r of sheet || []) if (!covered.has(ck(r))) rows.push({ book: r.book, kind: r.kind, account: r.account, owner: r.owner || '', month: r.month, balance: Number(r.balance), estimate: !!r.estimate, source: 'Google Sheets' });
    rows.push(...imp);
    return rows.filter((r) => inWin.has(r.month)).map((r) => ({ key: `${r.book}|${r.kind}|${r.account}|${r.month}`, ...r, label: r.account }));
  },
});

dash.calc('balance_totals', {
  title: 'Balance totals',
  description: 'Per book, kind of account and month in the range: the sum of the account balances, and the change from the month before, counting only accounts reported in both months.',
  inputs: ['balances', 'period'],
  fn: (bal, period) => {
    const rows = [];
    for (const book of ['Personal', 'Shared']) for (const kind of ['deposit', 'investment', 'mortgage', 'loan', 'credit']) {
      const series = [];
      for (const mo of period || []) {
        const b = (bal || []).filter((r) => r.book === book && r.kind === kind && r.month === mo.month);
        if (b.length) series.push({ month: mo.month, label: mo.label, total: Math.round(b.reduce((s, r) => s + r.balance, 0) * 100) / 100, accounts: b.length,
          by: Object.fromEntries(b.map((r) => [r.label, r.balance])) });
      }
      series.forEach((s, j) => {
        let change = null;
        if (j > 0) {
          const prev = series[j - 1].by;
          const both = Object.keys(s.by).filter((a) => a in prev);
          if (both.length) change = Math.round(both.reduce((t, a) => t + s.by[a] - prev[a], 0) * 100) / 100;
        }
        rows.push({ key: `${book}|${kind}|${s.month}`, book, kind, month: s.month, label: s.label, total: s.total, accounts: s.accounts,
          latest: j === series.length - 1, change, prevLabel: j > 0 ? series[j - 1].label : '' });
      });
    }
    return rows;
  },
});

// ---- Custom reports: one spec → grouped totals, plus a month-by-month series for each group ----
// spec = { measure: spend|income|net|count|avg|balance, by: category|vendor|account|tag|month|weekday|none,
//          filter: { categories: [], accounts: [], text: '', min: number|null }, top: n }
// months: the months to include ('YYYY-MM'). Works in cents. Transfers never count as spending or income.
const CR_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function customReport(spec, txns, balances, months, book) {
  const s = spec || {}, f = s.filter || {}, inM = new Set(months || []), c = (x) => Math.round(Number(x) * 100);
  const lc = (x) => String(x || '').trim().toLowerCase();
  const cats = new Set((f.categories || []).map(lc).filter(Boolean)), accts = new Set((f.accounts || []).map(lc).filter(Boolean)), text = lc(f.text), min = f.min == null || f.min === '' ? null : c(f.min);
  const groups = new Map(); const g = (key) => { if (!groups.has(key)) groups.set(key, { key, value: 0, n: 0, inc: 0, exp: 0, byMonth: {} }); return groups.get(key); };
  if (s.measure === 'balance') {
    const rowsB = (balances || []).filter((r) => r.book === book && inM.has(r.month) && (!accts.size || accts.has(lc(r.label)) || accts.has(lc(r.account))) && (!text || lc(r.label).includes(text)));
    const last = [...new Set(rowsB.map((r) => r.month))].sort().pop();
    for (const r of rowsB) { const key = s.by === 'account' ? r.label || r.account : s.by === 'month' ? r.month : s.by === 'kind' ? r.kind : 'Total';
      const x = g(key); x.byMonth[r.month] = (x.byMonth[r.month] || 0) + c(r.balance); if (r.month === last && s.by !== 'month') x.value += c(r.balance); }
    if (s.by === 'month') for (const x of groups.values()) x.value = x.byMonth[x.key] || 0;
  } else {
    const want = s.measure === 'income' ? ['income'] : s.measure === 'net' ? ['income', 'expense'] : ['expense'];
    for (const t of txns || []) {
      if (t.book !== book || !inM.has(t.month) || !want.includes(t.type)) continue;
      if (cats.size && !cats.has(lc(t.category || 'Uncategorized'))) continue;
      if (accts.size && !accts.has(lc(t.source))) continue;
      if (text && !(lc(t.vendor).includes(text) || lc(t.description).includes(text))) continue;
      const a = c(t.amount); if (min != null && Math.abs(a) < min) continue;
      const keys = s.by === 'category' ? [t.category || 'Uncategorized'] : s.by === 'vendor' ? [t.vendor || t.description || 'Unknown'] : s.by === 'account' ? [t.source || 'Unknown'] : s.by === 'tag' ? (t.tags && t.tags.length ? t.tags : []) : s.by === 'month' ? [t.month] : s.by === 'weekday' ? [CR_DAYS[new Date(String(t.date).slice(0, 10) + 'T12:00:00Z').getUTCDay()] || 'Unknown'] : ['Total'];
      for (const k of keys) { const x = g(k); x.n++; if (t.type === 'income') x.inc += Math.abs(a); else x.exp += Math.abs(a);
        const v = s.measure === 'count' ? 100 : t.type === 'income' ? Math.abs(a) : s.measure === 'net' ? -Math.abs(a) : Math.abs(a); x.byMonth[t.month] = (x.byMonth[t.month] || 0) + v; }
    }
    for (const x of groups.values()) x.value = s.measure === 'count' ? x.n * 100 : s.measure === 'avg' ? (x.n ? Math.round(x.exp / x.n) : 0) : s.measure === 'net' ? x.inc - x.exp : s.measure === 'income' ? x.inc : x.exp;
  }
  let list = [...groups.values()];
  const ORDER = s.by === 'month' ? (a, b) => (a.key < b.key ? -1 : 1) : s.by === 'weekday' ? (a, b) => CR_DAYS.indexOf(a.key) - CR_DAYS.indexOf(b.key) : (a, b) => Math.abs(b.value) - Math.abs(a.value);
  list.sort(ORDER);
  const top = Math.max(1, Math.min(50, Number(s.top) || 10)), all = list.length;
  let other = null;
  if (!['month', 'weekday', 'none'].includes(s.by) && list.length > top) { const rest = list.slice(top); list = list.slice(0, top);
    if (!['count', 'avg', 'balance'].includes(s.measure)) other = { key: `Everything else (${rest.length})`, value: rest.reduce((t, x) => t + x.value, 0), byMonth: {} }; }
  const out = (x) => ({ key: x.key, value: x.value / 100, n: x.n || 0, byMonth: Object.fromEntries((months || []).map((m) => [m, (x.byMonth[m] || 0) / 100])) });
  const totalC = s.measure === 'avg' ? (() => { const e = [...groups.values()].reduce((t, x) => t + x.exp, 0), n = [...groups.values()].reduce((t, x) => t + x.n, 0); return n ? Math.round(e / n) : 0; })()
    : s.measure === 'balance' && s.by === 'month' ? (list.length ? list[list.length - 1].value : 0) : [...groups.values()].reduce((t, x) => t + x.value, 0);
  return { groups: list.map(out), other: other && out(other), total: totalC / 100, count: all, months: months || [] };
}
if (typeof window !== 'undefined') window.FDCustom = customReport;

// ---- Personal business (sole proprietor, IRS Schedule C) ----
// Transactions marked with a business (t.biz) count toward it at t.bizPct percent. Expense lines follow Schedule C Part II.
const SCHED_C = [['8', 'Advertising'], ['9', 'Car and truck expenses'], ['10', 'Commissions and fees'], ['11', 'Contract labor'], ['13', 'Depreciation'],
  ['15', 'Insurance (other than health)'], ['16b', 'Interest (other than mortgage)'], ['17', 'Legal and professional services'], ['18', 'Office expense'],
  ['20a', 'Rent: vehicles and equipment'], ['20b', 'Rent: other business property'], ['21', 'Repairs and maintenance'], ['22', 'Supplies'], ['23', 'Taxes and licenses'],
  ['24a', 'Travel'], ['24b', 'Meals'], ['25', 'Utilities'], ['26', 'Wages'], ['27a', 'Other expenses'], ['cogs', 'Inventory and materials for resale (cost of goods sold)']];
const SCHED_GUESS = [[/advertis|marketing|promot/i, '8'], [/\b(gas|fuel|parking|tolls?|auto)\b|car wash/i, '9'], [/commission|merchant fee|paypal fee|stripe fee|etsy fee/i, '10'],
  [/contract|freelanc/i, '11'], [/insurance/i, '15'], [/interest/i, '16b'], [/legal|lawyer|attorney|accounting|bookkeep|tax prep|cpa/i, '17'],
  [/software|subscription|office|postage|shipping|stationery|printing/i, '18'], [/equipment rental/i, '20a'], [/\brent\b|cowork/i, '20b'], [/repair|maintenance/i, '21'],
  [/suppl|materials/i, '22'], [/license|permit|tax/i, '23'], [/travel|hotel|lodging|airfare|airline|flight|uber|lyft|taxi/i, '24a'],
  [/dining|restaurant|meal|coffee|food/i, '24b'], [/utilit|electric|internet|phone|mobile|wireless/i, '25'], [/payroll|wages/i, '26']];
const schedLine = (t) => t.schedC || (SCHED_GUESS.find(([re]) => re.test(`${t.category || ''} ${t.vendor || ''}`)) || [0, '27a'])[1];
// IRS business standard mileage rates (dollars per mile), by the date they start. 2026 changed mid-year.
const MILEAGE = [['2023-01-01', 0.655], ['2024-01-01', 0.67], ['2025-01-01', 0.70], ['2026-01-01', 0.725], ['2026-07-01', 0.76]];
const mileRate = (date) => { let r = MILEAGE[0][1]; for (const [d, v] of MILEAGE) if (String(date) >= d) r = v; return r; };
// Quarterly estimated tax: the months each payment covers and when it's due (moved past weekends).
function quarterDue(year, q) {
  const d = q === 4 ? new Date(Date.UTC(year + 1, 0, 15)) : new Date(Date.UTC(year, [3, 5, 8][q - 1], 15));
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
const Q_MONTHS = [[1, 3], [4, 5], [6, 8], [9, 12]];
// opts: { biz: name or '' for every business, year, receipts: Set of txKeys with a photo, trips: [{date, miles, biz}],
//         homeSqft, setAside (percent), receiptMin, accounts: { account name: business } (everything in them counts as that business unless marked personal),
//         inventory: { begin, end } (product sellers, Part III), carMethod: 'standard' | 'actual' | '', priorTax, highIncome, payments: [{ date, amount }] }
function businessSummary(txns, opts) {
  const o = opts || {}, year = String(o.year), c = (x) => Math.round(Number(x) * 100);
  const mine = (t) => t.biz && (!o.biz || t.biz === o.biz) && String(t.date || t.month || '').startsWith(year) && t.type !== 'transfer';
  const rec = o.receipts || new Set(), min = o.receiptMin == null ? 75 : Number(o.receiptMin);
  const lines = {}, months = {}, list = [], missing = [], acc = o.accounts || {};
  let inc = 0, exp = 0, meals = 0, cogsBuy = 0;
  for (const t0 of txns || []) {
    const t = t0.biz == null && acc[t0.source] ? { ...t0, biz: acc[t0.source], bizPct: 100, byAccount: true } : t0;
    if (!mine(t)) continue;
    const share = c(Math.abs(Number(t.amount) || 0) * (Number(t.bizPct) || 100) / 100), m = String(t.date || t.month).slice(0, 7);
    months[m] = months[m] || { inc: 0, exp: 0 };
    if (t.type === 'income') { inc += share; months[m].inc += share; list.push({ ...t, share: share / 100, line: 'income' }); continue; }
    const line = schedLine(t); lines[line] = lines[line] || { amount: 0, count: 0 }; lines[line].amount += share; lines[line].count++;
    if (line === 'cogs') cogsBuy += share; else { exp += share; if (line === '24b') meals += share; } months[m].exp += share;
    list.push({ ...t, share: share / 100, line });
    if (share >= c(min) && !rec.has(t.splitOf || t.key)) missing.push({ key: t.splitOf || t.key, date: t.date, vendor: t.vendor, amount: share / 100 });
  }
  const trips = (o.trips || []).filter((x) => String(x.date || '').startsWith(year) && (!o.biz || x.biz === o.biz));
  const miles = trips.reduce((s, x) => s + (Number(x.miles) || 0), 0), mileC = trips.reduce((s, x) => s + c((Number(x.miles) || 0) * mileRate(x.date)), 0);
  const sqft = Math.min(300, Math.max(0, Number(o.homeSqft) || 0)), homeC = sqft * 500; // simplified method: $5 a square foot, up to 300
  const mealsCut = Math.round(meals / 2); // meals are usually 50% deductible
  // car: with the standard mileage rate, actual car costs (line 9) don't count; with actual costs, the mileage rate doesn't
  const car = lines['9'] ? lines['9'].amount : 0, carOff = o.carMethod === 'standard' ? car : 0, mileUse = o.carMethod === 'actual' ? 0 : mileC;
  // cost of goods sold (Part III): inventory at the start + purchases − inventory at the end
  const inv = o.inventory || {}, cogsC = Math.max(0, c(Number(inv.begin) || 0) + cogsBuy - c(Number(inv.end) || 0));
  const deductC = exp - mealsCut - carOff + mileUse + homeC + cogsC, netC = inc - deductC, rate = Math.max(0, Number(o.setAside) || 0) / 100;
  for (const x of trips) { const m = String(x.date).slice(0, 7); months[m] = months[m] || { inc: 0, exp: 0 }; months[m].exp += c((Number(x.miles) || 0) * mileRate(x.date)); }
  const quarters = Q_MONTHS.map(([a, b], i) => {
    let p = 0; for (const [m, v] of Object.entries(months)) { const k = Number(m.slice(5)); if (k >= a && k <= b) p += v.inc - v.exp; }
    const share = Math.max(0, p);
    return { q: i + 1, due: quarterDue(Number(year), i + 1), profit: p / 100, estimate: Math.round(share * rate) / 100 };
  });
  // the home office deduction is yearly: spread it over the quarters' estimates evenly
  if (homeC && rate) quarters.forEach((q) => { q.estimate = Math.max(0, Math.round((q.estimate - (homeC / 400) * rate) * 100) / 100); });
  // payments already made, applied to the quarters in order; safe harbor from last year's tax (100%, or 110% at higher incomes)
  const paid = (o.payments || []).reduce((s0, x) => s0 + c(Number(x.amount) || 0), 0); // payments recorded for this tax year
  const harbor = o.priorTax ? Math.round(c(o.priorTax) * (o.highIncome ? 1.1 : 1)) / 100 : null;
  let left = paid; quarters.forEach((q) => { const need = harbor != null ? Math.min(q.estimate, harbor / 4) : q.estimate; q.need = Math.round(need * 100) / 100; const use = Math.min(left, c(need)); q.paid = use / 100; left -= use; q.owed = Math.max(0, Math.round((c(need) - use)) / 100); });
  return {
    paid: paid / 100, safeHarbor: harbor,
    income: inc / 100, expenses: exp / 100, mealsSpent: meals / 100, mealsDeductible: (meals - mealsCut) / 100, miles, mileage: mileC / 100, mileageCounted: mileUse / 100, carNotCounted: carOff / 100, homeOffice: homeC / 100,
    cogs: cogsC / 100, cogsPurchases: cogsBuy / 100, grossProfit: (inc - cogsC) / 100,
    deductions: deductC / 100, net: netC / 100, setAside: Math.round(Math.max(0, netC) * rate) / 100,
    lines: SCHED_C.filter(([k]) => lines[k]).map(([k, label]) => ({ code: k, label, amount: lines[k].amount / 100, count: lines[k].count })),
    months: Object.keys(months).sort().map((m) => ({ month: m, income: months[m].inc / 100, expenses: months[m].exp / 100, net: (months[m].inc - months[m].exp) / 100 })),
    quarters, missing: missing.sort((a, b) => b.amount - a.amount), list: list.sort((a, b) => String(b.date).localeCompare(String(a.date))), trips: trips.length,
  };
}
if (typeof window !== 'undefined') { window.FDBusiness = businessSummary; window.FDSchedC = SCHED_C; window.FDSchedLine = schedLine; window.FDMileRate = mileRate; }

// ---- Likely duplicates between bank sync and statements (or manual entries) ----
// The exact-match rule above can't catch these: banks word descriptions differently in their files and in sync, and a
// pending purchase often posts a day or two later. A pair: same dashboard and account, same kind and amount (to the cent),
// dates at most `days` apart, one copy from bank sync and the other from a statement or typed in by hand.
// origin(key) → 'sync' | 'file' | 'manual'; ok: Set of "keyA|keyB" pairs the user said aren't duplicates. Each transaction is used once.
function likelyDupes(txns, origin, opts) {
  const o = opts || {}, days = o.days == null ? 3 : o.days, ok = o.ok || new Set(), c = (x) => Math.round(Math.abs(Number(x)) * 100);
  const ms = (d) => Date.parse(String(d) + 'T00:00:00Z');
  const groups = new Map();
  for (const t of txns || []) {
    if (!t || !t.date || t.splitOf || t.ignored || t.type === 'transfer') continue;
    const src = origin(t.key); if (!src) continue;
    const g = `${t.book}|${String(t.source || '').toLowerCase()}|${t.type}|${c(t.amount)}`;
    if (!groups.has(g)) groups.set(g, []); groups.get(g).push({ t, src, at: ms(t.date) });
  }
  const pairs = [];
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const sync = list.filter((x) => x.src === 'sync').sort((a, b) => a.at - b.at), other = list.filter((x) => x.src !== 'sync').sort((a, b) => a.at - b.at), used = new Set();
    for (const s of sync) {
      let best = null;
      for (const f of other) { if (used.has(f.t.key)) continue; const gap = Math.abs(s.at - f.at) / 864e5; if (gap > days) continue;
        const k1 = `${s.t.key}|${f.t.key}`, k2 = `${f.t.key}|${s.t.key}`; if (ok.has(k1) || ok.has(k2)) continue;
        if (!best || gap < best.gap) best = { f, gap }; }
      if (best) { used.add(best.f.t.key); pairs.push({ sync: s.t, other: best.f.t, otherFrom: best.f.src, gap: Math.round(best.gap), id: `${s.t.key}|${best.f.t.key}` }); }
    }
  }
  return pairs.sort((a, b) => String(b.sync.date).localeCompare(String(a.sync.date)));
}
if (typeof window !== 'undefined') window.FDLikelyDupes = likelyDupes;
