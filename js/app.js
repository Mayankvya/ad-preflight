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
  primary: 'Are you diabetic and always tired? Our gummies GUARANTEE results in 7 days! Doctor-recommended and 100% effective.',
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
