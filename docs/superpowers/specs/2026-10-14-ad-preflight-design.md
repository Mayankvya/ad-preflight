# Ad Preflight - design

Date: 2026-10-14
Status: approved in chat, awaiting written-spec review
Entry for: DEV Hacktoberfest Open-Source AI Challenge, Week 2 "Side Hustle"
Deadline: 18 Oct 2026, 11:59 PM PDT (19 Oct, 12:29 PM IST)

## Goal

A web page where a small brand or freelance media buyer pastes Meta ad copy
before launching it and learns, in seconds, which lines are likely to get the ad
rejected, which Meta rule each one breaks, and a safer rewrite of each flagged
line. Nothing pasted leaves the device.

Success means:
- every rule is backed by Meta's own written Advertising Standards and links to it;
- Meta's own allowed / not-allowed example phrases pass as unit tests;
- on 15-20 real past ads from the first user (a D2C wellness brand), we report
  how many rejected ads were caught and how many approved ads were wrongly flagged;
- a judge can open a public link in desktop Chrome or recent Android Chrome and use it.

Out of scope: image/creative text (OCR), video, landing pages, accounts, any server,
calling Meta's APIs, legal advice. The page says plainly that it is a pre-check, not a
guarantee.

## Who pays and why

Freelance media buyers and small D2C brands lose days to rejected ads, and a
rejection history can restrict the ad account. A pre-check that runs on their own
device costs the maker nothing per use, so a small subscription (for example $5/month
for the rule packs) is almost all margin. Unreleased ad copy stays private.

## Flow

1. **Paste** - fields: Primary text, Headline, Description (all optional, at least
   one required). Category: General, Health & supplements, Weight loss, Beauty,
   Sexual wellness. Button: *Check ad*.
2. **Result** (instant, rules only, no model needed):
   - a verdict: *Likely fine* / *Risky* / *Likely rejected*;
   - the ad text with each flagged phrase highlighted;
   - one card per finding: the exact words, what the rule says in one plain
     sentence, severity, and a link to the Meta policy page.
3. **Safer version** - per flagged line, *Rewrite* asks Gemma (on device) for a
   safer line that keeps the selling point. The rewrite is checked by the same rules
   before it is shown; if it still breaks a rule after two tries, the card says
   "Couldn't find a safe version - edit this line by hand." *Copy* on each rewrite.

First use of *Rewrite* triggers the one-time model download (~763 MB) with a progress
bar; checking never needs the model, so the page is useful instantly.

## Rules

`js/rules.js` exports `checkAd({ primary, headline, description }, category)`
returning `{ verdict, findings }`. Each finding:
`{ ruleId, field, start, end, text, severity: 'reject' | 'risk', why, policy: { title, url } }`.

Verdict: any `reject` -> *Likely rejected*; else any `risk` -> *Risky*; else *Likely fine*.

| Rule id | Catches | Severity | Meta policy |
|---|---|---|---|
| `personal-attribute` | Asserting or implying a personal attribute: questions ("Are you...", "Do you have...", "Struggling with...", "Suffering from...") or "other/fellow X" about health, medical conditions, finances, age, religion, sexual orientation or practices, gender identity, disability, race, criminal record | reject | Privacy Violations and Personal Attributes |
| `cure-claim` | cure / heal / eliminate / reverse + a condition Meta lists (diabetes, herpes, thyroid, psoriasis, Ebola, cancer, autism, Alzheimer's, Parkinson's, ALS, HIV) | reject | Health and Wellness |
| `timeframe-promise` | A specific outcome in a set time ("in 7 days", "overnight") with no qualifier ("results vary", "individual results") - health, weight loss, beauty | risk | Health and Wellness |
| `extreme-claim` | Sensational or exaggerated claims: miracle, instantly, 100% effective, permanent results, never again | risk | Health and Wellness |
| `appearance-attack` | Negative terms attacking appearance, body parts or hygiene ("ugly", "gross belly fat", "embarrassing odour") | reject | Health and Wellness |
| `guarantee` | guaranteed results / returns, risk-free results | risk | Prohibited Commercial Practices |
| `endorsement` | Unverified endorsement: "doctor recommended", "#1 rated", "clinically proven" | risk | Prohibited Commercial Practices |
| `profanity` | Profanity, including partly masked words (f\*!%ing, s\*\*t) | reject | Profanity |
| `sexual-explicit` | Explicit sexual language or discussing sexual practices or experiences | reject | Adult Sexual Solicitation and Sexually Explicit Language |
| `sexual-pleasure` | Sexual wellness category only: framing on pleasure or enhancement (orgasm, pleasure, climax, toy, "spice up the bedroom") instead of health | reject | Health and Wellness (Adult Products and Reproductive Health) |

