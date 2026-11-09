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
  { key: "ai", group: "chains", name: "AI infrastructure", about: "From the companies buying AI capacity down to the chips, memory, networks, power and buildings it runs on.", links: [
    { key: "demand", name: "Cloud & AI spenders", role: "Demand: buying AI capacity", symbols: ["MSFT", "AMZN", "GOOGL", "META", "ORCL"], demand: true },
    { key: "compute", name: "AI chips", role: "GPUs and custom accelerators", symbols: ["NVDA", "AMD", "AVGO", "MRVL"] },
    { key: "memory", name: "Memory & storage", role: "HBM, DRAM and flash", symbols: ["MU", "WDC", "STX", "SNDK"] },
    { key: "foundry", name: "Foundry & equipment", role: "Making and packaging chips", symbols: ["TSM", "ASML", "AMAT", "LRCX", "KLAC"] },
    { key: "network", name: "Networking & optics", role: "Moving data between racks", symbols: ["ANET", "CIEN", "COHR", "LITE", "CRDO", "CLS.TO"] },
    { key: "power", name: "Power & grid", role: "Electricity for data centres", symbols: ["VST", "CEG", "GEV", "ETN", "PWR"] },
    { key: "cooling", name: "Cooling & data centres", role: "Buildings, cooling and racks", symbols: ["VRT", "EQIX", "DLR", "MOD"] },
  ] },
  { key: "grid", group: "chains", name: "Electrification & power", about: "Rising electricity demand from data centres, EVs, reshoring and heat pumps, traced back to generation, grid equipment, contractors and raw materials.", links: [
    { key: "demand", name: "Utilities", role: "Demand: building out the grid", symbols: ["NEE", "DUK", "SO", "AEP", "FTS.TO"], demand: true },
    { key: "gen", name: "Power generators", role: "Nuclear and gas plants", symbols: ["CEG", "VST", "NRG", "TLN"] },
    { key: "equip", name: "Grid equipment", role: "Turbines, transformers, switchgear", symbols: ["GEV", "ETN", "HUBB", "POWL"] },
    { key: "build", name: "Grid contractors", role: "Building lines and substations", symbols: ["PWR", "MTZ", "MYRG", "PRIM"] },
    { key: "copper", name: "Copper", role: "Wire and cable feedstock", symbols: ["FCX", "SCCO", "TECK", "HBM"] },
    { key: "uranium", name: "Uranium & fuel", role: "Fuel for nuclear plants", symbols: ["CCJ", "NXE", "UEC", "LEU"] },
  ] },
  { key: "obesity", group: "chains", name: "GLP-1 & obesity drugs", about: "Demand for weight-loss drugs traced back through injection devices, manufacturing tools and distribution.", links: [
    { key: "demand", name: "Drug makers", role: "Demand: selling GLP-1 drugs", symbols: ["LLY", "NVO", "AMGN", "VKTX"], demand: true },
    { key: "devices", name: "Injection devices & packaging", role: "Pens, vials, syringes", symbols: ["WST", "BDX", "STVN", "TFX"] },
    { key: "tools", name: "Bioprocessing & tools", role: "Equipment to make the drugs", symbols: ["TMO", "DHR", "A", "RGEN"] },
    { key: "dist", name: "Distribution & pharmacy", role: "Getting drugs to patients", symbols: ["MCK", "COR", "CAH", "CVS"] },
  ] },
  { key: "aero", group: "chains", name: "Aerospace & defence", about: "Record aircraft and defence order backlogs traced back to engines, parts, electronics and new space and drone makers.", links: [
    { key: "demand", name: "Primes & plane makers", role: "Demand: order backlogs", symbols: ["LMT", "RTX", "NOC", "GD", "BA"], demand: true },
    { key: "engines", name: "Engines & parts", role: "Engines, castings, aftermarket", symbols: ["GE", "HWM", "TDG", "HEI"] },
    { key: "elec", name: "Defence electronics", role: "Sensors, comms, avionics", symbols: ["LHX", "TDY", "CW", "MRCY"] },
    { key: "space", name: "Space & drones", role: "Launch, satellites, drones", symbols: ["RKLB", "KTOS", "AVAV", "MDA.TO"] },
    { key: "train", name: "Training & services", role: "Simulators and support", symbols: ["CAE.TO", "BAH", "LDOS", "SAIC"] },
  ] },
  { key: "housing", group: "chains", name: "Housing & construction", about: "New home building traced back to building products, materials and home equipment.", links: [
    { key: "demand", name: "Homebuilders", role: "Demand: starting new homes", symbols: ["DHI", "LEN", "PHM", "NVR"], demand: true },
    { key: "products", name: "Building products", role: "Distribution, doors, roofing", symbols: ["BLDR", "MAS", "OC", "TREX"] },
    { key: "materials", name: "Lumber & aggregates", role: "Wood, stone, cement", symbols: ["WFG.TO", "WY", "VMC", "MLM"] },
    { key: "hvac", name: "HVAC & appliances", role: "Heating, cooling, appliances", symbols: ["CARR", "TT", "LII", "WHR"] },
    { key: "retail", name: "Home improvement retail", role: "Renovation spending", symbols: ["HD", "LOW", "FND", "WSM"] },
  ] },
  { key: "energy", group: "chains", name: "Oil, gas & LNG", about: "Oil and gas production traced through services, pipelines, LNG export and refining.", links: [
    { key: "demand", name: "Producers", role: "Demand: drilling and output", symbols: ["XOM", "CVX", "COP", "CNQ.TO"], demand: true },
    { key: "services", name: "Oilfield services", role: "Drilling and completion", symbols: ["SLB", "HAL", "BKR", "WFRD"] },
    { key: "pipes", name: "Pipelines", role: "Moving oil and gas", symbols: ["ENB.TO", "TRP.TO", "WMB", "KMI"] },
    { key: "lng", name: "Natural gas & LNG", role: "Gas output and export", symbols: ["LNG", "EQT", "AR", "CTRA"] },
    { key: "refine", name: "Refiners", role: "Turning crude into fuel", symbols: ["MPC", "VLO", "PSX", "PBF"] },
  ] },
  { key: "sectors", group: "gics", name: "All 11 GICS sectors", about: "The whole market, one basket of large companies per sector. There's no chain here, so this ranks where estimates are rising and falling fastest.", sectors: true, links: [
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
  { key: "g-it", group: "gics", name: "Information Technology", about: "GICS Information Technology, from the software and cloud companies buying compute down to hardware, chips, chip equipment, components and networking.", links: [
    { key: "demand", name: "Software & services", role: "Demand: buying compute", symbols: ["MSFT", "ORCL", "CRM", "NOW", "SHOP.TO"], demand: true },
    { key: "hw", name: "Tech hardware & storage", role: "Servers, PCs, storage", symbols: ["AAPL", "DELL", "HPE", "SMCI"] },
    { key: "semi", name: "Semiconductors", role: "Chips", symbols: ["NVDA", "AVGO", "AMD", "QCOM"] },
    { key: "semieq", name: "Semiconductor equipment", role: "Tools to make chips", symbols: ["ASML", "AMAT", "LRCX", "KLAC"] },
    { key: "comp", name: "Electronic components", role: "Connectors, glass, boards", symbols: ["APH", "GLW", "TEL", "CLS.TO"] },
    { key: "comm", name: "Communications equipment", role: "Network gear", symbols: ["ANET", "CSCO", "CIEN", "MSI"] },
  ] },
  { key: "g-comm", group: "gics", name: "Communication Services", about: "GICS Communication Services, from ad-funded platforms and streamers down to the networks and towers that carry the traffic.", links: [
    { key: "demand", name: "Interactive media", role: "Demand: ad-funded platforms", symbols: ["GOOGL", "META", "RDDT", "PINS"], demand: true },
    { key: "ent", name: "Entertainment & streaming", role: "Content and streaming", symbols: ["NFLX", "DIS", "SPOT", "WBD"] },
    { key: "wireless", name: "Telecom carriers", role: "Wireless and wireline", symbols: ["TMUS", "VZ", "T", "BCE.TO"] },
    { key: "cable", name: "Cable & broadband", role: "Home internet and TV", symbols: ["CMCSA", "CHTR", "RCI-B.TO", "SATS"] },
    { key: "towers", name: "Towers & fibre", role: "Infrastructure under the networks", symbols: ["AMT", "CCI", "SBAC", "LUMN"] },
  ] },
  { key: "g-disc", group: "gics", name: "Consumer Discretionary", about: "GICS Consumer Discretionary, from retailers and e-commerce back to the makers of cars, homes, apparel and their parts suppliers.", links: [
    { key: "demand", name: "Retail & e-commerce", role: "Demand: consumer spending", symbols: ["AMZN", "HD", "LOW", "TJX"], demand: true },
    { key: "leisure", name: "Hotels, restaurants & travel", role: "Services spending", symbols: ["MCD", "SBUX", "BKNG", "MAR"] },
    { key: "apparel", name: "Apparel & footwear", role: "Brands and makers", symbols: ["NKE", "LULU", "DECK", "GIL.TO"] },
    { key: "homes", name: "Homebuilders & durables", role: "New homes and goods", symbols: ["DHI", "LEN", "PHM", "NVR"] },
    { key: "autos", name: "Automakers", role: "Cars and EVs", symbols: ["TSLA", "GM", "F", "STLA"] },
    { key: "parts", name: "Auto parts suppliers", role: "Components for automakers", symbols: ["APTV", "BWA", "LEA", "MG.TO"] },
  ] },
  { key: "g-staples", group: "gics", name: "Consumer Staples", about: "GICS Consumer Staples, from grocers and big-box retailers back to the brands, ingredients and packaging behind them.", links: [
    { key: "demand", name: "Grocers & big-box retail", role: "Demand: household spending", symbols: ["WMT", "COST", "KR", "L.TO"], demand: true },
    { key: "food", name: "Food & beverage brands", role: "Packaged food and drinks", symbols: ["KO", "PEP", "MDLZ", "KHC"] },
    { key: "hpc", name: "Household & personal products", role: "Cleaning and personal care", symbols: ["PG", "CL", "KMB", "EL"] },
    { key: "ingr", name: "Agriculture & ingredients", role: "Grain, oils, ingredients", symbols: ["ADM", "BG", "INGR", "DAR"] },
    { key: "pack", name: "Packaging", role: "Cans, boxes, containers", symbols: ["BALL", "CCK", "PKG", "IP"] },
  ] },
  { key: "g-health", group: "gics", name: "Health Care", about: "GICS Health Care, from insurers and hospitals that pay for care back to drug makers, device makers, lab tools and distributors.", links: [
    { key: "demand", name: "Insurers & hospitals", role: "Demand: paying for care", symbols: ["UNH", "ELV", "CI", "HCA"], demand: true },
    { key: "pharma", name: "Pharmaceuticals", role: "Large drug makers", symbols: ["LLY", "JNJ", "MRK", "ABBV"] },
    { key: "biotech", name: "Biotechnology", role: "Biotech drug makers", symbols: ["AMGN", "VRTX", "REGN", "GILD"] },
    { key: "devices", name: "Medical devices", role: "Surgical and medical equipment", symbols: ["ISRG", "SYK", "BSX", "MDT"] },
    { key: "tools", name: "Life-science tools", role: "Lab and manufacturing tools", symbols: ["TMO", "DHR", "A", "WST"] },
    { key: "dist", name: "Health care distributors", role: "Getting supplies to providers", symbols: ["MCK", "COR", "CAH", "HSIC"] },
  ] },
  { key: "g-fin", group: "gics", name: "Financials", about: "GICS Financials. These industries don't form a supply chain, so this ranks where analysts' estimates are rising and falling fastest.", sectors: true, links: [
    { key: "banks", name: "Banks", role: "Lending and deposits", symbols: ["JPM", "BAC", "WFC", "RY.TO", "TD.TO"] },
    { key: "markets", name: "Capital markets", role: "Trading, banking, asset managers", symbols: ["GS", "MS", "SCHW", "BX"] },
    { key: "pay", name: "Payments & consumer finance", role: "Cards and payments", symbols: ["V", "MA", "AXP", "PYPL"] },
    { key: "ins", name: "Insurance", role: "Property, life and casualty", symbols: ["PGR", "CB", "AIG", "MFC.TO"] },
    { key: "exch", name: "Exchanges & data", role: "Markets and ratings", symbols: ["SPGI", "ICE", "CME", "MCO"] },
  ] },
  { key: "g-ind", group: "gics", name: "Industrials", about: "GICS Industrials, from the contractors building projects back to machinery, electrical gear, aerospace, freight and building products.", links: [
    { key: "demand", name: "Construction & engineering", role: "Demand: building projects", symbols: ["PWR", "EME", "FIX", "STN.TO"], demand: true },
    { key: "mach", name: "Machinery", role: "Heavy equipment", symbols: ["CAT", "DE", "PH", "CMI"] },
    { key: "elec", name: "Electrical equipment", role: "Power and automation gear", symbols: ["ETN", "GEV", "HUBB", "AME"] },
    { key: "aero", name: "Aerospace & defence", role: "Planes, engines, defence", symbols: ["GE", "RTX", "LMT", "HWM"] },
    { key: "freight", name: "Freight & logistics", role: "Rail, trucking, parcels", symbols: ["UNP", "CP.TO", "CNR.TO", "UPS"] },
    { key: "bldg", name: "Building products", role: "HVAC, insulation, controls", symbols: ["TT", "CARR", "JCI", "OC"] },
  ] },
  { key: "g-energy", group: "gics", name: "Energy", about: "GICS Energy, from producers back through oilfield services, pipelines, LNG and refining.", links: [
    { key: "demand", name: "Producers", role: "Demand: drilling and output", symbols: ["XOM", "CVX", "COP", "CNQ.TO"], demand: true },
    { key: "services", name: "Oilfield services", role: "Drilling and completion", symbols: ["SLB", "HAL", "BKR", "WFRD"] },
    { key: "pipes", name: "Pipelines", role: "Moving oil and gas", symbols: ["ENB.TO", "TRP.TO", "WMB", "KMI"] },
    { key: "lng", name: "Natural gas & LNG", role: "Gas output and export", symbols: ["LNG", "EQT", "AR", "CTRA"] },
    { key: "refine", name: "Refiners", role: "Turning crude into fuel", symbols: ["MPC", "VLO", "PSX", "PBF"] },
  ] },
  { key: "g-util", group: "gics", name: "Utilities", about: "GICS Utilities, from regulated utilities back to power generators, grid equipment and nuclear fuel.", links: [
    { key: "demand", name: "Regulated utilities", role: "Demand: building out the grid", symbols: ["NEE", "DUK", "SO", "AEP", "FTS.TO"], demand: true },
    { key: "gen", name: "Power generators", role: "Nuclear and gas plants", symbols: ["CEG", "VST", "NRG", "TLN"] },
    { key: "equip", name: "Grid equipment", role: "Turbines, transformers, switchgear", symbols: ["GEV", "ETN", "HUBB", "POWL"] },
    { key: "water", name: "Water & gas utilities", role: "Water and gas networks", symbols: ["AWK", "WTRG", "ATO", "NI"] },
    { key: "uranium", name: "Uranium & fuel", role: "Fuel for nuclear plants", symbols: ["CCJ", "NXE", "UEC", "LEU"] },
  ] },
  { key: "g-re", group: "gics", name: "Real Estate", about: "GICS Real Estate. Property types don't form a supply chain, so this ranks where estimates are rising and falling fastest.", sectors: true, links: [
    { key: "dc", name: "Data centres", role: "Server space and power", symbols: ["EQIX", "DLR", "IRM", "AMT"] },
    { key: "ind", name: "Industrial & logistics", role: "Warehouses", symbols: ["PLD", "REXR", "EGP", "FR"] },
    { key: "resi", name: "Residential", role: "Apartments and rentals", symbols: ["AVB", "EQR", "INVH", "CAR-UN.TO"] },
    { key: "hc", name: "Health care REITs", role: "Senior housing, medical", symbols: ["WELL", "VTR", "DOC", "OHI"] },
    { key: "retail", name: "Retail REITs", role: "Malls and shopping centres", symbols: ["SPG", "O", "KIM", "REG"] },
    { key: "svc", name: "Real estate services", role: "Brokers and data", symbols: ["CBRE", "CSGP", "JLL", "FSV.TO"] },
  ] },
  { key: "g-mat", group: "gics", name: "Materials", about: "GICS Materials, from construction materials back to chemicals, metals, mining and fertilizer.", links: [
    { key: "demand", name: "Construction materials", role: "Demand: cement, aggregates", symbols: ["VMC", "MLM", "CRH", "EXP"], demand: true },
    { key: "chem", name: "Chemicals", role: "Industrial gases and chemicals", symbols: ["LIN", "APD", "DOW", "LYB"] },
    { key: "steel", name: "Steel & aluminum", role: "Metals", symbols: ["NUE", "STLD", "AA", "CLF"] },
    { key: "copper", name: "Copper", role: "Wire and cable feedstock", symbols: ["FCX", "SCCO", "TECK", "HBM"] },
    { key: "gold", name: "Gold & precious metals", role: "Miners and royalties", symbols: ["NEM", "AEM.TO", "WPM.TO", "FNV.TO"] },
    { key: "fert", name: "Fertilizers", role: "Potash and nitrogen", symbols: ["NTR.TO", "CF", "MOS", "ICL"] },
  ] },
  { key: "gics25", group: "gics", name: "All 25 GICS industry groups", about: "The whole market split into the 25 GICS industry groups, four large companies each. This ranks where profit estimates are rising and falling fastest.", sectors: true, links: [
    { key: "eng", name: "Energy", role: "Oil, gas, services", symbols: ["XOM", "CVX", "COP", "SLB"] },
    { key: "mat", name: "Materials", role: "Chemicals, metals, mining", symbols: ["LIN", "SHW", "FCX", "NUE"] },
    { key: "capg", name: "Capital goods", role: "Machinery, aerospace, electrical", symbols: ["GE", "CAT", "ETN", "RTX"] },
    { key: "cps", name: "Commercial & professional services", role: "Waste, staffing, data", symbols: ["WM", "RSG", "CTAS", "WCN.TO"] },
    { key: "trans", name: "Transportation", role: "Rail, airlines, parcels", symbols: ["UNP", "UPS", "CP.TO", "DAL"] },
    { key: "auto", name: "Automobiles & components", role: "Cars and parts", symbols: ["TSLA", "GM", "F", "MG.TO"] },
    { key: "dur", name: "Consumer durables & apparel", role: "Homes, apparel, goods", symbols: ["NKE", "LULU", "DHI", "DECK"] },
    { key: "csvc", name: "Consumer services", role: "Restaurants, hotels, travel", symbols: ["MCD", "BKNG", "SBUX", "MAR"] },
    { key: "dret", name: "Discretionary retail", role: "E-commerce and stores", symbols: ["AMZN", "HD", "TJX", "LOW"] },
    { key: "sret", name: "Staples retail", role: "Grocers and big-box", symbols: ["WMT", "COST", "KR", "L.TO"] },
    { key: "food", name: "Food, beverage & tobacco", role: "Brands", symbols: ["KO", "PEP", "PM", "MDLZ"] },
    { key: "hpp", name: "Household & personal products", role: "Cleaning and personal care", symbols: ["PG", "CL", "KMB", "EL"] },
    { key: "hces", name: "Health care equipment & services", role: "Devices, insurers, providers", symbols: ["UNH", "ISRG", "SYK", "MCK"] },
    { key: "pbl", name: "Pharma, biotech & life sciences", role: "Drugs and lab tools", symbols: ["LLY", "JNJ", "ABBV", "TMO"] },
    { key: "banks", name: "Banks", role: "Lending", symbols: ["JPM", "BAC", "WFC", "RY.TO"] },
    { key: "fsvc", name: "Financial services", role: "Payments, markets, asset managers", symbols: ["V", "MA", "GS", "BRK-B"] },
    { key: "ins", name: "Insurance", role: "P&C and life", symbols: ["PGR", "CB", "AIG", "MFC.TO"] },
    { key: "soft", name: "Software & services", role: "Software and IT services", symbols: ["MSFT", "ORCL", "CRM", "NOW"] },
    { key: "thw", name: "Tech hardware & equipment", role: "Devices, networking, components", symbols: ["AAPL", "CSCO", "ANET", "APH"] },
    { key: "semi", name: "Semiconductors & equipment", role: "Chips and chip tools", symbols: ["NVDA", "AVGO", "AMD", "AMAT"] },
    { key: "tel", name: "Telecommunication services", role: "Carriers", symbols: ["TMUS", "VZ", "T", "BCE.TO"] },
    { key: "media", name: "Media & entertainment", role: "Search, social, streaming", symbols: ["GOOGL", "META", "NFLX", "DIS"] },
    { key: "util", name: "Utilities", role: "Power, gas, water", symbols: ["NEE", "SO", "DUK", "CEG"] },
    { key: "reit", name: "Equity REITs", role: "Property owners", symbols: ["PLD", "AMT", "WELL", "EQIX"] },
    { key: "remd", name: "Real estate management & development", role: "Brokers and developers", symbols: ["CBRE", "CSGP", "JLL", "FSV.TO"] },
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
    Promise.race([pool(syms, syms.length > 60 ? 16 : 8, async (s) => { estMap[s] = await estimates(s).catch(() => null); }), new Promise((r) => setTimeout(r, 7000))]),
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
      insight = `${theme.key === "sectors" || theme.key === "gics25" ? "Across the market" : `Within ${theme.name}`}, ${byRev[0].name} has the fastest-rising profit estimates (median ${byRev[0].rev90 > 0 ? "+" : ""}${byRev[0].rev90}% in 90 days), followed by ${byRev[1].name}. ${lo.name} is seeing the weakest revisions (${lo.rev90 > 0 ? "+" : ""}${lo.rev90}%). Estimate revisions describe analysts' changing views and can reverse.`;
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
    theme: { key: theme.key, name: theme.name, about: theme.about, sectors: !!theme.sectors, group: theme.group },
    themes: THEMES.map((t) => ({ key: t.key, name: t.name, group: t.group })),
    links, signal, insight, coverage, listDate: LIST_DATE, asOf: Date.now(),
  };
}
