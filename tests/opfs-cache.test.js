import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOpfsCache } from '../js/opfs-cache.js';

// Just enough of the Origin Private File System API to exercise the cache.
function fakeDir() {
  const files = new Map();
  const handle = name => ({
    async getFile() {
      if (!files.has(name)) throw new DOMException('missing', 'NotFoundError');
      return new File([files.get(name)], name);
    },
    async createWritable() {
      const chunks = [];
      return new WritableStream({
        write: c => { chunks.push(c); },
        close: () => { files.set(name, new Blob(chunks)); },
      });
    },
    async move(newName) { files.set(newName, files.get(name)); files.delete(name); },
  });
  return {
    files,
    handle,
    async getFileHandle(name, opts = {}) {
      if (!files.has(name) && !opts.create) throw new DOMException('missing', 'NotFoundError');
      if (!files.has(name)) files.set(name, new Blob([]));
      return handle(name);
    },
  };
}

const URL_A = 'https://huggingface.co/onnx-community/gemma/resolve/main/onnx/model_q4f16.onnx_data';

test('put then match returns the same bytes with a content-length', async () => {
  const dir = fakeDir();
  const cache = createOpfsCache(async () => dir);
  await cache.put(URL_A, new Response(new Uint8Array([1, 2, 3, 4])));
  const hit = await cache.match(URL_A);
  assert.ok(hit instanceof Response);
  assert.equal(hit.headers.get('content-length'), '4');
  assert.deepEqual(new Uint8Array(await hit.arrayBuffer()), new Uint8Array([1, 2, 3, 4]));
});

test('match on an unknown key is undefined', async () => {
  const cache = createOpfsCache(async () => fakeDir());
  assert.equal(await cache.match(URL_A), undefined);
});

test('a Request key and a string key hit the same entry', async () => {
  const cache = createOpfsCache(async () => fakeDir());
  await cache.put(new Request(URL_A), new Response('x'));
  assert.equal(await (await cache.match(URL_A)).text(), 'x');
});

test('an interrupted write is never served', async () => {
  const dir = fakeDir();
  const cache = createOpfsCache(async () => dir);
  const broken = new Response(new ReadableStream({
    start(c) { c.enqueue(new Uint8Array([9])); c.error(new Error('network dropped')); },
  }));
  await assert.rejects(cache.put(URL_A, broken));
  assert.equal(await cache.match(URL_A), undefined);
});

// In a worker, Chrome offers createSyncAccessHandle, which writes in place.
// createWritable writes a full temporary copy first, doubling the disk space
// a 763 MB file needs, so the cache must prefer the sync handle.
function fakeDirWithSyncHandles() {
  const dir = fakeDir();
  const base = dir.handle;
  dir.writableCalls = 0;
  dir.handle = name => ({
    ...base(name),
    async createWritable() { dir.writableCalls++; return base(name).createWritable(); },
    async createSyncAccessHandle() {
      let bytes = new Uint8Array(0);
      return {
        write(buf, { at }) {
          const end = at + buf.byteLength;
          if (end > bytes.length) { const grown = new Uint8Array(end); grown.set(bytes); bytes = grown; }
          bytes.set(new Uint8Array(buf.buffer ?? buf, buf.byteOffset ?? 0, buf.byteLength), at);
          return buf.byteLength;
        },
        truncate(n) { bytes = bytes.slice(0, n); },
        flush() {},
        close() { dir.files.set(name, new Blob([bytes])); },
      };
    },
  });
  const getFileHandle = dir.getFileHandle;
  dir.getFileHandle = async (name, opts) => { await getFileHandle(name, opts); return dir.handle(name); };
  return dir;
}

test('prefers in-place sync writes when the browser offers them', async () => {
  const dir = fakeDirWithSyncHandles();
  const cache = createOpfsCache(async () => dir);
  const body = new ReadableStream({
    start(c) { c.enqueue(new Uint8Array([1, 2])); c.enqueue(new Uint8Array([3])); c.close(); },
  });
  await cache.put(URL_A, new Response(body));
  assert.equal(dir.writableCalls, 0);
  assert.deepEqual(new Uint8Array(await (await cache.match(URL_A)).arrayBuffer()), new Uint8Array([1, 2, 3]));
});

test('file names are safe hashes, not raw URLs', async () => {
  const dir = fakeDir();
  const cache = createOpfsCache(async () => dir);
  await cache.put(URL_A, new Response('x'));
  const names = [...dir.files.keys()];
  assert.equal(names.length, 1);
  assert.match(names[0], /^[0-9a-f]{64}$/);
});
