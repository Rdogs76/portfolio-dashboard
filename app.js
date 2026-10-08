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
    "Real Estate": "#b57edc", "Basic Materials": "#a47148", Other: "#9aa5b1",
  };
  const SUPER = {
    cyclical: ["Basic Materials", "Consumer Cyclical", "Financial Services", "Real Estate"],
    sensitive: ["Communication Services", "Energy", "Industrials", "Technology"],
    defensive: ["Consumer Defensive", "Healthcare", "Utilities"],
  };
  const PULSE = [["^GSPC", "S&P 500"], ["^GSPTSE", "S&P/TSX"], ["^IXIC", "Nasdaq"], ["^VIX", "VIX"], ["^TNX", "US 10Y yield"], ["CL=F", "Crude oil"], ["GC=F", "Gold"], ["USDCAD=X", "USD/CAD"]];

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

  let toastTimer;
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 3200); }

  // ---------- State & storage ----------
  const LS = "portfolio-dashboard.v1";
  const DEFAULTS = { trades: [], watchlist: ["AAPL", "NVDA", "SHOP.TO"], settings: { base: "CAD", countries: ["USD", "CAD"], impacts: ["High", "Medium"], theme: "system" } };
  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(LS) || "null");
      if (!raw) return structuredClone(DEFAULTS);
      return { ...structuredClone(DEFAULTS), ...raw, settings: { ...DEFAULTS.settings, ...(raw.settings || {}) } };
    } catch { return structuredClone(DEFAULTS); }
  }
  function save() { try { localStorage.setItem(LS, JSON.stringify(state.data)); } catch { toast("Couldn't save to this browser's storage. Download a backup from Settings."); } }

  const state = {
    data: load(), demo: false, live: null,
    quotes: {}, meta: {}, market: null, events: null, news: null, quotesAt: null,
    tab: "overview", ovMode: "all", pfSub: "holdings", perfRange: "6mo", sectorGroup: "all", newsSub: "calendar", newsFilter: "all",
    calDay: null, recapPeriod: "week", earnScope: "all",
    research: { symbol: null, range: "1y", data: null }, charts: {},
  };

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
    if (state.demo) { await new Promise((r) => setTimeout(r, 120)); return Demo.handle(path, params); }
    const qs = new URLSearchParams(params).toString();
    const r = await fetch(`/api/${path}${qs ? "?" + qs : ""}`);
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || `Request failed (${r.status})`);
    return body;
  }

  // ---------- Portfolio math ----------
  function sortedTrades() { return [...state.data.trades].sort((a, b) => a.date.localeCompare(b.date) || a.created - b.created); }

  function computeHoldings(asOf) {
    const map = {};
    for (const t of sortedTrades()) {
      if (asOf && t.date > asOf) continue;
      const h = (map[t.symbol] ||= { symbol: t.symbol, currency: t.currency, qty: 0, cost: 0, realized: 0, fees: 0 });
      if (t.side === "buy") { h.qty += t.qty; h.cost += t.qty * t.price + (t.fees || 0); }
      else {
        const avg = h.qty > 0 ? h.cost / h.qty : 0;
        const q = Math.min(t.qty, h.qty);
        h.realized += q * t.price - (t.fees || 0) - avg * q;
        h.cost -= avg * q; h.qty -= q;
      }
      h.fees += t.fees || 0;
    }
    return map;
  }

  function fx(cur, base = state.data.settings.base) {
    if (!cur || cur === base) return 1;
    const q = state.quotes[`${cur}${base}=X`];
    if (q?.price) return q.price;
    const inv = state.quotes[`${base}${cur}=X`];
    if (inv?.price) return 1 / inv.price;
    return null;
  }

  function portfolio() {
    const base = state.data.settings.base;
    const all = Object.values(computeHoldings());
    const rows = [];
    let value = 0, cost = 0, dayChange = 0, realized = 0, prevValue = 0, missing = 0;
    for (const h of all) {
      const rate = fx(h.currency);
      realized += h.realized * (rate ?? 1);
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
      rows.push({ ...h, quote: q, price, mv, mvBase, costBase, avg: h.cost / h.qty, gain: mvBase != null ? mvBase - costBase : null, gainPct: mvBase != null && costBase ? (mvBase / costBase - 1) * 100 : null, dayBase, dayPct: q?.changePct });
    }
    rows.forEach((r) => (r.weight = value ? (r.mvBase || 0) / value * 100 : 0));
    rows.sort((a, b) => (b.mvBase || 0) - (a.mvBase || 0));
    const unrealized = value - cost;
    return {
      base, rows, value, cost, dayChange, dayPct: prevValue ? dayChange / prevValue * 100 : null,
      unrealized, realized, totalGain: unrealized + realized, allTimePct: cost ? (unrealized + realized) / cost * 100 : null, missing,
    };
  }

  function symbolsNeeded() {
    const base = state.data.settings.base;
    const held = [...new Set(state.data.trades.map((t) => t.symbol))];
    const curs = new Set(state.data.trades.map((t) => t.currency).concat(["USD", "CAD"]));
    const fxs = [...curs].filter((c) => c !== base).map((c) => `${c}${base}=X`);
    return { held, all: [...new Set([...held, ...state.data.watchlist, ...PULSE.map((p) => p[0]), ...fxs])] };
  }

  // ---------- Data loading ----------
  async function loadQuotes() {
    const { all } = symbolsNeeded();
    const chunks = []; for (let i = 0; i < all.length; i += 50) chunks.push(all.slice(i, i + 50));
    const results = await Promise.allSettled(chunks.map((c) => api("quotes", { symbols: c.join(",") })));
    let ok = false;
    for (const r of results) if (r.status === "fulfilled") { Object.assign(state.quotes, r.value.quotes); ok = true; }
    if (ok) state.quotesAt = Date.now();
    else if (results[0]?.reason) toast("Couldn't load prices: " + results[0].reason.message);
  }
  async function loadMeta(symbols) {
    const need = symbols.filter((s) => !state.meta[s]);
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

  async function refreshAll() {
    const btn = $("#refreshBtn"); btn.classList.add("spinning");
    state.meta = {};
    try {
      await loadQuotes(); renderCurrent();
      await Promise.all([loadMarket(), loadEvents(), loadNews()]);
      renderCurrent();
      loadMeta(symbolsNeeded().held.concat(state.data.watchlist)).then(() => { if (["overview", "earnings"].includes(state.tab) || state.pfSub === "sectors") renderCurrent(); });
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
    const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, ctx.chart.height);
    g.addColorStop(0, color + "40"); g.addColorStop(1, color + "00"); return g;
  }

  // ---------- Navigation ----------
  function setPressed(container, attr, value) { $$(`[data-${attr}]`, container).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset[attr] === value))); }

  function goto(tab, sub) {
    state.tab = tab;
    $$("#tabs [role=tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
    $$(".view").forEach((v) => (v.hidden = v.id !== "view-" + tab));
    if (tab === "news" && sub) state.newsSub = sub;
    if (tab === "portfolio" && sub) state.pfSub = sub;
    if (location.hash.slice(1) !== tab) history.replaceState(null, "", "#" + tab);
    window.scrollTo({ top: 0 });
    renderCurrent();
  }
  function renderCurrent() {
    ({ overview: renderOverview, portfolio: renderPortfolio, research: renderResearch, earnings: renderEarnings, news: renderNews, recap: renderRecap })[state.tab]?.();
  }

  // ---------- Overview ----------
  function renderOverview() {
    const p = portfolio();
    const has = p.rows.length > 0;
    $("#ovEmpty").hidden = has;
    $(".donut-wrap", $("#view-overview")).hidden = !has;
    $("#ovLegend").hidden = !has;
    $("#ovValue").textContent = has ? money(p.value) : money(0);
    $("#ovDay").innerHTML = has ? `<span class="${cls(p.dayChange)}">${signedMoney(p.dayChange)} (${pct(p.dayPct)})</span> today · ${signedMoney(p.totalGain)} all-time` : "Add trades to start tracking.";
    if (has) {
      const v = state.ovMode === "all" ? p.allTimePct : p.dayPct;
      const pill = $("#ovCenter"); pill.textContent = pct(v); pill.classList.toggle("neg", v < 0);
      $("#ovCenterLabel").textContent = state.ovMode === "all" ? "All-time" : "Today";
      donut("ovDonut", p.rows.map((r) => r.symbol), p.rows.map((r) => r.weight), p.rows.map((r) => colorFor(r.symbol)), (i) => openResearch(p.rows[i].symbol));
      $("#ovLegend").innerHTML = p.rows.map((r) => `<li data-symbol="${esc(r.symbol)}"><span class="sw" style="background:${colorFor(r.symbol)}"></span><span class="lg-sym">${esc(r.symbol)}</span><span class="${cls(state.ovMode === "all" ? r.gainPct : r.dayPct)} small">${pct(state.ovMode === "all" ? r.gainPct : r.dayPct, 1)}</span><span class="lg-pct">${r.weight.toFixed(1)}%</span></li>`).join("");
    }

    // Pulse
    $("#pulse").innerHTML = PULSE.map(([s, name]) => {
      const q = state.quotes[s];
      const val = !q ? "—" : s === "^TNX" ? q.price?.toFixed(2) + "%" : s === "USDCAD=X" ? q.price?.toFixed(4) : num(q.price, q.price > 1000 ? 0 : 2);
      const chg = !q ? "" : s === "^TNX" ? `${q.change >= 0 ? "+" : "−"}${Math.abs(q.change || 0).toFixed(2)} pts` : pct(q.changePct);
      return `<div class="tile"><div class="t-name">${esc(name)}</div><div class="t-val ${q ? "" : "skeleton"}">${val}</div><div class="t-chg ${q ? cls(q.change) : ""}">${chg}</div></div>`;
    }).join("");
    $("#pulseAsOf").textContent = state.quotesAt ? "Updated " + new Date(state.quotesAt).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" }) : "";

    // Movers
    const movers = [...p.rows].filter((r) => isNum(r.dayPct)).sort((a, b) => Math.abs(b.dayPct) - Math.abs(a.dayPct)).slice(0, 5);
    $("#ovMovers").innerHTML = movers.length ? movers.map((r) => `<li class="clickable" data-symbol="${esc(r.symbol)}">${avatar(r.symbol)}<div class="grow"><div class="title">${esc(r.symbol)}</div><div class="meta">${esc(r.quote?.name || "")}</div></div><div class="r"><div class="${cls(r.dayPct)}"><b>${pct(r.dayPct)}</b></div><div class="meta">${signedMoney(r.dayBase)}</div></div></li>`).join("") : `<li class="empty-line">Your biggest daily movers will show here.</li>`;

    // Events
    if (state.events) {
      const now = Date.now();
      const evs = state.events.filter((e) => e.impact === "High" && state.data.settings.countries.includes(e.country) && e.time > now - 3 * 3600000).slice(0, 5);
      $("#ovEvents").innerHTML = evs.length ? evs.map((e) => `<li><i class="dot high"></i><div class="grow"><div class="title">${esc(e.title)}</div><div class="meta">${esc(e.country)} · ${new Date(e.time).toLocaleString("en-CA", { weekday: "short", hour: "numeric", minute: "2-digit" })}${e.forecast ? " · forecast " + esc(e.forecast) : ""}</div></div></li>`).join("") : `<li class="empty-line">No more high-impact ${state.data.settings.countries.join("/")} events this week.</li>`;
    } else $("#ovEvents").innerHTML = skeletonList(3);

    // Earnings
    const upcoming = earningsRows().filter((r) => r.date).slice(0, 4);
    $("#ovEarnings").innerHTML = upcoming.length ? upcoming.map((r) => `<li class="clickable" data-symbol="${esc(r.symbol)}">${avatar(r.symbol)}<div class="grow"><div class="title">${esc(r.symbol)}</div><div class="meta">${esc(r.name)}</div></div><div class="r"><b>${fmtDate(r.date, { month: "short", day: "numeric" })}</b><div class="meta">${r.inHoldings ? "Holding" : "Watchlist"}</div></div></li>`).join("")
      : Object.keys(state.meta).length ? `<li class="empty-line">No earnings dates found for your holdings or watchlist.</li>` : skeletonList(3);

    // Recap teaser
    const rc = state.market?.length ? Recap.build({ series: state.market, events: state.events || [], news: state.news || [], period: "week" }) : null;
    $("#ovRecap").textContent = rc ? rc.teaser : state.market ? "Market data unavailable right now." : "Loading…";

    // News
    $("#ovNews").innerHTML = state.news ? newsItems(state.news.slice(0, 6)) : skeletonList(4);
  }
  function skeletonList(n) { return Array.from({ length: n }, () => `<li><div class="grow"><div class="skeleton" style="width:70%"></div><div class="skeleton" style="width:40%;margin-top:6px"></div></div></li>`).join(""); }
  function newsItems(list) {
    if (!list.length) return `<li class="empty-line">No headlines right now.</li>`;
    return list.map((n) => `<li><a href="${esc(n.link)}" target="_blank" rel="noopener noreferrer">${n.thumbnail ? `<img src="${esc(n.thumbnail)}" alt="" loading="lazy">` : ""}<div><div class="n-title">${esc(n.title)}</div><div class="n-meta">${esc(n.publisher || "")}<span>·</span>${ago(n.time)}${(n.tickers || []).slice(0, 3).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div></div></a></li>`).join("");
  }

  // ---------- Portfolio ----------
  function renderPortfolio() {
    setPressed($("#pfSeg"), "sub", state.pfSub);
    $$("#view-portfolio .sub-view").forEach((v) => (v.hidden = v.dataset.sub !== state.pfSub));
    if (state.pfSub === "holdings") renderHoldings();
    if (state.pfSub === "trades") renderTrades();
    if (state.pfSub === "performance") renderPerformance();
    if (state.pfSub === "sectors") renderSectors();
  }
  function renderHoldings() {
    const p = portfolio();
    $("#pfKpis").innerHTML = [
      ["Market value", money(p.value), ""],
      ["Today", `${signedMoney(p.dayChange)}`, cls(p.dayChange), pct(p.dayPct)],
      ["Unrealized gain/loss", signedMoney(p.unrealized), cls(p.unrealized), p.cost ? pct(p.unrealized / p.cost * 100) : ""],
      ["Realized gain/loss", signedMoney(p.realized), cls(p.realized), "From sales"],
    ].map(([l, v, c, s]) => `<div class="card"><div class="kpi-label">${l}</div><div class="kpi-val ${c}">${v}</div>${s ? `<div class="small ${c || "muted"}">${s}</div>` : ""}</div>`).join("");
    $("#pfEmpty").hidden = p.rows.length > 0;
    $("#holdingsTable").hidden = !p.rows.length;
    $("#holdingsTable tbody").innerHTML = p.rows.map((r) => `
      <tr class="clickable" data-symbol="${esc(r.symbol)}">
        <td><div class="sym">${avatar(r.symbol)}<div><b>${esc(r.symbol)}</b><span>${esc(r.quote?.name || "")}</span></div></div></td>
        <td class="r">${qtyFmt(r.qty)}</td>
        <td class="r">${money(r.avg, r.currency)}</td>
        <td class="r">${money(r.price, r.currency)}</td>
        <td class="r"><span class="tag ${cls(r.dayPct)}">${pct(r.dayPct)}</span></td>
        <td class="r"><b>${money(r.mvBase)}</b></td>
        <td class="r ${cls(r.gain)}">${signedMoney(r.gain)}<div class="small">${pct(r.gainPct)}</div></td>
        <td class="r">${r.weight.toFixed(1)}%</td>
      </tr>`).join("");
  }
  function renderTrades() {
    const trades = sortedTrades().reverse();
    $("#tradesEmpty").hidden = trades.length > 0;
    $("#tradesTable").hidden = !trades.length;
    $("#tradesTable tbody").innerHTML = trades.map((t) => `
      <tr>
        <td>${esc(t.date)}</td>
        <td><span class="tag ${t.side === "buy" ? "up" : "down"}">${t.side === "buy" ? "Buy" : "Sell"}</span></td>
        <td><b>${esc(t.symbol)}</b>${t.note ? `<div class="small muted">${esc(t.note)}</div>` : ""}</td>
        <td class="r">${qtyFmt(t.qty)}</td>
        <td class="r">${money(t.price, t.currency)}</td>
        <td class="r">${money(t.fees || 0, t.currency)}</td>
        <td class="r"><b>${money(t.qty * t.price + (t.side === "buy" ? 1 : -1) * (t.fees || 0), t.currency)}</b></td>
        <td class="r"><button class="icon-btn" data-delete="${esc(t.id)}" title="Delete trade" aria-label="Delete ${t.side} ${esc(t.symbol)} trade from ${esc(t.date)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg></button></td>
      </tr>`).join("");
  }

  let perfToken = 0;
  async function renderPerformance() {
    setPressed($("#perfRanges"), "range", state.perfRange);
    const token = ++perfToken;
    const trades = sortedTrades();
    if (!trades.length) { $("#perfReturn").textContent = "No trades yet"; $("#perfRange").textContent = ""; state.charts.perfChart?.destroy(); state.charts.valueChart?.destroy(); return; }
    $("#perfReturn").innerHTML = `<span class="skeleton" style="display:inline-block;width:90px">&nbsp;</span>`;
    const base = state.data.settings.base;
    const syms = [...new Set(trades.map((t) => t.symbol))];
    const curs = [...new Set(trades.map((t) => t.currency))].filter((c) => c !== base);
    const fxSyms = curs.map((c) => `${c}${base}=X`);
    const cmp = $("#perfCompare").value;
    const all = [...syms, ...fxSyms, ...(cmp ? [cmp] : [])];
    let charts;
    try { charts = (await api("charts", { symbols: all.join(","), range: state.perfRange })).charts; }
    catch (e) { $("#perfReturn").textContent = "Couldn't load history"; toast(e.message); return; }
    if (token !== perfToken) return;

    const key = (t) => Recap.dkey(t);
    const keys = [...new Set(syms.flatMap((s) => (charts[s]?.points || []).map(([t]) => key(t))))].sort();
    if (!keys.length) { $("#perfReturn").textContent = "No price history"; return; }
    const series = (sym) => { const m = new Map(); for (const [t, c] of charts[sym]?.points || []) m.set(key(t), c); return m; };
    const priceMaps = Object.fromEntries(syms.map((s) => [s, series(s)]));
    const fxMaps = Object.fromEntries(curs.map((c) => [c, series(`${c}${base}=X`)]));
    const last = {}; const lastFx = {};
    const assigned = trades.map((t) => ({ ...t, key: keys.find((k) => k >= t.date) || null }));
    const values = [], invested = [], twr = [];
    let cum = 1, prevV = 0, netFlow = 0;
    // Money invested before the range starts counts as the starting balance.
    for (const t of assigned.filter((t) => t.date < keys[0])) {
      const r = fx(t.currency) ?? 1; netFlow += (t.side === "buy" ? 1 : -1) * (t.qty * t.price) * r + (t.fees || 0) * r * (t.side === "buy" ? 1 : -1);
    }
    for (const k of keys) {
      for (const s of syms) if (priceMaps[s].has(k)) last[s] = priceMaps[s].get(k);
      for (const c of curs) if (fxMaps[c].has(k)) lastFx[c] = fxMaps[c].get(k);
      const rate = (c) => (c === base ? 1 : lastFx[c] ?? fx(c) ?? 1);
      const pos = {};
      for (const t of assigned) {
        if (t.date > k) continue;
        pos[t.symbol] = (pos[t.symbol] || 0) + (t.side === "buy" ? t.qty : -t.qty);
      }
      let V = 0;
      for (const [s, q] of Object.entries(pos)) if (q > 1e-9 && last[s] != null) V += q * last[s] * rate(trades.find((t) => t.symbol === s).currency);
      let F = 0;
      for (const t of assigned) if (t.key === k && t.date >= keys[0]) F += (t.side === "buy" ? 1 : -1) * t.qty * t.price * rate(t.currency) + (t.side === "buy" ? 1 : -1) * (t.fees || 0) * rate(t.currency);
      netFlow += F;
      if (prevV > 0) cum *= (V - F) / prevV;
      const ts = Date.parse(k + "T20:00:00Z");
      values.push({ x: ts, y: V }); invested.push({ x: ts, y: netFlow }); twr.push({ x: ts, y: prevV > 0 || values.length > 1 ? (cum - 1) * 100 : 0 });
      prevV = V;
    }
    const total = twr.at(-1)?.y ?? 0;
    $("#perfReturn").innerHTML = `<span class="${cls(total)}">${pct(total)}</span>`;
    $("#perfRange").textContent = `${fmtDate(values[0].x, { month: "short", day: "numeric", year: "numeric" })} – today`;
    const accent = css("--accent");
    const ds = [{ label: "Your portfolio", data: twr, borderColor: accent, fill: true, backgroundColor: (c) => gradient(c, accent) }];
    if (cmp && charts[cmp]?.points?.length) {
      const pts = charts[cmp].points.filter(([t]) => key(t) >= keys[0]);
      const b0 = pts[0]?.[1];
      ds.push({ label: $("#perfCompare").selectedOptions[0].textContent, data: pts.map(([t, c]) => ({ x: Date.parse(key(t) + "T20:00:00Z"), y: (c / b0 - 1) * 100 })), borderColor: css("--orange") || "#ff8a3d", borderDash: [5, 4], fill: false });
    }
    const opts = lineOpts({ pctAxis: true }); opts.plugins.legend = { display: ds.length > 1, position: "top", align: "start", labels: { boxWidth: 12, usePointStyle: true } };
    chart("perfChart", { type: "line", data: { datasets: ds }, options: opts });
    const vo = lineOpts({ money: true, cur: base }); vo.plugins.legend = { display: true, position: "top", align: "start", labels: { boxWidth: 12, usePointStyle: true } };
    chart("valueChart", { type: "line", data: { datasets: [
      { label: "Market value", data: values, borderColor: accent, fill: true, backgroundColor: (c) => gradient(c, accent) },
      { label: "Net money invested", data: invested, borderColor: css("--violet") || "#7a6cf0", stepped: true, fill: false, borderWidth: 1.5 },
    ] }, options: vo });
  }

  async function renderSectors() {
    setPressed($("#sectorFilter"), "group", state.sectorGroup);
    const bench = $("#sectorBench").value;
    const benchName = $("#sectorBench").selectedOptions[0].textContent;
    $("#benchLabel").textContent = benchName; $("#sectorBenchHead").textContent = benchName;
    const p = portfolio();
    await loadMeta([...p.rows.map((r) => r.symbol), bench]);
    if (state.tab !== "portfolio" || state.pfSub !== "sectors") return;
    const mine = {};
    for (const r of p.rows) {
      const m = state.meta[r.symbol]; const w = r.weight;
      if (m?.sectorWeights) { const tot = Object.values(m.sectorWeights).reduce((a, b) => a + b, 0) || 1; for (const [s, v] of Object.entries(m.sectorWeights)) mine[s] = (mine[s] || 0) + w * v / tot; }
      else { const s = m?.sector || "Other"; mine[s] = (mine[s] || 0) + w; }
    }
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

  // ---------- Research ----------
  function openResearch(sym) { state.research.symbol = sym; state.research.data = null; goto("research"); }
  async function renderResearch() {
    const chips = [...new Set([...symbolsNeeded().held, ...state.data.watchlist])];
    $("#watchChips").innerHTML = chips.map((s) => `<button class="chip-ticker" data-symbol="${esc(s)}" aria-pressed="${s === state.research.symbol}">${esc(s)}</button>`).join("");
    const sym = state.research.symbol;
    $("#researchEmpty").hidden = !!sym; $("#researchContent").hidden = !sym;
    if (!sym) return;
    $("#searchInput").value = sym;
    const inWatch = state.data.watchlist.includes(sym);
    $("#rsWatch").textContent = inWatch ? "Remove from watchlist" : "Add to watchlist";
    if (!state.research.data || state.research.data.symbol !== sym) {
      $("#rsName").textContent = sym; $("#rsPrice").innerHTML = `<span class="skeleton" style="display:inline-block;width:120px">&nbsp;</span>`; $("#rsChange").textContent = "";
      ["#rsAnalyst", "#rsEarnings", "#rsRatios", "#rsAbout"].forEach((s) => ($(s).innerHTML = `<div class="skeleton" style="height:120px"></div>`));
      $("#rsChanges").innerHTML = skeletonList(3); $("#rsNews").innerHTML = skeletonList(3);
      renderResearchChart();
      try {
        const [d, q, n] = await Promise.all([api("stock", { symbol: sym }), api("quotes", { symbols: sym }).catch(() => null), api("news", { symbols: sym, general: "0" }).catch(() => ({ news: [] }))]);
        if (state.research.symbol !== sym) return;
        if (q?.quotes?.[sym]) state.quotes[sym] = q.quotes[sym];
        state.research.data = d; state.research.news = n.news;
      } catch (e) {
        if (state.research.symbol !== sym) return;
        $("#rsName").textContent = sym;
        $("#rsPrice").textContent = "";
        $("#rsAnalyst").innerHTML = $("#rsEarnings").innerHTML = $("#rsRatios").innerHTML = $("#rsAbout").innerHTML = "";
        $("#rsChanges").innerHTML = $("#rsNews").innerHTML = "";
        $("#rsMeta").textContent = "";
        $("#rsAbout").innerHTML = `<p>Couldn't find data for <b>${esc(sym)}</b>. Check the ticker (Canadian listings end in .TO) and try again.</p><p class="small muted">${esc(e.message)}</p>`;
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
      const opts = lineOpts({ money: true, cur: c.currency, time: range === "1d" || range === "5d" });
      chart("rsChart", { type: "line", data: { datasets: [{ label: sym, data: c.points.map(([x, y]) => ({ x, y })), borderColor: color, fill: true, backgroundColor: (ctx) => gradient(ctx, color) }] }, options: opts });
    } catch (e) { console.warn(e); }
  }
  function renderAnalyst(d, price) {
    const a = d.analyst || {};
    if (!a.recommendationMean && !a.targetMean && !a.trend?.length) {
      $("#rsAnalyst").innerHTML = `<p class="muted">${d.type === "ETF" ? "ETFs don't get analyst ratings. Check the sector mix and top holdings under About." : "No analyst coverage found for this company."}</p>`;
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
      const label = (p) => (p === "0m" ? "This month" : p.replace("-", "").replace("m", " mo ago"));
      html += `<div class="trend-bars">${a.trend.slice(0, 4).map((t) => { const tot = cols.reduce((s, [k]) => s + t[k], 0) || 1; return `<div class="trend-row"><span>${label(t.period)}</span><div class="stack-bar" title="${cols.map(([k, , n]) => `${n}: ${t[k]}`).join(", ")}">${cols.map(([k, c]) => `<span style="width:${t[k] / tot * 100}%;background:${c}"></span>`).join("")}</div></div>`; }).join("")}</div>
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

  // ---------- Earnings ----------
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
    const syms = [...new Set([...symbolsNeeded().held, ...state.data.watchlist])];
    const pending = syms.some((s) => !state.meta[s]);
    if (pending) { $("#earnList").innerHTML = `<article class="card flush"><ul class="list" style="padding:16px">${skeletonList(4)}</ul></article>`; await loadMeta(syms); if (state.tab !== "earnings") return; }
    let rows = earningsRows();
    if (state.earnScope === "holdings") rows = rows.filter((r) => r.inHoldings);
    if (state.earnScope === "watchlist") rows = rows.filter((r) => r.inWatch);
    if (!rows.length) { $("#earnList").innerHTML = `<div class="card empty"><p>Nothing here yet. Add holdings or watchlist tickers to see their earnings dates.</p></div>`; return; }
    const weekOf = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };
    const thisWeek = weekOf(Date.now());
    const groups = new Map();
    for (const r of rows) {
      const k = r.date ? weekOf(r.date) : "none";
      if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r);
    }
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
    if (!state.events.length) { $("#eventList").innerHTML = `<li class="empty">Couldn't load the economic calendar${state.eventsError ? ` (${esc(state.eventsError)})` : ""}. Try Refresh in a minute.</li>`; $("#dayTabs").innerHTML = ""; return; }
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
    if (!rc) { $("#recapHeadline").textContent = "Market data isn't available right now."; $("#recapNarrative").innerHTML = "<p>Try Refresh in a minute.</p>"; return; }
    $("#recapPeriodLabel").textContent = rc.label;
    $("#recapHeadline").textContent = rc.headline;
    $("#recapNarrative").innerHTML = rc.narrative;
    $("#recapIndices").innerHTML = rc.indices.map((i) => `<li><div class="grow"><div class="title">${esc(i.name)}</div><div class="meta">${num(i.level, 0)}</div></div><span class="tag ${cls(i.change)}">${pct(i.change)}</span></li>`).join("");
    const maxAbs = Math.max(1, ...rc.sectors.map((s) => Math.abs(s.change)));
    $("#recapSectors").innerHTML = rc.sectors.map((s) => { const w = Math.abs(s.change) / maxAbs * 50; return `<div class="bar-row"><span>${esc(s.name)}</span><div class="bar-track"><span style="${s.change >= 0 ? `left:50%` : `left:${50 - w}%`};width:${w}%;background:${s.change >= 0 ? css("--up") : css("--down")}"></span></div><span class="bv ${cls(s.change)}">${pct(s.change, 1)}</span></div>`; }).join("");
    $("#recapMacro").innerHTML = rc.macro.map((m) => `<li><div class="grow"><div class="title">${esc(m.name)}</div><div class="meta">${m.symbol === "^TNX" ? num(m.level) + "%" : num(m.level, m.level > 1000 ? 0 : m.symbol === "USDCAD=X" ? 4 : 2)}</div></div><span class="tag ${cls(m.change)}">${m.points ? `${m.change >= 0 ? "+" : "−"}${Math.abs(m.change ?? 0).toFixed(2)} pts` : pct(m.change)}</span></li>`).join("");
    $("#recapDays").innerHTML = rc.days.slice().reverse().map((d) => `<li><div class="grow"><div class="title">${new Date(d.key + "T12:00:00Z").toLocaleDateString("en-CA", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" })}</div><div class="meta">${d.events.length ? esc([...new Set(d.events.map((e) => (e.country === "CAD" ? "🇨🇦 " : "🇺🇸 ") + e.title))].join(" · ")) : "No high-impact US/Canada releases"}</div></div><div class="r"><div class="${cls(d.spx)}"><b>${pct(d.spx)}</b></div><div class="meta">TSX ${pct(d.tsx)}</div></div></li>`).join("") || `<li class="empty-line">No sessions in this period yet.</li>`;
    $("#recapNews").innerHTML = newsItems(rc.news);
    // Index chart, normalised to % change over the period
    const ds = ["^GSPC", "^GSPTSE", "^IXIC"].map((sym, i) => {
      const s = state.market.find((x) => x.symbol === sym); if (!s) return null;
      const pts = s.points.filter(([t]) => Recap.dkey(t) >= rc.chart.fromKey); const b = pts[0]?.[1];
      return { label: s.name, data: pts.map(([t, c]) => ({ x: Date.parse(Recap.dkey(t) + "T20:00:00Z"), y: (c / b - 1) * 100 })), borderColor: [css("--accent"), "#ff8a3d", "#7a6cf0"][i], fill: false };
    }).filter(Boolean);
    const o = lineOpts({ pctAxis: true }); o.plugins.legend = { display: true, position: "top", align: "start", labels: { boxWidth: 10, usePointStyle: true } };
    o.elements.point.radius = state.recapPeriod === "month" ? 0 : 3;
    chart("recapChart", { type: "line", data: { datasets: ds }, options: o });
  }

  // ---------- Trade drawer ----------
  let side = "buy", lastFocus = null, symbolQuote = null;
  function openDrawer(id) { lastFocus = document.activeElement; $("#scrim").hidden = false; $(id).hidden = false; setTimeout(() => $(`${id} input, ${id} select`)?.focus(), 30); }
  function closeDrawers() { $$(".drawer").forEach((d) => (d.hidden = true)); $("#scrim").hidden = true; lastFocus?.focus?.(); }
  function openTrade(prefill = {}) {
    const f = $("#tradeForm"); f.reset();
    $$(".error", f).forEach((e) => (e.textContent = "")); $$("input", f).forEach((i) => i.removeAttribute("aria-invalid"));
    side = prefill.side || "buy"; setPressed(f, "side", side);
    $("#tDate").value = todayISO(); $("#tDate").max = todayISO(); $("#tFees").value = "0";
    $("#tSymbolHint").textContent = "Canadian listings end in .TO, e.g. VFV.TO"; $("#tUseLast").hidden = true; symbolQuote = null;
    if (prefill.symbol) { $("#tSymbol").value = prefill.symbol; lookupSymbol(); }
    updateTotal(); openDrawer("#tradeDrawer");
  }
  async function lookupSymbol() {
    const sym = $("#tSymbol").value.trim().toUpperCase(); $("#tSymbol").value = sym;
    if (!sym) return;
    $("#tCurrency").value = sym.endsWith(".TO") || sym.endsWith(".V") || sym.endsWith(".NE") ? "CAD" : "USD";
    try {
      const r = await api("quotes", { symbols: sym });
      const q = r.quotes[sym];
      if ($("#tSymbol").value.trim().toUpperCase() !== sym) return;
      if (!q || !isNum(q.price)) { setErr("tSymbol", `We couldn't find ${sym}. Check the ticker; Canadian listings end in .TO.`); symbolQuote = null; $("#tUseLast").hidden = true; return; }
      symbolQuote = q; state.quotes[sym] = q; setErr("tSymbol", "");
      if (q.currency && [...$("#tCurrency").options].some((o) => o.value === q.currency)) $("#tCurrency").value = q.currency;
      $("#tSymbolHint").textContent = `${q.name} · last ${money(q.price, q.currency)}`;
      $("#tUseLast").hidden = false;
    } catch { $("#tSymbolHint").textContent = "Couldn't check this ticker right now. You can still save the trade."; }
  }
  function parseNum(v) { const n = Number(String(v).replace(/[, $]/g, "")); return isFinite(n) ? n : NaN; }
  function setErr(id, msg) { const e = $(`.error[data-for="${id}"]`); if (e) e.textContent = msg; $("#" + id).setAttribute("aria-invalid", msg ? "true" : "false"); }
  function updateTotal() {
    const q = parseNum($("#tQty").value), p = parseNum($("#tPrice").value), f = parseNum($("#tFees").value || 0);
    const cur = $("#tCurrency").value;
    $("#tTotal").innerHTML = isFinite(q) && isFinite(p) && q > 0 && p > 0
      ? `${side === "buy" ? "Total cost" : "Proceeds"}: <b>${money(q * p + (side === "buy" ? 1 : -1) * (isFinite(f) ? f : 0), cur)}</b>`
      : `Enter shares and price to see the ${side === "buy" ? "total cost" : "proceeds"}.`;
  }
  function validate(field) {
    const sym = $("#tSymbol").value.trim().toUpperCase(), date = $("#tDate").value;
    const q = parseNum($("#tQty").value), p = parseNum($("#tPrice").value), f = parseNum($("#tFees").value || 0);
    const checks = {
      tSymbol: () => (!sym ? "Enter a ticker symbol." : !/^[A-Z0-9.\-^=]{1,20}$/.test(sym) ? "Use letters, numbers, dots or dashes only." : ""),
      tDate: () => (!date ? "Pick the trade date." : date > todayISO() ? "The date can't be in the future." : ""),
      tQty: () => {
        if (!(q > 0)) return "Enter how many shares (more than 0).";
        if (side === "sell") { const held = computeHoldings(date || todayISO())[sym]?.qty || 0; if (q > held + 1e-9) return `You held ${qtyFmt(held)} ${sym} on that date.`; }
        return "";
      },
      tPrice: () => (!(p > 0) ? "Enter the price per share." : ""),
      tFees: () => (!(f >= 0) ? "Fees can't be negative." : ""),
    };
    const ids = field ? [field] : Object.keys(checks);
    let ok = true;
    for (const id of ids) { const m = checks[id](); setErr(id, m); if (m) ok = false; }
    return ok;
  }
  function submitTrade(ev) {
    ev.preventDefault();
    if (!validate()) { $('#tradeForm [aria-invalid="true"]')?.focus(); return; }
    const t = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
      side, symbol: $("#tSymbol").value.trim().toUpperCase(), date: $("#tDate").value,
      qty: parseNum($("#tQty").value), price: parseNum($("#tPrice").value), fees: parseNum($("#tFees").value || 0) || 0,
      currency: $("#tCurrency").value, note: $("#tNote").value.trim(), created: Date.now(),
    };
    state.data.trades.push(t); save(); closeDrawers();
    toast(`${side === "buy" ? "Bought" : "Sold"} ${qtyFmt(t.qty)} ${t.symbol} saved`);
    state.meta[t.symbol] || loadMeta([t.symbol]);
    loadQuotes().then(renderCurrent); renderCurrent();
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
    if (state.data.trades.length && !(await confirmDialog({ title: "Add sample trades?", text: "Sample trades will be added alongside your existing trades. You can delete them from the Trades list.", ok: "Add sample trades" }))) return;
    const plan = [["VFV.TO", 30, 240, "CAD"], ["XIC.TO", 60, 200, "CAD"], ["RY.TO", 12, 160, "CAD"], ["ENB.TO", 25, 120, "CAD"], ["AAPL", 10, 230, "USD"], ["MSFT", 5, 90, "USD"], ["SU.TO", 30, 60, "CAD"], ["NVDA", 8, 45, "USD"]];
    try {
      const r = await api("charts", { symbols: plan.map((p) => p[0]).join(","), range: "1y" });
      const out = [];
      for (const [s, qty, daysAgo, cur] of plan) {
        const pts = r.charts[s]?.points; if (!pts?.length) continue;
        const idx = Math.max(0, pts.length - 1 - Math.round(daysAgo * 252 / 365));
        out.push({ id: "sample-" + s, side: "buy", symbol: s, date: Recap.dkey(pts[idx][0]), qty, price: +pts[idx][1].toFixed(2), fees: 0, currency: r.charts[s].currency || cur, note: "Sample trade", created: Date.now() });
      }
      out.push({ id: "sample-SU.TO-sell", side: "sell", symbol: "SU.TO", date: Recap.dkey(r.charts["SU.TO"].points.at(-20)[0]), qty: 10, price: +r.charts["SU.TO"].points.at(-20)[1].toFixed(2), fees: 0, currency: "CAD", note: "Sample trade", created: Date.now() });
      state.data.trades = state.data.trades.filter((t) => !t.id.startsWith("sample-")).concat(out); save();
      toast("Sample portfolio loaded"); await loadQuotes(); renderCurrent();
      loadMeta(out.map((t) => t.symbol)).then(renderCurrent);
    } catch (e) { toast("Couldn't load sample prices: " + e.message); }
  }

  // ---------- Settings ----------
  function openSettings() {
    $("#sBase").value = state.data.settings.base;
    $("#sStatus").innerHTML = state.demo ? "Demo mode: the live data service wasn't found. Deploy to Vercel to switch on live data." : `Live data connected.${state.quotesAt ? ` Prices updated ${new Date(state.quotesAt).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" })}.` : ""}`;
    applyTheme(); renderInstall();
    openDrawer("#settingsDrawer");
  }
  function exportBackup() {
    const blob = new Blob([JSON.stringify({ app: "portfolio-dashboard", version: 1, exported: new Date().toISOString(), ...state.data }, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `portfolio-backup-${todayISO()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  async function importBackup(file) {
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.trades) || data.trades.some((t) => !t.symbol || !t.date || !(t.qty > 0) || !(t.price > 0) || !["buy", "sell"].includes(t.side))) throw new Error("This file doesn't look like a portfolio backup.");
      if (!(await confirmDialog({ title: "Restore this backup?", text: `This replaces your current ${state.data.trades.length} trades with ${data.trades.length} trades from the backup.`, ok: "Replace trades" }))) return;
      state.data = { ...structuredClone(DEFAULTS), trades: data.trades, watchlist: data.watchlist || DEFAULTS.watchlist, settings: { ...DEFAULTS.settings, ...(data.settings || {}) } };
      save(); closeDrawers(); toast("Backup restored"); refreshAll();
    } catch (e) { toast(e.message.includes("JSON") ? "That file couldn't be read. Choose a backup .json file downloaded from this app." : e.message); }
  }

  // ---------- Theme ----------
  const darkQuery = matchMedia("(prefers-color-scheme: dark)");
  function effectiveTheme() { const t = state.data.settings.theme; return t === "light" || t === "dark" ? t : darkQuery.matches ? "dark" : "light"; }
  function applyTheme() {
    const t = state.data.settings.theme;
    if (t === "light" || t === "dark") document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
    $$("#sTheme [data-theme-choice]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.themeChoice === (t || "system"))));
    let meta = document.querySelector('meta[name="theme-color"]:not([media])');
    if (!meta) { meta = document.createElement("meta"); meta.name = "theme-color"; document.head.appendChild(meta); }
    meta.content = effectiveTheme() === "dark" ? "#0f1417" : "#f4f6f7";
    $("#themeBtn").setAttribute("aria-label", effectiveTheme() === "dark" ? "Switch to light mode" : "Switch to dark mode");
    $("#themeBtn").title = (effectiveTheme() === "dark" ? "Switch to light mode" : "Switch to dark mode") + " (T)";
    // Charts read colours when drawn, so redraw them in the new theme.
    requestAnimationFrame(() => renderCurrent());
  }
  function setTheme(t) { state.data.settings.theme = t; save(); applyTheme(); }

  // ---------- Install (open it like an app) ----------
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
    if (location.protocol === "file:") {
      text.textContent = "You're previewing the files directly. Put the dashboard online first (see the setup guide), then open your Vercel address to install it.";
      steps.innerHTML = ""; return;
    }
    if (isStandalone()) { text.textContent = "You're using the installed app. Open it any time from its icon."; steps.innerHTML = ""; btn.hidden = true; return; }
    const S = {
      ios: ["Open this page in Safari.", "Tap the Share button (square with an arrow; on newer iPhones it's under the ••• button).", "Tap View More if needed, then Add to Home Screen.", "Tap Add. Open Portfolio from your home screen."],
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
  function bind() {
    $("#tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) goto(b.dataset.tab); });
    document.addEventListener("click", async (e) => {
      const t = e.target;
      const go = t.closest("[data-goto]"); if (go) { goto(go.dataset.goto, go.dataset.sub); return; }
      const act = t.closest("[data-action]");
      if (act?.dataset.action === "add-trade") { openTrade(); return; }
      if (act?.dataset.action === "load-sample") { loadSample(); return; }
      if (t.closest("[data-close]") || t === $("#scrim")) { closeDrawers(); return; }
      const del = t.closest("[data-delete]");
      if (del) {
        const tr = state.data.trades.find((x) => x.id === del.dataset.delete); if (!tr) return;
        if (await confirmDialog({ title: "Delete this trade?", text: `${tr.side === "buy" ? "Buy" : "Sell"} ${qtyFmt(tr.qty)} ${tr.symbol} on ${tr.date} will be removed and your holdings recalculated.`, ok: "Delete trade" })) {
          state.data.trades = state.data.trades.filter((x) => x.id !== tr.id); save(); toast("Trade deleted"); renderCurrent();
        }
        return;
      }
      const symEl = t.closest("[data-symbol]");
      if (symEl && !t.closest("#tradeDrawer")) { openResearch(symEl.dataset.symbol); return; }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { if (!$("#confirmDialog").hidden) return; closeDrawers(); }
      if ((e.key === "Enter" || e.key === " ") && e.target.matches(".earn-row")) { e.preventDefault(); openResearch(e.target.dataset.symbol); }
      if (e.key.toLowerCase() === "t" && !e.metaKey && !e.ctrlKey && !e.target.closest("input, select, textarea")) setTheme(effectiveTheme() === "dark" ? "light" : "dark");
      if (e.key.toLowerCase() === "r" && !e.metaKey && !e.ctrlKey && !e.target.closest("input, select, textarea") && $("#tradeDrawer").hidden && $("#settingsDrawer").hidden) refreshAll();
    });
    // Overview
    $("#ovReturnMode").addEventListener("click", (e) => { const b = e.target.closest("[data-mode]"); if (!b) return; state.ovMode = b.dataset.mode; setPressed($("#ovReturnMode"), "mode", state.ovMode); renderOverview(); });
    // Portfolio
    $("#pfSeg").addEventListener("click", (e) => { const b = e.target.closest("[data-sub]"); if (b) { state.pfSub = b.dataset.sub; renderPortfolio(); } });
    $("#perfRanges").addEventListener("click", (e) => { const b = e.target.closest("[data-range]"); if (b) { state.perfRange = b.dataset.range; renderPerformance(); } });
    $("#perfCompare").addEventListener("change", renderPerformance);
    $("#sectorBench").addEventListener("change", renderSectors);
    $("#sectorFilter").addEventListener("click", (e) => { const b = e.target.closest("[data-group]"); if (b) { state.sectorGroup = b.dataset.group; renderSectors(); } });
    // Research
    $("#searchForm").addEventListener("submit", (e) => { e.preventDefault(); const s = $("#searchInput").value.trim().toUpperCase(); if (s) { state.research.symbol = s; state.research.data = null; renderResearch(); } });
    $("#rsRanges").addEventListener("click", (e) => { const b = e.target.closest("[data-range]"); if (b) { state.research.range = b.dataset.range; renderResearchChart(); } });
    $("#rsWatch").addEventListener("click", () => {
      const s = state.research.symbol; const wl = state.data.watchlist;
      state.data.watchlist = wl.includes(s) ? wl.filter((x) => x !== s) : [...wl, s]; save();
      toast(wl.includes(s) ? `${s} removed from watchlist` : `${s} added to watchlist`); renderResearch();
    });
    $("#rsTrade").addEventListener("click", () => openTrade({ symbol: state.research.symbol }));
    $("#ratioHelpBtn").addEventListener("click", () => { showRatioHelp = !showRatioHelp; if (state.research.data) renderRatios(state.research.data); });
    // Earnings
    $("#earnScope").addEventListener("click", (e) => { const b = e.target.closest("[data-scope]"); if (b) { state.earnScope = b.dataset.scope; renderEarnings(); } });
    $("#watchAddForm").addEventListener("submit", async (e) => {
      e.preventDefault(); const s = $("#watchAddInput").value.trim().toUpperCase();
      if (!s || !/^[A-Z0-9.\-^=]{1,20}$/.test(s)) { toast("Enter a ticker like AAPL or RY.TO"); return; }
      if (!state.data.watchlist.includes(s)) { state.data.watchlist.push(s); save(); }
      $("#watchAddInput").value = ""; toast(`${s} added to watchlist`); renderEarnings(); loadQuotes();
    });
    // News
    $("#newsSeg").addEventListener("click", (e) => { const b = e.target.closest("[data-sub]"); if (b) { state.newsSub = b.dataset.sub; renderNews(); } });
    $("#newsFilter").addEventListener("click", (e) => { const b = e.target.closest("[data-filter]"); if (b) { state.newsFilter = b.dataset.filter; renderHeadlines(); } });
    $("#dayTabs").addEventListener("click", (e) => { const b = e.target.closest("[data-day]"); if (b) { state.calDay = b.dataset.day; renderCalendar(); } });
    $("#impactFilter").addEventListener("click", (e) => {
      const b = e.target.closest("[data-impact]"); if (!b) return; const s = state.data.settings; const v = b.dataset.impact;
      s.impacts = s.impacts.includes(v) ? s.impacts.filter((x) => x !== v) : [...s.impacts, v]; save(); renderCalendar();
    });
    $("#countryFilter").addEventListener("click", (e) => {
      const b = e.target.closest("[data-country]"); if (!b) return; const s = state.data.settings; const v = b.dataset.country;
      s.countries = s.countries.includes(v) ? s.countries.filter((x) => x !== v) : [...s.countries, v]; save(); renderCalendar();
    });
    $("#eventList").addEventListener("click", (e) => {
      const b = e.target.closest(".event"); if (!b) return; const d = b.nextElementSibling; d.hidden = !d.hidden; b.setAttribute("aria-expanded", String(!d.hidden));
    });
    // Recap
    $("#recapRange").addEventListener("click", (e) => { const b = e.target.closest("[data-period]"); if (b) { state.recapPeriod = b.dataset.period; renderRecap(); } });
    // Trade form
    const f = $("#tradeForm");
    f.addEventListener("submit", submitTrade);
    f.addEventListener("click", (e) => { const b = e.target.closest("[data-side]"); if (b) { side = b.dataset.side; setPressed(f, "side", side); $("#tradeTitle").textContent = side === "buy" ? "Add buy" : "Add sell"; updateTotal(); if ($("#tQty").value) validate("tQty"); } });
    $("#tSymbol").addEventListener("blur", () => { if ($("#tSymbol").value.trim()) { validate("tSymbol"); lookupSymbol(); } });
    ["tDate", "tQty", "tPrice", "tFees"].forEach((id) => $("#" + id).addEventListener("blur", () => { if ($("#" + id).value) validate(id); }));
    ["tQty", "tPrice", "tFees", "tCurrency"].forEach((id) => $("#" + id).addEventListener("input", () => { updateTotal(); if ($("#" + id).getAttribute("aria-invalid") === "true") validate(id); }));
    $("#tSymbol").addEventListener("input", () => { if ($("#tSymbol").getAttribute("aria-invalid") === "true") setErr("tSymbol", ""); });
    $("#tUseLast").addEventListener("click", () => { if (symbolQuote) { $("#tPrice").value = symbolQuote.price.toFixed(2); setErr("tPrice", ""); updateTotal(); } });
    // Settings
    $("#settingsBtn").addEventListener("click", openSettings);
    $("#refreshBtn").addEventListener("click", refreshAll);
    $("#sBase").addEventListener("change", (e) => { state.data.settings.base = e.target.value; save(); loadQuotes().then(renderCurrent); });
    $("#sExport").addEventListener("click", exportBackup);
    $("#sImport").addEventListener("change", (e) => { const file = e.target.files[0]; if (file) importBackup(file); e.target.value = ""; });
    $("#sClear").addEventListener("click", async () => {
      if (await confirmDialog({ title: "Delete all trades?", text: `All ${state.data.trades.length} trades will be removed from this browser. Download a backup first if you might want them back.`, ok: "Delete all trades" })) {
        state.data.trades = []; save(); closeDrawers(); toast("All trades deleted"); renderCurrent();
      }
    });
    window.addEventListener("hashchange", () => { const t = location.hash.slice(1); if (t && t !== state.tab && $("#view-" + t)) goto(t); });
    // Keep charts in step with light/dark switches.
    darkQuery.addEventListener?.("change", () => { if (state.data.settings.theme === "system") applyTheme(); });
    $("#themeBtn").addEventListener("click", () => setTheme(effectiveTheme() === "dark" ? "light" : "dark"));
    $("#sTheme").addEventListener("click", (e) => { const b = e.target.closest("[data-theme-choice]"); if (b) setTheme(b.dataset.themeChoice); });
    $("#installBtn").addEventListener("click", install);
    $("#sInstall").addEventListener("click", install);
  }

  // ---------- Start ----------
  async function start() {
    bind();
    applyTheme(); renderInstall();
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) navigator.serviceWorker.register("sw.js").catch(() => {});
    const initial = location.hash.slice(1);
    goto($("#view-" + initial) ? initial : "overview");
    await probe();
    await loadQuotes(); renderCurrent();
    await Promise.all([loadMarket(), loadEvents(), loadNews()]);
    renderCurrent();
    loadMeta([...symbolsNeeded().held, ...state.data.watchlist]).then(() => { if (["overview", "earnings"].includes(state.tab)) renderCurrent(); });
    // Prices every minute while the app is visible; news & calendar every 15 minutes.
    setInterval(() => { if (document.visibilityState === "visible") loadQuotes().then(() => { if (["overview", "portfolio"].includes(state.tab) && state.pfSub !== "performance") renderCurrent(); }); }, 60000);
    setInterval(() => { if (document.visibilityState === "visible") Promise.all([loadMarket(), loadEvents(), loadNews()]); }, 15 * 60000);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
