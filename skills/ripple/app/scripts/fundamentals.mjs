// Filing-based risk and valuation inputs from SEC XBRL (data.sec.gov companyfacts), trailing twelve
// months (TTM = last fiscal year + current year-to-date - prior year-to-date). US filers only.
// Prints JSON; every value carries the filing it came from. Missing tags give null, never a guess.
// Usage: node scripts/fundamentals.mjs <TICKER>
const TICKER = (process.argv[2] || '').toUpperCase();
if (!/^[A-Z0-9.-]{1,10}$/.test(TICKER)) { console.error('usage: fundamentals.mjs <TICKER>'); process.exit(1); }
// SEC asks for a contact in the User-Agent and can refuse requests without one (same setting as research.mjs)
const UA = { 'User-Agent': process.env.RIPPLE_SEC_UA || 'ripple-map/1.0 research@example.com', Accept: 'application/json' };
async function get(url) {
  for (let k = 0; k < 3; k++) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
    try { const r = await fetch(url, { headers: UA, signal: ctl.signal }); if (r.ok) return r.json(); if (r.status === 404) break; }
    catch {} finally { clearTimeout(t); }
    await new Promise(r => setTimeout(r, 1200 * (k + 1)));   // SEC asks for <= 10 requests/second
  }
  throw new Error(`fetch failed: ${url}`);
}
const tickers = await get('https://www.sec.gov/files/company_tickers.json');
const row = Object.values(tickers).find(r => r.ticker.toUpperCase() === TICKER);
if (!row) { console.log(JSON.stringify({ ticker: TICKER, error: 'not an SEC filer (no CIK); use other sources' })); process.exit(0); }
const cik = String(row.cik_str).padStart(10, '0');
const facts = (await get(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`)).facts['us-gaap'] || {};

const days = r => (r.start ? (Date.parse(r.end) - Date.parse(r.start)) / 864e5 : 0);
function series(...tags) {                       // of the candidate tags, the one with the most recent data
  let best = null;                               // (companies switch tags over the years; the first tag that
  for (const t of tags) {                        //  merely exists can be years stale)
    const u = facts[t]?.units; if (!u) continue;
    const rows = (u.USD || u.shares || Object.values(u)[0]).filter(r => /^10-[QK]/.test(r.form));
    if (!rows.length) continue;
    const latest = rows.reduce((m, r) => (r.end > m ? r.end : m), '');
    if (!best || latest > best.latest) best = { tag: t, rows, latest };
  }
  return best;
}
function latestInstant(...tags) {                // balance-sheet item at the latest date (+ one year earlier)
  const s = series(...tags); if (!s) return null;
  const pts = s.rows.filter(r => !r.start).sort((a, b) => a.end.localeCompare(b.end));
  const last = pts[pts.length - 1]; if (!last) return null;
  const yearAgo = pts.filter(r => Math.abs(Date.parse(last.end) - Date.parse(r.end) - 365 * 864e5) < 20 * 864e5).pop();
  return { tag: s.tag, value: last.val, end: last.end, form: last.form, filed: last.filed, yearAgo: yearAgo?.val ?? null };
}
function ttm(...tags) {                          // flow item over the trailing twelve months
  const s = series(...tags); if (!s) return null;
  const rows = s.rows.filter(r => r.start).sort((a, b) => a.end.localeCompare(b.end) || days(b) - days(a));
  const last = rows[rows.length - 1]; if (!last) return null;
  const cur = rows.filter(r => r.end === last.end).sort((a, b) => days(b) - days(a))[0];     // longest = year-to-date
  const d = days(cur);
  if (d > 350) return { tag: s.tag, value: cur.val, end: cur.end, basis: 'fiscal year', filed: cur.filed };
  const fy = rows.filter(r => days(r) > 350 && Math.abs(Date.parse(cur.start) - Date.parse(r.end) - 864e5) < 5 * 864e5).pop();
  const prior = rows.filter(r => Math.abs(days(r) - d) < 10 && Math.abs(Date.parse(cur.end) - Date.parse(r.end) - 365 * 864e5) < 20 * 864e5).pop();
  if (!fy || !prior) return { tag: s.tag, value: null, end: cur.end, basis: 'missing prior periods' };
  return { tag: s.tag, value: fy.val + cur.val - prior.val, end: cur.end, basis: `TTM to ${cur.end}`, filed: cur.filed };
}
function quarterPair(...tags) {                  // latest 3-month value and the same quarter a year earlier
  const s = series(...tags); if (!s) return null;
  const q = s.rows.filter(r => r.start && Math.abs(days(r) - 91) < 10).sort((a, b) => a.end.localeCompare(b.end));
  const last = q[q.length - 1]; if (!last) return null;
  const ago = q.filter(r => Math.abs(Date.parse(last.end) - Date.parse(r.end) - 365 * 864e5) < 20 * 864e5).pop();
  return { tag: s.tag, value: last.val, end: last.end, yearAgo: ago?.val ?? null };
}
const v = x => x?.value ?? null;
const revenue = ttm('RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet');
const netIncome = ttm('NetIncomeLoss');
const cfo = ttm('NetCashProvidedByUsedInOperatingActivities');
const capex = ttm('PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets', 'PaymentsToAcquirePropertyPlantAndEquipmentAndIntangibleAssets', 'PaymentsForProceedsFromProductiveAssets');
const sbc = ttm('ShareBasedCompensation', 'AllocatedShareBasedCompensationExpense');
const ebit = ttm('OperatingIncomeLoss');
const da = ttm('DepreciationDepletionAndAmortization', 'DepreciationAndAmortization', 'Depreciation');
const interest = ttm('InterestExpense', 'InterestExpenseNonoperating', 'InterestExpenseDebt');
const assets = latestInstant('Assets');
// a balance-sheet tag the company stopped filing (its last value over a year older than the latest balance sheet) is stale, not current
const fresh = x => (x && assets && Date.parse(assets.end) - Date.parse(x.end) > 400 * 864e5 ? null : x);
const cash = fresh(latestInstant('CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'));
const sti = fresh(latestInstant('ShortTermInvestments', 'AvailableForSaleSecuritiesDebtSecuritiesCurrent', 'MarketableSecuritiesCurrent'));
// long-term marketable debt securities count as cash-like; LongTermInvestments can hold equity stakes, so it doesn't
const lti = fresh(latestInstant('AvailableForSaleSecuritiesDebtSecuritiesNoncurrent', 'MarketableSecuritiesNoncurrent'));
const debtLT = fresh(latestInstant('LongTermDebtNoncurrent', 'LongTermDebt', 'LongTermNotesPayable', 'ConvertibleNotesPayable'));
const debtST = fresh(latestInstant('LongTermDebtCurrent', 'DebtCurrent', 'ShortTermBorrowings'));
const dilShares = quarterPair('WeightedAverageNumberOfDilutedSharesOutstanding');

// LongTermDebt already includes the current portion, so when that is the tag found only short-term borrowings are added
const stb = fresh(latestInstant('ShortTermBorrowings'));
const debt = debtLT?.tag === 'LongTermDebt' ? (v(debtLT) || 0) + (v(stb) || 0) : (v(debtLT) || 0) + (v(debtST) || 0);
const liquid = (v(cash) || 0) + (v(sti) || 0) + (v(lti) || 0);
const ebitda = v(ebit) != null && v(da) != null ? v(ebit) + v(da) : null;
const fcf = v(cfo) != null && v(capex) != null ? v(cfo) - v(capex) : null;
const r = (x, d = 4) => (x == null || !isFinite(x) ? null : Number(x.toFixed(d)));
const avgAssets = assets?.yearAgo ? (assets.value + assets.yearAgo) / 2 : assets?.value;
const out = {
  ticker: TICKER, cik, asOf: revenue?.end || assets?.end,
  source: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=10-&dateb=&owner=include&count=40`,
  ttm: { revenue: v(revenue), netIncome: v(netIncome), operatingCashFlow: v(cfo), capex: v(capex), stockPay: v(sbc), ebit: v(ebit), ebitda, interestExpense: v(interest), freeCashFlow: fcf, fcfAfterStockPay: fcf != null && v(sbc) != null ? fcf - v(sbc) : null },
  balance: { asOf: assets?.end, totalAssets: v(assets), cashAndInvestments: liquid, debt, netDebt: debt - liquid },
  metrics: {
    accrualsRatio: r(v(netIncome) != null && v(cfo) != null && avgAssets ? (v(netIncome) - v(cfo)) / avgAssets : null),
    stockPayToRevenue: r(v(sbc) != null && v(revenue) ? v(sbc) / v(revenue) : null),
    shareCountChange1y: r(dilShares?.yearAgo ? dilShares.value / dilShares.yearAgo - 1 : null),
    netDebtToEbitda: debt > 0 && ebitda > 0 ? r((debt - liquid) / ebitda, 2) : null,
    interestCover: v(interest) > 0 && v(ebit) != null ? r(v(ebit) / v(interest), 1) : null,
    cashRunwayMonths: fcf != null && fcf < 0 ? r(liquid / (-fcf / 12), 1) : null,
  },
  notMeaningful: [
    ...(debt <= 0 ? ['Net debt / EBITDA (no debt)', 'Interest cover (no debt)'] : []),
    ...(fcf != null && fcf >= 0 ? ['Cash runway (free cash flow positive)'] : []),
  ],
};
console.log(JSON.stringify(out, null, 2));
