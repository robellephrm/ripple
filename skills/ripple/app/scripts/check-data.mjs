// Validate everything the app reads. Prints problems; exit 1 if any are blocking.
// Usage: node scripts/check-data.mjs [--lanes]   (--lanes also checks data/lanes/*.json before merge)
import fs from 'node:fs';
import path from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const read = f => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
const errs = []; const warns = [];
const E = m => errs.push(m); const W = m => warns.push(m);

// Allowed metrics = the library in agents/metrics-library.md (label -> family). 6 risk + 6 valuation per company.
const RISK = { 'Beta (2Y weekly)': 'market', 'Volatility (1Y)': 'volatility', 'Max drawdown (1Y)': 'downside', 'CVaR 95% (1-day)': 'tail',
  'Net debt / EBITDA': 'leverage', 'Interest cover': 'leverage', "Altman Z''": 'distress', 'Cash runway': 'solvency',
  'Days to exit (Amihud)': 'liquidity', 'Accruals ratio': 'earnings quality', 'Beneish M-score': 'manipulation',
  'Piotroski F-score': 'fundamental health', 'Stock pay / revenue': 'dilution', 'Share count change (1Y)': 'dilution',
  'Top customer share': 'concentration', 'Days to cover': 'positioning', 'Borrow fee': 'positioning', 'CET1 ratio': 'bank capital' };
const VAL = { 'P/E (forward)': 'earnings', 'P/E (trailing, GAAP)': 'earnings', 'EV / Sales (forward)': 'revenue', 'EV / EBITDA (LTM)': 'operating',
  'FCF yield (after stock pay)': 'cash', 'PEG': 'growth-adjusted', 'Price-implied growth': 'expectations', 'P / Book': 'assets',
  'Shareholder yield': 'income', 'EV / Gross profit': 'gross profit' };
