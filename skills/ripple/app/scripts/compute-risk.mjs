// Price-based risk metrics computed from daily prices (Yahoo chart feed) and the 3-month T-bill
// (FRED DTB3). Prints JSON; the metrics agent picks from it. No numbers are guessed: if a series is
// too short for a metric, that metric is reported as null with the reason.
// Usage: node scripts/compute-risk.mjs <TICKER> [BENCHMARK=SPY]
const [,, TICKER, BENCH = 'SPY'] = process.argv;
if (!TICKER || !/^[A-Z0-9.^-]{1,12}$/i.test(TICKER) || !/^[A-Z0-9.^-]{1,12}$/i.test(BENCH)) {
  console.error('usage: compute-risk.mjs <TICKER> [BENCHMARK]'); process.exit(1);
}
const UA = { 'User-Agent': 'Mozilla/5.0 (ripple-map)' };
async function get(url, asJson = true) {
  for (let k = 0; k < 3; k++) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 15000);
    try { const r = await fetch(url, { headers: UA, signal: ctl.signal }); if (r.ok) return asJson ? r.json() : r.text(); }
    catch {} finally { clearTimeout(t); }
    await new Promise(r => setTimeout(r, 1500 * (k + 1)));
  }
  throw new Error(`fetch failed: ${url}`);
}
async function closes(sym) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=5y&interval=1d&includeAdjustedClose=true`;
  const r = (await get(url)).chart.result[0];
  const adj = r.indicators.adjclose?.[0]?.adjclose || r.indicators.quote[0].close;
  const out = [];
  r.timestamp.forEach((ts, i) => { if (adj[i] != null && adj[i] > 0) out.push({ d: new Date(ts * 1000).toISOString().slice(0, 10), c: adj[i] }); });
  return out;
}
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const rets = px => px.slice(1).map((p, i) => p.c / px[i].c - 1);
const pct = (x, d = 1) => (x == null ? null : `${(x * 100).toFixed(d)}%`);

const [px, bx, rfCsv] = await Promise.all([closes(TICKER), closes(BENCH), get('https://fred.stlouisfed.org/graph/fredgraph.csv?id=DTB3', false)]);
const rfRow = rfCsv.trim().split('\n').reverse().find(l => /^\d{4}-\d\d-\d\d,\d/.test(l));
const rf = Number(rfRow.split(',')[1]) / 100;           // annual, e.g. 0.0418
const last = px[px.length - 1];
const y1 = px.filter(p => p.d >= new Date(Date.parse(last.d) - 365 * 864e5).toISOString().slice(0, 10));
const r1 = rets(y1);
const enough = r1.length >= 200;
const vol = enough ? sd(r1) * Math.sqrt(252) : null;
const annRet = enough ? (y1[y1.length - 1].c / y1[0].c) ** (252 / r1.length) - 1 : null;
const dn = r1.filter(x => x < rf / 252).map(x => x - rf / 252);
const downDev = enough ? Math.sqrt(dn.reduce((s, x) => s + x * x, 0) / r1.length) * Math.sqrt(252) : null;
function maxDD(series) { let peak = series[0].c, dd = 0, pd = series[0].d, from = '', to = '';
  for (const p of series) { if (p.c > peak) { peak = p.c; pd = p.d; } const x = p.c / peak - 1; if (x < dd) { dd = x; from = pd; to = p.d; } } return { dd, from, to }; }
const dd1 = maxDD(y1), ddAll = maxDD(px);
const sorted = [...r1].sort((a, b) => a - b), k = Math.max(1, Math.floor(0.05 * sorted.length));
const var95 = enough ? -sorted[k - 1] : null, cvar95 = enough ? -mean(sorted.slice(0, k)) : null;
// beta: 2 years of weekly returns (less noise than daily), aligned on common Friday-close dates
function weekly(series) { const m = new Map(); for (const p of series) { const d = new Date(p.d); const wk = new Date(d - ((d.getUTCDay() + 2) % 7) * 864e5).toISOString().slice(0, 10); m.set(wk, p.c); } return m; }
const wa = weekly(px.filter(p => p.d >= new Date(Date.parse(last.d) - 730 * 864e5).toISOString().slice(0, 10))), wb = weekly(bx);
const keys = [...wa.keys()].filter(x => wb.has(x)).sort();
const ra = [], rb = []; for (let i = 1; i < keys.length; i++) { ra.push(wa.get(keys[i]) / wa.get(keys[i - 1]) - 1); rb.push(wb.get(keys[i]) / wb.get(keys[i - 1]) - 1); }
let beta = null; if (ra.length >= 52) { const ma = mean(ra), mb = mean(rb); let cov = 0, vb = 0; for (let i = 0; i < ra.length; i++) { cov += (ra[i] - ma) * (rb[i] - mb); vb += (rb[i] - mb) ** 2; } beta = cov / vb; }
const out = {
  ticker: TICKER.toUpperCase(), benchmark: BENCH.toUpperCase(), asOf: last.d, lastClose: Number(last.c.toFixed(2)),
  riskFree3m: pct(rf, 2), history: { firstDate: px[0].d, tradingDays1y: r1.length, weeksForBeta: ra.length },
  metrics: {
    volatility1y: { value: pct(vol), raw: vol },
    maxDrawdown1y: { value: pct(dd1.dd), raw: dd1.dd, from: dd1.from, to: dd1.to },
    maxDrawdownSinceListing: { value: pct(ddAll.dd), raw: ddAll.dd, from: ddAll.from, to: ddAll.to },
    sharpe1y: { value: enough ? ((annRet - rf) / vol).toFixed(2) : null, raw: enough ? (annRet - rf) / vol : null, annualReturn: pct(annRet) },
    sortino1y: { value: enough ? ((annRet - rf) / downDev).toFixed(2) : null, raw: enough ? (annRet - rf) / downDev : null },
    beta2yWeekly: { value: beta == null ? null : beta.toFixed(2), raw: beta },
    var95_1d: { value: pct(var95), raw: var95, note: '1-day loss exceeded on 5% of days (historical)' },
    cvar95_1d: { value: pct(cvar95), raw: cvar95, note: 'average loss on those worst 5% of days' },
    change52w: { value: pct(y1[y1.length - 1].c / y1[0].c - 1), raw: y1[y1.length - 1].c / y1[0].c - 1 },
  },
  sources: [`https://finance.yahoo.com/quote/${TICKER.toUpperCase()}/history/`, 'https://fred.stlouisfed.org/series/DTB3'],
};
console.log(JSON.stringify(out, null, 2));
