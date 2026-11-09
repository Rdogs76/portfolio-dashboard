// Demo data used only when the live API isn't reachable (e.g. opening the files before deploying).
// Everything here is generated and clearly labelled as demo in the UI.
(function () {
  const CATALOG = {
    "VFV.TO": [148, "CAD", "Vanguard S&P 500 Index ETF", "ETF", "spx"],
    "XIC.TO": [44, "CAD", "iShares Core S&P/TSX Capped Composite ETF", "ETF", "tsx"],
    "XIU.TO": [43, "CAD", "iShares S&P/TSX 60 Index ETF", "ETF", "tsx"],
    "SPY": [670, "USD", "SPDR S&P 500 ETF Trust", "ETF", "spx"],
    "QQQ": [600, "USD", "Invesco QQQ Trust", "ETF", "ndx"],
    "AAPL": [245, "USD", "Apple Inc.", "EQUITY", "Technology"],
    "MSFT": [505, "USD", "Microsoft Corporation", "EQUITY", "Technology"],
    "NVDA": [182, "USD", "NVIDIA Corporation", "EQUITY", "Technology"],
    "AMZN": [225, "USD", "Amazon.com, Inc.", "EQUITY", "Consumer Cyclical"],
    "GOOGL": [240, "USD", "Alphabet Inc.", "EQUITY", "Communication Services"],
    "RY.TO": [196, "CAD", "Royal Bank of Canada", "EQUITY", "Financial Services"],
    "TD.TO": [108, "CAD", "The Toronto-Dominion Bank", "EQUITY", "Financial Services"],
    "SU.TO": [58, "CAD", "Suncor Energy Inc.", "EQUITY", "Energy"],
    "ENB.TO": [66, "CAD", "Enbridge Inc.", "EQUITY", "Energy"],
    "SHOP.TO": [205, "CAD", "Shopify Inc.", "EQUITY", "Technology"],
    "CNR.TO": [138, "CAD", "Canadian National Railway Company", "EQUITY", "Industrials"],
    "^GSPC": [6650, "USD", "S&P 500", "INDEX"], "^IXIC": [22400, "USD", "NASDAQ Composite", "INDEX"],
    "^DJI": [46300, "USD", "Dow Jones Industrial Average", "INDEX"], "^GSPTSE": [29800, "CAD", "S&P/TSX Composite", "INDEX"],
    "^RUT": [2440, "USD", "Russell 2000", "INDEX"], "^VIX": [17.5, "USD", "CBOE Volatility Index", "INDEX"],
    "^TNX": [4.12, "USD", "Treasury Yield 10 Years", "INDEX"], "CL=F": [62.4, "USD", "Crude Oil", "FUTURE"],
    "GC=F": [3920, "USD", "Gold", "FUTURE"], "DX-Y.NYB": [98.3, "USD", "US Dollar Index", "INDEX"],
    "USDCAD=X": [1.394, "CAD", "USD/CAD", "CURRENCY"], "CADUSD=X": [0.7174, "USD", "CAD/USD", "CURRENCY"],
    "BTC-USD": [121000, "USD", "Bitcoin USD", "CRYPTOCURRENCY"],
    "XLK": [285, "USD"], "XLF": [53, "USD"], "XLE": [89, "USD"], "XLV": [140, "USD"], "XLY": [238, "USD"],
    "XLP": [78, "USD"], "XLI": [154, "USD"], "XLB": [90, "USD"], "XLU": [86, "USD"], "XLRE": [42, "USD"], "XLC": [116, "USD"],
  };
  const WEIGHTS = {
    spx: { Technology: .34, "Financial Services": .13, "Communication Services": .1, "Consumer Cyclical": .1, Healthcare: .09, Industrials: .08, "Consumer Defensive": .05, Energy: .03, Utilities: .025, "Real Estate": .02, "Basic Materials": .02 },
    tsx: { "Financial Services": .33, Energy: .17, Industrials: .12, Technology: .1, "Basic Materials": .12, "Consumer Cyclical": .03, Utilities: .04, "Communication Services": .03, "Consumer Defensive": .04, "Real Estate": .02 },
    ndx: { Technology: .6, "Communication Services": .16, "Consumer Cyclical": .13, Healthcare: .05, "Consumer Defensive": .04, Industrials: .02 },
  };
  // Volatility tweaks so the recap has something to explain.
  const VOL = { "^VIX": .05, "^TNX": .012, "CL=F": .02, "BTC-USD": .03, "USDCAD=X": .003, "CADUSD=X": .003, "DX-Y.NYB": .004, "GC=F": .009 };

  function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { return () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  function info(sym) {
    const c = CATALOG[sym];
    if (c) return { price: c[0], currency: c[1], name: c[2] || sym, type: c[3] || "ETF", sector: c[4] || null };
    const h = hash(sym);
    return { price: 20 + (h % 280), currency: sym.endsWith(".TO") ? "CAD" : "USD", name: sym.replace(/\..*/, "") + " Corp. (demo)", type: "EQUITY", sector: ["Technology", "Healthcare", "Industrials", "Financial Services"][h % 4] };
  }

  // Trading days (Mon–Fri) going back from today, 16:00 New York ≈ 20:00 UTC.
  function tradingDays(n) {
    const out = []; const d = new Date(); d.setUTCHours(20, 0, 0, 0);
    if (Date.now() < d.getTime()) d.setUTCDate(d.getUTCDate() - 1);
    while (out.length < n) { const wd = d.getUTCDay(); if (wd !== 0 && wd !== 6) out.unshift(d.getTime()); d.setUTCDate(d.getUTCDate() - 1); }
    return out;
  }

  const cache = {};
  function daily(sym) {
    if (cache[sym]) return cache[sym];
    const meta = info(sym);
    const days = tradingDays(520);
    const r = rng(hash(sym));
    const vol = VOL[sym] ?? (sym.startsWith("^") ? .008 : .015);
    const market = sym.startsWith("^") || sym.startsWith("XL") || meta.type === "ETF" || meta.type === "EQUITY";
    const closes = new Array(days.length);
    let p = meta.price;
    closes[days.length - 1] = p;
    for (let i = days.length - 1; i > 0; i--) {
      let shock = (r() - .5) * 2 * vol * 1.7;
      // A shared "market day" component so things move together, plus a rough final week.
      const mr = rng(hash("mkt") + i)();
      if (market) shock += (mr - .5) * vol;
      if (i >= days.length - 5 && market && sym !== "^VIX") shock -= .004;
      if (sym === "^VIX" && i >= days.length - 5) shock += .03;
      p = p / (1 + shock + .0003);
      closes[i - 1] = p;
    }
    cache[sym] = { meta, points: days.map((t, i) => [t, +closes[i].toFixed(4)]) };
    return cache[sym];
  }

  function quote(sym) {
    const { meta, points } = daily(sym);
    const last = points[points.length - 1][1], prev = points[points.length - 2][1];
    const closes = points.slice(-252).map((p) => p[1]); const r = rng(hash(sym + "q"));
    const divYield = meta.type === "INDEX" || meta.type === "FUTURE" || meta.type === "CURRENCY" ? null : +(r() * 4.5).toFixed(2);
    return { symbol: sym, name: meta.name, price: last, change: last - prev, changePct: (last / prev - 1) * 100, prevClose: prev, currency: meta.currency, exchange: sym.endsWith(".TO") ? "Toronto" : "NasdaqGS", type: meta.type, marketState: "REGULAR", time: points[points.length - 1][0],
      high52: Math.max(...closes), low52: Math.min(...closes), pe: meta.type === "EQUITY" ? 12 + r() * 30 : null, marketCap: meta.type === "EQUITY" ? last * (1e9 + r() * 3e9) : null,
      dividendRate: divYield ? +(last * divYield / 100).toFixed(2) : null, dividendYield: divYield };
  }

  function chart(sym, range) {
    const { meta, points } = daily(sym);
    const days = { "1mo": 22, "3mo": 64, "6mo": 127, "1y": 253, "2y": 505, "5y": 505, "ytd": 190 }[range];
    if (days) return { symbol: sym, currency: meta.currency, points: points.slice(-days) };
    // Intraday: interpolate between closes with noise.
    const n = range === "1d" ? 78 : 65;
    const span = range === "1d" ? 1 : 5;
    const base = points.slice(-(span + 1));
    const r = rng(hash(sym + range));
    const out = [];
    for (let d = 1; d <= span; d++) {
      const [t, c] = base[d]; const prev = base[d - 1][1];
      const per = Math.round(n / span);
      for (let k = 0; k < per; k++) {
        const f = k / (per - 1);
        const open = t - 6.5 * 3600000;
        out.push([open + f * 6.5 * 3600000, prev + (c - prev) * f + (r() - .5) * c * .004 * Math.sin(f * Math.PI)]);
      }
    }
    return { symbol: sym, currency: meta.currency, points: out };
  }

  function weekStart() { const d = new Date(); const wd = (d.getDay() + 6) % 7; d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - wd); return d; }
  function at(dayOffset, hourET, minute = 0) { const d = weekStart(); d.setDate(d.getDate() + dayOffset); const iso = d.toISOString().slice(0, 10); return Date.parse(`${iso}T${String(hourET).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-04:00`); }

  function calendar() {
    const E = (day, h, m, country, impact, title, forecast, previous) => ({ id: `${day}-${h}-${title}`, time: at(day, h, m), country, impact, title, forecast, previous, actual: null });
    return [
      E(0, 10, 0, "USD", "Low", "ISM Services Prices", "68.5%", "69.2%"),
      E(0, 21, 30, "AUD", "Medium", "Building Approvals m/m", "1.5%", "-2.2%"),
      E(1, 8, 30, "USD", "Medium", "Trade Balance", "-63.1B", "-78.3B"),
      E(1, 8, 30, "CAD", "Medium", "Trade Balance", "-5.6B", "-4.9B"),
      E(1, 10, 0, "USD", "High", "JOLTS Job Openings", "7.20M", "7.18M"),
      E(1, 13, 0, "USD", "Medium", "10-y Bond Auction", "", "4.03|2.5"),
      E(2, 10, 30, "USD", "Medium", "Crude Oil Inventories", "-1.1M", "1.8M"),
      E(2, 14, 0, "USD", "High", "FOMC Meeting Minutes", "", ""),
      E(2, 4, 0, "EUR", "Medium", "German Industrial Production m/m", "-1.0%", "1.3%"),
      E(3, 8, 30, "USD", "High", "CPI m/m", "0.3%", "0.4%"),
      E(3, 8, 30, "USD", "High", "Core CPI m/m", "0.3%", "0.3%"),
      E(3, 8, 30, "USD", "Medium", "Unemployment Claims", "229K", "224K"),
      E(3, 10, 30, "CAD", "High", "BOC Gov Macklem Speaks", "", ""),
      E(3, 2, 0, "GBP", "Medium", "GDP m/m", "0.1%", "-0.1%"),
      E(4, 8, 30, "CAD", "High", "Employment Change", "8.3K", "-65.5K"),
      E(4, 8, 30, "CAD", "High", "Unemployment Rate", "7.2%", "7.1%"),
      E(4, 8, 30, "USD", "Medium", "PPI m/m", "0.2%", "-0.1%"),
      E(4, 10, 0, "USD", "High", "Prelim UoM Consumer Sentiment", "54.2", "55.1"),
      E(4, 10, 0, "USD", "Medium", "Prelim UoM Inflation Expectations", "", "4.7%"),
      E(6, 0, 0, "CNY", "Holiday", "Bank Holiday", "", ""),
    ];
  }

  function news(symbols) {
    const now = Date.now(); const H = 3600000;
    const general = [
      ["Stocks slide as Treasury yields climb ahead of inflation data", "Demo Wire", 2, ["^GSPC"]],
      ["Fed minutes show officials split on pace of further rate cuts", "Demo Wire", 20, []],
      ["Oil drops as US crude stockpiles rise more than expected", "Demo Markets", 27, ["CL=F"]],
      ["TSX dips as bank and energy stocks weigh on the index", "Demo Canada", 30, ["^GSPTSE"]],
      ["Tech shares lead decline as investors rotate into defensives", "Demo Wire", 46, ["XLK"]],
      ["Bank of Canada governor says rates are 'about where they should be'", "Demo Canada", 50, []],
      ["Job openings hold steady, pointing to a gradually cooling labour market", "Demo Economy", 70, []],
      ["Gold hits a record as investors seek safety", "Demo Markets", 74, ["GC=F"]],
    ].map(([title, publisher, hoursAgo, tickers], i) => ({ id: "g" + i, title: title + " (demo)", publisher, link: "#", time: now - hoursAgo * H, tickers, thumbnail: null }));
    const mine = (symbols || []).slice(0, 6).flatMap((s, i) => [
      { id: s + "a", title: `${info(s).name.replace(" (demo)", "")}: analysts update price targets ahead of earnings (demo)`, publisher: "Demo Wire", link: "#", time: now - (5 + i * 9) * H, tickers: [s], thumbnail: null },
    ]);
    return [...general, ...mine].sort((a, b) => b.time - a.time);
  }

  function stock(sym) {
    const q = quote(sym); const meta = info(sym); const r = rng(hash(sym + "s"));
    const isFund = meta.type === "ETF";
    const now = Date.now(); const D = 86400000;
    const weeks = 1 + Math.floor(r() * 7);
    const trend = ["0m", "-1m", "-2m", "-3m"].map((period) => {
      const n = 20 + Math.floor(r() * 20);
      const sb = Math.floor(n * (.15 + r() * .2)), b = Math.floor(n * (.2 + r() * .2)), s = Math.floor(n * r() * .08);
      return { period, strongBuy: sb, buy: b, hold: Math.max(0, n - sb - b - s), sell: s, strongSell: 0 };
    });
    const firms = ["Demo Securities", "Example Capital", "Sample & Co.", "Placeholder Partners", "Illustrative Bank"];
    const grades = ["Buy", "Outperform", "Overweight", "Hold", "Neutral"];
    return {
      symbol: sym, name: meta.name, currency: meta.currency, exchange: q.exchange, type: meta.type,
      price: q.price, change: q.change, changePct: q.changePct,
      sector: isFund ? null : meta.sector, industry: isFund ? null : "Demo industry", website: null,
      summary: `This is demo data for ${sym}. Deploy the app to see the real company description, ratios and analyst ratings from Yahoo Finance.`,
      stats: isFund ? {
        marketCap: null, netAssets: 2e10 + r() * 5e10, trailingPE: 22 + r() * 6, dividendYield: .01 + r() * .02, beta: 1, high52: q.price * 1.08, low52: q.price * .8, ytdReturn: .08 + r() * .1, threeYearReturn: .12, avgVolume: 1e6,
      } : {
        marketCap: q.price * (1e9 + r() * 3e9), trailingPE: 12 + r() * 30, forwardPE: 10 + r() * 25, peg: .8 + r() * 2, priceToBook: 1 + r() * 10, priceToSales: 1 + r() * 9, evToEbitda: 6 + r() * 20,
        eps: q.price / (15 + r() * 20), forwardEps: q.price / (13 + r() * 18), dividendYield: r() * .045, payoutRatio: r() * .7, beta: .6 + r() * 1, high52: q.price * (1.05 + r() * .2), low52: q.price * (.6 + r() * .2),
        profitMargin: .05 + r() * .3, operatingMargin: .08 + r() * .3, grossMargin: .3 + r() * .4, roe: .08 + r() * .3, roa: .03 + r() * .12, debtToEquity: 20 + r() * 150, currentRatio: .8 + r() * 1.5, quickRatio: .6 + r() * 1.2,
        revenueGrowth: -.05 + r() * .25, earningsGrowth: -.1 + r() * .4, avgVolume: 5e6 + r() * 3e7, shortRatio: 1 + r() * 3, freeCashflow: 1e9 + r() * 1e10, totalRevenue: 1e10 + r() * 1e11,
      },
      analyst: isFund ? { trend: [], changes: [] } : {
        recommendation: "buy", recommendationMean: 1.7 + r() * 1.2, analysts: 18 + Math.floor(r() * 25),
        targetMean: q.price * (1.04 + r() * .15), targetMedian: q.price * 1.08, targetHigh: q.price * (1.25 + r() * .2), targetLow: q.price * (.75 + r() * .15),
        trend,
        changes: Array.from({ length: 6 }, (_, i) => ({ date: now - (4 + i * 11) * D, firm: firms[i % 5], from: grades[(i + 2) % 5], to: grades[i % 5], action: i % 3 === 0 ? "up" : i % 3 === 1 ? "main" : "down" })),
      },
      earnings: isFund ? { next: [], history: [] } : {
        next: [now + weeks * 7 * D], epsEstimate: +(q.price / 70).toFixed(2), epsLow: +(q.price / 80).toFixed(2), epsHigh: +(q.price / 62).toFixed(2), revenueEstimate: 1e10 + r() * 5e10,
        history: ["3Q2025", "4Q2025", "1Q2026", "2Q2026"].map((quarter) => { const est = +(q.price / (70 + r() * 10)).toFixed(2); return { quarter, estimate: est, actual: +(est * (.93 + r() * .16)).toFixed(2) }; }),
      },
      fund: isFund ? {
        sectorWeights: WEIGHTS[meta.sector] || WEIGHTS.spx, family: "Demo Funds", category: "Demo category", expenseRatio: .0009,
        holdings: [["AAPL", "Apple Inc", .07], ["MSFT", "Microsoft Corp", .065], ["NVDA", "NVIDIA Corp", .06], ["AMZN", "Amazon.com Inc", .04], ["GOOGL", "Alphabet Inc", .035]].map(([symbol, name, weight]) => ({ symbol, name, weight })),
      } : null,
      asOf: Date.now(), demo: true,
    };
  }

  function valuation(sym) {
    const q = quote(sym), m = info(sym), r = rng(hash(sym + "val"));
    const isCA = sym.endsWith(".TO"), price = q.price, shares = (1e9 + r() * 3e9);
    const mcap = price * shares, now = Date.now(), Y = 365.25 * 86400000;
    const bank = /Financial/i.test(m.sector || "");
    const rev0 = mcap / (2 + r() * 6), g = 0.04 + r() * 0.14, fm = 0.08 + r() * 0.18;
    const annual = Array.from({ length: 5 }, (_, i) => {
      const rev = rev0 / Math.pow(1 + g, 4 - i) * (0.97 + r() * 0.06), ta = rev * (1.2 + r() * 0.4);
      const ebit = rev * (fm + 0.06), ni = ebit * 0.78, eq = ta * 0.45;
      return { date: now - (4 - i) * Y - 60 * 86400000, year: new Date(now - (4 - i) * Y).getFullYear() - 1, revenue: rev, grossProfit: rev * 0.5, ebitda: ebit * 1.25, ebit, opInc: ebit,
        netIncome: ni, pretax: ebit * 0.98, tax: ebit * 0.2, interest: rev * 0.006, cfo: rev * (fm + 0.08), capex: -rev * 0.06, fcf: rev * (fm + 0.02), sbc: rev * 0.01,
        dividendsPaid: -ni * 0.3, totalAssets: ta, currentAssets: ta * 0.35, currentLiab: ta * 0.22, retained: eq * 0.7, totalLiab: ta - eq, totalDebt: ta * 0.18,
        longTermDebt: ta * 0.15 * (1 - i * 0.02), cash: ta * 0.1, equity: eq, tangibleBook: eq * 0.8, minority: 0, preferred: 0, investedCapital: eq + ta * 0.18, shares: shares * (1.02 - i * 0.004), dilutedShares: shares * 1.01 };
    });
    const last = annual.at(-1);
    const sectors = ["Technology", "Healthcare", "Industrials", "Consumer Cyclical", "Communication Services"];
    const peers = Array.from({ length: 7 }, (_, i) => { const pr = rng(hash(sym + "peer" + i)); return {
      symbol: ["PEERA", "PEERB", "PEERC", "PEERD", "PEERE", "PEERF", "PEERG"][i], name: `Demo peer ${i + 1}`, currency: m.currency,
      sector: i < 6 ? m.sector : sectors[i % 5], industry: i < 4 ? "Demo industry" : "Other industry", marketCap: mcap * (0.3 + pr() * 3),
      forwardPE: 14 + pr() * 22, trailingPE: 16 + pr() * 25, evEbitda: 9 + pr() * 14, evRevenue: 2 + pr() * 5, ps: 2 + pr() * 6, pb: 2 + pr() * 8, roe: 0.1 + pr() * 0.2, profitMargin: 0.08 + pr() * 0.2, revenueGrowth: 0.02 + pr() * 0.15,
      sameIndustry: i < 4, sameSector: i < 6, sizeOk: i !== 2 }; });
    const eps = last.netIncome / shares;
    return {
      symbol: sym, name: m.name, quoteType: "EQUITY", priceCurrency: m.currency, financialCurrency: m.currency, fx: 1, region: isCA ? "CA" : "US",
      price, marketCap: mcap, sharesOutstanding: shares, impliedShares: shares, sector: m.sector || "Technology", industry: bank ? "Banks - Diversified" : "Demo industry",
      beta: 0.7 + r() * 0.8, riskFree: 0.042,
      ttm: { revenue: last.revenue * (1 + g / 2), ebitda: last.ebitda, fcf: last.fcf, cfo: last.cfo, grossMargin: 0.5, opMargin: fm + 0.06, profitMargin: (fm + 0.06) * 0.78, roe: 0.18, roa: 0.08, totalDebt: last.totalDebt, totalCash: last.cash, currentRatio: 1.6, debtToEquity: 40, revenueGrowth: g, earningsGrowth: g * 1.2 },
      multiples: { trailingPE: price / eps, forwardPE: price / (eps * (1 + g)), peg: 1.5, evEbitda: (mcap + last.totalDebt - last.cash) / last.ebitda, evRevenue: (mcap + last.totalDebt - last.cash) / last.revenue, ps: mcap / last.revenue, pb: mcap / last.equity, enterpriseValue: mcap + last.totalDebt - last.cash, bookValuePS: last.equity / shares, forwardEps: eps * (1 + g), trailingEps: eps },
      dividend: { rate: eps * 0.3, yield: eps * 0.3 / price, payout: 0.3 },
      sentiment: { shortPctFloat: 0.01 + r() * 0.06, shortRatio: 1 + r() * 3, sharesShort: 2e7, sharesShortPrior: 2e7 * (0.85 + r() * 0.3), insiders: 0.01 + r() * 0.05, institutions: 0.55 + r() * 0.3, high52: price * (1.05 + r() * 0.2), low52: price * (0.65 + r() * 0.15), ma50: price * (0.96 + r() * 0.06), ma200: price * (0.88 + r() * 0.12), recTrend: { strongBuy: 8, buy: 14, hold: 9, sell: 1, strongSell: 0 } },
      consensus: { epsCY: eps * (1 + g / 2), epsNY: eps * (1 + g) ** 1.5, epsGrowthCY: g, epsGrowthNY: g * 1.1, revCY: last.revenue * (1 + g), revNY: last.revenue * (1 + g) ** 2, revGrowthCY: g, revGrowthNY: g * 0.95, ltg: g, epsRev90CY: -3 + r() * 9, epsRev90NY: -4 + r() * 12, analysts: 30, recMean: 2.1, targetMean: price * 1.1, targetHigh: price * 1.35, targetLow: price * 0.8 },
      catalysts: { earnings: [now + (6 + Math.floor(r() * 40)) * 86400000], exDividend: now + 20 * 86400000, dividendDate: now + 35 * 86400000,
        changes: [{ date: now - 9 * 86400000, firm: "Demo Securities", from: "Hold", to: "Buy", action: "up", target: +(price * 1.15).toFixed(0) }, { date: now - 40 * 86400000, firm: "Example Capital", from: "Buy", to: "Buy", action: "main", target: +(price * 1.1).toFixed(0) }, { date: now - 70 * 86400000, firm: "Sample & Co.", from: "Buy", to: "Hold", action: "down", target: +(price * 0.95).toFixed(0) }] },
      annual, annualError: null, peers, asOf: now, demo: true,
    };
  }

  function chains(theme) {
    const T = [["ai", "AI infrastructure"], ["grid", "Electrification & power"], ["obesity", "GLP-1 & obesity drugs"], ["aero", "Aerospace & defence"], ["housing", "Housing & construction"], ["energy", "Oil, gas & LNG"], ["sectors", "All 11 sectors"]];
    const L = { ai: [["Cloud & AI spenders", "MSFT AMZN GOOGL META ORCL"], ["AI chips", "NVDA AMD AVGO MRVL"], ["Memory & storage", "MU WDC STX SNDK"], ["Foundry & equipment", "TSM ASML AMAT LRCX KLAC"], ["Networking & optics", "ANET CIEN COHR LITE"], ["Power & grid", "VST CEG GEV ETN PWR"], ["Cooling & data centres", "VRT EQIX DLR MOD"]],
      grid: [["Utilities", "NEE DUK SO AEP FTS.TO"], ["Power generators", "CEG VST NRG TLN"], ["Grid equipment", "GEV ETN HUBB POWL"], ["Grid contractors", "PWR MTZ MYRG PRIM"], ["Copper", "FCX SCCO TECK HBM"], ["Uranium & fuel", "CCJ NXE UEC LEU"]],
      obesity: [["Drug makers", "LLY NVO AMGN VKTX"], ["Injection devices & packaging", "WST BDX STVN TFX"], ["Bioprocessing & tools", "TMO DHR A RGEN"], ["Distribution & pharmacy", "MCK COR CAH CVS"]],
      aero: [["Primes & plane makers", "LMT RTX NOC GD BA"], ["Engines & parts", "GE HWM TDG HEI"], ["Defence electronics", "LHX TDY CW MRCY"], ["Space & drones", "RKLB KTOS AVAV MDA.TO"], ["Training & services", "CAE.TO BAH LDOS SAIC"]],
      housing: [["Homebuilders", "DHI LEN PHM NVR"], ["Building products", "BLDR MAS OC TREX"], ["Lumber & aggregates", "WFG.TO WY VMC MLM"], ["HVAC & appliances", "CARR TT LII WHR"], ["Home improvement retail", "HD LOW FND WSM"]],
      energy: [["Producers", "XOM CVX COP CNQ.TO"], ["Oilfield services", "SLB HAL BKR WFRD"], ["Pipelines", "ENB.TO TRP.TO WMB KMI"], ["Natural gas & LNG", "LNG EQT AR CTRA"], ["Refiners", "MPC VLO PSX PBF"]],
      sectors: [["Technology", "AAPL MSFT NVDA AVGO ORCL"], ["Communication", "GOOGL META NFLX TMUS DIS"], ["Consumer discretionary", "AMZN TSLA HD MCD BKNG"], ["Consumer staples", "WMT COST PG KO PEP"], ["Healthcare", "LLY UNH JNJ ABBV MRK"], ["Financials", "JPM V MA BAC RY.TO"], ["Industrials", "GE CAT RTX UNP CP.TO"], ["Energy", "XOM CVX COP CNQ.TO ENB.TO"], ["Utilities", "NEE SO DUK CEG FTS.TO"], ["Real estate", "PLD AMT WELL EQIX SPG"], ["Materials", "LIN SHW FCX NEM NTR.TO"]] };
    const key = L[theme] ? theme : theme === "gics25" || /^g-(fin|re)$/.test(theme) ? "sectors" : "ai", sectors = key === "sectors";
    const r = rng(hash("chain" + key + new Date().toDateString())), R = (a, b) => +(a + r() * (b - a)).toFixed(1);
    const links = L[key].map(([name, syms], i) => { const ss = syms.split(" "); return { key: "l" + i, name, role: i === 0 && !sectors ? "Demand" : "Supplier", demand: i === 0 && !sectors, n: ss.length, of: ss.length, reliable: true, rev90: R(-6, 14), growthNext: R(-5, 35), chg1y: R(-20, 80), pressure: Math.round(R(10, 95)), stocks: ss.map((s) => ({ symbol: s, name: info(s).name, rev90: R(-8, 18) })) }; });
    const cand = links.filter((l) => !l.demand).sort((a, b) => b.rev90 - a.rev90);
    return { theme: { key, name: T.find((t) => t[0] === key)[1], about: "Demo data. Deploy the app to see live analyst estimate revisions for this supply chain.", sectors },
      themes: T.map(([k, n]) => ({ key: k, name: n })), links, signal: cand[0].key,
      insight: `${cand[0].name} shows the strongest estimate-revision lead in this demo data (median ${cand[0].rev90}% in 90 days).`, coverage: 100, listDate: "2026-11-08", asOf: Date.now() };
  }

  function meta(sym) {
    const s = stock(sym); const m = info(sym);
    return { symbol: sym, name: m.name, type: m.type, currency: m.currency, sector: s.sector, sectorWeights: s.fund?.sectorWeights || null, earnings: { dates: s.earnings.next || [], epsEstimate: s.earnings.epsEstimate, revenueEstimate: s.earnings.revenueEstimate }, exDividendDate: null };
  }

  const MARKET = [["^GSPC", "S&P 500", "index"], ["^IXIC", "Nasdaq", "index"], ["^DJI", "Dow Jones", "index"], ["^GSPTSE", "S&P/TSX", "index"], ["^RUT", "Russell 2000", "index"],
    ["^VIX", "VIX (fear gauge)", "macro"], ["^TNX", "US 10-yr yield", "macro"], ["CL=F", "Crude oil", "macro"], ["GC=F", "Gold", "macro"], ["DX-Y.NYB", "US dollar index", "macro"], ["USDCAD=X", "USD/CAD", "macro"], ["BTC-USD", "Bitcoin", "macro"],
    ["XLK", "Technology", "sector"], ["XLF", "Financial Services", "sector"], ["XLE", "Energy", "sector"], ["XLV", "Healthcare", "sector"], ["XLY", "Consumer Cyclical", "sector"], ["XLP", "Consumer Defensive", "sector"],
    ["XLI", "Industrials", "sector"], ["XLB", "Basic Materials", "sector"], ["XLU", "Utilities", "sector"], ["XLRE", "Real Estate", "sector"], ["XLC", "Communication Services", "sector"]];

  function handle(path, params) {
    const syms = (params.symbols || params.symbol || "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    switch (path) {
      case "quotes": return { quotes: Object.fromEntries(syms.map((s) => [s, quote(s)])), asOf: Date.now() };
      case "charts": return { range: params.range, charts: Object.fromEntries(syms.map((s) => [s, chart(s, params.range || "1y")])), errors: {}, asOf: Date.now() };
      case "stock": return params.part === "valuation" ? valuation(syms[0]) : stock(syms[0]);
      case "meta": return { meta: Object.fromEntries(syms.map((s) => [s, meta(s)])), errors: {}, asOf: Date.now() };
      case "news": return { news: news(syms), asOf: Date.now() };
      case "search": { const q = (params.q || "").toUpperCase(); return { results: Object.keys(CATALOG).filter((k) => k.includes(q) || (CATALOG[k][2] || "").toUpperCase().includes(q)).slice(0, 8).map((k) => ({ symbol: k, name: CATALOG[k][2] || k, exchange: k.endsWith(".TO") ? "Toronto" : "NASDAQ", type: CATALOG[k][3] || "ETF" })) }; }
      case "calendar": return { events: calendar(), source: "Demo", asOf: Date.now() };
      case "market": return { series: MARKET.map(([symbol, name, group]) => ({ symbol, name, group, points: chart(symbol, "3mo").points })), asOf: Date.now() };
      case "ideas": {
        if (params.section === "chains") return chains(params.theme);
        if (params.section === "divs") return handle("divstocks", {});
        if (params.section === "etfs") return handle("funds", {});
        if (params.section === "returns") {
          const syms = ["NVDA", "AVGO", "MU", "PLTR", "MSFT", "AAPL", "META", "LLY", "JPM", "COST", "VST", "GEV", "SHOP.TO", "CLS.TO", "CSU.TO", "AEM.TO", "RY.TO", "CNQ.TO", "WPM.TO", "BN.TO"];
          return { stocks: syms.map((sym) => { const r = rng(hash(sym + "ret")), R = (a, b) => +(a + r() * (b - a)).toFixed(1); return { symbol: sym, name: info(sym).name, region: sym.endsWith(".TO") ? "CA" : "US", ytd: R(-15, 90), total1y: R(-20, 150), total3y: R(-5, 70), total5y: R(0, 55), yield: r() > 0.4 ? R(0.3, 4) : null }; }).sort((a, b) => b.total1y - a.total1y), asOf: Date.now() };
        }
        const r = rng(hash("ideas" + new Date().toDateString())), R = (a, b) => +(a + r() * (b - a)).toFixed(1);
        const chain = [["cloud", "Cloud & AI spenders", "Demand: the companies buying AI capacity", ["MSFT", "AMZN", "GOOGL", "META"]], ["compute", "AI chips", "GPUs and custom accelerators", ["NVDA", "AMD", "AVGO"]], ["memory", "Memory & storage", "HBM, DRAM and flash that feed the chips", ["MU", "WDC", "STX"]], ["foundry", "Foundry & equipment", "Making and packaging the chips", ["TSM", "ASML", "AMAT"]], ["network", "Networking & optics", "Moving data between chips and racks", ["ANET", "COHR", "CLS.TO"]], ["power", "Power & grid", "Electricity for data centres", ["VST", "CEG", "GEV", "CCO.TO"]], ["cooling", "Cooling & data centres", "Buildings, cooling and racks", ["VRT", "EQIX"]]];
        const others = [["LLY", "Healthcare"], ["JPM", "Financials"], ["COST", "Consumer"], ["PLTR", "Technology"], ["SHOP.TO", "Canada"], ["CSU.TO", "Canada"], ["RY.TO", "Canada"], ["CNQ.TO", "Canada"]];
        const stocks = [...chain.flatMap(([key, , , syms]) => syms.map((sym) => [sym, "AI build-out", key])), ...others.map(([sym, g]) => [sym, g, null])].map(([sym, group, link]) => {
          const boost = link === "memory" ? 30 : link === "power" ? 12 : 0;
          const st = { symbol: sym, name: info(sym).name, group, link, rev90: R(-6, 18) + boost, growthNext: R(-5, 45) + boost, upside: R(-8, 30), recMean: R(1.4, 3), chg1y: R(-20, 80) + boost, vs200: R(-10, 35), forwardPE: R(12, 60) };
          st.rating = st.recMean <= 1.5 ? "Strong buy" : st.recMean <= 2.5 ? "Buy" : "Hold"; st.analysts = 20 + Math.floor(r() * 20);
          st.score = Math.round(Math.min(99, Math.max(5, 30 + st.rev90 + st.growthNext * 0.4 + st.upside * 0.4 - st.recMean * 4)));
          st.why = [st.rev90 > 3 && `Analysts raised next year's profit estimate ${st.rev90.toFixed(0)}% in 90 days`, st.growthNext > 10 && `Profit expected to grow ${st.growthNext.toFixed(0)}% next year`, st.chg1y > 15 && `Up ${st.chg1y.toFixed(0)}% in a year`, st.upside > 8 && `Analysts' average target is ${st.upside.toFixed(0)}% above today's price`].filter(Boolean).slice(0, 3);
          st.risks = [st.vs200 > 30 && `Stretched: ${st.vs200.toFixed(0)}% above its 200-day average`, st.forwardPE > 45 && `Expensive: ${st.forwardPE.toFixed(0)}× next year's earnings`].filter(Boolean);
          return st;
        }).sort((a, b) => b.score - a.score);
        const med = (xs) => { const v = xs.slice().sort((a, b) => a - b); return v[v.length >> 1]; };
        const links = chain.map(([key, name, role]) => { const ss = stocks.filter((s) => s.link === key); return { key, name, role, rev90: med(ss.map((s) => s.rev90)), growthNext: med(ss.map((s) => s.growthNext)), chg1y: med(ss.map((s) => s.chg1y)), stocks: ss.map((s) => ({ symbol: s.symbol, name: s.name, score: s.score })) }; });
        links.forEach((l) => (l.pressure = Math.round(Math.min(100, Math.max(5, 40 + l.rev90 * 1.5)))));
        const flows = [["SMH", "Semiconductors"], ["XLK", "Technology"], ["XLU", "Utilities"], ["URA", "Uranium"], ["COPX", "Copper miners"], ["GLD", "Gold"], ["XLF", "Financials"], ["XLV", "Healthcare"], ["XLE", "Energy"], ["XLP", "Consumer staples"], ["XLRE", "Real estate"], ["TLT", "Long-term bonds"]].map(([symbol, name], i) => ({ symbol, name, rel1m: R(-6, 8) - i * 0.6, rel3m: R(-10, 14) - i, pressure: R(-30, 40) - i * 3, volSurge: R(-20, 40), flowScore: Math.max(3, 95 - i * 8) }));
        return { stocks, links, flows, insight: "Demo: Memory & storage is under the most pressure right now: analysts have raised next year's profit estimates for this group faster than for the AI spenders themselves, a sign that demand is outrunning what this link can supply.", rotation: "Demo: money is moving into semiconductors, technology and utilities and out of long-term bonds, real estate and consumer staples.", asOf: Date.now() };
      }
      case "divstocks": {
        const list = [["JNJ", "US"], ["PG", "US"], ["KO", "US"], ["ABBV", "US"], ["XOM", "US"], ["O", "US"], ["VZ", "US"], ["MCD", "US"], ["TXN", "US"], ["AVGO", "US"], ["RY.TO", "CA"], ["TD.TO", "CA"], ["BNS.TO", "CA"], ["ENB.TO", "CA"], ["FTS.TO", "CA"], ["BCE.TO", "CA"], ["CNQ.TO", "CA"], ["SU.TO", "CA"], ["MFC.TO", "CA"], ["CU.TO", "CA"]];
        const stocks = list.map(([sym, region]) => { const r = rng(hash(sym + "div")), R = (a, b) => +(a + r() * (b - a)).toFixed(1); const yld = R(1.2, 7.2), dg = R(-2, 12), payout = R(30, 110); return { symbol: sym, name: info(sym).name, region, yield: yld, total1y: R(-12, 35), price1y: R(-15, 30), total5y: R(-2, 18), divGrowth5y: dg, payout, incomeScore: +(yld + Math.min(dg, 15) * 0.5 + (payout > 90 ? -2 : 0)).toFixed(1) }; });
        return { stocks, asOf: Date.now() };
      }
      case "funds": {
        const y0 = new Date().getFullYear();
        const mk = (sym, region, name, yr) => { const r = rng(hash(sym + "fund")), R = (a, b) => +(a + r() * (b - a)).toFixed(1); return { symbol: sym, region, name, yield: R(...yr), expense: +(0.03 + r() * 0.5).toFixed(2), total1y: R(-5, 30), total5y: R(4, 18), divGrowth5y: R(0, 10), ytd: R(-5, 25), years: [5, 4, 3, 2, 1].map((k) => ({ year: y0 - k, ret: R(-25, 45), beat: r() > 0.45 })) }; };
        const dividend = [["SCHD", "US", "Schwab US Dividend Equity"], ["VYM", "US", "Vanguard High Dividend Yield"], ["DGRO", "US", "iShares Core Dividend Growth"], ["JEPI", "US", "JPMorgan Equity Premium Income"], ["VDY.TO", "CA", "Vanguard FTSE Canadian High Dividend"], ["XEI.TO", "CA", "iShares S&P/TSX Composite High Dividend"], ["ZDV.TO", "CA", "BMO Canadian Dividend"]].map(([s, r, n]) => mk(s, r, n, [2, 7])).sort((a, b) => b.total5y - a.total5y);
        const growth = [["QQQ", "US", "Invesco QQQ"], ["VGT", "US", "Vanguard Information Technology"], ["SMH", "US", "VanEck Semiconductor"], ["SCHG", "US", "Schwab US Large-Cap Growth"], ["SPY", "US", "SPDR S&P 500"], ["XQQ.TO", "CA", "iShares NASDAQ 100 (CAD-hedged)"], ["VFV.TO", "CA", "Vanguard S&P 500 Index"], ["XEQT.TO", "CA", "iShares Core Equity Portfolio"]].map(([s, r, n]) => mk(s, r, n, [0.2, 1.5])).map((f) => { const ys = f.years.map((y) => y.ret); return { ...f, avgYear: +(ys.reduce((a, b) => a + b, 0) / ys.length).toFixed(1), worstYear: Math.min(...ys), beats: f.years.filter((y) => y.beat).length, yearsCounted: ys.length }; }).sort((a, b) => b.avgYear + b.beats * 2.5 - (a.avgYear + a.beats * 2.5));
        const returns = [...dividend.map((f) => ({ ...f, kind: "Dividend" })), ...growth.map((f) => ({ ...f, kind: "Growth" })), ...["XLE", "GLD", "URA", "ITA", "ZEB.TO"].map((sym) => { const f = mk(sym, sym.endsWith(".TO") ? "CA" : "US", sym + " (demo)", [0.5, 3]); return { ...f, kind: "Sector & theme", total3y: f.total5y + 2 }; })].map((f) => ({ ...f, total3y: f.total3y ?? f.total5y })).sort((a, b) => b.total1y - a.total1y);
        return { dividend, growth, returns, benchmark: { symbol: "SPY", years: [5, 4, 3, 2, 1].map((k) => ({ year: y0 - k, ret: 12 })) }, asOf: Date.now() };
      }
      case "analysts": {
        const sym = syms[0], q = quote(sym), r = rng(hash(sym + "ta")), D = 864e5, now = Date.now();
        const names = ["Demo Securities", "Example Capital", "Sample & Co.", "Placeholder Partners", "Illustrative Bank", "Model Research", "Specimen Advisors", "Mock Markets", "Prototype Group", "Fictional Equity"];
        const pick = [["Buy", "buy"], ["Outperform", "buy"], ["Overweight", "buy"], ["Hold", "hold"], ["Neutral", "hold"], ["Underperform", "sell"]];
        const firms = names.map((firm, i) => {
          const scored = 2 + Math.floor(r() * 12), wins = Math.round(scored * (0.35 + r() * 0.6)), g = pick[Math.floor(r() * (i < 6 ? 4 : 6))];
          const target = +(q.price * (0.85 + r() * 0.45)).toFixed(2), prior = +(target * (0.9 + r() * 0.15)).toFixed(2);
          const successRate = (wins / scored) * 100, avgReturn = -8 + r() * 30, score = ((wins + 2) / (scored + 4)) * 70 + Math.min(1, Math.max(0, avgReturn / 40 + 0.5)) * 30;
          return { firm, calls: scored + 2, scored, wins, successRate, avgReturn, score, stars: Math.max(0.5, Math.min(5, Math.round(((score - 30) / 50) * 10) / 2)), active: true,
            latest: { date: now - Math.floor(r() * 200) * D, rating: g[0], from: g[0], action: r() > 0.7 ? "up" : "main", stance: g[1] },
            target: { value: target, prior, date: now - 20 * D, upside: (target / q.price - 1) * 100 } };
        }).sort((a, b) => b.score - a.score);
        const top = firms.slice(0, 6), count = { buy: 0, hold: 0, sell: 0 }; top.forEach((f) => count[f.latest.stance]++);
        const avg = top.reduce((a, f) => a + f.target.value, 0) / top.length, all = firms.map((f) => f.target.value);
        return { symbol: sym, price: q.price, currency: q.currency, firms, ratingsSince: now - 7 * 365 * D,
          summary: { topFirms: top.map((f) => f.firm), consensus: count.buy >= count.hold + count.sell ? "Moderate buy" : "Hold", count, topTarget: avg, topUpside: (avg / q.price - 1) * 100, high: Math.max(...all), low: Math.min(...all), activeFirms: firms.length },
          street: { mean: q.price * 1.08, high: Math.max(...all), low: Math.min(...all), analysts: 24 }, asOf: now };
      }
      case "feargreed": {
        const r = (v) => (v < 25 ? "Extreme fear" : v < 45 ? "Fear" : v < 55 ? "Neutral" : v < 75 ? "Greed" : "Extreme greed");
        const parts = [["Market momentum", 31, "S&P 500 is 1.2% above its 125-day average"], ["Stock price strength", 18, "S&P 500 is 22% of the way from its 52-week low to its high"], ["Stock price breadth", 27, "The average stock has lagged the index by 1.4 pts over 20 days"], ["Market volatility", 12, "VIX is 21% above its 50-day average"], ["Safe haven demand", 24, "Stocks have lagged long-term Treasuries by 2.3 pts over 20 days"], ["Junk bond demand", 15, "Junk bonds have lagged safer bonds by 0.8 pts over 20 days"]];
        const history = Array.from({ length: 250 }, (_, i) => [Date.now() - (250 - i) * 1.46 * 864e5, Math.round(50 + 30 * Math.sin(i / 23) - i / 12)]);
        return { source: "model", score: 21, rating: r(21), previousClose: 24, week: 33, month: 48, year: 71, updated: Date.now(), components: parts.map(([name, score, detail]) => ({ key: name, name, score, rating: r(score), detail })), history, note: "Demo data.", asOf: Date.now() };
      }
      default: throw new Error("Unknown demo path " + path);
    }
  }

  window.Demo = { handle };
})();
