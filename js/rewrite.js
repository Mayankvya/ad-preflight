// What Gemma is asked, how its answer is cleaned, and the rule: a rewrite is
// only shown if the same rules find nothing in it.
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
    'Rules for the new line: one sentence; a statement, never a question; keep the product and its main benefit; never ask about or describe the reader\'s body, health, money, age or identity; no cures, guarantees, rankings or results within a set time; no pleasure or sexual wording; plain and friendly.',
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
