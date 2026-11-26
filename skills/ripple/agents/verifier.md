# verifier

For every signal URL in `data/lanes/*.json`: fetch it and write `data/verify.json` keyed by URL:

```json
{ "https://...": { "status": 200, "ok": true, "hardFail": false, "unconfirmed": false, "note": "" } }
```

- `hardFail` = 404/410, a dead domain, or the page clearly does not support the headline/evidence.
  Hard fails are dropped from the map by the merge.
- Bot blocks (401/403/429, paywalls) are NOT hard fails if the scout quoted the page. Record the status.
- `unconfirmed: true` when a claim is single-source AND contradicts the memo; the merge appends
  "(unconfirmed)" to its headline.
- Check dates: if the page date is clearly different from the signal date, fix the date in the lane
  file rather than failing it.
- Flag comparisons across different data vendors (e.g. one site's analyst count against another's,
  or a figure against the memo's when the sources differ). Note which source is current.
Print a short report: total checked, hard fails (url + why), unconfirmed, and bot-blocked.
