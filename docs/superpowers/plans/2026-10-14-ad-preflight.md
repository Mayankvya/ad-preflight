# Ad Preflight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static web page that checks pasted Meta ad copy against rules grounded in Meta's written Advertising Standards, highlights risky phrases with links to the policy, and writes rule-verified safer rewrites with Gemma 3 1B running on the device.

**Architecture:** Plain HTML/CSS/ES modules, no build step, no backend. The rule engine (`rules.js`), text layout (`highlight.js`) and rewrite logic (`rewrite.js`) are pure modules tested with `node --test`. Gemma runs in a Web Worker through vendored Transformers.js 4.3.0 on WebGPU, with model files stored on the Origin Private File System; those three modules (`opfs-cache.js`, `progress.js`, `ai-client.js`) are carried over from Walk Notes with their tests.

**Tech Stack:** HTML, CSS, vanilla JS (ES2022), `@huggingface/transformers` 4.3.0 and `onnxruntime-web` 1.31.0-dev.20260914-8d85527a0 wasm (both vendored), Node 24 `node:test`, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-10-14-ad-preflight-design.md`

## Global Constraints

- No backend, analytics, third-party scripts or fonts. Network: own files + (only after *Write a safer version*) the one-time model download from huggingface.co.
- Model `onnx-community/gemma-3-1b-it-ONNX-GQA`, dtype `q4f16`, `device: 'webgpu'`; requires `shader-f16`. Checking must work without the model.
- Categories (exact ids/labels): `general` General, `health` Health & supplements, `weight` Weight loss, `beauty` Beauty, `sexual-wellness` Sexual wellness.
- Fields: `primary` Primary text, `headline` Headline, `description` Description.
- Verdicts: `fine` "Likely fine", `risky` "Risky", `rejected` "Likely rejected". Any `reject` finding -> rejected; else any `risk` -> risky.
- Every finding links to its Meta policy page (URLs in `js/policies.js`, copied from transparency.meta.com on 14 Oct 2026).
- A rewrite is shown only if `checkAd` finds nothing in it; max 2 tries, then "Couldn't find a safe version - edit this line by hand."
- The page states: a pre-check, not a guarantee; nothing pasted leaves the device.
- `eval/private/` is git-ignored and never committed. The first user is named only as "a D2C wellness brand".
- Test command: `npm test` (= `node --test "tests/*.test.js"`). LF line endings. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Ordinary copy wrongly flagged** ("Free delivery in 2 days", "100% money-back guarantee", "Download instantly", "your order ships today", "Made by doctors"): no findings. A checker that cries wolf is useless. -> Task 2 false-positive test.
2. **Case, punctuation and curly quotes** ("ARE YOU DIABETIC??", "Cure Alzheimer’s"): still caught, with spans pointing at the original characters. -> Task 2 test.
3. **Several rules hitting the same words**: highlighting never duplicates or drops text, and a `risk` hit inside a `reject` hit of the same rule is dropped. -> Task 1 (dedupe) and Task 3 (segments) tests.
4. **Gemma echoes the original, returns chatter, or returns a line that still breaks a rule**: counts as a failed try; never shown. -> Task 4 tests.
5. **Empty or whitespace-only fields**: "Paste at least one field" instead of a "Likely fine" verdict on nothing. -> Task 1 `isEmptyAd` test.

---

### Task 1: Scaffold, policies, rule engine core, personal-attribute rule

**Files:**
- Create: `package.json`, `.gitignore`, `js/policies.js`, `js/rules.js`, `tests/rules-core.test.js`

**Interfaces:**
- Produces (`js/policies.js`): `POLICIES: Record<'personalAttributes'|'healthWellness'|'commercialPractices'|'profanity'|'sexualLanguage', { title: string, url: string }>`
- Produces (`js/rules.js`):
  - `CATEGORIES: Array<{id, label}>`, `FIELDS: ['primary','headline','description']`
  - `RULES: Array<{ id, title, severity: 'reject'|'risk', categories: string[] | null, why: string, policy, find(text: string, ctx: {category, qualified: boolean}) => Array<{start, end, severity?, why?}> }>`
  - `RULE_TITLES: Record<ruleId, string>`
  - `checkAd(ad: {primary?, headline?, description?}, category = 'general') => { verdict: 'fine'|'risky'|'rejected', findings: Finding[] }`, `Finding = { ruleId, field, start, end, text, severity, why, policy: {title, url} }`, findings sorted by field order then start.
  - `isEmptyAd(ad) => boolean`

- [ ] **Step 1: Scaffold**

`package.json`:
```json
{
  "name": "ad-preflight",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test \"tests/*.test.js\"",
    "serve": "node dev/serve.mjs",
    "eval": "node eval/run-eval.mjs"
  }
}
```

`.gitignore`:
```
node_modules/
.superpowers/
eval/private/
```

- [ ] **Step 2: Write the failing tests** - `tests/rules-core.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAd, isEmptyAd, CATEGORIES, RULE_TITLES } from '../js/rules.js';

const pa = (text, category = 'general') =>
  checkAd({ primary: text }, category).findings.filter(f => f.ruleId === 'personal-attribute');

// Meta's own examples, Privacy Violations and Personal Attributes (14 Oct 2026).
const META_NOT_ALLOWED = [
  'Meet other black singles near you!',
  'Are you Christian?',
  'Meet other Buddhists',
  'Are you 18 years old?',
  'Are you gay?',
  'Questioning your gender identity?',
  'Do you have diabetes?',
  'Are you bankrupt? Check out our services.',
  "Your ballot hasn't been received yet",
  'Dislike your Union rep? Join our union today.',
  'Are you a convicted felon?',
  "What is your driver's license number?",
];
const META_ALLOWED = [
  'Meet Hispanic men online now!',
  'Find black singles today.',
  'Date Christian singles!',
  'Meet seniors',
  'A service for teens',
  'Gay dating online now!',
  'Come meet transgender singles',
  'Bulimia counseling available',
  'Learn about voter registration',
  'We print customizable t-shirts and stickers with your name.',
];

for (const text of META_NOT_ALLOWED) {
  test(`Meta not-allowed is rejected: ${text}`, () => {
    const f = pa(text);
    assert.ok(f.length >= 1, 'expected a personal-attribute finding');
    assert.equal(f[0].severity, 'reject');
    assert.equal(checkAd({ primary: text }).verdict, 'rejected');
  });
}

for (const text of META_ALLOWED) {
  test(`Meta allowed passes: ${text}`, () => {
    assert.deepEqual(checkAd({ primary: text }).findings, []);
    assert.equal(checkAd({ primary: text }).verdict, 'fine');
  });
}

test('finding carries field, exact span, text, policy link', () => {
  const ad = { headline: 'Hi. Are you diabetic? Try our tea.' };
  const [f] = checkAd(ad).findings;
  assert.equal(f.field, 'headline');
  assert.equal(ad.headline.slice(f.start, f.end), f.text);
  assert.match(f.text, /Are you diabetic/i);
  assert.match(f.policy.url, /^https:\/\/transparency\.meta\.com\/policies\/ad-standards\/.+personal-attributes/);
});

test('implied condition question is a risk, not a reject', () => {
  const f = pa('Struggling with low energy? Try our gummies.', 'health');
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 'risk');
  assert.equal(checkAd({ primary: 'Struggling with low energy? Try our gummies.' }, 'health').verdict, 'risky');
});

test('a risk inside a reject of the same rule is dropped', () => {
  const f = pa('Struggling with diabetes? We can help.');
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 'reject');
});

test('findings are checked per field and sorted by field order', () => {
  const r = checkAd({ description: 'Are you gay?', primary: 'Are you Christian?' });
  assert.deepEqual(r.findings.map(f => f.field), ['primary', 'description']);
});

test('isEmptyAd', () => {
  assert.equal(isEmptyAd({}), true);
  assert.equal(isEmptyAd({ primary: '  \n ', headline: '' }), true);
  assert.equal(isEmptyAd({ description: 'x' }), false);
});

