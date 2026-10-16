// Used by GET /api/ideas?section=returns -> stocks ranked purely by total return (price + dividends).
import { num } from "./util.js";
import { pool, quotes, monthly, returnsFrom, r1 } from "./screen.js";

const US = ["NVDA", "AVGO", "AMD", "MU", "TSM", "ASML", "AMAT", "LRCX", "KLAC", "ANET", "MRVL", "MSFT", "AAPL", "GOOGL", "AMZN", "META",
  "NFLX", "ORCL", "PLTR", "CRWD", "NOW", "UBER", "TSLA", "LLY", "ISRG", "JPM", "GS", "V", "MA", "COST", "WMT", "HD", "CAT", "GE",
  "GEV", "VST", "CEG", "ETN", "PWR", "VRT", "AXON", "RCL", "BKNG", "XOM", "NEE", "KO", "JNJ", "BRK-B", "APP", "RKLB"];
const CA = ["SHOP.TO", "CSU.TO", "ATD.TO", "BN.TO", "BAM.TO", "RY.TO", "TD.TO", "BMO.TO", "NA.TO", "CNQ.TO", "SU.TO", "CCO.TO",
  "CLS.TO", "WPM.TO", "AEM.TO", "ABX.TO", "FNV.TO", "K.TO", "CNR.TO", "CP.TO", "WCN.TO", "DOL.TO", "L.TO", "TRI.TO", "IFC.TO",
  "FFH.TO", "MFC.TO", "ENB.TO", "TOU.TO", "TECK-B.TO"];

export async function returnsData() {
  const all = [...US, ...CA];
  const [q, hist] = await Promise.all([quotes(all), pool(all, 12, (s) => monthly(s, 5.3))]);
  const stocks = all.map((sym, i) => {
    const m = hist[i]; if (!m?.bars?.length) return null;
    const ret = returnsFrom(m), qq = q[sym] || {};
    const y = num(qq.trailingAnnualDividendYield);
    return {
      symbol: sym, name: qq.shortName || qq.longName || sym, currency: qq.currency || m.currency,
      region: sym.endsWith(".TO") ? "CA" : "US",
      marketCap: num(qq.marketCap),
      ytd: r1(ret.ytd), total1y: r1(ret.total1y), price1y: r1(ret.price1y), total3y: r1(ret.total3y), total5y: r1(ret.total5y),
      yield: y != null ? r1(y * 100) : null,
    };
  }).filter(Boolean).sort((a, b) => (b.total1y ?? -999) - (a.total1y ?? -999));
  return { stocks, asOf: Date.now() };
}
