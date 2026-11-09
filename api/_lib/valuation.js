// Used by GET /api/stock?symbol=X&part=valuation
// Gathers the raw inputs for the Research page's valuation and hedge-fund-style research card:
// six years of annual financial statements, live market data, consensus estimates, peer multiples,
// sentiment/positioning data and catalysts. The valuation maths itself runs in the browser
// (js/valuation.js) so readers can change the assumptions and see the result update.
import { yf, num, time, NO_VALIDATE } from "./util.js";
import { pool } from "./screen.js";

const YEAR = 365.25 * 86400000;
const FIELDS = {
  revenue: ["totalRevenue", "operatingRevenue"], grossProfit: ["grossProfit"], ebitda: ["EBITDA", "normalizedEBITDA"],
  ebit: ["EBIT"], opInc: ["operatingIncome"], netIncome: ["netIncomeCommonStockholders", "netIncome"],
  pretax: ["pretaxIncome"], tax: ["taxProvision"], taxRate: ["taxRateForCalcs"], interest: ["interestExpense", "interestExpenseNonOperating"],
  unusual: ["totalUnusualItems"], cfo: ["operatingCashFlow", "cashFlowFromContinuingOperatingActivities"], capex: ["capitalExpenditure"],
  fcf: ["freeCashFlow"], sbc: ["stockBasedCompensation"], dividendsPaid: ["cashDividendsPaid", "commonStockDividendPaid"],
  buybacks: ["repurchaseOfCapitalStock"], totalAssets: ["totalAssets"], currentAssets: ["currentAssets"],
  currentLiab: ["currentLiabilities"], workingCapital: ["workingCapital"], retained: ["retainedEarnings"],
  totalLiab: ["totalLiabilitiesNetMinorityInterest"], totalDebt: ["totalDebt"], longTermDebt: ["longTermDebt"],
  leases: ["capitalLeaseObligations", "longTermCapitalLeaseObligation"], cash: ["cashCashEquivalentsAndShortTermInvestments", "cashAndCashEquivalents"],
  equity: ["commonStockEquity", "stockholdersEquity"], tangibleBook: ["tangibleBookValue"], minority: ["minorityInterest"],
  preferred: ["preferredStock"], investedCapital: ["investedCapital"], shares: ["ordinarySharesNumber", "shareIssued"],
  dilutedShares: ["dilutedAverageShares"], dilutedEPS: ["dilutedEPS"],
};

function pick(row, keys) { for (const k of keys) { const v = num(row[k]); if (v != null) return v; } return null; }

async function financials(symbol) {
  const rows = await yf().fundamentalsTimeSeries(symbol, { period1: new Date(Date.now() - 6.5 * YEAR), type: "annual", module: "all" }, NO_VALIDATE);
  return (rows || [])
    .map((r) => {
      const t = time(r.date) ?? (typeof r.date === "number" ? r.date * 1000 : null);
      const o = { date: t, year: t ? new Date(t).getUTCFullYear() : null };
      for (const [k, keys] of Object.entries(FIELDS)) o[k] = pick(r, keys);
      return o;
    })
    .filter((r) => r.date && (r.revenue != null || r.totalAssets != null))
    .sort((a, b) => a.date - b.date)
    .slice(-6);
}

async function fx(from, to) {
  if (!from || !to || from === to) return 1;
  // Yahoo quotes some prices in pence/cents units (e.g. GBp); treat those as their base currency.
  try {
    const q = await yf().quote(`${from}${to}=X`, {}, NO_VALIDATE);
    const r = num(q?.regularMarketPrice);
    return r && r > 0 ? r : null;
  } catch { return null; }
}

