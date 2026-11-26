# Ripple Map: build prompt for Claude Code

Design and build spec for the Ripple skill. The skill in this folder implements it.

---

You are building **Ripple Map**, a local investing tool. The user gives an investment memo (PDF or text) on a stock they own or short. You turn it into:

1. **A thesis checklist**: the memo's own thesis points (usually 2-3; valuation, catalysts and risks are not thesis points), each with a status (STRONG / STABLE / WEAK / BROKEN, formerly INTACT / WATCH / BROKEN) judged against a "breaks if" condition taken from the memo.
2. **A 3D ripple map**: every company, regulator, person and market force 1-3 steps away from the stock (its suppliers, buyers, partners, rivals, owners, regulators, and their suppliers and rivals) that can help or hurt a thesis point. Click any dot to see how that company is doing, why it matters to the stock, the chain back to the stock, and dated, sourced news.
3. **Metrics**: 6 risk and 6 valuation metrics, the same 12 for every company so they're comparable.

This is a tool for an investor, not a report. The value is the second-order information the investor would not see by reading news about the stock itself. Everything must be real, dated and linked. No invented numbers, no guessed URLs.

Build it in two parts: (A) the agent pipeline in `.claude/` that researches and writes the data, and (B) the app that shows it. Then run the pipeline on the memo and open the app.

---

## A. The pipeline: one herder + 9 specialist agents

Create these as Claude Code subagents in `.claude/agents/<name>.md` (frontmatter: `name`, `description`, `tools: WebSearch, WebFetch, Read, Write, Bash`) and a slash command `.claude/commands/ripple.md` that is the herder. Usage: `/ripple path/to/memo.pdf`.

