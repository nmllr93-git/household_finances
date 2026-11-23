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
      lostBanner(false);
    } catch (e) {
      for (const id of RAW) { S.status[id] = 'error'; S.error[id] = e.message; }
      if (e instanceof TypeError && !window.FD_LOCAL) lostBanner(true); // network failure: the host can't be reached
    }
    S.version++; schedule();
  }
  // Connection lost while the dashboard is open: one plain banner, retried automatically
  let lostT = null;
  function lostBanner(on) {
    let b = document.getElementById('fd-lost');
    if (!on) { if (b) b.remove(); clearInterval(lostT); lostT = null; return; }
    if (!b) {
      b = document.createElement('div'); b.id = 'fd-lost'; b.setAttribute('role', 'alert');
      b.style.cssText = 'position:sticky;top:0;z-index:50;background:#7a2e1f;color:#fff;padding:10px 14px;font-size:14px;line-height:1.4';
      const t = document.createElement('div'); t.innerHTML = '<b>Can’t reach your computer right now.</b> It may be asleep or turned off, Larenest may be closed on it, or this device left your home Wi-Fi (away from home, turn on Tailscale). Trying again on its own…';
      const r = document.createElement('button'); r.type = 'button'; r.textContent = 'Try again now'; r.style.cssText = 'margin:8px 8px 0 0;font:inherit;padding:4px 10px;border-radius:6px;border:0;cursor:pointer';
      r.addEventListener('click', () => load(S.bookId)); b.append(t, r);
      if (window.Capacitor && !window.FDApp) { const h = document.createElement('a'); h.textContent = 'Connection help'; h.style.color = '#fff'; h.href = 'https://localhost/?failed=' + encodeURIComponent(location.origin); b.append(h); }
      document.body.prepend(b);
    }
    if (!lostT) { lostT = setInterval(() => { if (navigator.onLine !== false) load(S.bookId); }, 20000); window.addEventListener('online', () => load(S.bookId), { once: true }); }
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

  // Redraw on width changes only: a phone keyboard opening changes the height, and redrawing then would replace the
  // box being typed in (closing the keyboard). If something is being edited, wait until it loses focus.
  let rt, lastW = window.innerWidth;
  const typing = () => { const a = document.activeElement; return !!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'checkbox' && a.type !== 'radio'); };
  window.addEventListener('resize', () => { if (window.innerWidth === lastW) return; clearTimeout(rt); rt = setTimeout(function go() { if (typing()) { document.activeElement.addEventListener('blur', () => { lastW = window.innerWidth; schedule(); }, { once: true }); return; } lastW = window.innerWidth; schedule(); }, 150); });
})();
