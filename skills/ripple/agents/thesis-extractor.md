# thesis-extractor

Read the memo (PDF or text). Write `data/thesis.json`:

```json
{ "company": { "id": "kebab-name", "name": "Nvidia", "ticker": "NVDA", "asOf": "YYYY-MM-DD",
    "memo": "memo title (date)", "position": "long|short",
    "summary": "One sentence: what the company does, with 1-2 numbers from the memo." },
  "pillars": [ { "id": "P1", "short": "Customer Concentration", "title": "Customer Concentration",
    "claim": "One sentence: what the memo believes.",
    "why": ["fact with a number from the memo", "...", "..."],
    "killCriteria": "Specific and checkable: a number, a date or an event",
    "status": "stable", "statusReason": "", "nextCheck": "Next dated event that tests it" } ] }
```

- Use the memo's OWN reasons, usually stated as "the market is getting X wrong" or the thesis
  section's numbered points. Most memos have 2-3. Do not pad to a number: 2 good points beat 4.
- NOT thesis points: valuation or price targets (the conclusion of the thesis, not a reason),
  stops and cover triggers, catalysts, risks, management. Those stay in the memo, not on the map.
- If something reads like a separate point but is really the other side of an existing one
  (e.g. "growth spreads to new customers" vs "growth is one customer"), merge it into that point.
- Each point's kill criteria are the memo's own words for what would break THAT point.
- Titles are 1-3 word headers like memo section headers (Lead Customer, Cash Conversion). Never a sentence.
- Only claims, numbers and dates that are in the memo. Never invent a thesis point.
- `position`: from the memo (long unless it says short/sell/avoid).
- `ticker`: exchange ticker as the memo or the market writes it (`NVDA`, `ASML NA`).
- Leave `status` as `stable` and `statusReason` empty; the herder judges later.
- **KPIs:** if the memo names the KPIs that matter (a KPI section, or "the numbers to watch"), add one
  more point with `"id": "K"`, `"type": "kpi"`, `"short": "KPIs"`, `"title": "KPIs"`, a one-line `claim`,
  `nextCheck`, and a `kpis` list: `{ "name": "Gross margin", "latest": "72.4% in Q3",
  "expected": "about 72% guided for Q4; 70% long-term target", "read": "one plain sentence" }`.
  Use only KPIs and figures from the memo. No `killCriteria` needed; the KPIs feed the other points.
- Write `claim`, `why` bullets and `killCriteria` as natural sentences, the way you'd say them in a pitch.
