// Download a logo for every node into public/logos/<id>.png and write data/logos.json (ids that got one).
// Order per node:
//   1. data/logo-urls.json override { "<id>": "https://direct/image.png" }  (herder fills this for misses)
//   2. by domain: Google s2 favicon (256) -> icon.horse -> <domain>/apple-touch-icon.png   (square, >= 48px)
//   3. Wikidata official logo (P154) via Wikimedia Commons, matched by label and, when known, website domain
//   4. DuckDuckGo icon
// Usage: node scripts/fetch-logos.mjs [--force]
import fs from 'node:fs';
import dns from 'node:dns/promises';
import net from 'node:net';
import https from 'node:https';
import path from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const readJ = (f, d) => { const p = path.join(root, f); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : d; };
const domains = readJ('data/domains.json', {});
const overrides = readJ('data/logo-urls.json', {});
const thesis = readJ('data/thesis.json', {});
const ripple = readJ('data/ripple.json', { nodes: [] });
const outDir = path.join(root, 'public/logos');
fs.mkdirSync(outDir, { recursive: true });
const force = process.argv.includes('--force');
const UA = { 'User-Agent': 'ripple-map/1.0 (local investing tool)' };
const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// PNG / GIF / ICO / JPEG / WEBP dimensions from the header; null if not a raster image we understand
function dims(b) {
  if (!b || b.length < 24) return null;
  if (b.readUInt32BE(0) === 0x89504e47) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  if (b.toString('ascii', 0, 3) === 'GIF') return [b.readUInt16LE(6), b.readUInt16LE(8)];
  if (b.readUInt16LE(0) === 0 && b.readUInt16LE(2) === 1) return [b[6] || 256, b[7] || 256];
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const t = b.toString('ascii', 12, 16);
    if (t === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
    if (t === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
    if (t === 'VP8L') { const v = b.readUInt32LE(21); return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)]; }
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const m = b[i + 1], len = b.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
      i += 2 + len;
    }
  }
  return null;
}

// Every outbound request goes through safeFetch: https only, public hostnames only, every redirect
// hop re-checked, and the IP is checked at connect time (the DNS lookup used for the connection is
// the one that gets validated), so a hostile page or agent-supplied URL cannot reach localhost or the
// user's network, including via DNS rebinding or IPv6 / IPv4-mapped forms of private addresses.
const BLOCK = new net.BlockList();
for (const c of ['0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12',
  '192.0.0.0/24', '192.168.0.0/16', '198.18.0.0/15', '224.0.0.0/3']) { const [a, p] = c.split('/'); BLOCK.addSubnet(a, +p, 'ipv4'); }
// IPv4-mapped forms (::ffff:a.b.c.d, ::ffff:7f00:1) are caught by the IPv4 rules above; a ::ffff:0:0/96 rule
// here would block every IPv4 address, because BlockList checks IPv4 as mapped IPv6.
for (const c of ['::/128', '::1/128', '100::/64', '2001:db8::/32',
  'fc00::/7', 'fe80::/10', 'fec0::/10', 'ff00::/8']) { const [a, p] = c.split('/'); BLOCK.addSubnet(a, +p, 'ipv6'); }