Meta's own permitted cases are respected: passing references to gender or age groups,
"you/your" with no attribute, broad references ("New Yorker"), and health statements
that don't say the reader has the condition ("Bulimia counseling available").

## Architecture

Static site, no build step, no backend.

```
index.html, css/app.css   one page: form, result, finding cards
js/app.js                 UI wiring only
js/rules.js               pure rule engine + verdict          (unit tested)
js/policies.js            policy titles + URLs                (unit tested via rules)
js/highlight.js           ad text -> segments with flagged spans (unit tested)
js/rewrite.js             prompt building, output cleaning, "verify with rules,
                          retry once" logic                    (unit tested)
js/ai-worker.js           Gemma 3 1B via Transformers.js on WebGPU (from Walk Notes)
js/ai-client.js           promise client, idempotent load      (from Walk Notes, tests kept)
js/opfs-cache.js          model files on the private file system (from Walk Notes, tests kept)
js/progress.js            download bar                          (from Walk Notes, tests kept)
sw.js                     offline app shell
vendor/                   transformers.min.js 4.3.0 + onnxruntime-web wasm
eval/                     run-eval.mjs + README; eval/private/ is git-ignored
dev/serve.mjs             local static server
```

Model: `onnx-community/gemma-3-1b-it-ONNX-GQA`, dtype `q4f16`, WebGPU with
`shader-f16`. Without it, checking still works and *Rewrite* explains that this
browser can't run the model.

## First-user evaluation

The first user's ads go in `eval/private/ads.json` (git-ignored, never published):
`[{ "id", "category", "primary", "headline", "description", "outcome": "approved" | "rejected", "reason"? }]`.
`npm run eval` prints: rejected ads caught (verdict *Risky* or *Likely rejected*),
approved ads wrongly flagged as *Likely rejected*, and the rule hits per ad. The post
reports only these counts and anonymised example lines the team agrees to share.

## Privacy

No server, analytics, third-party scripts or fonts. Network: the app's own files and,
only if *Rewrite* is used, the one-time model download from Hugging Face.

## Error handling

| Case | Behaviour |
|---|---|
| All fields empty | "Paste at least one field" |
| Very long text (>5,000 chars) | Check it anyway; rewrite only flagged lines |
| No WebGPU / no f16 | Rewrite button explains; checking still works |
| Download interrupted | Retry; finished files are kept |
| Rewrite still breaks a rule after 2 tries | Say so; no unsafe suggestion shown |
| Gemma returns empty or chatter | Clean it; empty -> counts as a failed try |

## Testing

- Unit tests (`node --test`): every rule with Meta's own allowed and not-allowed phrases
  plus our own cases; verdict; highlight spans; rewrite cleaning and retry logic; the
  reused Walk Notes modules keep their tests.
- Browser pane: full flow incl. rewrite on this laptop.
- First user: the eval above.

## Hosting and submission

Public repo `ad-preflight` on Mayank's personal GitHub account (sign in with
`gh auth login` first), MIT licence, GitHub Pages. DEV post drafted with the Week 2
template, tags `devchallenge, hf26challenge, gemma, opensource`, entering
*Best Use of Gemma*; saved as a private draft for Mayank to finish and publish.
