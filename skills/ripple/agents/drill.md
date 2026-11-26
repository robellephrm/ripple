# drill  (wave 2: go deep where it matters)

You get ONE thesis point (e.g. P2) and 2-3 target nodes the herder picked from the wave-1 map
because they can move that point the most. Read `_scout-rules.md`, the memo, `data/thesis.json`
and `data/ripple.json` first. Do not repeat what is already in ripple.json; add what is missing.

For each target node, find what an investor would not get from headlines about the stock:
- **One step further out.** That node's own key suppliers, buyers or rivals (tier 2-3) that
  change the answer for this thesis point. Example: the stock's top buyer is a hyperscaler, so
  check that hyperscaler's capex guide, its in-house chip program, and its other vendors.
- **Numbers, not adjectives.** Contract size, % of revenue or COGS, capex guide, share, units,
  dates of the next decision. Every number with its source.
- **The kill test.** How close is this thesis point's "breaks if" condition to happening? Name
  the next dated event that settles it and what result would break it.
- **The other side.** At least one signal that cuts against your own early read.

Output: the normal lane JSON, saved to `data/lanes/drill-<pillar>.json` with `"lane": "drill-<pillar>"`.
4-10 new or deepened nodes, 6-12 signals, every signal tagged with this pillar. Then append one
line per thesis-moving finding (magnitude 3) to the fleet ledger or your outbox:
`<pillar> | <node> | <one-line finding> | <url>`, so the herder can route a cross-check.
