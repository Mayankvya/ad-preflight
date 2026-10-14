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
const SENTENCE_START = String.raw`(?<=^|[.!?]\s+)`;

// ---- personal attributes -----------------------------------------------

// Things a person "has" (health, money, record): unsafe after "your".
const OWNED = [
  'diabetes', 'diabetic', 'depression', 'anxiety', 'adhd', 'cancer', 'hiv', 'herpes', 'std', 'stds', 'sti', 'stis',
  'obesity', 'acne', 'eczema', 'psoriasis', 'arthritis', 'insomnia', 'infertility', 'erectile dysfunction', 'impotence',
  'premature ejaculation', 'low libido', 'menopause', 'pcos', 'ibs', 'thyroid disease', 'thyroid problems', 'thyroid condition',
  'hair loss', 'balding', 'disability', 'pregnancy', 'addiction', 'bulimia', 'anorexia', 'eating disorder',
  'high blood pressure', 'hypertension', 'asthma', 'autism', 'dementia', "alzheimer's", 'bankruptcy', 'debt', 'bad credit',
  'criminal record', 'ballot', 'union rep',
];
// "your cancer screening", "acne-causing", "your HIV test": the thing, not the person.
const NOT_THE_PERSON = String.raw`(?![\s-]*(?:tests?|testing|screenings?|risks?|checks?|check-ups?|awareness|causing|prevention|research)\b)`;
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
// Attribute words that name people on their own ("other Buddhists").
const PEOPLE_ATTRS = ['seniors', 'teens', 'teenagers', 'christians', 'muslims', 'hindus', 'jews', 'buddhists', 'sikhs',
  'catholics', 'atheists', 'lesbians', 'gays', 'bisexuals', 'felons', 'diabetics', 'alcoholics', 'voters', 'latinos', 'latinas'];
const PEOPLE = String.raw`singles|men|women|man|woman|people|persons?|moms?|mothers?|dads?|fathers?|parents?|couples?|guys|girls|boys|adults|students|professionals|veterans|patients|families|friends|folks|members|believers`;
const AGE = String.raw`\d{1,3}\s*(?:years?|yrs?)\s*old|over\s+\d{2}|under\s+\d{2}|in\s+your\s+\d0s`;
const ATTR = `(?:${alt(ATTRIBUTES)}|${AGE})${NOT_THE_PERSON}`;
// An attribute after "Are you..." must end the thought ("Are you Christian?",
// "Are you diabetic and tired?"), not describe a thing ("Are you Black Friday ready?").
const ENDS_THOUGHT = String.raw`(?=\s*(?:[?.!,;:)]|$)|\s+(?:and|or|but|who|with|looking|living|seeking|${PEOPLE})\b)`;
const QUESTION_LEADS = alt([
  'are you', 'do you have', 'do you suffer from', 'have you been diagnosed with', 'struggling with', 'suffering from',
  'dealing with', 'living with', 'battling', 'questioning your', 'dislike your', 'worried about your',
  'tired of being', 'sick of being',
]);
const OTHER = String.raw`\b(?:meet\s+other|other|fellow)\s+(?:(?:${alt(PEOPLE_ATTRS)})\b|(?:${alt(ATTRIBUTES)})\s+(?:${PEOPLE})\b)`;

const PERSONAL = [
  finder(new RegExp(`\\b(?:${QUESTION_LEADS})\\s+(?:(?:a|an|still|really|currently)\\s+)?(?:${ATTR})\\b${ENDS_THOUGHT}`, 'gim'), 'reject'),
  finder(new RegExp(`${SENTENCE_START}(?:have|got|has)\\s+(?:${ATTR})\\b${ENDS_THOUGHT}`, 'gim'), 'reject'),
  finder(new RegExp(`${SENTENCE_START}(?:${ATTR})\\?`, 'gim'), 'reject'),
  finder(new RegExp(OTHER, 'gi'), 'reject'),
  finder(new RegExp(`\\byour\\s+(?:[\\w'-]+\\s+){0,3}?(?:${alt(OWNED)})\\b${NOT_THE_PERSON}`, 'gi'), 'reject'),
  finder(/\bwhat(?:'s|\s+is)\s+your\s+(?:driver'?s\s+licen[cs]e|social\s+security|ssn|passport|aadhaar|pan\s+card|bank\s+account|credit\s+card|password)/gi, 'reject'),
];
// A question that assumes the reader has a problem: Meta treats implying a
// condition like asserting it. Only in wellness categories: "Feeling hungry?
// Order now." is fine for a restaurant.
const IMPLIED = finder(new RegExp(`${SENTENCE_START}(?:struggling with|suffering from|dealing with|tired of|sick of|battling|fed up with|(?:always\\s+|constantly\\s+|still\\s+)?feeling|do\\s+you\\s+(?:often\\s+|ever\\s+|always\\s+|still\\s+)?(?:feel|get|struggle|suffer|have\\s+trouble))\\b[^.!?\\n]*\\?`, 'gim'), 'risk');

