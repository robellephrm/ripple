# Metrics library

Pick **6 risk** and **6 valuation** metrics per company from these lists. Rules:

1. Compute or source every candidate you can, then drop any that is undefined or listed as
   "not meaningful" for this company. Never show "n/a": pick another metric instead.
2. **One per family.** A second from the same family needs a written reason in `why`
   (e.g. net debt/EBITDA plus coverage when debt is the main risk).
3. Risk: always one market metric (beta or volatility) and one downside metric (drawdown or CVaR).
   Fill the rest with the families where this company is most extreme or most exposed.
4. Short positions: a positioning metric (days to cover, short interest, borrow fee) must be in.
5. Each `read` is under 6 words, `{plain verdict}`. Each `why` is under 12 words: why this
   metric was chosen for this company.

Evidence notes are from the research pass (Nov 2026). Beta, distress scores and accruals
describe risk; they no longer predict returns well. Days to cover, dilution and the M-score have
the strongest predictive evidence.

## Risk

| Label | Family | How | Meaningful when | Not meaningful when |
|---|---|---|---|---|
| Beta (2Y weekly) | market | `compute-risk.mjs` | 1y+ liquid history | IPO under 1 year |
| Volatility (1Y) | volatility | `compute-risk.mjs` | always | pending cash takeover |
| Max drawdown (1Y) | downside | `compute-risk.mjs` | always | |
| CVaR 95% (1-day) | tail | `compute-risk.mjs` | fat tails, event names | roughly normal returns (repeats volatility) |
| Net debt / EBITDA | leverage | `fundamentals.mjs` | real debt, EBITDA > 0 | net cash, EBITDA <= 0, banks |
| Interest cover | leverage | `fundamentals.mjs` | debt-funded, cyclical | no debt, EBIT < 0, banks |
| Altman Z'' | distress | filings | non-financials with debt | banks, mega-caps, asset-light software |
| Cash runway | solvency | `fundamentals.mjs` | free cash flow < 0 | free cash flow > 0 |
| Days to exit (Amihud) | liquidity | prices + volume | small / micro caps | mega-caps |
| Accruals ratio | earnings quality | `fundamentals.mjs` | non-financials | banks, big acquisition years |
| Beneish M-score | manipulation | filings, 2 years | short screens, aggressive revenue | hypergrowth (flags growth itself), banks |
| Piotroski F-score | fundamental health | filings | value / small caps | growth stocks, banks; overlaps leverage |
| Stock pay / revenue | dilution | `fundamentals.mjs` | tech, biotech, loss-makers | |
| Share count change (1Y) | dilution | `fundamentals.mjs` | issuers, SPACs | buybacks fully offset |
| Top customer share | concentration | 10-Q / 10-K concentration table | B2B suppliers, semis | consumer, undisclosed |
| Days to cover | positioning | FINRA / Nasdaq short interest | any short; crowding check for longs | |
| Borrow fee | positioning | broker / iBorrowDesk | shorts only | longs |
| CET1 ratio | bank capital | call reports | banks | non-banks |

Not in the six (too noisy for one stock; per Lo 2002 a 1-year Sharpe has a standard error near 1):
Sharpe, Sortino, Calmar. Mention them in a signal only as context.

## Valuation

| Label | Family | How | Meaningful when | Not meaningful when |
|---|---|---|---|---|
| P/E (forward) | earnings | stockanalysis | positive forward EPS | loss-makers |
| P/E (trailing, GAAP) | earnings | stockanalysis / filings | stable earners | loss-makers, big one-offs |
| EV / Sales (forward) | revenue | EV from filings + consensus revenue | growth, low margins | |
| EV / EBITDA (LTM) | operating | stockanalysis | positive EBITDA | banks, EBITDA <= 0 |
| FCF yield (after stock pay) | cash | `fundamentals.mjs` + market cap | always for tech; stock pay is a real cost | |
| PEG | growth-adjusted | stockanalysis | positive growth and EPS | negative or tiny growth |
| Price-implied growth | expectations | reverse DCF (memo or computed) | when a reverse DCF exists | |
| P / Book | assets | stockanalysis | banks, insurers, asset-heavy | asset-light software |
| Shareholder yield | income | dividends + net buybacks | mature payers | non-payers that issue stock |
| EV / Gross profit | gross profit | filings | software, mixed-margin businesses | |
