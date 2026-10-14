import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProgress } from '../js/progress.js';

test('a small file finishing early does not look like the whole download', () => {
  const p = createProgress(1000);
  const s = p.update({ status: 'done', file: 'config.json', total: 10 });
  assert.equal(s.loaded, 10);
  assert.equal(s.total, 1000);
});

test('bytes add up across files and progress updates replace older ones', () => {
  const p = createProgress(1000);
  p.update({ status: 'progress', file: 'a', loaded: 100, total: 400 });
  p.update({ status: 'progress', file: 'b', loaded: 50, total: 500 });
  const s = p.update({ status: 'progress', file: 'a', loaded: 300, total: 400 });
  assert.deepEqual(s, { loaded: 350, total: 1000 });
});

test('real total wins when it is bigger than the estimate', () => {
  const p = createProgress(100);
  const s = p.update({ status: 'progress', file: 'a', loaded: 10, total: 400 });
  assert.deepEqual(s, { loaded: 10, total: 400 });
});

test('finish() reports complete even if the estimate was too high', () => {
  const p = createProgress(1000);
  p.update({ status: 'done', file: 'a', total: 900 });
  assert.deepEqual(p.finish(), { loaded: 900, total: 900 });
});

test('non-byte events are ignored', () => {
  const p = createProgress(1000);
  assert.equal(p.update({ status: 'initiate', file: 'a' }), null);
  assert.equal(p.update({ status: 'ready', model: 'x' }), null);
});