// ---- health claims -----------------------------------------------------

const CONDITIONS = alt(['diabetes', 'herpes', 'thyroid disease', 'thyroid problems', 'thyroid', 'psoriasis', 'ebola', 'cancer',
  'autism', "alzheimer's", 'alzheimers', "parkinson's", 'parkinsons', 'als', 'hiv']);
const CURE_VERBS = String.raw`cure[sd]?|curing|heal(?:s|ed|ing)?|eliminat(?:e|es|ed|ing)|revers(?:e|es|ed|ing)|get\s+rid\s+of|eradicat(?:e|es|ed|ing)|prevent(?:s|ed|ing)?`;
const CURE = [
  // "no cure for", "a cure for": cure as a noun is not a claim.
  finder(new RegExp(`\\b(?<!\\b(?:no|a|the)\\s+)(?:${CURE_VERBS})\\s+(?:[\\w'-]+\\s+){0,3}?(?:${CONDITIONS})\\b`, 'gi')),
  finder(new RegExp(`\\b(?:${CONDITIONS})\\s+(?:is\\s+|was\\s+)?(?:cured|reversed|gone|healed|eliminated)\\b`, 'gi')),
  finder(new RegExp(`\\b(?:${CONDITIONS})[\\s-]+free\\b`, 'gi')),
  finder(new RegExp(`\\bsay\\s+goodbye\\s+to\\s+(?:your\\s+)?(?:${CONDITIONS})\\b`, 'gi')),
];

