# Ad Preflight

Check Meta (Facebook and Instagram) ad copy against Meta's own Advertising
Standards before you hit publish. Paste the primary text, headline and
description, pick a category, and get a verdict, the exact words that are
likely to get the ad rejected, the rule each one breaks with a link to Meta's
policy page, and a safer rewrite of each flagged line.

Everything runs in your browser. The rules are plain JavaScript, and the
rewrites come from Gemma 3 1B running on your own device through WebGPU.
Nothing you paste is sent anywhere.

**Try it:** DEMO_URL

Built for the [DEV Hacktoberfest Open-Source AI Challenge, Week 2: Side Hustle](https://dev.to/challenges/hacktoberfest-week2-2026-10-12).

## Who it's for

Freelance media buyers and small direct-to-consumer brands. A rejected ad costs
a day of review time, and a pattern of rejections can restrict the whole ad
account. Ad Preflight catches the common problems before Meta does, and because
it runs on the customer's device it costs nothing to run per check.

## What it checks

| Rule | Catches | Severity | Meta policy |
|---|---|---|---|
| Personal attribute | "Are you diabetic?", "Meet other Buddhists", "Your ballot..." and questions that assume a condition | Likely rejected / Risky | [Privacy Violations and Personal Attributes](https://transparency.meta.com/policies/ad-standards/objectionable-content/privacy-violations-personal-attributes/) |
| Cure claim | cure / heal / reverse + a condition Meta lists | Likely rejected | [Health and Wellness](https://transparency.meta.com/policies/ad-standards/restricted-goods-services/health-wellness/) |
| Results in a set time | "clear skin in 7 days" with no "results vary" | Risky | Health and Wellness |
| Exaggerated claim | miracle, instant results, lose 10 kg | Risky | Health and Wellness |
| Attacks appearance | "ugly skin", "gross belly fat" | Likely rejected | Health and Wellness |
| Guarantee | guaranteed results or returns (money-back is fine) | Risky | [Prohibited Commercial Practices](https://transparency.meta.com/policies/ad-standards/deceptive-content/prohibited-commercial-practices/) |
| Unverified endorsement | doctor-recommended, #1 rated, clinically proven | Risky | Prohibited Commercial Practices |
| Profanity | including partly masked words like f\*!%ing | Likely rejected | [Profanity](https://transparency.meta.com/policies/ad-standards/objectionable-content/profanity/) |
| Explicit sexual language | any category | Likely rejected | [Adult Sexual Solicitation and Sexually Explicit Language](https://transparency.meta.com/policies/ad-standards/objectionable-content/adult-sexual-solicitation-and-sexually-explicit-language/) |
| Pleasure-focused | Sexual wellness category: pleasure, toys, "in the bedroom" instead of health | Likely rejected | Health and Wellness |

Meta's own allowed and not-allowed example phrases for personal attributes are
part of the test suite.

## How the rewrites stay safe

A 1B model is not trusted to judge anything. The rules decide what is wrong;
Gemma only proposes a new line, and that line goes back through every rule
before you see it. If two tries still break a rule, the page says so instead of
showing an unsafe suggestion.

MEASURED_TIMINGS

## Privacy

- No server, no account, no analytics, no third-party scripts or fonts.
- Checking needs no network at all. The first *Write a safer version* downloads
  the model once (~785 MB) from Hugging Face and keeps it in your browser's
  private storage; after that, rewrites work offline too.

## Run it locally

```bash
npm test
npm run serve
```

Then open http://localhost:8080. `npm run eval` scores the rules against real
past ads (see `eval/README.md`).

## First-user results

EVAL_RESULTS

## Credits and licences

- Code: MIT, see [LICENSE](LICENSE).
- Gemma 3: [Gemma Terms of Use](https://ai.google.dev/gemma/terms).
- Transformers.js (Apache-2.0) and onnxruntime-web (MIT), vendored in `vendor/`.

Ad Preflight is a pre-check, not legal advice and not a guarantee: Meta's
reviewers make the final call.
