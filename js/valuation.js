/* Valuation & research engine for the Research page.
 * Follows the structure buy-side analysts use: thesis -> what the price implies -> valuation
 * (DCF, comps, bank models) -> catalysts -> risk/reward -> sentiment & positioning -> factor profile.
 * All maths runs here in the browser from raw inputs served by /api/stock?part=valuation, so the
 * reader can change assumptions and see the result update. Educational model, not advice.
 */
(function () {
  "use strict";
  const isNum = (v) => typeof v === "number" && Number.isFinite(v);
  const clip = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const mean = (xs) => { const v = xs.filter(isNum); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const median = (xs) => { const v = xs.filter(isNum).sort((a, b) => a - b); if (!v.length) return null; const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
  const ERP = 0.045;

  // ---------- Classification ----------
  function kind(v) {
    const sec = v.sector || "", ind = v.industry || "";
    if (/Financial/i.test(sec) && /Bank|Insurance/i.test(ind)) return "bank";
    if (/Real Estate/i.test(sec) && /REIT/i.test(ind)) return "reit";
    return "general";
  }

  // ---------- Inputs (all converted to the quote currency) ----------
  function prepare(v) {
    const A = (v.annual || []).slice();
    const fxOk = isNum(v.fx) && v.fx > 0;
    const fx = fxOk ? v.fx : 1;
    const currencyIssue = v.financialCurrency && v.priceCurrency && v.financialCurrency !== v.priceCurrency && !fxOk;
    const last = A.at(-1) || {}, prev = A.at(-2) || {};
    let shares = v.impliedShares || v.sharesOutstanding;
    if (isNum(last.dilutedShares) && isNum(last.shares) && last.shares > 0) {
      const r = last.dilutedShares / last.shares; if (r > 1 && r < 1.1) shares *= r;
    }
    const tr = A.map((r) => (isNum(r.tax) && isNum(r.pretax) && r.pretax > 0 ? r.tax / r.pretax : null));
    const taxEff = clip(median(tr) ?? (isNum(last.taxRate) ? last.taxRate : 0.21), 0, 0.3);
    const taxMarg = v.region === "CA" ? 0.265 : 0.25;
    const rows = A.map((r) => {
      const capex = isNum(r.capex) ? -Math.abs(r.capex) : null;
      const fcff = isNum(r.cfo) && isNum(capex) ? r.cfo + capex + (isNum(r.interest) ? Math.abs(r.interest) * (1 - taxEff) : 0) - (isNum(r.sbc) ? Math.abs(r.sbc) : 0) : null;
      return { ...r, capex, fcff, fcffMargin: isNum(fcff) && r.revenue > 0 ? fcff / r.revenue : null,
        opMargin: isNum(r.opInc ?? r.ebit) && r.revenue > 0 ? (r.opInc ?? r.ebit) / r.revenue : null,
        ebitdaMargin: isNum(r.ebitda) && r.revenue > 0 ? r.ebitda / r.revenue : null };
    });
    const revs = rows.filter((r) => r.revenue > 0);
    const hist = revs.length >= 2 ? Math.pow(revs.at(-1).revenue / revs[0].revenue, 1 / Math.max(1, (revs.at(-1).year - revs[0].year) || revs.length - 1)) - 1 : null;
    const debt = (v.ttm?.totalDebt ?? last.totalDebt ?? 0);
    const cash = (v.ttm?.totalCash ?? last.cash ?? 0);
    return { A: rows, last: rows.at(-1) || {}, prev: rows.at(-2) || {}, fx, fxOk, currencyIssue, shares, taxEff, taxMarg, hist,
      debt, cash, minority: last.minority || 0, preferred: last.preferred || 0, revenueTTM: v.ttm?.revenue ?? last.revenue };
  }

  // ---------- Cost of capital ----------
  function costOfCapital(v, P, over = {}) {
    const rf = isNum(over.rf) ? over.rf : (isNum(v.riskFree) ? v.riskFree : 0.042);
    const raw = isNum(v.beta) ? v.beta : 1;
    const beta = clip(0.67 * raw + 0.33, 0.6, 2);
    const ke = rf + beta * ERP;
    const ebit = P.last.ebit ?? P.last.opInc, int = Math.abs(P.last.interest || 0);
    const cover = int > 0 && isNum(ebit) ? ebit / int : null;
    const spread = cover == null ? 0.0175 : cover > 8 ? 0.01 : cover > 4 ? 0.0175 : cover > 2 ? 0.03 : 0.05;
    const kd = rf + spread, kdAt = kd * (1 - P.taxMarg);
    const E = v.marketCap || 0, D = Math.max(0, P.debt * P.fx);
    let wacc = E + D > 0 ? (E / (E + D)) * ke + (D / (E + D)) * kdAt : ke;
    const rawWacc = wacc;
    wacc = clip(wacc, 0.07, 0.13);
    if (isNum(over.wacc)) wacc = over.wacc;
    return { rf, rawBeta: raw, beta, ke, cover, spread, kd, kdAt, wE: E / (E + D || 1), wD: D / (E + D || 1), rawWacc, wacc };
  }

  // ---------- DCF (FCFF, two-stage with linear fade) ----------
  function dcfValue(P, v, { g0, gT, wacc, margin, years }) {
    let rev = P.revenueTTM, pv = 0, fcffN = 0, revN = 0;
    const rows = [];
    for (let t = 1; t <= years; t++) {
      const g = g0 + (gT - g0) * ((t - 1) / Math.max(1, years - 1));
      rev *= 1 + g;
      const fcff = rev * margin, df = Math.pow(1 + wacc, t);
      pv += fcff / df; fcffN = fcff; revN = rev;
      rows.push({ t, g, rev, fcff, pv: fcff / df });
    }
    const tv = (fcffN * (1 + gT)) / (wacc - gT);
    const pvTV = tv / Math.pow(1 + wacc, years);
    const ev = pv + pvTV;
    const equity = ev - P.debt - P.minority - P.preferred + P.cash;
    const perShare = (equity * P.fx) / P.shares;
    const ebitdaM = mean(P.A.slice(-3).map((r) => r.ebitdaMargin));
    const exitMult = ebitdaM ? tv / (revN * ebitdaM * (1 + gT)) : null;
    return { rows, pvStage: pv, tv, pvTV, ev, equity, perShare, tvShare: pvTV / ev, exitMult };
  }

  function dcfSetup(v, P, C, over = {}) {
    const notes = [];
    if (P.currencyIssue) return { ok: false, reason: `Statements are in ${v.financialCurrency} and the exchange rate couldn't be loaded, so per-share values are hidden.` };
    if (!(P.revenueTTM > 0) || !isNum(P.shares)) return { ok: false, reason: "Revenue or share count is missing from the data." };
    const margins = P.A.map((r) => r.fcffMargin).filter(isNum);
    if (margins.length < 2) return { ok: false, reason: "Fewer than two years of cash-flow history are available." };
    const opM = P.A.map((r) => r.opMargin).filter(isNum);
    const peak = opM.length >= 3 && mean(opM) > 0 && opM.at(-1) > 1.5 * mean(opM);
    if (peak) notes.push("Peak-cycle: current operating margin is over 1.5× its multi-year average, so a mid-cycle (all-years) cash margin is used.");
    const marginNorm = peak ? mean(margins) : mean(margins.slice(-3));
    const margin = isNum(over.margin) ? over.margin : marginNorm;
    if (!(margin > 0)) return { ok: false, reason: "Normalized free cash flow (after stock-based pay) is negative, so a DCF isn't meaningful. Not meaningful (N/M)." , marginNorm, peak };
    const c = v.consensus || {};
    const gGuess = [c.revGrowthNY, c.revGrowthCY, v.ttm?.revenueGrowth, P.hist].find(isNum) ?? 0.04;
    const g0 = isNum(over.g0) ? over.g0 : clip(gGuess, -0.05, 0.25);
    let gT = isNum(over.gT) ? over.gT : (v.region === "CA" ? 0.02 : 0.025);
    if (gT >= C.rf) { gT = Math.max(0.005, C.rf - 0.005); notes.push("Terminal growth set just below the risk-free rate."); }
    const years = g0 > 0.15 ? 10 : 5;
    return { ok: true, g0, gT, margin, marginNorm, years, peak, notes };
  }

  function reverseDCF(v, P, S, wacc) {
    const target = v.price;
    const f = (g) => dcfValue(P, v, { g0: g, gT: S.gT, wacc, margin: S.margin, years: 10 }).perShare - target;
    let lo = -0.2, hi = 0.8, flo = f(lo), fhi = f(hi);
    if (!(isNum(flo) && isNum(fhi)) || flo > 0 || fhi < 0) return null;
    for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2, fm = f(mid); if (fm > 0) hi = mid; else lo = mid; }
    return (lo + hi) / 2;
  }

  // ---------- Comparable companies ----------
  function comps(v) {
    const peersAll = v.peers || [];
    let set = peersAll.filter((p) => p.sameIndustry && p.sizeOk);
    let basis = "same industry, 0.2–5× the size";
    if (set.length < 3) { set = peersAll.filter((p) => p.sameSector && p.sizeOk); basis = "same sector, 0.2–5× the size"; }
    if (set.length < 3) return { ok: false, reason: `Only ${set.length} comparable ${set.length === 1 ? "company" : "companies"} passed the filter (same sector and similar size), so a peer valuation would be unreliable.`, peersAll };
    const m = v.multiples || {}, price = v.price;
    const ok = (x, max) => isNum(x) && x > 0 && x < max;
    const med = {
      forwardPE: median(set.map((p) => p.forwardPE).filter((x) => ok(x, 80))),
      evEbitda: median(set.map((p) => p.evEbitda).filter((x) => ok(x, 60))),
      ps: median(set.map((p) => p.ps).filter((x) => ok(x, 40))),
      pb: median(set.map((p) => p.pb).filter((x) => ok(x, 30))),
      roe: median(set.map((p) => p.roe)), margin: median(set.map((p) => p.profitMargin)), growth: median(set.map((p) => p.revenueGrowth)),
    };
    const profitable = ok(m.forwardPE, 1000) || ok(m.trailingPE, 1000);
    const methods = [];
    if (ok(m.forwardPE, 200) && med.forwardPE) methods.push({ key: "Forward P/E", implied: price * (med.forwardPE / m.forwardPE), mine: m.forwardPE, peer: med.forwardPE });
    const evToCap = m.enterpriseValue && v.marketCap ? m.enterpriseValue / v.marketCap : null;
    if (ok(m.evEbitda, 200) && med.evEbitda && evToCap > 0.5 && evToCap < 3) {
      const impliedEV = m.enterpriseValue * (med.evEbitda / m.evEbitda);
      methods.push({ key: "EV/EBITDA", implied: price * (1 + (impliedEV - m.enterpriseValue) / v.marketCap), mine: m.evEbitda, peer: med.evEbitda });
    }
    if (!profitable && ok(m.ps, 200) && med.ps) methods.push({ key: "Price/Sales", implied: price * (med.ps / m.ps), mine: m.ps, peer: med.ps });
    const vals = methods.map((x) => x.implied).filter((x) => isNum(x) && x > 0);
    if (!vals.length) return { ok: false, reason: "Peers were found but not enough usable multiples (negative or extreme values are excluded).", peersAll, set, basis, med };
    return { ok: true, set, basis, med, methods, value: mean(vals), low: Math.min(...vals), high: Math.max(...vals), peersAll };
  }

  // ---------- Banks & insurers ----------
  function bankModels(v, P, C) {
    const roes = P.A.slice(-5).map((r) => (isNum(r.netIncome) && r.equity > 0 ? r.netIncome / r.equity : null)).filter(isNum);
    const roe = mean(roes) ?? v.ttm?.roe;
    const payout = isNum(v.dividend?.payout) ? v.dividend.payout : mean(P.A.slice(-3).map((r) => (isNum(r.dividendsPaid) && r.netIncome > 0 ? Math.abs(r.dividendsPaid) / r.netIncome : null)));
    const ke = C.ke;
    const g = Math.min(isNum(roe) && isNum(payout) ? roe * (1 - clip(payout, 0, 1)) : 0.03, 0.04, C.rf);
    const out = { roe, payout, ke, g, methods: [] };
    const isBank = /Bank/i.test(v.industry || "");
    const book = isBank && P.last.tangibleBook > 0 ? P.last.tangibleBook : P.last.equity;
    if (isNum(roe) && book > 0 && ke > g) {
      const pb = (roe - g) / (ke - g);
      const bvps = (book * P.fx) / P.shares;
      out.methods.push({ key: `Justified P/B (${isBank ? "tangible book" : "book"})`, implied: pb * bvps, detail: `(${(roe * 100).toFixed(1)}% ROE − ${(g * 100).toFixed(1)}% g) ÷ (${(ke * 100).toFixed(1)}% cost of equity − g) = ${pb.toFixed(2)}× book of ${bvps.toFixed(2)}` });
    }
    const dps = v.dividend?.rate;
    if (isNum(dps) && dps > 0 && isNum(payout) && payout >= 0.2 && payout <= 0.9 && ke > g) {
      out.methods.push({ key: "Dividend discount", implied: (dps * (1 + g)) / (ke - g), detail: `${dps.toFixed(2)} × (1 + ${(g * 100).toFixed(1)}%) ÷ (${(ke * 100).toFixed(1)}% − ${(g * 100).toFixed(1)}%)` });
    } else out.ddmNote = "Dividend discount skipped (needs a payout ratio between 20% and 90%).";
    return out;
  }

  // ---------- Quality & safety ----------
  function piotroski(P) {
    const a = P.last, b = P.prev;
    if (!a.totalAssets || !b.totalAssets) return null;
    const roa = (r) => (isNum(r.netIncome) && r.totalAssets ? r.netIncome / r.totalAssets : null);
    const lev = (r) => (isNum(r.longTermDebt) && r.totalAssets ? r.longTermDebt / r.totalAssets : 0);
    const cr = (r) => (isNum(r.currentAssets) && r.currentLiab ? r.currentAssets / r.currentLiab : null);
    const gm = (r) => (isNum(r.grossProfit) && r.revenue ? r.grossProfit / r.revenue : null);
    const at = (r) => (isNum(r.revenue) && r.totalAssets ? r.revenue / r.totalAssets : null);
    const t = (x) => (x == null ? null : !!x);
    const cmp = (x, y, f) => (isNum(x) && isNum(y) ? f(x, y) : null);
    const items = [
      ["Profitable (return on assets > 0)", t(isNum(roa(a)) ? roa(a) > 0 : null)],
      ["Positive operating cash flow", t(isNum(a.cfo) ? a.cfo > 0 : null)],
      ["Return on assets improved", cmp(roa(a), roa(b), (x, y) => x > y)],
      ["Cash flow exceeds net income (earnings quality)", cmp(a.cfo, a.netIncome, (x, y) => x > y)],
      ["Long-term debt ratio fell", cmp(lev(a), lev(b), (x, y) => x <= y)],
      ["Current ratio improved", cmp(cr(a), cr(b), (x, y) => x > y)],
      ["No new shares issued", cmp(a.shares, b.shares, (x, y) => x <= y * 1.005)],
      ["Gross margin improved", cmp(gm(a), gm(b), (x, y) => x > y)],
      ["Asset turnover improved", cmp(at(a), at(b), (x, y) => x > y)],
    ];
    const known = items.filter((i) => i[1] != null);
    return { items, score: known.filter((i) => i[1]).length, of: known.length };
  }

  function altman(v, P) {
    const k = kind(v);
    if (k !== "general" || /Utilities/i.test(v.sector || "")) return { skip: "Not used for banks, insurers, REITs or utilities: their balance sheets don't fit the model." };
    const r = P.last;
    if (!r.totalAssets || !r.totalLiab) return null;
    const ta = r.totalAssets, wc = r.workingCapital ?? (isNum(r.currentAssets) && isNum(r.currentLiab) ? r.currentAssets - r.currentLiab : null);
    if (!isNum(wc) || !isNum(r.retained) || !isNum(r.ebit ?? r.opInc)) return null;
    const ebit = r.ebit ?? r.opInc;
    const manuf = /Industrials|Basic Materials/i.test(v.sector || "");
    if (manuf) {
      const mve = v.marketCap / P.fx;
      const z = 1.2 * (wc / ta) + 1.4 * (r.retained / ta) + 3.3 * (ebit / ta) + 0.6 * (mve / r.totalLiab) + 1.0 * ((r.revenue || 0) / ta);
      return { z, model: "Altman Z (manufacturers)", zone: z > 2.99 ? "Safe" : z > 1.81 ? "Grey zone" : "Distress" };
    }
    const z = 6.56 * (wc / ta) + 3.26 * (r.retained / ta) + 6.72 * (ebit / ta) + 1.05 * ((r.equity || 0) / r.totalLiab);
    return { z, model: "Altman Z″ (non-manufacturers)", zone: z > 2.6 ? "Safe" : z > 1.1 ? "Grey zone" : "Distress" };
  }

  // ---------- Risk statistics from daily prices ----------
  function riskStats(stock, bench, rf) {
    if (!stock?.length || stock.length < 60) return null;
    const rets = (s) => s.slice(1).map((p, i) => p[1] / s[i][1] - 1);
    const map = new Map(bench?.map((p) => [new Date(p[0]).toDateString(), p[1]]) || []);
    const rs = rets(stock);
    const vol = Math.sqrt(252) * Math.sqrt(mean(rs.map((x) => (x - mean(rs)) ** 2)));
    const total = stock.at(-1)[1] / stock[0][1] - 1;
    let peak = -Infinity, mdd = 0; for (const [, p] of stock) { peak = Math.max(peak, p); mdd = Math.min(mdd, p / peak - 1); }
    const downs = rs.filter((x) => x < 0);
    const dvol = Math.sqrt(252) * Math.sqrt(mean(downs.map((x) => x * x)) || 0);
    const ann = Math.pow(1 + total, 252 / rs.length) - 1;
    // Beta vs S&P 500 on matching days
    const pairs = [];
    for (let i = 1; i < stock.length; i++) {
      const a = map.get(new Date(stock[i][0]).toDateString()), b = map.get(new Date(stock[i - 1][0]).toDateString());
      if (a && b) pairs.push([stock[i][1] / stock[i - 1][1] - 1, a / b - 1]);
    }
    let beta = null, corr = null, benchTotal = null;
    if (pairs.length > 40) {
      const mx = mean(pairs.map((p) => p[0])), my = mean(pairs.map((p) => p[1]));
      const cov = mean(pairs.map((p) => (p[0] - mx) * (p[1] - my))), vy = mean(pairs.map((p) => (p[1] - my) ** 2)), vx = mean(pairs.map((p) => (p[0] - mx) ** 2));
      beta = cov / vy; corr = cov / Math.sqrt(vx * vy);
    }
    if (bench?.length > 1) benchTotal = bench.at(-1)[1] / bench[0][1] - 1;
    return { vol, total, ann, mdd, beta, corr, benchTotal, sharpe: vol ? (ann - rf) / vol : null, sortino: dvol ? (ann - rf) / dvol : null };
  }

  // ---------- Full model ----------
  function run(v, over = {}, riskSeries = null) {
    const P = prepare(v), C = costOfCapital(v, P, over), k = kind(v);
    const out = { v, P, C, kind: k, notes: [], methods: [] };
    if (k === "general") {
      const S = dcfSetup(v, P, C, over);
      out.setup = S;
      if (S.ok) {
        const base = dcfValue(P, v, { g0: S.g0, gT: S.gT, wacc: C.wacc, margin: S.margin, years: S.years });
        const waccs = [-0.01, -0.005, 0, 0.005, 0.01].map((d) => C.wacc + d);
        const gs = [0.015, 0.02, 0.025, 0.03];
        const grid = waccs.map((w) => gs.map((g) => (w > g + 0.01 ? dcfValue(P, v, { g0: S.g0, gT: g, wacc: w, margin: S.margin, years: S.years }).perShare : null)));
        const flat = grid.flat().filter((x) => isNum(x) && x > 0);
        out.dcf = { ...base, grid, waccs, gs, low: flat.length ? Math.min(...flat) : null, high: flat.length ? Math.max(...flat) : null };
        out.implied = reverseDCF(v, P, S, C.wacc);
        if (base.perShare > 0) out.methods.push({ key: "DCF (cash flow)", value: base.perShare, low: out.dcf.low, high: out.dcf.high, weight: 0.5 });
        if (base.tvShare > 0.75) out.notes.push(`Terminal value is ${(base.tvShare * 100).toFixed(0)}% of the DCF value, so the result leans heavily on long-run assumptions.`);
        if (isNum(base.exitMult) && base.exitMult > 15) out.notes.push(`The terminal value implies about ${base.exitMult.toFixed(0)}× EBITDA, which is high relative to typical market multiples; treat the DCF result with caution.`);
        out.notes.push(...S.notes);
      }
    } else if (k === "bank") {
      out.bank = bankModels(v, P, C);
      for (const m of out.bank.methods) out.methods.push({ key: m.key, value: m.implied, low: m.implied * 0.85, high: m.implied * 1.15, weight: 0.5 / out.bank.methods.length });
    } else {
      out.setup = { ok: false, reason: "REITs are valued on funds from operations (FFO), which this free data doesn't include, so a DCF isn't shown. Peer multiples are used instead." };
    }
    out.comps = comps(v);
    if (out.comps.ok) out.methods.push({ key: "Peer multiples", value: out.comps.value, low: out.comps.low, high: out.comps.high, weight: 0.5 });
    const W = out.methods.reduce((a, m) => a + m.weight, 0);
    out.fair = W ? out.methods.reduce((a, m) => a + m.value * m.weight, 0) / W : null;
    const lows = out.methods.map((m) => m.low).filter(isNum), highs = out.methods.map((m) => m.high).filter(isNum);
    out.rangeLow = lows.length ? Math.min(...lows) : null; out.rangeHigh = highs.length ? Math.max(...highs) : null;
    const vals = out.methods.map((m) => m.value).filter((x) => x > 0);
    const spreadWide = vals.length >= 2 && Math.max(...vals) / Math.min(...vals) > 2;
    const price = v.price;
    if (out.methods.length < 2 || spreadWide || !isNum(out.fair)) out.verdict = { label: "Inconclusive", cls: "", why: out.methods.length < 2 ? "Fewer than two valuation methods could be run on the available data." : spreadWide ? "The methods disagree by more than 2×, so no verdict is given." : "Not enough data." };
    else if (price < out.rangeLow) out.verdict = { label: "Price below model range", cls: "up" };
    else if (price > out.rangeHigh) out.verdict = { label: "Price above model range", cls: "down" };
    else out.verdict = { label: "Price within model range", cls: "" };
    out.vsFair = isNum(out.fair) ? (out.fair / price - 1) * 100 : null;
    // Confidence
    let pts = 0;
    if (out.comps.ok && out.comps.set.length >= 4) pts++;
    const fm = P.A.slice(-3).map((r) => r.fcffMargin).filter(isNum);
    if (fm.length >= 3 && fm.every((x) => x > 0) && Math.sqrt(mean(fm.map((x) => (x - mean(fm)) ** 2))) / mean(fm) < 0.5) pts++;
    if (out.dcf ? out.dcf.tvShare < 0.75 : k === "bank") pts++;
    if (!P.currencyIssue && !out.setup?.peak) pts++;
    out.confidence = pts >= 3 ? "High" : pts === 2 ? "Medium" : "Low";
    // Quality
    out.piotroski = piotroski(P);
    out.altman = altman(v, P);
    const ebit = P.last.ebit ?? P.last.opInc;
    out.roic = isNum(ebit) && P.last.investedCapital > 0 ? (ebit * (1 - P.taxEff)) / P.last.investedCapital : null;
    out.fcfYield = isNum(v.ttm?.fcf) && v.marketCap ? (v.ttm.fcf * P.fx) / v.marketCap : null;
    out.netDebtEbitda = isNum(v.ttm?.ebitda) && v.ttm.ebitda > 0 ? (P.debt - P.cash) / v.ttm.ebitda : null;
    out.coverage = C.cover;
    const ni = P.last.netIncome, opAt = isNum(ebit) ? ebit * (1 - P.taxEff) : null;
    out.oneOff = isNum(ni) && isNum(opAt) && Math.abs(opAt) > 0 && Math.abs(ni - opAt) / Math.abs(opAt) > 0.3;
    // Risk & factors
    out.risk = riskSeries ? riskStats(riskSeries.stock, riskSeries.bench, C.rf) : null;
    out.factors = factorScores(v, out);
    out.riskReward = isNum(out.rangeLow) && isNum(out.rangeHigh) ? { up: (out.rangeHigh / price - 1) * 100, down: (out.rangeLow / price - 1) * 100 } : null;
    out.thesis = thesis(v, out);
    return out;
  }

  // Simple, transparent 0–100 factor scores (50 = neutral).
  function factorScores(v, o) {
    const s = (x, lo, hi) => (isNum(x) ? Math.round(clip((x - lo) / (hi - lo), 0, 1) * 100) : null);
    const m = v.multiples || {}, c = v.consensus || {}, se = v.sentiment || {};
    const peerPE = o.comps?.med?.forwardPE;
    const value = mean([s(o.fcfYield, -0.01, 0.08), isNum(m.forwardPE) && peerPE && m.forwardPE > 0 ? s(peerPE / m.forwardPE, 0.5, 1.5) : null]);
    const quality = mean([o.piotroski?.of ? s(o.piotroski.score / o.piotroski.of, 0.2, 0.9) : null, s(o.roic, 0, 0.25), s(v.ttm?.profitMargin, -0.05, 0.3)]);
    const momentum = mean([o.risk && isNum(o.risk.benchTotal) ? s(o.risk.total - o.risk.benchTotal, -0.3, 0.3) : null, se.ma200 && v.price ? s(v.price / se.ma200 - 1, -0.2, 0.2) : null]);
    const lowVol = o.risk ? s(-o.risk.vol, -0.6, -0.15) : null;
    const growth = mean([s(c.revGrowthNY ?? c.revGrowthCY, -0.05, 0.3), s(c.epsGrowthNY, -0.1, 0.4)]);
    const revisions = s(c.epsRev90NY ?? c.epsRev90CY, -10, 10);
    return [["Value", value, "Cash-flow yield and P/E vs peers"], ["Quality", quality, "Piotroski score, return on capital, profit margin"], ["Momentum", momentum, "1-year return vs S&P 500, price vs 200-day average"], ["Low volatility", lowVol, "Lower price swings score higher"], ["Growth", growth, "Analysts' expected revenue and EPS growth"], ["Estimate revisions", revisions, "Change in next year's EPS estimate over 90 days"]]
      .map(([name, val, about]) => ({ name, val: isNum(val) ? Math.round(val) : null, about }));
  }

  function thesis(v, o) {
    const pts = [], c = v.consensus || {}, se = v.sentiment || {};
    if (o.verdict.label !== "Inconclusive") pts.push(`${o.verdict.label}: the blended model value is about ${fmtP(o.fair, v)} (${o.vsFair >= 0 ? "+" : ""}${o.vsFair.toFixed(0)}% vs the current price), with a range of ${fmtP(o.rangeLow, v)}–${fmtP(o.rangeHigh, v)}.`);
    if (isNum(o.implied)) {
      const cmp = [isNum(P0(o).hist) ? `${(P0(o).hist * 100).toFixed(0)}% a year over the past ${Math.max(1, P0(o).A.length - 1)} years` : null, isNum(c.revGrowthNY) ? `analysts' ${(c.revGrowthNY * 100).toFixed(0)}% for next year` : null].filter(Boolean).join(" and ");
      pts.push(`Expectations: today's price implies revenue growth starting near ${(o.implied * 100).toFixed(0)}% a year and fading over 10 years${cmp ? `, compared with ${cmp}` : ""}. ${o.implied > (c.revGrowthNY ?? P0(o).hist ?? 0) + 0.05 ? "On these model assumptions, that is more growth than the track record or consensus." : o.implied < (c.revGrowthNY ?? P0(o).hist ?? 0) - 0.05 ? "On these model assumptions, that is less growth than the track record or consensus." : "That is roughly in line with history and consensus."}`);
    }
    const r = c.epsRev90NY ?? c.epsRev90CY;
    if (isNum(r) && Math.abs(r) >= 2) pts.push(`Estimate revisions: analysts have ${r > 0 ? "raised" : "cut"} next year's EPS estimate by ${Math.abs(r).toFixed(0)}% in 90 days. Revisions show analysts changing their views; they are not a price forecast.`);
    if (o.piotroski?.of >= 7) pts.push(`Quality: Piotroski score ${o.piotroski.score} of ${o.piotroski.of}${isNum(o.roic) ? `, return on invested capital ${(o.roic * 100).toFixed(0)}% vs a ${(o.C.wacc * 100).toFixed(1)}% cost of capital` : ""}.`);
    const next = (v.catalysts?.earnings || []).find((t) => t > Date.now() - 86400000);
    if (next) pts.push(`Next catalyst: earnings around ${new Date(next).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}.`);
    const risks = [];
    if (isNum(se.shortPctFloat) && se.shortPctFloat > 0.1) risks.push(`${(se.shortPctFloat * 100).toFixed(0)}% of the float is sold short`);
    if (o.setup?.peak) risks.push("margins look near a cyclical peak");
    if (isNum(o.netDebtEbitda) && o.netDebtEbitda > 3) risks.push(`net debt is ${o.netDebtEbitda.toFixed(1)}× EBITDA`);
    if (o.altman?.zone === "Distress") risks.push("the Altman score is in the distress zone");
    if (o.oneOff) risks.push("last year's earnings include large one-off items");
    if (risks.length) pts.push(`Key risks: ${risks.join("; ")}.`);
    return pts;
  }
  const P0 = (o) => o.P;
  function fmtP(x, v) { return isNum(x) ? (v.priceCurrency && v.priceCurrency !== "USD" ? v.priceCurrency + " " : "$") + x.toFixed(2) : "—"; }

  // ---------- Rendering ----------
  const TABS = [["summary", "Summary"], ["dcf", "DCF"], ["comps", "Peers"], ["quality", "Quality"], ["risk", "Risk & sentiment"]];
  function render(el, v, h, state) {
    const o = run(v, state.over || {}, state.risk);
    const { esc, pct } = h;
    const P = (x) => fmtP(x, v);
    const pc = (x, d = 1) => (isNum(x) ? pct(x * 100, d, false) : "—");
    h.ps = (x, d = 1) => (isNum(x) ? pct(x * 100, d) : "—");
    const tab = state.tab || "summary";
    const verdict = `<span class="val-verdict">${esc(o.verdict.label)}</span>`;
    const head = `<div class="val-top">
      <div class="val-headline">${verdict}<span class="val-conf conf-${o.confidence.toLowerCase()}" title="Measures how complete and stable the inputs are (peer count, cash-flow stability, terminal-value share, currency checks). It does not measure how accurate the model value is.">Input quality: ${o.confidence}</span></div>
      <div class="val-figs">
        <div><span>Model value</span><b>${P(o.fair)}</b>${isNum(o.vsFair) ? `<small class="${h.cls(o.vsFair)}">${pct(o.vsFair, 0)} vs price</small>` : ""}</div>
        <div><span>Model range</span><b>${P(o.rangeLow)} – ${P(o.rangeHigh)}</b><small>low to high across methods</small></div>
        <div><span>To top / bottom of range</span><b>${o.riskReward ? `<span class="${h.cls(o.riskReward.up)}">${pct(o.riskReward.up, 0)}</span> / <span class="${h.cls(o.riskReward.down)}">${pct(o.riskReward.down, 0)}</span>` : "—"}</b><small>${!o.riskReward ? "No range available" : o.riskReward.up > 0 && o.riskReward.down < 0 ? `${(o.riskReward.up / Math.abs(o.riskReward.down)).toFixed(1)} : 1 upside-to-downside` : o.riskReward.up <= 0 ? "Whole range is below the price" : "Whole range is above the price"}</small></div>
        <div><span>Price</span><b>${P(v.price)}</b><small>${esc(v.priceCurrency || "")}</small></div>
      </div>
    </div>
    ${o.verdict.why ? `<p class="val-why">${esc(o.verdict.why)}</p>` : ""}
    <div class="seg scroll val-tabs" role="group" aria-label="Valuation sections">${TABS.map(([k, l]) => `<button data-vtab="${k}" aria-pressed="${k === tab}">${l}</button>`).join("")}</div>`;
    let body = "";
    if (tab === "summary") body = summary(o, h, P, pc);
    else if (tab === "dcf") body = dcfTab(o, h, P, pc, state);
    else if (tab === "comps") body = compsTab(o, h, P, pc);
    else if (tab === "quality") body = qualityTab(o, h, pc);
    else body = riskTab(o, h, P, pc);
    el.innerHTML = head + `<div class="val-body">${body}</div>
      <p class="small muted val-foot">Educational model built from free Yahoo Finance data (statements in ${esc(v.financialCurrency || "?")}${v.financialCurrency !== v.priceCurrency && isNum(v.fx) ? `, converted at ${v.fx.toFixed(4)} to ${esc(v.priceCurrency)}` : ""}); data can be incomplete or wrong. It is not investment advice or a recommendation to buy or sell. Updated ${new Date(v.asOf).toLocaleString("en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>`;
    return o;
  }

  function summary(o, h, P, pc) {
    const v = o.v, { esc } = h;
    // Football field
    const bars = [];
    for (const m of o.methods) bars.push({ label: m.key, lo: m.low, hi: m.high, mid: m.value });
    const c = v.consensus || {};
    if (isNum(c.targetLow) && isNum(c.targetHigh)) bars.push({ label: `Analyst targets (${c.analysts || "?"})`, lo: c.targetLow, hi: c.targetHigh, mid: c.targetMean, ref: true });
    if (isNum(v.sentiment?.low52) && isNum(v.sentiment?.high52)) bars.push({ label: "52-week range", lo: v.sentiment.low52, hi: v.sentiment.high52, ref: true });
    const xs = bars.flatMap((b) => [b.lo, b.hi]).concat([v.price, o.fair]).filter(isNum);
    const lo = Math.min(...xs) * 0.95, hi = Math.max(...xs) * 1.05, X = (x) => ((x - lo) / (hi - lo)) * 100;
    const field = bars.length ? `<div class="ff">${bars.map((b) => `<div class="ff-row"><div class="ff-lbl">${esc(b.label)}${b.ref ? ` <small>reference</small>` : ""}</div>
        <div class="ff-track"><span class="ff-bar ${b.ref ? "ref" : ""}" style="left:${X(b.lo)}%;width:${Math.max(0.8, X(b.hi) - X(b.lo))}%" title="${P(b.lo)} – ${P(b.hi)}"></span>${isNum(b.mid) ? `<span class="ff-mid" style="left:${X(b.mid)}%" title="${P(b.mid)}"></span>` : ""}</div>
        <div class="ff-val">${P(b.lo)} – ${P(b.hi)}</div></div>`).join("")}
      <div class="ff-row ff-axis"><div class="ff-lbl"></div><div class="ff-track"><span class="ff-price" style="left:${X(v.price)}%"><em>Price ${P(v.price)}</em></span>${isNum(o.fair) ? `<span class="ff-fair" style="left:${X(o.fair)}%"><em>Model ${P(o.fair)}</em></span>` : ""}</div><div class="ff-val"></div></div></div>` : `<p class="empty-line">No valuation method could be run on the available data.</p>`;
    const cats = catalysts(v, h);
    return `<div class="val-grid">
      <section><h3>Investment thesis (what the numbers say)</h3><ul class="val-thesis">${o.thesis.map((t) => `<li>${esc(t)}</li>`).join("") || `<li class="muted">Not enough data for a thesis.</li>`}</ul></section>
      <section><h3>Catalysts</h3>${cats}</section>
    </div>
    <h3>Valuation range (football field)</h3>${field}
    ${o.notes.length ? `<ul class="val-notes">${o.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
    <p class="small muted">Model value blends ${o.methods.map((m) => m.key).join(" and ") || "no methods"} equally. Analyst targets and the 52-week range are shown for reference only, not blended in. Key assumptions: discount rate ${pc(o.C.wacc)} (risk-free ${pc(o.C.rf)} + beta × 4.5% equity risk premium, kept within 7–13%)${o.setup?.ok ? `, terminal growth ${pc(o.setup.gT)}, starting revenue growth ${pc(o.setup.g0)}` : ""}. Change them on the DCF tab. Model values are hypothetical estimates, not predictions.</p>`;
  }

  function catalysts(v, h) {
    const { esc } = h, c = v.catalysts || {}, items = [];
    const next = (c.earnings || []).filter((t) => t > Date.now() - 86400000).sort((a, b) => a - b)[0];
    if (next) { const d = Math.round((next - Date.now()) / 86400000); items.push(`<li><b>Earnings</b> ${new Date(next).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })} <span class="muted">(${d <= 0 ? "today" : `in ${d} days`})</span></li>`); }
    if (c.exDividend && c.exDividend > Date.now() - 86400000) items.push(`<li><b>Ex-dividend</b> ${new Date(c.exDividend).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}</li>`);
    const ch = c.changes || [];
    const up = ch.filter((x) => x.action === "up").length, down = ch.filter((x) => x.action === "down").length;
    if (ch.length) items.push(`<li><b>Analyst actions (120 days)</b> ${ch.length} rating ${ch.length === 1 ? "change" : "changes"}: <span class="up">${up} upgrade${up === 1 ? "" : "s"}</span>, <span class="down">${down} downgrade${down === 1 ? "" : "s"}</span>${ch[0] ? `. Latest: ${esc(ch[0].firm)} ${esc(ch[0].to || "")}${ch[0].target ? `, target ${ch[0].target}` : ""} (${new Date(ch[0].date).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}; source Yahoo Finance)` : ""}</li>`);
    const r = v.consensus?.epsRev90NY ?? v.consensus?.epsRev90CY;
    if (isNum(r)) items.push(`<li><b>Estimate trend</b> next year's EPS estimate <span class="${h.cls(r)}">${r >= 0 ? "up" : "down"} ${Math.abs(r).toFixed(1)}%</span> in 90 days</li>`);
    return items.length ? `<ul class="val-cats">${items.join("")}</ul>` : `<p class="muted small">No upcoming events found in the data.</p>`;
  }

  function dcfTab(o, h, P, pc, state) {
    const v = o.v, C = o.C, S = o.setup || {}, { esc } = h;
    const ov = state.over || {};
    const field = (key, label, val, step, help) => `<label class="val-in"><span>${label}</span><input type="number" step="${step}" data-vover="${key}" value="${isNum(val) ? (val * 100).toFixed(2) : ""}"><small>${help}</small></label>`;
    const capm = `<div class="val-kv">
      <div><span>Risk-free rate</span><b>${pc(C.rf, 2)}</b><small>US 10-year Treasury${v.region === "CA" ? " (used as a proxy for Canada)" : ""}</small></div>
      <div><span>Beta</span><b>${C.beta.toFixed(2)}</b><small>Raw ${isNum(C.rawBeta) ? C.rawBeta.toFixed(2) : "—"}, adjusted toward 1 (Blume)</small></div>
      <div><span>Cost of equity</span><b>${pc(C.ke, 2)}</b><small>rf + beta × 4.5% equity risk premium</small></div>
      <div><span>Cost of debt (after tax)</span><b>${pc(C.kdAt, 2)}</b><small>${isNum(C.cover) ? `Interest cover ${C.cover.toFixed(1)}× → +${(C.spread * 100).toFixed(2)}% spread` : "Default spread"}</small></div>
      <div><span>Weights</span><b>${(C.wE * 100).toFixed(0)}% / ${(C.wD * 100).toFixed(0)}%</b><small>equity / debt at market value</small></div>
      <div><span>WACC</span><b>${pc(C.wacc, 2)}</b><small>${Math.abs(C.rawWacc - C.wacc) > 0.0001 && !isNum(ov.wacc) ? `Raw ${pc(C.rawWacc, 2)}, kept within 7–13%` : isNum(ov.wacc) ? "Your override" : "Weighted average cost of capital"}</small></div>
    </div>`;
    if (o.kind === "bank") {
      const b = o.bank;
      return `<h3>Bank & insurer valuation</h3><p class="small muted">Cash-flow DCFs don't work for lenders and insurers (debt is their raw material), so they're valued on returns on equity and dividends, using the cost of equity rather than WACC.</p>${capm}
        <div class="val-kv"><div><span>Average ROE</span><b>${pc(b.roe)}</b><small>Last 3–5 years</small></div><div><span>Payout ratio</span><b>${pc(b.payout, 0)}</b></div><div><span>Sustainable growth</span><b>${pc(b.g)}</b><small>ROE × retention, capped at 4%</small></div></div>
        <ul class="val-notes">${b.methods.map((m) => `<li><b>${esc(m.key)}: ${P(m.implied)}</b> <span class="muted">${esc(m.detail)}</span></li>`).join("")}${b.ddmNote ? `<li class="muted">${esc(b.ddmNote)}</li>` : ""}</ul>`;
    }
    if (!S.ok) return `<p class="empty-line">${esc(S.reason || "DCF not available.")}</p>${capm}`;
    const d = o.dcf;
    const proj = `<div class="table-wrap"><table class="table val-proj"><thead><tr><th>Year</th>${d.rows.map((r) => `<th class="r">+${r.t}</th>`).join("")}</tr></thead><tbody>
      <tr><td>Revenue growth</td>${d.rows.map((r) => `<td class="r">${h.ps(r.g)}</td>`).join("")}</tr>
      <tr><td>Free cash flow (bn ${esc(v.financialCurrency)})</td>${d.rows.map((r) => `<td class="r">${(r.fcff / 1e9).toFixed(2)}</td>`).join("")}</tr>
      <tr><td>Present value</td>${d.rows.map((r) => `<td class="r">${(r.pv / 1e9).toFixed(2)}</td>`).join("")}</tr></tbody></table></div>`;
    const grid = `<div class="table-wrap"><table class="table val-grid-t"><thead><tr><th>WACC ↓ / terminal growth →</th>${d.gs.map((g) => `<th class="r">${(g * 100).toFixed(1)}%</th>`).join("")}</tr></thead><tbody>${d.grid.map((row, i) => `<tr><td><b>${(d.waccs[i] * 100).toFixed(1)}%</b></td>${row.map((x) => `<td class="r ${isNum(x) ? (x > v.price ? "up" : "down") : ""}" style="${isNum(x) ? `background:color-mix(in srgb, var(${x > v.price ? "--up" : "--down"}) ${Math.round(Math.min(40, Math.abs(x / v.price - 1) * 60))}%, transparent)` : ""}">${isNum(x) ? x.toFixed(2) : "—"}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    const ev = `<div class="val-kv">
      <div><span>PV of ${S.years}-year cash flows</span><b>${(d.pvStage / 1e9).toFixed(1)} bn</b></div>
      <div><span>PV of terminal value</span><b>${(d.pvTV / 1e9).toFixed(1)} bn</b><small>${(d.tvShare * 100).toFixed(0)}% of enterprise value</small></div>
      <div><span>Enterprise value</span><b>${(d.ev / 1e9).toFixed(1)} bn</b></div>
      <div><span>− Debt − minority + cash</span><b>${((d.equity - d.ev) / 1e9).toFixed(1)} bn</b></div>
      <div><span>Equity value per share</span><b>${P(d.perShare)}</b><small>Diluted shares</small></div>
      <div><span>Price implies</span><b>${isNum(o.implied) ? h.ps(o.implied) : "—"}</b><small>starting revenue growth, fading over 10 years (reverse DCF)</small></div>
    </div>`;
    return `<p class="small muted">Free cash flow to the firm = operating cash flow − capital spending + after-tax interest − stock-based pay (a real cost). The cash margin is a multi-year average applied to trailing revenue; growth fades in a straight line to the terminal rate. Values in ${esc(v.financialCurrency)} unless shown as per-share.</p>
      <div class="val-ins">${field("g0", "Starting revenue growth %", S.g0, "0.5", `Default from analysts' revenue forecast${isNum(v.consensus?.revGrowthNY) ? "" : " or history"}, capped at 25%`)}
        ${field("margin", "Free-cash-flow margin %", S.margin, "0.5", `Normalized ${pc(S.marginNorm)} (${S.peak ? "all-years average" : "3-year average"})`)}
        ${field("gT", "Terminal growth %", S.gT, "0.25", `${v.region === "CA" ? "2.0% Canada" : "2.5% US"} default, kept below the risk-free rate`)}
        ${field("wacc", "WACC %", C.wacc, "0.25", "Discount rate (see build-up below)")}
        <button class="btn" data-vreset>Reset to defaults</button></div>
      ${ev}<h3>Projection</h3>${proj}<h3>Sensitivity: value per share</h3>${grid}<h3>Discount rate build-up</h3>${capm}`;
  }

  function compsTab(o, h, P, pc) {
    const v = o.v, c = o.comps, { esc } = h, m = v.multiples || {};
    const x = (n, d = 1) => (isNum(n) ? n.toFixed(d) + "×" : "—");
    const peerRows = (c.peersAll || []).map((p) => `<tr class="${c.set?.includes(p) ? "" : "muted-row"}"><td><b>${esc(p.symbol)}</b> <span class="muted small">${esc(p.name || "")}</span></td><td>${esc(p.industry || "—")}</td><td class="r">${capTxt(p.marketCap)}</td><td class="r">${x(p.forwardPE)}</td><td class="r">${x(p.evEbitda)}</td><td class="r">${x(p.ps)}</td><td class="r">${x(p.pb)}</td><td class="r">${c.set?.includes(p) ? "Used" : p.sameSector ? (p.sizeOk ? "—" : "Size") : "Sector"}</td></tr>`).join("");
    const table = `<div class="table-wrap"><table class="table"><thead><tr><th>Company</th><th>Industry</th><th class="r">Market cap</th><th class="r">Fwd P/E</th><th class="r">EV/EBITDA</th><th class="r">P/S</th><th class="r">P/B</th><th class="r">Status</th></tr></thead><tbody>
      <tr class="val-self"><td><b>${esc(v.symbol)}</b> <span class="muted small">this company</span></td><td>${esc(v.industry || "—")}</td><td class="r">${capTxt(v.marketCap)}</td><td class="r">${x(m.forwardPE)}</td><td class="r">${x(m.evEbitda)}</td><td class="r">${x(m.ps)}</td><td class="r">${x(m.pb)}</td><td></td></tr>
      ${c.ok ? `<tr class="val-med"><td><b>Peer median</b> <span class="muted small">${esc(c.basis)}</span></td><td></td><td></td><td class="r">${x(c.med.forwardPE)}</td><td class="r">${x(c.med.evEbitda)}</td><td class="r">${x(c.med.ps)}</td><td class="r">${x(c.med.pb)}</td><td></td></tr>` : ""}
      ${peerRows}</tbody></table></div>`;
    const methods = c.ok ? `<ul class="val-notes">${c.methods.map((mm) => `<li><b>${esc(mm.key)}: ${P(mm.implied)}</b> <span class="muted">— ${mm.mine.toFixed(1)}× here vs ${mm.peer.toFixed(1)}× peer median${mm.key === "EV/EBITDA" ? ", with net debt carried through" : ""}</span></li>`).join("")}</ul>` : `<p class="empty-line">${esc(c.reason)}</p>`;
    return `<p class="small muted">Peers start from Yahoo's "similar companies" list, then keep only those in the same industry (or sector) and between 0.2× and 5× the size. Negative or extreme multiples (P/E over 80×) are excluded and medians are used. Price/Sales is used only for unprofitable companies.</p>${methods}${table}`;
  }

  function capTxt(x) { return !isNum(x) ? "—" : x >= 1e12 ? (x / 1e12).toFixed(2) + " tn" : (x / 1e9).toFixed(x >= 1e10 ? 0 : 1) + " bn"; }

  function qualityTab(o, h, pc) {
    const { esc } = h, pf = o.piotroski, az = o.altman;
    const pfHtml = pf ? `<div class="val-score"><b>${pf.score}</b><span>of ${pf.of}</span></div><ul class="val-check">${pf.items.map(([l, ok]) => `<li class="${ok == null ? "na" : ok ? "ok" : "no"}">${ok == null ? "–" : ok ? "✓" : "✗"} ${esc(l)}</li>`).join("")}</ul><p class="small muted">8–9 is strong and 0–3 is weak. Piotroski designed it for cheap (low price-to-book) stocks, so treat it as a health check elsewhere.</p>` : `<p class="empty-line">Needs two years of statements.</p>`;
    const azHtml = az?.skip ? `<p class="muted small">${esc(az.skip)}</p>` : az ? `<div class="val-score"><b>${az.z.toFixed(2)}</b><span>${esc(az.zone)}</span></div><p class="small muted">${esc(az.model)}. ${az.model.includes("″") ? "Above 2.6 safe, 1.1–2.6 grey zone, below 1.1 distress." : "Above 2.99 safe, 1.81–2.99 grey zone, below 1.81 distress."}</p>` : `<p class="muted small">Not enough balance-sheet data.</p>`;
    const kv = (l, val, sm) => `<div><span>${l}</span><b>${val}</b>${sm ? `<small>${sm}</small>` : ""}</div>`;
    return `<div class="val-grid"><section><h3>Piotroski F-score (financial strength)</h3>${pfHtml}</section><section><h3>Bankruptcy risk (Altman)</h3>${azHtml}
      <h3>Returns, cash and leverage</h3><div class="val-kv one">
        ${kv("Return on invested capital", pc(o.roic), isNum(o.roic) ? `${o.roic > o.C.wacc ? "Above" : "Below"} the ${pc(o.C.wacc)} cost of capital: ${o.roic > o.C.wacc ? "creating" : "not creating"} value` : "")}
        ${kv("Free-cash-flow yield", pc(o.fcfYield), "Trailing free cash flow ÷ market cap")}
        ${kv("Net debt / EBITDA", isNum(o.netDebtEbitda) ? o.netDebtEbitda.toFixed(1) + "×" : "—", "Below 2× is comfortable for most industries")}
        ${kv("Interest coverage", isNum(o.coverage) ? o.coverage.toFixed(1) + "×" : "—", "Operating profit ÷ interest expense")}
        ${o.oneOff ? kv("Earnings quality", "Check", "Net income differs from operating profit by over 30% (one-off items)") : ""}
      </div></section></div>`;
  }

  function riskTab(o, h, P, pc) {
    const v = o.v, r = o.risk, se = v.sentiment || {}, { esc } = h;
    const fac = `<div class="val-factors">${o.factors.map((f) => `<div class="vf"><div class="vf-top"><span>${esc(f.name)}</span><b>${f.val ?? "—"}</b></div><div class="vf-bar"><span style="width:${f.val ?? 0}%"></span></div><small>${esc(f.about)}</small></div>`).join("")}</div>`;
    const kv = (l, val, sm) => `<div><span>${l}</span><b>${val}</b>${sm ? `<small>${sm}</small>` : ""}</div>`;
    const riskHtml = r ? `<div class="val-kv">${kv("1-year return", h.ps(r.total), isNum(r.benchTotal) ? `S&P 500 ${h.ps(r.benchTotal)}` : "")}${kv("Volatility", pc(r.vol, 0), "Annualized")}${kv("Beta (1 yr)", isNum(r.beta) ? r.beta.toFixed(2) : "—", isNum(r.corr) ? `Correlation ${r.corr.toFixed(2)}` : "")}${kv("Max drawdown", h.ps(r.mdd, 0), "Worst peak-to-trough fall")}${kv("Sharpe ratio", isNum(r.sharpe) ? r.sharpe.toFixed(2) : "—", "Return above risk-free ÷ volatility")}${kv("Sortino ratio", isNum(r.sortino) ? r.sortino.toFixed(2) : "—", "Penalizes only downside swings")}</div>` : `<p class="muted small">Price history is loading or unavailable.</p>`;
    const offHigh = se.high52 && v.price ? (v.price / se.high52 - 1) : null;
    const shortChg = se.sharesShort && se.sharesShortPrior ? se.sharesShort / se.sharesShortPrior - 1 : null;
    const rt = se.recTrend || {}, tot = ["strongBuy", "buy", "hold", "sell", "strongSell"].reduce((a, k) => a + (rt[k] || 0), 0);
    const pos = `<div class="val-kv">${kv("Short interest", pc(se.shortPctFloat), isNum(shortChg) ? `${shortChg >= 0 ? "Up" : "Down"} ${Math.abs(shortChg * 100).toFixed(0)}% vs last month` : "Share of float sold short")}${kv("Days to cover", isNum(se.shortRatio) ? se.shortRatio.toFixed(1) : "—", "Short interest ÷ daily volume")}${kv("Insiders own", pc(se.insiders))}${kv("Institutions own", pc(se.institutions), "Share of shares held by institutions")}${kv("From 52-week high", h.ps(offHigh, 0))}${kv("Vs 200-day average", se.ma200 ? h.ps(v.price / se.ma200 - 1) : "—")}</div>
      ${tot ? `<div class="val-rec"><span>Analysts (${tot})</span><div class="val-rec-bar">${[["strongBuy", "#12996b"], ["buy", "#6fc392"], ["hold", "#e9b949"], ["sell", "#f08a4b"], ["strongSell", "#d9443b"]].map(([k, c]) => (rt[k] ? `<i style="flex:${rt[k]};background:${c}" title="${k} ${rt[k]}"></i>` : "")).join("")}</div></div>` : ""}`;
    return `<h3>Factor profile</h3><p class="small muted">0–100, where 50 is neutral. Uses common factor definitions from quantitative screening; scores are relative and simplified.</p>${fac}<h3>Risk (past year)</h3>${riskHtml}<h3>Sentiment & positioning</h3>${pos}`;
  }

  window.Valuation = { run, render, riskStats };
})();
