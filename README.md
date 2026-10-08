# Portfolio Dashboard — Setup Guide

One place to see your portfolio, live prices, key ratios, analyst ratings, earnings dates, this week's economic calendar, and a plain-English recap of why the market moved. It runs in your web browser and can be added to your home screen like an app.

## What's inside

| Tab | What it shows |
|---|---|
| **Overview** | Portfolio value, today's and all-time return, allocation donut, market pulse (S&P 500, TSX, Nasdaq, VIX, 10-yr yield, oil, gold, USD/CAD), your biggest movers, key events, upcoming earnings, headlines |
| **Portfolio** | Holdings table with gain/loss, performance chart vs. S&P 500 / TSX / Nasdaq, sector breakdown vs. a benchmark (You vs. S&P 500), and your trade history. Add buys and sells with **Add trade** |
| **Research** | Look up any stock or ETF: price chart, P/E, forward P/E, PEG, P/B, P/S, EV/EBITDA, margins, ROE, debt/equity, growth, dividends, analyst consensus, price targets, rating changes, earnings history, news |
| **Earnings** | Upcoming earnings dates and estimates for your holdings and watchlist |
| **News** | ForexFactory economic calendar for the week (filter by impact and currency, tap an event for what it means) and market headlines |
| **Why it moved** | Recap for the last session, this week, or the past month: index and sector moves, rates, oil, the dollar, the VIX, which scheduled events landed on the down days, and what the news focused on |

## 1. Important warnings

**No guarantee of accuracy.** Prices and fundamentals come from Yahoo Finance (delayed up to 15 minutes) through an unofficial library, and the calendar comes from ForexFactory's public weekly feed. Either source can change or break without notice, and figures can be wrong or missing. The "Why it moved" recap lines up price moves with events and headlines; it shows what coincided with a move, not proof of cause. Nothing here is financial advice. Check important numbers with your broker.

**Your trades live only in this browser.** There is no account or cloud sync. Clearing browser data, removing the app, or switching devices loses them. Use **Settings → Download backup** regularly, and **Restore backup** to move your portfolio to another device. Devices don't sync with each other.

## 2. Put it online (free, about 10 minutes)

The live data needs a small server, so the app is hosted on Vercel (the same service your friend's dashboard uses). You'll need a free GitHub account and a free Vercel account.

1. **Create a GitHub repository.** Sign in at github.com, click **+ → New repository**, name it `portfolio-dashboard`, leave it Public or Private, and click **Create repository**.
2. **Upload the files.** On the new repository page click **uploading an existing file**. Unzip `portfolio-dashboard.zip` on your computer, open the folder, select *everything inside it* (including the `api` and `js` folders) and drag it into the browser. Click **Commit changes**.
3. **Deploy on Vercel.** Go to vercel.com, choose **Continue with GitHub**, then **Add New → Project**. Find `portfolio-dashboard` and click **Import**, then **Deploy**. Leave every setting as it is.
4. **Open your dashboard.** After about a minute Vercel shows your address, something like `portfolio-dashboard-yourname.vercel.app`. Open it. The orange "Demo data" banner should be gone; if it's still there, refresh once.

To change something later, edit or re-upload the file on GitHub. Vercel redeploys automatically.

## 3. Add it to your home screen

**iPhone / iPad (Safari):** open your Vercel address → **Share** → **Add to Home Screen** → **Add**.

**Android (Chrome):** open the address → **⋮** menu → **Add to home screen** or **Install app** → **Install**.

**Windows / Mac / Chromebook (Chrome):** open the address → **⋮** menu → **Install Portfolio Dashboard…** (if you don't see it, look under **Cast, save, and share**). Some versions show an install icon in the address bar instead.

**Not sure which steps apply?** Open the dashboard and tap the **gear icon → Open it like an app**; it shows the steps for the device you're on. In Chrome or Edge on a computer, a download-arrow icon also appears in the top bar to install it in one click.

### Light and dark mode

Tap the moon/sun icon in the top bar (or press **T**) to switch. **Settings → Appearance** lets you pick Match device, Light or Dark. Your choice is remembered on that device.

## 4. Add your trades

1. Tap **Add trade** (Overview or Portfolio tab).
2. Choose **Buy** or **Sell**, type the symbol and press Tab. Canadian listings end in `.TO` (for example `VFV.TO`, `RY.TO`); US ones don't (`AAPL`). The app fills in the currency and shows the latest price; **Use current price** fills it in for you.
3. Enter the date, shares, price per share and any commission, then **Save trade**.

Cost is tracked with the average-cost method (adjusted cost base), the way the CRA expects. Totals show in CAD by default; switch to USD in **Settings**. Want to look around first? Tap **Load sample portfolio**, then delete those trades from **Portfolio → Trades**.

## 5. Good to know

- Prices refresh every minute while the app is open; news and the calendar every 15 minutes. Press **R** or the refresh button any time.
- The economic calendar is ForexFactory's weekly feed. It includes the forecast and previous value but not the actual result, so the recap describes which releases coincided with moves rather than whether they beat expectations.
- Earnings dates can move until a company confirms them.
- ETFs are split into the sectors they hold on the Sectors view, so VFV counts mostly as Technology, Financials and so on.

## Troubleshooting

| Problem | Fix |
|---|---|
| Orange "Demo data" banner after deploying | Make sure the `api` folder and `package.json` were uploaded to GitHub at the top level, not inside another folder. Then redeploy in Vercel. |
| "Couldn't load prices" | Yahoo Finance occasionally blocks requests for a few minutes. Wait and press Refresh. If it lasts days, the `yahoo-finance2` library may need updating: in Vercel, open the project → **Deployments** → **⋯** → **Redeploy** (it installs the latest version). |
| A ticker isn't found | Use Yahoo Finance's format: `.TO` for TSX, `.V` for TSX Venture, `.NE` for NEO. |
| Calendar is empty | ForexFactory limits how often the feed can be read. The app caches it for 30 minutes; try again later. |

## Files

```
index.html, styles.css          the app
js/app.js                       app logic (tabs, portfolio math, charts)
js/recap.js                     "Why it moved" analysis
js/explain.js                   plain-English event and ratio explanations
js/demo.js                      demo data shown before deploying
api/*.js                        server functions Vercel runs for live data
package.json                    tells Vercel which library to install
```
