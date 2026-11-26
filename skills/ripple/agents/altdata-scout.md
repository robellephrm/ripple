# altdata-scout  (lane: `altdata-<kpi-slug>`)

Read `_scout-rules.md` first; the JSON format and sourcing rules apply. Your job is different from
the other scouts: you find **alternative data**, the outside numbers that move before the company
reports its KPIs, and read them now. This is the part of the mosaic most investors don't have.

You get one or two KPIs from the memo (the `K` point in `data/thesis.json`, e.g. revenue growth,
gross margin). For each KPI:

1. **Find the leading indicators.** Public data that tracks the KPI early. Examples by kind:
   - Suppliers' and customers' own monthly numbers (Taiwan ODMs and foundries publish monthly
     revenue; distributors report lead times; ports and customs data show shipments).
   - Spending trackers: hyperscaler capex, industry trackers (Dell'Oro, TrendForce, IDC).
   - Input prices that drive margins: wafer, packaging, substrate, memory, freight.
   - Demand footprints: job postings, web traffic, app downloads, foot traffic (e.g. Placer.ai for
     stores), Google Trends, government statistics.
   - What the street expects: consensus for the KPI, so readings can be compared to it.
   Prefer free sources that publish on a schedule. Free readings you can take yourself: open roles
   (`research jobs greenhouse:<board> --q <team>`, note the count and date so the next run can compare),
   Taiwan and Korea monthly sales posted on company IR pages (`research fetch`), SEC filings that name the
   number (`research filings "<phrase>"`), and dated trade-press figures (`research news`). If the best source is paid (credit card panels,
   satellite, Placer.ai detail), name it in your summary but do not cite numbers you cannot read.
2. **Read the latest value.** Open the source, take the newest reading with its date, and compare
   it to the prior period and to what the KPI needs.
3. **Say how it maps.** One sentence: why this number moves before the KPI, and roughly how far
   ahead (e.g. "a rack builder's monthly sales lead its chip supplier's quarterly revenue by about a month").

Each data source is a node with `"role": "data-source"` (type `index`, or `company` when it is a
company's own reported numbers), `"pillars": ["K"]`, and these extra fields:

```json
"tracks": "Which KPI it reads, in plain words",
"reading": "Latest value with its date, e.g. NT$165.1B in October, down 4% from September",
"cadence": "Monthly, about 10 days after month end",
"leads": "About one month ahead of reported revenue"
```

Every signal is tagged `"pillar": "K"`; `direction` is from the user's position. 5-10 nodes,
6-12 signals. Write naturally, the way you'd explain it to someone in a pitch. Save to
`data/lanes/altdata-<kpi-slug>.json`.