const TIMEFRAME = /\b(?:in|within|after)\s+(?:just\s+|only\s+|as\s+little\s+as\s+)?(?:\d+(?:\s*[-–]\s*\d+)?|one|two|three|four|five|six|seven|ten|fourteen|thirty|a)\s*[-–]?\s*(?:minutes?|hours?|days?|weeks?|months?|nights?)\b|\bovernight\b/gi;
// Words that turn "in 7 days" into a promise about the body or the outcome.
const RESULT = /\b(?:results?|lose|lost|loss|burn\w*|gone|clear\w*|glow\w*|smooth\w*|younger|slimmer|thinner|stronger|harder|longer|bigger|firmer|kg|kgs|lbs|pounds|inches|sizes?|wrinkles?|acne|skin|weight|fat|belly|body|flat|energ\w*|sleep|asleep|libido|stamina|performance|feel\w*|see|notic\w*|experienc\w*|improv\w*|better|differen\w*|chang\w*|boost\w*|transform\w*|works?|lower\w*|reduc\w*)\b/i;
// Delivery, returns and replies are timeframes about the shop, not the body.
const LOGISTICS = /\b(?:ship\w*|deliver\w*|arriv\w*|dispatch\w*|return\w*|refund\w*|cancel\w*|reply|replies|respond\w*|package\w*|parcel\w*|courier\w*)\b/i;
// The clause around a match: split on sentence ends, commas, semicolons, colons and "and".
const clauseAround = (text, at) => {
  const before = text.slice(0, at);
  const after = text.slice(at);
  const start = Math.max(...[/[.!?\n,;:]/g, /\band\b/gi].map(re => { let last = -1, m; while ((m = re.exec(before))) last = m.index + m[0].length; return last; }), 0);
  const endMatch = after.match(/[.!?\n,;:]|\band\b/i);
  return text.slice(start, endMatch ? at + endMatch.index : text.length);
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
// Always about a person.
const BODY = String.raw`skin|face|body|belly|stomach|tummy|thighs?|arms?|legs?|teeth|smile|breath|nose|butt|hips?|chin|muffin\s+top|love\s+handles|feet|armpits?|acne|scars?|cellulite|wrinkles|pores`;
// Could belong to a fridge, a drain or a pan: only a person's when a body
// word says so, or when nothing follows ("No more embarrassing odour.").
const AMBIGUOUS = String.raw`odou?rs?|smells?|hair|fat|bumps`;
const BODY_CONTEXT = String.raw`body|underarm|armpit|foot|feet|mouth|vaginal|intimate|sweat|facial|chin|leg|arm|belly|back`;
const APPEARANCE = [
  finder(new RegExp(`\\b(?:${NEG})\\s+(?:[\\w'-]+\\s+)?(?:${BODY})\\b`, 'gi')),
  finder(new RegExp(`\\b(?:${NEG})\\s+(?:${BODY_CONTEXT})\\s+(?:${AMBIGUOUS})\\b`, 'gi')),
  finder(new RegExp(`\\b(?:${NEG})\\s+(?:${AMBIGUOUS})\\b(?=\\s*(?:[.!?,;:]|$|for\\s+good|forever))`, 'gim')),
  finder(new RegExp(`\\b(?:hate|hating|ashamed\\s+of|embarrassed\\s+(?:by|of)|insecure\\s+about|disgusted\\s+by)\\s+your\\s+(?:${BODY}|${AMBIGUOUS}|looks|appearance|reflection)\\b`, 'gi')),
];

// ---- commercial practices ----------------------------------------------

const GUARANTEE = [
  finder(/\bguarantee[ds]?\s+(?:[\w'-]+\s+){0,2}?(?:results?|success|cure|weight\s+loss|to\s+work|profits?|income|growth)\b/gi),
  finder(/\b(?:results?|success|weight\s+loss)\s+(?:are\s+|is\s+)?guaranteed\b/gi),
  // Returns on money, not product returns.
  finder(/\bguarantee[ds]?\s+(?:\d+\s*%\s+)?(?:returns?|profits?|earnings)\s+(?:on|of|every|each|per)\b|\b\d+\s*%\s+guaranteed\s+returns?\b|\bguaranteed\s+(?:monthly|weekly|daily|annual)\s+(?:returns?|income|profits?)\b/gi),
  finder(/\brisk[- ]free\s+(?:results?|returns?|investment)\b/gi),
];
const ENDORSEMENT = [
  finder(/\b(?:doctor|dermatologist|physician|gynaecologist|gynecologist|expert)s?[- ]?(?:recommended|approved|endorsed)\b/gi),
  finder(/\brecommended\s+by\s+(?:doctors|dermatologists|experts|physicians)\b/gi),
  finder(/\bclinically[\s-]+proven\b/gi),
  finder(/(?:#\s?1|\bno\.?\s*1|\bnumber\s+(?:one|1))\s+(?:rated|recommended|doctor[- ]recommended|selling|best[- ]selling|brand)\b/gi),
  finder(/\bfda[- ]approved\b/gi),
  finder(/\bas\s+seen\s+on\b/gi),
];

// ---- language -----------------------------------------------------------

const PROFANITY = [
  finder(/\b(?:f+u+c+k\w*|motherf\w*|sh[i1]t(?:s|ty|ting)?|bullshit\w*|bitch\w*|bastard\w*|asshole\w*|dickhead\w*|cunt\w*|piss(?:ed)?)\b/gi),
  // Partly masked words (f*!%ing, s**t, f***, t*s*h*i*r*t*s) - Meta bans these too.
  finder(/\b[a-z]+\*[a-z*@#$%!]*(?:[a-z]|\*(?=[\s.,!?;:]|$))/gim),
];
const EXPLICIT = finder(new RegExp([
  String.raw`\bsex\s+positions?\b`, String.raw`\bforeplay\b`, String.raw`\boral\s+sex\b`, String.raw`\bblow\s*jobs?\b`,
  String.raw`\bhorny\b`, String.raw`\bthreesomes?\b`, String.raw`\bnsfw\b`, String.raw`\bporn\w*`, String.raw`\berotic\w*`,
  String.raw`\bmasturbat\w*`, String.raw`\borg(?:y|ies)\b`, String.raw`\bdirty\s+talk\b`,
  // "kinky curly hair", "kink-free hose" are not sexual
  String.raw`\bkink(?:y|s)?\b(?![\s-]*(?:free|curly|coily|straight|hair)\b)`,
  // "hook up a faucet" is plumbing
  String.raw`\bhook\s*up\s+with\b|\bhookup\s+(?:apps?|sites?|culture)\b|\bcasual\s+hook\s*ups?\b`,
  // "nude lipstick", "the naked eye" are not sexual
  String.raw`\bnudes\b|\b(?:nude|naked)\s+(?:photos?|pics?|pictures?|selfies?|women|girls|men|guys|models?|bodies)\b`,
  // "summa cum laude", "living-cum-dining" are not sexual
  String.raw`(?<![-\w])cum(?![-\w])(?!\s+laude)`,
].join('|'), 'gi'));
const PLEASURE = finder(new RegExp([
  String.raw`\bpleasur\w*`, String.raw`\borgasm\w*`, String.raw`\bclimax\w*`, String.raw`\btoys?\b`, String.raw`\bvibrators?\b`,
  String.raw`\bdildos?\b`, String.raw`\bspice\s+(?:things\s+)?up\b`, String.raw`\bin\s+the\s+bedroom\b`, String.raw`\bin\s+bed\b`,
  String.raw`\bsexy\b`, String.raw`\bsensual\b`, String.raw`\barous\w*`, String.raw`\bturn(?:s|ed)?\s+(?:you|her|him)\s+on\b`,
  String.raw`\bmind[- ]blowing\b`, String.raw`\bsatisfy\s+(?:her|him|your\s+partner)\b`, String.raw`\bintense\s+sensations?\b`,
  String.raw`\bg[- ]spot\b`,
  // Enhancement is banned alongside pleasure.
  String.raw`\b(?:male\s+)?enhancement\b`, String.raw`\blast(?:s|ing)?\s+longer\b`, String.raw`\bstamina\b`, String.raw`\blibido\b`,
  String.raw`\berections?\b`, String.raw`\bbigger,?\s+(?:and\s+)?harder\b`, String.raw`\b(?:bigger|harder|firmer)\s+(?:erections?|penis|size)\b`,
  String.raw`\b(?:increase|boost|enlarge)\s+(?:your\s+)?size\b`,
  String.raw`\b(?:best|better|great|amazing|hotter)\s+sex\b`, String.raw`\bmoan\w*`,
].join('|'), 'gi'));

export const RULES = [
  {
    id: 'personal-attribute', title: 'Personal attribute', severity: 'reject', categories: null,
    why: 'Meta bans ads that assert or imply the reader\'s health, finances, age, religion, sexuality, race or other personal attributes. Talk about the product instead.',
    policy: POLICIES.personalAttributes,
    find: (text, ctx) => [...PERSONAL.flatMap(f => f(text)), ...(WELLNESS.includes(ctx.category) ? IMPLIED(text) : [])],
  },
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
      .filter(m => { const clause = clauseAround(text, m.index); return RESULT.test(clause) && !LOGISTICS.test(clause); })
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
    why: 'Guaranteed results or returns read as misleading claims. A money-back guarantee or guaranteed product returns are fine; a guaranteed outcome is not.',
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
    id: 'sexual-pleasure', title: 'Pleasure or enhancement (sexual wellness)', severity: 'reject', categories: ['sexual-wellness'],
    why: 'Meta allows sexual and reproductive health products only when the ad focuses on health and medical efficacy; products and messages about pleasure or enhancement are prohibited.',
    policy: POLICIES.healthWellness,
    find: PLEASURE,
  },
];

export const RULE_TITLES = new Proxy({}, { get: (_, id) => RULES.find(r => r.id === id)?.title });

// Results qualifiers ("results may vary") anywhere in the ad soften
// timeframe promises.
const QUALIFIER = /results?\s+(?:may\s+)?vary|individual\s+results|results\s+(?:are\s+)?not\s+typical|with\s+(?:a\s+)?(?:healthy\s+)?(?:diet|exercise)\b/i;

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
