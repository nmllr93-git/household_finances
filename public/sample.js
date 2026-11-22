// "Try it with sample data": a made-up household dashboard, built in the browser, so new users can see a full
// dashboard before importing anything. Nothing is saved, and it never touches real dashboards.
// Turn on with FDSample.start(); it adds a "Sample household" dashboard (view only) until FDSample.stop().
(function () {
  const ID = '__sample__', LABEL = 'Shared'; // the dashboards' calculations know two kinds of book: Personal and Shared
  const on = () => { try { return localStorage.getItem('fd-sample') === '1'; } catch { return false; } };
  // small seeded random so the sample looks the same every time
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const r2 = (n) => Math.round(n * 100) / 100;
  const ymd = (d) => d.toISOString().slice(0, 10);

  function build() {
    seed = 7;
    const now = new Date(), start = new Date(now.getFullYear(), now.getMonth() - 5, 1), end = new Date(now.getFullYear(), now.getMonth(), Math.max(1, now.getDate() - 1));
    const chk = [], card = [], sav = [], mtg = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const day = d.getDate(), dow = d.getDay(), ds = ymd(d);
      if (dow === 5 && Math.round((d - start) / 864e5) % 14 < 7) { chk.push({ date: ds, description: 'PAYROLL ACME CORP DIRECT DEP', amount: -2480 }); chk.push({ date: ds, description: 'PAYROLL NORTHSIDE CLINIC DIRECT DEP', amount: -1960 }); }
      if (day === 1) { chk.push({ date: ds, description: 'MORTGAGE PMT HOMELOAN SERVICING', amount: 1685 }); mtg.push({ date: ds, description: 'PAYMENT RECEIVED', amount: -1685 }); }
      if (day === 3) { chk.push({ date: ds, description: 'ONLINE TRANSFER TO SAVINGS', amount: 400 }); sav.push({ date: ds, description: 'ONLINE TRANSFER FROM CHECKING', amount: -400 }); }
      if (day === 12) chk.push({ date: ds, description: 'CITY POWER & LIGHT', amount: r2(95 + rnd() * 70) });
      if (day === 15) chk.push({ date: ds, description: 'T-MOBILE', amount: 120 });
      if (day === 18) chk.push({ date: ds, description: 'METRO WATER UTILITY', amount: r2(42 + rnd() * 18) });
      if (day === 22) { chk.push({ date: ds, description: 'CARD PAYMENT THANK YOU', amount: 0 }); }
      if (day === 28) sav.push({ date: ds, description: 'INTEREST PAID', amount: -r2(14 + rnd() * 4) });
      if (day === 5) card.push({ date: ds, description: 'NETFLIX.COM', amount: 15.49 });
      if (day === 9) card.push({ date: ds, description: 'SPOTIFY USA', amount: 11.99 });
      if (day === 20) card.push({ date: ds, description: 'GYM MEMBERSHIP FITCLUB', amount: 39 });
      if (dow === 6 || dow === 3) card.push({ date: ds, description: 'KROGER #412', amount: r2(48 + rnd() * 70) });
      if (dow === 2 && rnd() < 0.8) card.push({ date: ds, description: 'SHELL OIL 5721', amount: r2(32 + rnd() * 22) });
      if (rnd() < 0.22) card.push({ date: ds, description: ['CORNER CAFE', 'TACO GARDEN', 'PIZZA PALACE', 'MAIN ST BREW PUB'][Math.floor(rnd() * 4)], amount: r2(14 + rnd() * 46) });
      if (rnd() < 0.12) card.push({ date: ds, description: ['AMAZON MKTPL', 'TARGET 1123', 'HOME DEPOT 0412'][Math.floor(rnd() * 3)], amount: r2(18 + rnd() * 90) });
    }
    // card payments equal last month's card spending
    for (const t of chk) if (t.description === 'CARD PAYMENT THANK YOU') {
      const m = t.date.slice(0, 7), prev = new Date(m + '-01T12:00:00'); prev.setMonth(prev.getMonth() - 1); const pm = ymd(prev).slice(0, 7);
      const owed = r2(card.filter((c) => c.date.slice(0, 7) === pm).reduce((s, c) => s + c.amount, 0)) || 600;
      t.amount = owed; card.push({ date: t.date, description: 'PAYMENT THANK YOU', amount: -owed });
    }
    const asOf = ymd(end), month = asOf.slice(0, 7), at = new Date().toISOString();
    const imp = (id, name, kind, type, txns, balance) => ({ id, book: LABEL, accountName: name, accountKind: kind, accountType: type, owner: '', fileName: 'sample.csv', importedAt: at,
      rowCount: txns.length, dateFrom: txns.length ? txns[0].date : asOf, dateTo: asOf, balance, balanceMonth: month, asOf, txns: txns.filter((t) => t.amount) });
    const acct = (name, kind, type, rate) => ({ id: 'a-' + name, book: LABEL, name, match: name, kind, type, rate: rate || null, owner: '', note: '', createdAt: at });
    const mon0 = ymd(start).slice(0, 7);
    const bud = (category, amount) => ({ id: 'b-' + category, book: LABEL, category, amount, from: mon0, rollover: false, createdAt: at });
    const rule = (match, category) => ({ id: 'r-' + match, book: LABEL, match, category, createdAt: at });
    return {
      imports: [imp('i1', 'Joint Checking', 'deposit', 'checking', chk, 6240.18), imp('i2', 'Rewards Card', 'credit', 'card', card, 1384.52),
        imp('i3', 'High-Yield Savings', 'deposit', 'hysa', sav, 18450.00), imp('i4', 'Home Mortgage', 'mortgage', 'mortgage', mtg, 248310.77),
        imp('i5', '401(k)', 'investment', '401k', [], 86420.00), imp('i6', 'Brokerage', 'investment', 'brokerage', [], 23115.40)],
      accounts: [acct('Joint Checking', 'deposit', 'checking'), acct('Rewards Card', 'credit', 'card', 22.9), acct('High-Yield Savings', 'deposit', 'hysa', 4.1),
        acct('Home Mortgage', 'mortgage', 'mortgage', 6.25), acct('401(k)', 'investment', '401k'), acct('Brokerage', 'investment', 'brokerage')],
      budgets: [bud('Groceries', 650), bud('Dining', 300), bud('Gas & auto', 220), bud('Shopping', 250), bud('Utilities', 340), bud('Subscriptions', 70), bud('Mortgage', 1685)],
      rules: [rule('kroger', 'Groceries'), rule('shell oil', 'Gas & auto'), rule('cafe', 'Dining'), rule('taco', 'Dining'), rule('pizza', 'Dining'), rule('brew pub', 'Dining'),
        rule('amazon', 'Shopping'), rule('target', 'Shopping'), rule('home depot', 'Shopping'), rule('power & light', 'Utilities'), rule('water utility', 'Utilities'), rule('t-mobile', 'Utilities'),
        rule('netflix', 'Subscriptions'), rule('spotify', 'Subscriptions'), rule('gym membership', 'Subscriptions')],
      manual: [], edits: [], goals: [], holdings: [], prefs: [], shares: [], receipts: [],
    };
  }

  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const FDSample = {
    id: ID, active: on,
    start() { try { localStorage.setItem('fd-sample', '1'); localStorage.setItem('hf-book', ID); } catch {} location.reload(); },
    stop() { try { localStorage.removeItem('fd-sample'); localStorage.removeItem('hf-book'); } catch {} location.reload(); },
  };
  window.FDSample = FDSample;
  // Answer the sample dashboard's requests here; everything else goes to the real backend as usual.
  const install = () => {
    const S = window.FDStore; if (!S || S.__sample) return; S.__sample = true;
    const real = S.fetch.bind(S);
    S.fetch = async (path, opts = {}) => {
      const method = String(opts.method || 'GET').toUpperCase(), p = String(path);
      if (p.startsWith(`/api/books/${ID}/`) || p === `/api/books/${ID}`) {
        if (method !== 'GET') return json(403, { error: 'This is sample data, so changes aren’t saved. Switch to one of your own dashboards to make changes.' });
        if (/\/data(\?|$)/.test(p)) return json(200, build());
        if (/\/simplefin/.test(p)) return json(200, { connected: false, accounts: [], kinds: [] });
        return json(200, []);
      }
      const r = await real(path, opts);
      if (p === '/api/me' && on() && r.ok) { const me = await r.json(); me.books = [...(me.books || []), { id: ID, name: 'Sample household', label: LABEL, readOnly: true, sample: true }]; return json(200, me); }
      return r;
    };
  };
  install();
})();
