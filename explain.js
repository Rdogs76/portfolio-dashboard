// Plain-English explanations for economic events and financial ratios.
(function () {
  // Matched in order against the event title (case-insensitive). First match wins.
  const EVENTS = [
    [/fomc|federal funds rate|fed (chair|interest)|powell|fed .*speaks/i, "Federal Reserve",
      "The Fed sets US short-term interest rates. A higher-than-expected rate path (hawkish) usually pushes stocks down and yields up, hitting growth/tech stocks hardest. A softer tone (dovish) usually lifts stocks."],
    [/boc|bank of canada|overnight rate|macklem/i, "Bank of Canada",
      "The Bank of Canada sets Canadian interest rates. Surprises move the Canadian dollar, bank stocks and rate-sensitive TSX sectors like utilities and real estate."],
    [/core cpi|cpi|consumer price|inflation/i, "Inflation (CPI)",
      "Measures how fast consumer prices are rising. Hotter-than-forecast inflation raises the odds of higher interest rates, which typically sends stocks lower and bond yields higher."],
    [/pce/i, "Inflation (PCE)",
      "The Fed's preferred inflation gauge. A higher reading than forecast signals rates may stay high, usually a headwind for stocks."],
    [/ppi|producer price/i, "Producer prices",
      "Inflation at the wholesale level. It often leads consumer inflation, so a hot number can spook markets ahead of CPI."],
    [/non-farm|nonfarm|nfp/i, "Jobs report",
      "Number of US jobs added last month, the biggest scheduled release most months. Very strong jobs can mean higher rates (bad for stocks); very weak jobs raise recession fears. Markets prefer 'just right'."],
    [/employment change/i, "Jobs report",
      "Number of jobs added last month. For Canada (CAD) this is the main labour report and moves the loonie and TSX banks."],
    [/unemployment rate/i, "Unemployment",
      "Share of the workforce without a job. A sudden jump signals a slowing economy; a very low rate can keep wage inflation and interest rates high."],
    [/jobless claims|unemployment claims/i, "Jobless claims",
      "Weekly count of new US unemployment filings. A rising trend is an early warning of a softening job market."],
    [/jolts|job openings/i, "Job openings",
      "How many jobs employers are trying to fill. Fewer openings point to a cooling labour market and less wage pressure."],
    [/adp/i, "ADP payrolls",
      "Private-sector jobs estimate released two days before the official jobs report; traders use it as a preview."],
    [/average hourly earnings|wage/i, "Wages",
      "Growth in pay. Fast wage growth can feed inflation and keep rates high."],
    [/gdp/i, "GDP",
      "Total economic output. Weak growth raises recession fears; very strong growth can mean rates stay higher for longer."],
    [/retail sales/i, "Retail sales",
      "How much consumers spent at stores. Consumer spending is the largest part of the economy, so a miss can weigh on retailers and the broader market."],
    [/ism|pmi|purchasing managers/i, "Business activity (PMI)",
      "A survey of purchasing managers. Above 50 means activity is expanding, below 50 means it is shrinking. Watch the change versus forecast."],
    [/consumer confidence|consumer sentiment|michigan/i, "Consumer sentiment",
      "How upbeat households feel. Falling confidence can foreshadow weaker spending."],
    [/crude oil inventories|eia|oil inventor/i, "Oil inventories",
      "Weekly change in US crude stockpiles. A bigger-than-expected build tends to push oil prices down, which affects energy stocks (a large part of the TSX)."],
    [/housing starts|building permits|home sales|pending home/i, "Housing",
      "Activity in the housing market, which is very sensitive to mortgage rates."],
    [/durable goods/i, "Durable goods orders",
      "Orders for long-lasting goods like machines and appliances; a read on business investment."],
    [/trade balance/i, "Trade balance",
      "Exports minus imports. Big swings can move the currency."],
    [/treasury|bond auction|note auction/i, "Bond auction",
      "Government debt sale. Weak demand can push yields up, which can pressure stocks."],
    [/minutes/i, "Meeting minutes",
      "Detailed notes from a past central bank meeting. Markets look for hints about future rate moves."],
    [/speaks|testifies|press conference/i, "Central bank speech",
      "Officials' comments can shift expectations for interest rates. Unscripted remarks sometimes move markets sharply."],
    [/holiday/i, "Market holiday",
      "Banks or exchanges are closed in this country. Expect lighter trading."],
  ];

  const COUNTRY = {
    USD: "United States", CAD: "Canada", EUR: "Euro area", GBP: "United Kingdom", JPY: "Japan",
    CNY: "China", AUD: "Australia", NZD: "New Zealand", CHF: "Switzerland", ALL: "Global",
  };

  function explainEvent(title) {
    for (const [re, name, text] of EVENTS) if (re.test(title)) return { name, text };
    return null;
  }

  const RATIOS = {
    trailingPE: "Price ÷ last 12 months of earnings per share. Higher means investors pay more for each dollar of profit.",
    forwardPE: "Price ÷ next 12 months of expected earnings per share.",
    peg: "P/E divided by expected earnings growth. Around 1 is often called fairly valued for its growth.",
    priceToBook: "Price ÷ book value (assets minus debts) per share. Common for banks and insurers.",
    priceToSales: "Market value ÷ the last 12 months of revenue. Useful when a company has little profit.",
    evToEbitda: "Enterprise value (market cap + debt − cash) ÷ operating cash earnings. Compares companies with different debt levels.",
    profitMargin: "Share of revenue left as net profit.",
    operatingMargin: "Share of revenue left after running the business, before interest and tax.",
    grossMargin: "Share of revenue left after the direct cost of goods sold.",
    roe: "Return on equity: profit ÷ shareholders' equity. How well the company uses investors' money.",
    roa: "Return on assets: profit ÷ total assets.",
    debtToEquity: "Total debt ÷ shareholders' equity (shown as a percentage). Higher means more borrowing.",
    currentRatio: "Short-term assets ÷ short-term debts. Above 1 means it can cover bills due within a year.",
    quickRatio: "Like the current ratio but excludes inventory; a stricter test of short-term health.",
    revenueGrowth: "Revenue change versus the same quarter a year ago.",
    earningsGrowth: "Earnings change versus the same quarter a year ago.",
    dividendYield: "Annual dividend ÷ share price.",
    payoutRatio: "Share of earnings paid out as dividends. Very high can mean the dividend is at risk.",
    beta: "How much the stock tends to move versus the market. 1 = moves with the market; 1.5 = 50% more volatile.",
    eps: "Earnings per share over the last 12 months.",
    expenseRatio: "Annual fund fee as a share of your investment.",
  };

  window.Explain = { explainEvent, COUNTRY, RATIOS };
})();
