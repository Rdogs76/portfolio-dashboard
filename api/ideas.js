// GET /api/ideas -> stock ideas, the AI build-out "bottleneck finder", and where money is moving.
//
// The approach follows how investors spotted memory as the bottleneck in AI infrastructure:
// when demand at the top of a supply chain (AI spending) keeps rising, the link that can't keep up
// shows it first in its numbers — analysts keep raising that link's earnings estimates, growth
// forecasts accelerate, and the stocks start outperforming. So for each link in the chain we
// measure how fast estimates are being revised, expected growth and relative strength.
import { yf, send, fail, num, NO_VALIDATE } from "./_lib/util.js";
import { pool, quotes, daily, ranks, clip, r1 } from "./_lib/screen.js";

const CHAIN = [
  { key: "cloud", name: "Cloud & AI spenders", role: "Demand: the companies buying AI capacity", symbols: ["MSFT", "AMZN", "GOOGL", "META", "ORCL"] },
  { key: "compute", name: "AI chips", role: "GPUs and custom accelerators", symbols: ["NVDA", "AMD", "AVGO", "MRVL"] },
  { key: "memory", name: "Memory & storage", role: "HBM, DRAM and flash that feed the chips", symbols: ["MU", "WDC", "STX", "SNDK"] },
  { key: "foundry", name: "Foundry & equipment", role: "Making and packaging the chips", symbols: ["TSM", "ASML", "AMAT", "LRCX", "KLAC"] },
  { key: "network", name: "Networking & optics", role: "Moving data between chips and racks", symbols: ["ANET", "CIEN", "COHR", "LITE", "CRDO", "CLS.TO"] },
  { key: "power", name: "Power & grid", role: "Electricity for data centres", symbols: ["VST", "CEG", "GEV", "ETN", "PWR", "CCO.TO"] },
  { key: "cooling", name: "Cooling & data centres", role: "Buildings, cooling and racks", symbols: ["VRT", "EQIX", "DLR"] },
];
const OTHERS = [
  ["LLY", "Healthcare"], ["ISRG", "Healthcare"], ["JPM", "Financials"], ["V", "Financials"], ["COST", "Consumer"],
  ["NFLX", "Communication"], ["UBER", "Technology"], ["PLTR", "Technology"], ["CRWD", "Technology"], ["NOW", "Technology"],
  ["AXON", "Industrials"], ["GE", "Industrials"], ["SHOP.TO", "Canada"], ["CSU.TO", "Canada"], ["ATD.TO", "Canada"],
  ["BN.TO", "Canada"], ["RY.TO", "Canada"], ["CNQ.TO", "Canada"], ["WCN.TO", "Canada"], ["DOL.TO", "Canada"], ["TRI.TO", "Canada"],
];
const FLOW = [
  ["XLK", "Technology"], ["SMH", "Semiconductors"], ["IGV", "Software"], ["XLC", "Communication"], ["XLY", "Consumer discretionary"],
  ["XLP", "Consumer staples"], ["XLF", "Financials"], ["KRE", "Regional banks"], ["XLV", "Healthcare"], ["XBI", "Biotech"],
  ["XLI", "Industrials"], ["ITA", "Aerospace & defence"], ["PAVE", "Infrastructure"], ["XLE", "Energy"], ["XLU", "Utilities"],
  ["URA", "Uranium"], ["COPX", "Copper miners"], ["GLD", "Gold"], ["XLB", "Materials"], ["XLRE", "Real estate"],
  ["XHB", "Homebuilders"], ["IWM", "Small caps"], ["TLT", "Long-term bonds"], ["XIU.TO", "Canada (TSX 60)"],
];

function analystLabel(mean) {
  if (mean == null) return null;
  return mean <= 1.5 ? "Strong buy" : mean <= 2.5 ? "Buy" : mean <= 3.5 ? "Hold" : mean <= 4.5 ? "Sell" : "Strong sell";
}

async function stockData(symbol) {
  const s = await yf().quoteSummary(symbol, { modules: ["earningsTrend", "financialData"] }, NO_VALIDATE);
  const trend = s.earningsTrend?.trend || [];
  const pick = (p) => trend.find((t) => t.period === p);
  const ny = pick("+1y"), cy = pick("0y");
  const rev = (t) => {
    const e = t?.epsTrend; if (!e) return null;
    const now = num(e.current), ago = num(e["90daysAgo"]);
    return now != null && ago ? ((now - ago) / Math.abs(ago)) * 100 : null;
  };
  const f = s.financialData || {};
  return {
    rev90: rev(ny) ?? rev(cy),
    rev90cy: rev(cy),
    growthNext: num(ny?.growth) != null ? num(ny.growth) * 100 : null,
    growthThis: num(cy?.growth) != null ? num(cy.growth) * 100 : null,
    revGrowthNext: num(ny?.revenueEstimate?.growth) != null ? num(ny.revenueEstimate.growth) * 100 : null,
    revenueGrowth: num(f.revenueGrowth) != null ? num(f.revenueGrowth) * 100 : null,
    target: num(f.targetMeanPrice),
    recMean: num(f.recommendationMean),
    analysts: num(f.numberOfAnalystOpinions),
  };
}

