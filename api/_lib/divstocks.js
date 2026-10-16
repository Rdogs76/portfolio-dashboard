// Used by GET /api/ideas?section=divs -> dividend stocks ranked by return including dividends.
import { yf, num, NO_VALIDATE } from "./util.js";
import { pool, monthly, returnsFrom, r1 } from "./screen.js";

const LIST = [
  ["JNJ", "US"], ["PG", "US"], ["KO", "US"], ["PEP", "US"], ["ABBV", "US"], ["MRK", "US"], ["XOM", "US"], ["CVX", "US"],
  ["O", "US"], ["VZ", "US"], ["HD", "US"], ["MCD", "US"], ["TXN", "US"], ["AVGO", "US"], ["JPM", "US"], ["CAT", "US"],
  ["LMT", "US"], ["PM", "US"], ["MO", "US"], ["NEE", "US"], ["ADP", "US"], ["COST", "US"], ["CSCO", "US"], ["MSFT", "US"],
  ["RY.TO", "CA"], ["TD.TO", "CA"], ["BNS.TO", "CA"], ["BMO.TO", "CA"], ["CM.TO", "CA"], ["NA.TO", "CA"], ["ENB.TO", "CA"], ["TRP.TO", "CA"],
  ["FTS.TO", "CA"], ["BCE.TO", "CA"], ["T.TO", "CA"], ["CNQ.TO", "CA"], ["SU.TO", "CA"], ["POW.TO", "CA"], ["MFC.TO", "CA"], ["SLF.TO", "CA"],
  ["CU.TO", "CA"], ["EMA.TO", "CA"], ["CNR.TO", "CA"], ["IFC.TO", "CA"],
];

async function stock(symbol) {
  const [m, s] = await Promise.all([
    monthly(symbol, 6.2),
    yf().quoteSummary(symbol, { modules: ["price", "summaryDetail", "assetProfile"] }, NO_VALIDATE).catch(() => ({})),
  ]);
  const p = s.price || {}, d = s.summaryDetail || {};
  const price = num(p.regularMarketPrice) ?? m.bars.at(-1)?.close;
  const ret = returnsFrom(m);
  const yld = num(d.dividendYield) != null ? num(d.dividendYield) * 100 : ret.divTTM && price ? (ret.divTTM / price) * 100 : null;
  return {
    symbol, name: p.shortName || p.longName || symbol, currency: p.currency || m.currency, price,
    sector: s.assetProfile?.sector || null,
    yield: r1(yld), payout: num(d.payoutRatio) != null ? r1(num(d.payoutRatio) * 100) : null,
    total1y: r1(ret.total1y), price1y: r1(ret.price1y), total3y: r1(ret.total3y), total5y: r1(ret.total5y),
    divGrowth5y: r1(ret.divGrowth5y), ytd: r1(ret.ytd),
  };
}

export async function divStocksData() {
  {
    const data = await pool(LIST.map((x) => x[0]), 10, stock);
    const region = Object.fromEntries(LIST);
    const stocks = data.filter((s) => s && s.yield).map((s) => {
      // "Income score": yield plus dividend growth, with a penalty when the payout looks stretched.
      const stretch = s.payout != null && s.payout > 90 ? -2 : 0;
      return { ...s, region: region[s.symbol], incomeScore: r1((s.yield ?? 0) + Math.min(s.divGrowth5y ?? 0, 15) * 0.5 + stretch) };
    }).sort((a, b) => (b.total1y ?? -99) - (a.total1y ?? -99));
    return { stocks, asOf: Date.now() };
  }
}