const privateIp = ip => BLOCK.check(ip, net.isIPv6(ip) ? 'ipv6' : 'ipv4');
function guardedLookup(host, opts, cb) {
  if (typeof opts === 'function') { cb = opts; opts = {}; }
  dns.lookup(host, { all: true }).then(addrs => {
    if (!addrs.length || addrs.some(a => privateIp(a.address))) return cb(Object.assign(new Error(`blocked non-public address for ${host}`), { code: 'EBLOCKED' }));
    if (opts && opts.all) cb(null, addrs); else cb(null, addrs[0].address, addrs[0].family);
  }, cb);
}
function request(u, { headers = {}, signal, maxBytes = 3_000_000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(u, { headers, signal, lookup: guardedLookup }, r => {
      const chunks = []; let n = 0;
      r.on('data', c => { n += c.length; if (n > maxBytes) req.destroy(new Error('response too large')); else chunks.push(c); });
      r.on('end', () => {
        const status = r.statusCode || 500;
        const hdrs = Object.entries(r.headers).flatMap(([k, v]) => (Array.isArray(v) ? v.map(x => [k, x]) : [[k, String(v)]]));
        resolve(new Response([101, 204, 205, 304].includes(status) ? null : Buffer.concat(chunks), { status, headers: hdrs }));
      });
      r.on('error', reject);
    });
    req.on('error', reject);
  });
}
async function safeFetch(url, opts = {}) {
  let u = url;
  for (let hop = 0; hop < 5; hop++) {
    if (!publicHttps(u)) return null;
    let r; try { r = await request(u, opts); } catch { return null; }
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { u = new URL(r.headers.get('location'), u).href; continue; }
    return r;
  }
  return null;
}
async function get(url, { json = false, tries = 3 } = {}) {
  for (let k = 0; k < tries; k++) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 12000);
    try {
      const r = await safeFetch(url, { signal: ctl.signal, headers: UA });
      if (!r) return null;
      if (r.status === 429 || r.status >= 500) { const ra = Number(r.headers.get('retry-after')); await sleep(Math.min(20000, ra > 0 ? ra * 1000 : 2000 * (k + 1))); continue; }
      if (!r.ok) return null;
      if (json) return await r.json();
      const ct = r.headers.get('content-type') || 'image/';
      if (!/image\/|text\/xml|application\/xml|text\/plain/.test(ct)) return null;
      const buf = Buffer.from(await r.arrayBuffer());
      return buf.length > 3_000_000 ? null : buf;
    } catch { if (k === tries - 1) return null; await sleep(800); } finally { clearTimeout(t); }
  }
  return null;
}

const host = u => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };
const sameSite = (a, b) => { const r = d => d.split('.').slice(-2).join('.'); return a && b && r(a) === r(b); };

