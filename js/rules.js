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
