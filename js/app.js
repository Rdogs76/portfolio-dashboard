(function () {
  "use strict";

  // ---------- Helpers ----------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const isNum = (v) => typeof v === "number" && isFinite(v);
  const todayISO = () => new Date().toLocaleDateString("en-CA");
  const PALETTE = ["#1fb5a4", "#7a6cf0", "#ff8a3d", "#4c9aff", "#f25f8b", "#f5b83d", "#26a269", "#9aa5b1", "#00a3c4", "#b57edc", "#e8743b", "#5bc0be"];
  const SECTOR_COLORS = {
    Technology: "#1fb5a4", "Financial Services": "#ff8a3d", Energy: "#f5b83d", Healthcare: "#f25f8b", Industrials: "#7a6cf0",
    "Communication Services": "#4c9aff", "Consumer Cyclical": "#e8743b", "Consumer Defensive": "#26a269", Utilities: "#00a3c4",
    "Real Estate": "#b57edc", "Basic Materials": "#a47148", Other: "#9aa5b1", "Cash": "#c9d3d6",
  };
  const SUPER = {
    cyclical: ["Basic Materials", "Consumer Cyclical", "Financial Services", "Real Estate"],
    sensitive: ["Communication Services", "Energy", "Industrials", "Technology"],
    defensive: ["Consumer Defensive", "Healthcare", "Utilities"],
  };
  const PULSE = [["^GSPC", "S&P 500"], ["^GSPTSE", "S&P/TSX"], ["^IXIC", "Nasdaq"], ["^VIX", "VIX"], ["^TNX", "US 10Y yield"], ["CL=F", "Crude oil"], ["GC=F", "Gold"], ["USDCAD=X", "USD/CAD"]];
  const SHELTERED = /\b(TFSA|RRSP|FHSA|RESP|RRIF|LIRA|RDSP|LIF)\b/i;
  const TYPE_LABEL = { buy: "Buy", sell: "Sell", dividend: "Dividend", split: "Split", deposit: "Deposit", withdrawal: "Withdrawal" };
  const RISK_HELP = {
    ret: "Time-weighted return over the period, so deposits and withdrawals don't distort it.",
    vol: "Volatility: how much daily returns swing, scaled to a year. The S&P 500 is usually around 15–20%.",
    sharpe: "Sharpe ratio: return earned above a risk-free T-bill, per unit of volatility. Above 1 is generally considered good.",
    sortino: "Sortino ratio: like Sharpe, but only counts downside swings as risk.",
    mdd: "Max drawdown: the largest drop from a peak to a low during the period.",
    beta: "Beta vs the S&P 500: 1 means the portfolio tends to move with the market; 1.3 means about 30% more; 0.7 about 30% less.",
    corr: "Correlation with the S&P 500: 1 means it moves in lockstep with the US market.",
    best: "Best and worst single days in the period.",
  };

  function hash(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }
  function colorFor(sym) { return PALETTE[hash(sym) % PALETTE.length]; }
  function shortSym(sym) { return sym.replace(/\.(TO|V|NE|CN)$/, "").replace(/^\^/, "").slice(0, 4); }

  function money(v, cur = state.data.settings.base, dec = 2) {
    if (!isNum(v)) return "—";
    return new Intl.NumberFormat("en-CA", { style: "currency", currency: cur || "USD", minimumFractionDigits: dec, maximumFractionDigits: dec }).format(v);
  }
  function signedMoney(v, cur) { if (!isNum(v)) return "—"; return (v > 0 ? "+" : v < 0 ? "−" : "") + money(Math.abs(v), cur); }
  function pct(v, dec = 2, signed = true) { if (!isNum(v)) return "—"; const s = signed ? (v > 0 ? "+" : v < 0 ? "−" : "") : (v < 0 ? "−" : ""); return s + Math.abs(v).toFixed(dec) + "%"; }
  function ratioPct(v, dec = 1) { return isNum(v) ? (v * 100).toFixed(dec) + "%" : "—"; }
  function num(v, dec = 2) { return isNum(v) ? v.toLocaleString("en-CA", { minimumFractionDigits: dec, maximumFractionDigits: dec }) : "—"; }
  function qtyFmt(v) { return isNum(v) ? v.toLocaleString("en-CA", { maximumFractionDigits: 4 }) : "—"; }
  function big(v, cur) {
    if (!isNum(v)) return "—";
    const a = Math.abs(v); const sign = v < 0 ? "−" : "";
    const [d, s] = a >= 1e12 ? [1e12, "T"] : a >= 1e9 ? [1e9, "B"] : a >= 1e6 ? [1e6, "M"] : a >= 1e3 ? [1e3, "K"] : [1, ""];
    const n = (a / d).toFixed(a / d >= 100 ? 0 : a / d >= 10 ? 1 : 2) + s;
    return cur ? sign + (cur === "CAD" ? "C$" : cur === "USD" ? "$" : cur + " ") + n : sign + n;
  }
  const pv = (html) => `<span class="pv">${html}</span>`;
  function cls(v) { return v > 0 ? "up" : v < 0 ? "down" : ""; }
  function ago(t) {
    if (!t) return "";
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return "just now"; if (m < 60) return m + "m ago";
    const h = Math.round(m / 60); if (h < 24) return h + "h ago";
    const d = Math.round(h / 24); return d < 7 ? d + "d ago" : new Date(t).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
  }
  function fmtDate(t, opts = { month: "short", day: "numeric", year: "numeric" }) { return t ? new Date(t).toLocaleDateString("en-CA", opts) : "—"; }
  function avatar(sym) { return `<span class="avatar" style="background:${colorFor(sym)}">${esc(shortSym(sym))}</span>`; }
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
  const parseNum = (v) => { const n = Number(String(v ?? "").replace(/[, $]/g, "")); return String(v ?? "").trim() === "" ? NaN : n; };
  const dkey = (t) => Recap.dkey(t);
  const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
  const std = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };
  function cov(a, b) { const ma = mean(a), mb = mean(b); let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - ma) * (b[i] - mb); return s / Math.max(1, a.length - 1); }
  function corr(a, b) { const sa = std(a), sb = std(b); return sa && sb ? cov(a, b) / (sa * sb) : null; }

  let toastTimer;
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 3600); }

  function download(name, text, type = "text/csv") {
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------- State & storage ----------
  // Profiles let several people keep separate portfolios in one browser.
  const PROFILES = "portfolio-dashboard.profiles";
  function readProfiles() {
    try { const p = JSON.parse(localStorage.getItem(PROFILES) || "null"); if (p?.list?.length) return p; } catch { /* ignore */ }
    return { active: "default", list: [{ id: "default", name: "Me" }] };
  }
  function writeProfiles(p) { try { localStorage.setItem(PROFILES, JSON.stringify(p)); } catch { /* ignore */ } }
  const keyFor = (id) => (id === "default" ? "portfolio-dashboard.v1" : `portfolio-dashboard.p.${id}`);
  const profiles = readProfiles();
  const LS = keyFor(profiles.active);
  const DEFAULTS = {
    trades: [], watchlist: ["AAPL", "NVDA", "SHOP.TO"], alerts: [], targets: {}, compare: ["AAPL", "MSFT"],
    accounts: ["Non-registered", "TFSA", "RRSP"],
    settings: { base: "CAD", countries: ["USD", "CAD"], impacts: ["High", "Medium"], theme: "system", privacy: false, account: "all" },
  };
  function migrate(d) {
    d.trades = (d.trades || []).map((t) => ({ ...t, side: t.side || "buy", account: t.account || "Non-registered" }));
    const used = d.trades.map((t) => t.account);
    d.accounts = [...new Set([...(d.accounts || DEFAULTS.accounts), ...used])];
    return d;
  }
  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(LS) || "null");
      if (!raw) return structuredClone(DEFAULTS);
      return migrate({ ...structuredClone(DEFAULTS), ...raw, settings: { ...DEFAULTS.settings, ...(raw.settings || {}) } });
    } catch { return structuredClone(DEFAULTS); }
  }
  function save() { try { localStorage.setItem(LS, JSON.stringify(state.data)); } catch { toast("Couldn't save to this browser's storage. Download a backup from Settings."); } }

  const state = {
    data: load(), demo: false, live: null,
    quotes: {}, meta: {}, market: null, events: null, news: null, quotesAt: null,
    tab: "overview", ovMode: "all", allocBy: "holding", pfSub: "holdings", mkSub: "watchlist",
    perfRange: "6mo", riskRange: "1y", cmpRange: "1y", sectorGroup: "all", newsSub: "calendar", newsFilter: "all", actFilter: "all",
    calDay: null, recapPeriod: "week", earnScope: "all", rbMode: "buy", gainsYear: null,
    research: { symbol: null, range: "1y", data: null }, charts: {}, stockCache: {},
  };
  const acct = () => state.data.settings.account || "all";

  // ---------- API ----------
  async function probe() {
    try {
      const r = await fetch("/api/quotes?symbols=%5EGSPC", { headers: { accept: "application/json" } });
      const json = (r.headers.get("content-type") || "").includes("application/json");
      state.live = r.status !== 404 && json;
    } catch { state.live = false; }
    state.demo = !state.live;
    $("#demoBanner").hidden = !state.demo;
  }
  async function api(path, params = {}) {
    if (state.demo) { await new Promise((r) => setTimeout(r, 100)); return Demo.handle(path, params); }
    const qs = new URLSearchParams(params).toString();
    const r = await fetch(`/api/${path}${qs ? "?" + qs : ""}`);
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || `Request failed (${r.status})`);
    return body;
  }

  // ---------- Portfolio math ----------
  function sortedTrades() { return [...state.data.trades].sort((a, b) => a.date.localeCompare(b.date) || a.created - b.created); }
  function tradesFor(account = acct(), excludeId = null) { return sortedTrades().filter((t) => (account === "all" || t.account === account) && t.id !== excludeId); }

  function computeHoldings(asOf, account = acct(), excludeId = null) {
    const map = {};
    for (const t of tradesFor(account, excludeId)) {
      if (asOf && t.date > asOf) continue;
      if (!t.symbol) continue;
      const h = (map[t.symbol] ||= { symbol: t.symbol, currency: t.currency, qty: 0, cost: 0, realized: 0, fees: 0, divs: 0, accounts: new Set() });
      h.accounts.add(t.account);
      if (t.side === "buy") { h.qty += t.qty; h.cost += t.qty * t.price + (t.fees || 0); h.fees += t.fees || 0; }
      else if (t.side === "sell") {
        const avg = h.qty > 0 ? h.cost / h.qty : 0;
        const q = Math.min(t.qty, h.qty);
        h.realized += q * t.price - (t.fees || 0) - avg * q;
        h.cost -= avg * q; h.qty -= q; h.fees += t.fees || 0;
        if (h.qty < 1e-9) { h.qty = 0; h.cost = 0; }
      } else if (t.side === "split") { if (h.qty > 0 && t.ratio > 0) h.qty *= t.ratio; }
      else if (t.side === "dividend") h.divs += t.amount || 0;
    }
    return map;
  }

  function cashBalances(account = acct()) {
    const list = tradesFor(account);
    const tracked = new Set(list.filter((t) => t.side === "deposit" || t.side === "withdrawal").map((t) => t.account));
    const bal = {};
    for (const t of list) {
      if (!tracked.has(t.account)) continue;
      const c = t.currency; bal[c] = bal[c] || 0;
      if (t.side === "deposit") bal[c] += t.amount;
      else if (t.side === "withdrawal") bal[c] -= t.amount;
      else if (t.side === "buy") bal[c] -= t.qty * t.price + (t.fees || 0);
      else if (t.side === "sell") bal[c] += t.qty * t.price - (t.fees || 0);
      else if (t.side === "dividend") bal[c] += t.amount || 0;
    }
    return { tracked: tracked.size > 0, bal };
  }

  function fx(cur, base = state.data.settings.base) {
    if (!cur || cur === base) return 1;
    const q = state.quotes[`${cur}${base}=X`];
    if (q?.price) return q.price;
    const inv = state.quotes[`${base}${cur}=X`];
    if (inv?.price) return 1 / inv.price;
    return null;
  }

  function annualDividend(sym) {
    const q = state.quotes[sym]; const m = state.meta[sym];
    return q?.dividendRate ?? m?.dividendRate ?? null;
  }

  function portfolio(account = acct()) {
    const base = state.data.settings.base;
    const all = Object.values(computeHoldings(null, account));
    const rows = [];
    let value = 0, cost = 0, dayChange = 0, realized = 0, prevValue = 0, missing = 0, divsReceived = 0, projIncome = 0;
    for (const h of all) {
      const rate = fx(h.currency);
      realized += h.realized * (rate ?? 1);
      divsReceived += h.divs * (rate ?? 1);
      if (h.qty <= 1e-9) continue;
      const q = state.quotes[h.symbol];
      const price = q?.price;
      if (!isNum(price) || rate == null) missing++;
      const mv = isNum(price) ? h.qty * price : null;
      const mvBase = mv != null && rate != null ? mv * rate : null;
      const costBase = h.cost * (rate ?? 1);
      const dayBase = isNum(q?.change) && rate != null ? h.qty * q.change * rate : 0;
      if (mvBase != null) { value += mvBase; prevValue += mvBase - dayBase; }
      cost += costBase; dayChange += dayBase;
      const dps = annualDividend(h.symbol);
      const income = isNum(dps) ? dps * h.qty * (rate ?? 1) : 0;
      projIncome += income;
      rows.push({ ...h, quote: q, price, mv, mvBase, costBase, avg: h.qty ? h.cost / h.qty : 0, gain: mvBase != null ? mvBase - costBase : null, gainPct: mvBase != null && costBase ? (mvBase / costBase - 1) * 100 : null, dayBase, dayPct: q?.changePct, income, dps });
    }
    rows.forEach((r) => (r.weight = value ? (r.mvBase || 0) / value * 100 : 0));
    rows.sort((a, b) => (b.mvBase || 0) - (a.mvBase || 0));
    const cb = cashBalances(account);
    const cash = cb.tracked ? Object.entries(cb.bal).reduce((s, [c, v]) => s + v * (fx(c) ?? 1), 0) : null;
    const unrealized = value - cost;
    return {
      base, rows, value, cost, dayChange, dayPct: prevValue ? dayChange / prevValue * 100 : null, cash, cashByCur: cb.bal,
      unrealized, realized, divsReceived, projIncome, totalGain: unrealized + realized + divsReceived,
      allTimePct: cost ? (unrealized + realized + divsReceived) / cost * 100 : null, missing,
    };
  }

  function symbolsNeeded() {
    const base = state.data.settings.base;
    const held = [...new Set(state.data.trades.filter((t) => t.symbol).map((t) => t.symbol))];
    const curs = new Set(state.data.trades.map((t) => t.currency).concat(["USD", "CAD"]));
    const fxs = [...curs].filter((c) => c !== base).map((c) => `${c}${base}=X`);
    const alertSyms = state.data.alerts.map((a) => a.symbol);
    return { held, all: [...new Set([...held, ...state.data.watchlist, ...alertSyms, ...PULSE.map((p) => p[0]), "^IRX", ...fxs])] };
  }

  // Daily portfolio value series, used by Performance and Risk.
  async function buildSeries(range, extra = []) {
    const base = state.data.settings.base;
    const trades = tradesFor().filter((t) => t.symbol && ["buy", "sell", "split"].includes(t.side));
    if (!trades.some((t) => t.side === "buy")) return null;
    const syms = [...new Set(trades.map((t) => t.symbol))];
    const curOf = {}; for (const t of trades) curOf[t.symbol] ||= t.currency;
    const curs = [...new Set(Object.values(curOf))].filter((c) => c !== base);
    const all = [...syms, ...curs.map((c) => `${c}${base}=X`), ...extra];
    const charts = (await api("charts", { symbols: all.join(","), range })).charts;
    const keys = [...new Set(syms.flatMap((s) => (charts[s]?.points || []).map(([t]) => dkey(t))))].sort();
    if (!keys.length) return { empty: true };
    const mapOf = (sym) => { const m = new Map(); for (const [t, c] of charts[sym]?.points || []) m.set(dkey(t), c); return m; };
    const priceMaps = Object.fromEntries(syms.map((s) => [s, mapOf(s)]));
    const fxMaps = Object.fromEntries(curs.map((c) => [c, mapOf(`${c}${base}=X`)]));
    const splits = trades.filter((t) => t.side === "split");
    const futureSplit = (sym, k) => splits.filter((t) => t.symbol === sym && t.date > k).reduce((p, t) => p * (t.ratio || 1), 1);
    const flowTrades = trades.filter((t) => t.side !== "split").map((t) => ({ ...t, key: keys.find((k) => k >= t.date) || null }));
    const last = {}, lastFx = {};
    const rate = (c) => (c === base ? 1 : lastFx[c] ?? fx(c) ?? 1);
    let netFlow = 0;
    for (const t of flowTrades.filter((t) => t.date < keys[0])) netFlow += (t.side === "buy" ? 1 : -1) * (t.qty * t.price + (t.side === "buy" ? 1 : -1) * (t.fees || 0)) * (fx(t.currency) ?? 1);
    const out = { keys: [], ts: [], values: [], invested: [], twr: [], rets: [], priceMaps, charts, syms, curOf, weightsAt: [] };
    let cum = 1, prevV = 0;
    for (const k of keys) {
      for (const s of syms) if (priceMaps[s].has(k)) last[s] = priceMaps[s].get(k);
      for (const c of curs) if (fxMaps[c].has(k)) lastFx[c] = fxMaps[c].get(k);
      const pos = {};
      for (const t of trades) {
        if (t.date > k) break;
        if (t.side === "buy") pos[t.symbol] = (pos[t.symbol] || 0) + t.qty;
        else if (t.side === "sell") pos[t.symbol] = Math.max(0, (pos[t.symbol] || 0) - t.qty);
        else if (t.side === "split") pos[t.symbol] = (pos[t.symbol] || 0) * (t.ratio || 1);
      }
      let V = 0; const w = {};
      for (const [s, q] of Object.entries(pos)) {
        if (q > 1e-9 && last[s] != null) { const v = q * futureSplit(s, k) * last[s] * rate(curOf[s]); V += v; w[s] = v; }
      }
      let F = 0;
      for (const t of flowTrades) if (t.key === k && t.date >= keys[0]) F += (t.side === "buy" ? 1 : -1) * (t.qty * t.price + (t.side === "buy" ? 1 : -1) * (t.fees || 0)) * rate(t.currency);
      netFlow += F;
      const ts = Date.parse(k + "T20:00:00Z");
      if (prevV > 0) { const r = (V - F) / prevV - 1; cum *= 1 + r; out.rets.push({ k, ts, r }); }
      out.keys.push(k); out.ts.push(ts); out.values.push(V); out.invested.push(netFlow); out.twr.push((cum - 1) * 100);
      out.weightsAt.push(w);
      prevV = V;
    }
    return out;
  }

  // ---------- Data loading ----------
  async function loadQuotes() {
    const { all } = symbolsNeeded();
    const chunks = []; for (let i = 0; i < all.length; i += 50) chunks.push(all.slice(i, i + 50));
    const results = await Promise.allSettled(chunks.map((c) => api("quotes", { symbols: c.join(",") })));
    let ok = false;
    for (const r of results) if (r.status === "fulfilled") { Object.assign(state.quotes, r.value.quotes); ok = true; }
    if (ok) { state.quotesAt = Date.now(); checkAlerts(); }
    else if (results[0]?.reason) toast("Couldn't load prices right now. Press Refresh to try again.");
  }
  async function loadMeta(symbols) {
    const need = [...new Set(symbols)].filter((s) => !state.meta[s]);
    if (!need.length) return;
    for (let i = 0; i < need.length; i += 20) {
      try { const r = await api("meta", { symbols: need.slice(i, i + 20).join(",") }); Object.assign(state.meta, r.meta); }
      catch (e) { console.warn("meta", e); }
    }
  }
  async function loadMarket() { try { state.market = (await api("market")).series; } catch (e) { state.market = state.market || []; console.warn(e); } }
  async function loadEvents() { try { state.events = (await api("calendar")).events; } catch (e) { state.events = state.events || []; state.eventsError = e.message; } }
  async function loadNews() {
    const { held } = symbolsNeeded();
    try { state.news = (await api("news", { symbols: held.slice(0, 8).join(",") })).news; } catch (e) { state.news = state.news || []; state.newsError = e.message; }
  }
  const metaSymbols = () => [...symbolsNeeded().held, ...state.data.watchlist];

  async function refreshAll() {
    const btn = $("#refreshBtn"); btn.classList.add("spinning");
    state.meta = {}; state.stockCache = {};
    try {
      await loadQuotes(); renderCurrent();
      await Promise.all([loadMarket(), loadEvents(), loadNews()]);
      renderCurrent();
      loadMeta(metaSymbols()).then(renderCurrent);
    } finally { btn.classList.remove("spinning"); }
  }

  // ---------- Charts ----------
  function chart(id, config) {
    if (typeof Chart === "undefined") return null;
    state.charts[id]?.destroy();
    const el = document.getElementById(id); if (!el) return null;
    Chart.defaults.font.family = "Inter, system-ui, sans-serif";
    Chart.defaults.color = css("--text-2");
    state.charts[id] = new Chart(el, config);
    return state.charts[id];
  }
  function donut(id, labels, values, colors, onClick) {
    return chart(id, {
      type: "doughnut",
      data: { labels, datasets: [{ data: values, backgroundColor: colors, borderColor: css("--surface"), borderWidth: 3, borderRadius: 6, hoverOffset: 6 }] },
      options: {
        cutout: "70%", maintainAspectRatio: false, animation: { duration: 400 },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.label}: ${c.parsed.toFixed(1)}%` } } },
        onClick: onClick ? (_, els) => els[0] && onClick(els[0].index) : undefined,
      },
    });
  }
  function lineOpts({ money: m, pctAxis, time, cur } = {}) {
    const grid = css("--border");
    return {
      maintainAspectRatio: false, animation: { duration: 300 }, interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: {
          title: (items) => items[0] ? new Date(items[0].parsed.x).toLocaleString("en-CA", time ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" } : { year: "numeric", month: "short", day: "numeric" }) : "",
          label: (c) => ` ${c.dataset.label}: ${pctAxis ? pct(c.parsed.y) : m ? money(c.parsed.y, cur) : num(c.parsed.y)}`,
        } },
      },
      scales: {
        x: { type: "linear", grid: { display: false }, ticks: { maxTicksLimit: 6, callback: (v) => new Date(v).toLocaleDateString("en-CA", time ? { hour: "numeric" } : { month: "short", day: "numeric" }) } },
        y: { position: "right", grid: { color: grid }, border: { display: false }, ticks: { maxTicksLimit: 5, callback: (v) => (pctAxis ? pct(v, 0) : m ? big(v, cur) : num(v, v > 100 ? 0 : 2)) } },
      },
      elements: { point: { radius: 0, hoverRadius: 4 }, line: { tension: .25, borderWidth: 2 } },
    };
  }
  function gradient(ctx, color) {
    const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, ctx.chart.height || 300);
    g.addColorStop(0, color + "40"); g.addColorStop(1, color + "00"); return g;
  }
  const withLegend = (o) => { o.plugins.legend = { display: true, position: "top", align: "start", labels: { boxWidth: 10, usePointStyle: true } }; return o; };

  // ---------- Navigation ----------
  function setPressed(container, attr, value) { $$(`[data-${attr}]`, container).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset[attr.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] === value))); }

  function goto(tab, sub) {
    if (tab === "earnings") { tab = "markets"; sub = "earnings"; }
    state.tab = tab;
    $$("#tabs [role=tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
    $$(".view").forEach((v) => (v.hidden = v.id !== "view-" + tab));
    if (tab === "news" && sub) state.newsSub = sub;
    if (tab === "portfolio" && sub) state.pfSub = sub;
    if (tab === "markets" && sub) state.mkSub = sub;
    if (location.hash.slice(1) !== tab) history.replaceState(null, "", "#" + tab);
    window.scrollTo({ top: 0 });
    renderCurrent();
  }
  function renderCurrent() {
    renderAccountSelects();
    ({ overview: renderOverview, portfolio: renderPortfolio, markets: renderMarkets, research: renderResearch, news: renderNews, recap: renderRecap })[state.tab]?.();
  }
  function renderAccountSelects() {
    const cur = acct();
    const opts = `<option value="all">All accounts</option>` + state.data.accounts.map((a) => `<option value="${esc(a)}">${esc(a)}</option>`).join("");
    for (const id of ["#ovAccount", "#pfAccount"]) { const s = $(id); if (s.dataset.sig !== opts) { s.innerHTML = opts; s.dataset.sig = opts; } s.value = state.data.accounts.includes(cur) ? cur : "all"; }
  }
  function setAccount(a) { state.data.settings.account = a; save(); renderCurrent(); }

  // ---------- Overview ----------
  function groupsFor(p, by) {
    if (by === "holding") return p.rows.map((r) => ({ label: r.symbol, value: r.weight, color: colorFor(r.symbol), sub: state.ovMode === "all" ? r.gainPct : r.dayPct, symbol: r.symbol }));
    const g = {};
    const add = (k, v) => (g[k] = (g[k] || 0) + v);
    for (const r of p.rows) {
      if (by === "sector") {
        const m = state.meta[r.symbol];
        if (m?.sectorWeights) { const tot = Object.values(m.sectorWeights).reduce((a, b) => a + b, 0) || 1; for (const [s, w] of Object.entries(m.sectorWeights)) add(s, r.weight * w / tot); }
        else add(m?.sector || (m ? "Other" : "Loading…"), r.weight);
      } else if (by === "account") {
        const share = computeAccountsSplit(r.symbol);
        for (const [a, f] of Object.entries(share)) add(a, r.weight * f);
      } else if (by === "currency") add(r.currency === "CAD" ? "Canadian dollar" : r.currency === "USD" ? "US dollar" : r.currency, r.weight);
      else if (by === "type") { const t = (r.quote?.type || state.meta[r.symbol]?.type || "").toUpperCase(); add(t === "ETF" || t === "MUTUALFUND" ? "ETFs & funds" : "Individual stocks", r.weight); }
    }
    if (p.cash && p.value + p.cash > 0 && by !== "holding") { /* weights are of invested value; cash shown in the line above */ }
    return Object.entries(g).sort((a, b) => b[1] - a[1]).map(([label, value], i) => ({ label, value, color: SECTOR_COLORS[label] || PALETTE[i % PALETTE.length] }));
  }
  function computeAccountsSplit(sym) {
    const out = {}; let tot = 0;
    for (const a of state.data.accounts) { if (acct() !== "all" && a !== acct()) continue; const h = computeHoldings(null, a)[sym]; if (h?.qty > 0) { out[a] = h.qty; tot += h.qty; } }
    for (const k in out) out[k] /= tot || 1;
    return out;
  }

  function renderOverview() {
    const p = portfolio();
    const has = p.rows.length > 0;
    $("#ovEmpty").hidden = has || state.data.trades.length > 0;
    $(".donut-wrap", $("#view-overview")).hidden = !has;
    $("#ovLegend").hidden = !has;
    $(".alloc-by").hidden = !has;
    $("#ovAccountLabel").textContent = acct() === "all" ? "Portfolio value · all accounts" : `Portfolio value · ${acct()}`;
    $("#ovValue").textContent = money(p.value + (p.cash || 0));
    $("#ovDay").innerHTML = has ? `<span class="${cls(p.dayChange)} pv">${signedMoney(p.dayChange)} (${pct(p.dayPct)})</span> today · <span class="pv">${signedMoney(p.totalGain)}</span> all-time` : state.data.trades.length ? "No open positions in this view." : "Add trades to start tracking.";
    const extra = [];
    if (p.cash != null) extra.push(`Cash ${pv(money(p.cash))}`);
    if (p.projIncome > 0) extra.push(`Dividends ≈ ${pv(money(p.projIncome))}/yr`);
    if (p.missing) extra.push(`<span class="muted">${p.missing} price${p.missing > 1 ? "s" : ""} loading</span>`);
    $("#ovExtra").innerHTML = extra.join(" · ");
    setPressed($("#allocBy"), "alloc", state.allocBy);
    if (has) {
      const v = state.ovMode === "all" ? p.allTimePct : p.dayPct;
      const pill = $("#ovCenter"); pill.textContent = pct(v); pill.classList.toggle("neg", v < 0);
      $("#ovCenterLabel").textContent = state.ovMode === "all" ? "All-time" : "Today";
      const groups = groupsFor(p, state.allocBy);
      donut("ovDonut", groups.map((g) => g.label), groups.map((g) => g.value), groups.map((g) => g.color), (i) => groups[i].symbol && openResearch(groups[i].symbol));
      $("#ovLegend").innerHTML = groups.map((g) => `<li ${g.symbol ? `data-symbol="${esc(g.symbol)}"` : ""}><span class="sw" style="background:${g.color}"></span><span class="lg-sym">${esc(g.label)}</span>${g.symbol ? `<span class="${cls(g.sub)} small">${pct(g.sub, 1)}</span>` : ""}<span class="lg-pct">${g.value.toFixed(1)}%</span></li>`).join("");
    }

    $("#pulse").innerHTML = PULSE.map(([s, name]) => {
      const q = state.quotes[s];
      const val = !q ? "—" : s === "^TNX" ? q.price?.toFixed(2) + "%" : s === "USDCAD=X" ? q.price?.toFixed(4) : num(q.price, q.price > 1000 ? 0 : 2);
      const chg = !q ? "" : s === "^TNX" ? `${q.change >= 0 ? "+" : "−"}${Math.abs(q.change || 0).toFixed(2)} pts` : pct(q.changePct);
      return `<div class="tile clickable-tile" data-symbol="${esc(s)}"><div class="t-name">${esc(name)}</div><div class="t-val ${q ? "" : "skeleton"}">${val}</div><div class="t-chg ${q ? cls(q.change) : ""}">${chg}</div></div>`;
    }).join("");
    $("#pulseAsOf").textContent = state.quotesAt ? "Updated " + new Date(state.quotesAt).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" }) : "";

    const movers = [...p.rows].filter((r) => isNum(r.dayPct)).sort((a, b) => Math.abs(b.dayPct) - Math.abs(a.dayPct)).slice(0, 5);
    $("#ovMovers").innerHTML = movers.length ? movers.map((r) => `<li class="clickable" data-symbol="${esc(r.symbol)}">${avatar(r.symbol)}<div class="grow"><div class="title">${esc(r.symbol)}</div><div class="meta">${esc(r.quote?.name || "")}</div></div><div class="r"><div class="${cls(r.dayPct)}"><b>${pct(r.dayPct)}</b></div><div class="meta pv">${signedMoney(r.dayBase)}</div></div></li>`).join("") : `<li class="empty-line">Your biggest daily movers will show here.</li>`;

    if (state.events) {
      const now = Date.now();
      const evs = state.events.filter((e) => e.impact === "High" && state.data.settings.countries.includes(e.country) && e.time > now - 3 * 3600000).slice(0, 5);
      $("#ovEvents").innerHTML = evs.length ? evs.map((e) => `<li><i class="dot high"></i><div class="grow"><div class="title">${esc(e.title)}</div><div class="meta">${esc(e.country)} · ${new Date(e.time).toLocaleString("en-CA", { weekday: "short", hour: "numeric", minute: "2-digit" })}${e.forecast ? " · forecast " + esc(e.forecast) : ""}</div></div></li>`).join("") : `<li class="empty-line">No more high-impact ${state.data.settings.countries.join("/")} events this week.</li>`;
    } else $("#ovEvents").innerHTML = skeletonList(3);

    const upcoming = earningsRows().filter((r) => r.date).slice(0, 4);
    $("#ovEarnings").innerHTML = upcoming.length ? upcoming.map((r) => `<li class="clickable" data-symbol="${esc(r.symbol)}">${avatar(r.symbol)}<div class="grow"><div class="title">${esc(r.symbol)}</div><div class="meta">${esc(r.name)}</div></div><div class="r"><b>${fmtDate(r.date, { month: "short", day: "numeric" })}</b><div class="meta">${r.inHoldings ? "Holding" : "Watchlist"}</div></div></li>`).join("")
      : Object.keys(state.meta).length ? `<li class="empty-line">No earnings dates found for your holdings or watchlist.</li>` : skeletonList(3);

    const rc = state.market?.length ? Recap.build({ series: state.market, events: state.events || [], news: state.news || [], period: "week" }) : null;
    $("#ovRecap").textContent = rc ? rc.teaser : state.market ? "Market data unavailable right now." : "Loading…";

    $("#ovHealth").innerHTML = has ? healthChecks(p).slice(0, 4).map(checkItem).join("") : `<li class="empty-line">Add holdings to see concentration and diversification checks.</li>`;

    const alerts = state.data.alerts;
    $("#ovAlerts").innerHTML = alerts.length ? alerts.slice(0, 4).map(alertItem).join("") : `<li class="empty-line">Get notified when a stock crosses a price. <button class="link" data-goto="markets" data-sub="alerts">Create an alert</button></li>`;

    $("#ovNews").innerHTML = state.news ? newsItems(state.news.slice(0, 6)) : skeletonList(4);
  }
  function skeletonList(n) { return Array.from({ length: n }, () => `<li><div class="grow"><div class="skeleton" style="width:70%"></div><div class="skeleton" style="width:40%;margin-top:6px"></div></div></li>`).join(""); }
  function newsItems(list) {
    if (!list.length) return `<li class="empty-line">No headlines right now.</li>`;
    return list.map((n) => `<li><a href="${esc(n.link)}" target="_blank" rel="noopener noreferrer">${n.thumbnail ? `<img src="${esc(n.thumbnail)}" alt="" loading="lazy">` : ""}<div><div class="n-title">${esc(n.title)}</div><div class="n-meta">${esc(n.publisher || "")}<span>·</span>${ago(n.time)}${(n.tickers || []).slice(0, 3).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div></div></a></li>`).join("");
  }

  // Plain-language diversification checks (rules of thumb, not advice).
  function healthChecks(p) {
    const out = [];
    const w = p.rows.map((r) => r.weight / 100);
    const top = p.rows[0];
    const etfs = (r) => ["ETF", "MUTUALFUND"].includes((r.quote?.type || state.meta[r.symbol]?.type || "").toUpperCase());
    const stocks = p.rows.filter((r) => !etfs(r));
    const topStock = stocks[0];
    if (topStock) {
      const lvl = topStock.weight > 25 ? "bad" : topStock.weight > 10 ? "warn" : "ok";
      out.push({ lvl, title: `Largest single stock: ${topStock.symbol} at ${topStock.weight.toFixed(1)}%`, text: lvl === "ok" ? "No single company dominates your portfolio." : "A common rule of thumb keeps any one company under about 10% so one bad result can't sink the whole portfolio." });
    } else if (top) out.push({ lvl: "ok", title: "Built from funds", text: "Your holdings are ETFs or funds, which spread money across many companies." });
    const eff = 1 / (w.reduce((s, x) => s + x * x, 0) || 1);
    const effLook = p.rows.filter(etfs).length ? "plus the companies inside your ETFs" : "";
    out.push({ lvl: eff >= 8 || p.rows.some(etfs) ? "ok" : eff >= 4 ? "warn" : "bad", title: `Acts like ${eff.toFixed(1)} equal-sized holdings`, text: `Measures how evenly your money is spread ${effLook}. Higher is more diversified.` });
    const sec = groupsFor(p, "sector").filter((g) => g.label !== "Loading…");
    if (sec.length) {
      const s0 = sec[0];
      out.push({ lvl: s0.value > 50 ? "bad" : s0.value > 35 ? "warn" : "ok", title: `Biggest sector: ${s0.label} at ${s0.value.toFixed(0)}%`, text: s0.value > 35 ? "A large share in one sector means one industry's slump would hit you hard." : "Your sector mix is reasonably spread out." });
    }
    const cur = groupsFor(p, "currency");
    const usd = cur.find((g) => g.label === "US dollar")?.value || 0;
    out.push({ lvl: "ok", title: `${usd.toFixed(0)}% in US-dollar holdings`, text: usd > 0 ? "When the Canadian dollar rises, these are worth less in CAD, and vice versa." : "All holdings are priced in Canadian dollars." });
    return out;
  }
  function checkItem(c) {
    const icon = c.lvl === "ok" ? "✓" : "!";
    return `<li><span class="check-icon ${c.lvl}" aria-hidden="true">${icon}</span><div class="grow"><div class="title">${esc(c.title)}</div><div class="meta">${esc(c.text)}</div></div></li>`;
  }

  // ---------- Portfolio ----------
  function renderPortfolio() {
    setPressed($("#pfSeg"), "sub", state.pfSub);
    $$("#view-portfolio .sub-view").forEach((v) => (v.hidden = v.dataset.sub !== state.pfSub));
    ({ holdings: renderHoldings, activity: renderActivity, performance: renderPerformance, sectors: renderSectors, dividends: renderDividends, risk: renderRisk, rebalance: renderRebalance, gains: renderGains })[state.pfSub]?.();
  }
  function kpiCards(items) {
    return items.map(([l, v, c, s, help]) => `<div class="card"><div class="kpi-label"${help ? ` title="${esc(help)}"` : ""}>${l}</div><div class="kpi-val ${c || ""}">${v}</div>${s ? `<div class="small ${c || "muted"}">${s}</div>` : ""}</div>`).join("");
  }
  function renderHoldings() {
    const p = portfolio();
    $("#pfKpis").innerHTML = kpiCards([
      ["Market value", pv(money(p.value)), "", p.cash != null ? `+ ${pv(money(p.cash))} cash` : `${p.rows.length} holding${p.rows.length === 1 ? "" : "s"}`],
      ["Today", pv(signedMoney(p.dayChange)), cls(p.dayChange), pct(p.dayPct)],
      ["Unrealized gain/loss", pv(signedMoney(p.unrealized)), cls(p.unrealized), p.cost ? pct(p.unrealized / p.cost * 100) : ""],
      ["Realized + dividends", pv(signedMoney(p.realized + p.divsReceived)), cls(p.realized + p.divsReceived), `Sales ${pv(signedMoney(p.realized))} · Dividends ${pv(money(p.divsReceived))}`],
    ]);
    $("#pfEmpty").hidden = p.rows.length > 0;
    $("#holdingsTable").hidden = !p.rows.length;
    $("#holdingsTable tbody").innerHTML = p.rows.map((r) => `
      <tr class="clickable" data-symbol="${esc(r.symbol)}">
        <td><div class="sym">${avatar(r.symbol)}<div><b>${esc(r.symbol)}</b><span>${esc(r.quote?.name || "")}${acct() === "all" && r.accounts.size ? " · " + esc([...r.accounts].join(", ")) : ""}</span></div></div></td>
        <td class="r pv">${qtyFmt(r.qty)}</td>
        <td class="r">${money(r.avg, r.currency)}</td>
        <td class="r">${money(r.price, r.currency)}</td>
        <td class="r"><span class="tag ${cls(r.dayPct)}">${pct(r.dayPct)}</span></td>
        <td class="r"><b class="pv">${money(r.mvBase)}</b></td>
        <td class="r ${cls(r.gain)}"><span class="pv">${signedMoney(r.gain)}</span><div class="small">${pct(r.gainPct)}</div></td>
        <td class="r">${r.weight.toFixed(1)}%</td>
      </tr>`).join("");
  }

  function txDetails(t) {
    if (t.side === "buy" || t.side === "sell") return `${qtyFmt(t.qty)} @ ${money(t.price, t.currency)}${t.fees ? ` <span class="muted small">+ ${money(t.fees, t.currency)} fees</span>` : ""}`;
    if (t.side === "split") return `${t.ratio >= 1 ? `${num(t.ratio, t.ratio % 1 ? 2 : 0)}-for-1` : `1-for-${num(1 / t.ratio, 0)}`} split`;
    return "";
  }
  function txTotal(t) {
    if (t.side === "buy") return -(t.qty * t.price + (t.fees || 0));
    if (t.side === "sell") return t.qty * t.price - (t.fees || 0);
    if (t.side === "dividend" || t.side === "deposit") return t.amount;
    if (t.side === "withdrawal") return -t.amount;
    return null;
  }
  function renderActivity() {
    setPressed($("#actFilter"), "type", state.actFilter);
    const f = state.actFilter;
    const list = tradesFor().reverse().filter((t) => f === "all" || (f === "trades" && (t.side === "buy" || t.side === "sell")) || (f === "dividend" && t.side === "dividend") || (f === "cash" && (t.side === "deposit" || t.side === "withdrawal")));
    $("#tradesEmpty").hidden = list.length > 0;
    $("#tradesTable").hidden = !list.length;
    const typeCls = { buy: "up", sell: "down", dividend: "t-dividend", split: "t-split", deposit: "t-deposit", withdrawal: "t-withdrawal" };
    $("#tradesTable tbody").innerHTML = list.slice(0, 500).map((t) => {
      const total = txTotal(t);
      return `<tr>
        <td>${esc(t.date)}</td>
        <td><span class="tag ${typeCls[t.side]}">${TYPE_LABEL[t.side]}</span></td>
        <td>${t.symbol ? `<b>${esc(t.symbol)}</b>` : `<span class="muted">${esc(t.currency)} cash</span>`}${t.note ? `<div class="small muted">${esc(t.note)}</div>` : ""}</td>
        <td><span class="tag acct">${esc(t.account)}</span></td>
        <td class="r pv">${txDetails(t)}</td>
        <td class="r"><b class="pv ${total != null ? cls(total) : ""}">${total != null ? signedMoney(total, t.currency) : "—"}</b></td>
        <td class="r"><span class="row-actions">
          <button class="icon-btn" data-edit="${esc(t.id)}" title="Edit" aria-label="Edit ${TYPE_LABEL[t.side]} ${esc(t.symbol || "")} from ${esc(t.date)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg></button>
          <button class="icon-btn" data-delete="${esc(t.id)}" title="Delete" aria-label="Delete ${TYPE_LABEL[t.side]} ${esc(t.symbol || "")} from ${esc(t.date)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg></button>
        </span></td>
      </tr>`;
    }).join("");
  }

  let perfToken = 0;
  async function renderPerformance() {
    setPressed($("#perfRanges"), "range", state.perfRange);
    const token = ++perfToken;
    if (!tradesFor().some((t) => t.side === "buy")) { $("#perfReturn").textContent = "No trades yet"; $("#perfRange").textContent = ""; state.charts.perfChart?.destroy(); state.charts.valueChart?.destroy(); return; }
    $("#perfReturn").innerHTML = `<span class="skeleton" style="display:inline-block;width:90px">&nbsp;</span>`;
    const cmp = $("#perfCompare").value;
    let s;
    try { s = await buildSeries(state.perfRange, cmp ? [cmp] : []); }
    catch (e) { if (token === perfToken) { $("#perfReturn").textContent = "Couldn't load price history"; } return; }
    if (token !== perfToken || !s || s.empty) { if (s?.empty) $("#perfReturn").textContent = "No price history yet"; return; }
    const total = s.twr.at(-1) ?? 0;
    $("#perfReturn").innerHTML = `<span class="${cls(total)}">${pct(total)}</span>`;
    $("#perfRange").textContent = `${fmtDate(s.ts[0])} – today`;
    const accent = css("--accent");
    const ds = [{ label: "Your portfolio", data: s.ts.map((x, i) => ({ x, y: s.twr[i] })), borderColor: accent, fill: true, backgroundColor: (c) => gradient(c, accent) }];
    if (cmp && s.charts[cmp]?.points?.length) {
      const pts = s.charts[cmp].points.filter(([t]) => dkey(t) >= s.keys[0]);
      const b0 = pts[0]?.[1];
      ds.push({ label: $("#perfCompare").selectedOptions[0].textContent, data: pts.map(([t, c]) => ({ x: Date.parse(dkey(t) + "T20:00:00Z"), y: (c / b0 - 1) * 100 })), borderColor: "#ff8a3d", borderDash: [5, 4], fill: false });
    }
    chart("perfChart", { type: "line", data: { datasets: ds }, options: ds.length > 1 ? withLegend(lineOpts({ pctAxis: true })) : lineOpts({ pctAxis: true }) });
    const base = state.data.settings.base;
    chart("valueChart", { type: "line", data: { datasets: [
      { label: "Market value", data: s.ts.map((x, i) => ({ x, y: s.values[i] })), borderColor: accent, fill: true, backgroundColor: (c) => gradient(c, accent) },
      { label: "Net money invested", data: s.ts.map((x, i) => ({ x, y: s.invested[i] })), borderColor: "#7a6cf0", stepped: true, fill: false, borderWidth: 1.5 },
    ] }, options: withLegend(lineOpts({ money: true, cur: base })) });
  }

  async function renderSectors() {
    setPressed($("#sectorFilter"), "group", state.sectorGroup);
    const bench = $("#sectorBench").value;
    const benchName = $("#sectorBench").selectedOptions[0].textContent;
    $("#benchLabel").textContent = benchName; $("#sectorBenchHead").textContent = benchName;
    const p = portfolio();
    await loadMeta([...p.rows.map((r) => r.symbol), bench]);
    if (state.tab !== "portfolio" || state.pfSub !== "sectors") return;
    const mine = Object.fromEntries(groupsFor(p, "sector").map((g) => [g.label, g.value]));
    const bw = state.meta[bench]?.sectorWeights || {};
    const btot = Object.values(bw).reduce((a, b) => a + b, 0) || 1;
    const benchPct = Object.fromEntries(Object.entries(bw).map(([s, v]) => [s, v / btot * 100]));
    const names = [...new Set([...Object.keys(mine), ...Object.keys(benchPct)])].sort((a, b) => (mine[b] || 0) - (mine[a] || 0));
    const draw = (id, obj) => { const ks = names.filter((n) => obj[n] > 0); donut(id, ks, ks.map((k) => obj[k]), ks.map((k) => SECTOR_COLORS[k] || "#9aa5b1")); };
    if (p.rows.length) draw("sectorYou", mine); else state.charts.sectorYou?.destroy();
    draw("sectorBenchChart", benchPct);
    const shown = state.sectorGroup === "all" ? names : names.filter((n) => SUPER[state.sectorGroup].includes(n));
    $("#sectorTable tbody").innerHTML = shown.length ? shown.map((n) => {
      const a = mine[n] || 0, b = benchPct[n] || 0, d = a - b;
      return `<tr><td><span class="row gap"><span class="sw" style="width:10px;height:10px;border-radius:3px;background:${SECTOR_COLORS[n] || "#9aa5b1"}"></span>${esc(n)}</span></td><td class="r"><span class="tag">${a.toFixed(1)}%</span></td><td class="r"><span class="tag" style="background:var(--orange-soft)">${b.toFixed(1)}%</span></td><td class="r ${d > 0.5 ? "up" : d < -0.5 ? "down" : "muted"}">${d > 0 ? "+" : ""}${d.toFixed(1)} pts</td></tr>`;
    }).join("") : `<tr><td colspan="4" class="muted">No sectors in this group.</td></tr>`;
  }

  // ---------- Dividends ----------
  async function renderDividends() {
    const p = portfolio();
    await loadMeta(p.rows.map((r) => r.symbol));
    if (state.pfSub !== "dividends" || state.tab !== "portfolio") return;
    const p2 = portfolio();
    const base = p2.base;
    const divTx = tradesFor().filter((t) => t.side === "dividend");
    const since = new Date(); since.setMonth(since.getMonth() - 11); since.setDate(1);
    const months = []; for (let i = 0; i < 12; i++) { const d = new Date(since); d.setMonth(since.getMonth() + i); months.push(d.toISOString().slice(0, 7)); }
    const byMonth = Object.fromEntries(months.map((m) => [m, 0]));
    let last12 = 0;
    for (const t of divTx) { const m = t.date.slice(0, 7); const v = t.amount * (fx(t.currency) ?? 1); if (m in byMonth) { byMonth[m] += v; last12 += v; } }
    const yieldPort = p2.value ? p2.projIncome / p2.value * 100 : null;
    $("#divKpis").innerHTML = kpiCards([
      ["Projected annual income", pv(money(p2.projIncome)), "", `≈ ${pv(money(p2.projIncome / 12))} a month`],
      ["Portfolio yield", pct(yieldPort, 2, false), "", "Income ÷ market value"],
      ["Yield on cost", pct(p2.cost ? p2.projIncome / p2.cost * 100 : null, 2, false), "", "Income ÷ what you paid"],
      ["Received, last 12 months", pv(money(last12)), "", divTx.length ? `${divTx.length} payment${divTx.length === 1 ? "" : "s"} recorded` : "None recorded yet"],
    ]);
    chart("divChart", {
      type: "bar",
      data: { labels: months.map((m) => new Date(m + "-15").toLocaleDateString("en-CA", { month: "short" })), datasets: [{ label: "Dividends", data: months.map((m) => byMonth[m]), backgroundColor: css("--accent"), borderRadius: 4 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => " " + money(c.parsed.y, base) } } }, scales: { x: { grid: { display: false } }, y: { grid: { color: css("--border") }, border: { display: false }, ticks: { callback: (v) => big(v, base) } } } },
    });
    $("#divReceivedNote").textContent = divTx.length ? "" : "Add the dividends you receive (Add → Dividend received) to fill this chart.";
    const now = Date.now() - 86400000;
    const up = p2.rows.map((r) => ({ r, ex: state.meta[r.symbol]?.exDividendDate })).filter((x) => x.ex && x.ex >= now).sort((a, b) => a.ex - b.ex);
    $("#divUpcoming").innerHTML = up.length ? up.slice(0, 6).map(({ r, ex }) => `<li class="clickable" data-symbol="${esc(r.symbol)}">${avatar(r.symbol)}<div class="grow"><div class="title">${esc(r.symbol)}</div><div class="meta">${isNum(r.dps) ? `${money(r.dps / (r.quote?.dividendFrequency || 4), r.currency)} est. per share` : ""}</div></div><div class="r"><b>${fmtDate(ex, { month: "short", day: "numeric" })}</b></div></li>`).join("") : `<li class="empty-line">No upcoming ex-dividend dates found for your holdings.</li>`;
    const rows = [...p2.rows].sort((a, b) => b.income - a.income);
    $("#divTable tbody").innerHTML = rows.length ? rows.map((r) => `<tr class="clickable" data-symbol="${esc(r.symbol)}">
      <td><div class="sym">${avatar(r.symbol)}<div><b>${esc(r.symbol)}</b><span>${esc(r.quote?.name || "")}</span></div></div></td>
      <td class="r pv">${qtyFmt(r.qty)}</td>
      <td class="r">${isNum(r.dps) && r.dps > 0 ? money(r.dps, r.currency) : "—"}</td>
      <td class="r">${isNum(r.quote?.dividendYield) && r.quote.dividendYield > 0 ? pct(r.quote.dividendYield, 2, false) : "—"}</td>
      <td class="r">${isNum(r.dps) && r.avg ? pct(r.dps / r.avg * 100, 2, false) : "—"}</td>
      <td class="r"><b class="pv">${r.income ? money(r.income) : "—"}</b></td>
      <td class="r pv">${r.divs ? money(r.divs, r.currency) : "—"}</td>
    </tr>`).join("") : `<tr><td colspan="7" class="muted">No holdings yet.</td></tr>`;
  }

  // ---------- Risk ----------
  let riskToken = 0;
  function maxDrawdown(levels) { let peak = -Infinity, mdd = 0, at = 0; const dd = []; levels.forEach((v, i) => { peak = Math.max(peak, v); const d = peak > 0 ? v / peak - 1 : 0; dd.push(d); if (d < mdd) { mdd = d; at = i; } }); return { mdd, at, dd }; }
  async function renderRisk() {
    setPressed($("#riskRanges"), "range", state.riskRange);
    const token = ++riskToken;
    const p = portfolio();
    $("#riskChecks").innerHTML = p.rows.length ? healthChecks(p).map(checkItem).join("") : `<li class="empty-line">Add holdings to see diversification checks.</li>`;
    if (!p.rows.length) { $("#riskKpis").innerHTML = ""; $("#riskTable tbody").innerHTML = ""; $("#corrTable").innerHTML = ""; return; }
    $("#riskKpis").innerHTML = kpiCards(Array.from({ length: 8 }, () => ["&nbsp;", `<span class="skeleton" style="display:inline-block;width:70px">&nbsp;</span>`]));
    let s;
    try { s = await buildSeries(state.riskRange, ["^GSPC"]); } catch { if (token === riskToken) $("#riskKpis").innerHTML = `<p class="muted">Couldn't load price history. Press Refresh to try again.</p>`; return; }
    if (token !== riskToken || !s || s.empty || s.rets.length < 15) { if (token === riskToken) $("#riskKpis").innerHTML = `<p class="muted">Not enough history yet: risk numbers need a few weeks of prices for your holdings.</p>`; return; }
    const rets = s.rets.map((x) => x.r);
    const days = rets.length;
    const totalRet = s.twr.at(-1) / 100;
    const annRet = Math.pow(1 + totalRet, 252 / days) - 1;
    const vol = std(rets) * Math.sqrt(252);
    const irx = state.quotes["^IRX"]?.price; const rf = (isNum(irx) && irx > 0 && irx < 20 ? irx : 4) / 100;
    const down = rets.filter((r) => r < 0); const dd2 = Math.sqrt(down.reduce((a, r) => a + r * r, 0) / Math.max(1, rets.length)) * Math.sqrt(252);
    const sharpe = vol ? (annRet - rf) / vol : null, sortino = dd2 ? (annRet - rf) / dd2 : null;
    const idx = [1]; for (const r of rets) idx.push(idx.at(-1) * (1 + r));
    const { mdd, at, dd } = maxDrawdown(idx);
    const spx = new Map((s.charts["^GSPC"]?.points || []).map(([t, c]) => [dkey(t), c]));
    const pairs = []; for (const x of s.rets) { const i = s.keys.indexOf(x.k); const a = spx.get(s.keys[i - 1]), b = spx.get(x.k); if (a && b) pairs.push([x.r, b / a - 1]); }
    const beta = pairs.length > 10 ? cov(pairs.map((p) => p[0]), pairs.map((p) => p[1])) / (std(pairs.map((p) => p[1])) ** 2) : null;
    const rho = pairs.length > 10 ? corr(pairs.map((p) => p[0]), pairs.map((p) => p[1])) : null;
    const best = s.rets.reduce((a, b) => (b.r > a.r ? b : a)), worst = s.rets.reduce((a, b) => (b.r < a.r ? b : a));
    $("#riskKpis").innerHTML = kpiCards([
      ["Annualized return", pct(annRet * 100), cls(annRet), `${pct(totalRet * 100)} over the period`, RISK_HELP.ret],
      ["Volatility", pct(vol * 100, 1, false), "", vol < .12 ? "Lower than the stock market" : vol < .22 ? "Similar to the stock market" : "Higher than the stock market", RISK_HELP.vol],
      ["Sharpe ratio", num(sharpe), "", `vs ${pct(rf * 100, 1, false)} T-bill`, RISK_HELP.sharpe],
      ["Sortino ratio", num(sortino), "", "Downside risk only", RISK_HELP.sortino],
      ["Max drawdown", pct(mdd * 100, 1), "down", s.rets[at - 1] ? `Low on ${fmtDate(s.rets[at - 1].ts)}` : "", RISK_HELP.mdd],
      ["Beta vs S&P 500", num(beta), "", beta == null ? "" : beta > 1.1 ? "Moves more than the market" : beta < 0.9 ? "Moves less than the market" : "Moves with the market", RISK_HELP.beta],
      ["Correlation with S&P 500", num(rho), "", "", RISK_HELP.corr],
      ["Best / worst day", `<span class="up">${pct(best.r * 100, 1)}</span> / <span class="down">${pct(worst.r * 100, 1)}</span>`, "", `${fmtDate(best.ts, { month: "short", day: "numeric" })} / ${fmtDate(worst.ts, { month: "short", day: "numeric" })}`, RISK_HELP.best],
    ]);
    const red = css("--down");
    const ddOpts = lineOpts({ pctAxis: true }); ddOpts.scales.y.max = 0;
    chart("ddChart", { type: "line", data: { datasets: [{ label: "Drawdown", data: dd.slice(1).map((d, i) => ({ x: s.rets[i].ts, y: d * 100 })), borderColor: red, fill: true, backgroundColor: (c) => gradient(c, red) }] }, options: ddOpts });

    // Per-holding stats
    const symRets = {};
    for (const sym of s.syms) {
      const r = []; let prev = null;
      for (const k of s.keys) { const c = s.priceMaps[sym].get(k); r.push(prev != null && c != null ? c / prev - 1 : null); if (c != null) prev = c; }
      symRets[sym] = r;
    }
    const spxR = s.keys.map((k, i) => { const a = spx.get(s.keys[i - 1]), b = spx.get(k); return a && b ? b / a - 1 : null; });
    const held = p.rows.map((r) => r.symbol).filter((x) => symRets[x]);
    const w = Object.fromEntries(p.rows.map((r) => [r.symbol, r.weight / 100]));
    const clean = (a, b) => { const x = [], y = []; for (let i = 0; i < a.length; i++) if (a[i] != null && b[i] != null) { x.push(a[i]); y.push(b[i]); } return [x, y]; };
    const covM = {};
    for (const a of held) for (const b of held) { const [x, y] = clean(symRets[a], symRets[b]); covM[a + "|" + b] = x.length > 10 ? cov(x, y) : 0; }
    const portVar = held.reduce((sum, a) => sum + held.reduce((s2, b) => s2 + w[a] * w[b] * covM[a + "|" + b], 0), 0);
    const stats = held.map((sym) => {
      const [x, y] = clean(symRets[sym], spxR);
      const prices = s.keys.map((k) => s.priceMaps[sym].get(k)).filter((v) => v != null);
      const ret = prices.length > 1 ? prices.at(-1) / prices[0] - 1 : null;
      const contrib = portVar ? w[sym] * held.reduce((s2, b) => s2 + w[b] * covM[sym + "|" + b], 0) / portVar : null;
      return { sym, w: w[sym], ret, vol: std(symRets[sym].filter((v) => v != null)) * Math.sqrt(252), beta: x.length > 10 ? cov(x, y) / (std(y) ** 2) : null, mdd: maxDrawdown(prices).mdd, contrib };
    });
    $("#riskTable tbody").innerHTML = stats.map((st) => `<tr class="clickable" data-symbol="${esc(st.sym)}">
      <td><div class="sym">${avatar(st.sym)}<b>${esc(st.sym)}</b></div></td>
      <td class="r">${pct(st.w * 100, 1, false)}</td>
      <td class="r ${cls(st.ret)}">${pct(st.ret != null ? st.ret * 100 : null, 1)}</td>
      <td class="r">${pct(st.vol * 100, 1, false)}</td>
      <td class="r">${num(st.beta)}</td>
      <td class="r down">${pct(st.mdd * 100, 1)}</td>
      <td class="r"><div class="row gap" style="justify-content:flex-end"><div class="bar-mini" style="width:70px"><span style="width:${Math.max(0, Math.min(100, (st.contrib || 0) * 100))}%"></span></div>${pct(st.contrib != null ? st.contrib * 100 : null, 0, false)}</div></td>
    </tr>`).join("");
    const top = held.slice(0, 8);
    if (top.length < 2) { $("#corrTable").innerHTML = `<tr><td class="muted" style="color:var(--text-2);width:auto">Add at least two holdings to see how they move together.</td></tr>`; return; }
    const color = (c) => { if (c == null) return "transparent"; const t = Math.max(-1, Math.min(1, c)); return t >= 0 ? `rgba(255,138,61,${0.15 + 0.7 * t})` : `rgba(31,181,164,${0.15 + 0.7 * -t})`; };
    $("#corrTable").innerHTML = `<tr><th></th>${top.map((x) => `<th>${esc(shortSym(x))}</th>`).join("")}</tr>` + top.map((a) => `<tr><th class="rowh">${esc(shortSym(a))}</th>${top.map((b) => { const [x, y] = clean(symRets[a], symRets[b]); const c = a === b ? 1 : x.length > 10 ? corr(x, y) : null; return `<td style="background:${color(c)}" title="${esc(a)} vs ${esc(b)}">${c == null ? "—" : c.toFixed(2)}</td>`; }).join("")}</tr>`).join("");
  }

  // ---------- Rebalance ----------
  function renderRebalance() {
    const p = portfolio();
    setPressed($("#rbMode"), "mode", state.rbMode);
    $("#rbCur").textContent = p.base;
    const targets = state.data.targets;
    const cash = Math.max(0, parseNum($("#rbCash").value) || 0);
    if (!p.rows.length) { $("#rbTable tbody").innerHTML = `<tr><td colspan="7" class="muted">Add holdings to build a rebalancing plan.</td></tr>`; $("#rbTotal").textContent = ""; return; }
    const sumT = p.rows.reduce((s, r) => s + (Number(targets[r.symbol]) || 0), 0);
    const total = p.value + cash;
    const plan = {};
    if (state.rbMode === "full") for (const r of p.rows) plan[r.symbol] = (Number(targets[r.symbol]) || 0) / 100 * total - (r.mvBase || 0);
    else {
      const need = {}; let sumNeed = 0;
      for (const r of p.rows) { need[r.symbol] = Math.max(0, (Number(targets[r.symbol]) || 0) / 100 * total - (r.mvBase || 0)); sumNeed += need[r.symbol]; }
      for (const r of p.rows) plan[r.symbol] = sumNeed > 0 ? need[r.symbol] * Math.min(1, cash / sumNeed) : 0;
    }
    const used = Object.values(plan).reduce((a, b) => a + b, 0);
    $("#rbTotal").innerHTML = `Targets add up to <b class="${Math.abs(sumT - 100) > 0.05 ? "bad" : ""}">${sumT.toFixed(1)}%</b>${Math.abs(sumT - 100) > 0.05 ? " (should be 100%)" : ""}<br>${state.rbMode === "buy" ? `Invests ${pv(money(used))}${cash - used > 0.5 ? ` · ${pv(money(cash - used))} left over` : ""}` : `Net cash needed ${pv(signedMoney(used))}`}`;
    $("#rbTable tbody").innerHTML = p.rows.map((r) => {
      const t = Number(targets[r.symbol]) || 0; const drift = r.weight - t; const amt = plan[r.symbol] || 0;
      const rate = fx(r.currency) ?? 1; const sh = r.price ? amt / (r.price * rate) : null;
      return `<tr>
        <td><div class="sym">${avatar(r.symbol)}<b>${esc(r.symbol)}</b></div></td>
        <td class="r pv">${money(r.mvBase)}</td>
        <td class="r">${r.weight.toFixed(1)}%</td>
        <td class="r"><label class="sr-only" for="tg-${esc(r.symbol)}">Target for ${esc(r.symbol)}</label><input class="target-input" id="tg-${esc(r.symbol)}" data-target="${esc(r.symbol)}" inputmode="decimal" value="${t ? +t.toFixed(2) : ""}" placeholder="0">%</td>
        <td class="r ${Math.abs(drift) < 1 ? "muted" : drift > 0 ? "up" : "down"}">${drift > 0 ? "+" : ""}${drift.toFixed(1)} pts</td>
        <td class="r ${amt > 0.5 ? "act-buy" : amt < -0.5 ? "act-sell" : "muted"}">${Math.abs(amt) < 0.5 ? "Hold" : `${amt > 0 ? "Buy" : "Sell"} <span class="pv">${money(Math.abs(amt))}</span>`}</td>
        <td class="r">${sh != null && Math.abs(amt) >= 0.5 ? qtyFmt(Math.abs(Math.round(sh * 100) / 100)) : "—"}</td>
      </tr>`;
    }).join("");
  }

  // ---------- Tax report (realized gains with ACB) ----------
  function realizedGains() {
    const pools = {}; const sales = [];
    for (const t of sortedTrades()) {
      if (!t.symbol) continue;
      const sheltered = SHELTERED.test(t.account);
      const key = sheltered ? `${t.account}|${t.symbol}` : `taxable|${t.symbol}`;
      const p = (pools[key] ||= { qty: 0, acb: 0 });
      if (t.side === "buy") { p.qty += t.qty; p.acb += t.qty * t.price + (t.fees || 0); }
      else if (t.side === "split") { p.qty *= t.ratio || 1; }
      else if (t.side === "sell") {
        const q = Math.min(t.qty, p.qty); const per = p.qty ? p.acb / p.qty : 0;
        const acbSold = per * q; const proceeds = q * t.price - (t.fees || 0);
        sales.push({ date: t.date, symbol: t.symbol, account: t.account, qty: q, proceeds, acb: acbSold, gain: proceeds - acbSold, currency: t.currency, sheltered });
        p.qty -= q; p.acb -= acbSold; if (p.qty < 1e-9) { p.qty = 0; p.acb = 0; }
      }
    }
    return sales;
  }
  function renderGains() {
    const all = realizedGains();
    const years = [...new Set(all.map((s) => s.date.slice(0, 4)))].sort().reverse();
    const thisYear = String(new Date().getFullYear());
    if (!years.includes(thisYear)) years.unshift(thisYear);
    if (!state.gainsYear) state.gainsYear = thisYear;
    $("#gainsYear").innerHTML = years.map((y) => `<option ${y === state.gainsYear ? "selected" : ""}>${y}</option>`).join("") + `<option value="all" ${state.gainsYear === "all" ? "selected" : ""}>All years</option>`;
    const list = all.filter((s) => (state.gainsYear === "all" || s.date.startsWith(state.gainsYear)) && (acct() === "all" || s.account === acct()));
    const tax = list.filter((s) => !s.sheltered), shel = list.filter((s) => s.sheltered);
    const sumBy = (arr, f) => { const o = {}; for (const s of arr) o[s.currency] = (o[s.currency] || 0) + f(s); return o; };
    const fmtCur = (o) => Object.keys(o).length ? Object.entries(o).map(([c, v]) => signedMoney(v, c)).join(" + ") : money(0);
    const gainsT = sumBy(tax, (s) => s.gain);
    const losses = sumBy(tax.filter((s) => s.gain < 0), (s) => s.gain);
    $("#gainsKpis").innerHTML = kpiCards([
      ["Taxable capital gains", pv(fmtCur(gainsT)), "", "Net of losses, taxable accounts"],
      ["Capital losses", pv(fmtCur(losses)), "", "Can offset gains"],
      ["Tax-sheltered gains", pv(fmtCur(sumBy(shel, (s) => s.gain))), "", "TFSA, RRSP, FHSA, RESP"],
      ["Sales", String(list.length), "", state.gainsYear === "all" ? "All years" : `In ${state.gainsYear}`],
    ]);
    $("#gainsEmpty").hidden = list.length > 0; $("#gainsTable").hidden = !list.length;
    $("#gainsTable tbody").innerHTML = list.slice().reverse().map((s) => `<tr>
      <td>${esc(s.date)}</td><td><b>${esc(s.symbol)}</b></td>
      <td><span class="tag acct">${esc(s.account)}</span>${s.sheltered ? ` <span class="tag">Sheltered</span>` : ""}</td>
      <td class="r pv">${qtyFmt(s.qty)}</td><td class="r pv">${money(s.proceeds, s.currency)}</td><td class="r pv">${money(s.acb, s.currency)}</td>
      <td class="r ${cls(s.gain)}"><b class="pv">${signedMoney(s.gain, s.currency)}</b></td></tr>`).join("");
    state.gainsList = list;
  }

  // ---------- Watchlist, alerts, earnings, compare ----------
  function renderMarkets() {
    setPressed($("#mkSeg"), "sub", state.mkSub);
    $$("#view-markets .sub-view").forEach((v) => (v.hidden = v.dataset.sub !== state.mkSub));
    ({ watchlist: renderWatchlist, alerts: renderAlerts, earnings: renderEarnings, compare: renderCompare })[state.mkSub]?.();
  }
  function renderWatchlist() {
    const wl = state.data.watchlist;
    $("#watchEmpty").hidden = wl.length > 0; $("#watchTable").hidden = !wl.length;
    const alertsBy = {}; for (const a of state.data.alerts) if (!a.triggered) alertsBy[a.symbol] = (alertsBy[a.symbol] || 0) + 1;
    $("#watchTable tbody").innerHTML = wl.map((s) => {
      const q = state.quotes[s] || {}; const m = state.meta[s] || {};
      const lo = q.low52, hi = q.high52; const posn = isNum(lo) && isNum(hi) && hi > lo && isNum(q.price) ? Math.max(0, Math.min(100, (q.price - lo) / (hi - lo) * 100)) : null;
      const next = (m.earnings?.dates || []).find((t) => t > Date.now() - 86400000);
      return `<tr class="clickable" data-symbol="${esc(s)}">
        <td><div class="sym">${avatar(s)}<div><b>${esc(s)}</b><span>${esc(q.name || "")}</span></div></div></td>
        <td class="r"><b>${money(q.price, q.currency)}</b></td>
        <td class="r"><span class="tag ${cls(q.changePct)}">${pct(q.changePct)}</span></td>
        <td>${posn != null ? `<div class="range52"><i style="left:${posn}%"></i></div><div class="range52-l"><span>${num(lo)}</span><span>${num(hi)}</span></div>` : "—"}</td>
        <td class="r">${num(q.pe, 1)}</td>
        <td class="r">${isNum(q.dividendYield) && q.dividendYield > 0 ? pct(q.dividendYield, 2, false) : "—"}</td>
        <td class="r">${big(q.marketCap, q.currency)}</td>
        <td class="r">${next ? fmtDate(next, { month: "short", day: "numeric" }) : "—"}</td>
        <td class="r"><span class="row-actions">
          <button class="icon-btn ${alertsBy[s] ? "bell-on" : ""}" data-alert-for="${esc(s)}" title="${alertsBy[s] ? `${alertsBy[s]} active alert${alertsBy[s] > 1 ? "s" : ""}` : "Set price alert"}" aria-label="Set price alert for ${esc(s)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg></button>
          <button class="icon-btn" data-unwatch="${esc(s)}" title="Remove from watchlist" aria-label="Remove ${esc(s)} from watchlist"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
        </span></td></tr>`;
    }).join("");
    if (wl.some((s) => !state.meta[s])) loadMeta(wl).then(() => state.tab === "markets" && state.mkSub === "watchlist" && renderWatchlist());
  }
  function alertItem(a) {
    const q = state.quotes[a.symbol];
    const dist = q?.price ? (a.price / q.price - 1) * 100 : null;
    return `<li class="${a.triggered ? "alert-hit" : ""}">${avatar(a.symbol)}<div class="grow"><div class="title">${esc(a.symbol)} ${a.dir === "above" ? "above" : "below"} ${money(a.price, q?.currency || "USD")}</div><div class="meta">${a.triggered ? `Triggered ${fmtDate(a.triggered, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : q?.price ? `Now ${money(q.price, q.currency)} · ${pct(Math.abs(dist), 1, false)} away` : "Waiting for price"}</div></div><button class="icon-btn" data-del-alert="${esc(a.id)}" title="Delete alert" aria-label="Delete alert for ${esc(a.symbol)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></li>`;
  }
  function renderAlerts() {
    const list = [...state.data.alerts].sort((a, b) => (a.triggered ? 1 : 0) - (b.triggered ? 1 : 0));
    $("#alertList").innerHTML = list.length ? list.map(alertItem).join("") : `<li class="empty-line">No alerts yet.</li>`;
    const nb = $("#notifyBox");
    if (!("Notification" in window)) nb.textContent = "Alerts appear as pop-up messages while the dashboard is open.";
    else if (Notification.permission === "granted") nb.textContent = "Desktop notifications are on.";
    else if (Notification.permission === "denied") nb.textContent = "Notifications are blocked in your browser settings, so alerts show as pop-up messages in the dashboard.";
    else nb.innerHTML = `<button class="btn" id="notifyBtn">Turn on desktop notifications</button>`;
  }
  function checkAlerts() {
    let changed = false;
    for (const a of state.data.alerts) {
      if (a.triggered) continue;
      const p = state.quotes[a.symbol]?.price; if (!isNum(p)) continue;
      if ((a.dir === "above" && p >= a.price) || (a.dir === "below" && p <= a.price)) {
        a.triggered = Date.now(); changed = true;
        const msg = `${a.symbol} is ${a.dir} ${num(a.price)}: now ${num(p)}`;
        toast("🔔 " + msg);
        try { if ("Notification" in window && Notification.permission === "granted") new Notification("Price alert", { body: msg, icon: "icon-192.png" }); } catch { /* ignore */ }
      }
    }
    if (changed) save();
  }

  function earningsRows() {
    const held = new Set(Object.values(computeHoldings()).filter((h) => h.qty > 0).map((h) => h.symbol));
    const watch = new Set(state.data.watchlist);
    const start = Date.now() - 86400000;
    return [...new Set([...held, ...watch])].map((s) => {
      const m = state.meta[s];
      const date = (m?.earnings?.dates || []).find((t) => t >= start) || null;
      return { symbol: s, name: m?.name || state.quotes[s]?.name || s, date, eps: m?.earnings?.epsEstimate, rev: m?.earnings?.revenueEstimate, currency: m?.currency, type: m?.type, inHoldings: held.has(s), inWatch: watch.has(s), loaded: !!m };
    }).sort((a, b) => (a.date || Infinity) - (b.date || Infinity));
  }
  async function renderEarnings() {
    setPressed($("#earnScope"), "scope", state.earnScope);
    const syms = metaSymbols();
    if (syms.some((s) => !state.meta[s])) { $("#earnList").innerHTML = `<article class="card flush"><ul class="list" style="padding:16px">${skeletonList(4)}</ul></article>`; await loadMeta(syms); if (state.tab !== "markets" || state.mkSub !== "earnings") return; }
    let rows = earningsRows();
    if (state.earnScope === "holdings") rows = rows.filter((r) => r.inHoldings);
    if (state.earnScope === "watchlist") rows = rows.filter((r) => r.inWatch);
    if (!rows.length) { $("#earnList").innerHTML = `<div class="card empty"><p>Nothing here yet. Add holdings or watchlist tickers to see their earnings dates.</p></div>`; return; }
    const weekOf = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };
    const thisWeek = weekOf(Date.now());
    const groups = new Map();
    for (const r of rows) { const k = r.date ? weekOf(r.date) : "none"; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
    $("#earnList").innerHTML = [...groups.entries()].map(([k, list]) => {
      const title = k === "none" ? "Date not announced / no earnings (ETFs)" : k === thisWeek ? "This week" : k === thisWeek + 7 * 86400000 ? "Next week" : "Week of " + fmtDate(k, { month: "long", day: "numeric" });
      return `<section class="earn-week"><h3>${title}</h3><article class="card flush">${list.map((r) => `
        <div class="earn-row" data-symbol="${esc(r.symbol)}" role="button" tabindex="0">
          <div class="earn-date">${r.date ? `<span>${fmtDate(r.date, { weekday: "short" })}</span><b>${new Date(r.date).getDate()}</b><span>${fmtDate(r.date, { month: "short" })}</span>` : avatar(r.symbol)}</div>
          <div class="grow" style="min-width:0"><div class="row gap"><b>${esc(r.symbol)}</b>${r.inHoldings ? `<span class="tag up">Holding</span>` : ""}${r.inWatch && !r.inHoldings ? `<span class="tag">Watchlist</span>` : ""}</div><div class="small muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.name)}</div></div>
          <div class="earn-est">EPS est.<b>${isNum(r.eps) ? num(r.eps) : "—"}</b></div>
          <div class="earn-est rev">Revenue est.<b>${big(r.rev, r.currency)}</b></div>
        </div>`).join("")}</article></section>`;
    }).join("");
  }

  let cmpToken = 0;
  async function renderCompare() {
    setPressed($("#cmpRanges"), "range", state.cmpRange);
    const syms = state.data.compare.slice(0, 4);
    $("#compareChips").innerHTML = syms.map((s, i) => `<button class="chip-ticker" aria-pressed="true" data-uncompare="${esc(s)}" title="Remove ${esc(s)}"><span class="sw" style="width:8px;height:8px;border-radius:50%;display:inline-block;background:${PALETTE[i]}"></span>${esc(s)} ✕</button>`).join("") || `<span class="muted small">Add up to four tickers to compare them side by side.</span>`;
    const token = ++cmpToken;
    if (!syms.length) { state.charts.cmpChart?.destroy(); $("#cmpTable").innerHTML = ""; return; }
    try {
      const [c, ...stocks] = await Promise.all([api("charts", { symbols: syms.join(","), range: state.cmpRange }), ...syms.map((s) => state.stockCache[s] ? Promise.resolve(state.stockCache[s]) : api("stock", { symbol: s }).catch(() => null))]);
      if (token !== cmpToken) return;
      stocks.forEach((d, i) => d && (state.stockCache[syms[i]] = d));
      const ds = syms.map((s, i) => { const pts = c.charts[s]?.points || []; const b = pts[0]?.[1]; return { label: s, data: pts.map(([x, y]) => ({ x, y: (y / b - 1) * 100 })), borderColor: PALETTE[i], fill: false }; });
      chart("cmpChart", { type: "line", data: { datasets: ds }, options: withLegend(lineOpts({ pctAxis: true })) });
      const S = (d, f) => (d ? f(d) : "—");
      const rows = [
        ["Price", (d) => money(d.price, d.currency)], ["Market cap", (d) => big(d.stats.marketCap ?? d.stats.netAssets, d.currency)],
        ["P/E (TTM)", (d) => num(d.stats.trailingPE)], ["Forward P/E", (d) => num(d.stats.forwardPE)], ["PEG", (d) => num(d.stats.peg)],
        ["Price/Sales", (d) => num(d.stats.priceToSales)], ["Price/Book", (d) => num(d.stats.priceToBook)],
        ["Profit margin", (d) => ratioPct(d.stats.profitMargin)], ["Return on equity", (d) => ratioPct(d.stats.roe)],
        ["Revenue growth", (d) => ratioPct(d.stats.revenueGrowth)], ["Debt/Equity", (d) => isNum(d.stats.debtToEquity) ? num(d.stats.debtToEquity, 0) + "%" : "—"],
        ["Dividend yield", (d) => ratioPct(d.stats.dividendYield, 2)], ["Beta", (d) => num(d.stats.beta)],
        ["Analyst view", (d) => { const m = d.analyst?.recommendationMean; return m ? `${m <= 1.5 ? "Strong buy" : m <= 2.5 ? "Buy" : m <= 3.5 ? "Hold" : "Sell"} (${m.toFixed(1)})` : "—"; }],
        ["Target upside", (d) => (d.analyst?.targetMean && d.price ? pct((d.analyst.targetMean / d.price - 1) * 100, 1) : "—")],
      ];
      $("#cmpTable").innerHTML = `<thead><tr><th></th>${syms.map((s, i) => `<th class="r"><span style="color:${PALETTE[i]}">●</span> ${esc(s)}</th>`).join("")}</tr></thead><tbody>${rows.map(([l, f]) => `<tr><td class="muted">${l}</td>${stocks.map((d) => `<td class="r">${S(d, f)}</td>`).join("")}</tr>`).join("")}</tbody>`;
    } catch (e) { if (token === cmpToken) $("#cmpTable").innerHTML = `<tbody><tr><td class="muted">Couldn't load comparison data. Press Refresh to try again.</td></tr></tbody>`; }
  }

  // ---------- Research ----------
  function openResearch(sym) { if (!sym) return; state.research.symbol = sym; state.research.data = null; goto("research"); }
  async function renderResearch() {
    const chips = [...new Set([...symbolsNeeded().held, ...state.data.watchlist])];
    $("#watchChips").innerHTML = chips.map((s) => `<button class="chip-ticker" data-symbol="${esc(s)}" aria-pressed="${s === state.research.symbol}">${esc(s)}</button>`).join("");
    const sym = state.research.symbol;
    $("#researchEmpty").hidden = !!sym; $("#researchContent").hidden = !sym;
    if (!sym) return;
    $("#searchInput").value = sym;
    const inWatch = state.data.watchlist.includes(sym);
    $("#rsWatch").textContent = inWatch ? "Remove from watchlist" : "Add to watchlist";
    const h = computeHoldings(null, "all")[sym];
    $("#rsPosition").innerHTML = h?.qty > 0 ? `You own <span class="pv">${qtyFmt(h.qty)}</span> shares · average cost ${money(h.cost / h.qty, h.currency)}` : "";
    if (!state.research.data || state.research.data.symbol !== sym) {
      $("#rsName").textContent = sym; $("#rsPrice").innerHTML = `<span class="skeleton" style="display:inline-block;width:120px">&nbsp;</span>`; $("#rsChange").textContent = "";
      ["#rsAnalyst", "#rsEarnings", "#rsRatios", "#rsAbout"].forEach((s) => ($(s).innerHTML = `<div class="skeleton" style="height:120px"></div>`));
      $("#rsChanges").innerHTML = skeletonList(3); $("#rsNews").innerHTML = skeletonList(3);
      renderResearchChart();
      try {
        const [d, q, n] = await Promise.all([api("stock", { symbol: sym }), api("quotes", { symbols: sym }).catch(() => null), api("news", { symbols: sym, general: "0" }).catch(() => ({ news: [] }))]);
        if (state.research.symbol !== sym) return;
        if (q?.quotes?.[sym]) state.quotes[sym] = q.quotes[sym];
        state.research.data = d; state.research.news = n.news; state.stockCache[sym] = d;
      } catch (e) {
        if (state.research.symbol !== sym) return;
        $("#rsName").textContent = sym; $("#rsPrice").textContent = ""; $("#rsMeta").textContent = "";
        $("#rsAnalyst").innerHTML = $("#rsEarnings").innerHTML = $("#rsRatios").innerHTML = "";
        $("#rsChanges").innerHTML = $("#rsNews").innerHTML = "";
        $("#rsAbout").innerHTML = `<p>We couldn't find <b>${esc(sym)}</b>. Check the ticker (Canadian listings end in .TO) or search by company name.</p>`;
        return;
      }
    }
    const d = state.research.data; const q = state.quotes[sym] || {};
    const price = q.price ?? d.price, change = q.change ?? d.change, changePct = q.changePct ?? d.changePct;
    $("#rsMeta").textContent = [d.exchange, d.currency, d.type === "ETF" ? "ETF" : d.sector].filter(Boolean).join(" · ");
    $("#rsName").textContent = `${d.name} (${sym})`;
    $("#rsPrice").textContent = money(price, d.currency);
    $("#rsChange").innerHTML = `<span class="chg ${cls(change)}">${signedMoney(change, d.currency)} (${pct(changePct)})</span>`;
    renderAnalyst(d, price); renderEarningsCard(d); renderRatios(d); renderAbout(d);
    $("#rsChanges").innerHTML = d.analyst?.changes?.length ? d.analyst.changes.slice(0, 8).map((c) => {
      const verb = c.action === "up" ? "Upgraded" : c.action === "down" ? "Downgraded" : c.action === "init" ? "Initiated" : c.action === "reit" ? "Reiterated" : "Maintained";
      return `<li><div class="grow"><div class="title">${esc(c.firm)}</div><div class="meta">${verb}${c.from && c.from !== c.to ? ` from ${esc(c.from)}` : ""} to <b>${esc(c.to || "—")}</b></div></div><div class="meta">${fmtDate(c.date, { month: "short", day: "numeric" })}</div></li>`;
    }).join("") : `<li class="empty-line">No recent rating changes${d.type === "ETF" ? " (ETFs aren't rated by analysts)" : ""}.</li>`;
    $("#rsNews").innerHTML = newsItems(state.research.news || []);
  }
  async function renderResearchChart() {
    const sym = state.research.symbol, range = state.research.range;
    setPressed($("#rsRanges"), "range", range);
    try {
      const r = await api("charts", { symbols: sym, range });
      if (state.research.symbol !== sym || state.research.range !== range) return;
      const c = r.charts[sym]; if (!c?.points?.length) { state.charts.rsChart?.destroy(); return; }
      const first = c.points[0][1], lastP = c.points.at(-1)[1];
      const color = lastP >= first ? css("--up") : css("--down");
      const datasets = [{ label: sym, data: c.points.map(([x, y]) => ({ x, y })), borderColor: color, fill: true, backgroundColor: (ctx) => gradient(ctx, color) }];
      const h = computeHoldings(null, "all")[sym];
      if (h?.qty > 0 && range !== "1d" && range !== "5d") datasets.push({ label: "Your average cost", data: [{ x: c.points[0][0], y: h.cost / h.qty }, { x: c.points.at(-1)[0], y: h.cost / h.qty }], borderColor: css("--text-3"), borderDash: [4, 4], borderWidth: 1, fill: false, pointRadius: 0 });
      chart("rsChart", { type: "line", data: { datasets }, options: lineOpts({ money: true, cur: c.currency, time: range === "1d" || range === "5d" }) });
    } catch (e) { console.warn(e); }
  }
  function renderAnalyst(d, price) {
    const a = d.analyst || {};
    if (!a.recommendationMean && !a.targetMean && !a.trend?.length) {
      $("#rsAnalyst").innerHTML = `<p class="muted">${d.type === "ETF" ? "ETFs don't get analyst ratings. Check the sector mix and top holdings under Fund details." : "No analyst coverage found for this company."}</p>`;
      $("#rsAnalystCount").textContent = ""; return;
    }
    $("#rsAnalystCount").textContent = a.analysts ? `${a.analysts} analysts` : "";
    const mean = a.recommendationMean;
    const label = !mean ? (a.recommendation || "—") : mean <= 1.5 ? "Strong buy" : mean <= 2.5 ? "Buy" : mean <= 3.5 ? "Hold" : mean <= 4.5 ? "Sell" : "Strong sell";
    const pos = mean ? ((mean - 1) / 4) * 100 : null;
    let html = `<div class="consensus"><span class="rating ${mean && mean <= 2.5 ? "up" : mean > 3.5 ? "down" : ""}">${label}</span>${mean ? `<span class="muted small">Average score ${mean.toFixed(2)} on a 1 (strong buy) to 5 (strong sell) scale</span>` : ""}</div>`;
    if (pos != null) html += `<div class="gauge"><span class="needle" style="left:${pos}%"></span></div><div class="gauge-labels"><span>Strong buy</span><span>Buy</span><span>Hold</span><span>Sell</span><span>Strong sell</span></div>`;
    if (a.targetMean && a.targetLow && a.targetHigh && price) {
      const lo = Math.min(a.targetLow, price), hi = Math.max(a.targetHigh, price), span = hi - lo || 1;
      const x = (v) => ((v - lo) / span) * 100;
      const up = (a.targetMean / price - 1) * 100;
      html += `<div class="target"><div class="row gap wrap"><b>Price target ${money(a.targetMean, d.currency)}</b><span class="tag ${cls(up)}">${pct(up, 1)} ${up >= 0 ? "upside" : "downside"}</span></div>
        <div class="target-bar"><span class="fill" style="left:${x(a.targetLow)}%;width:${x(a.targetHigh) - x(a.targetLow)}%"></span>
          <span class="mark avg" style="left:${x(a.targetMean)}%" title="Average target"></span><span class="mark cur" style="left:${x(price)}%" title="Current price"></span>
          <span class="lbl top" style="left:${x(price)}%">Now ${money(price, d.currency)}</span>
          <span class="lbl bot" style="left:${Math.max(8, x(a.targetLow))}%">Low ${money(a.targetLow, d.currency, 0)}</span>
          <span class="lbl bot" style="left:${Math.min(92, x(a.targetHigh))}%">High ${money(a.targetHigh, d.currency, 0)}</span></div></div>`;
    }
    if (a.trend?.length) {
      const cols = [["strongBuy", "#12996b", "Strong buy"], ["buy", "#7ccf9e", "Buy"], ["hold", "#f2d36b", "Hold"], ["sell", "#f5935c", "Sell"], ["strongSell", "#d9443b", "Strong sell"]];
      const lbl = (p) => (p === "0m" ? "This month" : p.replace("-", "").replace("m", " mo ago"));
      html += `<div class="trend-bars">${a.trend.slice(0, 4).map((t) => { const tot = cols.reduce((s, [k]) => s + t[k], 0) || 1; return `<div class="trend-row"><span>${lbl(t.period)}</span><div class="stack-bar" title="${cols.map(([k, , n]) => `${n}: ${t[k]}`).join(", ")}">${cols.map(([k, c]) => `<span style="width:${t[k] / tot * 100}%;background:${c}"></span>`).join("")}</div></div>`; }).join("")}</div>
        <div class="trend-key">${cols.map(([, c, n]) => `<span><i style="background:${c}"></i>${n}</span>`).join("")}</div>`;
    }
    html += `<p class="small muted" style="margin-top:12px">Source: Yahoo Finance analyst consensus.</p>`;
    $("#rsAnalyst").innerHTML = html;
  }
  function renderEarningsCard(d) {
    const e = d.earnings || {};
    if (d.type === "ETF" || (!e.next?.length && !e.history?.length)) { $("#rsEarnings").innerHTML = `<p class="muted">${d.type === "ETF" ? "ETFs don't report earnings." : "No earnings data available."}</p>`; return; }
    const next = e.next?.[0];
    const days = next ? Math.ceil((next - Date.now()) / 86400000) : null;
    let html = `<dl class="kv">
      <dt>Next report</dt><dd>${next ? fmtDate(next) + (days != null && days >= 0 ? ` <span class="tag">${days === 0 ? "today" : `in ${days}d`}</span>` : "") : "Not announced"}</dd>
      <dt>EPS estimate</dt><dd>${isNum(e.epsEstimate) ? money(e.epsEstimate, d.currency) : "—"}${isNum(e.epsLow) ? ` <span class="small muted">(${num(e.epsLow)}–${num(e.epsHigh)})</span>` : ""}</dd>
      <dt>Revenue estimate</dt><dd>${big(e.revenueEstimate, d.currency)}</dd>
      ${e.exDividendDate ? `<dt>Ex-dividend date</dt><dd>${fmtDate(e.exDividendDate)}</dd>` : ""}
    </dl>`;
    if (e.history?.length) {
      html += `<div class="chart-box" style="height:170px;margin-top:14px"><canvas id="rsEpsChart" aria-label="Earnings per share: actual vs estimate"></canvas></div>`;
      const beats = e.history.filter((h) => isNum(h.actual) && isNum(h.estimate) && h.actual >= h.estimate).length;
      html += `<p class="small muted">Beat estimates in ${beats} of the last ${e.history.length} quarters.</p>`;
    }
    $("#rsEarnings").innerHTML = html;
    if (e.history?.length) {
      chart("rsEpsChart", { type: "bar", data: { labels: e.history.map((h) => h.quarter), datasets: [
        { label: "Estimate", data: e.history.map((h) => h.estimate), backgroundColor: css("--border"), borderRadius: 4 },
        { label: "Actual", data: e.history.map((h) => h.actual), backgroundColor: e.history.map((h) => (h.actual >= h.estimate ? css("--up") : css("--down"))), borderRadius: 4 },
      ] }, options: { maintainAspectRatio: false, plugins: { legend: { position: "top", align: "start", labels: { boxWidth: 10 } } }, scales: { x: { grid: { display: false } }, y: { grid: { color: css("--border") }, border: { display: false } } } } });
    }
  }
  let showRatioHelp = false;
  function renderRatios(d) {
    const s = d.stats || {}; const R = Explain.RATIOS; const c = d.currency;
    const item = (label, key, v) => `<div class="ratio-item"><div class="ratio"><span>${label}</span><span class="rv">${v}</span></div>${showRatioHelp && R[key] ? `<span class="ratio-help">${R[key]}</span>` : ""}</div>`;
    const groups = d.type === "ETF" ? [
      ["Fund", [["Net assets", "", big(s.netAssets, c)], ["Expense ratio", "expenseRatio", ratioPct(d.fund?.expenseRatio, 2)], ["Yield", "dividendYield", ratioPct(s.dividendYield, 2)], ["P/E (holdings)", "trailingPE", num(s.trailingPE)]]],
      ["Returns & risk", [["YTD return", "", ratioPct(s.ytdReturn)], ["3-yr avg return", "", ratioPct(s.threeYearReturn)], ["Beta", "beta", num(s.beta)], ["52-week range", "", `${num(s.low52)} – ${num(s.high52)}`]]],
    ] : [
      ["Valuation", [["P/E (TTM)", "trailingPE", num(s.trailingPE)], ["Forward P/E", "forwardPE", num(s.forwardPE)], ["PEG", "peg", num(s.peg)], ["Price/Book", "priceToBook", num(s.priceToBook)], ["Price/Sales", "priceToSales", num(s.priceToSales)], ["EV/EBITDA", "evToEbitda", num(s.evToEbitda)]]],
      ["Profitability", [["Gross margin", "grossMargin", ratioPct(s.grossMargin)], ["Operating margin", "operatingMargin", ratioPct(s.operatingMargin)], ["Profit margin", "profitMargin", ratioPct(s.profitMargin)], ["Return on equity", "roe", ratioPct(s.roe)], ["Return on assets", "roa", ratioPct(s.roa)]]],
      ["Financial health", [["Debt/Equity", "debtToEquity", isNum(s.debtToEquity) ? num(s.debtToEquity, 1) + "%" : "—"], ["Current ratio", "currentRatio", num(s.currentRatio)], ["Quick ratio", "quickRatio", num(s.quickRatio)], ["Cash", "", big(s.totalCash, c)], ["Debt", "", big(s.totalDebt, c)], ["Free cash flow", "", big(s.freeCashflow, c)]]],
      ["Growth & dividends", [["Revenue growth (YoY)", "revenueGrowth", ratioPct(s.revenueGrowth)], ["Earnings growth (YoY)", "earningsGrowth", ratioPct(s.earningsGrowth)], ["EPS (TTM)", "eps", num(s.eps)], ["Dividend yield", "dividendYield", ratioPct(s.dividendYield, 2)], ["Payout ratio", "payoutRatio", ratioPct(s.payoutRatio)]]],
      ["Trading", [["Market cap", "", big(s.marketCap, c)], ["Beta", "beta", num(s.beta)], ["52-week range", "", `${num(s.low52)} – ${num(s.high52)}`], ["Avg volume", "", big(s.avgVolume)], ["Short ratio (days)", "", num(s.shortRatio)]]],
    ];
    $("#rsRatios").innerHTML = groups.map(([h, items]) => `<div class="ratio-group"><h3>${h}</h3>${items.map(([l, k, v]) => item(l, k, v)).join("")}</div>`).join("");
    $("#ratioHelpBtn").textContent = showRatioHelp ? "Hide explanations" : "What do these mean?";
    $("#ratioHelpBtn").setAttribute("aria-expanded", String(showRatioHelp));
  }
  function renderAbout(d) {
    let html = "";
    if (d.fund) {
      $("#rsAboutTitle").textContent = "Fund details";
      html += `<dl class="kv">${d.fund.family ? `<dt>Fund family</dt><dd>${esc(d.fund.family)}</dd>` : ""}${d.fund.category ? `<dt>Category</dt><dd>${esc(d.fund.category)}</dd>` : ""}</dl>`;
      if (d.fund.holdings?.length) html += `<h3 class="eyebrow" style="margin:12px 0 6px">Top holdings</h3><dl class="kv">${d.fund.holdings.map((h) => `<dt>${esc(h.name || h.symbol)}</dt><dd>${ratioPct(h.weight)}</dd>`).join("")}</dl>`;
    } else $("#rsAboutTitle").textContent = "About";
    if (d.industry) html += `<p><b>${esc(d.sector || "")}</b>${d.industry ? " · " + esc(d.industry) : ""}${d.employees ? ` · ${d.employees.toLocaleString()} employees` : ""}</p>`;
    if (d.summary) html += `<p>${esc(d.summary)}</p>`;
    if (d.website) html += `<p><a href="${esc(d.website)}" target="_blank" rel="noopener noreferrer">${esc(d.website.replace(/^https?:\/\//, ""))}</a></p>`;
    $("#rsAbout").innerHTML = html || `<p class="muted">No description available.</p>`;
  }

  // ---------- News & calendar ----------
  function renderNews() {
    setPressed($("#newsSeg"), "sub", state.newsSub);
    $$("#view-news .sub-view").forEach((v) => (v.hidden = v.dataset.sub !== state.newsSub));
    if (state.newsSub === "calendar") renderCalendar(); else renderHeadlines();
  }
  const dayKeyLocal = (t) => new Date(t).toLocaleDateString("en-CA");
  function renderCalendar() {
    const st = state.data.settings;
    $$("#impactFilter button").forEach((b) => b.setAttribute("aria-pressed", String(st.impacts.includes(b.dataset.impact))));
    if (!state.events) { $("#eventList").innerHTML = `<li style="padding:16px">${skeletonList(4)}</li>`; return; }
    if (!state.events.length) { $("#eventList").innerHTML = `<li class="empty">The economic calendar didn't load. Press Refresh in a minute to try again.</li>`; $("#dayTabs").innerHTML = ""; return; }
    const countries = [...new Set(state.events.map((e) => e.country))].sort((a, b) => (a === "USD" ? -1 : b === "USD" ? 1 : a === "CAD" ? -1 : b === "CAD" ? 1 : a.localeCompare(b)));
    $("#countryFilter").innerHTML = countries.map((c) => `<button data-country="${esc(c)}" aria-pressed="${st.countries.includes(c)}" title="${esc(Explain.COUNTRY[c] || c)}">${esc(c)}</button>`).join("");
    const filtered = state.events.filter((e) => st.impacts.includes(e.impact) && st.countries.includes(e.country));
    const days = [...new Set(state.events.map((e) => dayKeyLocal(e.time)))].sort();
    const today = todayISO();
    if (!state.calDay || !days.includes(state.calDay)) state.calDay = days.includes(today) ? today : days.find((d) => d > today) || days[0];
    $("#dayTabs").innerHTML = days.map((k) => {
      const d = new Date(k + "T12:00:00");
      const n = filtered.filter((e) => dayKeyLocal(e.time) === k).length;
      return `<button role="tab" data-day="${k}" aria-selected="${k === state.calDay}"><small>${k === today ? "Today" : d.toLocaleDateString("en-CA", { weekday: "short" })}</small><b>${d.getDate()}</b><span class="count">${n} event${n === 1 ? "" : "s"}</span></button>`;
    }).join("");
    const list = filtered.filter((e) => dayKeyLocal(e.time) === state.calDay).sort((a, b) => a.time - b.time);
    if (!list.length) { $("#eventList").innerHTML = `<li class="empty">No events match your filters on this day. Try turning on more currencies or impact levels.</li>`; return; }
    const now = Date.now(); let placedNow = state.calDay !== today;
    $("#eventList").innerHTML = list.map((e) => {
      let pre = "";
      if (!placedNow && e.time > now) { pre = `<li class="now-line">Now · ${new Date().toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" })}</li>`; placedNow = true; }
      const ex = Explain.explainEvent(e.title);
      const allDay = new Date(e.time).getHours() === 0 && new Date(e.time).getMinutes() === 0 && e.impact === "Holiday";
      return pre + `<li><button class="event ${e.time < now ? "past" : ""}" aria-expanded="false" data-event="${esc(e.id)}">
        <span class="e-time">${allDay ? "All day" : new Date(e.time).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" })}</span>
        <span class="e-cur"><i class="dot ${e.impact.toLowerCase()}" title="${esc(e.impact)} impact"></i>${esc(e.country)}</span>
        <span class="e-title">${esc(e.title)}</span>
        <span class="e-nums">${e.actual ? `<span>Actual<b>${esc(e.actual)}</b></span>` : ""}<span>Forecast<b>${esc(e.forecast || "—")}</b></span><span>Previous<b>${esc(e.previous || "—")}</b></span></span>
      </button><div class="event-detail" hidden><b>${esc(ex?.name || e.title)} · ${esc(Explain.COUNTRY[e.country] || e.country)}.</b> ${esc(ex?.text || "A scheduled economic release. Compare the result with the forecast: bigger surprises tend to move markets more.")} ${e.impact === "High" ? "Rated <b>high impact</b>: these often move markets." : ""}</div></li>`;
    }).join("") + (!placedNow ? `<li class="now-line">Now · ${new Date().toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" })}</li>` : "");
  }
  const MACRO_RE = /\bfed\b|federal reserve|powell|inflation|\bcpi\b|jobs|payroll|unemployment|gdp|interest rate|bank of canada|yield|treasur|tariff|recession|economy/i;
  function renderHeadlines() {
    setPressed($("#newsFilter"), "filter", state.newsFilter);
    if (!state.news) { $("#newsList").innerHTML = skeletonList(6); return; }
    const held = symbolsNeeded().held;
    let list = state.news;
    if (state.newsFilter === "mine") list = list.filter((n) => (n.tickers || []).some((t) => held.includes(t)) || held.includes(n.query));
    if (state.newsFilter === "macro") list = list.filter((n) => MACRO_RE.test(n.title));
    $("#newsList").innerHTML = list.length ? newsItems(list.slice(0, 50)) : `<li class="empty-line">${state.newsFilter === "mine" ? "No recent headlines for your holdings." : "No headlines match this filter."}</li>`;
  }

  // ---------- Recap ----------
  function renderRecap() {
    setPressed($("#recapRange"), "period", state.recapPeriod);
    if (!state.market) { $("#recapHeadline").textContent = "Loading market data…"; $("#recapNarrative").innerHTML = `<div class="skeleton" style="height:120px"></div>`; return; }
    const rc = Recap.build({ series: state.market, events: state.events || [], news: state.news || [], period: state.recapPeriod });
    if (!rc) { $("#recapHeadline").textContent = "Market data isn't available right now."; $("#recapNarrative").innerHTML = "<p>Press Refresh in a minute to try again.</p>"; return; }
    $("#recapPeriodLabel").textContent = rc.label;
    $("#recapHeadline").textContent = rc.headline;
    $("#recapNarrative").innerHTML = rc.narrative;
    renderRecapMine(rc);
    $("#recapIndices").innerHTML = rc.indices.map((i) => `<li><div class="grow"><div class="title">${esc(i.name)}</div><div class="meta">${num(i.level, 0)}</div></div><span class="tag ${cls(i.change)}">${pct(i.change)}</span></li>`).join("");
    const maxAbs = Math.max(1, ...rc.sectors.map((s) => Math.abs(s.change)));
    $("#recapSectors").innerHTML = rc.sectors.map((s) => { const w = Math.abs(s.change) / maxAbs * 50; return `<div class="bar-row"><span>${esc(s.name)}</span><div class="bar-track"><span style="${s.change >= 0 ? `left:50%` : `left:${50 - w}%`};width:${w}%;background:${s.change >= 0 ? css("--up") : css("--down")}"></span></div><span class="bv ${cls(s.change)}">${pct(s.change, 1)}</span></div>`; }).join("");
    $("#recapMacro").innerHTML = rc.macro.map((m) => `<li><div class="grow"><div class="title">${esc(m.name)}</div><div class="meta">${m.symbol === "^TNX" ? num(m.level) + "%" : num(m.level, m.level > 1000 ? 0 : m.symbol === "USDCAD=X" ? 4 : 2)}</div></div><span class="tag ${cls(m.change)}">${m.points ? `${m.change >= 0 ? "+" : "−"}${Math.abs(m.change ?? 0).toFixed(2)} pts` : pct(m.change)}</span></li>`).join("");
    $("#recapDays").innerHTML = rc.days.slice().reverse().map((d) => `<li><div class="grow"><div class="title">${new Date(d.key + "T12:00:00Z").toLocaleDateString("en-CA", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" })}</div><div class="meta">${d.events.length ? esc([...new Set(d.events.map((e) => (e.country === "CAD" ? "🇨🇦 " : "🇺🇸 ") + e.title))].join(" · ")) : "No high-impact US/Canada releases"}</div></div><div class="r"><div class="${cls(d.spx)}"><b>${pct(d.spx)}</b></div><div class="meta">TSX ${pct(d.tsx)}</div></div></li>`).join("") || `<li class="empty-line">No sessions in this period yet.</li>`;
    $("#recapNews").innerHTML = newsItems(rc.news);
    const ds = ["^GSPC", "^GSPTSE", "^IXIC"].map((sym, i) => {
      const s = state.market.find((x) => x.symbol === sym); if (!s) return null;
      const pts = s.points.filter(([t]) => dkey(t) >= rc.chart.fromKey); const b = pts[0]?.[1];
      return { label: s.name, data: pts.map(([t, c]) => ({ x: Date.parse(dkey(t) + "T20:00:00Z"), y: (c / b - 1) * 100 })), borderColor: [css("--accent"), "#ff8a3d", "#7a6cf0"][i], fill: false };
    }).filter(Boolean);
    const o = withLegend(lineOpts({ pctAxis: true }));
    o.elements.point.radius = state.recapPeriod === "month" ? 0 : 3;
    chart("recapChart", { type: "line", data: { datasets: ds }, options: o });
  }
  let recapMineToken = 0;
  async function renderRecapMine(rc) {
    const box = $("#recapMine");
    if (!portfolio().rows.length) { box.innerHTML = ""; return; }
    const token = ++recapMineToken;
    box.innerHTML = `<h3>Your portfolio</h3><p class="muted">Calculating…</p>`;
    try {
      const s = await buildSeries("3mo");
      if (token !== recapMineToken || !s || s.empty) { box.innerHTML = ""; return; }
      const i0 = s.keys.findIndex((k) => k >= rc.chart.fromKey); const a = s.twr[Math.max(0, i0)], b = s.twr.at(-1);
      const mine = ((1 + b / 100) / (1 + a / 100) - 1) * 100;
      const spx = rc.indices.find((x) => x.symbol === "^GSPC")?.change;
      const p = portfolio();
      const contrib = p.rows.map((r) => { const pts = s.priceMaps[r.symbol]; const p0 = pts?.get(s.keys[Math.max(0, i0)]), p1 = pts?.get(s.keys.at(-1)); return { sym: r.symbol, ch: p0 && p1 ? (p1 / p0 - 1) * 100 : null, w: r.weight }; }).filter((x) => x.ch != null).sort((x, y) => x.ch * x.w - y.ch * y.w);
      const worst = contrib[0], best = contrib.at(-1);
      box.innerHTML = `<h3>Your portfolio</h3><p>Your holdings ${mine >= 0 ? "gained" : "lost"} <b class="${cls(mine)}">${pct(mine)}</b> over the same period${isNum(spx) ? `, ${mine > spx ? "ahead of" : "behind"} the S&P 500 (${pct(spx)})` : ""}.${best && best.ch > 0 ? ` Biggest help: <b>${esc(best.sym)}</b> (${pct(best.ch, 1)}).` : ""}${worst && worst.ch < 0 ? ` Biggest drag: <b>${esc(worst.sym)}</b> (${pct(worst.ch, 1)}).` : ""}</p>`;
    } catch { if (token === recapMineToken) box.innerHTML = ""; }
  }

  // ---------- Ticker search (autocomplete) ----------
  let searchTimer, searchSeq = 0;
  function attachTickerSearch(input) {
    input.setAttribute("list", "tickerList");
    input.addEventListener("input", () => {
      clearTimeout(searchTimer);
      const q = input.value.trim();
      if (q.length < 2) return;
      searchTimer = setTimeout(async () => {
        const seq = ++searchSeq;
        try {
          const r = await api("search", { q });
          if (seq !== searchSeq) return;
          $("#tickerList").innerHTML = (r.results || []).map((x) => `<option value="${esc(x.symbol)}">${esc(x.name || "")}${x.exchange ? " · " + esc(x.exchange) : ""}</option>`).join("");
        } catch { /* search is optional */ }
      }, 220);
    });
  }
  // Resolve a typed company name to a ticker when it isn't one already.
  async function resolveTicker(text) {
    const t = text.trim();
    if (/^[\^A-Z0-9.\-=]{1,12}$/.test(t)) return t;
    try { const r = await api("search", { q: t }); return r.results?.[0]?.symbol || t.toUpperCase(); } catch { return t.toUpperCase(); }
  }

  // ---------- Transaction drawer ----------
  let lastFocus = null, symbolQuote = null, editingId = null;
  function openDrawer(id) { lastFocus = document.activeElement; $("#scrim").hidden = false; $(id).hidden = false; setTimeout(() => $(`${id} select, ${id} input`)?.focus(), 30); }
  function closeDrawers() { $$(".drawer").forEach((d) => (d.hidden = true)); $("#scrim").hidden = true; lastFocus?.focus?.(); }
  const ttype = () => $("#tType").value;
  function showFieldsFor(type) {
    $$("#tradeForm [data-for-types]").forEach((el) => (el.hidden = !el.dataset.forTypes.split(" ").includes(type)));
    $("#tAmountLabel").textContent = type === "dividend" ? "Total amount received" : type === "deposit" ? "Amount deposited" : "Amount withdrawn";
    $("#tAmountHint").textContent = type === "dividend" ? "The total cash paid to you, not the per-share amount." : "";
    $("#tradeTitle").textContent = `${editingId ? "Edit" : "Add"} ${({ buy: "buy", sell: "sell", dividend: "dividend", split: "stock split", deposit: "deposit", withdrawal: "withdrawal" })[type]}`;
    $("#tSellAll").hidden = type !== "sell";
    updateTotal();
  }
  function openTrade(prefill = {}) {
    const f = $("#tradeForm"); f.reset();
    $$(".error", f).forEach((e) => (e.textContent = "")); $$("input", f).forEach((i) => i.removeAttribute("aria-invalid"));
    editingId = prefill.id || null;
    $("#tAccount").innerHTML = state.data.accounts.map((a) => `<option>${esc(a)}</option>`).join("");
    $("#tAccount").value = prefill.account || (acct() !== "all" ? acct() : state.data.settings.lastAccount || state.data.accounts[0]);
    $("#tType").value = prefill.side || "buy";
    $("#tDate").value = prefill.date || todayISO(); $("#tDate").max = todayISO();
    $("#tFees").value = prefill.fees ?? "0";
    for (const [id, k] of [["#tSymbol", "symbol"], ["#tQty", "qty"], ["#tPrice", "price"], ["#tAmount", "amount"], ["#tRatio", "ratio"], ["#tNote", "note"]]) if (prefill[k] != null) $(id).value = prefill[k];
    if (prefill.currency) $("#tCurrency").value = prefill.currency;
    $("#tSymbolHint").textContent = "Type a ticker or company name. Canadian listings end in .TO"; $("#tUseLast").hidden = true; symbolQuote = null;
    $("#tDelete").hidden = !editingId;
    showFieldsFor($("#tType").value);
    if (prefill.symbol && !editingId) lookupSymbol();
    openDrawer("#tradeDrawer");
  }
  async function lookupSymbol() {
    const raw = $("#tSymbol").value.trim(); if (!raw) return;
    const sym = await resolveTicker(raw); $("#tSymbol").value = sym;
    if (!editingId) $("#tCurrency").value = /\.(TO|V|NE|CN)$/.test(sym) ? "CAD" : "USD";
    try {
      const r = await api("quotes", { symbols: sym });
      const q = r.quotes[sym];
      if ($("#tSymbol").value.trim().toUpperCase() !== sym) return;
      if (!q || !isNum(q.price)) { setErr("tSymbol", `We couldn't find ${sym}. Check the ticker, or type the company name. Canadian listings end in .TO.`); symbolQuote = null; $("#tUseLast").hidden = true; return; }
      symbolQuote = q; state.quotes[sym] = q; setErr("tSymbol", "");
      if (!editingId && q.currency && [...$("#tCurrency").options].some((o) => o.value === q.currency)) $("#tCurrency").value = q.currency;
      $("#tSymbolHint").textContent = `${q.name} · last ${money(q.price, q.currency)}`;
      $("#tUseLast").hidden = !["buy", "sell"].includes(ttype());
    } catch { $("#tSymbolHint").textContent = "Couldn't check this ticker right now. You can still save."; }
  }
  function setErr(id, msg) { const e = $(`.error[data-for="${id}"]`); if (e) e.textContent = msg; $("#" + id)?.setAttribute("aria-invalid", msg ? "true" : "false"); }
  function updateTotal() {
    const t = ttype(); const cur = $("#tCurrency").value;
    const q = parseNum($("#tQty").value), p = parseNum($("#tPrice").value), f = parseNum($("#tFees").value || 0), a = parseNum($("#tAmount").value);
    let html = "";
    if (t === "buy" || t === "sell") html = q > 0 && p > 0 ? `${t === "buy" ? "Total cost" : "Proceeds"}: <b>${money(q * p + (t === "buy" ? 1 : -1) * (isFinite(f) ? f : 0), cur)}</b>` : `Enter shares and price to see the ${t === "buy" ? "total cost" : "proceeds"}.`;
    else if (t === "dividend") { const h = computeHoldings($("#tDate").value, $("#tAccount").value, editingId)[$("#tSymbol").value.trim().toUpperCase()]; html = a > 0 && h?.qty ? `That's <b>${money(a / h.qty, cur)}</b> per share on ${qtyFmt(h.qty)} shares.` : "Dividends count toward your total return and the Dividends page."; }
    else if (t === "split") html = "Splits change your share count, not your cost or value.";
    else html = "Recording deposits turns on cash tracking for this account.";
    $("#tTotal").innerHTML = html;
  }
  function validate(field) {
    const t = ttype(); const sym = $("#tSymbol").value.trim().toUpperCase(), date = $("#tDate").value, account = $("#tAccount").value;
    const q = parseNum($("#tQty").value), p = parseNum($("#tPrice").value), f = parseNum($("#tFees").value || 0), a = parseNum($("#tAmount").value), r = parseNum($("#tRatio").value);
    const needsSym = ["buy", "sell", "dividend", "split"].includes(t);
    const checks = {
      tSymbol: () => (!needsSym ? "" : !sym ? "Enter a ticker symbol." : !/^[A-Z0-9.\-^=]{1,20}$/.test(sym) ? "Use the ticker, e.g. AAPL or RY.TO." : ""),
      tDate: () => (!date ? "Pick the date." : date > todayISO() ? "The date can't be in the future." : ""),
      tQty: () => {
        if (t !== "buy" && t !== "sell") return "";
        if (!(q > 0)) return "Enter how many shares (more than 0).";
        if (t === "sell") { const held = computeHoldings(date || todayISO(), account, editingId)[sym]?.qty || 0; if (q > held + 1e-9) return held > 0 ? `You held ${qtyFmt(held)} ${sym} in ${account} on that date.` : `There are no ${sym} shares in ${account} on that date. Check the account or date.`; }
        return "";
      },
      tPrice: () => ((t === "buy" || t === "sell") && !(p > 0) ? "Enter the price per share." : ""),
      tFees: () => ((t === "buy" || t === "sell") && !(f >= 0) ? "Fees can't be negative." : ""),
      tAmount: () => (["dividend", "deposit", "withdrawal"].includes(t) && !(a > 0) ? "Enter an amount above 0." : ""),
      tRatio: () => (t === "split" && !(r > 0) ? "Enter how many new shares you get for each old share, e.g. 2." : ""),
    };
    const ids = field ? [field] : Object.keys(checks);
    let ok = true;
    for (const id of ids) { const m = checks[id](); setErr(id, m); if (m) ok = false; }
    return ok;
  }
  async function submitTrade(ev) {
    ev.preventDefault();
    const raw = $("#tSymbol").value.trim();
    if (raw && ["buy", "sell", "dividend", "split"].includes(ttype())) $("#tSymbol").value = await resolveTicker(raw);
    if (!validate()) { $('#tradeForm [aria-invalid="true"]')?.focus(); return; }
    const t = ttype();
    const base = { id: editingId || uid(), side: t, date: $("#tDate").value, account: $("#tAccount").value, note: $("#tNote").value.trim(), created: editingId ? state.data.trades.find((x) => x.id === editingId)?.created ?? Date.now() : Date.now() };
    let tx;
    if (t === "buy" || t === "sell") tx = { ...base, symbol: $("#tSymbol").value.trim().toUpperCase(), qty: parseNum($("#tQty").value), price: parseNum($("#tPrice").value), fees: parseNum($("#tFees").value || 0) || 0, currency: $("#tCurrency").value };
    else if (t === "dividend") tx = { ...base, symbol: $("#tSymbol").value.trim().toUpperCase(), amount: parseNum($("#tAmount").value), currency: $("#tCurrency").value };
    else if (t === "split") tx = { ...base, symbol: $("#tSymbol").value.trim().toUpperCase(), ratio: parseNum($("#tRatio").value), currency: (computeHoldings(null, "all")[$("#tSymbol").value.trim().toUpperCase()]?.currency) || $("#tCurrency").value };
    else tx = { ...base, amount: parseNum($("#tAmount").value), currency: $("#tCurrency").value };
    if (editingId) state.data.trades = state.data.trades.map((x) => (x.id === editingId ? tx : x));
    else state.data.trades.push(tx);
    state.data.settings.lastAccount = tx.account;
    save(); closeDrawers();
    toast(editingId ? "Transaction updated" : `${TYPE_LABEL[t]}${tx.symbol ? " " + tx.symbol : ""} saved`);
    if (tx.symbol && !state.meta[tx.symbol]) loadMeta([tx.symbol]).then(renderCurrent);
    renderCurrent(); loadQuotes().then(renderCurrent);
  }
  async function deleteTx(id) {
    const tr = state.data.trades.find((x) => x.id === id); if (!tr) return;
    if (await confirmDialog({ title: "Delete this transaction?", text: `${TYPE_LABEL[tr.side]}${tr.symbol ? " " + tr.symbol : ""} on ${tr.date} (${tr.account}) will be removed and your holdings recalculated.`, ok: "Delete transaction" })) {
      state.data.trades = state.data.trades.filter((x) => x.id !== tr.id); save(); closeDrawers(); toast("Transaction deleted"); renderCurrent();
    }
  }

  // ---------- Confirm dialog ----------
  function confirmDialog({ title, text, ok }) {
    return new Promise((resolve) => {
      const d = $("#confirmDialog"); $("#confirmTitle").textContent = title; $("#confirmText").textContent = text; $("#confirmOk").textContent = ok;
      const prev = document.activeElement; d.hidden = false; $("#confirmCancel").focus();
      const done = (v) => { d.hidden = true; $("#confirmOk").onclick = $("#confirmCancel").onclick = null; prev?.focus?.(); resolve(v); };
      $("#confirmOk").onclick = () => done(true); $("#confirmCancel").onclick = () => done(false);
      d.onkeydown = (e) => { if (e.key === "Escape") done(false); };
    });
  }

  // ---------- Sample portfolio ----------
  async function loadSample() {
    if (state.data.trades.length && !(await confirmDialog({ title: "Add sample transactions?", text: "Sample transactions will be added alongside yours. You can delete them from Portfolio → Activity.", ok: "Add sample" }))) return;
    const plan = [["VFV.TO", 30, 240, "CAD", "TFSA"], ["XIC.TO", 60, 200, "CAD", "TFSA"], ["RY.TO", 12, 160, "CAD", "Non-registered"], ["ENB.TO", 25, 120, "CAD", "Non-registered"], ["AAPL", 10, 230, "USD", "RRSP"], ["MSFT", 5, 90, "USD", "RRSP"], ["SU.TO", 30, 300, "CAD", "Non-registered"], ["NVDA", 8, 45, "USD", "TFSA"]];
    try {
      const r = await api("charts", { symbols: plan.map((p) => p[0]).join(","), range: "2y" });
      const out = []; const now = Date.now();
      for (const a of ["TFSA", "RRSP", "Non-registered"]) if (!state.data.accounts.includes(a)) state.data.accounts.push(a);
      for (const [s, qty, daysAgo, cur, account] of plan) {
        const pts = r.charts[s]?.points; if (!pts?.length) continue;
        const idx = Math.max(0, pts.length - 1 - Math.round(daysAgo * 252 / 365));
        out.push({ id: "sample-" + s, side: "buy", symbol: s, date: dkey(pts[idx][0]), qty, price: +pts[idx][1].toFixed(2), fees: 9.99, currency: r.charts[s].currency || cur, account, note: "Sample", created: now });
      }
      const su = r.charts["SU.TO"]?.points;
      if (su?.length > 40) out.push({ id: "sample-SU.TO-sell", side: "sell", symbol: "SU.TO", date: dkey(su.at(-30)[0]), qty: 10, price: +su.at(-30)[1].toFixed(2), fees: 9.99, currency: "CAD", account: "Non-registered", note: "Sample", created: now });
      const d1 = new Date(); d1.setMonth(d1.getMonth() - 2);
      for (let i = 0; i < 4; i++) { const d = new Date(); d.setMonth(d.getMonth() - 1 - i * 3); out.push({ id: "sample-div-ry-" + i, side: "dividend", symbol: "RY.TO", date: d.toLocaleDateString("en-CA"), amount: 18.48, currency: "CAD", account: "Non-registered", note: "Sample", created: now }); }
      for (let i = 0; i < 4; i++) { const d = new Date(); d.setMonth(d.getMonth() - 2 - i * 3); out.push({ id: "sample-div-enb-" + i, side: "dividend", symbol: "ENB.TO", date: d.toLocaleDateString("en-CA"), amount: 23.06, currency: "CAD", account: "Non-registered", note: "Sample", created: now }); }
      state.data.trades = state.data.trades.filter((t) => !String(t.id).startsWith("sample-")).concat(out);
      if (!Object.keys(state.data.targets).length) state.data.targets = { "VFV.TO": 30, "XIC.TO": 25, "RY.TO": 8, "ENB.TO": 7, "AAPL": 10, "MSFT": 8, "SU.TO": 4, "NVDA": 8 };
      save(); toast("Sample portfolio loaded"); await loadQuotes(); renderCurrent();
      loadMeta(out.map((t) => t.symbol)).then(renderCurrent);
    } catch (e) { toast("Couldn't load sample prices right now. Try again in a minute."); }
  }

  // ---------- CSV import / export ----------
  const CSV_COLS = ["date", "type", "symbol", "quantity", "price", "fees", "currency", "account", "amount", "ratio", "note"];
  const csvCell = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  function exportCsv() {
    const rows = sortedTrades().map((t) => [t.date, t.side, t.symbol || "", t.qty ?? "", t.price ?? "", t.fees ?? "", t.currency, t.account, t.amount ?? "", t.ratio ?? "", t.note || ""]);
    download(`portfolio-transactions-${todayISO()}.csv`, [CSV_COLS, ...rows].map((r) => r.map(csvCell).join(",")).join("\n"));
  }
  function parseCsv(text) {
    const rows = []; let row = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true;
      else if (c === "," || c === ";" && !text.slice(0, 200).includes(",")) { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((c) => c.trim() !== ""));
  }
  function normDate(s) {
    s = String(s || "").trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (m) { const [a, b, y] = [+m[1], +m[2], m[3]]; const [mo, d] = a > 12 ? [b, a] : [a, b]; return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`; }
    const t = Date.parse(s); return isNaN(t) ? null : new Date(t).toLocaleDateString("en-CA");
  }
  async function importCsv(file) {
    const rows = parseCsv(await file.text());
    if (rows.length < 2) { toast("That file has no rows to import."); return; }
    const head = rows[0].map((h) => h.trim().toLowerCase().replace(/[^a-z]/g, ""));
    const idx = (...names) => head.findIndex((h) => names.includes(h));
    const col = { date: idx("date", "tradedate", "transactiondate", "settlementdate"), type: idx("type", "action", "side", "transactiontype", "activity"), symbol: idx("symbol", "ticker", "security"), qty: idx("quantity", "qty", "shares", "units"), price: idx("price", "unitprice", "priceshare", "pricepershare"), fees: idx("fees", "fee", "commission", "commissions"), currency: idx("currency", "cur", "ccy"), account: idx("account", "accounttype", "accountname"), amount: idx("amount", "netamount", "total", "value"), ratio: idx("ratio", "splitratio"), note: idx("note", "notes", "description", "memo") };
    if (col.date < 0 || col.symbol < 0 && col.amount < 0) { toast("Couldn't find the columns. Download the template from Settings to see the format."); return; }
    const typeOf = (s) => { s = String(s || "buy").toLowerCase(); if (/buy|bought|purchase/.test(s)) return "buy"; if (/sell|sold/.test(s)) return "sell"; if (/div/.test(s)) return "dividend"; if (/split/.test(s)) return "split"; if (/withdraw/.test(s)) return "withdrawal"; if (/deposit|contribution|transfer in/.test(s)) return "deposit"; return null; };
    const out = []; const skipped = [];
    rows.slice(1).forEach((r, i) => {
      const g = (k) => (col[k] >= 0 ? (r[col[k]] ?? "").trim() : "");
      const side = typeOf(g("type")); const date = normDate(g("date"));
      const symbol = g("symbol").toUpperCase(); const currency = (g("currency") || (/\.(TO|V|NE|CN)$/.test(symbol) ? "CAD" : "USD")).toUpperCase();
      const account = g("account") || "Non-registered";
      const qty = Math.abs(parseNum(g("qty"))), price = Math.abs(parseNum(g("price"))), fees = Math.abs(parseNum(g("fees"))) || 0, amount = Math.abs(parseNum(g("amount"))), ratio = parseNum(g("ratio"));
      let t = null;
      if (!side || !date) t = null;
      else if ((side === "buy" || side === "sell") && symbol && qty > 0 && price > 0) t = { side, symbol, qty, price, fees };
      else if (side === "dividend" && symbol && amount > 0) t = { side, symbol, amount };
      else if (side === "split" && symbol && ratio > 0) t = { side, symbol, ratio };
      else if ((side === "deposit" || side === "withdrawal") && amount > 0) t = { side, amount };
      if (!t) { skipped.push(i + 2); return; }
      out.push({ ...t, id: uid(), date, currency, account, note: g("note"), created: Date.now() + i });
    });
    if (!out.length) { toast(`No rows could be imported. Check rows ${skipped.slice(0, 5).join(", ")}.`); return; }
    if (!(await confirmDialog({ title: `Import ${out.length} transaction${out.length === 1 ? "" : "s"}?`, text: `${out.length} rows are ready to add to your existing transactions.${skipped.length ? ` ${skipped.length} row${skipped.length === 1 ? "" : "s"} will be skipped because a date, type, symbol or amount was missing (rows ${skipped.slice(0, 8).join(", ")}${skipped.length > 8 ? "…" : ""}).` : ""}`, ok: "Import" }))) return;
    state.data.trades.push(...out);
    for (const a of new Set(out.map((t) => t.account))) if (!state.data.accounts.includes(a)) state.data.accounts.push(a);
    save(); toast(`Imported ${out.length} transaction${out.length === 1 ? "" : "s"}`);
    await loadQuotes(); renderCurrent(); loadMeta(out.filter((t) => t.symbol).map((t) => t.symbol)).then(renderCurrent);
  }
  function csvTemplate() {
    download("portfolio-import-template.csv", [CSV_COLS, ["2025-03-14", "buy", "VFV.TO", "10", "130.50", "0", "CAD", "TFSA", "", "", "Monthly contribution"], ["2025-04-01", "dividend", "VFV.TO", "", "", "", "CAD", "TFSA", "3.95", "", ""], ["2025-05-02", "sell", "AAPL", "2", "205.10", "4.95", "USD", "Non-registered", "", "", ""], ["2025-01-02", "deposit", "", "", "", "", "CAD", "TFSA", "7000", "", "TFSA contribution"]].map((r) => r.map(csvCell).join(",")).join("\n"));
  }

  // ---------- Profiles ----------
  function renderProfiles() {
    const p = readProfiles();
    $("#sProfiles").innerHTML = p.list.map((x) => `<li><span class="grow">${esc(x.name)}${x.id === p.active ? ` <span class="tag up">In use</span>` : ""}</span>${x.id === p.active ? "" : `<button class="btn" data-switch-profile="${esc(x.id)}">Switch</button><button class="icon-btn" data-del-profile="${esc(x.id)}" title="Delete profile" aria-label="Delete ${esc(x.name)} profile"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg></button>`}</li>`).join("");
    const chip = $("#profileChip"); const cur = p.list.find((x) => x.id === p.active);
    chip.hidden = p.list.length < 2; chip.textContent = cur?.name || "Me";
  }
  function switchProfile(id) { const p = readProfiles(); p.active = id; writeProfiles(p); location.reload(); }
  async function deleteProfile(id) {
    const p = readProfiles(); const x = p.list.find((y) => y.id === id); if (!x) return;
    if (!(await confirmDialog({ title: `Delete ${x.name}'s profile?`, text: `All of ${x.name}'s transactions, watchlist and alerts will be removed from this browser. Download a backup from that profile first if you might need it.`, ok: "Delete profile" }))) return;
    p.list = p.list.filter((y) => y.id !== id); writeProfiles(p);
    try { localStorage.removeItem(keyFor(id)); } catch { /* ignore */ }
    renderProfiles(); toast(`${x.name}'s profile deleted`);
  }

  // ---------- Settings ----------
  function renderSettingsAccounts() {
    const used = new Set(state.data.trades.map((t) => t.account));
    $("#sAccounts").innerHTML = state.data.accounts.map((a) => `<li><span class="grow">${esc(a)}${SHELTERED.test(a) ? ` <span class="tag">Tax-sheltered</span>` : ""}</span><span class="muted small">${state.data.trades.filter((t) => t.account === a).length} transactions</span>${used.has(a) ? "" : `<button class="icon-btn" data-del-account="${esc(a)}" title="Remove account" aria-label="Remove ${esc(a)} account"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>`}</li>`).join("");
  }
  function openSettings() {
    $("#sBase").value = state.data.settings.base;
    $("#sStatus").innerHTML = state.demo ? "Demo mode: the live data service wasn't found. Deploy to Vercel to switch on live data." : `Live data connected.${state.quotesAt ? ` Prices updated ${new Date(state.quotesAt).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" })}.` : ""}`;
    renderSettingsAccounts(); renderProfiles(); applyTheme(false); renderInstall();
    openDrawer("#settingsDrawer");
  }
  function exportBackup() {
    download(`portfolio-backup-${todayISO()}.json`, JSON.stringify({ app: "portfolio-dashboard", version: 2, exported: new Date().toISOString(), ...state.data }, null, 2), "application/json");
  }
  async function importBackup(file) {
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.trades) || data.trades.some((t) => !t.date || !t.side)) throw new Error("This file doesn't look like a portfolio backup.");
      if (!(await confirmDialog({ title: "Restore this backup?", text: `This replaces your current ${state.data.trades.length} transactions with ${data.trades.length} from the backup.`, ok: "Replace with backup" }))) return;
      state.data = migrate({ ...structuredClone(DEFAULTS), ...data, settings: { ...DEFAULTS.settings, ...(data.settings || {}) } });
      delete state.data.app; delete state.data.version; delete state.data.exported;
      save(); closeDrawers(); toast("Backup restored"); refreshAll();
    } catch (e) { toast(e.message.includes("JSON") ? "That file couldn't be read. Choose a backup .json file downloaded from this app." : e.message); }
  }

  // ---------- Theme & privacy ----------
  const darkQuery = matchMedia("(prefers-color-scheme: dark)");
  function effectiveTheme() { const t = state.data.settings.theme; return t === "light" || t === "dark" ? t : darkQuery.matches ? "dark" : "light"; }
  function applyTheme(rerender = true) {
    const t = state.data.settings.theme;
    if (t === "light" || t === "dark") document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
    $$("#sTheme [data-theme-choice]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.themeChoice === (t || "system"))));
    let meta = document.querySelector('meta[name="theme-color"]:not([media])');
    if (!meta) { meta = document.createElement("meta"); meta.name = "theme-color"; document.head.appendChild(meta); }
    meta.content = effectiveTheme() === "dark" ? "#0f1417" : "#f4f6f7";
    const lbl = effectiveTheme() === "dark" ? "Switch to light mode" : "Switch to dark mode";
    $("#themeBtn").setAttribute("aria-label", lbl); $("#themeBtn").title = lbl + " (T)";
    if (rerender) requestAnimationFrame(() => renderCurrent());
  }
  function setTheme(t) { state.data.settings.theme = t; save(); applyTheme(); }
  function applyPrivacy() {
    const on = !!state.data.settings.privacy;
    document.documentElement.classList.toggle("privacy", on);
    $("#privacyBtn").setAttribute("aria-pressed", String(on));
    const lbl = on ? "Show balances" : "Hide balances"; $("#privacyBtn").title = lbl + " (H)"; $("#privacyBtn").setAttribute("aria-label", lbl);
  }
  function togglePrivacy() { state.data.settings.privacy = !state.data.settings.privacy; save(); applyPrivacy(); toast(state.data.settings.privacy ? "Balances hidden" : "Balances shown"); }

  // ---------- Install ----------
  let installPrompt = null;
  const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  function device() {
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
    if (/Android/.test(ua)) return "android";
    if (/Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua)) return "mac-safari";
    return "desktop";
  }
  function renderInstall() {
    const steps = $("#installSteps"), text = $("#installText"), btn = $("#sInstall");
    btn.hidden = !installPrompt; $("#installBtn").hidden = !installPrompt;
    if (location.protocol === "file:") { text.textContent = "You're previewing the files directly. Open your Vercel address to install the dashboard."; steps.innerHTML = ""; return; }
    if (isStandalone()) { text.textContent = "You're using the installed app. Open it any time from its icon."; steps.innerHTML = ""; btn.hidden = true; return; }
    const S = {
      ios: ["Open this page in Safari.", "Tap the Share button (on newer iPhones it's under the ••• button).", "Tap View More if needed, then Add to Home Screen.", "Tap Add. Open Portfolio from your home screen."],
      android: ["Open this page in Chrome.", "Tap the ⋮ menu in the top-right corner.", "Tap Install app or Add to home screen, then Install.", "Open Portfolio from your home screen."],
      "mac-safari": ["In Safari's menu bar, choose File → Add to Dock.", "Click Add. Open Portfolio from your Dock or Launchpad."],
      desktop: ["In Chrome or Edge, click the ⋮ menu in the top-right corner.", "Choose Install Portfolio Dashboard… (in Chrome it may be under Cast, save, and share).", "Click Install. It opens in its own window and appears with your other apps."],
    }[device()];
    text.textContent = installPrompt ? "Click the button to install, or follow these steps:" : "Add the dashboard to your home screen or desktop so it opens in its own window, like any other app:";
    steps.innerHTML = S.map((x) => `<li>${esc(x)}</li>`).join("");
  }
  async function install() {
    if (!installPrompt) { openSettings(); return; }
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice.catch(() => ({}));
    if (outcome === "accepted") toast("Installing Portfolio Dashboard…");
    installPrompt = null; renderInstall();
  }
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installPrompt = e; renderInstall(); });
  window.addEventListener("appinstalled", () => { installPrompt = null; renderInstall(); toast("Installed. Open Portfolio from your apps or home screen."); });

  // ---------- Events ----------
  function onSeg(sel, attr, fn) { $(sel).addEventListener("click", (e) => { const b = e.target.closest(`[data-${attr}]`); if (b) fn(b.dataset[attr.replace(/-([a-z])/g, (_, c) => c.toUpperCase())], b); }); }
  function bind() {
    $("#tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) goto(b.dataset.tab); });
    document.addEventListener("click", async (e) => {
      const t = e.target;
      const go = t.closest("[data-goto]"); if (go) { goto(go.dataset.goto, go.dataset.sub); return; }
      const act = t.closest("[data-action]");
      if (act) {
        const a = act.dataset.action;
        if (a === "add-trade") return openTrade();
        if (a === "load-sample") return loadSample();
        if (a === "import-csv") return $("#csvInput").click();
        if (a === "export-csv") return exportCsv();
      }
      if (t.closest("[data-close]") || t === $("#scrim")) { closeDrawers(); return; }
      const del = t.closest("[data-delete]"); if (del) { deleteTx(del.dataset.delete); return; }
      const ed = t.closest("[data-edit]"); if (ed) { const tx = state.data.trades.find((x) => x.id === ed.dataset.edit); if (tx) openTrade(tx); return; }
      const un = t.closest("[data-unwatch]"); if (un) { state.data.watchlist = state.data.watchlist.filter((x) => x !== un.dataset.unwatch); save(); toast(`${un.dataset.unwatch} removed from watchlist`); renderCurrent(); return; }
      const af = t.closest("[data-alert-for]"); if (af) { goto("markets", "alerts"); $("#aSymbol").value = af.dataset.alertFor; $("#aPrice").focus(); return; }
      const da = t.closest("[data-del-alert]"); if (da) { state.data.alerts = state.data.alerts.filter((x) => x.id !== da.dataset.delAlert); save(); renderCurrent(); return; }
      const uc = t.closest("[data-uncompare]"); if (uc) { state.data.compare = state.data.compare.filter((x) => x !== uc.dataset.uncompare); save(); renderCompare(); return; }
      const dacc = t.closest("[data-del-account]"); if (dacc) { state.data.accounts = state.data.accounts.filter((x) => x !== dacc.dataset.delAccount); if (acct() === dacc.dataset.delAccount) state.data.settings.account = "all"; save(); renderSettingsAccounts(); renderCurrent(); return; }
      const sp = t.closest("[data-switch-profile]"); if (sp) { switchProfile(sp.dataset.switchProfile); return; }
      const dp = t.closest("[data-del-profile]"); if (dp) { deleteProfile(dp.dataset.delProfile); return; }
      if (t.closest("#profileChip")) { openSettings(); return; }
      if (t.closest("#notifyBtn")) { try { await Notification.requestPermission(); } catch { /* ignore */ } renderAlerts(); return; }
      const symEl = t.closest("[data-symbol]");
      if (symEl && !t.closest("#tradeDrawer") && !t.closest("input")) { openResearch(symEl.dataset.symbol); return; }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { if (!$("#confirmDialog").hidden) return; closeDrawers(); return; }
      if ((e.key === "Enter" || e.key === " ") && e.target.matches(".earn-row")) { e.preventDefault(); openResearch(e.target.dataset.symbol); return; }
      const typing = e.target.closest("input, select, textarea") || !$("#tradeDrawer").hidden || !$("#settingsDrawer").hidden || !$("#confirmDialog").hidden;
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "r") refreshAll();
      else if (k === "t") setTheme(effectiveTheme() === "dark" ? "light" : "dark");
      else if (k === "h") togglePrivacy();
      else if (k === "n") { e.preventDefault(); openTrade(); }
      else if (k === "/") { e.preventDefault(); goto("research"); $("#searchInput").focus(); }
    });
    // Overview
    onSeg("#ovReturnMode", "mode", (v) => { state.ovMode = v; setPressed($("#ovReturnMode"), "mode", v); renderOverview(); });
    onSeg("#allocBy", "alloc", (v) => { state.allocBy = v; renderOverview(); if (v === "sector") loadMeta(portfolio().rows.map((r) => r.symbol)).then(() => state.tab === "overview" && renderOverview()); });
    for (const id of ["#ovAccount", "#pfAccount"]) $(id).addEventListener("change", (e) => setAccount(e.target.value));
    // Portfolio
    onSeg("#pfSeg", "sub", (v) => { state.pfSub = v; renderPortfolio(); });
    onSeg("#perfRanges", "range", (v) => { state.perfRange = v; renderPerformance(); });
    onSeg("#riskRanges", "range", (v) => { state.riskRange = v; renderRisk(); });
    onSeg("#actFilter", "type", (v) => { state.actFilter = v; renderActivity(); });
    onSeg("#rbMode", "mode", (v) => { state.rbMode = v; renderRebalance(); });
    $("#perfCompare").addEventListener("change", renderPerformance);
    $("#sectorBench").addEventListener("change", renderSectors);
    onSeg("#sectorFilter", "group", (v) => { state.sectorGroup = v; renderSectors(); });
    $("#rbCash").addEventListener("input", renderRebalance);
    $("#rbTable").addEventListener("change", (e) => { const i = e.target.closest("[data-target]"); if (!i) return; const v = parseNum(i.value); if (isNaN(v) || v <= 0) delete state.data.targets[i.dataset.target]; else state.data.targets[i.dataset.target] = Math.min(100, v); save(); renderRebalance(); });
    $("#rbEqual").addEventListener("click", () => { const rows = portfolio().rows; rows.forEach((r) => (state.data.targets[r.symbol] = +(100 / rows.length).toFixed(2))); save(); renderRebalance(); });
    $("#rbCurrent").addEventListener("click", () => { portfolio().rows.forEach((r) => (state.data.targets[r.symbol] = +r.weight.toFixed(2))); save(); renderRebalance(); });
    $("#gainsYear").addEventListener("change", (e) => { state.gainsYear = e.target.value; renderGains(); });
    $("#gainsExport").addEventListener("click", () => { const l = state.gainsList || []; download(`capital-gains-${state.gainsYear}.csv`, [["date_sold", "symbol", "account", "tax_sheltered", "shares", "proceeds", "adjusted_cost_base", "gain", "currency"], ...l.map((s) => [s.date, s.symbol, s.account, s.sheltered ? "yes" : "no", s.qty, s.proceeds.toFixed(2), s.acb.toFixed(2), s.gain.toFixed(2), s.currency])].map((r) => r.map(csvCell).join(",")).join("\n")); });
    // Watchlist area
    onSeg("#mkSeg", "sub", (v) => { state.mkSub = v; renderMarkets(); });
    onSeg("#earnScope", "scope", (v) => { state.earnScope = v; renderEarnings(); });
    onSeg("#cmpRanges", "range", (v) => { state.cmpRange = v; renderCompare(); });
    $("#watchAddForm").addEventListener("submit", async (e) => {
      e.preventDefault(); const raw = $("#watchAddInput").value.trim(); if (!raw) return;
      const s = await resolveTicker(raw);
      if (!/^[A-Z0-9.\-^=]{1,20}$/.test(s)) { toast("Enter a ticker like AAPL or RY.TO"); return; }
      if (!state.data.watchlist.includes(s)) { state.data.watchlist.push(s); save(); }
      $("#watchAddInput").value = ""; toast(`${s} added to watchlist`);
      if (state.mkSub !== "watchlist" && state.mkSub !== "earnings") state.mkSub = "watchlist";
      await loadQuotes(); loadMeta([s]).then(renderCurrent); renderCurrent();
    });
    $("#alertForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const s = await resolveTicker($("#aSymbol").value); const p = parseNum($("#aPrice").value);
      if (!s) { $("#aError").textContent = "Enter a ticker symbol."; return; }
      if (!(p > 0)) { $("#aError").textContent = "Enter the price that should trigger the alert."; return; }
      $("#aError").textContent = "";
      state.data.alerts.push({ id: uid(), symbol: s, dir: $("#aDir").value, price: p, created: Date.now(), triggered: null });
      save(); $("#alertForm").reset(); toast(`Alert set: ${s} ${$("#aDir").value} ${num(p)}`);
      await loadQuotes(); renderAlerts();
    });
    $("#compareForm").addEventListener("submit", async (e) => {
      e.preventDefault(); const raw = $("#compareInput").value.trim(); if (!raw) return;
      const s = await resolveTicker(raw);
      if (state.data.compare.length >= 4) { toast("You can compare up to four. Remove one first."); return; }
      if (!state.data.compare.includes(s)) state.data.compare.push(s);
      save(); $("#compareInput").value = ""; renderCompare();
    });
    // Research
    $("#searchForm").addEventListener("submit", async (e) => { e.preventDefault(); const raw = $("#searchInput").value.trim(); if (!raw) return; state.research.symbol = await resolveTicker(raw); state.research.data = null; renderResearch(); });
    onSeg("#rsRanges", "range", (v) => { state.research.range = v; renderResearchChart(); });
    $("#rsWatch").addEventListener("click", () => {
      const s = state.research.symbol; const wl = state.data.watchlist;
      state.data.watchlist = wl.includes(s) ? wl.filter((x) => x !== s) : [...wl, s]; save();
      toast(wl.includes(s) ? `${s} removed from watchlist` : `${s} added to watchlist`); renderResearch();
    });
    $("#rsTrade").addEventListener("click", () => openTrade({ symbol: state.research.symbol }));
    $("#rsAlert").addEventListener("click", () => { const s = state.research.symbol; goto("markets", "alerts"); $("#aSymbol").value = s; $("#aPrice").focus(); });
    $("#rsCompare").addEventListener("click", () => { const s = state.research.symbol; if (!state.data.compare.includes(s)) { if (state.data.compare.length >= 4) state.data.compare.shift(); state.data.compare.push(s); save(); } goto("markets", "compare"); });
    $("#ratioHelpBtn").addEventListener("click", () => { showRatioHelp = !showRatioHelp; if (state.research.data) renderRatios(state.research.data); });
    // News
    onSeg("#newsSeg", "sub", (v) => { state.newsSub = v; renderNews(); });
    onSeg("#newsFilter", "filter", (v) => { state.newsFilter = v; renderHeadlines(); });
    onSeg("#dayTabs", "day", (v) => { state.calDay = v; renderCalendar(); });
    onSeg("#impactFilter", "impact", (v) => { const s = state.data.settings; s.impacts = s.impacts.includes(v) ? s.impacts.filter((x) => x !== v) : [...s.impacts, v]; save(); renderCalendar(); });
    onSeg("#countryFilter", "country", (v) => { const s = state.data.settings; s.countries = s.countries.includes(v) ? s.countries.filter((x) => x !== v) : [...s.countries, v]; save(); renderCalendar(); });
    $("#eventList").addEventListener("click", (e) => { const b = e.target.closest(".event"); if (!b) return; const d = b.nextElementSibling; d.hidden = !d.hidden; b.setAttribute("aria-expanded", String(!d.hidden)); });
    // Recap
    onSeg("#recapRange", "period", (v) => { state.recapPeriod = v; renderRecap(); });
    // Transaction form
    const f = $("#tradeForm");
    f.addEventListener("submit", submitTrade);
    $("#tType").addEventListener("change", () => { showFieldsFor(ttype()); $$(".error", f).forEach((x) => (x.textContent = "")); });
    $("#tAccount").addEventListener("change", () => { updateTotal(); if ($("#tQty").value) validate("tQty"); });
    $("#tSymbol").addEventListener("change", () => { if ($("#tSymbol").value.trim()) { lookupSymbol(); } });
    $("#tSymbol").addEventListener("blur", () => { if ($("#tSymbol").value.trim()) validate("tSymbol"); });
    ["tDate", "tQty", "tPrice", "tFees", "tAmount", "tRatio"].forEach((id) => $("#" + id).addEventListener("blur", () => { if ($("#" + id).value) validate(id); }));
    ["tQty", "tPrice", "tFees", "tCurrency", "tAmount", "tDate"].forEach((id) => $("#" + id).addEventListener("input", () => { updateTotal(); if ($("#" + id).getAttribute("aria-invalid") === "true") validate(id); }));
    $("#tSymbol").addEventListener("input", () => { if ($("#tSymbol").getAttribute("aria-invalid") === "true") setErr("tSymbol", ""); });
    $("#tUseLast").addEventListener("click", () => { if (symbolQuote) { $("#tPrice").value = symbolQuote.price.toFixed(2); setErr("tPrice", ""); updateTotal(); } });
    $("#tSellAll").addEventListener("click", () => { const h = computeHoldings($("#tDate").value || todayISO(), $("#tAccount").value, editingId)[$("#tSymbol").value.trim().toUpperCase()]; if (h?.qty) { $("#tQty").value = +h.qty.toFixed(6); validate("tQty"); updateTotal(); } else toast("Enter the symbol and account first."); });
    $("#tDelete").addEventListener("click", () => editingId && deleteTx(editingId));
    $$(".ticker-input").forEach(attachTickerSearch);
    // Settings
    $("#settingsBtn").addEventListener("click", openSettings);
    $("#refreshBtn").addEventListener("click", refreshAll);
    $("#privacyBtn").addEventListener("click", togglePrivacy);
    $("#sBase").addEventListener("change", (e) => { state.data.settings.base = e.target.value; save(); loadQuotes().then(renderCurrent); });
    $("#sExport").addEventListener("click", exportBackup);
    $("#sImport").addEventListener("change", (e) => { const file = e.target.files[0]; if (file) importBackup(file); e.target.value = ""; });
    $("#csvInput").addEventListener("change", (e) => { const file = e.target.files[0]; if (file) importCsv(file); e.target.value = ""; });
    $("#sTemplate").addEventListener("click", csvTemplate);
    $("#sAccountForm").addEventListener("submit", (e) => {
      e.preventDefault(); const n = $("#sAccountName").value.trim(); if (!n) return;
      if (state.data.accounts.some((a) => a.toLowerCase() === n.toLowerCase())) { toast(`You already have an account called ${n}.`); return; }
      state.data.accounts.push(n); save(); $("#sAccountName").value = ""; renderSettingsAccounts(); renderCurrent(); toast(`${n} account added`);
    });
    $("#sProfileForm").addEventListener("submit", (e) => {
      e.preventDefault(); const n = $("#sProfileName").value.trim(); if (!n) return;
      const p = readProfiles();
      if (p.list.some((x) => x.name.toLowerCase() === n.toLowerCase())) { toast(`There's already a profile called ${n}.`); return; }
      const id = uid().slice(0, 8); p.list.push({ id, name: n }); writeProfiles(p);
      $("#sProfileName").value = ""; renderProfiles(); toast(`${n}'s profile created. Switch to it to start adding trades.`);
    });
    $("#sClear").addEventListener("click", async () => {
      if (await confirmDialog({ title: "Delete all transactions?", text: `All ${state.data.trades.length} transactions will be removed from this browser. Download a backup first if you might want them back.`, ok: "Delete all transactions" })) {
        state.data.trades = []; save(); closeDrawers(); toast("All transactions deleted"); renderCurrent();
      }
    });
    $("#sTheme").addEventListener("click", (e) => { const b = e.target.closest("[data-theme-choice]"); if (b) setTheme(b.dataset.themeChoice); });
    $("#themeBtn").addEventListener("click", () => setTheme(effectiveTheme() === "dark" ? "light" : "dark"));
    $("#installBtn").addEventListener("click", install);
    $("#sInstall").addEventListener("click", install);
    darkQuery.addEventListener?.("change", () => { if (state.data.settings.theme === "system") applyTheme(); });
    window.addEventListener("hashchange", () => { const t = location.hash.slice(1); if (t && t !== state.tab && $("#view-" + t)) goto(t); });
  }

  // ---------- Start ----------
  async function start() {
    bind();
    applyTheme(false); applyPrivacy(); renderInstall(); renderProfiles();
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) navigator.serviceWorker.register("sw.js").catch(() => {});
    const initial = location.hash.slice(1);
    goto(initial === "earnings" ? "earnings" : $("#view-" + initial) ? initial : "overview");
    await probe();
    await loadQuotes(); renderCurrent();
    await Promise.all([loadMarket(), loadEvents(), loadNews()]);
    renderCurrent();
    loadMeta(metaSymbols()).then(renderCurrent);
    setInterval(() => { if (document.visibilityState === "visible") loadQuotes().then(() => { if (["overview", "markets"].includes(state.tab) || (state.tab === "portfolio" && ["holdings", "rebalance", "dividends"].includes(state.pfSub))) renderCurrent(); }); }, 60000);
    setInterval(() => { if (document.visibilityState === "visible") Promise.all([loadMarket(), loadEvents(), loadNews()]); }, 15 * 60000);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