const DIRS = ['positive', 'negative', 'mixed'];
const ROLES = ['partner', 'supplier', 'customer', 'competitor', 'owner', 'regulator', 'channel', 'substitute', 'other', 'center', 'data-source'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const thesis = read('data/thesis.json');
const pids = new Set();
if (!thesis.company?.id || !/^[a-z0-9-]+$/.test(thesis.company.id)) E('thesis.company.id missing or not kebab-case');
if (!thesis.company?.ticker) E('thesis.company.ticker missing');
if (thesis.pillars.length < 1 || thesis.pillars.length > 5) E(`thesis has ${thesis.pillars.length} points (need 1-5, usually the memo's own 2-3)`);
for (const p of thesis.pillars) {
  pids.add(p.id);
  if (!['strong', 'stable', 'weak', 'broken'].includes(p.status)) E(`${p.id}: status "${p.status}" (use strong, stable, weak or broken)`);
  if ((p.title || '').split(/\s+/).length > 3) W(`${p.id}: title "${p.title}" is over 3 words`);
  if ((p.statusReason || '').split(/\s+/).length > 45) W(`${p.id}: statusReason over 45 words; say it in one or two sentences`);
  if (p.type === 'kpi') {
    if (!Array.isArray(p.kpis) || !p.kpis.length) E(`${p.id}: KPI point needs a kpis list`);
    for (const k of p.kpis || []) if (!k.name || !k.latest) E(`${p.id}: each KPI needs name and latest`);
    for (const k of ['short', 'title', 'nextCheck']) if (!p[k]) E(`${p.id}: missing ${k}`);
  } else {
    for (const k of ['short', 'title', 'claim', 'killCriteria', 'nextCheck']) if (!p[k]) E(`${p.id}: missing ${k}`);
    if (!Array.isArray(p.why) || p.why.length < 2) W(`${p.id}: WHY needs 2-3 bullets`);
  }
}
if (thesis.pillars.every(p => p.status === 'strong') && thesis.pillars.length) W('every thesis point is STRONG: re-check the judging step is honest');

const m = read('data/metrics.json');
for (const [group, lib] of [['risk', RISK], ['valuation', VAL]]) {
  const rows = m[group] || [];
  if (rows.length !== 6) E(`${group}: need 6 metrics, got ${rows.length}`);
  const fam = {};
  for (const r of rows) {
    if (!(r.label in lib)) E(`${group}: "${r.label}" is not in the metrics library (agents/metrics-library.md)`);
    const f = lib[r.label]; if (f) (fam[f] = fam[f] || []).push(r);
    if (r.value === undefined || r.value === '' || /^n\/?a$/i.test(String(r.value).trim())) E(`${group}: ${r.label} has no value; pick a metric that applies to this company`);
    if (!r.source) W(`${group}: ${r.label} has no source`);
    if (!r.why) W(`${group}: ${r.label} has no "why" (why it was chosen for this company)`);
    if ((r.read || '').split(/\s+/).length > 8) W(`${group}: ${r.label} read over 8 words`);
  }
  for (const [f, list] of Object.entries(fam)) if (list.length > 1 && !list.slice(1).every(r => /also|second|alongside|plus/i.test(r.why || '')))
    E(`${group}: ${list.map(r => r.label).join(' + ')} repeat the "${f}" family; keep one, or say why both in "why"`);
}
if (!m.price?.value) W('no share price');

function checkLane(f, lane) {
  const ids = new Set((lane.nodes || []).map(n => n.id));
  for (const n of lane.nodes || []) {
    if (!/^[a-z0-9-]+$/.test(n.id || '')) E(`${f}: node id "${n.id}" not kebab-case`);
    if (!ROLES.includes(n.role)) W(`${f}: ${n.id} role "${n.role}"`);
    if (![1, 2, 3].includes(n.tier)) W(`${f}: ${n.id} tier "${n.tier}"`);
  }
  for (const s of lane.signals || []) {
    const tag = `${f}: signal "${(s.headline || '').slice(0, 50)}"`;
    if (!DATE.test(s.date || '')) E(`${tag} bad date`);
    if (!/^https?:\/\//.test(s.url || '')) E(`${tag} bad url`);
    if (!pids.has(s.pillar)) E(`${tag} unknown pillar ${s.pillar}`);
    if (!DIRS.includes(s.direction)) E(`${tag} direction ${s.direction}`);
    if (![1, 2, 3].includes(s.magnitude)) W(`${tag} magnitude ${s.magnitude}`);
    if (!s.evidence) W(`${tag} no evidence quote`);
    if (!ids.has(s.nodeId) && s.nodeId !== thesis.company.id) W(`${tag} nodeId ${s.nodeId} not in this lane's nodes`);
  }
}
if (process.argv.includes('--lanes')) {
  const dir = path.join(root, 'data/lanes');
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter(x => x.endsWith('.json')) : []) {
    try { checkLane(f, JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))); } catch (e) { E(`${f}: invalid JSON (${e.message})`); }
  }
}

const rip = read('data/ripple.json');
if (rip.company?.id !== thesis.company.id) E('ripple.json is stale: re-run the merge');
const briefs = read('data/briefs.json'); const domains = read('data/domains.json');
const noBrief = rip.nodes.filter(n => n.id !== rip.company.id && !n.brief && !briefs[n.id]).map(n => n.id);
const noDomain = rip.nodes.filter(n => !n.domain && !domains[n.id] && n.type === 'company').map(n => n.id);
if (noBrief.length) W(`nodes without a brief: ${noBrief.join(', ')}`);
if (noDomain.length) W(`companies without a domain: ${noDomain.join(', ')}`);
const roles = new Set(rip.nodes.map(n => n.role));
if (!roles.has('supplier')) W('no supplier nodes: the map must include the company\'s own key suppliers');
if (!roles.has('customer') && !roles.has('channel') && !roles.has('partner')) W('no customer/channel nodes: the map must include key buyers');
const tally = rip.signals.reduce((t, s) => (t[s.direction] = (t[s.direction] || 0) + 1, t), {});
console.log(`${rip.company.name}: ${thesis.pillars.length} thesis points, ${rip.nodes.length} nodes, ${rip.signals.length} signals (${tally.positive || 0}+ ${tally.negative || 0}- ${tally.mixed || 0}~)`);
for (const w of warns) console.log(`  warn: ${w}`);
for (const e of errs) console.log(`  ERROR: ${e}`);
if (errs.length) process.exit(1);
console.log(errs.length || warns.length ? `${warns.length} warnings` : 'clean');
