// Used by GET /api/ideas?section=chains&theme=<key>
// Market-wide "bottleneck finder". For each supply chain (or for the 11 sectors), measure how fast
// analysts are revising each link's earnings estimates, its expected growth and its price strength.
// When demand at the top of a chain keeps rising, the link that can't keep up tends to show it first:
// its estimates get revised up faster than the demand link's own. The stock lists are an editorial
// selection (reviewed LIST_DATE), not an index, so results describe these baskets only.
import { yf, num, NO_VALIDATE } from "./util.js";
import { pool, quotes, ranks, clip, r1 } from "./screen.js";

export const LIST_DATE = "2026-11-08";

export const THEMES = [
  { key: "ai", name: "AI infrastructure", about: "From the companies buying AI capacity down to the chips, memory, networks, power and buildings it runs on.", links: [
    { key: "demand", name: "Cloud & AI spenders", role: "Demand: buying AI capacity", symbols: ["MSFT", "AMZN", "GOOGL", "META", "ORCL"], demand: true },
    { key: "compute", name: "AI chips", role: "GPUs and custom accelerators", symbols: ["NVDA", "AMD", "AVGO", "MRVL"] },
    { key: "memory", name: "Memory & storage", role: "HBM, DRAM and flash", symbols: ["MU", "WDC", "STX", "SNDK"] },
    { key: "foundry", name: "Foundry & equipment", role: "Making and packaging chips", symbols: ["TSM", "ASML", "AMAT", "LRCX", "KLAC"] },
    { key: "network", name: "Networking & optics", role: "Moving data between racks", symbols: ["ANET", "CIEN", "COHR", "LITE", "CRDO", "CLS.TO"] },
    { key: "power", name: "Power & grid", role: "Electricity for data centres", symbols: ["VST", "CEG", "GEV", "ETN", "PWR"] },
    { key: "cooling", name: "Cooling & data centres", role: "Buildings, cooling and racks", symbols: ["VRT", "EQIX", "DLR", "MOD"] },
  ] },
  { key: "grid", name: "Electrification & power", about: "Rising electricity demand from data centres, EVs, reshoring and heat pumps, traced back to generation, grid equipment, contractors and raw materials.", links: [
    { key: "demand", name: "Utilities", role: "Demand: building out the grid", symbols: ["NEE", "DUK", "SO", "AEP", "FTS.TO"], demand: true },
    { key: "gen", name: "Power generators", role: "Nuclear and gas plants", symbols: ["CEG", "VST", "NRG", "TLN"] },
    { key: "equip", name: "Grid equipment", role: "Turbines, transformers, switchgear", symbols: ["GEV", "ETN", "HUBB", "POWL"] },
    { key: "build", name: "Grid contractors", role: "Building lines and substations", symbols: ["PWR", "MTZ", "MYRG", "PRIM"] },
    { key: "copper", name: "Copper", role: "Wire and cable feedstock", symbols: ["FCX", "SCCO", "TECK", "HBM"] },
    { key: "uranium", name: "Uranium & fuel", role: "Fuel for nuclear plants", symbols: ["CCJ", "NXE", "UEC", "LEU"] },
  ] },
  { key: "obesity", name: "GLP-1 & obesity drugs", about: "Demand for weight-loss drugs traced back through injection devices, manufacturing tools and distribution.", links: [
    { key: "demand", name: "Drug makers", role: "Demand: selling GLP-1 drugs", symbols: ["LLY", "NVO", "AMGN", "VKTX"], demand: true },
    { key: "devices", name: "Injection devices & packaging", role: "Pens, vials, syringes", symbols: ["WST", "BDX", "STVN", "TFX"] },
    { key: "tools", name: "Bioprocessing & tools", role: "Equipment to make the drugs", symbols: ["TMO", "DHR", "A", "RGEN"] },
    { key: "dist", name: "Distribution & pharmacy", role: "Getting drugs to patients", symbols: ["MCK", "COR", "CAH", "CVS"] },
  ] },
  { key: "aero", name: "Aerospace & defence", about: "Record aircraft and defence order backlogs traced back to engines, parts, electronics and new space and drone makers.", links: [
    { key: "demand", name: "Primes & plane makers", role: "Demand: order backlogs", symbols: ["LMT", "RTX", "NOC", "GD", "BA"], demand: true },
    { key: "engines", name: "Engines & parts", role: "Engines, castings, aftermarket", symbols: ["GE", "HWM", "TDG", "HEI"] },
    { key: "elec", name: "Defence electronics", role: "Sensors, comms, avionics", symbols: ["LHX", "TDY", "CW", "MRCY"] },
    { key: "space", name: "Space & drones", role: "Launch, satellites, drones", symbols: ["RKLB", "KTOS", "AVAV", "MDA.TO"] },
    { key: "train", name: "Training & services", role: "Simulators and support", symbols: ["CAE.TO", "BAH", "LDOS", "SAIC"] },
  ] },
  { key: "housing", name: "Housing & construction", about: "New home building traced back to building products, materials and home equipment.", links: [
    { key: "demand", name: "Homebuilders", role: "Demand: starting new homes", symbols: ["DHI", "LEN", "PHM", "NVR"], demand: true },
    { key: "products", name: "Building products", role: "Distribution, doors, roofing", symbols: ["BLDR", "MAS", "OC", "TREX"] },
    { key: "materials", name: "Lumber & aggregates", role: "Wood, stone, cement", symbols: ["WFG.TO", "WY", "VMC", "MLM"] },
    { key: "hvac", name: "HVAC & appliances", role: "Heating, cooling, appliances", symbols: ["CARR", "TT", "LII", "WHR"] },
    { key: "retail", name: "Home improvement retail", role: "Renovation spending", symbols: ["HD", "LOW", "FND", "WSM"] },
  ] },
  { key: "energy", name: "Oil, gas & LNG", about: "Oil and gas production traced through services, pipelines, LNG export and refining.", links: [
    { key: "demand", name: "Producers", role: "Demand: drilling and output", symbols: ["XOM", "CVX", "COP", "CNQ.TO"], demand: true },
    { key: "services", name: "Oilfield services", role: "Drilling and completion", symbols: ["SLB", "HAL", "BKR", "WFRD"] },
    { key: "pipes", name: "Pipelines", role: "Moving oil and gas", symbols: ["ENB.TO", "TRP.TO", "WMB", "KMI"] },
    { key: "lng", name: "Natural gas & LNG", role: "Gas output and export", symbols: ["LNG", "EQT", "AR", "CTRA"] },
    { key: "refine", name: "Refiners", role: "Turning crude into fuel", symbols: ["MPC", "VLO", "PSX", "PBF"] },
  ] },
  { key: "sectors", name: "All 11 sectors", about: "The whole market, one basket of large companies per sector. There's no chain here, so this ranks where estimates are rising and falling fastest.", sectors: true, links: [
    { key: "tech", name: "Technology", role: "Software, hardware, chips", symbols: ["AAPL", "MSFT", "NVDA", "AVGO", "ORCL", "SHOP.TO"] },
    { key: "comm", name: "Communication", role: "Internet, media, telecom", symbols: ["GOOGL", "META", "NFLX", "TMUS", "DIS"] },
    { key: "disc", name: "Consumer discretionary", role: "Retail, autos, travel", symbols: ["AMZN", "TSLA", "HD", "MCD", "BKNG", "ATD.TO"] },
    { key: "staples", name: "Consumer staples", role: "Food, household goods", symbols: ["WMT", "COST", "PG", "KO", "PEP", "L.TO"] },
    { key: "health", name: "Healthcare", role: "Drugs, devices, insurers", symbols: ["LLY", "UNH", "JNJ", "ABBV", "MRK", "ISRG"] },
    { key: "fin", name: "Financials", role: "Banks, payments, insurers", symbols: ["JPM", "V", "MA", "BAC", "RY.TO", "TD.TO"] },
    { key: "ind", name: "Industrials", role: "Machinery, rail, aerospace", symbols: ["GE", "CAT", "RTX", "UNP", "CP.TO", "WCN.TO"] },
    { key: "energy", name: "Energy", role: "Oil, gas, pipelines", symbols: ["XOM", "CVX", "COP", "CNQ.TO", "ENB.TO"] },
    { key: "util", name: "Utilities", role: "Power and water", symbols: ["NEE", "SO", "DUK", "CEG", "FTS.TO"] },
    { key: "re", name: "Real estate", role: "REITs and property", symbols: ["PLD", "AMT", "WELL", "EQIX", "SPG"] },
    { key: "mat", name: "Materials", role: "Chemicals, metals, mining", symbols: ["LIN", "SHW", "FCX", "NEM", "NTR.TO", "AEM.TO"] },
  ] },
];

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