### Herder (`/ripple <memo>`)
1. Run **thesis-extractor** on the memo → `data/thesis.json`.
2. Run the 6 scouts **in parallel**, giving each the memo and `data/thesis.json` → `data/lanes/<lane>.json`.
3. Run **metrics-agent** → `data/metrics.json`.
4. Run **verifier** on all lane files → `data/verify.json`.
5. Merge with `node scripts/herder-merge.mjs data/ripple.json data/verify.json data/lanes/*.json`.
6. **Judge** each thesis point against its kill criteria using the merged signals. Set `status`, `statusReason`, `nextCheck` in `data/thesis.json` and re-run the merge. STRONG if the evidence clearly backs it and nothing big cuts against it. STABLE if it's holding but the deciding test is still ahead. WEAK if the evidence leans against it. BROKEN only if the kill condition has actually happened. Be honest; do not hand the user all green.
7. Write `data/briefs.json` (role + one-line why for every node that doesn't already have one) and `data/domains.json` (website domain per node), then download logos (see App > Logos).
8. Start the app (`npm run dev`), print the URL and a 5-line summary: each thesis point, its status, and the single most important signal.

### 1. thesis-extractor
Reads the memo and writes:
```json
{ "company": { "id": "kebab-name", "name": "Example Corp", "ticker": "EXMP", "asOf": "YYYY-MM-DD", "memo": "memo title" },
  "pillars": [ { "id": "P1", "short": "Margin Compression", "title": "Margin Compression",
    "claim": "Margins hold as glasses scale.",
    "why": ["<fact with a number from the memo>", "...", "..."],
    "killCriteria": "<the memo's own kill condition>",
    "status": "stable", "statusReason": "The margin looks better than it is, because part of it came from one-off refunds.", "nextCheck": "Feb 2027 FY results" } ] }
```
Only use claims, numbers and dates from the memo. Never invent a thesis point.

### The 6 scouts (each researches only its lane)
- **supply-scout**: the ecosystem upstream: components and makers behind the company's key products and behind its partners' and rivals' products, input costs, chips, factories.
- **suppliers-scout**: the company's **own** key suppliers: materials, components, manufacturing geography. Only material ones. Mark any relationship the company hasn't confirmed as "reported".
- **buyers-scout**: key buyers and revenue partners: top customers, licensors, channels, and **whether they can keep paying** (cash flow, capex, losses). Only significant ones, never 1% accounts. Example: for Nvidia, Google is a must because it's one of the biggest buyers.
- **demand-scout**: downstream demand: retail channels, pricing and discounting, market-share trackers (IDC, Counterpoint, Omdia, etc.), sell-through.
- **rivals-scout**: competitors and substitutes, who partners with whom, launch dates, share data, anyone going around the company.
- **policy-scout**: owners and governance, regulators, legal cases, tariffs, FDA-type approvals, FX and macro.

Rules for every scout:
- Prefer news from the last 90 days. Older items only for structural facts (who supplies whom, contract end dates).
- Open every source. Real URL, exact date, a short exact quote or number from the source. If you can't date it or open it, drop it.
- 6-12 nodes and 8-15 signals per lane. Quality over quantity.
- Use shared node ids across lanes so they merge (e.g. `meta`, `google`, `apple`, `applied-materials`).
- Return JSON only, and save it to `data/lanes/<lane>.json`:
```json
{ "lane": "suppliers",
  "nodes": [ { "id": "supplier-co", "label": "Supplier Co", "type": "company|regulator|person|product|index|event",
      "role": "partner|supplier|customer|competitor|owner|regulator|channel|substitute|other",
      "tier": 1, "connectsTo": ["example-corp"], "relation": "what links it",
      "pillars": ["P3"], "summary": "1 sentence",
      "domain": "supplierco.com",
      "brief": ["Polycarbonate resin producer", "One sentence under 20 words: why it matters to the stock."],
      "health": "Under 16 words with a number: how this company is doing / can it keep paying." } ],
  "signals": [ { "nodeId": "supplier-co", "pillar": "P3", "date": "2026-10-15",
      "headline": "<dated headline from the source>",
      "direction": "positive|negative|mixed", "magnitude": 1, "horizon": "near|long",
      "whyItMatters": "1 sentence: the ripple path back to the stock",
      "evidence": "short exact quote or number", "url": "https://...", "sourceName": "MarketScreener" } ] }
```
`tier`: 1 = deals with the company directly, 2 = one step removed, 3 = two steps. `direction` is from **the user's position's** point of view (if they are short, good news for the company is negative for them). `magnitude`: 1 minor, 2 notable, 3 thesis-moving.

### 8. metrics-agent
Always the same 12 metrics so every company is comparable. Default source: the stockanalysis.com statistics page for the ticker (works for US and international, e.g. `/stocks/<ticker>/statistics/` or `/quote/<exchange>/<ticker>/statistics/`). Credit rating from the company's IR page or S&P/Moody's ("Unrated" if none). Historical P/E from GuruFocus 10-yr median. If a value doesn't exist write "n/a", never drop the box.
- **RISK (6):** Net debt / EBITDA · Interest cover · Credit rating · Altman Z · Beta (5Y) · 52-wk change
- **VALUATION (6):** P/E trailing · P/E forward · P/E 10-yr median · EV / EBITDA · FCF yield · PEG
```json
{ "price": { "value": "€173.00", "asOf": "...", "source": "..." },
  "risk": [ { "label": "Net debt / EBITDA", "value": "2.3x", "read": "Moderate. Rising.", "asOf": "LTM", "source": "url" } ],
  "valuation": [ ... ] }
```
Each `read` is under 6 words, cold and plain.

### 9. verifier
Fetch every signal URL. Write `data/verify.json` keyed by URL: `{ status, ok, hardFail }`. `hardFail` = 404/410 or the page clearly doesn't support the headline. Bot blocks (403/429) are not hard fails if the scout quoted the page. Add "(unconfirmed)" to headlines that are single-source and contradict the memo. Print what was dropped.

### `scripts/herder-merge.mjs`
- Load `data/thesis.json`, add the center node (the user's company, tier 0, all pillars).
- Merge nodes by id: union `connectsTo` and `pillars`, keep the lowest tier and the longest summary, keep the first `domain`, `brief` and `health` found.
- Signals: treat the same `nodeId + pillar + date` as one event. If two scouts disagree on direction, mark it `mixed`. Drop signals whose URL `hardFail`ed.
- Remove links to nodes that don't exist. Orphan nodes attach to the center. Keep the scouts' tier (the lowest across lanes) even when a node links straight to the center, so 1st / 2nd / 3rd order stay meaningful.
- Write `{ company, pillars, nodes, signals }` to `data/ripple.json`.

---

## B. The app

**Stack:** Vite + vanilla JS + `3d-force-graph` + `three@latest` (set `resolve.dedupe: ['three']` in `vite.config.js` so only one copy loads) + `three-spritetext` + `d3-force-3d` (`forceRadial`). `npm run dev` on port 5190. Load Google Fonts: Inter (300-600), Newsreader (serif), JetBrains Mono.

### Look and feel
Inspired by coatue.com and iconiq.com, flipped to dark. Official and professional, not an AI demo.
- **Palette:** background `#0E0D0B` (warm black), panels `#141310`, hairlines `#26231E` / `#332F28`, text `#ECEAE3` (cream), secondary text `#8C867A`. Meaning colors: **sage `#8DB08F` = helps the position, terracotta `#D2774F` = hurts the position, gold `#D4AA5E` = mixed, `#5C574E` = mapped but no fresh news.**
- **Type:** titles in Newsreader serif, body in Inter, small uppercase labels and numbers in JetBrains Mono with letter-spacing.
- **Banned:** glow halos, bloom, particles flowing on links, curved links, purple, neon, emoji, rounded "cards", gradients on buttons. Faint vertical column lines every 25% across the map area (`rgba(236,234,227,.05)`) like Coatue's site.

### Layout: three columns
**Left panel (340px), top to bottom:**
1. Tiny label `RIPPLE MAP`. Then a round disc with the company's logo (ticker initials only if no logo can be found), the company name in serif, and the ticker in mono. **No date.**
2. `THESIS` header with `2 OF 3 HOLDING` on the right (strong + stable count as holding). Numbered rows `01`-`05`, separated by hairlines: serif title on the left, outlined mono status tag on the right (STRONG sage, STABLE cream, WEAK gold, BROKEN terracotta). Clicking a row expands it and filters the map to that thesis point. Clicking again collapses it and shows the whole map. When expanded:
   - one or two natural sentences on where the point stands
   - a two-column key/value block in mono labels: `WHY` (2-3 short bullets with numbers), `BREAKS IF`, `NEXT CHECK`, `NEWS` (`2 ▲  8 ▼  9 ◆` in sage / terracotta / gold)
3. `METRICS` header with the share price on the right. Then `RISK` and `VALUATION`, each a **2-column grid, 3 rows** (6 boxes), separated by thin vertical and horizontal lines with friendly padding. Each box: small mono uppercase label, big number (Inter ~19px), short grey read underneath. Hover shows as-of date and source. If a group ever has an odd count, the last box spans both columns.
4. `LEGEND` (helps / hurts / mixed / no news dots) **pinned to the bottom left** (`position: sticky; bottom: 0`) with a line above it.

**Center: the 3D map.**
- Top-left: only a mono breadcrumb when a thesis point is selected, e.g. `03 MARGIN COMPRESSION`. On the full map, nothing at all (never `ALL THESIS POINTS`). Bottom-left: a `RESET` button, then `1ST ORDER` and `2ND ORDER` buttons that show only the inner ring (direct ties) or the inner two rings, so the user can start close and widen out; clicking the lit one again, or `RESET`, brings back all three orders. Bottom-right: the hint `DRAG TO ROTATE · SCROLL TO ZOOM · CLICK A NODE`.
- Size the canvas to its container (`Graph.width(el.clientWidth).height(el.clientHeight)` plus a resize listener) so it's centered in the middle column, not the window.
- Background transparent so the panel color and column lines show.
- **Nodes:** each is a sprite made from a canvas texture: a cream disc (`#ECEAE3`) with the company logo drawn inside at ~62% of the disc, and a colored ring showing the net news direction for the selected thesis point (ring width ~7px, 3px if no news). Nodes without a usable logo get mono initials on a dark disc. The stock is the center node: a disc with its own logo like every other company (ticker initials only if no logo can be found). Sizes: center 26, tier 1 15, tier 2 12, tier 3 9.5. Label under each node with `three-spritetext` in Inter, cream for tier 0-1, grey for tier 2-3, parentheses stripped.
- **Net direction:** sum `magnitude` (positive +, negative −) over that node's signals for the selected thesis point. If it has both kinds and |score| ≤ 1, it's mixed.
- **Links:** straight, 1px, opacity ~0.6, colored by the source node's direction (`#3A362F` if none). No particles, no curvature.
- **3D layout:** `forceRadial` by tier at radius 75 / 150 / 215 (strength 1.2), charge −160, link distance 60 (strength 0.12), 600 warmup ticks, cooldown 5000 ms.
- **Depth cues (this is what makes it read as 3D without glow):** three dotted sphere shells at radius 75 / 150 / 215 made of Fibonacci-sphere points (1400 / 2600 / 3800 points, size 1.1, cream, opacity 0.38 / 0.26 / 0.18, no depth write), plus `scene.fog = new THREE.FogExp2(0x0E0D0B, 0.00085)` so far dots fade.
- **Camera:** slow auto-orbit from a tilted angle (step π/900 every 30 ms, camera y = 0.42 × distance, distance fitted to the map's size, at most 560 for the whole map and 430 when filtered). It rotates at all times. It stops only when the user clicks a node or drag the map by hand. Scroll-zoom keeps it rotating. `RESET` flies back to the default view, closes the drawer and starts the rotation again; picking a thesis point does the same.
- **Filtering:** when a thesis point is selected, show nodes tagged with it or with a signal for it, plus every node on their path back to the center so the map stays connected.
- **Click a node:** the camera moves in along the line from the center through that company (1 s) and the right drawer opens. The pivot never leaves the center stock. Click the background to close it.
- **Rigid map:** the camera always rotates around the center stock. No panning, no dragging dots. The layout freezes once it settles, and every thesis filter keeps each company in the same spot.
- **Zoom:** in as close as you like, out only to a set distance (orbit controls min 60, max 650).
- **Sharp:** node discs are drawn on 512px canvases with mipmaps and max anisotropy; labels at high texture resolution; device pixel ratio up to 3.

**Right drawer (400px, slides in): short and important only, no paragraphs.**
- Header: logo (or initials), name in serif, role in small mono uppercase (3-6 words from `brief[0]`).
- A key/value block:
  - `IMPACT`: `▲ Helps you` / `▼ Hurts you` / `◆ Mixed` (colored) · `thesis 01 · 03` · `near term` or `long term` (majority of its signals)
  - `WHY`: `brief[1]`, one sentence
  - `HEALTH`: the health line, when present
  - `CHAIN`: shortest path from this node to the user's company, e.g. `Supplier Co → Customer Co → Example Corp`
- `NEWS` header with a count, then each signal newest first as a collapsed row: `▼ Nov 18, 26  Counterpoint` in mono, then the headline in serif (strip a leading "Source:" prefix and capitalize). Clicking the row expands the why-it-matters line, the quote in mono, and a `SOURCE ↗` link.

### Logos
Every company and regulator gets its real logo. `npm run logos` tries, in order: a manual URL in `data/logo-urls.json`, Google s2 favicon (256), icon.horse, apple-touch-icon, the site's own icon links, the official Wikidata/Commons logo, DuckDuckGo. Square icons must be at least 48px; wordmarks and SVGs are fine and are fitted inside the disc without stretching. White/light logos get the dark disc. Anything still missing must be fixed by hand: find the official logo image URL and put it in `data/logo-urls.json`. Initials only for people, products, indices and events, and always for the center node.

### Writing style (every piece of text in the app)
Write the way you'd say it to someone across the table in a pitch: plain, full sentences, the specific number or name that makes the point, no clipped shorthand (not "Supplier ramps; demand unproven"). No hype, no filler, no em dashes, no emoji.
- **Thesis titles are 1-3 word headers, like memo section headers:** Margin Compression, Display Lens, Governance, Demand Pause, Customer Concentration. Never a sentence.
- Status lines are one or two natural sentences with the deciding number in them.
- WHY bullets are facts with numbers ("Gross margin is 61%, down two points from last year.").
- Metric reads under 6 words ("Safe zone, above 3.0.").
- No em dashes, no hype, no "AI-powered" anything.

---

## Done means
- `/ripple memo.pdf` runs end to end, and `npm run dev` shows the company with honest thesis statuses.
- Each thesis point filters the map. Every dot opens a card with IMPACT / WHY / HEALTH / CHAIN and real, dated, linked news.
- The map includes the company's own key suppliers and key buyers (with whether they can keep paying), not just companies in the news.
- All 12 metrics show, with sources on hover.
- The verifier ran, and a short report lists anything dropped or unconfirmed.
- Re-running `/ripple` later refreshes the news, statuses and metrics without rebuilding the app.
- Test it on a second memo (a different company, long or short) and confirm the layout and the 12 metrics still fill cleanly.
