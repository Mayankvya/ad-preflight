// What Gemma is asked, how its answer is cleaned, and the rule: a rewrite is
// only shown if the same rules find nothing in it.
import { CATEGORIES, RULE_TITLES } from './rules.js';

const categoryLabel = id => CATEGORIES.find(c => c.id === id)?.label ?? 'General';

function requestTurn({ sentence, findings, category }) {
  const problems = [...new Map(findings.map(f => [`${f.ruleId}|${f.text}`, f])).values()]
    .map(f => `- ${RULE_TITLES[f.ruleId]}: "${f.text}". ${f.why}`).join('\n');
  // A 1B model copies phrases from the input; naming them stops that.
  const banned = [...new Set(findings.map(f => f.text.trim()))].map(t => `"${t}"`).join(', ');
  return [
    `You rewrite one line of Meta (Facebook/Instagram) ad copy so it follows Meta's ad policies. Category: ${categoryLabel(category)}.`,
    `Line: "${sentence}"`,
    'Problems:',
    problems,
    `Leave out these words completely: ${banned}.`,
    'Rules for the new line: one sentence; a statement, never a question; keep the product and its main benefit; never ask about or describe the reader\'s body, health, money, age or identity; no cures, guarantees or rankings; no number of minutes, hours, days, weeks or months; no pleasure or sexual wording; plain and friendly.',
    'Reply with the new line only.',
  ].join('\n');
}

// A 1B model copies a worked example far more reliably than it follows rules.
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

const FILLER = /^(?:sure|okay|ok|certainly|of course)\b/i;
// "Safer version: ...", "Option 1: ...", "Here is the rewritten line: ..." -> what follows.
const LABELLED = /^[^:"“]{1,60}:\s*(\S.*)$/;
const LIST_MARKER = /^(?:[-*•]|\d+[.)])\s+/;
// A refusal or a comment about the task is not a rewrite.
const NOT_AD_COPY = /^(?:i\b|i'm|i’m|as an ai|sorry|unfortunately|this (?:line|version|rewrite|sentence|ad)\b|note\b)|\b(?:request|polic(?:y|ies)|rewrite|rewritten)\b/i;

// Returns the first usable line of ad copy, or '' (a failed try).
export function cleanRewrite(raw) {
  for (const original of String(raw ?? '').split('\n')) {
    let line = original.trim().replace(/\*\*/g, '').replace(LIST_MARKER, '').trim();
    if (!line) continue;
    const labelled = line.match(LABELLED);
    if (labelled) line = labelled[1];
    else if (/:\s*$/.test(line) || FILLER.test(line)) continue;
    line = line.replace(/^["'“”‘’]+/, '');
    // '"Gummies for busy afternoons." This version avoids...' -> the quoted part.
    const quoted = line.match(/^(.*?[.!?])["'”’]/);
    if (quoted) line = quoted[1];
    line = line.replace(/["'“”‘’]+$/, '').trim();
    if (NOT_AD_COPY.test(line)) return '';
    if (!/[.!?]$/.test(line)) return ''; // cut off at the token limit
    return line.length >= 4 ? line : '';
  }
  return '';
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
