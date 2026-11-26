import ForceGraph3D from '3d-force-graph';
import * as THREE from 'three';
import SpriteText from 'three-spritetext';
import { forceRadial } from 'd3-force-3d';
import data from '../data/ripple.json';
import domains from '../data/domains.json';
import briefs from '../data/briefs.json';
import metrics from '../data/metrics.json';
import logoIds from '../data/logos.json';

const C = { positive: '#8DB08F', negative: '#D2774F', mixed: '#D4AA5E', none: '#5C574E', center: '#ECEAE3' };
const CENTER = data.company.id;
const byId = Object.fromEntries(data.nodes.map(n => [n.id, n]));
let active = null;
let shown = { nodes: [] };   // the companies currently on the map (the library's getter can lag a frame behind a switch)
let order = 3;   // how many rings to show: 1 = direct ties only, 2 = plus one step behind, 3 = everything
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tick = (data.company.ticker || '').split(' ')[0] || data.company.name.slice(0, 3).toUpperCase();

// logos: only ids that scripts/fetch-logos.mjs saved at >=48px; everything else (and the center) uses initials
const logoFile = Array.isArray(logoIds) ? Object.fromEntries(logoIds.map(id => [id, `${id}.png`])) : logoIds;
const logo = id => (/^[a-z0-9-]+\.(png|svg)$/.test(logoFile[id] || '') ? `/logos/${logoFile[id]}` : null);
const initials = s => s.replace(/\(.*?\)/g, '').split(/[\s/]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

const sig = (p, n) => data.signals.filter(s => (!p || s.pillar === p) && (!n || s.nodeId === n));
const tally = l => l.reduce((t, s) => (t[s.direction]++, t), { positive: 0, negative: 0, mixed: 0 });
function dir(nid, p) {
  const l = sig(p, nid); if (!l.length) return 'none';
  let sc = 0, pos = 0, neg = 0;
  l.forEach(s => { const m = s.magnitude || 1; if (s.direction === 'positive') { sc += m; pos++; } else if (s.direction === 'negative') { sc -= m; neg++; } else { pos++; neg++; } });
  if (pos && neg && Math.abs(sc) <= 1) return 'mixed';
  return sc > 0 ? 'positive' : sc < 0 ? 'negative' : 'mixed';
}

// ---------- left panel ----------
document.getElementById('co-name').textContent = data.company.name;
document.getElementById('co-meta').textContent = data.company.ticker;
{ const cl = document.getElementById('co-logo'), src = logo(CENTER);   // the stock's own logo, ticker letters only as a fallback
  if (src) { cl.src = src; cl.alt = data.company.name; cl.addEventListener('load', () => cl.classList.toggle('lightlogo', isLight(cl)), { once: true }); }
  else cl.outerHTML = `<div class="co-ini">${esc(tick)}</div>`; }
// Status scale: strong / stable / weak / broken (older maps used intact / watch; map them across)
const STATUS = s => ({ intact: 'strong', watch: 'stable' }[s] || s);
data.pillars.forEach(p => (p.status = STATUS(p.status)));
const holding = data.pillars.filter(p => p.status === 'strong' || p.status === 'stable').length;
document.getElementById('th-count').textContent = `${holding} OF ${data.pillars.length} HOLDING`;
const list = document.getElementById('pillars');
data.pillars.forEach((p, i) => {
  const t = tally(sig(p.id));
  const el = document.createElement('div');
  el.className = 'row'; el.dataset.id = p.id;
  el.innerHTML = `<div class="r-top"><span class="r-num">${String(i + 1).padStart(2, '0')}</span><span class="r-title">${esc(p.title)}</span><span class="st ${esc(p.status)}">${esc(String(p.status).toUpperCase())}</span></div>
    <div class="r-more"><div class="r-reason">${esc(p.statusReason)}</div>
      <div class="kv">${p.type === 'kpi'
        // KPI row: each KPI from the memo with its latest reading, what the company or street expects, and a plain read
        ? (p.kpis || []).map((k, j) => `<span>${j ? '' : 'KPIS'}</span><span><span class="kpi-n">${esc(k.name)}</span><b class="kpi-v">${esc(k.latest)}</b>${k.expected ? ` <span class="dim">· ${esc(k.expected)}</span>` : ''}<div class="kpi-r">${esc(k.read || '')}</div></span>`).join('')
        : `<span>WHY</span><span>${(p.why || []).map(w => `<div class="bul">${esc(w)}</div>`).join('')}</span><span>KILL</span><span>${esc(p.killCriteria)}</span>`}
      <span>NEXT</span><span>${esc(p.nextCheck)}</span>
      <span>NEWS</span><span class="tally"><b class="pos">${t.positive} ▲</b>&nbsp; <b class="neg">${t.negative} ▼</b>&nbsp; <b class="mix">${t.mixed} ◆</b></span></div></div>`;
  el.onclick = () => select(active === p.id ? null : p.id);
  list.appendChild(el);
});

// ---------- metrics ----------
const mEl = document.getElementById('metrics');
const mGroup = (name, rows) => rows && rows.length ? `<div class="m-group">${name}</div><div class="m-grid">` + rows.map(r => `<div class="m-cell" title="${esc([r.why, r.asOf, r.source].filter(Boolean).join(' · '))}"><div class="m-lab">${esc(r.label)}</div><div class="m-val">${esc(r.value)}</div>${r.read ? `<div class="m-read">${esc(r.read)}</div>` : ''}</div>`).join('') + '</div>' : '';
mEl.innerHTML = mGroup('RISK', metrics.risk) + mGroup('VALUATION', metrics.valuation);
if (metrics.price) document.getElementById('m-asof').textContent = metrics.price.value;
else document.getElementById('m-asof').textContent = '';

// ---------- node art: logo disc + colored ring ----------
const texCache = new Map();
const imgCache = new Map();   // logo id -> loaded <img>, shared by every texture of that company
// white or very light logos (common for SVG wordmarks) would vanish on the cream disc: give them the dark disc
const lightCache = new WeakMap();
function isLight(img) {
  if (lightCache.has(img)) return lightCache.get(img);
  let light = false;
  try {
    const c = document.createElement('canvas'); c.width = c.height = 48; const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, 48, 48); const d = x.getImageData(0, 0, 48, 48).data; let sum = 0, cnt = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 60) { sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; cnt++; }
    light = cnt > 30 && sum / cnt > 225 && cnt < 48 * 48 * 0.9;  // mostly-white marks on transparency, not full white tiles
  } catch {}
  lightCache.set(img, light); return light;
}
function discTexture(n, ring) {
  const key = n.id + ring; if (texCache.has(key)) return texCache.get(key);
  const S = 512, K = S / 256, cv = document.createElement('canvas'); cv.width = cv.height = S;   // 512px so logos stay sharp up close
  const g = cv.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = MAX_ANISO; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
  const draw = img => {
    g.clearRect(0, 0, S, S);
    g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 14 * K, 0, Math.PI * 2); g.fillStyle = img ? (isLight(img) ? '#24211C' : '#ECEAE3') : n.id === CENTER ? '#ECEAE3' : '#24211C'; g.fill();
    g.lineWidth = (n.dir === 'none' ? 3 : 7) * K; g.strokeStyle = ring; g.stroke();
    if (img) { const iw = img.naturalWidth || S, ih = img.naturalHeight || S, box = S * 0.62, k = Math.min(box / iw, box / ih), w = iw * k, h = ih * k; g.save(); g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 22 * K, 0, Math.PI * 2); g.clip(); g.drawImage(img, (S - w) / 2, (S - h) / 2, w, h); g.restore(); }
    else { g.fillStyle = n.id === CENTER ? '#0E0D0B' : '#D8D4CA'; g.font = `500 ${72 * K}px JetBrains Mono, monospace`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(n.id === CENTER ? tick : initials(n.label), S / 2, S / 2 + 4 * K); }
    tex.needsUpdate = true;
  };
  const src = logo(n.id);
  if (src) {
    const cached = imgCache.get(src);
    if (cached && cached.complete && cached.naturalWidth) draw(cached);
    else { const img = cached || new Image(); imgCache.set(src, img);
      img.addEventListener('load', () => draw(img), { once: true }); img.addEventListener('error', () => draw(null), { once: true });
      if (!cached) img.src = src; draw(null); }
  } else draw(null);
  texCache.set(key, tex); return tex;
}

