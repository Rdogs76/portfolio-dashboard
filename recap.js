// Builds the "why did the market move" recap from index/sector/macro prices, the economic calendar and headlines.
(function () {
  const NY = "America/New_York";
  const dkey = (t) => new Date(t).toLocaleDateString("en-CA", { timeZone: NY });
  const dayName = (key) => new Date(key + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  const shortDay = (key) => new Date(key + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const apct = (v, d = 1) => (v == null || !isFinite(v) ? "—" : Math.abs(v).toFixed(d) + "%");
  const pct = (v, d = 1) => (v == null || !isFinite(v) ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(d) + "%");

  const DEFENSIVE = ["XLU", "XLP", "XLV"];
  const RISK_ON = ["XLK", "XLY", "XLC", "XLF", "XLI", "XLB"];

  const THEMES = [
    ["the Fed and interest rates", /\bfed\b|federal reserve|powell|fomc|rate cut|rate hike|interest rate/i],
    ["inflation", /inflation|\bcpi\b|\bpce\b|consumer prices|price index/i],
    ["jobs and the labour market", /\bjobs?\b|payroll|unemployment|labou?r market|hiring|layoff/i],
    ["trade and tariffs", /tariff|trade war|trade deal|trade talks|export ban|import/i],
    ["company earnings", /earnings|quarterly results|revenue|guidance|profit (warning|forecast)/i],
    ["oil prices", /\boil\b|opec|crude/i],
    ["bond yields", /yield|treasur|bond market/i],
    ["the Bank of Canada", /bank of canada|\bboc\b|macklem/i],
    ["AI and chip stocks", /\bai\b|artificial intelligence|\bchips?\b|semiconductor|nvidia/i],
    ["politics and government", /shutdown|congress|white house|election|government|senate/i],
    ["geopolitics", /war|attack|missile|sanction|conflict|tension/i],
  ];

  function move(word, v, small = .3, big = 2.5) {
    const a = Math.abs(v);
    if (a < small) return "was little changed";
    if (v > 0) return a >= big ? "jumped" : a >= 1 ? "rose" : "edged up";
    return a >= big ? "tumbled" : a >= 1 ? "fell" : "slipped";
  }

  function periodWindow(sp, period) {
    // sp: S&P 500 points. Returns {startIdx, endIdx, label, keys}
    const pts = sp.points;
    const last = pts.length - 1;
    if (period === "day") return { start: last - 1, end: last, label: `Last session · ${shortDay(dkey(pts[last][0]))}` };
    if (period === "month") { const s = Math.max(0, last - 21); return { start: s, end: last, label: `Past month · since ${shortDay(dkey(pts[s][0]))}` }; }
    // This week (Mon–today, New York). Base = last close before Monday.
    const now = new Date();
    const todayKey = dkey(now.getTime());
    const wd = (new Date(todayKey + "T12:00:00Z").getUTCDay() + 6) % 7;
    const monday = new Date(Date.parse(todayKey + "T12:00:00Z") - wd * 86400000).toISOString().slice(0, 10);
    let start = -1;
    for (let i = last; i >= 0; i--) if (dkey(pts[i][0]) < monday) { start = i; break; }
    if (start === -1 || start === last) {
      // No session yet this week: show last week instead.
      const prevMonday = new Date(Date.parse(monday + "T12:00:00Z") - 7 * 86400000).toISOString().slice(0, 10);
      let s2 = 0; for (let i = last; i >= 0; i--) if (dkey(pts[i][0]) < prevMonday) { s2 = i; break; }
      return { start: s2, end: last, label: `Last week · ${shortDay(dkey(pts[s2 + 1]?.[0] ?? pts[last][0]))} – ${shortDay(dkey(pts[last][0]))}`, word: "last week" };
    }
    return { start, end: last, label: `This week · ${shortDay(dkey(pts[start + 1][0]))} – ${shortDay(dkey(pts[last][0]))}`, word: "this week" };
  }

  // Change of a series between two dates (uses each series' own closest closes).
  function changeBetween(series, fromKey, toKey, points = false) {
    const p = series.points;
    let a = null, b = null;
    for (const [t, c] of p) { const k = dkey(t); if (k <= fromKey) a = c; if (k <= toKey) b = c; }
    if (a == null || b == null) return null;
    return points ? b - a : (b / a - 1) * 100;
  }

  function build({ series, events = [], news = [], period = "week" }) {
    const by = Object.fromEntries(series.map((s) => [s.symbol, s]));
    const sp = by["^GSPC"];
    if (!sp || sp.points.length < 3) return null;
    const w = periodWindow(sp, period);
    const word = period === "day" ? "in the last session" : period === "month" ? "over the past month" : (w.word || "this week");
    const fromKey = dkey(sp.points[w.start][0]);
    const toKey = dkey(sp.points[w.end][0]);
    const sessionKeys = sp.points.slice(w.start + 1, w.end + 1).map(([t]) => dkey(t));

    const chg = (sym, pts = false) => (by[sym] ? changeBetween(by[sym], fromKey, toKey, pts) : null);
    const level = (sym) => by[sym]?.points.at(-1)?.[1];

    const spx = chg("^GSPC"), tsx = chg("^GSPTSE"), ndq = chg("^IXIC"), dow = chg("^DJI"), rut = chg("^RUT");
    const down = spx < 0;

    // Sectors
    const sectors = series.filter((s) => s.group === "sector").map((s) => ({ symbol: s.symbol, name: s.name, change: chg(s.symbol) }))
      .filter((s) => s.change != null).sort((a, b) => b.change - a.change);
    const avg = (list) => { const v = list.map((s) => chg(s)).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    const defAvg = avg(DEFENSIVE), riskAvg = avg(RISK_ON);

    // Daily moves
    const days = sessionKeys.map((k) => {
      const prevIdx = sp.points.findIndex(([t]) => dkey(t) === k) - 1;
      const prevKey = prevIdx >= 0 ? dkey(sp.points[prevIdx][0]) : k;
      const evs = events.filter((e) => e.time && dkey(e.time) === k && e.impact === "High" && (e.country === "USD" || e.country === "CAD"));
      return { key: k, spx: changeBetween(sp, prevKey, k), tsx: by["^GSPTSE"] ? changeBetween(by["^GSPTSE"], prevKey, k) : null, events: evs };
    });
    const worst = [...days].sort((a, b) => a.spx - b.spx)[0];
    const best = [...days].sort((a, b) => b.spx - a.spx)[0];

    // Headline
    const headline = `The S&P 500 ${move("", spx)} ${word}${Math.abs(spx) >= .3 ? ` (${pct(spx)})` : ""}`
      + (tsx != null ? `, while the TSX ${move("", tsx)}${Math.abs(tsx) >= .3 ? ` (${pct(tsx)})` : ""}` : "") + ".";

    const paras = [];
    const bullets = [];

    // Breadth
    const idxBits = [];
    if (ndq != null) idxBits.push(`the tech-heavy Nasdaq ${pct(ndq, 2)}`);
    if (dow != null) idxBits.push(`the Dow ${pct(dow, 2)}`);
    if (rut != null) idxBits.push(`small caps (Russell 2000) ${pct(rut, 2)}`);
    if (idxBits.length) paras.push(`Elsewhere, ${idxBits.join(", ")}.`);

    if (sectors.length >= 4) {
      const top = sectors.slice(0, 2), bot = sectors.slice(-2).reverse();
      let s = down
        ? `Losses were led by ${bot.map((x) => `${x.name} (${pct(x.change)})`).join(" and ")}`
        : `Gains were led by ${top.map((x) => `${x.name} (${pct(x.change)})`).join(" and ")}`;
      s += down
        ? `, while ${top[0].name} held up best (${pct(top[0].change)}).`
        : `, while ${bot[0].name} lagged (${pct(bot[0].change)}).`;
      if (defAvg != null && riskAvg != null) {
        if (defAvg - riskAvg > .8) s += " Defensive sectors beat growth and cyclical ones, a classic sign of investors turning cautious (\"risk-off\").";
        else if (riskAvg - defAvg > .8) s += " Growth and cyclical sectors beat defensive ones, a sign investors were willing to take on risk (\"risk-on\").";
      }
      paras.push(s);
    }

    // Drivers
    const tnx = chg("^TNX", true), tnxLvl = level("^TNX");
    if (tnx != null && Math.abs(tnx) >= .07) {
      const tech = chg("XLK");
      bullets.push(tnx > 0
        ? `<b>Bond yields rose.</b> The US 10-year yield climbed ${tnx.toFixed(2)} pts to ${tnxLvl?.toFixed(2)}%. Higher yields make future profits worth less today and raise borrowing costs, which usually weighs on stocks${tech != null && tech < spx ? ", especially tech (" + pct(tech) + ")" : ""}.`
        : `<b>Bond yields fell.</b> The US 10-year yield dropped ${Math.abs(tnx).toFixed(2)} pts to ${tnxLvl?.toFixed(2)}%, which usually supports stock valuations${down ? ", but it wasn't enough to offset other pressures" : ""}.`);
    }
    const vix = chg("^VIX"), vixLvl = level("^VIX");
    if (vix != null && Math.abs(vix) >= 10) {
      bullets.push(vix > 0
        ? `<b>Fear picked up.</b> The VIX volatility index jumped ${apct(vix, 0)} to ${vixLvl?.toFixed(1)}${vixLvl > 20 ? ", above the 20 level traders treat as elevated" : ""}.`
        : `<b>Markets calmed.</b> The VIX volatility index fell ${apct(vix, 0)} to ${vixLvl?.toFixed(1)}.`);
    }
    const oil = chg("CL=F"), energy = chg("XLE");
    if (oil != null && Math.abs(oil) >= 3) {
      bullets.push(`<b>Oil ${oil > 0 ? "rallied" : "slid"} ${apct(oil)}.</b> Energy stocks ${energy != null ? `moved ${pct(energy)}` : "followed"}; this matters a lot for the TSX, where energy is one of the biggest sectors.`);
    }
    const dxy = chg("DX-Y.NYB");
    if (dxy != null && Math.abs(dxy) >= 1) {
      bullets.push(`<b>The US dollar ${dxy > 0 ? "strengthened" : "weakened"} ${apct(dxy)}.</b> ${dxy > 0 ? "A stronger dollar can hurt US multinationals' overseas earnings and commodity prices." : "A weaker dollar tends to help commodities and US companies that sell abroad."}`);
    }
    const cad = chg("USDCAD=X");
    if (cad != null && Math.abs(cad) >= .7) {
      bullets.push(`<b>The Canadian dollar ${cad > 0 ? "weakened" : "strengthened"}</b> (USD/CAD ${pct(cad)}). ${cad > 0 ? "That boosts the CAD value of your US holdings." : "That trims the CAD value of your US holdings."}`);
    }
    const gold = chg("GC=F");
    if (gold != null && Math.abs(gold) >= 3) bullets.push(`<b>Gold ${gold > 0 ? "climbed" : "dropped"} ${apct(gold)}</b>${gold > 0 && down ? ", as investors sought safety" : ""}.`);

    // Scheduled events
    const pastEvents = events.filter((e) => e.time && e.time <= Date.now() && sessionKeys.includes(dkey(e.time)) && e.impact === "High" && (e.country === "USD" || e.country === "CAD"));
    if (period !== "month" && pastEvents.length) {
      const names = [...new Set(pastEvents.map((e) => `${e.country === "CAD" ? "Canada " : ""}${e.title} (${dayName(dkey(e.time)).slice(0, 3)})`))].slice(0, 6);
      bullets.push(`<b>Scheduled catalysts:</b> ${esc(names.join(", "))}.`);
    }
    if (days.length > 1 && worst && worst.spx < -.5) {
      const ev = worst.events.map((e) => (e.country === "CAD" ? "Canada " : "") + e.title);
      bullets.push(`<b>The biggest drop came on ${dayName(worst.key)}</b> (S&P 500 ${pct(worst.spx)})${ev.length ? `, the day of ${esc([...new Set(ev)].slice(0, 3).join(", "))}` : ", with no major scheduled US or Canadian release that day, which points to headlines or positioning instead"}.`);
    }
    if (days.length > 1 && best && best.spx > .7 && !down) {
      const ev = best.events.map((e) => e.title);
      bullets.push(`<b>The best day was ${dayName(best.key)}</b> (${pct(best.spx)})${ev.length ? `, alongside ${esc([...new Set(ev)].slice(0, 3).join(", "))}` : ""}.`);
    }

    // News themes
    const fromTime = sp.points[w.start][0];
    const periodNews = news.filter((n) => n.time && n.time >= fromTime - 86400000);
    const counts = THEMES.map(([name, re]) => [name, periodNews.filter((n) => re.test(n.title)).length]).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]);
    if (counts.length) bullets.push(`<b>What the news focused on:</b> ${counts.slice(0, 3).map(([n]) => n).join(", ")}.`);

    if (!bullets.length) bullets.push("No single driver stood out: rates, oil, the dollar and volatility were all fairly steady, and no major US or Canadian data was released. Moves like this are often down to company-specific news and normal day-to-day noise.");

    const narrative = paras.map((p) => `<p>${p}</p>`).join("") + `<ul>${bullets.map((b) => `<li>${b}</li>`).join("")}</ul>`;

    const teaser = headline + " " + (bullets[0] || "").replace(/<[^>]+>/g, "");

    const relevantNews = periodNews.filter((n) => THEMES.some(([, re]) => re.test(n.title))).slice(0, 10);

    return {
      label: w.label, headline, narrative, teaser,
      indices: ["^GSPC", "^GSPTSE", "^IXIC", "^DJI", "^RUT"].filter((s) => by[s]).map((s) => ({ symbol: s, name: by[s].name, change: chg(s), level: level(s) })),
      macro: ["^TNX", "^VIX", "CL=F", "GC=F", "DX-Y.NYB", "USDCAD=X", "BTC-USD"].filter((s) => by[s]).map((s) => ({ symbol: s, name: by[s].name, change: s === "^TNX" ? chg(s, true) : chg(s), points: s === "^TNX", level: level(s) })),
      sectors,
      days,
      news: relevantNews.length ? relevantNews : periodNews.slice(0, 10),
      chart: { fromKey, toKey, start: w.start, end: w.end },
    };
  }

  window.Recap = { build, dkey };
})();
