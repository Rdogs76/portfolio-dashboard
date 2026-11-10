// GET /api/meta?symbols=AAPL,VFV.TO
// Sector info (stocks) or sector weights (ETFs), the next earnings date and the last four quarters'
// of reported EPS vs estimates (beat / miss), for many symbols at once.
import { yf, send, symbolsFrom, num, time, NO_VALIDATE, sectorWeightsFrom } from "./_lib/util.js";

const ATTEMPTS = [
  ["price", "assetProfile", "calendarEvents", "topHoldings", "earnings", "earningsHistory"],
  ["price", "assetProfile", "calendarEvents", "earnings", "earningsHistory"],
  ["price", "assetProfile", "calendarEvents"],
  ["price", "topHoldings"],
  ["price"],
];

async function one(symbol) {
  let s, lastErr;
  for (const modules of ATTEMPTS) {
    try { s = await yf().quoteSummary(symbol, { modules }, NO_VALIDATE); break; }
    catch (e) { lastErr = e; }
  }
  if (!s) throw lastErr;
  const p = s.price || {};
  const e = s.calendarEvents?.earnings || {};
  // Past results: actual vs estimated EPS per quarter, with the date it was reported when Yahoo has it.
  let history = (s.earnings?.earningsChart?.quarterly || []).map((q) => ({
    label: q.fiscalQuarter || q.date || null, period: time(q.periodEndDate), reported: time(q.reportedDate),
    actual: num(q.actual), estimate: num(q.estimate),
  })).filter((h) => h.actual != null && h.estimate != null);
  if (!history.length) history = (s.earningsHistory?.history || []).map((h) => ({
    label: null, period: time(h.quarter), reported: null, actual: num(h.epsActual), estimate: num(h.epsEstimate),
  })).filter((h) => h.actual != null && h.estimate != null);
  return {
    symbol,
    name: p.shortName || p.longName || symbol,
    type: p.quoteType || null,
    currency: p.currency || null,
    sector: s.assetProfile?.sector || null,
    industry: s.assetProfile?.industry || null,
    sectorWeights: ["ETF", "MUTUALFUND"].includes((p.quoteType || "").toUpperCase()) ? sectorWeightsFrom(s.topHoldings) : null,
    earnings: {
      dates: (e.earningsDate || []).map(time).filter(Boolean),
      epsEstimate: num(e.earningsAverage),
      revenueEstimate: num(e.revenueAverage),
      history: history.slice(-4),
    },
    exDividendDate: time(s.calendarEvents?.exDividendDate),
  };
}

export default async function handler(req, res) {
  const symbols = symbolsFrom(req.query.symbols, 40);
  if (!symbols.length) return send(res, 400, { error: "Add at least one symbol." }, 0);
  const settled = await Promise.allSettled(symbols.map(one));
  const meta = {};
  const errors = {};
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") meta[symbols[i]] = r.value;
    else errors[symbols[i]] = String(r.reason?.message || r.reason);
  });
  send(res, 200, { meta, errors, asOf: Date.now() }, 3600);
}