function nodeObj(n) {
  const grp = new THREE.Group();
  const size = n.id === CENTER ? 26 : n.tier === 1 ? 15 : n.tier === 2 ? 12 : 9.5;
  const ring = n.id === CENTER ? C.center : C[n.dir];
  const disc = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTexture(n, ring), transparent: true, depthWrite: false }));
  disc.scale.set(size, size, 1); grp.add(disc);
  const lab = new SpriteText(n.label.replace(/\s*\(.*\)/, ''), n.id === CENTER ? 4.2 : 2.6, n.tier <= 1 ? '#ECEAE3' : '#8C867A');
  lab.fontFace = 'Inter, sans-serif'; lab.fontWeight = '400'; lab.fontSize = 200; lab.position.y = -(size / 2 + 4.5);   // fontSize = label texture resolution
  grp.add(lab);
  return grp;
}

// ---------- graph ----------
function build(p) {
  let keep = new Set(data.nodes.map(n => n.id));
  if (p) {
    keep = new Set([CENTER]);
    data.nodes.forEach(n => { if ((n.pillars || []).includes(p) || sig(p, n.id).length) keep.add(n.id); });
    let grew = true;
    while (grew) { grew = false; [...keep].forEach(id => (byId[id]?.connectsTo || []).forEach(c => { if (!keep.has(c) && byId[c]) { keep.add(c); grew = true; } })); }
  }
  if (order < 3) keep = new Set([...keep].filter(id => id === CENTER || (byId[id]?.tier || 3) <= order));
  const nodes = data.nodes.filter(n => keep.has(n.id)).map(n => {
    const o = { ...n, dir: n.id === CENTER ? 'center' : dir(n.id, p) };
    const q = POS.get(n.id); if (q) { o.x = o.fx = q.x; o.y = o.fy = q.y; o.z = o.fz = q.z; }   // same spot in every view
    return o;
  });
  const links = [];
  nodes.forEach(n => (n.connectsTo || []).forEach(t => keep.has(t) && links.push({ source: n.id, target: t, dir: n.dir })));
  return { nodes, links };
}
const el = document.getElementById('graph');
const POS = new Map();   // settled positions of the full map; the layout is frozen once it settles
let MAX_ANISO = 8;
const G = ForceGraph3D({ controlType: 'orbit' })(el)
  .backgroundColor('rgba(0,0,0,0)')
  .enableNodeDrag(false)
  .onEngineStop(() => {
    if (active || order !== 3) return;
    const first = !POS.size;
    G.graphData().nodes.forEach(n => { POS.set(n.id, { x: n.x, y: n.y, z: n.z }); n.fx = n.x; n.fy = n.y; n.fz = n.z; });
    if (first) resetView(0);   // the opening view frames the settled map, all three rings
  })
  .showNavInfo(false)
  .warmupTicks(900).cooldownTicks(0)   // settle fully before the first frame; the map never re-lays itself out
  .nodeThreeObject(nodeObj)
  .nodeLabel(n => esc(`${n.label} · ${n.relation || ''}`))   // the library renders this as HTML; escape web-sourced text
  .linkColor(l => (l.dir === 'none' ? '#3A362F' : C[l.dir]))
  .linkOpacity(0.6)
  .linkWidth(0)
  .linkCurvature(0)
  .linkDirectionalParticles(0)
  .onNodeClick(n => { stopOrbit(); openDrawer(n); fly(n); })
  .onBackgroundClick(() => userCloseDrawer());