const PEER_MODULES = ["price", "summaryDetail", "defaultKeyStatistics", "financialData", "assetProfile"];
async function peerData(symbol) {
  const s = await yf().quoteSummary(symbol, { modules: PEER_MODULES }, NO_VALIDATE);
  const p = s.price || {}, d = s.summaryDetail || {}, k = s.defaultKeyStatistics || {}, f = s.financialData || {}, a = s.assetProfile || {};
  return {
    symbol, name: p.shortName || p.longName || symbol, currency: p.currency || null,
    sector: a.sector || null, industry: a.industry || null, marketCap: num(p.marketCap ?? d.marketCap),
    forwardPE: num(k.forwardPE ?? d.forwardPE), trailingPE: num(d.trailingPE),
    evEbitda: num(k.enterpriseToEbitda), evRevenue: num(k.enterpriseToRevenue), ps: num(d.priceToSalesTrailing12Months),
    pb: num(k.priceToBook), roe: num(f.returnOnEquity), profitMargin: num(f.profitMargins), revenueGrowth: num(f.revenueGrowth),
  };
}

export async function valuationData(symbol) {
  const modules = ["price", "summaryDetail", "defaultKeyStatistics", "financialData", "assetProfile", "earningsTrend",
    "calendarEvents", "upgradeDowngradeHistory", "majorHoldersBreakdown", "recommendationTrend"];
  const isCA = /\.(TO|V|NE|CN)$/i.test(symbol);
  const [s, fin, recs, tnx] = await Promise.all([
    yf().quoteSummary(symbol, { modules }, NO_VALIDATE),
    financials(symbol).catch((e) => ({ error: String(e.message || e) })),
    yf().recommendationsBySymbol(symbol, {}, NO_VALIDATE).catch(() => null),
    yf().quote("^TNX", {}, NO_VALIDATE).catch(() => null),
  ]);
  const p = s.price || {}, d = s.summaryDetail || {}, k = s.defaultKeyStatistics || {}, f = s.financialData || {}, a = s.assetProfile || {};
  const priceCur = p.currency || null, finCur = f.financialCurrency || priceCur;
  const fxRate = await fx(finCur, priceCur);
  const price = num(p.regularMarketPrice);
  const marketCap = num(p.marketCap ?? d.marketCap);

  // Consensus estimates
  const trend = s.earningsTrend?.trend || [];
  const tp = (id) => trend.find((t) => t.period === id);
  const rev90 = (t) => { const e = t?.epsTrend; const now = num(e?.current), ago = num(e?.["90daysAgo"]); return now != null && ago ? ((now - ago) / Math.abs(ago)) * 100 : null; };
  const cy = tp("0y"), ny = tp("+1y"), ltg = tp("+5y") || tp("LTG");
  const consensus = {
    epsCY: num(cy?.earningsEstimate?.avg), epsNY: num(ny?.earningsEstimate?.avg),
    epsGrowthCY: num(cy?.growth), epsGrowthNY: num(ny?.growth),
    revCY: num(cy?.revenueEstimate?.avg), revNY: num(ny?.revenueEstimate?.avg),
    revGrowthCY: num(cy?.revenueEstimate?.growth), revGrowthNY: num(ny?.revenueEstimate?.growth),
    ltg: num(ltg?.growth), epsRev90CY: rev90(cy), epsRev90NY: rev90(ny),
    analysts: num(f.numberOfAnalystOpinions), recMean: num(f.recommendationMean),
    targetMean: num(f.targetMeanPrice), targetHigh: num(f.targetHighPrice), targetLow: num(f.targetLowPrice),
  };

  // Peers: Yahoo's "similar" list, kept only when sector matches and size is within 0.2x-5x.
  const subject = { sector: a.sector || null, industry: a.industry || null };
  const peerSyms = (recs?.recommendedSymbols || recs?.[0]?.recommendedSymbols || []).map((r) => r.symbol).filter((x) => x && x !== symbol).slice(0, 10);
  const peersRaw = (await pool(peerSyms, 6, peerData)).filter(Boolean);
  const peers = peersRaw.map((pr) => ({
    ...pr,
    sameIndustry: !!(subject.industry && pr.industry === subject.industry),
    sameSector: !!(subject.sector && pr.sector === subject.sector),
    sizeOk: !!(marketCap && pr.marketCap && pr.marketCap / marketCap >= 0.2 && pr.marketCap / marketCap <= 5),
  }));

  // Catalysts
  const cal = s.calendarEvents || {};
  const earnDates = (cal.earnings?.earningsDate || []).map(time).filter(Boolean);
  const changes = (s.upgradeDowngradeHistory?.history || [])
    .map((h) => ({ date: time(h.epochGradeDate), firm: h.firm, from: h.fromGrade || null, to: h.toGrade || null, action: h.action || null, target: num(h.currentPriceTarget) || null }))
    .filter((h) => h.date && h.date > Date.now() - 120 * 86400000)
    .sort((x, y) => y.date - x.date).slice(0, 12);
  const mh = s.majorHoldersBreakdown || {};
  const rt = s.recommendationTrend?.trend?.[0] || {};

  return {
    symbol, name: p.longName || p.shortName || symbol, quoteType: p.quoteType || null,
    priceCurrency: priceCur, financialCurrency: finCur, fx: fxRate, region: isCA ? "CA" : "US",
    price, marketCap, sharesOutstanding: num(k.sharesOutstanding), impliedShares: price && marketCap ? marketCap / price : null,
    sector: a.sector || null, industry: a.industry || null,
    beta: num(k.beta ?? d.beta), riskFree: tnx?.regularMarketPrice ? num(tnx.regularMarketPrice) / 100 : null,
    ttm: {
      revenue: num(f.totalRevenue), ebitda: num(f.ebitda), fcf: num(f.freeCashflow), cfo: num(f.operatingCashflow),
      grossMargin: num(f.grossMargins), opMargin: num(f.operatingMargins), profitMargin: num(f.profitMargins),
      roe: num(f.returnOnEquity), roa: num(f.returnOnAssets), totalDebt: num(f.totalDebt), totalCash: num(f.totalCash),
      currentRatio: num(f.currentRatio), debtToEquity: num(f.debtToEquity), revenueGrowth: num(f.revenueGrowth), earningsGrowth: num(f.earningsGrowth),
    },
    multiples: {
      trailingPE: num(d.trailingPE), forwardPE: num(k.forwardPE ?? d.forwardPE), peg: num(k.pegRatio ?? k.trailingPegRatio),
      evEbitda: num(k.enterpriseToEbitda), evRevenue: num(k.enterpriseToRevenue), ps: num(d.priceToSalesTrailing12Months),
      pb: num(k.priceToBook), enterpriseValue: num(k.enterpriseValue), bookValuePS: num(k.bookValue),
      forwardEps: num(k.forwardEps), trailingEps: num(k.trailingEps),
    },
    dividend: { rate: num(d.dividendRate ?? d.trailingAnnualDividendRate), yield: num(d.dividendYield ?? d.trailingAnnualDividendYield), payout: num(d.payoutRatio) },
    sentiment: {
      shortPctFloat: num(k.shortPercentOfFloat), shortRatio: num(k.shortRatio), sharesShort: num(k.sharesShort), sharesShortPrior: num(k.sharesShortPriorMonth),
      insiders: num(mh.insidersPercentHeld ?? k.heldPercentInsiders), institutions: num(mh.institutionsPercentHeld ?? k.heldPercentInstitutions),
      high52: num(d.fiftyTwoWeekHigh), low52: num(d.fiftyTwoWeekLow), ma50: num(d.fiftyDayAverage), ma200: num(d.twoHundredDayAverage),
      recTrend: { strongBuy: num(rt.strongBuy), buy: num(rt.buy), hold: num(rt.hold), sell: num(rt.sell), strongSell: num(rt.strongSell) },
    },
    consensus,
    catalysts: { earnings: earnDates, exDividend: time(cal.exDividendDate) || time(d.exDividendDate), dividendDate: time(cal.dividendDate), changes },
    annual: Array.isArray(fin) ? fin : [],
    annualError: Array.isArray(fin) ? null : fin.error,
    peers,
    asOf: Date.now(),
  };
}
