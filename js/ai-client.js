// Promise wrapper around the model worker's message protocol.
export function createAiClient(worker) {
  let nextId = 1;
  const pending = new Map();
  const progressFns = new Set();
  let loading = null;

  worker.addEventListener('message', ({ data }) => {
    if (data.type === 'progress') { progressFns.forEach(fn => fn(data.loaded, data.total)); return; }
    const p = pending.get(data.id);
    if (!p) return;
    pending.delete(data.id);
    data.ok ? p.resolve(data.result) : p.reject(new Error(data.error));
  });

  const call = (type, args = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, type, ...args });
  });

  function load(onProgress) {
    if (onProgress) progressFns.add(onProgress);
    if (!loading) loading = call('load').catch(err => { loading = null; throw err; });
    return loading;
  }

  return {
    check: () => call('check'),
    load,
    // Every generation waits for the shared load, so a click during the
    // download simply queues behind it.
    generate: (messages, { temperature = 0.4 } = {}) => load().then(() => call('generate', { messages, temperature })),
  };
}
