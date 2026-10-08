// GET /api/market -> one month of daily closes for indices, rates, commodities and sector ETFs.
// The dashboard uses this for the market pulse tiles and the "why did the market move" recap.
import { send, chartPoints } from "./_lib/util.js";

export const MARKET = [
  { symbol: "^GSPC", name: "S&P 500", group: "index" },
  { symbol: "^IXIC", name: "Nasdaq", group: "index" },
  { symbol: "^DJI", name: "Dow Jones", group: "index" },
  { symbol: "^GSPTSE", name: "S&P/TSX", group: "index" },
  { symbol: "^RUT", name: "Russell 2000", group: "index" },
  { symbol: "^VIX", name: "VIX (fear gauge)", group: "macro" },
  { symbol: "^TNX", name: "US 10-yr yield", group: "macro" },
  { symbol: "CL=F", name: "Crude oil", group: "macro" },
  { symbol: "GC=F", name: "Gold", group: "macro" },
  { symbol: "DX-Y.NYB", name: "US dollar index", group: "macro" },
  { symbol: "USDCAD=X", name: "USD/CAD", group: "macro" },
  { symbol: "BTC-USD", name: "Bitcoin", group: "macro" },
  { symbol: "XLK", name: "Technology", group: "sector" },
  { symbol: "XLF", name: "Financial Services", group: "sector" },
  { symbol: "XLE", name: "Energy", group: "sector" },
  { symbol: "XLV", name: "Healthcare", group: "sector" },
  { symbol: "XLY", name: "Consumer Cyclical", group: "sector" },
  { symbol: "XLP", name: "Consumer Defensive", group: "sector" },
  { symbol: "XLI", name: "Industrials", group: "sector" },
  { symbol: "XLB", name: "Basic Materials", group: "sector" },
  { symbol: "XLU", name: "Utilities", group: "sector" },
  { symbol: "XLRE", name: "Real Estate", group: "sector" },
  { symbol: "XLC", name: "Communication Services", group: "sector" },
];

export default async function handler(req, res) {
  const settled = await Promise.allSettled(MARKET.map((m) => chartPoints(m.symbol, "3mo")));
  const series = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value.points.length) series.push({ ...MARKET[i], points: r.value.points });
  });
  send(res, 200, { series, asOf: Date.now() }, 300);
}
