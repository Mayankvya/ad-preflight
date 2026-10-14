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
