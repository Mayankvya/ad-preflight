import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAiClient } from '../js/ai-client.js';

function fakeWorker(handler) {
  const listeners = [];
  const w = {
    sent: [],
    addEventListener: (_t, fn) => listeners.push(fn),
    postMessage(msg) { w.sent.push(msg); queueMicrotask(() => handler(msg, data => listeners.forEach(fn => fn({ data })))); },
  };
  return w;
}

test('generate waits for load, then returns the model text', async () => {
  let release;
  const w = fakeWorker((m, reply) => {
    if (m.type === 'load') { release = () => reply({ id: m.id, ok: true, result: true }); return; }
    reply({ id: m.id, ok: true, result: `t=${m.temperature}` });
  });
  const ai = createAiClient(w);
  const p = ai.generate([{ role: 'user', content: 'x' }], { temperature: 0.4 });
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(w.sent.map(m => m.type), ['load']);
  release();
  assert.equal(await p, 't=0.4');
});

test('load is shared and progress reaches every caller', async () => {
  let release;
  const w = fakeWorker((m, reply) => {
    if (m.type !== 'load') return;
    reply({ type: 'progress', loaded: 1, total: 2 });
    release = () => reply({ id: m.id, ok: true, result: true });
  });
  const ai = createAiClient(w);
  const a = [], b = [];
  const pa = ai.load((l, t) => a.push([l, t]));
  const pb = ai.load((l, t) => b.push([l, t]));
  await new Promise(r => setTimeout(r, 0));
  release();
  assert.equal(await pa, true);
  assert.equal(await pb, true);
  assert.equal(w.sent.filter(m => m.type === 'load').length, 1);
  assert.deepEqual([a, b], [[[1, 2]], [[1, 2]]]);
});

test('a failed load can be retried', async () => {
  let n = 0;
  const w = fakeWorker((m, reply) => reply({ id: m.id, ok: ++n > 1, result: true, error: 'net' }));
  const ai = createAiClient(w);
  await assert.rejects(ai.load(), /net/);
  assert.equal(await ai.load(), true);
});

test('check does not trigger a load', async () => {
  const w = fakeWorker((m, reply) => reply({ id: m.id, ok: true, result: { webgpu: true, f16: true } }));
  assert.deepEqual(await createAiClient(w).check(), { webgpu: true, f16: true });
  assert.deepEqual(w.sent.map(m => m.type), ['check']);
});
