# Evaluating Ad Preflight on real ads

Put real past ads in `eval/private/ads.json`. That folder is git-ignored and is
never published. Format (see `example-ads.json`, which is invented and safe to share):

```json
[
  { "id": "r1", "category": "health", "primary": "...", "headline": "...", "description": "...",
    "outcome": "rejected", "reason": "what Meta said, if known" }
]
```

- `category`: `general`, `health`, `weight`, `beauty` or `sexual-wellness`
- `outcome`: `approved` or `rejected` (what Meta actually did)

Run:

```bash
npm run eval
node eval/run-eval.mjs eval/example-ads.json
```

It prints each ad's verdict and rule hits, then:

- **Rejected ads caught**: Meta rejected it and Ad Preflight said *Risky* or *Likely rejected*.
- **Approved ads wrongly marked "Likely rejected"**: false alarms.
