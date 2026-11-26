// Herder merge: scout lanes + verifier results -> data/ripple.json
// Usage: node scripts/herder-merge.mjs data/ripple.json data/verify.json data/lanes/*.json
import fs from 'node:fs';

const [,, outPath, verifyPath, ...lanePaths] = process.argv;
if (!outPath || !lanePaths.length) {
  console.error('usage: herder-merge.mjs <out.json> <verify.json> <lane.json...>');
  process.exit(1);
}
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const base = read(new URL('../data/thesis.json', import.meta.url));
const verify = verifyPath && fs.existsSync(verifyPath) ? read(verifyPath) : {};
const CENTER = base.company.id;
const pillarIds = new Set(base.pillars.map(p => p.id));

const nodes = new Map();
nodes.set(CENTER, {
  id: CENTER, label: base.company.name, type: 'company', role: 'center', tier: 0,
  connectsTo: [], relation: 'Your position', pillars: [...pillarIds],
  summary: base.company.summary || '',
});

const signals = []; const byKey = new Map(); const dropped = []; const badLanes = [];
for (const p of lanePaths) {
  let lane;
  try { lane = read(p); } catch (e) { badLanes.push(`${p}: ${e.message}`); continue; }
  for (const n of lane.nodes || []) {
    if (!n.id || n.id === CENTER) continue;
    if (!/^[a-z0-9-]+$/.test(n.id)) { dropped.push({ url: n.id, why: 'node id is not kebab-case' }); continue; }   // ids become file names and object keys
    const pillars = (n.pillars || []).filter(x => pillarIds.has(x));
    const cur = nodes.get(n.id);
    if (!cur) { nodes.set(n.id, { ...n, tier: n.tier || 3, connectsTo: [...new Set(n.connectsTo || [])], pillars: [...new Set(pillars)] }); continue; }
    cur.tier = Math.min(cur.tier, n.tier || 3);
    cur.connectsTo = [...new Set([...(cur.connectsTo || []), ...(n.connectsTo || [])])];
    cur.pillars = [...new Set([...(cur.pillars || []), ...pillars])];
    if ((n.summary || '').length > (cur.summary || '').length) cur.summary = n.summary;
    // a company's real role (supplier, customer...) beats "data-source"; data-source fields still carry over
    if (cur.role === 'data-source' && n.role && n.role !== 'data-source') { cur.role = n.role; if (n.relation) cur.relation = n.relation; if (n.brief) cur.brief = n.brief; }
    for (const k of ['domain', 'brief', 'health', 'tracks', 'reading', 'cadence', 'leads']) if (n[k] && !cur[k]) cur[k] = n[k];
  }
  for (const s of lane.signals || []) {
    if (!s.nodeId || typeof s.headline !== 'string' || !s.headline.trim() || !pillarIds.has(s.pillar) || !/^\d{4}-\d{2}-\d{2}$/.test(s.date || '') || !/^https?:\/\//.test(s.url || '')) {
      dropped.push({ url: s.url, why: 'malformed (headline/pillar/date/url)' }); continue;
    }
    const v = verify[s.url];
    if (v && v.hardFail) { dropped.push({ url: s.url, why: `verifier: ${v.status}` }); continue; }
    // same node + thesis point + day = one event; scouts disagreeing on direction -> mixed
    const key = `${s.nodeId}|${s.pillar}|${s.date}`;
    const prev = byKey.get(key);
    if (prev) { if (prev.direction !== s.direction) prev.direction = 'mixed'; continue; }
    const headline = v?.unconfirmed && !/\(unconfirmed\)$/.test(s.headline) ? `${s.headline} (unconfirmed)` : s.headline;
    const sig = { ...s, headline, linkCheck: v ? v.status : 'unchecked' };
    byKey.set(key, sig); signals.push(sig);
  }
}

// every link must point at a real node; orphans attach to the center. The tier (1st / 2nd / 3rd order)
// stays the scouts' call, lowest one wins: a line to the center does not make a regulator or a data
// source first order, and the map's 1ST / 2ND ORDER views depend on these staying honest.
for (const n of nodes.values()) {
  if (n.id === CENTER) continue;
  n.connectsTo = (n.connectsTo || []).filter(id => nodes.has(id) && id !== n.id);
  if (!n.connectsTo.length) n.connectsTo = [CENTER];
  if (![1, 2, 3].includes(n.tier)) n.tier = 3;
}
const finalSignals = signals.filter(s => nodes.has(s.nodeId));
const unmapped = signals.length - finalSignals.length;

const out = { company: base.company, pillars: base.pillars, nodes: [...nodes.values()], signals: finalSignals };
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

// domains.json: keep hand-set entries, add any domain the scouts found (used by fetch-logos)
const domPath = new URL('../data/domains.json', import.meta.url);
const doms = fs.existsSync(domPath) ? read(domPath) : {};
for (const n of out.nodes) if (n.domain && !doms[n.id]) doms[n.id] = n.domain;
fs.writeFileSync(domPath, JSON.stringify(doms, null, 1));
console.log(`nodes ${out.nodes.length}, signals ${finalSignals.length}, dropped ${dropped.length}, unmapped ${unmapped}`);
for (const d of dropped) console.log(`  dropped: ${d.url} (${d.why})`);
for (const b of badLanes) console.log(`  BAD LANE: ${b}`);
if (badLanes.length) process.exitCode = 2;