test('categories and rule titles are defined', () => {
  assert.deepEqual(CATEGORIES.map(c => c.id), ['general', 'health', 'weight', 'beauty', 'sexual-wellness']);
  assert.equal(RULE_TITLES['personal-attribute'], 'Personal attribute');
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm test` - Expected: FAIL, cannot find `js/rules.js`.

- [ ] **Step 4: Implement** - `js/policies.js`

```js
// Meta Advertising Standards pages each rule is grounded in (checked 14 Oct 2026).
const BASE = 'https://transparency.meta.com/policies/ad-standards';

export const POLICIES = {
  personalAttributes: { title: 'Privacy Violations and Personal Attributes', url: `${BASE}/objectionable-content/privacy-violations-personal-attributes/` },
  healthWellness: { title: 'Health and Wellness', url: `${BASE}/restricted-goods-services/health-wellness/` },
  commercialPractices: { title: 'Prohibited Commercial Practices', url: `${BASE}/deceptive-content/prohibited-commercial-practices/` },
  profanity: { title: 'Profanity', url: `${BASE}/objectionable-content/profanity/` },
  sexualLanguage: { title: 'Adult Sexual Solicitation and Sexually Explicit Language', url: `${BASE}/objectionable-content/adult-sexual-solicitation-and-sexually-explicit-language/` },
};
```

- [ ] **Step 5: Implement** - `js/rules.js` (core + personal-attribute; Task 2 appends the other rules to `RULES`)

```js
import { POLICIES } from './policies.js';

export const CATEGORIES = [
  { id: 'general', label: 'General' },
  { id: 'health', label: 'Health & supplements' },
  { id: 'weight', label: 'Weight loss' },
  { id: 'beauty', label: 'Beauty' },
  { id: 'sexual-wellness', label: 'Sexual wellness' },
];
export const FIELDS = ['primary', 'headline', 'description'];
const WELLNESS = ['health', 'weight', 'beauty', 'sexual-wellness'];

// Curly quotes become straight ones. Each is one UTF-16 unit both ways, so
// offsets found in the normalised text point at the same characters.
const normalize = s => s.replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"');

const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Longest first, so "union rep" wins over "union".
const alt = list => [...list].sort((a, b) => b.length - a.length).map(w => escape(w).replace(/\s+/g, '\\s+')).join('|');
const finder = (re, severity) => text => [...text.matchAll(re)].map(m => ({ start: m.index, end: m.index + m[0].length, severity }));

// ---- personal attributes -----------------------------------------------

// Things a person "has" (health, money, record): unsafe after "your".
const OWNED = [
  'diabetes', 'diabetic', 'depression', 'anxiety', 'adhd', 'cancer', 'hiv', 'aids', 'herpes', 'std', 'stds', 'sti', 'stis',
  'obesity', 'acne', 'eczema', 'psoriasis', 'arthritis', 'insomnia', 'infertility', 'erectile dysfunction', 'impotence',
  'premature ejaculation', 'low libido', 'menopause', 'pcos', 'ibs', 'thyroid', 'hair loss', 'balding', 'disability',
  'pregnancy', 'addiction', 'bulimia', 'anorexia', 'eating disorder', 'high blood pressure', 'hypertension', 'asthma',
  'autism', 'dementia', "alzheimer's", 'bankruptcy', 'debt', 'bad credit', 'criminal record', 'ballot', 'union rep',
];
// Everything Meta lists as a personal attribute, as nouns or adjectives.
const ATTRIBUTES = [
  ...OWNED,
  'depressed', 'anxious', 'obese', 'overweight', 'infertile', 'impotent', 'menopausal', 'bald', 'disabled', 'pregnant',
  'addicted', 'alcoholic', 'insomniac', 'autistic', 'bankrupt', 'in debt', 'broke', 'unemployed', 'low income',
  'senior', 'seniors', 'elderly', 'teen', 'teens', 'teenager',
  'christian', 'christians', 'muslim', 'muslims', 'hindu', 'hindus', 'jewish', 'jew', 'jews', 'buddhist', 'buddhists',
  'sikh', 'sikhs', 'catholic', 'catholics', 'atheist', 'atheists',
  'gay', 'lesbian', 'bisexual', 'queer', 'homosexual', 'sexually active', 'virgin',
  'transgender', 'trans', 'non-binary', 'nonbinary', 'gender identity',
  'black', 'asian', 'hispanic', 'latino', 'latina', 'latinx', 'african american',
  'convicted felon', 'felon', 'felons', 'ex-convict', 'voter', 'union',
];
const AGE = String.raw`\d{1,3}\s*(?:years?|yrs?)\s*old|over\s+\d{2}|under\s+\d{2}|in\s+your\s+\d0s`;
const ATTR = `${alt(ATTRIBUTES)}|${AGE}`;
const LEADS = alt([
  'are you', 'do you have', 'do you suffer from', 'have you been diagnosed with', 'struggling with', 'suffering from',
  'dealing with', 'living with', 'battling', 'questioning your', 'dislike your', 'worried about your', 'meet other', 'other', 'fellow',
]);

const PERSONAL = [
  finder(new RegExp(`\\b(?:${LEADS})\\s+(?:(?:a|an|still|really|currently)\\s+)?(?:${ATTR})\\b`, 'gi'), 'reject'),
  finder(new RegExp(`\\byour\\s+(?:[\\w'-]+\\s+){0,3}?(?:${alt(OWNED)})\\b`, 'gi'), 'reject'),
  finder(/\bwhat(?:'s|\s+is)\s+your\s+(?:driver'?s\s+licen[cs]e|social\s+security|ssn|passport|aadhaar|pan\s+card|bank\s+account|credit\s+card|password)/gi, 'reject'),
  // A question that assumes the reader has a problem: Meta treats implying a
  // condition like asserting it, but without a listed attribute it's a risk.
  finder(/(?<=^|[.!?]\s+)(?:struggling with|suffering from|dealing with|tired of|sick of|battling|fed up with)\b[^.!?\n]*\?/gim, 'risk'),
];

export const RULES = [
  {
    id: 'personal-attribute', title: 'Personal attribute', severity: 'reject', categories: null,
    why: 'Meta bans ads that assert or imply the reader\'s health, finances, age, religion, sexuality, race or other personal attributes. Talk about the product instead.',
    policy: POLICIES.personalAttributes,
    find: text => PERSONAL.flatMap(f => f(text)),
  },
];

export const RULE_TITLES = new Proxy({}, { get: (_, id) => RULES.find(r => r.id === id)?.title });

// Results qualifiers ("results may vary") anywhere in the ad soften
// timeframe promises.
const QUALIFIER = /results?\s+(?:may\s+)?vary|individual\s+results|results\s+(?:are\s+)?not\s+typical|with\s+(?:a\s+)?(?:healthy\s+)?(?:diet|exercise)/i;

const rank = f => (f.severity === 'reject' ? 2 : 1);
const overlaps = (a, b) => a.start < b.end && b.start < a.end;

// Within one rule and field: drop a finding if another overlapping one is more
// severe, or equally severe and strictly covers it, or is an earlier duplicate.
function dedupe(list) {
  return list.filter((f, i) => !list.some((g, j) => j !== i && g.ruleId === f.ruleId && g.field === f.field && overlaps(f, g) && (
    rank(g) > rank(f)
    || (rank(g) === rank(f) && g.start <= f.start && g.end >= f.end && (g.end - g.start > f.end - f.start || j < i))
  )));
}

export function isEmptyAd(ad) {
  return FIELDS.every(f => !(ad?.[f] ?? '').trim());
}

export function checkAd(ad, category = 'general') {
  const ctx = { category, qualified: QUALIFIER.test(normalize(FIELDS.map(f => ad?.[f] ?? '').join('\n'))) };
  const found = [];
  for (const field of FIELDS) {
    const raw = ad?.[field] ?? '';
    if (!raw.trim()) continue;
    const text = normalize(raw);
    for (const rule of RULES) {
      if (rule.categories && !rule.categories.includes(category)) continue;
      for (const hit of rule.find(text, ctx)) {
        found.push({
          ruleId: rule.id, field, start: hit.start, end: hit.end, text: raw.slice(hit.start, hit.end),
          severity: hit.severity ?? rule.severity, why: hit.why ?? rule.why, policy: rule.policy,
        });
      }
    }
  }
  const findings = dedupe(found).sort((a, b) => FIELDS.indexOf(a.field) - FIELDS.indexOf(b.field) || a.start - b.start);
  const verdict = findings.some(f => f.severity === 'reject') ? 'rejected' : findings.length ? 'risky' : 'fine';
  return { verdict, findings };
}

export { WELLNESS, alt, finder, normalize };
```

- [ ] **Step 6: Run to verify pass**

Run: `npm test` - Expected: all tests PASS. If a Meta example fails, fix the lexicon or pattern, never the example.

- [ ] **Step 7: Commit**

```bash
git add package.json .gitignore js/policies.js js/rules.js tests/rules-core.test.js
git commit -m "Add rule engine core and personal-attribute rule"
```

---

### Task 2: The other nine rules

**Files:**
- Modify: `js/rules.js` (append to `RULES`, before `RULE_TITLES`)
- Create: `tests/rules.test.js`

**Interfaces:**
- Consumes: `RULES`, `checkAd`, `WELLNESS`, `alt`, `finder` from Task 1.
- Produces: rule ids `cure-claim`, `timeframe-promise`, `extreme-claim`, `appearance-attack`, `guarantee`, `endorsement`, `profanity`, `sexual-explicit`, `sexual-pleasure` with titles 'Cure claim', 'Results in a set time', 'Exaggerated claim', 'Attacks appearance', 'Guarantee', 'Unverified endorsement', 'Profanity', 'Explicit sexual language', 'Pleasure-focused (sexual wellness)'.

- [ ] **Step 1: Write the failing tests** - `tests/rules.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAd } from '../js/rules.js';

const ids = (text, category = 'general') => [...new Set(checkAd({ primary: text }, category).findings.map(f => f.ruleId))].sort();
const sev = (text, category, ruleId) => checkAd({ primary: text }, category).findings.find(f => f.ruleId === ruleId)?.severity;

test('cure claims for conditions Meta lists', () => {
  assert.equal(sev('Reverse type 2 diabetes naturally.', 'health', 'cure-claim'), 'reject');
  assert.equal(sev('Our tea cures cancer.', 'general', 'cure-claim'), 'reject');
  assert.equal(sev('Psoriasis gone for good.', 'beauty', 'cure-claim'), 'reject');
  assert.deepEqual(ids('Helps manage diabetes symptoms alongside your treatment plan.', 'health'), []);
});

test('timeframe promises in wellness categories, unless qualified', () => {
  assert.equal(sev('See clearer skin in 7 days.', 'beauty', 'timeframe-promise'), 'risk');
  assert.equal(sev('Lose belly fat overnight.', 'weight', 'timeframe-promise'), 'risk');
  assert.deepEqual(ids('See clearer skin in 7 days. Results may vary.', 'beauty'), []);
  assert.deepEqual(ids('See clearer skin in 7 days.', 'general'), []);
});

test('exaggerated claims', () => {
  assert.equal(sev('A miracle cream for tired skin.', 'beauty', 'extreme-claim'), 'risk');
  assert.equal(sev('Lose 10 kg without dieting.', 'weight', 'extreme-claim'), 'risk');
  assert.equal(sev('Instant results, 100% effective.', 'health', 'extreme-claim'), 'risk');
});

test('appearance attacks', () => {
  assert.equal(sev('Tired of your ugly skin?', 'beauty', 'appearance-attack'), 'reject');
  assert.equal(sev('Say goodbye to gross belly fat.', 'weight', 'appearance-attack'), 'reject');
  assert.equal(sev('No more embarrassing odour.', 'general', 'appearance-attack'), 'reject');
  assert.equal(sev('Ashamed of your smile?', 'beauty', 'appearance-attack'), 'reject');
  assert.deepEqual(ids('Love the skin you live in.', 'beauty'), []);
});

test('guarantees of results', () => {
  assert.equal(sev('Guaranteed results or your money back.', 'health', 'guarantee'), 'risk');
  assert.equal(sev('Weight loss guaranteed.', 'weight', 'guarantee'), 'risk');
});

test('unverified endorsements', () => {
  assert.equal(sev('Doctor-recommended formula.', 'health', 'endorsement'), 'risk');
  assert.equal(sev('Clinically proven to reduce redness.', 'beauty', 'endorsement'), 'risk');
  assert.equal(sev('The #1 rated serum in India.', 'beauty', 'endorsement'), 'risk');
});

test('profanity, including partly masked words (Meta examples)', () => {
  assert.equal(sev('Get the best f*!%ing tshirts here.', 'general', 'profanity'), 'reject');
  assert.equal(sev('Shop t*s*h*i*r*t*s now', 'general', 'profanity'), 'reject');
  assert.equal(sev('This shit works.', 'general', 'profanity'), 'reject');
  assert.deepEqual(ids('WTF: Wear The Fit. Save 20%! Shop now.', 'general'), []);
});

test('explicit sexual language in any category', () => {
  assert.equal(sev('Kinky nights start here.', 'general', 'sexual-explicit'), 'reject');
  assert.equal(sev('Kinky nights start here.', 'sexual-wellness', 'sexual-explicit'), 'reject');
});

test('sexual wellness must be health-focused, not pleasure-focused', () => {
  assert.equal(sev('Our new vibrator for mind-blowing pleasure.', 'sexual-wellness', 'sexual-pleasure'), 'reject');
  assert.equal(sev('Spice up things in the bedroom.', 'sexual-wellness', 'sexual-pleasure'), 'reject');
  assert.deepEqual(ids('Water-based lubricant for comfortable intimacy, gentle on sensitive skin.', 'sexual-wellness'), []);
  assert.deepEqual(ids('Our new vibrator for mind-blowing pleasure.', 'general'), []);
});

test('ordinary copy is not flagged (Review Focus 1)', () => {
  for (const [text, cat] of [
    ['Free delivery in 2 days.', 'health'],
    ['100% money-back guarantee.', 'health'],
    ['Guaranteed delivery by Friday.', 'general'],
    ['Download instantly.', 'health'],
    ['Your order ships today.', 'beauty'],
    ['Made by doctors, tested by thousands.', 'health'],
    ['Shiitake mushroom broth, slow cooked.', 'general'],
  ]) assert.deepEqual(ids(text, cat), [], text);
});

test('case, repeated punctuation and curly quotes (Review Focus 2)', () => {
  const r = checkAd({ primary: 'ARE YOU DIABETIC?? Our formula can cure Alzheimer’s.' }, 'health');
  const byRule = Object.fromEntries(r.findings.map(f => [f.ruleId, f]));
  assert.ok(byRule['personal-attribute']);
  assert.ok(byRule['cure-claim']);
  assert.equal(byRule['cure-claim'].text, 'cure Alzheimer’s');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test` - Expected: the new tests FAIL (rules not defined); Task 1 tests still pass.

- [ ] **Step 3: Implement** - in `js/rules.js`, replace `export const RULES = [ { id: 'personal-attribute', ... }, ];` by the same personal-attribute entry followed by these entries (the helper constants go above `RULES`):

```js
// ---- health claims -----------------------------------------------------

const CONDITIONS = alt(['diabetes', 'herpes', 'thyroid disease', 'thyroid problems', 'thyroid', 'psoriasis', 'ebola', 'cancer',
  'autism', "alzheimer's", 'alzheimers', "parkinson's", 'parkinsons', 'als', 'hiv']);
const CURE_VERBS = String.raw`cure[sd]?|curing|heal(?:s|ed|ing)?|eliminat(?:e|es|ed|ing)|revers(?:e|es|ed|ing)|get\s+rid\s+of|eradicat(?:e|es|ed|ing)|beat(?:s|ing)?`;
const CURE = [
  finder(new RegExp(`\\b(?:${CURE_VERBS})\\s+(?:[\\w'-]+\\s+){0,3}?(?:${CONDITIONS})\\b`, 'gi')),
  finder(new RegExp(`\\b(?:${CONDITIONS})\\s+(?:is\\s+|was\\s+)?(?:cured|reversed|gone|healed|eliminated)\\b`, 'gi')),
];

const TIMEFRAME = /\b(?:in|within|after)\s+(?:just\s+|only\s+)?(?:\d+|one|two|three|four|five|six|seven|ten|fourteen|thirty|a)\s+(?:minutes?|hours?|days?|weeks?|months?|nights?)\b|\bovernight\b/gi;
const RESULT = /\b(?:results?|lose|lost|loss|burn\w*|gone|clear\w*|glow\w*|smooth\w*|younger|slimmer|thinner|stronger|harder|longer|bigger|firmer|kg|kgs|lbs|pounds|inches|sizes?|wrinkles?|acne|skin|weight|fat|energy|sleep|libido|stamina|performance|feel|notice|transform\w*)\b/i;
const sentenceAround = (text, at) => {
  const start = Math.max(...['.', '!', '?', '\n'].map(c => text.lastIndexOf(c, at - 1))) + 1;
  const ends = ['.', '!', '?', '\n'].map(c => text.indexOf(c, at)).filter(i => i >= 0);
  return text.slice(start, ends.length ? Math.min(...ends) : text.length);
};

const EXTREME = finder(new RegExp([
  String.raw`\bmiracle\w*`,
  String.raw`\bmagic\s+(?:pill|cure|formula|bullet)\b`,
  String.raw`\binstant(?:ly)?\s+(?:results?|relief|cure|fix|weight\s+loss)\b`,
  String.raw`\b100\s*%\s*(?:effective|results?|guaranteed|cure)\b`,
  String.raw`\bpermanent(?:ly)?\s+(?:results?|weight\s+loss|cure|fix|removal)\b`,
  String.raw`\bnever\s+(?:again\s+)?(?:diet|worry|struggle)\b`,
  String.raw`\blose\s+\d+\s*(?:kg|kgs|kilos?|lbs?|pounds)\b`,
  String.raw`\bmelt\s+(?:away\s+)?(?:fat|pounds|belly)\b`,
  String.raw`\bwithout\s+(?:diet|dieting|exercise)\b`,
].join('|'), 'gi'));

const NEG = 'ugly|gross|disgusting|embarrassing|hideous|unattractive|flabby|saggy|sagging|wrinkly|chubby|smelly|stinky|nasty|unsightly';
const BODY = String.raw`skin|face|body|belly|stomach|tummy|thighs?|arms?|legs?|hair|teeth|smile|breath|odou?rs?|smells?|nose|butt|hips?|chin|muffin\s+top|love\s+handles|feet|armpits?|acne|scars?|cellulite|wrinkles|pores|fat|bumps`;
const APPEARANCE = [
  finder(new RegExp(`\\b(?:${NEG})\\s+(?:[\\w'-]+\\s+)?(?:${BODY})\\b`, 'gi')),
  finder(new RegExp(`\\b(?:hate|hating|ashamed\\s+of|embarrassed\\s+(?:by|of)|insecure\\s+about|disgusted\\s+by)\\s+your\\s+(?:${BODY}|looks|appearance|reflection)\\b`, 'gi')),
];

// ---- commercial practices ----------------------------------------------

const GUARANTEE = [
  finder(/\bguarantee[ds]?\s+(?:[\w'-]+\s+){0,2}?(?:results?|returns?|success|cure|weight\s+loss|to\s+work|profits?|income|growth)\b/gi),
  finder(/\b(?:results?|returns?|success|weight\s+loss)\s+(?:are\s+|is\s+)?guaranteed\b/gi),
  finder(/\brisk[- ]free\s+(?:results?|returns?|investment)\b/gi),
];
const ENDORSEMENT = [
  finder(/\b(?:doctor|dermatologist|physician|gynaecologist|gynecologist|expert)s?[- ]?(?:recommended|approved|endorsed)\b/gi),
  finder(/\brecommended\s+by\s+(?:doctors|dermatologists|experts|physicians)\b/gi),
  finder(/\bclinically\s+proven\b/gi),
  finder(/(?:#\s?1|\bno\.?\s*1|\bnumber\s+(?:one|1))\s+(?:rated|recommended|doctor[- ]recommended|selling|best[- ]selling|brand)\b/gi),
  finder(/\bfda[- ]approved\b/gi),
  finder(/\bas\s+seen\s+on\b/gi),
];

// ---- language -----------------------------------------------------------

const PROFANITY = [
  finder(/\b(?:f+u+c+k\w*|motherf\w*|sh[i1]t(?:s|ty|ting)?|bullshit\w*|bitch\w*|bastard\w*|asshole\w*|dickhead\w*|cunt\w*|piss(?:ed)?)\b/gi),
  // Partly masked words (f*!%ing, s**t, t*s*h*i*r*t*s) - Meta bans these too.
  finder(/\b[a-z]+\*[a-z*@#$%!]*[a-z]/gi),
];
const EXPLICIT = finder(/\b(?:sex\s+positions?|foreplay|oral\s+sex|blow\s*jobs?|horny|kinky|kink|threesomes?|hook\s*ups?|nsfw|nudes?|naked|porn\w*|erotic\w*|cum|masturbat\w*|orgy|orgies|dirty\s+talk)\b/gi);
const PLEASURE = finder(/\b(?:pleasur\w*|orgasm\w*|climax\w*|toys?|vibrators?|dildos?|spice\s+(?:things\s+)?up|in\s+the\s+bedroom|in\s+bed|sexy|sensual|arous\w*|turn(?:s|ed)?\s+(?:you|her|him)\s+on|mind[- ]blowing|satisfy\s+(?:her|him|your\s+partner)|intense\s+sensations?|g[- ]spot)\b/gi);
```

and the `RULES` entries after personal-attribute:

```js
  {
    id: 'cure-claim', title: 'Cure claim', severity: 'reject', categories: null,
    why: 'Meta bans claims to cure, heal or eliminate the conditions it lists (diabetes, herpes, thyroid, psoriasis, Ebola, cancer, autism, Alzheimer\'s, Parkinson\'s, ALS, HIV). Talking about managing symptoms is allowed.',
    policy: POLICIES.healthWellness,
    find: text => CURE.flatMap(f => f(text)),
  },
  {
    id: 'timeframe-promise', title: 'Results in a set time', severity: 'risk', categories: WELLNESS,
    why: 'Meta treats promises of a specific outcome within a set time, with no qualifier, as health clickbait. Add "results vary" or drop the timeframe.',
    policy: POLICIES.healthWellness,
    find: (text, ctx) => ctx.qualified ? [] : [...text.matchAll(TIMEFRAME)]
      .filter(m => RESULT.test(sentenceAround(text, m.index)))
      .map(m => ({ start: m.index, end: m.index + m[0].length })),
  },
  {
    id: 'extreme-claim', title: 'Exaggerated claim', severity: 'risk', categories: WELLNESS,
    why: 'Sensational or extreme claims ("miracle", "instant results", "lose 10 kg") are flagged as health clickbait.',
    policy: POLICIES.healthWellness,
    find: EXTREME,
  },
  {
    id: 'appearance-attack', title: 'Attacks appearance', severity: 'reject', categories: null,
    why: 'Meta bans negative terms that attack a person\'s appearance, body parts or hygiene. Describe the result you offer, not the flaw.',
    policy: POLICIES.healthWellness,
    find: text => APPEARANCE.flatMap(f => f(text)),
  },
  {
    id: 'guarantee', title: 'Guarantee', severity: 'risk', categories: null,
    why: 'Guaranteed results or returns read as misleading claims. A money-back guarantee is fine; a guaranteed outcome is not.',
    policy: POLICIES.commercialPractices,
    find: text => GUARANTEE.flatMap(f => f(text)),
  },
  {
    id: 'endorsement', title: 'Unverified endorsement', severity: 'risk', categories: null,
    why: 'Endorsements and rankings you can\'t show proof for ("doctor-recommended", "#1 rated", "clinically proven") are treated as unauthorized or misleading.',
    policy: POLICIES.commercialPractices,
    find: text => ENDORSEMENT.flatMap(f => f(text)),
  },
  {
    id: 'profanity', title: 'Profanity', severity: 'reject', categories: null,
    why: 'Meta bans profanity in ads, including partly masked words like "f*!%ing". Acronyms are fine if they don\'t spell a profane word.',
    policy: POLICIES.profanity,
    find: text => PROFANITY.flatMap(f => f(text)),
  },
  {
    id: 'sexual-explicit', title: 'Explicit sexual language', severity: 'reject', categories: null,
    why: 'Ads can\'t discuss sexual practices or experiences or use sexually explicit language.',
    policy: POLICIES.sexualLanguage,
    find: EXPLICIT,
  },
  {
    id: 'sexual-pleasure', title: 'Pleasure-focused (sexual wellness)', severity: 'reject', categories: ['sexual-wellness'],
    why: 'Meta allows sexual and reproductive health products only when the ad focuses on health and medical efficacy; products and messages about pleasure or enhancement are prohibited.',
    policy: POLICIES.healthWellness,
    find: PLEASURE,
  },
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test` - Expected: all PASS. If a false-positive test fails, narrow the pattern; never delete the case.

- [ ] **Step 5: Commit**

```bash
git add js/rules.js tests/rules.test.js
git commit -m "Add health, commercial and language rules"
```

---

### Task 3: Highlight segments and flagged sentences

**Files:**
- Create: `js/highlight.js`, `tests/highlight.test.js`

**Interfaces:**
- Consumes: `Finding` shape from Task 1 (`start`, `end`, `severity`, `ruleId`).
- Produces:
  - `segments(text: string, spans: Array<{start, end}>) => Array<{ text, start, end, spans: span[] }>` - contiguous, covers the whole text, `join('') === text`; `spans` lists every span covering that piece.
  - `flaggedSentences(text: string, findings: Finding[]) => Array<{ start, end, text, findings: Finding[] }>` - sentences (split on `.!?` or newline, keeping the terminator) that overlap at least one finding.

- [ ] **Step 1: Write the failing tests** - `tests/highlight.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { segments, flaggedSentences } from '../js/highlight.js';

const join = segs => segs.map(s => s.text).join('');

test('no spans gives one plain segment', () => {
  const s = segments('hello world', []);
  assert.equal(s.length, 1);
  assert.deepEqual(s[0].spans, []);
});

test('overlapping spans split into pieces without losing text (Review Focus 3)', () => {
  const text = 'Are you diabetic today';
  const a = { start: 0, end: 16, id: 'a' };   // "Are you diabetic"
  const b = { start: 8, end: 22, id: 'b' };   // "diabetic today"
  const s = segments(text, [a, b]);
  assert.equal(join(s), text);
  assert.deepEqual(s.map(x => [x.text, x.spans.map(y => y.id).join('')]), [
    ['Are you ', 'a'], ['diabetic', 'ab'], [' today', 'b'],
  ]);
});

test('identical spans do not duplicate text', () => {
  const s = segments('abc def', [{ start: 0, end: 3 }, { start: 0, end: 3 }]);
  assert.equal(join(s), 'abc def');
  assert.equal(s[0].spans.length, 2);
});

test('flaggedSentences returns only sentences with findings, with offsets', () => {
  const text = 'Are you diabetic? Try our tea. It cures diabetes.';
  const f1 = { start: 0, end: 16 };
  const f2 = { start: 34, end: 48 };
  const out = flaggedSentences(text, [f1, f2]);
  assert.deepEqual(out.map(s => s.text.trim()), ['Are you diabetic?', 'It cures diabetes.']);
  assert.equal(text.slice(out[1].start, out[1].end), out[1].text);
  assert.deepEqual(out[1].findings, [f2]);
});

test('a sentence without a terminator at the end is still found', () => {
  const out = flaggedSentences('Fine line. Are you gay', [{ start: 11, end: 22 }]);
  assert.equal(out[0].text.trim(), 'Are you gay');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test` - Expected: FAIL, cannot find `js/highlight.js`.

- [ ] **Step 3: Implement** - `js/highlight.js`

```js
// Turns findings into display pieces. Pure, so it can be tested in Node.

export function segments(text, spans) {
  const cuts = new Set([0, text.length]);
  for (const s of spans) { cuts.add(Math.max(0, s.start)); cuts.add(Math.min(text.length, s.end)); }
  const points = [...cuts].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i], end = points[i + 1];
    if (start === end) continue;
    const covering = spans.filter(s => s.start < end && s.end > start);
    const prev = out.at(-1);
    if (prev && sameSpans(prev.spans, covering)) { prev.end = end; prev.text = text.slice(prev.start, end); continue; }
    out.push({ text: text.slice(start, end), start, end, spans: covering });
  }
  return out;
}

const sameSpans = (a, b) => a.length === b.length && a.every(x => b.includes(x));

export function flaggedSentences(text, findings) {
  const sentences = [...text.matchAll(/[^.!?\n]+(?:[.!?]+|\n|$)/g)].map(m => ({ start: m.index, end: m.index + m[0].length, text: m[0] }));
  return sentences
    .map(s => ({ ...s, findings: findings.filter(f => f.start < s.end && f.end > s.start) }))
    .filter(s => s.findings.length);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test` - Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add js/highlight.js tests/highlight.test.js
git commit -m "Add highlight segments and flagged sentences"
```

---

### Task 4: Rewrite prompt, cleaning and verify-then-retry

**Files:**
- Create: `js/rewrite.js`, `tests/rewrite.test.js`

**Interfaces:**
- Consumes: `CATEGORIES` and `RULE_TITLES` from `js/rules.js`; `Finding` shape.
- Produces:
  - `buildRewriteMessages({ sentence, findings, category }) => Array<{role: 'user'|'assistant', content}>` - one worked example (user, assistant) then the real request (user).
  - `cleanRewrite(raw: string) => string` (`''` when unusable)
  - `makeRewrite({ sentence, findings, category, generate, check, tries = 2 }) => Promise<{ ok: boolean, text: string, tries: number }>` where `generate(messages, { temperature }) => Promise<string>` and `check(text) => Finding[]`. Temperature 0.4 on try 1, 0.8 after.

- [ ] **Step 1: Write the failing tests** - `tests/rewrite.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRewriteMessages, cleanRewrite, makeRewrite } from '../js/rewrite.js';
import { checkAd } from '../js/rules.js';

const finding = { ruleId: 'personal-attribute', text: 'Struggling with low energy?', why: 'Implies a condition.' };
const check = text => checkAd({ primary: text }, 'health').findings;

test('prompt: example first, then the real sentence with its problems and category', () => {
  const msgs = buildRewriteMessages({ sentence: 'Struggling with low energy? Try our gummies.', findings: [finding], category: 'health' });
  assert.deepEqual(msgs.map(m => m.role), ['user', 'assistant', 'user']);
  const last = msgs[2].content;
  assert.match(last, /Struggling with low energy\? Try our gummies\./);
  assert.match(last, /Personal attribute/);
  assert.match(last, /Health & supplements/);
  assert.deepEqual(check(msgs[1].content), [], 'the worked example itself must pass every rule');
});

test('cleanRewrite keeps one clean sentence', () => {
  assert.equal(cleanRewrite('Safer version: "Gummies for busy afternoons."'), 'Gummies for busy afternoons.');
  assert.equal(cleanRewrite("Sure! Here's a safer version:\n\n**Gummies for busy afternoons.**\n\nThis avoids..."), 'Gummies for busy afternoons.');
  assert.equal(cleanRewrite('   '), '');
  assert.equal(cleanRewrite('Ok'), '');
});

test('makeRewrite returns the first rewrite that passes the rules', async () => {
  const calls = [];
  const generate = async (_m, opts) => { calls.push(opts.temperature); return 'Gummies made for busy afternoons.'; };
  const r = await makeRewrite({ sentence: 'Struggling with low energy? Try our gummies.', findings: [finding], category: 'health', generate, check });
  assert.deepEqual(r, { ok: true, text: 'Gummies made for busy afternoons.', tries: 1 });
  assert.deepEqual(calls, [0.4]);
});

test('a rewrite that still breaks a rule is retried, then given up on (Review Focus 4)', async () => {
  const outs = ['Are you diabetic? Try our gummies.', 'Guaranteed results in 7 days!'];
  const temps = [];
  const generate = async (_m, opts) => { temps.push(opts.temperature); return outs.shift(); };
  const r = await makeRewrite({ sentence: 'Do you have diabetes?', findings: [finding], category: 'health', generate, check });
  assert.deepEqual(r, { ok: false, text: '', tries: 2 });
  assert.deepEqual(temps, [0.4, 0.8]);
});

test('echoes and empty chatter count as failed tries (Review Focus 4)', async () => {
  const outs = ['Struggling with low energy?  Try our gummies!', 'Sure, here you go:', 'Gummies for steady afternoons.'];
  const r = await makeRewrite({
    sentence: 'Struggling with low energy? Try our gummies.', findings: [finding], category: 'health',
    generate: async () => outs.shift(), check, tries: 3,
  });
  assert.deepEqual(r, { ok: true, text: 'Gummies for steady afternoons.', tries: 3 });
});

test('a generate error counts as a failed try, not a crash', async () => {
  let n = 0;
  const r = await makeRewrite({
    sentence: 'x', findings: [finding], category: 'health', check,
    generate: async () => { if (n++ === 0) throw new Error('gpu lost'); return 'Gummies for steady afternoons.'; },
  });
  assert.equal(r.ok, true);
  assert.equal(r.tries, 2);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test` - Expected: FAIL, cannot find `js/rewrite.js`.

- [ ] **Step 3: Implement** - `js/rewrite.js`

```js
import { CATEGORIES, RULE_TITLES } from './rules.js';

const categoryLabel = id => CATEGORIES.find(c => c.id === id)?.label ?? 'General';

function requestTurn({ sentence, findings, category }) {
  const problems = [...new Map(findings.map(f => [`${f.ruleId}|${f.text}`, f])).values()]
    .map(f => `- ${RULE_TITLES[f.ruleId]}: "${f.text}". ${f.why}`).join('\n');
  return [
    `You rewrite one line of Meta (Facebook/Instagram) ad copy so it follows Meta's ad policies. Category: ${categoryLabel(category)}.`,
    `Line: "${sentence}"`,
    'Problems:',
    problems,
    'Rules for the new line: keep the product and its main benefit; never ask about or describe the reader\'s body, health, money, age or identity; no cures, guarantees, rankings or results within a set time; no pleasure or sexual wording; plain and friendly.',
    'Reply with the new line only.',
  ].join('\n');
}

const EXAMPLE = {
  sentence: 'Struggling with acne? Our serum clears it in 7 days, guaranteed!',
  findings: [
    { ruleId: 'personal-attribute', text: 'Struggling with acne?', why: 'Implies the reader has a condition.' },
    { ruleId: 'timeframe-promise', text: 'in 7 days', why: 'Promises an outcome in a set time.' },
  ],
  category: 'beauty',
  answer: 'A gentle daily serum made with niacinamide for calm, clear-looking skin.',
};

export function buildRewriteMessages({ sentence, findings, category }) {
  return [
    { role: 'user', content: requestTurn(EXAMPLE) },
    { role: 'assistant', content: EXAMPLE.answer },
    { role: 'user', content: requestTurn({ sentence, findings, category }) },
  ];
}

const PREAMBLE = /^(?:sure|okay|ok|here(?:'s|’s| is)|certainly|of course)\b.*|.*:\s*$/i;
const LABEL = /^(?:safer(?:\s+version)?|rewrite|new\s+line|line|answer)\s*:\s*/i;

export function cleanRewrite(raw) {
  const line = String(raw ?? '').split('\n').map(s => s.trim()).filter(Boolean).find(l => !PREAMBLE.test(l)) ?? '';
  const out = line.replace(LABEL, '').replace(/\*\*/g, '').replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();
  return out.length >= 4 ? out : '';
}

const squash = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

export async function makeRewrite({ sentence, findings, category, generate, check, tries = 2 }) {
  const messages = buildRewriteMessages({ sentence, findings, category });
  for (let i = 1; i <= tries; i++) {
    let text = '';
    try { text = cleanRewrite(await generate(messages, { temperature: i === 1 ? 0.4 : 0.8 })); } catch { text = ''; }
    if (!text || squash(text) === squash(sentence)) continue;
    if (check(text).length === 0) return { ok: true, text, tries: i };
  }
  return { ok: false, text: '', tries };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test` - Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add js/rewrite.js tests/rewrite.test.js
git commit -m "Add rule-verified rewrite logic"
```

---

### Task 5: On-device model (carried over from Walk Notes)

**Files:**
- Create: `vendor/` (copied), `js/opfs-cache.js`, `js/progress.js` (copied with tests), `js/ai-client.js`, `js/ai-worker.js`, `tests/opfs-cache.test.js`, `tests/progress.test.js`, `tests/ai-client.test.js`, `dev/serve.mjs`, `dev/smoke.html`

**Interfaces:**
- Produces (`js/ai-client.js`): `createAiClient(worker) => { check(): Promise<{webgpu, f16}>, load(onProgress?): Promise<true> (shared, retryable), generate(messages, { temperature }): Promise<string> (waits for load) }`
- Worker protocol: `{id, type: 'check'|'load'|'generate', ...}` -> `{id, ok, result|error}`; progress `{type: 'progress', loaded, total}`. `generate` uses `max_new_tokens: 60`, `do_sample: true`.

- [ ] **Step 1: Copy the proven pieces**

```bash
mkdir -p vendor/ort dev
cp ../walk-notes/vendor/transformers.min.js ../walk-notes/vendor/VERSIONS.md vendor/
cp ../walk-notes/vendor/ort/ort-wasm-simd-threaded.asyncify.mjs ../walk-notes/vendor/ort/ort-wasm-simd-threaded.asyncify.wasm vendor/ort/
cp ../walk-notes/js/opfs-cache.js ../walk-notes/js/progress.js js/
cp ../walk-notes/tests/opfs-cache.test.js ../walk-notes/tests/progress.test.js tests/
cp ../walk-notes/dev/serve.mjs dev/
```
Then in `js/progress.js` change `export const EXPECTED_BYTES = 950e6;` to `export const EXPECTED_BYTES = 785e6;` (Gemma only: 763 MB weights + 20 MB tokenizer + small files).

- [ ] **Step 2: Write the failing client tests** - `tests/ai-client.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAiClient } from '../js/ai-client.js';

function fakeWorker(handler) {
  const listeners = [];
  const w = {
    sent: [],
    addEventListener: (_t, fn) => listeners.push(fn),
    postMessage(msg) { w.sent.push(msg); queueMicrotask(() => handler(msg, data => listeners.forEach(fn => fn({ data })))); },
  };
  return w;
}

test('generate waits for load, then returns the model text', async () => {
  let release;
  const w = fakeWorker((m, reply) => {
    if (m.type === 'load') { release = () => reply({ id: m.id, ok: true, result: true }); return; }
    reply({ id: m.id, ok: true, result: `t=${m.temperature}` });
  });
  const ai = createAiClient(w);
  const p = ai.generate([{ role: 'user', content: 'x' }], { temperature: 0.4 });
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(w.sent.map(m => m.type), ['load']);
  release();
  assert.equal(await p, 't=0.4');
});

test('load is shared and progress reaches every caller', async () => {
  let release;
  const w = fakeWorker((m, reply) => {
    if (m.type !== 'load') return;
    reply({ type: 'progress', loaded: 1, total: 2 });
    release = () => reply({ id: m.id, ok: true, result: true });
  });
  const ai = createAiClient(w);
  const a = [], b = [];
  const pa = ai.load((l, t) => a.push([l, t]));
  const pb = ai.load((l, t) => b.push([l, t]));
  await new Promise(r => setTimeout(r, 0));
  release();
  assert.equal(await pa, true);
  assert.equal(await pb, true);
  assert.equal(w.sent.filter(m => m.type === 'load').length, 1);
  assert.deepEqual([a, b], [[[1, 2]], [[1, 2]]]);
});

test('a failed load can be retried', async () => {
  let n = 0;
  const w = fakeWorker((m, reply) => reply({ id: m.id, ok: ++n > 1, result: true, error: 'net' }));
  const ai = createAiClient(w);
  await assert.rejects(ai.load(), /net/);
  assert.equal(await ai.load(), true);
});

test('check does not trigger a load', async () => {
  const w = fakeWorker((m, reply) => reply({ id: m.id, ok: true, result: { webgpu: true, f16: true } }));
  assert.deepEqual(await createAiClient(w).check(), { webgpu: true, f16: true });
  assert.deepEqual(w.sent.map(m => m.type), ['check']);
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm test` - Expected: the copied opfs-cache and progress tests PASS; ai-client tests FAIL (module missing).

- [ ] **Step 4: Implement** - `js/ai-client.js`

```js
// Promise wrapper around the model worker's message protocol.
export function createAiClient(worker) {
  let nextId = 1;
  const pending = new Map();
  const progressFns = new Set();
  let loading = null;

  worker.addEventListener('message', ({ data }) => {
    if (data.type === 'progress') { progressFns.forEach(fn => fn(data.loaded, data.total)); return; }
    const p = pending.get(data.id);
    if (!p) return;
    pending.delete(data.id);
    data.ok ? p.resolve(data.result) : p.reject(new Error(data.error));
  });

  const call = (type, args = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, type, ...args });
  });

  function load(onProgress) {
    if (onProgress) progressFns.add(onProgress);
    if (!loading) loading = call('load').catch(err => { loading = null; throw err; });
    return loading;
  }

  return {
    check: () => call('check'),
    load,
    generate: (messages, { temperature = 0.4 } = {}) => load().then(() => call('generate', { messages, temperature })),
  };
}
```

- [ ] **Step 5: Implement** - `js/ai-worker.js`

```js
// Gemma lives here, off the main thread, so the page never freezes.
import { env, pipeline } from '../vendor/transformers.min.js';
import { createProgress } from './progress.js';
import { createOpfsCache } from './opfs-cache.js';

const LLM_ID = 'onnx-community/gemma-3-1b-it-ONNX-GQA';

env.allowLocalModels = false;
// The Cache API can refuse a 763 MB entry; keep model files on OPFS instead.
env.useBrowserCache = false;
env.useCustomCache = true;
env.customCache = createOpfsCache();
env.backends.onnx.wasm.wasmPaths = {
  mjs: new URL('../vendor/ort/ort-wasm-simd-threaded.asyncify.mjs', import.meta.url).href,
  wasm: new URL('../vendor/ort/ort-wasm-simd-threaded.asyncify.wasm', import.meta.url).href,
};

let llm = null;
const progress = createProgress();

async function check() {
  if (!navigator.gpu) return { webgpu: false, f16: false };
  const adapter = await navigator.gpu.requestAdapter();
  return { webgpu: !!adapter, f16: !!adapter?.features.has('shader-f16') };
}

async function load() {
  llm ??= await pipeline('text-generation', LLM_ID, {
    device: 'webgpu', dtype: 'q4f16',
    progress_callback: p => { const s = progress.update(p); if (s) self.postMessage({ type: 'progress', ...s }); },
  });
  self.postMessage({ type: 'progress', ...progress.finish() });
  return true;
}

async function generate({ messages, temperature }) {
  const out = await llm(messages, { max_new_tokens: 60, do_sample: true, temperature });
  return out[0].generated_text.at(-1).content;
}

const handlers = { check, load, generate };

self.addEventListener('message', async ({ data }) => {
  const { id, type, ...args } = data;
  try {
    self.postMessage({ id, ok: true, result: await handlers[type](args) });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message ?? err) });
  }
});
```

- [ ] **Step 6: Run to verify pass**

Run: `npm test` - Expected: all PASS.

- [ ] **Step 7: Smoke page** - `dev/smoke.html`

```html
<!doctype html>
<meta charset="utf-8">
<title>Ad Preflight smoke test</title>
<pre id="log">starting...</pre>
<script type="module">
  import { createAiClient } from '../js/ai-client.js';
  import { checkAd } from '../js/rules.js';
  import { makeRewrite } from '../js/rewrite.js';
  const log = s => { document.getElementById('log').textContent += '\n' + s; };
  const ai = createAiClient(new Worker('../js/ai-worker.js', { type: 'module' }));
  const t0 = performance.now();
  const secs = () => ((performance.now() - t0) / 1000).toFixed(1) + 's';
  try {
    log('check: ' + JSON.stringify(await ai.check()));
    let last = -10;
    await ai.load((l, t) => { const p = Math.floor(100 * l / t); if (p >= last + 10) { last = p; log(`load ${p}%`); } });
    log('loaded ' + secs());
    for (const [sentence, category] of [
      ['Struggling with low energy? Our gummies GUARANTEE results in 7 days!', 'health'],
      ['Tired of your ugly skin? This miracle cream fixes it overnight.', 'beauty'],
      ['Our new vibrator for mind-blowing pleasure.', 'sexual-wellness'],
    ]) {
      const findings = checkAd({ primary: sentence }, category).findings;
      const r = await makeRewrite({ sentence, findings, category, generate: (m, o) => ai.generate(m, o), check: t => checkAd({ primary: t }, category).findings });
      log(`\n${category}: ${sentence}\n  -> ${r.ok ? r.text : '(no safe version)'}  [tries ${r.tries}, ${secs()}]`);
    }
    log('SMOKE OK');
  } catch (e) { log('SMOKE FAIL: ' + e.message); }
</script>
```

- [ ] **Step 8: Run the smoke test in the browser pane**

Run `npm run serve` in the background, open `http://localhost:8080/dev/smoke.html`.
Expected: `check: {"webgpu":true,"f16":true}`; load reaches 100% (one-time ~785 MB, ~10-15 min on this connection; seconds if OPFS already holds it); three rewrites, each either a clean line or "(no safe version)"; `SMOKE OK`. Record load and per-rewrite times for the README/post. The browser pane caps storage at 2.8 GB; if the model fails to cache there, note it and continue - the phone/desktop Chrome path is what ships.

- [ ] **Step 9: Commit**

```bash
git add vendor js/opfs-cache.js js/progress.js js/ai-client.js js/ai-worker.js tests/opfs-cache.test.js tests/progress.test.js tests/ai-client.test.js dev/serve.mjs dev/smoke.html
git commit -m "Add on-device Gemma worker, OPFS model cache and client"
```

---

### Task 6: The page

**Files:**
- Create: `index.html`, `css/app.css`, `js/app.js`, `icons/icon.svg`

**Interfaces:**
- Consumes: `CATEGORIES`, `FIELDS`, `RULE_TITLES`, `checkAd`, `isEmptyAd` (rules.js); `segments`, `flaggedSentences` (highlight.js); `makeRewrite` (rewrite.js); `createAiClient` (ai-client.js).

- [ ] **Step 1: `index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Check Meta ad copy against Meta's ad policies before you publish. Runs on your device.">
  <title>Ad Preflight</title>
  <link rel="icon" href="icons/icon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="css/app.css">
</head>
<body>
  <main>
    <header>
      <h1>Ad Preflight</h1>
      <p class="lede">Check Meta ad copy against Meta's own ad policies before you publish. Every warning links to the rule it comes from. Nothing you paste leaves this device.</p>
    </header>

    <form id="ad-form" novalidate>
      <label class="field">Category
        <select id="category"></select>
      </label>
      <label class="field">Primary text
        <textarea id="primary" rows="5" placeholder="The main text above the image or video"></textarea>
      </label>
      <label class="field">Headline
        <input id="headline" placeholder="Bold line under the creative">
      </label>
      <label class="field">Description
        <input id="description" placeholder="Smaller line under the headline">
      </label>
      <p class="error" id="form-error" hidden>Paste at least one field.</p>
      <div class="row">
        <button class="primary" type="submit">Check ad</button>
        <button class="ghost" type="button" id="example">Try an example</button>
      </div>
    </form>

    <section id="result" hidden aria-live="polite">
      <div id="verdict" class="verdict"><strong id="verdict-label"></strong><span id="verdict-sub"></span></div>
      <div id="preview"></div>
      <div id="cards"></div>
    </section>

    <footer>
      <p>A pre-check, not a guarantee: Meta's reviewers make the final call. Rules are based on Meta's Advertising Standards as published on 14 Oct 2026. Safer versions are written by Gemma 3 1B running in your browser and re-checked against every rule before you see them.</p>
    </footer>
  </main>
  <script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: `css/app.css`**

```css
:root { --bg:#f6f5f1; --ink:#1c2321; --muted:#5d6763; --line:#dcd8cd; --card:#fff; --accent:#1f5f8b; --accent-ink:#fff;
  --reject:#b3261e; --reject-bg:#fde2df; --risk:#8a5a00; --risk-bg:#fff0cc; --ok:#1e6b45; --ok-bg:#dff3e7; color-scheme: light dark; }
@media (prefers-color-scheme: dark) { :root { --bg:#111514; --ink:#e8ecea; --muted:#9ba7a2; --line:#2a3330; --card:#171d1b; --accent:#7ab8e6; --accent-ink:#0b1620;
  --reject:#ff8f86; --reject-bg:#3a1c1a; --risk:#f5c25b; --risk-bg:#3a2e12; --ok:#7fd3a5; --ok-bg:#16301f; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
main { max-width: 760px; margin: 0 auto; padding: 24px 16px 48px; }
h1 { margin: 0 0 4px; font-size: 1.9rem; }
.lede, footer { color: var(--muted); }
footer { font-size: .85rem; margin-top: 32px; border-top: 1px solid var(--line); padding-top: 12px; }
form { display: grid; gap: 14px; margin-top: 20px; }
.field { display: grid; gap: 6px; font-weight: 600; font-size: .95rem; }
input, textarea, select { font: inherit; font-weight: 400; color: var(--ink); background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; width: 100%; }
textarea { resize: vertical; }
.row { display: flex; flex-wrap: wrap; gap: 10px; }
button { font: inherit; min-height: 44px; padding: 0 18px; border-radius: 10px; border: 1px solid var(--line); background: var(--card); color: var(--ink); cursor: pointer; }
button.primary { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); font-weight: 600; }
button.ghost { background: transparent; border-color: transparent; color: var(--accent); }
button:disabled { opacity: .5; cursor: default; }
.error { color: var(--reject); margin: 0; }
#result { margin-top: 28px; display: grid; gap: 16px; }
.verdict { display: grid; gap: 2px; padding: 14px 16px; border-radius: 12px; }
.verdict strong { font-size: 1.3rem; }
.verdict.fine { background: var(--ok-bg); color: var(--ok); }
.verdict.risky { background: var(--risk-bg); color: var(--risk); }
.verdict.rejected { background: var(--reject-bg); color: var(--reject); }
.field-label { font-size: .75rem; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); font-weight: 700; }
.field-preview p { margin: 4px 0 0; white-space: pre-wrap; }
mark { border-radius: 4px; padding: 0 2px; color: inherit; }
mark.reject { background: var(--reject-bg); box-shadow: inset 0 -2px var(--reject); }
mark.risk { background: var(--risk-bg); box-shadow: inset 0 -2px var(--risk); }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; display: grid; gap: 10px; }
.card blockquote { margin: 0; padding-left: 10px; border-left: 3px solid var(--line); }
.issues { margin: 0; padding-left: 18px; display: grid; gap: 8px; }
.sev { font-size: .72rem; font-weight: 700; padding: 1px 6px; border-radius: 99px; white-space: nowrap; }
.sev.reject { background: var(--reject-bg); color: var(--reject); }
.sev.risk { background: var(--risk-bg); color: var(--risk); }
.issues a { color: var(--accent); white-space: nowrap; }
.rewrite { display: grid; gap: 6px; }
.safe { margin: 0; padding: 10px 12px; border-radius: 10px; background: var(--ok-bg); color: var(--ink); }
.safe-label { font-size: .8rem; color: var(--ok); font-weight: 700; }
.status { margin: 0; color: var(--muted); }
.status.error { color: var(--reject); }
```

- [ ] **Step 3: `icons/icon.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#1f5f8b"/><path d="M18 33l9 9 19-20" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>
```

- [ ] **Step 4: `js/app.js`**

```js
import { CATEGORIES, FIELDS, RULE_TITLES, checkAd, isEmptyAd } from './rules.js';
import { segments, flaggedSentences } from './highlight.js';
import { makeRewrite } from './rewrite.js';
import { createAiClient } from './ai-client.js';

const $ = id => document.getElementById(id);
const FIELD_LABELS = { primary: 'Primary text', headline: 'Headline', description: 'Description' };
const VERDICTS = {
  fine: ['Likely fine', 'No rule hits. Meta still reviews every ad.'],
  risky: ['Risky', 'These lines often get ads flagged.'],
  rejected: ['Likely rejected', 'At least one line breaks a Meta rule as written.'],
};
const EXAMPLE = {
  category: 'health',
  primary: 'Struggling with low energy? Our gummies GUARANTEE results in 7 days! Doctor-recommended and 100% effective.',
  headline: 'Feel like yourself again',
  description: 'Clinically proven formula',
};

// The worker (and the model) start only on the first rewrite, so checking
// is instant and costs no download.
let ai = null;
let gpu = null;
const getAi = () => (ai ??= createAiClient(new Worker(new URL('./ai-worker.js', import.meta.url), { type: 'module' })));

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e[k] = v;
    else e.setAttribute(k, v);
  }
  e.append(...children.filter(c => c != null && c !== false));
  return e;
}

const readAd = () => Object.fromEntries(FIELDS.map(f => [f, $(f).value]));
const uniqueByRule = list => [...new Map(list.map(f => [`${f.ruleId}|${f.text}`, f])).values()];

function render() {
  const ad = readAd();
  const category = $('category').value;
  $('form-error').hidden = !isEmptyAd(ad);
  if (isEmptyAd(ad)) { $('result').hidden = true; return; }
  const { verdict, findings } = checkAd(ad, category);
  const [label, sub] = VERDICTS[verdict];
  $('verdict').className = `verdict ${verdict}`;
  $('verdict-label').textContent = label;
  $('verdict-sub').textContent = findings.length ? `${sub} ${findings.length} issue${findings.length === 1 ? '' : 's'} found.` : sub;
  $('preview').replaceChildren();
  $('cards').replaceChildren();
  for (const field of FIELDS) {
    const text = ad[field];
    if (!text.trim()) continue;
    const fs = findings.filter(f => f.field === field);
    const body = el('p', {}, ...segments(text, fs).map(s => s.spans.length
      ? el('mark', { class: s.spans.some(f => f.severity === 'reject') ? 'reject' : 'risk', title: [...new Set(s.spans.map(f => RULE_TITLES[f.ruleId]))].join(', ') }, s.text)
      : s.text));
    $('preview').append(el('div', { class: 'field-preview' }, el('div', { class: 'field-label' }, FIELD_LABELS[field]), body));
    for (const sentence of flaggedSentences(text, fs)) $('cards').append(card(field, sentence, category));
  }
  $('result').hidden = false;
  $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function card(field, sentence, category) {
  const issues = el('ul', { class: 'issues' }, ...uniqueByRule(sentence.findings).map(f => el('li', {},
    el('span', { class: `sev ${f.severity}` }, f.severity === 'reject' ? 'Likely rejected' : 'Risky'), ' ',
    el('strong', {}, RULE_TITLES[f.ruleId]), `: "${f.text}". ${f.why} `,
    el('a', { href: f.policy.url, target: '_blank', rel: 'noopener' }, `Meta: ${f.policy.title} ↗`))));
  const out = el('div', { class: 'rewrite' });
  const btn = el('button', { type: 'button' }, 'Write a safer version');
  btn.onclick = () => rewrite(sentence, category, btn, out);
  return el('article', { class: 'card' }, el('div', { class: 'field-label' }, FIELD_LABELS[field]), el('blockquote', {}, sentence.text.trim()), issues, btn, out);
}

async function rewrite(sentence, category, btn, out) {
  btn.disabled = true;
  const status = el('p', { class: 'status' }, 'Checking this browser can run the model...');
  out.replaceChildren(status);
  gpu ??= await getAi().check().catch(() => ({ webgpu: false, f16: false }));
  if (!gpu.webgpu || !gpu.f16) {
    status.className = 'status error';
    status.textContent = "This browser can't run the on-device model (it needs WebGPU with 16-bit floats). Checking still works; for rewrites, open this page in Chrome on a recent laptop or Android phone.";
    btn.disabled = false;
    return;
  }
  try {
    status.textContent = 'Loading the model...';
    await getAi().load((loaded, total) => {
      status.textContent = `Downloading the model once (it stays on this device): ${Math.min(100, Math.floor((100 * loaded) / total))}% - ${(loaded / 1e6).toFixed(0)} of ${(total / 1e6).toFixed(0)} MB`;
    });
    status.textContent = 'Writing a safer version...';
    const r = await makeRewrite({
      sentence: sentence.text.trim(), findings: sentence.findings, category,
      generate: (messages, opts) => getAi().generate(messages, opts),
      check: text => checkAd({ primary: text }, category).findings,
    });
    if (!r.ok) {
      status.className = 'status error';
      status.textContent = "Couldn't find a safe version - edit this line by hand.";
    } else {
      const copy = el('button', { type: 'button', class: 'ghost' }, 'Copy');
      copy.onclick = async () => {
        try { await navigator.clipboard.writeText(r.text); copy.textContent = 'Copied'; } catch { copy.textContent = 'Copy failed'; }
        setTimeout(() => { copy.textContent = 'Copy'; }, 1500);
      };
      out.replaceChildren(el('div', { class: 'safe-label' }, 'Safer version - passes every check'), el('p', { class: 'safe' }, r.text), copy);
    }
  } catch (err) {
    status.className = 'status error';
    status.textContent = `Couldn't load the model: ${err.message}. Check your connection and try again - finished files are kept.`;
  }
  btn.disabled = false;
  btn.textContent = 'Try another version';
}

$('category').replaceChildren(...CATEGORIES.map(c => el('option', { value: c.id }, c.label)));
$('ad-form').onsubmit = e => { e.preventDefault(); render(); };
$('example').onclick = () => {
  $('category').value = EXAMPLE.category;
  for (const f of FIELDS) $(f).value = EXAMPLE[f];
  render();
};
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
```

- [ ] **Step 5: Manual test in the browser pane**

`npm run serve`, open `http://localhost:8080/`. Check:
1. Empty form + *Check ad* -> "Paste at least one field." and no verdict (Review Focus 5).
2. *Try an example* -> verdict *Likely rejected*; highlights in primary/description; cards for each flagged sentence; every link opens the matching transparency.meta.com page.
3. Paste `Free delivery in 2 days. 100% money-back guarantee.` (Health) -> *Likely fine*.
4. *Write a safer version* on one card -> progress, then a green safer line or the "edit by hand" message; *Copy* works.
5. 360 px wide (`resize_window` 360x780): no sideways scroll, buttons tappable.
Fix anything that fails before committing.

- [ ] **Step 6: Commit**

```bash
git add index.html css/app.css js/app.js icons/icon.svg
git commit -m "Add Ad Preflight page"
```

---

### Task 7: First-user evaluation

**Files:**
- Create: `eval/summarize.js`, `eval/run-eval.mjs`, `eval/README.md`, `eval/example-ads.json`, `tests/summarize.test.js`

**Interfaces:**
- Consumes: `checkAd` (rules.js).
- Produces: `summarize(rows: Array<{ id, outcome: 'approved'|'rejected', verdict: 'fine'|'risky'|'rejected', ruleIds: string[] }>) => { rejected: { total, caught, missed: id[] }, approved: { total, flaggedRejected, flaggedRisky, falseAlarms: id[] } }` - "caught" = verdict `risky` or `rejected`; "falseAlarms" = approved ads with verdict `rejected`.

- [ ] **Step 1: Write the failing test** - `tests/summarize.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from '../eval/summarize.js';

test('summarize counts catches, misses and false alarms', () => {
  const s = summarize([
    { id: 'r1', outcome: 'rejected', verdict: 'rejected', ruleIds: ['personal-attribute'] },
    { id: 'r2', outcome: 'rejected', verdict: 'risky', ruleIds: ['guarantee'] },
    { id: 'r3', outcome: 'rejected', verdict: 'fine', ruleIds: [] },
    { id: 'a1', outcome: 'approved', verdict: 'fine', ruleIds: [] },
    { id: 'a2', outcome: 'approved', verdict: 'risky', ruleIds: ['endorsement'] },
    { id: 'a3', outcome: 'approved', verdict: 'rejected', ruleIds: ['sexual-pleasure'] },
  ]);
  assert.deepEqual(s, {
    rejected: { total: 3, caught: 2, missed: ['r3'] },
    approved: { total: 3, flaggedRejected: 1, flaggedRisky: 1, falseAlarms: ['a3'] },
  });
});
```

- [ ] **Step 2: Run to verify failure** - `npm test` -> FAIL, module missing.

- [ ] **Step 3: Implement** - `eval/summarize.js`

```js
export function summarize(rows) {
  const rej = rows.filter(r => r.outcome === 'rejected');
  const app = rows.filter(r => r.outcome === 'approved');
  return {
    rejected: { total: rej.length, caught: rej.filter(r => r.verdict !== 'fine').length, missed: rej.filter(r => r.verdict === 'fine').map(r => r.id) },
    approved: {
      total: app.length,
      flaggedRejected: app.filter(r => r.verdict === 'rejected').length,
      flaggedRisky: app.filter(r => r.verdict === 'risky').length,
      falseAlarms: app.filter(r => r.verdict === 'rejected').map(r => r.id),
    },
  };
}
```

`eval/run-eval.mjs`:
```js
// Runs the rules over real past ads. Input: eval/private/ads.json (git-ignored),
// or a path given as the first argument. Prints counts and per-ad rule hits.
import { readFileSync } from 'node:fs';
import { checkAd } from '../js/rules.js';
import { summarize } from './summarize.js';

const path = process.argv[2] ?? new URL('./private/ads.json', import.meta.url);
const ads = JSON.parse(readFileSync(path, 'utf8'));
const rows = ads.map(ad => {
  const { verdict, findings } = checkAd(ad, ad.category ?? 'general');
  return { id: ad.id, outcome: ad.outcome, verdict, ruleIds: [...new Set(findings.map(f => f.ruleId))], reason: ad.reason ?? '' };
});
for (const r of rows) console.log(`${r.id.padEnd(8)} ${r.outcome.padEnd(9)} -> ${r.verdict.padEnd(9)} ${r.ruleIds.join(', ')}${r.reason ? `   (Meta said: ${r.reason})` : ''}`);
const s = summarize(rows);
console.log(`\nRejected ads caught: ${s.rejected.caught} of ${s.rejected.total}${s.rejected.missed.length ? ` (missed: ${s.rejected.missed.join(', ')})` : ''}`);
console.log(`Approved ads wrongly marked "Likely rejected": ${s.approved.flaggedRejected} of ${s.approved.total}; marked "Risky": ${s.approved.flaggedRisky}`);
```

`eval/example-ads.json` (format sample, invented ads, safe to publish):
```json
[
  { "id": "ex1", "category": "health", "primary": "Struggling with low energy? Our gummies work in 7 days.", "headline": "", "description": "", "outcome": "rejected", "reason": "Personal attributes" },
  { "id": "ex2", "category": "health", "primary": "Gummies for busy afternoons. Results vary.", "headline": "Meet your new desk drawer staple", "description": "", "outcome": "approved" }
]
```

`eval/README.md`: explains the format above, that real ads go in `eval/private/ads.json` (git-ignored), and `npm run eval` / `node eval/run-eval.mjs eval/example-ads.json`.

- [ ] **Step 4: Run** - `npm test` -> all PASS; `node eval/run-eval.mjs eval/example-ads.json` -> ex1 rejected/risky with personal-attribute, ex2 fine; "Rejected ads caught: 1 of 1".

- [ ] **Step 5: Commit**

```bash
git add eval/summarize.js eval/run-eval.mjs eval/README.md eval/example-ads.json tests/summarize.test.js
git commit -m "Add first-user evaluation script"
```

- [ ] **Step 6: When Mayank supplies the team's ads**, save them to `eval/private/ads.json` (never committed), run `npm run eval`, and record the counts in the README and post. Rule changes prompted by misses follow TDD: add the (anonymised) line as a failing test in `tests/rules.test.js` first.

---

### Task 8: Offline shell, README, licence

**Files:**
- Create: `sw.js`, `README.md`, `LICENSE`

- [ ] **Step 1: `sw.js`**

```js
const CACHE = 'ad-preflight-v1';
const ASSETS = [
  './', './index.html', './css/app.css', './icons/icon.svg',
  './js/app.js', './js/rules.js', './js/policies.js', './js/highlight.js', './js/rewrite.js',
  './js/ai-client.js', './js/ai-worker.js', './js/opfs-cache.js', './js/progress.js',
  './vendor/transformers.min.js', './vendor/ort/ort-wasm-simd-threaded.asyncify.mjs', './vendor/ort/ort-wasm-simd-threaded.asyncify.wasm',
];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('ad-preflight-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// App files: cache first. Model files from huggingface.co are left to the OPFS cache.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit ?? fetch(e.request)));
});
```

- [ ] **Step 2: Offline check** - with the model already loaded once: DevTools offline, reload; checking and a rewrite both work.

- [ ] **Step 3: `README.md`** - what it is, live link (`DEMO_URL` until Task 9), who it's for, the rules table from the spec with links, privacy, run locally (`npm test`, `npm run serve`), evaluation (`npm run eval`, counts once available), measured model timings, credits (Gemma Terms of Use; Transformers.js Apache-2.0; onnxruntime-web MIT), "a pre-check, not legal advice or a guarantee". `LICENSE`: MIT, `Copyright (c) 2026 Mayank Vyas`.

- [ ] **Step 4: Commit**

```bash
git add sw.js README.md LICENSE
git commit -m "Add offline shell, README and licence"
```

---

### Task 9: Publish and DEV post

- [ ] **Step 1: Personal account (Mayank)** - Mayank runs `gh auth login` (personal account) and shares the username. Then:
```bash
git config user.email "<username>@users.noreply.github.com"
git rebase --root --exec "git commit --amend --no-edit --reset-author"
git log --format="%an <%ae>" | sort -u
```
Expected: one author line.

- [ ] **Step 2: Publish (confirm with Mayank first - public)**
```bash
gh repo create ad-preflight --public --source . --push --description "Check Meta ad copy against Meta's ad policies before you publish. Rules + on-device Gemma rewrites. Nothing leaves your browser."
gh api -X POST repos/<username>/ad-preflight/pages -f "source[branch]=main" -f "source[path]=/"
gh api repos/<username>/ad-preflight/pages --jq .html_url
```
Put the URL in the README, commit, push; open the live URL and repeat Task 6 Step 5 items 1-4.

- [ ] **Step 3: Post draft** - `docs/post-draft.md` using the Week 2 template headings exactly (What I Built, Demo, Code, How I Built It, Why Does Open Innovation Matter?, My Agent Session, My First User, Prize Categories), tags `devchallenge, hf26challenge, gemma, opensource`, opening line linking `https://dev.to/challenges/hacktoberfest-week2-2026-10-12`, Prize Categories: Best Use of Gemma. Includes: who pays and why (cost of a rejection, free-to-run margins), the rules-then-model design and why a 1B model is not the judge, measured eval counts, honest misses, privacy proof. First-user section names only "a D2C wellness brand". Show Mayank the text; after a yes, save to DEV as an unpublished draft via DevRelay `create_article` (`published: false`). Mayank publishes.

- [ ] **Step 4: Commit**

```bash
git add docs/post-draft.md README.md
git commit -m "Add DEV post draft and live link"
```
