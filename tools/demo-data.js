async (args) => {
  const b = window.HF.state.bookId, P = (c, d) => FDStore.json('POST', '/api/books/' + b + '/' + c, d);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const months = []; for (let i = 11; i >= 0; i--) { const d = new Date(Date.UTC(2026, 10 - i, 15)); months.push(d.toISOString().slice(0, 7)); }
  const V = [['KROGER #412', 95, 4], ['HY-VEE FOOD STORE', 70, 3], ['CHIPOTLE MEXICAN GRILL', 16, 3], ['PANERA BREAD', 18, 2], ['STARBUCKS', 7, 5], ['SHELL OIL', 45, 3], ['KWIK STAR', 38, 2], ['AMAZON MKTP', 42, 3], ['TARGET', 64, 2], ['CINEMARK THEATRES', 28, 1], ['WALGREENS', 22, 1]];
  let cash = 6200, inv1 = 41000, inv2 = 14800;
  for (const m of months) {
    const tx = [{ date: m + '-01', description: 'RENT - RIVERFRONT APTS', amount: 1450 }, { date: m + '-03', description: 'MIDAMERICAN ENERGY', amount: 70 + Math.round(rnd() * 60) }, { date: m + '-08', description: 'NETFLIX.COM', amount: 15.49 }, { date: m + '-09', description: 'SPOTIFY USA', amount: 11.99 }, { date: m + '-12', description: 'VERIZON WIRELESS', amount: 82 },
      { date: m + '-01', description: 'ACME CORP PAYROLL', amount: -2350 }, { date: m + '-15', description: 'ACME CORP PAYROLL', amount: -2350 }];
    for (const [v, avg, n] of V) for (let k = 0; k < n; k++) { const day = String(1 + Math.floor(rnd() * 27)).padStart(2, '0'); tx.push({ date: `${m}-${day}`, description: v, amount: Math.round(avg * (0.6 + rnd() * 0.9) * 100) / 100 }); }
    if (m === '2026-07') tx.push({ date: '2026-07-19', description: 'DELTA AIR LINES', amount: 612.4 });
    if (m === '2026-11') tx.push({ date: '2026-11-14', description: 'BEST BUY', amount: 389.99 });
    cash += 4700 - tx.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0) - 600; inv1 *= 1.004 + rnd() * 0.012; inv2 *= 1.003 + rnd() * 0.012; inv1 += 300; inv2 += 300;
    await P('imports', { accountName: 'Everyday checking', accountKind: 'deposit', balance: Math.round(cash), balanceMonth: m, txns: tx });
    await P('imports', { accountName: 'Workplace 401(k)', accountKind: 'investment', balance: Math.round(inv1), balanceMonth: m, txns: [] });
    await P('imports', { accountName: 'Roth IRA', accountKind: 'investment', balance: Math.round(inv2), balanceMonth: m, txns: [] });
    await P('imports', { accountName: 'High-yield savings', accountKind: 'deposit', balance: 8000 + months.indexOf(m) * 400, balanceMonth: m, txns: [] });
  }
  const RULES = [['RENT', 'Housing'], ['KROGER', 'Groceries'], ['HY-VEE', 'Groceries'], ['CHIPOTLE', 'Dining'], ['PANERA', 'Dining'], ['STARBUCKS', 'Coffee'], ['SHELL', 'Gas'], ['KWIK STAR', 'Gas'], ['AMAZON', 'Shopping'], ['TARGET', 'Shopping'], ['BEST BUY', 'Shopping'], ['CINEMARK', 'Entertainment'], ['WALGREENS', 'Health'], ['MIDAMERICAN', 'Utilities'], ['VERIZON', 'Phone'], ['NETFLIX', 'Subscriptions'], ['SPOTIFY', 'Subscriptions'], ['DELTA', 'Travel'], ['PAYROLL', 'Paycheck']];
  let o = 0; for (const [m, c] of RULES) await P('rules', { match: m, conds: [{ field: 'description', op: 'contains', value: m }], category: c, order: o++ });
  const card = []; for (const m of months) card.push({ m, v: 600 + Math.round(rnd() * 500) });
  for (const x of card) { await P('imports', { accountName: 'Rewards Visa', accountKind: 'credit', balance: x.v, balanceMonth: x.m, txns: [] }); await P('imports', { accountName: 'Car loan', accountKind: 'loan', balance: 14200 - months.indexOf(x.m) * 330, balanceMonth: x.m, txns: [] }); }
  for (const [c, a] of [['Groceries', 650], ['Dining', 220], ['Gas', 230], ['Shopping', 300], ['Utilities', 160], ['Entertainment', 60]]) await P('budgets', { category: c, amount: a, from: months[0] });
  await P('prefs', { key: 'customs', value: JSON.stringify([
    { id: 'demo1', title: 'Eating out vs groceries', measure: 'spend', by: 'category', when: '12m', show: 'line', top: 10, filter: { categories: ['Groceries', 'Dining'] } },
    { id: 'demo2', title: 'Where the money goes', measure: 'spend', by: 'vendor', when: '3m', show: 'bars', top: 8, filter: {} },
    { id: 'demo3', title: 'Coffee this year', measure: 'spend', by: 'none', when: 'ytd', show: 'number', top: 10, filter: { text: 'starbucks' } }]) });
  await P('prefs', { key: 'layout', value: JSON.stringify({ v: 1, tabs: { expenses: { tiles: ['spentMonth', 'avgSpend', 'topCat', 'unusual', 'cr:demo3'], items: [{ id: 'cr-demo2', size: 'M' }, { id: 'cr-demo1', size: 'M' }, { id: 'categories', size: 'F' }, { id: 'unusual', size: 'M' }, { id: 'big', size: 'M' }] } } }) });
  await P('prefs', { key: 'settings', value: JSON.stringify({ hideTiles: [], hideSec: ['health'] }) });
  return 'ok';
}
