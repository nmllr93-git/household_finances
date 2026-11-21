// Household Finances shared market & economy data: quotes, profiles, dividends, holding details,
// markets overview, economy (FRED/BLS/EIA/holidays) and vehicles (NHTSA). Used by BOTH the PC server
// and the phone's phone-only mode, so pacing and caching rules are identical everywhere.
//
// createMarketData(env) where env provides (each may return a Promise):
//   getJson(url) → parsed JSON (throw on HTTP errors)     getText(url) → text      postJson(url, body) → parsed JSON
//   keys() → { finnhub, fmp, fred, bls, eia }              keyNote() → hint shown when keys are missing
//   load(name) / save(name, obj) → persistent caches ('market', 'econ', 'sectors', and per-symbol caches 'c-…')
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FDMarket = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function createMarketData(env) {
    const { getJson, getText, postJson, load, save } = env;
    const apiKeys = () => env.keys();
    let KEYNOTE = '';
    const note = () => { KEYNOTE = env.keyNote ? env.keyNote() : ''; return KEYNOTE; };
    // small persistent key → { at, v } caches (saved shortly after changes; entries older than 8 days dropped)
    const caches = {};
    function cache(name) {
      const m = new Map(); let timer = null;
      const ready = Promise.resolve().then(() => load('c-' + name)).then((o) => { if (o) for (const [k, v] of Object.entries(o)) m.set(k, v); }).catch(() => {});
      const flush = () => { timer = null; const o = {}; const cut = Date.now() - 8 * 86400e3; for (const [k, v] of m) if (v && v.at > cut) o[k] = v; Promise.resolve().then(() => save('c-' + name, o)).catch(() => {}); };
      const c = { ready, get: (k) => m.get(k), set: (k, v) => { m.set(k, v); if (!timer) { timer = setTimeout(flush, 500); if (timer.unref) timer.unref(); } }, clear: () => { m.clear(); flush(); } };
      caches[name] = c; return c;
    }
    const keySig = () => { const k = apiKeys(); return (k.finnhub ? 'F' : '') + (k.fmp ? 'M' : ''); };
    function quoteSources() { const k = apiKeys(); return [k.finnhub && 'Finnhub', k.fmp && 'Financial Modeling Prep', 'Stooq'].filter(Boolean); }
    const QCACHE = cache('quotes'), PCACHE = cache('profiles'), QTTL = 60 * 60 * 1000, PTTL = 7 * 86400 * 1000;
    async function oneQuote(sym, k) {
      if (k.finnhub) {
        try { const j = await getJson(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${k.finnhub}`); if (j && j.c > 0) return { price: j.c, prevClose: j.pc || null, asOf: new Date((j.t || Date.now() / 1000) * 1000).toISOString(), source: 'Finnhub' }; } catch {}
      }
      if (k.fmp) {
        try { const j = await getJson(`https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(sym)}&apikey=${k.fmp}`); const x = Array.isArray(j) ? j[0] : null; if (x && x.price > 0) return { price: x.price, prevClose: x.previousClose || null, name: x.name || '', asOf: new Date((x.timestamp || Date.now() / 1000) * 1000).toISOString(), source: 'Financial Modeling Prep' }; } catch {}
      }
      try {
        const txt = await getText(`https://stooq.com/q/l/?s=${encodeURIComponent(sym.toLowerCase())}${sym.includes('.') ? '' : '.us'}&f=sd2t2ohlcvn&h&e=csv`);
        const line = String(txt).trim().split(/\r?\n/)[1] || '', c = line.split(',');
        const close = Number(c[6]), open = Number(c[3]);
        if (close > 0) return { price: close, prevClose: null, open: open > 0 ? open : null, name: (c[8] || '').replace(/"/g, ''), asOf: c[1] && c[1] !== 'N/D' ? c[1] : new Date().toISOString().slice(0, 10), source: 'Stooq' };
      } catch {}
      return null;
    }
    async function oneProfile(sym, k) {
      if (k.fmp) { try { const j = await getJson(`https://financialmodelingprep.com/stable/profile?symbol=${encodeURIComponent(sym)}&apikey=${k.fmp}`); const x = Array.isArray(j) ? j[0] : null; if (x) return { name: x.companyName || '', sector: x.sector || '', industry: x.industry || '' }; } catch {} }
      if (k.finnhub) { try { const j = await getJson(`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(sym)}&token=${k.finnhub}`); if (j && j.name) return { name: j.name, sector: j.finnhubIndustry || '', industry: j.finnhubIndustry || '' }; } catch {} }
      return null;
    }
    async function getQuotes(syms) {
      const k = apiKeys(), out = {}, nowT = Date.now();
      await Promise.all(syms.map(async (s) => {
        let q = QCACHE.get(s);
        if (!q || nowT - q.at > QTTL) { const v = await oneQuote(s, k); if (v) { q = { at: nowT, v }; QCACHE.set(s, q); } }
        let p = PCACHE.get(s);
        if ((k.fmp || k.finnhub) && (!p || nowT - p.at > PTTL)) { const v = await oneProfile(s, k); p = { at: nowT, v }; PCACHE.set(s, p); }
        if (q) out[s] = { ...q.v, ...(p && p.v ? { name: p.v.name || q.v.name, sector: p.v.sector, industry: p.v.industry } : {}) };
      }));
      return out;
    }

    // dividend history per share (FMP), cached a day per symbol: [{ date: ex-date, amount per share }]
    const DCACHE = cache('dividends');
    async function getDividends(syms) {
      const k = apiKeys(), out = {};
      if (!k.fmp) return out;
      for (const s of syms) {
        let c = DCACHE.get(s);
        if (!c || Date.now() - c.at > 86400e3) {
          try { const j = await getJson(`https://financialmodelingprep.com/stable/dividends?symbol=${encodeURIComponent(s)}&apikey=${k.fmp}`); const arr = Array.isArray(j) ? j : (j && j.historical) || []; c = { at: Date.now(), v: arr.slice(0, 60).map((x) => ({ date: x.date, amount: Number(x.adjDividend ?? x.dividend) || 0 })).filter((x) => x.amount > 0 && x.date) }; }
          catch { c = { at: Date.now(), v: [] }; }
          DCACHE.set(s, c);
        }
        out[s] = c.v;
      }
      return out;
    }

    // ---- per-holding detail (Finnhub + FMP), cached 6 hours: news, earnings, 52-week range, analyst view, ETF sectors ----
    const SCACHE = cache('stock');
    async function stockDetail(sym) {
      const c = SCACHE.get(sym); if (c && Date.now() - c.at < 6 * 3600e3) return c.v;
      const k = apiKeys(), v = { symbol: sym, news: [], earnings: null, range: null, rec: null, target: null, sectors: [], errors: [] };
      const d0 = new Date(), iso = (d) => d.toISOString().slice(0, 10), back = new Date(Date.now() - 10 * 864e5), fwd = new Date(Date.now() + 120 * 864e5);
      const fh = async (p, what) => { if (!k.finnhub) return null; try { return await getJson(`https://finnhub.io/api/v1/${p}${p.includes('?') ? '&' : '?'}token=${k.finnhub}`); } catch (e) { v.errors.push(`${what}: ${e.message}`); return null; } };
      const fm = async (p, what) => { if (!k.fmp) return null; try { return await getJson(`https://financialmodelingprep.com/stable/${p}${p.includes('?') ? '&' : '?'}apikey=${k.fmp}`); } catch (e) { v.errors.push(`${what}: ${e.message}`); return null; } };
      const news = await fh(`company-news?symbol=${sym}&from=${iso(back)}&to=${iso(d0)}`, 'News');
      if (Array.isArray(news)) v.news = news.slice(0, 5).map((n) => ({ headline: String(n.headline || '').slice(0, 200), source: n.source || '', url: /^https?:\/\//.test(n.url || '') ? n.url : '', at: n.datetime ? new Date(n.datetime * 1000).toISOString().slice(0, 10) : '' }));
      const met = await fh(`stock/metric?symbol=${sym}&metric=all`, '52-week range');
      if (met && met.metric) v.range = { hi: met.metric['52WeekHigh'] ?? null, lo: met.metric['52WeekLow'] ?? null, ytd: met.metric.yearToDatePriceReturnDaily ?? null };
      const rec = await fh(`stock/recommendation?symbol=${sym}`, 'Analyst ratings');
      if (Array.isArray(rec) && rec[0]) v.rec = { buy: (rec[0].strongBuy || 0) + (rec[0].buy || 0), hold: rec[0].hold || 0, sell: (rec[0].sell || 0) + (rec[0].strongSell || 0), period: rec[0].period };
      const ern = await fh(`calendar/earnings?symbol=${sym}&from=${iso(d0)}&to=${iso(fwd)}`, 'Earnings date');
      if (ern && Array.isArray(ern.earningsCalendar) && ern.earningsCalendar.length) { const e = ern.earningsCalendar.sort((a, b) => a.date.localeCompare(b.date))[0]; v.earnings = { date: e.date, when: e.hour || '', eps: e.epsEstimate ?? null }; }
      const tg = await fm(`price-target-consensus?symbol=${sym}`, 'Price target');
      if (Array.isArray(tg) && tg[0]) v.target = { mean: tg[0].targetConsensus ?? tg[0].targetMedian ?? null, hi: tg[0].targetHigh ?? null, lo: tg[0].targetLow ?? null };
      const sw = await fm(`etf/sector-weightings?symbol=${sym}`, 'ETF sectors');
      if (Array.isArray(sw)) v.sectors = sw.map((x) => ({ sector: x.sector, pct: Number(String(x.weightPercentage ?? x.weight ?? '').replace('%', '')) })).filter((x) => x.sector && x.pct > 0);
      SCACHE.set(sym, { at: Date.now(), v }); return v;
    }

    // ---- economy & household data: FRED, BLS, EIA (keys) and a few keyless sources; refreshed once a day, saved to a file ----
    let ECON = null;
    const FRED_SERIES = {
      mort30: ['MORTGAGE30US', '30-year mortgage rate', '%'], mort15: ['MORTGAGE15US', '15-year mortgage rate', '%'],
      tbill3: ['DTB3', '3-month Treasury bill', '%'], t10: ['DGS10', '10-year Treasury', '%'], fedfunds: ['FEDFUNDS', 'Fed funds rate', '%'],
      cpi: ['CPIAUCSL', 'Consumer prices (CPI, US)', 'index'], hpiIC: ['ATNHPIUS26980Q', 'Iowa City home price index (FHFA)', 'index'], hpiUS: ['USSTHPI', 'US home price index (FHFA)', 'index'],
    };
    const BLS_SERIES = { cpiMW: ['CUUR0200SA0', 'Midwest: all items'], foodHomeMW: ['CUUR0200SAF11', 'Midwest: groceries'], energyMW: ['CUUR0200SA0E', 'Midwest: energy'], gasMW: ['CUUR0200SETB01', 'Midwest: gasoline'], shelterMW: ['CUUR0200SAH1', 'Midwest: shelter'], diningMW: ['CUUR0200SEFV', 'Midwest: restaurants'] };
    async function buildEcon() {
      const k = apiKeys(), out = { at: Date.now(), fred: {}, bls: {}, eia: {}, holidays: [], errors: [] };
      const err = (w, e) => out.errors.push(`${w}: ${e && e.message ? e.message : e}`);
      if (k.fred) for (const [id, [sid, label, unit]] of Object.entries(FRED_SERIES)) {
        try { const j = await getJson(`https://api.stlouisfed.org/fred/series/observations?series_id=${sid}&api_key=${k.fred}&file_type=json&sort_order=desc&limit=60&observation_start=2015-01-01`);
          const obs = (j.observations || []).filter((o) => o.value !== '.' && isFinite(Number(o.value))).map((o) => [o.date, Number(o.value)]).sort((a, b) => a[0].localeCompare(b[0]));
          out.fred[id] = { label, unit, sid, obs }; } catch (e) { err('FRED ' + sid, e); }
        // economic calendar: upcoming release dates for the reports that move markets and rates
        try { const d0 = new Date().toISOString().slice(0, 10), d1 = new Date(Date.now() + 45 * 864e5).toISOString().slice(0, 10);
          const j = await getJson(`https://api.stlouisfed.org/fred/releases/dates?api_key=${k.fred}&file_type=json&realtime_start=${d0}&realtime_end=${d1}&include_release_dates_with_no_data=true&sort_order=asc&order_by=release_date&limit=1000`);
          const KEEP = [[/^Consumer Price Index$/i, 'Inflation (CPI)'], [/^Employment Situation$/i, 'Jobs report'], [/^Gross Domestic Product$/i, 'GDP'], [/^Personal Income and Outlays$/i, 'Spending & PCE inflation'], [/^Advance Monthly Sales for Retail/i, 'Retail sales'], [/FOMC Press Release/i, 'Fed rate decision'], [/^Producer Price Index$/i, 'Producer prices'], [/^Job Openings and Labor Turnover/i, 'Job openings (JOLTS)'], [/^New Residential Construction$/i, 'Housing starts'], [/Existing Home Sales/i, 'Existing home sales'], [/Surveys of Consumers|Consumer Sentiment/i, 'Consumer sentiment'], [/^Unemployment Insurance Weekly Claims/i, 'Jobless claims']];
          const seen = new Set();
          out.calendar = ((j && j.release_dates) || []).map((r) => { const m = KEEP.find(([re]) => re.test(r.release_name || '')); return m ? { date: r.date, name: m[1], full: r.release_name } : null; })
            .filter((x) => x && x.date >= d0 && !seen.has(x.date + x.name) && seen.add(x.date + x.name)).filter((x, i, a) => x.name !== 'Jobless claims' || a.filter((y) => y.name === 'Jobless claims').indexOf(x) < 2).slice(0, 30);
        } catch (e) { err('FRED calendar', e); }
      } else out.errors.push('No FRED key: mortgage/Treasury rates, inflation and home prices are off.');
      if (k.bls) {
        try { const y = new Date().getFullYear(); const j = await postJson('https://api.bls.gov/publicAPI/v2/timeseries/data/', { seriesid: Object.values(BLS_SERIES).map((x) => x[0]), startyear: String(y - 2), endyear: String(y), registrationkey: k.bls }); for (const sr of (j.Results && j.Results.series) || []) { const id = Object.keys(BLS_SERIES).find((x) => BLS_SERIES[x][0] === sr.seriesID); if (!id) continue;
            out.bls[id] = { label: BLS_SERIES[id][1], obs: (sr.data || []).filter((d) => /^M\d\d$/.test(d.period) && d.period !== 'M13').map((d) => [`${d.year}-${d.period.slice(1)}`, Number(d.value)]).sort((a, b) => a[0].localeCompare(b[0])) }; }
          if (j.status && j.status !== 'REQUEST_SUCCEEDED') err('BLS', (j.message || []).join(' ') || j.status);
        } catch (e) { err('BLS', e); }
      } else out.errors.push('No BLS key: Midwest category inflation is off.');
      if (k.eia) {
        try { const j = await getJson(`https://api.eia.gov/v2/petroleum/pri/gnd/data/?api_key=${k.eia}&frequency=weekly&data[0]=value&facets[duoarea][]=R20&facets[product][]=EPMR&sort[0][column]=period&sort[0][direction]=desc&length=60`);
          out.eia.gas = { label: 'Midwest regular gasoline ($/gal)', obs: ((j.response && j.response.data) || []).map((d) => [d.period, Number(d.value)]).sort((a, b) => a[0].localeCompare(b[0])) }; } catch (e) { err('EIA gas', e); }
        try { const j = await getJson(`https://api.eia.gov/v2/electricity/retail-sales/data/?api_key=${k.eia}&frequency=monthly&data[0]=price&facets[stateid][]=IA&facets[sectorid][]=RES&sort[0][column]=period&sort[0][direction]=desc&length=36`);
          out.eia.elec = { label: 'Iowa home electricity (¢/kWh)', obs: ((j.response && j.response.data) || []).map((d) => [d.period, Number(d.price)]).sort((a, b) => a[0].localeCompare(b[0])) }; } catch (e) { err('EIA electricity', e); }
      } else out.errors.push('No EIA key: gas and electricity prices are off.');
      // exchange rates (Frankfurter / European Central Bank, no key): 1 USD = x of each currency
      try { const j = await getJson('https://api.frankfurter.dev/v1/latest?base=USD'); if (j && j.rates) out.fx = { date: j.date, rates: j.rates }; } catch (e) { err('Exchange rates', e); }
      // U.S. Treasury (no key): I bond rate for new bonds, and average rates on bills/notes/TIPS
      out.treasury = {};
      try { const j = await getJson('https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/i_bonds_interest_rates?sort=-earning_period_start&page[size]=400');
        const rows = ((j && j.data) || []).filter((r) => r.issue_year_month === r.earning_period && isFinite(Number(r.combined_rate)));
        const obs = rows.map((r) => [r.earning_period_start, Number(r.combined_rate)]).sort((a, b) => a[0].localeCompare(b[0])).slice(-12);
        if (obs.length) { const last = rows.find((r) => r.earning_period_start === obs[obs.length - 1][0]); out.treasury.ibond = { label: 'I bonds (new)', obs, fixed: last ? Number(last.fixed_rate) : null }; }
      } catch (e) { err('Treasury I bonds', e); }
      try { const j = await getJson('https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates?sort=-record_date&page[size]=400&filter=security_type_desc:eq:Marketable');
        const pick = { bills: /^Treasury Bills$/i, notes: /^Treasury Notes$/i, tips: /Inflation-Protected/i };
        for (const [id, re] of Object.entries(pick)) { const obs = ((j && j.data) || []).filter((r) => re.test(r.security_desc) && isFinite(Number(r.avg_interest_rate_amt))).map((r) => [r.record_date, Number(r.avg_interest_rate_amt)]).sort((a, b) => a[0].localeCompare(b[0])).slice(-24); if (obs.length) out.treasury[id] = { obs }; }
      } catch (e) { err('Treasury average rates', e); }
      try { const y = new Date().getFullYear(); for (const yr of [y, y + 1]) { const j = await getJson(`https://date.nager.at/api/v3/PublicHolidays/${yr}/US`); out.holidays.push(...(j || []).filter((h) => !h.counties).map((h) => [h.date, h.name])); } } catch (e) { err('Holidays', e); }
      ECON = out; await save('econ', out);
      return out;
    }
    let econBusy = null;
    async function getEcon(force) {
      const keysig = (() => { const k = apiKeys(); return [k.fred, k.bls, k.eia].map((x) => (x ? 1 : 0)).join(''); })();
      const stale = !ECON || ECON.keysig !== keysig || Date.now() - ECON.at > 20 * 3600e3 || (force && Date.now() - ECON.at > 10 * 60e3);
      if (!stale) return ECON;
      if (!econBusy) econBusy = buildEcon().then(async (o) => { o.keysig = keysig; ECON = o; await save('econ', o); return o; }).finally(() => { econBusy = null; });
      return econBusy;
    }
    // vehicles (NHTSA, no key): decode a VIN; open recalls for a make/model/year. Cached a week.
    const VCACHE = cache('vehicles');
    async function vehicleInfo(vin) {
      vin = String(vin || '').toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, ''); if (vin.length !== 17) return { error: 'A VIN has 17 characters.' };
      const c = VCACHE.get(vin); if (c && Date.now() - c.at < 7 * 864e5) return c.v;
      const d = await getJson(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`); const r = (d.Results || [])[0] || {};
      const v = { year: r.ModelYear || '', make: r.Make || '', model: r.Model || '', trim: r.Trim || '', body: r.BodyClass || '', recalls: [] };
      if (v.make && v.model && v.year) { try { const j = await getJson(`https://api.nhtsa.gov/recalls/recallsByVehicle?make=${encodeURIComponent(v.make)}&model=${encodeURIComponent(v.model)}&modelYear=${encodeURIComponent(v.year)}`);
        v.recalls = (j.results || []).slice(0, 20).map((x) => ({ id: x.NHTSACampaignNumber, date: x.ReportReceivedDate, component: x.Component, summary: String(x.Summary || '').slice(0, 300) })); } catch {} }
      VCACHE.set(vin, { at: Date.now(), v }); return v;
    }

    // ---- markets overview: indexes, commodities, sectors and top movers, paced to stay inside free-tier limits ----
    // Refreshes at most once an hour while US markets are open; outside trading hours the last result is kept.
    let MKT = null;
    function etNow() { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map((x) => [x.type, x.value])); return { day: p.weekday, mins: (Number(p.hour) % 24) * 60 + Number(p.minute), date: `${p.year}-${p.month}-${p.day}` }; }
    function marketOpen() { const e = etNow(); return !['Sat', 'Sun'].includes(e.day) && e.mins >= 570 && e.mins < 960; }
    function mktStale() {
      if (!MKT || MKT.keySig !== keySig()) return true; // keys added or changed: fetch again right away
      const e = etNow(), weekday = !['Sat', 'Sun'].includes(e.day);
      if (marketOpen()) return Date.now() - MKT.at > 60 * 60 * 1000;
      return weekday && e.mins >= 960 && MKT.closedFor !== e.date; // one refresh after the close for closing numbers
    }
    const INDEX_ETFS = [['SPY', 'S&P 500'], ['QQQ', 'Nasdaq 100'], ['DIA', 'Dow Jones'], ['IWM', 'Russell 2000']];
    const COMMOD = [['GCUSD', 'GLD', 'Gold'], ['SIUSD', 'SLV', 'Silver'], ['CLUSD', 'USO', 'Crude oil'], ['NGUSD', 'UNG', 'Natural gas']];
    let mktBusy = null;
    async function buildMarkets() {
      const k = apiKeys(), errors = [], e0 = etNow(), out = { at: Date.now(), tradeDate: e0.date, closedFor: !marketOpen() && e0.mins >= 960 ? e0.date : '', open: marketOpen(), sources: quoteSources().filter((x) => x !== 'Stooq'), indexes: [], commodities: [], sectors: [], gainers: [], losers: [], errors };
      const fmp = async (pathq, label) => { if (!k.fmp) return null; try { return await getJson(`https://financialmodelingprep.com/stable/${pathq}${pathq.includes('?') ? '&' : '?'}apikey=${k.fmp}`); } catch (e) { errors.push(`${label}: ${e.message}`); return null; } };
      const fh = async (sym) => { if (!k.finnhub) return null; try { const j = await getJson(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${k.finnhub}`); return j && j.c > 0 ? j : null; } catch (e) { errors.push(`Finnhub ${sym}: ${e.message}`); return null; } };
      // indexes via the funds that track them (Finnhub quote; FMP as backup)
      for (const [sym, name] of INDEX_ETFS) {
        let q = await fh(sym), row = null;
        if (q) row = { symbol: sym, name, price: q.c, change: q.pc ? ((q.c - q.pc) / q.pc) * 100 : null, source: 'Finnhub' };
        else { const j = await fmp(`quote?symbol=${sym}`, `FMP ${sym}`); const x = Array.isArray(j) ? j[0] : null; if (x) row = { symbol: sym, name, price: x.price, change: x.changePercentage ?? x.changesPercentage ?? null, source: 'FMP' }; }
        if (row) out.indexes.push(row);
      }
      // trend: once a day, a year of closes for SPY/QQQ/DIA/IWM from FMP (4 calls a day)
      const prevHist = MKT && MKT.hist && MKT.histDate === out.tradeDate ? MKT.hist : null;
      out.hist = prevHist || {}; out.histDate = prevHist ? MKT.histDate : out.tradeDate;
      if (!prevHist) for (const [sym] of INDEX_ETFS) { const j = await fmp(`historical-price-eod/light?symbol=${sym}`, `FMP history ${sym}`); const arr = Array.isArray(j) ? j : j && j.historical; if (Array.isArray(arr)) out.hist[sym] = arr.slice(0, 300).map((x) => [x.date, x.price ?? x.close]).filter((x) => x[1] > 0).reverse(); }
      for (const r of out.indexes) { const h = out.hist[r.symbol] || []; const at = (d) => { const x = h.filter((p) => p[0] <= d).pop(); return x ? x[1] : null; }; const d = new Date(); const m1 = new Date(d - 30 * 864e5).toISOString().slice(0, 10), ytd = `${d.getFullYear() - 1}-12-31`; const a = at(m1), b = at(ytd); r.m1 = a ? ((r.price - a) / a) * 100 : null; r.ytd = b ? ((r.price - b) / b) * 100 : null; r.spark = h.slice(-66).map((p) => p[1]); }
      // commodities: FMP commodity quotes, Finnhub fund prices as backup
      for (const [fsym, etf, name] of COMMOD) {
        const j = await fmp(`quote?symbol=${fsym}`, `FMP ${name}`); const x = Array.isArray(j) ? j[0] : null;
        if (x && x.price > 0) { out.commodities.push({ name, symbol: fsym, price: x.price, change: x.changePercentage ?? x.changesPercentage ?? null, unit: 'futures', source: 'FMP' }); continue; }
        const q = await fh(etf); if (q) out.commodities.push({ name, symbol: etf, price: q.c, change: q.pc ? ((q.c - q.pc) / q.pc) * 100 : null, unit: `${etf} fund`, source: 'Finnhub' });
      }
      // sectors and movers (FMP)
      let sec = await fmp(`sector-performance-snapshot?date=${out.tradeDate}`, 'FMP sectors');
      if (!Array.isArray(sec) || !sec.length) { const y = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10); sec = await fmp(`sector-performance-snapshot?date=${y}`, 'FMP sectors (earlier)'); }
      if (Array.isArray(sec)) { const by = {}; sec.forEach((x) => { const n = x.sector; const v = Number(x.averageChange ?? x.changesPercentage); if (n && isFinite(v)) { (by[n] = by[n] || []).push(v); } }); out.sectors = Object.entries(by).map(([name, v]) => ({ name, change: v.reduce((t, x) => t + x, 0) / v.length })).sort((a, b) => b.change - a.change); }
      const mov = (j) => (Array.isArray(j) ? j.slice(0, 25).map((x) => ({ symbol: x.symbol, name: x.name || '', price: x.price, change: x.changesPercentage ?? x.changePercentage ?? null, sector: '' })) : []);
      out.gainers = mov(await fmp('biggest-gainers', 'FMP gainers')); out.losers = mov(await fmp('biggest-losers', 'FMP losers'));
      await tagSectors([...out.gainers, ...out.losers], k);
      if (!k.fmp || !k.finnhub) errors.push((!k.fmp && !k.finnhub ? 'No API keys found. ' : `Only the ${k.fmp ? 'FMP' : 'Finnhub'} key was found. `) + KEYNOTE);
      out.keySig = keySig();
      MKT = out; await save('market', out);
      return out;
    }
    // mover sectors: Finnhub industry mapped to the sector names FMP uses; cached on disk forever, at most 20 new lookups per refresh
    let SECC = null;
    const SECMAP = [[/semicond|tech|software|internet|electronic|computer|communications equip/i, 'Technology'], [/bank|financ|insur|capital market|asset manage/i, 'Financial Services'], [/pharma|biotech|health|medical|life science/i, 'Healthcare'], [/oil|gas|energy|coal/i, 'Energy'], [/utilit/i, 'Utilities'], [/real estate|reit/i, 'Real Estate'], [/media|telecom|entertain|commun/i, 'Communication Services'], [/retail|auto|hotel|restaurant|leisure|textile|apparel|consumer prod|home|distributor/i, 'Consumer Cyclical'], [/food|beverage|tobacco|household/i, 'Consumer Defensive'], [/metal|mining|chemical|material|paper|forest/i, 'Basic Materials'], [/aerospace|defense|machinery|industrial|transport|airline|logistic|construct|building|electrical equip|commercial serv|marine|road|rail/i, 'Industrials']];
    async function tagSectors(list, k) {
      if (!SECC) SECC = (await load('sectors')) || {};
      let n = 0, dirty = false;
      for (const x of list) {
        if (!x.symbol) continue;
        if (!(x.symbol in SECC) && k.finnhub && n < 20) { n++; dirty = true;
          try { const j = await getJson(`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(x.symbol)}&token=${k.finnhub}`); const ind = (j && j.finnhubIndustry) || ''; SECC[x.symbol] = (SECMAP.find(([re]) => re.test(ind)) || [0, ind])[1] || ''; } catch { SECC[x.symbol] = ''; } }
        x.sector = SECC[x.symbol] || '';
      }
      if (dirty) await save('sectors', SECC);
    }
    async function getMarkets(force) {
      if (force && MKT && Date.now() - MKT.at < 10 * 60 * 1000) force = false; // even a manual refresh waits 10 minutes
      if (!force && !mktStale()) return MKT;
      if (!mktBusy) mktBusy = buildMarkets().finally(() => { mktBusy = null; });
      return mktBusy;
    }

    // stock screener (FMP), cached 6 hours per set of filters
    const SCR = cache('screener');
    async function screener(f) {
      const k = apiKeys(); if (!k.fmp) return { rows: [], error: 'The screener needs a Financial Modeling Prep key (Settings → Data sources).' };
      const q = new URLSearchParams(); if (f.sector) q.set('sector', f.sector); if (f.cap > 0) q.set('marketCapMoreThan', String(Math.round(f.cap))); if (f.yield > 0) q.set('dividendYieldMoreThan', String(f.yield)); if (f.maxPrice > 0) q.set('priceLowerThan', String(f.maxPrice));
      q.set('isEtf', 'false'); q.set('isActivelyTrading', 'true'); q.set('country', 'US'); q.set('limit', '60');
      const key = q.toString(), c = SCR.get(key); if (c && Date.now() - c.at < 6 * 3600e3) return c.v;
      let v;
      try { const j = await getJson(`https://financialmodelingprep.com/stable/company-screener?${key}&apikey=${k.fmp}`);
        v = { rows: (Array.isArray(j) ? j : []).map((x) => ({ symbol: x.symbol, name: x.companyName || x.name || '', sector: x.sector || '', industry: x.industry || '', price: x.price ?? null, cap: x.marketCap ?? null, div: x.lastAnnualDividend ?? null, beta: x.beta ?? null, yield: x.price > 0 && x.lastAnnualDividend > 0 ? (x.lastAnnualDividend / x.price) * 100 : null })).filter((x) => x.symbol), error: '' };
      } catch (e) { v = { rows: [], error: /HTTP 40[23]/.test(e.message) ? 'Your Financial Modeling Prep plan doesn\u2019t include the screener.' : `Couldn\u2019t reach the screener (${e.message}).` }; }
      SCR.set(key, { at: Date.now(), v }); return v;
    }

    const started = (async () => { MKT = (await load('market')) || null; ECON = (await load('econ')) || null; await Promise.all(Object.values(caches).map((c) => c.ready)); })();
    const wrap = (f) => async (...a) => { await started; note(); return f(...a); };
    return {
      quotes: wrap(getQuotes), dividends: wrap(getDividends), screener: wrap(screener), stock: wrap(stockDetail), econ: wrap(getEcon), vehicle: wrap(vehicleInfo), markets: wrap(getMarkets),
      sources: () => quoteSources(), marketOpen: () => marketOpen(),
      // call after keys change: forget cached results that depended on the old keys
      resetKeys: async () => { await started; MKT = null; ECON = null; QCACHE.clear(); PCACHE.clear(); },
    };
  }
  return { createMarketData };
});
