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
