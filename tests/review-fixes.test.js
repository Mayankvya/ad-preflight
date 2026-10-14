// Inputs from the whole-branch review (14 Oct 2026). Each was verified against
// the code before the fix: CLEAN lines were wrongly flagged, FLAGGED lines were missed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAd } from '../js/rules.js';

const found = (text, category) => checkAd({ primary: text }, category).findings;

const CLEAN = [
  // I1a: attribute adjectives describing products, not the reader
  ['Are you Black Friday ready? Deals start now.', 'general'],
  ['Unlike other Black Friday sales, ours lasts all week.', 'general'],
  ['Pair it with other black accessories.', 'general'],
  ['Try our other Asian sauces.', 'general'],
  ['Unlike other virgin olive oils, ours is cold-pressed.', 'general'],
  ['Join other senior engineers on our team.', 'general'],
  ['Discover other Christian books in our store.', 'general'],
  // I1b: "your" + an everyday thing, test or risk
  ['Clean your hearing aids in 60 seconds.', 'general'],
  ['Ditch your sleep aids.', 'health'],
  ['Support your thyroid health with iodine.', 'health'],
  ['Book your cancer screening today.', 'health'],
  ['Get your free HIV test.', 'health'],
  ['Lower your skin cancer risk with SPF 50.', 'beauty'],
  ['Protect your skin from acne-causing bacteria.', 'beauty'],
  // I1c: colour names, hair textures, plumbing, Latin, Indian English
  ['Our new nude lipstick shades are here.', 'beauty'],
  ['Nude heels for every outfit.', 'general'],
  ['Shop the Naked eyeshadow palette.', 'beauty'],
  ['Pores invisible to the naked eye.', 'beauty'],
  ['Kinky curly hair extensions, 100% human hair.', 'beauty'],
  ['Kink-free garden hose.', 'general'],
  ['Easy to hook up to any faucet.', 'general'],
  ['Hook up your TV in minutes.', 'general'],
  ['Graduated summa cum laude.', 'general'],
  ['Spacious 2BHK with a living-cum-dining area.', 'general'],
  // I1d: smells and hair that belong to objects
  ['No more gross smells in your fridge.', 'general'],
  ['Get rid of nasty smells in your car.', 'general'],
  ['Eliminates stinky odors from laundry.', 'general'],
  ['Clears gross hair clogs from your drain.', 'general'],
  ['No more embarrassing pet smells.', 'general'],
  // I1e: "cure" as a noun, fundraising
  ['There is no cure for psoriasis, but our cream soothes the itch.', 'beauty'],
  ["Donate to help find a cure for Alzheimer's.", 'general'],
  ['Help us beat cancer. Donate today.', 'general'],
  // I2a: everyday questions outside wellness
  ['Feeling hungry? Order now.', 'general'],
  ['Feeling lucky? Spin the wheel.', 'general'],
  ['Tired of tangled cables? Try our organizer.', 'general'],
  ['Sick of slow Wi-Fi?', 'general'],
  ['Do you get bored on long flights?', 'general'],
  ['Fed up with high energy bills?', 'general'],
  // I2b: delivery and return windows
  ['Order today and see your package in 2 days.', 'health'],
  ['Arrives in 2 days, ready to change your routine.', 'health'],
  ['Love your skin or return it within 30 days.', 'beauty'],
  ['Get your skincare kit delivered in 2 days, ready to transform your routine.', 'beauty'],
  ['Get our recipe book. Ships within 24 hours, packed by hand to keep it looking better than new.', 'weight'],
  // shop copy in sexual wellness must not trip the enhancement words
  ['Bigger pack, same price.', 'sexual-wellness'],
  ['Shipping is harder to beat than ours.', 'sexual-wellness'],
  // I2c: product returns
  ['Easy returns guaranteed.', 'general'],
  ['30-day returns guaranteed.', 'general'],
  ['Free shipping and guaranteed easy returns.', 'general'],
];