function flowStats(bars, spy) {
  if (bars.length < 70) return null;
  const c = bars.map((b) => b.c), n = c.length;
  const ret = (k) => (n > k ? (c[n - 1] / c[n - 1 - k] - 1) * 100 : null);
  const spyRet = (k) => (spy.length > k ? (spy[spy.length - 1].c / spy[spy.length - 1 - k].c - 1) * 100 : null);
  let up = 0, all = 0;
  for (let i = n - 20; i < n; i++) { const v = bars[i].v; all += v; if (c[i] > c[i - 1]) up += v; else if (c[i] < c[i - 1]) up -= v; }
  const avg = (from, to) => { let s = 0, k = 0; for (let i = from; i < to; i++) { s += bars[i].v; k++; } return k ? s / k : 0; };
  const recent = avg(n - 20, n), base = avg(Math.max(0, n - 80), n - 20);
  return {
    r1m: ret(21), r3m: ret(63),
    rel1m: ret(21) != null && spyRet(21) != null ? ret(21) - spyRet(21) : null,
    rel3m: ret(63) != null && spyRet(63) != null ? ret(63) - spyRet(63) : null,
    pressure: all ? (up / all) * 100 : null,           // net buying pressure, -100..100
    volSurge: base ? (recent / base - 1) * 100 : null,  // trading activity vs the prior 3 months
  };
}

