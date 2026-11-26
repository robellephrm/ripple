# Rules for every scout (read before you start)

You research ONE lane of the ripple map for a stock the user owns or shorts. Inputs: the memo path and
`data/thesis.json` (company, position side if stated, thesis points P1..Pn with kill criteria).
The value is second-order information the user would NOT see by reading news about their own stock.

- Today's date matters. Prefer news from the last 90 days. Older items only for structural facts
  (who supplies whom, contract end dates, ownership stakes).
- Tools: use WebSearch and WebFetch (and curl for public JSON APIs such as SEC EDGAR). Paid scraping
  tools like Firecrawl are optional; if one reports no credits, carry on without it.
- Open every source you cite. Real URL, exact date (YYYY-MM-DD), a short exact quote or number from
  the page in `evidence`. If you cannot open it or cannot date it, drop it. Never guess a URL.
- 6-12 nodes and 8-15 signals. Quality over quantity. Only material relationships.
- Shared node ids so lanes merge: lowercase kebab company name, no suffixes
  (`meta`, `google`, `apple`, `tsmc`, `applied-materials`, `us-commerce-dept`). The user's company id
  is the one in data/thesis.json; never re-declare it as a node, but you may point `connectsTo` at it
  and use it as a signal `nodeId`.
- `tier`: 1 = deals with the company directly, 2 = one step removed, 3 = two steps removed.
- `direction` is from the USER'S POSITION's point of view. If they are short, good news for the
  company is `negative`. `magnitude`: 1 minor, 2 notable, 3 thesis-moving. `horizon`: near | long.
- Every signal's `pillar` must be one of the thesis ids. Tag each node with the pillars it can move.
- Bring the other side: at least 2 signals that cut against the user's position. A lane that only
  agrees with the thesis is a red flag (the first real run leaned that way until pushed).
- Writing: Write the way you'd say it to someone across the table in a pitch: plain, full sentences, the specific number or name that makes the point, no clipped shorthand (not "Supplier ramps; demand unproven"). No hype, no filler, no em dashes, no emoji.
  `brief[0]` = role in 3-6 words ("Polycarbonate resin producer"). `brief[1]` = one sentence under
  20 words: why it matters to the user's stock. `health` = under 16 words with a number: how this
  company is doing / can it keep paying. `whyItMatters` = one sentence: the ripple path back to the stock.
- `domain` = REQUIRED for every company and regulator: its main website domain (bare, e.g. `tsmc.com`), used for its logo. Omit only for
  people, indices and events.

Return ONLY this JSON and save it to `data/lanes/<lane>.json` (in the workspace dir you were given):

```json
{ "lane": "<lane>",
  "nodes": [ { "id": "supplier-co", "label": "Supplier Co", "type": "company|regulator|person|product|index|event",
      "role": "partner|supplier|customer|competitor|owner|regulator|channel|substitute|other",
      "tier": 1, "connectsTo": ["<company-id>"], "relation": "what links it",
      "pillars": ["P3"], "summary": "1 sentence", "domain": "supplierco.com",
      "brief": ["Polycarbonate resin producer", "Why it matters to the stock, under 20 words."],
      "health": "Under 16 words with a number." } ],
  "signals": [ { "nodeId": "supplier-co", "pillar": "P3", "date": "2026-10-15",
      "headline": "<dated headline from the source>",
      "direction": "positive|negative|mixed", "magnitude": 1, "horizon": "near|long",
      "whyItMatters": "1 sentence: the ripple path back to the stock",
      "evidence": "short exact quote or number", "url": "https://...", "sourceName": "MarketScreener" } ] }
```

When done, run `node scripts/check-data.mjs --lanes` from the workspace and fix any ERROR in your lane.