for (const [text, category] of CLEAN) {
  test(`not flagged (${category}): ${text}`, () => {
    assert.deepEqual(found(text, category).map(f => `${f.ruleId}: ${f.text}`), []);
  });
}

const FLAGGED = [
  // I4: enhancement framing in sexual wellness
  ['Male enhancement pills that work.', 'sexual-wellness', 'sexual-pleasure', 'reject'],
  ['Last longer tonight.', 'sexual-wellness', 'sexual-pleasure', 'reject'],
  ['Bigger, harder erections.', 'sexual-wellness', 'sexual-pleasure', 'reject'],
  ['Boost your libido and stamina.', 'sexual-wellness', 'sexual-pleasure', 'reject'],
  ['Increase your size naturally.', 'sexual-wellness', 'sexual-pleasure', 'reject'],
  ['Better sex starts here.', 'sexual-wellness', 'sexual-pleasure', 'reject'],
  ['Have the best sex of your life.', 'sexual-wellness', 'sexual-pleasure', 'reject'],
  ['Make her moan.', 'sexual-wellness', 'sexual-pleasure', 'reject'],
  // I5: masked profanity ending in asterisks
  ['What the f*** is this deal?', 'general', 'profanity', 'reject'],
  ['Holy s*** these prices.', 'general', 'profanity', 'reject'],
  ['Get your a** to the sale.', 'general', 'profanity', 'reject'],
  // I5: attribute questions without a listed lead
  ['Overweight? Try our plan.', 'weight', 'personal-attribute', 'reject'],
  ['Got diabetes? We can help.', 'health', 'personal-attribute', 'reject'],
  ['Have anxiety? Try our tea.', 'health', 'personal-attribute', 'reject'],
  ['Have bad credit? Get a loan today.', 'general', 'personal-attribute', 'reject'],
  ['Tired of being overweight?', 'weight', 'personal-attribute', 'reject'],
  // I5: timeframe ranges, missing spaces, result words, qualifier boundary
  ['See results in 7-10 days.', 'beauty', 'timeframe-promise', 'risk'],
  ['Visible results in 4-6 weeks.', 'beauty', 'timeframe-promise', 'risk'],
  ['Clear skin in 7–10 days.', 'beauty', 'timeframe-promise', 'risk'],
  ['Results in 7days.', 'health', 'timeframe-promise', 'risk'],
  ['Feel better in 30-days.', 'health', 'timeframe-promise', 'risk'],
  ['Fall asleep in 10 minutes.', 'health', 'timeframe-promise', 'risk'],
  ['Our gummies work in 7 days.', 'health', 'timeframe-promise', 'risk'],
  ['Lowers blood sugar in 7 days.', 'health', 'timeframe-promise', 'risk'],
  ['Flat belly in 2 weeks.', 'weight', 'timeframe-promise', 'risk'],
  ['Order now and see results in 7 days.', 'health', 'timeframe-promise', 'risk'],
  ['Results in 7 days with dietary supplements.', 'health', 'timeframe-promise', 'risk'],
  // I5: hyphenated endorsement, cure claims by meaning
  ['Clinically-proven formula.', 'beauty', 'endorsement', 'risk'],
  ['Diabetes-free in 30 days.', 'health', 'cure-claim', 'reject'],
  ['Say goodbye to diabetes.', 'health', 'cure-claim', 'reject'],
  ['Prevents cancer naturally.', 'health', 'cure-claim', 'reject'],
];

for (const [text, category, ruleId, severity] of FLAGGED) {
  test(`flagged ${ruleId} (${category}): ${text}`, () => {
    const f = found(text, category).find(x => x.ruleId === ruleId);
    assert.ok(f, `expected ${ruleId}`);
    assert.equal(f.severity, severity);
  });
}

test('every Meta personal-attribute example still behaves after the fixes', () => {
  assert.equal(checkAd({ primary: 'Meet other black singles near you!' }).verdict, 'rejected');
  assert.equal(checkAd({ primary: 'Meet other Buddhists' }).verdict, 'rejected');
  assert.equal(checkAd({ primary: 'Find black singles today.' }).verdict, 'fine');
});