async function estimates(symbol) {
  const s = await withTimeout(yf().quoteSummary(symbol, { modules: ["earningsTrend"] }, NO_VALIDATE), 4000);
  const trend = s.earningsTrend?.trend || [];
  const pick = (p) => trend.find((t) => t.period === p);
  const ny = pick("+1y"), cy = pick("0y");
  const rev = (t) => { const e = t?.epsTrend; const now = num(e?.current), ago = num(e?.["90daysAgo"]); return now != null && ago ? ((now - ago) / Math.abs(ago)) * 100 : null; };
  const g = (t) => (num(t?.growth) != null ? num(t.growth) * 100 : null);
  const rg = (t) => (num(t?.revenueEstimate?.growth) != null ? num(t.revenueEstimate.growth) * 100 : null);
  return { rev90: rev(ny) ?? rev(cy), growthNext: g(ny) ?? g(cy), revGrowthNext: rg(ny) ?? rg(cy) };
}

const median = (xs) => { const v = xs.filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b); if (!v.length) return null; const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };

export async function chainData(themeKey) {
  const theme = THEMES.find((t) => t.key === themeKey) || THEMES[0];
  const syms = [...new Set(theme.links.flatMap((l) => l.symbols))];
  // Vercel stops a function at 10s, so stop waiting after ~7s and return whatever has arrived (coverage shows the gap).
  const estMap = {};
  const [q] = await Promise.all([
    withTimeout(quotes(syms), 7000).catch(() => ({})),
    Promise.race([pool(syms, 8, async (s) => { estMap[s] = await estimates(s).catch(() => null); }), new Promise((r) => setTimeout(r, 7000))]),
  ]);
  const est = syms.map((s) => estMap[s]);
  const bySym = Object.fromEntries(syms.map((s, i) => {
    const qq = q[s] || {}, e = est[i] || {};
    const price = num(qq.regularMarketPrice), ma200 = num(qq.twoHundredDayAverage);
    return [s, {
      symbol: s, name: qq.shortName || qq.longName || s,
      // Clip revisions: a fiscal-year rollover or a tiny base can produce meaningless jumps.
      rev90: r1(clip(e.rev90, -50, 100)), growthNext: r1(clip(e.growthNext, -90, 200)), revGrowthNext: r1(e.revGrowthNext),
      chg1y: r1(num(qq.fiftyTwoWeekChangePercent)), vs200: price && ma200 ? r1((price / ma200 - 1) * 100) : null,
      forwardPE: r1(num(qq.forwardPE)), ok: e.rev90 != null || price != null,
    }];
  }));
  const links = theme.links.map((l) => {
    const ss = l.symbols.map((s) => bySym[s]);
    const n = ss.filter((s) => s.rev90 != null).length;
    return {
      key: l.key, name: l.name, role: l.role, demand: !!l.demand, n, of: l.symbols.length,
      rev90: r1(median(ss.map((s) => s.rev90))), growthNext: r1(median(ss.map((s) => s.growthNext))),
      revGrowthNext: r1(median(ss.map((s) => s.revGrowthNext))), chg1y: r1(median(ss.map((s) => s.chg1y))),
      stocks: ss.slice().sort((a, b) => (b.rev90 ?? -999) - (a.rev90 ?? -999)).map(({ symbol, name, rev90, chg1y, growthNext }) => ({ symbol, name, rev90, chg1y, growthNext })),
    };
  });
  const LR = { rev: ranks(links.map((l) => l.rev90)), growth: ranks(links.map((l) => l.growthNext)), mom: ranks(links.map((l) => l.chg1y)) };
  links.forEach((l, i) => { l.pressure = Math.round((LR.rev[i] ?? 50) * 0.5 + (LR.growth[i] ?? 50) * 0.3 + (LR.mom[i] ?? 50) * 0.2); l.reliable = l.n >= 3; });

  const total = syms.length, got = syms.filter((s) => bySym[s].rev90 != null).length, priced = syms.filter((s) => bySym[s].chg1y != null).length;
  const coverage = Math.round((Math.min(got, priced) / total) * 100);
  const demand = links.find((l) => l.demand);
  const candidates = links.filter((l) => !l.demand && l.reliable && l.rev90 != null).sort((a, b) => b.rev90 - a.rev90);
  const top = candidates[0], second = candidates[1];
  let signal = null, insight = null;
  if (theme.sectors) {
    const byRev = links.filter((l) => l.reliable && l.rev90 != null).sort((a, b) => b.rev90 - a.rev90);
    if (byRev.length >= 3) {
      signal = byRev[0].key;
      const lo = byRev.at(-1);
      insight = `Across the market, ${byRev[0].name} has the fastest-rising profit estimates (median ${byRev[0].rev90 > 0 ? "+" : ""}${byRev[0].rev90}% in 90 days), followed by ${byRev[1].name}. ${lo.name} is seeing the weakest revisions (${lo.rev90 > 0 ? "+" : ""}${lo.rev90}%). Estimate revisions describe analysts' changing views and can reverse.`;
    }
  } else if (top) {
    const lead = top.rev90 - (demand?.rev90 ?? 0);
    // Only call a bottleneck when the supplier's estimates are clearly outpacing the demand link's.
    if (demand?.reliable && demand.rev90 != null && lead >= 2) {
      signal = top.key;
      insight = `${top.name} shows the strongest estimate-revision lead: analysts raised next year's profit estimates for this group by a median ${top.rev90}% in 90 days (${top.n} of ${top.of} companies with data), versus ${demand.rev90}% for ${demand.name}. One reading is that demand may be running ahead of what that link can supply; this pattern hasn't been tested for reliability here.${second ? ` ${second.name} is next.` : ""}`;
    } else {
      insight = `No link is clearly pulling ahead yet. ${top.name} leads on estimate revisions (median ${top.rev90 ?? "—"}%), but ${demand ? `${demand.name} ${demand.rev90 != null ? `are at ${demand.rev90}%` : "have no data"}` : "the demand link has no data"}, so demand isn't clearly outrunning supply. Watch for a link whose estimates start to pull ahead.`;
    }
  }
  return {
    theme: { key: theme.key, name: theme.name, about: theme.about, sectors: !!theme.sectors },
    themes: THEMES.map((t) => ({ key: t.key, name: t.name })),
    links, signal, insight, coverage, listDate: LIST_DATE, asOf: Date.now(),
  };
}
