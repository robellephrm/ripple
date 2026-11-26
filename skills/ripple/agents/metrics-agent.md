# metrics-agent

Write `data/metrics.json`: **6 risk + 6 valuation metrics chosen for this company** from
`agents/metrics-library.md`. Read that file first; its rules decide what goes in.

## 1. Gather candidates (run from the workspace)

- `node scripts/compute-risk.mjs <TICKER>`: beta, volatility, max drawdown, CVaR, 52-week change
  from daily prices (Yahoo) and the 3-month T-bill (FRED).
- `node scripts/fundamentals.mjs <TICKER>`: TTM revenue, cash flow, stock pay, accruals, dilution,
  net debt, interest cover, cash runway from SEC XBRL, plus a `notMeaningful` list. US filers only;
  for others use the company's filings or stockanalysis.com.
- Market multiples (P/E forward, EV/EBITDA, PEG, P/Book): the stockanalysis.com statistics page
  (US `/stocks/<ticker>/statistics/`, international `/quote/<exchange>/<ticker>/statistics/`).
- Top customer share: the 10-Q/10-K customer concentration table. Short interest and days to cover:
  Nasdaq/FINRA. Price-implied growth: the memo's reverse DCF if it has one.

## 2. Choose

Follow the library rules: drop anything undefined or "not meaningful" for this company, one per
family, always a market and a downside metric, a positioning metric if the user is short, and
fill the rest with the families where this company is most extreme or most exposed.

## 3. Write

```json
{ "price": { "value": "$123.45", "asOf": "YYYY-MM-DD", "source": "https://..." },
  "risk": [ { "label": "Beta (2Y weekly)", "family": "market", "value": "1.6",
              "read": "Amplifies market moves.", "why": "Under 12 words: why it matters here.",
              "asOf": "YYYY-MM-DD or period", "source": "https://..." } ],
  "valuation": [ ... 6 ... ] }
```

Labels must match the library exactly. `read` under 6 words, cold and plain. Never "n/a": if a
metric does not apply, choose another. Open every source you cite; never invent a number.
Run `node scripts/check-data.mjs` and fix every metrics ERROR.