G.d3Force('radial', forceRadial(n => (n.id === CENTER ? 0 : n.tier === 1 ? 75 : n.tier === 2 ? 150 : 215)).strength(1.2));
G.d3Force('charge').strength(-160);
G.d3Force('link').distance(60).strength(0.12);
const fit = () => G.width(el.clientWidth).height(el.clientHeight); fit(); window.addEventListener('resize', fit);
G.renderer().setPixelRatio(Math.min(window.devicePixelRatio || 1, 3));
MAX_ANISO = G.renderer().capabilities.getMaxAnisotropy();
// camera: always pivots around the center stock; no panning; zoom in freely, zoom out only so far
const CTL = G.controls();
CTL.enablePan = false; CTL.minDistance = 60; CTL.maxDistance = 650; CTL.target.set(0, 0, 0);
CTL.rotateSpeed = 0.6; CTL.zoomSpeed = 0.8;

// depth cues: fog so far nodes fade, and dotted sphere shells for each ring
const scn = G.scene();
scn.fog = new THREE.FogExp2(0x0E0D0B, 0.00085);
const SHELLS = [];   // one dotted shell per ring, hidden along with its ring in the 1st/2nd order views
[75, 150, 215].forEach((R, k) => {
  const N = [1400, 2600, 3800][k], pos = new Float32Array(N * 3), gold = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) { const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = gold * i; pos.set([Math.cos(th) * r * R, y * R, Math.sin(th) * r * R], i * 3); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const shell = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xECEAE3, size: 1.1, transparent: true, opacity: [0.38, 0.26, 0.18][k], depthWrite: false }));
  SHELLS.push(shell); scn.add(shell);
});
// Auto-orbit is always on. It pauses only while you look at a company (card open) or drag the map,
// and picks up again by itself: when the card closes, or a few seconds after a drag ends.
// RESET (bottom left) flies back to the default view. Scroll-zoom keeps it orbiting.
let orbit = true, resetTimer = 0, down = null, dragged = false;
const stopOrbit = () => { orbit = false; clearTimeout(resetTimer); };
const cardOpen = () => !document.getElementById('drawer').classList.contains('closed');
function resumeOrbitSoon(ms) { clearTimeout(resetTimer); resetTimer = setTimeout(() => { if (!down && !cardOpen()) orbit = true; }, ms); }
el.addEventListener('wheel', () => cancelAnimationFrame(camAnim), { passive: true });
el.addEventListener('pointerdown', e => (down = { x: e.clientX, y: e.clientY }));
el.addEventListener('pointermove', e => { if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) { stopOrbit(); dragged = true; } });
window.addEventListener('pointerup', () => { down = null; if (dragged) { dragged = false; resumeOrbitSoon(4000); } });
setInterval(() => {
  if (!orbit) return;
  const c = G.camera().position, r = Math.hypot(c.x, c.z) || 1, a = Math.atan2(c.x, c.z) + Math.PI / 900;
  G.cameraPosition({ x: r * Math.sin(a), y: c.y, z: r * Math.cos(a) });
}, 30);
// Smooth camera move around the fixed center pivot. (3d-force-graph's animated cameraPosition does
// nothing with this three.js version, so animate it here: ease in-out, instant moves still use the library.)
let camAnim = 0;
function moveCamera(to, ms = 900) {
  cancelAnimationFrame(camAnim);
  const from = G.camera().position.clone(), t0 = performance.now();
  if (!ms) { G.cameraPosition(to, { x: 0, y: 0, z: 0 }, 0); return; }
  const step = now => {
    const t = Math.min(1, (now - t0) / ms), e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    G.cameraPosition({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, z: from.z + (to.z - from.z) * e }, { x: 0, y: 0, z: 0 }, 0);
    if (t < 1) camAnim = requestAnimationFrame(step);
  };
  camAnim = requestAnimationFrame(step);
}
function resetView(ms = 900) {
  stopOrbit(); closeDrawer();
  // fit the zoom to how big the map actually is (a dense map of tier-1 names should not sit tiny in the middle)
  const r = Math.max(60, ...shown.nodes.map(n => Math.hypot(n.x || 0, n.y || 0, n.z || 0)));
  // the 1st / 2nd order views fit their own rings more tightly, so the three views step outward
  const floor = order === 1 ? 220 : active ? 280 : 300, k = order < 3 ? 2.7 : active ? 2.9 : 3.2;
  const c = G.camera().position, a = Math.atan2(c.x, c.z), d = Math.min(active ? 430 : 560, Math.max(floor, r * k));
  moveCamera({ x: d * Math.sin(a), y: d * 0.42, z: d * Math.cos(a) }, ms);
  resetTimer = setTimeout(() => (orbit = true), ms + 50);
}
// RESET brings back all three orders and the default view; 1ST / 2ND ORDER show just the inner rings
// (click the lit one again to go back to everything)
function setOrder(o) {
  order = o;
  document.querySelectorAll('#views .ord').forEach(b => b.classList.toggle('on', +b.dataset.o === o));
  SHELLS.forEach((s, k) => (s.visible = k < o));
  G.graphData(shown = build(active));
  resetView();
}
document.getElementById('reset').onclick = () => (order === 3 ? resetView() : setOrder(3));
document.querySelectorAll('#views .ord').forEach(b => (b.onclick = () => setOrder(order === +b.dataset.o ? 3 : +b.dataset.o)));
function fly(n) {
  const len = Math.hypot(n.x || 0, n.y || 0, n.z || 0);
  if (len < 1) { const c = G.camera().position, d = 300, a = Math.atan2(c.x, c.z); moveCamera({ x: d * Math.sin(a), y: d * 0.42, z: d * Math.cos(a) }, 1000); return; }
  // Come in at an angle: beyond the company and off to one side, still looking at the center, so the
  // company sits big and close on one side and the center stock stays visible beside it.
  const dx = n.x / len, dy = n.y / len, dz = n.z / len;
  let px = dz, pz = -dx; const pl = Math.hypot(px, pz) || 1; px /= pl; pz /= pl;   // horizontal perpendicular
  moveCamera({ x: n.x + dx * 120 + px * 95, y: n.y + dy * 120 + 45, z: n.z + dz * 120 + pz * 95 }, 1000);
}

