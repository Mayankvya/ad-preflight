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
