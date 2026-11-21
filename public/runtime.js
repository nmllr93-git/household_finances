// A small stand-in for the Claude dashboard runtime, so charts.js, calcs.js,
// page.js and import.js run here unchanged. It provides window.dash and
// window.claude.use('db'), backed by this app's own server.
(function () {
  const RAW = ['sheet_history', 'sheet_balances', 'sheet_budgets', 'imports', 'manual', 'edits', 'rules', 'budgets', 'accounts', 'goals', 'holdings', 'prefs', 'shares', 'receipts'];
  const S = {
    bookId: null, raw: {}, status: {}, error: {}, params: {}, version: 0,
    calcs: {}, cache: {}, draws: [], drawFns: {}, onData: [], pending: false,
  };

  function calcValue(id) {
    const c = S.calcs[id];
    const hit = S.cache[id];
    if (hit && hit.v === S.version) return hit.r;
    const ins = c.inputs.map((i) => dash.data(i));
    let r;
    const bad = ins.find((x) => x.status !== 'ok');
    if (bad) r = { status: bad.status === 'error' ? 'error' : 'loading', data: null };
    else {
      try { r = { status: 'ok', data: c.fn(...ins.map((x) => x.data)) }; }
      catch (e) { console.error(`Calculation "${id}" failed`, e); r = { status: 'error', data: null, message: String(e) }; }
    }
    S.cache[id] = { v: S.version, r };
    return r;
  }

  function render() {
    S.pending = false;
    for (const fn of S.onData) { try { fn(); } catch (e) { console.error(e); } }
    for (const name of S.draws) {
      for (const el of document.querySelectorAll(`[data-draw="${name}"]`)) {
        try { S.drawFns[name](el); } catch (e) { console.error(`Drawing "${name}" failed`, e); }
      }
    }
  }
  function schedule() { if (!S.pending) { S.pending = true; requestAnimationFrame(render); } }

  window.dash = {
    colors: ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)', 'var(--series-6)'],
    data(id) {
      if (S.calcs[id]) return calcValue(id);
      if (!(id in S.status)) return { status: 'missing', data: [] };
      return { status: S.status[id], data: S.status[id] === 'ok' ? S.raw[id] : [], message: S.error[id] };
    },
    calc(id, def) { S.calcs[id] = def; },
    loader() {},
    draw(name, fn) {
      if (fn === undefined) {
        if (S.drawFns[name]) for (const el of document.querySelectorAll(`[data-draw="${name}"]`)) {
          try { S.drawFns[name](el); } catch (e) { console.error(e); }
        }
        return;
      }
      const f = typeof fn === 'function' ? fn : (el) => (fn.update || fn.mount)(el);
      if (!S.drawFns[name]) S.draws.push(name);
      S.drawFns[name] = f;
    },
    onData(fn) { S.onData.push(fn); try { fn(); } catch (e) { console.error(e); } },
    params() { return { ...S.params }; },
    setParams(p) { for (const [k, v] of Object.entries(p)) { if (v === null || v === undefined) delete S.params[k]; else S.params[k] = v; } S.version++; schedule(); },
    resetParams() { S.params = {}; S.version++; schedule(); },
    setLink(name) { try { history.replaceState(null, '', '#' + name); } catch {} },
    refresh() { load(S.bookId); },
  };

  const api = (method, url, body) => window.FDStore.json(method, url, body);

  async function load(bookId) {
    S.bookId = bookId;
    for (const id of RAW) S.status[id] = 'loading';
    S.version++; schedule();
    try {
      const d = await api('GET', `/api/books/${encodeURIComponent(bookId)}/data`);
      if (S.bookId !== bookId) return;
      for (const id of RAW) { S.raw[id] = d[id] || []; S.status[id] = 'ok'; }
    } catch (e) {
      for (const id of RAW) { S.status[id] = 'error'; S.error[id] = e.message; }
    }
    S.version++; schedule();
  }

  const collOf = (p) => { const parts = String(p).split('/'); return parts[parts.length - 1]; };
  const dbShim = {
    collection(p) {
      return { async add(doc) {
        const r = await api('POST', `/api/books/${encodeURIComponent(S.bookId)}/${collOf(p)}`, doc);
        await load(S.bookId); return { id: r.id };
      } };
    },
    doc(p) {
      const parts = String(p).split('/');
      return { async delete() {
        await api('DELETE', `/api/books/${encodeURIComponent(S.bookId)}/${parts[parts.length - 2]}/${encodeURIComponent(parts[parts.length - 1])}`);
        await load(S.bookId);
      } };
    },
  };
  window.claude = { use: async (name) => (name === 'db' ? dbShim : null) };
  window.HF = { load, api, schedule, state: S };

  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(schedule, 150); });
})();