function select(p) {
  active = p;
  document.querySelectorAll('.row').forEach(r => r.classList.toggle('on', r.dataset.id === p));
  G.graphData(shown = build(p));
  const P = data.pillars.find(x => x.id === p); const i = data.pillars.indexOf(P);
  document.getElementById('crumb').innerHTML = P ? `<b>${String(i + 1).padStart(2, '0')} ${esc(P.short.toUpperCase())}</b>` : '';
  document.getElementById('claim').innerHTML = '';
  resetView(p === undefined ? 0 : 900);
}

// ---------- drawer ----------
const drawer = document.getElementById('drawer');
document.getElementById('x').onclick = () => userCloseDrawer();
function closeDrawer() { drawer.classList.add('closed'); }
function userCloseDrawer() { closeDrawer(); resumeOrbitSoon(700); }   // closing a card by hand restarts the spin
const ARW = { positive: '▲', negative: '▼', mixed: '◆' };
const DIRS = new Set(['positive', 'negative', 'mixed']);
function chainTo(id) {
  const prev = { [id]: null }, q = [id];
  while (q.length) { const c = q.shift(); if (c === CENTER) break; (byId[c]?.connectsTo || []).forEach(nx => { if (!(nx in prev)) { prev[nx] = c; q.push(nx); } }); }
  if (!(CENTER in prev)) return [id];
  const path = []; for (let c = CENTER; c; c = prev[c]) path.unshift(c); return path;
}
const cleanH = h => { const x = h.replace(/^[A-Za-z0-9 .&'-]{2,22}:\s+/, ''); return x[0].toUpperCase() + x.slice(1); };
const short = s => s.replace(/\s*\(.*\)/, '');
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fdate = d => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d)); return m ? `${MON[+m[2] - 1]} ${+m[3]}, ${m[1].slice(2)}` : ''; };
function openDrawer(n) {
  const l = sig(active, n.id).sort((a, b) => b.date.localeCompare(a.date));
  const all = l.length ? l : sig(null, n.id);
  const src = logo(n.id);
  const [role, matters] = n.brief || briefs[n.id] || [n.role, n.summary];
  const health = n.health || (briefs[n.id] || [])[2];
  const d = n.id === CENTER ? 'center' : dir(n.id, active);
  const impact = { positive: '<b class="pos">▲ Helps you</b>', negative: '<b class="neg">▼ Hurts you</b>', mixed: '<b class="mix">◆ Mixed</b>', none: '<b class="dim">No fresh news</b>', center: '<b>Your position</b>' }[d];
  const pts = [...new Set(all.map(s => s.pillar))].map(id => { const i = data.pillars.findIndex(p => p.id === id); return String(i + 1).padStart(2, '0'); }).sort().join(' · ');
  const longN = all.filter(s => s.horizon === 'long').length;
  const when = all.length ? (longN > all.length / 2 ? 'long term' : 'near term') : '';
  const chain = chainTo(n.id).map(id => short(byId[id].label)).join(' → ');
  document.getElementById('drawer-body').innerHTML = `
    <div class="d-head">${src ? `<img class="d-logo" src="${esc(src)}">` : `<div class="ini">${esc(n.id === CENTER ? tick : initials(n.label))}</div>`}
      <div><div class="d-name">${esc(short(n.label))}</div><div class="d-sub">${esc(role)}</div></div></div>
    <div class="kv d-kv">
      <span>IMPACT</span><span>${impact}${pts ? ` · thesis ${esc(pts)}` : ''}${when ? ` · ${esc(when)}` : ''}</span>
      <span>WHY</span><span>${esc(matters)}</span>
      ${health ? `<span>HEALTH</span><span>${esc(health)}</span>` : ''}
      ${n.tracks ? `<span>TRACKS</span><span>${esc(n.tracks)}</span>` : ''}
      ${n.reading ? `<span>LATEST</span><span>${esc(n.reading)}</span>` : ''}
      ${n.cadence || n.leads ? `<span>TIMING</span><span>${esc([n.cadence, n.leads].filter(Boolean).join(' · '))}</span>` : ''}
      ${n.id !== CENTER ? `<span>CHAIN</span><span>${esc(chain)}</span>` : ''}
    </div>
    <div class="section"><span>NEWS</span><span class="dim">${Number(l.length)}</span></div>
    ${l.map(s => `<details class="sig"><summary>
        <span class="s-meta"><span class="arrow ${DIRS.has(s.direction) ? s.direction : 'mixed'}">${ARW[s.direction] || ARW.mixed}</span><span>${esc(fdate(s.date))}</span><span>${esc(String(s.sourceName || '').split('(')[0].split(' via')[0].trim())}</span></span>
        <span class="s-h">${esc(cleanH(s.headline))}</span></summary>
        <div class="s-why">${esc(s.whyItMatters)}</div>
        ${s.evidence ? `<div class="s-q">${esc(s.evidence)}</div>` : ''}
        <a class="s-link" href="${/^https?:\/\//i.test(s.url) ? esc(s.url) : '#'}" target="_blank" rel="noopener">SOURCE ↗</a></details>`).join('') || '<div class="empty">No fresh news for this thesis point.</div>'}`;
  const dl = document.querySelector('#drawer-body .d-logo');   // light logos get the dark disc (CSP blocks inline handlers)
  if (dl) { const mark = () => dl.classList.toggle('lightlogo', isLight(dl)); dl.complete ? mark() : dl.addEventListener('load', mark, { once: true }); }
  drawer.classList.remove('closed');
}

Object.values(logoFile).forEach(f => { const src = `/logos/${f}`; if (!imgCache.has(src)) { const i = new Image(); i.src = src; imgCache.set(src, i); } });
select(null);
window.__graph = G; window.__select = select; window.__isLight = isLight;
