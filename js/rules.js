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

export const RULES = [
  {
    id: 'personal-attribute', title: 'Personal attribute', severity: 'reject', categories: null,
    why: 'Meta bans ads that assert or imply the reader\'s health, finances, age, religion, sexuality, race or other personal attributes. Talk about the product instead.',
    policy: POLICIES.personalAttributes,
    find: text => PERSONAL.flatMap(f => f(text)),
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
