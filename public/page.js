// Page drawings: range picker, headline figures, charts, tables and the editors.
(function () {
  const { money0, money2, enc, placeholder } = window.FD;
  const book = () => window.FD.book();
  const P = () => ({ range: '6m', ...dash.params() });
  const st = (...ids) => {
    const s = ids.map((id) => dash.data(id).status);
    if (s.every((x) => x === 'ok')) return 'ok';
    if (s.includes('error')) return 'error';
    return 'loading';
  };
  const rows = (id) => (dash.data(id).status === 'ok' ? dash.data(id).data || [] : []);
  const period = () => rows('period');
  const lastMonth = () => { const p = period(); return p[p.length - 1]; };
  const longName = (m) => new Date(m + '-01T00:00:00Z').toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const isCurrent = (m) => new Date().toISOString().slice(0, 7) === m;
  const span = (text, src, field, key, cls) => {
    const s = document.createElement('span');
    s.textContent = text;
    if (src) { s.dataset.source = src; s.dataset.field = field; if (key !== undefined) s.dataset.where = 'key=' + enc(key); }
    if (cls) s.className = cls;
    return s;
  };
  const put = (el, ...kids) => { el.classList.remove('dash-skeleton'); el.replaceChildren(...kids); };
  const dash_ = (el, s) => { el.replaceChildren('—'); if (s === 'loading') el.classList.add('dash-skeleton'); else el.classList.remove('dash-skeleton'); };
  const txt = (s) => document.createTextNode(s);
  const td = (text, cls) => { const c = document.createElement('td'); c.textContent = text; if (cls) c.className = cls; return c; };
  const empty = (el, cols, msg) => { const tr = document.createElement('tr'); const c = td(msg, 'fd-zero'); c.colSpan = cols; c.style.textAlign = 'left'; tr.append(c); el.append(tr); };
  const db = () => claude.use('db');
  const pct = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(Math.abs(v) < 10 ? 1 : 0)}%`;

  const RANGE_LABEL = { '3m': 'Last 3 months', '6m': 'Last 6 months', '12m': 'Last 12 months', '24m': 'Last 24 months', ytd: 'This year so far', lastyear: 'Last year', all: 'All time' };
  const rangeLabel = () => {
    const r = P().range, p = period();
    if (RANGE_LABEL[r]) return RANGE_LABEL[r];
    if (!p.length) return 'Custom range';
    const a = longName(p[0].month), b = longName(p[p.length - 1].month);
    return a === b ? a : `${a.split(' ')[0]} ${a.split(' ')[1] === b.split(' ')[1] ? '' : a.split(' ')[1] + ' '}– ${b}`.replace('  ', ' ');
  };
  const prevLabel = () => { const n = period().length; return n === 1 ? 'the month before' : `the ${n} months before`; };

  // ---- range picker (listens and sets values only) ----
  const q = (id) => document.querySelectorAll('#' + id);
  // ---- saved preferences (server-side, per book): chart colors, custom reports, assets, dashboard settings ----
  const prefRows = (key) => rows('prefs').filter((p) => p.book === book() && p.key === key).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const prefGet = (key, def) => { const r = prefRows(key).pop(); if (!r) return def; try { return JSON.parse(r.value); } catch { return def; } };
  const prefSet = async (key, val) => {
    const old = prefRows(key);
    try { const d = await db(); await d.collection('data/household/prefs').add({ book: book(), key, value: JSON.stringify(val) }); for (const o of old) await d.doc('data/household/prefs/' + o.id).delete(); return true; } catch { return false; }
  };
  let COLORS = {};
  const colorFor = (chart, name, def) => (chart && COLORS[chart] && COLORS[chart][name]) || def;
  const toHex = (c) => { const t = document.createElement('i'); t.style.color = c; document.body.append(t); const m = getComputedStyle(t).color.match(/\d+(\.\d+)?/g) || [0, 0, 0]; t.remove(); return '#' + m.slice(0, 3).map((x) => (+x | 0).toString(16).padStart(2, '0')).join(''); };
  const redrawAll = () => { const seen = new Set(); document.querySelectorAll('[data-draw]').forEach((e) => { const n = e.dataset.draw; if (!seen.has(n) && n !== 'prefSync') { seen.add(n); try { dash.draw(n); } catch {} } }); };
  let colorPop = null;
  const openColors = (btn, chart, items, title) => {
    colorPop?.remove();
    const pop = document.createElement('div'); pop.className = 'fd-colorpop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Chart colors');
    const h = document.createElement('div'); h.className = 'fd-tip-h'; h.textContent = (title || 'Chart') + ' colors'; pop.append(h);
    items.forEach(({ name, color }) => {
      const l = document.createElement('label'); l.className = 'fd-colorrow'; const i = document.createElement('input'); i.type = 'color'; i.value = toHex(color);
      i.addEventListener('change', () => { COLORS[chart] = { ...(COLORS[chart] || {}), [name]: i.value }; prefSet('colors', COLORS); redrawAll(); });
      const n = document.createElement('span'); n.textContent = name; l.append(i, n); pop.append(l);
    });
    const bar = document.createElement('div'); bar.className = 'fd-rb-row';
    const rs = document.createElement('button'); rs.type = 'button'; rs.className = 'fd-btn fd-sm fd-quiet'; rs.textContent = 'Reset to default';
    rs.addEventListener('click', () => { delete COLORS[chart]; prefSet('colors', COLORS); pop.remove(); redrawAll(); });
    const cl = document.createElement('button'); cl.type = 'button'; cl.className = 'fd-btn fd-sm'; cl.textContent = 'Done'; cl.addEventListener('click', () => pop.remove());
    bar.append(rs, cl); pop.append(bar); document.body.append(pop); colorPop = pop;
    const r = btn.getBoundingClientRect(); pop.style.top = r.bottom + window.scrollY + 6 + 'px'; pop.style.left = Math.max(8, Math.min(r.right - pop.offsetWidth, window.innerWidth - pop.offsetWidth - 8)) + window.scrollX + 'px';
    setTimeout(() => document.addEventListener('pointerdown', function off(e) { if (!pop.contains(e.target) && e.target !== btn) { pop.remove(); document.removeEventListener('pointerdown', off); } }), 0);
  };
  const addGear = (host, chart, items, title) => {
    if (!host.isConnected) { setTimeout(() => { if (host.isConnected) addGear(host, chart, items, title); }, 0); return; } // placed once it's on the page, so it can find its tile
    host.querySelectorAll(':scope > .fd-gear').forEach((g) => g.remove());
    // Put the gear in the tile's top-right corner (clear of the chart), unless another chart in the same tile already uses that spot.
    const card = host.closest('.fd-card'); if (card) card.querySelectorAll(':scope > .fd-gear').forEach((g) => { if (g.__host === host || !document.contains(g.__host)) g.remove(); });
    if (card && !card.querySelector(':scope > .fd-gear')) { const h0 = host; host = card; host.__gearFor = h0; }
    const b = document.createElement('button'); b.__host = host.__gearFor || host; b.type = 'button'; b.className = 'fd-gear'; b.textContent = '⚙'; b.title = 'Change chart colors'; b.setAttribute('aria-label', 'Change chart colors');
    b.addEventListener('click', (e) => { e.stopPropagation(); openColors(b, chart, items, title); });
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.append(b);
  };
  // line and bar charts: apply saved colors by series name, then add the gear
  const chartTitle = (el) => (el.closest('section, .fd-card')?.querySelector('h2, h3')?.textContent || '').trim();
  const wrapChart = (fnName, list, apply) => { const orig = window.FD[fnName]; window.FD[fnName] = (el, opt) => {
    const chart = el.dataset.draw || fnName, items = list(opt);
    items.forEach((s, i) => { s.color = colorFor(chart, s.name, s.color || dash.colors[i % dash.colors.length]); });
    if (apply) apply(opt, items);
    orig(el, opt); addGear(el, chart, items.map((s) => ({ name: s.name, color: s.color })), chartTitle(el));
  }; };
  wrapChart('lineChart', (o) => o.series || []);
  wrapChart('stackedBars', (o) => o.series || []);
  wrapChart('groupedBars', (o) => { const seen = new Map(); (o.groups || []).forEach((g) => (g.values || []).forEach((v) => { if (!seen.has(v.name)) seen.set(v.name, { name: v.name, color: v.color }); })); return [...seen.values()]; },
    (o, items) => (o.groups || []).forEach((g) => (g.values || []).forEach((v) => { const it = items.find((x) => x.name === v.name); if (it) v.color = it.color; })));
  // dashboard settings (per book)
  const SET = () => ({ type: /shared/i.test(book()) ? 'shared' : 'personal', people: [{ name: '', pct: 50 }, { name: '', pct: 50 }], tab: '', range: '', weekStart: 'mon', ...prefGet('settings', {}) });
  let prefsReady = false;
  dash.draw('prefSync', () => {
    if (st('prefs') !== 'ok') return;
    COLORS = prefGet('colors', {}) || {};
    const r = prefGet('reports', null); if (Array.isArray(r)) { REPS = r; try { navReports(); if (repOn != null) drawReport(); } catch {} }
    applySettings(SET(), false);
    if (!prefsReady) { prefsReady = true; const s = SET(); if (s.range && !new URLSearchParams(location.search).get('range')) dash.setParams({ range: s.range }); if (s.tab) showGroup(s.tab); }
    redrawAll();
  });

  q('fd-range').forEach((s) => s.addEventListener('change', () => {
    const p = { range: s.value };
    if (s.value === 'custom' && !P().from) { const per = period(); if (per.length) { p.from = per[0].month; p.to = per[per.length - 1].month; } }
    dash.setParams(p);
  }));
  const monthInput = (id, name) => q(id).forEach((i) => {
    i.addEventListener('change', () => { if (i.value && i.validity.valid && /^\d{4}-\d{2}$/.test(i.value)) dash.setParams({ [name]: i.value }); });
    i.addEventListener('blur', () => { i.value = P()[name] || ''; });
  });
  monthInput('fd-from', 'from'); monthInput('fd-to', 'to');
  q('fd-compare').forEach((c) => c.addEventListener('change', () => dash.setParams({ compare: c.checked })));
  q('fd-cat-clear').forEach((b) => b.addEventListener('click', () => dash.setParams({ cat: null })));
  dash.onData(() => {
    const p = P();
    q('fd-range').forEach((s) => { if (document.activeElement !== s) s.value = p.range; });
    q('fd-from-wrap').forEach((w) => { w.hidden = p.range !== 'custom'; });
    q('fd-to-wrap').forEach((w) => { w.hidden = p.range !== 'custom'; });
    q('fd-from').forEach((i) => { if (document.activeElement !== i) i.value = p.from || ''; });
    q('fd-to').forEach((i) => { if (document.activeElement !== i) i.value = p.to || ''; });
    q('fd-compare').forEach((c) => { c.checked = !!p.compare; });
    document.querySelectorAll('.fd-cmp').forEach((e) => { e.hidden = !p.compare; });
    q('fd-cat-chip').forEach((e) => { e.hidden = !p.cat; });
    document.querySelectorAll('.fd-cmpcat').forEach((e) => { e.hidden = !p.cat; });
    const bk = book();
    document.querySelectorAll('.fd-tab').forEach((b) => { const on = b.dataset.book === bk; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
  });
  document.querySelectorAll('.fd-tab').forEach((b) => b.addEventListener('click', () => dash.setParams({ book: b.dataset.book })));
  const go = location.hash && document.querySelector(location.hash);
  if (go) setTimeout(() => go.scrollIntoView(), 300);
  document.querySelectorAll('.fd > section[id], .fd > div > section[id]').forEach((s) => {
    if (!('IntersectionObserver' in window)) return;
    new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && dash.setLink(s.id)), { root: document, threshold: 0.4 }).observe(s);
  });

  // ---- headline ----
  const sumRow = () => rows('summary').find((r) => r.key === book());
  dash.draw('kRange', (el) => { el.textContent = period().length ? rangeLabel() : '—'; });
  dash.draw('ledeRange', (el) => { if (!period().length) return dash_(el, st('period')); put(el, txt(rangeLabel())); });
  dash.draw('ledeBook', (el) => { el.textContent = book() === 'Shared' ? 'shared' : 'personal'; });
  dash.draw('ledeSpend', (el) => { const r = sumRow(); if (!r) return dash_(el, st('summary')); put(el, span(money0(r.spend), 'summary', 'spend', r.key)); });
  dash.draw('ledeAvg', (el) => { const r = sumRow(); if (!r) return dash_(el, st('summary')); put(el, span(money0(r.avgSpend), 'summary', 'avgSpend', r.key)); });
  dash.draw('ledeCmp', (el) => {
    const r = sumRow();
    if (!r || r.spendChangePct === null) { el.replaceChildren(); return; }
    put(el, txt(', '), span(`${Math.abs(r.spendChangePct)}%`, 'summary', 'spendChangePct', r.key), txt(` ${r.spendChangePct >= 0 ? 'more' : 'less'} than ${prevLabel()}`));
  });
  const latestTotal = (kinds) => rows('balance_totals').filter((r) => r.book === book() && kinds.includes(r.kind) && r.latest);
  dash.draw('ledeCash', (el) => { const t = latestTotal(['deposit'])[0]; if (!t) return dash_(el, st('balance_totals')); put(el, span(money0(t.total), 'balance_totals', 'total', t.key)); });

  // ---- KPI cards ----
  dash.draw('kSpend', (el) => { const r = sumRow(); if (!r) return dash_(el, st('summary')); put(el, span(money0(r.spend), 'summary', 'spend', r.key)); });
  dash.draw('kSpendSub', (el) => {
    const r = sumRow(); if (!r) return dash_(el, st('summary'));
    if (P().compare && r.spendChange !== null) {
      put(el, span((r.spendChange >= 0 ? '+' : '−') + money0(Math.abs(r.spendChange)), 'summary', 'spendChange', r.key, r.spendChange > 0 ? 'fd-bad' : 'fd-good'),
        txt(` (${pct(r.spendChangePct ?? 0)}) vs ${prevLabel()}`));
    } else put(el, span(money0(r.avgSpend), 'summary', 'avgSpend', r.key), txt(' a month'));
  });
  dash.draw('kIncome', (el) => { const r = sumRow(); if (!r) return dash_(el, st('summary')); put(el, span(money0(r.income), 'summary', 'income', r.key)); });
  dash.draw('kIncomeSub', (el) => {
    const r = sumRow(); if (!r) return dash_(el, st('summary'));
    const parts = [txt('Net '), span(money0(r.net), 'summary', 'net', r.key, r.net >= 0 ? 'fd-good' : 'fd-bad')];
    if (r.income > 0) parts.push(txt(` · kept ${Math.round((r.net / r.income) * 100)}%`));
    if (P().compare && r.incomeChange !== null) parts.push(txt(' · '), span((r.incomeChange >= 0 ? '+' : '−') + money0(Math.abs(r.incomeChange)), 'summary', 'incomeChange', r.key), txt(' vs before'));
    put(el, ...parts);
  });
  const chg = (el, r, goodWhenUp) => {
    if (!r || r.change == null) { el.classList.remove('dash-skeleton'); el.replaceChildren(r ? `as of ${r.label}` : '—'); return; }
    const good = goodWhenUp ? r.change >= 0 : r.change <= 0;
    put(el, span((r.change >= 0 ? '+' : '−') + money0(Math.abs(r.change)).replace('−', ''), 'balance_totals', 'change', r.key, good ? 'fd-good' : 'fd-bad'),
      txt(` in ${r.label} vs ${r.prevLabel}`));
  };
  const kpiBal = (name, kinds, up) => {
    dash.draw(name, (el) => {
      const t = latestTotal(kinds)[0];
      if (!t) { if (st('balance_totals') !== 'ok') return dash_(el, st('balance_totals')); el.classList.remove('dash-skeleton'); el.replaceChildren('—'); return; }
      put(el, span(money0(t.total), 'balance_totals', 'total', t.key));
    });
    dash.draw(name + 'Chg', (el) => {
      const t = latestTotal(kinds)[0];
      if (!t) { el.classList.remove('dash-skeleton'); el.replaceChildren(st('balance_totals') === 'ok' ? 'None in this range' : '—'); return; }
      if (t.kind === 'loan' && t.total === 0) { put(el, txt(`Paid off by ${t.label}`)); return; }
      chg(el, t, up);
    });
  };
  kpiBal('kCash', ['deposit'], true);
  kpiBal('kInvest', ['investment'], true);
  const debt = () => latestTotal(['mortgage'])[0] || latestTotal(['loan'])[0];
  dash.draw('kDebt', (el) => { const t = debt(); if (!t) { if (st('balance_totals') !== 'ok') return dash_(el, st('balance_totals')); el.replaceChildren('—'); return; } put(el, span(money0(t.total), 'balance_totals', 'total', t.key)); });
  dash.draw('kDebtChg', (el) => {
    const t = debt(); if (!t) { el.classList.remove('dash-skeleton'); el.replaceChildren(st('balance_totals') === 'ok' ? 'None in this range' : '—'); return; }
    if (t.kind === 'loan' && t.total === 0) { put(el, txt(`Paid off by ${t.label}`)); return; }
    chg(el, t, false);
  });
  const subsTot = (kind) => rows('subs_totals').find((r) => r.key === `${book()}|${kind}`);
  dash.draw('kSubs', (el) => { const r = subsTot('Subscription'); if (!r) return dash_(el, st('subs_totals')); put(el, span(money0(r.avg), 'subs_totals', 'avg', r.key)); });
  dash.draw('kSubsSub', (el) => {
    const r = subsTot('Subscription'); if (!r) return dash_(el, st('subs_totals'));
    put(el, txt('about '), span(money0(r.yearly), 'subs_totals', 'yearly', r.key), txt(' a year · '), span(String(r.countLatest), 'subs_totals', 'countLatest', r.key), txt(' charged last month'));
  });
  const budTot = () => rows('budget_totals').find((r) => r.key === book());
  dash.draw('kBudgetMonth', (el) => { const r = budTot(); el.textContent = r ? r.label + (isCurrent(r.month) ? ' so far' : '') : '—'; });
  dash.draw('kBudget', (el) => {
    const r = budTot(); if (!r) return dash_(el, st('budget_totals'));
    if (!r.categories) { put(el, txt('No budget set')); return; }
    put(el, span(money0(r.spent), 'budget_totals', 'spent', r.key), txt(' of '), span(money0(r.available), 'budget_totals', 'available', r.key));
  });
  dash.draw('kBudgetSub', (el) => {
    const r = budTot(); if (!r || !r.categories) { el.classList.remove('dash-skeleton'); el.replaceChildren(r ? 'Set one in Budget vs actual' : '—'); return; }
    const parts = [span(`${r.usedPct}%`, 'budget_totals', 'usedPct', r.key, r.usedPct > 100 ? 'fd-bad' : ''), txt(' used')];
    if (r.elapsed !== null) parts.push(txt(` with ${Math.round(r.elapsed * 100)}% of the month gone · on pace for `), span(money0(r.projected), 'budget_totals', 'projected', r.key, r.projected > r.available ? 'fd-bad' : 'fd-good'));
    put(el, ...parts);
  });

  // ---- account and subscription detail panels ----
  const DETAIL = { 'kpi-cash': 'cash', 'kpi-invest': 'invest', 'kpi-subs': 'subs' };
  for (const [id, v] of Object.entries(DETAIL)) q(id).forEach((c) => c.addEventListener('click', () => {
    dash.setParams({ detail: P().detail === v ? null : v });
    setTimeout(() => document.querySelector('#fd-detail')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
  }));
  q('fd-detail-close').forEach((b) => b.addEventListener('click', () => dash.setParams({ detail: null })));
  dash.onData(() => { q('fd-detail').forEach((s) => { s.hidden = !P().detail; }); });
  const latestRows = (kind) => {
    const b = rows('balances').filter((r) => r.book === book() && r.kind === kind);
    const m = b.map((r) => r.month).sort().pop();
    return { month: m, rows: b.filter((r) => r.month === m).sort((x, y) => y.balance - x.balance) };
  };
  const cardOwed = (month) => rows('balances').filter((r) => r.book === book() && r.kind === 'credit' && r.month === month);
  dash.draw('kCashNet', (el) => {
    const d = latestRows('deposit'); if (!d.month) { el.textContent = ''; return; }
    const cards = cardOwed(d.month); if (!cards.length) { el.textContent = ''; return; }
    const cash = d.rows.reduce((s, r) => s + r.balance, 0), owed = cards.reduce((s, r) => s + r.balance, 0);
    el.textContent = `Net after cards: ${money0(cash - owed)}`;
  });
  const DT = { cash: 'Checking & savings accounts', invest: 'Investment accounts', subs: 'Subscriptions & recurring bills' };
  dash.draw('detailTitle', (el) => { el.textContent = DT[P().detail] || ''; });
  dash.draw('detailRows', (el) => {
    el.replaceChildren();
    const v = P().detail; if (!v) return;
    const row = (cells, cls) => { const tr = document.createElement('tr'); if (cls) tr.className = cls; cells.forEach(([t, c]) => tr.append(td(t, c))); el.append(tr); };
    const head = (labels) => { const tr = document.createElement('tr'); labels.forEach((l, i) => { const th = document.createElement('th'); th.textContent = l; if (i === 0) th.className = 'fd-l'; tr.append(th); }); el.append(tr); };
    if (v === 'subs') {
      const s = rows('subs').filter((x) => x.book === book());
      if (!s.length) return empty(el, 4, 'No subscriptions found in this range.');
      for (const kind of ['Subscription', 'Recurring bill']) {
        const g = s.filter((x) => x.kind === kind).sort((a, b) => b.avg - a.avg); if (!g.length) continue;
        head([kind === 'Subscription' ? 'Subscription' : 'Recurring bill', 'Last charge', 'Per month', 'Per year']);
        g.forEach((x) => row([[x.vendor, 'fd-l'], [money2(x.lastCharge)], [money2(x.avg)], [money0(x.yearly)]]));
        row([['Total', 'fd-l'], [''], [money2(g.reduce((t, x) => t + x.avg, 0))], [money0(g.reduce((t, x) => t + x.yearly, 0))]], 'fd-total');
      }
      return;
    }
    const kind = v === 'cash' ? 'deposit' : 'investment';
    const d = latestRows(kind);
    if (!d.month) return empty(el, 3, 'No balances in this range.');
    const prevM = rows('balances').filter((r) => r.book === book() && r.kind === kind && r.month < d.month).map((r) => r.month).sort().pop();
    const prev = Object.fromEntries(rows('balances').filter((r) => r.book === book() && r.kind === kind && r.month === prevM).map((r) => [r.label, r.balance]));
    head(['Account', 'Source', 'Balance', 'Change']);
    d.rows.forEach((r) => { const c = r.label in prev ? r.balance - prev[r.label] : null;
      row([[r.label + (r.estimate ? ' (estimate)' : ''), 'fd-l'], [r.source, 'fd-l fd-zero'], [money2(r.balance)], [c === null ? '–' : (c >= 0 ? '+' : '−') + money0(Math.abs(c)), c === null ? '' : c >= 0 ? 'fd-good' : 'fd-bad']]); });
    const total = d.rows.reduce((s, r) => s + r.balance, 0);
    row([['Total', 'fd-l'], [''], [money2(total)], ['']], 'fd-total');
    if (kind === 'deposit') {
      const cards = cardOwed(d.month);
      cards.forEach((r) => row([[r.label + ' (owed)', 'fd-l'], [r.source, 'fd-l fd-zero'], ['−' + money2(r.balance), 'fd-bad'], ['']]));
      if (cards.length) row([['Net checking & savings', 'fd-l'], [''], [money2(total - cards.reduce((s, r) => s + r.balance, 0))], ['']], 'fd-total');
    }
  });
  dash.draw('detailNote', (el) => {
    const v = P().detail; if (!v || v === 'subs') { el.textContent = v ? 'Average of the months charged in the last 12 months; per year = per month × 12.' : ''; return; }
    const d = latestRows(v === 'cash' ? 'deposit' : 'investment');
    el.textContent = d.month ? `Balances for ${longName(d.month)}. If any account has a balance recorded from a statement for that month, statement balances replace the Google Sheets figures for that kind of account, so record a balance for every account.` + (v === 'cash' ? ' Credit card balances you record are subtracted to give the net figure.' : '') : '';
  });

  // ---- navigation groups and collapsible sections ----
  const GROUPS = { overview: ['health', 'split', 'unusual', 'top-vendors', 'cashflow', 'big', 'bills'], accounts: ['networth', 'accounts', 'sharedin', 'assets', 'goals', 'holdings', 'deposits', 'investments', 'mortgage'],
    expenses: ['unusual', 'categories', 'big', 'subscriptions', 'vendors', 'tags', 'dow', 'top-vendors', 'cashflow'], budget: ['budget', 'split'], tx: ['transactions'], import: ['import'], review: ['review'], planning: ['forecast', 'planner', 'projection', 'taxes'], markets: ['markets', 'economy'], settings: ['settings'] };
  const ALL = [...new Set(Object.values(GROUPS).flat())];
  let HIDESEC = new Set(), HIDEPART = new Set(); const PART = (k) => HIDEPART.has(k);
  const NP = (() => { try { return JSON.parse(localStorage.getItem('fd-nav') || '{}') || {}; } catch { return {}; } })();
  const npSave = () => { try { localStorage.setItem('fd-nav', JSON.stringify(NP)); } catch {} };
  let showGroup = (g) => {
    NP.group = g; npSave();
    const on = new Set(g === 'all' ? ALL : GROUPS[g] || ALL);
    ALL.forEach((id) => q(id).forEach((s) => { s.hidden = !on.has(id) || HIDESEC.has(id); }));
    document.querySelectorAll('.fd-navb').forEach((b) => { b.classList.toggle('is-on', b.dataset.group === g); b.setAttribute('aria-pressed', b.dataset.group === g ? 'true' : 'false'); }); { const nav = document.getElementById('fd-nav'), on = nav && nav.querySelector('.fd-navb.is-on'); if (on && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = on.offsetLeft - (nav.clientWidth - on.offsetWidth) / 2; }
  };
  // Phone section menus: defaults below; each phone can rename, add, remove and regroup them (⚙ Settings → Phone menus). Saved on this device.
  const NAV_DEFAULT = [['Overview', ['all', 'overview']], ['Spending', ['expenses', 'budget', 'tx']], ['Wealth', ['accounts', 'planning', 'markets']], ['More', ['review', 'import']]];
  const NAV_ALL = ['all', 'overview', 'accounts', 'expenses', 'budget', 'tx', 'planning', 'markets', 'review', 'import'];
  const navMenus = () => { try { const m = JSON.parse(localStorage.getItem('fd-navmenus') || 'null'); if (Array.isArray(m) && m.length) {
    const used = new Set(m.flatMap((x) => x[1])), out = m.map(([n, gs]) => [String(n).slice(0, 14), gs.filter((g) => NAV_ALL.includes(g))]).filter((x) => x[1].length);
    const miss = NAV_ALL.filter((g) => !used.has(g)); if (miss.length) { if (out.length) out[out.length - 1][1].push(...miss); else out.push(['More', miss]); } return out; } } catch {} return NAV_DEFAULT.map(([n, g]) => [n, [...g]]); };
  let lastTab = 'all';
  // Phones: fold the section tabs into a few menus (Overview ▾, Spending ▾, Wealth ▾, More ▾) so the bar fits without sideways scrolling.
  // Computers keep every tab visible; the menus are hidden there by CSS.
  {
    const nav = document.getElementById('fd-nav'), MENUS = navMenus();
    let open = null;
    const close = () => { if (open) { open.remove(); open = null; } };
    const navBtn = (g) => nav.querySelector(`.fd-navb[data-group="${g}"]`);
    const label = (g) => (navBtn(g) || {}).textContent || g;
    const groupBtns = MENUS.map(([name, gs]) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'fd-navm'; b.dataset.menu = name; b.textContent = name + ' ▾'; b.setAttribute('aria-haspopup', 'menu');
      b.addEventListener('click', (e) => {
        e.stopPropagation(); const was = open && open.__for === b; close(); if (was) return;
        const m = document.createElement('div'); m.className = 'fd-navpop'; m.setAttribute('role', 'menu'); m.__for = b;
        for (const g of gs) { const src = navBtn(g); if (!src || (g === 'import' && document.body.classList.contains('fd-readonly'))) continue;
          const it = document.createElement('button'); it.type = 'button'; it.setAttribute('role', 'menuitem'); it.textContent = label(g); if (NP.group === g) it.className = 'is-on';
          it.addEventListener('click', () => { close(); src.click(); }); m.append(it); }
        const r = b.getBoundingClientRect(); m.style.top = r.bottom + 'px'; m.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 200)) + 'px';
        document.body.append(m); open = m;
      });
      return b;
    });
    nav.prepend(...groupBtns);
    document.addEventListener('click', close); window.addEventListener('scroll', close, { passive: true });
    const mark = () => { const g = NP.group || 'all'; groupBtns.forEach((b, i) => { const hit = MENUS[i][1].includes(g); b.classList.toggle('is-on', hit); b.textContent = (hit ? label(g).replace(/^⚙\s*/, '') : MENUS[i][0]) + ' ▾'; }); };
    const orig = showGroup; showGroup = (g) => { orig(g); mark(); }; mark();
  }
  document.querySelectorAll('.fd-navb').forEach((b) => b.addEventListener('click', () => { const g = b.dataset.group; if (g === 'settings' && NP.group === 'settings') return showGroup(lastTab || 'all'); if (g === 'settings' && NP.group) lastTab = NP.group; showGroup(g); }));
  document.getElementById('fd-nav').addEventListener('click', (e) => {
    if (!e.target.closest('.fd-navb')) return;
    setTimeout(() => {
      const nav = document.getElementById('fd-nav'), rep = document.getElementById('fd-report');
      const ids = GROUPS[NP.group] || ALL; const tgt = rep && !rep.hidden ? rep : ids.map((id) => q(id)[0]).find((s) => s && !s.hidden && s.offsetParent);
      if (tgt) window.scrollTo({ top: Math.max(0, tgt.getBoundingClientRect().top + window.scrollY - nav.offsetHeight - 8), behavior: 'smooth' });
    }, 30);
  });
  showGroup(/^rep:/.test(NP.group || '') ? 'all' : NP.group || 'all');
  // ---- custom reports: your own tabs of chosen views, each resizable ----
  const RKEY = 'fd-reports', SIZES = [['S', 4, 'Third'], ['M', 6, 'Half'], ['L', 8, 'Two-thirds'], ['F', 12, 'Full']];
  let REPS = (() => { try { return JSON.parse(localStorage.getItem(RKEY) || '[]') || []; } catch { return []; } })();
  const repSave = () => { try { localStorage.setItem(RKEY, JSON.stringify(REPS)); } catch {} prefSet('reports', REPS); };
  const home = new Map(); ALL.forEach((id) => q(id).forEach((s) => { const mark = document.createComment('home:' + id); s.before(mark); home.set(s, mark); }));
  const secTitle = (id) => (q(id)[0]?.querySelector('h2')?.textContent || id).trim();
  const repBox = document.createElement('div'); repBox.id = 'fd-report'; repBox.hidden = true;
  const repBar = document.createElement('div'); repBar.className = 'fd-repbar';
  const repGrid = document.createElement('div'); repGrid.className = 'fd-repgrid';
  repBox.append(repBar, repGrid); document.getElementById('fd-nav').after(repBox);
  let repEdit = false, repOn = null;
  const goHome = () => { home.forEach((mark, s) => { if (s.parentElement?.classList.contains('fd-reptile')) { mark.after(s); } }); repGrid.replaceChildren(); };
  const sbtn = (txt, title, fn, on) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'fd-repbtn' + (on ? ' is-on' : ''); b.textContent = txt; b.title = title; b.setAttribute('aria-label', title); b.addEventListener('click', fn); return b; };
  let drawReport = () => {
    goHome(); const r = REPS[repOn]; repBar.replaceChildren(); if (!r) return;
    const name = document.createElement('strong'); name.textContent = r.name;
    repBar.append(name, sbtn(repEdit ? 'Done' : 'Edit', 'Edit this report', () => { repEdit = !repEdit; drawReport(); }));
    if (repEdit) {
      const add = document.createElement('select'); add.className = 'dash-select'; add.append(new Option('+ Add a view…', ''));
      ALL.filter((id) => !r.items.some((x) => x.id === id)).forEach((id) => add.append(new Option(secTitle(id), id)));
      add.addEventListener('change', () => { if (add.value) { r.items.push({ id: add.value, size: 'M' }); repSave(); drawReport(); } });
      repBar.append(add,
        Object.assign(document.createElement('input'), { className: 'fd-repname', value: r.name, maxLength: 40, ariaLabel: 'Report name', onchange: (e) => { const n = e.target.value.trim(); if (n) { r.name = n; repSave(); navReports(); showGroup('rep:' + repOn); } } }),
        sbtn('Delete report', 'Delete this report', (e) => { if (e.target.dataset.sure) { REPS.splice(repOn, 1); repSave(); repEdit = false; navReports(); showGroup('all'); } else { e.target.dataset.sure = '1'; e.target.textContent = 'Click again to delete'; } }));
    }
    if (!r.items.length) { const p = document.createElement('p'); p.className = 'fd-note'; p.textContent = repEdit ? 'Pick views from “Add a view” to build this report.' : 'This report is empty. Click Edit to add views.'; repGrid.append(p); }
    r.items.forEach((it, i) => {
      const s = q(it.id)[0]; if (!s) return;
      const span = (SIZES.find((z) => z[0] === it.size) || SIZES[1])[1];
      const cell = document.createElement('div'); cell.className = 'fd-reptile'; cell.style.setProperty('--span', span);
      if (repEdit) {
        const t = document.createElement('div'); t.className = 'fd-reptools';
        const lab = document.createElement('span'); lab.textContent = secTitle(it.id); t.append(lab);
        SIZES.forEach(([k, , full]) => t.append(sbtn(k, full + ' width', () => { it.size = k; repSave(); drawReport(); }, it.size === k)));
        t.append(sbtn('↑', 'Move earlier', () => { if (i) { r.items.splice(i - 1, 0, r.items.splice(i, 1)[0]); repSave(); drawReport(); } }),
          sbtn('↓', 'Move later', () => { if (i < r.items.length - 1) { r.items.splice(i + 1, 0, r.items.splice(i, 1)[0]); repSave(); drawReport(); } }),
          sbtn('×', 'Remove from report', () => { r.items.splice(i, 1); repSave(); drawReport(); }));
        cell.append(t);
      }
      s.hidden = false; cell.append(s); repGrid.append(cell);
    });
  };
  const redrawIn = (root) => requestAnimationFrame(() => root.querySelectorAll('[data-draw]').forEach((d) => { try { dash.draw(d.dataset.draw); } catch {} }));
  const drawReport0 = drawReport; drawReport = () => { drawReport0(); redrawIn(repGrid); };
  const navReports = () => {
    const nav = document.getElementById('fd-nav'); nav.querySelectorAll('.fd-navr').forEach((b) => b.remove());
    const before = nav.querySelector('[data-group=import]');
    REPS.forEach((r, i) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'fd-navb fd-navr'; b.dataset.group = 'rep:' + i; b.textContent = '★ ' + r.name; b.addEventListener('click', () => showGroup('rep:' + i)); nav.insertBefore(b, before); });
    const nb = document.createElement('button'); nb.type = 'button'; nb.className = 'fd-navb fd-navr'; nb.textContent = '+ Report'; nb.title = 'Make your own report tab';
    nb.addEventListener('click', () => { REPS.push({ name: 'My report' + (REPS.length ? ' ' + (REPS.length + 1) : ''), items: [] }); repSave(); repEdit = true; navReports(); showGroup('rep:' + (REPS.length - 1)); });
    nav.insertBefore(nb, before);
  };
  const baseShow = showGroup;
  showGroup = (g) => {
    const isRep = /^rep:\d+$/.test(g) && REPS[+g.slice(4)];
    if (!isRep) { if (repOn != null) { const back = [...repGrid.querySelectorAll('section')]; goHome(); back.forEach(redrawIn); repOn = null; repEdit = false; repBox.hidden = true; } baseShow(REPS[+String(g).slice(4)] || !/^rep:/.test(g) ? g : 'all'); return; }
    NP.group = g; npSave(); repOn = +g.slice(4); repBox.hidden = false;
    ALL.forEach((id) => q(id).forEach((s) => { s.hidden = true; }));
    document.querySelectorAll('.fd-navb').forEach((b) => { b.classList.toggle('is-on', b.dataset.group === g); b.setAttribute('aria-pressed', b.dataset.group === g ? 'true' : 'false'); });
    drawReport();
  };
  navReports();
  if (/^rep:/.test(NP.group || '')) showGroup(NP.group);
  NP.closed = NP.closed || {};
  ALL.forEach((id) => q(id).forEach((s) => {
    const h = s.querySelector(':scope > h2'); if (!h) return;
    h.classList.add('fd-fold'); h.tabIndex = 0; h.setAttribute('role', 'button');
    const set = (c) => { s.classList.toggle('fd-collapsed', c); h.setAttribute('aria-expanded', c ? 'false' : 'true'); };
    set(!!NP.closed[id]);
    const flip = () => { NP.closed[id] = !NP.closed[id]; npSave(); set(NP.closed[id]); };
    h.addEventListener('click', flip);
    h.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
  }));
  dash.draw('cardRows', (el) => {
    el.replaceChildren();
    if (st('balances') !== 'ok') return;
    const b = rows('balances').filter((r) => r.book === book() && r.kind === 'credit');
    const m = b.map((r) => r.month).sort().pop();
    if (!m) return empty(el, 3, 'No card balances yet. Record one under Import → Record a statement balance, as “Credit card (amount owed)”.');
    const tr0 = document.createElement('tr'); ['Card', 'Source', 'Owed'].forEach((l, i) => { const th = document.createElement('th'); th.textContent = l; if (i < 2) th.className = 'fd-l'; tr0.append(th); }); el.append(tr0);
    const cur = b.filter((r) => r.month === m);
    for (const r of cur) { const tr = document.createElement('tr'); tr.append(td(r.label, 'fd-l'), td(r.source, 'fd-l fd-zero'), td(money2(r.balance))); el.append(tr); }
    const tr = document.createElement('tr'); tr.className = 'fd-total'; tr.append(td('Total', 'fd-l'), td(''), td(money2(cur.reduce((s, r) => s + r.balance, 0)))); el.append(tr);
  });

  // ---- charts ----
  dash.draw('vendorChart', (el) => {
    const s = st('vendors', 'period'); if (s !== 'ok') return placeholder(el, s);
    const per = period();
    const top = rows('vendors').filter((r) => r.book === book()).slice(0, 5);
    if (!top.length) return placeholder(el, 'ok', 'No spending in this range.');
    window.FD.lineChart(el, { labels: per.map((m) => m.label), aria: `Monthly spending at the top five vendors: ${top.map((t) => t.vendor).join(', ')}`,
      series: top.map((t) => ({ name: t.vendor, points: per.map((m) => ({ label: m.label, v: t.series[m.i] })) })) });
  });
  dash.draw('flowChart', (el) => {
    const s = st('monthly'); if (s !== 'ok') return placeholder(el, s);
    const r = rows('monthly').filter((x) => x.book === book());
    if (!r.length) return placeholder(el, 'ok', 'No months in this range.');
    window.FD.groupedBars(el, { aria: 'Income and spending by month',
      groups: r.map((x) => ({ label: x.label, values: [{ name: 'Income', v: x.income, color: dash.colors[0] }, { name: 'Spending', v: x.spend, color: dash.colors[1] }],
        extra: [`Net ${money0(x.net)}`].concat(x.income > 0 ? [`Kept ${Math.round((x.net / x.income) * 100)}% of income`] : []).concat(x.oneTime ? [`Plus one-time items: ${money0(x.oneTime)}`] : []) })) });
  });
  const pickCat = (name) => { setTxSearch(''); dash.setParams({ cat: P().cat === name ? null : name }); };
  dash.draw('catChart', (el) => {
    const s = st('cat_trend', 'period'); if (s !== 'ok') return placeholder(el, s);
    const per = period();
    const c = rows('cat_trend').filter((r) => r.book === book() && r.total > 0);
    if (!c.length) return placeholder(el, 'ok', 'No spending in this range.');
    const topN = c.slice(0, 7), rest = c.slice(7);
    const series = topN.map((r) => ({ name: r.category, values: r.series }));
    if (rest.length) series.push({ name: 'Everything else', color: 'var(--series-6)', values: per.map((m) => rest.reduce((t, r) => t + r.series[m.i], 0)) });
    window.FD.stackedBars(el, { labels: per.map((m) => m.label), series, aria: 'Spending by category, month by month',
      onPick: (name) => { if (name !== 'Everything else') pickCat(name); } });
  });
  const balLines = (el, kinds, emptyMsg) => {
    const s = st('balances', 'period'); if (s !== 'ok') return placeholder(el, s);
    const per = period();
    const b = rows('balances').filter((r) => r.book === book() && kinds.includes(r.kind));
    const accts = [...new Set(b.map((r) => r.label))];
    if (!accts.length && !(kinds.includes('investment') && sharedIn().some((d) => d.kind === 'investment' && d.history))) return placeholder(el, 'ok', emptyMsg);
    window.FD.lineChart(el, { labels: per.map((m) => m.label), zero: false, aria: `Month-end balances: ${accts.join(', ')}`,
      series: [...accts.map((a) => ({ name: a, points: per.map((m) => { const r = b.find((x) => x.label === a && x.month === m.month); return { label: m.label, v: r ? r.balance : null, note: r && r.estimate ? 'estimate' : '' }; }) })),
        ...(kinds.includes('investment') ? sharedIn().filter((d) => d.kind === 'investment' && d.history && shIncl(d).inv).map((d) => ({ name: `${d.name} (${d.owner || d.srcLabel})`, points: per.map((m) => { const h = d.history.find((x) => x[0] === m.month); return { label: m.label, v: h ? h[1] : null, note: 'shared' }; }) })) : [])] });
  };
  dash.draw('investChart', (el) => balLines(el, ['investment'], 'No investment balances in this range.'));
  dash.draw('loanChart', (el) => balLines(el, ['mortgage', 'loan'], 'No mortgage or loan balances in this range.'));
  dash.draw('depositChart', (el) => {
    const s = st('balance_totals', 'period'); if (s !== 'ok') return placeholder(el, s);
    const per = period();
    const t = rows('balance_totals').filter((r) => r.book === book() && r.kind === 'deposit');
    if (!t.length) return placeholder(el, 'ok', 'No balances in this range.');
    window.FD.lineChart(el, { labels: per.map((m) => m.label), zero: false, aria: 'Checking and savings balance by month',
      series: [{ name: 'Checking & savings', points: per.map((m) => { const r = t.find((x) => x.month === m.month); return { label: m.label, v: r ? r.total : null }; }) }] });
  });

  // ---- category table ----
  dash.draw('catChip', (el) => { el.textContent = P().cat || ''; });
  dash.draw('catRows', (el) => {
    el.replaceChildren();
    if (st('cat_trend') !== 'ok') return;
    const cmp = !!P().compare, sel = P().cat;
    const c = rows('cat_trend').filter((r) => r.book === book());
    if (!c.length) return empty(el, 7, 'No spending in this range.');
    for (const r of c) {
      const tr = document.createElement('tr'); tr.dataset.key = enc(r.key); tr.className = 'fd-click' + (sel === r.category ? ' is-sel' : '');
      tr.addEventListener('click', () => pickCat(r.category));
      tr.append(td(r.category), td(money0(r.total)), td(money0(r.avg)), td(`${r.share}%`));
      if (cmp) {
        tr.append(td(r.prevTotal === null ? '–' : money0(r.prevTotal)));
        const c2 = td(r.change === null ? '–' : (r.change >= 0 ? '+' : '−') + money0(Math.abs(r.change)), r.change > 0 ? 'fd-bad' : r.change < 0 ? 'fd-good' : '');
        tr.append(c2);
      }
      const sp = document.createElement('td'); window.FD.sparkline(sp, r.series); tr.append(sp);
      el.append(tr);
    }
  });

  // ---- vendors ----
  let vq = '';
  q('fd-vsearch').forEach((inp) => inp.addEventListener('input', () => { vq = inp.value.trim().toLowerCase(); dash.draw('vendorRows'); dash.draw('vendorMore'); }));
  const vendorMatches = () => { const cat = P().cat; return rows('vendors').filter((x) => x.book === book() && (!vq || x.vendor.toLowerCase().includes(vq)) && (!cat || x.categories.includes(cat))); };
  dash.draw('vendorRows', (el) => {
    el.replaceChildren();
    if (st('vendors') !== 'ok') return;
    const v = vendorMatches();
    if (!v.length) return empty(el, 6, 'No vendors match.');
    const cat = P().cat;
    if (cat) v.sort((a, b) => (b.byCategory[cat] || 0) - (a.byCategory[cat] || 0));
    for (const x of v.slice(0, 25)) {
      const tr = document.createElement('tr'); tr.dataset.key = enc(x.key); tr.className = 'fd-click';
      tr.title = 'Show this vendor’s transactions';
      tr.addEventListener('click', () => goTx({ search: x.vendor, cat: P().cat || null }));
      tr.append(td(x.vendor), td(money0(x.total)), td(money0(x.avg)), td(`${x.share}%`));
      const sp = document.createElement('td'); window.FD.sparkline(sp, x.series); tr.append(sp);
      if (cat) tr.insertBefore(td(money0(x.byCategory[cat] || 0)), tr.children[1]);
      el.append(tr);
    }
  });
  dash.draw('vendorMore', (el) => { const n = vendorMatches().length; el.textContent = n > 25 ? `Showing the top 25 of ${n} vendors. Search to find the rest.` : ''; });

  // ---- subscriptions ----
  // vendors marked "Not recurring" (e.g. Venmo): left out of subscriptions, recurring bills, price changes, bill reminders and forecasts
  const notRecList = () => prefGet('notRecurring', []) || [];
  const setNotRec = async (vendor, on) => { const cur = notRecList().filter((v) => v.toLowerCase() !== vendor.toLowerCase()); await prefSet('notRecurring', on ? [...cur, vendor] : cur); };
  const notRecBtn = (vendor) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'fd-link fd-notrec'; b.textContent = 'Not recurring'; b.title = `${vendor} isn\u2019t a subscription or regular bill: stop treating it as one`;
    b.addEventListener('click', async (e) => { e.stopPropagation(); b.disabled = true; try { await setNotRec(vendor, true); } catch (err) { b.disabled = false; alert('Not saved: ' + err.message); } }); return b; };
  dash.draw('notRecRows', (el) => {
    el.replaceChildren(); const l = notRecList(); if (!l.length) return;
    const p = document.createElement('p'); p.className = 'fd-note'; p.append('Not treated as recurring: ');
    l.forEach((v, i) => { const sp = document.createElement('span'); sp.className = 'fd-pill'; sp.textContent = v + ' '; const x = document.createElement('button'); x.type = 'button'; x.className = 'fd-link'; x.textContent = '×'; x.title = `Treat ${v} as recurring again`; x.setAttribute('aria-label', x.title);
      x.addEventListener('click', () => setNotRec(v, false)); sp.append(x); p.append(sp, i < l.length - 1 ? ' ' : ''); });
    el.append(p);
  });
  dash.draw('subsRows', (el) => {
    el.replaceChildren();
    if (st('subs') !== 'ok') return;
    const r = rows('subs').filter((x) => x.book === book());
    for (const kind of ['Subscription', 'Recurring bill']) {
      const g = r.filter((x) => x.kind === kind);
      if (!g.length) continue;
      const h = document.createElement('tr'); h.className = 'fd-group';
      const c = td(kind === 'Subscription' ? 'Subscriptions' : 'Recurring bills'); c.colSpan = 6; h.append(c); el.append(h);
      for (const x of g) {
        const tr = document.createElement('tr'); tr.dataset.key = enc(x.key);
        const vc = td(x.vendor); if (!document.body.classList.contains('fd-readonly')) vc.append(' ', notRecBtn(x.vendor));
        tr.append(vc, td(money2(x.lastCharge)), td(String(x.months)), td(money2(x.avg)), td(money0(x.yearly)));
        const sp = document.createElement('td'); window.FD.sparkline(sp, x.series); tr.append(sp);
        el.append(tr);
      }
    }
    if (!r.length) empty(el, 6, 'No subscriptions found in this range.');
  });

  // ---- budget vs actual ----
  dash.draw('budgetMonth', (sel) => {
    const per = period();
    sel.replaceChildren(...per.slice().reverse().map((m) => new Option(longName(m.month), m.month)));
    const want = P().bmonth;
    sel.value = per.some((m) => m.month === want) ? want : (per.length ? per[per.length - 1].month : '');
    sel.onchange = () => dash.setParams({ bmonth: sel.value });
  });
  const budgetMonth = () => { const per = period(), want = P().bmonth; return per.some((x) => x.month === want) ? want : per.length ? per[per.length - 1].month : null; };
  dash.draw('budgetChart', (el) => {
    const s = st('categories', 'period'); if (s !== 'ok') return placeholder(el, s);
    const m = budgetMonth();
    const r = rows('categories').filter((x) => x.book === book() && x.month === m && (x.actual || x.available))
      .sort((a, b) => Math.max(b.actual, b.available) - Math.max(a.actual, a.available))
      .map((x) => ({ label: x.category, actual: x.actual, planned: x.available, carry: x.carry, projected: x.projected, key: x.key }));
    if (!r.length) return placeholder(el, 'ok', 'No spending or budget for this month.');
    window.FD.budgetBars(el, { rows: r, source: 'categories', aria: `Spending vs budget by category for ${m}` });
  });
  dash.draw('budgetRows', (el) => {
    el.replaceChildren();
    if (st('categories') !== 'ok') return;
    const last = lastMonth(); if (!last) return;
    const mine = new Set(rows('budgets').filter((b) => b.book === book()).map((b) => b.category));
    const r = rows('categories').filter((x) => x.book === book() && x.month === last.month && x.planned > 0).sort((a, b) => b.planned - a.planned);
    if (!r.length) return empty(el, 6, 'No budgets yet. Use the form to set one.');
    for (const x of r) {
      const tr = document.createElement('tr'); tr.dataset.key = enc(x.key);
      tr.append(td(x.category), td(money0(x.planned)), td(x.rollover ? money0(x.carry) : '–'), td(money0(x.actual)), td(mine.has(x.category) ? 'This page' : 'Sheet', 'fd-l'));
      const c = document.createElement('td');
      const ed = document.createElement('button'); ed.type = 'button'; ed.className = 'fd-btn fd-quiet fd-sm'; ed.textContent = 'Change';
      ed.addEventListener('click', () => fillBudget(x.category, x.planned, x.rollover));
      c.append(ed);
      {
        const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'fd-btn fd-quiet fd-sm'; rm.textContent = 'Remove';
        rm.title = `Stop budgeting ${x.category} from ${last.label || last.month} on (earlier months keep their history)`;
        rm.addEventListener('click', async () => {
          if (!confirm(`Remove the ${x.category} budget from ${last.label || last.month} onward? Earlier months keep their budget history.`)) return;
          rm.disabled = true;
          try {
            const d = await db(), list = rows('budgets').filter((b) => b.book === book() && b.category === x.category);
            // budgets set on this page from this month on are deleted outright
            for (const b of list.filter((b) => b.from >= last.month)) await d.doc('data/household/budgets/' + b.id).delete();
            // anything still planned (an earlier page budget or the imported sheet's plan) is switched off with a $0 budget from this month
            const still = list.some((b) => b.from < last.month) || !mine.has(x.category) || x.planned > 0;
            if (still) await d.collection('data/household/budgets').add({ book: book(), category: x.category.slice(0, 40), amount: 0, from: last.month, rollover: false, createdAt: new Date().toISOString() });
          } catch { rm.disabled = false; rm.textContent = 'Not removed'; }
        });
        c.append(rm);
      }
      tr.append(c); el.append(tr);
    }
  });
  const fillBudget = (cat, amount, roll) => {
    document.querySelectorAll('#fd-budget-form').forEach((f) => {
      f.elements.category.value = cat; f.elements.amount.value = amount || ''; f.elements.rollover.checked = !!roll;
      if (!f.elements.from.value) f.elements.from.value = lastMonth() ? lastMonth().month : '';
      f.elements.amount.focus();
    });
  };
  // Budget starter: suggest a budget for each everyday category from what was actually spent in the last 3 full months.
  let starterOpen = false, starterSkip = new Set(), starterAmt = {};
  dash.draw('budgetStarter', (el) => {
    el.replaceChildren(); if (st('txns', 'budgets') !== 'ok' || document.body.classList.contains('fd-readonly')) return;
    const bk = book(), now = new Date(), months = [1, 2, 3].map((k) => { const d = new Date(now.getFullYear(), now.getMonth() - k, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
    const have = new Set((dash.data('budgets').data || []).filter((b) => b.book === bk).map((b) => String(b.category).toLowerCase()));
    const sum = {}, seen = {};
    for (const t of dash.data('txns').data || []) {
      if (t.book !== bk || t.type !== 'expense' || t.oneTime || t.ignored || !months.includes(t.month)) continue;
      const c = t.category || 'Uncategorized'; if (/^(uncategorized|transfer)$/i.test(c)) continue;
      sum[c] = (sum[c] || 0) + Number(t.amount || 0); (seen[c] = seen[c] || new Set()).add(t.month);
    }
    const round = (v) => (v >= 500 ? Math.ceil(v / 50) * 50 : v >= 100 ? Math.ceil(v / 10) * 10 : Math.ceil(v / 5) * 5);
    const sug = Object.entries(sum).map(([c, v]) => ({ c, avg: v / 3, months: seen[c].size })).filter((x) => !have.has(x.c.toLowerCase()) && x.avg >= 20 && x.months >= 2)
      .sort((a, b) => b.avg - a.avg).slice(0, 12).map((x) => ({ ...x, amt: starterAmt[x.c] ?? round(x.avg) }));
    if (!sug.length) return;
    const box = document.createElement('div'); box.className = 'fd-card fd-starter';
    const h = document.createElement('h3'); h.textContent = have.size ? 'More budget ideas from your spending' : 'Start with budgets from your spending'; box.append(h);
    if (!starterOpen) {
      const p = document.createElement('p'); p.className = 'fd-note'; p.textContent = `Based on your last 3 months, here ${sug.length === 1 ? "is 1 suggested monthly budget" : `are ${sug.length} suggested monthly budgets`}, about what you usually spend in each category, rounded up. Categorize your spending first to get more.`;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'fd-btn'; b.textContent = 'See suggestions'; b.addEventListener('click', () => { starterOpen = true; dash.draw('budgetStarter'); });
      box.append(p, b); el.append(box); return;
    }
    const p = document.createElement('p'); p.className = 'fd-note'; p.textContent = 'Untick any you don’t want and adjust the amounts, then add them all at once. They start this month; you can change any of them later.'; box.append(p);
    const tb = document.createElement('table'); tb.className = 'fd-table';
    const hr = document.createElement('tr'); for (const x of ['', 'Category', 'Usual month', 'Budget']) { const th = document.createElement('th'); th.textContent = x; hr.append(th); } tb.append(hr);
    for (const x of sug) {
      const tr = document.createElement('tr'); const c0 = document.createElement('td'), cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !starterSkip.has(x.c); cb.setAttribute('aria-label', 'Add ' + x.c);
      cb.addEventListener('change', () => { if (cb.checked) starterSkip.delete(x.c); else starterSkip.add(x.c); }); c0.append(cb);
      const c3 = document.createElement('td'), inp = document.createElement('input'); inp.type = 'number'; inp.min = '0'; inp.step = '5'; inp.value = x.amt; inp.className = 'fd-in'; inp.style.width = '7em'; inp.setAttribute('aria-label', 'Budget for ' + x.c);
      inp.addEventListener('input', () => { starterAmt[x.c] = Number(inp.value) || 0; }); c3.append(inp);
      tr.append(c0, td(x.c), td(money0(x.avg)), c3); tb.append(tr);
    }
    const sc = document.createElement('div'); sc.className = 'fd-scroll'; sc.append(tb); box.append(sc);
    const msg = document.createElement('p'); msg.className = 'fd-note';
    const add = document.createElement('button'); add.type = 'button'; add.className = 'fd-btn'; add.textContent = 'Add these budgets';
    add.addEventListener('click', async () => {
      const pick = sug.filter((x) => !starterSkip.has(x.c) && (starterAmt[x.c] ?? x.amt) > 0); if (!pick.length) return;
      add.disabled = true; const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      try { const d = await db(); if (!d) throw new Error('no db');
        for (const x of pick) await d.collection('data/household/budgets').add({ book: bk, category: x.c.slice(0, 40), amount: Math.round((starterAmt[x.c] ?? x.amt) * 100) / 100, from, rollover: false, createdAt: new Date().toISOString() });
        starterOpen = false; starterAmt = {}; msg.textContent = `Added ${pick.length} budgets.`; }
      catch (e) { add.disabled = false; msg.className = 'fd-note fd-bad'; msg.textContent = 'Couldn’t add them: ' + ((e && e.message) || e); }
    });
    const later = document.createElement('button'); later.type = 'button'; later.className = 'fd-btn fd-quiet'; later.textContent = 'Not now'; later.addEventListener('click', () => { starterOpen = false; dash.draw('budgetStarter'); });
    const row = document.createElement('div'); row.className = 'fd-row'; row.append(add, later); box.append(row, msg); el.append(box);
  });
  const BUD = ['fd-bud-ok', 'fd-bud-err', 'fd-bud-miss'];
  const show = (ids, on) => ids.forEach((id) => q(id).forEach((p) => { p.hidden = id !== on; }));
  q('fd-budget-form').forEach((f) => {
    f.addEventListener('focusin', () => { if (!f.elements.from.value && lastMonth()) f.elements.from.value = lastMonth().month; });
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const cat = f.elements.category.value.trim(), amt = Number(f.elements.amount.value), from = f.elements.from.value || (lastMonth() && lastMonth().month);
      if (!cat || !isFinite(amt) || amt < 0 || !/^\d{4}-\d{2}$/.test(from || '')) { show(BUD, 'fd-bud-miss'); return; }
      try {
        const d = await db(); if (!d) throw new Error('no db');
        await d.collection('data/household/budgets').add({ book: book(), category: cat.slice(0, 40), amount: Math.round(amt * 100) / 100, from, rollover: f.elements.rollover.checked, createdAt: new Date().toISOString() });
        show(BUD, 'fd-bud-ok'); f.reset();
      } catch { show(BUD, 'fd-bud-err'); }
    });
  });
  dash.draw('catList', (dl) => {
    const base = ['Groceries', 'Dining', 'Travel', 'Hobbies', 'Gifts', 'Health/medical', 'Rent / Mortgage', 'Subscriptions', 'Utilities', 'Phone', 'Insurance', 'Home Improvement', 'Debt', 'Other', 'Paycheck', 'Bonus', 'Interest', 'Reimbursement'];
    const all = [...new Set([...base, ...rows('txns').map((t) => t.category).filter((c) => c && c !== 'Uncategorized' && c !== 'Transfer')])].sort();
    dl.replaceChildren(...all.map((c) => { const o = document.createElement('option'); o.value = c; return o; }));
  });

  // ---- transactions ----
  let tq = '', tLimit = 50;
  const setTxSearch = (v) => { tq = v.toLowerCase(); tLimit = 50; q('fd-tq').forEach((i) => { i.value = v; }); dash.draw('txRows'); dash.draw('txCount'); };
  q('fd-tq').forEach((i) => i.addEventListener('input', () => { tq = i.value.trim().toLowerCase(); tLimit = 50; dash.draw('txRows'); dash.draw('txCount'); }));
  q('fd-ttype').forEach((s) => s.addEventListener('change', () => { tLimit = 50; dash.draw('txRows'); dash.draw('txCount'); }));
  q('fd-tneeds').forEach((c) => c.addEventListener('change', () => { tLimit = 50; dash.draw('txRows'); dash.draw('txCount'); }));
  q('fd-tmore').forEach((b) => b.addEventListener('click', () => { tLimit += 100; dash.draw('txRows'); dash.draw('txCount'); }));
  q('fd-tedit').forEach((c) => c.addEventListener('change', () => dash.draw('txRows')));
  // Remember table settings, columns and column widths in this browser.
  const TP = (() => { try { return JSON.parse(localStorage.getItem('fd-tx-prefs') || '{}') || {}; } catch { return {}; } })();
  const tpSave = () => { try { localStorage.setItem('fd-tx-prefs', JSON.stringify(TP)); } catch {} };
  for (const id of ['fd-tedit', 'fd-tneeds']) q(id).forEach((c) => { if (id in TP) c.checked = !!TP[id]; c.addEventListener('change', () => { TP[id] = c.checked; tpSave(); }); });
  q('fd-ttype').forEach((c) => { if (TP['fd-ttype'] != null) c.value = TP['fd-ttype']; c.addEventListener('change', () => { TP['fd-ttype'] = c.value; tpSave(); }); });
  const COLS = { date: { label: 'Date', w: 96 }, vendor: { label: 'Vendor', l: 1 }, description: { label: 'Description', l: 1 }, category: { label: 'Category', l: 1 },
    type: { label: 'Counts as', l: 1, w: 120 }, amount: { label: 'Amount', w: 110 }, source: { label: 'Account', l: 1 }, tags: { label: 'Tags', l: 1 } };
  const DEF = ['date', 'vendor', 'category', 'amount', 'source'];
  const cols = () => { const c = (Array.isArray(TP.cols) ? TP.cols : DEF).filter((k) => COLS[k]); return c.length ? c : DEF; };
  let ro = null;
  dash.draw('txHead', (tr) => {
    tr.replaceChildren();
    for (const k of cols()) {
      const th = document.createElement('th'); th.dataset.field = k; th.dataset.col = k; th.textContent = COLS[k].label;
      th.className = (COLS[k].l ? 'fd-l ' : '') + 'c-' + k;
      const w = (TP.cw || {})[k] || COLS[k].w; if (w) th.style.width = w + 'px';
      tr.append(th);
    }
    const last = document.createElement('th'); last.style.width = '140px'; tr.append(last);
    if ('ResizeObserver' in window) {
      if (ro) ro.disconnect();
      let ready = false; setTimeout(() => { ready = true; }, 800);
      ro = new ResizeObserver(() => { if (!ready) return; TP.cw = TP.cw || {}; tr.querySelectorAll('th[data-col]').forEach((th) => { TP.cw[th.dataset.col] = Math.round(th.getBoundingClientRect().width); }); tpSave(); });
      tr.querySelectorAll('th[data-col]').forEach((th) => ro.observe(th));
    }
  });
  (() => {
    const btn = document.getElementById('fd-colbtn'), pan = document.getElementById('fd-colpanel');
    if (btn && pan) {
      const close = () => { pan.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
      btn.addEventListener('click', (e) => { e.stopPropagation(); if (!pan.hidden) return close(); pan.hidden = false; btn.setAttribute('aria-expanded', 'true'); const r = btn.getBoundingClientRect(), host = pan.offsetParent?.getBoundingClientRect() || { left: 0, top: 0 }; pan.style.top = r.bottom - host.top + 6 + 'px'; pan.style.left = Math.max(0, Math.min(r.left - host.left, (pan.offsetParent?.clientWidth || innerWidth) - pan.offsetWidth - 4)) + 'px'; });
      document.getElementById('fd-colclose')?.addEventListener('click', close);
      document.addEventListener('pointerdown', (e) => { if (!pan.hidden && !pan.contains(e.target) && e.target !== btn) close(); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pan.hidden) close(); });
    }
    document.getElementById('fd-rulesbtn')?.addEventListener('click', () => { const r = document.getElementById('rules'); if (!r) return; const nav = document.getElementById('fd-nav'); window.scrollTo({ top: r.getBoundingClientRect().top + scrollY - (nav ? nav.offsetHeight : 0) - 8, behavior: 'smooth' }); });
  })();
  dash.draw('colPicker', (el) => {
    el.replaceChildren();
    const cur = cols(), order = [...cur, ...Object.keys(COLS).filter((k) => !cur.includes(k))];
    const set = (c) => { TP.cols = c; tpSave(); dash.draw('txHead'); dash.draw('txRows'); dash.draw('colPicker'); };
    for (const k of order) {
      const row = document.createElement('div'); row.className = 'fd-colrow';
      const lab = document.createElement('label'); lab.className = 'fd-check';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = cur.includes(k);
      cb.addEventListener('change', () => { const c = cols().filter((x) => x !== k); if (cb.checked) c.push(k); if (c.length) set(c); else cb.checked = true; });
      lab.append(cb, ' ' + COLS[k].label); row.append(lab);
      const i = cur.indexOf(k);
      if (i >= 0) for (const [txt, d] of [['↑', -1], ['↓', 1]]) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'fd-btn fd-quiet fd-sm'; b.textContent = txt;
        b.setAttribute('aria-label', `Move ${COLS[k].label} ${d < 0 ? 'left' : 'right'}`); b.disabled = i + d < 0 || i + d >= cur.length;
        b.addEventListener('click', () => { const c = cur.slice(); [c[i], c[i + d]] = [c[i + d], c[i]]; set(c); });
        row.append(b);
      }
      el.append(row);
    }
    const r = document.createElement('button'); r.type = 'button'; r.className = 'fd-btn fd-quiet fd-sm'; r.textContent = 'Reset columns';
    r.addEventListener('click', () => { delete TP.cw; set(DEF.slice()); }); el.append(r);
  });
  const offers = new Map();
  const ruleText = (t) => String(t.description || '').replace(/[#*].*$/, '').replace(/\d{3,}.*$/, '').trim().slice(0, 30);
  // Keep the scroll position while the page refreshes after a change.
  let keepY = null;
  dash.onData(() => { if (keepY === null) return; const y = keepY; requestAnimationFrame(() => window.scrollTo(0, y)); if (st('txns') === 'ok') setTimeout(() => { keepY = null; }, 400); });
  const selAll = (i) => i.addEventListener('focus', () => setTimeout(() => { try { i.select(); i.setSelectionRange(0, i.value.length); } catch {} }, 0)); // tap a field: whole value selected, ready to type over
  const parseTags = (s) => [...new Set(String(s || '').split(',').map((x) => x.trim().slice(0, 30)).filter(Boolean))].slice(0, 5);
  const quickSave = async (t, extra, btn) => {
    keepY = window.scrollY;
    if (btn) btn.disabled = true;
    try { const d = await db(); if (!d) throw new Error('no db');
      await d.collection('data/household/edits').add({ book: book(), txKey: t.key, vendor: t.vendor, category: t.category, type: t.type, oneTime: !!t.oneTime, tags: t.tags || [], splits: null, ...extra, createdAt: new Date().toISOString() }); }
    catch { if (btn) { btn.disabled = false; btn.textContent = 'Not saved'; } }
  };
  const txMatches = () => {
    const inPer = new Set(period().map((m) => m.month)), cat = P().cat;
    const type = (document.querySelector('#fd-ttype') || {}).value || '';
    const needs = !!(document.querySelector('#fd-tneeds') || {}).checked;
    return rows('txns').filter((t) => t.book === book() && inPer.has(t.month) && (!cat || t.category === cat) && (!type || t.type === type)
      && (!needs || t.category === 'Uncategorized')
      && (!tq || `${t.vendor} ${t.description} ${t.category} ${t.source} ${(t.tags || []).join(' ')}`.toLowerCase().includes(tq)))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.amount - a.amount);
  };
  dash.draw('txNeeds', (el) => {
    const inPer = new Set(period().map((m) => m.month));
    el.textContent = String(rows('txns').filter((t) => t.book === book() && inPer.has(t.month) && t.category === 'Uncategorized').length);
  });
  dash.draw('txCount', (el) => {
    const n = txMatches().length;
    el.textContent = st('txns') !== 'ok' ? '' : n ? `${Math.min(n, tLimit)} of ${n} transactions` : 'No transactions match.';
    q('fd-tmore').forEach((b) => { b.hidden = n <= tLimit; });
  });
  const TYPE = { expense: 'Expense', income: 'Income', transfer: 'Transfer' };
  dash.draw('txRows', (el) => {
    if (st('txns') !== 'ok') return; // keep the old rows while refreshing so the page doesn't jump
    el.replaceChildren();
    for (const t of txMatches().slice(0, tLimit)) {
      const tr = document.createElement('tr'); tr.dataset.key = enc(t.key);
      const v = td(t.vendor); if (rcptKeys().has(t.splitOf || t.key)) { const r = document.createElement('span'); r.textContent = '📎 '; r.title = 'Has a receipt photo'; v.prepend(r); } if (t.edited || t.rule) { const b = document.createElement('span'); b.className = 'fd-pill'; b.textContent = t.edited ? 'edited' : 'rule'; v.append(' ', b); }
      const amt = td((t.type === 'income' ? '+' : '') + money2(t.amount), t.type === 'income' ? 'fd-good' : t.type === 'transfer' ? 'fd-zero' : '');
      const cat = td(t.category + (t.oneTime ? ' · one-time' : '') + (t.type === 'transfer' ? '' : t.type === 'income' ? ' · income' : ''), 'fd-l' + (t.category === 'Uncategorized' ? ' fd-warn' : ''));
      const descCell = () => { const c = td(t.description || '', 'fd-l fd-zero'); c.title = t.description || ''; return c; };
      const base = { date: () => td(t.date || t.month), amount: () => amt, source: () => td(t.source, 'fd-l fd-zero'), description: descCell,
        type: () => td(TYPE[t.type] || t.type, 'fd-l'), vendor: () => v, category: () => cat, tags: () => td((t.tags || []).join(', '), 'fd-l') };
      const inline = !!(document.querySelector('#fd-tedit') || {}).checked && !t.splitOf && t.source !== 'Manual entry';
      if (inline) {
        let ruleBtn = null;
        const cell = (inp, cls) => { const c = document.createElement('td'); if (cls) c.className = cls; c.append(inp); return c; };
        const vi = document.createElement('input'); vi.type = 'text'; vi.value = t.vendor; vi.className = 'fd-inl'; vi.setAttribute('aria-label', 'Vendor');
        vi.addEventListener('change', () => { if (vi.value.trim()) quickSave(t, { vendor: vi.value.trim().slice(0, 40) }); });
        const ci = document.createElement('input'); ci.type = 'text'; ci.value = t.category; ci.className = 'fd-inl'; ci.setAttribute('list', 'fd-cats'); ci.setAttribute('aria-label', 'Category'); selAll(ci); selAll(vi);
        ci.addEventListener('change', () => {
          const v = ci.value.trim().slice(0, 40); if (!v) return;
          if (ruleText(t)) offers.set(t.key, { m: ruleText(t), cat: v });
          quickSave(t, { category: v });
        });
        const off = offers.get(t.key);
        if (off) {
          const a = document.createElement('button'); a.type = 'button'; a.className = 'fd-btn fd-quiet fd-sm';
          a.textContent = `Apply to all “${off.m}”`; a.style.marginTop = '2px';
          a.addEventListener('click', async () => {
            a.disabled = true;
            try { const d = await db(); await d.collection('data/household/rules').add({ book: book(), match: off.m, vendor: '', category: off.cat, type: '', oneTime: false, createdAt: new Date().toISOString() }); offers.delete(t.key); }
            catch { a.disabled = false; a.textContent = 'Not saved'; }
          });
          const x = document.createElement('button'); x.type = 'button'; x.className = 'fd-btn fd-quiet fd-sm'; x.textContent = '×';
          x.title = 'No thanks, just this transaction'; x.setAttribute('aria-label', 'Dismiss: don’t make a rule');
          x.addEventListener('click', () => { offers.delete(t.key); dash.draw('txRows'); });
          const w = document.createElement('div'); w.className = 'fd-nowrap'; w.append(a, x);
          ruleBtn = w;
        }
        const ti = document.createElement('select'); ti.className = 'dash-select fd-inl'; ti.setAttribute('aria-label', 'Counts as');
        for (const k of ['expense', 'income', 'transfer']) ti.append(new Option(TYPE[k], k));
        ti.value = t.type; ti.addEventListener('change', () => quickSave(t, { type: ti.value }));
        const tgi = document.createElement('input'); tgi.type = 'text'; tgi.value = (t.tags || []).join(', '); tgi.className = 'fd-inl'; tgi.placeholder = 'tag, tag';
        tgi.setAttribute('aria-label', 'Tags'); selAll(tgi); tgi.setAttribute('list', 'fd-tags'); tgi.addEventListener('change', () => quickSave(t, { tags: parseTags(tgi.value) }));
        const cc = cell(ci, 'fd-l'); if (ruleBtn) cc.append(ruleBtn);
        if (!cols().includes('type')) cc.append(ti);
        tr.append(...cols().map((k) => (k === 'vendor' ? cell(vi, 'fd-l') : k === 'category' ? cc : k === 'type' ? cell(ti, 'fd-l') : k === 'tags' ? cell(tgi, 'fd-l') : base[k]())));
      } else tr.append(...cols().map((k) => base[k]()));
      [...tr.children].forEach((c, i) => { const k = cols()[i]; if (k) c.classList.add('c-' + k); });
      const c = document.createElement('td'); c.className = 'fd-nowrap c-actions'; const b = document.createElement('button');
      b.type = 'button'; b.className = 'fd-btn fd-quiet fd-sm'; b.textContent = 'Edit';
      b.addEventListener('click', () => openEditor(t));
      const ig = document.createElement('button'); ig.type = 'button'; ig.className = 'fd-btn fd-quiet fd-sm';
      ig.textContent = t.source === 'Manual entry' ? 'Delete' : 'Ignore'; ig.style.color = 'var(--color-bad)';
      ig.addEventListener('click', async () => {
        if (t.source === 'Manual entry' && String(t.key).startsWith('m:')) { ig.disabled = true; try { const d = await db(); await d.doc('data/household/manual/' + String(t.key).slice(2)).delete(); } catch { ig.disabled = false; ig.textContent = 'Not deleted'; } return; }
        quickSave(t, { txKey: t.splitOf || t.key, ignored: true }, ig);
      });
      c.append(b, ' ', ig); tr.append(c); el.append(tr);
    }
  });

  // ---- transaction editor (a fixed form; scripts only set its values) ----
  let editing = null;
  const form = () => document.querySelector('#fd-tx-form');
  const openEditor = (t) => {
    const base = t.splitOf ? rows('txns').filter((x) => x.splitOf === t.splitOf) : [t];
    const total = base.reduce((s, x) => s + x.amount, 0);
    editing = { key: t.splitOf || t.key, total: Math.round(total * 100) / 100, t };
    const f = form(); if (!f) return;
    f.hidden = false;
    f.elements.vendor.value = t.vendor; f.elements.category.value = base.length > 1 ? '' : t.category;
    f.elements.type.value = t.type; f.elements.oneTime.checked = !!t.oneTime;
    if (f.elements.tags) f.elements.tags.value = (t.tags || []).join(', ');
    f.elements.split.checked = base.length > 1;
    for (let i = 1; i <= 4; i++) { const s = base.length > 1 ? base[i - 1] : null; f.elements['sc' + i].value = s ? s.category : ''; f.elements['sa' + i].value = s ? s.amount : ''; }
    f.elements.makeRule.checked = false;
    f.elements.match.value = String(t.description || '').replace(/[#*].*$/, '').replace(/\d{3,}.*$/, '').trim().slice(0, 30);
    q('fd-splits').forEach((d) => { d.hidden = !f.elements.split.checked; });
    q('fd-tx-reset').forEach((b) => { b.hidden = !t.edited; });
    q('fd-tx-ignore').forEach((b) => { b.textContent = t.source === 'Manual entry' ? 'Delete entry' : 'Ignore transaction'; });
    show(['fd-tx-ok', 'fd-tx-err', 'fd-tx-miss'], null);
    dash.draw('txEditTitle'); dash.draw('txEditDesc'); dash.draw('splitLeft'); dash.draw('txReceipt');
    f.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  // ---- receipt photos on a transaction ----
  const rcptKeys = () => new Set(rows('receipts').map((r) => r.txKey));
  const fileUrls = {};
  const fileUrl = async (id) => { if (fileUrls[id]) return fileUrls[id]; const r = await FDStore.fetch(`/api/books/${encodeURIComponent(window.HF.state.bookId)}/files/${encodeURIComponent(id)}`, {}); if (!r.ok) throw new Error('Not found'); return (fileUrls[id] = URL.createObjectURL(await r.blob())); };
  // shrink phone photos before saving: longest side 1600px, JPEG
  const shrink = (file) => new Promise((res, rej) => { const img = new Image(), u = URL.createObjectURL(file); img.onload = () => { const k = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u); res(c.toDataURL('image/jpeg', 0.82)); }; img.onerror = () => { URL.revokeObjectURL(u); rej(new Error('That file isn\u2019t a photo this device can read.')); }; img.src = u; });
  dash.draw('txReceipt', (el) => {
    el.replaceChildren(); if (!editing) return;
    const mine = rows('receipts').filter((r) => r.txKey === editing.key), ro = document.body.classList.contains('fd-readonly');
    const h = document.createElement('div'); h.className = 'fd-rb-h'; h.textContent = 'Receipt photos'; el.append(h);
    const wrap = document.createElement('div'); wrap.className = 'fd-rcpts'; el.append(wrap);
    mine.forEach((r) => { const f = document.createElement('figure'); const img = document.createElement('img'); img.alt = r.name || 'Receipt'; img.loading = 'lazy'; fileUrl(r.fileId).then((u) => { img.src = u; }).catch(() => { img.alt = 'Photo not found'; });
      img.addEventListener('click', () => fileUrl(r.fileId).then((u) => window.open(u, '_blank')).catch(() => {}));
      f.append(img); if (!ro) f.append(rbtn('Remove', async () => { if (!confirm('Remove this receipt photo?')) return; try { const d = await db(); await d.doc('data/household/receipts/' + r.id).delete(); await FDStore.fetch(`/api/books/${encodeURIComponent(window.HF.state.bookId)}/files/${encodeURIComponent(r.fileId)}`, { method: 'DELETE' }); } catch (e) { alert('Not removed: ' + e.message); } }));
      wrap.append(f); });
    if (ro) { if (!mine.length) el.append(phMsg('No receipt photos.')); return; }
    const lab = document.createElement('label'); lab.className = 'fd-btn fd-sm fd-quiet'; lab.textContent = mine.length ? '+ Add another photo' : '+ Add a receipt photo';
    const fi = document.createElement('input'); fi.type = 'file'; fi.accept = 'image/*'; fi.setAttribute('capture', 'environment'); fi.hidden = true; lab.append(fi);
    const msg = phMsg('');
    fi.addEventListener('change', async () => { const file = fi.files[0]; if (!file) return; msg.className = 'fd-note'; msg.textContent = 'Saving photo…';
      try { const url = await shrink(file), r = await FDStore.fetch(`/api/books/${encodeURIComponent(window.HF.state.bookId)}/files`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mime: 'image/jpeg', data: url.split(',')[1] }) });
        const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Not saved');
        const d = await db(); await d.collection('data/household/receipts').add({ book: book(), txKey: editing.key, fileId: j.id, name: file.name || 'Receipt', mime: 'image/jpeg', size: Math.round(url.length * 0.75) }); msg.textContent = ''; }
      catch (e) { msg.className = 'fd-note fd-bad'; msg.textContent = 'Not saved: ' + e.message; } });
    el.append(lab, msg);
  });
  dash.draw('txEditTitle', (el) => {
    if (!editing) { el.textContent = ''; return; }
    const t = editing.t;
    el.textContent = `${t.date || t.month} · ${money2(editing.total)} · ${t.source} · “${t.description || t.vendor}”`;
  });
  dash.draw('txEditDesc', (el) => {
    el.replaceChildren(); if (!editing) return;
    const b = document.createElement('strong'); b.textContent = 'Description: ';
    const s = document.createElement('span'); s.textContent = editing.t.description || '(none)'; s.style.userSelect = 'all';
    el.append(b, s);
    if (editing.t.matched) { const m = document.createElement('div'); m.className = 'fd-zero'; m.textContent = `↔ Matched transfer with ${editing.t.matched}, so it isn’t counted as spending. Change “Counts as” to override.`; el.append(m); }
  });
  const splitTotal = () => { const f = form(); let s = 0; for (let i = 1; i <= 4; i++) s += Number(f.elements['sa' + i].value) || 0; return Math.round(s * 100) / 100; };
  dash.draw('splitLeft', (el) => {
    if (!editing || !form()) { el.textContent = ''; return; }
    const left = Math.round((editing.total - splitTotal()) * 100) / 100;
    el.textContent = left === 0 ? 'Split adds up.' : `${money2(Math.abs(left))} ${left > 0 ? 'still to assign' : 'too much'}.`;
    el.className = 'fd-note ' + (left === 0 ? 'fd-good' : 'fd-bad');
  });
  q('fd-tx-form').forEach((f) => {
    f.addEventListener('input', () => dash.draw('splitLeft'));
    f.elements.split.addEventListener('change', () => { q('fd-splits').forEach((d) => { d.hidden = !f.elements.split.checked; }); dash.draw('splitLeft'); });
    q('fd-tx-cancel').forEach((b) => b.addEventListener('click', () => { f.hidden = true; editing = null; }));
    q('fd-tx-reset').forEach((b) => b.addEventListener('click', async () => {
      if (!editing) return;
      try { const d = await db(); for (const e of rows('edits').filter((e) => e.txKey === editing.key)) await d.doc('data/household/edits/' + e.id).delete(); f.hidden = true; editing = null; }
      catch { show(['fd-tx-ok', 'fd-tx-err', 'fd-tx-miss'], 'fd-tx-err'); }
    }));
    q('fd-tx-ignore').forEach((b) => b.addEventListener('click', async () => {
      if (!editing) return;
      const ids = ['fd-tx-ok', 'fd-tx-err', 'fd-tx-miss'], E = f.elements, t = editing.t;
      try {
        const d = await db(); if (!d) throw new Error('no db');
        if (t.source === 'Manual entry' && String(editing.key).startsWith('m:')) {
          await d.doc('data/household/manual/' + String(editing.key).slice(2)).delete();
        } else if (E.makeRule.checked && E.match.value.trim()) {
          await d.collection('data/household/rules').add({ book: book(), match: E.match.value.trim().slice(0, 60), vendor: '', category: '', type: '', oneTime: false, ignore: true, createdAt: new Date().toISOString() });
        } else {
          await d.collection('data/household/edits').add({ book: book(), txKey: editing.key, vendor: '', category: '', type: '', oneTime: false, splits: null, ignored: true, createdAt: new Date().toISOString() });
        }
        show(ids, 'fd-tx-ok'); setTimeout(() => { f.hidden = true; editing = null; }, 600);
      } catch { show(ids, 'fd-tx-err'); }
    }));
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (!editing) return;
      const E = f.elements, ids = ['fd-tx-ok', 'fd-tx-err', 'fd-tx-miss'];
      let splits = null;
      if (E.split.checked) {
        splits = [];
        for (let i = 1; i <= 4; i++) { const c = E['sc' + i].value.trim(), a = Number(E['sa' + i].value); if (c && a) splits.push({ category: c.slice(0, 40), amount: Math.round(a * 100) / 100 }); }
        if (splits.length < 2 || Math.abs(splitTotal() - editing.total) > 0.009) { show(ids, 'fd-tx-miss'); return; }
      }
      const change = { vendor: E.vendor.value.trim().slice(0, 40), category: E.split.checked ? '' : E.category.value.trim().slice(0, 40), type: E.type.value, oneTime: E.oneTime.checked, tags: E.tags ? parseTags(E.tags.value) : editing.t.tags || [] };
      try {
        const d = await db(); if (!d) throw new Error('no db');
        if (E.makeRule.checked && E.match.value.trim() && !E.split.checked) {
          await d.collection('data/household/rules').add({ book: book(), match: E.match.value.trim().slice(0, 60), ...change, createdAt: new Date().toISOString() });
        } else {
          await d.collection('data/household/edits').add({ book: book(), txKey: editing.key, ...change, splits, createdAt: new Date().toISOString() });
        }
        show(ids, 'fd-tx-ok'); setTimeout(() => { f.hidden = true; editing = null; }, 900);
      } catch { show(ids, 'fd-tx-err'); }
    });
  });

  // ---- ignored transactions ----
  const ignMine = () => rows('ignored_txns').filter((t) => t.book === book());
  dash.draw('ignCount', (el) => { el.textContent = st('ignored_txns') === 'ok' ? `(${ignMine().length})` : ''; });
  dash.draw('ignRows', (el) => {
    if (st('ignored_txns') !== 'ok') return;
    el.replaceChildren();
    const r = ignMine();
    if (!r.length) return empty(el, 6, 'Nothing ignored. Open a transaction with Edit and choose “Ignore transaction”.');
    const byYou = new Set(rows('edits').filter((e) => e.ignored).map((e) => e.txKey));
    for (const t of r) {
      const tr = document.createElement('tr'); tr.dataset.key = enc(t.key);
      const mine = byYou.has(t.key);
      tr.append(td(t.date || t.month), td(t.vendor, 'fd-l'), td((t.type === 'income' ? '+' : '') + money2(t.amount)), td(t.source, 'fd-l fd-zero'),
        td(mine ? 'Ignored by you' : `Rule: ${t.rule}`, 'fd-l fd-zero'));
      const c = document.createElement('td');
      if (mine) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'fd-btn fd-quiet fd-sm'; b.textContent = 'Restore';
        b.addEventListener('click', async () => { b.disabled = true; try { const d = await db(); for (const e of rows('edits').filter((e) => e.txKey === t.key)) await d.doc('data/household/edits/' + e.id).delete(); } catch { b.disabled = false; b.textContent = 'Not restored'; } });
        c.append(b);
      } else { c.textContent = 'Remove the rule to restore'; c.className = 'fd-zero'; }
      tr.append(c); el.append(tr);
    }
  });

  // ---- rules ----
  let editRule = null;
  const _oldRuleRows = ((el) => {
    if (st('rules') !== 'ok') return;
    el.replaceChildren();
    const r = rows('rules').filter((x) => !x.book || x.book === book());
    if (!r.length) return empty(el, 5, 'No rules yet. Edit a transaction and tick “Do this for every transaction…” to make one.');
    for (const x of r) {
      const tr = document.createElement('tr'); tr.dataset.key = enc(x.id);
      const c = document.createElement('td'); c.className = 'fd-nowrap';
      const mk = (txt, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'fd-btn fd-quiet fd-sm'; b.textContent = txt; b.addEventListener('click', fn); return b; };
      if (editRule === x.id) {
        const inp = (val, ph) => { const i = document.createElement('input'); i.type = 'text'; i.value = val || ''; i.placeholder = ph; i.className = 'fd-inl'; return i; };
        const m = inp(x.match, 'text to match'), v = inp(x.vendor, '(no change)'), cg = inp(x.category, '(no change)'); cg.setAttribute('list', 'fd-cats');
        const ty = document.createElement('select'); ty.className = 'dash-select fd-inl';
        ty.append(new Option('(no change)', ''), ...['expense', 'income', 'transfer'].map((k) => new Option(TYPE[k], k)), new Option('Ignore', 'ignore'));
        ty.value = x.ignore ? 'ignore' : (x.type || '');
        const wrap = (n, cls) => { const d = document.createElement('td'); if (cls) d.className = cls; d.append(n); return d; };
        const iv = inp(x.ifVendor, 'and vendor contains (optional)'); iv.style.marginTop = '4px'; const mc = wrap(m); mc.append(iv);
        tr.append(mc, wrap(v, 'fd-l'), wrap(cg, 'fd-l'), wrap(ty, 'fd-l'));
        const sv = mk('Save', async () => {
          if (!m.value.trim()) return;
          sv.disabled = true;
          try {
            const d = await db();
            await d.collection('data/household/rules').add({ book: x.book || book(), match: m.value.trim().slice(0, 60), ifVendor: iv.value.trim().slice(0, 40), vendor: v.value.trim().slice(0, 40), category: cg.value.trim().slice(0, 40),
              type: ty.value === 'ignore' ? '' : ty.value, oneTime: !!x.oneTime, ignore: ty.value === 'ignore', createdAt: new Date().toISOString() });
            await d.doc('data/household/rules/' + x.id).delete();
            editRule = null;
          } catch { sv.disabled = false; sv.textContent = 'Not saved'; }
        });
        c.append(sv, ' ', mk('Cancel', () => { editRule = null; dash.draw('ruleRows'); }));
      } else {
        tr.append(td(`contains “${x.match}”` + (x.ifVendor ? ` and vendor has “${x.ifVendor}”` : '')), td(x.vendor || '–', 'fd-l'), td(x.category || '–', 'fd-l'), td(x.ignore ? 'Ignored' : TYPE[x.type] || '–', 'fd-l'));
        const b = mk('Remove', async () => { b.disabled = true; try { const d = await db(); await d.doc('data/household/rules/' + x.id).delete(); } catch { b.disabled = false; b.textContent = 'Not removed'; } });
        c.append(mk('Edit', () => { editRule = x.id; dash.draw('ruleRows'); }), ' ', b);
      }
      tr.append(c); el.append(tr);
    }
  });

  // ---- rule builder: IF all conditions match, SET the chosen fields ----
  const RF = { description: 'Description', vendor: 'Vendor', category: 'Category', type: 'Counts as', amount: 'Amount' };
  const AOPS = [['lt', 'is under'], ['gte', 'is at least'], ['gt', 'is over'], ['eq', 'equals']];
  const SF = { category: 'Category', vendor: 'Vendor', type: 'Counts as', tag: 'Add tag', ignore: 'Ignore' };
  const condsOf = (r) => (Array.isArray(r.conds) && r.conds.length ? r.conds
    : [...(r.match ? [{ field: 'description', op: 'contains', value: r.match }] : []), ...(r.ifVendor ? [{ field: 'vendor', op: 'contains', value: r.ifVendor }] : [])]);
  const groupsOf = (r) => (Array.isArray(r.groups) && r.groups.some((g) => Array.isArray(g) && g.length) ? r.groups.filter((g) => Array.isArray(g) && g.length) : [condsOf(r)]);
  const setsOf = (r) => [...(r.category ? [['category', r.category]] : []), ...(r.vendor ? [['vendor', r.vendor]] : []), ...(r.type ? [['type', r.type]] : []), ...(r.tag ? [['tag', r.tag]] : []), ...(r.ignore ? [['ignore', true]] : [])];
  const condText = (c) => (c.field === 'amount' ? `Amount ${(AOPS.find((o) => o[0] === c.op) || AOPS[0])[1]} ${money2(Number(c.value))}`
    : `${RF[c.field] || c.field} ${c.op === 'is' ? 'is' : 'contains'} “${c.field === 'type' ? TYPE[c.value] || c.value : c.value}”`);
  const setText = ([f, v]) => (f === 'ignore' ? 'Ignore it' : f === 'tag' ? `Tag + “${v}”` : `${SF[f]} = ${f === 'type' ? TYPE[v] || v : v}`);
  let rb = null; // the rule being built or edited: { id, conds: [{field, op, value}], sets: [[field, value]] }
  const newRb = () => ({ id: null, groups: [[{ field: 'description', op: 'contains', value: '' }]], sets: [['category', '']] });
  const groupText = (gs) => gs.map((g) => { const t = g.map(condText).join('  AND  '); return gs.length > 1 && g.length > 1 ? `( ${t} )` : t; }).join('   OR   ');
  const rsel = (opts, val, on) => { const s = document.createElement('select'); s.className = 'dash-select'; for (const [v, l] of opts) s.append(new Option(l, v)); s.value = val; s.addEventListener('change', () => { on(s.value); dash.draw('rulePreview'); }); return s; };
  const rin = (val, ph, on, list) => { const i = document.createElement('input'); i.type = 'text'; i.value = val || ''; i.placeholder = ph; if (list) i.setAttribute('list', list); i.addEventListener('input', () => { on(i.value); dash.draw('rulePreview'); }); return i; };
  const rbtn = (label, fn, quiet = true) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'fd-btn fd-sm' + (quiet ? ' fd-quiet' : ''); b.textContent = label; b.addEventListener('click', (e) => { fn(e); dash.draw('rulePreview'); }); return b; };
  const rhead = (t) => { const p = document.createElement('p'); p.className = 'fd-rb-h'; p.textContent = t; return p; };
  dash.draw('ruleBuilder', (el) => {
    el.replaceChildren();
    if (!rb) { el.append(rbtn('+ New rule', () => { rb = newRb(); dash.draw('ruleBuilder'); }, false)); return; }
    const box = document.createElement('div'); box.className = 'fd-rb';
    box.append(rhead((rb.id ? 'Edit rule' : 'New rule') + ' — IF'));
    rb.groups.forEach((conds, gi) => {
    if (gi) { const o = document.createElement('div'); o.className = 'fd-rb-or'; o.textContent = 'OR'; box.append(o); }
    const gbox = document.createElement('div'); gbox.className = 'fd-rb-group';
    if (rb.groups.length > 1) { const gh = document.createElement('div'); gh.className = 'fd-goal-top'; const gl = document.createElement('span'); gl.className = 'fd-zero'; gl.textContent = 'All of these:'; gh.append(gl, rbtn('Remove group', () => { rb.groups.splice(gi, 1); dash.draw('ruleBuilder'); })); gbox.append(gh); }
    conds.forEach((c, i) => {
      const row = document.createElement('div'); row.className = 'fd-rb-row';
      const a = document.createElement('span'); a.className = 'fd-rb-and'; a.textContent = i ? 'AND' : ''; row.append(a);
      row.append(rsel(Object.entries(RF), c.field, (v) => { c.field = v; if (v === 'type') { c.op = 'is'; c.value = 'expense'; } else if (v === 'amount') { c.op = 'lt'; c.value = ''; } else if (['lt', 'gt', 'gte', 'eq'].includes(c.op)) { c.op = 'contains'; c.value = ''; } else if (c.value === 'expense' || c.value === 'income' || c.value === 'transfer') c.value = ''; dash.draw('ruleBuilder'); }));
      if (c.field === 'type') row.append(document.createTextNode('is'), rsel(Object.entries(TYPE), c.value || 'expense', (v) => { c.value = v; }));
      else if (c.field === 'amount') { const n = rin(c.value, '15.00', (v) => { c.value = v; }); n.type = 'number'; n.step = '0.01'; n.min = '0'; row.append(rsel(AOPS, c.op, (v) => { c.op = v; }), document.createTextNode('$'), n); }
      else row.append(rsel([['contains', 'contains'], ['is', 'is exactly']], c.op, (v) => { c.op = v; }), rin(c.value, 'text', (v) => { c.value = v; }, c.field === 'category' ? 'fd-cats' : null));
      if (conds.length > 1) row.append(rbtn('×', () => { conds.splice(i, 1); dash.draw('ruleBuilder'); }));
      gbox.append(row);
    });
    gbox.append(rbtn('+ AND condition', () => { conds.push({ field: 'vendor', op: 'contains', value: '' }); dash.draw('ruleBuilder'); }));
    box.append(gbox);
    });
    box.append(rbtn('+ OR group', () => { rb.groups.push([{ field: 'description', op: 'contains', value: '' }]); dash.draw('ruleBuilder'); }));
    box.append(rhead('SET'));
    rb.sets.forEach((s, i) => {
      const row = document.createElement('div'); row.className = 'fd-rb-row';
      row.append(rsel(Object.entries(SF), s[0], (v) => { s[0] = v; s[1] = v === 'type' ? 'expense' : v === 'ignore' ? true : ''; dash.draw('ruleBuilder'); }));
      if (s[0] === 'type') row.append(document.createTextNode('='), rsel(Object.entries(TYPE), s[1] || 'expense', (v) => { s[1] = v; }));
      else if (s[0] === 'ignore') row.append(document.createTextNode('(leave it out of every total)'));
      else row.append(document.createTextNode('='), rin(s[1], s[0] === 'category' ? 'e.g. Gaming' : s[0] === 'tag' ? 'e.g. Colorado trip' : 'e.g. Steam', (v) => { s[1] = v; }, s[0] === 'category' ? 'fd-cats' : null));
      if (rb.sets.length > 1) row.append(rbtn('×', () => { rb.sets.splice(i, 1); dash.draw('ruleBuilder'); }));
      box.append(row);
    });
    const unused = Object.keys(SF).filter((k) => !rb.sets.some((s) => s[0] === k));
    if (unused.length) box.append(rbtn('+ Add field to set', () => { const f = unused[0]; rb.sets.push([f, f === 'type' ? 'expense' : f === 'ignore' ? true : '']); dash.draw('ruleBuilder'); }));
    const msg = document.createElement('p'); msg.className = 'fd-note fd-bad';
    const save = rbtn('Save rule', async () => {
      const groups = rb.groups.map((g) => g.map((c) => ({ field: c.field, op: c.field === 'type' ? 'is' : c.op, value: String(c.value || '').trim().slice(0, 60) })).filter((c) => c.value)).filter((g) => g.length).slice(0, 6);
      const conds = groups[0] || [];
      const sets = Object.fromEntries(rb.sets.filter((s) => s[1] !== '' && s[1] != null).map(([f, v]) => [f, typeof v === 'string' ? v.trim().slice(0, 40) : v]));
      if (!conds.length) { msg.textContent = 'Add at least one condition with some text.'; return; }
      if (!Object.keys(sets).length) { msg.textContent = 'Choose at least one field to set.'; return; }
      save.disabled = true;
      try {
        const d = await db(); const dc = conds.find((c) => c.field === 'description');
        await d.collection('data/household/rules').add({ book: book(), logic: groups.length > 1 ? 'or' : 'and', conds, groups, match: dc ? dc.value : '', vendor: sets.vendor || '', category: sets.category || '',
          type: sets.type || '', tag: sets.tag || '', ignore: !!sets.ignore, oneTime: false, order: rb.order ?? Date.now(), createdAt: new Date().toISOString() });
        if (rb.id) await d.doc('data/household/rules/' + rb.id).delete();
        rb = null; dash.draw('ruleBuilder');
      } catch { save.disabled = false; msg.textContent = 'Couldn’t save the rule. Try again.'; }
    }, false);
    const bar = document.createElement('div'); bar.className = 'fd-rb-row'; bar.append(save, rbtn('Cancel', () => { rb = null; dash.draw('ruleBuilder'); }));
    box.append(bar, msg); el.append(box);
  });
  const ord = (r) => (r.order !== null && r.order !== undefined && r.order !== '' && isFinite(Number(r.order)) ? Number(r.order) : Date.parse(r.createdAt) || 0);
  const myRules = () => rows('rules').filter((x) => !x.book || x.book === book()).sort((a, b) => ord(a) - ord(b));
  const strip = ({ id, ...rest }) => rest;
  const mv = (x, dir) => {
    const list = myRules(), i = list.findIndex((r) => r.id === x.id), y = list[i + dir];
    const b = rbtn(dir < 0 ? '↑' : '↓', async () => {
      b.disabled = true;
      try {
        const d = await db(); const ox = ord(x); let oy = ord(y); if (ox === oy) oy = ox + dir;
        await d.collection('data/household/rules').add({ ...strip(x), order: oy });
        await d.collection('data/household/rules').add({ ...strip(y), order: ox });
        await d.doc('data/household/rules/' + x.id).delete(); await d.doc('data/household/rules/' + y.id).delete();
      } catch { b.disabled = false; b.textContent = '!'; }
    });
    b.setAttribute('aria-label', dir < 0 ? 'Move up (applied earlier)' : 'Move down (applied later)'); b.disabled = !y; return b;
  };
  dash.draw('ruleList', (el) => {
    if (st('rules') !== 'ok') return;
    el.replaceChildren();
    const r = myRules();
    if (!r.length) { const p = document.createElement('p'); p.className = 'fd-note'; p.textContent = 'No rules yet.'; el.append(p); return; }
    for (const x of r) {
      const row = document.createElement('div'); row.className = 'fd-rule';
      const t = document.createElement('div'); t.className = 'fd-rule-t';
      const a = document.createElement('div'); a.textContent = 'IF ' + groupText(groupsOf(x));
      const b2 = document.createElement('div'); b2.className = 'fd-zero'; b2.textContent = 'SET ' + (setsOf(x).map(setText).join(', ') || '(nothing)');
      t.append(a, b2);
      const rm = rbtn('Remove', async () => { rm.disabled = true; try { const d = await db(); await d.doc('data/household/rules/' + x.id).delete(); } catch { rm.disabled = false; rm.textContent = 'Not removed'; } });
      const act = document.createElement('div'); act.className = 'fd-nowrap';
      act.append(rbtn('Edit', () => { rb = { id: x.id, order: ord(x), groups: groupsOf(x).map((g) => g.map((c) => ({ ...c }))), sets: setsOf(x).map((s) => [...s]) }; if (!rb.sets.length) rb.sets = [['category', '']]; dash.draw('ruleBuilder'); document.querySelector('#rules')?.scrollIntoView({ behavior: 'smooth' }); }), ' ', rm, ' ', mv(x, -1), mv(x, 1));
      row.append(t, act); el.append(row);
    }
  });

  // rule preview: which transactions the rule being built would match (checked against values before any rule)
  const cmatch = (c, t) => {
    if (c.field === 'amount') { const v = Number(c.value), a = Math.abs(Number(t.amount) || 0); return c.op === 'lt' ? a < v : c.op === 'gt' ? a > v : c.op === 'gte' ? a >= v : Math.abs(a - v) < 0.005; }
    const v = String(c.value || '').toLowerCase();
    const have = String((c.field === 'description' ? t.description : c.field === 'vendor' ? (t.ov ?? t.vendor) : c.field === 'category' ? (t.oc ?? t.category) : (t.ot ?? t.type)) || '').toLowerCase();
    return c.op === 'is' ? have === v : have.includes(v);
  };
  dash.draw('rulePreview', (el) => {
    el.replaceChildren(); if (!rb || st('all_txns') !== 'ok') return;
    const gs = rb.groups.map((g) => g.filter((c) => String(c.value || '').trim() !== '' && (c.field !== 'amount' || isFinite(Number(c.value))))).filter((g) => g.length);
    if (!gs.length) { el.textContent = 'Fill in a condition to see which transactions it matches.'; return; }
    const seen = new Set();
    const m = rows('all_txns').filter((t) => t.book === book() && gs.some((g) => g.every((c) => cmatch(c, t))))
      .filter((t) => { const k = t.splitOf || t.key; if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const h = document.createElement('p'); h.className = 'fd-rb-h';
    h.textContent = `Matches ${m.length} transaction${m.length === 1 ? '' : 's'}` + (m.length > 6 ? ' (latest 6 shown)' : ''); el.append(h);
    for (const t of m.slice(0, 6)) { const p = document.createElement('div'); p.textContent = `${t.date || t.month} · ${t.vendor} · ${money2(t.amount)} · now ${t.category}`; el.append(p); }
  });

  // ---- tags: totals for trips and events across categories ----
  const tagAgg = () => {
    const m = {};
    for (const t of rows('txns')) {
      if (t.book !== book() || !t.tags || !t.tags.length) continue;
      for (const g of t.tags) {
        const a = (m[g] = m[g] || { tag: g, spend: 0, n: 0, from: t.date, to: t.date, cats: {} });
        a.n++;
        if (t.type === 'expense') { a.spend += t.amount; a.cats[t.category] = (a.cats[t.category] || 0) + t.amount; }
        if (t.date < a.from) a.from = t.date; if (t.date > a.to) a.to = t.date;
      }
    }
    return Object.values(m).sort((a, b) => b.spend - a.spend);
  };
  dash.draw('tagList', (dl) => { dl.replaceChildren(...tagAgg().map((a) => { const o = document.createElement('option'); o.value = a.tag; return o; })); });
  dash.draw('tagRows', (el) => {
    if (st('txns') !== 'ok') return;
    el.replaceChildren();
    const a = tagAgg();
    if (!a.length) return empty(el, 5, 'No tags yet. Edit a transaction (or turn on Allow editing and show the Tags column) and add a tag like “Colorado trip”.');
    const tr0 = document.createElement('tr'); ['Tag', 'Spent', 'Transactions', 'Dates', 'Biggest categories'].forEach((l, i) => { const th = document.createElement('th'); th.textContent = l; if (i === 0 || i > 2) th.className = 'fd-l'; tr0.append(th); }); el.append(tr0);
    for (const x of a) {
      const tr = document.createElement('tr'); tr.className = 'fd-click'; tr.title = 'Show these transactions';
      tr.addEventListener('click', () => { dash.setParams({ range: 'all' }); goTx({ search: x.tag }); });
      const cats = Object.entries(x.cats).sort((p, q) => q[1] - p[1]).slice(0, 3).map(([c, v]) => `${c} ${money0(v)}`).join(' · ');
      const cur = (prefGet('tagCur', {}) || {})[x.tag], fx = ECO && ECO.fx && ECO.fx.rates, sp = td(money2(x.spend));
      if (cur && fx && fx[cur]) { const s2 = document.createElement('div'); s2.className = 'fd-zero fd-rsub'; s2.textContent = `≈ ${(x.spend * fx[cur]).toLocaleString('en-US', { maximumFractionDigits: 0 })} ${cur}`; sp.append(s2); }
      const cs = document.createElement('select'); cs.className = 'dash-select fd-cursel'; cs.title = 'Show this tag\u2019s total in another currency'; cs.append(new Option('USD only', '')); Object.keys(fx || {}).sort().forEach((c) => cs.append(new Option(c, c))); cs.value = cur || '';
      cs.addEventListener('click', (e) => e.stopPropagation()); cs.addEventListener('change', () => { const m2 = { ...(prefGet('tagCur', {}) || {}) }; if (cs.value) m2[x.tag] = cs.value; else delete m2[x.tag]; prefSet('tagCur', m2); dash.draw('tagRows'); });
      if (fx) sp.append(cs); else if (ecoState === 'idle') loadEcon();
      tr.append(td(x.tag, 'fd-l'), sp, td(String(x.n)), td(x.from === x.to ? x.from : `${x.from} – ${x.to}`, 'fd-l fd-zero'), td(cats || '–', 'fd-l fd-zero'));
      el.append(tr);
    }
  });

  // Jump to the transaction list with a filter: clears any old search text and shows the list even when the current view hides it.
  const goTx = ({ search = '', cat = null } = {}) => {
    if (NP.group !== 'all' && NP.group !== 'tx') showGroup('tx');
    dash.setParams({ cat }); setTxSearch(search);
    setTimeout(() => document.querySelector('#transactions')?.scrollIntoView({ behavior: 'smooth' }), 150);
  };

  // ---- biggest purchases in the range ----
  // ---- hide fixed charges (mortgage / subscriptions / other recurring bills) from "biggest" lists ----
  const HKEY = 'fd-hide', HOPTS = [['mortgage', 'Mortgage'], ['subs', 'Subscriptions'], ['bills', 'Other recurring bills']];
  const HIDE = (() => { try { return { mortgage: true, ...(JSON.parse(localStorage.getItem(HKEY) || '{}') || {}) }; } catch { return { mortgage: true }; } })();
  const fixedKind = (t) => {
    if (t.oneTime) return '';
    if (/mortgage|home ?loan|escrow/i.test(`${t.category} ${t.vendor}`)) return 'mortgage';
    if (/^(debt|loans?|student loans?|car payment|utilities|insurance)$/i.test(t.category) || /\bloan\b/i.test(t.vendor)) return 'bills';
    const s = rows('subs').find((x) => x.book === t.book && x.vendor === t.vendor);
    return s ? (s.kind === 'Subscription' ? 'subs' : 'bills') : '';
  };
  const shown = (t) => { const k = fixedKind(t); return !k || !HIDE[k]; };
  const hideBar = () => {
    const w = document.createElement('div'); w.className = 'fd-rb-row fd-hidebar';
    const l = document.createElement('span'); l.className = 'fd-zero'; l.textContent = 'Hide:'; w.append(l);
    HOPTS.forEach(([k, lab]) => {
      const c = document.createElement('label'); c.className = 'fd-check'; const i = document.createElement('input'); i.type = 'checkbox'; i.checked = !!HIDE[k];
      i.addEventListener('change', () => { HIDE[k] = i.checked; try { localStorage.setItem(HKEY, JSON.stringify(HIDE)); } catch {} ['bigHide', 'bigRows', 'reviewHead', 'reviewSnap'].forEach((d) => dash.draw(d)); });
      c.append(i, ' ' + lab); w.append(c);
    });
    return w;
  };
  dash.draw('bigHide', (el) => { el.replaceChildren(hideBar()); });

  dash.draw('bigRows', (el) => {
    if (st('txns', 'period') !== 'ok') return;
    el.replaceChildren();
    const inPer = new Set(period().map((m) => m.month));
    const b = rows('txns').filter((t) => t.book === book() && t.type === 'expense' && inPer.has(t.month) && shown(t)).sort((a, c) => c.amount - a.amount).slice(0, 10);
    if (!b.length) return empty(el, 4, 'No spending in this range.');
    for (const t of b) {
      const tr = document.createElement('tr'); tr.className = 'fd-click'; tr.title = 'Show this vendor’s transactions';
      tr.addEventListener('click', () => goTx({ search: t.vendor }));
      tr.append(td(t.date || t.month), td(t.vendor + (t.oneTime ? ' · one-time' : ''), 'fd-l'), td(t.category, 'fd-l fd-zero'), td(money2(t.amount)));
      el.append(tr);
    }
  });

  // ---- categories running above their recent average ----
  dash.draw('unusualRows', (el) => {
    if (st('txns', 'period') !== 'ok') return;
    el.replaceChildren();
    const last = lastMonth(); if (!last) return;
    const m = last.month, [y, mo] = m.split('-').map(Number);
    const prev = Array.from({ length: 6 }, (_, k) => { const d = new Date(Date.UTC(y, mo - 2 - k, 1)); return d.toISOString().slice(0, 7); });
    const by = {};
    for (const t of rows('txns')) {
      if (t.book !== book() || t.type !== 'expense' || t.oneTime) continue;
      const c = (by[t.category] = by[t.category] || { now: 0, months: {} });
      if (t.month === m) c.now += t.amount; else if (prev.includes(t.month)) c.months[t.month] = (c.months[t.month] || 0) + t.amount;
    }
    const seen = new Set(rows('txns').filter((t) => t.book === book() && prev.includes(t.month)).map((t) => t.month));
    const n = Math.max(seen.size, 1);
    const out = Object.entries(by).map(([cat, c]) => { const avg = Object.values(c.months).reduce((s, v) => s + v, 0) / n; return { cat, now: c.now, avg }; })
      .filter((x) => x.now - x.avg >= 50 && (x.avg === 0 ? x.now >= 100 : x.now >= x.avg * 1.3)).sort((a, b) => (b.now - b.avg) - (a.now - a.avg));
    const head = document.createElement('tr'); [`Category (${longName(m)}${isCurrent(m) ? ' so far' : ''})`, 'This month', `Avg of last ${n} mo`, 'Difference'].forEach((l, i) => { const th = document.createElement('th'); th.textContent = l; if (!i) th.className = 'fd-l'; head.append(th); });
    if (!out.length) return empty(el, 4, `Nothing unusual: every category in ${longName(m)} is close to its recent average.`);
    el.append(head);
    for (const x of out) {
      const tr = document.createElement('tr'); tr.className = 'fd-click'; tr.title = 'Show this category';
      tr.addEventListener('click', () => goTx({ cat: x.cat }));
      tr.append(td(x.cat, 'fd-l'), td(money0(x.now)), td(money0(x.avg)), td(`+${money0(x.now - x.avg)}` + (x.avg ? ` (${Math.round((x.now / x.avg - 1) * 100)}%)` : ' (new)'), 'fd-bad'));
      el.append(tr);
    }
  });

  // ---- your accounts: register (type, rate, owner, notes) joined with latest balances ----
  const ATYPES = {}; // 'kind:type' -> label, read from the import form's list so there's one source of truth
  document.querySelectorAll('#fd-balance-form select[name=kind] option').forEach((o) => { ATYPES[o.value] = o.textContent; });
  const KIND_GROUPS = [['deposit', 'Cash'], ['credit', 'Credit cards & lines'], ['mortgage', 'Mortgage'], ['loan', 'Loans'], ['investment', 'Investments']];
  const KIND_DEFAULT = { deposit: 'Checking / savings', credit: 'Credit card', mortgage: 'Mortgage', loan: 'Loan', investment: 'Investment' };
  const nA = (s) => String(s || '').trim().toLowerCase();
  const keyA = (s) => nA(s).replace(/^[^–]+ – /, ''); // name without an "Owner – " prefix
  const acctList = () => {
    const reg = rows('accounts').filter((a) => a.book === book());
    const latest = {};
    const byAcct = {}; // also match on the account name without the owner prefix
    for (const r of rows('balances').filter((x) => x.book === book())) { const k = nA(r.label), k2 = nA(r.account); if (!latest[k] || r.month > latest[k].month) latest[k] = r; if (!byAcct[k2] || r.month > byAcct[k2].month) byAcct[k2] = r; }
    const out = [], used = new Set();
    for (const a of reg) { const k = keyA(a.match || a.name); used.add(k); used.add(keyA(a.name)); (a.aliases || []).forEach((x) => used.add(keyA(x))); const b = latest[keyA(a.name)] || latest[k] || byAcct[keyA(a.name)] || byAcct[k]; if (b) used.add(nA(b.label)); out.push({ reg: a, key: k, name: a.name, kind: a.kind || (b && b.kind), type: a.type || '', rate: a.rate, owner: a.owner, note: a.note, limit: a.limit, payment: a.payment, escrow: a.escrow, extra: a.extra, rateEnds: a.rateEnds || '', active: a.active !== false, bal: b }); }
    for (const [k, b] of Object.entries(latest)) if (!used.has(k)) out.push({ reg: null, key: k, name: b.label, kind: b.kind, type: '', rate: null, owner: b.owner || '', note: '', bal: b });
    // Drop an old Google Sheets figure once newer balances exist for that kind of account (it has been replaced).
    const maxM = {}; for (const a of out) if (a.bal && (!maxM[a.kind] || a.bal.month > maxM[a.kind])) maxM[a.kind] = a.bal.month;
    return out.filter((a) => a.reg || !a.bal || a.kind !== 'deposit' || a.bal.source !== 'Google Sheets' || a.bal.month >= maxM[a.kind]);
  };
  let ae = null; // account being edited
  let showClosed = false;
  const numOrNull = (v) => (v === '' || v == null || !isFinite(Number(v)) ? null : Math.round(Number(v) * 100) / 100);
  // Loan payoff from the latest balance, the rate and the principal-and-interest part of the payment (payment minus escrow).
  // Using the current balance keeps it right after extra payments; editing the payment or escrow keeps it right after changes.
  const payoff = (B, apr, P) => {
    const r = apr / 100 / 12; if (!(P > 0)) return null;
    if (r === 0) return { n: Math.ceil(B / P), interest: 0 };
    if (P <= B * r) return { never: true };
    const n = Math.ceil(-Math.log(1 - (r * B) / P) / Math.log(1 + r));
    let b = B, i = 0; for (let m = 0; m < n && b > 0.005; m++) { const it = b * r; i += it; b = b + it - P; }
    return { n, interest: i };
  };
  const addM = (n) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); return d.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }); };
  const dur = (n) => `${Math.floor(n / 12) ? Math.floor(n / 12) + ' yr ' : ''}${n % 12 ? (n % 12) + ' mo' : ''}`.trim();
  const payoffText = (B, a) => {
    const pi = Number(a.payment) - (Number(a.escrow) || 0);
    const base = payoff(B, Number(a.rate), pi); if (!base) return '';
    if (base.never) return `The payment (${money0(pi)} after escrow) doesn’t cover the monthly interest`;
    let s = `Paid off ≈ ${addM(base.n)} (${dur(base.n)}) · ${money0(base.interest)} interest left` + (Number(a.escrow) ? ` · ${money0(pi)}/mo goes to principal & interest` : '');
    if (Number(a.extra) > 0) { const x = payoff(B, Number(a.rate), pi + Number(a.extra)); if (x && !x.never) s += ` · with +${money0(a.extra)}/mo extra: ${addM(x.n)}, saves ${money0(base.interest - x.interest)}`; }
    return s;
  };
  // ---- account pickers (record-a-balance and CSV import): choose an existing account, which fills its type and owner, or press + for a new one ----
  const pickerList = () => acctList().filter((a) => a.active !== false && !(a.kind === 'deposit' && !a.reg && a.bal && a.bal.source === 'Google Sheets')).sort((x, y) => x.name.localeCompare(y.name));
  const acctPicker = (formId, pickId, newId, drawId) => {
    const mode = (v) => {
      const f = document.querySelector('#' + formId); if (!f) return;
      const isNew = v === '__new', a = !isNew && v ? acctList().find((x) => x.name === v) : null;
      const show = (n, on) => { const el = f.elements[n], l = el && el.closest('label'); if (l) l.hidden = !on; };
      if (a) {
        f.elements.account.value = a.name; if (f.elements.owner) f.elements.owner.value = a.owner || '';
        const opts = [...f.elements.kind.options], opt = opts.find((o) => o.value === `${a.kind}:${a.type || ''}`) || opts.find((o) => o.value.startsWith(a.kind + ':'));
        if (opt) { f.elements.kind.value = opt.value; f.elements.kind.dispatchEvent(new Event('change')); }
      } else if (isNew) { f.elements.account.value = ''; if (f.elements.owner) f.elements.owner.value = ''; }
      show('account', isNew); show('owner', isNew); show('kind', isNew || !!(a && !a.type));
      if (isNew) f.elements.account.focus();
    };
    let cur = '';
    dash.draw(drawId, (el) => {
      el.replaceChildren();
      try {
        const list = pickerList(), s = document.createElement('select');
        s.className = 'dash-select'; s.id = pickId; s.setAttribute('aria-label', 'Account');
        s.append(new Option(list.length ? 'Choose an account…' : 'No accounts yet: press +', ''),
          ...list.map((a) => new Option(`${a.name}${a.owner ? ' (' + a.owner + ')' : ''} · ${ATYPES[a.kind + ':' + a.type] || KIND_DEFAULT[a.kind] || a.kind}`, a.name)),
          new Option('+ New account…', '__new'));
        s.value = [...s.options].some((o) => o.value === cur) ? cur : '';
        s.addEventListener('change', () => { cur = s.value; mode(s.value); });
        el.append(s);
      } catch (e) { el.textContent = 'Couldn’t list accounts (' + (e && e.message) + '). Press + to add one.'; }
    });
    q(newId).forEach((b) => b.addEventListener('click', () => { cur = '__new'; q(pickId).forEach((s) => { s.value = '__new'; }); mode('__new'); }));
    q(formId).forEach((f) => f.addEventListener('reset', () => setTimeout(() => { cur = ''; q(pickId).forEach((s) => { s.value = ''; }); mode(''); }, 0)));
    setTimeout(() => mode(''), 0);
  };
  acctPicker('fd-balance-form', 'fd-bal-pick', 'fd-bal-new', 'balAcctPick');
  acctPicker('fd-import-form', 'fd-imp-pick', 'fd-imp-new', 'impAcctPick');
  dash.draw('acctNames', (dl) => { dl.replaceChildren(...acctList().filter((a) => a.active !== false).map((a) => { const o = document.createElement('option'); o.value = a.name; return o; })); });
  dash.draw('acctEditor', (el) => {
    el.replaceChildren();
    if (!ae) { el.append(rbtn('+ Add account', () => { ae = { id: null, match: '', name: '', kt: 'deposit:checking', rate: '', owner: '', note: '', limit: '', payment: '', escrow: '', extra: '', active: true }; dash.draw('acctEditor'); }, false)); return; }
    const box = document.createElement('div'); box.className = 'fd-rb';
    box.append(rhead(ae.id || ae.match ? `Edit account: ${ae.match || ae.name}` : 'New account'));
    const row = (label, node) => { const r = document.createElement('div'); r.className = 'fd-rb-row'; const l = document.createElement('span'); l.className = 'fd-rb-lbl'; l.textContent = label; r.append(l, node); box.append(r); return r; };
    row('Name', rin(ae.name, 'e.g. Ascentra Savings', (v) => { ae.name = v; }));
    const ts = document.createElement('select'); ts.className = 'dash-select';
    document.querySelectorAll('#fd-balance-form select[name=kind] optgroup').forEach((g) => ts.append(g.cloneNode(true)));
    ts.value = ae.kt; ts.addEventListener('change', () => { ae.kt = ts.value; dash.draw('acctEditor'); });
    row('Type', ts);
    const k = ae.kt.split(':')[0];
    if (k !== 'investment') { const r = rin(ae.rate, k === 'deposit' ? 'e.g. 4.10' : 'e.g. 6.25', (v) => { ae.rate = v; }); r.type = 'number'; r.step = '0.01'; r.min = '0'; row(k === 'deposit' ? 'Interest rate (APY %)' : 'Interest rate (APR %)', r); }
    const numIn = (label, key, ph) => { const r = rin(ae[key], ph, (v) => { ae[key] = v; }); r.type = 'number'; r.step = '0.01'; r.min = '0'; row(label, r); };
    if (k !== 'investment') { const dI = rin(ae.rateEnds, '', (v) => { ae.rateEnds = v; }); dI.type = 'date'; row('Rate changes on (optional)', dI); }
    if (k === 'credit') numIn('Credit limit ($)', 'limit', 'e.g. 5000');
    if (k === 'mortgage' || k === 'loan') {
      numIn('Monthly payment ($, total)', 'payment', 'e.g. 1850');
      if (k === 'mortgage') numIn('…of which escrow ($)', 'escrow', 'taxes + insurance, e.g. 420');
      numIn('Extra principal / mo ($, optional)', 'extra', 'e.g. 100');
    }
    row('Owner', rin(ae.owner, 'e.g. Nate, Joint', (v) => { ae.owner = v; }));
    row('Notes', rin(ae.note, 'e.g. emergency fund, promo rate ends June', (v) => { ae.note = v; }));
    shareRows(box, ae, true);
    { const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = ae.active !== false; cb.addEventListener('change', () => { ae.active = cb.checked; });
      const l = document.createElement('label'); l.className = 'fd-check'; l.append(cb, ' Active (untick for a closed account: hidden, history kept)'); row('Status', l); }
    if (ae.id || ae.match) {
      const others = acctList().filter((a) => keyA(a.name) !== keyA(ae.match || ae.name) && !(ae.id && a.reg && a.reg.id === ae.id));
      const ms = document.createElement('select'); ms.className = 'dash-select';
      ms.append(new Option('No, this is its own account', ''), ...others.map((a) => new Option(a.name + (a.owner ? ` (${a.owner})` : ''), a.name)));
      ms.value = ae.mergeInto || ''; ms.addEventListener('change', () => { ae.mergeInto = ms.value; });
      row('Same account as…', ms);
      const al = ae.id && (rows('accounts').find((x) => x.id === ae.id) || {}).aliases;
      if (al && al.length) { const p = document.createElement('p'); p.className = 'fd-note'; p.textContent = `Also matches imports named: ${al.join(', ')}`; box.append(p); }
    }
    if (ae.match && nA(ae.match) !== nA(ae.name)) { const p = document.createElement('p'); p.className = 'fd-note'; p.textContent = `Still linked to imports and balances recorded as “${ae.match}”.`; box.append(p); }
    const msg = document.createElement('p'); msg.className = 'fd-note fd-bad';
    const save = rbtn('Save account', async () => {
      const name = String(ae.name || '').trim().slice(0, 60); if (!name) { msg.textContent = 'Give the account a name.'; return; }
      if (ae.mergeInto) {
        // Merge: this account's name becomes another name for the chosen account, so all its statements and balances count there.
        const tgt = acctList().find((a) => a.name === ae.mergeInto); if (!tgt) return;
        const names = [...new Set([ae.match, ae.name].filter(Boolean))];
        save.disabled = true;
        try {
          const d = await db(), now = new Date().toISOString();
          const kt = String(ae.kt || '').split(':');
          if (tgt.reg) { await d.collection('data/household/accounts').add({ ...strip(tgt.reg), type: tgt.reg.type || (kt[0] === tgt.reg.kind ? kt[1] || '' : ''), aliases: [...new Set([...(tgt.reg.aliases || []), ...names])], createdAt: now }); await d.doc('data/household/accounts/' + tgt.reg.id).delete(); }
          else await d.collection('data/household/accounts').add({ book: book(), name: tgt.name, match: tgt.name, kind: tgt.kind, type: kt[0] === tgt.kind ? kt[1] || '' : '', rate: null, owner: tgt.owner || '', note: '', aliases: names, active: true, createdAt: now });
          if (ae.id) await d.doc('data/household/accounts/' + ae.id).delete();
          ae = null; dash.draw('acctEditor');
        } catch { save.disabled = false; msg.textContent = 'Couldn’t merge. Try again.'; }
        return;
      }
      const [kind, type] = ae.kt.split(':'); const rate = ae.rate === '' || ae.rate == null || !isFinite(Number(ae.rate)) ? null : Math.round(Number(ae.rate) * 1000) / 1000;
      // Never create a second entry for an account that already exists: same name → update that one; existing balances → link to them.
      const others = rows('accounts').filter((x) => x.book === book() && x.id !== ae.id);
      const same = others.find((x) => keyA(x.name) === keyA(name) || keyA(x.match) === keyA(name) || (ae.match && keyA(x.match || x.name) === keyA(ae.match)));
      if (same && !ae.id) { ae.id = same.id; ae.match = same.match || same.name; }
      else if (same) { msg.textContent = `Another account is already named “${same.name}”. Use a different name, or delete one of them.`; return; }
      if (!ae.match) { const ex = acctList().find((a) => !a.reg && keyA(a.name) === keyA(name)); if (ex) ae.match = ex.name; }
      save.disabled = true;
      try {
        const d = await db();
        await d.collection('data/household/accounts').add({ book: book(), name, match: (ae.match || name).slice(0, 60), kind, type: type || '', rate: kind === 'investment' ? null : rate,
          owner: String(ae.owner || '').trim().slice(0, 30), note: String(ae.note || '').trim().slice(0, 120), rateEnds: /^\d{4}-\d{2}-\d{2}$/.test(ae.rateEnds || '') ? ae.rateEnds : '', aliases: ((ae.id && rows('accounts').find((x) => x.id === ae.id)) || {}).aliases || [], limit: numOrNull(ae.limit), payment: numOrNull(ae.payment), escrow: numOrNull(ae.escrow), extra: numOrNull(ae.extra), active: ae.active !== false, shareTo: ae.shareTo || [], shareHist: !!ae.shareHist, createdAt: new Date().toISOString() });
        if (ae.id) await d.doc('data/household/accounts/' + ae.id).delete();
        ae = null; dash.draw('acctEditor');
      } catch { save.disabled = false; msg.textContent = 'Couldn’t save. Try again.'; }
    }, false);
    const bar = document.createElement('div'); bar.className = 'fd-rb-row'; bar.append(save, rbtn('Cancel', () => { ae = null; dash.draw('acctEditor'); }));
    if (ae.id || ae.match) {
      // Delete for good (for accounts created by mistake). Two clicks. If another entry shares the name, only this duplicate goes.
      const linked = () => {
        const k = keyA(ae.match || ae.name);
        const sib = rows('accounts').filter((x) => x.book === book() && x.id !== ae.id && keyA(x.match || x.name) === k);
        return { sib, imps: sib.length ? [] : rows('imports').filter((b) => b.book === book() && keyA(b.accountName) === k) };
      };
      let armed = false;
      const del = rbtn('Delete account', async () => {
        const { sib, imps } = linked();
        if (!armed) {
          armed = true;
          del.textContent = imps.length ? `Yes, delete it and its ${imps.length} statement${imps.length === 1 ? '' : 's'}/balance${imps.length === 1 ? '' : 's'}` : 'Yes, delete it';
          msg.textContent = sib.length ? 'Another entry has this name, so only this duplicate is deleted; the statements stay with the other one.'
            : 'This can’t be undone. Any Google Sheets history for it stays; untick Active to hide that.';
          return;
        }
        del.disabled = true;
        try {
          const d = await db();
          for (const b of imps) await d.doc('data/household/imports/' + b.id).delete();
          if (ae.id) await d.doc('data/household/accounts/' + ae.id).delete();
          ae = null; dash.draw('acctEditor');
        } catch { del.disabled = false; msg.textContent = 'Couldn’t delete. Try again.'; }
      });
      del.style.color = 'var(--color-bad)'; bar.append(del);
    }
    box.append(bar, msg); el.append(box);
  });
  // small "shared" badge next to an account or asset name, listing the dashboards it's shared with
  const shareIcon = (host, to, first) => {
    if (!to || !to.length) return;
    const names = to.map((id) => (meBooks().find((b) => b.id === id) || {}).name || id);
    const i = document.createElement('span'); i.className = 'fd-shared'; i.textContent = '⇄'; i.title = `Shared with ${names.join(', ')}`; i.setAttribute('aria-label', i.title);
    if (first && host.firstChild && host.firstChild.nodeType === 3) host.firstChild.after(i); else host.append(i);
  };
  dash.draw('acctRows', (el) => {
    if (st('balances', 'accounts') !== 'ok') return;
    el.replaceChildren();
    const every = acctList(), all = every.filter((a) => showClosed || a.active !== false), nClosed = every.filter((a) => a.active === false).length;
    if (!all.length) return empty(el, 7, 'No accounts yet. Import a statement, record a balance, or press “+ Add account”.');
    const head = document.createElement('tr'); ['Account', 'Type', 'Rate', 'Balance', 'As of', 'Interest / mo', ''].forEach((l, i) => { const th = document.createElement('th'); th.textContent = l; if (i < 2 || i === 4) th.className = 'fd-l'; head.append(th); }); el.append(head);
    const totals = {};
    for (const [kind, title] of KIND_GROUPS) {
      const g = all.filter((a) => a.kind === kind).sort((a, b) => ((b.bal && b.bal.balance) || 0) - ((a.bal && a.bal.balance) || 0)); if (!g.length) continue;
      const gh = document.createElement('tr'); gh.className = 'fd-group'; const gc = td(title); gc.colSpan = 7; gh.append(gc); el.append(gh);
      let tot = 0, intr = 0;
      for (const a of g) {
        const closed = a.active === false, bal = a.bal ? a.bal.balance : null; if (!closed) tot += bal || 0;
        const debt = kind !== 'deposit' && kind !== 'investment';
        const mi = a.rate && bal ? (bal * a.rate) / 100 / 12 : null; if (mi) intr += mi;
        const tr = document.createElement('tr');
        const nm = td(a.name + (a.owner && !a.name.startsWith(a.owner) ? ` (${a.owner})` : ''), 'fd-l'); if (a.note) { nm.title = a.note; const s = document.createElement('div'); s.className = 'fd-zero'; s.textContent = a.note; nm.append(s); }
        shareIcon(nm, a.reg && a.reg.shareTo, true); if (closed) { nm.append(' (closed)'); tr.style.opacity = '0.55'; }
        if (kind === 'credit' && Number(a.limit) > 0 && bal != null) {
          const pct = Math.max(0, Math.min(100, (bal / Number(a.limit)) * 100));
          const w = document.createElement('div'); w.className = 'fd-usage'; w.title = `${Math.round(pct)}% of the ${money0(a.limit)} limit used`;
          const f = document.createElement('span'); f.style.width = pct + '%'; f.className = pct < 30 ? 'ok' : pct < 50 ? 'mid' : 'hi'; w.append(f);
          const t2 = document.createElement('div'); t2.className = 'fd-zero'; t2.textContent = `${Math.round(pct)}% of ${money0(a.limit)} limit used`; nm.append(w, t2);
        }
        if ((kind === 'mortgage' || kind === 'loan') && bal > 0 && a.rate != null && a.rate !== '' && Number(a.payment) > 0) { const p = document.createElement('div'); p.className = 'fd-zero'; p.textContent = payoffText(bal, a); nm.append(p); }
        tr.append(nm, td(ATYPES[`${a.kind}:${a.type}`] || `${KIND_DEFAULT[a.kind] || a.kind} (set type)`, 'fd-l' + (a.type ? '' : ' fd-zero')),
          (() => { const c = td(a.rate != null && a.rate !== '' ? `${a.rate}% ${kind === 'deposit' ? 'APY' : 'APR'}` : '–'); if (a.rateEnds) { const s = document.createElement('div'); s.className = 'fd-zero'; s.textContent = `changes ${a.rateEnds}`; c.append(s); } return c; })(),
          td(bal == null ? '–' : (debt ? '−' : '') + money2(bal), debt && bal ? 'fd-bad' : ''), td(a.bal ? `${a.bal.month}${a.bal.source && /Calculated/.test(a.bal.source) ? ' (calc.)' : ''}` : '–', 'fd-l fd-zero'),
          td(mi ? `${debt ? '−' : '+'}${money2(mi)}` : '–', mi ? (debt ? 'fd-bad' : 'fd-good') : ''));
        const c = document.createElement('td');
        c.append(rbtn('Edit', () => { ae = { id: a.reg ? a.reg.id : null, match: a.reg ? a.reg.match || a.reg.name : a.name, name: a.name, kt: `${a.kind}:${a.type || (ATYPES[a.kind + ':checking'] ? 'checking' : '')}`, rate: a.rate ?? '', owner: a.owner || '', note: a.note || '', limit: a.limit ?? '', payment: a.payment ?? '', escrow: a.escrow ?? '', extra: a.extra ?? '', rateEnds: a.rateEnds || '', shareTo: (a.reg && a.reg.shareTo) || [], shareHist: !!(a.reg && a.reg.shareHist), active: a.active !== false };
          if (!ATYPES[ae.kt]) ae.kt = Object.keys(ATYPES).find((x) => x.startsWith(a.kind + ':')) || 'deposit:checking';
          dash.draw('acctEditor'); document.querySelector('#accounts')?.scrollIntoView({ behavior: 'smooth' }); }));
        tr.append(c); el.append(tr);
      }
      totals[kind] = tot;
      const tr = document.createElement('tr'); tr.className = 'fd-total'; const debt = kind !== 'deposit' && kind !== 'investment';
      tr.append(td(`Total ${title.toLowerCase()}`, 'fd-l'), td(''), td(''), td((debt ? '−' : '') + money2(tot)), td(''), td(intr ? `${debt ? '−' : '+'}${money2(intr)}` : ''), td('')); el.append(tr);
    }
    if (totals.deposit != null && totals.credit) { const tr = document.createElement('tr'); tr.className = 'fd-total'; tr.append(td('Net cash after cards', 'fd-l'), td(''), td(''), td(money2(totals.deposit - totals.credit)), td(''), td(''), td('')); el.append(tr); }
    { const nw = (totals.deposit || 0) + (totals.investment || 0) - (totals.credit || 0) - (totals.mortgage || 0) - (totals.loan || 0);
      const tr = document.createElement('tr'); tr.className = 'fd-total'; tr.title = 'Home and car values aren’t included';
      tr.append(td('Net worth (cash + investments − debts)', 'fd-l'), td(''), td(''), td(money2(nw), nw >= 0 ? 'fd-good' : 'fd-bad'), td(''), td(''), td('')); el.append(tr); }
    if (nClosed) { const tr = document.createElement('tr'); const c = document.createElement('td'); c.colSpan = 7; c.append(rbtn(showClosed ? `Hide closed accounts (${nClosed})` : `Show closed accounts (${nClosed})`, () => { showClosed = !showClosed; dash.draw('acctRows'); })); tr.append(c); el.append(tr); }
  });

  // ---- CSV export of the transactions currently listed (all of them, not just the rows shown) ----
  q('fd-tx-csv').forEach((b) => b.addEventListener('click', () => {
    const esc = (v) => { const s = String(v ?? ''); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const lines = [['Date', 'Vendor', 'Description', 'Category', 'Counts as', 'Amount', 'Account', 'Tags'].join(',')]
      .concat(txMatches().map((t) => [t.date || t.month, t.vendor, t.description, t.category, TYPE[t.type] || t.type, Number(t.amount).toFixed(2), t.source, (t.tags || []).join('; ')].map(esc).join(',')));
    saveFile(`transactions-${String(book()).toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`, lines.join('\r\n'), 'text/csv');
  }));
  // download a file (or, in phone-only mode, open the phone's share sheet)
  const saveFile = (name, text, mime) => { if (window.FD_LOCAL && window.FDLocal) return window.FDLocal.saveText(name, text, mime, 'Save or send').catch((e) => alert(e.message));
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); };

  // ---- quick add (phones): jump straight to the manual entry form ----
  q('fd-fab').forEach((b) => b.addEventListener('click', () => {
    showGroup('import');
    setTimeout(() => { const f = document.querySelector('#fd-manual-form'); if (!f) return; f.scrollIntoView({ behavior: 'smooth', block: 'start' }); const i = f.querySelector('input:not([type=hidden]), select'); if (i) i.focus({ preventScroll: true }); }, 60);
  }));

  // ---- net worth over time ----
  dash.draw('nwChart', (el) => {
    const s = st('balances', 'period'); if (s !== 'ok') return placeholder(el, s);
    const per = period(), b = rows('balances').filter((r) => r.book === book());
    if (!b.length) return placeholder(el, 'ok', 'No balances in this range yet.');
    const ASSET = { deposit: true, investment: true }, last = {}, nw = [], as = [], de = [];
    for (const m of per) {
      for (const k of ['deposit', 'investment', 'credit', 'mortgage', 'loan']) { const r = b.filter((x) => x.kind === k && x.month === m.month); if (r.length) last[k] = r; }
      let A = 0, D = 0; for (const [k, r] of Object.entries(last)) for (const x of r) { if (ASSET[k]) A += x.balance; else D += x.balance; }
      const has = Object.keys(last).length > 0;
      A += sharedAt(['deposit', 'investment', 'asset'], 'nw', m.month); D += sharedAt(['credit', 'mortgage', 'loan'], 'nw', m.month);
      nw.push(has ? Math.round(A - D) : null); as.push(has ? Math.round(A) : null); de.push(has ? Math.round(D) : null);
    }
    const pts = (arr) => per.map((m, i) => ({ label: m.label, v: arr[i] }));
    window.FD.lineChart(el, { labels: per.map((m) => m.label), zero: false, aria: 'Net worth, assets and debts by month',
      series: [{ name: 'Net worth', points: pts(nw) }, { name: 'Assets', points: pts(as) }, { name: 'Debts', points: pts(de) }] });
  });

  // ---- upcoming bills and a rough 30-day cash forecast ----
  const nextDue = (x) => {
    if (!x.lastDate) return null;
    const monthly = Math.abs(x.yearly - x.lastCharge * 12) < 1;
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const n = new Date(String(x.lastDate).slice(0, 10) + 'T00:00:00Z'); if (isNaN(n)) return null;
    let guard = 0; do { n.setUTCMonth(n.getUTCMonth() + (monthly ? 1 : 12)); } while (n < today && ++guard < 60);
    return { date: n, monthly };
  };
  const upcoming = () => { const end = Date.now() + 30 * 864e5; return rows('subs').filter((x) => x.book === book()).map((x) => ({ x, due: nextDue(x) })).filter((o) => o.due && o.due.date.getTime() <= end).sort((a, b) => a.due.date - b.due.date); };
  dash.draw('billRows', (el) => {
    if (st('subs') !== 'ok') return;
    el.replaceChildren();
    const u = upcoming(); if (!u.length) return empty(el, 4, 'Nothing recurring is expected in the next 30 days.');
    const h = document.createElement('tr'); ['Due', 'Bill', 'Expected', 'How often'].forEach((l, i) => { const th = document.createElement('th'); th.textContent = l; if (i !== 2) th.className = 'fd-l'; h.append(th); }); el.append(h);
    for (const o of u) { const iso = o.due.date.toISOString().slice(0, 10), wd = o.due.date.getUTCDay(), hol = ((ECO && ECO.holidays) || []).find((h) => h[0] === iso); const tr = document.createElement('tr'); tr.append(td(o.due.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) + (hol ? ` · ${hol[1]} (bank holiday)` : wd === 0 || wd === 6 ? ' · weekend' : ''), 'fd-l' + (hol || wd === 0 || wd === 6 ? ' fd-warnt' : '')), td(o.x.vendor, 'fd-l'), td(money2(o.x.lastCharge)), td(o.due.monthly ? 'Monthly' : 'Yearly', 'fd-l fd-zero')); el.append(tr); }
    const tr = document.createElement('tr'); tr.className = 'fd-total'; tr.append(td('Total', 'fd-l'), td(''), td(money2(u.reduce((s, o) => s + o.x.lastCharge, 0))), td('')); el.append(tr);
  });
  dash.draw('fcast', (el) => {
    if (st('subs', 'monthly', 'balance_totals') !== 'ok') { el.textContent = ''; return; }
    const cash = latestTotal(['deposit'])[0];
    if (!cash) { el.textContent = 'Record your checking and savings balances to see a 30-day cash forecast.'; return; }
    const m = rows('monthly').filter((r) => r.book === book() && !isCurrent(r.month)).slice(-3);
    const avg = (f) => (m.length ? m.reduce((s, r) => s + r[f], 0) / m.length : 0);
    const bills = upcoming().reduce((s, o) => s + o.x.lastCharge, 0);
    const recurringMonthly = rows('subs').filter((x) => x.book === book() && Math.abs(x.yearly - x.lastCharge * 12) < 1).reduce((s, x) => s + x.lastCharge, 0);
    const inc = avg('income'), other = Math.max(0, avg('spend') - recurringMonthly);
    const proj = cash.total + inc - bills - other;
    el.textContent = `Cash now ${money0(cash.total)} + typical monthly income ${money0(inc)} − bills below ${money0(bills)} − other typical spending ${money0(other)} ≈ ${money0(proj)} in 30 days (averages of the last ${m.length} full months).`;
  });

  // ---- subscription price changes: last charge vs the one before ----
  const daysSince = (d) => Math.round((Date.now() - new Date(String(d).slice(0, 10) + 'T00:00:00Z')) / 864e5);
  const priceChanges = () => {
    const out = [];
    for (const s of rows('subs').filter((x) => x.book === book())) {
      const tx = rows('txns').filter((t) => t.book === book() && t.type === 'expense' && t.vendor === s.vendor && t.date).sort((a, b) => String(a.date).localeCompare(String(b.date)));
      if (tx.length < 2) continue;
      const last = tx[tx.length - 1], prev = tx[tx.length - 2], diff = Math.round((last.amount - prev.amount) * 100) / 100;
      if (Math.abs(diff) < 0.5 || Math.abs(diff) / prev.amount < 0.02 || daysSince(last.date) > 120) continue;
      out.push({ vendor: s.vendor, kind: s.kind, prev: prev.amount, last: last.amount, diff, pct: Math.round((diff / prev.amount) * 100), date: last.date });
    }
    return out.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  };
  dash.draw('priceRows', (el) => {
    if (st('subs', 'txns') !== 'ok') return;
    el.replaceChildren();
    const c = priceChanges(); if (!c.length) return;
    const h = document.createElement('p'); h.className = 'fd-rb-h'; h.textContent = 'Price changes'; el.append(h);
    for (const x of c) { const p = document.createElement('p'); p.className = 'fd-note ' + (x.diff > 0 ? 'fd-bad' : 'fd-good'); p.textContent = `${x.vendor}: ${money2(x.prev)} → ${money2(x.last)} (${x.diff > 0 ? '+' : ''}${x.pct}%) on ${x.date}${x.diff > 0 ? `, about ${money0(x.diff * 12)} more a year if it's monthly` : ''}`; el.append(p); if (!document.body.classList.contains('fd-readonly')) p.append(' ', notRecBtn(x.vendor)); }
  });

  // ---- data health: things worth fixing so the numbers stay right ----
  const healthItems = () => {
    const out = [], now = new Date();
    const lastTx = {};
    for (const b of rows('imports').filter((x) => x.book === book())) {
      let l = b.txns; if (typeof l === 'string') { try { l = JSON.parse(l); } catch { l = []; } }
      const k = keyA(b.accountName); for (const t of l || []) if (t.date && (!lastTx[k] || t.date > lastTx[k])) lastTx[k] = t.date;
    }
    for (const a of acctList()) {
      if (a.active === false) continue;
      const keys = [a.key, keyA(a.name), ...((a.reg && a.reg.aliases) || []).map(keyA)];
      if ((a.kind === 'deposit' || a.kind === 'credit') && a.reg) {
        const lt = keys.map((k) => lastTx[k]).filter(Boolean).sort().pop();
        if (!lt) out.push({ lvl: 'info', text: `${a.name}: no transactions imported yet, so its balance won't update on its own. Import a statement.`, go: 'import' });
        else if (daysSince(lt) > 35) out.push({ lvl: 'warn', text: `${a.name}: newest transaction is ${daysSince(lt)} days old (${lt}). Import a newer statement.`, go: 'import' });
      } else if (a.bal && a.bal.balance !== 0 && a.kind !== 'deposit' && a.kind !== 'credit') {
        const m = a.bal.month, age = now.getUTCFullYear() * 12 + now.getUTCMonth() - (+m.slice(0, 4) * 12 + +m.slice(5, 7) - 1);
        if (age >= 2) out.push({ lvl: 'info', text: `${a.name}: latest balance is from ${longName(m)}. Record a newer one.`, go: 'import' });
      }
      if (a.rateEnds) {
        const d = -daysSince(a.rateEnds);
        if (d < 0) out.push({ lvl: 'warn', text: `${a.name}: its rate was due to change on ${a.rateEnds}. Update the rate.`, go: 'accounts' });
        else if (d <= 60) out.push({ lvl: 'warn', text: `${a.name}: rate changes in ${d} day${d === 1 ? '' : 's'} (${a.rateEnds}).`, go: 'accounts' });
      }
    }
    const inPer = new Set(period().map((m) => m.month));
    const unc = rows('txns').filter((t) => t.book === book() && t.category === 'Uncategorized' && inPer.has(t.month)).length;
    if (unc) out.push({ lvl: 'info', text: `${unc} transaction${unc === 1 ? '' : 's'} in this range need${unc === 1 ? 's' : ''} a category.`, go: 'needs' });
    for (const x of econAlerts()) out.push(x);
    for (const x of priceChanges()) out.push({ lvl: x.diff > 0 ? 'warn' : 'info', text: `${x.vendor} ${x.diff > 0 ? 'went up' : 'went down'}: ${money2(x.prev)} → ${money2(x.last)} on ${x.date}.`, go: 'subscriptions' });
    return out;
  };
  const goTo = (where) => {
    if (where === 'needs') { showGroup('tx'); q('fd-tneeds').forEach((c) => { c.checked = true; c.dispatchEvent(new Event('change')); }); setTimeout(() => document.querySelector('#transactions')?.scrollIntoView({ behavior: 'smooth' }), 100); return; }
    const g = { import: 'import', accounts: 'accounts', subscriptions: 'expenses' }[where] || 'all';
    showGroup(g); setTimeout(() => document.querySelector('#' + (where === 'subscriptions' ? 'subscriptions' : where === 'accounts' ? 'accounts' : 'import'))?.scrollIntoView({ behavior: 'smooth' }), 100);
  };
  dash.draw('healthRows', (el) => {
    if (st('txns', 'imports', 'accounts', 'balances', 'subs') !== 'ok') return;
    el.replaceChildren();
    const items = healthItems();
    if (!items.length) { const p = document.createElement('p'); p.className = 'fd-note fd-good'; p.textContent = 'All good: accounts are up to date and nothing needs attention.'; el.append(p); return; }
    for (const it of items.slice(0, 12)) {
      const r = document.createElement('div'); r.className = 'fd-hl ' + it.lvl;
      const t = document.createElement('span'); t.textContent = (it.lvl === 'warn' ? '⚠ ' : '• ') + it.text;
      r.append(t, rbtn({ import: 'Import', accounts: 'Open', needs: 'Show', subscriptions: 'Show' }[it.go] || 'Open', () => goTo(it.go)));
      el.append(r);
    }
  });

  // ---- spending by day of week ----
  dash.draw('dowRows', (el) => {
    if (st('txns', 'period') !== 'ok') return;
    el.replaceChildren();
    const inPer = new Set(period().map((m) => m.month));
    const tx = rows('txns').filter((t) => t.book === book() && t.type === 'expense' && !t.oneTime && inPer.has(t.month) && /^\d{4}-\d{2}-\d{2}$/.test(t.date || ''));
    if (!tx.length) return empty(el, 4, 'No dated spending in this range.');
    const names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], tot = Array(7).fill(0), cnt = Array(7).fill(0);
    for (const t of tx) { const d = (new Date(t.date + 'T00:00:00Z').getUTCDay() + 6) % 7; tot[d] += t.amount; cnt[d]++; }
    const max = Math.max(...tot) || 1, all = tot.reduce((s, v) => s + v, 0);
    const h = document.createElement('tr'); ['Day', 'Spent', 'Share', 'Purchases', 'Avg purchase'].forEach((l, i) => { const th = document.createElement('th'); th.textContent = l; if (!i) th.className = 'fd-l'; h.append(th); }); el.append(h);
    names.forEach((n, i) => {
      const tr = document.createElement('tr');
      const c0 = td(n, 'fd-l'); const bar = document.createElement('div'); bar.className = 'fd-dowbar'; const f = document.createElement('span'); f.style.width = (tot[i] / max) * 100 + '%'; bar.append(f); c0.append(bar);
      tr.append(c0, td(money0(tot[i])), td(`${Math.round((tot[i] / all) * 100)}%`), td(String(cnt[i])), td(cnt[i] ? money2(tot[i] / cnt[i]) : '–'));
      el.append(tr);
    });
  });

  // ---- savings goals ----
  let ge = null;
  const goalNow = (g) => { if (g.account) { const a = acctList().find((x) => keyA(x.name) === keyA(g.account)); if (a && a.bal) return { v: a.bal.balance, src: `${a.name} balance` }; } return { v: Number(g.saved) || 0, src: 'entered by you' }; };
  dash.draw('goalEditor', (el) => {
    el.replaceChildren();
    if (!ge) { el.append(rbtn('+ New goal', () => { ge = { id: null, name: '', target: '', by: '', account: '', saved: '' }; dash.draw('goalEditor'); }, false)); return; }
    const box = document.createElement('div'); box.className = 'fd-rb'; box.append(rhead(ge.id ? 'Edit goal' : 'New goal'));
    const row = (label, node) => { const r = document.createElement('div'); r.className = 'fd-rb-row'; const l = document.createElement('span'); l.className = 'fd-rb-lbl'; l.textContent = label; r.append(l, node); box.append(r); };
    row('Goal', rin(ge.name, 'e.g. Emergency fund, Wedding, House down payment', (v) => { ge.name = v; }));
    const tI = rin(ge.target, 'e.g. 15000', (v) => { ge.target = v; }); tI.type = 'number'; tI.min = '0'; tI.step = '0.01'; row('Target ($)', tI);
    const bI = rin(ge.by, '', (v) => { ge.by = v; }); bI.type = 'date'; row('By (optional)', bI);
    const as = document.createElement('select'); as.className = 'dash-select';
    as.append(new Option('No account: I’ll enter the amount saved', ''), ...acctList().filter((a) => a.active !== false && (a.kind === 'deposit' || a.kind === 'investment')).map((a) => new Option(a.name, a.name)));
    as.value = ge.account || ''; as.addEventListener('change', () => { ge.account = as.value; dash.draw('goalEditor'); }); row('Track this account', as);
    if (!ge.account) { const sI = rin(ge.saved, 'e.g. 2500', (v) => { ge.saved = v; }); sI.type = 'number'; sI.min = '0'; sI.step = '0.01'; row('Saved so far ($)', sI); }
    const msg = document.createElement('p'); msg.className = 'fd-note fd-bad';
    const save = rbtn('Save goal', async () => {
      const name = String(ge.name || '').trim().slice(0, 60), target = Number(ge.target);
      if (!name || !(target > 0)) { msg.textContent = 'Give the goal a name and a target amount.'; return; }
      save.disabled = true;
      try {
        const d = await db();
        await d.collection('data/household/goals').add({ book: book(), name, target: Math.round(target * 100) / 100, by: /^\d{4}-\d{2}-\d{2}$/.test(ge.by || '') ? ge.by : '', account: ge.account || '',
          saved: ge.account ? null : Math.round((Number(ge.saved) || 0) * 100) / 100, createdAt: new Date().toISOString() });
        if (ge.id) await d.doc('data/household/goals/' + ge.id).delete();
        ge = null; dash.draw('goalEditor');
      } catch { save.disabled = false; msg.textContent = 'Couldn’t save. Try again.'; }
    }, false);
    const bar = document.createElement('div'); bar.className = 'fd-rb-row'; bar.append(save, rbtn('Cancel', () => { ge = null; dash.draw('goalEditor'); }));
    if (ge.id) { const del = rbtn('Delete goal', async () => { try { const d = await db(); await d.doc('data/household/goals/' + ge.id).delete(); ge = null; dash.draw('goalEditor'); } catch { msg.textContent = 'Couldn’t delete. Try again.'; } }); del.style.color = 'var(--color-bad)'; bar.append(del); }
    box.append(bar, msg); el.append(box);
  });
  dash.draw('goalRows', (el) => {
    if (st('goals', 'balances', 'accounts') !== 'ok') return;
    el.replaceChildren();
    const gs = rows('goals').filter((g) => g.book === book());
    if (!gs.length) { const p = document.createElement('p'); p.className = 'fd-note'; p.textContent = 'No goals yet. Press “+ New goal” to add one.'; el.append(p); return; }
    for (const g of gs) {
      const now = goalNow(g), pct = Math.max(0, Math.min(100, (now.v / g.target) * 100)), left = Math.max(0, g.target - now.v);
      const box = document.createElement('div'); box.className = 'fd-goal';
      const top = document.createElement('div'); top.className = 'fd-goal-top';
      const nm = document.createElement('strong'); nm.textContent = g.name;
      top.append(nm, rbtn('Edit', () => { ge = { id: g.id, name: g.name, target: g.target, by: g.by || '', account: g.account || '', saved: g.saved ?? '' }; dash.draw('goalEditor'); document.querySelector('#goals')?.scrollIntoView({ behavior: 'smooth' }); }));
      const bar = ring([{ label: 'Saved', value: Math.min(now.v, g.target), color: pct >= 100 ? 'var(--color-ok)' : dash.colors[0] }, { label: 'To go', value: left, color: 'var(--color-border-line)' }], [`${Math.round(pct)}%`], { size: 64, width: 9, title: `${g.name}: ${Math.round(pct)}% saved` });
      withTip(bar, g.name, [{ label: 'Saved', value: Math.min(now.v, g.target), color: pct >= 100 ? 'var(--color-ok)' : dash.colors[0] }, { label: 'To go', value: left, color: 'var(--color-border-line)' }]);
      const info = document.createElement('div'); info.className = 'fd-note';
      let t = `${money0(now.v)} of ${money0(g.target)} (${Math.round(pct)}%) · ${now.src}`;
      if (left <= 0) t += ' · reached!';
      else if (g.by) {
        const n = new Date(), b = new Date(g.by + 'T00:00:00Z'); const months = (b.getUTCFullYear() - n.getUTCFullYear()) * 12 + b.getUTCMonth() - n.getUTCMonth();
        t += months > 0 ? ` · save about ${money0(left / months)}/month to reach it by ${b.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })}` : ` · ${money0(left)} to go; the target date has passed`;
      } else t += ` · ${money0(left)} to go`;
      info.textContent = t;
      const body = document.createElement('div'); body.className = 'fd-goal-body'; body.append(bar, info); box.append(top, body); el.append(box);
    }
  });

  // ---- at-a-glance visuals: rings, pace bars, spending calendar (chart/table choice remembered per device) ----
  const VKEY = 'fd-views', VIEWS = (() => { try { return JSON.parse(localStorage.getItem(VKEY) || '{}') || {}; } catch { return {}; } })();
  const vGet = (k, def) => VIEWS[k] || def;
  const vSet = (k, v, redraw) => { VIEWS[k] = v; try { localStorage.setItem(VKEY, JSON.stringify(VIEWS)); } catch {} redraw.forEach((d) => dash.draw(d)); };
  const vToggle = (k, def, opts, redraw) => {
    const w = document.createElement('div'); w.className = 'fd-vtog'; w.setAttribute('role', 'group');
    opts.forEach(([v, lab]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = lab; b.className = vGet(k, def) === v ? 'is-on' : ''; b.setAttribute('aria-pressed', vGet(k, def) === v ? 'true' : 'false'); b.addEventListener('click', (e) => { e.stopPropagation(); vSet(k, v, redraw); }); w.append(b); });
    return w;
  };
  const NS = 'http://www.w3.org/2000/svg', svgEl = (n, a) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); return e; };
  // ring: slices [{label, value, color, onClick}], center [big, small], optional marker (0..1 around the ring)
  const kMoney = (v) => (v >= 1e5 ? `$${Math.round(v / 1000)}k` : v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${Math.round(v)}`);
  const ring = (slices, center, { size = 150, width = 18, marker = null, title = '', labels = false, chart = '' } = {}) => {
    if (chart) slices.forEach((x) => { x.color = colorFor(chart, x.label, x.color); });
    const r = (size - width) / 2, c = size / 2, tot = slices.reduce((t, s) => t + Math.max(0, s.value), 0) || 1;
    const svg = svgEl('svg', { viewBox: `0 0 ${size} ${size}`, class: 'fd-ring', role: 'img', 'data-chart': chart, 'aria-label': title || slices.map((s) => `${s.label} ${Math.round((s.value / tot) * 100)}%`).join(', ') });
    svg.append(svgEl('circle', { cx: c, cy: c, r, fill: 'none', stroke: 'var(--color-border-line)', 'stroke-width': width }));
    let a0 = -Math.PI / 2;
    const pt = (a, rr = r) => `${(c + rr * Math.cos(a)).toFixed(2)} ${(c + rr * Math.sin(a)).toFixed(2)}`;
    slices.filter((s) => s.value > 0).forEach((s) => {
      const frac = s.value / tot, a1 = a0 + frac * Math.PI * 2 - (frac < 1 ? 0.012 : 0.0001);
      const p = frac >= 0.9999 ? svgEl('circle', { cx: c, cy: c, r, fill: 'none', stroke: s.color, 'stroke-width': width })
        : svgEl('path', { d: `M ${pt(a0)} A ${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${pt(a1)}`, fill: 'none', stroke: s.color, 'stroke-width': width });
      if (/^#fff(fff)?$/i.test(s.color)) { const o = p.cloneNode(); o.setAttribute('stroke', 'var(--color-fg-muted)'); o.setAttribute('stroke-width', width); svg.append(o); p.setAttribute('stroke-width', width - 2); }
      p.dataset.slice = String(slices.indexOf(s)); if (!title) { const t = svgEl('title', {}); t.textContent = `${s.label}: ${money0(s.value)} (${Math.round(frac * 100)}%)`; p.append(t); }
      if (s.onClick) { p.style.cursor = 'pointer'; p.addEventListener('click', s.onClick); }
      svg.append(p);
      if (labels && frac >= 0.1) { const am = a0 + frac * Math.PI; const tx = svgEl('text', { x: (c + r * Math.cos(am)).toFixed(1), y: (c + r * Math.sin(am) + 3.5).toFixed(1), 'text-anchor': 'middle', class: 'fd-ring-lab' }); tx.textContent = kMoney(s.value); if (/^#fff(fff)?$|#f6d84a/i.test(s.color)) tx.style.fill = '#1d2430'; svg.append(tx); }
      a0 += frac * Math.PI * 2;
    });
    const mks = marker == null ? [] : Array.isArray(marker) ? marker : [{ at: marker, label: 'today' }];
    mks.forEach((m, i) => { if (m.at == null || !isFinite(m.at)) return;
      const a = -Math.PI / 2 + Math.max(0, Math.min(1, m.at)) * Math.PI * 2, out = r + width / 2 + 10, cx = Math.cos(a), cy = Math.sin(a);
      svg.append(svgEl('line', { x1: c + (r - width / 2 - 2) * cx, y1: c + (r - width / 2 - 2) * cy, x2: c + out * cx, y2: c + out * cy, stroke: m.color || 'var(--color-fg)', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-dasharray': m.dash ? '3 2' : null }));
      const tx = svgEl('text', { x: (c + (out + 3) * cx).toFixed(1), y: (c + (out + 3) * cy + 3.5 + (i && Math.abs(cx) < 0.25 ? 10 : 0)).toFixed(1), 'text-anchor': cx > 0.25 ? 'start' : cx < -0.25 ? 'end' : 'middle', class: 'fd-ring-small fd-pace-lab' }); tx.textContent = m.label; if (m.color) tx.style.fill = m.color; svg.append(tx);
      svg.style.overflow = 'visible'; });
    const [big, small] = center || [];
    if (big) { const t = svgEl('text', { x: c, y: c + (small ? -2 : 5), 'text-anchor': 'middle', class: 'fd-ring-big' }); t.textContent = big; svg.append(t); }
    if (small) { const t = svgEl('text', { x: c, y: c + 15, 'text-anchor': 'middle', class: 'fd-ring-small' }); t.textContent = small; svg.append(t); }
    svg._items = slices.map((x) => ({ name: x.label, color: x.color })); svg._title = title;
    return svg;
  };
  // hover / tap card for rings, styled like the line-chart tooltips
  let ringTip = null;
  const tipShow = (ev, title, slices, on) => {
    if (!ringTip) { ringTip = document.createElement('div'); ringTip.className = 'fd-tip'; ringTip.setAttribute('role', 'tooltip'); document.body.append(ringTip); document.addEventListener('scroll', () => { ringTip.hidden = true; }, { passive: true }); }
    const tot = slices.reduce((t, x) => t + Math.max(0, x.value), 0) || 1;
    ringTip.replaceChildren(); if (title) { const h = document.createElement('div'); h.className = 'fd-tip-h'; h.textContent = title; ringTip.append(h); }
    slices.forEach((x) => { const r = document.createElement('div'); r.className = 'fd-tip-r'; if (on && x !== on) r.style.opacity = '.55'; const i = document.createElement('i'); i.style.background = x.color; const n = document.createElement('span'); n.textContent = x.label; const v = document.createElement('b'); v.textContent = `${money0(x.value)} · ${Math.round((x.value / tot) * 100)}%`; r.append(i, n, v); ringTip.append(r); });
    ringTip.hidden = false;
    const w = ringTip.offsetWidth, h = ringTip.offsetHeight, x0 = Math.min(ev.clientX + 14, window.innerWidth - w - 8), y0 = ev.clientY + 14 + h > window.innerHeight ? ev.clientY - h - 10 : ev.clientY + 14;
    ringTip.style.left = Math.max(8, x0) + window.scrollX + 'px'; ringTip.style.top = y0 + window.scrollY + 'px';
  };
  const tipHide = () => { if (ringTip) ringTip.hidden = true; };
  const withTip = (node, title, slices) => {
    const find = (t) => { const k = t.closest && t.closest('[data-slice]'); return k ? slices[+k.dataset.slice] : null; };
    node.addEventListener('pointermove', (e) => tipShow(e, title, slices, find(e.target)));
    node.addEventListener('pointerleave', tipHide);
    node.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') tipShow(e, title, slices, find(e.target)); });
    return node;
  };
  const legend = (slices, total, bare = false) => {
    const ul = document.createElement('ul'); ul.className = 'fd-legend';
    slices.forEach((s) => { const li = document.createElement('li'); if (s.onClick) { li.className = 'fd-click'; li.addEventListener('click', s.onClick); } const sw = document.createElement('i'); sw.style.background = s.color; const n = document.createElement('span'); n.textContent = s.label; li.dataset.slice = String(slices.indexOf(s)); li.append(sw, n); if (!bare) { const v = document.createElement('b'); v.textContent = `${money0(s.value)}${total ? ` · ${Math.round((s.value / total) * 100)}%` : ''}`; li.append(v); } ul.append(li); });
    return ul;
  };
  const ringBox = (svg, side, tip) => { const d = document.createElement('div'); d.className = 'fd-ringbox'; d.append(svg); if (side) d.append(side); if (tip) withTip(d, tip[0], tip[1]); if (svg.dataset.chart) addGear(d, svg.dataset.chart, svg._items, svg._title); return d; };
  const OK = 'var(--color-ok)', WARN = 'var(--color-warn)', BAD = 'var(--color-bad)', MUTED = 'var(--color-border-line)';

  // merged top tiles: cash flow (numbers or bars) and cash & investments (numbers or ring)
  dash.draw('kFlowViz', (el) => {
    el.replaceChildren(); const r = sumRow(); if (!r) return;
    const mode = vGet('flowCard', 'num'); el.closest('.fd-card')?.querySelectorAll('.fd-num').forEach((n) => { n.hidden = mode !== 'num'; });
    const tog = vToggle('flowCard', 'num', [['num', 'Numbers'], ['ring', 'Ring'], ['bars', 'Bars']], ['kFlowViz']);
    if (mode === 'num') { el.append(tog); return; }
    if (mode === 'ring') {
      const inc = r.income, sp = r.income - r.net, s = inc >= sp
        ? [{ label: 'Income', value: sp, color: '#2f6fd6' }, { label: 'Income over spending', value: inc - sp, color: '#0b5e31' }, { label: 'Spending', value: sp, color: '#f6d84a' }]
        : [{ label: 'Income', value: inc, color: '#2f6fd6' }, { label: 'Spending', value: inc, color: '#f6d84a' }, { label: 'Spending over income', value: sp - inc, color: '#c43c3c' }];
      const tipS = [{ label: 'Income', value: inc, color: '#2f6fd6' }, { label: 'Spending', value: sp, color: '#f6d84a' }, inc >= sp ? { label: 'Kept', value: inc - sp, color: '#0b5e31' } : { label: 'Overspent', value: sp - inc, color: '#c43c3c' }];
      const svg = ring(s, [`${inc >= sp ? '+' : '−'}${kMoney(Math.abs(inc - sp))}`, inc >= sp ? 'kept' : 'overspent'], { size: 150, width: 30, title: 'Cash flow', chart: 'ring-flow' });
      tipS[0].color = s[0].color; tipS[1].color = s.find((x) => x.label === 'Spending').color; tipS[2].color = s[inc >= sp ? 1 : 2].color;
      const lg = legend(tipS, 0, true);
      el.append(ringBox(svg, lg, [`Cash flow · ${money0(inc + sp)}`, tipS]), tog); return;
    }
    const spAll = r.income - r.net, max = Math.max(r.income, spAll, 1), box = document.createElement('div'); box.className = 'fd-flowbars';
    [['Income', r.income, '#2f6fd6'], ['Spending', spAll, '#f6d84a']].forEach(([l, v, c]) => {
      const row = document.createElement('div'); row.className = 'fd-bbar'; const n = document.createElement('span'); n.textContent = l; const val = document.createElement('b'); val.textContent = money0(v);
      const tr = document.createElement('div'); tr.className = 'fd-bbar-track'; const f = document.createElement('span'); f.style.width = (v / max) * 100 + '%'; f.style.background = c; f.style.boxShadow = 'inset 0 0 0 1px rgba(0,0,0,.2)'; tr.append(f); row.append(n, val, tr); box.append(row);
    });
    const k = document.createElement('p'); k.className = 'fd-sub'; const pct = r.income > 0 ? Math.round((r.net / r.income) * 100) : null;
    k.innerHTML = ''; const b = document.createElement('b'); b.className = r.net >= 0 ? 'fd-good' : 'fd-bad'; b.textContent = (r.net >= 0 ? 'Kept ' : 'Overspent ') + money0(Math.abs(r.net)); k.append(b, pct != null && r.net >= 0 ? ` · ${pct}% of income` : '');
    el.append(box, k, tog);
  });
  dash.draw('kAssetViz', (el) => {
    el.replaceChildren(); const c = latestTotal(['deposit'])[0], i = latestTotal(['investment'])[0]; if (!c && !i && !sharedIn().length) return;
    const shC = sharedSum(['deposit'], 'cash'), shI = sharedSum(['investment'], 'cash'), shA = sharedSum(['asset'], 'nw'), shD = sharedSum(['credit', 'mortgage', 'loan'], 'nw');
    const cv = (c ? c.total : 0) + shC, iv = (i ? i.total : 0) + shI, card = el.closest('.fd-card'), av = assetsAll().reduce((t, x) => t + assetNow(x), 0) + shA;
    const h3 = card?.querySelector('h3'); if (h3) h3.textContent = av ? 'What you own' : 'Cash & investments';
    const mode = vGet('assetCard', 'num'); card?.querySelectorAll('.fd-num').forEach((n) => { n.hidden = mode !== 'num'; });
    const tog = vToggle('assetCard', 'num', [['num', 'Numbers'], ['ring', 'Ring']], ['kAssetViz']);
    const nw = document.createElement('p'); nw.className = 'fd-sub fd-asset-tot'; const nb = document.createElement('b'); nb.textContent = money0(cv + iv + av - debtTot() - shD); const dv = debtTot() + shD; nw.append('Net worth ', nb, ` = ${money0(cv + iv + av)} owned − ${money0(dv)} owed`);
    const hasHome = assetsAll().some((x) => /home|house|real|property/i.test(String(x.type || '') + ' ' + String(x.name || ''))) || sharedIn().some((d) => d.kind === 'asset' && /home|house|real|property/i.test(String(d.type || '') + ' ' + String(d.name || '')));
    const hasMort = (latestTotal(['mortgage'])[0]?.total || 0) + sharedSum(['mortgage'], 'nw') > 0;
    if (hasHome && !hasMort) { const w = document.createElement('p'); w.className = 'fd-note fd-bad'; w.textContent = 'Your home’s full value is counted, but no mortgage balance is on this dashboard, so net worth is too high. Import a mortgage statement here, or share the mortgage from the dashboard that has it.'; el.append(w); } if (shC + shI + shA) { const sn = document.createElement('span'); sn.className = 'fd-zero'; sn.textContent = ` · incl. ${money0(shC + shI + shA)} shared`; nw.append(sn); }
    if (mode === 'num') { const tot = document.createElement('p'); tot.className = 'fd-sub fd-asset-tot'; const tb = document.createElement('b'); tb.textContent = money0(cv + iv + av); tot.append(av ? `Home & vehicles ${money0(av)} · total ` : 'Total ', tb); el.append(tot, nw, tog); return; }
    const s = [{ label: 'Checking & savings', value: cv, color: '#2f6fd6' }, { label: 'Investments', value: iv, color: '#0b5e31' }]; if (av) s.push({ label: 'Home & vehicles', value: av, color: '#7b5ea7' });
    const lg = legend(s, cv + iv, true); lg.querySelectorAll('li').forEach((li, k) => { li.classList.add('fd-click'); li.addEventListener('click', (e) => { e.stopPropagation(); if (k > 1) { showGroup('accounts'); return; } document.getElementById(k ? 'kpi-invest' : 'kpi-cash')?.click(); }); });
    el.append(ringBox(ring(s, [money0(cv + iv + av), 'total'], { size: 150, width: 30, labels: true, title: 'Cash & investments', chart: 'ring-assets' }), lg, ['Cash & investments', s]), nw, tog);
  });

  // 1. budget card: text or ring
  dash.draw('kBudgetRing', (el) => {
    el.replaceChildren(); const card = el.closest('.fd-card'); const r = budTot();
    const mode = vGet('budgetCard', 'text'), canRing = r && r.categories;
    card?.querySelectorAll('[data-draw=kBudget],[data-draw=kBudgetSub]').forEach((p) => { p.hidden = mode === 'ring' && canRing; });
    if (!canRing) return;
    const tog = vToggle('budgetCard', 'text', [['text', 'Numbers'], ['ring', 'Ring']], ['kBudgetRing']);
    if (mode !== 'ring') { el.append(tog); return; }
    const left = r.available - r.spent, over = left < 0, pace = r.elapsed != null ? r.elapsed : null;
    const color = over ? BAD : pace != null && r.spent / r.available > pace + 0.05 ? WARN : OK;
    const days = pace != null ? (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() - d.getDate(); })() : null;
    const bs = over ? [{ label: 'Spent', value: r.spent, color: BAD }] : [{ label: 'Spent', value: r.spent, color }, { label: 'Left', value: left, color: MUTED }];
    const svg = ring(bs,
      [over ? `${money0(-left)} over` : `${money0(left)} left`, days != null ? `${days} day${days === 1 ? '' : 's'} to go` : `of ${money0(r.available)}`], { size: 150, width: 30, marker: [PART('b-today') ? null : { at: pace, label: 'today' }, PART('b-pace') || r.projected == null ? null : { at: r.projected / r.available, label: r.projected > r.available ? 'pace ›' : 'pace', color: r.projected > r.available ? BAD : OK, dash: true }].filter(Boolean), chart: 'ring-budget', title: `Budget: ${money0(r.spent)} spent of ${money0(r.available)}` });
    const note = document.createElement('p'); note.className = 'fd-sub'; note.textContent = `${money0(r.spent)} of ${money0(r.available)}${r.projected != null && !PART('b-pace') ? ` · on pace for ${money0(r.projected)}` : ''}`;
    const key = document.createElement('p'); key.className = 'fd-sub fd-mkkey'; // phones: a key instead of labels around the ring
    if (!PART('b-today')) { const k = document.createElement('span'); k.innerHTML = '<i class="fd-mk"></i> today'; key.append(k); }
    if (!PART('b-pace') && r.projected != null) { const k = document.createElement('span'); k.innerHTML = '<i class="fd-mk fd-mk-dash"></i> pace'; k.style.color = r.projected > r.available ? BAD : OK; k.querySelector('i').style.borderColor = k.style.color; key.append(k); }
    el.append(ringBox(svg, null, [`Budget · ${money0(r.available)}`, bs]), ...(key.childNodes.length ? [key] : []), note, tog);
  });

  // 2. spending by category: trend lines or share ring
  const catShare = () => {
    const c = rows('cat_trend').filter((r) => r.book === book() && r.total > 0).sort((a, b) => b.total - a.total);
    const top = c.slice(0, 6), rest = c.slice(6).reduce((t, r) => t + r.total, 0);
    const s = top.map((r, i) => ({ label: r.category, value: r.total, color: dash.colors[i % dash.colors.length], onClick: () => pickCat(r.category) }));
    if (rest > 0) s.push({ label: `Other (${c.length - 6})`, value: rest, color: 'var(--color-fg-muted)' });
    return s;
  };
  dash.draw('catViz', (el) => {
    if (st('cat_trend') !== 'ok') return;
    el.replaceChildren(); const mode = vGet('cat', 'trend');
    document.querySelectorAll('[data-draw=catChart]').forEach((c) => { c.hidden = mode === 'ring'; });
    el.append(vToggle('cat', 'trend', [['trend', 'Trend'], ['ring', 'Share']], ['catViz', 'catChart']));
    if (mode !== 'ring') return;
    const s = catShare(), tot = s.reduce((t, x) => t + x.value, 0); if (!s.length) return;
    el.append(ringBox(ring(s, [money0(tot), 'spent'], { size: 180, width: 26, title: 'Spending by category', chart: 'ring-cat' }), legend(s, tot), ['Spending by category', s]));
  });

  // 3. where the income went (top tile): fixed costs split out, then everyday spending, one-time and what was kept
  const incomeSplit = () => {
    const inPer = new Set(period().map((m) => m.month)); let inc = 0; const b = { home: 0, util: 0, subs: 0, every: 0, one: 0, mort: 0, rent: 0 };
    rows('txns').forEach((t) => {
      if (t.book !== book() || !inPer.has(t.month)) return;
      if (t.type === 'income') { inc += t.amount; return; }
      if (t.type !== 'expense') return;
      if (t.oneTime) b.one += t.amount;
      else if (/mortgage|home ?loan|escrow|\brent\b/i.test(`${t.category} ${t.vendor}`)) { b.home += t.amount; if (/mortgage|home ?loan|escrow/i.test(t.vendor) || (/mortgage/i.test(t.category) && !/\brent\b/i.test(t.vendor))) b.mort += t.amount; else b.rent += t.amount; }
      else if (/utilit|electric|water|sewer|trash|internet|cable|natural gas/i.test(t.category)) b.util += t.amount;
      else if (fixedKind(t) === 'subs') b.subs += t.amount;
      else b.every += t.amount;
    });
    return { inc, ...b, kept: inc - b.home - b.util - b.subs - b.every - b.one };
  };
  dash.draw('kWhere', (el) => {
    if (st('txns', 'period', 'subs') !== 'ok') return;
    el.replaceChildren(); const x = incomeSplit();
    if (!x.inc) { el.textContent = 'No income in this range.'; return; }
    const s = [[x.mort >= x.rent ? 'Mortgage' : 'Rent', x.home, '#ffffff'], ['Utilities', x.util, '#2f6fd6'], ['Subs', x.subs, '#d43d3d'], ['Everyday', x.every, '#f6d84a'], ['One-time', x.one, '#7b5ea7']]
      .filter(([, v]) => v > 0).map(([label, value, color]) => ({ label, value, color }));
    s.push(x.kept >= 0 ? { label: 'Kept', value: x.kept, color: '#0b5e31' } : { label: 'Overspent', value: -x.kept, color: '#8b1e1e' });
    const tot = x.kept >= 0 ? x.inc : x.inc - x.kept;
    el.append(ringBox(ring(s, [x.kept >= 0 ? `${Math.round((x.kept / x.inc) * 100)}%` : 'Over', x.kept >= 0 ? 'kept' : `by ${money0(-x.kept)}`], { size: 150, width: 30, labels: true, title: 'Where the income went', chart: 'ring-where' }), legend(s, tot, true), [`Income ${money0(x.inc)}`, s]));
  });

  // 7. budget bars with a pace marker
  dash.draw('budgetBars', (el) => {
    if (st('categories') !== 'ok') return;
    el.replaceChildren(); const mode = vGet('budget', 'bars');
    document.querySelectorAll('[data-draw=budgetRows]').forEach((t) => { const tb = t.closest('table'); if (tb) tb.hidden = mode === 'bars'; });
    el.append(vToggle('budget', 'bars', [['bars', 'Bars'], ['table', 'Table']], ['budgetBars']));
    if (mode !== 'bars') return;
    const last = lastMonth(); if (!last) return;
    const r = rows('categories').filter((x) => x.book === book() && x.month === last.month && x.planned > 0).sort((a, b) => b.planned - a.planned);
    if (!r.length) return;
    const bt = budTot(), pace = bt && bt.elapsed != null ? bt.elapsed : null;
    r.forEach((x) => {
      const cap = x.planned + (x.rollover ? x.carry || 0 : 0), used = cap ? x.actual / cap : 0;
      const row = document.createElement('div'); row.className = 'fd-bbar';
      const n = document.createElement('span'); n.textContent = x.category;
      const v = document.createElement('span'); v.className = used > 1 ? 'fd-bad' : ''; v.textContent = `${money0(x.actual)} of ${money0(cap)}` + (used > 1 ? ` · ${money0(x.actual - cap)} over` : ` · ${money0(cap - x.actual)} left`);
      const bar = document.createElement('div'); bar.className = 'fd-bbar-track';
      const f = document.createElement('span'); f.style.width = Math.min(100, used * 100) + '%'; f.style.background = used > 1 ? BAD : pace != null && used > pace + 0.05 ? WARN : OK; bar.append(f);
      if (pace != null) { const m = document.createElement('i'); m.style.left = pace * 100 + '%'; m.title = 'On pace'; bar.append(m); }
      row.append(n, v, bar); el.append(row);
    });
    if (pace != null) { const p = document.createElement('p'); p.className = 'fd-note'; p.textContent = 'The line marks how far through the month you are. Green: on pace · amber: ahead of pace · red: over budget.'; el.append(p); }
  });

  // 10. mortgage & loans: what's left to pay, principal vs interest
  dash.draw('loanRings', (el) => {
    if (st('accounts', 'balances') !== 'ok') return;
    el.replaceChildren();
    const ls = acctList().filter((a) => (a.kind === 'mortgage' || a.kind === 'loan') && a.active !== false && a.bal && a.bal.balance > 0 && Number(a.rate) >= 0 && Number(a.payment) > 0);
    if (!ls.length) { const p = document.createElement('p'); p.className = 'fd-note'; p.textContent = 'Add the rate and monthly payment on a mortgage or loan (Accounts) to see what’s left to pay.'; el.append(p); return; }
    const g = document.createElement('div'); g.className = 'fd-grid2';
    ls.forEach((a) => {
      const B = a.bal.balance, pi = Number(a.payment) - (Number(a.escrow) || 0), p = payoff(B, Number(a.rate), pi);
      const w = document.createElement('div'); const h = document.createElement('p'); h.className = 'fd-rb-h'; h.textContent = a.name; w.append(h);
      if (!p || p.never) { const n = document.createElement('p'); n.className = 'fd-note'; n.textContent = 'The payment doesn’t cover the interest, so it never pays off.'; w.append(n); g.append(w); return; }
      const s = [{ label: 'Principal left', value: B, color: dash.colors[0] }, { label: 'Interest still to pay', value: p.interest, color: WARN }];
      w.append(ringBox(ring(s, [addM(p.n), 'paid off'], { size: 150, width: 22, title: `${a.name}: left to pay`, chart: 'ring-loan' }), legend(s, B + p.interest), [`${a.name} · ${money0(B + p.interest)} left to pay`, s]));
      if (Number(a.extra) > 0) { const x = payoff(B, Number(a.rate), pi + Number(a.extra)); if (x && !x.never) { const n = document.createElement('p'); n.className = 'fd-note'; n.textContent = `With +${money0(a.extra)}/mo extra: paid off ${addM(x.n)}, ${money0(p.interest - x.interest)} less interest.`; w.append(n); } }
      g.append(w);
    });
    el.append(g);
  });

  // 11. spending calendar
  let calM = null, calDay = null;
  dash.draw('spendCal', (el) => {
    if (st('txns', 'period') !== 'ok') return;
    el.replaceChildren();
    const months = period().map((m) => m.month); if (!months.length) return;
    if (!calM || !months.includes(calM)) calM = months[months.length - 1];
    const tx = rows('txns').filter((t) => t.book === book() && t.type === 'expense' && !t.oneTime && t.month === calM && /^\d{4}-\d{2}-\d{2}$/.test(t.date || ''));
    const byDay = {}; tx.forEach((t) => { (byDay[t.date] = byDay[t.date] || []).push(t); });
    const sun = SET().weekStart === 'sun', [y, mo] = calM.split('-').map(Number), first = (new Date(Date.UTC(y, mo - 1, 1)).getUTCDay() + (sun ? 0 : 6)) % 7, nDays = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    const sums = Object.fromEntries(Object.entries(byDay).map(([d, a]) => [d, a.reduce((t, x) => t + x.amount, 0)])), max = Math.max(1, ...Object.values(sums));
    const head = document.createElement('div'); head.className = 'fd-rb-row';
    const i = months.indexOf(calM);
    const nav = (d, lab) => { const b = rbtn(lab, () => { calM = months[i + d]; calDay = null; dash.draw('spendCal'); }); b.disabled = !months[i + d]; b.setAttribute('aria-label', d < 0 ? 'Previous month' : 'Next month'); return b; };
    const t = document.createElement('strong'); t.textContent = new Date(Date.UTC(y, mo - 1, 1)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    head.append(nav(-1, '‹'), t, nav(1, '›')); el.append(head);
    const grid = document.createElement('div'); grid.className = 'fd-cal';
    (sun ? ['S', 'M', 'T', 'W', 'T', 'F', 'S'] : ['M', 'T', 'W', 'T', 'F', 'S', 'S']).forEach((d) => { const h = document.createElement('div'); h.className = 'fd-cal-h'; h.textContent = d; grid.append(h); });
    for (let k = 0; k < first; k++) grid.append(document.createElement('div'));
    for (let d = 1; d <= nDays; d++) {
      const iso = `${calM}-${String(d).padStart(2, '0')}`, v = sums[iso] || 0;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'fd-cal-d' + (calDay === iso ? ' is-on' : '');
      b.style.setProperty('--a', v ? (0.15 + 0.85 * Math.sqrt(v / max)).toFixed(2) : 0);
      b.title = `${iso}: ${money0(v)}`; b.setAttribute('aria-label', `${t.textContent} ${d}: ${money0(v)} spent`);
      const n = document.createElement('span'); n.textContent = d; b.append(n);
      if (v) { const s = document.createElement('small'); s.textContent = v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${Math.round(v)}`; b.append(s); }
      b.addEventListener('click', () => { calDay = calDay === iso ? null : iso; dash.draw('spendCal'); });
      grid.append(b);
    }
    el.append(grid);
    if (calDay && byDay[calDay]) {
      const tb = document.createElement('table'); tb.className = 'fd-table'; const body = document.createElement('tbody');
      byDay[calDay].sort((a, b) => b.amount - a.amount).forEach((x) => { const tr = document.createElement('tr'); tr.append(td(x.vendor, 'fd-l'), td(x.category, 'fd-l fd-zero'), td(money2(x.amount))); body.append(tr); });
      tb.append(body); el.append(tb);
    } else { const p = document.createElement('p'); p.className = 'fd-note'; p.textContent = 'Darker days had more everyday spending. Tap a day to see what was bought.'; el.append(p); }
  });

  // calendar of everyday spending for one month; tap a day to list it
  let rvDay = null;
  const calGrid = (month, selDay, onPick) => {
    const w = document.createElement('div');
    const tx = rows('txns').filter((t) => t.book === book() && t.type === 'expense' && !t.oneTime && t.month === month && /^\d{4}-\d{2}-\d{2}$/.test(t.date || ''));
    const byDay = {}; tx.forEach((t) => { (byDay[t.date] = byDay[t.date] || []).push(t); });
    const sun = SET().weekStart === 'sun', [y, mo] = month.split('-').map(Number), first = (new Date(Date.UTC(y, mo - 1, 1)).getUTCDay() + (sun ? 0 : 6)) % 7, nDays = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    const sums = Object.fromEntries(Object.entries(byDay).map(([d, a]) => [d, a.reduce((t, x) => t + x.amount, 0)])), max = Math.max(1, ...Object.values(sums));
    if (!tx.length) { const p = document.createElement('p'); p.className = 'fd-note'; p.textContent = 'No dated everyday spending this month (the sheet history has no day for each purchase).'; w.append(p); return w; }
    const grid = document.createElement('div'); grid.className = 'fd-cal';
    (sun ? ['S', 'M', 'T', 'W', 'T', 'F', 'S'] : ['M', 'T', 'W', 'T', 'F', 'S', 'S']).forEach((d) => { const h = document.createElement('div'); h.className = 'fd-cal-h'; h.textContent = d; grid.append(h); });
    for (let k = 0; k < first; k++) grid.append(document.createElement('div'));
    for (let d = 1; d <= nDays; d++) {
      const iso = `${month}-${String(d).padStart(2, '0')}`, v = sums[iso] || 0;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'fd-cal-d' + (selDay === iso ? ' is-on' : '');
      b.style.setProperty('--a', v ? (0.15 + 0.85 * Math.sqrt(v / max)).toFixed(2) : 0); b.title = `${iso}: ${money0(v)}`; b.setAttribute('aria-label', `${iso}: ${money0(v)} spent`);
      const n = document.createElement('span'); n.textContent = d; b.append(n);
      if (v) { const sm = document.createElement('small'); sm.textContent = v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${Math.round(v)}`; b.append(sm); }
      b.addEventListener('click', () => onPick(iso)); grid.append(b);
    }
    w.append(grid);
    if (selDay && byDay[selDay]) { const t = document.createElement('table'); t.className = 'fd-table'; const tb = document.createElement('tbody'); byDay[selDay].sort((a, b) => b.amount - a.amount).forEach((x) => { const tr = document.createElement('tr'); tr.append(td(x.vendor, 'fd-l'), td(x.category, 'fd-l fd-zero'), td(money2(x.amount))); tb.append(tr); }); t.append(tb); w.append(t); }
    else { const p = document.createElement('p'); p.className = 'fd-note'; p.textContent = 'Darker days had more everyday spending. Tap a day to see what was bought.'; w.append(p); }
    return w;
  };

  // ---- year in review, with a clickable snapshot for each month ----
  let ry = null, rmo = null;
  const rTx = (pre) => rows('txns').filter((t) => t.book === book() && String(t.month).startsWith(pre));
  const rYears = () => [...new Set(rows('txns').filter((t) => t.book === book()).map((t) => String(t.month).slice(0, 4)))].sort();
  const rStats = (tx) => {
    const s = { inc: 0, spend: 0, one: 0, n: tx.length, cats: {}, vend: {}, big: null };
    for (const t of tx) {
      if (t.type === 'income') s.inc += t.amount;
      else if (t.type === 'expense') {
        if (t.oneTime) s.one += t.amount; else s.spend += t.amount;
        s.cats[t.category] = (s.cats[t.category] || 0) + t.amount;
        if (!/^transfers?$/i.test(t.vendor)) s.vend[t.vendor] = (s.vend[t.vendor] || 0) + t.amount;
        if (shown(t) && (!s.big || t.amount > s.big.amount)) s.big = t;
      }
    }
    s.net = s.inc - s.spend - s.one; s.rate = s.inc > 0 ? Math.round((s.net / s.inc) * 100) : null;
    s.topCats = Object.entries(s.cats).sort((a, b) => b[1] - a[1]); s.topVend = Object.entries(s.vend).sort((a, b) => b[1] - a[1]);
    return s;
  };
  const tile = (label, value, sub, cls) => { const d = document.createElement('div'); d.className = 'fd-rtile'; const l = document.createElement('div'); l.className = 'fd-zero'; l.textContent = label; const v = document.createElement('div'); v.className = 'fd-rval ' + (cls || ''); v.textContent = value; d.append(l, v); if (sub) { const s2 = document.createElement('div'); s2.className = 'fd-zero fd-rsub'; s2.textContent = sub; d.append(s2); } return d; };
  const yoy = (now, before) => { if (!before) return ''; const p = Math.round(((now - before) / before) * 100); return `${p >= 0 ? '+' : ''}${p}% vs last year`; };
  const mName = (m, len = 'long') => new Date(m + '-01T00:00:00Z').toLocaleString('en-US', { month: len, timeZone: 'UTC' });
  const miniTable = (title, rowsIn, cols) => {
    const wrap = document.createElement('div'); const h = document.createElement('p'); h.className = 'fd-rb-h'; h.textContent = title; wrap.append(h);
    const t = document.createElement('table'); t.className = 'fd-table'; const tb = document.createElement('tbody');
    const hr = document.createElement('tr'); cols.forEach((c, i) => { const th = document.createElement('th'); th.textContent = c; if (!i) th.className = 'fd-l'; hr.append(th); }); tb.append(hr);
    rowsIn.forEach((r) => { const tr = document.createElement('tr'); r.forEach((v, i) => { const arr = Array.isArray(v); tr.append(td(arr ? v[0] : v, (i ? '' : 'fd-l ') + (arr ? v[1] || '' : ''))); }); tb.append(tr); });
    t.append(tb); wrap.append(t); return wrap;
  };
  dash.draw('reviewHead', (el) => {
    if (st('txns') !== 'ok') return;
    el.replaceChildren();
    const ys = rYears(); if (!ys.length) { el.textContent = 'No transactions yet.'; return; }
    if (!ry || !ys.includes(ry)) ry = ys[ys.length - 1];
    const bar = document.createElement('div'); bar.className = 'fd-rb-row';
    const s = document.createElement('select'); s.className = 'dash-select'; ys.slice().reverse().forEach((y) => s.append(new Option(y, y))); s.value = ry;
    s.addEventListener('change', () => { ry = s.value; rmo = null; ['reviewHead', 'reviewMonths', 'reviewSnap', 'reviewCats'].forEach((d) => dash.draw(d)); });
    const lab = document.createElement('span'); lab.textContent = 'Year'; bar.append(lab, s);
    const y = rStats(rTx(ry + '-')), py = rStats(rTx(String(+ry - 1) + '-'));
    const months = [...new Set(rTx(ry + '-').map((t) => t.month))].sort();
    if (months.length < 12) { const n = document.createElement('span'); n.className = 'fd-zero'; n.textContent = `${months.length} month${months.length === 1 ? '' : 's'} of data (${mName(months[0], 'short')}–${mName(months[months.length - 1], 'short')})`; bar.append(n); }
    const per = months.map((m) => [m, rStats(rTx(m))]).filter(([, x]) => x.spend > 0);
    const hi = per.slice().sort((a, b) => b[1].spend - a[1].spend)[0], lo = per.slice().sort((a, b) => a[1].spend - b[1].spend)[0];
    const subsYear = rows('subs').filter((x) => x.book === book()).reduce((t, x) => t + x.yearly, 0);
    const g = document.createElement('div'); g.className = 'fd-rtiles';
    g.append(
      tile('Income', money0(y.inc), py.inc ? yoy(y.inc, py.inc) : ''),
      tile('Everyday spending', money0(y.spend), py.spend ? yoy(y.spend, py.spend) : (y.one ? `+ ${money0(y.one)} one-time` : '')),
      tile('Kept', money0(y.net), y.rate != null ? `${y.rate}% of income` : '', y.net >= 0 ? 'fd-good' : 'fd-bad'),
      tile('Average month', money0(months.length ? y.spend / months.length : 0), 'everyday spending'),
      tile('Biggest month', hi ? mName(hi[0]) : '–', hi ? money0(hi[1].spend) : ''),
      tile('Lightest month', lo ? mName(lo[0]) : '–', lo ? money0(lo[1].spend) : ''),
      tile('Top category', y.topCats[0] ? y.topCats[0][0] : '–', y.topCats[0] ? money0(y.topCats[0][1]) : ''),
      tile('Top vendor', y.topVend[0] ? y.topVend[0][0] : '–', y.topVend[0] ? money0(y.topVend[0][1]) : ''),
      tile('Subscriptions', money0(subsYear) + '/yr', `${rows('subs').filter((x) => x.book === book()).length} recurring charges`),
      tile('Transactions', String(y.n), y.big ? `largest: ${y.big.vendor} ${money0(y.big.amount)}` : ''));
    { const cs = ser('bls', 'cpiMW') || ser('fred', 'cpi'), a0 = atOrBefore(cs, `${+ry - 1}-12`), a1 = atOrBefore(cs, `${ry}-12`);
      if (a0 && a1 && a1[0] > a0[0] && py.spend) { const infl = ((a1[1] - a0[1]) / a0[1]) * 100, sp = ((y.spend - py.spend) / py.spend) * 100, real = sp - infl;
        g.append(tile('After inflation', `${real >= 0 ? '+' : '−'}${Math.abs(real).toFixed(1)}%`, `spending ${sp >= 0 ? '+' : '−'}${Math.abs(sp).toFixed(1)}% vs prices ${infl >= 0 ? '+' : '−'}${Math.abs(infl).toFixed(1)}%`, real > 0 ? 'fd-bad' : 'fd-good')); } }
    el.append(bar, g, hideBar());
  });
  dash.draw('reviewMonths', (el) => {
    if (st('txns') !== 'ok') return;
    el.replaceChildren(); if (!ry) return;
    const g = document.createElement('div'); g.className = 'fd-mcards';
    const yMax = Math.max(1, ...Array.from({ length: 12 }, (_, k) => { const st2 = rStats(rTx(`${ry}-${pad2(k + 1)}`)); return Math.max(st2.inc, st2.spend + st2.one); }));
    for (let i = 1; i <= 12; i++) {
      const m = `${ry}-${pad2(i)}`, tx = rTx(m), s = rStats(tx);
      const b = document.createElement('button'); b.type = 'button'; b.className = 'fd-mcard' + (rmo === m ? ' is-on' : ''); b.disabled = !tx.length;
      const a = document.createElement('div'); a.className = 'fd-mname'; a.textContent = mName(m, 'short');
      const v = document.createElement('div'); v.textContent = tx.length ? money0(s.spend) : '–';
      const n = document.createElement('div'); n.className = 'fd-rsub ' + (s.net >= 0 ? 'fd-good' : 'fd-bad'); n.textContent = tx.length ? (s.net >= 0 ? '+' : '−') + money0(Math.abs(s.net)).replace('−', '') : '';
      const mb = document.createElement('div'); mb.className = 'fd-mbars'; mb.title = tx.length ? `Income ${money0(s.inc)} · spending ${money0(s.spend + s.one)}` : '';
      if (tx.length) [[s.inc, 'in'], [s.spend + s.one, 'out']].forEach(([val, c]) => { const sp = document.createElement('span'); sp.className = c; sp.style.width = (val / yMax) * 100 + '%'; mb.append(sp); });
      b.append(a, v, n, mb);
      b.addEventListener('click', () => { rmo = rmo === m ? null : m; rvDay = null; dash.draw('reviewMonths'); dash.draw('reviewSnap'); dash.draw('reviewCats'); setTimeout(() => document.querySelector('[data-draw=reviewSnap]')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50); });
      g.append(b);
    }
    const hint = document.createElement('p'); hint.className = 'fd-note'; hint.textContent = 'Each card shows everyday spending and what was kept. Bars: green = income, grey = spending. Click a month for its snapshot.';
    el.append(g, hint);
  });
  const pad2 = (n) => String(n).padStart(2, '0');
  dash.draw('reviewSnap', (el) => {
    if (st('txns') !== 'ok') return;
    el.replaceChildren(); if (!rmo) return;
    const [yy, mm] = rmo.split('-').map(Number), prev = `${mm === 1 ? yy - 1 : yy}-${pad2(mm === 1 ? 12 : mm - 1)}`;
    const s = rStats(rTx(rmo)), p = rStats(rTx(prev));
    const box = document.createElement('div'); box.className = 'fd-rb fd-snap';
    const head = document.createElement('div'); head.className = 'fd-goal-top';
    const h = document.createElement('strong'); h.textContent = `${mName(rmo)} ${yy} snapshot`;
    head.append(h, rbtn('Show these transactions', () => { dash.setParams({ range: 'custom', from: rmo, to: rmo }); goTx({}); }));
    const vs = (a, b) => (b ? `${a >= b ? '+' : '−'}${money0(Math.abs(a - b))} vs ${mName(prev, 'short')}` : '');
    const g = document.createElement('div'); g.className = 'fd-rtiles';
    const cash = rows('balance_totals').find((r) => r.book === book() && r.kind === 'deposit' && r.month === rmo);
    g.append(tile('Income', money0(s.inc), vs(s.inc, p.inc)), tile('Everyday spending', money0(s.spend), vs(s.spend, p.spend) + (s.one ? ` · + ${money0(s.one)} one-time` : '')),
      tile('Kept', money0(s.net), s.rate != null ? `${s.rate}% of income` : '', s.net >= 0 ? 'fd-good' : 'fd-bad'),
      tile('Biggest purchase', s.big ? money0(s.big.amount) : '–', s.big ? `${s.big.vendor} · ${s.big.category}` : ''),
      tile('Checking & savings', cash ? money0(cash.total) : '–', cash ? 'at month end' : 'not in the selected date range'));
    const cols = document.createElement('div'); cols.className = 'fd-grid2';
    cols.append(
      miniTable('Top categories', s.topCats.slice(0, 6).map(([c, v]) => { const d = v - (p.cats[c] || 0); return [c, money0(v), [p.cats[c] ? `${d >= 0 ? '+' : '−'}${money0(Math.abs(d))}` : 'new', d > 0 ? 'fd-bad' : 'fd-good']]; }), ['Category', 'Spent', `vs ${mName(prev, 'short')}`]),
      miniTable('Top vendors', s.topVend.slice(0, 6).map(([v, a]) => [v, money0(a), String(rTx(rmo).filter((t) => t.vendor === v && t.type === 'expense').length)]), ['Vendor', 'Spent', 'Purchases']));
    const ch = document.createElement('p'); ch.className = 'fd-rb-h'; ch.textContent = 'Spending by day';
    box.append(head, g, cols, ch, calGrid(rmo, rvDay, (d) => { rvDay = rvDay === d ? null : d; dash.draw('reviewSnap'); })); el.append(box);
  });
  dash.draw('reviewCats', (el) => {
    if (st('txns') !== 'ok') return;
    el.replaceChildren(); if (!ry || rmo) return;
    const y = rStats(rTx(ry + '-')), py = rStats(rTx(String(+ry - 1) + '-')), tot = y.topCats.reduce((t, [, v]) => t + v, 0) || 1;
    const months = new Set(rTx(ry + '-').map((t) => t.month)).size || 1;
    el.append(miniTable(`Spending by category in ${ry}`, y.topCats.map(([c, v]) => [c, money0(v), `${Math.round((v / tot) * 100)}%`, money0(v / months), py.cats[c] ? [`${v >= py.cats[c] ? '+' : '−'}${money0(Math.abs(v - py.cats[c]))}`, v > py.cats[c] ? 'fd-bad' : 'fd-good'] : '–']),
      ['Category', 'Total', 'Share', 'Per month', `vs ${+ry - 1}`]));
  });

  // ---- holdings: shares bought in lots, sold first-in-first-out, priced live where the server can ----
  let DIVS = {}, QUOTES = {}, QSRC = [], QLIVE = false, qWant = '', qBusy = false, he = null, hSort = 'value';
  const hRows = () => rows('holdings').filter((h) => h.book === book());
  const hNum = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
  const hCalc = (h) => {
    const lots = (h.lots || []).filter((l) => hNum(l.qty) > 0).map((l) => ({ ...l, left: hNum(l.qty) })).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    let realized = 0, soldQty = 0;
    for (const s of (h.sales || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
      let q = hNum(s.qty); soldQty += q;
      for (const l of lots) { if (q <= 0) break; const take = Math.min(l.left, q); l.left -= take; q -= take; realized += take * (hNum(s.price) - hNum(l.price)); }
    }
    const shares = lots.reduce((t, l) => t + l.left, 0), cost = lots.reduce((t, l) => t + l.left * hNum(l.price), 0);
    const qt = QUOTES[h.symbol], price = qt ? qt.price : (hNum(h.manualPrice) > 0 ? hNum(h.manualPrice) : null);
    const value = price != null ? shares * price : null, gain = value != null ? value - cost : null;
    const day = qt && qt.prevClose ? shares * (qt.price - qt.prevClose) : null;
    const longTerm = lots.filter((l) => l.left > 0 && l.date && (Date.now() - Date.parse(l.date)) > 365 * 86400000).reduce((t, l) => t + l.left, 0);
    const yearAgo = Date.now() - 365 * 864e5, heldOn = (d) => (h.lots || []).filter((l) => !l.date || l.date <= d).reduce((t, l) => t + hNum(l.qty), 0) - (h.sales || []).filter((x) => x.date && x.date <= d).reduce((t, x) => t + hNum(x.qty), 0);
    const manualD = (h.divs || []).filter((x) => Date.parse(x.date) >= yearAgo).reduce((t, x) => t + hNum(x.amount), 0);
    const autoD = (DIVS[h.symbol] || []).filter((x) => Date.parse(x.date) >= yearAgo).reduce((t, x) => t + Math.max(0, heldOn(x.date)) * x.amount, 0);
    const divs12 = (h.divs || []).length ? manualD : autoD, divSrc = (h.divs || []).length ? 'entered' : autoD ? 'FMP' : '';
    return { divs12, divSrc, divYield: value ? (divs12 / value) * 100 : null, shares, cost, avg: shares ? cost / shares : 0, price, value, gain, pct: gain != null && cost ? (gain / cost) * 100 : null, realized, soldQty, day, live: !!qt, src: qt ? qt.source : (price != null ? 'entered' : ''), asOf: qt ? String(qt.asOf).slice(0, 10) : h.manualAsOf || '', longTerm, openLots: lots.filter((l) => l.left > 0) };
  };
  let dWant = '';
  const loadDivs = async () => {
    const own = [...new Set(hRows().map((h) => h.symbol).filter(Boolean))].sort().join(',');
    if (!own || own === dWant) return; dWant = own;
    try { const r = await FDStore.fetch('/api/dividends?s=' + encodeURIComponent(own), {}); if (r.ok) { DIVS = (await r.json()).dividends || {}; ['holdRows', 'holdTotals', 'divCal'].forEach((d) => dash.draw(d)); } } catch {}
  };
  let hDet = null; const SD = {};
  const loadDetail = (sym) => { if (SD[sym]) return SD[sym].v; SD[sym] = { v: null }; FDStore.fetch('/api/stock?s=' + encodeURIComponent(sym), {}).then((r) => (r.ok ? r.json() : null)).then((v) => { SD[sym].v = v || { errors: ['unavailable'] }; ['holdRows', 'holdAlloc'].forEach((d) => dash.draw(d)); }).catch(() => {}); return null; };
  const stockPanel = (sym, c) => {
    const w = document.createElement('div'); w.className = 'fd-stock'; const d = loadDetail(sym);
    if (!d) { w.textContent = 'Loading details…'; return w; }
    const col = (title) => { const x = document.createElement('div'); x.append(rhead(title)); w.append(x); return x; };
    if (d.range && d.range.hi && d.range.lo) { const x = col('52-week range'); const p = c.price, pos = p ? Math.max(0, Math.min(1, (p - d.range.lo) / (d.range.hi - d.range.lo))) : null;
      const bar = document.createElement('div'); bar.className = 'fd-bbar-track'; if (pos != null) { const m = document.createElement('i'); m.style.left = pos * 100 + '%'; bar.append(m); }
      const lab = document.createElement('div'); lab.className = 'fd-rsub fd-zero'; lab.textContent = `${money2(d.range.lo)} – ${money2(d.range.hi)}${pos != null ? ` · now at ${Math.round(pos * 100)}% of the range` : ''}${d.range.ytd != null ? ` · ${pctTxt(d.range.ytd)} this year` : ''}`; x.append(bar, lab); }
    if (d.earnings) { const x = col('Next earnings'); const p = document.createElement('div'); p.textContent = `${d.earnings.date}${d.earnings.when === 'bmo' ? ' (before market open)' : d.earnings.when === 'amc' ? ' (after close)' : ''}${d.earnings.eps != null ? ` · EPS estimate ${money2(d.earnings.eps)}` : ''}`; x.append(p); }
    if (d.rec || d.target) { const x = col('Analysts'); if (d.rec) { const t = d.rec.buy + d.rec.hold + d.rec.sell; const p = document.createElement('div'); p.textContent = `${d.rec.buy} buy · ${d.rec.hold} hold · ${d.rec.sell} sell`; x.append(p); if (t) { const bar = document.createElement('div'); bar.className = 'fd-recbar'; [['buy', d.rec.buy], ['hold', d.rec.hold], ['sell', d.rec.sell]].forEach(([k, n]) => { const sp = document.createElement('span'); sp.className = k; sp.style.width = (n / t) * 100 + '%'; bar.append(sp); }); x.append(bar); } }
      if (d.target && d.target.mean) { const p = document.createElement('div'); p.className = 'fd-rsub'; p.textContent = `Price target ${money2(d.target.mean)}${c.price ? ` (${pctTxt((d.target.mean / c.price - 1) * 100)} from now)` : ''}${d.target.lo ? ` · range ${money2(d.target.lo)}–${money2(d.target.hi)}` : ''}`; x.append(p); } }
    if (d.sectors && d.sectors.length) { const x = col('What the fund holds (by sector)'); d.sectors.slice().sort((a, b) => b.pct - a.pct).slice(0, 6).forEach((s2) => { const p = document.createElement('div'); p.className = 'fd-rsub'; p.textContent = `${s2.sector} ${s2.pct.toFixed(1)}%`; x.append(p); }); }
    if (d.news && d.news.length) { const x = col('Recent news'); d.news.forEach((n) => { const p = document.createElement('div'); p.className = 'fd-rsub'; if (n.url) { const a = document.createElement('a'); a.href = n.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = n.headline; p.append(a); } else p.textContent = n.headline; const sm = document.createElement('span'); sm.className = 'fd-zero'; sm.textContent = ` · ${n.source} ${n.at}`; p.append(sm); x.append(p); }); }
    if (!w.children.length) w.textContent = 'No details available for this symbol with your current data plans.';
    return w;
  };
  // dividend calendar: next 12 months projected from each holding's payment history (FMP) or entered dividends
  dash.draw('divCal', (el) => {
    el.replaceChildren(); if (st('holdings') !== 'ok' || PART('h-divcal')) return;
    const hs = hRows(); if (!hs.length) return; loadDivs();
    const now = new Date(), start = new Date(now.getFullYear(), now.getMonth(), 1), months = [];
    for (let i = 0; i < 12; i++) { const d = new Date(start.getFullYear(), start.getMonth() + i, 1); months.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleString('en-US', { month: 'short' }) + (d.getMonth() === 0 || i === 0 ? ` '${String(d.getFullYear()).slice(2)}` : ''), total: 0, items: [] }); }
    hs.forEach((h) => { const c = hCalc(h); if (!c.shares) return;
      const hist = ((h.divs || []).length ? h.divs.map((x) => ({ date: x.date, amount: hNum(x.amount) / (c.shares || 1) })) : (DIVS[h.symbol] || [])).filter((x) => x.date).sort((a, b) => b.date.localeCompare(a.date));
      if (hist.length < 2) return;
      const gaps = []; for (let i = 0; i < Math.min(4, hist.length - 1); i++) gaps.push((Date.parse(hist[i].date) - Date.parse(hist[i + 1].date)) / 864e5);
      const g = gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)], step = g < 45 ? 1 : g < 120 ? 3 : g < 240 ? 6 : 12;
      let d = new Date(hist[0].date + 'T12:00:00');
      for (let n = 0; n < 24; n++) { d = new Date(d.getFullYear(), d.getMonth() + step, Math.min(d.getDate(), 28)); const m = months.find((x) => x.key === `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); if (d < start) continue; if (!m) break; const amt = hist[0].amount * c.shares; m.total += amt; m.items.push(`${h.symbol} ${money2(amt)}`); }
    });
    const sum = months.reduce((t, m) => t + m.total, 0); if (!sum) return;
    el.append(rhead(`Dividend calendar · about ${money2(sum)} expected over the next 12 months`));
    const max = Math.max(...months.map((m) => m.total)) || 1, row = document.createElement('div'); row.className = 'fd-divcal';
    months.forEach((m) => { const c = document.createElement('div'); c.className = 'fd-divcal-m'; const bar = document.createElement('i'); bar.style.height = Math.max(m.total ? 6 : 0, (m.total / max) * 70) + 'px'; const v = document.createElement('b'); v.textContent = m.total ? money2(m.total).replace(/\.\d+$/, '') : ''; const l = document.createElement('span'); l.textContent = m.label; c.title = m.items.join('\n') || 'No payments expected'; c.append(v, bar, l); row.append(c); });
    el.append(row);
    const p = document.createElement('p'); p.className = 'fd-note'; p.textContent = 'Estimated from each holding\'s recent payment pattern and your current shares. Hover a month for the breakdown.'; el.append(p);
  });
  // allocation by sector: funds are split by what they hold (FMP), stocks use their own sector
  const sectorSplit = (items, total) => {
    const m = {}; items.forEach(([h, c]) => { const isFund = h.kind === 'etf' || h.kind === 'fund'; const d = isFund && QLIVE ? loadDetail(h.symbol) : null;
      if (d && d.sectors && d.sectors.length) { const sum = d.sectors.reduce((t, x) => t + x.pct, 0) || 100; d.sectors.forEach((x) => { m[x.sector] = (m[x.sector] || 0) + c.value * (x.pct / sum); }); }
      else { const k = h.sector || QUOTES[h.symbol]?.sector || 'Unknown'; m[k] = (m[k] || 0) + c.value; } });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  };
  const loadQuotes = async (force) => {
    const syms = [...new Set([...hRows().map((h) => h.symbol), ...(prefGet('watch', []) || []).map((w) => w.symbol)].filter(Boolean))].sort().join(',');
    if (!syms || qBusy || (!force && syms === qWant)) return; qWant = syms; qBusy = true;
    try { const r = await FDStore.fetch('/api/quotes?s=' + encodeURIComponent(syms), {}); if (r.ok) { const j = await r.json(); QUOTES = j.quotes || {}; QSRC = [...new Set(Object.values(QUOTES).map((x) => x.source))]; QLIVE = true; } } catch {}
    qBusy = false; ['holdRows', 'holdTotals', 'holdAlloc', 'watchView'].forEach((d) => dash.draw(d));
  };
  const pctTxt = (v) => (v == null ? '' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}%`);
  dash.draw('holdTotals', (el) => {
    if (st('holdings') !== 'ok') return;
    el.replaceChildren(); loadQuotes(); loadDivs();
    const hs = hRows(); if (!hs.length) return;
    const cs = hs.map(hCalc), sum = (f) => cs.reduce((t, c) => t + (c[f] || 0), 0);
    const value = sum('value'), cost = sum('cost'), gain = cs.filter((c) => c.value != null).reduce((t, c) => t + c.gain, 0), day = cs.some((c) => c.day != null) ? sum('day') : null;
    const g = document.createElement('div'); g.className = 'fd-rtiles';
    g.append(tile('Market value', money0(value), cs.some((c) => c.price == null) ? 'some holdings have no price yet' : ''), tile('Cost of shares held', money0(cost), ''),
      tile('Unrealized gain', money0(gain), cost ? pctTxt((gain / cost) * 100) : '', gain >= 0 ? 'fd-good' : 'fd-bad'),
      tile('Realized gain', money0(sum('realized')), 'from shares sold', sum('realized') >= 0 ? 'fd-good' : 'fd-bad'));
    if (sum('divs12') > 0) g.append(tile('Dividends (12 mo)', money0(sum('divs12')), value ? `${((sum('divs12') / value) * 100).toFixed(2)}% yield` : '', 'fd-good'));
    if (day != null) g.append(tile('Today', money0(day), value ? pctTxt((day / (value - day)) * 100) : '', day >= 0 ? 'fd-good' : 'fd-bad'));
    const n = document.createElement('p'); n.className = 'fd-note';
    n.textContent = QSRC.length ? `Prices from ${QSRC.join(', ')} (refreshed hourly, delayed). ` : QLIVE ? 'Couldn’t get live prices right now, so entered prices are used. ' : 'Live prices are available on the self-hosted app; here, enter a price on each holding. ';
    const sync = rbtn('Update account balances from holdings', async () => {
      const by = {}; hs.forEach((h, i) => { if (h.account && cs[i].value != null) by[h.account] = (by[h.account] || 0) + cs[i].value; });
      const today = new Date().toLocaleDateString('en-CA'), names = Object.keys(by);
      if (!names.length) { n.textContent = 'Link holdings to an account (and make sure each has a price) to update balances.'; return; }
      try { const d = await db(); for (const a of names) { const ac = acctList().find((x) => keyA(x.name) === keyA(a)); await d.collection('data/household/imports').add({ book: book(), accountKind: 'investment', accountType: ac?.type || '', accountName: a, owner: ac?.owner || '', fileName: '', importedAt: new Date().toISOString(), rowCount: 0, balance: Math.round(by[a] * 100) / 100, balanceMonth: today.slice(0, 7), asOf: today, txns: [] }); }
        n.textContent = `Recorded today’s balance for ${names.join(', ')}.`; } catch { n.textContent = 'Couldn’t record balances. Try again.'; }
    });
    const rf = rbtn('Refresh prices', () => loadQuotes(true));
    const bar = document.createElement('div'); bar.className = 'fd-rb-row'; bar.append(sync); if (QLIVE) bar.append(rf);
    el.append(g, n, bar);
  });
  dash.draw('holdEditor', (el) => {
    el.replaceChildren();
    if (!he) { el.append(rbtn('+ Add holding', () => { he = { id: null, symbol: '', name: '', kind: 'stock', account: '', sector: '', manualPrice: '', lots: [{ date: new Date().toISOString().slice(0, 10), qty: '', price: '' }], sales: [] }; dash.draw('holdEditor'); }, false)); return; }
    const box = document.createElement('div'); box.className = 'fd-rb'; box.append(rhead(he.id ? `Edit ${he.symbol}` : 'New holding'));
    const row = (label, node) => { const r = document.createElement('div'); r.className = 'fd-rb-row'; const l = document.createElement('span'); l.className = 'fd-rb-lbl'; l.textContent = label; r.append(l, node); box.append(r); };
    row('Symbol', rin(he.symbol, 'e.g. VTI, AAPL', (v) => { he.symbol = v.toUpperCase(); }));
    row('Name (optional)', rin(he.name, QUOTES[he.symbol]?.name || 'e.g. Vanguard Total Stock Market', (v) => { he.name = v; }));
    const ks = document.createElement('select'); ks.className = 'dash-select'; [['stock', 'Stock'], ['etf', 'ETF'], ['fund', 'Mutual fund'], ['bond', 'Bond'], ['crypto', 'Crypto'], ['other', 'Other']].forEach(([v, t]) => ks.append(new Option(t, v))); ks.value = he.kind; ks.addEventListener('change', () => { he.kind = ks.value; }); row('Type', ks);
    const as = document.createElement('select'); as.className = 'dash-select'; as.append(new Option('No account', ''), ...acctList().filter((a) => a.kind === 'investment' && a.active !== false).map((a) => new Option(a.name, a.name))); as.value = he.account; as.addEventListener('change', () => { he.account = as.value; }); row('Held in', as);
    row('Sector (optional)', rin(he.sector, QUOTES[he.symbol]?.sector || 'filled in from price data when available', (v) => { he.sector = v; }));
    const mp = rin(he.manualPrice, 'only if there’s no live price', (v) => { he.manualPrice = v; }); mp.type = 'number'; mp.step = '0.0001'; mp.min = '0'; row('Price per share ($)', mp);
    const lotList = (title, key, addLabel) => {
      box.append(rhead(title));
      he[key].forEach((l, i) => {
        const r = document.createElement('div'); r.className = 'fd-rb-row fd-lot';
        const d = rin(l.date, '', (v) => { l.date = v; }); d.type = 'date';
        const qn = rin(l.qty, 'shares', (v) => { l.qty = v; }); qn.type = 'number'; qn.step = 'any'; qn.min = '0';
        const pr = rin(l.price, '$ per share', (v) => { l.price = v; }); pr.type = 'number'; pr.step = '0.0001'; pr.min = '0';
        r.append(d, qn, pr, rbtn('×', () => { he[key].splice(i, 1); dash.draw('holdEditor'); })); box.append(r);
      });
      box.append(rbtn(addLabel, () => { he[key].push({ date: new Date().toISOString().slice(0, 10), qty: '', price: '' }); dash.draw('holdEditor'); }));
    };
    lotList('Purchases (date · shares · price)', 'lots', '+ Buy more'); lotList('Sales (date · shares · price)', 'sales', '+ Sell shares');
    box.append(rhead('Dividends received (date · amount) — optional'));
    he.divs = he.divs || [];
    he.divs.forEach((l, i) => { const r = document.createElement('div'); r.className = 'fd-rb-row fd-lot'; const d = rin(l.date, '', (v) => { l.date = v; }); d.type = 'date'; const am = rin(l.amount, '$ received', (v) => { l.amount = v; }); am.type = 'number'; am.step = '0.01'; am.min = '0'; r.append(d, am, rbtn('×', () => { he.divs.splice(i, 1); dash.draw('holdEditor'); })); box.append(r); });
    const dn = document.createElement('p'); dn.className = 'fd-note'; dn.textContent = QLIVE ? 'Leave empty to estimate dividends from FMP’s dividend history and your share count on each ex-dividend date.' : 'Enter dividends here to track dividend income.'; box.append(dn);
    box.append(rbtn('+ Add dividend', () => { he.divs.push({ date: new Date().toLocaleDateString('en-CA'), amount: '' }); dash.draw('holdEditor'); }));
    const msg = document.createElement('p'); msg.className = 'fd-note fd-bad';
    const save = rbtn('Save holding', async () => {
      const sym = String(he.symbol || '').trim().toUpperCase(); const lots = he.lots.filter((l) => Number(l.qty) > 0);
      if (!/^[A-Z0-9.\-^]{1,12}$/.test(sym) || !lots.length) { msg.textContent = 'Enter a symbol and at least one purchase with shares.'; return; }
      const bought = lots.reduce((t, l) => t + Number(l.qty), 0), sold = he.sales.reduce((t, l) => t + (Number(l.qty) || 0), 0);
      if (sold > bought + 1e-9) { msg.textContent = 'You can’t sell more shares than you bought.'; return; }
      save.disabled = true;
      try { const d = await db(); const doc = { book: book(), symbol: sym, name: he.name, kind: he.kind, account: he.account, sector: he.sector || QUOTES[sym]?.sector || '', manualPrice: Number(he.manualPrice) || 0, manualAsOf: Number(he.manualPrice) > 0 ? new Date().toLocaleDateString('en-CA') : '',
          lots: lots.map((l) => ({ date: l.date, qty: Number(l.qty), price: Number(l.price) || 0 })), sales: he.sales.filter((l) => Number(l.qty) > 0).map((l) => ({ date: l.date, qty: Number(l.qty), price: Number(l.price) || 0 })), divs: (he.divs || []).filter((x) => Number(x.amount) > 0).map((x) => ({ date: x.date, amount: Number(x.amount) })) };
        await d.collection('data/household/holdings').add(doc); if (he.id) await d.doc('data/household/holdings/' + he.id).delete(); he = null; qWant = ''; dash.draw('holdEditor');
      } catch { save.disabled = false; msg.textContent = 'Couldn’t save. Try again.'; }
    }, false);
    const bar = document.createElement('div'); bar.className = 'fd-rb-row'; bar.append(save, rbtn('Cancel', () => { he = null; dash.draw('holdEditor'); }));
    if (he.id) { const del = rbtn('Delete holding', async () => { try { const d = await db(); await d.doc('data/household/holdings/' + he.id).delete(); he = null; dash.draw('holdEditor'); } catch { msg.textContent = 'Couldn’t delete. Try again.'; } }); del.style.color = 'var(--color-bad)'; bar.append(del); }
    box.append(bar, msg); el.append(box);
    setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 30);
  });
  dash.draw('holdRows', (el) => {
    if (st('holdings') !== 'ok') return;
    el.replaceChildren(); const hs = hRows();
    if (!hs.length) { const p = document.createElement('p'); p.className = 'fd-note'; p.textContent = 'No holdings yet. Press “+ Add holding” and enter your first purchase.'; el.append(p); return; }
    const list = hs.map((h) => [h, hCalc(h)]).filter(([, c]) => c.shares > 0 || c.realized);
    const keyF = { value: ([, c]) => -(c.value || 0), gain: ([, c]) => -(c.pct ?? -1e9), symbol: ([h]) => h.symbol };
    list.sort((a, b) => { const x = keyF[hSort](a), y = keyF[hSort](b); return x < y ? -1 : x > y ? 1 : 0; });
    const t = document.createElement('table'); t.className = 'fd-table fd-hold'; const tb = document.createElement('tbody');
    const hr = document.createElement('tr'); [['Holding', 'symbol'], ['Shares'], ['Avg cost'], ['Price'], ['Value', 'value'], ['Gain', 'gain'], ['Dividends 12 mo']].forEach(([c, k], i) => { const th = document.createElement('th'); th.textContent = c + (hSort === k ? ' ▾' : ''); if (!i) th.className = 'fd-l'; if (k) { th.style.cursor = 'pointer'; th.addEventListener('click', () => { hSort = k; dash.draw('holdRows'); }); } hr.append(th); }); tb.append(hr);
    for (const [h, c] of list) {
      const tr = document.createElement('tr'); tr.style.cursor = 'pointer'; tr.title = 'Click to edit, buy more or sell';
      const nm = td('', 'fd-l'); const b = document.createElement('strong'); b.textContent = h.symbol; const sub = document.createElement('div'); sub.className = 'fd-zero fd-rsub'; sub.textContent = [h.name || QUOTES[h.symbol]?.name, h.account].filter(Boolean).join(' · '); nm.append(b, sub);
      const pc = td(c.price != null ? money2(c.price) : '—'); if (c.price != null) { const s2 = document.createElement('div'); s2.className = 'fd-rsub ' + (c.day != null ? (c.day >= 0 ? 'fd-good' : 'fd-bad') : 'fd-zero'); s2.textContent = c.day != null ? pctTxt((QUOTES[h.symbol].price / QUOTES[h.symbol].prevClose - 1) * 100) + ' today' : (c.live ? c.asOf : 'entered ' + (c.asOf || '')); pc.append(s2); }
      const gn = td(c.gain != null ? money0(c.gain) : '—', c.gain == null ? '' : c.gain >= 0 ? 'fd-good' : 'fd-bad'); if (c.pct != null) { const s3 = document.createElement('div'); s3.className = 'fd-rsub'; s3.textContent = pctTxt(c.pct) + (c.realized ? ` · ${money0(c.realized)} realized` : ''); gn.append(s3); }
      const dv = td(c.divs12 ? money0(c.divs12) : '–'); if (c.divs12) { const s4 = document.createElement('div'); s4.className = 'fd-rsub fd-zero'; s4.textContent = (c.divYield != null ? `${c.divYield.toFixed(2)}% yield · ` : '') + c.divSrc; dv.append(s4); }
      tr.append(nm, td(+c.shares.toFixed(4) + ''), td(money2(c.avg)), pc, td(c.value != null ? money0(c.value) : '—'), gn, dv);
      if (!PART('h-det') && QLIVE) { const ib = document.createElement('button'); ib.type = 'button'; ib.className = 'fd-gear fd-gear-inline'; ib.textContent = 'ⓘ'; ib.title = 'News, earnings and analyst view'; ib.setAttribute('aria-label', 'Details for ' + h.symbol); ib.addEventListener('click', (e) => { e.stopPropagation(); hDet = hDet === h.symbol ? null : h.symbol; dash.draw('holdRows'); }); b.after(' ', ib); }
      tr.addEventListener('click', () => { he = { id: h.id, symbol: h.symbol, name: h.name || '', kind: h.kind || 'stock', account: h.account || '', sector: h.sector || '', manualPrice: h.manualPrice || '', lots: (h.lots || []).map((l) => ({ ...l })), sales: (h.sales || []).map((l) => ({ ...l })), divs: (h.divs || []).map((l) => ({ ...l })) }; dash.draw('holdEditor'); });
      tb.append(tr);
      if (hDet === h.symbol) { const dr = document.createElement('tr'); const dc = document.createElement('td'); dc.colSpan = 7; dc.append(stockPanel(h.symbol, c)); dr.append(dc); tb.append(dr); }
    }
    t.append(tb); el.append(t);
  });
  dash.draw('holdAlloc', (el) => {
    if (st('holdings') !== 'ok') return; if (PART('h-alloc')) { el.replaceChildren(); return; }
    el.replaceChildren(); let atCost = false; const items = hRows().map((h) => { const c = hCalc(h); if (!(c.value > 0) && c.cost > 0) { atCost = true; return [h, { ...c, value: c.cost }]; } return [h, c]; }).filter(([, c]) => c.value > 0); if (!items.length) return;
    if (atCost) { const n = document.createElement('p'); n.className = 'fd-note'; n.textContent = 'Holdings without a current price are counted at what you paid.'; el.append(n); }
    const total = items.reduce((t, [, c]) => t + c.value, 0);
    const KN = { stock: 'Stocks', etf: 'ETFs', fund: 'Mutual funds', bond: 'Bonds', crypto: 'Crypto', other: 'Other' };
    const group = (f) => { const m = {}; items.forEach(([h, c]) => { const k = f(h) || 'Unknown'; m[k] = (m[k] || 0) + c.value; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
    const block = (title, entries) => {
      const w = document.createElement('div'); w.append(rhead(title));
      entries.forEach(([k, v]) => { const p = (v / total) * 100; const r = document.createElement('div'); r.className = 'fd-alloc'; const l = document.createElement('span'); l.textContent = k; const val = document.createElement('span'); val.textContent = `${p.toFixed(1)}% · ${money0(v)}`; const bar = document.createElement('div'); bar.className = 'fd-dowbar'; const f = document.createElement('span'); f.style.width = p + '%'; bar.append(f); r.append(l, val, bar); w.append(r); });
      return w;
    };
    const big = items.filter(([, c]) => c.value / total > 0.2 && items.length > 2).map(([h, c]) => `${h.symbol} is ${Math.round((c.value / total) * 100)}% of your holdings`);
    if (!PART('h-rings')) {
      const rings = document.createElement('div'); rings.className = 'fd-grid3';
      const mkRing = (title, entries, chart) => { const top = entries.slice(0, 5), rest = entries.slice(5).reduce((t, [, v]) => t + v, 0); const sl = [...top, ...(rest > 0 ? [['Other', rest]] : [])].map(([k, v], i) => ({ label: k, value: v, color: colorFor(chart, k, PAL[i % PAL.length]) }));
        const svg = ring(sl, [money0(total), title.toLowerCase()], { size: 150, width: 24, chart, title: `${title}: ${money0(total)}` }); return ringBox(svg, legend(sl, total), [title, sl]); };
      const cls = (h) => (h.kind === 'bond' ? 'Bonds' : h.kind === 'crypto' ? 'Crypto' : h.kind === 'other' ? 'Other' : 'Stocks & funds');
      rings.append(mkRing('By type', group((h) => KN[h.kind] || 'Other'), 'ring-alloc-type'), mkRing('By asset class', group(cls), 'ring-alloc-class'), mkRing('By account', group((h) => h.account || 'No account'), 'ring-alloc-acct'));
      el.append(rings);
    }
    const g = document.createElement('div'); g.className = 'fd-grid2';
    g.append(block('By holding', items.map(([h, c]) => [h.symbol, c.value]).sort((a, b) => b[1] - a[1])), block('By type', group((h) => KN[h.kind] || 'Other')), block('By sector', sectorSplit(items, total)), block('By account', group((h) => h.account || 'No account')));
    if (big.length) { const w = document.createElement('p'); w.className = 'fd-note fd-bad'; w.textContent = 'Concentration: ' + big.join('; ') + '.'; el.append(w); }
    el.append(g);
  });

  // ================= Planning: debt payoff planner + 90-day cash forecast =================
  const PAL = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)', 'var(--series-6)'];
  const debtList = (withMortgage) => acctList().filter((a) => a.active !== false && a.bal && a.bal.balance > 0.5 && (a.kind === 'credit' || a.kind === 'loan' || (withMortgage && a.kind === 'mortgage')))
    .map((a) => { const bal = a.bal.balance, apr = Number(a.rate) || 0, set = Number(a.payment) - (Number(a.escrow) || 0);
      const est = a.kind === 'credit' ? Math.max(25, bal * 0.01 + (bal * apr) / 1200) : 0;
      return { name: a.name, kind: a.kind, bal, apr, min: set > 0 ? set : Math.round(est), estimated: !(set > 0), noRate: a.rate == null || a.rate === '' }; });
  // month-by-month: interest, minimums, then extra (plus freed-up minimums) to the target debt
  const simulate = (debts, extra, order) => {
    const d = debts.map((x) => ({ ...x, b: x.bal, paidMonth: null, interest: 0 })), n0 = d.length; let month = 0, total = 0;
    const pick = () => d.filter((x) => x.b > 0.005).sort(order === 'snowball' ? (a, b) => a.b - b.b : order === 'avalanche' ? (a, b) => b.apr - a.apr || a.b - b.b : () => 0)[0];
    while (d.some((x) => x.b > 0.005) && month < 600) {
      month++; let pool = order === 'minimum' ? 0 : extra;
      for (const x of d) { if (x.b <= 0.005) { if (order !== 'minimum') pool += x.min; continue; } const it = (x.b * x.apr) / 1200; x.interest += it; total += it; x.b += it; const pay = Math.min(x.b, x.min); x.b -= pay; if (pay < x.min && order !== 'minimum') pool += x.min - pay; }
      while (pool > 0.005) { const t = pick(); if (!t) break; const pay = Math.min(t.b, pool); t.b -= pay; pool -= pay; }
      for (const x of d) if (x.b <= 0.005 && x.paidMonth == null) x.paidMonth = month;
    }
    return { months: d.every((x) => x.paidMonth != null) ? Math.max(0, ...d.map((x) => x.paidMonth)) : null, interest: total, debts: d, n: n0 };
  };
  let planX = null, planOrder = 'avalanche', planMort = false;
  dash.draw('planner', (el) => {
    el.replaceChildren(); if (st('balances', 'accounts') !== 'ok') return;
    const debts = debtList(planMort);
    if (!debts.length) { const p = document.createElement('p'); p.className = 'fd-note'; p.textContent = 'No credit cards or loans with a balance. Record their balances (Import → Record a statement balance) and set each one’s rate and payment under Accounts → Edit.'; el.append(p); return; }
    if (planX == null) planX = prefGet('planExtra', 200) || 0;
    const ctl = document.createElement('div'); ctl.className = 'fd-rb-row';
    [['avalanche', 'Avalanche (highest rate first)'], ['snowball', 'Snowball (smallest balance first)']].forEach(([k, l]) => ctl.append(rbtn(l, () => { planOrder = k; dash.draw('planner'); }, planOrder !== k)));
    const mk = document.createElement('label'); mk.className = 'fd-check'; const mc = document.createElement('input'); mc.type = 'checkbox'; mc.checked = planMort; mc.addEventListener('change', () => { planMort = mc.checked; dash.draw('planner'); }); mk.append(mc, ' Include mortgage'); ctl.append(mk);
    const sl = document.createElement('label'); sl.className = 'fd-field fd-narrow'; sl.textContent = 'Extra each month ';
    const r = document.createElement('input'); r.type = 'range'; r.min = 0; r.max = 3000; r.step = 25; r.value = planX; const rv = document.createElement('b'); rv.textContent = money0(planX);
    r.addEventListener('input', () => { rv.textContent = money0(Number(r.value)); }); r.addEventListener('change', () => { planX = Number(r.value); prefSet('planExtra', planX); dash.draw('planner'); });
    sl.append(r, ' ', rv); el.append(ctl, sl);
    const res = { avalanche: simulate(debts, planX, 'avalanche'), snowball: simulate(debts, planX, 'snowball'), minimum: simulate(debts, 0, 'minimum') }, cur = res[planOrder];
    const sum = document.createElement('div'); sum.className = 'fd-grid3';
    [['minimum', 'Minimum payments only'], ['avalanche', 'Avalanche'], ['snowball', 'Snowball']].forEach(([k, l]) => { const x = res[k], c = document.createElement('div'); c.className = 'fd-rb' + (k === planOrder ? ' fd-on' : '');
      const h = document.createElement('div'); h.className = 'fd-rsub'; h.textContent = l + (k !== 'minimum' && planX ? ` + ${money0(planX)}/mo` : '');
      const b = document.createElement('div'); b.className = 'fd-big fd-mid'; b.textContent = x.months == null ? '50+ years' : addM(x.months);
      const s2 = document.createElement('div'); s2.className = 'fd-rsub'; s2.textContent = x.months == null ? 'Payments don’t cover the interest' : `Debt-free in ${dur(x.months)} · ${money0(x.interest)} interest`;
      if (k !== 'minimum' && res.minimum.months != null && x.months != null) { const sv = document.createElement('div'); sv.className = 'fd-rsub fd-good'; sv.textContent = `Saves ${money0(res.minimum.interest - x.interest)} and ${dur(Math.max(0, res.minimum.months - x.months)) || '0 mo'}`; c.append(h, b, s2, sv); } else c.append(h, b, s2);
      sum.append(c); });
    el.append(sum);
    const tb = document.createElement('table'); tb.className = 'fd-table'; const th = document.createElement('tr'); ['Debt', 'Balance', 'Rate', 'Payment', 'Order', 'Paid off', 'Interest'].forEach((t, i) => { const c = document.createElement('th'); c.textContent = t; if (!i) c.className = 'fd-l'; th.append(c); }); tb.append(th);
    const ordered = cur.debts.slice().sort((a, b) => (a.paidMonth ?? 1e9) - (b.paidMonth ?? 1e9));
    ordered.forEach((x, i) => { const tr = document.createElement('tr'); tr.append(td(x.name, 'fd-l'), td(money0(x.bal)), td(x.noRate ? 'set rate' : x.apr + '%', x.noRate ? 'fd-zero' : ''), td(money0(x.min) + (x.estimated ? ' (est.)' : '')), td(String(i + 1)), td(x.paidMonth == null ? '—' : addM(x.paidMonth)), td(money0(x.interest))); tb.append(tr); });
    const sc = document.createElement('div'); sc.className = 'fd-scroll'; sc.append(tb); el.append(sc);
    const notes = []; if (debts.some((x) => x.estimated)) notes.push('“est.” = no payment set on the account, so a typical card minimum is assumed; set the real one under Accounts → Edit.'); if (debts.some((x) => x.noRate)) notes.push('Debts with no rate are treated as 0% interest.');
    notes.push('Avalanche saves the most interest; snowball clears individual debts sooner. When a debt is paid off, its payment rolls into the next one.');
    const p = document.createElement('p'); p.className = 'fd-note'; p.textContent = notes.join(' '); el.append(p);
  });

  // 90-day cash forecast: bills from Subscriptions & recurring, paychecks detected from income, plus typical other spending
  const recurringIncome = () => {
    const since = new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10), by = {};
    rows('txns').filter((t) => t.book === book() && t.type === 'income' && !t.oneTime && t.date >= since).forEach((t) => { (by[t.vendor] = by[t.vendor] || []).push(t); });
    return Object.entries(by).filter(([, l]) => l.length >= 2).map(([vendor, l]) => { l.sort((a, b) => a.date.localeCompare(b.date));
      const gaps = l.slice(1).map((t, i) => (Date.parse(t.date) - Date.parse(l[i].date)) / 864e5).sort((a, b) => a - b), gap = gaps[Math.floor(gaps.length / 2)];
      // the amount per payment comes from the source's real monthly total (last 3 full months), so odd dates in imported history can't inflate it
      const every = Math.max(7, Math.round(gap)), start = new Date(); start.setUTCDate(1); start.setUTCMonth(start.getUTCMonth() - 3); const from = start.toISOString().slice(0, 10), to = new Date(new Date().setUTCDate(1)).toISOString().slice(0, 10);
      const monthly = l.filter((t) => t.date >= from && t.date < to).reduce((s, t) => s + t.amount, 0) / 3;
      return { vendor, amount: (monthly * every) / 30.44, monthly, every, last: l[l.length - 1].date }; }).filter((x) => x.every <= 45 && x.monthly > 0);
  };
  dash.draw('forecast90', (el) => {
    el.replaceChildren(); if (st('subs', 'monthly', 'balance_totals', 'txns') !== 'ok') return;
    const cash = latestTotal(['deposit'])[0];
    if (!cash) { const p = document.createElement('p'); p.className = 'fd-note'; p.textContent = 'Record your checking and savings balances to see the forecast.'; el.append(p); return; }
    const today = new Date(); today.setUTCHours(0, 0, 0, 0); const DAYS = 90, ev = [];
    rows('subs').filter((x) => x.book === book()).forEach((x) => { const n = nextDue(x); if (!n) return; const d = new Date(n.date); for (let g = 0; g < 12 && d - today < DAYS * 864e5; g++) { ev.push({ day: Math.round((d - today) / 864e5), label: x.vendor, amt: -x.lastCharge }); d.setUTCMonth(d.getUTCMonth() + (n.monthly ? 1 : 12)); } });
    const inc = recurringIncome(); inc.forEach((x) => { let d = Date.parse(x.last + 'T00:00:00Z'); while ((d += x.every * 864e5) - today < DAYS * 864e5) if (d >= today) ev.push({ day: Math.round((d - today) / 864e5), label: x.vendor, amt: x.amount }); });
    const m = rows('monthly').filter((r) => r.book === book() && !isCurrent(r.month)).slice(-3), avg = (f) => (m.length ? m.reduce((s, r) => s + r[f], 0) / m.length : 0);
    const recurringMonthly = rows('subs').filter((x) => x.book === book() && Math.abs(x.yearly - x.lastCharge * 12) < 1).reduce((s, x) => s + x.lastCharge, 0);
    const daily = Math.max(0, avg('spend') - recurringMonthly) / 30.4;
    const low = Number(prefGet('fcLow', 500)) || 0;
    let bal = cash.total, minB = bal, minDay = 0; const pts = [];
    for (let i = 0; i <= DAYS; i++) { if (i) bal -= daily; ev.filter((e) => e.day === i).forEach((e) => { bal += e.amt; }); if (bal < minB) { minB = bal; minDay = i; } const d = new Date(today.getTime() + i * 864e5); pts.push({ label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }), v: Math.round(bal) }); }
    const when = (i) => new Date(today.getTime() + i * 864e5).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    const head = document.createElement('p'); head.className = 'fd-note' + (minB < low ? ' fd-bad' : '');
    head.textContent = `Checking & savings: ${money0(cash.total)} today → about ${money0(bal)} in 90 days. Lowest point ≈ ${money0(minB)} around ${when(minDay)}.` + (minB < low ? ` ⚠ That's below your ${money0(low)} cushion.` : '');
    el.append(head);
    const box = document.createElement('div'); box.className = 'fd-box'; el.append(box);
    window.FD.lineChart(box, { labels: pts.map((p) => p.label), zero: false, aria: '90-day cash forecast', series: [{ name: 'Projected cash', points: pts }, ...(low ? [{ name: 'Cushion', points: pts.map((p) => ({ label: p.label, v: low })) }] : [])] });
    const row = document.createElement('div'); row.className = 'fd-rb-row'; const lab = document.createElement('label'); lab.className = 'fd-field fd-narrow'; lab.textContent = 'Warn me below ';
    const li = document.createElement('input'); li.type = 'number'; li.min = 0; li.step = 100; li.value = low; li.style.width = '7em'; li.addEventListener('change', () => { prefSet('fcLow', Math.max(0, Number(li.value) || 0)); dash.draw('forecast90'); }); lab.append(li); row.append(lab); el.append(row);
    const g = document.createElement('div'); g.className = 'fd-grid2';
    const list = (title, items, empty1) => { const w = document.createElement('div'); w.append(rhead(title)); if (!items.length) { const p = document.createElement('p'); p.className = 'fd-note'; p.textContent = empty1; w.append(p); }
      items.forEach((e) => { const r2 = document.createElement('div'); r2.className = 'fd-alloc'; const a = document.createElement('span'); a.textContent = `${when(e.day)} · ${e.label}`; const b = document.createElement('span'); b.textContent = (e.amt > 0 ? '+' : '−') + money0(Math.abs(e.amt)); b.className = e.amt > 0 ? 'fd-good' : ''; r2.append(a, b); w.append(r2); }); return w; };
    g.append(list('Expected income', ev.filter((e) => e.amt > 0).sort((a, b) => a.day - b.day).slice(0, 12), 'No regular income found in the last 4 months (needs 2+ deposits from the same source).'),
      list('Bills & recurring', ev.filter((e) => e.amt < 0).sort((a, b) => a.day - b.day).slice(0, 15), 'No recurring bills found.'));
    el.append(g);
    const p = document.createElement('p'); p.className = 'fd-note'; p.textContent = `Also assumes about ${money0(daily * 30.4)} a month of other everyday spending (your last ${m.length} months, minus recurring bills). Paychecks are detected from income that arrived at least twice in the last 4 months.`; el.append(p);
  });

  // ================= Broker positions import (Holdings) =================
  let posImp = null;
  dash.draw('posImport', (el) => {
    el.replaceChildren(); if (st('holdings', 'accounts') !== 'ok') return;
    if (!posImp) { el.append(rbtn('Import positions from a brokerage CSV…', () => { posImp = { step: 'pick' }; dash.draw('posImport'); })); return; }
    const w = document.createElement('div'); w.className = 'fd-rb'; w.append(rhead('Import positions'));
    const note = document.createElement('p'); note.className = 'fd-note'; note.textContent = 'On your brokerage website, open Positions (or Holdings) and download/export it as CSV. Fidelity, Vanguard, Schwab, E*TRADE and most others work. Each position becomes a holding with one lot at your average cost.'; w.append(note);
    const fi = document.createElement('input'); fi.type = 'file'; fi.accept = '.csv,text/csv';
    fi.addEventListener('change', async () => { const f = fi.files[0]; if (!f) return; const r = window.FDImport.parsePositions(await f.text()); posImp = { step: 'review', ...r, file: f.name, pick: r.rows.map(() => true), acct: '', replace: true, date: new Date().toLocaleDateString('en-CA') }; dash.draw('posImport'); });
    w.append(fi);
    if (posImp.step === 'review') {
      if (posImp.error) { const e = document.createElement('p'); e.className = 'fd-note fd-bad'; e.textContent = posImp.error; w.append(e); }
      if (posImp.rows.length) {
        const accts = acctList().filter((a) => a.kind === 'investment').map((a) => a.name);
        const r1 = document.createElement('div'); r1.className = 'fd-rb-row';
        const al = document.createElement('label'); al.className = 'fd-field'; al.textContent = 'Investment account';
        const sel = document.createElement('select'); sel.className = 'dash-select'; sel.append(new Option('Use the account in the file (or none)', ''), ...accts.map((n) => new Option(n, n))); sel.value = posImp.acct; sel.addEventListener('change', () => { posImp.acct = sel.value; }); al.append(sel);
        const dl = document.createElement('label'); dl.className = 'fd-field fd-narrow'; dl.textContent = 'Lot date'; const di = document.createElement('input'); di.type = 'date'; di.value = posImp.date; di.addEventListener('change', () => { posImp.date = di.value; }); dl.append(di);
        const rl = document.createElement('label'); rl.className = 'fd-check'; const rc = document.createElement('input'); rc.type = 'checkbox'; rc.checked = posImp.replace; rc.addEventListener('change', () => { posImp.replace = rc.checked; }); rl.append(rc, ' Replace holdings I already have for the same symbol and account');
        r1.append(al, dl, rl); w.append(r1);
        const tb = document.createElement('table'); tb.className = 'fd-table'; const h = document.createElement('tr'); ['', 'Symbol', 'Name', 'Shares', 'Avg cost', 'Type'].forEach((t, i) => { const c = document.createElement('th'); c.textContent = t; if (i < 3 || i === 5) c.className = 'fd-l'; h.append(c); }); tb.append(h);
        posImp.rows.forEach((x, i) => { const tr = document.createElement('tr'); const c0 = document.createElement('td'); const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = posImp.pick[i]; cb.addEventListener('change', () => { posImp.pick[i] = cb.checked; }); c0.append(cb);
          tr.append(c0, td(x.symbol, 'fd-l'), td(x.name, 'fd-l fd-zero'), td(String(x.qty)), td(x.price != null ? money2(x.price) : 'unknown'), td(x.kind, 'fd-l')); tb.append(tr); });
        const sc = document.createElement('div'); sc.className = 'fd-scroll'; sc.append(tb); w.append(sc);
        const msg = document.createElement('p'); msg.className = 'fd-note';
        const go = rbtn(`Import ${posImp.rows.length} positions`, async () => {
          go.disabled = true; msg.textContent = 'Saving…';
          try {
            const d = await db(), have = hRows(); let n = 0;
            for (const [i, x] of posImp.rows.entries()) { if (!posImp.pick[i]) continue; const account = posImp.acct || x.account || '';
              if (posImp.replace) for (const h2 of have.filter((h2) => h2.symbol === x.symbol && (h2.account || '') === account)) await d.doc('data/household/holdings/' + h2.id).delete();
              await d.collection('data/household/holdings').add({ symbol: x.symbol, name: x.name, account, kind: x.kind, sector: '', lots: [{ date: posImp.date, qty: x.qty, price: x.price || 0 }], sales: [], divs: [] }); n++; }
            posImp = null; qWant = ''; msg.textContent = `Imported ${n} positions.`; dash.draw('posImport');
          } catch (e) { go.disabled = false; msg.className = 'fd-note fd-bad'; msg.textContent = 'Not saved: ' + (e.message || 'only editors can change holdings'); }
        }, false);
        const bar = document.createElement('div'); bar.className = 'fd-rb-row'; bar.append(go, rbtn('Cancel', () => { posImp = null; dash.draw('posImport'); })); w.append(bar, msg);
        if (posImp.rows.some((x) => x.price == null)) { const p = document.createElement('p'); p.className = 'fd-note'; p.textContent = 'Some positions have no cost in the file; they’re saved at $0 cost. Edit those holdings to enter what you paid.'; w.append(p); }
      }
    } else w.append(rbtn('Cancel', () => { posImp = null; dash.draw('posImport'); }));
    el.append(w);
  });

  // ================= Planning: net worth projection & retirement estimate =================
  const numIn = (label, val, onChange, attrs = {}) => { const l = document.createElement('label'); l.className = 'fd-field fd-narrow'; l.textContent = label; const i = document.createElement('input'); i.type = 'number'; i.value = val; Object.assign(i, attrs); i.style.width = '7em'; i.addEventListener('change', () => onChange(Number(i.value))); l.append(i); return l; };
  dash.draw('projection', (el) => {
    el.replaceChildren(); if (st('balance_totals', 'monthly') !== 'ok') return;
    const inv = (latestTotal(['investment'])[0] || {}).total || 0, cash = (latestTotal(['deposit'])[0] || {}).total || 0;
    const m = rows('monthly').filter((r) => r.book === book() && !isCurrent(r.month)).slice(-6), avg = (f) => (m.length ? m.reduce((s, r) => s + r[f], 0) / m.length : 0);
    const P = { age: 35, retire: 65, ret: 6, infl: 2.5, save: Math.max(0, Math.round(avg('income') - avg('spend'))), spend: Math.round(avg('spend') * 12), wd: 4, cashIn: false, ...(prefGet('projection', {}) || {}) };
    const set = (k) => (v) => { P[k] = v; prefSet('projection', P); dash.draw('projection'); };
    const f = document.createElement('div'); f.className = 'fd-rb-row';
    f.append(numIn('Your age', P.age, set('age'), { min: 16, max: 90 }), numIn('Retire at', P.retire, set('retire'), { min: 30, max: 90 }), numIn('Saved each month $', P.save, set('save'), { min: 0, step: 50 }),
      numIn('Yearly spending in retirement $', P.spend, set('spend'), { min: 0, step: 1000 }), numIn('Return % / yr', P.ret, set('ret'), { step: 0.5 }), numIn('Inflation %', P.infl, set('infl'), { step: 0.5 }), numIn('Withdrawal %', P.wd, set('wd'), { step: 0.25, min: 2, max: 8 }));
    const cl = document.createElement('label'); cl.className = 'fd-check'; const cc = document.createElement('input'); cc.type = 'checkbox'; cc.checked = !!P.cashIn; cc.addEventListener('change', () => set('cashIn')(cc.checked)); cl.append(cc, ' Count checking & savings too'); f.append(cl);
    el.append(f);
    const start = inv + (P.cashIn ? cash : 0), r = P.ret / 100, i = P.infl / 100, pts = [], real = [];
    let bal = start, fiAge = null, runsOut = null; const need = P.wd > 0 ? P.spend / (P.wd / 100) : Infinity;
    for (let age = P.age, y = 0; age <= 95; age++, y++) {
      const defl = Math.pow(1 + i, y); pts.push({ label: String(age), v: Math.round(bal) }); real.push({ label: String(age), v: Math.round(bal / defl) });
      if (fiAge == null && bal / defl >= need) fiAge = age;
      if (age < P.retire) bal = bal * (1 + r) + P.save * 12; else { bal = bal * (1 + r) - P.spend * defl; if (bal <= 0 && runsOut == null) { runsOut = age + 1; bal = 0; } }
    }
    const at = real.find((p) => Number(p.label) === P.retire), atN = pts.find((p) => Number(p.label) === P.retire);
    const sum = document.createElement('div'); sum.className = 'fd-grid3';
    const tile = (h, big, sub, cls) => { const c = document.createElement('div'); c.className = 'fd-rb'; const a = document.createElement('div'); a.className = 'fd-rsub'; a.textContent = h; const b = document.createElement('div'); b.className = 'fd-big fd-mid' + (cls ? ' ' + cls : ''); b.textContent = big; const s2 = document.createElement('div'); s2.className = 'fd-rsub'; s2.textContent = sub; c.append(a, b, s2); return c; };
    sum.append(tile(`At ${P.retire}`, at ? money0(at.v) : '—', `in today's dollars (${atN ? money0(atN.v) : '—'} in future dollars)`),
      tile('Enough to retire on', money0(need), `${money0(P.spend)}/yr at a ${P.wd}% withdrawal rate · ${fiAge != null ? `reached around age ${fiAge}` : 'not reached by 95'}`, fiAge != null && fiAge <= P.retire ? 'fd-good' : ''),
      tile('Money lasts', runsOut ? `to age ${runsOut}` : 'past 95', runsOut ? 'spending outpaces savings and growth — save more, retire later or spend less' : 'with this plan', runsOut ? 'fd-bad' : 'fd-good'));
    el.append(sum);
    const box = document.createElement('div'); box.className = 'fd-box'; el.append(box);
    window.FD.lineChart(box, { labels: pts.map((p) => p.label), zero: true, aria: 'Projected investments by age', series: [{ name: "Today's dollars", points: real }, { name: 'Future dollars', points: pts }] });
    el.append(phMsg(`Starts from ${money0(start)} (investments${P.cashIn ? ' + checking & savings' : ''}). Saved-each-month defaults to your average income minus spending over the last ${m.length} months; retirement spending defaults to your current yearly spending. A rough estimate with a steady return — real markets go up and down, and taxes, Social Security and pensions aren't included.`));
  });

  // ================= Taxes: yearly summary of tax-relevant spending and income =================
  const TAX_GROUPS = [['Charitable giving', /charit|donat|church|tithe|nonprofit|goodwill|red cross|united way/i], ['Medical & dental', /medical|health|doctor|dental|dentist|vision|optom|pharm|hospital|clinic|copay|prescription|therapy|chiropract/i],
    ['HSA / FSA', /\bhsa\b|\bfsa\b|health savings|flexible spending/i], ['Mortgage & property tax', /mortgage|property tax|real estate tax|escrow/i], ['Education', /tuition|education|school|college|student|529|book store|textbook/i],
    ['Childcare', /child ?care|daycare|day care|preschool|babysit|nanny/i], ['Business & work expenses', /business|office supply|work expense|professional dues|union dues/i], ['Energy-efficient home', /solar|heat pump|insulation|ev charger/i]];
  let taxYear = null;
  dash.draw('taxReport', (el) => {
    el.replaceChildren(); if (st('txns') !== 'ok') return;
    const all = rows('txns').filter((t) => t.book === book()), years = [...new Set(all.map((t) => String(t.date || t.month || '').slice(0, 4)).filter((y) => /^\d{4}$/.test(y)))].sort().reverse();
    if (!years.length) { el.append(phMsg('Import some transactions to see a tax summary.')); return; }
    if (!taxYear || !years.includes(taxYear)) taxYear = years.find((y) => Number(y) < new Date().getFullYear()) || years[0];
    const row = document.createElement('div'); row.className = 'fd-rb-row'; const ys = document.createElement('select'); ys.className = 'dash-select'; years.forEach((y) => ys.append(new Option(y, y))); ys.value = taxYear; ys.addEventListener('change', () => { taxYear = ys.value; dash.draw('taxReport'); });
    const lab = document.createElement('label'); lab.className = 'fd-field fd-narrow'; lab.textContent = 'Tax year '; lab.append(ys); row.append(lab); el.append(row);
    const yr = all.filter((t) => String(t.date || t.month || '').startsWith(taxYear) && t.type !== 'transfer');
    const groupOf = (t) => { if ((t.tags || []).some((g) => /^tax/i.test(g))) return 'Tagged “tax”'; const txt = `${t.category} ${t.vendor} ${t.description || ''}`; const g = TAX_GROUPS.find(([, re]) => re.test(txt)); return g ? g[0] : null; };
    const exp = yr.filter((t) => t.type === 'expense'), inc = yr.filter((t) => t.type === 'income'), by = {};
    exp.forEach((t) => { const g = groupOf(t); if (!g) return; (by[g] = by[g] || []).push(t); });
    const sumOf = (l) => l.reduce((s, t) => s + Number(t.amount || 0), 0);
    const incBy = {}; inc.forEach((t) => { const k = t.vendor || t.category || 'Other income'; incBy[k] = (incBy[k] || 0) + Number(t.amount || 0); });
    const g = document.createElement('div'); g.className = 'fd-grid2';
    const tbl = (title, entries, total) => { const w = document.createElement('div'); w.append(rhead(title)); if (!entries.length) w.append(phMsg('Nothing found.'));
      entries.forEach(([k, v, n]) => { const r = document.createElement('div'); r.className = 'fd-alloc'; const a = document.createElement('span'); a.textContent = k + (n ? ` (${n})` : ''); const b = document.createElement('span'); b.textContent = money2(v); r.append(a, b); w.append(r); });
      if (entries.length) { const r = document.createElement('div'); r.className = 'fd-alloc fd-total'; const a = document.createElement('b'); a.textContent = 'Total'; const b = document.createElement('b'); b.textContent = money2(total); r.append(a, b); w.append(r); } return w; };
    const ge = Object.entries(by).map(([k, l]) => [k, sumOf(l), l.length]).sort((a, b) => b[1] - a[1]);
    g.append(tbl('Possibly deductible or tax-relevant spending', ge, ge.reduce((s, x) => s + x[1], 0)), tbl('Income received', Object.entries(incBy).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => [k, v]), sumOf(inc)));
    el.append(g);
    el.append(rbtn(`Download ${taxYear} tax transactions (CSV)`, () => {
      const esc = (v) => { const s2 = String(v ?? ''); return /[",\r\n]/.test(s2) ? '"' + s2.replace(/"/g, '""') + '"' : s2; };
      const list = [...exp.filter(groupOf).map((t) => [groupOf(t), t]), ...inc.map((t) => ['Income', t])].sort((a, b) => a[0].localeCompare(b[0]) || String(a[1].date).localeCompare(String(b[1].date)));
      const lines = [['Group', 'Date', 'Vendor', 'Category', 'Description', 'Amount', 'Account'].join(',')].concat(list.map(([k, t]) => [k, t.date || t.month, t.vendor, t.category, t.description, Number(t.amount).toFixed(2), t.source].map(esc).join(',')));
      saveFile(`tax-${taxYear}-${String(book()).toLowerCase()}.csv`, lines.join('\r\n'), 'text/csv');
    }, false));
    el.append(phMsg('Spending is grouped by matching category, vendor and description words (medical, charity, tuition…) plus anything you tag “tax”. Tag a transaction “tax” to include it. Mortgage interest and property tax usually come from your lender’s Form 1098, not from payments. This is a starting point for you or your tax preparer, not tax advice.'));
  });

  // ⚙ Settings → Weekly email (server and desktop host only)
  let DIG = null;
  const emailBox = async (host) => {
    if (window.FD_LOCAL) return; const tok = {}; host.__email = tok;
    if (!DIG) { try { const r = await FDStore.fetch('/api/digest', {}); if (!r.ok) return; DIG = await r.json(); } catch (e) { return; } }
    if (host.__email !== tok || host.querySelector('.fd-emailbox')) return;
    const box = document.createElement('div'); box.className = 'fd-rb fd-apis fd-emailbox'; box.append(rhead('Weekly email')); host.append(box);
    box.append(phMsg('A short email once a week: last week’s spending and top categories, this month’s budget, bills due in the next 7 days and anything that needs attention, for each of your dashboards.'));
    const me = DIG.me, r1 = document.createElement('div'); r1.className = 'fd-rb-row';
    const em = document.createElement('input'); em.type = 'email'; em.className = 'fd-in'; em.placeholder = 'you@example.com'; em.value = me.email || '';
    const on = document.createElement('label'); on.className = 'fd-check'; const oc = document.createElement('input'); oc.type = 'checkbox'; oc.checked = !!me.on; on.append(oc, ' Send it');
    const day = document.createElement('select'); day.className = 'dash-select'; ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'].forEach((d, i) => day.append(new Option(d, i))); day.value = me.day;
    const hr = document.createElement('select'); hr.className = 'dash-select'; for (let h = 5; h <= 21; h++) hr.append(new Option(`at ${h % 12 || 12}:00 ${h < 12 ? 'AM' : 'PM'}`, h)); hr.value = me.hour;
    r1.append(em, on, day, hr); box.append(r1);
    const msg = phMsg('');
    const saveMe = async () => { const r = await FDStore.fetch('/api/digest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ me: { email: em.value.trim(), on: oc.checked, day: Number(day.value), hour: Number(hr.value) } }) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Not saved'); DIG = null; };
    const btns = document.createElement('div'); btns.className = 'fd-rb-row'; box.append(btns);
    btns.append(rbtn('Save', async () => { try { await saveMe(); msg.className = 'fd-note fd-good'; msg.textContent = oc.checked ? 'Saved. Your weekly email is on.' : 'Saved.'; } catch (e) { msg.className = 'fd-note fd-bad'; msg.textContent = e.message; } }, false),
      rbtn('Send me one now', async () => { msg.className = 'fd-note'; msg.textContent = 'Sending…'; try { await saveMe(); const r = await FDStore.fetch('/api/digest/test', { method: 'POST' }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error); msg.className = 'fd-note fd-good'; msg.textContent = `Sent to ${em.value.trim()}. Check your inbox (and spam folder).`; } catch (e) { msg.className = 'fd-note fd-bad'; msg.textContent = e.message; } })); box.append(msg);
    // the server's mail account (owner only)
    const sm = DIG.smtp;
    if (!DIG.canEditSmtp) { box.append(phMsg(sm.host ? `Email is sent through the account ${DIG.owner} set up.` : `${DIG.owner} (who set up this server) needs to add an email account here before weekly emails can be sent.`)); return; }
    box.append(rhead('Sending account (only you can change this)'));
    const r2 = document.createElement('div'); r2.className = 'fd-rb-row';
    const fld = (ph, v, type = 'text', w) => { const i = document.createElement('input'); i.type = type; i.className = 'fd-in'; i.placeholder = ph; i.value = v || ''; if (w) i.style.maxWidth = w; r2.append(i); return i; };
    const h = fld('Mail server, e.g. smtp.gmail.com', sm.host), pt = fld('Port', sm.port, 'number', '6em'), u = fld('Username (usually your email)', sm.user), pw = fld(sm.passSet ? 'Password saved (leave blank to keep)' : 'Password or app password', '', 'password'), fr = fld('From address (optional)', sm.from, 'email');
    box.append(r2, phMsg('Gmail: smtp.gmail.com, port 465, and an "app password" (Google Account → Security → 2-Step Verification → App passwords), not your normal password. Outlook/Hotmail: smtp-mail.outlook.com, port 587. The password is stored only in this server’s data folder.'));
    const m2 = phMsg('');
    box.append(rbtn('Save sending account', async () => { try { const r = await FDStore.fetch('/api/digest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ smtp: { host: h.value, port: Number(pt.value), user: u.value, pass: pw.value, from: fr.value } }) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error); DIG = null; m2.className = 'fd-note fd-good'; m2.textContent = 'Saved. Use "Send me one now" to test it.'; } catch (e) { m2.className = 'fd-note fd-bad'; m2.textContent = e.message || 'Not saved'; } }), m2);
  };

  // ⚙ Settings → Automatic bank sync (SimpleFIN Bridge: the user subscribes there; we only keep its read-only access link)
  const KIND_NAMES = { 'deposit:checking': 'Checking', 'deposit:savings': 'Savings', 'deposit:hysa': 'High-yield savings', 'deposit:money_market': 'Money market', 'deposit:cd': 'CD', 'deposit:cash_mgmt': 'Cash management',
    'credit:card': 'Credit card', 'credit:loc': 'Line of credit', 'mortgage:mortgage': 'Mortgage', 'loan:heloc': 'Home equity (HELOC)', 'loan:auto': 'Auto loan', 'loan:student': 'Student loan', 'loan:personal': 'Personal loan', 'loan:other': 'Other loan',
    'investment:brokerage': 'Brokerage', 'investment:401k': '401(k)', 'investment:403b': '403(b)', 'investment:457b': '457(b)', 'investment:roth_ira': 'Roth IRA', 'investment:trad_ira': 'Traditional IRA', 'investment:rollover_ira': 'Rollover IRA',
    'investment:sep_ira': 'SEP IRA', 'investment:hsa': 'HSA', 'investment:529': '529 plan', 'investment:pension': 'Pension', 'investment:crypto': 'Crypto', 'investment:other': 'Other investment' };
  const syncBox = async (host) => {
    const tok = {}; host.__sync = tok; const bid = myBookId(); if (!bid) return;
    const url = `/api/books/${encodeURIComponent(bid)}/simplefin`;
    const call = async (path, method, body) => { const r = await FDStore.fetch(url + path, method ? { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined } : {}); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status); return j; };
    let st; try { st = await call(''); } catch (e) { return; }
    if (host.__sync !== tok || host.querySelector('.fd-syncbox')) return;
    const box = document.createElement('div'); box.className = 'fd-rb fd-apis fd-syncbox'; host.append(box);
    const ro = document.body.classList.contains('fd-readonly');
    const draw = () => {
      box.textContent = ''; box.append(rhead('Automatic bank sync (SimpleFIN)'));
      const msg = phMsg('');
      if (!st.connected) {
        box.append(phMsg('Pull balances and new transactions from your banks automatically, instead of importing statements. It uses SimpleFIN Bridge, a separate read-only service you subscribe to yourself (about $15 a year). Your bank passwords go to SimpleFIN, never to this app, and nothing passes through us.'));
        const ol = document.createElement('ol'); ol.className = 'fd-note';
        for (const t of ['Sign up at SimpleFIN Bridge (link below), start a subscription and connect your banks there.', 'In SimpleFIN Bridge, create a new “setup token” for this app and copy it.', 'Paste it below and press Connect, then check the account names and types.'])
          { const li = document.createElement('li'); li.textContent = t; ol.append(li); }
        // step-by-step screenshots of SimpleFIN Bridge
        const guide = document.createElement('details'); guide.className = 'fd-sfguide'; const sm = document.createElement('summary'); sm.textContent = 'Show me step by step (with pictures)'; guide.append(sm);
        [['Open SimpleFIN Bridge and press Get started.'], ['Enter your email and press Send sign-in email. Open the link in that email and press Finish signing in. (Check your spam folder if it doesn’t arrive.)'],
          ['Read and accept the Terms of Use.'], ['Go to Billing → Subscribe and choose monthly ($1.50) or yearly ($15). SimpleFIN suggests monthly first, until you’re sure your banks work.'],
          ['On My account, press New connection and link each bank or card. Banks can take a day or two to show transactions.'], ['Under Apps, press New app connection, name it “Larenest” and press Create Setup Token.'],
          ['Copy the setup token (it’s shown only once and works only once), paste it below and press Connect.'],
          ['Linking a bank (step 5 in detail): press New connection and search for your bank.'], ['Sign in on your bank’s own page. SimpleFIN never sees your bank password; your bank may text you a code.'],
          ['Choose which accounts to share, then press Allow. Only balances and transactions are used here.'], ['Back on My account the bank shows “OK” and your app shows as Active. Transactions can take a few days to appear.'],
          ['In this app, check each account’s name and type, press Save accounts, then Sync now. Use the same name as an account you already import statements for.']].forEach(([t], i) => {
          const f = document.createElement('figure'); const im = document.createElement('img'); im.src = `help/simplefin/step${i + 1}.webp`; im.alt = `SimpleFIN Bridge, step ${i + 1}`; im.loading = 'lazy';
          const c = document.createElement('figcaption'); c.textContent = `${i + 1}. ${t}`; f.append(c, im); guide.append(f); });
        const a = document.createElement('a'); a.href = 'https://beta-bridge.simplefin.org/'; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Open SimpleFIN Bridge ↗';
        box.append(ol, a, guide);
        if (ro) { box.append(phMsg('This login can view this dashboard but not connect a bank.')); return; }
        const r = document.createElement('div'); r.className = 'fd-rb-row';
        const inp = document.createElement('input'); inp.className = 'fd-in'; inp.placeholder = 'Paste the setup token'; inp.autocomplete = 'off'; inp.spellcheck = false;
        r.append(inp, rbtn('Connect', async () => { msg.className = 'fd-note'; msg.textContent = 'Connecting…'; try { st = await call('', 'POST', { token: inp.value.trim() }); draw(); } catch (e) { msg.className = 'fd-note fd-bad'; msg.textContent = e.message; } }, false));
        box.append(r, msg); return;
      }
      const when = st.lastSync ? new Date(st.lastSync).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'not yet';
      box.append(phMsg(`Connected. Last sync: ${when}. New posted transactions are added about every 6 hours${window.FD_LOCAL ? ' (when the app is open)' : ''}; pending ones wait until they post. Rules, categories and duplicate checks work the same as for imported statements.`));
      if (st.lastError) { const e = phMsg('Last problem: ' + st.lastError); e.className = 'fd-note fd-bad'; box.append(e); }
      for (const n of st.notes || []) box.append(phMsg('SimpleFIN: ' + n));
      const draft = {};
      const tb = document.createElement('table'); tb.className = 'fd-table';
      const hr = document.createElement('tr'); for (const h of ['Bank account', 'Show it as', 'Type', 'Sync']) { const th = document.createElement('th'); th.textContent = h; hr.append(th); } tb.append(hr);
      for (const a of st.accounts) {
        const d = draft[a.id] = { map: a.map, kind: a.kind, skip: a.skip }, tr = document.createElement('tr');
        const c1 = document.createElement('td'); c1.textContent = (a.org ? a.org + ' · ' : '') + a.name;
        const nm = document.createElement('input'); nm.className = 'fd-in'; nm.value = a.map; nm.disabled = ro; nm.addEventListener('input', () => { d.map = nm.value; });
        const kd = document.createElement('select'); kd.className = 'dash-select'; kd.disabled = ro; for (const k of st.kinds) kd.append(new Option(KIND_NAMES[k] || k, k)); kd.value = a.kind; kd.addEventListener('change', () => { d.kind = kd.value; });
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !a.skip; cb.disabled = ro; cb.addEventListener('change', () => { d.skip = !cb.checked; });
        const c2 = document.createElement('td'), c3 = document.createElement('td'), c4 = document.createElement('td'); c2.append(nm); c3.append(kd); c4.append(cb); tr.append(c1, c2, c3, c4); tb.append(tr);
      }
      const sc = document.createElement('div'); sc.className = 'fd-scroll'; sc.append(tb); box.append(sc);
      box.append(phMsg('Tip: use the same name as an account you already import statements for, so its history lines up and nothing is counted twice.'));
      if (ro) return;
      const btns = document.createElement('div'); btns.className = 'fd-rb-row';
      btns.append(
        rbtn('Save accounts', async () => { try { st = await call('', 'POST', { accounts: draft }); draw(); } catch (e) { msg.className = 'fd-note fd-bad'; msg.textContent = e.message; } }, false),
        rbtn('Sync now', async (e) => {
          const b = e.currentTarget || e.target; if (b.disabled) return; b.disabled = true; b.classList.add('fd-busy'); b.textContent = 'Syncing…';
          msg.className = 'fd-note fd-sync-msg'; msg.textContent = 'Syncing with SimpleFIN… this can take up to a minute.';
          try { await call('', 'POST', { accounts: draft }); const j = await call('/sync', 'POST'); st = j; draw();
            const at = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            const m = box.querySelector('.fd-sync-msg'); if (m) { m.className = 'fd-note fd-good fd-sync-msg'; m.textContent = '✓ Finished syncing at ' + at + '. ' + (j.added ? `Added ${j.added} new transaction${j.added === 1 ? '' : 's'}.` : 'Up to date; no new transactions.'); }
            const nb = [...box.querySelectorAll('button')].find((x) => x.textContent === 'Sync now'); if (nb) { nb.textContent = '✓ Synced'; setTimeout(() => { nb.textContent = 'Sync now'; }, 4000); }
            if (window.HF && window.HF.state && window.HF.state.bookId) window.HF.load(window.HF.state.bookId); }
          catch (err) { b.disabled = false; b.classList.remove('fd-busy'); b.textContent = 'Sync now'; msg.className = 'fd-note fd-bad fd-sync-msg'; msg.textContent = 'Sync failed: ' + err.message; } }, false),
        rbtn('Disconnect', async () => { if (!confirm('Disconnect SimpleFIN from this dashboard? Transactions already added stay.')) return; try { await call('', 'DELETE'); st = await call(''); draw(); } catch (e) { msg.className = 'fd-note fd-bad'; msg.textContent = e.message; } }, false));
      msg.classList.add('fd-sync-msg'); box.append(btns, msg);
    };
    draw();
  };

  // Getting started: a short checklist at the top of a new dashboard; it goes away when everything is done (or on Hide).
  let gsKeys = null;
  dash.draw('gettingStarted', (el) => {
    el.replaceChildren();
    const sample = window.HF && window.HF.state && window.HF.state.bookId === (window.FDSample && FDSample.id);
    if (sample) {
      const b = document.createElement('div'); b.className = 'fd-gs fd-gs-sample';
      const t = document.createElement('p'); t.innerHTML = '<b>You’re looking at sample data.</b> It’s a made-up household, so you can explore every tab. Nothing here is saved.';
      const x = document.createElement('button'); x.type = 'button'; x.className = 'fd-btn fd-sm'; x.textContent = 'Close sample data'; x.addEventListener('click', () => FDSample.stop());
      b.append(t, x); el.append(b); return;
    }
    if (st('imports') !== 'ok' || st('budgets') !== 'ok' || document.body.classList.contains('fd-readonly')) return;
    const bk = book(), get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
    if (get('fd-gs-hide-' + bk)) return;
    if (gsKeys === null) { gsKeys = false; FDStore.fetch('/api/keys', {}).then((r) => (r.ok ? r.json() : null)).then((j) => { gsKeys = !!(j && Object.values(j.set || {}).some(Boolean)); dash.draw('gettingStarted'); }).catch(() => {}); }
    const mine = (id) => (dash.data(id).data || []).filter((r) => r.book === bk);
    const go = (g) => () => { const b = document.querySelector(`.fd-navb[data-group="${g}"]`); if (b) { b.click(); window.scrollTo({ top: 0, behavior: 'smooth' }); } };
    const items = [
      ['Add your money', 'Import a bank or card statement, or connect automatic bank sync in ⚙ Settings.', mine('imports').length > 0 || (dash.data('txns').data || []).some((t) => t.book === bk), 'Import', go('import')],
      ['Set a few budgets', 'Pick 3 categories you want to keep an eye on, like groceries or dining.', mine('budgets').length >= 3, 'Budgets', go('budget')],
      ['Connect your phone', window.FD_LOCAL ? 'You’re already on your phone.' : 'Scan a QR code to open your dashboard on your phone.', !!(window.FD_LOCAL || get('fd-gs-phone')), 'Show QR code', go('settings')],
      ['Turn on free market & economy data', 'Optional. Free keys add rates, inflation, gas prices and live stock prices.', !!gsKeys, 'Set up', go('settings')],
      ['Make a backup', 'Save a copy of your data somewhere safe, like a USB drive or cloud folder.', !!get('fd-gs-backup'), 'Back up', () => { const a = document.getElementById('fd-export'); if (window.FD_LOCAL) go('settings')(); else if (a) a.click(); }],
    ];
    const done = items.filter((x) => x[2]).length; if (done === items.length) return;
    const box = document.createElement('div'); box.className = 'fd-gs';
    const head = document.createElement('div'); head.className = 'fd-gs-head';
    const h = document.createElement('h2'); h.textContent = `Getting started · ${done} of ${items.length} done`;
    const hide = document.createElement('button'); hide.type = 'button'; hide.className = 'fd-link'; hide.textContent = 'Hide'; hide.addEventListener('click', () => { try { localStorage.setItem('fd-gs-hide-' + bk, '1'); } catch (e) {} dash.draw('gettingStarted'); });
    head.append(h, hide); box.append(head);
    const ol = document.createElement('ol');
    for (const [t, d, ok, label, fn] of items) {
      const li = document.createElement('li'); li.className = ok ? 'is-done' : '';
      const tx = document.createElement('div'); const b = document.createElement('b'); b.textContent = (ok ? '✓ ' : '') + t; const p = document.createElement('span'); p.textContent = d; tx.append(b, p); li.append(tx);
      if (!ok) { const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'fd-btn fd-sm'; btn.textContent = label; btn.addEventListener('click', fn); li.append(btn); }
      ol.append(li);
    }
    box.append(ol);
    if (!mine('imports').length && !(dash.data('txns').data || []).some((t) => t.book === bk) && window.FDSample) { const s2 = document.createElement('p'); s2.className = 'fd-gs-try'; const b = document.createElement('button'); b.type = 'button'; b.className = 'fd-link'; b.textContent = 'Try it with sample data first';
      b.addEventListener('click', () => FDSample.start()); s2.append('Not ready to import? ', b, ' to see a full dashboard with a made-up household.'); box.append(s2); }
    el.append(box);
  });

  // addresses other devices can use to reach this server (the one in the address bar, unless that's this computer's own name)
  const hostAddrs = async () => {
    const here = (FDStore.base || location.origin).replace(/\/+$/, '');
    if (!/\/\/(localhost|127\.0\.0\.1)(:|$)/.test(here)) return [here];
    try { const j = await FDStore.json('GET', '/api/connect-info'); return j.addrs || []; } catch (e) { return []; }
  };
  // ⚙ Settings → Invite someone (server owner only): a one-time link + QR code; they choose their own login and password
  const inviteBox = async (host) => {
    if (window.FD_LOCAL || host.querySelector('.fd-invbox')) return;
    const tok = {}; host.__inv = tok;
    let info; try { info = await FDStore.json('GET', '/api/invites'); } catch (e) { return; } // not the owner: no box
    const addrs = await hostAddrs();
    if (host.__inv !== tok || host.querySelector('.fd-invbox')) return;
    const box = document.createElement('div'); box.className = 'fd-rb fd-apis fd-invbox'; host.append(box);
    const draw = () => {
      box.textContent = ''; box.append(rhead('Invite someone'));
      if (!addrs.length) { box.append(phMsg('To invite someone, first let other devices connect: on the host computer, turn on “Allow other devices” in Host options.')); return; }
      box.append(phMsg('Make a one-time link for a partner or family member. They open it (or scan the QR code) on their phone or computer and choose their own login and password. The link works once and expires after 7 days.'));
      const r1 = document.createElement('div'); r1.className = 'fd-rb-row'; const nm = document.createElement('input'); nm.className = 'fd-in'; nm.placeholder = 'Their name (optional), e.g. McKenna'; nm.maxLength = 40; r1.append(nm); box.append(r1);
      const pick = {};
      box.append(phMsg('Which dashboards can they open?'));
      for (const b of info.books) {
        const r = document.createElement('div'); r.className = 'fd-rb-row'; const lab = document.createElement('label'); lab.className = 'fd-check'; const cb = document.createElement('input'); cb.type = 'checkbox'; lab.append(cb, ' ' + b.name);
        const role = document.createElement('select'); role.className = 'dash-select'; role.append(new Option('Can edit', 'edit'), new Option('View only', 'view'));
        cb.addEventListener('change', () => { if (cb.checked) pick[b.id] = role.value; else delete pick[b.id]; }); role.addEventListener('change', () => { if (cb.checked) pick[b.id] = role.value; });
        r.append(lab, role); box.append(r);
      }
      const r2 = document.createElement('div'); r2.className = 'fd-rb-row'; const lab2 = document.createElement('label'); lab2.className = 'fd-check'; const own = document.createElement('input'); own.type = 'checkbox'; own.checked = true; lab2.append(own, ' Also give them a new dashboard of their own:');
      const ownName = document.createElement('input'); ownName.className = 'fd-in'; ownName.placeholder = 'e.g. McKenna – Personal'; ownName.maxLength = 40;
      nm.addEventListener('input', () => { if (!ownName.dataset.touched) ownName.value = nm.value.trim() ? `${nm.value.trim()} – Personal` : ''; }); ownName.addEventListener('input', () => { ownName.dataset.touched = '1'; });
      r2.append(lab2, ownName); box.append(r2);
      const msg = phMsg(''); const out = document.createElement('div');
      const mk = rbtn('Create invite link', async () => {
        msg.className = 'fd-note'; msg.textContent = '';
        try {
          const j = await FDStore.json('POST', '/api/invites', { name: nm.value.trim(), books: Object.entries(pick).map(([id, role]) => ({ id, role })), newBook: own.checked && ownName.value.trim() ? { name: ownName.value.trim() } : null });
          const link = `${addrs[0]}/join.html#${j.token}`;
          out.innerHTML = window.FDQR ? FDQR.svg(link, 200) : ''; out.className = 'fd-qr';
          const c = document.createElement('code'); c.textContent = link; c.style.wordBreak = 'break-all';
          const cp = rbtn('Copy link', async () => { try { await navigator.clipboard.writeText(link); cp.textContent = 'Copied'; } catch (e) { cp.textContent = 'Select the link and copy it'; } }, false);
          out.append(c, cp, phMsg(`Send this link to ${nm.value.trim() || 'them'} (a text message is fine), or let them scan the code. It works once and expires in 7 days. They need to be on your home Wi-Fi (or Tailscale) to use it.`));
          info = await FDStore.json('GET', '/api/invites'); drawPending();
        } catch (e) { msg.className = 'fd-note fd-bad'; msg.textContent = e.message; }
      }, false);
      const r3 = document.createElement('div'); r3.className = 'fd-rb-row'; r3.append(mk); box.append(r3, msg, out);
      const pend = document.createElement('div'); box.append(pend);
      const drawPending = () => { pend.textContent = ''; if (!info.pending.length) return; pend.append(phMsg('Invites not used yet:'));
        for (const p of info.pending) { const r = document.createElement('div'); r.className = 'fd-rb-row'; const t = document.createElement('span'); t.textContent = `${p.name || 'Invite'} · expires ${new Date(p.expires).toLocaleDateString()}`;
          r.append(t, rbtn('Cancel', async () => { await FDStore.json('DELETE', '/api/invites/' + encodeURIComponent(p.token)); info = await FDStore.json('GET', '/api/invites'); drawPending(); })); pend.append(r); } };
      drawPending();
    };
    draw();
  };

  // ⚙ Settings → Connect a phone: a QR code of this server's address (scan it in the phone app, or with the phone's camera to open it in the browser)
  const connectBox = async (host) => {
    if (window.FD_LOCAL || !window.FDQR || host.querySelector('.fd-qrbox')) return;
    const tok = {}; host.__qr = tok;
    const addrs = await hostAddrs();
    if (host.__qr !== tok || host.querySelector('.fd-qrbox')) return;
    const box = document.createElement('div'); box.className = 'fd-rb fd-apis fd-qrbox'; host.append(box);
    box.append(rhead('Connect a phone'));
    if (!addrs.length) { box.append(phMsg('Other devices can’t connect yet. On the host computer, turn on “Allow other devices” in Host options, then come back here for a QR code.')); return; }
    box.append(phMsg('In the Larenest phone app, tap “Scan QR code” and point it at this code. On an iPhone or any other phone, scan it with the camera to open the dashboard in the browser. The phone must be on the same Wi-Fi (or on Tailscale).'));
    let i = 0; const wrap = document.createElement('div'); wrap.className = 'fd-qr';
    const show = () => { wrap.innerHTML = window.FDQR.svg(addrs[i], 220); const c = document.createElement('code'); c.textContent = addrs[i]; wrap.append(c); };
    show(); box.append(wrap);
    if (addrs.length > 1) { const r = document.createElement('div'); r.className = 'fd-rb-row'; r.append(rbtn('Try another address', () => { i = (i + 1) % addrs.length; show(); })); box.append(r, phMsg('This computer has more than one network address. If the phone can’t connect, try the next one.')); }
    try { localStorage.setItem('fd-gs-phone', '1'); } catch (e) {}
  };

  // ⚙ Settings → Phone menus (only on narrow screens)
  const navMenuBox = (host) => {
    if (window.innerWidth > 640 || host.querySelector('.fd-navmenubox')) return;
    const box = document.createElement('div'); box.className = 'fd-rb fd-apis fd-navmenubox'; host.append(box);
    let menus = navMenus(); const name = (g) => { const b = document.querySelector(`.fd-navb[data-group="${g}"]`); return b ? b.textContent : g; };
    const draw = () => {
      box.textContent = ''; box.append(rhead('Phone menus'), phMsg('Choose which menu each section is under at the top of the screen, and rename or add menus. Saved on this phone only.'));
      menus.forEach((m, i) => { const r = document.createElement('div'); r.className = 'fd-rb-row'; const inp = document.createElement('input'); inp.className = 'fd-in'; inp.maxLength = 14; inp.value = m[0]; inp.addEventListener('input', () => { m[0] = inp.value; }); r.append(inp);
        if (menus.length > 1) r.append(rbtn('Remove', () => { const [gone] = menus.splice(i, 1); menus[Math.max(0, i - 1)][1].push(...gone[1]); draw(); })); box.append(r); });
      const tb = document.createElement('table'); tb.className = 'fd-table';
      for (const g of NAV_ALL) { const tr = document.createElement('tr'); const a = td(name(g)); const sel = document.createElement('select'); sel.className = 'dash-select';
        menus.forEach((m, i) => sel.append(new Option(m[0] || `Menu ${i + 1}`, i))); sel.value = menus.findIndex((m) => m[1].includes(g));
        sel.addEventListener('change', () => { menus.forEach((m) => { m[1] = m[1].filter((x) => x !== g); }); menus[Number(sel.value)][1].push(g); menus[Number(sel.value)][1].sort((x, y) => NAV_ALL.indexOf(x) - NAV_ALL.indexOf(y)); });
        const b = td(''); b.append(sel); tr.append(a, b); tb.append(tr); }
      box.append(tb);
      const btns = document.createElement('div'); btns.className = 'fd-rb-row';
      btns.append(rbtn('+ Add menu', () => { if (menus.length < 6) { menus.push(['New', []]); draw(); } }),
        rbtn('Save menus', () => { const out = menus.map(([n, gs]) => [String(n).trim() || 'Menu', gs]).filter((x) => x[1].length); try { localStorage.setItem('fd-navmenus', JSON.stringify(out)); } catch {} location.reload(); }, false),
        rbtn('Reset to default', () => { try { localStorage.removeItem('fd-navmenus'); } catch {} location.reload(); }));
      box.append(btns);
    };
    draw();
  };

  // ⚙ Settings → Recent changes (who changed what on this dashboard)
  const activityBox = async (host) => {
    if (window.FD_LOCAL || host.querySelector('.fd-actbox')) return; const tok = {}; host.__act = tok;
    let list = []; try { const r = await FDStore.fetch(`/api/books/${encodeURIComponent(myBookId())}/activity`, {}); if (!r.ok) return; list = await r.json(); } catch (e) { return; }
    if (host.__act !== tok || host.querySelector('.fd-actbox')) return;
    const box = document.createElement('div'); box.className = 'fd-rb fd-apis fd-actbox'; box.append(rhead('Recent changes')); host.append(box);
    if (!list.length) { box.append(phMsg('Nothing yet. Imports, edits, rules, budgets, accounts, goals and holdings added or removed on this dashboard are listed here, with who did it.')); return; }
    const tb = document.createElement('table'); tb.className = 'fd-table';
    list.slice(0, 40).forEach((x) => { const tr = document.createElement('tr'); const d = new Date(x.at); tr.append(td(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), 'fd-l fd-zero'), td(x.username || '', 'fd-l'), td(x.action, 'fd-l'), td(x.summary || '', 'fd-l fd-zero')); tb.append(tr); });
    const sc = document.createElement('div'); sc.className = 'fd-scroll'; sc.append(tb); box.append(sc);
    if (list.length > 40) box.append(phMsg(`Showing the latest 40 of ${list.length}.`));
  };

  // ================= Markets → Screener (FMP) =================
  let scrF = null, scrRes = null, scrBusy = false;
  dash.draw('screenView', (el) => {
    el.replaceChildren(); if (PART('m-scr')) return;
    if (!scrF) scrF = { sector: '', cap: 10e9, yield: 0, maxPrice: 0, ...(prefGet('screener', {}) || {}) };
    el.append(rhead('Screener'));
    el.append(phMsg('Find US companies by sector, size, dividend and price. Add any to your watchlist to follow its price.'));
    const r = document.createElement('div'); r.className = 'fd-rb-row';
    const sec = document.createElement('select'); sec.className = 'dash-select'; sec.append(new Option('Any sector', ''), ...['Technology', 'Healthcare', 'Financial Services', 'Consumer Cyclical', 'Consumer Defensive', 'Industrials', 'Energy', 'Utilities', 'Real Estate', 'Communication Services', 'Basic Materials'].map((x) => new Option(x, x))); sec.value = scrF.sector;
    const cap = document.createElement('select'); cap.className = 'dash-select'; [[0, 'Any size'], [2e9, 'Over $2B'], [10e9, 'Over $10B'], [50e9, 'Over $50B'], [200e9, 'Over $200B']].forEach(([v, l]) => cap.append(new Option(l, v))); cap.value = scrF.cap;
    const yl = document.createElement('select'); yl.className = 'dash-select'; [[0, 'Any dividend'], [1, 'Yield over 1%'], [2, 'Yield over 2%'], [3, 'Yield over 3%'], [4, 'Yield over 4%']].forEach(([v, l]) => yl.append(new Option(l, v))); yl.value = scrF.yield;
    const mp = document.createElement('select'); mp.className = 'dash-select'; [[0, 'Any price'], [50, 'Under $50'], [100, 'Under $100'], [250, 'Under $250']].forEach(([v, l]) => mp.append(new Option(l, v))); mp.value = scrF.maxPrice;
    const go = rbtn(scrBusy ? 'Searching…' : 'Search', async () => {
      scrF = { sector: sec.value, cap: Number(cap.value), yield: Number(yl.value), maxPrice: Number(mp.value) }; prefSet('screener', scrF); scrBusy = true; dash.draw('screenView');
      try { const q = new URLSearchParams({ sector: scrF.sector, cap: scrF.cap, yield: scrF.yield, maxPrice: scrF.maxPrice }); const r2 = await FDStore.fetch('/api/screener?' + q, {}); scrRes = r2.ok ? await r2.json() : { rows: [], error: 'The screener isn\u2019t available right now.' }; }
      catch (e) { scrRes = { rows: [], error: 'The screener isn\u2019t available right now.' }; }
      scrBusy = false; dash.draw('screenView'); }, false);
    go.disabled = scrBusy; r.append(sec, cap, yl, mp, go); el.append(r);
    if (!scrRes) return;
    if (scrRes.error) { el.append(phMsg(scrRes.error, 'fd-bad')); return; }
    if (!scrRes.rows.length) { el.append(phMsg('No companies match. Try widening the filters.')); return; }
    const watched = new Set((prefGet('watch', []) || []).map((w) => w.symbol)), own = new Set(hRows().map((h) => h.symbol));
    const tb = document.createElement('table'); tb.className = 'fd-table'; const h = document.createElement('tr'); ['Company', 'Price', 'Size', 'Dividend yield', ''].forEach((t, i) => { const c = document.createElement('th'); c.textContent = t; if (!i) c.className = 'fd-l'; h.append(c); }); tb.append(h);
    const big = (v) => (v == null ? '–' : v >= 1e12 ? '$' + (v / 1e12).toFixed(1) + 'T' : v >= 1e9 ? '$' + (v / 1e9).toFixed(1) + 'B' : '$' + Math.round(v / 1e6) + 'M');
    scrRes.rows.slice(0, 40).forEach((x) => { const tr = document.createElement('tr'); const n = td('', 'fd-l'); const b = document.createElement('strong'); b.textContent = x.symbol + (own.has(x.symbol) ? ' ★' : ''); const s2 = document.createElement('div'); s2.className = 'fd-zero fd-rsub'; s2.textContent = [x.name, x.industry].filter(Boolean).join(' · '); n.append(b, s2);
      const a = document.createElement('td'); if (watched.has(x.symbol) || own.has(x.symbol)) a.textContent = watched.has(x.symbol) ? 'Watching' : 'You own it'; else a.append(rbtn('+ Watch', async () => { const w = [...(prefGet('watch', []) || []), { symbol: x.symbol }]; await prefSet('watch', w); dash.draw('screenView'); }));
      tr.append(n, td(x.price != null ? money2(x.price) : '–'), td(big(x.cap)), td(x.yield != null ? x.yield.toFixed(2) + '%' : '–'), a); tb.append(tr); });
    const sc = document.createElement('div'); sc.className = 'fd-scroll'; sc.append(tb); el.append(sc);
    el.append(phMsg('From Financial Modeling Prep, refreshed at most every 6 hours for the same filters. Not investment advice.'));
  });

  // ================= Phone-only mode: settings, backup reminder, bill notifications, first-run walkthrough =================
  const PH = () => window.FD_LOCAL && window.FDLocal;
  const phMsg = (t, cls) => { const p = document.createElement('p'); p.className = 'fd-note' + (cls ? ' ' + cls : ''); p.textContent = t; return p; };
  const billsAhead = (days) => { const end = Date.now() + days * 864e5, out = [];
    rows('subs').filter((x) => x.book === book()).forEach((x) => { const n = nextDue(x); if (!n) return; const d = new Date(n.date); for (let g = 0; g < 6 && d.getTime() <= end; g++) { out.push({ name: x.vendor, amount: money0(x.lastCharge), due: new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()).toISOString() }); d.setUTCMonth(d.getUTCMonth() + (n.monthly ? 1 : 12)); } });
    return out; };
  // keep each dashboard's upcoming bills on the phone, then schedule reminders for all of them together
  const rescheduleBills = async () => {
    if (!PH()) return null; const L = window.FDLocal, opts = (await L.getKV('billNotify')) || { on: false, daysBefore: 1, hour: 9 };
    let curId = ''; try { curId = localStorage.getItem('hf-book') || ''; } catch (e) {}
    const list = await L.books(); if (!curId || !list.some((b) => b.id === curId)) curId = list[0].id;
    await L.setKV('bills-' + curId, billsAhead(60));
    let all = []; for (const b of list) all = all.concat((await L.getKV('bills-' + b.id)) || []);
    return L.scheduleBills(all.sort((a, b) => a.due.localeCompare(b.due)), opts);
  };
  dash.draw('billNotify', () => { if (PH() && st('subs') === 'ok') rescheduleBills().catch(() => {}); });

  // banner: data only lives on this phone
  let bannerHide = false;
  dash.draw('phoneBanner', async (el) => {
    el.replaceChildren(); if (!PH() || bannerHide) return; const L = window.FDLocal;
    const last = await L.getKV('lastExport'), snooze = await L.getKV('backupSnooze'); el.replaceChildren();
    if ((last && Date.now() - last < 30 * 864e5) || (snooze && Date.now() < snooze)) return;
    const w = document.createElement('div'); w.className = 'fd-phonebanner';
    const t = document.createElement('div'); t.innerHTML = '<b>Your data is only on this phone.</b> Uninstalling the app or clearing its storage deletes it. Save a backup file somewhere safe (Drive, Files or email).';
    const bar = document.createElement('div'); bar.className = 'fd-rb-row';
    bar.append(rbtn('Make a backup now', async () => { try { let id = ''; try { id = localStorage.getItem('hf-book') || ''; } catch (e) {} await L.exportFile(id); try { localStorage.setItem('fd-gs-backup', '1'); } catch (e) {} bannerHide = true; dash.draw('phoneBanner'); } catch (e) { alert('Backup failed: ' + e.message); } }, false),
      rbtn('Remind me in a week', async () => { await L.setKV('backupSnooze', Date.now() + 7 * 864e5); bannerHide = true; dash.draw('phoneBanner'); }));
    w.append(t, bar); el.append(w);
  });

  // ⚙ Settings → On this phone
  const phoneBox = async (host) => {
    if (!PH() || host.querySelector('.fd-phonebox')) return; const L = window.FDLocal;
    const box = document.createElement('div'); box.className = 'fd-rb fd-apis fd-phonebox'; box.append(rhead('On this phone')); host.append(box);
    box.append(phMsg('Everything is stored privately on this phone. Nothing is sent anywhere except requests to the market services whose keys you add.'));
    // dashboards
    box.append(rhead('Dashboards'));
    const list = await L.books();
    list.forEach((b) => { const r = document.createElement('div'); r.className = 'fd-rb-row'; const i = document.createElement('input'); i.type = 'text'; i.value = b.name; i.maxLength = 40; i.className = 'fd-in';
      const sv = rbtn('Rename', async () => { try { await L.saveBook({ id: b.id, name: i.value }); location.reload(); } catch (e) { alert(e.message); } });
      const del = rbtn('Delete', async () => { if (!confirm(`Delete the "${b.name}" dashboard and everything in it? A backup is saved inside the app first.`)) return; try { await L.deleteBook(b.id); try { localStorage.removeItem('hf-book'); } catch (e) {} location.reload(); } catch (e) { alert(e.message); } });
      if (list.length < 2) del.disabled = true; r.append(i, sv, del); box.append(r); });
    const nr = document.createElement('div'); nr.className = 'fd-rb-row'; const ni = document.createElement('input'); ni.type = 'text'; ni.placeholder = 'New dashboard name, e.g. Shared household'; ni.className = 'fd-in'; ni.maxLength = 40;
    const ns = document.createElement('select'); ns.className = 'dash-select'; ns.append(new Option('Personal', 'p'), new Option('Shared', 's'));
    nr.append(ni, ns, rbtn('+ Add dashboard', async () => { try { const b = await L.saveBook({ name: ni.value, shared: ns.value === 's' }); try { localStorage.setItem('hf-book', b.id); } catch (e) {} location.reload(); } catch (e) { alert(e.message); } }, false)); box.append(nr);
    // bill reminders
    box.append(rhead('Bill reminders'));
    if (!L.notificationsSupported()) box.append(phMsg('Reminders are available in the Android and iPhone apps.'));
    else {
      const o = (await L.getKV('billNotify')) || { on: false, daysBefore: 1, hour: 9 };
      const r = document.createElement('div'); r.className = 'fd-rb-row';
      const lab = document.createElement('label'); lab.className = 'fd-check'; const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!o.on; lab.append(cb, ' Remind me about upcoming bills');
      const db2 = document.createElement('select'); db2.className = 'dash-select'; [[0, 'on the day'], [1, '1 day before'], [2, '2 days before'], [3, '3 days before'], [7, 'a week before']].forEach(([v, l]) => db2.append(new Option(l, v))); db2.value = o.daysBefore;
      const hr = document.createElement('select'); hr.className = 'dash-select'; for (let h = 6; h <= 21; h++) hr.append(new Option(`at ${h % 12 || 12}:00 ${h < 12 ? 'AM' : 'PM'}`, h)); hr.value = o.hour;
      const msg = phMsg('');
      const save = async () => { const n = { on: cb.checked, daysBefore: Number(db2.value), hour: Number(hr.value) }; await L.setKV('billNotify', n); const r2 = await rescheduleBills();
        msg.className = 'fd-note' + (r2 && r2.denied ? ' fd-bad' : ''); msg.textContent = !n.on ? 'Reminders are off.' : r2 && r2.denied ? 'Notifications are blocked for this app. Allow them in your phone’s settings.' : `${r2 ? r2.scheduled : 0} reminders scheduled for the next 60 days.`; };
      [cb, db2, hr].forEach((x) => x.addEventListener('change', save));
      r.append(lab, db2, hr); box.append(r, msg, phMsg('Bills come from Subscriptions & recurring bills in each dashboard. Reminders are set on this phone only.'));
    }
    // backups
    box.append(rhead('Backups'));
    const last = await L.getKV('lastExport'), snaps = await L.backups();
    box.append(phMsg(`Last backup file saved: ${last ? new Date(last).toLocaleDateString() : 'never'}. The app also keeps ${snaps.length} automatic snapshot${snaps.length === 1 ? '' : 's'} inside it (daily, last 14), but those are deleted with the app.`, !last ? 'fd-bad' : ''));
    box.append(rbtn('Save a backup file now', async () => { let id = ''; try { id = localStorage.getItem('hf-book') || ''; } catch (e) {} try { await L.exportFile(id); try { localStorage.setItem('fd-gs-backup', '1'); } catch (e) {} dash.draw('settingsView'); } catch (e) { alert('Backup failed: ' + e.message); } }, false));
  };

  // first-run walkthrough (phone-only mode)
  let walkShown = false;
  const walkthrough = async () => {
    if (!PH() || walkShown) return; walkShown = true; const L = window.FDLocal; if (await L.getKV('onboarded')) return;
    const ov = document.createElement('div'); ov.className = 'fd-walk'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
    const card = document.createElement('div'); card.className = 'fd-walk-card'; ov.append(card); document.body.append(ov);
    const st0 = { name: 'Personal', shared: false, sharedName: 'Shared household', remind: true };
    const done = async (goImport) => { await L.setKV('onboarded', Date.now()); ov.remove(); if (goImport) { const b = document.querySelector('.fd-navb[data-group=import]'); if (b) b.click(); } };
    const steps = [
      () => ['Welcome 👋', '<p>Larenest keeps your budget, accounts and spending <b>only on this phone</b>. No account to create, no server, and nothing is sent to us.</p><p>Let’s set up a few things. It takes about a minute.</p>'],
      () => ['Name your dashboard', '<p>A dashboard holds one set of accounts and budgets.</p><label class="fd-field">Your dashboard<input id="w-name" maxlength="40"></label><label class="fd-check"><input type="checkbox" id="w-sh"> Also add a shared household dashboard</label><label class="fd-field" id="w-shw" hidden>Shared dashboard name<input id="w-shn" maxlength="40"></label><p class="fd-note">You can rename or add dashboards later under ⚙ Settings.</p>'],
      () => ['Bill reminders', `<p>The app spots recurring bills (rent, phone, streaming…) in your statements. It can remind you before each one is due.</p><label class="fd-check"><input type="checkbox" id="w-rem"> Remind me the day before bills are due</label>${L.notificationsSupported() ? '' : '<p class="fd-note">Reminders work in the Android and iPhone apps.</p>'}`],
      () => ['Keep a backup', '<p><b>Your data only lives on this phone.</b> If you uninstall the app or clear its storage, it’s gone.</p><p>Every so often, use <b>Download backup</b> (top of the page) to save a backup file to Google Drive, Files or email. You can restore it on any phone, or on a PC running Larenest.</p>'],
      () => ['You’re set', '<p>Start by importing a statement from your bank (CSV, PDF, OFX or QFX). Or record account balances by hand.</p>'],
    ];
    let i = 0;
    const show = () => {
      const [h, html] = steps[i](); card.innerHTML = `<div class="fd-walk-dots">${steps.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div><h2>${h}</h2>${html}`;
      const bar = document.createElement('div'); bar.className = 'fd-rb-row fd-walk-bar';
      if (i === 1) { const n = card.querySelector('#w-name'), sh = card.querySelector('#w-sh'), shw = card.querySelector('#w-shw'), shn = card.querySelector('#w-shn'); n.value = st0.name; sh.checked = st0.shared; shn.value = st0.sharedName; shw.hidden = !st0.shared;
        sh.addEventListener('change', () => { shw.hidden = !sh.checked; }); card._save = () => { st0.name = n.value.trim() || 'Personal'; st0.shared = sh.checked; st0.sharedName = shn.value.trim() || 'Shared household'; }; }
      if (i === 2) { const r = card.querySelector('#w-rem'); r.checked = st0.remind; card._save = () => { st0.remind = r.checked; }; }
      if (i > 0) bar.append(rbtn('Back', () => { card._save && card._save(); card._save = null; i--; show(); }));
      if (i < steps.length - 1) bar.append(rbtn(i === 0 ? 'Get started' : 'Next', async () => {
        card._save && card._save(); card._save = null;
        if (i === 1) { try { const list = await L.books(); await L.saveBook({ id: list[0].id, name: st0.name }); if (st0.shared && !list.some((b) => b.label === 'Shared')) await L.saveBook({ name: st0.sharedName, shared: true }); } catch (e) { alert(e.message); return; } }
        if (i === 2) { await L.setKV('billNotify', { on: st0.remind && L.notificationsSupported(), daysBefore: 1, hour: 9 }); if (st0.remind && L.notificationsSupported()) { try { await L.notifyPermission(); } catch (e) {} } }
        i++; show(); }, false));
      else { bar.append(rbtn('Look around first', async () => { await done(false); location.reload(); }), rbtn('Import a statement', async () => { await done(true); location.reload(); }, false)); }
      if (i === 0) bar.append(rbtn('Skip setup', async () => { await done(false); }));
      card.append(bar); const f = card.querySelector('input,button'); if (f) f.focus();
    };
    show();
  };
  dash.draw('phoneWalk', () => { if (PH()) walkthrough().catch(() => {}); });

  // ---- markets: indexes, commodities, sectors and top movers (self-hosted app; refreshed at most hourly) ----
  let MK = null, mkState = 'idle', mkMov = 'gainers';
  let mkMine = false;
  const FOL = (() => { try { return JSON.parse(localStorage.getItem('fd-sectors') || '[]') || []; } catch { return []; } })();
  const folSave = () => { try { localStorage.setItem('fd-sectors', JSON.stringify(FOL)); } catch {} };
  const loadMarkets = async (refresh) => {
    if (mkState === 'busy') return; mkState = 'busy'; dash.draw('mktView');
    try { const r = await FDStore.fetch('/api/markets' + (refresh ? '?refresh=1' : ''), {}); if (!r.ok) throw new Error(); MK = await r.json(); mkState = 'ok'; } catch { mkState = MK ? 'ok' : 'none'; }
    dash.draw('mktView');
  };
  const spark = (vals, up) => {
    if (!vals || vals.length < 2) return null;
    const ns = 'http://www.w3.org/2000/svg', w = 120, h = 28, lo = Math.min(...vals), hi = Math.max(...vals), sx = w / (vals.length - 1), sy = hi > lo ? (h - 4) / (hi - lo) : 0;
    const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', `0 0 ${w} ${h}`); svg.setAttribute('class', 'fd-spark'); svg.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS(ns, 'polyline'); p.setAttribute('points', vals.map((v, i) => `${(i * sx).toFixed(1)},${(h - 2 - (v - lo) * sy).toFixed(1)}`).join(' ')); p.setAttribute('fill', 'none'); p.setAttribute('stroke', up ? 'var(--color-good, #2e7d32)' : 'var(--color-bad, #c62828)'); p.setAttribute('stroke-width', '1.5'); svg.append(p); return svg;
  };
  const chgSpan = (v, suffix = '') => { const s = document.createElement('span'); s.className = v == null ? 'fd-zero' : v >= 0 ? 'fd-good' : 'fd-bad'; s.textContent = v == null ? '–' : pctTxt(v) + suffix; return s; };
  dash.draw('mktView', (el) => {
    el.replaceChildren();
    if (mkState === 'idle') { loadMarkets(); return; }
    if (mkState === 'busy' && !MK) { el.textContent = 'Loading market data…'; return; }
    if (mkState === 'none' || !MK) { const p = document.createElement('p'); p.className = 'fd-note'; p.textContent = 'Market data comes from the self-hosted app (it uses your Finnhub and FMP keys). It isn’t available in this copy.'; el.append(p); return; }
    const t = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const head = document.createElement('div'); head.className = 'fd-rb-row';
    const dot = document.createElement('span'); dot.className = 'fd-mktdot ' + (MK.open ? 'is-open' : ''); 
    const ht = document.createElement('span'); ht.textContent = `${MK.open ? 'Market open' : 'Market closed'} · updated ${new Date(MK.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${t(MK.at)}${MK.nextRefresh ? ` · next update after ${t(MK.nextRefresh)}` : ''}`;
    head.append(dot, ht, rbtn(mkState === 'busy' ? 'Refreshing…' : 'Refresh', () => loadMarkets(true)));
    el.append(head);
    const strip = (title, list, note) => {
      if (!list.length) return; el.append(rhead(title));
      const g = document.createElement('div'); g.className = 'fd-rtiles';
      list.forEach((r) => {
        const d = document.createElement('div'); d.className = 'fd-rtile';
        const l = document.createElement('div'); l.className = 'fd-zero'; l.textContent = r.name + (r.unit && r.unit !== 'futures' ? ` (${r.unit})` : r.symbol && !r.unit ? ` · ${r.symbol}` : '');
        const v = document.createElement('div'); v.className = 'fd-rval'; v.textContent = money2(r.price);
        const c = document.createElement('div'); c.className = 'fd-rsub'; c.append(chgSpan(r.change, ' today'));
        [[r.m1, ' 1M'], [r.ytd, ' YTD']].forEach(([v, l]) => { if (v != null) c.append(' · ', chgSpan(v, l)); });
        d.append(l, v, c); const sp = spark(r.spark, (r.spark || [])[r.spark?.length - 1] >= (r.spark || [])[0]); if (sp) d.append(sp); g.append(d);
      });
      el.append(g); if (note) { const n = document.createElement('p'); n.className = 'fd-note'; n.textContent = note; el.append(n); }
    };
    if (!PART('m-idx')) strip('Indexes', MK.indexes || [], 'Shown through the funds that track each index (SPY, QQQ, DIA, IWM), so prices are per fund share; the % changes match the index closely. Sparkline: last 3 months.');
    if (!PART('m-com')) strip('Commodities', MK.commodities || [], (MK.commodities || []).some((x) => x.unit === 'futures') ? 'Gold and silver per ounce, oil per barrel, natural gas per MMBtu (futures prices).' : '');
    const cols = document.createElement('div'); cols.className = 'fd-grid2';
    if ((MK.sectors || []).length && !PART('m-sec')) {
      const w = document.createElement('div'); w.append(rhead('Sectors today'));
      const hint = document.createElement('p'); hint.className = 'fd-note'; hint.textContent = '☆ Follow a sector to pin it to the top.'; w.append(hint);
      const max = Math.max(...MK.sectors.map((s) => Math.abs(s.change)), 0.01);
      const list = MK.sectors.slice().sort((a, b) => (FOL.includes(b.name) - FOL.includes(a.name)) || b.change - a.change);
      list.forEach((s) => {
        const r = document.createElement('div'); r.className = 'fd-sector';
        const st0 = document.createElement('button'); st0.type = 'button'; st0.className = 'fd-star'; const on = FOL.includes(s.name); st0.textContent = on ? '★' : '☆'; st0.title = on ? 'Unfollow' : 'Follow'; st0.setAttribute('aria-label', (on ? 'Unfollow ' : 'Follow ') + s.name);
        st0.addEventListener('click', () => { const i = FOL.indexOf(s.name); if (i >= 0) FOL.splice(i, 1); else FOL.push(s.name); folSave(); dash.draw('mktView'); });
        const n = document.createElement('span'); n.textContent = s.name;
        const bar = document.createElement('div'); bar.className = 'fd-secbar'; const f = document.createElement('span'); f.style.width = (Math.abs(s.change) / max) * 50 + '%'; f.className = s.change >= 0 ? 'up' : 'down'; bar.append(f);
        r.append(st0, n, chgSpan(s.change), bar); w.append(r);
      });
      const top = list.filter((s) => !FOL.includes(s.name)).slice(0, 1)[0], bot = MK.sectors[MK.sectors.length - 1];
      if (top && bot) { const p = document.createElement('p'); p.className = 'fd-note'; p.textContent = `Trending: ${MK.sectors[0].name} leads today (${pctTxt(MK.sectors[0].change)}); ${bot.name} is weakest (${pctTxt(bot.change)}).`; w.append(p); }
      cols.append(w);
    }
    if (((MK.gainers || []).length || (MK.losers || []).length) && !PART('m-mov')) {
      const w = document.createElement('div'); w.append(rhead('Top movers today'));
      const tabs = document.createElement('div'); tabs.className = 'fd-rb-row';
      [['gainers', 'Gainers'], ['losers', 'Losers']].forEach(([k, lab]) => { const b = rbtn(lab, () => { mkMov = k; dash.draw('mktView'); }, mkMov !== k); tabs.append(b); });
      if (FOL.length) { const f = rbtn(mkMine ? 'Followed sectors' : 'All sectors', () => { mkMine = !mkMine; dash.draw('mktView'); }, false); f.title = 'Show only movers in the sectors you follow (★)'; tabs.append(f); }
      w.append(tabs);
      const tb = document.createElement('table'); tb.className = 'fd-table'; const body = document.createElement('tbody');
      const own = new Set(hRows().map((h) => h.symbol));
      const mvList = (MK[mkMov] || []).filter((x) => !(mkMine && FOL.length) || FOL.includes(x.sector));
      if (!mvList.length) { const p = document.createElement('p'); p.className = 'fd-note'; p.textContent = 'No big movers in your followed sectors right now.'; w.append(p); }
      mvList.slice(0, 12).forEach((x) => { const tr = document.createElement('tr'); const n = td('', 'fd-l'); const b = document.createElement('strong'); b.textContent = x.symbol + (own.has(x.symbol) ? ' ★' : ''); const s2 = document.createElement('div'); s2.className = 'fd-zero fd-rsub'; s2.textContent = x.name + (x.sector ? ` · ${x.sector}` : ''); n.append(b, s2); const c = td(''); c.append(chgSpan(x.change)); tr.append(n, td(money2(x.price)), c); body.append(tr); });
      tb.append(body); w.append(tb);
      const p = document.createElement('p'); p.className = 'fd-note'; p.textContent = 'Biggest % moves across US exchanges. Small, thinly traded stocks often show up here.'; w.append(p);
      cols.append(w);
    }
    el.append(cols);
    const src = document.createElement('p'); src.className = 'fd-note'; src.textContent = `Sources: ${(MK.sources || []).join(', ') || 'none yet'}. Updates at most once an hour while the market is open, plus once after the close.`; el.append(src);
    if ((MK.errors || []).length) { const dt = document.createElement('details'); const sm = document.createElement('summary'); sm.textContent = `Data check: ${MK.errors.length} item${MK.errors.length === 1 ? '' : 's'} unavailable`; dt.append(sm); MK.errors.forEach((e) => { const p = document.createElement('div'); p.className = 'fd-note'; p.textContent = e.replace(/apikey=\w+|token=\w+/g, ''); dt.append(p); }); el.append(dt); }
  });

  const TILES = [['kpi-flow', 'Cash flow'], ['kpi-budget', 'Budget'], ['kpi-subs', 'Where the income went'], ['kpi-assets', 'Cash & investments'], ['kpi-debt', 'Mortgage & loans']];
  const applySettings = (s, fromSave) => {
    const hid = new Set(s.hideTiles || []); TILES.forEach(([id]) => q(id).forEach((c) => { c.hidden = hid.has(id); }));
    const hs = new Set(s.hideSec || []), hp = new Set(s.hideParts || []); const changed = [...hs].join() !== [...HIDESEC].join() || [...hp].join() !== [...HIDEPART].join(); HIDESEC = hs; HIDEPART = hp; if (changed) { try { showGroup(NP.group || 'all'); } catch {} if (fromSave) redrawAll(); }
    const nc = !!s.noCents; if (window.FD_NOCENTS !== nc) { window.FD_NOCENTS = nc; if (!fromSave) return true; redrawAll(); }
    if (!fromSave && s.hideDefault) { let has = false; try { has = !!localStorage.getItem(HKEY); } catch {} if (!has) Object.assign(HIDE, s.hideDefault); }
    if (fromSave && s.hideDefault) { Object.assign(HIDE, s.hideDefault); try { localStorage.setItem(HKEY, JSON.stringify(HIDE)); } catch {} redrawAll(); }
    return false;
  };
  // ---- API keys (server-wide; only the server owner can change them) ----
  const APIS = [
    ['fred', 'FRED (St. Louis Fed)', 'https://fredaccount.stlouisfed.org/apikeys', 'Mortgage and Treasury rates, inflation (CPI) and Iowa City home prices. Powers the refinance, savings-rate and home-value alerts and “After inflation”.'],
    ['finnhub', 'Finnhub', 'https://finnhub.io/register', 'Live stock prices, company news, earnings dates, 52-week ranges and analyst ratings for your holdings and watchlist. Free plan: 60 calls/minute.'],
    ['fmp', 'Financial Modeling Prep', 'https://site.financialmodelingprep.com/developer/docs', 'Market indexes, commodities (gold, oil), sector performance, top movers, dividend history, price targets and what ETFs hold. Free plan: 250 calls/day.'],
    ['eia', 'U.S. Energy Information Administration', 'https://www.eia.gov/opendata/register.php', 'Weekly Midwest gas prices and monthly Iowa home electricity prices.'],
    ['bls', 'Bureau of Labor Statistics', 'https://data.bls.gov/registrationEngine/', 'Midwest inflation by category: groceries, restaurants, energy, gasoline and shelter.'],
  ];
  let KEYS = null;
  // "Test": tries the pasted key with that service, and saves it straight away if it works.
  const keyTest = (id, input, status) => rbtn('Test', async (e) => {
    const b = e && e.target; const v = input.value.trim(); if (!v) { status.textContent = 'Paste a key first'; status.className = 'fd-bad'; return; }
    status.textContent = 'Testing…'; status.className = 'fd-zero'; if (b) b.disabled = true;
    try { const r = await FDStore.json('POST', '/api/keys/test', { id, key: v });
      if (!r.ok) { status.textContent = '✗ ' + r.message; status.className = 'fd-bad'; return; }
      await FDStore.json('POST', '/api/keys', { [id]: v }); status.textContent = '✓ ' + r.message + ' Saved.'; status.className = 'fd-good';
      setTimeout(() => { KEYS = null; ecoState = 'idle'; mkState = 'idle'; qWant = ''; dash.draw('settingsView'); }, 2500);
    } catch (err) { status.textContent = '✗ ' + err.message; status.className = 'fd-bad'; } finally { if (b) b.disabled = false; }
  });
  const apiBox = (host) => {
    if (KEYS === null) { KEYS = false; FDStore.fetch('/api/keys', {}).then((r) => (r.ok ? r.json() : null)).then((j) => { KEYS = j || false; dash.draw('settingsView'); }).catch(() => {}); return; }
    if (!KEYS) return;
    const box = document.createElement('div'); box.className = 'fd-rb fd-apis'; box.append(rhead('Data sources (API keys)'));
    const n = document.createElement('p'); n.className = 'fd-note'; n.textContent = 'Each is free for personal use and takes about 2 minutes: click a name to sign up and get a key, paste it, and press Test. A key that works is saved right away. Keys are stored on this server only and apply to every dashboard.' + (KEYS.canEdit ? '' : ` Only ${KEYS.owner} can change them.`); box.append(n);
    const vals = {}, t = document.createElement('table'); t.className = 'fd-table fd-apitable'; const tb = document.createElement('tbody');
    APIS.forEach(([id, name, link, desc]) => {
      const tr = document.createElement('tr'); const c1 = td('', 'fd-l'); const a = document.createElement('a'); a.href = link; a.target = '_blank'; a.rel = 'noopener'; a.textContent = name; a.title = desc; c1.append(a); const sub = document.createElement('div'); sub.className = 'fd-zero fd-rsub'; sub.textContent = desc; c1.append(sub);
      { const info = document.createElement('button'); info.type = 'button'; info.className = 'fd-api-info'; info.textContent = 'What’s this?'; info.addEventListener('click', () => { tr.classList.toggle('fd-open'); info.textContent = tr.classList.contains('fd-open') ? 'Hide' : 'What’s this?'; }); c1.append(info); }
      const st0 = td(KEYS.set[id] ? `✓ set (${KEYS.set[id]})` : 'not set', KEYS.set[id] ? 'fd-good' : 'fd-zero');
      const c3 = td(''); if (KEYS.canEdit && !KEYS.fromEnv[id]) { const i = document.createElement('input'); i.type = 'password'; i.autocomplete = 'off'; i.placeholder = KEYS.set[id] ? 'paste a new key to replace' : 'paste key'; i.addEventListener('input', () => { vals[id] = i.value; }); c3.append(i, ' ', keyTest(id, i, st0));
        if (KEYS.set[id]) { const rm = rbtn('Remove', () => { vals[id] = ''; i.value = ''; i.placeholder = 'will be removed on Save'; }); c3.append(' ', rm); } } else if (KEYS.fromEnv[id]) c3.textContent = 'set by environment variable';
      tr.append(c1, st0, c3); tb.append(tr);
    });
    t.append(tb); const sc = document.createElement('div'); sc.className = 'fd-scroll'; sc.append(t); box.append(sc);
    { const k = document.createElement('p'); k.className = 'fd-note'; k.textContent = 'Everything else works without any key: Treasury and I-bond rates, exchange rates, U.S. holidays and vehicle lookups. The app is fully usable with no keys at all; each key adds extra data. Start with FRED, it adds the most.'; box.append(k); }
    if (KEYS.canEdit) { const msg = document.createElement('span'); msg.className = 'fd-zero'; const sv = rbtn('Save keys', async () => { if (!Object.keys(vals).length) return; sv.disabled = true;
        try { const r = await FDStore.fetch('/api/keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(vals) }); if (!r.ok) throw new Error((await r.json()).error); KEYS = null; ecoState = 'idle'; mkState = 'idle'; qWant = ''; dash.draw('settingsView'); }
        catch (e) { sv.disabled = false; msg.textContent = 'Couldn’t save: ' + e.message; } }, false);
      const r = document.createElement('div'); r.className = 'fd-rb-row'; r.append(sv, msg); box.append(r); }
    host.append(box);
  };
  // ---- dashboard settings page ----
  let sDraft = null;
  dash.draw('settingsView', (el) => {
    if (st('prefs') !== 'ok') return;
    el.replaceChildren(); if (sDraft && sDraft._book !== book()) sDraft = null; const s = sDraft || (sDraft = { ...SET(), _book: book() });
    const box = document.createElement('div'); box.className = 'fd-rb';
    const row = (label, node, note) => { const r = document.createElement('div'); r.className = 'fd-rb-row'; const l = document.createElement('span'); l.className = 'fd-rb-lbl'; l.textContent = label; r.append(l, node); if (note) { const n = document.createElement('span'); n.className = 'fd-zero'; n.textContent = note; r.append(n); } box.append(r); };
    const sel = (opts, val, on) => { const x = document.createElement('select'); x.className = 'dash-select'; opts.forEach(([v, t]) => x.append(new Option(t, v))); x.value = val; x.addEventListener('change', () => on(x.value)); return x; };
    box.append(rhead(`Settings for the ${book()} dashboard`));
    row('Dashboard type', sel([['personal', 'Personal (one person)'], ['shared', 'Shared (two or more people)']], s.type, (v) => { s.type = v; dash.draw('settingsView'); }));
    if (s.type === 'shared') {
      const w = document.createElement('div'); w.className = 'fd-people';
      s.people.forEach((p, i) => {
        const r = document.createElement('div'); r.className = 'fd-rb-row';
        const n = rin(p.name, `Person ${i + 1} (as on their accounts’ Owner)`, (v) => { p.name = v; }); const pc = rin(String(p.pct), '%', (v) => { p.pct = Number(v) || 0; }); pc.type = 'number'; pc.min = '0'; pc.max = '100'; pc.style.maxWidth = '6em';
        r.append(n, pc, document.createTextNode('% share'), rbtn('×', () => { s.people.splice(i, 1); dash.draw('settingsView'); })); w.append(r);
      });
      w.append(rbtn('+ Add person', () => { s.people.push({ name: '', pct: 0 }); dash.draw('settingsView'); }));
      const n = document.createElement('p'); n.className = 'fd-note'; n.textContent = 'Each person’s share of shared costs (e.g. 50/50, or 60/40 by income). Spending is credited to whoever owns the account it was paid from (set Owner on each account under Accounts).'; w.append(n);
      row('People & split', w);
    }
    const tabs = [['', 'Last tab used'], ...[...document.querySelectorAll('#fd-nav .fd-navb:not(.fd-navr)')].filter((b) => b.dataset.group && b.dataset.group !== 'settings').map((b) => [b.dataset.group, b.textContent.trim()])];
    row('Open on', sel(tabs, s.tab, (v) => { s.tab = v; }));
    const rngSel = document.getElementById('fd-range'); const rngs = [['', 'Last used'], ...(rngSel ? [...rngSel.options].filter((o) => o.value !== 'custom').map((o) => [o.value, o.textContent]) : [])];
    row('Default date range', sel(rngs, s.range, (v) => { s.range = v; }));
    row('Calendar weeks start on', sel([['mon', 'Monday'], ['sun', 'Sunday']], s.weekStart, (v) => { s.weekStart = v; }));
    const chk = (label, on, set) => { const l = document.createElement('label'); l.className = 'fd-check'; const i = document.createElement('input'); i.type = 'checkbox'; i.checked = on; i.addEventListener('change', () => set(i.checked)); l.append(i, ' ' + label); return l; };
    const tw = document.createElement('div'); tw.className = 'fd-chkgrid';
    TILES.forEach(([id, lab]) => tw.append(chk(lab, !(s.hideTiles || []).includes(id), (on) => { const h = new Set(s.hideTiles || []); if (on) h.delete(id); else h.add(id); s.hideTiles = [...h]; })));
    row('Top row tiles', tw);
    row('Amounts', chk('Hide cents (show $1,234 instead of $1,234.56)', !!s.noCents, (v) => { s.noCents = v; }));
    { const det = document.createElement('details'); det.className = 'fd-showset'; const sm = document.createElement('summary'); sm.textContent = 'Sections & details to show (untick to hide)'; det.append(sm);
      const NAMES = { overview: 'Overview', accounts: 'Accounts', expenses: 'Expenses', budget: 'Budget', markets: 'Markets', review: 'Year in review' };
      const seen = new Set();
      Object.entries(NAMES).forEach(([g, gl]) => { const ids = (GROUPS[g] || []).filter((id) => !seen.has(id) && q(id)[0]); if (!ids.length) return; ids.forEach((id) => seen.add(id));
        const h = document.createElement('div'); h.className = 'fd-rb-h'; h.textContent = gl; det.append(h); const w = document.createElement('div'); w.className = 'fd-chkgrid';
        ids.forEach((id) => w.append(chk(secTitle(id), !(s.hideSec || []).includes(id), (on) => { const x = new Set(s.hideSec || []); on ? x.delete(id) : x.add(id); s.hideSec = [...x]; }))); det.append(w); });
      const h2 = document.createElement('div'); h2.className = 'fd-rb-h'; h2.textContent = 'Details inside sections'; det.append(h2); const w2 = document.createElement('div'); w2.className = 'fd-chkgrid';
      [['b-mtg', 'Budgets: mortgage payments (shown under Mortgage)'], ['b-today', 'Budget ring: today marker'], ['b-pace', 'Budget ring: spending-pace marker'], ['m-idx', 'Markets: indexes'], ['m-com', 'Markets: commodities'], ['m-sec', 'Markets: sectors'], ['m-mov', 'Markets: top movers'], ['e-rate', 'Economy: interest rates'], ['e-treas', 'Economy: Treasury savings options'], ['e-fx', 'Economy: exchange rates'], ['e-cal', 'Economy: economic calendar'], ['m-scr', 'Markets: stock screener'], ['e-infl', 'Economy: inflation'], ['e-ener', 'Economy: energy & housing'], ['h-alloc', 'Holdings: allocation'], ['h-watch', 'Holdings: watchlist'], ['h-divcal', 'Holdings: dividend calendar'], ['h-rings', 'Holdings: allocation rings'], ['h-det', 'Holdings: news & analyst details']]
        .forEach(([k, lab]) => w2.append(chk(lab, !(s.hideParts || []).includes(k), (on) => { const x = new Set(s.hideParts || []); on ? x.delete(k) : x.add(k); s.hideParts = [...x]; })));
      det.append(w2); const r = document.createElement('div'); r.className = 'fd-rb-row'; r.append(det); box.append(r); }
    const hw = document.createElement('div'); hw.className = 'fd-chkgrid';
    HOPTS.forEach(([k, lab]) => hw.append(chk(lab, (s.hideDefault || { mortgage: true })[k] ?? false, (v) => { s.hideDefault = { ...(s.hideDefault || { mortgage: true }), [k]: v }; })));
    row('“Biggest” lists hide by default', hw);
    const msg = document.createElement('p'); msg.className = 'fd-note';
    const save = rbtn('Save settings', async () => {
      if (s.type === 'shared') { const tot = s.people.reduce((t, p) => t + (Number(p.pct) || 0), 0); s.people = s.people.filter((p) => p.name.trim()); if (s.people.length && Math.round(tot) !== 100) { msg.className = 'fd-note fd-bad'; msg.textContent = `The shares add up to ${tot}%; they need to add up to 100%.`; return; } }
      const { _book, ...save } = s; const ok = await prefSet('settings', save); if (ok) { sDraft = null; applySettings(save, true); } msg.className = 'fd-note ' + (ok ? 'fd-good' : 'fd-bad'); msg.textContent = ok ? 'Saved.' : 'Couldn’t save. Try again.';
    }, false);
    const resetC = rbtn('Reset all chart colors', async () => { COLORS = {}; await prefSet('colors', {}); redrawAll(); msg.className = 'fd-note'; msg.textContent = 'Chart colors reset.'; });
    const bar = document.createElement('div'); bar.className = 'fd-rb-row'; bar.append(save, resetC); box.append(bar, msg);
    apiBox(el);
    phoneBox(el).catch(() => {});
    emailBox(el).catch(() => {});
    syncBox(el).catch(() => {});
    connectBox(el).catch(() => {});
    inviteBox(el).catch(() => {});
    navMenuBox(el);
    activityBox(el).catch(() => {});
    if (meBooks().length && myBookId()) {
      const bk = document.createElement('div'); bk.className = 'fd-rb fd-backup'; bk.append(rhead('Backup & restore'));
      const bn = document.createElement('p'); bn.className = 'fd-note'; bn.textContent = `Download a copy of everything saved in the ${book()} dashboard (statements, edits, rules, accounts, budgets, goals, holdings, settings). The server also keeps a full daily backup of all dashboards for 30 days.`; bk.append(bn);
      const dl = document.createElement('a'); dl.className = 'fd-btn fd-sm'; dl.href = FDStore.url(`/api/books/${encodeURIComponent(myBookId())}/export`); dl.textContent = 'Download backup'; dl.setAttribute('download', '');
      const fi = document.createElement('input'); fi.type = 'file'; fi.accept = '.json,application/json'; fi.style.maxWidth = '260px';
      const rmsg = document.createElement('p'); rmsg.className = 'fd-note';
      let armed = false;
      const rs = rbtn('Restore from backup…', async () => {
        const f = fi.files && fi.files[0]; if (!f) { rmsg.className = 'fd-note fd-bad'; rmsg.textContent = 'Choose a backup file first.'; return; }
        let j; try { j = JSON.parse(await f.text()); } catch { rmsg.className = 'fd-note fd-bad'; rmsg.textContent = 'That file isn’t a backup from this app.'; return; }
        if (!j || typeof j.docs !== 'object') { rmsg.className = 'fd-note fd-bad'; rmsg.textContent = 'That file isn’t a backup from this app.'; return; }
        const n = Object.values(j.docs).reduce((t, l) => t + (Array.isArray(l) ? l.length : 0), 0);
        if (!armed) { armed = true; rs.textContent = 'Yes, replace everything here'; rmsg.className = 'fd-note fd-bad'; rmsg.textContent = `This replaces everything saved in the ${book()} dashboard with the ${n} items in the backup${j.exportedAt ? ` from ${String(j.exportedAt).slice(0, 10)}` : ''}${j.book && j.book.label && j.book.label !== book() ? ` (made from the ${j.book.label} dashboard)` : ''}. A safety copy of the current data is saved on the server first.`; return; }
        rs.disabled = true; rmsg.className = 'fd-note'; rmsg.textContent = 'Restoring…';
        try { const r = await FDStore.fetch(`/api/books/${encodeURIComponent(myBookId())}/restore`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(j) }); const out = await r.json();
          if (!r.ok) throw new Error(out.error || r.status); rmsg.className = 'fd-note fd-good'; rmsg.textContent = `Restored ${out.restored} items. Reloading…`; setTimeout(() => location.reload(), 1200); }
        catch (e) { rs.disabled = false; armed = false; rs.textContent = 'Restore from backup…'; rmsg.className = 'fd-note fd-bad'; rmsg.textContent = 'Restore failed: ' + e.message; }
      });
      const br = document.createElement('div'); br.className = 'fd-rb-row'; br.append(dl, fi, rs); bk.append(br, rmsg); el.append(bk);
    }
    const tip = document.createElement('p'); tip.className = 'fd-note'; tip.textContent = 'Tip: the ⚙ on any chart changes that chart’s colors. Settings, colors and custom reports are saved on the server, so they follow you to every device.'; box.append(tip);
    el.append(box);
  });

  // ---- shared costs: who paid what vs. the agreed split ----
  const ownerOf = (src) => { const a = acctList().find((x) => keyA(x.name) === keyA(src || '') || (x.reg?.aliases || []).some((al) => keyA(al) === keyA(src || ''))); return (a && a.owner) || ''; };
  dash.draw('splitView', (el) => {
    if (st('txns', 'period', 'prefs', 'accounts') !== 'ok') return;
    el.replaceChildren(); const s = SET(), sec = el.closest('section');
    if (s.type !== 'shared') { if (sec) sec.hidden = true; return; }
    if (sec && !sec.closest('[hidden]')) sec.hidden = false;
    const people = s.people.filter((p) => p.name.trim());
    if (!people.length) { const p = document.createElement('p'); p.className = 'fd-note'; p.textContent = 'Add the people and their shares in Settings to see who paid what.'; el.append(p, rbtn('Open settings', () => showGroup('settings'))); return; }
    const inPer = new Set(period().map((m) => m.month)), paid = Object.fromEntries(people.map((p) => [p.name, 0])); let un = 0, tot = 0; const unSrc = {};
    rows('txns').filter((t) => t.book === book() && t.type === 'expense' && inPer.has(t.month)).forEach((t) => {
      tot += t.amount; const o = ownerOf(t.source).toLowerCase(); const p = people.find((x) => o && (x.name.toLowerCase() === o || o.includes(x.name.toLowerCase())));
      if (p) paid[p.name] += t.amount; else { un += t.amount; unSrc[t.source || 'Unknown'] = (unSrc[t.source || 'Unknown'] || 0) + t.amount; }
    });
    const known = tot - un, cols = ['#2f6fd6', '#f6d84a', '#7b5ea7', '#0b5e31'];
    const sl = people.map((p, i) => ({ label: p.name, value: paid[p.name], color: cols[i % cols.length] })); if (un > 0) sl.push({ label: 'Unassigned', value: un, color: '#9aa3b2' });
    const t = document.createElement('table'); t.className = 'fd-table'; const tb = document.createElement('tbody');
    const hr = document.createElement('tr'); ['Person', 'Share', 'Should pay', 'Paid', 'Difference'].forEach((c, i) => { const th = document.createElement('th'); th.textContent = c; if (!i) th.className = 'fd-l'; hr.append(th); }); tb.append(hr);
    const diffs = people.map((p) => { const should = known * (p.pct / 100), d = paid[p.name] - should; const tr = document.createElement('tr'); tr.append(td(p.name, 'fd-l'), td(`${p.pct}%`), td(money0(should)), td(money0(paid[p.name])), td((d >= 0 ? '+' : '−') + money0(Math.abs(d)), d >= 0 ? 'fd-good' : 'fd-bad')); tb.append(tr); return [p.name, d]; });
    t.append(tb);
    const side = document.createElement('div'); side.style.flex = '1 1 280px'; side.append(t);
    const owe = document.createElement('p'); owe.className = 'fd-rb-h';
    if (people.length === 2) { const [a, b] = diffs; const who = a[1] < b[1] ? [a[0], b[0], -a[1]] : [b[0], a[0], -b[1]]; owe.textContent = Math.abs(who[2]) < 1 ? 'You’re even.' : `${who[0]} owes ${who[1]} ${money0(who[2])} to even out.`; }
    else owe.textContent = 'Positive = paid more than their share.';
    side.append(owe);
    if (un > 0) { const n = document.createElement('p'); n.className = 'fd-note'; n.textContent = `${money0(un)} came from accounts with no Owner set (${Object.keys(unSrc).slice(0, 4).join(', ')}${Object.keys(unSrc).length > 4 ? '…' : ''}). Set Owner on those accounts to count them. Unassigned spending is left out of the split.`; side.append(n); }
    el.append(ringBox(ring(sl, [money0(tot), 'shared spending'], { size: 160, width: 28, labels: true, title: 'Who paid', chart: 'ring-split' }), side, ['Who paid · ' + money0(tot), sl]));
  });

  // ---- non-cash assets: home, vehicles, other (value entered by hand, vehicles depreciate) ----
  const ASSET_T = { home: ['Home', 0, 12], vehicle: ['Vehicle', 15, 6], other: ['Other', 0, 12] };
  const assetNow = (a) => { const yrs = a.asOf ? Math.max(0, (Date.now() - Date.parse(a.asOf)) / (365.25 * 864e5)) : 0; return Math.max(0, Number(a.value) * Math.pow(1 - (Number(a.depr) || 0) / 100, yrs)); };
  const assetsAll = () => (prefGet('assets', []) || []).filter((a) => Number(a.value) > 0);
  const debtTot = () => ['mortgage', 'loan', 'credit'].reduce((t, k) => t + (latestTotal([k])[0]?.total || 0), 0);
  let asEd = null;
  dash.draw('assetView', (el) => {
    if (st('prefs', 'accounts', 'balances') !== 'ok') return;
    el.replaceChildren(); const list = prefGet('assets', []) || [];
    const saveAll = async (next) => { await prefSet('assets', next); asEd = null; };
    if (asEd) {
      const box = document.createElement('div'); box.className = 'fd-rb'; box.append(rhead(asEd.i == null ? 'New asset' : `Edit ${asEd.name}`));
      const row = (label, node) => { const r = document.createElement('div'); r.className = 'fd-rb-row'; const l = document.createElement('span'); l.className = 'fd-rb-lbl'; l.textContent = label; r.append(l, node); box.append(r); };
      const ty = document.createElement('select'); ty.className = 'dash-select'; Object.entries(ASSET_T).forEach(([k, v]) => ty.append(new Option(v[0], k))); ty.value = asEd.type;
      ty.addEventListener('change', () => { asEd.type = ty.value; if (asEd.depr === '' || asEd.depr == null || asEd._autoDepr) { asEd.depr = ASSET_T[asEd.type][1]; asEd._autoDepr = true; } dash.draw('assetView'); }); row('Type', ty);
      row('Name', rin(asEd.name, asEd.type === 'vehicle' ? 'e.g. 2021 Honda CR-V' : asEd.type === 'home' ? 'e.g. Our house' : 'e.g. Boat', (v) => { asEd.name = v; }));
      const val = rin(asEd.value, asEd.type === 'home' ? 'assessed or estimated value' : 'e.g. from kbb.com', (v) => { asEd.value = v; }); val.inputMode = 'decimal'; row('Value ($)', val);
      const dt = rin(asEd.asOf, '', (v) => { asEd.asOf = v; }); dt.type = 'date'; row('Value as of', dt);
      const dp = rin(asEd.depr, '0', (v) => { asEd.depr = v; asEd._autoDepr = false; }); dp.type = 'number'; dp.min = '0'; dp.max = '50'; dp.style.maxWidth = '6em'; row('Loses value per year (%)', dp);
      if (asEd.type === 'vehicle') { const vi = rin(asEd.vin, '17 characters', (v) => { asEd.vin = v.toUpperCase(); }); const vr = document.createElement('div'); vr.className = 'fd-rb-row'; vr.style.flexWrap = 'nowrap'; const vm = document.createElement('span'); vm.className = 'fd-zero';
        const lk = rbtn('Look up', async () => { vm.textContent = 'Looking up…'; try { const r = await FDStore.fetch('/api/vehicle?vin=' + encodeURIComponent(asEd.vin || ''), {}); const v = await r.json(); if (!r.ok || v.error || !v.make) throw new Error(v.error || 'Not found');
          const nm = [v.year, v.make, v.model, v.trim].filter(Boolean).join(' '); if (!String(asEd.name || '').trim()) asEd.name = nm; vm.textContent = `${nm}${v.recalls.length ? ` · ${v.recalls.length} recall${v.recalls.length === 1 ? '' : 's'} listed for this model` : ' · no recalls listed'}`; const ni = box.querySelector('input[placeholder="e.g. 2021 Honda CR-V"]'); if (ni && !ni.value) ni.value = asEd.name; }
          catch (e) { vm.textContent = 'Couldn’t look that VIN up (' + e.message + ').'; } });
        vr.append(vi, lk, vm); row('VIN (optional)', vr); }
      if (asEd.type === 'home') { const ms = document.createElement('select'); ms.className = 'dash-select'; ms.append(new Option('None', ''), ...acctList().filter((a) => a.kind === 'mortgage' || a.kind === 'loan').map((a) => new Option(a.name, a.name))); ms.value = asEd.loan || ''; ms.addEventListener('change', () => { asEd.loan = ms.value; }); row('Mortgage (for equity)', ms); }
      if (asEd.type === 'vehicle') { const ms = document.createElement('select'); ms.className = 'dash-select'; ms.append(new Option('None', ''), ...acctList().filter((a) => a.kind === 'loan').map((a) => new Option(a.name, a.name))); ms.value = asEd.loan || ''; ms.addEventListener('change', () => { asEd.loan = ms.value; }); row('Auto loan (for equity)', ms); }
      shareRows(box, asEd, false);
      const msg = document.createElement('p'); msg.className = 'fd-note fd-bad';
      const sv = rbtn('Save asset', async () => {
        const num$ = Number(String(asEd.value ?? '').replace(/[^0-9.]/g, ''));
        if (!String(asEd.name || '').trim()) { msg.textContent = 'Enter a name.'; return; }
        if (!(num$ > 0)) { msg.textContent = 'Enter a value (numbers only, e.g. 350000).'; return; }
        asEd.value = num$;
        const a = { type: asEd.type, name: String(asEd.name).trim().slice(0, 60), value: Number(asEd.value), asOf: asEd.asOf || new Date().toLocaleDateString('en-CA'), depr: Number(asEd.depr) || 0, vin: (asEd.vin || '').slice(0, 17), loan: asEd.loan || '', shareTo: asEd.shareTo || [] };
        const next = list.slice(); if (asEd.i == null) next.push(a); else next[asEd.i] = a; await saveAll(next); dash.draw('assetView');
      }, false);
      const bar = document.createElement('div'); bar.className = 'fd-rb-row'; bar.append(sv, rbtn('Cancel', () => { asEd = null; dash.draw('assetView'); }));
      if (asEd.i != null) bar.append(rbtn('Delete', async () => { const next = list.slice(); next.splice(asEd.i, 1); await saveAll(next); dash.draw('assetView'); }));
      box.append(bar, msg);
      if (asEd.type === 'vehicle') { const n = document.createElement('p'); n.className = 'fd-note'; n.textContent = 'There’s no free vehicle-value service, so look the value up on kbb.com or edmunds.com. The app lowers it by the yearly % until you update it, and reminds you every 6 months.'; box.append(n); }
      el.append(box); return;
    }
    el.append(rbtn('+ Add home, vehicle or other asset', () => { asEd = { i: null, type: 'home', name: '', value: '', asOf: new Date().toLocaleDateString('en-CA'), depr: 0, _autoDepr: true, vin: '', loan: '' }; dash.draw('assetView'); }, false));
    if (!list.length) { const p = document.createElement('p'); p.className = 'fd-note'; p.textContent = 'Add your home, vehicles or other valuables to include them in your net worth.'; el.append(p); return; }
    const t = document.createElement('table'); t.className = 'fd-table'; const tb = document.createElement('tbody');
    const hr = document.createElement('tr'); ['Asset', 'Value now', 'Owed', 'Equity', 'Last updated'].forEach((c, i) => { const th = document.createElement('th'); th.textContent = c; if (!i) th.className = 'fd-l'; hr.append(th); }); tb.append(hr);
    list.forEach((a, i) => {
      const now = assetNow(a), loan = a.loan ? acctList().find((x) => x.name === a.loan) : null, owed = loan && loan.bal ? loan.bal.balance : 0;
      const ageM = a.asOf ? (Date.now() - Date.parse(a.asOf)) / (30.4 * 864e5) : 99, stale = ageM > ASSET_T[a.type || 'other'][2];
      const tr = document.createElement('tr'); tr.className = 'fd-click'; tr.title = 'Edit';
      const nm = td('', 'fd-l'); const b = document.createElement('strong'); b.textContent = a.name; shareIcon(b, a.shareTo); const sub = document.createElement('div'); sub.className = 'fd-zero fd-rsub'; sub.textContent = ASSET_T[a.type || 'other'][0] + (a.depr ? ` · −${a.depr}%/yr` : '') + (a.vin ? ` · VIN ${a.vin}` : ''); nm.append(b, sub);
      const up = td(a.asOf ? new Date(a.asOf + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) + (stale ? ' · time to update' : '') : '–', stale ? 'fd-bad' : 'fd-zero');
      tr.append(nm, td(money0(now)), td(owed ? money0(owed) : '–'), td(money0(now - owed), now - owed >= 0 ? 'fd-good' : 'fd-bad'), up);
      tr.addEventListener('click', () => { asEd = { i, ...a, _autoDepr: false }; dash.draw('assetView'); });
      tb.append(tr);
    });
    t.append(tb); el.append(t);
  });

  // ---- net worth ring, subscription cost ring, credit card gauges ----
  dash.draw('nwRing', (el) => {
    if (st('balance_totals', 'prefs') !== 'ok') return;
    el.replaceChildren();
    const cash = (latestTotal(['deposit'])[0]?.total || 0) + sharedSum(['deposit'], 'nw'), inv = (latestTotal(['investment'])[0]?.total || 0) + sharedSum(['investment'], 'nw'), own = assetsAll().reduce((t, a) => t + assetNow(a), 0) + sharedSum(['asset'], 'nw'), debt = debtTot() + sharedSum(['credit', 'mortgage', 'loan'], 'nw');
    const sl = [{ label: 'Checking & savings', value: cash, color: '#2f6fd6' }, { label: 'Investments', value: inv, color: '#0b5e31' }, { label: 'Home & vehicles', value: own, color: '#7b5ea7' }].filter((x) => x.value > 0);
    if (!sl.length) return;
    const side = legend(sl, 0, true); const n = document.createElement('p'); n.className = 'fd-note'; n.textContent = `Own ${money0(cash + inv + own)} · owe ${money0(debt)} (mortgage, loans, cards)`; side.append(n);
    el.append(ringBox(ring(sl, [money0(cash + inv + own - debt), 'net worth'], { size: 160, width: 28, labels: true, title: 'What you own', chart: 'ring-nw' }), side, ['What you own · net worth ' + money0(cash + inv + own - debt), [...sl, { label: 'Owed', value: debt, color: '#c43c3c' }]]));
  });
  dash.draw('subsRing', (el) => {
    if (st('subs') !== 'ok') return;
    el.replaceChildren(); const r = rows('subs').filter((x) => x.book === book() && x.kind === 'Subscription' && x.yearly > 0).sort((a, b) => b.yearly - a.yearly); if (!r.length) return;
    const top = r.slice(0, 6), rest = r.slice(6).reduce((t, x) => t + x.yearly, 0);
    const sl = top.map((x, i) => ({ label: x.vendor, value: x.yearly, color: dash.colors[i % dash.colors.length] })); if (rest) sl.push({ label: `Other (${r.length - 6})`, value: rest, color: 'var(--color-fg-muted)' });
    const tot = sl.reduce((t, x) => t + x.value, 0);
    el.append(ringBox(ring(sl, [money0(tot), 'a year'], { size: 170, width: 28, labels: true, title: 'Subscriptions per year', chart: 'ring-subs' }), legend(sl, tot), ['Subscriptions · per year', sl]));
  });
  const gauge = (pct, color) => {
    const w = 120, h = 70, r = 50, c = w / 2, y = 62, a = Math.PI * (1 - Math.min(1, pct / 100));
    const svg = svgEl('svg', { viewBox: `0 0 ${w} ${h}`, class: 'fd-gauge', role: 'img', 'aria-label': `${Math.round(pct)}% used` });
    svg.append(svgEl('path', { d: `M ${c - r} ${y} A ${r} ${r} 0 0 1 ${c + r} ${y}`, fill: 'none', stroke: 'var(--color-border-line)', 'stroke-width': 12, 'stroke-linecap': 'round' }));
    if (pct > 0) svg.append(svgEl('path', { d: `M ${c - r} ${y} A ${r} ${r} 0 0 1 ${(c + r * Math.cos(a)).toFixed(2)} ${(y - r * Math.sin(a)).toFixed(2)}`, fill: 'none', stroke: color, 'stroke-width': 12, 'stroke-linecap': 'round' }));
    const t = svgEl('text', { x: c, y: y - 6, 'text-anchor': 'middle', class: 'fd-ring-big' }); t.textContent = `${Math.round(pct)}%`; svg.append(t); return svg;
  };
  dash.draw('cardGauges', (el) => {
    if (st('accounts', 'balances') !== 'ok') return;
    el.replaceChildren(); const cs = acctList().filter((a) => a.kind === 'credit' && a.active !== false && Number(a.limit) > 0 && a.bal); if (!cs.length) return;
    const g = document.createElement('div'); g.className = 'fd-gauges';
    cs.forEach((a) => {
      const pct = (a.bal.balance / Number(a.limit)) * 100, d = document.createElement('div'); d.className = 'fd-gaugebox';
      d.append(gauge(pct, pct > 50 ? BAD : pct > 30 ? WARN : OK));
      const n = document.createElement('div'); n.className = 'fd-rsub'; n.textContent = a.name; const v = document.createElement('div'); v.className = 'fd-zero fd-rsub'; v.textContent = `${money0(a.bal.balance)} of ${money0(a.limit)}`; d.append(n, v); g.append(d);
    });
    const note = document.createElement('p'); note.className = 'fd-note'; note.textContent = 'Card usage: under 30% is green, 30–50% amber, over 50% red (high usage can lower credit scores).';
    el.append(g, note);
  });

  // ---- watchlist: symbols you don't own, with an optional "tell me if it drops below" price ----
  let wIn = '', wBelow = '';
  const watchAlerts = () => (prefGet('watch', []) || []).filter((w) => w.below > 0 && QUOTES[w.symbol] && QUOTES[w.symbol].price <= w.below);
  dash.draw('watchView', (el) => {
    if (st('prefs') !== 'ok') return; if (PART('h-watch')) { el.replaceChildren(); return; }
    el.replaceChildren(); const list = prefGet('watch', []) || [];
    el.append(rhead('Watchlist'));
    const add = document.createElement('div'); add.className = 'fd-rb-row';
    const sy = rin(wIn, 'Symbol, e.g. MSFT', (v) => { wIn = v.toUpperCase(); }); sy.style.maxWidth = '12em';
    const bl = rin(wBelow, 'Alert below $ (optional)', (v) => { wBelow = v; }); bl.type = 'number'; bl.min = '0'; bl.step = '0.01'; bl.style.maxWidth = '13em';
    add.append(sy, bl, rbtn('+ Watch', async () => { const sym = wIn.trim(); if (!/^[A-Z0-9.\-^]{1,12}$/.test(sym) || list.some((w) => w.symbol === sym)) return; await prefSet('watch', [...list, { symbol: sym, below: Number(wBelow) || 0, added: new Date().toLocaleDateString('en-CA') }]); wIn = ''; wBelow = ''; qWant = ''; }, false));
    el.append(add);
    if (!list.length) { const p = document.createElement('p'); p.className = 'fd-note'; p.textContent = 'Follow stocks you don’t own. Prices come with the hourly update on the self-hosted app.'; el.append(p); return; }
    const t = document.createElement('table'); t.className = 'fd-table'; const tb = document.createElement('tbody');
    const hr = document.createElement('tr'); ['Symbol', 'Price', 'Today', 'Alert below', ''].forEach((c, i) => { const th = document.createElement('th'); th.textContent = c; if (!i) th.className = 'fd-l'; hr.append(th); }); tb.append(hr);
    list.forEach((w, i) => {
      const qt = QUOTES[w.symbol], hit = w.below > 0 && qt && qt.price <= w.below;
      const tr = document.createElement('tr'); const nm = td('', 'fd-l'); const b = document.createElement('strong'); b.textContent = w.symbol + (hit ? ' ⚑' : ''); const sub = document.createElement('div'); sub.className = 'fd-zero fd-rsub'; sub.textContent = qt?.name || ''; nm.append(b, sub);
      const dc = td(''); if (qt && qt.prevClose) dc.append(chgSpan((qt.price / qt.prevClose - 1) * 100)); else dc.textContent = '–';
      const rm = rbtn('Remove', async () => { const next = list.slice(); next.splice(i, 1); await prefSet('watch', next); });
      tr.append(nm, td(qt ? money2(qt.price) : '—'), dc, td(w.below ? money2(w.below) : '–', hit ? 'fd-bad' : ''), (() => { const c = td(''); c.append(rm); return c; })());
      tb.append(tr);
    });
    t.append(tb); el.append(t);
    const al = watchAlerts(); if (al.length) { const p = document.createElement('p'); p.className = 'fd-note fd-bad'; p.textContent = `⚑ Below your alert price: ${al.map((w) => `${w.symbol} at ${money2(QUOTES[w.symbol].price)}`).join(', ')}.`; el.append(p); }
  });

  // ---- mortgage & loan payoff schedule, with an extra-payment slider ----
  const amortX = {}, amortOpen = {};
  const schedule = (B, apr, pmt, extra) => {
    const r = apr / 100 / 12, rows = []; let b = B, m = 0;
    while (b > 0.005 && m < 600) { const it = b * r, pr = Math.min(b, pmt + extra - it); if (pr <= 0) return null; b -= pr; rows.push({ m, interest: it, principal: pr, balance: Math.max(0, b) }); m++; }
    return rows;
  };
  dash.draw('amortView', (el) => {
    if (st('accounts', 'balances') !== 'ok') return;
    el.replaceChildren();
    const ls = acctList().filter((a) => (a.kind === 'mortgage' || a.kind === 'loan') && a.active !== false && a.bal && a.bal.balance > 0 && Number(a.payment) > 0);
    if (!ls.length) return;
    ls.forEach((a) => {
      const B = a.bal.balance, apr = Number(a.rate) || 0, esc = Number(a.escrow) || 0, pi = Number(a.payment) - esc;
      if (amortX[a.name] == null) amortX[a.name] = Number(a.extra) || 0;
      const x = amortX[a.name], base = schedule(B, apr, pi, 0), withX = schedule(B, apr, pi, x);
      const box = document.createElement('div'); box.className = 'fd-rb'; box.append(rhead(`${a.name} payoff schedule`));
      if (!base) { const p = document.createElement('p'); p.className = 'fd-note fd-bad'; p.textContent = 'The payment doesn’t cover the monthly interest, so this never pays off.'; box.append(p); el.append(box); return; }
      const sl = document.createElement('div'); sl.className = 'fd-rb-row fd-slider';
      const lab = document.createElement('span'); lab.className = 'fd-rb-lbl'; lab.textContent = 'Extra each month';
      const rng = document.createElement('input'); rng.type = 'range'; rng.min = '0'; rng.max = String(Math.max(2000, Math.ceil(pi / 100) * 100)); rng.step = '25'; rng.value = String(x); rng.setAttribute('aria-label', 'Extra principal each month');
      const out = document.createElement('b'); out.textContent = money0(x);
      rng.addEventListener('input', () => { out.textContent = money0(Number(rng.value)); });
      rng.addEventListener('change', () => { amortX[a.name] = Number(rng.value); dash.draw('amortView'); });
      sl.append(lab, rng, out); box.append(sl);
      const sum = (rs) => rs.reduce((t, r) => t + r.interest, 0), when = (n) => addM(n), iB = sum(base), iX = withX ? sum(withX) : iB;
      const g = document.createElement('div'); g.className = 'fd-rtiles';
      g.append(tile('Paid off', when(withX ? withX.length : base.length), x ? `vs ${when(base.length)} with no extra` : dur(base.length) + ' from now'),
        tile('Interest still to pay', money0(iX), x ? `saves ${money0(iB - iX)}` : '', x ? 'fd-good' : ''),
        tile('Monthly payment', money0(pi + esc + x), `${money0(pi)} principal & interest${esc ? ` + ${money0(esc)} escrow` : ''}${x ? ` + ${money0(x)} extra` : ''}`),
        tile('Time saved', x ? dur(base.length - withX.length) || '< 1 mo' : '–', ''));
      box.append(g);
      const rows = withX || base, years = {}; const now = new Date();
      rows.forEach((r) => { const d = new Date(now.getFullYear(), now.getMonth() + 1 + r.m, 1), y = d.getFullYear(); const o = (years[y] = years[y] || { y, principal: 0, interest: 0, balance: 0, months: [] }); o.principal += r.principal; o.interest += r.interest; o.balance = r.balance; o.months.push({ ...r, label: d.toLocaleString('en-US', { month: 'short', year: 'numeric' }) }); });
      const t = document.createElement('table'); t.className = 'fd-table'; const tb = document.createElement('tbody');
      const hr = document.createElement('tr'); ['Year', 'Principal', 'Interest', esc ? 'Escrow' : '', 'Balance at end'].filter((c) => c !== '').forEach((c, i) => { const th = document.createElement('th'); th.textContent = c; if (!i) th.className = 'fd-l'; hr.append(th); }); tb.append(hr);
      Object.values(years).forEach((o) => {
        const key = a.name + o.y, open = !!amortOpen[key];
        const tr = document.createElement('tr'); tr.className = 'fd-click'; tr.title = open ? 'Hide months' : 'Show months';
        tr.append(td(`${open ? '▾' : '▸'} ${o.y}`, 'fd-l'), td(money0(o.principal)), td(money0(o.interest))); if (esc) tr.append(td(money0(esc * o.months.length))); tr.append(td(money0(o.balance)));
        tr.addEventListener('click', () => { amortOpen[key] = !open; dash.draw('amortView'); }); tb.append(tr);
        if (open) o.months.forEach((mm) => { const r2 = document.createElement('tr'); r2.className = 'fd-sub-row'; r2.append(td(mm.label, 'fd-l fd-zero'), td(money2(mm.principal)), td(money2(mm.interest))); if (esc) r2.append(td(money2(esc))); r2.append(td(money0(mm.balance))); tb.append(r2); });
      });
      t.append(tb); const sc = document.createElement('div'); sc.className = 'fd-scroll fd-amort'; sc.append(t); box.append(sc);
      const n = document.createElement('p'); n.className = 'fd-note'; n.textContent = `Based on ${money0(B)} owed, ${apr}% interest and the payment on the account. Moving the slider doesn’t save anything; set a standing extra payment on the account (Accounts › Edit) to use it everywhere.`; box.append(n);
      el.append(box);
    });
  });

  // ---- sharing balances from a personal dashboard to shared dashboards (value only, read-only) ----
  let MEBOOKS = null;
  const meBooks = () => { if (MEBOOKS === null) { MEBOOKS = []; FDStore.fetch('/api/me', {}).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j && Array.isArray(j.books)) { MEBOOKS = j.books; ['acctEditor', 'acctRows', 'assetView', 'sharePub', 'settingsView'].forEach((d) => dash.draw(d)); } }).catch(() => {}); } return MEBOOKS; };
  const myBookId = () => (meBooks().find((b) => b.label === book()) || {}).id;
  const shareTargets = () => meBooks().filter((b) => b.label !== book());
  const shareRows = (box, obj, isAcct) => {
    const ts = shareTargets(); if (!ts.length) return;
    obj.shareTo = obj.shareTo || [];
    const w = document.createElement('div'); w.className = 'fd-chkgrid';
    ts.forEach((b) => { const l = document.createElement('label'); l.className = 'fd-check'; const i = document.createElement('input'); i.type = 'checkbox'; i.checked = obj.shareTo.includes(b.id); i.addEventListener('change', () => { obj.shareTo = i.checked ? [...new Set([...obj.shareTo, b.id])] : obj.shareTo.filter((x) => x !== b.id); }); l.append(i, ' ' + b.name); w.append(l); });
    if (isAcct) { const l = document.createElement('label'); l.className = 'fd-check'; const i = document.createElement('input'); i.type = 'checkbox'; i.checked = !!obj.shareHist; i.addEventListener('change', () => { obj.shareHist = i.checked; }); l.append(i, ' Include month-end balance history'); w.append(l); }
    const r = document.createElement('div'); r.className = 'fd-rb-row'; const lb = document.createElement('span'); lb.className = 'fd-rb-lbl'; lb.textContent = 'Share value with'; r.append(lb, w); box.append(r);
    const n = document.createElement('p'); n.className = 'fd-note'; n.textContent = 'Shared dashboards see only the name, type, owner and balance (plus history if ticked) — never transactions.'; box.append(n);
  };
  let pubSig = '', pubTimer = null;
  dash.draw('sharePub', () => {
    if (st('accounts', 'balances', 'prefs') !== 'ok' || !meBooks().length || !myBookId()) return;
    const src = myBookId(), want = {};
    acctList().forEach((a) => { const to = (a.reg && a.reg.shareTo) || []; if (!to.length || !a.bal) return;
      const hist = a.reg.shareHist ? rows('balances').filter((r) => r.book === book() && r.kind === a.kind && keyA(r.label || r.account) === keyA(a.name)).map((r) => [r.month, r.balance]) : null;
      to.forEach((t) => { (want[t] = want[t] || []).push({ key: `${src}|acct|${keyA(a.name)}`, owner: a.owner || '', name: a.name, kind: a.kind, type: a.type || '', balance: a.bal.balance, asOf: a.bal.month || '', history: hist }); }); });
    (prefGet('assets', []) || []).forEach((x) => (x.shareTo || []).forEach((t) => { (want[t] = want[t] || []).push({ key: `${src}|asset|${keyA(x.name)}`, owner: '', name: x.name, kind: 'asset', type: x.type || 'other', balance: Math.round(assetNow(x)), asOf: new Date().toLocaleDateString('en-CA').slice(0, 7), history: null }); }));
    const targets = [...new Set([...Object.keys(want), ...shareTargets().map((b) => b.id)])];
    const sig = JSON.stringify([src, targets.map((t) => [t, want[t] || []])]); if (sig === pubSig) return; pubSig = sig;
    clearTimeout(pubTimer); pubTimer = setTimeout(async () => {
      for (const t of targets) {
        try {
          const r = await FDStore.fetch(`/api/books/${encodeURIComponent(t)}/shares-list`, {}); if (!r.ok) continue;
          const have = (await r.json()).filter((d) => d.src === src), wl = want[t] || [];
          for (const w of wl) {
            const old = have.filter((d) => d.key === w.key), prev = old[0];
            let history = w.history; if (history && prev && prev.history) { const m = new Map(prev.history); history.forEach(([k, v]) => m.set(k, v)); history = [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])); }
            const doc = { ...w, history, src, srcLabel: book() };
            if (prev && old.length === 1 && prev.balance === doc.balance && prev.asOf === doc.asOf && prev.name === doc.name && JSON.stringify(prev.history || null) === JSON.stringify(doc.history || null)) continue;
            const pr = await FDStore.fetch(`/api/books/${encodeURIComponent(t)}/shares`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(doc) });
            if (pr.ok) for (const o of old) await FDStore.fetch(`/api/books/${encodeURIComponent(t)}/shares/${encodeURIComponent(o.id)}`, { method: 'DELETE' });
          }
          for (const d of have.filter((d) => !wl.some((w) => w.key === d.key))) await FDStore.fetch(`/api/books/${encodeURIComponent(t)}/shares/${encodeURIComponent(d.id)}`, { method: 'DELETE' });
        } catch {}
      }
    }, 1500);
  });

  // receiving side: values shared into this dashboard
  const SH_VIEWS = [['cash', 'Cash & investments tile'], ['inv', 'Investments chart'], ['nw', 'Net worth (tile, ring and chart)']];
  const shIncl = (d) => ({ cash: true, inv: true, nw: true, ...((prefGet('shareIncl', {}) || {})[d.key] || {}) });
  const sharedIn = () => { const seen = new Map(); rows('shares').filter((d) => d.book === book()).forEach((d) => { const p = seen.get(d.key); if (!p || String(d.createdAt) > String(p.createdAt)) seen.set(d.key, d); }); return [...seen.values()]; };
  const sharedSum = (kinds, view) => sharedIn().filter((d) => kinds.includes(d.kind) && shIncl(d)[view]).reduce((t, d) => t + (Number(d.balance) || 0), 0);
  const sharedAt = (kinds, view, month) => sharedIn().filter((d) => kinds.includes(d.kind) && shIncl(d)[view] && d.history).reduce((t, d) => { const h = d.history.filter((x) => x[0] <= month).pop(); return t + (h ? h[1] : 0); }, 0);
  let shOpen = null;
  dash.draw('sharedView', (el) => {
    if (st('prefs') !== 'ok') return;
    el.replaceChildren(); const sec = el.closest('section'); const list = sharedIn();
    if (sec) sec.classList.toggle('fd-none', !list.length);
    if (!list.length) return;
    const KN = { deposit: 'Checking & savings', investment: 'Investments & retirement', asset: 'Home, vehicles & other', credit: 'Credit cards', mortgage: 'Mortgage', loan: 'Loans' };
    const own = acctList(), ownAssets = prefGet('assets', []) || [];
    const dups = list.filter((d) => (d.kind === 'asset' ? ownAssets.some((a) => keyA(a.name) === keyA(d.name)) : own.some((a) => keyA(a.name) === keyA(d.name))));
    if (dups.length) {
      const w = document.createElement('div'); w.className = 'fd-rb fd-dup';
      const h = document.createElement('p'); h.className = 'fd-rb-h'; h.textContent = `Possible duplicates: ${dups.length} shared ${dups.length === 1 ? 'value is' : 'values are'} also entered on this dashboard, so ${dups.length === 1 ? 'it' : 'they'} may be counted twice.`; w.append(h);
      dups.forEach((d) => {
        const r = document.createElement('div'); r.className = 'fd-rb-row'; const t = document.createElement('span'); t.textContent = `${d.name} (shared from ${d.srcLabel}${d.owner ? ', ' + d.owner : ''})`;
        const rm = rbtn('Remove the copy here', async () => {
          if (!rm.dataset.sure) { rm.dataset.sure = '1'; rm.textContent = d.kind === 'asset' ? 'Yes, remove this dashboard’s copy' : 'Yes, remove it and its balances here'; return; }
          rm.disabled = true;
          try { const db0 = await db();
            if (d.kind === 'asset') { await prefSet('assets', ownAssets.filter((a) => keyA(a.name) !== keyA(d.name))); }
            else { const a = own.find((x) => keyA(x.name) === keyA(d.name)); const k = keyA(a.reg ? a.reg.match || a.reg.name : a.name);
              for (const b of rows('imports').filter((b) => b.book === book() && keyA(b.accountName) === k && !(b.txns || []).length)) await db0.doc('data/household/imports/' + b.id).delete();
              if (a.reg) await db0.doc('data/household/accounts/' + a.reg.id).delete(); }
          } catch { rm.disabled = false; rm.textContent = 'Couldn’t remove'; }
        });
        const keep = rbtn('Keep both', async () => { const ig = prefGet('dupIgnore', []) || []; await prefSet('dupIgnore', [...ig, d.key]); });
        if ((prefGet('dupIgnore', []) || []).includes(d.key)) return;
        r.append(t, rm, keep); w.append(r);
      });
      const n = document.createElement('p'); n.className = 'fd-note'; n.textContent = 'Removing deletes this dashboard’s entry and its recorded balances (imported statements with transactions are kept). The shared value stays.'; w.append(n);
      if (w.querySelectorAll('.fd-rb-row').length) el.append(w);
    }
    const t = document.createElement('table'); t.className = 'fd-table'; const tb = document.createElement('tbody');
    const hr = document.createElement('tr'); ['Account', 'From', 'Balance', 'As of', 'Counts in', ''].forEach((c, i) => { const th = document.createElement('th'); th.textContent = c; if (i < 2 || i === 4) th.className = 'fd-l'; hr.append(th); }); tb.append(hr);
    Object.entries(KN).forEach(([k, title]) => {
      const g = list.filter((d) => d.kind === k); if (!g.length) return;
      const gr = document.createElement('tr'); gr.className = 'fd-grp'; const gc = td(title, 'fd-l'); gc.colSpan = 6; gr.append(gc); tb.append(gr);
      g.forEach((d) => {
        const inc = shIncl(d), tr = document.createElement('tr'), debt = ['credit', 'mortgage', 'loan'].includes(d.kind);
        const nm = td('', 'fd-l'); const b = document.createElement('strong'); b.textContent = d.name; const sub = document.createElement('div'); sub.className = 'fd-zero fd-rsub'; sub.textContent = (d.type || '') + (d.history ? ' · history shared' : ''); nm.append(b, sub);
        const cs = td(SH_VIEWS.filter(([v]) => inc[v]).map(([, l]) => l.replace(/ \(.*\)| tile| chart/, '')).join(', ') || 'Nowhere', 'fd-l fd-zero');
        const gearC = td(''); const gb = document.createElement('button'); gb.type = 'button'; gb.className = 'fd-gear fd-gear-inline'; gb.textContent = '⚙'; gb.title = 'Choose where this counts'; gb.setAttribute('aria-label', 'Choose where ' + d.name + ' counts');
        gb.addEventListener('click', () => { shOpen = shOpen === d.key ? null : d.key; dash.draw('sharedView'); }); gearC.append(gb);
        tr.append(nm, td([d.owner, d.srcLabel].filter(Boolean).join(' · '), 'fd-l'), td((debt ? '−' : '') + money0(d.balance), debt ? 'fd-bad' : ''), td(d.asOf || '–', 'fd-zero'), cs, gearC); tb.append(tr);
        if (shOpen === d.key) {
          const er = document.createElement('tr'); const ec = document.createElement('td'); ec.colSpan = 6; const w = document.createElement('div'); w.className = 'fd-chkgrid fd-shopts';
          SH_VIEWS.forEach(([v, lab]) => { if (v === 'inv' && d.kind !== 'investment') return; const l = document.createElement('label'); l.className = 'fd-check'; const i = document.createElement('input'); i.type = 'checkbox'; i.checked = !!inc[v];
            i.addEventListener('change', async () => { const all = prefGet('shareIncl', {}) || {}; all[d.key] = { ...inc, [v]: i.checked }; await prefSet('shareIncl', all); }); l.append(i, ' ' + lab); w.append(l); });
          ec.append(w); er.append(ec); tb.append(er);
        }
      });
    });
    t.append(tb); const sc = document.createElement('div'); sc.className = 'fd-scroll'; sc.append(t); el.append(sc);
  });

  // ---- economy & household data (self-hosted): rates, inflation, energy, home prices, holidays, vehicle recalls ----
  let ECO = null, ecoState = 'idle';
  const loadEcon = async (force) => {
    if (ecoState === 'busy' || (ecoState === 'ok' && !force)) return; ecoState = 'busy';
    try { const r = await FDStore.fetch('/api/econ' + (force ? '?refresh=1' : ''), {}); if (!r.ok) throw 0; ECO = await r.json(); ecoState = 'ok'; } catch { ecoState = 'none'; }
    ['econView', 'healthRows', 'reviewHead', 'billRows', 'assetView'].forEach((d) => { try { dash.draw(d); } catch {} });
  };
  const ser = (src, id) => (ECO && ECO[src] && ECO[src][id] && ECO[src][id].obs && ECO[src][id].obs.length ? ECO[src][id] : null);
  const eLast = (s) => (s ? s.obs[s.obs.length - 1] : null);
  const atOrBefore = (s, d) => (s ? s.obs.filter((o) => o[0] <= d).pop() : null);
  const eYoy = (s) => { const l = eLast(s); if (!l) return null; const d = new Date(l[0].length === 7 ? l[0] + '-01' : l[0]); d.setFullYear(d.getFullYear() - 1); const p = atOrBefore(s, d.toISOString().slice(0, l[0].length)); return p && p[1] ? ((l[1] - p[1]) / p[1]) * 100 : null; };
  const VEH = {}, vehLoad = (vin) => { if (!vin || VEH[vin]) return VEH[vin] && VEH[vin].v; VEH[vin] = { v: null }; FDStore.fetch('/api/vehicle?vin=' + encodeURIComponent(vin), {}).then((r) => (r.ok ? r.json() : null)).then((v) => { VEH[vin].v = v; dash.draw('healthRows'); }).catch(() => {}); return null; };
  const econAlerts = () => {
    const out = []; if (ecoState === 'idle') loadEcon();
    const m30 = eLast(ser('fred', 'mort30')), tb = eLast(ser('fred', 'tbill3')) || eLast(ser('treasury', 'bills')), ib = eLast(ser('treasury', 'ibond'));
    for (const a of acctList()) {
      if (a.active === false || !(Number(a.rate) > 0)) continue;
      if (a.kind === 'mortgage' && m30 && Number(a.rate) - m30[1] >= 0.75) out.push({ lvl: 'info', text: `${a.name}: your ${a.rate}% rate is ${(Number(a.rate) - m30[1]).toFixed(2)} points above today’s ${m30[1].toFixed(2)}% average 30-year rate (Freddie Mac, ${m30[0]}). Refinancing may be worth pricing out.`, go: 'accounts' });
      if (a.kind === 'deposit' && /savings|hysa|money_market|cd|cash_mgmt/.test(a.type || '') && tb && tb[1] - Number(a.rate) >= 1 && a.bal && a.bal.balance > 1000) out.push({ lvl: 'info', text: `${a.name}: earning ${a.rate}% while 3-month Treasury bills pay ${tb[1].toFixed(2)}%. A high-yield savings account may pay more.`, go: 'accounts' });
    }
    for (const x of prefGet('assets', []) || []) {
      if (x.type === 'vehicle' && x.vin && x.vin.length === 17) { const v = vehLoad(x.vin); if (v && v.recalls && v.recalls.length) out.push({ lvl: 'warn', text: `${x.name}: NHTSA lists ${v.recalls.length} recall${v.recalls.length === 1 ? '' : 's'} for the ${v.year} ${v.make} ${v.model} (newest: ${v.recalls[0].component}). Check your VIN at nhtsa.gov/recalls to see if yours is affected.`, go: 'accounts' }); }
      if (x.type === 'home' && x.asOf) { const h = ser('fred', 'hpiIC') || ser('fred', 'hpiUS'), l = eLast(h), p = atOrBefore(h, x.asOf);
        if (l && p && p[1] && l[0] > p[0]) { const ch = ((l[1] - p[1]) / p[1]) * 100; if (Math.abs(ch) >= 3) out.push({ lvl: 'info', text: `${x.name}: ${h === ser('fred', 'hpiIC') ? 'Iowa City' : 'US'} home prices are ${ch > 0 ? 'up' : 'down'} ${Math.abs(ch).toFixed(1)}% since you valued it (${x.asOf}). At that rate it’s worth about ${money0(Number(x.value) * (1 + ch / 100))}; update the value under Accounts.`, go: 'accounts' }); } }
    }
    return out;
  };
  dash.draw('econView', (el) => {
    el.replaceChildren();
    if (ecoState === 'idle') { loadEcon(); return; }
    if (ecoState === 'busy' && !ECO) { el.textContent = 'Loading…'; return; }
    if (!ECO) { const p = document.createElement('p'); p.className = 'fd-note'; p.textContent = 'Economy data comes from the self-hosted app (FRED, BLS and EIA keys).'; el.append(p); return; }
    const tile2 = (label, s, fmt, sub, upBad = true) => { const l = eLast(s); if (!l) return null; const d = document.createElement('div'); d.className = 'fd-rtile';
      const a = document.createElement('div'); a.className = 'fd-zero'; a.textContent = label; const v = document.createElement('div'); v.className = 'fd-rval'; v.textContent = fmt(l[1]);
      const c = document.createElement('div'); c.className = 'fd-rsub'; const y = eYoy(s); if (sub) c.append(sub); else if (y != null) { const sp = document.createElement('span'); sp.className = (y > 0) === upBad ? 'fd-bad' : 'fd-good'; sp.textContent = `${y >= 0 ? '+' : '−'}${Math.abs(y).toFixed(1)}% vs a year ago`; c.append(sp); }
      const dt = document.createElement('div'); dt.className = 'fd-zero fd-rsub'; dt.textContent = 'as of ' + l[0]; d.append(a, v, c, dt); const sp2 = spark(s.obs.slice(-26).map((o) => o[1]), !upBad); if (sp2) d.append(sp2); return d; };
    const pct = (v) => v.toFixed(2) + '%', infl = (id, label) => { const s = ser('bls', id) || ser('fred', id); const y = eYoy(s); if (y == null) return null; const d = document.createElement('div'); d.className = 'fd-rtile'; const a = document.createElement('div'); a.className = 'fd-zero'; a.textContent = label; const v = document.createElement('div'); v.className = 'fd-rval ' + (y > 3 ? 'fd-bad' : ''); v.textContent = `${y >= 0 ? '+' : '−'}${Math.abs(y).toFixed(1)}%`; const c = document.createElement('div'); c.className = 'fd-zero fd-rsub'; c.textContent = `prices vs a year ago · ${eLast(s)[0]}`; d.append(a, v, c); return d; };
    const grp = (title, items, note) => { const it = items.filter(Boolean); if (!it.length) return; el.append(rhead(title)); const g = document.createElement('div'); g.className = 'fd-rtiles'; g.append(...it); el.append(g); if (note) { const n = document.createElement('p'); n.className = 'fd-note'; n.textContent = note; el.append(n); } };
    if (!PART('e-rate')) grp('Interest rates', [tile2('30-year mortgage', ser('fred', 'mort30'), pct), tile2('15-year mortgage', ser('fred', 'mort15'), pct), tile2('3-month T-bill', ser('fred', 'tbill3'), pct, null, false), tile2('10-year Treasury', ser('fred', 't10'), pct), tile2('Fed funds', ser('fred', 'fedfunds'), pct)], 'Mortgage rates are Freddie Mac weekly averages. T-bill yield is a good yardstick for what savings accounts should pay.');
    if (!PART('e-treas')) grp('Treasury savings options', [tile2('I bonds bought now', ser('treasury', 'ibond'), pct, (() => { const ib = ECO.treasury && ECO.treasury.ibond; if (!ib || ib.fixed == null) return null; const sp = document.createElement('span'); sp.textContent = `${ib.fixed.toFixed(2)}% fixed + inflation part · resets every 6 months`; return sp; })(), false),
      tile2('Treasury bills (avg)', ser('treasury', 'bills'), pct, null, false), tile2('Treasury notes (avg)', ser('treasury', 'notes'), pct, null, false), tile2('TIPS (avg)', ser('treasury', 'tips'), pct, null, false)],
      'From the U.S. Treasury (no key needed). I bonds and Treasury bills/notes are bought at TreasuryDirect.gov or through a brokerage; I bonds must be held at least a year.');
    if (!PART('e-fx') && ECO.fx && ECO.fx.rates) { el.append(rhead(`Exchange rates · ${ECO.fx.date}`)); const w = document.createElement('div'); w.className = 'fd-rb-row';
      const amt = document.createElement('input'); amt.type = 'number'; amt.value = 100; amt.className = 'fd-in'; amt.style.maxWidth = '8em'; const from = document.createElement('select'), to = document.createElement('select'); [from, to].forEach((x) => { x.className = 'dash-select'; ['USD', ...Object.keys(ECO.fx.rates).sort()].forEach((c) => x.append(new Option(c, c))); }); from.value = 'USD'; to.value = 'EUR';
      const outp = document.createElement('b'); const calc = () => { const r = (c) => (c === 'USD' ? 1 : ECO.fx.rates[c]); const v = (Number(amt.value) || 0) / r(from.value) * r(to.value); outp.textContent = `= ${v.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${to.value}`; };
      [amt, from, to].forEach((x) => x.addEventListener('input', calc)); calc(); w.append(amt, from, document.createTextNode('→'), to, outp); el.append(w);
      const n = document.createElement('p'); n.className = 'fd-note'; n.textContent = 'European Central Bank reference rates (via Frankfurter), updated each working day. Your card\u2019s rate and fees will differ a little. Trips you tag can show their total in another currency under Expenses → Tags.'; el.append(n); }
    if (!PART('e-cal') && (ECO.calendar || []).length) { el.append(rhead('Economic calendar · next few weeks'));
      const tb = document.createElement('table'); tb.className = 'fd-table'; ECO.calendar.slice(0, 14).forEach((c) => { const d = new Date(c.date + 'T12:00:00'); const tr = document.createElement('tr'); tr.append(td(d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }), 'fd-l'), td(c.name, 'fd-l'), td(c.full, 'fd-l fd-zero')); tb.append(tr); });
      const sc = document.createElement('div'); sc.className = 'fd-scroll'; sc.append(tb); el.append(sc);
      const n = document.createElement('p'); n.className = 'fd-note'; n.textContent = 'Release dates from FRED. Inflation, jobs and Fed announcements are the ones most likely to move markets and loan rates.'; el.append(n); }
    if (!PART('e-infl')) grp('Inflation (price change over 12 months)', [infl('cpi', 'US, all items'), infl('cpiMW', 'Midwest, all items'), infl('foodHomeMW', 'Groceries'), infl('diningMW', 'Restaurants'), infl('energyMW', 'Energy'), infl('gasMW', 'Gasoline'), infl('shelterMW', 'Shelter')], 'Midwest figures from the Bureau of Labor Statistics. Compare with how your own spending in each category changed.');
    if (!PART('e-ener')) grp('Energy & housing', [tile2('Midwest gas ($/gal)', ser('eia', 'gas'), (v) => '$' + v.toFixed(2)), tile2('Iowa home electricity', ser('eia', 'elec'), (v) => v.toFixed(1) + '¢/kWh'), infl('hpiIC', 'Iowa City home prices')]);
    const nh = ((ECO.holidays || []).filter((h) => h[0] >= new Date().toISOString().slice(0, 10))[0]); if (nh) { const p = document.createElement('p'); p.className = 'fd-note'; p.textContent = `Next bank holiday: ${nh[1]} (${nh[0]}). Bills due that day usually post the next business day.`; el.append(p); }
    const foot = document.createElement('div'); foot.className = 'fd-rb-row'; const u = document.createElement('span'); u.className = 'fd-zero'; u.textContent = `Updated ${new Date(ECO.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · refreshes daily`; foot.append(u, rbtn('Refresh', () => { ecoState = 'idle'; loadEcon(true); })); el.append(foot);
    if ((ECO.errors || []).length) { const dt = document.createElement('details'); const sm = document.createElement('summary'); sm.textContent = `Data check: ${ECO.errors.length} item${ECO.errors.length === 1 ? '' : 's'} unavailable`; dt.append(sm); ECO.errors.forEach((e) => { const p = document.createElement('div'); p.className = 'fd-note'; p.textContent = e.replace(/api_key=\w+|registrationkey\W+\w+/g, ''); dt.append(p); }); el.append(dt); }
  });

  // ---- manual entries ----
  dash.draw('manualRows', (el) => {
    el.replaceChildren();
    if (st('manual') !== 'ok') return;
    const r = rows('manual').filter((x) => x.book === book()).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    if (!r.length) return empty(el, 6, 'No manual entries yet.');
    for (const x of r) {
      const tr = document.createElement('tr'); tr.dataset.key = enc(x.id);
      tr.append(td(x.date || ''), td(x.type === 'income' ? 'Income' : 'Expense', 'fd-l'), td(x.vendor || '', 'fd-l'), td(x.category || '', 'fd-l'), td(money2(Number(x.amount))));
      const c = document.createElement('td'); const b = document.createElement('button');
      b.type = 'button'; b.className = 'fd-btn fd-quiet fd-sm'; b.textContent = 'Remove';
      b.addEventListener('click', async () => { b.disabled = true; try { const d = await db(); await d.doc('data/household/manual/' + x.id).delete(); } catch { b.disabled = false; b.textContent = 'Not removed'; } });
      c.append(b); tr.append(c); el.append(tr);
    }
  });

  // ---- saved imports ----
  dash.draw('importRows', (el) => {
    el.replaceChildren();
    if (st('imports') !== 'ok') return;
    const r = rows('imports').slice().sort((a, b) => String(b.importedAt).localeCompare(String(a.importedAt)));
    if (!r.length) return empty(el, 8, 'Nothing imported yet. Use the forms above to add your first statement.');
    for (const x of r) {
      const tr = document.createElement('tr'); tr.dataset.key = enc(x.id);
      tr.append(td(String(x.importedAt || '').slice(0, 10)), td(x.book, 'fd-l'), td(x.accountName || '', 'fd-l'), td(x.fileName || '—', 'fd-l'),
        td(String(x.rowCount ?? 0)), td(x.balance == null || x.balance === '' ? '—' : money2(Number(x.balance))), td(x.balanceMonth || '—'));
      const c = document.createElement('td'); const b = document.createElement('button');
      b.type = 'button'; b.className = 'fd-btn fd-quiet fd-sm'; b.textContent = 'Remove';
      b.addEventListener('click', async () => { b.disabled = true; try { const d = await db(); await d.doc('data/household/imports/' + x.id).delete(); } catch { b.disabled = false; b.textContent = 'Not removed'; } });
      c.append(b); tr.append(c); el.append(tr);
    }
  });
})();
