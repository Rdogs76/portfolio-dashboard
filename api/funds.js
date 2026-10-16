// GET /api/funds -> two ETF lists: top dividend ETFs, and ETFs with consistently strong yearly gains.
// Returns are total returns (price + reinvested dividends) from Yahoo's adjusted monthly closes.
import { yf, send, fail, num, NO_VALIDATE } from "./_lib/util.js";
import { pool, monthly, returnsFrom, r1 } from "./_lib/screen.js";

const DIVIDEND = [
  ["SCHD", "US"], ["VYM", "US"], ["DGRO", "US"], ["VIG", "US"], ["HDV", "US"], ["NOBL", "US"], ["SDY", "US"], ["DVY", "US"], ["SPYD", "US"], ["JEPI", "US"],
  ["VDY.TO", "CA"], ["XEI.TO", "CA"], ["ZDV.TO", "CA"], ["CDZ.TO", "CA"], ["XDIV.TO", "CA"], ["ZWC.TO", "CA"],
];
const GROWTH = [
  ["QQQ", "US"], ["VGT", "US"], ["XLK", "US"], ["SMH", "US"], ["SOXX", "US"], ["SCHG", "US"], ["MGK", "US"], ["VUG", "US"], ["IWF", "US"], ["SPY", "US"],
  ["XQQ.TO", "CA"], ["VFV.TO", "CA"], ["XEQT.TO", "CA"], ["TEC.TO", "CA"], ["XIT.TO", "CA"],
];

async function fund(symbol) {
  const [m, s] = await Promise.all([
    monthly(symbol, 7.2),
    yf().quoteSummary(symbol, { modules: ["price", "summaryDetail", "fundProfile", "defaultKeyStatistics"] }, NO_VALIDATE).catch(() => ({})),
  ]);
  const p = s.price || {}, d = s.summaryDetail || {};
  const ret = returnsFrom(m);
  const price = num(p.regularMarketPrice) ?? m.bars.at(-1)?.close;
  return {
    symbol, name: p.shortName || p.longName || symbol, currency: p.currency || m.currency,
    price,
    yield: num(d.yield) != null ? num(d.yield) * 100 : ret.divTTM && price ? (ret.divTTM / price) * 100 : null,
    expense: num(s.fundProfile?.feesExpensesInvestment?.annualReportExpenseRatio) != null ? num(s.fundProfile.feesExpensesInvestment.annualReportExpenseRatio) * 100 : null,
    netAssets: num(d.totalAssets),
    ...ret,
  };
}

export default async function handler(req, res) {
  try {
    const all = [...DIVIDEND, ...GROWTH];
    const data = await pool(all.map((x) => x[0]), 10, fund);
    const by = Object.fromEntries(data.filter(Boolean).map((f) => [f.symbol, f]));
    const spy = by.SPY;
    const spyYear = Object.fromEntries((spy?.years || []).map((y) => [y.year, y.ret]));
    const tidy = (f, region) => ({
      ...f, region,
      yield: r1(f.yield), expense: f.expense == null ? null : Math.round(f.expense * 100) / 100,
      total1y: r1(f.total1y), price1y: r1(f.price1y), total3y: r1(f.total3y), total5y: r1(f.total5y), ytd: r1(f.ytd),
      divGrowth5y: r1(f.divGrowth5y),
      years: (f.years || []).slice(-5).map((y) => ({ year: y.year, ret: r1(y.ret), beat: spyYear[y.year] != null ? y.ret > spyYear[y.year] : null })),
    });

    const dividend = DIVIDEND.map(([s, reg]) => by[s] && tidy(by[s], reg)).filter(Boolean)
      .sort((a, b) => ((b.total5y ?? -99) + (b.yield ?? 0) * 0.5) - ((a.total5y ?? -99) + (a.yield ?? 0) * 0.5));

    const growth = GROWTH.map(([s, reg]) => by[s] && tidy(by[s], reg)).filter(Boolean).map((f) => {
      const ys = f.years.map((y) => y.ret).filter((v) => v != null);
      const avg = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : null;
      const sd = ys.length > 1 ? Math.sqrt(ys.reduce((a, b) => a + (b - avg) ** 2, 0) / (ys.length - 1)) : null;
      const beats = f.years.filter((y) => y.beat).length;
      const worst = ys.length ? Math.min(...ys) : null;
      const upYears = ys.filter((v) => v > 0).length;
      // Consistency: strong average, few bad years, and how often it beat the S&P 500.
      const score = avg == null ? null : avg - 0.35 * (sd ?? 0) + 2.5 * beats + 1.5 * upYears;
      return { ...f, avgYear: r1(avg), worstYear: r1(worst), beats, upYears, yearsCounted: ys.length, consistency: r1(score) };
    }).sort((a, b) => (b.consistency ?? -999) - (a.consistency ?? -999));

    send(res, 200, { dividend, growth, benchmark: spy ? { symbol: "SPY", years: spy.years.slice(-5).map((y) => ({ year: y.year, ret: r1(y.ret) })) } : null, asOf: Date.now() }, 12 * 3600);
  } catch (e) { fail(res, e); }
}
