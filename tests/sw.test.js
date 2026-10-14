// Runs sw.js against a fake service-worker global (review M4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SOURCE = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const ORIGIN = 'https://example.github.io';

function load({ online = true } = {}) {
  const listeners = {};
  const stores = new Map();
  const store = name => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name);
    return {
      addAll: async urls => { for (const u of urls) m.set(new URL(u, `${ORIGIN}/ad-preflight/sw.js`).href, `cached ${u}`); },
      put: async (req, res) => { m.set(req.url ?? req, res); },
      match: async req => m.get(req.url ?? req),
    };
  };
  const caches = {
    open: async name => store(name),
    keys: async () => [...stores.keys()],
    delete: async name => stores.delete(name),
    match: async req => { for (const m of stores.values()) if (m.has(req.url)) return m.get(req.url); },
  };
  const fetched = [];
  const fetch = async req => {
    fetched.push(req.url);
    if (!online) throw new TypeError('offline');
    return { ok: true, clone() { return `fresh ${req.url}`; }, body: `fresh ${req.url}` };
  };
  const self = {
    location: new URL(`${ORIGIN}/ad-preflight/sw.js`),
    addEventListener: (type, fn) => { listeners[type] = fn; },
    skipWaiting: () => {},
    clients: { claim: () => {} },
  };
  new Function('self', 'caches', 'fetch', SOURCE)(self, caches, fetch);
  const run = async (type, extra = {}) => {
    let p = Promise.resolve();
    let responded;
    listeners[type]({ ...extra, waitUntil: x => { p = x; }, respondWith: x => { responded = x; } });
    await p;
    return responded && await responded;
  };
  return { run, stores, fetched };
}

const get = url => ({ request: { method: 'GET', url } });

test('install caches the app shell but not the 27 MB model runtime', async () => {
  const sw = load();
  await sw.run('install');
  const cached = [...[...sw.stores.values()][0].keys()];
  assert.ok(cached.some(u => u.endsWith('/ad-preflight/js/rules.js')));
  assert.ok(cached.some(u => u.endsWith('/ad-preflight/')));
  assert.ok(!cached.some(u => u.includes('/vendor/')), 'vendor files must be cached lazily');
});

test('online: app files come from the network, so rule fixes reach returning visitors', async () => {
  const sw = load();
  await sw.run('install');
  const res = await sw.run('fetch', get(`${ORIGIN}/ad-preflight/js/rules.js`));
  assert.equal(res.body, `fresh ${ORIGIN}/ad-preflight/js/rules.js`);
});

test('offline: falls back to the cached copy', async () => {
  const sw = load({ online: false });
  await sw.run('install');
  const res = await sw.run('fetch', get(`${ORIGIN}/ad-preflight/js/rules.js`));
  assert.equal(res, 'cached ./js/rules.js');
});

test('requests to other origins are left alone', async () => {
  const sw = load();
  const res = await sw.run('fetch', get('https://huggingface.co/onnx-community/x'));
  assert.equal(res, undefined);
});