// Wikidata: search label variants, take the first entity with an official logo whose website matches the domain
let wdChain = Promise.resolve();  // one Wikidata request at a time, >= 400ms apart (it rate-limits hard)
function wd(params) {
  const run = wdChain.then(async () => {
    const r = await get(`https://www.wikidata.org/w/api.php?${new URLSearchParams({ format: 'json', ...params })}`, { json: true, tries: 4 });
    await sleep(400); return r;
  });
  wdChain = run.catch(() => null); return run;
}
async function wikidataLogo(label, domain) {
  const clean = label.replace(/\(.*?\)/g, '').trim();
  const variants = [...new Set([clean, clean.split(/\s*[/,&]\s*/)[0]].filter(Boolean))];
  for (const q of variants) {
    const s = await wd({ action: 'wbsearchentities', search: q, language: 'en', limit: '4' });
    const ids = (s?.search || []).map(e => e.id);
    if (!ids.length) continue;
    const ents = await wd({ action: 'wbgetentities', ids: ids.join('|'), props: 'claims|labels', languages: 'en' });
    for (const id of ids) {
      const c = ents?.entities?.[id]?.claims || {};
      const file = c.P154?.[0]?.mainsnak?.datavalue?.value;
      if (!file) continue;
      const site = host(c.P856?.[0]?.mainsnak?.datavalue?.value || '');
      const name = ents.entities[id].labels?.en?.value || '';
      const ok = domain ? sameSite(site, domain) : name.toLowerCase() === q.toLowerCase();
      if (ok) return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=256`;
    }
  }
  return null;
}

// SVG: accept if it parses as an <svg> root with no scripts (it is only ever drawn through <img>, which can't run them anyway)
const isSvg = b => { const t = b && b.length < 800_000 ? b.toString('utf8', 0, Math.min(b.length, 4000)) : ''; return /<svg[\s>]/i.test(t) && !/<script/i.test(b.toString('utf8')); };
// Only public https hosts: no plain http, no IP literals, no localhost or .local names (agents and
// web pages supply these URLs, so they are untrusted).
function publicHttps(u) {
  try {
    const x = new URL(u); const h = x.hostname.toLowerCase();
    if (x.protocol !== 'https:' || x.username || x.password) return false;
    if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return false;
    if (/^[\d.]+$/.test(h) || h.includes(':') || h.startsWith('[')) return false;   // IPv4 / IPv6 literals
    return h.includes('.');
  } catch { return false; }
}
async function tryUrl(u, minSide) {
  if (!publicHttps(u)) return null;
  const buf = await get(u);
  if (isSvg(buf)) return { buf, d: ['svg', ''], ext: 'svg' };
  const d = dims(buf);
  if (!d) return null;
  return (minSide === 'wide' ? Math.max(...d) >= 64 && Math.min(...d) >= 16 : Math.min(...d) >= minSide) ? { buf, d } : null;
}

// The site's own <link rel="...icon" sizes="NxN"> tags, largest first
async function siteIcon(domain) {
  let html = '';
  for (const base of [`https://${domain}/`, `https://www.${domain}/`]) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 12000);
    try { const r = await safeFetch(base, { signal: ctl.signal, headers: { ...UA, Accept: 'text/html' } }); if (r && r.ok) { html = (await r.text()).slice(0, 400_000); var origin = base; } }
    catch {} finally { clearTimeout(t); }
    if (html) break;
  }
  if (!html) return null;
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map(m => m[0]).filter(l => /rel=["'][^"']*icon/i.test(l));
  const cands = links.map(l => ({ href: (l.match(/href=["']([^"']+)["']/i) || [])[1], size: +((l.match(/sizes=["'](\d+)x\d+/i) || [])[1] || (/apple-touch/i.test(l) ? 180 : 0)) }))
    .filter(c => c.href).sort((a, b) => b.size - a.size);
  for (const c of cands.slice(0, 4)) {
    let u; try { u = new URL(c.href, origin).href; } catch { continue; }
    if (!/^https?:/.test(u)) continue;
    const r = await tryUrl(u, 48); if (r) return r;
  }
  return null;
}

async function one(n) {
  for (const ext of ['png', 'svg']) {
    const f = path.join(outDir, `${n.id}.${ext}`);
    if (!force && fs.existsSync(f)) return `${n.id}.${ext}`;
  }
  const raw = String(domains[n.id] || n.domain || '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const domain = DOMAIN_RE.test(raw) ? raw.toLowerCase() : '';
  const tries = [];
  if (/^https?:\/\//.test(overrides[n.id] || '')) tries.push(() => tryUrl(overrides[n.id], 'wide'));
  if (domain) {
    tries.push(() => tryUrl(`https://www.google.com/s2/favicons?domain=${domain}&sz=256`, 48));
    tries.push(() => tryUrl(`https://icon.horse/icon/${domain}`, 48));
    tries.push(() => tryUrl(`https://${domain}/apple-touch-icon.png`, 48));
  }
  if (domain) tries.push(() => siteIcon(domain));
  tries.push(async () => { const u = await wikidataLogo(n.label || n.id, domain); return u ? tryUrl(u, 'wide') : null; });
  if (domain) tries.push(() => tryUrl(`https://icons.duckduckgo.com/ip3/${domain}.ico`, 48));
  for (const t of tries) {
    const r = await t();
    // the center stock is drawn biggest: a tiny favicon looks cheap there, so hold out for a sharp image
    if (r && n.id === center && r.d && r.d[0] !== 'svg' && Math.min(...r.d) < 128) continue;
    if (r) {
      const ext = r.ext || 'png', other = ext === 'png' ? 'svg' : 'png';
      fs.writeFileSync(path.join(outDir, `${n.id}.${ext}`), r.buf);
      fs.rmSync(path.join(outDir, `${n.id}.${other}`), { force: true });
      return `${n.id}.${ext}`;
    }
  }
  return null;
}

const center = thesis.company?.id;
const byId = new Map(ripple.nodes.map(n => [n.id, n]));
for (const id of Object.keys(domains)) if (!byId.has(id)) byId.set(id, { id, label: id });
const nodes = [...byId.values()].filter(n => /^[a-z0-9-]+$/.test(n.id));   // the center stock gets its logo too

const ok = {}; const miss = []; const queue = [...nodes];
await Promise.all(Array.from({ length: 4 }, async () => {
  while (queue.length) { const n = queue.shift(); const f = await one(n); if (f) ok[n.id] = f; else miss.push(n.id); }
}));
const sorted = Object.fromEntries(Object.entries(ok).sort());
fs.writeFileSync(path.join(root, 'data/logos.json'), JSON.stringify(sorted, null, 1));
// people, products, indices and events may use initials; companies and regulators must have a logo
const needs = id => id === center || ['company', 'regulator', undefined].includes(byId.get(id)?.type);
const hard = miss.filter(needs).sort(); const soft = miss.filter(id => !needs(id)).sort();
console.log(`logos ${Object.keys(ok).length}/${nodes.length}${soft.length ? `; initials (person/product/index/event): ${soft.join(', ')}` : ''}`);
if (hard.length) {
  console.log(`MISSING COMPANY LOGOS: ${hard.join(', ')}`);
  console.log('Fix: find each official logo image URL (company site, Wikipedia/Commons, press kit), put it in data/logo-urls.json as { "<id>": "<url>" }, then run npm run logos again.');
  process.exitCode = 3;
}
