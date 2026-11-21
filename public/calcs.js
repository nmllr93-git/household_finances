// Calculations behind every number on the page. Each one is shown in Sources.

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
      [/\bimon\b/i, 'ImOn'], [/midamerican/i, 'MidAmerican Energy'], [/city of\*?\s?iowa city/i, 'City of Iowa City'],
      [/animal clinic|^vet$/i, 'Animal Clinic'], [/petsmart/i, 'PetSmart'], [/big grove/i, 'Big Grove Brewery'],
      [/kinde?re?d coffee/i, 'Kindred Coffee'], [/bread worthy/i, 'Bread Worthy'], [/daydrink/i, 'DayDrink'],
      [/doordash/i, 'DoorDash'], [/\btrees\b/i, 'Trees'], [/^atm\b/i, 'ATM cash'], [/golf/i, 'Golf'],
      [/dollar.?general/i, 'Dollar General'], [/paper ?statement fee/i, 'Bank fees'], [/overage fee/i, 'Overage fees'],
      [/1800flowers|flowerama/i, '1-800-Flowers'], [/uihc|univ.*iowa.*hosp/i, 'UIHC'],
      [/wilson'?s (cider|orchard)/i, "Wilson's Orchard"], [/vacation transfer|personal transfer|^transfer\b/i, 'Transfers'],
    ];
    const CITIES = /\s+(iowa city|coralville|north liberty|cedar rapids|des moines|lawrenceburg|gatlinburg|cosby|lexington|chapel hill|black mountain|wendell|williamsburg|edwards|peoria|austin|newton)\b.*$/i;
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
    const seen = new Set();
    for (const b of importBatches || []) {
      let list = b.txns;
      if (typeof list === 'string') { try { list = JSON.parse(list); } catch { list = []; } }
      (list || []).forEach((t, j) => {
        const amt = Number(t.amount);
        if (!t.date || !isFinite(amt) || amt === 0) return;
        const k = `${b.book}|${t.date}|${amt}|${t.description}`;
        if (seen.has(k)) return;
        seen.add(k);
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
  inputs: ['txns', 'sheet_budgets', 'budgets', 'period'],
  fn: (txns, sheetBudgets, budgets, period) => {
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
        for (const r of txns || []) if (r.book === book && r.month === m && r.type === 'expense' && !r.oneTime) { a[r.category] = (a[r.category] || 0) + r.amount; a['#' + r.category] = (a['#' + r.category] || 0) + 1; }
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
  inputs: ['txns', 'period'],
  fn: (txns, period) => {
    const add = (m, n) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 7); };
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
      if (!kind) continue;
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
    const alias = {};
    for (const a of accts || []) for (const n of [a.name, a.match, ...(Array.isArray(a.aliases) ? a.aliases : [])]) if (n) alias[`${a.book}|${nk(n)}`] = a.name;
    const canon = (book, n) => alias[`${book}|${nk(n)}`] || String(n || '').replace(/^[^–]+ – /, '') || 'Account';
    importBatches = (importBatches || []).map((b) => ({ ...b, accountName: canon(b.book, b.accountName) }));
    sheet = (sheet || []).map((r) => ({ ...r, account: canon(r.book, r.account) }));
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
