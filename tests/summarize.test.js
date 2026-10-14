import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from '../eval/summarize.js';

test('summarize counts catches, misses and false alarms', () => {
  const s = summarize([
    { id: 'r1', outcome: 'rejected', verdict: 'rejected', ruleIds: ['personal-attribute'] },
    { id: 'r2', outcome: 'rejected', verdict: 'risky', ruleIds: ['guarantee'] },
    { id: 'r3', outcome: 'rejected', verdict: 'fine', ruleIds: [] },
    { id: 'a1', outcome: 'approved', verdict: 'fine', ruleIds: [] },
    { id: 'a2', outcome: 'approved', verdict: 'risky', ruleIds: ['endorsement'] },
    { id: 'a3', outcome: 'approved', verdict: 'rejected', ruleIds: ['sexual-pleasure'] },
  ]);
  assert.deepEqual(s, {
    rejected: { total: 3, caught: 2, missed: ['r3'] },
    approved: { total: 3, flaggedRejected: 1, flaggedRisky: 1, falseAlarms: ['a3'] },
  });
});
