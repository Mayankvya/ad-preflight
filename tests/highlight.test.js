import { test } from 'node:test';
import assert from 'node:assert/strict';
import { segments, flaggedSentences } from '../js/highlight.js';

const join = segs => segs.map(s => s.text).join('');

test('no spans gives one plain segment', () => {
  const s = segments('hello world', []);
  assert.equal(s.length, 1);
  assert.deepEqual(s[0].spans, []);
});

test('overlapping spans split into pieces without losing text (Review Focus 3)', () => {
  const text = 'Are you diabetic today';
  const a = { start: 0, end: 16, id: 'a' };   // "Are you diabetic"
  const b = { start: 8, end: 22, id: 'b' };   // "diabetic today"
  const s = segments(text, [a, b]);
  assert.equal(join(s), text);
  assert.deepEqual(s.map(x => [x.text, x.spans.map(y => y.id).join('')]), [
    ['Are you ', 'a'], ['diabetic', 'ab'], [' today', 'b'],
  ]);
});

test('identical spans do not duplicate text', () => {
  const s = segments('abc def', [{ start: 0, end: 3 }, { start: 0, end: 3 }]);
  assert.equal(join(s), 'abc def');
  assert.equal(s[0].spans.length, 2);
});

test('flaggedSentences returns only sentences with findings, with offsets', () => {
  const text = 'Are you diabetic? Try our tea. It cures diabetes.';
  const f1 = { start: 0, end: 16 };
  const f2 = { start: 34, end: 48 };
  const out = flaggedSentences(text, [f1, f2]);
  assert.deepEqual(out.map(s => s.text.trim()), ['Are you diabetic?', 'It cures diabetes.']);
  assert.equal(text.slice(out[1].start, out[1].end), out[1].text);
  assert.deepEqual(out[1].findings, [f2]);
});

test('a sentence without a terminator at the end is still found', () => {
  const out = flaggedSentences('Fine line. Are you gay', [{ start: 11, end: 22 }]);
  assert.equal(out[0].text.trim(), 'Are you gay');
});
