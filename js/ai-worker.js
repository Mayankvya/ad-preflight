// Gemma lives here, off the main thread, so the page never freezes.
import { env, pipeline } from '../vendor/transformers.min.js';
import { createProgress } from './progress.js';
import { createOpfsCache } from './opfs-cache.js';

const LLM_ID = 'onnx-community/gemma-3-1b-it-ONNX-GQA';

env.allowLocalModels = false;
// The Cache API can refuse a 763 MB entry; keep model files on OPFS instead.
env.useBrowserCache = false;
env.useCustomCache = true;
env.customCache = createOpfsCache();
env.backends.onnx.wasm.wasmPaths = {
  mjs: new URL('../vendor/ort/ort-wasm-simd-threaded.asyncify.mjs', import.meta.url).href,
  wasm: new URL('../vendor/ort/ort-wasm-simd-threaded.asyncify.wasm', import.meta.url).href,
};

let llm = null;
const progress = createProgress();

async function check() {
  if (!navigator.gpu) return { webgpu: false, f16: false };
  const adapter = await navigator.gpu.requestAdapter();
  return { webgpu: !!adapter, f16: !!adapter?.features.has('shader-f16') };
}

async function load() {
  llm ??= await pipeline('text-generation', LLM_ID, {
    device: 'webgpu', dtype: 'q4f16',
    progress_callback: p => { const s = progress.update(p); if (s) self.postMessage({ type: 'progress', ...s }); },
  });
  self.postMessage({ type: 'progress', ...progress.finish() });
  return true;
}

async function generate({ messages, temperature }) {
  const out = await llm(messages, { max_new_tokens: 60, do_sample: true, temperature });
  return out[0].generated_text.at(-1).content;
}

const handlers = { check, load, generate };

self.addEventListener('message', async ({ data }) => {
  const { id, type, ...args } = data;
  try {
    self.postMessage({ id, ok: true, result: await handlers[type](args) });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message ?? err) });
  }
});