export default async function handler(req, res) {
  try {
    const chainSyms = CHAIN.flatMap((l) => l.symbols);
    const stockSyms = [...new Set([...chainSyms, ...OTHERS.map((o) => o[0])])];
    const [q, details, flowBars] = await Promise.all([
      quotes([...stockSyms, ...FLOW.map((f) => f[0]), "SPY"]),
      pool(stockSyms, 10, stockData),
      pool([...FLOW.map((f) => f[0]), "SPY"], 10, (s) => daily(s, 140)),
    ]);

    // ---- Stocks ----
    const linkOf = {}; for (const l of CHAIN) for (const s of l.symbols) linkOf[s] = l;
    const groupOf = Object.fromEntries(OTHERS);
    let stocks = stockSyms.map((sym, i) => {
      const qq = q[sym]; const d = details[i] || {};
      if (!qq || num(qq.regularMarketPrice) == null) return null;
      const price = num(qq.regularMarketPrice);
      const ma200 = num(qq.twoHundredDayAverage), ma50 = num(qq.fiftyDayAverage);
      return {
        symbol: sym, name: qq.shortName || qq.longName || sym, currency: qq.currency || null, price,
        group: linkOf[sym] ? "AI build-out" : groupOf[sym] || "Other",
        link: linkOf[sym]?.key || null,
        rev90: r1(clip(d.rev90, -80, 150)),
        growthNext: r1(clip(d.growthNext, -90, 300)),
        revGrowthNext: r1(d.revGrowthNext),
        upside: d.target && price ? r1((d.target / price - 1) * 100) : null,
        recMean: d.recMean, rating: analystLabel(d.recMean), analysts: d.analysts,
        chg1y: r1(num(qq.fiftyTwoWeekChangePercent)),
        vs200: ma200 ? r1((price / ma200 - 1) * 100) : null,
        vs50: ma50 ? r1((price / ma50 - 1) * 100) : null,
        forwardPE: r1(num(qq.forwardPE)),
        marketCap: num(qq.marketCap),
      };
    }).filter(Boolean);

    const R = {
      rev: ranks(stocks.map((s) => s.rev90)),
      growth: ranks(stocks.map((s) => s.growthNext)),
      mom: ranks(stocks.map((s) => (s.chg1y ?? 0) * 0.5 + (s.vs200 ?? 0))),
      upside: ranks(stocks.map((s) => s.upside)),
      rating: ranks(stocks.map((s) => (s.recMean == null ? null : -s.recMean))),
    };
    const W = { rev: 0.3, growth: 0.25, mom: 0.2, upside: 0.15, rating: 0.1 };
    stocks.forEach((s, i) => {
      let tot = 0, wsum = 0;
      for (const k of Object.keys(W)) if (R[k][i] != null) { tot += R[k][i] * W[k]; wsum += W[k]; }
      s.score = wsum ? Math.round(tot / wsum) : null;
      const why = [];
      if (s.rev90 != null && s.rev90 >= 3) why.push({ k: "rev", w: R.rev[i], text: `Analysts raised next year's profit estimate ${s.rev90.toFixed(0)}% in 90 days` });
      if (s.growthNext != null && s.growthNext >= 10) why.push({ k: "growth", w: R.growth[i], text: `Profit expected to grow ${s.growthNext.toFixed(0)}% next year` });
      if (s.chg1y != null && s.chg1y >= 15) why.push({ k: "mom", w: R.mom[i], text: `Up ${s.chg1y.toFixed(0)}% in a year${s.vs200 > 0 ? `, ${s.vs200.toFixed(0)}% above its 200-day average` : ""}` });
      if (s.upside != null && s.upside >= 8) why.push({ k: "upside", w: R.upside[i], text: `Analysts' average target is ${s.upside.toFixed(0)}% above today's price` });
      if (s.recMean != null && s.recMean <= 2) why.push({ k: "rating", w: R.rating[i], text: `Rated ${s.rating} by ${s.analysts || "most"} analysts` });
      s.why = why.sort((a, b) => b.w - a.w).slice(0, 3).map((x) => x.text);
      const risks = [];
      if (s.vs200 != null && s.vs200 > 40) risks.push(`Stretched: ${s.vs200.toFixed(0)}% above its 200-day average`);
      if (s.forwardPE != null && s.forwardPE > 45) risks.push(`Expensive: ${s.forwardPE.toFixed(0)}× next year's earnings`);
      if (s.rev90 != null && s.rev90 < -5) risks.push(`Estimates being cut (${s.rev90.toFixed(0)}% in 90 days)`);
      if (s.upside != null && s.upside < 0) risks.push("Trading above analysts' average target");
      s.risks = risks.slice(0, 2);
    });
    stocks.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

    // ---- Supply chain: where are estimates rising fastest? ----
    const med = (xs) => { const v = xs.filter((x) => x != null).sort((a, b) => a - b); if (!v.length) return null; const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
    let links = CHAIN.map((l) => {
      const ss = stocks.filter((s) => s.link === l.key);
      return {
        key: l.key, name: l.name, role: l.role,
        rev90: r1(med(ss.map((s) => s.rev90))), growthNext: r1(med(ss.map((s) => s.growthNext))),
        chg1y: r1(med(ss.map((s) => s.chg1y))), upside: r1(med(ss.map((s) => s.upside))),
        stocks: ss.slice().sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).map((s) => ({ symbol: s.symbol, name: s.name, score: s.score, rev90: s.rev90, chg1y: s.chg1y })),
      };
    });
    const LR = { rev: ranks(links.map((l) => l.rev90)), growth: ranks(links.map((l) => l.growthNext)), mom: ranks(links.map((l) => l.chg1y)) };
    links.forEach((l, i) => { l.pressure = Math.round((LR.rev[i] ?? 50) * 0.5 + (LR.growth[i] ?? 50) * 0.3 + (LR.mom[i] ?? 50) * 0.2); });
    const hot = links.filter((l) => l.key !== "cloud").sort((a, b) => b.pressure - a.pressure);
    const top = hot[0], demand = links.find((l) => l.key === "cloud");
    let insight = null;
    if (top) {
      const lead = `${top.name} is under the most pressure right now: analysts have raised next year's profit estimates for this group by about ${top.rev90 ?? 0}% in 90 days${top.growthNext != null ? ` and expect ${top.growthNext}% earnings growth` : ""}.`;
      const faster = demand?.rev90 != null && top.rev90 != null && top.rev90 > demand.rev90;
      insight = faster
        ? `${lead} Those estimates are climbing faster than the AI spenders' own (${demand.rev90}%), a sign that demand is outrunning what this link can supply. That is the same pattern that showed memory was holding back AI.${hot[1] ? ` ${hot[1].name} is next.` : ""}`
        : `${lead} The AI spenders' own estimates are rising even faster (${demand?.rev90 ?? "—"}%), so demand is still accelerating and no single supplier is clearly the bottleneck yet. Watch for a link whose estimates start to pull ahead.${hot[1] ? ` ${hot[1].name} is next in line.` : ""}`;
    }

    // ---- Money flow ----
    const spy = flowBars.at(-1) || [];
    let flows = FLOW.map(([sym, name], i) => { const st = flowBars[i] ? flowStats(flowBars[i], spy) : null; return st ? { symbol: sym, name, ...Object.fromEntries(Object.entries(st).map(([k, v]) => [k, r1(v)])) } : null; }).filter(Boolean);
    const FR = { a: ranks(flows.map((f) => f.rel1m)), b: ranks(flows.map((f) => f.rel3m)), c: ranks(flows.map((f) => f.pressure)) };
    flows.forEach((f, i) => { f.flowScore = Math.round((FR.a[i] ?? 50) * 0.4 + (FR.b[i] ?? 50) * 0.3 + (FR.c[i] ?? 50) * 0.3); });
    flows.sort((a, b) => b.flowScore - a.flowScore);
    const into = flows.slice(0, 3).map((f) => f.name.toLowerCase()), outOf = flows.slice(-3).reverse().map((f) => f.name.toLowerCase());
    const rotation = flows.length ? `Money is moving into ${into.join(", ")} and out of ${outOf.join(", ")} over the past one to three months.` : null;

    send(res, 200, { stocks, links, insight, flows, rotation, asOf: Date.now() }, 6 * 3600);
  } catch (e) { fail(res, e); }
}
