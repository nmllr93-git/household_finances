// Shared drawing helpers (line charts, bars, tooltips, formatting).
(function () {
  const money0 = (v) => (v == null || !isFinite(v) ? '—' : (v < 0 ? '−$' : '$') + Math.abs(Math.round(v)).toLocaleString('en-US'));
  const money2 = (v) => (window.FD_NOCENTS ? money0(v) : v == null || !isFinite(v) ? '—' : (v < 0 ? '−$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const short = (v) => {
    const a = Math.abs(v);
    const s = a >= 1e6 ? (a / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : a >= 1e4 ? Math.round(a / 1e3) + 'k' : a >= 1e3 ? (a / 1e3).toFixed(1).replace(/\.0$/, '') + 'k' : String(Math.round(a));
    return (v < 0 ? '−$' : '$') + s;
  };
  const enc = (s) => String(s).replace(/%/g, '%25').replace(/&/g, '%26').replace(/=/g, '%3D');
  const every = (n, plotW, minPx = 46) => Math.max(1, Math.ceil((n * minPx) / Math.max(1, plotW)));
  const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function placeholder(el, status, msg) {
    el.replaceChildren();
    const p = document.createElement('p');
    p.className = 'fd-empty';
    p.textContent = status === 'error' ? 'Failed to load' : status === 'loading' || status === 'connect' ? '' : msg || 'Nothing to show yet';
    if (status === 'loading') el.classList.add('dash-skeleton'); else el.classList.remove('dash-skeleton');
    el.append(p);
  }

  function measure(svg, texts, cls) {
    let w = 0;
    for (const t of texts) {
      const n = svg.append('text').attr('class', cls).text(t);
      w = Math.max(w, n.node().getComputedTextLength() || t.length * 7);
      n.remove();
    }
    return w;
  }

  // series: [{name, color, dashed, points: [{label, v (number|null), note}]}], labels: [..]
  function lineChart(el, { series, labels, zero = true, height = 240, aria, fmt = money0 }) {
    el.classList.remove('dash-skeleton');
    el.replaceChildren();
    const width = Math.max(260, el.clientWidth || 600);
    const wrap = d3.select(el).append('div').attr('class', 'fd-chart');
    const svg = wrap.append('svg').attr('width', '100%').attr('height', height).attr('viewBox', `0 0 ${width} ${height}`)
      .attr('role', 'img').attr('aria-label', aria || 'Line chart');
    const vals = series.flatMap((s) => s.points.map((p) => p.v)).filter((v) => v != null && isFinite(v));
    let lo = d3.min(vals) ?? 0, hi = d3.max(vals) ?? 1;
    if (zero) lo = Math.min(0, lo);
    else { const pad = (hi - lo) * 0.15 || Math.abs(hi) * 0.05 || 1; lo = lo >= 0 ? Math.max(0, lo - pad) : lo - pad; hi += pad; }
    if (lo === hi) hi = lo + 1;
    const y = d3.scaleLinear().domain([lo, hi]).nice(5);
    const ticks = y.ticks(width < 420 ? 4 : 5);
    const left = measure(svg, ticks.map(short), 'fd-tick') + 10;
    const m = { t: 12, r: 16, b: 26, l: left };
    y.range([height - m.b, m.t]);
    const x = d3.scalePoint().domain(labels).range([m.l, width - m.r]).padding(0.3);
    const g = svg.append('g');
    g.selectAll('line.fd-grid').data(ticks).join('line').attr('class', 'fd-grid')
      .attr('x1', m.l).attr('x2', width - m.r).attr('y1', (d) => y(d)).attr('y2', (d) => y(d));
    g.selectAll('text.fd-ytick').data(ticks).join('text').attr('class', 'fd-tick fd-ytick')
      .attr('x', m.l - 8).attr('y', (d) => y(d)).attr('dy', '0.32em').attr('text-anchor', 'end').text(short);
    const k = every(labels.length, width - m.l - m.r);
    g.selectAll('text.fd-xtick').data(labels.filter((d, i) => (labels.length - 1 - i) % k === 0)).join('text').attr('class', 'fd-tick fd-xtick')
      .attr('x', (d) => x(d)).attr('y', height - 6).attr('text-anchor', 'middle').text((d) => d);
    const line = d3.line().defined((p) => p.v != null && isFinite(p.v)).x((p) => x(p.label)).y((p) => y(p.v));
    series.forEach((s, i) => {
      const color = s.color || dash.colors[i % dash.colors.length];
      const path = svg.append('path').attr('d', line(s.points)).attr('fill', 'none').style('stroke', color)
        .attr('stroke-width', 2.25).attr('stroke-linejoin', 'round');
      if (s.dashed) path.attr('stroke-dasharray', '5 4');
      if (!reduced() && !el.dataset.fdPlayed) {
        const L = path.node().getTotalLength ? path.node().getTotalLength() : 0;
        if (L) path.attr('stroke-dasharray', `${L} ${L}`).attr('stroke-dashoffset', L).transition().duration(700).attr('stroke-dashoffset', 0)
          .on('end', () => path.attr('stroke-dasharray', s.dashed ? '5 4' : null));
      }
      svg.append('g').selectAll('circle').data(s.points.filter((p) => p.v != null && isFinite(p.v))).join('circle')
        .attr('cx', (p) => x(p.label)).attr('cy', (p) => y(p.v)).attr('r', (p) => (p.note ? 4.5 : labels.length > 18 ? 0 : 3))
        .style('fill', (p) => (p.note ? 'var(--color-bg)' : color)).style('stroke', color).attr('stroke-width', 1.5);
    });
    if (vals.length) el.dataset.fdPlayed = '1';
    // legend
    const leg = d3.select(el).append('div').attr('class', 'fd-legend');
    series.forEach((s, i) => {
      const it = leg.append('span').attr('class', 'fd-leg');
      it.append('i').style('background', s.color || dash.colors[i % dash.colors.length]);
      it.append('span').text(s.name);
    });
    // tooltip
    const tip = d3.select(el).append('div').attr('class', 'fd-tip').attr('hidden', true);
    const guide = svg.append('line').attr('class', 'fd-guide').attr('y1', m.t).attr('y2', height - m.b).style('opacity', 0);
    const show = (ev) => {
      const [mx] = d3.pointer(ev, svg.node());
      const sx = mx * (width / svg.node().getBoundingClientRect().width || 1);
      const lab = labels.reduce((b, l) => (Math.abs(x(l) - sx) < Math.abs(x(b) - sx) ? l : b), labels[0]);
      guide.attr('x1', x(lab)).attr('x2', x(lab)).style('opacity', 1);
      tip.attr('hidden', null);
      tip.selectAll('*').remove();
      tip.append('div').attr('class', 'fd-tip-h').text(lab);
      series.forEach((s, i) => {
        const p = s.points.find((q) => q.label === lab);
        const r = tip.append('div').attr('class', 'fd-tip-r');
        r.append('i').style('background', s.color || dash.colors[i % dash.colors.length]);
        r.append('span').text(s.name);
        r.append('b').text(p && p.v != null ? fmt(p.v) + (p.note ? ` (${p.note})` : '') : '—');
      });
      const box = el.getBoundingClientRect(), tw = tip.node().offsetWidth;
      const px = ev.clientX - box.left;
      tip.style('left', Math.min(Math.max(0, px + 12), box.width - tw) + 'px').style('top', '8px');
    };
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', width - m.l - m.r).attr('height', height - m.t - m.b)
      .attr('fill', 'transparent').on('pointermove', show).on('pointerdown', show)
      .on('pointerleave', () => { tip.attr('hidden', true); guide.style('opacity', 0); });
  }

  // groups: [{label, values: [{name, v, color}]}]
  function groupedBars(el, { groups, height = 240, aria, fmt = money0 }) {
    el.classList.remove('dash-skeleton');
    el.replaceChildren();
    const width = Math.max(260, el.clientWidth || 600);
    const svg = d3.select(el).append('div').attr('class', 'fd-chart').append('svg').attr('width', '100%').attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`).attr('role', 'img').attr('aria-label', aria || 'Bar chart');
    const names = groups[0] ? groups[0].values.map((v) => v.name) : [];
    const hi = d3.max(groups.flatMap((g) => g.values.map((v) => v.v))) || 1;
    const y = d3.scaleLinear().domain([0, hi]).nice(4);
    const ticks = y.ticks(4);
    const left = measure(svg, ticks.map(short), 'fd-tick') + 10;
    const m = { t: 12, r: 8, b: 26, l: left };
    y.range([height - m.b, m.t]);
    const x0 = d3.scaleBand().domain(groups.map((g) => g.label)).range([m.l, width - m.r]).paddingInner(0.25).paddingOuter(0.1);
    const x1 = d3.scaleBand().domain(names).range([0, x0.bandwidth()]).padding(0.08);
    svg.selectAll('line.fd-grid').data(ticks).join('line').attr('class', 'fd-grid').attr('x1', m.l).attr('x2', width - m.r).attr('y1', (d) => y(d)).attr('y2', (d) => y(d));
    svg.selectAll('text.fd-ytick').data(ticks).join('text').attr('class', 'fd-tick fd-ytick').attr('x', m.l - 8).attr('y', (d) => y(d)).attr('dy', '0.32em').attr('text-anchor', 'end').text(short);
    const kk = every(groups.length, width - m.l - m.r);
    svg.selectAll('text.fd-xtick').data(groups.filter((g, i) => (groups.length - 1 - i) % kk === 0)).join('text').attr('class', 'fd-tick fd-xtick').attr('x', (g) => x0(g.label) + x0.bandwidth() / 2).attr('y', height - 6).attr('text-anchor', 'middle').text((g) => g.label);
    const tip = d3.select(el).append('div').attr('class', 'fd-tip').attr('hidden', true);
    const gs = svg.append('g').selectAll('g').data(groups).join('g').attr('transform', (g) => `translate(${x0(g.label)},0)`);
    gs.selectAll('rect').data((g) => g.values.map((v) => ({ ...v, g }))).join('rect')
      .attr('x', (d) => x1(d.name)).attr('width', x1.bandwidth()).attr('y', (d) => y(Math.max(0, d.v))).attr('height', (d) => Math.abs(y(0) - y(Math.max(0, d.v))))
      .attr('rx', 2).style('fill', (d, i) => d.color || dash.colors[i % dash.colors.length]);
    gs.append('rect').attr('width', x0.bandwidth()).attr('y', m.t).attr('height', height - m.t - m.b).attr('fill', 'transparent')
      .on('pointermove pointerdown', (ev, g) => {
        tip.attr('hidden', null); tip.selectAll('*').remove();
        tip.append('div').attr('class', 'fd-tip-h').text(g.label);
        g.values.forEach((v, i) => { const r = tip.append('div').attr('class', 'fd-tip-r'); r.append('i').style('background', v.color || dash.colors[i]); r.append('span').text(v.name); r.append('b').text(fmt(v.v)); });
        (g.extra || []).forEach((t) => tip.append('div').attr('class', 'fd-tip-n').text(t));
        const box = el.getBoundingClientRect(), tw = tip.node().offsetWidth;
        tip.style('left', Math.min(Math.max(0, ev.clientX - box.left + 12), box.width - tw) + 'px').style('top', '8px');
      }).on('pointerleave', () => tip.attr('hidden', true));
    const leg = d3.select(el).append('div').attr('class', 'fd-legend');
    names.forEach((n, i) => { const it = leg.append('span').attr('class', 'fd-leg'); it.append('i').style('background', (groups[0].values[i].color) || dash.colors[i]); it.append('span').text(n); });
  }

  // rows: [{label, actual, planned, key}] horizontal bars with planned tick
  function budgetBars(el, { rows, aria, source }) {
    el.classList.remove('dash-skeleton');
    el.replaceChildren();
    const width = Math.max(260, el.clientWidth || 600);
    const rowH = 30, m = { t: 6, r: 70, b: 6 };
    const height = m.t + m.b + rows.length * rowH;
    const svg = d3.select(el).append('div').attr('class', 'fd-chart').append('svg').attr('width', '100%').attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`).attr('role', 'img').attr('aria-label', aria || 'Budget bars');
    m.l = Math.min(width * 0.4, measure(svg, rows.map((r) => r.label), 'fd-tick fd-cat') + 12);
    const hi = d3.max(rows, (r) => Math.max(r.actual, r.planned, r.projected || 0)) || 1;
    const x = d3.scaleLinear().domain([0, hi]).range([m.l, width - m.r]);
    const g = svg.selectAll('g').data(rows).join('g').attr('transform', (r, i) => `translate(0,${m.t + i * rowH})`);
    g.append('text').attr('class', 'fd-tick fd-cat').attr('x', m.l - 8).attr('y', rowH / 2).attr('dy', '0.32em').attr('text-anchor', 'end').text((r) => r.label);
    g.filter((r) => r.projected > r.actual).append('rect').attr('class', 'fd-proj').attr('x', m.l).attr('y', 7).attr('height', rowH - 14).attr('rx', 2)
      .attr('width', (r) => Math.max(1, x(r.projected) - m.l));
    g.append('rect').attr('x', m.l).attr('y', 7).attr('height', rowH - 14).attr('rx', 2).attr('width', (r) => Math.max(1, x(r.actual) - m.l))
      .style('fill', (r) => (r.planned > 0 && r.actual > r.planned ? 'var(--cds-chart-status-critical)' : dash.colors[0]));
    g.filter((r) => r.planned > 0).append('line').attr('class', 'fd-plan').attr('x1', (r) => x(r.planned)).attr('x2', (r) => x(r.planned)).attr('y1', 3).attr('y2', rowH - 3);
    g.append('text').attr('class', 'fd-tick fd-val').attr('x', (r) => Math.max(x(r.actual), r.planned ? x(r.planned) : 0) + 6).attr('y', rowH / 2).attr('dy', '0.32em')
      .attr('data-source', source).attr('data-field', 'actual').attr('data-where', (r) => 'key=' + enc(r.key)).text((r) => money0(r.actual));
    const tip = d3.select(el).append('div').attr('class', 'fd-tip').attr('hidden', true);
    g.append('rect').attr('x', 0).attr('width', width).attr('height', rowH).attr('fill', 'transparent')
      .on('pointermove pointerdown', (ev, r) => {
        tip.attr('hidden', null); tip.selectAll('*').remove();
        tip.append('div').attr('class', 'fd-tip-h').text(r.label);
        tip.append('div').attr('class', 'fd-tip-r').text(`Spent ${money2(r.actual)}`);
        tip.append('div').attr('class', 'fd-tip-r').text(r.planned ? `${r.carry ? `Available ${money0(r.planned)} + ${money0(r.carry)} rolled over` : `Planned ${money0(r.planned)}`} · ${r.actual > r.planned ? money0(r.actual - r.planned) + ' over' : money0(r.planned - r.actual) + ' left'}` : 'No plan set');
        if (r.projected !== null && r.projected !== undefined) tip.append('div').attr('class', 'fd-tip-n').text(`At this pace: about ${money0(r.projected)} by month end`);
        const box = el.getBoundingClientRect(), tw = tip.node().offsetWidth;
        tip.style('left', Math.min(Math.max(0, ev.clientX - box.left + 12), box.width - tw) + 'px').style('top', (ev.clientY - box.top + 12) + 'px');
      }).on('pointerleave', () => tip.attr('hidden', true));
  }

  // labels: [...], series: [{name, color, values: [...] }], onPick(name)
  function stackedBars(el, { labels, series, aria, onPick, height = 260 }) {
    el.classList.remove('dash-skeleton');
    el.replaceChildren();
    const width = Math.max(260, el.clientWidth || 600);
    const svg = d3.select(el).append('div').attr('class', 'fd-chart').append('svg').attr('width', '100%').attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`).attr('role', 'img').attr('aria-label', aria || 'Stacked bar chart');
    const totals = labels.map((_, i) => series.reduce((s, x) => s + Math.max(0, x.values[i] || 0), 0));
    const y = d3.scaleLinear().domain([0, d3.max(totals) || 1]).nice(4);
    const ticks = y.ticks(4);
    const m = { t: 12, r: 8, b: 26, l: measure(svg, ticks.map(short), 'fd-tick') + 10 };
    y.range([height - m.b, m.t]);
    const x = d3.scaleBand().domain(labels).range([m.l, width - m.r]).paddingInner(0.22).paddingOuter(0.08);
    svg.selectAll('line.fd-grid').data(ticks).join('line').attr('class', 'fd-grid').attr('x1', m.l).attr('x2', width - m.r).attr('y1', (d) => y(d)).attr('y2', (d) => y(d));
    svg.selectAll('text.fd-ytick').data(ticks).join('text').attr('class', 'fd-tick fd-ytick').attr('x', m.l - 8).attr('y', (d) => y(d)).attr('dy', '0.32em').attr('text-anchor', 'end').text(short);
    const k = every(labels.length, width - m.l - m.r);
    svg.selectAll('text.fd-xtick').data(labels.filter((d, i) => (labels.length - 1 - i) % k === 0)).join('text').attr('class', 'fd-tick fd-xtick')
      .attr('x', (d) => x(d) + x.bandwidth() / 2).attr('y', height - 6).attr('text-anchor', 'middle').text((d) => d);
    const color = (s, i) => s.color || dash.colors[i % dash.colors.length];
    labels.forEach((lab, i) => {
      let acc = 0;
      series.forEach((s, j) => {
        const v = Math.max(0, s.values[i] || 0); if (!v) return;
        svg.append('rect').attr('x', x(lab)).attr('width', x.bandwidth()).attr('y', y(acc + v)).attr('height', Math.max(0, y(acc) - y(acc + v)))
          .style('fill', color(s, j)).attr('class', onPick ? 'fd-pickable' : null).on('click', () => onPick && onPick(s.name));
        acc += v;
      });
    });
    const tip = d3.select(el).append('div').attr('class', 'fd-tip').attr('hidden', true);
    svg.append('g').selectAll('rect').data(labels).join('rect').attr('x', (d) => x(d)).attr('width', x.bandwidth()).attr('y', m.t).attr('height', height - m.t - m.b)
      .attr('fill', 'transparent').style('pointer-events', 'none');
    svg.on('pointermove', (ev) => {
      const [mx] = d3.pointer(ev, svg.node());
      const sx = mx * (width / svg.node().getBoundingClientRect().width || 1);
      const i = labels.findIndex((l) => sx >= x(l) - (x.step() * x.paddingInner()) / 2 && sx <= x(l) + x.bandwidth() + (x.step() * x.paddingInner()) / 2);
      if (i < 0) { tip.attr('hidden', true); return; }
      tip.attr('hidden', null); tip.selectAll('*').remove();
      tip.append('div').attr('class', 'fd-tip-h').text(`${labels[i]} · ${money0(totals[i])}`);
      series.map((s, j) => ({ s, j, v: s.values[i] || 0 })).filter((o) => o.v).sort((a, b) => b.v - a.v).forEach(({ s, j, v }) => {
        const r = tip.append('div').attr('class', 'fd-tip-r'); r.append('i').style('background', color(s, j)); r.append('span').text(s.name); r.append('b').text(money0(v));
      });
      const box = el.getBoundingClientRect(), tw = tip.node().offsetWidth;
      tip.style('left', Math.min(Math.max(0, ev.clientX - box.left + 12), box.width - tw) + 'px').style('top', '8px');
    }).on('pointerleave', () => tip.attr('hidden', true));
    const leg = d3.select(el).append('div').attr('class', 'fd-legend');
    series.forEach((s, j) => {
      const it = leg.append(onPick ? 'button' : 'span').attr('class', 'fd-leg' + (onPick ? ' fd-leg-btn' : ''));
      if (onPick) it.attr('type', 'button').on('click', () => onPick(s.name));
      it.append('i').style('background', color(s, j)); it.append('span').text(s.name);
    });
  }

  // A tiny trend line for table cells.
  function sparkline(td, values) {
    const w = 72, h = 20, n = values.length;
    const svg = d3.select(td).append('svg').attr('width', w).attr('height', h).attr('class', 'fd-spark').attr('aria-hidden', 'true');
    if (n < 2) return;
    const hi = d3.max(values) || 1;
    const x = (i) => 2 + (i * (w - 4)) / (n - 1), y = (v) => h - 2 - ((h - 4) * v) / hi;
    svg.append('path').attr('d', d3.line().x((v, i) => x(i)).y(y)(values)).attr('fill', 'none').style('stroke', dash.colors[0]).attr('stroke-width', 1.5);
    svg.append('circle').attr('cx', x(n - 1)).attr('cy', y(values[n - 1])).attr('r', 2).style('fill', dash.colors[0]);
  }

  // Charts are drawn to the width their box has at that moment. A box drawn while hidden (another tab) or before the
  // layout settled would stay narrow, so redraw once the box's width really changes.
  const RO = 'ResizeObserver' in window ? new ResizeObserver((list) => { for (const e of list) { const el = e.target, w = Math.round(e.contentRect.width), f = el._fdChart;
    if (!f || !w || Math.abs(w - (el._fdW || 0)) < 24) continue; el._fdW = w; clearTimeout(el._fdT); el._fdT = setTimeout(() => f[0](el, f[1]), 120); } }) : null;
  const fit = (fn) => function (el, opts) { if (el && RO) { if (!el._fdChart) RO.observe(el); el._fdChart = [fn, opts]; el._fdW = Math.round(el.clientWidth || 0); } return fn(el, opts); };
  lineChart = fit(lineChart); groupedBars = fit(groupedBars); stackedBars = fit(stackedBars); budgetBars = fit(budgetBars);
  window.FD = { money0, money2, short, enc, placeholder, lineChart, groupedBars, budgetBars, stackedBars, sparkline,
    book: () => window.FD_BOOK || (dash.params().book === 'Shared' ? 'Shared' : 'Personal') };
})();
